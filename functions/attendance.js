/* =========================================================
   Paisley Studio — online attendance, rollcall and punctuality
   -----------------------------------------------------------
   Lessons come from the existing weekly timetable (timetableEntries:
   dayOfWeek, startTime, endTime, keyStage, subjectId, board, tutorId).
   Every time is Africa/Nairobi (UTC+3 all year, no daylight saving).

     attendanceSessions/{entryId}_{YYYY-MM-DD}       one scheduled lesson
     attendanceRecords/{sessionId}_{studentId}        one student in it
     attendanceSubmissions/{sessionId}                the rollcall snapshot (manual or auto), written once
     attendanceAmendments/{auto id}                   changes made after submission
     attendanceStrikes/{recordId}                     one strike per student per lesson
     attendanceStudents/{studentId}                   strike counters per period (attendanceSettings/policy)
     attendanceSettings/policy                        strike reset policy (Admin > Attendance > Settings)
     attendanceReferrals/{strikeId}                   fifth-strike (and later) disciplinary referrals
     attendanceRequests/{auto id}                     correction / excused-lateness requests
     attendanceNotifications/{deterministic id}       every notice, with email delivery state
     attendanceLocks/{tutorId}_{subjectId}            post-lesson subject restriction (rules read it)
     attendanceAudit/{auto id}                        append-only audit trail

   Every write goes through this file (the rules allow no client writes).
   Idempotency: sessions and records are created with create(); a strike's
   id is its record id; a submission's id is its session id; notices use
   deterministic ids. Repeated jobs or retried calls never double anything.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const W = require("./work-shared");
const { templates } = require("./email-templates");

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const TS = () => admin.firestore.Timestamp;

/* ---------------- policy ---------------- */
const GRACE_MIN = 15;              // arriving 15:00 or more after the start is LATE
const EARLY_CHECKIN_MIN = 10;      // students may register from 10 minutes before the start
const PREPARE_MIN = 20;            // registers are prepared 20 minutes before the start
const NOTICE_MIN = 15;             // the student's "get ready" banner shows 15 minutes before
const AUTO_SUBMIT_AFTER_END_MIN = 15; // unsubmitted registers are auto-submitted 15 minutes after the lesson ends
const WARNING_AT = 4;              // fourth strike: formal warning
const REFERRAL_AT = 5;             // fifth strike (and any after it): disciplinary referral
const YEAR_START_MONTH = 9;        // the academic year starts in September (see academic-calendar.html)
const MAX_EMAIL_ATTEMPTS = 5;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const UNRESOLVED = ["expected", "unaccounted"];
const ATTENDED = ["present", "late", "present_verified", "connectivity"];
const TUTOR_OUTCOMES = {
  absent: { status: "absent", review: false, label: "Absent" },
  present_unable: { status: "present_verified", review: false, label: "Present but unable to check in" },
  connectivity: { status: "connectivity", review: false, label: "Connectivity / device issue" },
  excused_admin: { status: "excused", review: true, label: "Excused by administration" },
  other: { status: "other", review: true, label: "Other reason" }
};
const ADMIN_STATUSES = ["present", "late", "present_verified", "connectivity", "absent", "excused", "other", "unaccounted"];
const STATUS_LABEL = {
  expected: "Not registered yet", unaccounted: "Unaccounted for", present: "Present", late: "Late",
  present_verified: "Present (verified by tutor)", connectivity: "Connectivity / device issue", absent: "Absent",
  excused: "Excused", other: "Other reason", cancelled: "Lesson cancelled"
};

/* ---------------- Nairobi time ---------------- */
const OFFSET_MS = 3 * 3600000;
function nairobiParts(ms) {
  const d = new Date(ms + OFFSET_MS);
  return { ymd: d.toISOString().slice(0, 10), dow: DAYS[(d.getUTCDay() + 6) % 7], hm: d.toISOString().slice(11, 16), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}
function atNairobi(ymd, hm) { return Date.parse(ymd + "T" + hm + ":00+03:00"); }
function validHm(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")); }
function fmtTime(ms) { return nairobiParts(ms).hm; }
function fmtDay(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: W.TIME_ZONE });
}
/* Academic year key ("y2025" = September 2025 to August 2026) and its label. */
function academicYearOf(ms) {
  const p = nairobiParts(ms);
  const start = p.month >= YEAR_START_MONTH ? p.year : p.year - 1;
  return { key: "y" + start, label: start + "/" + String((start + 1) % 100).padStart(2, "0") };
}
/* ---------------- strike reset policy (Admin > Attendance > Settings) ----------------
   attendanceSettings/policy.strikeReset decides when strike counts start again:
     academic_year  (default) every September (yearStartMonth), key "y2026"
     calendar_year  every January, key "c2026"
     never          one running count, key "all"
     manual         only when the Studio Desk presses Reset, key "m<epoch>"
   Strikes themselves are never deleted; the policy only chooses which counter they add to. */
const POLICY_DEFAULTS = { strikeReset: "academic_year", yearStartMonth: YEAR_START_MONTH, manualEpoch: 0, manualResetAt: null };
const RESET_MODES = ["academic_year", "calendar_year", "never", "manual"];
let policyCache = null, policyAt = 0;
async function loadPolicy(fresh) {
  if (!fresh && policyCache && Date.now() - policyAt < 60000) return policyCache;
  const s = await db().collection("attendanceSettings").doc("policy").get();
  policyCache = Object.assign({}, POLICY_DEFAULTS, s.exists ? s.data() : {});
  policyAt = Date.now();
  return policyCache;
}
function strikePeriod(policy, msv) {
  const p = nairobiParts(msv), pol = policy || POLICY_DEFAULTS;
  if (pol.strikeReset === "calendar_year") return { key: "c" + p.year, label: String(p.year), phrase: "this calendar year" };
  if (pol.strikeReset === "never") return { key: "all", label: "All time", phrase: "in total" };
  if (pol.strikeReset === "manual") {
    const since = pol.manualResetAt ? fmtDay(ms(pol.manualResetAt)) : "";
    return { key: "m" + (pol.manualEpoch || 0), label: since ? "Since " + since : "Since records began", phrase: since ? "since " + since : "so far" };
  }
  const sm = Number(pol.yearStartMonth) >= 1 && Number(pol.yearStartMonth) <= 12 ? Number(pol.yearStartMonth) : YEAR_START_MONTH;
  const start = p.month >= sm ? p.year : p.year - 1;
  return { key: "y" + start, label: start + "/" + String((start + 1) % 100).padStart(2, "0"), phrase: "this academic year" };
}
/* When the lesson on `ymd` starts and ends; null if the entry has no usable start. */
function occurrence(entry, ymd) {
  if (!entry || !validHm(entry.startTime)) return null;
  const startAt = atNairobi(ymd, entry.startTime);
  let endAt = validHm(entry.endTime) ? atNairobi(ymd, entry.endTime) : startAt + 3600000;
  if (endAt <= startAt) endAt = startAt + 3600000;
  return { startAt, endAt, graceAt: startAt + GRACE_MIN * 60000 };
}
/* Exactly 15 minutes is late; anything earlier is on time. Server clock only. */
function classify(startAt, at) {
  const lateMs = at - startAt;
  return { late: lateMs >= GRACE_MIN * 60000, minutesLate: Math.max(0, Math.floor(lateMs / 60000)) };
}
function sessionIdOf(entryId, ymd) { return entryId + "_" + ymd; }
function ms(ts) { const d = W.toDate(ts); return d ? d.getTime() : 0; }
function ts(msv) { return TS().fromMillis(msv); }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 1000); }

/* ---------------- who teaches / attends ---------------- */
function isCbc(ks) { return /^CBC/i.test(String(ks || "")); }
/* Mirrors lmzTutorCovers in lms-helpers.js (exact Key Stage + subject + board). */
function tutorCovers(tutor, entry) {
  if (!tutor || !entry) return false;
  const sid = W.subjectKey(entry.subjectId || entry.subjectName), ks = entry.keyStage, board = W.boardOf(entry);
  if (Array.isArray(tutor.teaching)) {
    return tutor.teaching.some((e) => e && W.subjectKey(e.subjectId) === sid && e.keyStage === ks &&
      (isCbc(ks) || ((Array.isArray(e.boards) && e.boards.length ? e.boards : [W.DEFAULT_BOARD]).indexOf(board) !== -1)));
  }
  const subs = (Array.isArray(tutor.subjects) ? tutor.subjects : []).map(W.subjectKey);
  if (subs.indexOf(sid) === -1) return false;
  if (!isCbc(ks) && board !== W.DEFAULT_BOARD) return false;
  const kss = Array.isArray(tutor.keyStages) ? tutor.keyStages : [];
  return !kss.length || kss.indexOf(ks) !== -1;
}
/* The tutor(s) responsible: the named tutor, else every tutor who covers the session. */
async function tutorsFor(entry) {
  if (entry.tutorId) {
    const t = await db().collection("tutorAccounts").doc(entry.tutorId).get();
    return [{ id: entry.tutorId, name: entry.tutorName || (t.exists && t.data().name) || "Tutor" }];
  }
  const snap = await db().collection("tutorAccounts").get();
  return snap.docs.filter((d) => String((d.data() || {}).status || "Active") !== "Suspended" && tutorCovers(d.data(), entry))
    .map((d) => ({ id: d.id, name: d.data().name || "Tutor" }));
}
/* Online students only (the timetable is the online school's; remote, CBC tuition and
   Tech Studio have their own schedules). Same scope as studentMaySeeEntry in the rules,
   plus the exam board (lmzEntryForStudent) and an Active account. */
function studentTakes(student, entry) {
  if (!student || !entry) return false;
  if (student.studentType && student.studentType !== "online") return false;
  if (String(student.status || "") !== "Active") return false;
  if (student.keyStage !== entry.keyStage) return false;
  const sid = W.subjectKey(entry.subjectId || entry.subjectName);
  const subs = (Array.isArray(student.subjects) ? student.subjects : []).map(W.subjectKey);
  if (subs.length && subs.indexOf(sid) === -1) return false;
  return isCbc(entry.keyStage) || W.studentBoard(student, sid) === W.boardOf(entry);
}
async function rosterFor(entry) {
  const snap = await db().collection("students").where("keyStage", "==", entry.keyStage || "").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((s) => studentTakes(s, entry))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}
async function roleOf(uid) {
  const [a, t, s] = await Promise.all(["admins", "tutorAccounts", "students"].map((c) => db().collection(c).doc(uid).get()));
  return { admin: a.exists, tutor: t.exists ? Object.assign({ id: uid }, t.data()) : null, student: s.exists ? Object.assign({ id: uid }, s.data()) : null };
}
function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in again.");
  return request.auth.uid;
}

/* ---------------- audit ---------------- */
function audit(tx, row) {
  const ref = db().collection("attendanceAudit").doc();
  const doc = Object.assign({ at: FV().serverTimestamp() }, row);
  if (tx) tx.set(ref, doc); else return ref.set(doc);
  return null;
}

/* ---------------- sessions ---------------- */
function recordShell(session, sid, student) {
  return {
    sessionId: sid, entryId: session.entryId, date: session.date, studentId: student.id, studentName: student.name || "Student",
    subjectId: session.subjectId, subjectName: session.subjectName, keyStage: session.keyStage,
    tutorIds: session.tutorIds, tutorName: session.tutorName, startAt: session.startAt, endAt: session.endAt, graceAt: session.graceAt,
    academicYear: session.academicYear, status: "expected", checkIn: null, resolution: null, reviewState: null,
    needsVerification: false, strikeId: null, absenceConfirmedAt: null, corrections: [],
    createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
  };
}
/* Make sure the register for this lesson exists (idempotent: concurrent callers race on a
   transaction and only the first creates it). A same-day reschedule before anyone has
   registered moves the register; once someone has registered it is flagged instead. */
async function ensureSession(entryId, entry, ymd) {
  const occ = occurrence(entry, ymd);
  if (!occ) return null;
  const sid = sessionIdOf(entryId, ymd);
  const ref = db().collection("attendanceSessions").doc(sid);
  const existing = await ref.get();
  if (existing.exists) {
    const s = existing.data();
    if (s.status === "open" && ms(s.startAt) !== occ.startAt) {
      if (!(s.counts && s.counts.checkedIn)) {
        await ref.update({ startAt: ts(occ.startAt), endAt: ts(occ.endAt), graceAt: ts(occ.graceAt), startTime: entry.startTime, endTime: entry.endTime || "", rescheduledAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
        const recs = await db().collection("attendanceRecords").where("sessionId", "==", sid).get();
        const b = db().batch();
        recs.forEach((r) => b.update(r.ref, { startAt: ts(occ.startAt), endAt: ts(occ.endAt), graceAt: ts(occ.graceAt) }));
        await b.commit();
      } else if (!s.scheduleChanged) {
        await ref.update({ scheduleChanged: true, updatedAt: FV().serverTimestamp() });
      }
      return Object.assign({ id: sid }, (await ref.get()).data());
    }
    return Object.assign({ id: sid }, s);
  }
  const [tutors, roster] = await Promise.all([tutorsFor(entry), rosterFor(entry)]);
  const subjectId = W.subjectKey(entry.subjectId || entry.subjectName);
  const session = {
    entryId, date: ymd, dayOfWeek: entry.dayOfWeek || "", startTime: entry.startTime, endTime: entry.endTime || "",
    startAt: ts(occ.startAt), endAt: ts(occ.endAt), graceAt: ts(occ.graceAt),
    subjectId, subjectName: entry.subjectName || subjectId, keyStage: entry.keyStage || "", board: W.boardOf(entry), room: entry.room || "",
    tutorId: entry.tutorId || null, tutorName: tutors.map((t) => t.name).join(", ") || "No tutor assigned",
    tutorIds: tutors.map((t) => t.id), studentIds: roster.map((s) => s.id), rosterCount: roster.length,
    academicYear: academicYearOf(occ.startAt).key, status: "open", counts: { checkedIn: 0, present: 0, late: 0 },
    submission: null, needsFollowUp: false, explanationRequired: false, tutorExplanation: null, explanationReview: null,
    createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
  };
  await db().runTransaction(async (tx) => {
    const again = await tx.get(ref);
    if (again.exists) return;
    tx.set(ref, session);
    roster.forEach((st) => tx.set(db().collection("attendanceRecords").doc(sid + "_" + st.id), recordShell(session, sid, st)));
  });
  return Object.assign({ id: sid }, (await ref.get()).data());
}
async function entriesForDay(dow) {
  const snap = await db().collection("timetableEntries").where("dayOfWeek", "==", dow).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}
function lessonView(entry, occ, session, record) {
  return {
    entryId: entry.id, sessionId: session ? session.id : sessionIdOf(entry.id, nairobiParts(occ.startAt).ymd),
    subjectName: entry.subjectName || entry.subjectId, subjectId: W.subjectKey(entry.subjectId || entry.subjectName),
    keyStage: entry.keyStage || "", room: entry.room || "",
    tutorName: (session && session.tutorName) || entry.tutorName || "",
    startAt: occ.startAt, endAt: occ.endAt, graceAt: occ.graceAt,
    status: session ? session.status : "upcoming",
    submission: session && session.submission ? { method: session.submission.method, at: ms(session.submission.at) } : null,
    record: record ? publicRecord(record) : null
  };
}
function publicRecord(r) {
  return {
    id: r.id, studentId: r.studentId, studentName: r.studentName, status: r.status,
    checkIn: r.checkIn ? { at: ms(r.checkIn.at), minutesLate: r.checkIn.minutesLate, classification: r.checkIn.classification, method: r.checkIn.method || "online" } : null,
    needsVerification: !!r.needsVerification, strikeId: r.strikeId || null, reviewState: r.reviewState || null,
    resolution: r.resolution ? { outcome: r.resolution.outcome, note: r.resolution.note, byName: r.resolution.byName, at: ms(r.resolution.at) } : null
  };
}

/* =========================================================
   attendanceToday — the student's or tutor's lessons today, with
   registers prepared for any lesson about to start or under way.
========================================================= */
async function todayFor(uid, now) {
  const role = await roleOf(uid);
  const day = nairobiParts(now);
  const out = { now, date: day.ymd, role: role.student ? "student" : role.tutor ? "tutor" : role.admin ? "admin" : "none", lessons: [], pending: [] };
  if (role.student) {
    const s = role.student;
    const entries = (await entriesForDay(day.dow)).filter((e) => studentTakes(s, e));
    for (const e of entries) {
      const occ = occurrence(e, day.ymd);
      if (!occ) continue;
      let session = null, record = null;
      if (now >= occ.startAt - PREPARE_MIN * 60000 && now <= occ.endAt) session = await ensureSession(e.id, e, day.ymd);
      else {
        const got = await db().collection("attendanceSessions").doc(sessionIdOf(e.id, day.ymd)).get();
        if (got.exists) session = Object.assign({ id: got.id }, got.data());
      }
      if (session) {
        const r = await db().collection("attendanceRecords").doc(session.id + "_" + uid).get();
        if (r.exists) record = Object.assign({ id: r.id }, r.data());
      }
      out.lessons.push(lessonView(e, occ, session, record));
    }
  } else if (role.tutor) {
    const t = role.tutor;
    const entries = (await entriesForDay(day.dow)).filter((e) => (e.tutorId ? e.tutorId === uid : tutorCovers(t, e)));
    for (const e of entries) {
      const occ = occurrence(e, day.ymd);
      if (!occ) continue;
      let session = null;
      if (now >= occ.startAt - PREPARE_MIN * 60000) session = await ensureSession(e.id, e, day.ymd);
      out.lessons.push(lessonView(e, occ, session, null));
    }
    const open = await db().collection("attendanceSessions").where("tutorIds", "array-contains", uid).where("status", "==", "open").get();
    open.forEach((d) => {
      const s = d.data();
      if (ms(s.endAt) < now) out.pending.push({ sessionId: d.id, subjectName: s.subjectName, subjectId: s.subjectId, date: s.date, startAt: ms(s.startAt), endAt: ms(s.endAt), autoSubmitAt: ms(s.endAt) + AUTO_SUBMIT_AFTER_END_MIN * 60000 });
    });
  }
  out.lessons.sort((a, b) => a.startAt - b.startAt);
  out.policy = { graceMin: GRACE_MIN, earlyMin: EARLY_CHECKIN_MIN, noticeMin: NOTICE_MIN, autoSubmitAfterEndMin: AUTO_SUBMIT_AFTER_END_MIN };
  out.strikePeriod = strikePeriod(await loadPolicy(), now);
  // Facial recognition is offered only when the Studio Desk has enabled it and this person is
  // enrolled with consent (functions/face-recognition.js). Otherwise nothing about it is sent.
  out.recognition = { available: false };
  if (out.role === "student" || out.role === "tutor") {
    try { out.recognition = await require("./face-recognition").availabilityFor(uid, out.role); } catch (e) { console.warn("recognition availability", e.message); }
  }
  return out;
}

/* =========================================================
   Student check-in (server time, idempotent, strike in the same transaction)
========================================================= */
async function checkIn(uid, entryId, now, how) {
  how = how || {};
  const method = how.method === "face" ? "face" : "online";
  const role = await roleOf(uid);
  if (!role.student) throw new HttpsError("permission-denied", "Only students register attendance.");
  const entrySnap = await db().collection("timetableEntries").doc(String(entryId || "")).get();
  if (!entrySnap.exists) throw new HttpsError("not-found", "This lesson is no longer on the timetable.");
  const entry = Object.assign({ id: entrySnap.id }, entrySnap.data());
  const day = nairobiParts(now);
  if (entry.dayOfWeek !== day.dow) throw new HttpsError("failed-precondition", "This lesson is not on today's timetable.");
  if (!studentTakes(role.student, entry)) throw new HttpsError("permission-denied", "You are not enrolled in this lesson.");
  const occ = occurrence(entry, day.ymd);
  if (!occ) throw new HttpsError("failed-precondition", "This lesson has no start time on the timetable.");
  if (now < occ.startAt - EARLY_CHECKIN_MIN * 60000) throw new HttpsError("failed-precondition", "Registration opens " + EARLY_CHECKIN_MIN + " minutes before the lesson starts.");
  const session = await ensureSession(entry.id, entry, day.ymd);
  if (!session) throw new HttpsError("failed-precondition", "This lesson cannot take registrations.");
  if (session.status === "cancelled") throw new HttpsError("failed-precondition", "This lesson was cancelled.");
  const startAt = ms(session.startAt), endAt = ms(session.endAt);
  if (now >= endAt) throw new HttpsError("deadline-exceeded", "This lesson has ended, so registration is closed. Your tutor will record your attendance.");

  const sid = session.id, rid = sid + "_" + uid;
  const recRef = db().collection("attendanceRecords").doc(rid);
  const strikeRef = db().collection("attendanceStrikes").doc(rid);
  const sumRef = db().collection("attendanceStudents").doc(uid);
  const sesRef = db().collection("attendanceSessions").doc(sid);
  const c = classify(startAt, now);
  const per = strikePeriod(await loadPolicy(), startAt);
  const ay = per.key;

  const result = await db().runTransaction(async (tx) => {
    const [recSnap, strikeSnap, sumSnap, sesSnap] = await Promise.all([tx.get(recRef), tx.get(strikeRef), tx.get(sumRef), tx.get(sesRef)]);
    const rec = recSnap.exists ? recSnap.data() : recordShell(session, sid, role.student);
    const ses = sesSnap.data() || session;
    if (rec.checkIn) return { already: true, record: Object.assign({ id: rid }, rec) };                // duplicate / retried request
    const submitted = ses.status === "submitted" || ses.status === "auto_submitted";
    if (rec.status === "absent" && submitted) throw new HttpsError("failed-precondition", "Your tutor has already submitted this register. Please speak to your tutor.");
    if (["present_verified", "connectivity", "excused", "other"].indexOf(rec.status) !== -1 && submitted) throw new HttpsError("failed-precondition", "Your tutor has already recorded your attendance for this lesson.");
    const before = { status: rec.status };
    const patch = {
      status: c.late ? "late" : "present",
      checkIn: Object.assign({ at: ts(now), minutesLate: c.minutesLate, classification: c.late ? "late" : "on_time", source: "student", method },
        method === "face" && how.similarity != null ? { similarity: Math.round(how.similarity * 1000) / 1000 } : {}),
      needsVerification: submitted,              // a registration after the register went in is shown to the tutor for checking
      updatedAt: FV().serverTimestamp()
    };
    if (rec.resolution) patch.supersededResolution = rec.resolution;  // the tutor had marked them before they registered
    let strike = null;
    if (c.late && !strikeSnap.exists) {
      const sum = sumSnap.exists ? sumSnap.data() : {};
      const y = (sum.years && sum.years[ay]) || {};
      const number = (y.active || 0) + 1;
      strike = {
        studentId: uid, studentName: rec.studentName, sessionId: sid, recordId: rid, subjectId: session.subjectId, subjectName: session.subjectName,
        tutorName: session.tutorName, academicYear: ay, academicYearLabel: per.label, periodPhrase: per.phrase, startAt: ts(startAt), checkInAt: ts(now),
        minutesLate: c.minutesLate, number, status: "active", reversal: null, createdAt: FV().serverTimestamp()
      };
      tx.set(strikeRef, strike);
      tx.set(sumRef, {
        studentId: uid, studentName: rec.studentName, updatedAt: FV().serverTimestamp(), lastStrikeAt: FV().serverTimestamp(),
        years: { [ay]: { active: number, total: (y.total || 0) + 1, reversed: y.reversed || 0, label: per.label } }
      }, { merge: true });
      patch.strikeId = rid;
    }
    if (recSnap.exists) tx.update(recRef, patch); else tx.set(recRef, Object.assign(rec, patch));
    tx.update(sesRef, {
      "counts.checkedIn": FV().increment(1), ["counts." + (c.late ? "late" : "present")]: FV().increment(1),
      studentIds: FV().arrayUnion(uid), updatedAt: FV().serverTimestamp()
    });
    audit(tx, { action: "check_in", sessionId: sid, recordId: rid, studentId: uid, actorId: uid, actorRole: "student", actorName: rec.studentName, before, after: { status: patch.status, minutesLate: c.minutesLate, method }, strikeNumber: strike ? strike.number : null });
    return { already: false, record: Object.assign({ id: rid }, rec, patch, { checkIn: { at: ts(now), minutesLate: c.minutesLate, classification: patch.checkIn.classification, method } }), strike };
  });
  return {
    already: result.already, record: publicRecord(result.record),
    strikeNumber: result.strike ? result.strike.number : null,
    lesson: { subjectName: session.subjectName, tutorName: session.tutorName, startAt, endAt }
  };
}

/* =========================================================
   Tutor: account for a student who did not register
========================================================= */
async function loadSession(sid) {
  const s = await db().collection("attendanceSessions").doc(String(sid || "")).get();
  if (!s.exists) throw new HttpsError("not-found", "Register not found.");
  return Object.assign({ id: s.id }, s.data());
}
function mayRunRegister(role, session, uid) {
  return role.admin || (role.tutor && (session.tutorIds || []).indexOf(uid) !== -1);
}
async function resolveStudent(uid, data, now) {
  const [role, session] = await Promise.all([roleOf(uid), loadSession(data.sessionId)]);
  if (!mayRunRegister(role, session, uid)) throw new HttpsError("permission-denied", "This is not your register.");
  if (session.status === "cancelled") throw new HttpsError("failed-precondition", "This lesson was cancelled.");
  if (now < ms(session.startAt)) throw new HttpsError("failed-precondition", "The lesson has not started yet.");
  const outcome = String(data.outcome || "");
  const def = TUTOR_OUTCOMES[outcome];
  if (!def && outcome !== "verify") throw new HttpsError("invalid-argument", "Choose how this student is accounted for.");
  const note = clean(data.note, 1000);
  if (outcome === "other" && note.length < 3) throw new HttpsError("invalid-argument", "Write the reason for \"Other\".");
  const actorName = role.tutor ? (role.tutor.name || "Tutor") : "Studio Desk";
  const rid = session.id + "_" + String(data.studentId || "");
  const recRef = db().collection("attendanceRecords").doc(rid);
  const submitted = session.status === "submitted" || session.status === "auto_submitted";
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(recRef);
    if (!snap.exists) throw new HttpsError("not-found", "That student is not on this register.");
    const r = snap.data();
    if (outcome === "verify") {
      if (!r.needsVerification) return { ok: true, unchanged: true };
      tx.update(recRef, { needsVerification: false, verifiedBy: uid, verifiedByName: actorName, verifiedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
      audit(tx, { action: "verify_late_registration", sessionId: session.id, recordId: rid, studentId: r.studentId, actorId: uid, actorRole: role.admin ? "admin" : "tutor", actorName });
      return { ok: true };
    }
    if (r.checkIn) throw new HttpsError("failed-precondition", r.studentName + " registered themselves. Only the Studio Desk can correct a registration.");
    const tutorMarked = ["absent", "present_verified", "connectivity", "excused", "other"].indexOf(r.status) !== -1;
    if (submitted && tutorMarked) throw new HttpsError("failed-precondition", "This register is submitted. Ask the Studio Desk for a correction.");
    if (!tutorMarked && UNRESOLVED.indexOf(r.status) === -1) throw new HttpsError("failed-precondition", "This student is already accounted for.");
    const resolution = { outcome, label: def.label, note, by: uid, byName: actorName, role: role.admin ? "admin" : "tutor", at: ts(now), afterSubmission: submitted };
    const patch = { status: def.status, resolution, reviewState: def.review ? "pending" : null, updatedAt: FV().serverTimestamp() };
    if (submitted && def.status === "absent") patch.absenceConfirmedAt = FV().serverTimestamp();   // a follow-up after submission is a confirmed outcome
    tx.update(recRef, patch);
    if (submitted) {
      tx.set(db().collection("attendanceAmendments").doc(), {
        sessionId: session.id, recordId: rid, studentId: r.studentId, studentName: r.studentName, tutorIds: session.tutorIds,
        before: { status: r.status }, after: { status: def.status, outcome, note }, by: uid, byName: actorName, at: FV().serverTimestamp(), kind: "tutor_follow_up"
      });
      tx.update(db().collection("attendanceSessions").doc(session.id), { lastAmendedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
    }
    audit(tx, { action: submitted ? "tutor_follow_up" : "tutor_resolve", sessionId: session.id, recordId: rid, studentId: r.studentId, actorId: uid, actorRole: resolution.role, actorName, before: { status: r.status }, after: { status: def.status, outcome }, reason: note });
    return { ok: true, status: def.status, reviewPending: def.review };
  });
}

/* =========================================================
   Submitting the register (manual, or automatic at the end)
========================================================= */
async function releaseLocks(session) {
  for (const tid of session.tutorIds || []) {
    const ref = db().collection("attendanceLocks").doc(tid + "_" + session.subjectId);
    await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const left = (s.data().sessionIds || []).filter((x) => x !== session.id);
      if (left.length) tx.update(ref, { sessionIds: left, updatedAt: FV().serverTimestamp() }); else tx.delete(ref);
    });
  }
}
function snapshotRow(r) {
  return {
    studentId: r.studentId, studentName: r.studentName, status: r.status,
    checkInAt: r.checkIn ? r.checkIn.at : null, minutesLate: r.checkIn ? r.checkIn.minutesLate : null, classification: r.checkIn ? r.checkIn.classification : null, checkInMethod: r.checkIn ? (r.checkIn.method || "online") : null,
    resolution: r.resolution ? { outcome: r.resolution.outcome, note: r.resolution.note, byName: r.resolution.byName } : null,
    strikeId: r.strikeId || null
  };
}
async function submitRegister(sessionId, opts) {
  const { method, uid, name, now } = opts;
  const sesRef = db().collection("attendanceSessions").doc(sessionId);
  const subRef = db().collection("attendanceSubmissions").doc(sessionId);
  const out = await db().runTransaction(async (tx) => {
    const sesSnap = await tx.get(sesRef);
    if (!sesSnap.exists) throw new HttpsError("not-found", "Register not found.");
    const s = sesSnap.data();
    if (s.status !== "open") return { already: true, status: s.status };
    const recs = await tx.get(db().collection("attendanceRecords").where("sessionId", "==", sessionId));
    const rows = recs.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const unresolved = rows.filter((r) => UNRESOLVED.indexOf(r.status) !== -1);
    // Before the lesson ends every student must be marked; from the end the tutor may submit
    // anyway; unmarked students stay unaccounted (never absent) and can be marked afterwards.
    if (method === "manual" && unresolved.length && now < ms(s.endAt)) {
      throw new HttpsError("failed-precondition", "Account for every student first: " + unresolved.map((r) => r.studentName).join(", ") + ".");
    }
    const counts = {};
    rows.forEach((r) => { const st = UNRESOLVED.indexOf(r.status) !== -1 ? "unresolved" : r.status; counts[st] = (counts[st] || 0) + 1; });
    tx.create(subRef, {
      sessionId, entryId: s.entryId, date: s.date, subjectId: s.subjectId, subjectName: s.subjectName, keyStage: s.keyStage,
      tutorIds: s.tutorIds, tutorName: s.tutorName, startAt: s.startAt, endAt: s.endAt,
      method, manualSubmission: method === "manual", submittedAt: ts(now), submittedBy: uid || null, submittedByName: name || (method === "auto" ? "System (auto-submitted)" : ""),
      rows: rows.map(snapshotRow), counts, unresolvedCount: unresolved.length, createdAt: FV().serverTimestamp()
    });
    rows.forEach((r) => {
      const ref = db().collection("attendanceRecords").doc(r.id);
      if (r.status === "expected") tx.update(ref, { status: "unaccounted", updatedAt: FV().serverTimestamp() });   // flagged, never turned into absent
      if (r.status === "absent" && !r.absenceConfirmedAt) tx.update(ref, { absenceConfirmedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
    });
    tx.update(sesRef, {
      status: method === "auto" ? "auto_submitted" : "submitted",
      submission: { method, at: ts(now), by: uid || null, byName: name || (method === "auto" ? "System (auto-submitted)" : ""), manualSubmission: method === "manual" },
      needsFollowUp: method === "auto" || unresolved.length > 0,
      explanationRequired: method === "auto",
      unresolvedCount: unresolved.length,
      updatedAt: FV().serverTimestamp()
    });
    audit(tx, { action: method === "auto" ? "auto_submit" : "submit", sessionId, actorId: uid || "system", actorRole: method === "auto" ? "system" : "tutor", actorName: name || "System", after: { counts, unresolved: unresolved.length } });
    return { already: false, status: method === "auto" ? "auto_submitted" : "submitted", session: s, unresolved: unresolved.length, counts };
  });
  if (!out.already) await releaseLocks(Object.assign({ id: sessionId }, out.session));
  if (!out.already && method === "auto") await noticeAutoSubmitted(Object.assign({ id: sessionId }, out.session), out);
  return { already: out.already, status: out.status, unresolved: out.unresolved || 0 };
}

/* =========================================================
   Notices: in-app bell (personalNotifications) + email, tracked
   in attendanceNotifications with pending / sent / failed state.
========================================================= */
async function adminsList() {
  const snap = await db().collection("admins").get();
  const out = [];
  for (const d of snap.docs) {
    let email = (d.data() || {}).email || "";
    if (!email) { try { email = (await admin.auth().getUser(d.id)).email || ""; } catch (e) { /* no auth user */ } }
    out.push({ id: d.id, name: (d.data() || {}).name || "Studio Desk", email });
  }
  return out;
}
async function queueNotice(n) {
  const ref = db().collection("attendanceNotifications").doc(n.id);
  const doc = {
    kind: n.kind, audience: n.audience, recipientId: n.recipientId, recipientRole: n.recipientRole, recipientName: n.recipientName || "",
    studentId: n.studentId || "", studentName: n.studentName || "", sessionId: n.sessionId || "", recordId: n.recordId || "", incidentId: n.incidentId || "",
    title: n.title, message: n.message, email: n.email || "", emailSubject: n.emailSubject || "", emailHtml: n.emailHtml || "",
    emailStatus: n.email ? "pending" : "skipped", attempts: 0, lastError: "", sentAt: null, nextAttemptAt: null,
    createdAt: FV().serverTimestamp()
  };
  try { await ref.create(doc); } catch (e) {
    if (e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message)))) return false;
    throw e;
  }
  await W.notifyOnce("att_" + n.id, n.recipientId, n.recipientRole, {
    type: "attendance_" + n.kind, title: n.title, message: n.message, relatedEntity: "attendance", relatedEntityId: n.recordId || n.sessionId || "",
    extra: { studentId: n.studentId || "", sessionId: n.sessionId || "" }
  });
  return true;
}
function noticeId(kind, incident, who) { return W.stableId("att", kind, incident, who); }
async function studentAndParents(studentId) {
  const s = await db().collection("students").doc(studentId).get();
  return { student: s.exists ? Object.assign({ id: s.id }, s.data()) : { id: studentId, name: "Student" }, parents: await W.parentsOfStudent(studentId) };
}
function mail(kind, extra) { return templates.attendanceNotice(Object.assign({ kind }, extra)); }

async function noticeStrike(strike, strikeId) {
  const { student, parents } = await studentAndParents(strike.studentId);
  const base = { studentId: strike.studentId, studentName: student.name || strike.studentName, sessionId: strike.sessionId, recordId: strike.recordId };
  const lesson = { subjectName: strike.subjectName, tutorName: strike.tutorName, startAt: ms(strike.startAt), arrivedAt: ms(strike.checkInAt), minutesLate: strike.minutesLate, strikes: strike.number, academicYear: strike.academicYearLabel, periodPhrase: strike.periodPhrase || "this academic year" };
  const startTxt = fmtTime(lesson.startAt), arrTxt = fmtTime(lesson.arrivedAt);
  for (const p of parents) {
    const m = mail("late", Object.assign({ audience: "parent", recipientName: p.name, student }, lesson));
    await queueNotice(Object.assign({}, base, {
      id: noticeId("late", strikeId, p.id), kind: "late", audience: "family", recipientId: p.id, recipientRole: "parent", recipientName: p.name || "", email: p.email || "",
      incidentId: strikeId, title: "Late arrival: " + strike.subjectName,
      message: (student.name || "Your child") + " registered for " + strike.subjectName + " at " + arrTxt + ", " + strike.minutesLate + " minutes after the " + startTxt + " start. This is late arrival " + strike.number + " " + (strike.periodPhrase || "this academic year") + ".",
      emailSubject: m.subject, emailHtml: m.html
    }));
  }
  if (strike.number === WARNING_AT) {
    const ms4 = mail("strike4_student", Object.assign({ audience: "student", recipientName: student.name, student }, lesson));
    await queueNotice(Object.assign({}, base, {
      id: noticeId("strike4_student", strikeId, strike.studentId), kind: "strike4_student", audience: "family", recipientId: strike.studentId, recipientRole: "student", recipientName: student.name || "", email: student.email || "",
      incidentId: strikeId, title: "Formal warning: 4 late arrivals",
      message: "You have 4 late-arrival strikes " + (strike.periodPhrase || "this academic year") + ". The next late arrival will be referred to the Studio Desk for disciplinary review.",
      emailSubject: ms4.subject, emailHtml: ms4.html
    }));
    for (const p of parents) {
      const mp = mail("strike4_parent", Object.assign({ audience: "parent", recipientName: p.name, student }, lesson));
      await queueNotice(Object.assign({}, base, {
        id: noticeId("strike4_parent", strikeId, p.id), kind: "strike4_parent", audience: "family", recipientId: p.id, recipientRole: "parent", recipientName: p.name || "", email: p.email || "",
        incidentId: strikeId, title: "Formal warning: " + (student.name || "your child") + " has 4 late arrivals",
        message: (student.name || "Your child") + " now has 4 late-arrival strikes " + (strike.periodPhrase || "this academic year") + ". The next late arrival will be referred to the Studio Desk for disciplinary review.",
        emailSubject: mp.subject, emailHtml: mp.html
      }));
    }
    await db().collection("attendanceStrikes").doc(strikeId).update({ warningIssuedAt: FV().serverTimestamp() });
  }
  if (strike.number >= REFERRAL_AT) {
    const refRef = db().collection("attendanceReferrals").doc(strikeId);
    try {
      await refRef.create({
        studentId: strike.studentId, studentName: student.name || strike.studentName, strikeId, strikeNumber: strike.number,
        academicYear: strike.academicYear, academicYearLabel: strike.academicYearLabel, sessionId: strike.sessionId, subjectName: strike.subjectName,
        minutesLate: strike.minutesLate, status: "open", decisions: [], createdAt: FV().serverTimestamp()
      });
      await audit(null, { action: "referral_created", studentId: strike.studentId, recordId: strike.recordId, sessionId: strike.sessionId, actorId: "system", actorRole: "system", actorName: "System", after: { strikeNumber: strike.number } });
    } catch (e) { if (!(e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message))))) throw e; }
    for (const a of await adminsList()) {
      const ma = mail("referral_admin", Object.assign({ audience: "admin", recipientName: a.name, student }, lesson));
      await queueNotice(Object.assign({}, base, {
        id: noticeId("referral_admin", strikeId, a.id), kind: "referral_admin", audience: "admin", recipientId: a.id, recipientRole: "admin", recipientName: a.name, email: a.email,
        incidentId: strikeId, title: "Disciplinary referral: " + (student.name || "a student") + " (" + strike.number + " strikes)",
        message: (student.name || "A student") + " reached " + strike.number + " late-arrival strikes " + (strike.periodPhrase || "this academic year") + ". Review the referral in Attendance.",
        emailSubject: ma.subject, emailHtml: ma.html
      }));
    }
    for (const p of parents) {
      const mp = mail("referral_parent", Object.assign({ audience: "parent", recipientName: p.name, student }, lesson));
      await queueNotice(Object.assign({}, base, {
        id: noticeId("referral_parent", strikeId, p.id), kind: "referral_parent", audience: "family", recipientId: p.id, recipientRole: "parent", recipientName: p.name || "", email: p.email || "",
        incidentId: strikeId, title: "Disciplinary referral: " + (student.name || "your child"),
        message: (student.name || "Your child") + " has reached " + strike.number + " late-arrival strikes " + (strike.periodPhrase || "this academic year") + ", the disciplinary referral threshold. The Studio Desk will review the case.",
        emailSubject: mp.subject, emailHtml: mp.html
      }));
    }
  }
}
async function noticeAbsence(record, rid) {
  const { student, parents } = await studentAndParents(record.studentId);
  const lesson = { subjectName: record.subjectName, tutorName: record.tutorName, startAt: ms(record.startAt) };
  for (const p of parents) {
    const m = mail("absent", Object.assign({ audience: "parent", recipientName: p.name, student }, lesson));
    await queueNotice({
      id: noticeId("absent", rid, p.id), kind: "absent", audience: "family", recipientId: p.id, recipientRole: "parent", recipientName: p.name || "", email: p.email || "",
      studentId: record.studentId, studentName: student.name || record.studentName, sessionId: record.sessionId, recordId: rid, incidentId: rid,
      title: "Absent: " + record.subjectName,
      message: (student.name || "Your child") + " was recorded absent from " + record.subjectName + " on " + fmtDay(lesson.startAt) + " at " + fmtTime(lesson.startAt) + ".",
      emailSubject: m.subject, emailHtml: m.html
    });
  }
}
async function noticeAutoSubmitted(session, out) {
  const lesson = { subjectName: session.subjectName, tutorName: session.tutorName, startAt: ms(session.startAt), unresolved: out.unresolved };
  for (const a of await adminsList()) {
    const m = mail("auto_submit_admin", Object.assign({ audience: "admin", recipientName: a.name }, lesson));
    await queueNotice({
      id: noticeId("auto_submit_admin", session.id, a.id), kind: "auto_submit_admin", audience: "admin", recipientId: a.id, recipientRole: "admin", recipientName: a.name, email: a.email,
      sessionId: session.id, incidentId: session.id,
      title: "Register auto-submitted: " + session.subjectName + " (" + session.date + ")",
      message: (session.tutorName || "The tutor") + " did not submit the " + session.subjectName + " register, so it was auto-submitted" + (out.unresolved ? " with " + out.unresolved + " student(s) unaccounted for" : "") + ". A tutor explanation is required.",
      emailSubject: m.subject, emailHtml: m.html
    });
  }
  for (const tid of session.tutorIds || []) {
    await W.notifyOnce("att_" + noticeId("auto_submit_tutor", session.id, tid), tid, "tutor", {
      type: "attendance_auto_submitted", title: "Your " + session.subjectName + " register was auto-submitted",
      message: "Open Attendance to account for any student still unresolved and explain why the register was not submitted.",
      relatedEntity: "attendanceSessions", relatedEntityId: session.id
    });
  }
}

/* Send one queued email. Claims the row first so two runners never send twice. */
async function deliver(id) {
  const ref = db().collection("attendanceNotifications").doc(id);
  const claimed = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const n = s.data();
    const due = n.emailStatus === "pending" || (n.emailStatus === "failed" && (n.attempts || 0) < MAX_EMAIL_ATTEMPTS && (!n.nextAttemptAt || ms(n.nextAttemptAt) <= Date.now()));
    if (!due || !n.email) return null;
    tx.update(ref, { emailStatus: "sending", attempts: (n.attempts || 0) + 1, lastAttemptAt: FV().serverTimestamp() });
    return Object.assign({}, n, { attempts: (n.attempts || 0) + 1 });
  });
  if (!claimed) return { skipped: true };
  let res;
  try { res = await W.sendEmail(claimed.email, claimed.emailSubject || claimed.title, claimed.emailHtml || "<p>" + claimed.message + "</p>"); }
  catch (e) { res = { sent: false, reason: e.message }; }
  if (res && res.sent) {
    await ref.update({ emailStatus: "sent", sentAt: FV().serverTimestamp(), lastError: "" });
  } else {
    const wait = Math.min(6 * 3600000, 5 * 60000 * Math.pow(2, claimed.attempts - 1));
    await ref.update({ emailStatus: "failed", lastError: String((res && res.reason) || "send failed").slice(0, 300), nextAttemptAt: ts(Date.now() + wait) });
  }
  return { sent: !!(res && res.sent) };
}

/* =========================================================
   Strikes: reversal (admin only, reasoned, audited)
========================================================= */
async function reverseStrike(strikeId, actor, reason) {
  const ref = db().collection("attendanceStrikes").doc(strikeId);
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError("not-found", "Strike not found.");
    const k = s.data();
    if (k.status !== "active") return { already: true };
    const sumRef = db().collection("attendanceStudents").doc(k.studentId);
    const sum = await tx.get(sumRef);
    const y = (sum.exists && sum.data().years && sum.data().years[k.academicYear]) || {};
    tx.update(ref, { status: "reversed", reversal: { by: actor.uid, byName: actor.name, reason, at: FV().serverTimestamp() } });
    tx.set(sumRef, { years: { [k.academicYear]: { active: Math.max(0, (y.active || 0) - 1), reversed: (y.reversed || 0) + 1 } }, updatedAt: FV().serverTimestamp() }, { merge: true });
    tx.update(db().collection("attendanceRecords").doc(k.recordId), { strikeReversed: true, updatedAt: FV().serverTimestamp() });
    audit(tx, { action: "strike_reversed", studentId: k.studentId, recordId: k.recordId, sessionId: k.sessionId, actorId: actor.uid, actorRole: "admin", actorName: actor.name, reason, before: { status: "active" }, after: { status: "reversed" } });
    return { ok: true };
  });
}

/* =========================================================
   Studio Desk actions
========================================================= */
async function adminAction(uid, data, now) {
  const role = await roleOf(uid);
  if (!role.admin) throw new HttpsError("permission-denied", "Studio Desk only.");
  const actor = { uid, name: "Studio Desk" };
  const reason = clean(data.reason, 1000);
  const needReason = () => { if (reason.length < 3) throw new HttpsError("invalid-argument", "Give a reason. Every decision is recorded."); };
  const action = String(data.action || "");

  if (action === "reviewResolution") {
    needReason();
    const ref = db().collection("attendanceRecords").doc(String(data.recordId || ""));
    const decision = data.decision === "approve" ? "approved" : "rejected";
    const finalStatus = ADMIN_STATUSES.indexOf(data.finalStatus) !== -1 ? data.finalStatus : null;
    return db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new HttpsError("not-found", "Record not found.");
      const r = s.data();
      const patch = { reviewState: decision, review: { decision, reason, by: uid, byName: actor.name, at: ts(now) }, updatedAt: FV().serverTimestamp() };
      if (decision === "rejected") {
        patch.status = finalStatus || "unaccounted";
        patch.corrections = FV().arrayUnion({ from: r.status, to: patch.status, reason: "Explanation rejected: " + reason, by: uid, byName: actor.name, at: ts(now) });
        if (patch.status === "absent" && !r.absenceConfirmedAt && r.status !== "absent") patch.absenceConfirmedAt = FV().serverTimestamp();
      }
      tx.update(ref, patch);
      audit(tx, { action: "review_resolution", recordId: ref.id, sessionId: r.sessionId, studentId: r.studentId, actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { status: r.status, reviewState: r.reviewState }, after: { status: patch.status || r.status, reviewState: decision } });
      return { ok: true };
    });
  }
  if (action === "correctRecord") {
    needReason();
    const to = String(data.status || "");
    if (ADMIN_STATUSES.indexOf(to) === -1) throw new HttpsError("invalid-argument", "Choose a valid attendance status.");
    const ref = db().collection("attendanceRecords").doc(String(data.recordId || ""));
    const res = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) throw new HttpsError("not-found", "Record not found.");
      const r = s.data();
      if (r.status === to) return { unchanged: true };
      const ses = await tx.get(db().collection("attendanceSessions").doc(r.sessionId));
      const submitted = ses.exists && ["submitted", "auto_submitted"].indexOf(ses.data().status) !== -1;
      const patch = {
        status: to, updatedAt: FV().serverTimestamp(),
        corrections: FV().arrayUnion({ from: r.status, to, reason, by: uid, byName: actor.name, at: ts(now) })
      };
      if (to === "absent" && submitted && !r.absenceConfirmedAt) patch.absenceConfirmedAt = FV().serverTimestamp();
      tx.update(ref, patch);
      if (submitted) tx.set(db().collection("attendanceAmendments").doc(), { sessionId: r.sessionId, recordId: ref.id, studentId: r.studentId, studentName: r.studentName, tutorIds: r.tutorIds || [], before: { status: r.status }, after: { status: to }, by: uid, byName: actor.name, reason, at: FV().serverTimestamp(), kind: "admin_correction" });
      audit(tx, { action: "correct_record", recordId: ref.id, sessionId: r.sessionId, studentId: r.studentId, actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { status: r.status }, after: { status: to } });
      return { r };
    });
    if (res.r && res.r.strikeId && to !== "late" && !res.r.strikeReversed) await reverseStrike(res.r.strikeId, actor, "Record corrected to " + (STATUS_LABEL[to] || to) + ": " + reason);
    return { ok: true };
  }
  if (action === "reverseStrike") { needReason(); return reverseStrike(String(data.strikeId || ""), actor, reason); }
  if (action === "decideReferral") {
    needReason();
    const status = ["open", "under_review", "action_taken", "closed"].indexOf(data.status) !== -1 ? data.status : "under_review";
    const ref = db().collection("attendanceReferrals").doc(String(data.referralId || ""));
    const s = await ref.get();
    if (!s.exists) throw new HttpsError("not-found", "Referral not found.");
    await ref.update({ status, decisions: FV().arrayUnion({ status, decision: clean(data.decision, 500), reason, by: uid, byName: actor.name, at: ts(now) }), updatedAt: FV().serverTimestamp() });
    await audit(null, { action: "referral_decision", studentId: s.data().studentId, actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { status, decision: clean(data.decision, 500) } });
    return { ok: true };
  }
  if (action === "overrideLock") {
    needReason();
    const ref = db().collection("attendanceLocks").doc(String(data.lockId || ""));
    const s = await ref.get();
    if (!s.exists) return { already: true };
    const lock = s.data();
    for (const sid of lock.sessionIds || []) await db().collection("attendanceSessions").doc(sid).update({ lockOverride: { by: uid, byName: actor.name, reason, at: ts(now) }, updatedAt: FV().serverTimestamp() });
    await ref.delete();
    await audit(null, { action: "lock_override", actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { lock: ref.id, sessionIds: lock.sessionIds || [] } });
    return { ok: true };
  }
  if (action === "cancelSession") {
    needReason();
    const session = await loadSession(data.sessionId);
    if (session.status === "cancelled") return { already: true };
    await db().collection("attendanceSessions").doc(session.id).update({ status: "cancelled", cancelled: { by: uid, byName: actor.name, reason, at: ts(now), previousStatus: session.status }, needsFollowUp: false, updatedAt: FV().serverTimestamp() });
    const recs = await db().collection("attendanceRecords").where("sessionId", "==", session.id).get();
    for (const d of recs.docs) if (d.data().strikeId && !d.data().strikeReversed) await reverseStrike(d.data().strikeId, actor, "Lesson cancelled: " + reason);
    await releaseLocks(session);
    await audit(null, { action: "session_cancelled", sessionId: session.id, actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { status: session.status } });
    return { ok: true };
  }
  if (action === "reviewExplanation") {
    needReason();
    const session = await loadSession(data.sessionId);
    const decision = data.decision === "accept" ? "accepted" : "rejected";
    await db().collection("attendanceSessions").doc(session.id).update({
      explanationReview: { decision, reason, by: uid, byName: actor.name, at: ts(now) },
      explanationRequired: decision !== "accepted", needsFollowUp: decision !== "accepted" || (session.unresolvedCount || 0) > 0, updatedAt: FV().serverTimestamp()
    });
    await audit(null, { action: "explanation_review", sessionId: session.id, actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { decision } });
    return { ok: true };
  }
  if (action === "closeFollowUp") {
    needReason();
    const session = await loadSession(data.sessionId);
    await db().collection("attendanceSessions").doc(session.id).update({ needsFollowUp: false, followUpClosed: { by: uid, byName: actor.name, reason, at: ts(now) }, updatedAt: FV().serverTimestamp() });
    await audit(null, { action: "follow_up_closed", sessionId: session.id, actorId: uid, actorRole: "admin", actorName: actor.name, reason });
    return { ok: true };
  }
  if (action === "decideRequest") {
    needReason();
    const ref = db().collection("attendanceRequests").doc(String(data.requestId || ""));
    const s = await ref.get();
    if (!s.exists) throw new HttpsError("not-found", "Request not found.");
    const q = s.data();
    if (q.status !== "pending") return { already: true };
    const approve = data.decision === "approve";
    await ref.update({ status: approve ? "approved" : "rejected", decision: { reason, by: uid, byName: actor.name, at: ts(now) } });
    if (approve) {
      const rec = await db().collection("attendanceRecords").doc(q.recordId).get();
      if (q.kind === "excuse_lateness" && rec.exists) {
        await rec.ref.update({ lateExcused: { reason, requestId: ref.id, by: uid, at: ts(now) }, updatedAt: FV().serverTimestamp() });
        if (rec.data().strikeId && !rec.data().strikeReversed) await reverseStrike(rec.data().strikeId, actor, "Excused lateness approved: " + reason);
      } else if (q.kind === "correction" && q.proposedStatus) {
        await adminAction(uid, { action: "correctRecord", recordId: q.recordId, status: q.proposedStatus, reason: "Correction request approved: " + reason }, now);
      }
    }
    await audit(null, { action: "request_decision", recordId: q.recordId, studentId: q.studentId, actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { decision: approve ? "approved" : "rejected", kind: q.kind } });
    return { ok: true };
  }
  if (action === "setPolicy") {
    needReason();
    const mode = String(data.strikeReset || "");
    if (RESET_MODES.indexOf(mode) === -1) throw new HttpsError("invalid-argument", "Choose how strike counts reset.");
    const month = Math.round(Number(data.yearStartMonth || YEAR_START_MONTH));
    if (!(month >= 1 && month <= 12)) throw new HttpsError("invalid-argument", "Choose the month the academic year starts.");
    const before = await loadPolicy(true);
    const next = Object.assign({}, before, { strikeReset: mode, yearStartMonth: month });
    await db().collection("attendanceSettings").doc("policy").set({ strikeReset: mode, yearStartMonth: month, manualEpoch: before.manualEpoch || 0, manualResetAt: before.manualResetAt || null,
      updatedAt: FV().serverTimestamp(), updatedBy: uid, history: FV().arrayUnion({ strikeReset: mode, yearStartMonth: month, reason, by: uid, at: ts(now) }) }, { merge: true });
    policyCache = null;
    const rebuilt = await rebuildStrikeCounts(next);
    await audit(null, { action: "policy_changed", actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { strikeReset: before.strikeReset, yearStartMonth: before.yearStartMonth }, after: { strikeReset: mode, yearStartMonth: month } });
    return { ok: true, rebuilt };
  }
  if (action === "resetStrikes") {
    needReason();
    const pol = await loadPolicy(true);
    if (pol.strikeReset !== "manual") throw new HttpsError("failed-precondition", "Counts reset by hand only under the policy 'Only when the Studio Desk resets'.");
    const epoch = (pol.manualEpoch || 0) + 1;
    await db().collection("attendanceSettings").doc("policy").set({ manualEpoch: epoch, manualResetAt: ts(now), updatedAt: FV().serverTimestamp(), updatedBy: uid,
      history: FV().arrayUnion({ reset: epoch, reason, by: uid, at: ts(now) }) }, { merge: true });
    policyCache = null;
    await audit(null, { action: "strikes_reset", actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { epoch } });
    return { ok: true, epoch };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
}

/* A tutor, the student or a parent asks the Studio Desk to correct a record or excuse a late arrival. */
async function makeRequest(uid, data) {
  const kind = data.kind === "excuse_lateness" ? "excuse_lateness" : "correction";
  const reason = clean(data.reason, 1000);
  if (reason.length < 5) throw new HttpsError("invalid-argument", "Explain the request.");
  const rec = await db().collection("attendanceRecords").doc(String(data.recordId || "")).get();
  if (!rec.exists) throw new HttpsError("not-found", "Record not found.");
  const r = rec.data();
  const role = await roleOf(uid);
  const link = await db().collection("parentStudentLinks").doc(uid + "_" + r.studentId).get();
  const who = role.admin ? "admin" : (role.tutor && (r.tutorIds || []).indexOf(uid) !== -1) ? "tutor" : uid === r.studentId ? "student" : link.exists ? "parent" : "";
  if (!who) throw new HttpsError("permission-denied", "You cannot ask about this record.");
  if (kind === "excuse_lateness" && !r.strikeId) throw new HttpsError("failed-precondition", "There is no late arrival on this record.");
  const proposedStatus = ADMIN_STATUSES.indexOf(data.proposedStatus) !== -1 ? data.proposedStatus : null;
  const ref = await db().collection("attendanceRequests").add({
    kind, reason, proposedStatus, recordId: rec.id, sessionId: r.sessionId, studentId: r.studentId, studentName: r.studentName, subjectName: r.subjectName, date: r.date,
    requestedBy: uid, requestedByRole: who, requestedByName: (role.tutor && role.tutor.name) || (role.student && role.student.name) || (who === "parent" ? "Parent" : "Studio Desk"),
    status: "pending", createdAt: FV().serverTimestamp()
  });
  await audit(null, { action: "request_made", recordId: rec.id, studentId: r.studentId, actorId: uid, actorRole: who, reason, after: { kind, proposedStatus } });
  return { ok: true, id: ref.id };
}

/* Tutor explains a missed submission (after an auto-submit). Earlier explanations are kept. */
async function explain(uid, data) {
  const role = await roleOf(uid);
  const session = await loadSession(data.sessionId);
  if (!mayRunRegister(role, session, uid)) throw new HttpsError("permission-denied", "This is not your register.");
  const text = clean(data.text, 2000);
  if (text.length < 5) throw new HttpsError("invalid-argument", "Write your explanation.");
  const row = { text, by: uid, byName: (role.tutor && role.tutor.name) || "Studio Desk", at: TS().now() };
  await db().collection("attendanceSessions").doc(session.id).update({ tutorExplanation: row, explanations: FV().arrayUnion(row), explanationReview: null, updatedAt: FV().serverTimestamp() });
  await audit(null, { action: "tutor_explanation", sessionId: session.id, actorId: uid, actorRole: "tutor", actorName: row.byName, reason: text });
  return { ok: true };
}

/* =========================================================
   Tutor attendance: the tutor confirms they are teaching the lesson
   (button, or face verification when the Studio Desk has enabled it).
   attendanceSessions.tutorPresence.{tutorId} = first confirmation, never
   overwritten; a later face match only adds faceVerifiedAt.
========================================================= */
async function recordTutorPresence(uid, sessionId, now, how) {
  how = how || {};
  const method = how.method === "face" ? "face" : "online";
  const role = await roleOf(uid);
  if (!role.tutor) throw new HttpsError("permission-denied", "Only the lesson's tutor can confirm they are teaching it.");
  const ref = db().collection("attendanceSessions").doc(String(sessionId || ""));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Register not found.");
    const s = snap.data();
    if ((s.tutorIds || []).indexOf(uid) === -1) throw new HttpsError("permission-denied", "This is not your lesson.");
    if (s.status === "cancelled") throw new HttpsError("failed-precondition", "This lesson was cancelled.");
    if (now < ms(s.startAt) - EARLY_CHECKIN_MIN * 60000) throw new HttpsError("failed-precondition", "You can confirm from " + EARLY_CHECKIN_MIN + " minutes before the start.");
    if (now >= ms(s.endAt)) throw new HttpsError("deadline-exceeded", "This lesson has ended.");
    const cur = (s.tutorPresence || {})[uid];
    const sim = how.similarity != null ? Math.round(how.similarity * 1000) / 1000 : null;
    if (cur) {
      if (method === "face" && !cur.faceVerifiedAt) {
        tx.update(ref, { ["tutorPresence." + uid + ".faceVerifiedAt"]: ts(now), ["tutorPresence." + uid + ".similarity"]: sim, updatedAt: FV().serverTimestamp() });
        audit(tx, { action: "tutor_face_verified", sessionId: ref.id, actorId: uid, actorRole: "tutor", actorName: role.tutor.name || "Tutor" });
        return { ok: true, already: true, faceVerified: true };
      }
      return { ok: true, already: true };
    }
    const c = classify(ms(s.startAt), now);
    const row = { at: ts(now), name: role.tutor.name || "Tutor", minutesLate: c.minutesLate, classification: c.late ? "late" : "on_time", method,
      faceVerifiedAt: method === "face" ? ts(now) : null, similarity: method === "face" ? sim : null };
    tx.update(ref, { ["tutorPresence." + uid]: row, tutorsPresent: FV().arrayUnion(uid), updatedAt: FV().serverTimestamp() });
    audit(tx, { action: "tutor_present", sessionId: ref.id, actorId: uid, actorRole: "tutor", actorName: row.name, after: { classification: row.classification, minutesLate: row.minutesLate, method } });
    return { ok: true, classification: row.classification, minutesLate: row.minutesLate, method };
  });
}

/* Policy change: recount every student's strikes under the new periods. Strike documents
   never change; only the counters in attendanceStudents are rebuilt. */
async function rebuildStrikeCounts(policy) {
  const snap = await db().collection("attendanceStrikes").get();
  const by = {};
  snap.forEach((d) => {
    const k = d.data();
    let per = strikePeriod(policy, ms(k.startAt));
    if (policy.strikeReset === "manual" && policy.manualResetAt && ms(k.createdAt || k.checkInAt) < ms(policy.manualResetAt)) per = { key: "m" + Math.max(0, (policy.manualEpoch || 0) - 1), label: "Before the last reset" };
    const b = by[k.studentId] = by[k.studentId] || { name: k.studentName, years: {} };
    const y = b.years[per.key] = b.years[per.key] || { active: 0, total: 0, reversed: 0, label: per.label };
    y.total++; if (k.status === "active") y.active++; else y.reversed++;
  });
  let batch = db().batch(), n = 0;
  for (const id of Object.keys(by)) {
    batch.set(db().collection("attendanceStudents").doc(id), { studentId: id, studentName: by[id].name || "", years: by[id].years, countsRebuiltAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
    if (++n % 400 === 0) { await batch.commit(); batch = db().batch(); }
  }
  await batch.commit();
  return { students: Object.keys(by).length, strikes: snap.size };
}

/* =========================================================
   The sweep (every 5 minutes): prepare registers, flag students
   who have not registered after the grace period, lock subjects
   with an overdue register, auto-submit, retry failed emails.
   Every step is idempotent, so overlapping runs are harmless.
========================================================= */
async function sweep(now) {
  const out = { prepared: 0, flagged: 0, locked: 0, autoSubmitted: 0, cancelled: 0, retried: 0 };
  const day = nairobiParts(now);
  const entries = await entriesForDay(day.dow);
  const byId = {};
  entries.forEach((e) => { byId[e.id] = e; });
  for (const e of entries) {
    const occ = occurrence(e, day.ymd);
    if (occ && now >= occ.startAt - PREPARE_MIN * 60000 && now <= occ.endAt) { await ensureSession(e.id, e, day.ymd); out.prepared++; }
  }
  const open = await db().collection("attendanceSessions").where("status", "==", "open").get();
  for (const d of open.docs) {
    const s = Object.assign({ id: d.id }, d.data());
    // Removed from the timetable before anyone registered: the lesson was cancelled.
    if (s.date === day.ymd && !byId[s.entryId]) {
      const entry = await db().collection("timetableEntries").doc(s.entryId).get();
      if (!entry.exists && !(s.counts && s.counts.checkedIn)) {
        await d.ref.update({ status: "cancelled", cancelled: { by: "system", byName: "System", reason: "Removed from the timetable", at: ts(now), previousStatus: "open" }, updatedAt: FV().serverTimestamp() });
        await releaseLocks(s); out.cancelled++; continue;
      }
      if (!entry.exists && !s.scheduleChanged) await d.ref.update({ scheduleChanged: true, updatedAt: FV().serverTimestamp() });
    }
    if (now >= ms(s.graceAt) && !s.flaggedAt) {
      const exp = await db().collection("attendanceRecords").where("sessionId", "==", s.id).where("status", "==", "expected").get();
      const b = db().batch();
      exp.forEach((r) => b.update(r.ref, { status: "unaccounted", flaggedAt: ts(now), updatedAt: FV().serverTimestamp() }));
      b.update(d.ref, { flaggedAt: ts(now), updatedAt: FV().serverTimestamp() });
      await b.commit();
      out.flagged += exp.size;
    }
    if (now >= ms(s.endAt) + AUTO_SUBMIT_AFTER_END_MIN * 60000) {
      const r = await submitRegister(s.id, { method: "auto", now });
      if (!r.already) out.autoSubmitted++;
    } else if (now >= ms(s.endAt) && !s.lockOverride) {
      for (const tid of s.tutorIds || []) {
        await db().collection("attendanceLocks").doc(tid + "_" + s.subjectId).set({
          tutorId: tid, tutorName: String(s.tutorName || "").split(", ")[(s.tutorIds || []).indexOf(tid)] || s.tutorName || "", subjectId: s.subjectId, subjectName: s.subjectName, sessionIds: FV().arrayUnion(s.id),
          since: ts(ms(s.endAt)), autoSubmitAt: ts(ms(s.endAt) + AUTO_SUBMIT_AFTER_END_MIN * 60000), updatedAt: FV().serverTimestamp()
        }, { merge: true });
        out.locked++;
      }
      if (!s.lockedAt) await d.ref.update({ lockedAt: ts(now) });
    }
  }
  const failed = await db().collection("attendanceNotifications").where("emailStatus", "in", ["failed", "pending"]).limit(100).get();
  for (const n of failed.docs) {
    const x = n.data();
    if (x.emailStatus === "pending" && ms(x.createdAt) > now - 5 * 60000) continue;  // the create trigger is still on it
    const r = await deliver(n.id);
    if (!r.skipped) out.retried++;
  }
  return out;
}

/* =========================================================
   Exports
========================================================= */
const CALL = { cors: true, region: W.LOCATION };
const wrap = (fn) => async (request) => {
  try { return await fn(request); } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("attendance", e);
    throw new HttpsError("internal", "Attendance could not be saved. Please try again.");
  }
};
exports.attendanceToday = onCall(CALL, wrap(async (request) => todayFor(requireAuth(request), Date.now())));
exports.attendanceCheckIn = onCall(CALL, wrap(async (request) => checkIn(requireAuth(request), (request.data || {}).entryId, Date.now())));
// { warm: true } only wakes the instance so the tutor's first tap is not a cold start.
exports.attendanceResolve = onCall(CALL, wrap(async (request) => {
  const uid = requireAuth(request);
  if ((request.data || {}).warm) return { ok: true, warm: true };
  return resolveStudent(uid, request.data || {}, Date.now());
}));
exports.attendanceSubmit = onCall(CALL, wrap(async (request) => {
  const uid = requireAuth(request);
  if ((request.data || {}).warm) return { ok: true, warm: true };
  const [role, session] = await Promise.all([roleOf(uid), loadSession((request.data || {}).sessionId)]);
  if (!mayRunRegister(role, session, uid)) throw new HttpsError("permission-denied", "This is not your register.");
  if (Date.now() < ms(session.graceAt)) throw new HttpsError("failed-precondition", "You can submit once the " + GRACE_MIN + "-minute grace period is over.");
  return submitRegister(session.id, { method: "manual", uid, name: (role.tutor && role.tutor.name) || "Studio Desk", now: Date.now() });
}));
exports.attendanceTutorCheckIn = onCall(CALL, wrap(async (request) => recordTutorPresence(requireAuth(request), (request.data || {}).sessionId, Date.now(), { method: "online" })));
exports.attendanceExplain = onCall(CALL, wrap(async (request) => explain(requireAuth(request), request.data || {})));
exports.attendanceRequest = onCall(CALL, wrap(async (request) => makeRequest(requireAuth(request), request.data || {})));
exports.attendanceAdmin = onCall(CALL, wrap(async (request) => adminAction(requireAuth(request), request.data || {}, Date.now())));
exports.attendanceSweep = onSchedule({ schedule: "every 5 minutes", region: W.LOCATION, timeZone: W.TIME_ZONE, secrets: W.SMTP_SECRETS, timeoutSeconds: 300, memory: "512MiB" },
  async () => { const r = await sweep(Date.now()); console.log("attendanceSweep", JSON.stringify(r)); });
exports.onAttendanceStrikeCreated = onDocumentCreated({ document: "attendanceStrikes/{id}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  async (event) => { const s = event.data && event.data.data(); if (s) await noticeStrike(s, event.params.id); });
exports.onAttendanceRecordUpdated = onDocumentUpdated({ document: "attendanceRecords/{id}", region: W.LOCATION },
  async (event) => {
    const b = event.data.before.data() || {}, a = event.data.after.data() || {};
    if (a.absenceConfirmedAt && !b.absenceConfirmedAt && a.status === "absent") await noticeAbsence(a, event.params.id);
  });
exports.onAttendanceNotificationCreated = onDocumentCreated({ document: "attendanceNotifications/{id}", region: W.LOCATION, secrets: W.SMTP_SECRETS },
  async (event) => { if (event.data && event.data.data().emailStatus === "pending") await deliver(event.params.id); });

exports._internals = {
  GRACE_MIN, AUTO_SUBMIT_AFTER_END_MIN, WARNING_AT, REFERRAL_AT, STATUS_LABEL, TUTOR_OUTCOMES, EARLY_CHECKIN_MIN,
  loadPolicy, strikePeriod, recordTutorPresence, rebuildStrikeCounts, roleOf, loadSession, audit, wrap, CALL, requireAuth,
  resetPolicyCache: () => { policyCache = null; },
  nairobiParts, atNairobi, occurrence, classify, academicYearOf, tutorCovers, studentTakes,
  ensureSession, todayFor, checkIn, resolveStudent, submitRegister, sweep, adminAction, makeRequest, explain,
  reverseStrike, noticeStrike, noticeAbsence, deliver, queueNotice
};
