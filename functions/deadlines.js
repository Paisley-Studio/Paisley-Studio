/* =========================================================
   Paisley Studio — deadline and overdue automation
   -----------------------------------------------------------
   Four hourly jobs. Because examReminderToParents now needs to
   cover both the legacy NESTED path and the new FLAT path, the
   job uses collectionGroup('exams') — which matches every
   collection called "exams" anywhere in the tree, nested or
   flat — and inspects each doc to decide which path it came
   from and where the paper lives.

     Nested (legacy):  classrooms/{cid}/topics/{tid}/exams/{eid}
       - examMode is "pdf" or "ai"
       - the paper is examPdfUrl / examPdfPath
       - recipients live on `recipients` (or absent for whole class)

     Flat (new):       classrooms/{cid}/exams/{eid}
       - no `examMode` field
       - the paper is examPdfUrl / examPdfPath (same field names)
       - recipients live on `recipients` (or absent for whole class)

   The other three jobs operate on `assignments` only and are
   unchanged.

   Idempotency: each job CLAIMS an item by setting its flag in a
   transaction BEFORE sending anything. A second run (or an
   overlapping run, or the manual admin trigger) then skips it,
   so a crash can lose a notification but can never send one
   twice.
========================================================= */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const { templates } = require("./email-templates");
const W = require("./work-shared");

const HOUR = 3600 * 1000;
const GRACE_HOURS = 48;
const LOOKBACK_DAYS = 30;
const OVERDUE_AFTER_HOURS = 24;       // the pending-work report starts once work is this late
const OVERDUE_REPEAT_HOURS = 47;      // then repeats every 2 days (the job runs daily, so 47 not 48)

/* ---------------------------------------------------------
   Small shared pieces
--------------------------------------------------------- */
async function claim(ref, flag) {
  // Returns true only for the single caller that flips the flag.
  return W.db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()[flag] === true) return false;
    tx.update(ref, { [flag]: true, [flag + "At"]: W.FV().serverTimestamp() });
    return true;
  });
}

async function hasSubmitted(ref, studentId) {
  const s = await ref.collection("submissions").doc(studentId).get();
  return s.exists;
}

function fmtShort(d) {
  return d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: W.TIME_ZONE }) : "-";
}

/* Send one message to a student and every linked parent. */
async function tellFamily({ student, parents, studentMail, parentMail, bell, notice, attachments }) {
  if (student.email && studentMail) {
    await W.sendEmail(student.email, studentMail.subject, studentMail.html, attachments);
  }
  await W.notify(student.id, "student", { ...bell.student, emailSent: !!student.email });
  if (notice) await W.addStudentNotice(student.id, "student", { ...notice.student, studentId: student.id, studentName: student.name });
  for (const p of parents) {
    if (p.email && parentMail) {
      await W.sendEmail(p.email, parentMail(p).subject, parentMail(p).html, attachments);
    }
    await W.notify(p.id, "parent", { ...bell.parent, emailSent: !!p.email, extra: { studentId: student.id } });
    if (notice) await W.addStudentNotice(p.id, "parent", { ...notice.parent, studentId: student.id, studentName: student.name });
  }
}

/* =========================================================
   1. homeworkDeadlineReminder — due within the next 24 hours
   (unchanged)
========================================================= */
async function runHomeworkDeadlineReminder() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * HOUR);
  const snap = await W.db().collectionGroup("assignments")
    .where("dueAt", ">", admin.firestore.Timestamp.fromDate(now))
    .where("dueAt", "<=", admin.firestore.Timestamp.fromDate(soon))
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const a = doc.data();
    if (a.reminderSent === true) continue;
    if (!(await claim(doc.ref, "reminderSent"))) continue;

    const { cid, tid, id } = W.cidTidFromRef(doc.ref);
    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, a.recipients, a);
    const dueAt = W.toDate(a.dueAt);

    for (const student of students) {
      if (W.isPaperStudent(student) || await hasSubmitted(doc.ref, student.id)) continue;
      const parents = await W.parentsOfStudent(student.id);
      const msg = `${a.title} (${a.subjectName || ""}${a.topicTitle ? ", " + a.topicTitle : ""}) is due ${fmtShort(dueAt)}.`;
      await tellFamily({
        student, parents,
        studentMail: templates.homeworkDeadlineReminder({ audience: "student", student, assignment: a, dueAt }),
        parentMail: (p) => templates.homeworkDeadlineReminder({ audience: "parent", student, parentName: p.name, assignment: a, dueAt }),
        bell: {
          student: { type: "homework_due_soon", title: "Homework due within 24 hours", message: msg, relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${id}` },
          parent: { type: "homework_due_soon", title: `Homework due soon for ${student.name || "your child"}`, message: msg + " Please help them hand it in.", relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${id}` }
        },
        notice: {
          student: { type: "homework_due_soon", title: "Homework due within 24 hours", message: msg },
          parent: { type: "homework_due_soon", title: `Homework still pending: ${student.name || "your child"}`, message: msg + " It has not been handed in yet. Please encourage them to finish and submit it before the deadline." }
        }
      });
      sent++;
    }
  }
  console.log("homeworkDeadlineReminder: notified", sent, "student(s)");
  return { assignments: snap.size, notified: sent };
}

/* =========================================================
   2. homeworkOverdueGraceNotice — deadline passed, 48h extension
   (unchanged)
========================================================= */
async function runHomeworkOverdueGraceNotice() {
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR);
  const snap = await W.db().collectionGroup("assignments")
    .where("dueAt", ">=", admin.firestore.Timestamp.fromDate(from))
    .where("dueAt", "<", admin.firestore.Timestamp.fromDate(now))
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const a = doc.data();
    if (a.graceNoticeSent === true) continue;
    if (!(await claim(doc.ref, "graceNoticeSent"))) continue;

    const { cid, tid, id } = W.cidTidFromRef(doc.ref);
    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, a.recipients, a);
    const dueAt = W.toDate(a.dueAt);
    const graceUntil = new Date(dueAt.getTime() + GRACE_HOURS * HOUR);

    for (const student of students) {
      if (W.isPaperStudent(student) || await hasSubmitted(doc.ref, student.id)) continue;
      const parents = await W.parentsOfStudent(student.id);
      const msg = `Homework ${a.title} for ${a.subjectName || "your subject"} is overdue. You have a 48-hour extension until ${fmtShort(graceUntil)}.`;
      await tellFamily({
        student, parents,
        studentMail: templates.homeworkOverdueGraceNotice({ audience: "student", student, assignment: a, dueAt, graceUntil }),
        parentMail: (p) => templates.homeworkOverdueGraceNotice({ audience: "parent", student, parentName: p.name, assignment: a, dueAt, graceUntil }),
        bell: {
          student: { type: "homework_overdue", title: "Homework overdue: 48-hour extension", message: msg, relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${id}` },
          parent: { type: "homework_overdue", title: `Homework overdue for ${student.name || "your child"}`, message: `${student.name || "Your child"}: ${msg}`, relatedEntity: "assignment", relatedEntityId: `${cid}/${tid}/${id}` }
        },
        notice: {
          student: { type: "homework_overdue", title: "Homework overdue: 48-hour extension", message: msg },
          parent: { type: "homework_overdue", title: `Homework overdue: ${student.name || "your child"}`, message: `${student.name || "Your child"}: ${msg}` }
        }
      });
      sent++;
    }
  }
  console.log("homeworkOverdueGraceNotice: notified", sent, "student(s)");
  return { assignments: snap.size, notified: sent };
}

/* =========================================================
   3. generateUnattendedWorkReport — PDF built with pdf-lib
   (unchanged)
========================================================= */
let fontBytesCache = null;
function loadFonts() {
  if (!fontBytesCache) {
    fontBytesCache = {
      regular: fs.readFileSync(path.join(__dirname, "fonts", "Quicksand-Regular.ttf")),
      bold: fs.readFileSync(path.join(__dirname, "fonts", "Quicksand-Bold.ttf"))
    };
  }
  return fontBytesCache;
}

const C = {
  teal: [0x55 / 255, 0xBF / 255, 0xB3 / 255],
  deep: [0x24 / 255, 0x5F / 255, 0x5A / 255],
  sage: [0xE5 / 255, 0xF2 / 255, 0xEF / 255],
  ink: [0x26 / 255, 0x33 / 255, 0x31 / 255],
  muted: [0x5A / 255, 0x6E / 255, 0x6A / 255],
  error: [0xE7 / 255, 0x4C / 255, 0x3C / 255]
};

async function buildReportPdf({ student, items, generatedAt, heading, introText, noteText }) {
  const { PDFDocument, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = loadFonts();
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const col = (c) => rgb(c[0], c[1], c[2]);

  const PW = 595.28, PH = 841.89, M = 40;
  const safe = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
  const widthOk = (font, text) => { try { font.widthOfTextAtSize(text, 10); return true; } catch (e) { return false; } };
  const clean = (font, t) => {
    t = safe(t);
    if (widthOk(font, t)) return t;
    return t.split("").map((ch) => (widthOk(font, ch) ? ch : "?")).join("");
  };
  function wrap(font, text, size, maxW) {
    const words = clean(font, text).split(" ");
    const lines = []; let cur = "";
    words.forEach((w) => {
      const test = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxW) cur = test;
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  let page, y;
  function header() {
    page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: PH - 92, width: PW, height: 92, color: col(C.deep) });
    page.drawRectangle({ x: 0, y: PH - 98, width: PW, height: 6, color: col(C.teal) });
    page.drawText("PAISLEY STUDIO", { x: M, y: PH - 38, size: 12, font: bold, color: col(C.sage) });
    page.drawText(heading || "UNATTENDED WORK REPORT", { x: M, y: PH - 68, size: 22, font: bold, color: rgb(1, 1, 1) });
    y = PH - 128;
  }
  function footer(p, n, total) {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: PW - M, y: 40 }, thickness: 0.6, color: col(C.sage) });
    p.drawText("Paisley Studio - British Curriculum Online Homeschooling", { x: M, y: 26, size: 8, font: regular, color: col(C.muted) });
    const t = `Page ${n} of ${total}`;
    p.drawText(t, { x: PW - M - regular.widthOfTextAtSize(t, 8), y: 26, size: 8, font: regular, color: col(C.muted) });
  }

  header();
  page.drawText(clean(bold, student.name || "Student"), { x: M, y, size: 16, font: bold, color: col(C.ink) });
  y -= 18;
  const meta = [student.keyStage ? String(student.keyStage).replace(/\s*\(.*/, "") : "", student.year != null ? "Year " + student.year : ""].filter(Boolean).join("  |  ");
  if (meta) { page.drawText(clean(regular, meta), { x: M, y, size: 10, font: regular, color: col(C.muted) }); y -= 14; }
  page.drawText("Generated " + generatedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: W.TIME_ZONE }), { x: M, y, size: 10, font: regular, color: col(C.muted) });
  y -= 24;
  const intro = wrap(regular, introText || `The work listed below was not handed in by the original deadline or by the end of the 48-hour extension. It is still outstanding.`, 10.5, PW - 2 * M);
  intro.forEach((ln) => { page.drawText(ln, { x: M, y, size: 10.5, font: regular, color: col(C.ink) }); y -= 14; });
  y -= 8;

  const cols = [
    { k: "subjectName", t: "SUBJECT", w: 95 },
    { k: "topicTitle", t: "TOPIC", w: 120 },
    { k: "title", t: "WORK", w: 170 },
    { k: "dueText", t: "DEADLINE", w: PW - 2 * M - 95 - 120 - 170 }
  ];
  function tableHead() {
    page.drawRectangle({ x: M, y: y - 6, width: PW - 2 * M, height: 22, color: col(C.sage) });
    let x = M + 8;
    cols.forEach((c) => { page.drawText(c.t, { x, y: y, size: 8.5, font: bold, color: col(C.deep) }); x += c.w; });
    y -= 24;
  }
  tableHead();
  items.forEach((it) => {
    const cells = cols.map((c) => wrap(c.k === "title" ? bold : regular, it[c.k] || "-", 9.5, c.w - 14));
    const rows = Math.max(...cells.map((c) => c.length));
    const h = rows * 13 + 10;
    if (y - h < 70) { header(); tableHead(); }
    let x = M + 8;
    cells.forEach((lines, i) => {
      lines.forEach((ln, li) => {
        page.drawText(ln, { x, y: y - li * 13, size: 9.5, font: cols[i].k === "title" ? bold : regular, color: col(C.ink) });
      });
      x += cols[i].w;
    });
    y -= h;
    page.drawLine({ start: { x: M, y: y + 14 }, end: { x: PW - M, y: y + 14 }, thickness: 0.5, color: col(C.sage) });
  });

  y -= 14;
  if (y < 90) header();
  const note = wrap(regular, noteText || "Please speak to the tutor if there was a reason the work could not be completed. Submitted work is always welcome and will still be marked.", 10, PW - 2 * M);
  note.forEach((ln) => { page.drawText(ln, { x: M, y, size: 10, font: regular, color: col(C.muted) }); y -= 13; });

  const pages = doc.getPages();
  pages.forEach((p, i) => footer(p, i + 1, pages.length));
  return doc.save();
}

async function runGenerateUnattendedWorkReport() {
  const now = new Date();
  const olderThan = new Date(now.getTime() - GRACE_HOURS * HOUR);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR);
  const snap = await W.db().collectionGroup("assignments")
    .where("dueAt", ">=", admin.firestore.Timestamp.fromDate(from))
    .where("dueAt", "<", admin.firestore.Timestamp.fromDate(olderThan))
    .get();

  const perStudent = new Map();
  let claimed = 0;
  for (const doc of snap.docs) {
    const a = doc.data();
    if (a.reportSent === true) continue;
    if (!(await claim(doc.ref, "reportSent"))) continue;
    claimed++;
    const { cid } = W.cidTidFromRef(doc.ref);
    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, a.recipients, a);
    const dueAt = W.toDate(a.dueAt);
    for (const student of students) {
      if (W.isPaperStudent(student) || await hasSubmitted(doc.ref, student.id)) continue;
      if (!perStudent.has(student.id)) perStudent.set(student.id, { student, items: [] });
      perStudent.get(student.id).items.push({
        subjectName: a.subjectName || (classroom && classroom.subjectName) || "",
        topicTitle: a.topicTitle || "",
        title: a.title || "",
        description: a.description || "",
        dueAt,
        dueText: fmtShort(dueAt)
      });
    }
  }

  let reports = 0;
  for (const { student, items } of perStudent.values()) {
    items.sort((x, y) => x.dueAt - y.dueAt);
    const bytes = await buildReportPdf({ student, items, generatedAt: now });
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const storagePath = `unattended-reports/${student.id}/unattended-work-report_${stamp}.pdf`;
    const url = await W.saveStoredPdf(storagePath, bytes);
    const attachments = [{ filename: "Unattended-Work-Report.pdf", content: Buffer.from(bytes), contentType: "application/pdf" }];
    const parents = await W.parentsOfStudent(student.id);
    const summary = `${items.length} piece${items.length === 1 ? "" : "s"} of work remain unattended after the 48-hour extension.`;
    await overdueClaim(student.id, now, true);   // the next pending-work report counts from this one

    await tellFamily({
      student, parents, attachments,
      studentMail: templates.unattendedWorkReport({ audience: "student", student, items, reportUrl: url }),
      parentMail: (p) => templates.unattendedWorkReport({ audience: "parent", student, parentName: p.name, items, reportUrl: url }),
      bell: {
        student: { type: "unattended_report", title: "Unattended Work Report", message: summary, relatedEntity: "unattendedReport", relatedEntityId: storagePath },
        parent: { type: "unattended_report", title: `Unattended Work Report: ${student.name || "your child"}`, message: summary, relatedEntity: "unattendedReport", relatedEntityId: storagePath }
      },
      notice: {
        student: { type: "unattended_report", title: "Unattended Work Report", message: summary, fileUrl: url, fileName: "Unattended-Work-Report.pdf" },
        parent: { type: "unattended_report", title: `Unattended Work Report: ${student.name || "your child"}`, message: summary, fileUrl: url, fileName: "Unattended-Work-Report.pdf" }
      }
    });
    reports++;
  }
  console.log("generateUnattendedWorkReport: claimed", claimed, "assignment(s),", reports, "report(s)");
  return { assignments: claimed, reports };
}

/* =========================================================
   3b. overdueWorkDigest — each student's own pending-work report.
   -----------------------------------------------------------
   Once work is more than 24 hours overdue, the student and every
   linked parent get a PDF + email listing ALL of that student's
   outstanding homework, classwork and exam hand-ins. It repeats every
   2 days while anything is outstanding, for work up to 30 days late.
   Paper-hand-in students are never included. overdueWorkState/{uid}
   holds the last send, claimed in a transaction, so an overlapping run
   or a manual "Run now" cannot email anyone twice.
========================================================= */
async function overdueClaim(studentId, now, force) {
  const ref = W.db().collection("overdueWorkState").doc(studentId);
  return W.db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? W.toDate(snap.data().lastSentAt) : null;
    if (!force && last && now.getTime() - last.getTime() < OVERDUE_REPEAT_HOURS * HOUR) return false;
    tx.set(ref, { lastSentAt: admin.firestore.Timestamp.fromDate(now), count: (snap.exists ? snap.data().count || 0 : 0) + 1 });
    return true;
  });
}

const OVERDUE_SOURCES = [
  { group: "assignments", field: "dueAt", label: "Homework", live: () => true, entity: "assignment" },
  { group: "lessons", field: "dueAt", label: "Classwork", live: (d) => d.status === "published", entity: "lesson" },
  // Only flat exams (classrooms/{cid}/exams/{eid}) take uploads in this collection.
  { group: "exams", field: "submissionDeadline", label: "Exam", live: (d, ref) => d.status === "Published" && ref.path.split("/").length === 4, entity: "exam" }
];

function daysLate(dueAt, now) {
  const d = Math.floor((now.getTime() - dueAt.getTime()) / (24 * HOUR));
  return d === 1 ? "1 day late" : d + " days late";
}

async function collectOverdueWork(now) {
  const to = new Date(now.getTime() - OVERDUE_AFTER_HOURS * HOUR);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR);
  const perStudent = new Map();
  for (const src of OVERDUE_SOURCES) {
    let snap;
    try {
      snap = await W.db().collectionGroup(src.group)
        .where(src.field, ">=", admin.firestore.Timestamp.fromDate(from))
        .where(src.field, "<", admin.firestore.Timestamp.fromDate(to))
        .get();
    } catch (e) {
      // A missing index on one source must not stop the other reports going out.
      console.error("overdueWorkDigest: query failed for", src.group, e.message || e);
      continue;
    }
    for (const doc of snap.docs) {
      const a = doc.data();
      if (a.migrated === true || !doc.ref.path.startsWith("classrooms/") || !src.live(a, doc.ref)) continue;
      const cid = doc.ref.path.split("/")[1];
      const classroom = await W.classroomOf(cid);
      const students = await W.resolveStudents(classroom, a.recipients, a);
      const dueAt = W.toDate(a[src.field]);
      for (const student of students) {
        if (W.isPaperStudent(student) || await hasSubmitted(doc.ref, student.id)) continue;
        if (!perStudent.has(student.id)) perStudent.set(student.id, { student, items: [] });
        perStudent.get(student.id).items.push({
          subjectName: a.subjectName || a.subject || (classroom && classroom.subjectName) || "",
          topicTitle: a.topicTitle || src.label,
          title: a.title || src.label,
          kindLabel: src.label,
          dueAt,
          dueText: fmtShort(dueAt) + " (" + daysLate(dueAt, now) + ")"
        });
      }
    }
  }
  return perStudent;
}

async function runOverdueWorkDigest() {
  const now = new Date();
  const perStudent = await collectOverdueWork(now);
  let reports = 0, throttled = 0;
  for (const { student, items } of perStudent.values()) {
    if (!(await overdueClaim(student.id, now, false))) { throttled++; continue; }
    items.sort((x, y) => x.dueAt - y.dueAt);
    const count = `${items.length} piece${items.length === 1 ? "" : "s"} of work`;
    const bytes = await buildReportPdf({
      student, items, generatedAt: now,
      heading: "PENDING WORK REPORT",
      introText: "The work listed below is more than 24 hours past its deadline and has not been handed in. It is still outstanding.",
      noteText: "Late work is still welcome and will be marked. Please speak to the tutor if there is a reason it could not be done."
    });
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const storagePath = `unattended-reports/${student.id}/pending-work-report_${stamp}.pdf`;
    const url = await W.saveStoredPdf(storagePath, bytes);
    const attachments = [{ filename: "Pending-Work-Report.pdf", content: Buffer.from(bytes), contentType: "application/pdf" }];
    const parents = await W.parentsOfStudent(student.id);
    const summary = `${count} still pending, more than 24 hours overdue.`;
    await tellFamily({
      student, parents, attachments,
      studentMail: templates.pendingWorkReport({ audience: "student", student, items, reportUrl: url }),
      parentMail: (p) => templates.pendingWorkReport({ audience: "parent", student, parentName: p.name, items, reportUrl: url }),
      bell: {
        student: { type: "overdue_work_report", title: "Pending Work Report", message: summary, relatedEntity: "unattendedReport", relatedEntityId: storagePath },
        parent: { type: "overdue_work_report", title: `Pending Work Report: ${student.name || "your child"}`, message: summary, relatedEntity: "unattendedReport", relatedEntityId: storagePath }
      },
      notice: {
        student: { type: "overdue_work_report", title: "Pending Work Report", message: summary, fileUrl: url, fileName: "Pending-Work-Report.pdf" },
        parent: { type: "overdue_work_report", title: `Pending Work Report: ${student.name || "your child"}`, message: summary, fileUrl: url, fileName: "Pending-Work-Report.pdf" }
      }
    });
    reports++;
  }
  console.log("overdueWorkDigest: reports", reports, "throttled", throttled);
  return { students: perStudent.size, reports, throttled };
}

/* =========================================================
   4. examReminderToParents — paper to parents 48h before.
   -----------------------------------------------------------
   CHANGED in this revision: now covers BOTH paths.

     Nested (legacy):  classrooms/{cid}/topics/{tid}/exams/{eid}
     Flat (new):       classrooms/{cid}/exams/{eid}

   The job discovers exams via collectionGroup('exams'), which
   matches every collection called "exams" anywhere in the tree,
   then figures out the path shape from doc.ref.path.split('/').

   Eligibility:
     • Flat exams are eligible when status === "Published".
     • Nested exams are eligible when status === "Published" and
       examMode === "pdf" (the AI exams send their reminder from
       a different code path — nothing to do here).

   The paper (examPdfUrl / examPdfPath) is attached to every
   parent email; students only get a bell reminder (they never
   receive the paper from us — the parent prints it).

   Idempotency: parentNoticeSent is flipped on the exam doc
   inside a transaction before any email goes out, so the
   create-then-publish flow and the hourly job can never
   double-send.
========================================================= */
async function runExamReminderToParents() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * HOUR);
  const snap = await W.db().collectionGroup("exams")
    .where("examDate", ">", admin.firestore.Timestamp.fromDate(now))
    .where("examDate", "<=", admin.firestore.Timestamp.fromDate(horizon))
    .get();

  let sent = 0;
  for (const doc of snap.docs) {
    const e = doc.data();

    // Path shape check: how many segments after /documents/ ?
    //   Nested: classrooms/{cid}/topics/{tid}/exams/{eid}  → 6 segments
    //   Flat:   classrooms/{cid}/exams/{eid}               → 4 segments
    const parts = doc.ref.path.split("/");
    const isFlat   = parts.length === 4 && parts[0] === "classrooms" && parts[2] === "exams";
    const isNested = parts.length === 6 && parts[0] === "classrooms" && parts[2] === "topics" && parts[4] === "exams";

    if (!isFlat && !isNested) continue;

    // Only published exams trigger reminders.
    if (String(e.status || "") !== "Published") continue;

    // Nested: only PDF-mode exams (AI exams handle this differently).
    if (isNested && e.examMode !== "pdf") continue;

    if (e.parentNoticeSent === true) continue;
    if (!(await claim(doc.ref, "parentNoticeSent"))) continue;

    const cid = parts[1];
    const tid = isNested ? parts[3] : null;
    const eid = isNested ? parts[5] : parts[3];

    const classroom = await W.classroomOf(cid);
    const students = await W.resolveStudents(classroom, e.recipients, e);
    const examDate = W.toDate(e.examDate);

    // Download the paper once, shared across every parent.
    const pdf = await W.downloadStoredFile(e.examPdfPath || e.examPdfUrl);
    const attachments = pdf
      ? [{ filename: e.examPdfName || "exam.pdf", content: pdf, contentType: "application/pdf" }]
      : undefined;

    const entityId = isNested ? `${cid}/${tid}/${eid}` : `${cid}/flat/${eid}`;

    for (const student of students) {
      const parents = await W.parentsOfStudent(student.id);
      const msg = `${e.title} (${e.subjectName || e.subject || ""}) takes place on ${fmtShort(examDate)}. The exam paper is attached so you can print it for the day.`;

      for (const p of parents) {
        if (p.email) {
          const t = templates.examParentReminder({ parentName: p.name, student, exam: e, examDate });
          await W.sendEmail(p.email, t.subject, t.html, attachments);
        }
        await W.notify(p.id, "parent", {
          type: "exam_reminder",
          title: `Exam in two days: ${student.name || "your child"}`,
          message: msg,
          relatedEntity: "exam",
          relatedEntityId: entityId,
          emailSent: !!p.email,
          extra: { studentId: student.id }
        });
        await W.addStudentNotice(p.id, "parent", {
          type: "exam_reminder",
          title: `Exam paper: ${e.title}`,
          message: msg,
          fileUrl: e.examPdfUrl || "",
          fileName: e.examPdfName || "",
          studentId: student.id,
          studentName: student.name
        });
      }

      await W.notify(student.id, "student", {
        type: "exam_reminder",
        title: "Exam in two days",
        message: `${e.title} takes place on ${fmtShort(examDate)}.`,
        relatedEntity: "exam",
        relatedEntityId: entityId
      });
      sent++;
    }
  }
  console.log("examReminderToParents: handled", sent, "student(s)");
  return { exams: snap.size, notified: sent };
}

/* =========================================================
   Exports
========================================================= */
const SCHEDULE = {
  schedule: "every 60 minutes",
  region: W.LOCATION,
  timeZone: W.TIME_ZONE,
  secrets: W.SMTP_SECRETS,
  timeoutSeconds: 540,
  memory: "512MiB"
};

exports.homeworkDeadlineReminder   = onSchedule(SCHEDULE, async () => { await runHomeworkDeadlineReminder(); });
exports.homeworkOverdueGraceNotice = onSchedule(SCHEDULE, async () => { await runHomeworkOverdueGraceNotice(); });
exports.generateUnattendedWorkReport = onSchedule(SCHEDULE, async () => { await runGenerateUnattendedWorkReport(); });
exports.examReminderToParents      = onSchedule(SCHEDULE, async () => { await runExamReminderToParents(); });
exports.overdueWorkDigest          = onSchedule(Object.assign({}, SCHEDULE, { schedule: "every day 07:00" }), async () => { await runOverdueWorkDigest(); });

/* Admin-only manual trigger, used by the "Run now" buttons for testing. */
exports.runDeadlineJob = onCall(
  { cors: true, region: W.LOCATION, secrets: W.SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const a = await admin.firestore().collection("admins").doc(request.auth.uid).get();
    if (!a.exists) throw new HttpsError("permission-denied", "Admins only.");
    const job = String((request.data && request.data.job) || "");
    const jobs = {
      reminder: runHomeworkDeadlineReminder,
      grace:    runHomeworkOverdueGraceNotice,
      report:   runGenerateUnattendedWorkReport,
      exam:     runExamReminderToParents,
      overdue:  runOverdueWorkDigest
    };
    if (!jobs[job]) throw new HttpsError("invalid-argument", "Unknown job. Use reminder, grace, report, exam or overdue.");
    try {
      return await jobs[job]();
    } catch (e) {
      console.error("runDeadlineJob", job, e);
      throw new HttpsError("internal", e.message || "Job failed.");
    }
  }
);

exports._internals = {
  buildReportPdf,
  runHomeworkDeadlineReminder,
  runHomeworkOverdueGraceNotice,
  runGenerateUnattendedWorkReport,
  runExamReminderToParents,
  runOverdueWorkDigest,
  collectOverdueWork,
  OVERDUE_SOURCES
};