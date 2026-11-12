/* Facial recognition gates and matching, tutor attendance and the strike reset policy, against the Firestore emulator.
 *   firebase emulators:exec --only firestore "node --test functions/test/face.emulator.test.js"
 * Browsers send 128-number face descriptors (face-api.js). Here the descriptors are
 * synthetic vectors: one fixed point per "person" plus small noise per frame. They test
 * what Paisley does with descriptors; they are never used outside these tests.
 * Skipped without the emulator. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-attendance-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const HAVE = !!process.env.FIRESTORE_EMULATOR_HOST;
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const W = require("../work-shared");
W.sendEmail = async () => ({ sent: true });
const A = require("../attendance")._internals;
const FR = require("../face-recognition")._internals;
const db = () => admin.firestore();

// A lesson that started 5 minutes ago (Nairobi), so check-ins are on time and open.
const NOW = Date.now();
const day = A.nairobiParts(NOW);
const start = A.nairobiParts(NOW - 5 * 60000);
const SAME_DAY = start.ymd === day.ymd && A.nairobiParts(NOW + 60 * 60000).ymd === day.ymd;
const endHm = A.nairobiParts(NOW + 55 * 60000).hm;
const SID = "face_" + day.ymd;

// Deterministic pseudo-random "faces" with norm about 1, like face-api descriptors.
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
function person(seed) { const r = rng(seed); const v = Array.from({ length: 128 }, () => r() - 0.5); const n = Math.hypot(...v); return v.map((x) => x / n); }
function frame(base, seed, noise) { const r = rng(seed); return base.map((x) => x + (r() - 0.5) * (noise == null ? 0.04 : noise)); }
const ANN = person(1), BEN = person(2), TESS = person(3);
let seedN = 100;
const frames = (base, noise) => [frame(base, seedN++, noise), frame(base, seedN++, noise), frame(base, seedN++, noise)];

async function wipe() {
  for (const c of ["timetableEntries", "students", "tutorAccounts", "admins", "parentAccounts", "parentStudentLinks", "attendanceSessions", "attendanceRecords",
    "attendanceStrikes", "attendanceStudents", "attendanceAudit", "attendanceSettings", "faceProfiles", "faceTemplates", "faceAttempts", "personalNotifications", "attendanceNotifications", "attendanceReferrals"]) {
    const s = await db().collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
}
async function seed() {
  await wipe();
  const set = (p, d) => db().doc(p).set(d);
  await set("admins/desk", { name: "Desk" });
  await set("tutorAccounts/t1", { name: "Tess", status: "Active", teaching: [{ keyStage: "KS4", subjectId: "mathematics", boards: ["cambridge"] }] });
  await set("students/ann", { name: "Ann", status: "Active", keyStage: "KS4", subjects: ["mathematics"] });
  await set("students/ben", { name: "Ben", status: "Active", keyStage: "KS4", subjects: ["mathematics"] });
  await set("parentAccounts/pa", { name: "Pat" });
  await set("parentStudentLinks/pa_ann", { parentUid: "pa", studentUid: "ann" });
  await set("timetableEntries/face", { dayOfWeek: day.dow, startTime: start.hm, endTime: endHm, keyStage: "KS4", subjectId: "mathematics", subjectName: "Mathematics", board: "cambridge", tutorId: "t1", tutorName: "Tess" });
  A.resetPolicyCache();
}
async function enable(students) {
  await FR.adminAction("desk", { action: "status", status: "enabled", reason: "pilot" });
  if (students) await FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "DPIA-1", reason: "approved by board" });
}
async function enrolAnn() {
  await FR.adminAction("desk", { action: "consent", personType: "student", personId: "ann", decision: "granted", givenBy: "Pat Parent", relationship: "parent", method: "signed_form", reason: "form 12" });
  await FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", descriptors: [frame(ANN, 1), frame(ANN, 2)] });
}
const rec = async (uid) => { const s = await db().doc("attendanceRecords/" + SID + "_" + uid).get(); return s.exists ? s.data() : null; };
const lastAttempt = async () => (await db().collection("faceAttempts").get()).docs.map((d) => d.data()).sort((a, b) => (b.at ? b.at.toMillis() : 0) - (a.at ? a.at.toMillis() : 0))[0];
const reason = (e) => e && e.details && e.details.reason;
const resetRate = () => db().doc("faceProfiles/ann").update({ attemptTimes: [] });

test("synthetic faces behave like descriptors: same person close, different people far", () => {
  assert.ok(FR.dist(frame(ANN, 5), frame(ANN, 6)) < 0.3);
  assert.ok(FR.dist(ANN, BEN) > 1);
  assert.equal(FR.vec(new Array(128).fill(0)), null);
  assert.equal(FR.vec(ANN.slice(0, 64)), null);
});

test("templates are sealed with AES-256-GCM when FACE_TEMPLATE_KEY is set", () => {
  process.env.FACE_TEMPLATE_KEY = "a".repeat(64);
  const sealed = FR.seal([ANN]);
  assert.equal(sealed.enc, true);
  assert.ok(!sealed.data.includes(String(ANN[0]).slice(0, 6)));
  assert.deepEqual(FR.open(sealed), [ANN]);
  delete process.env.FACE_TEMPLATE_KEY;
  assert.throws(() => FR.open(sealed), /FACE_TEMPLATE_KEY/);
});

test("disabled: nothing is offered and face check-in is refused (normal check-in still works)", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(ANN) }), (e) => reason(e) === "disabled");
  const t = await A.todayFor("ann", Date.now());
  assert.deepEqual(t.recognition, { available: false });
  const r = await A.checkIn("ann", "face", Date.now());
  assert.equal(r.record.status, "present");
  assert.equal(r.record.checkIn.method, "online");
});

test("students stay off until the DPIA is recorded; enrollment needs consent and one person's photos", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  await enable(false);
  await assert.rejects(FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", descriptors: [ANN] }), /Impact Assessment/);
  await assert.rejects(FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "", reason: "x y z" }), /Impact Assessment/);
  await FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "DPIA-1", reason: "approved" });
  await assert.rejects(FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", descriptors: [ANN] }), /consent/i);
  await assert.rejects(FR.adminAction("desk", { action: "consent", personType: "student", personId: "ann", decision: "granted", givenBy: "Ann", relationship: "friend", reason: "x y z" }), /parent or guardian/);
  await FR.adminAction("desk", { action: "consent", personType: "student", personId: "ann", decision: "granted", givenBy: "Pat", relationship: "parent", reason: "form" });
  await assert.rejects(FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", descriptors: [ANN, BEN] }), /same person/);
  await enrolAnn();
  assert.equal((await FR.availabilityFor("ann", "student")).available, true);
  assert.equal((await FR.availabilityFor("ben", "student")).available, false);
  const prof = (await db().doc("faceProfiles/ann").get()).data();
  assert.equal(prof.descriptors, undefined, "no descriptor on the admin-readable profile");
  assert.ok((await db().doc("faceTemplates/ann").get()).exists);
  await assert.rejects(FR.adminAction("t1", { action: "status", status: "enabled", reason: "tutor tries" }), /Studio Desk only/);
});

test("the student's own face registers them, by face, once", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  const r = await FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(ANN) });
  assert.equal(r.recognised, true);
  const x = await rec("ann");
  assert.equal(x.status, "present");
  assert.equal(x.checkIn.method, "face");
  assert.ok(x.checkIn.faceDistance < 0.5);
  assert.equal((await lastAttempt()).result, "matched");
  const again = await FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(ANN) });
  assert.equal(again.already, true);
});

test("someone else's face, copied frames, replays, unsteady or junk frames: refused, nothing recorded", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  const used = frames(ANN);
  const same = frame(ANN, 999);
  const cases = [
    [frames(BEN), "no_match"],                               // Ben's face on Ann's account
    [[same, same, same], "replay"],                          // one vector copied three times
    [[ANN.map((x) => x * 0), ANN, ANN], "bad_frames"],       // junk
    [[frame(ANN, 7), frame(BEN, 8), frame(ANN, 9)], "inconsistent"],
    [frames(ANN).slice(0, 2), "bad_frames"]                  // too few frames
  ];
  for (const [descs, want] of cases) {
    await resetRate();
    await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: descs }), (e) => reason(e) === want, want);
    assert.equal((await lastAttempt()).result, want, want);
  }
  assert.ok(!((await rec("ann")) || {}).checkIn, "no check-in from a refused attempt");
  const prof = (await db().doc("faceProfiles/ann").get()).data();
  assert.ok(prof.attention, "repeated failures flag the profile");
  // A genuine set works, and sending the exact same numbers again is a replay.
  await resetRate();
  await FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: used });
  await db().doc("attendanceRecords/" + SID + "_ann").update({ checkIn: null, status: "expected" });
  await resetRate();
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: used }), (e) => reason(e) === "replay");
});

test("too many attempts fall back; suspending stops attempts at once and is audited", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  for (let i = 0; i < 8; i++) await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(BEN) }));
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(ANN) }), (e) => reason(e) === "rate_limited");
  await resetRate();
  await FR.adminAction("desk", { action: "status", status: "suspended", reason: "incident" });
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", descriptors: frames(ANN) }), (e) => reason(e) === "disabled");
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  const audit = (await db().collection("attendanceAudit").where("area", "==", "recognition").get()).docs.map((d) => d.data().action);
  assert.ok(audit.includes("recognition_enabled") && audit.includes("recognition_suspended"));
});

test("parent withdraws consent: face data deleted, option gone", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  await assert.rejects(FR.consentCall("pa", { action: "withdraw", studentId: "ben" }), /own child/);
  const r = await FR.consentCall("pa", { action: "withdraw", studentId: "ann" });
  assert.equal(r.consent, "withdrawn");
  assert.equal((await db().doc("faceTemplates/ann").get()).exists, false);
  assert.equal((await db().doc("faceProfiles/ann").get()).data().status, "not_enrolled");
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  await assert.rejects(FR.consentCall("ann", { action: "grant" }), /parent or guardian/i);
});

test("tutor attendance: confirmed once; face verification only for their own lesson and face", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  await A.ensureSession("face", Object.assign({ id: "face" }, (await db().doc("timetableEntries/face").get()).data()), day.ymd);
  const r = await A.recordTutorPresence("t1", SID, Date.now(), { method: "online" });
  assert.equal(r.classification, "on_time");
  assert.equal((await A.recordTutorPresence("t1", SID, Date.now(), { method: "online" })).already, true);
  await enable(false);
  await FR.adminAction("desk", { action: "consent", personType: "tutor", personId: "t1", decision: "granted", givenBy: "Tess", relationship: "self (adult tutor)", reason: "signed" });
  await FR.adminAction("desk", { action: "enroll", personType: "tutor", personId: "t1", descriptors: [TESS] });
  assert.equal((await FR.availabilityFor("t1", "tutor")).available, true);
  await assert.rejects(FR.tutorFaceVerify("t1", { sessionId: SID, descriptors: frames(ANN) }), (e) => reason(e) === "no_match");
  await FR.tutorFaceVerify("t1", { sessionId: SID, descriptors: frames(TESS) });
  const s = (await db().doc("attendanceSessions/" + SID).get()).data();
  assert.ok(s.tutorPresence.t1.faceVerifiedAt);
  await assert.rejects(FR.tutorFaceVerify("ann", { sessionId: SID, descriptors: frames(ANN) }), /not your lesson/);
});

test("retention: templates without an enrolled profile are deleted", { skip: !HAVE }, async () => {
  await seed();
  await db().doc("faceTemplates/ghost").set({ template: { enc: false, data: "[]" } });
  const r = await FR.retention(Date.now());
  assert.ok(r.enrollmentsDeleted >= 1);
  assert.equal((await db().doc("faceTemplates/ghost").get()).exists, false);
});

test("strike policy: calendar-year counting, and a policy change recounts without deleting strikes", { skip: !HAVE }, async () => {
  await seed();
  const pol = { strikeReset: "calendar_year", yearStartMonth: 9 };
  assert.equal(A.strikePeriod(pol, Date.parse("2026-11-05T09:00:00+03:00")).key, "c2026");
  assert.equal(A.strikePeriod({ strikeReset: "academic_year", yearStartMonth: 9 }, Date.parse("2026-11-05T09:00:00+03:00")).key, "y2026");
  assert.equal(A.strikePeriod({ strikeReset: "never" }, Date.now()).key, "all");
  await db().doc("attendanceStrikes/k1").set({ studentId: "ann", studentName: "Ann", status: "active", startAt: admin.firestore.Timestamp.fromMillis(Date.parse("2026-08-20T09:00:00+03:00")), academicYear: "y2025" });
  await db().doc("attendanceStrikes/k2").set({ studentId: "ann", studentName: "Ann", status: "active", startAt: admin.firestore.Timestamp.fromMillis(Date.parse("2026-10-20T09:00:00+03:00")), academicYear: "y2026" });
  await A.adminAction("desk", { action: "setPolicy", strikeReset: "calendar_year", yearStartMonth: 9, reason: "board decision" }, Date.now());
  const sum = (await db().doc("attendanceStudents/ann").get()).data();
  assert.equal(sum.years.c2026.active, 2);
  assert.equal((await db().collection("attendanceStrikes").get()).size, 2);
  await assert.rejects(A.adminAction("desk", { action: "resetStrikes", reason: "not manual" }, Date.now()), /by hand/);
});
