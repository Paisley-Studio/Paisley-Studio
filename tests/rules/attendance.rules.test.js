/* Firestore rules tests for attendance and subject names.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/attendance.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const SID = "maths_2026-11-05";

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-attendance-rules", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/desk").set({ name: "Desk" });
    await db.doc("tutorAccounts/t1").set({ name: "Tess", subjects: ["mathematics", "physics"], keyStages: [] });
    await db.doc("tutorAccounts/t2").set({ name: "Other", subjects: ["biology"], keyStages: [] });
    await db.doc("students/ann").set({ name: "Ann", status: "Active", keyStage: "KS4", subjects: ["mathematics"], tutorIds: ["t1"] });
    await db.doc("students/ben").set({ name: "Ben", status: "Active", keyStage: "KS4", subjects: ["mathematics"] });
    await db.doc("parentStudentLinks/pa_ann").set({ parentUid: "pa", studentUid: "ann" });
    await db.doc("attendanceSessions/" + SID).set({ subjectId: "mathematics", tutorIds: ["t1"], studentIds: ["ann", "ben"], status: "open", date: "2026-11-05" });
    for (const s of ["ann", "ben"]) await db.doc("attendanceRecords/" + SID + "_" + s).set({ sessionId: SID, studentId: s, tutorIds: ["t1"], status: "expected", date: "2026-11-05" });
    await db.doc("attendanceStudents/ann").set({ years: { y2026: { active: 2 } } });
    await db.doc("attendanceStrikes/" + SID + "_ann").set({ studentId: "ann", status: "active" });
    await db.doc("attendanceNotifications/n1").set({ studentId: "ann", audience: "family", recipientId: "pa", kind: "late" });
    await db.doc("attendanceNotifications/n2").set({ studentId: "ann", audience: "admin", recipientId: "desk", kind: "referral_admin" });
    await db.doc("attendanceLocks/t1_mathematics").set({ tutorId: "t1", subjectId: "mathematics", sessionIds: [SID] });
    await db.doc("attendanceAudit/a1").set({ action: "check_in" });
    await db.doc("lmsSettings/subjects").set({ names: { mathematics: "Mathematics" } });
    await db.doc("classrooms/cm").set({ subjectId: "mathematics", keyStage: "KS4" });
    await db.doc("classrooms/cp").set({ subjectId: "physics", keyStage: "KS4" });
    for (const c of ["cm", "cp"]) {
      await db.doc("classrooms/" + c + "/topics/t/assignments/a").set({ title: "HW", audiences: { online: true, tutors: true }, audience: "class", recipients: [], releasedTo: [] });
      await db.doc("classrooms/" + c + "/topics/t/assignments/a/submissions/ann").set({ studentId: "ann", status: "Submitted" });
    }
  });
});
test.after(async () => { await env.cleanup(); });

test("students read only their own attendance and can write none of it", async () => {
  await assertSucceeds(as("ann").doc("attendanceRecords/" + SID + "_ann").get());
  await assertSucceeds(as("ann").collection("attendanceRecords").where("studentId", "==", "ann").get());
  await assertFails(as("ann").doc("attendanceRecords/" + SID + "_ben").get());
  await assertFails(as("ann").doc("attendanceRecords/" + SID + "_ann").update({ status: "present" }));
  await assertFails(as("ann").doc("attendanceRecords/" + SID + "_ann").set({ studentId: "ann", status: "present" }));
  await assertSucceeds(as("ann").doc("attendanceStudents/ann").get());
  await assertFails(as("ann").doc("attendanceStudents/ann").set({ years: {} }));
  await assertFails(as("ann").doc("attendanceStrikes/" + SID + "_ann").delete());
  await assertSucceeds(as("ann").doc("attendanceSessions/" + SID).get());
});

test("parents see their own child's attendance and family notices only", async () => {
  await assertSucceeds(as("pa").collection("attendanceRecords").where("studentId", "==", "ann").get());
  await assertFails(as("pa").collection("attendanceRecords").where("studentId", "==", "ben").get());
  await assertSucceeds(as("pa").collection("attendanceNotifications").where("studentId", "==", "ann").where("audience", "==", "family").get());
  await assertFails(as("pa").doc("attendanceNotifications/n2").get());
  await assertSucceeds(as("pa").doc("attendanceStudents/ann").get());
  await assertFails(as("pa").doc("attendanceStudents/ben").get());
  await assertFails(as("pa").doc("attendanceAudit/a1").get());
});

test("tutors read the registers they run, nobody else's", async () => {
  await assertSucceeds(as("t1").collection("attendanceRecords").where("sessionId", "==", SID).where("tutorIds", "array-contains", "t1").get());
  const other = await assertSucceeds(as("t2").collection("attendanceRecords").where("sessionId", "==", SID).where("tutorIds", "array-contains", "t2").get());
  if (other.size !== 0) throw new Error("another tutor saw " + other.size + " records");                       // allowed, but empty
  await assertFails(as("t2").collection("attendanceRecords").where("sessionId", "==", SID).get());              // without the tutor filter: refused
  await assertFails(as("t2").doc("attendanceRecords/" + SID + "_ann").get());
  await assertSucceeds(as("t1").doc("attendanceSessions/" + SID).get());
  await assertFails(as("t2").doc("attendanceSessions/" + SID).get());
  await assertFails(as("t1").doc("attendanceSessions/" + SID).update({ status: "submitted" }));
  await assertSucceeds(as("t1").collection("attendanceLocks").where("tutorId", "==", "t1").get());
  await assertFails(as("t1").doc("attendanceLocks/t1_mathematics").delete());
  await assertSucceeds(as("desk").doc("attendanceAudit/a1").get());
});

test("an overdue register pauses marking in that subject only; the Studio Desk is never locked", async () => {
  const sub = (c) => "classrooms/" + c + "/topics/t/assignments/a/submissions/ann";
  await assertFails(as("t1").doc(sub("cm")).update({ status: "Graded", grade: 5 }));
  await assertSucceeds(as("t1").doc(sub("cp")).update({ status: "Graded", grade: 5 }));
  await assertSucceeds(as("desk").doc(sub("cm")).update({ status: "Graded", grade: 5 }));
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc("attendanceLocks/t1_mathematics").delete());
  await assertSucceeds(as("t1").doc(sub("cm")).update({ status: "Graded", grade: 4 }));
});

test("subject names are public to read and written only by the renameSubject function", async () => {
  await assertSucceeds(anon().doc("lmsSettings/subjects").get());
  await assertFails(as("desk").doc("lmsSettings/subjects").set({ names: { mathematics: "Maths" } }));
  await assertFails(as("t1").doc("lmsSettings/subjects").set({ names: {} }));
});

test("facial recognition: settings, profiles and attempts are Studio Desk only; face templates are readable by no client; nobody writes them", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("attendanceSettings/policy").set({ strikeReset: "academic_year" });
    await db.doc("attendanceSettings/recognition").set({ status: "enabled", threshold: 0.9 });
    await db.doc("faceProfiles/ann").set({ personType: "student", status: "enrolled" });
    await db.doc("faceAttempts/x").set({ personId: "ann", result: "matched" });
    await db.doc("faceTemplates/ann").set({ template: { enc: false, data: "[]" } });
  });
  await assertSucceeds(as("ann").doc("attendanceSettings/policy").get());
  await assertFails(anon().doc("attendanceSettings/policy").get());
  for (const who of ["ann", "t1", "pa"]) {
    await assertFails(as(who).doc("attendanceSettings/recognition").get());
    await assertFails(as(who).doc("faceProfiles/ann").get());
    await assertFails(as(who).doc("faceAttempts/x").get());
    await assertFails(as(who).doc("attendanceSettings/recognition").set({ status: "enabled" }));
  }
  await assertSucceeds(as("desk").doc("attendanceSettings/recognition").get());
  await assertSucceeds(as("desk").doc("faceProfiles/ann").get());
  await assertFails(as("desk").doc("attendanceSettings/recognition").set({ status: "disabled" }));
  await assertFails(as("desk").doc("faceProfiles/ann").set({ status: "enrolled" }));
  await assertFails(as("desk").doc("faceTemplates/ann").get());
  await assertFails(as("ann").doc("faceTemplates/ann").get());
});
