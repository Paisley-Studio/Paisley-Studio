/* =========================================================
   Paisley Studio — nested homework / exam triggers + migration
   -----------------------------------------------------------
     onAssignmentPosted         new assignment -> students
     onExamPostedOrPublished    exam published -> students
     onSubmissionWritten        student submits -> tutor bell;
                                grade released -> student + parent
     onExamAttemptWritten       same, for PDF-mode exam attempts
     onLessonSubmissionWritten  same, for classwork (lessons)
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
    // New-model records carry `audiences`; they are announced by
    // onAssignmentAudienceChanged when they are posted. Only legacy records
    // (no audiences field) keep the old "notify on create" behaviour.
    if (a.audiences && typeof a.audiences === "object") return;
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
    const students = await W.resolveStudents(classroom, a.recipients, a);
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
    if (after.audiences && typeof after.audiences === "object") return; // handled by onNestedExamAudienceChanged
    if (after.status !== "Published" || (before && before.status === "Published")) return;
    const { cid, tid, eid } = event.params;
    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, after.recipients, after);
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
   Submissions, PDF-exam attempts, and classwork submissions
   share one handler:
     created                                -> tutor bell
     Corrections -> Submitted (resubmit)    -> tutor bell
     released (or re-released)              -> student + parent
                                               email, bell, notice
--------------------------------------------------------- */
/* Who should hear that work needs marking.
   `primaryIds` (the item's tutor, or whoever marked it last) are always told. When none of
   them is a real tutor account (admin-posted work nobody has marked yet, legacy items with no
   tutorId), every active tutor of that subject + Key Stage is told instead, so a hand-in or a
   resubmission can never be silently dropped. */
async function tutorRecipientsFor(cid, item, primaryIds) {
  const ids = [];
  (primaryIds || []).forEach((id) => { if (id && ids.indexOf(id) === -1) ids.push(id); });
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  try {
    const accounts = await W.db().collection("tutorAccounts").get();
    const byId = {};
    accounts.docs.forEach((d) => { byId[d.id] = d.data() || {}; });
    if (ids.some((id) => byId[id])) return ids;
    const classroom = await W.classroomOf(cid);
    const subjects = [classroom && classroom.subjectId, classroom && classroom.subjectName, item && item.subjectId, item && item.subjectName]
      .filter(Boolean).map(norm);
    const ks = (classroom && classroom.keyStage) || (item && item.keyStage) || "";
    if (!subjects.length) return ids;
    accounts.docs.forEach((d) => {
      const t = d.data() || {};
      if (String(t.status || "").toLowerCase() === "suspended") return;
      const ts = (Array.isArray(t.subjects) ? t.subjects : []).map(norm);
      if (!ts.some((x) => subjects.indexOf(x) !== -1)) return;
      const tk = Array.isArray(t.keyStages) ? t.keyStages : [];
      if (tk.length && ks && tk.indexOf(ks) === -1) return;
      if (ids.indexOf(d.id) === -1) ids.push(d.id);
    });
  } catch (e) { console.warn("tutorRecipientsFor:", e && e.message); }
  return ids;
}

async function handleWorkWrite(event, kind) {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  const { cid, tid, studentId } = event.params;
  const parentId = kind === "exam" ? event.params.eid : (kind === "lesson" ? event.params.lid : event.params.aid);
  const parentCol = kind === "exam" ? "exams" : (kind === "lesson" ? "lessons" : "assignments");
  const itemRef = W.db().doc(`classrooms/${cid}/topics/${tid}/${parentCol}/${parentId}`);
  const itemSnap = await itemRef.get();
  const item = itemSnap.exists ? itemSnap.data() : {};
  const entityId = `${cid}/${tid}/${parentId}`;
  const relEntity = kind === "exam" ? "exam" : "assignment";
  const noun = kind === "exam" ? "Exam" : (kind === "lesson" ? "Classwork" : "Homework");

  // CHANGED: resolve the tutor recipient once, up front, with a fallback chain.
  // The old code read only `item.tutorId`, which is present on assignments and
  // flat exams but was NEVER written on lessons created by the Studio Desk
  // before the classroom-helpers.js fix. For those legacy lessons the notify
  // call in the `if (item.tutorId)` branch below silently did nothing, so the
  // tutor never saw the classwork hand-in or resubmission.
  //
  // Fallback order:
  //   1. item.tutorId            — modern: the tutor who authored / owns the item
  //   2. before.gradedBy         — legacy: the tutor who most recently graded it
  //   3. item.authorId           — legacy lessons: the person who wrote the lesson
  //   4. after.gradedBy          — anything ever set on the sub itself
  // Whoever wins still has to be a real uid; empty strings are skipped.
  const tutorRecipient = (
    (item && item.tutorId) ||
    (before && before.gradedBy) ||
    (item && item.authorId) ||
    (after && after.gradedBy) ||
    ""
  );

  // 1. Student handed work in (first creation only)
  if (!before) {
    for (const rid of await tutorRecipientsFor(cid, item, [tutorRecipient])) {
      await W.notify(rid, "tutor", {
        type: kind === "exam" ? "exam_submitted" : "homework_submitted",
        title: `${noun} handed in`,
        message: `${after.studentName || "A student"} handed in ${item.title || "work"} (${item.subjectName || item.subject || ""}).`,
        relatedEntity: relEntity, relatedEntityId: entityId
      });
    }
    return;
  }

  // 1b. Student re-handed-in after "Corrections" -> tutor is told it is ready again
  // CHANGED: same fallback chain as above. This is the exact branch the tutor
  // was complaining about ("I got told about the resubmission but I can't see
  // the work"): the notification was created with `item.tutorId` which, for a
  // legacy Studio Desk lesson, was empty — so nothing was written. Now the
  // resubmission reaches whoever the fallback identifies.
  if (before.status === "Corrections" && after.status === "Submitted") {
    // The tutor who sent it back for corrections is the one who should mark the corrected work.
    const attempt = (Array.isArray(after.history) ? after.history.length : 1) + 1;
    for (const rid of await tutorRecipientsFor(cid, item, [before.gradedBy, tutorRecipient])) {
      await W.notify(rid, "tutor", {
        type: kind === "exam" ? "exam_resubmitted" : "homework_resubmitted",
        title: `${noun} RESUBMITTED (attempt ${attempt})`,
        message: `${after.studentName || "A student"} resubmitted corrected work for ${item.title || "work"} (${item.subjectName || item.subject || ""}). It is ready for you to grade.`,
        relatedEntity: relEntity, relatedEntityId: entityId
      });
    }
    return;
  }

  // 2. Marks released (Graded) or work sent back (Corrections)
  const status = after.status;
  if (after.released !== true || (status !== "Graded" && status !== "Corrections")) return;
  const gAfter = W.toDate(after.gradedAt), gBefore = W.toDate(before.gradedAt);
  const changed = !before.released || before.status !== status || String(gAfter || "") !== String(gBefore || "");
  if (!changed) return;

  // Claim this exact grading event so a retried trigger can never notify twice.
  const claimKey = W.stableId("graded", cid, parentId, studentId, status, String(gAfter ? gAfter.getTime() : "0"));
  const claimed = await W.claimOnce(claimKey);
  if (!claimed) return;

  const studentSnap = await W.db().collection("students").doc(studentId).get();
  const student = studentSnap.exists ? { id: studentId, ...studentSnap.data() } : { id: studentId, name: after.studentName, email: after.studentEmail };
  const parents = await W.parentsOfStudent(studentId);
  const isCorr = status === "Corrections";
  const score = after.grade != null && after.maxScore != null ? `${after.grade}/${after.maxScore}` : (after.grade != null ? String(after.grade) : "see feedback");
  const subj = item.subjectName || item.subject || "";
  const studentMsg = isCorr
    ? `${item.title || noun} (${subj}) needs corrections. Open it to read your tutor's notes and upload your corrected work.`
    : `${item.title || noun} (${subj}) has been graded: ${score}. Open it to see your feedback and download your marked copy.`;
  const parentMsg = isCorr
    ? `${student.name || "Your child"}'s ${noun.toLowerCase()} "${item.title || ""}" (${subj}) has been sent back for corrections.`
    : `${student.name || "Your child"}'s ${noun.toLowerCase()} "${item.title || ""}" (${subj}) has been graded: ${score}. The marked copy is in the Parent Portal.`;
  const typeKey = kind === "exam" ? "exam" : "homework";
  const evType = isCorr ? `${typeKey}_corrections` : `${typeKey}_graded`;
  const fileUrl = after.gradedFileUrl || "";
  const fileName = after.gradedFileName || "";

  // --- student: email + bell + Notices panel (with the marked-copy link)
  try {
    if (student.email) {
      const t = templates.homeworkGraded({ audience: "student", student, kind: kind === "exam" ? "exam" : "homework", item, submission: after });
      await W.sendEmail(student.email, t.subject, t.html);
    }
  } catch (e) { console.warn("graded: student email failed", e.message || e); }
  try {
    await W.notify(studentId, "student", {
      type: evType, title: isCorr ? `${noun}: corrections requested` : `${noun} graded`, message: studentMsg,
      relatedEntity: relEntity, relatedEntityId: entityId, emailSent: !!student.email
    });
    await W.addStudentNotice(studentId, "student", {
      type: isCorr ? "corrections" : "graded",
      title: isCorr ? `Corrections requested: ${item.title || ""}` : `${noun} graded: ${item.title || ""}`,
      message: studentMsg, fileUrl, fileName, studentId, studentName: student.name,
      entityId, entityKind: kind === "exam" ? "exam" : "homework"
    });
  } catch (e) { console.warn("graded: student notice failed", e.message || e); }

  // --- every linked parent / guardian: email + bell + Notices panel
  for (const p of parents) {
    try {
      if (p.email) {
        const t = templates.homeworkGraded({ audience: "parent", student, parentName: p.name, kind: kind === "exam" ? "exam" : "homework", item, submission: after });
        await W.sendEmail(p.email, t.subject, t.html);
      }
    } catch (e) { console.warn("graded: parent email failed", p.email, e.message || e); }
    try {
      await W.notify(p.id, "parent", {
        type: evType,
        title: isCorr ? `${student.name || "Your child"}: corrections requested` : `${student.name || "Your child"}: ${noun.toLowerCase()} graded`,
        message: parentMsg, relatedEntity: relEntity, relatedEntityId: entityId, emailSent: !!p.email, extra: { studentId }
      });
      await W.addStudentNotice(p.id, "parent", {
        type: isCorr ? "corrections" : "graded",
        title: isCorr ? `${student.name || "Your child"}: corrections requested` : `${student.name || "Your child"}: ${noun.toLowerCase()} graded`,
        message: parentMsg, fileUrl, fileName, studentId, studentName: student.name,
        entityId, entityKind: kind === "exam" ? "exam" : "homework"
      });
    } catch (e) { console.warn("graded: parent notice failed", e.message || e); }
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

exports.onLessonSubmissionWritten = onDocumentWritten(
  { document: "classrooms/{cid}/topics/{tid}/lessons/{lid}/submissions/{studentId}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  (event) => handleWorkWrite(event, "lesson")
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