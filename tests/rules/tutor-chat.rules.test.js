/* Firestore rules tests for tutor <-> student messages (tutorChats + messages),
 * Paisley VS Code drafts (codeDrafts) and code on classroom hand-ins.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tutor-chat.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { serverTimestamp } = require("firebase/firestore");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const chat = (over) => Object.assign({
  studentId: "stu1", studentName: "Student One", tutorId: "tutor1", tutorName: "Tutor One",
  lastMessage: "", lastAt: null, lastBy: "", lastRole: "", createdAt: new Date()
}, over || {});
const msg = (uid, role, over) => Object.assign({ senderId: uid, senderRole: role, senderName: "X", text: "Hello", createdAt: serverTimestamp() }, over || {});
const files = (n) => Array.from({ length: n }, (_, i) => ({ name: "f" + i + ".js", lang: "js", content: "x" }));

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tutor-chat", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/tutor1").set({ name: "Tutor One", status: "Active", subjects: ["computing"] });
    await db.doc("tutorAccounts/tutor2").set({ name: "Tutor Two", status: "Active" });
    await db.doc("students/stu1").set({ name: "Student One", status: "Active", tutorIds: ["tutor1"], subjects: ["computing"] });
    await db.doc("students/stu2").set({ name: "Student Two", status: "Active", tutorId: "tutor2", subjects: ["computing"] });
    await db.doc("students/stu3").set({ name: "Student Three", status: "Active", tutorIds: ["tutor1"] });
    await db.doc("students/rem1").set({ name: "Remote Pending", status: "Pending", studentType: "remote", tutorIds: ["tutor1"] });
    await db.doc("tutorChats/stu1_tutor1").set(chat());
    await db.doc("classrooms/computing_y9").set({ subjectId: "computing", keyStage: "KS3", year: 9 });
    await db.doc("classrooms/computing_y9/topics/t1").set({ title: "Web" });
    await db.doc("classrooms/computing_y9/topics/t1/assignments/a1").set({ title: "Page", audience: "class", recipients: [], tools: { ide: { enabled: true, codeFiles: [] } } });
    await db.doc("classrooms/computing_y9/topics/t1/assignments/a1/submissions/stu1").set({ studentId: "stu1", status: "Submitted", released: false, textAnswer: "" });
    await db.doc("classrooms/computing_y9/topics/t1/assignments/a1/submissions/stu2").set({ studentId: "stu2", status: "Graded", released: true });
  });
});
test.after(async () => { await env.cleanup(); });

test("a tutor opens a conversation only with their own student", async () => {
  await assertFails(as("tutor1").doc("tutorChats/stu2_tutor1").set(chat({ studentId: "stu2" })));          // not their student
  await assertFails(as("tutor2").doc("tutorChats/stu1_tutor2").set(chat({ tutorId: "tutor2" })));          // not their student
  await assertFails(as("tutor1").doc("tutorChats/wrongid").set(chat()));                                    // id must be student_tutor
  await assertSucceeds(as("tutor2").doc("tutorChats/stu2_tutor2").set(chat({ studentId: "stu2", tutorId: "tutor2" })));
  await assertFails(as("tutor2").doc("tutorChats/stu2_tutor2b").set(chat({ studentId: "stu2", tutorId: "tutor2", extra: 1 })));
});

test("a student opens a conversation only with their own tutor", async () => {
  await assertSucceeds(as("stu3").doc("tutorChats/stu3_tutor1").set(chat({ studentId: "stu3", studentName: "Student Three" })));
  await assertFails(as("stu1").doc("tutorChats/stu1_tutor2").set(chat({ tutorId: "tutor2" })));
  await assertFails(as("stu2").doc("tutorChats/stu1_tutor1x").set(chat()));
  await assertFails(as("rem1").doc("tutorChats/rem1_tutor1").set(chat({ studentId: "rem1" })));            // remote account not active yet
});

test("only the two people (and the Studio Desk) read a conversation", async () => {
  await assertSucceeds(as("stu1").doc("tutorChats/stu1_tutor1").get());
  await assertSucceeds(as("tutor1").doc("tutorChats/stu1_tutor1").get());
  await assertSucceeds(as("admin1").doc("tutorChats/stu1_tutor1").get());
  await assertFails(as("stu2").doc("tutorChats/stu1_tutor1").get());
  await assertFails(as("tutor2").doc("tutorChats/stu1_tutor1").get());
  await assertSucceeds(as("tutor1").collection("tutorChats").where("tutorId", "==", "tutor1").get());
  await assertSucceeds(as("stu1").collection("tutorChats").where("studentId", "==", "stu1").get());
  await assertFails(as("stu2").collection("tutorChats").where("tutorId", "==", "tutor1").get());
});

test("messages: each side writes as itself, nobody else can", async () => {
  const m = (u) => as(u).collection("tutorChats/stu1_tutor1/messages");
  await assertSucceeds(m("tutor1").add(msg("tutor1", "tutor", { topic: "Missed work" })));
  await assertSucceeds(m("stu1").add(msg("stu1", "student")));
  await assertFails(m("stu1").add(msg("stu1", "tutor")));                       // a student cannot pose as the tutor
  await assertFails(m("stu2").add(msg("stu2", "student")));                     // not their conversation
  await assertFails(m("tutor2").add(msg("tutor2", "tutor")));
  await assertFails(m("stu1").add(msg("tutor1", "tutor")));                     // sender must be the signed-in user
  await assertFails(m("stu1").add(msg("stu1", "student", { text: "" })));
  await assertFails(m("stu1").add(msg("stu1", "student", { createdAt: new Date(2000, 1, 1) })));   // server time only
  await assertFails(m("stu1").add(msg("stu1", "student", { extra: true })));
  await assertSucceeds(m("stu1").get());
  await assertFails(m("stu2").get());
});

test("each side marks only its own read time", async () => {
  const ref = (u) => as(u).doc("tutorChats/stu1_tutor1");
  await assertSucceeds(ref("stu1").update({ studentReadAt: serverTimestamp() }));
  await assertFails(ref("stu1").update({ tutorReadAt: serverTimestamp() }));
  await assertSucceeds(ref("tutor1").update({ tutorReadAt: serverTimestamp(), lastMessage: "Hi", lastBy: "tutor1", lastRole: "tutor", lastAt: serverTimestamp() }));
  await assertFails(ref("tutor1").update({ studentReadAt: serverTimestamp() }));
  await assertFails(ref("stu1").update({ tutorId: "tutor2" }));
});

test("code drafts belong to the student alone", async () => {
  const d = { studentId: "stu1", itemId: "a1", cid: "computing_y9", kind: "assignment", codeFiles: files(2), codeFolders: [], codeActive: "f0.js", codeAt: serverTimestamp() };
  await assertSucceeds(as("stu1").doc("codeDrafts/stu1_a1").set(d));
  await assertSucceeds(as("stu1").doc("codeDrafts/stu1_a1").get());
  await assertFails(as("stu2").doc("codeDrafts/stu1_a1").get());
  await assertFails(as("stu2").doc("codeDrafts/stu2_a1").set(Object.assign({}, d)));                 // studentId is not theirs
  await assertFails(as("stu1").doc("codeDrafts/stu1_other").set(d));                                  // id must match the item
  await assertFails(as("stu1").doc("codeDrafts/stu1_a1").set(Object.assign({}, d, { codeFiles: files(61) })));
  await assertSucceeds(as("stu1").doc("codeDrafts/stu1_a1").delete());
});

test("students hand in code on their own submission, never after it is graded", async () => {
  const sub = (u, s) => as(u).doc("classrooms/computing_y9/topics/t1/assignments/a1/submissions/" + s);
  await assertSucceeds(sub("stu1", "stu1").update({ codeFiles: files(3), codeFolders: [], codeActive: "f0.js", codeAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(sub("stu1", "stu1").update({ codeFiles: files(61) }));
  await assertFails(sub("stu2", "stu2").update({ codeFiles: files(1) }));     // already graded
  await assertFails(sub("stu1", "stu2").update({ codeFiles: files(1) }));     // someone else's
});
