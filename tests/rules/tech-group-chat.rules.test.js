/* Firestore rules tests for the Tech Studio group chatpad and push devices
 * (techGroups/{gid}/chat, techGroups/{gid}/chatPresence, pushTokens).
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/tech-group-chat.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { serverTimestamp, deleteField } = require("firebase/firestore");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const msg = (uid, over) => Object.assign({ senderId: uid, senderRole: "student", senderName: "Kid", text: "I will do the CSS", createdAt: serverTimestamp() }, over || {});

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-group-chat", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/paused").set({ name: "Paused", status: "Paused" });
    await db.doc("techStudents/kid1").set({ name: "Kid One", status: "Active", coachId: "coach1" });
    await db.doc("techStudents/kid2").set({ name: "Kid Two", status: "Active", coachId: "coach1" });
    await db.doc("techStudents/kid3").set({ name: "Kid Three", status: "Active", coachId: "coach1" });
    await db.doc("techStudents/gone").set({ name: "Gone", status: "Paused", coachId: "coach1" });
    await db.doc("techGroups/g1").set({ name: "Team", memberIds: ["kid1", "kid2", "gone"], members: [], createdBy: "coach1", coachId: "coach1" });
    await db.doc("techGroups/g1/chat/m1").set({ senderId: "kid1", senderRole: "student", senderName: "Kid One", text: "Hello", createdAt: new Date() });
    await db.doc("techGroups/g1/chat/m2").set({ senderId: "kid2", senderRole: "student", senderName: "Kid Two", text: "Hi", createdAt: new Date(), reactions: { kid1: "x" } });
    await db.doc("pushTokens/abc").set({ uid: "kid1", token: "t" });
  });
});
test.after(async () => { await env.cleanup(); });

test("members, coaches and the desk read the chat; others do not", async () => {
  await assertSucceeds(as("kid1").collection("techGroups/g1/chat").get());
  await assertSucceeds(as("coach1").collection("techGroups/g1/chat").get());
  await assertSucceeds(as("admin1").collection("techGroups/g1/chat").get());
  await assertFails(as("kid3").collection("techGroups/g1/chat").get());
  await assertFails(as("paused").collection("techGroups/g1/chat").get());
  await assertFails(env.unauthenticatedContext().firestore().collection("techGroups/g1/chat").get());
});

test("an active member writes as themselves, at the server time, with known fields only", async () => {
  await assertSucceeds(as("kid1").collection("techGroups/g1/chat").add(msg("kid1")));
  await assertSucceeds(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { text: "", voice: { url: "https://x", duration: 3 } })));
  await assertSucceeds(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { replyTo: { id: "m2", name: "Kid Two", text: "Hi" }, attachments: [{ name: "a.png", url: "https://x", type: "image/png" }] })));
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid2")));                                   // not me
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { createdAt: new Date(2020, 1, 1) })));
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { senderRole: "coach" })));
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { emailTo: ["parents"] })));          // staff only
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { mailed: { students: true } })));
  await assertFails(as("kid1").collection("techGroups/g1/chat").add(msg("kid1", { text: "x".repeat(4001) })));
  await assertFails(as("gone").collection("techGroups/g1/chat").add(msg("gone")));                                   // paused builder
  await assertFails(as("kid3").collection("techGroups/g1/chat").add(msg("kid3")));                                   // not in the group
});

test("coaches and the desk write, and may ask for the message to be emailed", async () => {
  await assertSucceeds(as("coach1").collection("techGroups/g1/chat").add(msg("coach1", { senderRole: "coach", emailTo: ["students", "parents"] })));
  await assertSucceeds(as("admin1").collection("techGroups/g1/chat").add(msg("admin1", { senderRole: "admin" })));
  await assertFails(as("paused").collection("techGroups/g1/chat").add(msg("paused", { senderRole: "coach" })));
});

test("after sending: only your own reaction, and only the sender deletes", async () => {
  await assertSucceeds(as("kid2").doc("techGroups/g1/chat/m1").update({ "reactions.kid2": "y" }));
  await assertSucceeds(as("coach1").doc("techGroups/g1/chat/m1").update({ "reactions.coach1": "z" }));
  await assertSucceeds(as("kid1").doc("techGroups/g1/chat/m2").update({ "reactions.kid1": deleteField() }));
  await assertFails(as("kid2").doc("techGroups/g1/chat/m1").update({ "reactions.kid1": "y" }));       // someone else's
  await assertFails(as("kid2").doc("techGroups/g1/chat/m1").update({ text: "edited by someone else" }));
  await assertFails(as("kid1").doc("techGroups/g1/chat/m1").update({ text: "quietly edited" }));
  await assertFails(as("kid2").doc("techGroups/g1/chat/m1").update({ deleted: true, text: "" }));
  await assertSucceeds(as("kid1").doc("techGroups/g1/chat/m1").update({ deleted: true, text: "", attachments: [], deletedAt: serverTimestamp() }));
  await assertSucceeds(as("admin1").doc("techGroups/g1/chat/m2").update({ deleted: true, text: "" }));
  await assertFails(as("kid1").doc("techGroups/g1/chat/m2").delete());
});

test("presence: each person writes only their own, and only in their group", async () => {
  await assertSucceeds(as("kid1").doc("techGroups/g1/chatPresence/kid1").set({ uid: "kid1", online: true, typingAt: serverTimestamp() }));
  await assertSucceeds(as("coach1").doc("techGroups/g1/chatPresence/coach1").set({ uid: "coach1", online: true }));
  await assertFails(as("kid1").doc("techGroups/g1/chatPresence/kid2").set({ uid: "kid2", online: true }));
  await assertFails(as("kid3").doc("techGroups/g1/chatPresence/kid3").set({ uid: "kid3", online: true }));
  await assertSucceeds(as("kid2").doc("techGroups/g1/chatPresence/kid1").get());
  await assertFails(as("kid3").doc("techGroups/g1/chatPresence/kid1").get());
});

test("push devices are server only", async () => {
  await assertFails(as("kid1").doc("pushTokens/abc").get());
  await assertFails(as("kid1").doc("pushTokens/new").set({ uid: "kid1", token: "t2" }));
  await assertFails(as("admin1").doc("pushTokens/abc").get());
});
