// admitToTechStudio against the Firestore emulator.
// Run: firebase emulators:exec --only firestore "node --test functions/test/tech-admit.emulator.test.js"
//   (or with an emulator already running: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test functions/test/tech-admit.emulator.test.js)
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-admit-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const tech = require("../tech");
const db = admin.firestore();

const skip = !process.env.FIRESTORE_EMULATOR_HOST && "needs the Firestore emulator (FIRESTORE_EMULATOR_HOST)";
const call = (uid, data) => tech.admitToTechStudio.run({ auth: { uid }, data });

test.before(async () => {
  if (skip) return;
  await db.doc("admins/desk").set({ name: "Studio Desk" });
  await db.doc("techCoaches/coachA").set({ name: "Coach A", status: "Active" });
  await db.doc("techCoaches/coachOff").set({ name: "Coach Off", status: "Paused" });
  await db.doc("students/s1").set({ name: "Ann Online", email: "ann@x.com", status: "Active", subjects: ["computer-science"] });
  await db.doc("students/s2").set({ name: "Ben Remote", email: "ben@x.com", status: "Active", studentType: "remote" });
  await db.doc("students/s3").set({ name: "Cat Applied", email: "cat@x.com", status: "Active" });
  await db.doc("techStudents/s3").set({ name: "Cat Applied", email: "cat@x.com", status: "Pending", skillLevel: "expert" });
  await db.doc("students/s4").set({ name: "Dan Already", email: "dan@x.com", status: "Active" });
  await db.doc("techStudents/s4").set({ name: "Dan Already", email: "dan@x.com", status: "Active", skillLevel: "beginner" });
  await db.doc("students/old").set({ name: "Old Tech", email: "o@x.com", studentType: "tech" });
});

test("only the Studio Desk can admit", { skip }, async () => {
  await assert.rejects(call("someone", { studentIds: ["s1"], skillLevel: "beginner" }), /Admins only/);
});

test("a level is required and the coach must be active", { skip }, async () => {
  await assert.rejects(call("desk", { studentIds: ["s1"], skillLevel: "wizard" }), /level/);
  await assert.rejects(call("desk", { studentIds: ["s1"], skillLevel: "beginner", coachId: "coachOff" }), /not active/);
});

test("admitting adds Tech Studio to the same account, Active, with level and coach", { skip }, async () => {
  const r = await call("desk", { studentIds: ["s1", "s2", "s3", "s4", "old", "nobody"], skillLevel: "intermediate", coachId: "coachA" });
  const by = Object.fromEntries(r.results.map((x) => [x.id, x]));
  assert.equal(r.admitted, 3);
  assert.equal(by.s1.ok, true); assert.equal(by.s2.ok, true); assert.equal(by.s3.ok, true);
  assert.match(by.s4.reason, /Already/);
  assert.match(by.old.reason, /old Tech Studio/);
  assert.match(by.nobody.reason, /Not a Paisley student/);

  const s1 = (await db.doc("techStudents/s1").get()).data();
  assert.equal(s1.status, "Active");
  assert.equal(s1.skillLevel, "intermediate");
  assert.equal(s1.coachId, "coachA"); assert.equal(s1.coachName, "Coach A");
  assert.equal(s1.email, "ann@x.com");
  assert.equal(s1.admittedBy, "desk"); assert.equal(s1.admittedFrom, "Online");
  assert.equal((await db.doc("techStudents/s2").get()).data().admittedFrom, "Remote");

  /* An earlier application is taken over: Active, with the level the desk chose. */
  const s3 = (await db.doc("techStudents/s3").get()).data();
  assert.equal(s3.status, "Active"); assert.equal(s3.skillLevel, "intermediate");

  /* The Paisley record is not touched. */
  assert.equal((await db.doc("students/s1").get()).data().studentType, undefined);
});
