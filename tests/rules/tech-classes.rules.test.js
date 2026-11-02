/* Firestore rules tests for Tech Studio classes and levels
 * (techCourses / techTopics / techLessons + private key / techLessonProgress / techAttempts).
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tech-classes.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const lesson = (over) => Object.assign({ type: "lesson", title: "Lesson 1", courseId: "c1", topicId: "t1", track: "beginner", status: "draft", createdBy: "coach1" }, over || {});

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-classes", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/tutor1").set({ name: "Tutor", status: "Active" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/coach2").set({ name: "Coach Two", status: "Active" });
    await db.doc("techCoaches/paused").set({ name: "Paused", status: "Inactive" });
    await db.doc("techStudents/kid1").set({ name: "Kid One", status: "Active", coachId: "coach1", skillLevel: "beginner" });
    await db.doc("techStudents/kid2").set({ name: "Kid Two", status: "Active", coachId: "coach2", skillLevel: "expert" });
    await db.doc("techStudents/old").set({ name: "Old Builder", status: "Active" });
    await db.doc("techStudents/waiting").set({ name: "Waiting", status: "Pending", skillLevel: "beginner" });
    await db.doc("parentAccounts/mum").set({ name: "Mum", email: "mum@x.com" });
    await db.doc("techGuardianLinks/mum_kid1").set({ parentUid: "mum", studentUid: "kid1" });
    await db.doc("techCourses/c1").set({ name: "CODING", discipline: "Coding", track: "beginner", createdBy: "coach1" });
    await db.doc("techTopics/t1").set({ courseId: "c1", title: "Flow", order: 1, createdBy: "coach1" });
    await db.doc("techLessons/live").set(lesson({ status: "published", questions: [{ id: "q1", text: "?", type: "mcq", options: ["a", "b"] }] }));
    await db.doc("techLessons/live/private/key").set({ answers: { q1: { correct: 1 } } });
    await db.doc("techLessons/draft").set(lesson());
    await db.doc("techAttempts/a1").set({ studentId: "kid1", lessonId: "live", score: 1, total: 1, percent: 100 });
    await db.doc("techLessonProgress/kid1_live").set({ studentId: "kid1", lessonId: "live", courseId: "c1", topicId: "t1", track: "beginner", title: "Lesson 1", bestPercent: 50 });
  });
});
test.after(async () => { await env.cleanup(); });

test("admins and active coaches create classes; nobody else does", async () => {
  const course = (by) => ({ name: "RESEARCH", discipline: "Research", track: "advanced", createdBy: by });
  await assertSucceeds(as("admin1").collection("techCourses").add(course("admin1")));
  await assertSucceeds(as("coach1").collection("techCourses").add(course("coach1")));
  await assertFails(as("coach1").collection("techCourses").add(course("coach2")));
  await assertFails(as("paused").collection("techCourses").add(course("paused")));
  await assertFails(as("tutor1").collection("techCourses").add(course("tutor1")));
  await assertFails(as("kid1").collection("techCourses").add(course("kid1")));
  await assertSucceeds(as("admin1").collection("techCourses").add(Object.assign(course("admin1"), { track: "expert" })));
  await assertSucceeds(as("coach1").collection("techCourses").add(Object.assign(course("coach1"), { track: "intermediate", afterCourseId: "c1" })));
  await assertFails(as("admin1").collection("techCourses").add(Object.assign(course("admin1"), { track: "wizard" })));
});

test("a coach changes only their own work, but may reorder any of it", async () => {
  await assertSucceeds(as("coach1").doc("techLessons/draft").update({ title: "New title" }));
  await assertFails(as("coach2").doc("techLessons/draft").update({ title: "Hacked" }));
  await assertSucceeds(as("coach2").doc("techLessons/draft").update({ order: 5 }));
  await assertSucceeds(as("coach2").doc("techTopics/t1").update({ order: 2 }));
  await assertFails(as("coach2").doc("techLessons/draft").delete());
  await assertSucceeds(as("admin1").doc("techLessons/draft").update({ title: "Desk edit" }));
});

test("posted work is readable by builders and parents; drafts are not", async () => {
  await assertSucceeds(as("kid1").doc("techLessons/live").get());
  await assertSucceeds(as("kid2").doc("techLessons/live").get());
  await assertSucceeds(as("mum").doc("techLessons/live").get());
  await assertFails(as("kid1").doc("techLessons/draft").get());
  await assertFails(as("mum").doc("techLessons/draft").get());
  await assertFails(as("waiting").doc("techLessons/live").get());
  await assertFails(as("tutor1").doc("techLessons/live").get());
  await assertSucceeds(as("coach2").doc("techLessons/draft").get());
  await assertSucceeds(as("kid1").collection("techLessons").where("courseId", "==", "c1").where("status", "==", "published").get());
  await assertFails(as("kid1").collection("techLessons").where("courseId", "==", "c1").get());
  await assertSucceeds(as("mum").collection("techCourses").where("track", "==", "beginner").get());
});

test("builders and parents can never read the answers", async () => {
  await assertFails(as("kid1").doc("techLessons/live/private/key").get());
  await assertFails(as("mum").doc("techLessons/live/private/key").get());
  await assertSucceeds(as("coach1").doc("techLessons/live/private/key").get());
  await assertSucceeds(as("admin1").doc("techLessons/live/private/key").get());
});

test("a lesson and its answers save together, by the lesson's author only", async () => {
  const save = (who, id) => { const db = as(who), b = db.batch(); b.set(db.doc(`techLessons/${id}`), lesson({ createdBy: who })); b.set(db.doc(`techLessons/${id}/private/key`), { answers: {} }); return b.commit(); };
  await assertSucceeds(save("coach2", "newOne"));
  await assertFails(as("coach1").doc("techLessons/newOne/private/key").set({ answers: { q: { correct: 0 } } }));
  await assertFails(as("kid1").doc("techLessons/newOne/private/key").set({ answers: {} }));
  const db = as("coach2"), del = db.batch();
  del.delete(db.doc("techLessons/newOne")); del.delete(db.doc("techLessons/newOne/private/key"));
  await assertSucceeds(del.commit());
});

test("scores cannot be forged", async () => {
  await assertFails(as("kid1").doc("techAttempts/fake").set({ studentId: "kid1", percent: 100 }));
  await assertFails(as("kid1").doc("techAttempts/a1").update({ percent: 100 }));
  await assertFails(as("kid1").doc("techLessonProgress/kid1_live").update({ bestPercent: 100 }));
  await assertFails(as("kid1").doc("techLessonProgress/kid1_other").set({ studentId: "kid1", lessonId: "other", bestPercent: 100 }));
  await assertFails(as("kid2").doc("techLessonProgress/kid1_live").update({ watchedAt: new Date() }));
  await assertSucceeds(as("kid1").doc("techLessonProgress/kid1_live").update({ watchedAt: new Date() }));
  await assertSucceeds(as("kid2").doc("techLessonProgress/kid2_live").set({ studentId: "kid2", lessonId: "live", courseId: "c1", topicId: "t1", track: "beginner", title: "L", openedAt: new Date() }));
  await assertFails(as("kid2").doc("techLessonProgress/kid2_wrong").set({ studentId: "kid2", lessonId: "live" }));
});

test("results are for the builder, their coach, their guardian and admins", async () => {
  await assertSucceeds(as("kid1").doc("techAttempts/a1").get());
  await assertSucceeds(as("coach1").doc("techAttempts/a1").get());
  await assertSucceeds(as("mum").doc("techAttempts/a1").get());
  await assertSucceeds(as("admin1").doc("techAttempts/a1").get());
  await assertFails(as("kid2").doc("techAttempts/a1").get());
  await assertFails(as("coach2").doc("techAttempts/a1").get());
  await assertSucceeds(as("coach1").collection("techAttempts").where("studentId", "==", "kid1").get());
  await assertSucceeds(as("mum").collection("techAttempts").where("studentId", "==", "kid1").where("lessonId", "==", "live").get());
  await assertFails(as("coach2").collection("techAttempts").where("studentId", "==", "kid1").get());
});

test("a level is chosen at sign-up and once by older builders, then only the desk changes it", async () => {
  const app = (over) => Object.assign({ name: "New", email: "n@x.com", status: "Pending", skillLevel: "beginner" }, over || {});
  await assertSucceeds(as("fresh1").doc("techStudents/fresh1").set(app()));
  await assertFails(as("fresh2").doc("techStudents/fresh2").set(app({ skillLevel: "wizard" })));
  await assertSucceeds(as("old").doc("techStudents/old").update({ skillLevel: "beginner" }));
  await assertFails(as("old").doc("techStudents/old").update({ skillLevel: "expert" }));
  await assertFails(as("kid1").doc("techStudents/kid1").update({ skillLevel: "expert" }));
  await assertSucceeds(as("admin1").doc("techStudents/kid1").update({ skillLevel: "intermediate" }));
  await assertFails(as("coach1").doc("techStudents/kid1").update({ skillLevel: "expert" }));
});

test("only admins open classes for a builder; the builder, their coach and family can read it", async () => {
  await assertSucceeds(as("admin1").doc("techAccess/kid1").set({ studentId: "kid1", open: { c1: "all" }, updatedBy: "admin1" }));
  await assertFails(as("coach1").doc("techAccess/kid1").set({ open: { c1: "all" } }));
  await assertFails(as("kid1").doc("techAccess/kid1").set({ open: { c2: "all" } }));
  await assertFails(as("kid1").doc("techAccess/kid1").update({ "open.c9": "all" }));
  await assertSucceeds(as("kid1").doc("techAccess/kid1").get());
  await assertSucceeds(as("coach1").doc("techAccess/kid1").get());
  await assertSucceeds(as("mum").doc("techAccess/kid1").get());
  await assertFails(as("kid2").doc("techAccess/kid1").get());
  await assertFails(as("coach2").doc("techAccess/kid1").get());
  await assertSucceeds(as("admin1").collection("techAccess").get());
});

test("a builder cannot mark their own level as passed", async () => {
  await assertFails(as("kid1").doc("techLessonProgress/kid1_live").update({ passedAt: new Date() }));
  await assertFails(as("kid1").doc("techLessonProgress/kid1_draft").set({ studentId: "kid1", lessonId: "draft", passedAt: new Date() }));
  await assertSucceeds(as("kid1").doc("techLessonProgress/kid1_live").update({ watchedAt: new Date(), updatedAt: new Date() }));
});
