/* Firestore rules tests for the Paisley TECH architecture
 * (techStudents / techCoaches / techGuardianLinks / techGuardianChats / techNotifications).
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/"
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-tech-rules", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/tutor1").set({ name: "Tutor", status: "Active" });
    await db.doc("techCoaches/coach1").set({ name: "Coach One", status: "Active" });
    await db.doc("techCoaches/coach2").set({ name: "Coach Two", status: "Active" });
    await db.doc("techCoaches/paused").set({ name: "Paused", status: "Inactive" });
    await db.doc("techStudents/kid1").set({ name: "Kid One", status: "Active", coachId: "coach1", coachName: "Coach One" });
    await db.doc("techStudents/kid2").set({ name: "Kid Two", status: "Active", coachId: "coach2" });
    await db.doc("techStudents/kid3").set({ name: "Kid Three", status: "Active", coachId: "paused" });
    await db.doc("parentAccounts/mum").set({ name: "Mum", email: "mum@x.com" });
    await db.doc("techGuardianLinks/mum_kid1").set({ parentUid: "mum", studentUid: "kid1" });
    await db.doc("techBuilds/b1").set({ studentId: "kid1", coachId: "coach1", title: "Bot", showcase: "none", reviewState: "none" });
    await db.doc("techBuilds/b2").set({ studentId: "kid2", coachId: "coach2", title: "Game", showcase: "none", reviewState: "none" });
    await db.doc("techBuilds/b3").set({ studentId: "kid1", coachId: "coach1", title: "Wall", showcase: "approved", reviewState: "approved", aiReflection: {} });
    await db.doc("techShowcase/b3").set({ buildId: "b3", title: "Wall" });
    await db.doc("techProgress/kid1").set({ levels: { AI: 2 } });
    await db.doc("techContent/c1").set({ title: "M", status: "published", createdBy: "coach1" });
    await db.doc("techNotifications/n1").set({ recipientId: "mum", recipientRole: "guardian", title: "t", read: false });
  });
});
test.after(async () => { await env.cleanup(); });

test("anyone signed in can apply to TECH, but only as Pending with no coach", async () => {
  const base = { name: "New", email: "n@x.com", status: "Pending", ageGroup: "18plus", techProfile: {}, guardians: [] };
  await assertSucceeds(as("igcse1").doc("techStudents/igcse1").set(base));
  await assertFails(as("new2").doc("techStudents/new2").set({ ...base, status: "Active" }));
  await assertFails(as("new3").doc("techStudents/new3").set({ ...base, coachId: "coach1" }));
  await assertFails(as("new4").doc("techStudents/someoneElse").set(base));
});

test("builders cannot change their own status or coach", async () => {
  await assertSucceeds(as("kid1").doc("techStudents/kid1").update({ techProfile: { identity: "Creator" } }));
  await assertFails(as("kid1").doc("techStudents/kid1").update({ coachId: "coach2" }));
  await assertFails(as("kid1").doc("techStudents/kid1").update({ status: "Inactive" }));
});

test("legacy studentType 'tech' student records can no longer be created", async () => {
  await assertFails(as("tk").doc("students/tk").set({ name: "T", status: "Pending", studentType: "tech" }));
});

test("a coach sees only their own builders, builds and progress", async () => {
  await assertSucceeds(as("coach1").collection("techStudents").where("coachId", "==", "coach1").get());
  await assertFails(as("coach1").doc("techStudents/kid2").get());
  await assertSucceeds(as("coach1").collection("techBuilds").where("coachId", "==", "coach1").get());
  await assertFails(as("coach1").doc("techBuilds/b2").get());
  await assertSucceeds(as("coach1").doc("techProgress/kid1").get());
  await assertFails(as("coach2").doc("techProgress/kid1").get());
});

test("tutors are no longer TECH coaches", async () => {
  await assertFails(as("tutor1").doc("techBuilds/b1").get());
  await assertFails(as("tutor1").doc("techContent/c1").get());
  await assertFails(as("tutor1").collection("techContent").add({ title: "x", createdBy: "tutor1" }));
});

test("a paused coach loses access", async () => {
  await assertFails(as("paused").collection("techStudents").where("coachId", "==", "paused").get());
  await assertFails(as("paused").doc("techContent/c1").get());
});

test("coach reviews are limited to review fields", async () => {
  await assertSucceeds(as("coach1").doc("techBuilds/b1").update({ reviewState: "changes" }));
  await assertFails(as("coach1").doc("techBuilds/b1").update({ title: "renamed" }));
});

test("builds are always routed to the builder's own coach", async () => {
  const b = { studentId: "kid1", title: "New", showcase: "none", reviewState: "none" };
  await assertSucceeds(as("kid1").collection("techBuilds").add({ ...b, coachId: "coach1" }));
  await assertFails(as("kid1").collection("techBuilds").add({ ...b, coachId: "coach2" }));
  await assertFails(as("kid1").doc("techBuilds/b1").update({ coachId: "coach2" }));
});

test("a guardian sees their own child's TECH work, and nobody else's", async () => {
  const mum = as("mum");
  await assertSucceeds(mum.doc("techStudents/kid1").get());
  await assertSucceeds(mum.collection("techBuilds").where("studentId", "==", "kid1").get());
  await assertSucceeds(mum.doc("techProgress/kid1").get());
  await assertSucceeds(mum.collection("techBuilds/b1/feedback").get());
  await assertFails(mum.doc("techStudents/kid2").get());
  await assertFails(mum.collection("techBuilds").where("studentId", "==", "kid2").get());
  await assertFails(mum.doc("techBuilds/b1").update({ title: "x" }));
  await assertFails(mum.collection("techGuardianLinks").add({ parentUid: "mum", studentUid: "kid2" }));
});

test("guardian <-> coach chat: right coach only, right sender role only", async () => {
  const chat = { parentUid: "mum", parentName: "Mum", studentId: "kid1", studentName: "Kid One", coachName: "Coach One", lastMessage: "" };
  await assertFails(as("mum").doc("techGuardianChats/mum_kid1").set({ ...chat, coachId: "coach2" }));
  await assertSucceeds(as("mum").doc("techGuardianChats/mum_kid1").set({ ...chat, coachId: "coach1" }));
  await assertSucceeds(as("mum").collection("techGuardianChats/mum_kid1/messages").add({ senderId: "mum", senderRole: "guardian", text: "Hi" }));
  await assertFails(as("mum").collection("techGuardianChats/mum_kid1/messages").add({ senderId: "mum", senderRole: "coach", text: "Hi" }));
  await assertSucceeds(as("coach1").collection("techGuardianChats").where("coachId", "==", "coach1").get());
  await assertSucceeds(as("coach1").collection("techGuardianChats/mum_kid1/messages").add({ senderId: "coach1", senderRole: "coach", text: "Hello" }));
  await assertFails(as("coach2").doc("techGuardianChats/mum_kid1").get());
  await assertFails(as("kid2").doc("techGuardianChats/mum_kid1").get());
});

test("a guardian cannot open a chat about a child they are not linked to", async () => {
  await assertFails(as("mum").doc("techGuardianChats/mum_kid2").set({ parentUid: "mum", studentId: "kid2", coachId: "coach2" }));
});

test("TECH notifications: recipient only, and only the read flag", async () => {
  await assertSucceeds(as("mum").collection("techNotifications").where("recipientId", "==", "mum").get());
  await assertFails(as("kid1").doc("techNotifications/n1").get());
  await assertSucceeds(as("mum").doc("techNotifications/n1").update({ read: true }));
  await assertFails(as("mum").doc("techNotifications/n1").update({ title: "changed" }));
  await assertFails(as("mum").collection("techNotifications").add({ recipientId: "mum", title: "spoof" }));
});

test("a builder can keep editing an approved build and take it off the Wall", async () => {
  await assertSucceeds(as("kid1").doc("techBuilds/b3").update({ title: "Wall v2" }));
  await assertSucceeds(as("kid1").doc("techShowcase/b3").delete());
  await assertSucceeds(as("kid1").doc("techBuilds/b3").update({ showcase: "none" }));
  await assertFails(as("kid1").doc("techBuilds/b3").update({ showcase: "approved" }));
  await assertFails(as("kid1").doc("techBuilds/b1").update({ reviewState: "approved" }));
});

test("a coach approves their own builder's build for the Wall, and moves its stage", async () => {
  await assertSucceeds(as("coach1").doc("techShowcase/b1").set({ buildId: "b1", title: "Bot" }));
  await assertSucceeds(as("coach1").doc("techBuilds/b1").update({ showcase: "approved", status: "READY", progress: 100 }));
  await assertFails(as("coach2").doc("techShowcase/b1").set({ buildId: "b1" }));
  await assertFails(as("kid1").doc("techShowcase/b1").set({ buildId: "b1" }));
});

test("family share links: the builder and their coach only", async () => {
  await assertSucceeds(as("kid1").doc("shareTokens/b1").set({ token: "t", revoked: false }));
  await assertSucceeds(as("coach1").doc("shareTokens/b1").set({ revoked: true }, { merge: true }));
  await assertFails(as("kid2").doc("shareTokens/b1").get());
  await assertFails(as("mum").doc("shareTokens/b1").get());
});

test("coach accounts are created by admins only", async () => {
  await assertFails(as("tutor1").doc("techCoaches/tutor1").set({ name: "Me", status: "Active" }));
  await assertSucceeds(as("admin1").doc("techCoaches/coach3").set({ name: "C3", status: "Active" }));
});
