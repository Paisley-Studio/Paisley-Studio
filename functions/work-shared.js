/* =========================================================
   Paisley Studio — shared helpers for nested homework / exams
   -----------------------------------------------------------
   Used by deadlines.js (scheduled jobs), work.js (triggers and
   migration) and nothing else. Keeps recipient resolution,
   in-app notification writes and Storage-path handling in one
   place so every job behaves the same way.
========================================================= */
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");
const notifications = require("./notifications");

const LOCATION = "us-central1";
const TIME_ZONE = "Africa/Nairobi";

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");
const SMTP_SECRETS = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM];

const sendEmail = notifications.sendEmail;

function subjectKey(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\((a-level|igcse|as-level|as level|a level)\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^maths?$/, "mathematics");
}

function db() { return admin.firestore(); }
function FV() { return admin.firestore.FieldValue; }

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

/* ---------------------------------------------------------
   In-app notification (the bell). Same shape as the rest of
   the system plus relatedEntity / relatedEntityId.
--------------------------------------------------------- */
async function notify(recipientId, recipientType, fields) {
  if (!recipientId) return null;
  return db().collection("personalNotifications").add({
    recipientId,
    recipientType,
    type: fields.type,
    title: fields.title,
    message: fields.message,
    relatedEntity: fields.relatedEntity || "",
    relatedEntityId: fields.relatedEntityId || "",
    ...(fields.extra || {}),
    read: false,
    emailSent: !!fields.emailSent,
    createdAt: FV().serverTimestamp()
  });
}

/* A notice that shows on the Notices panel of a student / parent. */
async function addStudentNotice(recipientId, recipientType, fields) {
  if (!recipientId) return null;
  return db().collection("studentNotices").add({
    recipientId,
    recipientType,
    type: fields.type,
    title: fields.title,
    message: fields.message,
    fileUrl: fields.fileUrl || "",
    fileName: fields.fileName || "",
    studentId: fields.studentId || "",
    studentName: fields.studentName || "",
    entityId: fields.entityId || "",
    entityKind: fields.entityKind || "",
    createdAt: FV().serverTimestamp()
  });
}


/* ---------------------------------------------------------
   AUDIENCE MODEL
   -----------------------------------------------------------
   Content (lessons, assignments, exams) is authored ONCE by the
   Studio Desk. Who may see it is a separate, per-audience flag:

     audiences: { online: bool, remote: bool, tutors: bool }
     publication: { <audience>: { publishedAt, publishedBy, ... } }

   A student's audience comes from students/{uid}.studentType
   ("remote" or absent/"online"). Records written before this model
   existed carry no `audiences` field; they are treated as posted to
   online students and tutors only (never to remote students) until the
   backfillAudiences migration stamps them explicitly.
--------------------------------------------------------- */
const AUDIENCES = ["online", "remote", "tuition", "tutors"];

function studentAudience(student) {
  if (student && student.studentType === "remote") return "remote";
  if (student && student.studentType === "tuition") return "tuition";
  return "online";
}

function itemPostedTo(item, audience) {
  const a = item && item.audiences;
  if (!a || typeof a !== "object") return audience === "online" || audience === "tutors";
  return a[audience] === true;
}

// Can this student see this item at all (before recipient scoping)?
function studentMaySee(student, item) {
  if (Array.isArray(item && item.releasedTo) && item.releasedTo.indexOf(student.id) !== -1) return true;
  return itemPostedTo(item, studentAudience(student)) && !workPredatesStudent(student, item);
}

/* New students start fresh: work posted to the class before the account became
   active is not theirs. students.activatedAt is stamped by onStudentActivated;
   accounts activated before that field existed have none and keep what they see.
   Work a tutor releases to the student by name always counts (studentMaySee). */
function msOf(ts) {
  const d = toDate(ts);
  return d ? d.getTime() : 0;
}
function workPredatesStudent(student, item) {
  const joined = msOf(student && student.activatedAt);
  if (!joined) return false;
  const pub = item && item.publication && item.publication[studentAudience(student)];
  const posted = msOf((pub && pub.publishedAt) || (item && item.createdAt));
  return !!posted && posted < joined;
}

/* Students who hand in on paper at school. The Studio Desk or their tutor records
   hand-ins for them, so upload reminders and overdue notices never go to them. */
function isPaperStudent(student) { return !!(student && student.physicalStudent === true); }

/* ---------------------------------------------------------
   EXAM BOARDS
   A classroom belongs to one board (missing = Cambridge). A student follows
   students.subjectBoards[subjectId], else students.board, else Cambridge.
   A tutor teaches the boards in tutorAccounts.boardScope ("keyStage|subjectId|board",
   derived from teaching[].boards); with no boardScope they are Cambridge only.
   CBC classrooms have no board. Same logic as firestore.rules and lms-helpers.js.
--------------------------------------------------------- */
const BOARD_IDS = ["cambridge", "edexcel", "oxford_aqa"];
const DEFAULT_BOARD = "cambridge";
function boardId(v) { return BOARD_IDS.indexOf(v) !== -1 ? v : DEFAULT_BOARD; }
function boardOf(c) { return boardId(c && c.board); }
function studentBoard(student, subjectId) {
  const sb = student && student.subjectBoards && student.subjectBoards[subjectId];
  return boardId(sb || (student && student.board));
}
function tutorTeachesBoard(tutor, classroom) {
  if (!classroom || /^CBC/i.test(String(classroom.keyStage || ""))) return true;
  const b = boardOf(classroom);
  if (Array.isArray(tutor && tutor.boardScope)) return tutor.boardScope.indexOf(classroom.keyStage + "|" + classroom.subjectId + "|" + b) !== -1;
  return b === DEFAULT_BOARD;
}


/* Is `item` currently visible to `audience`?  `liveStatus` is the status an
   item needs before anyone can see it ("published" for lessons, "Published"
   for exams, null for assignments, which have no status). Triggers compare
   before/after visibility so a notification fires exactly when an item
   BECOMES visible to an audience — and never for the migration, which only
   restates what was already true. */
function isVisibleTo(item, audience, liveStatus) {
  if (!item) return false;
  if (liveStatus && String(item.status || "") !== liveStatus) return false;
  return itemPostedTo(item, audience);
}

/* Create a notification exactly once, keyed by a deterministic id, so a
   retried or duplicated trigger can never notify the same person twice.
   Returns true only for the call that actually created it. */
async function notifyOnce(docId, recipientId, recipientType, fields) {
  if (!recipientId || !docId) return false;
  try {
    await db().collection("personalNotifications").doc(docId).create({
      recipientId,
      recipientType,
      type: fields.type,
      title: fields.title,
      message: fields.message,
      relatedEntity: fields.relatedEntity || "",
      relatedEntityId: fields.relatedEntityId || "",
      ...(fields.extra || {}),
      read: false,
      emailSent: !!fields.emailSent,
      createdAt: FV().serverTimestamp()
    });
    return true;
  } catch (e) {
    if (e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message)))) return false;
    throw e;
  }
}

/* Atomically claim a one-time event key; true only for the first caller. */
async function claimOnce(key) {
  if (!key) return false;
  try {
    await db().collection("workEventClaims").doc(key).create({ createdAt: FV().serverTimestamp() });
    return true;
  } catch (e) {
    if (e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message)))) return false;
    throw e;
  }
}

function stableId(...parts) {
  return require("crypto").createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 28);
}

/* ---------------------------------------------------------
   Who is in an assignment / exam?
   recipients[] non-empty -> exactly those students.
   recipients[] empty     -> every active student enrolled in the
                              classroom's subject + Year.
--------------------------------------------------------- */
async function classroomOf(cid) {
  const snap = await db().collection("classrooms").doc(cid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function resolveStudents(classroom, recipients, item) {
  const out = [];
  const keep = (s) => String(s.status || "").toLowerCase() !== "suspended" && (!item || studentMaySee(s, item));
  if (Array.isArray(recipients) && recipients.length) {
    const snaps = await Promise.all(recipients.map((uid) => db().collection("students").doc(uid).get()));
    snaps.forEach((s) => { if (s.exists) { const row = { id: s.id, ...s.data() }; if (keep(row)) out.push(row); } });
    return out;
  }
  if (!classroom) return out;
  // Same visibility rule as firestore.rules classStudentMay(): the student
  // must take the subject and be in the classroom's Year (or, for older
  // profiles with no Year, its Key Stage). Subject ids are normalised so an
  // old free-text subject name still matches.
  const snap = await db().collection("students").where("keyStage", "==", classroom.keyStage).get();
  snap.forEach((d) => {
    const s = d.data();
    if (String(s.status || "").toLowerCase() === "pending") return;
    if (!keep({ id: d.id, ...s })) return;
    const subs = Array.isArray(s.subjects) ? s.subjects.map(subjectKey) : [];
    if (!subs.includes(subjectKey(classroom.subjectId))) return;
    if (s.year != null && classroom.year != null && Number(s.year) !== Number(classroom.year)) return;
    if (studentBoard(s, classroom.subjectId) !== boardOf(classroom)) return;
    out.push({ id: d.id, ...s });
  });
  return out;
}

async function parentsOfStudent(studentId) {
  const links = await db().collection("parentStudentLinks").where("studentUid", "==", studentId).get();
  const out = [];
  for (const l of links.docs) {
    const uid = l.data().parentUid;
    if (!uid) continue;
    const p = await db().collection("parentAccounts").doc(uid).get();
    if (p.exists) out.push({ id: uid, ...p.data() });
  }
  return out;
}

/* ---------------------------------------------------------
   Storage helpers
--------------------------------------------------------- */
function pathFromDownloadUrl(url) {
  try {
    const m = /\/o\/([^?]+)/.exec(String(url || ""));
    return m ? decodeURIComponent(m[1]) : "";
  } catch (e) { return ""; }
}

async function downloadStoredFile(pathOrUrl) {
  const path = pathOrUrl && pathOrUrl.indexOf("http") === 0 ? pathFromDownloadUrl(pathOrUrl) : pathOrUrl;
  if (!path) return null;
  try {
    const [buf] = await admin.storage().bucket().file(path).download();
    return buf;
  } catch (e) {
    console.error("downloadStoredFile failed for", path, e.message);
    return null;
  }
}

async function saveStoredPdf(path, bytes) {
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const crypto = require("crypto");
  const token = crypto.randomUUID();
  await file.save(Buffer.from(bytes), {
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } }
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/* ---------------------------------------------------------
   Iterate nested assignments / exams through collection-group
   queries on a single field only (no composite index needed);
   the per-job flags are filtered in code.
--------------------------------------------------------- */
function cidTidFromRef(ref) {
  // classrooms/{cid}/topics/{tid}/(assignments|exams)/{id}
  const parts = ref.path.split("/");
  return { cid: parts[1], tid: parts[3], id: parts[5] };
}

module.exports = {
  LOCATION, TIME_ZONE, SMTP_SECRETS, sendEmail,
  db, FV, toDate, subjectKey, notify, addStudentNotice, claimOnce,
  classroomOf, resolveStudents, parentsOfStudent,
  AUDIENCES, studentAudience, itemPostedTo, isVisibleTo, studentMaySee, notifyOnce, stableId,
  workPredatesStudent, isPaperStudent, boardId, boardOf, studentBoard, tutorTeachesBoard, DEFAULT_BOARD,
  pathFromDownloadUrl, downloadStoredFile, saveStoredPdf, cidTidFromRef
};