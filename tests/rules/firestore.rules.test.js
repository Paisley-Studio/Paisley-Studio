/* Firestore rules tests for the audience / remote-student model.
 *
 * NOT EXECUTED in the environment this upgrade was built in (the Firestore emulator
 * could not be downloaded there). Run them before deploying the rules:
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/"
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

const CID = "maths_y8", TID = "t1";
const A = `classrooms/${CID}/topics/${TID}`;
let env;

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-rules-test", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/tutor1").set({ subjects: ["maths"], keyStages: [], status: "Active" });
    await db.doc(`classrooms/${CID}`).set({ subjectId: "maths", keyStage: "Key Stage 3 (Years 7-9)", year: 8 });
    await db.doc(`${A}`).set({ title: "Algebra" });
    const stu = { subjects: ["maths"], year: 8, keyStage: "Key Stage 3 (Years 7-9)", status: "Active" };
    await db.doc("students/online1").set({ ...stu, name: "O" });
    await db.doc("students/remote1").set({ ...stu, name: "R", studentType: "remote" });
    await db.doc("students/remote2").set({ ...stu, name: "R2", studentType: "remote", status: "Suspended" });
    const hw = (aud) => ({ title: "HW", audience: "class", recipients: [], audiences: { online: false, remote: false, tutors: false, ...aud } });
    await db.doc(`${A}/assignments/online_only`).set(hw({ online: true }));
    await db.doc(`${A}/assignments/remote_only`).set(hw({ remote: true }));
    await db.doc(`${A}/assignments/tutors_only`).set(hw({ tutors: true }));
    await db.doc(`${A}/assignments/unposted`).set(hw({}));
    await db.doc(`${A}/lessons/l_remote`).set({ title: "L", status: "published", audiences: { online: false, remote: true, tutors: false } });
    await db.doc(`${A}/lessons/l_online`).set({ title: "L", status: "published", audiences: { online: true, remote: false, tutors: false } });
    await db.doc("parentAccounts/pOnline").set({ name: "P" });
    await db.doc("parentAccess/pOnline").set({ slots: ["Key Stage 3 (Years 7-9)|maths"], online: ["Key Stage 3 (Years 7-9)|maths"], remote: [] });
  });
});
test.after(async () => env && env.cleanup());

const as = (uid) => env.authenticatedContext(uid).firestore();
const q = (db, kind, aud) => db.collection(`${A}/${kind}`).where(`audiences.${aud}`, "==", true).get();

test("remote student reads work posted to remote only", async () => {
  await assertSucceeds(as("remote1").doc(`${A}/assignments/remote_only`).get());
  await assertFails(as("remote1").doc(`${A}/assignments/online_only`).get());
  await assertFails(as("remote1").doc(`${A}/assignments/unposted`).get());
  await assertFails(as("remote1").doc(`${A}/assignments/tutors_only`).get());
});
test("online student reads work posted to online only", async () => {
  await assertSucceeds(as("online1").doc(`${A}/assignments/online_only`).get());
  await assertFails(as("online1").doc(`${A}/assignments/remote_only`).get());
});
test("audience-filtered queries succeed; unfiltered queries are refused", async () => {
  await assertSucceeds(q(as("remote1"), "assignments", "remote"));
  await assertSucceeds(q(as("online1"), "assignments", "online"));
  await assertFails(as("remote1").collection(`${A}/assignments`).get());
  await assertFails(q(as("remote1"), "assignments", "online"));
});
test("lessons: remote vs online isolation + published only", async () => {
  await assertSucceeds(as("remote1").doc(`${A}/lessons/l_remote`).get());
  await assertFails(as("remote1").doc(`${A}/lessons/l_online`).get());
  await assertFails(as("online1").doc(`${A}/lessons/l_remote`).get());
});
test("suspended remote student has no access", async () => {
  await assertFails(as("remote2").doc(`${A}/assignments/remote_only`).get());
});
test("tutor sees only work posted to tutors, and cannot author", async () => {
  await assertSucceeds(as("tutor1").doc(`${A}/assignments/tutors_only`).get());
  await assertFails(as("tutor1").doc(`${A}/assignments/unposted`).get());
  await assertFails(as("tutor1").doc(`${A}/assignments/new`).set({ title: "x", audience: "class" }));
  await assertFails(as("tutor1").doc(`${A}/assignments/tutors_only`).update({ title: "changed" }));
  await assertFails(as("tutor1").doc(`${A}/lessons/l_new`).set({ title: "x" }));
  await assertFails(as("tutor1").doc("notes/n1").set({ title: "x", postedById: "tutor1" }));
});
test("admin can author and read everything", async () => {
  await assertSucceeds(as("admin1").doc(`${A}/assignments/unposted`).get());
  await assertSucceeds(as("admin1").doc(`${A}/assignments/made`).set({ title: "x", audience: "class", audiences: { online: false, remote: false, tutors: false } }));
});
test("a student cannot make themselves remote or active", async () => {
  await assertFails(as("newbie").doc("students/newbie").set({ name: "N", status: "Pending", studentType: "remote" }));
  await assertFails(as("newbie").doc("students/newbie").set({ name: "N", status: "Active" }));
  await assertSucceeds(as("newbie").doc("students/newbie").set({ name: "N", status: "Pending", keyStage: "Key Stage 3 (Years 7-9)", subjects: ["maths"] }));
  await assertFails(as("online1").doc("students/online1").update({ studentType: "remote" }));
  await assertFails(as("remote1").doc("students/remote1").update({ keyStage: "Key Stage 4 (Years 10-11) — IGCSE" }));
  await assertSucceeds(as("remote1").doc("students/remote1").update({ phone: "123" }));
});
test("remote student support tickets go to the Studio Desk only", async () => {
  const t = { studentId: "remote1", studentName: "R", studentEmail: "r@x.com", studentType: "remote", keyStage: "k", targetAdmin: true, subject: "Help", reference: "", message: "hi", status: "Open", reply: "" };
  await assertSucceeds(as("remote1").collection("tickets").add({ ...t, createdAt: new Date() }));
  await assertFails(as("remote1").collection("tickets").add({ ...t, studentId: "online1", createdAt: new Date() }));
  await assertFails(as("remote1").collection("tickets").add({ ...t, targetAdmin: false, createdAt: new Date() }));
  await assertFails(as("remote2").collection("tickets").add({ ...t, studentId: "remote2", createdAt: new Date() }));
});
test("remote students cannot read legacy online-only collections", async () => {
  await assertFails(as("remote1").doc("homework/h1").get());
  await assertFails(as("remote1").doc("notes/n1").get());
});
test("parent of an online child reads online content, not remote-only content", async () => {
  await assertSucceeds(as("pOnline").doc(`${A}/lessons/l_online`).get());
  await assertFails(as("pOnline").doc(`${A}/lessons/l_remote`).get());
  await assertFails(as("pOnline").doc(`${A}/assignments/remote_only`).get());
});
test("publications audit trail: admin read, nobody writes", async () => {
  await assertFails(as("online1").doc("publications/x").get());
  await assertFails(as("admin1").doc("publications/x").set({ a: 1 }));
});
