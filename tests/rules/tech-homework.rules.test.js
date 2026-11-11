/* Firestore rules tests for the Tech Studio timetable (techTimetable), homework
 * (techHomework) and homework hand-ins (techHomeworkWork).
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tech-homework.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { serverTimestamp } = require("firebase/firestore");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const tt = (over) => Object.assign({ dayOfWeek: "Monday", startTime: "16:00", endTime: "17:00", level: "beginner", coachId: "coach1", coachName: "Coach One", link: "https://meet.google.com/abc" }, over || {});
const hw = (over) => Object.assign({ courseId: "c1", courseName: "Web basics", track: "beginner", title: "Homework 1", notes: "", files: [], videos: [], requireUpload: false, ide: { enabled: true, starter: "" }, dueAt: null, status: "draft", createdBy: "coach1", createdByName: "Coach One" }, over || {});
const work = (uid, over) => Object.assign({ homeworkId: "hw1", studentId: uid, studentName: "B", coachId: "coach1", courseId: "c1", track: "beginner", text: "", files: [], status: "Draft" }, over || {});

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-homework", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/coach2").set({ name: "Coach Two", status: "Active" });
    await db.doc("techStudents/stu1").set({ name: "Builder One", status: "Active", coachId: "coach1", skillLevel: "beginner" });
    await db.doc("techStudents/stu2").set({ name: "Builder Two", status: "Active", coachId: "coach2", skillLevel: "beginner" });
    await db.doc("techStudents/pend").set({ name: "Pending", status: "Pending" });
    await db.doc("parentAccounts/par1").set({ name: "Parent" });
    await db.doc("techGuardianLinks/par1_stu1").set({ parentUid: "par1", studentUid: "stu1" });
    await db.doc("techTimetable/t1").set(tt());
    await db.doc("techHomework/hw1").set(hw({ status: "published" }));
    await db.doc("techHomework/hwDraft").set(hw({ status: "draft" }));
    await db.doc("techHomeworkWork/stu2_hw1").set(work("stu2", { coachId: "coach2", status: "Submitted" }));
  });
});
test.after(async () => { await env.cleanup(); });

test("timetable: only the Studio Desk writes; builders, coaches and parents read", async () => {
  await assertSucceeds(as("admin1").collection("techTimetable").add(tt()));
  await assertSucceeds(as("admin1").doc("techTimetable/t1").update(tt({ level: "all", link: "" })));
  await assertFails(as("admin1").collection("techTimetable").add(tt({ level: "advanced" })));
  await assertFails(as("admin1").collection("techTimetable").add(tt({ dayOfWeek: "Funday" })));
  await assertFails(as("coach1").collection("techTimetable").add(tt()));
  await assertFails(as("stu1").doc("techTimetable/t1").update(tt({ link: "https://evil" })));
  await assertSucceeds(as("stu1").doc("techTimetable/t1").get());
  await assertSucceeds(as("coach2").collection("techTimetable").get());
  await assertSucceeds(as("par1").collection("techTimetable").get());
  await assertFails(as("pend").doc("techTimetable/t1").get());
  await assertFails(as("coach1").doc("techTimetable/t1").delete());
  await assertSucceeds(as("admin1").doc("techTimetable/t1").delete());
});

test("homework: coaches set their own, builders and parents read only what is posted", async () => {
  await assertSucceeds(as("coach1").collection("techHomework").add(hw()));
  await assertFails(as("coach1").collection("techHomework").add(hw({ createdBy: "coach2" })));
  await assertFails(as("stu1").collection("techHomework").add(hw({ createdBy: "stu1" })));
  await assertFails(as("coach2").doc("techHomework/hw1").update({ title: "Mine now" }));
  await assertSucceeds(as("admin1").doc("techHomework/hw1").update({ title: "Homework 1 (edited)" }));
  await assertSucceeds(as("stu1").collection("techHomework").where("track", "in", ["beginner"]).where("status", "==", "published").get());
  await assertFails(as("stu1").doc("techHomework/hwDraft").get());
  await assertSucceeds(as("par1").doc("techHomework/hw1").get());
  await assertFails(as("pend").doc("techHomework/hw1").get());
});

test("hand-ins: the builder works and hands in; marks come only from their coach or the desk", async () => {
  const ref = (db) => db.doc("techHomeworkWork/stu1_hw1");
  await assertFails(ref(as("stu1")).set(work("stu1", { coachId: "coach2" })));          // must carry their own coach
  await assertFails(ref(as("stu1")).set(work("stu1", { status: "Graded" })));
  await assertSucceeds(ref(as("stu1")).set(work("stu1")));
  await assertSucceeds(ref(as("stu1")).update({ text: "My answer", codeFiles: [{ name: "index.html", content: "<h1>x</h1>" }], codeAt: serverTimestamp() }));
  await assertFails(ref(as("stu1")).update({ grade: "A+" }));
  await assertSucceeds(ref(as("stu1")).update({ status: "Submitted", submittedAt: serverTimestamp() }));
  await assertFails(ref(as("stu1")).update({ text: "changed after hand-in" }));
  await assertFails(ref(as("coach2")).update({ grade: "B", status: "Graded" }));            // not their builder
  await assertFails(ref(as("coach1")).update({ text: "coach rewrites it" }));
  await assertSucceeds(ref(as("coach1")).update({ grade: "B", feedback: "Fix the colours", status: "Corrections", markedBy: "coach1", markedAt: serverTimestamp() }));
  await assertSucceeds(ref(as("stu1")).update({ text: "fixed", status: "Submitted", submittedAt: serverTimestamp() }));
  await assertSucceeds(ref(as("coach1")).update({ grade: "A", status: "Graded", markedAt: serverTimestamp() }));
  await assertSucceeds(ref(as("par1")).get());
  await assertFails(as("stu1").doc("techHomeworkWork/stu2_hw1").get());
  await assertSucceeds(as("coach1").collection("techHomeworkWork").where("homeworkId", "==", "hw1").where("coachId", "==", "coach1").get());
  await assertFails(as("coach1").collection("techHomeworkWork").where("homeworkId", "==", "hw1").get());
  await assertSucceeds(as("admin1").collection("techHomeworkWork").where("homeworkId", "==", "hw1").get());
  await assertSucceeds(as("stu1").collection("techHomeworkWork").where("studentId", "==", "stu1").get());
  await assertSucceeds(as("par1").collection("techHomeworkWork").where("studentId", "==", "stu1").get());
});
