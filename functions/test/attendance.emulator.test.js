/* Attendance engine against the Firestore emulator (real transactions, queries, server timestamps).
 *   firebase emulators:exec --only firestore "cd functions && node --test test/attendance.emulator.test.js"
 * Skipped under plain `npm test` (no emulator). */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-attendance-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const HAVE = !!process.env.FIRESTORE_EMULATOR_HOST;
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const W = require("../work-shared");
const A = require("../attendance")._internals;
const SUB = require("../subjects")._internals;
const db = () => admin.firestore();
const MIN = 60000;

// A fixed Thursday in term time and its Nairobi weekday.
const DAY = "2026-11-05";
const DOW = A.nairobiParts(Date.parse(DAY + "T12:00:00+03:00")).dow;
const at = (hm) => A.atNairobi(DAY, hm);

const sent = [];
W.sendEmail = async (to, subject) => { if (/fail/.test(to)) return { sent: false, reason: "mailbox unavailable" }; sent.push({ to, subject }); return { sent: true }; };

async function wipe() {
  const cols = ["timetableEntries", "students", "tutorAccounts", "admins", "parentAccounts", "parentStudentLinks", "attendanceSessions", "attendanceRecords",
    "attendanceSubmissions", "attendanceAmendments", "attendanceStrikes", "attendanceStudents", "attendanceReferrals", "attendanceNotifications",
    "attendanceLocks", "attendanceAudit", "attendanceRequests", "personalNotifications", "classrooms", "lmsSettings", "subjectRenames"];
  for (const c of cols) {
    const s = await db().collection(c).get();
    await Promise.all(s.docs.map((d) => db().recursiveDelete ? db().recursiveDelete(d.ref) : d.ref.delete()));
  }
}
async function seed() {
  await wipe();
  const set = (p, d) => db().doc(p).set(d);
  await set("admins/desk", { name: "Desk", email: "desk@example.com" });
  await set("tutorAccounts/t1", { name: "Tess Tutor", status: "Active", teaching: [{ keyStage: "KS4", subjectId: "mathematics", boards: ["cambridge"] }, { keyStage: "KS4", subjectId: "physics", boards: ["cambridge"] }] });
  await set("tutorAccounts/t2", { name: "Other Tutor", status: "Active", teaching: [{ keyStage: "KS4", subjectId: "biology", boards: ["cambridge"] }] });
  await set("students/ann", { name: "Ann", email: "ann@example.com", status: "Active", keyStage: "KS4", subjects: ["mathematics", "physics"] });
  await set("students/ben", { name: "Ben", email: "ben@example.com", status: "Active", keyStage: "KS4", subjects: ["mathematics", "physics"] });
  await set("students/cal", { name: "Cal", status: "Active", keyStage: "KS4" });                                         // no subjects saved: whole Key Stage
  await set("students/rem", { name: "Remote Rae", status: "Active", keyStage: "KS4", subjects: ["mathematics"], studentType: "remote" });
  await set("students/edx", { name: "Edexcel Ed", status: "Active", keyStage: "KS4", subjects: ["mathematics"], board: "edexcel" });
  await set("students/pen", { name: "Pending Pat", status: "Pending", keyStage: "KS4", subjects: ["mathematics"] });
  await set("parentAccounts/pa", { name: "Pat Parent", email: "pat@example.com" });
  await set("parentStudentLinks/pa_ann", { parentUid: "pa", studentUid: "ann" });
  await set("parentAccounts/pb", { name: "Bea Parent", email: "fail@example.com" });
  await set("parentStudentLinks/pb_ben", { parentUid: "pb", studentUid: "ben" });
  await set("timetableEntries/maths", { dayOfWeek: DOW, startTime: "09:00", endTime: "10:00", keyStage: "KS4", subjectId: "mathematics", subjectName: "Mathematics", board: "cambridge", tutorId: null, room: "" });
  await set("timetableEntries/phys", { dayOfWeek: DOW, startTime: "11:00", endTime: "12:00", keyStage: "KS4", subjectId: "physics", subjectName: "Physics", board: "cambridge", tutorId: "t1", tutorName: "Tess Tutor" });
  sent.length = 0;
}
const rec = async (sid, uid) => (await db().doc("attendanceRecords/" + sid + "_" + uid).get()).data();
const notices = async (kind) => (await db().collection("attendanceNotifications").where("kind", "==", kind).get()).docs.map((d) => d.data());
const strike = async (id) => { const s = await db().doc("attendanceStrikes/" + id).get(); return s.exists ? s.data() : null; };
const flush = async () => { const s = await db().collection("attendanceStrikes").get(); for (const d of s.docs) await A.noticeStrike(d.data(), d.id); };
const maths = "maths_" + DAY, phys = "phys_" + DAY;

test("lateness: 14:59 after the start is on time, exactly 15:00 is late", () => {
  const s = at("09:00");
  assert.deepEqual(A.classify(s, s + 14 * MIN + 59000), { late: false, minutesLate: 14 });
  assert.deepEqual(A.classify(s, s + 15 * MIN), { late: true, minutesLate: 15 });
  assert.equal(A.academicYearOf(Date.parse("2026-08-31T12:00:00+03:00")).key, "y2025");
  assert.equal(A.academicYearOf(Date.parse("2026-09-01T00:30:00+03:00")).key, "y2026");
});

test("registers: built once from the timetable, right students and tutor", { skip: !HAVE }, async () => {
  await seed();
  const entry = Object.assign({ id: "maths" }, (await db().doc("timetableEntries/maths").get()).data());
  await Promise.all([A.ensureSession("maths", entry, DAY), A.ensureSession("maths", entry, DAY), A.ensureSession("maths", entry, DAY)]);
  const s = (await db().doc("attendanceSessions/" + maths).get()).data();
  assert.deepEqual(s.studentIds.slice().sort(), ["ann", "ben", "cal"], "online, active, right board; no remote, pending or Edexcel students");
  assert.deepEqual(s.tutorIds, ["t1"], "no named tutor: every tutor who covers KS4 Mathematics (Cambridge)");
  assert.equal((await db().collection("attendanceRecords").where("sessionId", "==", maths).get()).size, 3);
  assert.equal((await rec(maths, "ann")).status, "expected");
});

test("check-in: server time, on time vs late, one strike per lesson, retries are harmless", { skip: !HAVE }, async () => {
  await seed();
  await assert.rejects(A.checkIn("ann", "maths", at("08:45")), /opens 10 minutes/);
  await assert.rejects(A.checkIn("rem", "maths", at("09:01")), /not enrolled/);
  await assert.rejects(A.checkIn("t1", "maths", at("09:01")), /Only students/);
  const ok = await A.checkIn("ann", "maths", at("09:14") + 59000);
  assert.equal(ok.record.status, "present"); assert.equal(ok.strikeNumber, null);
  const late = await A.checkIn("ben", "maths", at("09:15"));
  assert.equal(late.record.status, "late"); assert.equal(late.record.checkIn.minutesLate, 15); assert.equal(late.strikeNumber, 1);
  const again = await A.checkIn("ben", "maths", at("09:20"));
  assert.equal(again.already, true, "duplicate registration returns the first one");
  assert.equal((await rec(maths, "ben")).checkIn.minutesLate, 15, "original timestamp kept");
  const sum = (await db().doc("attendanceStudents/ben").get()).data();
  assert.equal(sum.years.y2026.active, 1);
  const s = (await db().doc("attendanceSessions/" + maths).get()).data();
  assert.deepEqual(s.counts, { checkedIn: 2, present: 1, late: 1 });
  await assert.rejects(A.checkIn("cal", "maths", at("10:00")), /ended/);
  // Late parent notice goes out immediately (strike trigger), once.
  await flush(); await flush();
  const n = await notices("late");
  assert.equal(n.length, 1); assert.equal(n[0].recipientId, "pb"); assert.match(n[0].message, /15 minutes after the 09:00 start/);
});

test("strikes accumulate across subjects: 4th = formal warning, 5th = referral, no duplicates", { skip: !HAVE }, async () => {
  await seed();
  const days = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"];
  // Four late physics/maths lessons on four Thursdays, then a fifth.
  let n = 0;
  for (const d of days) {
    for (const [eid, start] of [["maths", "09:00"], ["phys", "11:00"]]) {
      if (n >= 5) break;
      const t = A.atNairobi(d, start) + 20 * MIN;
      await A.checkIn("ann", eid, t); n++;
    }
  }
  const sum = (await db().doc("attendanceStudents/ann").get()).data();
  assert.equal(sum.years.y2026.active, 5);
  await flush(); await flush();
  assert.equal((await notices("strike4_student")).length, 1);
  assert.equal((await notices("strike4_parent")).length, 1);
  assert.equal((await notices("referral_admin")).length, 1);
  assert.equal((await notices("referral_parent")).length, 1);
  assert.equal((await db().collection("attendanceReferrals").get()).size, 1);
  assert.equal((await notices("late")).length, 5, "a late notice for every late arrival");
  const bells = await db().collection("personalNotifications").where("recipientId", "==", "pa").get();
  assert.equal(bells.size, 5 + 1 + 1, "bell for each notice, never doubled");
});

test("tutor accounts for students, submits; absence notice only once it is final", { skip: !HAVE }, async () => {
  await seed();
  await A.checkIn("ann", "maths", at("09:05"));
  await assert.rejects(A.resolveStudent("t2", { sessionId: maths, studentId: "ben", outcome: "absent" }, at("09:20")), /not your register/);
  await assert.rejects(A.resolveStudent("t1", { sessionId: maths, studentId: "ben", outcome: "other", note: "" }, at("09:20")), /reason/);
  await assert.rejects(A.resolveStudent("t1", { sessionId: maths, studentId: "ann", outcome: "absent" }, at("09:20")), /registered themselves/);
  await assert.rejects(A.submitRegister(maths, { method: "manual", uid: "t1", name: "Tess", now: at("09:30") }), /Account for every student first: Ben, Cal/);
  await A.resolveStudent("t1", { sessionId: maths, studentId: "ben", outcome: "absent", note: "" }, at("09:20"));
  const r2 = await A.resolveStudent("t1", { sessionId: maths, studentId: "cal", outcome: "connectivity", note: "Camera froze, joined by phone" }, at("09:21"));
  assert.equal(r2.status, "connectivity");
  assert.equal((await rec(maths, "ben")).absenceConfirmedAt, null, "not final before submission");
  const sub = await A.submitRegister(maths, { method: "manual", uid: "t1", name: "Tess", now: at("09:40") });
  assert.equal(sub.status, "submitted");
  assert.equal((await A.submitRegister(maths, { method: "manual", uid: "t1", name: "Tess", now: at("09:41") })).already, true);
  const ben = await rec(maths, "ben");
  assert.ok(ben.absenceConfirmedAt); assert.equal(ben.resolution.byName, "Tess Tutor");
  const snap = (await db().doc("attendanceSubmissions/" + maths).get()).data();
  assert.equal(snap.method, "manual"); assert.equal(snap.manualSubmission, true); assert.equal(snap.submittedBy, "t1");
  await A.noticeAbsence(ben, maths + "_ben"); await A.noticeAbsence(ben, maths + "_ben");
  assert.equal((await notices("absent")).length, 1);
  // Email delivery: a failing mailbox is tracked and retried, the portal copy stays.
  const n = (await db().collection("attendanceNotifications").where("kind", "==", "absent").get()).docs[0];
  await A.deliver(n.id);
  let d = (await n.ref.get()).data();
  assert.equal(d.emailStatus, "failed"); assert.equal(d.attempts, 1); assert.match(d.lastError, /mailbox/);
  await n.ref.update({ email: "bea@example.com", nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000) });
  await A.deliver(n.id);
  d = (await n.ref.get()).data();
  assert.equal(d.emailStatus, "sent"); assert.equal(d.attempts, 2);
  await A.deliver(n.id);
  assert.equal(sent.filter((x) => x.to === "bea@example.com").length, 1, "never sent twice");
});

test("auto-submit: keeps registrations, leaves the unaccounted unresolved, tells the Studio Desk once", { skip: !HAVE }, async () => {
  await seed();
  await A.checkIn("ann", "maths", at("09:02"));
  await A.checkIn("ben", "maths", at("09:31"));
  await A.sweep(at("09:16"));
  assert.equal((await rec(maths, "cal")).status, "unaccounted", "flagged after the grace period, not absent");
  await A.sweep(at("10:05"));
  assert.ok((await db().doc("attendanceLocks/t1_mathematics").get()).exists, "Mathematics paused for the tutor after the lesson");
  assert.ok(!(await db().doc("attendanceLocks/t1_physics").get()).exists, "other subjects are not locked");
  const r1 = await A.sweep(at("10:16"));
  const r2 = await A.sweep(at("10:21"));
  assert.equal(r1.autoSubmitted, 1); assert.equal(r2.autoSubmitted, 0);
  const s = (await db().doc("attendanceSessions/" + maths).get()).data();
  assert.equal(s.status, "auto_submitted"); assert.equal(s.submission.manualSubmission, false); assert.equal(s.explanationRequired, true); assert.equal(s.unresolvedCount, 1);
  assert.ok(!(await db().doc("attendanceLocks/t1_mathematics").get()).exists, "lock lifted once auto-submitted");
  const snap = (await db().doc("attendanceSubmissions/" + maths).get()).data();
  assert.equal(snap.method, "auto");
  assert.deepEqual(snap.rows.map((r) => [r.studentId, r.status]).sort(), [["ann", "present"], ["ben", "late"], ["cal", "unaccounted"]]);
  assert.equal((await rec(maths, "ben")).checkIn.minutesLate, 31);
  assert.equal((await rec(maths, "cal")).absenceConfirmedAt, null);
  assert.equal((await notices("auto_submit_admin")).length, 1);
  // Follow-up after the auto-submit: recorded separately, the snapshot is untouched.
  await A.resolveStudent("t1", { sessionId: maths, studentId: "cal", outcome: "absent", note: "Confirmed with parent" }, at("11:00"));
  const am = await db().collection("attendanceAmendments").where("sessionId", "==", maths).get();
  assert.equal(am.size, 1);
  assert.ok((await rec(maths, "cal")).absenceConfirmedAt, "a follow-up absence is a confirmed outcome");
  assert.equal((await db().doc("attendanceSubmissions/" + maths).get()).data().rows.filter((r) => r.studentId === "cal")[0].status, "unaccounted");
  await A.explain("t1", { sessionId: maths, text: "Internet dropped at the end of the lesson." });
  assert.match((await db().doc("attendanceSessions/" + maths).get()).data().tutorExplanation.text, /Internet/);
});

test("Studio Desk: correction reverses the strike with a reason; cancelled lessons; audit trail", { skip: !HAVE }, async () => {
  await seed();
  await A.checkIn("ben", "maths", at("09:20"));
  await assert.rejects(A.adminAction("t1", { action: "correctRecord" }, at("09:30")), /Studio Desk only/);
  await assert.rejects(A.adminAction("desk", { action: "correctRecord", recordId: maths + "_ben", status: "present", reason: "" }, at("09:30")), /reason/);
  await A.adminAction("desk", { action: "correctRecord", recordId: maths + "_ben", status: "present", reason: "Tutor's link was broken" }, at("09:30"));
  const ben = await rec(maths, "ben");
  assert.equal(ben.status, "present"); assert.equal(ben.checkIn.classification, "late", "original classification preserved");
  assert.equal(ben.corrections.length, 1); assert.equal(ben.corrections[0].from, "late");
  assert.equal((await strike(maths + "_ben")).status, "reversed");
  assert.equal((await db().doc("attendanceStudents/ben").get()).data().years.y2026.active, 0);
  const audit = await db().collection("attendanceAudit").where("recordId", "==", maths + "_ben").get();
  assert.deepEqual(audit.docs.map((d) => d.data().action).sort(), ["check_in", "correct_record", "strike_reversed"]);
  // A lesson taken off the timetable before anyone registered is cancelled, not auto-submitted.
  await A.sweep(at("10:45"));
  await db().doc("timetableEntries/phys").delete();
  await A.sweep(at("11:20"));
  assert.equal((await db().doc("attendanceSessions/" + phys).get()).data().status, "cancelled");
});

test("renaming a subject updates the name everywhere it is stored", { skip: !HAVE }, async () => {
  await seed();
  await db().doc("classrooms/c1").set({ subjectId: "mathematics", subjectName: "Mathematics", keyStage: "KS4" });
  await db().doc("classrooms/c1/topics/t1/assignments/a1").set({ title: "HW1", subjectName: "Mathematics" });
  await db().doc("students/ann").update({ subjectNames: ["Mathematics", "Physics"] });
  await assert.rejects(SUB.renameSubject("t1", { subjectId: "mathematics", name: "Maths" }), /Studio Desk only/);
  const r = await SUB.renameSubject("desk", { subjectId: "mathematics", name: "Pure Mathematics", currentName: "Mathematics" });
  assert.equal(r.ok, true);
  assert.equal((await db().doc("timetableEntries/maths").get()).data().subjectName, "Pure Mathematics");
  assert.equal((await db().doc("timetableEntries/phys").get()).data().subjectName, "Physics");
  assert.equal((await db().doc("classrooms/c1").get()).data().subjectName, "Pure Mathematics");
  assert.equal((await db().doc("classrooms/c1/topics/t1/assignments/a1").get()).data().subjectName, "Pure Mathematics");
  assert.deepEqual((await db().doc("students/ann").get()).data().subjectNames, ["Pure Mathematics", "Physics"]);
  assert.equal((await db().doc("lmsSettings/subjects").get()).data().names.mathematics, "Pure Mathematics");
  assert.equal((await db().collection("subjectRenames").get()).size, 1);
});
