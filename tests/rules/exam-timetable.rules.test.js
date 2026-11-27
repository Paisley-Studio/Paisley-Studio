/* Firestore rules tests for examTimetables: only the people a timetable was sent to can
 * read it (and their portal query must be allowed); only admins write.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/exam-timetable.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const TT = {
  title: "Mocks", keyStage: "Key Stage 4 (Years 10-11) — IGCSE", status: "published",
  sessions: [{ id: "a", subjectId: "mathematics", date: "2026-12-07", start: "09:00" }],
  studentIds: ["stu1"], parentIds: ["par1"], tutorIds: ["tut1"],
  studentSessions: { stu1: ["a"] }, tutorSessions: { tut1: ["a"] }
};

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-exam-tt", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("examTimetables/t1").set(TT);
    await db.doc("examTimetables/draft").set({ title: "Draft", status: "draft", studentIds: [], parentIds: [], tutorIds: [] });
  });
});
test.after(async () => { await env.cleanup(); });

test("the people it was sent to can read it, and their portal query is allowed", async () => {
  await assertSucceeds(as("stu1").doc("examTimetables/t1").get());
  await assertSucceeds(as("par1").doc("examTimetables/t1").get());
  await assertSucceeds(as("tut1").doc("examTimetables/t1").get());
  await assertSucceeds(as("stu1").collection("examTimetables").where("studentIds", "array-contains", "stu1").get());
  await assertSucceeds(as("par1").collection("examTimetables").where("parentIds", "array-contains", "par1").get());
  await assertSucceeds(as("tut1").collection("examTimetables").where("tutorIds", "array-contains", "tut1").get());
});

test("nobody else can read it, nor list them all", async () => {
  await assertFails(as("stu2").doc("examTimetables/t1").get());
  await assertFails(as("stu2").doc("examTimetables/draft").get());
  await assertFails(as("stu1").collection("examTimetables").get());
  await assertFails(env.unauthenticatedContext().firestore().doc("examTimetables/t1").get());
});

test("only admins write; students cannot add themselves", async () => {
  await assertSucceeds(as("admin1").collection("examTimetables").get());
  await assertSucceeds(as("admin1").doc("examTimetables/new1").set({ title: "New", status: "draft" }));
  await assertFails(as("stu2").doc("examTimetables/t1").update({ studentIds: ["stu1", "stu2"] }));
  await assertFails(as("tut1").doc("examTimetables/t1").update({ title: "Changed" }));
  await assertFails(as("stu1").doc("examTimetables/x").set({ title: "Mine", studentIds: ["stu1"] }));
});
