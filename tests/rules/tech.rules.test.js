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
    await db.doc("techCoachInvites/new@x.com").set({ name: "New Coach", email: "New@x.com", slug: "new-coach", uid: "nc1" });
    await db.doc("techCoachInvites/tutor@x.com").set({ name: "Tutor Coach", email: "tutor@x.com", slug: "tutor-coach" });
    await db.doc("techCoachSlugs/new-coach").set({ slug: "new-coach", name: "New Coach", email: "new@x.com", status: "Active" });
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

const asEmail = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
const coachDoc = (email, slug) => ({ name: "C", email, phone: "", disciplines: [], bio: "", slug, status: "Active" });

test("an invited coach claims their coach account on first sign-in", async () => {
  await assertSucceeds(asEmail("nc1", "new@x.com").doc("techCoachInvites/new@x.com").get());
  await assertSucceeds(asEmail("nc1", "new@x.com").doc("techCoaches/nc1").set(coachDoc("New@x.com", "new-coach")));
  await assertSucceeds(asEmail("nc1", "new@x.com").doc("techCoachInvites/new@x.com").update({ uid: "nc1" }));
});

test("an existing login (no uid on the invite) can claim it too", async () => {
  await assertSucceeds(asEmail("t9", "tutor@x.com").doc("techCoaches/t9").set(coachDoc("tutor@x.com", "tutor-coach")));
});

test("coach claims are locked to the invited email, uid, slug and Active status", async () => {
  await assertFails(asEmail("other", "new@x.com").doc("techCoaches/other").set(coachDoc("new@x.com", "new-coach")));
  await assertFails(asEmail("x1", "nobody@x.com").doc("techCoaches/x1").set(coachDoc("nobody@x.com", "")));
  await assertFails(asEmail("t8", "tutor@x.com").doc("techCoaches/t8").set({ ...coachDoc("tutor@x.com", "tutor-coach"), status: "Inactive" }));
  await assertFails(asEmail("t7", "tutor@x.com").doc("techCoaches/t7").set(coachDoc("tutor@x.com", "someone-else")));
  await assertFails(asEmail("x2", "nobody@x.com").doc("techCoachInvites/tutor@x.com").get());
});

test("coach links are public to read, admin-only to write", async () => {
  await assertSucceeds(env.unauthenticatedContext().firestore().doc("techCoachSlugs/new-coach").get());
  await assertFails(as("coach1").doc("techCoachSlugs/mine").set({ name: "x" }));
  await assertSucceeds(as("admin1").doc("techCoachSlugs/mine").set({ name: "x" }));
});

test("coach accounts are created by admins only", async () => {
  await assertFails(as("tutor1").doc("techCoaches/tutor1").set({ name: "Me", status: "Active" }));
  await assertSucceeds(as("admin1").doc("techCoaches/coach3").set({ name: "C3", status: "Active" }));
});

/* ---------- TECH experience: submissions, grading, practice, activity, live classes, family desk ---------- */
const { serverTimestamp } = require("firebase/firestore");
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

test("builders submit snapshots but can never grade themselves", async () => {
  await assertSucceeds(as("kid1").doc("techBuilds/b1/submissions/s1").set({ studentId: "kid1", version: 1, status: "submitted", writingHtml: "<p>hi</p>" }));
  await assertFails(as("kid1").doc("techBuilds/b1/submissions/s2").set({ studentId: "kid1", version: 2, status: "submitted", gradeLabel: "Exceeding" }));
  await assertFails(as("kid1").doc("techBuilds/b1/submissions/s3").set({ studentId: "kid1", version: 3, status: "approved" }));
  await assertFails(as("kid2").doc("techBuilds/b1/submissions/s4").set({ studentId: "kid2", version: 1, status: "submitted" }));
  await assertFails(as("kid1").doc("techBuilds/b1").update({ gradeLabel: "Exceeding" }));
  await assertFails(as("kid1").doc("techBuilds/b1").update({ reviewNote: "great" }));
  await assertSucceeds(as("kid1").doc("techBuilds/b1").update({ reviewState: "requested", aiReflection: { tools: ["None"], purpose: "x", contribution: "y" }, submissionCount: 1 }));
});

test("the coach grades and reviews; the guardian only reads", async () => {
  await seed((db) => db.doc("techBuilds/b1/submissions/g1").set({ studentId: "kid1", version: 1, status: "submitted" }));
  await assertSucceeds(as("coach1").doc("techBuilds/b1").update({ reviewState: "changes", gradeLabel: "Approaching", gradeScore: 55, reviewNote: "Add sources", criteriaScores: [] }));
  await assertSucceeds(as("coach1").doc("techBuilds/b1/submissions/g1").update({ status: "changes", gradeLabel: "Approaching", reviewNote: "Add sources" }));
  await assertFails(as("coach1").doc("techBuilds/b1/submissions/g1").update({ writingHtml: "tampered" }));
  await assertFails(as("coach2").doc("techBuilds/b1/submissions/g1").update({ status: "approved" }));
  await assertSucceeds(as("mum").doc("techBuilds/b1/submissions/g1").get());
  await assertFails(as("mum").doc("techBuilds/b1/submissions/g9").set({ studentId: "kid1", version: 9, status: "submitted" }));
  await assertFails(as("mum").doc("techBuilds/b1").update({ title: "changed by parent" }));
});

test("practice: the builder owns it, their coach reads it and leaves notes", async () => {
  await assertSucceeds(as("kid1").doc("techPractice/p1").set({ studentId: "kid1", title: "Loops", type: "code" }));
  await assertFails(as("kid1").doc("techPractice/p2").set({ studentId: "kid1", title: "x", coachNote: "self note" }));
  await assertFails(as("kid2").doc("techPractice/p3").set({ studentId: "kid1", title: "x" }));
  await assertSucceeds(as("coach1").doc("techPractice/p1").get());
  await assertSucceeds(as("coach1").doc("techPractice/p1").update({ coachNote: "Try a for loop", coachNoteBy: "Coach One", helpRequested: false }));
  await assertFails(as("coach1").doc("techPractice/p1").update({ title: "renamed" }));
  await assertFails(as("coach2").doc("techPractice/p1").get());
  await assertFails(as("kid1").doc("techPractice/p1").update({ coachNote: "edited" }));
});

test("activity: builders append real, server-stamped events; history is read-only", async () => {
  const ev = { studentId: "kid1", studentName: "Kid One", type: "project_opened", label: "Opened Bot", buildId: "b1", at: serverTimestamp() };
  await assertSucceeds(as("kid1").collection("techActivity").add(ev));
  await assertFails(as("kid1").collection("techActivity").add({ ...ev, at: new Date("2020-01-01") }));
  await assertFails(as("kid1").collection("techActivity").add({ ...ev, type: "mastered" }));
  await assertFails(as("kid1").collection("techActivity").add({ ...ev, studentId: "kid2" }));
  await seed((db) => db.doc("techActivity/a1").set({ studentId: "kid1", type: "session", label: "x", at: new Date() }));
  await assertSucceeds(as("coach1").collection("techActivity").where("studentId", "==", "kid1").get());
  await assertSucceeds(as("mum").collection("techActivity").where("studentId", "==", "kid1").get());
  await assertFails(as("coach2").collection("techActivity").where("studentId", "==", "kid1").get());
  await assertFails(as("kid1").doc("techActivity/a1").update({ label: "y" }));
  await assertSucceeds(as("kid1").doc("techStudents/kid1").update({ lastActiveAt: serverTimestamp() }));
});

test("live classes: invited builders and their guardians see them; coaches only target their own", async () => {
  await seed(async (db) => {
    await db.doc("techLiveClasses/all1").set({ topic: "AI art", audience: "all", studentIds: [], coachId: "coach1", status: "scheduled", parentUids: ["mum"] });
    await db.doc("techLiveClasses/sel1").set({ topic: "Games", audience: "selected", studentIds: ["kid2"], coachId: "coach2", status: "scheduled", parentUids: [] });
  });
  await assertSucceeds(as("kid1").collection("techLiveClasses").where("audience", "==", "all").get());
  await assertSucceeds(as("kid2").collection("techLiveClasses").where("studentIds", "array-contains", "kid2").get());
  await assertFails(as("kid1").doc("techLiveClasses/sel1").get());
  await assertSucceeds(as("mum").collection("techLiveClasses").where("parentUids", "array-contains", "mum").get());
  await assertFails(as("mum").doc("techLiveClasses/sel1").get());
  await assertSucceeds(as("coach1").collection("techLiveClasses").add({ topic: "Mine", audience: "selected", studentIds: ["kid1"], coachId: "coach1", status: "scheduled" }));
  await assertFails(as("coach1").collection("techLiveClasses").add({ topic: "Everyone", audience: "all", studentIds: [], coachId: "coach1", status: "scheduled" }));
  await assertFails(as("coach1").collection("techLiveClasses").add({ topic: "Peek", audience: "selected", studentIds: ["kid1"], coachId: "coach1", parentUids: ["stranger"] }));
  await assertFails(as("coach1").doc("techLiveClasses/sel1").update({ topic: "not mine" }));
  await assertFails(as("kid1").collection("techLiveClasses").add({ topic: "x", audience: "all", coachId: "kid1" }));
  await assertSucceeds(as("admin1").collection("techLiveClasses").add({ topic: "Desk", audience: "all", studentIds: [], coachId: "", status: "scheduled" }));
});

test("TECH guardians can message the Studio Desk through parentConversations", async () => {
  await assertSucceeds(as("mum").doc("parentConversations/mum_kid1").set({ parentUid: "mum", studentUid: "kid1", programme: "tech", lastMessage: "Hi", unreadForAdmin: true }));
  await assertSucceeds(as("mum").doc("parentConversations/mum_kid1/messages/m1").set({ senderUid: "mum", senderRole: "parent", text: "Hi" }));
  await assertFails(as("mum").doc("parentConversations/mum_kid2").set({ parentUid: "mum", studentUid: "kid2", programme: "tech" }));
  await assertFails(as("mum").doc("parentConversations/mum_kid1/messages/m2").set({ senderUid: "mum", senderRole: "admin", text: "spoof" }));
  await assertFails(as("kid1").doc("parentConversations/mum_kid1/messages/m3").get());
});
