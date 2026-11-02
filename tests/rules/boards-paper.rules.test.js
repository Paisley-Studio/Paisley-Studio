/* Firestore rules tests: exam boards, paper hand-ins and the TECH application email.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/boards-paper.rules.test.js"
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

const KS = "Key Stage 4 (Years 10-11) — IGCSE";
const CAM = "english_y10", EDX = "english_y10_edexcel", AQA = "english_y10_oxford_aqa";
const hwPath = (cid) => `classrooms/${cid}/topics/t1/assignments/a1`;
const lessonPath = (cid) => `classrooms/${cid}/topics/t1/lessons/l1`;
const flatPath = (cid) => `classrooms/${cid}/exams/x1`;
let env;

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-boards-test", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/legacyTutor").set({ subjects: ["english"], keyStages: [KS], status: "Active" });
    await db.doc("tutorAccounts/edxTutor").set({ subjects: ["english"], keyStages: [KS], boardScope: [`${KS}|english|edexcel`], status: "Active" });
    await db.doc("tutorAccounts/bothTutor").set({ subjects: ["english"], keyStages: [KS], boardScope: [`${KS}|english|cambridge`, `${KS}|english|edexcel`], status: "Active" });
    await db.doc(`classrooms/${CAM}`).set({ subjectId: "english", keyStage: KS, year: 10 });
    await db.doc(`classrooms/${EDX}`).set({ subjectId: "english", keyStage: KS, year: 10, board: "edexcel" });
    await db.doc(`classrooms/${AQA}`).set({ subjectId: "english", keyStage: KS, year: 10, board: "oxford_aqa" });
    const stu = { subjects: ["english"], year: 10, keyStage: KS, status: "Active", name: "S" };
    await db.doc("students/camStudent").set({ ...stu, tutorIds: ["bothTutor"] });
    await db.doc("students/edxStudent").set({ ...stu, board: "edexcel", tutorIds: ["edxTutor"] });
    await db.doc("students/aqaStudent").set({ ...stu, subjectBoards: { english: "oxford_aqa" } });
    const hw = { title: "HW", audience: "class", recipients: [], audiences: { online: true, remote: false, tutors: true } };
    for (const cid of [CAM, EDX, AQA]) {
      await db.doc(hwPath(cid)).set(hw);
      await db.doc(lessonPath(cid)).set({ title: "L", status: "published", audiences: { online: true, tutors: true } });
      await db.doc(flatPath(cid)).set({ ...hw, status: "Published", title: "Mid" });
    }
    await db.doc(`${hwPath(CAM)}/submissions/edxStudent`).set({ studentId: "edxStudent", status: "Submitted", released: false, handIn: "physical" });
    await db.doc(`${hwPath(CAM)}/submissions/camStudent`).set({ studentId: "camStudent", status: "Submitted", released: false, fileUrl: "https://x" });
  });
});
test.after(async () => { await env.cleanup(); });

const as = (uid) => env.authenticatedContext(uid, { email: uid + "@paisley.test" }).firestore();

// Reads are checked on flat exams. Assignments and lessons have a collection-group rule at the top of
// firestore.rules that lets any signed-in user read them, so their reads are separated by the app, not the rules.

/* ---------- tutors only reach their board ---------- */
test("a tutor with no board assignment stays on Cambridge", async () => {
  await assertSucceeds(as("legacyTutor").doc(flatPath(CAM)).get());
  await assertFails(as("legacyTutor").doc(flatPath(EDX)).get());
});
test("an Edexcel tutor sees Edexcel work, not Cambridge or Oxford AQA", async () => {
  await assertSucceeds(as("edxTutor").doc(flatPath(EDX)).get());
  await assertFails(as("edxTutor").doc(flatPath(CAM)).get());
  await assertFails(as("edxTutor").doc(flatPath(AQA)).get());
});
test("a tutor can be assigned more than one board", async () => {
  await assertSucceeds(as("bothTutor").doc(flatPath(CAM)).get());
  await assertSucceeds(as("bothTutor").doc(flatPath(EDX)).get());
  await assertFails(as("bothTutor").doc(flatPath(AQA)).get());
});

/* ---------- students only reach their board ---------- */
test("students see only the classroom of their own board", async () => {
  await assertSucceeds(as("camStudent").doc(flatPath(CAM)).get());
  await assertFails(as("camStudent").doc(flatPath(EDX)).get());
  await assertSucceeds(as("edxStudent").doc(flatPath(EDX)).get());
  await assertFails(as("edxStudent").doc(flatPath(AQA)).get());
  await assertSucceeds(as("aqaStudent").doc(flatPath(AQA)).get());
  await assertFails(as("aqaStudent").doc(flatPath(EDX)).get());
  await assertFails(as("aqaStudent").doc(flatPath(CAM)).get());
});
test("a student cannot hand in to another board's work", async () => {
  const sub = (uid) => ({ studentId: uid, status: "Submitted", released: false });
  await assertFails(as("aqaStudent").doc(`${hwPath(EDX)}/submissions/aqaStudent`).set(sub("aqaStudent")));
  await assertSucceeds(as("aqaStudent").doc(`${hwPath(AQA)}/submissions/aqaStudent`).set(sub("aqaStudent")));
});
test("a student cannot move themselves to another board or switch off reminders", async () => {
  await assertFails(as("camStudent").doc("students/camStudent").update({ board: "edexcel" }));
  await assertFails(as("camStudent").doc("students/camStudent").update({ subjectBoards: { english: "edexcel" } }));
  await assertFails(as("camStudent").doc("students/camStudent").update({ physicalStudent: true }));
  await assertFails(as("camStudent").doc("students/camStudent").update({ activatedAt: null }));
  await assertSucceeds(as("camStudent").doc("students/camStudent").update({ phone: "0700" }));
});

/* ---------- paper hand-ins ---------- */
const paper = (uid, extra) => ({ studentId: uid, status: "Submitted", released: false, handIn: "physical", ...extra });
test("the tutor of that board and the admin can record a paper hand-in, on every kind of work", async () => {
  await assertSucceeds(as("edxTutor").doc(`${hwPath(EDX)}/submissions/edxStudent`).set(paper("edxStudent")));
  await assertSucceeds(as("edxTutor").doc(`${lessonPath(EDX)}/submissions/edxStudent`).set(paper("edxStudent")));
  await assertSucceeds(as("edxTutor").doc(`${flatPath(EDX)}/submissions/edxStudent`).set(paper("edxStudent")));
  await assertSucceeds(as("admin1").doc(`${hwPath(AQA)}/submissions/edxStudent`).set(paper("edxStudent")));
});
test("a tutor can mark it graded and released", async () => {
  await assertSucceeds(as("edxTutor").doc(`${hwPath(EDX)}/submissions/edxStudent`).set(
    { status: "Graded", grade: 8, maxScore: 10, released: true, gradedBy: "edxTutor" }, { merge: true }));
  await assertSucceeds(as("edxTutor").doc(`${flatPath(EDX)}/submissions/edxStudent`).set(
    { status: "Graded", grade: 8, maxScore: 10, released: true }, { merge: true }));
});
test("a tutor of another board cannot record a paper hand-in", async () => {
  await assertFails(as("legacyTutor").doc(`${hwPath(EDX)}/submissions/aqaStudent`).set(paper("aqaStudent")));
});
test("a tutor cannot create a hand-in that does not say it is paper", async () => {
  await assertFails(as("edxTutor").doc(`${hwPath(EDX)}/submissions/aqaStudent`).set({ studentId: "aqaStudent", status: "Graded", released: true }));
});
test("a student cannot fake a paper hand-in or grade themselves", async () => {
  await assertFails(as("aqaStudent").doc(`${hwPath(AQA)}/submissions/fake`).set(paper("fake")));
  await assertFails(as("camStudent").doc(`${hwPath(CAM)}/submissions/camStudent`).set({ status: "Graded", grade: 10, handIn: "physical" }, { merge: true }));
});
test("a tutor can undo a paper record but not delete an uploaded hand-in", async () => {
  await assertSucceeds(as("legacyTutor").doc(`${hwPath(CAM)}/submissions/edxStudent`).delete());
  await assertFails(as("legacyTutor").doc(`${hwPath(CAM)}/submissions/camStudent`).delete());
});

/* ---------- marking a student as paper ---------- */
const flag = (by) => ({ physicalStudent: true, physicalSetBy: by });
test("a tutor can flag their own student as paper, and nothing else on the record", async () => {
  await assertSucceeds(as("edxTutor").doc("students/edxStudent").update(flag("edxTutor")));
  await assertFails(as("edxTutor").doc("students/edxStudent").update({ ...flag("edxTutor"), status: "Suspended" }));
  await assertFails(as("edxTutor").doc("students/edxStudent").update({ board: "cambridge" }));
});
test("a tutor cannot flag someone else's student; the admin can", async () => {
  await assertFails(as("edxTutor").doc("students/camStudent").update(flag("edxTutor")));
  await assertSucceeds(as("admin1").doc("students/camStudent").update(flag("admin1")));
});

/* ---------- TECH applications ---------- */
const application = (extra) => ({ name: "New", status: "Pending", ageGroup: "18plus", ...extra });
test("anyone signed in can apply to TECH, tutors included, but must give an email", async () => {
  await assertFails(as("legacyTutor").doc("techStudents/legacyTutor").set(application()));
  await assertFails(as("legacyTutor").doc("techStudents/legacyTutor").set(application({ email: "" })));
  await assertSucceeds(as("legacyTutor").doc("techStudents/legacyTutor").set(application({ email: "tutor@paisley.test" })));
  await assertSucceeds(as("brandNew").doc("techStudents/brandNew").set(application({ email: "new@paisley.test" })));
});
