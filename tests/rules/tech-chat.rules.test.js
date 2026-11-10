/* Firestore rules tests for Tech Studio chats: messages with attachments and
 * presence/{uid} (typing + last seen) under techChats and techGuardianChats.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tech-chat.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { serverTimestamp } = require("firebase/firestore");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const pres = (uid, role, over) => Object.assign({ uid, role, name: "X", online: true, seenAt: serverTimestamp(), typingAt: serverTimestamp() }, over || {});

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-chat", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/coach2").set({ name: "Coach Two", status: "Active" });
    await db.doc("techStudents/stu1").set({ name: "Builder One", status: "Active", coachId: "coach1" });
    await db.doc("techChats/stu1_coach1").set({ studentId: "stu1", studentName: "Builder One", coachId: "coach1", coachName: "Coach One" });
    await db.doc("techGuardianLinks/par1_stu1").set({ parentUid: "par1", studentId: "stu1" });
    await db.doc("techGuardianChats/par1_stu1").set({ parentUid: "par1", studentId: "stu1", coachId: "coach1" });
  });
});
test.after(async () => { await env.cleanup(); });

test("builder and coach send messages with attachments", async () => {
  const att = [{ name: "shot.png", url: "https://firebasestorage.googleapis.com/x", type: "image/png", size: 10, path: "techChats/stu1_coach1/stu1/1_shot.png" }];
  await assertSucceeds(as("stu1").collection("techChats/stu1_coach1/messages").add({ senderId: "stu1", senderRole: "student", senderName: "B", text: "", attachments: att, createdAt: serverTimestamp() }));
  await assertSucceeds(as("coach1").collection("techChats/stu1_coach1/messages").add({ senderId: "coach1", senderRole: "coach", senderName: "C", text: "Hi", emailIt: true, createdAt: serverTimestamp() }));
  await assertFails(as("coach2").collection("techChats/stu1_coach1/messages").add({ senderId: "coach2", senderRole: "coach", text: "x", createdAt: serverTimestamp() }));
});

test("each person writes only their own presence doc, with their real role", async () => {
  await assertSucceeds(as("stu1").doc("techChats/stu1_coach1/presence/stu1").set(pres("stu1", "student")));
  await assertSucceeds(as("coach1").doc("techChats/stu1_coach1/presence/coach1").set(pres("coach1", "coach")));
  await assertSucceeds(as("admin1").doc("techChats/stu1_coach1/presence/admin1").set(pres("admin1", "admin")));
  await assertSucceeds(as("stu1").doc("techChats/stu1_coach1/presence/stu1").set({ typingAt: null }, { merge: true }));
  await assertFails(as("stu1").doc("techChats/stu1_coach1/presence/coach1").set(pres("coach1", "coach")));   // someone else's doc
  await assertFails(as("stu1").doc("techChats/stu1_coach1/presence/stu1").set(pres("stu1", "coach")));       // wrong role
  await assertFails(as("coach2").doc("techChats/stu1_coach1/presence/coach2").set(pres("coach2", "coach"))); // not in the chat
  await assertFails(as("stu1").doc("techChats/stu1_coach1/presence/stu1").set(pres("stu1", "student", { extra: 1 })));
});

test("only the chat's people read presence", async () => {
  await assertSucceeds(as("stu1").collection("techChats/stu1_coach1/presence").get());
  await assertSucceeds(as("coach1").collection("techChats/stu1_coach1/presence").get());
  await assertSucceeds(as("admin1").collection("techChats/stu1_coach1/presence").get());
  await assertFails(as("coach2").collection("techChats/stu1_coach1/presence").get());
});

test("family chats: guardian and coach presence", async () => {
  await assertSucceeds(as("par1").doc("techGuardianChats/par1_stu1/presence/par1").set(pres("par1", "guardian")));
  await assertSucceeds(as("coach1").doc("techGuardianChats/par1_stu1/presence/coach1").set(pres("coach1", "coach")));
  await assertSucceeds(as("par1").collection("techGuardianChats/par1_stu1/presence").get());
  await assertFails(as("stu1").doc("techGuardianChats/par1_stu1/presence/stu1").set(pres("stu1", "student")));
  await assertFails(as("stu1").collection("techGuardianChats/par1_stu1/presence").get());
});
