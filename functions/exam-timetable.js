/* =========================================================
   Exam timetables (Admin > Timetable & Notices > Exam timetable)
   -----------------------------------------------------------
   examTimetables/{id}
     title, series ("End of Term 1, 2026"), keyStage, year (null = every Year in the
     Key Stage), board ('' = every board), instructions,
     sessions: [{ id, subjectId, subjectName, paper, date 'YYYY-MM-DD', start 'HH:MM',
                  end 'HH:MM', mode, room, notes }],
     audience: 'class' | 'students', pickedStudents: [uid], tutorsMode: 'all' | 'none'
     status: 'draft' | 'published'                      (admin client writes the draft)
   Written here on publish (Admin SDK only):
     studentIds / parentIds / tutorIds [uid]            who may read it (rules: uid in list)
     studentSessions / tutorSessions { uid: [sessionId] }  each person's own exams
     version, contentHash, publishedAt, publishedBy, lastSend

   publishExamTimetable (admin): works out who gets it, opens it to them, then sends a
     bell and an email with their own PDF (students: their exams; parents: one PDF per
     child; tutors: the exams of subjects they teach). dryRun returns the counts only.
     Sending again after an edit tells everyone ("updated"); sending again unchanged
     tells only people added since. Bells use notifyOnce and emails sendEmail, so
     developer mode's freeze holds them (area "exams").
   examTimetablePdf: the caller's own PDF (admin: the whole timetable), base64.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const W = require("./work-shared");
const { templates } = require("./email-templates");

const MAX_SESSIONS = 120;
const STUDENT_TYPES = ["online", "remote"];

function db() { return admin.firestore(); }
function str(v, n) { return String(v == null ? "" : v).trim().slice(0, n || 200); }
function okDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function okTime(v) { return /^\d{2}:\d{2}$/.test(String(v || "")); }

/* Clean, valid sessions in date and time order. */
function cleanSessions(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_SESSIONS).map((s, i) => ({
    id: str(s && s.id, 40) || ("s" + i),
    subjectId: str(s && s.subjectId, 60),
    subjectName: str(s && s.subjectName, 80),
    paper: str(s && s.paper, 120),
    date: okDate(s && s.date) ? s.date : "",
    start: okTime(s && s.start) ? s.start : "",
    end: okTime(s && s.end) ? s.end : "",
    mode: str(s && s.mode, 40),
    room: str(s && s.room, 80),
    notes: str(s && s.notes, 300)
  })).filter((s) => s.subjectId && s.date && s.start)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function minutes(t) { const m = /^(\d{2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function duration(s) {
  const a = minutes(s.start), b = minutes(s.end);
  if (a == null || b == null || b <= a) return "";
  const d = b - a, h = Math.floor(d / 60), m = d % 60;
  return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : "");
}
function dayLabel(date, long) {
  const d = new Date(date + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: long ? "long" : "short", day: "numeric", month: long ? "long" : "short", year: "numeric" });
}
function ksShort(ks) { const m = /Key Stage\s*(\d)/i.exec(String(ks || "")); return m ? "KS" + m[1] : String(ks || ""); }
const BOARD_LABEL = { cambridge: "Cambridge", edexcel: "Pearson Edexcel", oxford_aqa: "Oxford AQA" };

function hashOf(tt, sessions) {
  return crypto.createHash("sha1").update(JSON.stringify([tt.title, tt.series, tt.instructions, sessions])).digest("hex").slice(0, 16);
}

/* Does this student take the session's subject (on the timetable's board)? */
function takes(student, session, board) {
  const subs = (Array.isArray(student.subjects) ? student.subjects : []).map(W.subjectKey);
  if (subs.indexOf(W.subjectKey(session.subjectId)) === -1) return false;
  return !board || W.studentBoard(student, session.subjectId) === board;
}

/* Who gets it: students (with their own sessions), their parents, and the tutors. */
async function resolveAudience(tt, sessions) {
  const board = tt.board ? W.boardId(tt.board) : "";
  const wantYear = tt.year != null && tt.year !== "" ? Number(tt.year) : null;
  const students = [];
  const skip = (s) => ["suspended", "pending"].indexOf(String(s.status || "").toLowerCase()) !== -1 ||
    STUDENT_TYPES.indexOf(W.studentAudience(s)) === -1;

  if (tt.audience === "students") {
    const ids = Array.from(new Set((tt.pickedStudents || []).map(String))).slice(0, 1000);
    for (const id of ids) {
      const d = await db().collection("students").doc(id).get();
      if (!d.exists) continue;
      const s = { id, ...d.data() };
      if (skip(s)) continue;
      const own = sessions.filter((x) => takes(s, x, board));
      /* Picked by name: they get their own subjects, or the whole timetable if none of theirs is on it. */
      students.push({ student: s, sessions: own.length ? own : sessions });
    }
  } else {
    const snap = await db().collection("students").where("keyStage", "==", tt.keyStage).get();
    for (const d of snap.docs) {
      const s = { id: d.id, ...d.data() };
      if (skip(s)) continue;
      if (wantYear != null && s.year != null && Number(s.year) !== wantYear) continue;
      const own = sessions.filter((x) => takes(s, x, board));
      if (own.length) students.push({ student: s, sessions: own });
    }
  }

  const parents = new Map();
  for (const row of students) {
    for (const p of await W.parentsOfStudent(row.student.id)) {
      if (!parents.has(p.id)) parents.set(p.id, { parent: p, kids: [] });
      parents.get(p.id).kids.push(row);
    }
  }

  const tutors = [];
  if (tt.tutorsMode !== "none") {
    const subjectIds = Array.from(new Set(sessions.map((s) => s.subjectId))).slice(0, 30);
    const seen = new Set();
    if (subjectIds.length) {
      const snap = await db().collection("tutorAccounts").where("subjects", "array-contains-any", subjectIds).get();
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue; seen.add(d.id);
        const t = { id: d.id, ...d.data() };
        if (["suspended", "pending"].indexOf(String(t.status || "").toLowerCase()) !== -1) continue;
        const ks = Array.isArray(t.keyStages) ? t.keyStages : [];
        if (ks.length && ks.indexOf(tt.keyStage) === -1) continue;
        /* One board on the timetable: tutors of that board. Every board: tutors of any of them. */
        const boards = board ? [board] : Object.keys(BOARD_LABEL);
        const mine = sessions.filter((s) => (t.subjects || []).indexOf(s.subjectId) !== -1 &&
          boards.some((b) => W.tutorTeachesBoard(t, { keyStage: tt.keyStage, subjectId: s.subjectId, board: b })));
        if (mine.length) tutors.push({ tutor: t, sessions: mine });
      }
    }
  }
  return { students, parents, tutors };
}

/* ---------------------------------------------------------
   The PDF: Paisley header, who it is for, the exams day by day,
   a "before every exam" checklist and the desk's instructions.
--------------------------------------------------------- */
let fontCache = null;
function fonts() {
  if (!fontCache) fontCache = {
    regular: fs.readFileSync(path.join(__dirname, "fonts", "Quicksand-Regular.ttf")),
    bold: fs.readFileSync(path.join(__dirname, "fonts", "Quicksand-Bold.ttf"))
  };
  return fontCache;
}
const C = {
  teal: [0x55, 0xBF, 0xB3], deep: [0x24, 0x5F, 0x5A], sage: [0xE5, 0xF2, 0xEF], paper: [0xF1, 0xF9, 0xF7],
  ink: [0x26, 0x33, 0x31], muted: [0x5A, 0x6E, 0x6A], line: [0xD5, 0xE4, 0xE0], amber: [0xF3, 0x9C, 0x12]
};

async function buildPdf({ tt, sessions, forName, forLine, generatedAt }) {
  const { PDFDocument, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = fonts();
  const R = await doc.embedFont(f.regular, { subset: true });
  const B = await doc.embedFont(f.bold, { subset: true });
  const col = (c) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);
  doc.setTitle(`${tt.title || "Exam timetable"} - Paisley Studio`);
  doc.setAuthor("Paisley Studio");

  const PW = 595.28, PH = 841.89, M = 36, CW = PW - 2 * M;
  const fits = (font, t) => { try { font.widthOfTextAtSize(t, 10); return true; } catch (e) { return false; } };
  const clean = (font, t) => {
    t = String(t == null ? "" : t).replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
    return fits(font, t) ? t : t.split("").map((ch) => (fits(font, ch) ? ch : "?")).join("");
  };
  const wrap = (font, text, size, maxW) => {
    const words = clean(font, text).split(" "), lines = []; let cur = "";
    words.forEach((w) => {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  const text = (p, t, x, y, size, font, c) => p.drawText(clean(font, t), { x, y, size, font, color: col(c || C.ink) });

  const cols = [
    { k: "time", t: "TIME", w: 92 },
    { k: "subject", t: "SUBJECT AND PAPER", w: 190 },
    { k: "dur", t: "LENGTH", w: 62 },
    { k: "where", t: "WHERE", w: 86 },
    { k: "notes", t: "NOTES", w: CW - 92 - 190 - 62 - 86 }
  ];
  let page, y;
  const pages = [];

  function bigHeader() {
    page = doc.addPage([PW, PH]); pages.push(page);
    page.drawRectangle({ x: 0, y: PH - 118, width: PW, height: 118, color: col(C.deep) });
    page.drawRectangle({ x: 0, y: PH - 124, width: PW, height: 6, color: col(C.teal) });
    page.drawCircle({ x: PW - 70, y: PH - 40, size: 70, color: col(C.teal), opacity: 0.18 });
    page.drawCircle({ x: PW - 150, y: PH - 92, size: 22, color: col(C.teal), opacity: 0.14 });
    text(page, "PAISLEY STUDIO", M, PH - 36, 11, B, C.sage);
    text(page, "EXAM TIMETABLE", M, PH - 66, 24, B, [255, 255, 255]);
    const sub = [tt.title, tt.series].filter(Boolean).join("  |  ");
    if (sub) text(page, sub, M, PH - 90, 12, R, C.sage);
    const scope = [ksShort(tt.keyStage), tt.year != null && tt.year !== "" ? "Year " + tt.year : "", tt.board ? BOARD_LABEL[tt.board] || "" : ""].filter(Boolean).join("  |  ");
    if (scope) text(page, scope, M, PH - 108, 10, R, C.sage);
    /* Who it is for, and how many exams over which days */
    const bt = PH - 144;
    page.drawRectangle({ x: M, y: bt - 52, width: CW, height: 52, color: col(C.paper), borderColor: col(C.line), borderWidth: 0.8 });
    text(page, "PREPARED FOR", M + 14, bt - 14, 7.5, B, C.muted);
    text(page, forName || "Paisley Studio", M + 14, bt - 32, 14, B, C.deep);
    if (forLine) text(page, forLine, M + 14, bt - 45, 8.5, R, C.muted);
    const right = M + CW - 14;
    const n = `${sessions.length} exam${sessions.length === 1 ? "" : "s"}`;
    const span = sessions.length ? (sessions[0].date === sessions[sessions.length - 1].date ? dayLabel(sessions[0].date, false) : `${dayLabel(sessions[0].date, false)} to ${dayLabel(sessions[sessions.length - 1].date, false)}`) : "";
    text(page, n, right - B.widthOfTextAtSize(n, 12), bt - 26, 12, B, C.deep);
    if (span) text(page, span, right - R.widthOfTextAtSize(clean(R, span), 8.5), bt - 42, 8.5, R, C.muted);
    y = bt - 70;   /* y is always the top of the free space */
  }
  function smallHeader() {
    page = doc.addPage([PW, PH]); pages.push(page);
    page.drawRectangle({ x: 0, y: PH - 44, width: PW, height: 44, color: col(C.deep) });
    page.drawRectangle({ x: 0, y: PH - 47, width: PW, height: 3, color: col(C.teal) });
    text(page, "PAISLEY STUDIO  |  EXAM TIMETABLE", M, PH - 27, 10, B, [255, 255, 255]);
    const who = clean(R, forName || "");
    text(page, who, PW - M - R.widthOfTextAtSize(who, 9), PH - 27, 9, R, C.sage);
    y = PH - 64;
  }
  function colHead() {
    page.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: col(C.deep) });
    let x = M + 8;
    cols.forEach((c) => { text(page, c.t, x, y - 13, 7.5, B, [255, 255, 255]); x += c.w; });
    y -= 20;
  }
  function need(h) { if (y - h < 64) { smallHeader(); colHead(); return true; } return false; }
  function dayBand(date, cont) {
    page.drawRectangle({ x: M, y: y - 24, width: CW, height: 20, color: col(C.sage) });
    page.drawRectangle({ x: M, y: y - 24, width: 4, height: 20, color: col(C.teal) });
    text(page, dayLabel(date, true) + (cont ? "  (continued)" : ""), M + 12, y - 17.5, 9.5, B, C.deep);
    y -= 26;
  }

  bigHeader();
  if (!sessions.length) {
    text(page, "No exams on this timetable for you.", M, y, 11, R, C.muted); y -= 20;
  } else {
    colHead();
    let lastDate = "";
    sessions.forEach((s, i) => {
      const subjLines = wrap(B, s.subjectName || s.subjectId, 9.5, cols[1].w - 12);
      const paperLines = s.paper ? wrap(R, s.paper, 8.5, cols[1].w - 12) : [];
      const whereLines = wrap(R, [s.mode, s.room].filter(Boolean).join(", ") || "-", 8.5, cols[3].w - 10);
      const noteLines = s.notes ? wrap(R, s.notes, 8, cols[4].w - 10) : [""];
      /* first baseline 15 below the row top, then the tallest column, then 9 of air */
      const body = Math.max((subjLines.length - 1) * 12 + paperLines.length * 11, (whereLines.length - 1) * 11, (noteLines.length - 1) * 10.5);
      const rowH = Math.max(15 + body + 4 + 9, 30);
      if (s.date !== lastDate) {
        need(26 + rowH);
        dayBand(s.date, false); lastDate = s.date;
      } else if (need(rowH + 26)) dayBand(s.date, true);
      const top = y;
      if (i % 2) page.drawRectangle({ x: M, y: top - rowH, width: CW, height: rowH, color: col([250, 253, 252]) });
      let x = M + 8, ty = top - 15;
      text(page, s.start + (s.end ? " - " + s.end : ""), x, ty, 9.5, B, C.ink);
      x += cols[0].w;
      let yy = ty; subjLines.forEach((l) => { text(page, l, x, yy, 9.5, B, C.deep); yy -= 12; });
      paperLines.forEach((l) => { text(page, l, x, yy, 8.5, R, C.muted); yy -= 11; });
      x += cols[1].w;
      text(page, duration(s) || "-", x, ty, 8.5, R, C.ink);
      x += cols[2].w;
      yy = ty; whereLines.forEach((l) => { text(page, l, x, yy, 8.5, R, C.ink); yy -= 11; });
      x += cols[3].w;
      yy = ty; noteLines.forEach((l) => { text(page, l, x, yy, 8, R, C.muted); yy -= 10.5; });
      page.drawLine({ start: { x: M, y: top - rowH }, end: { x: M + CW, y: top - rowH }, thickness: 0.5, color: col(C.line) });
      y = top - rowH;
    });
  }

  /* Before every exam + the desk's own instructions */
  const tips = [
    "Be ready 15 minutes before each start time, signed in or seated, with your equipment.",
    "Have pens, pencils, a ruler, an eraser and a calculator where allowed. Keep water nearby.",
    "Work somewhere quiet. Phones off and away unless the exam needs them.",
    "Read every question carefully and check your answers before the time ends.",
    "Hand in or upload your paper before the closing time. Late papers may not be marked."
  ];
  const instr = tt.instructions ? wrap(R, tt.instructions, 9, CW - 28) : [];
  const boxH = 34 + tips.length * 14 + (instr.length ? 22 + instr.length * 12 : 0);
  if (y - 18 - boxH < 64) smallHeader();
  y -= 18;
  page.drawRectangle({ x: M, y: y - boxH, width: CW, height: boxH, color: col(C.paper), borderColor: col(C.line), borderWidth: 0.8 });
  page.drawRectangle({ x: M, y: y - boxH, width: 4, height: boxH, color: col(C.amber) });
  let by = y - 18;
  text(page, "BEFORE EVERY EXAM", M + 16, by, 9, B, C.deep); by -= 16;
  tips.forEach((t) => {
    page.drawCircle({ x: M + 20, y: by + 3, size: 2, color: col(C.teal) });
    text(page, t, M + 28, by, 8.8, R, C.ink); by -= 14;
  });
  if (instr.length) {
    by -= 6; text(page, "FROM THE STUDIO DESK", M + 16, by, 9, B, C.deep); by -= 14;
    instr.forEach((l) => { text(page, l, M + 16, by, 9, R, C.ink); by -= 12; });
  }

  const made = "Issued " + generatedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: W.TIME_ZONE }) + " (East Africa Time)";
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: PW - M, y: 44 }, thickness: 0.6, color: col(C.line) });
    p.drawText(clean(R, "Paisley Studio  |  paisleystudio.online  |  " + made), { x: M, y: 30, size: 7.5, font: R, color: col(C.muted) });
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PW - M - R.widthOfTextAtSize(t, 7.5), y: 30, size: 7.5, font: R, color: col(C.muted) });
  });
  return Buffer.from(await doc.save());
}

function fileName(tt, who) {
  const base = [tt.title || "Exam timetable", who].filter(Boolean).join(" - ").replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
  return (base || "Exam timetable") + ".pdf";
}
function forLineOf(student) {
  return [student.keyStage ? ksShort(student.keyStage) : "", student.year != null ? "Year " + student.year : ""].filter(Boolean).join("  |  ");
}

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await db().collection("admins").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Admins only.");
  return { uid: request.auth.uid, name: (snap.data() || {}).name || "Studio Desk" };
}

/* Publish one timetable: open it to its audience, then tell people. Shared by the Publish
   button and the schedule (publishScheduledExamTimetables). who: { uid, name }. */
async function runPublish(id, who, dryRun) {
    const ref = db().collection("examTimetables").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "That exam timetable no longer exists.");
    const tt = snap.data() || {};
    const sessions = cleanSessions(tt.sessions);
    if (!sessions.length) throw new HttpsError("failed-precondition", "Add at least one exam (subject, date and start time) first.");
    if (!tt.keyStage) throw new HttpsError("failed-precondition", "Choose a Key Stage first.");

    const aud = await resolveAudience(tt, sessions);
    const counts = { students: aud.students.length, parents: aud.parents.size, tutors: aud.tutors.length };
    if (dryRun) return { dryRun: true, ...counts, sample: aud.students.slice(0, 12).map((r) => r.student.name || "Student") };

    const hash = hashOf(tt, sessions);
    const changed = !!tt.contentHash && tt.contentHash !== hash;
    const version = Number(tt.version || 0) + (tt.contentHash === hash ? 0 : 1);
    const had = new Set([].concat(tt.studentIds || [], tt.parentIds || [], tt.tutorIds || []));
    const studentSessions = {}, tutorSessions = {};
    aud.students.forEach((r) => { studentSessions[r.student.id] = r.sessions.map((s) => s.id); });
    aud.tutors.forEach((r) => { tutorSessions[r.tutor.id] = r.sessions.map((s) => s.id); });

    /* Open it in the portals first, then tell people. */
    await ref.set({
      sessions, status: "published", version, contentHash: hash, publishAt: null,
      studentIds: Object.keys(studentSessions), parentIds: Array.from(aud.parents.keys()), tutorIds: Object.keys(tutorSessions),
      studentSessions, tutorSessions,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(), publishedBy: who.uid, publishedByName: who.name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const now = new Date();
    const updated = version > 1 && changed;
    const fresh = (uid) => updated || !had.has(uid) || tt.status !== "published";
    const entity = "examTimetable/" + id;
    const notifId = (uid) => "examtt_" + W.stableId(id, String(version), uid);
    const out = { ...counts, emailed: 0, told: 0, held: 0 };
    const first = sessions[0];
    const startLine = first ? `${dayLabel(first.date, false)} at ${first.start}` : "";

    for (const r of aud.students) {
      const s = r.student;
      if (!fresh(s.id)) continue;
      try {
        const told = await W.notifyOnce(notifId(s.id), s.id, "student", {
          type: "exam_timetable", title: updated ? "Exam timetable updated" : "Your exam timetable is out",
          message: `${tt.title || "Exam timetable"}: ${r.sessions.length} exam${r.sessions.length === 1 ? "" : "s"}${startLine ? ", starting " + startLine : ""}. Open Timetable to see it and start preparing.`,
          relatedEntity: "examTimetable", relatedEntityId: entity, emailSent: !!s.email
        });
        if (!told) { out.held++; continue; }
        out.told++;
        if (!s.email) continue;
        const pdf = await buildPdf({ tt, sessions: r.sessions, forName: s.name || "Student", forLine: forLineOf(s), generatedAt: now });
        const t = templates.examTimetableMail({ audience: "student", name: s.name, student: s, tt, sessions: r.sessions, updated });
        const res = await W.sendEmail(s.email, t.subject, t.html, [{ filename: fileName(tt, s.name), content: pdf, contentType: "application/pdf" }], undefined, { area: "exams" });
        if (res && res.sent) out.emailed++;
      } catch (e) { console.warn("examTimetable: student send failed", s.id, e.message || e); }
    }

    for (const [pid, row] of aud.parents) {
      if (!fresh(pid)) continue;
      const p = row.parent;
      try {
        const kidNames = row.kids.map((k) => (k.student.name || "your child").split(" ")[0]).join(" and ");
        const told = await W.notifyOnce(notifId(pid), pid, "parent", {
          type: "exam_timetable", title: updated ? `Exam timetable updated for ${kidNames}` : `Exam timetable for ${kidNames}`,
          message: `${tt.title || "Exam timetable"}${startLine ? ", starting " + startLine : ""}. The PDF is in your email and in the Classes & Timetable tab.`,
          relatedEntity: "examTimetable", relatedEntityId: entity, emailSent: !!p.email, extra: { studentId: row.kids[0].student.id }
        });
        if (!told) { out.held++; continue; }
        out.told++;
        if (!p.email) continue;
        const files = [];
        for (const k of row.kids) {
          files.push({ filename: fileName(tt, k.student.name), content: await buildPdf({ tt, sessions: k.sessions, forName: k.student.name || "Student", forLine: forLineOf(k.student), generatedAt: now }), contentType: "application/pdf" });
        }
        const t = templates.examTimetableMail({ audience: "parent", name: p.name, kids: row.kids, tt, updated });
        const res = await W.sendEmail(p.email, t.subject, t.html, files, undefined, { area: "exams" });
        if (res && res.sent) out.emailed++;
      } catch (e) { console.warn("examTimetable: parent send failed", pid, e.message || e); }
    }

    for (const r of aud.tutors) {
      const t0 = r.tutor;
      if (!fresh(t0.id)) continue;
      try {
        const told = await W.notifyOnce(notifId(t0.id), t0.id, "tutor", {
          type: "exam_timetable", title: updated ? "Exam timetable updated" : "Exam timetable published",
          message: `${tt.title || "Exam timetable"} (${ksShort(tt.keyStage)}${tt.year ? ", Year " + tt.year : ""}): ${r.sessions.length} exam${r.sessions.length === 1 ? "" : "s"} in your subjects. Help your students prepare.`,
          relatedEntity: "examTimetable", relatedEntityId: entity, emailSent: !!t0.email
        });
        if (!told) { out.held++; continue; }
        out.told++;
        if (!t0.email) continue;
        const pdf = await buildPdf({ tt, sessions: r.sessions, forName: t0.name || "Tutor", forLine: "Tutor copy: the exams in the subjects you teach", generatedAt: now });
        const t = templates.examTimetableMail({ audience: "tutor", name: t0.name, tt, sessions: r.sessions, updated, studentCount: aud.students.length });
        const res = await W.sendEmail(t0.email, t.subject, t.html, [{ filename: fileName(tt, "Tutor copy"), content: pdf, contentType: "application/pdf" }], undefined, { area: "exams" });
        if (res && res.sent) out.emailed++;
      } catch (e) { console.warn("examTimetable: tutor send failed", t0.id, e.message || e); }
    }

    await ref.set({ lastSend: { at: admin.firestore.FieldValue.serverTimestamp(), by: who.uid, ...out, updated } }, { merge: true });
    return out;
}

exports.publishExamTimetable = onCall(
  { cors: true, region: W.LOCATION, secrets: W.SMTP_SECRETS, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const who = await requireAdmin(request);
    const id = str(request.data && request.data.id, 120);
    if (!id) throw new HttpsError("invalid-argument", "Which timetable?");
    return runPublish(id, who, !!(request.data && request.data.dryRun));
  }
);

/* Publish later: the editor saves status 'scheduled' with publishAt. Every 5 minutes the due
   ones are claimed (status 'publishing', in a transaction, so a timetable is sent once) and
   published as the admin who scheduled them. A failure puts it back to 'scheduled' with the error. */
exports.publishScheduledExamTimetables = onSchedule(
  { schedule: "every 5 minutes", timeZone: W.TIME_ZONE, region: W.LOCATION, secrets: W.SMTP_SECRETS, timeoutSeconds: 540, memory: "1GiB" },
  async () => {
    const snap = await db().collection("examTimetables").where("status", "==", "scheduled").get();
    const now = Date.now();
    for (const d of snap.docs) {
      const at = d.data().publishAt;
      const ms = at && at.toMillis ? at.toMillis() : 0;
      if (!ms || ms > now) continue;
      const claimed = await db().runTransaction(async (tx) => {
        const cur = await tx.get(d.ref);
        if (!cur.exists || cur.data().status !== "scheduled") return false;
        tx.update(d.ref, { status: "publishing", publishingAt: admin.firestore.FieldValue.serverTimestamp() });
        return true;
      });
      if (!claimed) continue;
      const x = d.data();
      try {
        const out = await runPublish(d.id, { uid: x.scheduledBy || "schedule", name: x.scheduledByName || "Studio Desk" }, false);
        await d.ref.set({ scheduledSentAt: admin.firestore.FieldValue.serverTimestamp(), scheduleError: admin.firestore.FieldValue.delete() }, { merge: true });
        console.log("examTimetable scheduled publish", d.id, JSON.stringify(out));
      } catch (e) {
        console.error("examTimetable scheduled publish failed", d.id, e);
        await d.ref.set({ status: "scheduled", scheduleError: String((e && e.message) || e).slice(0, 300), publishAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60000) }, { merge: true });
      }
    }
  }
);

/* The caller's own PDF: a student theirs, a parent a child's (childId), a tutor their subjects,
   an admin the whole timetable. Returned as base64. */
exports.examTimetablePdf = onCall(
  { cors: true, region: W.LOCATION, timeoutSeconds: 60, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid = request.auth.uid, id = str(request.data && request.data.id, 120), childId = str(request.data && request.data.childId, 128);
    const snap = await db().collection("examTimetables").doc(id).get();
    if (!snap.exists) throw new HttpsError("not-found", "That exam timetable no longer exists.");
    const tt = snap.data() || {};
    const all = cleanSessions(tt.sessions);
    const pick = (ids) => all.filter((s) => (ids || []).indexOf(s.id) !== -1);
    const isAdmin = (await db().collection("admins").doc(uid).get()).exists;
    let sessions = null, forName = "", forLine = "";
    const studentDoc = async (sid) => { const d = await db().collection("students").doc(sid).get(); return d.exists ? { id: sid, ...d.data() } : { id: sid }; };
    if (isAdmin && !childId) { sessions = all; forName = "Full timetable"; forLine = "Studio Desk copy: every exam on this timetable"; }
    else if ((tt.studentIds || []).indexOf(uid) !== -1 && !childId) { const s = await studentDoc(uid); sessions = pick((tt.studentSessions || {})[uid]); forName = s.name || "Student"; forLine = forLineOf(s); }
    else if (childId && ((tt.parentIds || []).indexOf(uid) !== -1 || isAdmin) && (tt.studentIds || []).indexOf(childId) !== -1) {
      if (!isAdmin) {
        const link = await db().collection("parentStudentLinks").doc(uid + "_" + childId).get();
        if (!link.exists) throw new HttpsError("permission-denied", "That is not your child's timetable.");
      }
      const s = await studentDoc(childId); sessions = pick((tt.studentSessions || {})[childId]); forName = s.name || "Student"; forLine = forLineOf(s);
    } else if ((tt.tutorIds || []).indexOf(uid) !== -1) {
      const t = await db().collection("tutorAccounts").doc(uid).get();
      sessions = pick((tt.tutorSessions || {})[uid]); forName = (t.exists && t.data().name) || "Tutor"; forLine = "Tutor copy: the exams in the subjects you teach";
    }
    if (!sessions) throw new HttpsError("permission-denied", "This exam timetable was not sent to you.");
    const pdf = await buildPdf({ tt, sessions, forName, forLine, generatedAt: new Date() });
    return { fileName: fileName(tt, forName), base64: pdf.toString("base64") };
  }
);

exports._internals = { cleanSessions, resolveAudience, buildPdf, hashOf, duration, dayLabel, takes };
