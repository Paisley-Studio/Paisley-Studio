/* Firestore rules tests for Tech Studio class work and groups
 * (techLessonWork, techGroups + tasks + presence) and per-subject hand-in style on students.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tech-work.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const work = (over) => Object.assign({
  studentId: "kid1", studentName: "Kid One", coachId: "coach1", lessonId: "live", lessonTitle: "Lesson 1",
  courseId: "c1", courseName: "CODING", topicId: "t1", topicTitle: "Flow", track: "beginner", kind: "code",
  codeFiles: [{ name: "index.html", lang: "html", content: "<h1>Hi</h1>" }], status: "Draft"
}, over || {});

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-work", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/coach2").set({ name: "Coach Two", status: "Active" });
    await db.doc("techStudents/kid1").set({ name: "Kid One", status: "Active", coachId: "coach1", skillLevel: "beginner" });
    await db.doc("techStudents/kid2").set({ name: "Kid Two", status: "Active", coachId: "coach2", skillLevel: "expert" });
    await db.doc("techStudents/kid3").set({ name: "Kid Three", status: "Active", coachId: "coach1", skillLevel: "expert" });
    await db.doc("parentAccounts/mum").set({ name: "Mum", email: "mum@x.com" });
    await db.doc("techGuardianLinks/mum_kid1").set({ parentUid: "mum", studentUid: "kid1" });
    await db.doc("techLessons/live").set({ type: "lesson", courseId: "c1", topicId: "t1", track: "beginner", status: "published", createdBy: "coach1", task: { brief: "Make a page", kind: "code" } });
    await db.doc("techLessonWork/kid1_sent").set(work({ lessonId: "sent", status: "Submitted", submitCount: 1 }));
    await db.doc("techLessonWork/kid1_redo").set(work({ lessonId: "redo", status: "Corrections" }));
    await db.doc("techGroups/g1").set({ name: "Team", memberIds: ["kid1", "kid3"], members: [{ id: "kid1", name: "Kid One" }, { id: "kid3", name: "Kid Three" }], createdBy: "coach1", coachId: "coach1" });
    await db.doc("techGroups/g1/tasks/t1").set({ title: "Build together", brief: "x", kind: "code", status: "Draft", createdBy: "coach1", codeFiles: [] });
    await db.doc("techGroups/g1/tasks/sent").set({ title: "Sent", brief: "x", kind: "code", status: "Submitted", createdBy: "coach1", codeFiles: [] });
    await db.doc("students/stu1").set({ name: "Student", status: "Active", tutorIds: ["tutor1"], subjects: ["mathematics"] });
    await db.doc("tutorAccounts/tutor1").set({ name: "Tutor", status: "Active" });
  });
});
test.after(async () => { await env.cleanup(); });

test("a builder starts their own class work, routed to their own coach", async () => {
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_live").get());   // before it exists
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_live").set(work()));
  await assertFails(as("kid2").doc("techLessonWork/kid2_live").set(work({ studentId: "kid2", coachId: "coach1" })));
  await assertFails(as("kid1").doc("techLessonWork/kid1_x").set(work()));                          // id must match the lesson
  await assertFails(as("kid1").doc("techLessonWork/kid1_nolesson").set(work({ lessonId: "nolesson" })));
  await assertFails(as("kid3").doc("techLessonWork/kid3_live").set(work({ studentId: "kid3", status: "Graded" })));
  await assertFails(as("kid3").doc("techLessonWork/kid3_live").set(work({ studentId: "kid3", grade: 10 })));
});

test("a builder edits and hands in, but cannot mark or change handed-in work", async () => {
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_live").update({ codeFiles: [], updatedAt: new Date() }));
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_live").update({ taskAnswers: { q1: "An <a> tag" } }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_sent").update({ taskAnswers: { q1: "changed after hand-in" } }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_live").update({ grade: 10 }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_live").update({ status: "Graded" }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_live").update({ coachId: "coach2" }));
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_live").update({ status: "Submitted", submitCount: 1, snapshotUrl: "https://x/s.jpg", snapshotPath: "techWork/kid1/live/snapshot_1.jpg", snapshotAt: new Date() }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_sent").update({ snapshotUrl: "https://x/other.jpg" }));
  await assertFails(as("kid1").doc("techLessonWork/kid1_sent").update({ codeFiles: [] }));
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_redo").update({ codeFiles: [] }));
  await assertSucceeds(as("kid1").doc("techLessonWork/kid1_redo").update({ status: "Submitted" }));
});

test("their coach and admins mark it; other coaches cannot see it; guardians read it", async () => {
  await assertSucceeds(as("coach1").doc("techLessonWork/kid1_sent").update({ status: "Graded", grade: 8, maxScore: 10, feedback: "Good", gradedBy: "coach1", inkData: { pages: [] } }));
  await assertFails(as("coach1").doc("techLessonWork/kid1_sent").update({ codeFiles: [] }));
  await assertFails(as("coach2").doc("techLessonWork/kid1_sent").update({ status: "Graded" }));
  await assertFails(as("coach2").doc("techLessonWork/kid1_sent").get());
  await assertSucceeds(as("admin1").doc("techLessonWork/kid1_sent").update({ status: "Corrections" }));
  await assertSucceeds(as("mum").doc("techLessonWork/kid1_sent").get());
  await assertFails(as("kid2").doc("techLessonWork/kid1_sent").get());
  // the class page lists a builder's hand-ins to open the padlocks
  await assertSucceeds(as("kid1").collection("techLessonWork").where("studentId", "==", "kid1").get());
  await assertSucceeds(as("mum").collection("techLessonWork").where("studentId", "==", "kid1").get());
  await assertFails(as("kid2").collection("techLessonWork").where("studentId", "==", "kid1").get());
  await assertSucceeds(as("coach1").collection("techLessonWork").where("coachId", "==", "coach1").get());
  await assertSucceeds(as("coach1").collection("techLessonWork").where("coachId", "==", "coach1").where("lessonId", "==", "sent").get());
  await assertFails(as("coach2").collection("techLessonWork").where("coachId", "==", "coach1").get());
  await assertSucceeds(as("admin1").collection("techLessonWork").where("lessonId", "==", "sent").get());
});

test("coaches and admins make groups; members see only their own", async () => {
  const grp = (by, ids) => ({ name: "Crew", memberIds: ids || ["kid1", "kid2"], members: [], createdBy: by });
  await assertSucceeds(as("coach2").collection("techGroups").add(grp("coach2")));
  await assertSucceeds(as("admin1").collection("techGroups").add(grp("admin1")));
  await assertFails(as("kid1").collection("techGroups").add(grp("kid1")));
  await assertFails(as("coach2").collection("techGroups").add(grp("coach1")));
  await assertFails(as("coach2").doc("techGroups/g1").update({ name: "Mine now" }));
  await assertSucceeds(as("coach1").doc("techGroups/g1").update({ name: "Team A" }));
  await assertSucceeds(as("kid1").doc("techGroups/g1").get());
  await assertFails(as("kid2").doc("techGroups/g1").get());
  await assertSucceeds(as("kid1").collection("techGroups").where("memberIds", "array-contains", "kid1").get());
  await assertFails(as("kid1").doc("techGroups/g1").update({ memberIds: ["kid1"] }));
});

test("members work on a task together and hand it in; only staff mark it", async () => {
  await assertSucceeds(as("kid3").doc("techGroups/g1/tasks/t1").get());
  await assertFails(as("kid2").doc("techGroups/g1/tasks/t1").get());
  await assertSucceeds(as("kid1").doc("techGroups/g1/tasks/t1").update({ codeFiles: [{ name: "index.html", content: "x" }], codeBy: "kid1", codeByName: "Kid One" }));
  await assertFails(as("kid2").doc("techGroups/g1/tasks/t1").update({ codeFiles: [] }));
  await assertFails(as("kid1").doc("techGroups/g1/tasks/t1").update({ title: "Easier task" }));
  await assertFails(as("kid1").doc("techGroups/g1/tasks/t1").update({ status: "Graded", grade: 10 }));
  await assertSucceeds(as("kid3").doc("techGroups/g1/tasks/t1").update({ status: "Submitted", submittedBy: "kid3", submitCount: 1 }));
  await assertFails(as("kid1").doc("techGroups/g1/tasks/sent").update({ codeFiles: [] }));
  await assertSucceeds(as("coach2").doc("techGroups/g1/tasks/sent").update({ status: "Graded", grade: 9, maxScore: 10, feedback: "Great teamwork" }));
  await assertFails(as("kid1").collection("techGroups/g1/tasks").add({ title: "Mine", status: "Draft", createdBy: "kid1" }));
  await assertSucceeds(as("coach1").collection("techGroups/g1/tasks").add({ title: "Next", status: "Draft", createdBy: "coach1" }));
});

test("members share where their cursor is, only as themselves", async () => {
  await assertSucceeds(as("kid1").doc("techGroups/g1/tasks/t1/presence/kid1").set({ uid: "kid1", file: "index.html", line: 3 }));
  await assertFails(as("kid1").doc("techGroups/g1/tasks/t1/presence/kid3").set({ uid: "kid3", line: 1 }));
  await assertFails(as("kid2").doc("techGroups/g1/tasks/t1/presence/kid2").set({ uid: "kid2", line: 1 }));
  await assertSucceeds(as("kid3").collection("techGroups/g1/tasks/t1/presence").get());
  await assertSucceeds(as("coach2").collection("techGroups/g1/tasks/t1/presence").get());
  await assertSucceeds(as("kid1").doc("techGroups/g1/tasks/t1/presence/kid1").delete());
});

test("hand-in style is per subject: tutors set it, students cannot", async () => {
  await assertSucceeds(as("tutor1").doc("students/stu1").update({ "handInBySubject.mathematics": "physical", physicalSetBy: "tutor1" }));
  await assertFails(as("stu1").doc("students/stu1").update({ "handInBySubject.mathematics": "online" }));
  await assertFails(as("newkid").doc("students/newkid").set({ name: "New", status: "Pending", handInBySubject: { mathematics: "physical" } }));
  await assertSucceeds(as("admin1").doc("students/stu1").update({ handInBySubject: { mathematics: "online" }, physicalStudent: false }));
});
