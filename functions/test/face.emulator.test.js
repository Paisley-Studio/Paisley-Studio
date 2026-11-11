/* Facial recognition gates, tutor attendance and the strike reset policy, against the Firestore emulator.
 *   firebase emulators:exec --only firestore "node --test functions/test/face.emulator.test.js"
 * The recognition engine is replaced by a scripted test double through face-provider's
 * _setTestProvider (test-only seam): these tests check what Paisley does with an engine's
 * answer; they never pretend a real face was recognised. Skipped without the emulator. */
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
const P = require("../face-provider");
const db = () => admin.firestore();

// A lesson that started 5 minutes ago (Nairobi), so check-ins are on time and open.
const NOW = Date.now();
const day = A.nairobiParts(NOW);
const start = A.nairobiParts(NOW - 5 * 60000);
const SAME_DAY = start.ymd === day.ymd && A.nairobiParts(NOW + 60 * 60000).ymd === day.ymd;
const endHm = A.nairobiParts(NOW + 55 * 60000).hm;
const SID = "face_" + day.ymd;

let next = null, removed = [];
const engine = { name: "test", configured: () => true, health: async () => ({ ok: true, detail: "ok" }),
  enroll: async () => ({ ok: true }), remove: async (s) => { removed.push(s); return { ok: true }; },
  recognize: async () => { if (next instanceof Error) throw next; return next; } };
P._setTestProvider(engine);

async function wipe() {
  for (const c of ["timetableEntries", "students", "tutorAccounts", "admins", "parentAccounts", "parentStudentLinks", "attendanceSessions", "attendanceRecords",
    "attendanceStrikes", "attendanceStudents", "attendanceAudit", "attendanceSettings", "faceProfiles", "faceAttempts", "personalNotifications", "attendanceNotifications", "attendanceReferrals"]) {
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
  removed = []; next = null;
}
async function enable(students) {
  await FR.adminAction("desk", { action: "status", status: "enabled", reason: "pilot" });
  if (students) await FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "DPIA-1", reason: "approved by board" });
}
async function enrolAnn() {
  await FR.adminAction("desk", { action: "consent", personType: "student", personId: "ann", decision: "granted", givenBy: "Pat Parent", relationship: "parent", method: "signed_form", reason: "form 12" });
  await FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", image: "aGVsbG8=" });
}
const img = "aGVsbG8=";
const match = (subject, similarity, more) => ({ faces: [{ probability: 0.99, matches: [{ subject, similarity }].concat(more || []) }] });
const rec = async (uid) => { const s = await db().doc("attendanceRecords/" + SID + "_" + uid).get(); return s.exists ? s.data() : null; };
const lastAttempt = async () => (await db().collection("faceAttempts").get()).docs.map((d) => d.data()).sort((a, b) => (b.at ? b.at.toMillis() : 0) - (a.at ? a.at.toMillis() : 0))[0];
const reason = (e) => e && e.details && e.details.reason;

test("disabled: nothing is offered and face check-in is refused (normal check-in still works)", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", image: img }), (e) => reason(e) === "disabled");
  const t = await A.todayFor("ann", Date.now());
  assert.deepEqual(t.recognition, { available: false });
  const r = await A.checkIn("ann", "face", Date.now());
  assert.equal(r.record.status, "present");
  assert.equal(r.record.checkIn.method, "online");
});

test("students stay off until the DPIA is recorded; enrollment needs consent", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  await enable(false);
  await assert.rejects(FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", image: img }), /Impact Assessment/);
  await assert.rejects(FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "", reason: "x y z" }), /Impact Assessment/);
  await FR.adminAction("desk", { action: "students", approve: true, confirm: true, dpiaReference: "DPIA-1", reason: "approved" });
  await assert.rejects(FR.adminAction("desk", { action: "enroll", personType: "student", personId: "ann", image: img }), /consent/i);
  await assert.rejects(FR.adminAction("desk", { action: "consent", personType: "student", personId: "ann", decision: "granted", givenBy: "Ann", relationship: "friend", reason: "x y z" }), /parent or guardian/);
  await enrolAnn();
  assert.equal((await FR.availabilityFor("ann", "student")).available, true);
  assert.equal((await FR.availabilityFor("ben", "student")).available, false);
  await assert.rejects(FR.adminAction("t1", { action: "status", status: "enabled", reason: "tutor tries" }), /Studio Desk only/);
});

test("a confident match of the student's own face registers them, by face, once", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  next = match("s_ann", 0.97, [{ subject: "s_ben", similarity: 0.5 }]);
  const r = await FR.studentFaceCheckIn("ann", { entryId: "face", image: img });
  assert.equal(r.recognised, true);
  const x = await rec("ann");
  assert.equal(x.status, "present");
  assert.equal(x.checkIn.method, "face");
  assert.equal((await lastAttempt()).result, "matched");
  const again = await FR.studentFaceCheckIn("ann", { entryId: "face", image: img });
  assert.equal(again.already, true);
});

test("someone else's face, low confidence, two faces, no face, ambiguity: all refused, nothing recorded", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  const cases = [
    [match("s_ben", 0.98), "wrong_person"],
    [match("s_ann", 0.7), "low_confidence"],
    [{ faces: [match("s_ann", 0.98).faces[0], match("s_ben", 0.98).faces[0]] }, "multiple_faces"],
    [{ faces: [] }, "no_face"],
    [match("s_ann", 0.95, [{ subject: "s_ben", similarity: 0.93 }]), "ambiguous"]
  ];
  for (const [answer, want] of cases) {
    next = answer;
    await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", image: img }), (e) => reason(e) === want, want);
    assert.equal((await lastAttempt()).result, want);
  }
  const x = await rec("ann");
  assert.ok(!x || !x.checkIn, "no check-in from a refused attempt");
  const prof = (await db().doc("faceProfiles/ann").get()).data();
  assert.ok(prof.attention, "repeated failures flag the profile");
});

test("engine down falls back; suspending stops attempts at once", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  next = new P.ProviderUnavailable("down");
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", image: img }), (e) => reason(e) === "engine_unavailable");
  await FR.adminAction("desk", { action: "status", status: "suspended", reason: "incident" });
  next = match("s_ann", 0.99);
  await assert.rejects(FR.studentFaceCheckIn("ann", { entryId: "face", image: img }), (e) => reason(e) === "disabled");
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  const audit = (await db().collection("attendanceAudit").where("area", "==", "recognition").get()).docs.map((d) => d.data().action);
  assert.ok(audit.includes("recognition_enabled") && audit.includes("recognition_suspended"));
});

test("parent withdraws consent: face data deleted from the engine, option gone", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed(); await enable(true); await enrolAnn();
  await assert.rejects(FR.consentCall("pa", { action: "withdraw", studentId: "ben" }), /own child/);
  const r = await FR.consentCall("pa", { action: "withdraw", studentId: "ann" });
  assert.equal(r.consent, "withdrawn");
  assert.deepEqual(removed, ["s_ann"]);
  const p = (await db().doc("faceProfiles/ann").get()).data();
  assert.equal(p.status, "not_enrolled");
  assert.equal((await FR.availabilityFor("ann", "student")).available, false);
  await assert.rejects(FR.consentCall("ann", { action: "grant" }), /parent or guardian/i);
});

test("tutor attendance: confirmed once; face verification only for their own lesson and face", { skip: !HAVE || !SAME_DAY }, async () => {
  await seed();
  await A.ensureSession("face", Object.assign({ id: "face" }, (await db().doc("timetableEntries/face").get()).data()), day.ymd);
  const r = await A.recordTutorPresence("t1", SID, Date.now(), { method: "online" });
  assert.equal(r.classification, "on_time");
  const again = await A.recordTutorPresence("t1", SID, Date.now(), { method: "online" });
  assert.equal(again.already, true);
  await enable(false);
  await FR.adminAction("desk", { action: "consent", personType: "tutor", personId: "t1", decision: "granted", givenBy: "Tess", relationship: "self (adult tutor)", reason: "signed" });
  await FR.adminAction("desk", { action: "enroll", personType: "tutor", personId: "t1", image: img });
  assert.equal((await FR.availabilityFor("t1", "tutor")).available, true);
  next = match("t_t1", 0.96);
  await FR.tutorFaceVerify("t1", { sessionId: SID, image: img });
  const s = (await db().doc("attendanceSessions/" + SID).get()).data();
  assert.ok(s.tutorPresence.t1.faceVerifiedAt);
  await assert.rejects(FR.tutorFaceVerify("ann", { sessionId: SID, image: img }), /not your lesson/);
});

test("strike policy: calendar-year counting, and a policy change recounts without deleting strikes", { skip: !HAVE }, async () => {
  await seed();
  const pol = { strikeReset: "calendar_year", yearStartMonth: 9 };
  assert.equal(A.strikePeriod(pol, Date.parse("2026-11-05T09:00:00+03:00")).key, "c2026");
  assert.equal(A.strikePeriod({ strikeReset: "academic_year", yearStartMonth: 9 }, Date.parse("2026-11-05T09:00:00+03:00")).key, "y2026");
  assert.equal(A.strikePeriod({ strikeReset: "academic_year", yearStartMonth: 1 }, Date.parse("2026-11-05T09:00:00+03:00")).key, "y2026");
  assert.equal(A.strikePeriod({ strikeReset: "never" }, Date.now()).key, "all");
  await db().doc("attendanceStrikes/k1").set({ studentId: "ann", studentName: "Ann", status: "active", startAt: admin.firestore.Timestamp.fromMillis(Date.parse("2026-08-20T09:00:00+03:00")), academicYear: "y2025" });
  await db().doc("attendanceStrikes/k2").set({ studentId: "ann", studentName: "Ann", status: "active", startAt: admin.firestore.Timestamp.fromMillis(Date.parse("2026-10-20T09:00:00+03:00")), academicYear: "y2026" });
  await A.adminAction("desk", { action: "setPolicy", strikeReset: "calendar_year", yearStartMonth: 9, reason: "board decision" }, Date.now());
  const sum = (await db().doc("attendanceStudents/ann").get()).data();
  assert.equal(sum.years.c2026.active, 2);
  assert.equal((await db().collection("attendanceStrikes").get()).size, 2);
  await assert.rejects(A.adminAction("desk", { action: "resetStrikes", reason: "not manual" }, Date.now()), /by hand/);
});
