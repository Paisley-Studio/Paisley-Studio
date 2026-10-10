/* =========================================================
   Paisley Studio — nested homework / exam triggers + migration
   -----------------------------------------------------------
     onAssignmentPosted         new assignment -> students
     onExamPostedOrPublished    exam published -> students
     onSubmissionWritten        student submits -> tutor bell;
                                grade released -> student + parent
     onExamAttemptWritten       same, for PDF-mode exam attempts
     migrateLegacyHomeworkAndExams  idempotent admin callable

   All emailing exports list secrets: SMTP_SECRETS.
========================================================= */
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const { templates } = require("./email-templates");
const W = require("./work-shared");

const KEY_STAGE_YEARS = { 2: [3, 4, 5, 6], 3: [7, 8, 9], 4: [10, 11], 5: [12, 13] };
function ksNumber(ks) { const m = /Key Stage\s*(\d)/i.exec(String(ks || "")); return m ? Number(m[1]) : 0; }
function fmt(d) { return d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: W.TIME_ZONE }) : ""; }

/* ---------------------------------------------------------
   New assignment -> every recipient student (bell + email),
   parents get a bell entry only (the deadline reminder is the
   email they act on).
--------------------------------------------------------- */
exports.onAssignmentPosted = onDocumentCreated(
  { document: "classrooms/{cid}/topics/{tid}/assignments/{aid}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  async (event) => {
    const a = event.data.data() || {};
    if (a.migrated === true) return;
    const { cid, tid, aid } = event.params;
    const classroom = await W.classroomOf(cid);
    // Firestore rules cannot check every recipient against enrolment, so it is enforced here:
    // anyone named who is not enrolled in this subject + Year is removed. If nobody valid is
    // left, the assignment is deleted (an empty list would otherwise mean "whole class").
    if (Array.isArray(a.recipients) && a.recipients.length) {
      const enrolled = new Set((await W.resolveStudents(classroom, [])).map((x) => x.id));
      const valid = a.recipients.filter((id) => enrolled.has(id));
      if (!valid.length) { console.warn("onAssignmentPosted: no valid recipients, deleting", event.data.ref.path); await event.data.ref.delete(); return; }
      if (valid.length !== a.recipients.length) { await event.data.ref.update({ recipients: valid, recipientsSanitized: true }); a.recipients = valid; }
    }
    const students = await W.resolveStudents(classroom, a.recipients);
    const dueAt = W.toDate(a.dueAt);
    for (const s of students) {
      if (s.email) {
        const t = templates.workPosted({ student: s, kind: "assignment", item: a, dueAt });
        await W.sendEmail(s.email, t.subject, t.html);
      }
      await W.notify(s.id, "student", {
        type: "homework_assigned", title: "New homework posted",
        message: `${a.title} (${a.subjectName || ""}${a.topicTitle ? ", " + a.topicTitle : ""})${dueAt ? " is due " + fmt(dueAt) : " has been posted"}.`,
        relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${aid}`, emailSent: !!s.email
      });
      for (const p of await W.parentsOfStudent(s.id)) {
        await W.notify(p.id, "parent", {
          type: "homework_assigned", title: `New homework for ${s.name || "your child"}`,
          message: `${a.title} (${a.subjectName || ""})${dueAt ? " is due " + fmt(dueAt) : ""}.`,
          relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${aid}`, extra: { studentId: s.id }
        });
      }
    }
  }
);

/* ---------------------------------------------------------
   Exam goes live -> students
--------------------------------------------------------- */
exports.onExamPostedOrPublished = onDocumentWritten(
  { document: "classrooms/{cid}/topics/{tid}/exams/{eid}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (!after || after.migrated === true) return;
    if (after.status !== "Published" || (before && before.status === "Published")) return;
    const { cid, tid, eid } = event.params;
    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, after.recipients);
    const when = W.toDate(after.examDate);
    for (const s of students) {
      if (s.email) {
        const t = templates.workPosted({ student: s, kind: "exam", item: after, dueAt: when });
        await W.sendEmail(s.email, t.subject, t.html);
      }
      await W.notify(s.id, "student", {
        type: "exam_posted", title: "New exam available",
        message: `${after.title} (${after.subjectName || after.subject || ""})${when ? " on " + fmt(when) : ""}.`,
        relatedEntity: "exam", relatedEntityId: `${cid}/${tid}/${eid}`, emailSent: !!s.email
      });
    }
  }
);

/* ---------------------------------------------------------
   Submissions and PDF-exam attempts share one handler:
     created            -> tutor bell
     released (or re-released) -> student + parent email, bell, notice
--------------------------------------------------------- */
async function handleWorkWrite(event, kind) {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  const { cid, tid, studentId } = event.params;
  const parentId = kind === "exam" ? event.params.eid : event.params.aid;
  const parentCol = kind === "exam" ? "exams" : "assignments";
  const itemRef = W.db().doc(`classrooms/${cid}/topics/${tid}/${parentCol}/${parentId}`);
  const itemSnap = await itemRef.get();
  const item = itemSnap.exists ? itemSnap.data() : {};
  const entityId = `${cid}/${tid}/${parentId}`;

  // 1. Student handed work in (first creation only)
  if (!before) {
    if (item.tutorId) {
      await W.notify(item.tutorId, "tutor", {
        type: kind === "exam" ? "exam_submitted" : "homework_submitted",
        title: kind === "exam" ? "Exam paper handed in" : "Homework handed in",
        message: `${after.studentName || "A student"} handed in ${item.title || "work"} (${item.subjectName || item.subject || ""}).`,
        relatedEntity: kind === "exam" ? "exam" : "assignment", relatedEntityId: entityId
      });
    }
    return;
  }

  // 2. Marks released or re-released
  const nowReleased = after.released === true;
  const changed = !before.released || String(W.toDate(before.gradedAt) || "") !== String(W.toDate(after.gradedAt) || "");
  if (!nowReleased || !changed || after.status !== "Graded") return;

  const studentSnap = await W.db().collection("students").doc(studentId).get();
  const student = studentSnap.exists ? { id: studentId, ...studentSnap.data() } : { id: studentId, name: after.studentName, email: after.studentEmail };
  const parents = await W.parentsOfStudent(studentId);
  const score = after.grade != null && after.maxScore != null ? `${after.grade}/${after.maxScore}` : (after.grade != null ? String(after.grade) : "see feedback");
  const label = kind === "exam" ? "exam" : "homework";
  const msg = `${item.title || "Your " + label} (${item.subjectName || item.subject || ""}) has been marked: ${score}.`;

  if (student.email) {
    const t = templates.homeworkGraded({ audience: "student", student, kind, item, submission: after });
    await W.sendEmail(student.email, t.subject, t.html);
  }
  await W.notify(studentId, "student", {
    type: kind === "exam" ? "exam_graded" : "homework_graded", title: `${kind === "exam" ? "Exam" : "Homework"} graded`, message: msg,
    relatedEntity: kind === "exam" ? "exam" : "assignment", relatedEntityId: entityId, emailSent: !!student.email
  });
  await W.addStudentNotice(studentId, "student", {
    type: "graded", title: `${kind === "exam" ? "Exam" : "Homework"} graded: ${item.title || ""}`, message: msg,
    fileUrl: after.gradedFileUrl || "", fileName: after.gradedFileName || "", studentId, studentName: student.name
  });
  for (const p of parents) {
    if (p.email) {
      const t = templates.homeworkGraded({ audience: "parent", student, parentName: p.name, kind, item, submission: after });
      await W.sendEmail(p.email, t.subject, t.html);
    }
    await W.notify(p.id, "parent", {
      type: kind === "exam" ? "exam_graded" : "homework_graded",
      title: `${student.name || "Your child"}: ${label} graded`, message: msg,
      relatedEntity: kind === "exam" ? "exam" : "assignment", relatedEntityId: entityId, emailSent: !!p.email, extra: { studentId }
    });
  }
}

exports.onSubmissionWritten = onDocumentWritten(
  { document: "classrooms/{cid}/topics/{tid}/assignments/{aid}/submissions/{studentId}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  (event) => handleWorkWrite(event, "assignment")
);
exports.onExamAttemptWritten = onDocumentWritten(
  { document: "classrooms/{cid}/topics/{tid}/exams/{eid}/attempts/{studentId}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  (event) => handleWorkWrite(event, "exam")
);

/* =========================================================
   migrateLegacyHomeworkAndExams (admin callable, idempotent)
   -----------------------------------------------------------
   Legacy collections are READ, never modified or deleted.
   Every nested document gets a deterministic id
   (legacy_{legacyId}) and is only created if absent, so running
   the migration again changes nothing that already exists.

   Placement: a legacy item has a subject and a Key Stage but no
   Year, while classrooms are per subject + Year. The item is
   placed in the classroom of every Year that has a student who
   submitted to it (or, if nobody has, every Year in that Key Stage
   that has an enrolled student). Each student's legacy submission
   follows that student's own Year.

   Notification flags are pre-set to true on migrated items so the
   deadline jobs never email about history.

   AI exams: exam.html and recordViolation are bound to the
   top-level exams / examAttempts collections, so the nested exam
   keeps a legacyExamId pointer and its attempts stay where they
   are (see CHANGELOG).
========================================================= */
exports.migrateLegacyHomeworkAndExams = onCall(
  { cors: true, region: W.LOCATION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const adm = await W.db().collection("admins").doc(request.auth.uid).get();
    if (!adm.exists) throw new HttpsError("permission-denied", "Admins only.");
    const dryRun = !!(request.data && request.data.dryRun);
    const FV = W.FV();
    const db = W.db();

    const report = { dryRun, homework: { seen: 0, created: 0, existing: 0, skipped: 0 }, exams: { seen: 0, created: 0, existing: 0, skipped: 0 },
      submissions: { seen: 0, created: 0, existing: 0, skipped: 0 }, classroomsCreated: 0, notes: [] };

    const students = {};
    (await db.collection("students").get()).forEach((d) => { students[d.id] = { id: d.id, ...d.data() }; });

    const classroomCache = {};
    async function ensureClassroom(subjectName, keyStage, year) {
      const subjectId = W.subjectKey(subjectName);
      const cid = `${subjectId}_y${year}`;
      if (classroomCache[cid]) return classroomCache[cid];
      const ref = db.collection("classrooms").doc(cid);
      const snap = await ref.get();
      let data;
      if (snap.exists) data = { id: cid, ...snap.data() };
      else {
        data = { id: cid, subjectId, subjectName: String(subjectName || subjectId), keyStage, year: Number(year) };
        if (!dryRun) await ref.set({ subjectId, subjectName: data.subjectName, keyStage, year: Number(year), createdAt: FV.serverTimestamp(), createdBy: "migration" });
        report.classroomsCreated++;
      }
      classroomCache[cid] = data;
      return data;
    }
    const topicCache = {};
    async function ensureTopic(cid) {
      if (topicCache[cid]) return topicCache[cid];
      const ref = db.collection("classrooms").doc(cid).collection("topics").doc("legacy-migrated");
      const snap = await ref.get();
      if (!snap.exists && !dryRun) {
        await ref.set({ title: "Earlier homework and exams", description: "Moved from the old Homework and Exams lists.", order: 9999, createdAt: FV.serverTimestamp(), createdBy: "migration" });
      }
      topicCache[cid] = { id: "legacy-migrated", title: "Earlier homework and exams" };
      return topicCache[cid];
    }

    function yearsFor(subjectKeyValue, keyStage, studentIds) {
      const ys = new Set();
      studentIds.forEach((id) => { const s = students[id]; if (s && s.year != null) ys.add(Number(s.year)); });
      if (ys.size) return Array.from(ys);
      Object.values(students).forEach((s) => {
        if (s.keyStage !== keyStage || s.year == null) return;
        const subs = Array.isArray(s.subjects) ? s.subjects.map(W.subjectKey) : [];
        if (subs.includes(subjectKeyValue)) ys.add(Number(s.year));
      });
      return Array.from(ys);
    }
    function toTs(v) {
      if (!v) return null;
      if (v.toDate) return v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : admin.firestore.Timestamp.fromDate(d);
    }

    /* ---- homework + submissions ---- */
    const subsByHw = {};
    (await db.collection("submissions").get()).forEach((d) => {
      const s = d.data(); report.submissions.seen++;
      (subsByHw[s.homeworkId] = subsByHw[s.homeworkId] || []).push({ id: d.id, ...s });
    });

    const hwSnap = await db.collection("homework").get();
    for (const h of hwSnap.docs) {
      const hw = h.data(); report.homework.seen++;
      const subjectId = W.subjectKey(hw.subject);
      if (!subjectId || !ksNumber(hw.keyStage)) { report.homework.skipped++; report.notes.push(`homework ${h.id}: no subject or Key Stage`); continue; }
      const subs = subsByHw[h.id] || [];
      const years = yearsFor(subjectId, hw.keyStage, subs.map((x) => x.studentId));
      if (!years.length) { report.homework.skipped++; report.notes.push(`homework ${h.id} (${hw.title}): no enrolled students`); continue; }
      for (const y of years) {
        const cls = await ensureClassroom(hw.subject, hw.keyStage, y);
        const topic = await ensureTopic(cls.id);
        const aRef = db.collection("classrooms").doc(cls.id).collection("topics").doc(topic.id).collection("assignments").doc("legacy_" + h.id);
        if ((await aRef.get()).exists) report.homework.existing++;
        else {
          report.homework.created++;
          if (!dryRun) await aRef.set({
            title: hw.title || "Homework", description: hw.description || hw.instructions || "",
            subjectId: cls.subjectId, subjectName: cls.subjectName, keyStage: cls.keyStage, year: cls.year,
            topicId: topic.id, topicTitle: topic.title,
            attachedPdfUrl: "", attachedPdfName: "", recipients: [], audience: "class",
            dueAt: toTs(hw.dueDate), reminderSent: true, graceNoticeSent: true, reportSent: true,
            tutorId: hw.tutorId || "", tutorName: hw.tutorName || hw.postedBy || "", createdBy: hw.tutorId || "migration",
            legacyHomeworkId: h.id, legacyQuestions: Array.isArray(hw.questions) ? hw.questions : [], migrated: true,
            createdAt: hw.postedAt || FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
          });
        }
        for (const s of subs) {
          const stu = students[s.studentId];
          if (!stu || Number(stu.year) !== y) continue;
          const sRef = aRef.collection("submissions").doc(s.studentId);
          if ((await sRef.get()).exists) { report.submissions.existing++; continue; }
          report.submissions.created++;
          if (!dryRun) {
            const graded = s.status === "Graded";
            await sRef.set({
              studentId: s.studentId, studentName: s.studentName || stu.name || "", studentEmail: s.studentEmail || stu.email || "",
              fileUrl: s.fileUrl || "", fileName: s.fileName || "", fileType: s.fileType || "", note: s.note || "", textAnswer: s.textAnswer || "",
              status: graded ? "Graded" : "Submitted", grade: s.grade != null ? s.grade : null, feedback: s.feedback || "",
              gradedBy: s.gradedBy || "", gradedAt: s.gradedAt || null, released: graded, releasedAt: graded ? (s.gradedAt || null) : null,
              inkData: null, inkUpdatedAt: null, gradedFileUrl: "",
              legacySubmissionId: s.id, migrated: true,
              createdAt: s.submittedAt || FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
            });
          }
        }
      }
    }

    /* ---- exams ---- */
    const exSnap = await db.collection("exams").get();
    for (const e of exSnap.docs) {
      const ex = e.data(); report.exams.seen++;
      const subjectId = W.subjectKey(ex.subject);
      if (!subjectId || !ksNumber(ex.keyStage)) { report.exams.skipped++; report.notes.push(`exam ${e.id}: no subject or Key Stage`); continue; }
      const attempts = (await db.collection("examAttempts").where("examId", "==", e.id).get()).docs.map((d) => d.data());
      const years = yearsFor(subjectId, ex.keyStage, attempts.map((x) => x.studentId));
      if (!years.length) { report.exams.skipped++; report.notes.push(`exam ${e.id} (${ex.title}): no enrolled students`); continue; }
      for (const y of years) {
        const cls = await ensureClassroom(ex.subject, ex.keyStage, y);
        const topic = await ensureTopic(cls.id);
        const xRef = db.collection("classrooms").doc(cls.id).collection("topics").doc(topic.id).collection("exams").doc("legacy_" + e.id);
        if ((await xRef.get()).exists) { report.exams.existing++; continue; }
        report.exams.created++;
        if (!dryRun) await xRef.set({
          title: ex.title || "Exam", subject: ex.subject || "", subjectId: cls.subjectId, subjectName: cls.subjectName,
          keyStage: cls.keyStage, year: cls.year, topicId: topic.id, topicTitle: topic.title,
          examMode: ex.examMode === "link" ? "link" : "ai", externalURL: ex.externalURL || "",
          questions: Array.isArray(ex.questions) ? ex.questions : [], duration: ex.duration || 30,
          legacyExamId: e.id, recipients: [], audience: "class", parentNoticeSent: true,
          status: ex.status || "Draft", tutorId: ex.tutorId || "", tutorName: ex.tutorName || "", createdBy: ex.tutorId || "migration", migrated: true,
          createdAt: ex.createdAt || FV.serverTimestamp()
        });
      }
    }

    console.log("migrateLegacyHomeworkAndExams", JSON.stringify(report));
    return report;
  }
);
