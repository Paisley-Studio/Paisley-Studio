/* Firestore rules tests for developer mode (Admin > Settings > Developer mode):
 * siteStatus/maintenance (public banner), devMode/freeze, devHeld.
 *
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/dev-mode.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-devmode-rules", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("students/s1").set({ name: "Stu", status: "Active" });
    await db.doc("siteStatus/maintenance").set({ on: true, title: "Work", message: "Back soon" });
    await db.doc("devMode/freeze").set({ on: true, areas: { classes: true } });
    await db.doc("devHeld/h1").set({ kind: "email", area: "classes", subject: "New lesson" });
  });
});
test.after(async () => { await env.cleanup(); });

test("everyone, even signed out, can read the maintenance banner; only admins change it", async () => {
  await assertSucceeds(anon().doc("siteStatus/maintenance").get());
  await assertSucceeds(as("s1").doc("siteStatus/maintenance").get());
  await assertFails(as("s1").doc("siteStatus/maintenance").set({ on: false }));
  await assertFails(anon().collection("siteStatus").get());
  await assertSucceeds(as("admin1").doc("siteStatus/maintenance").set({ on: true, title: "Upgrade", message: "Some pages may be slow.", tone: "warn", startsAt: new Date(), endsAt: null }));
  await assertFails(as("admin1").doc("siteStatus/maintenance").set({ on: true, script: "<b>x</b>" }), "no unknown fields");
  await assertFails(as("admin1").doc("siteStatus/maintenance").set({ on: "yes" }));
  await assertFails(as("admin1").doc("siteStatus/maintenance").set({ on: true, message: "x".repeat(401) }));
  await assertFails(as("admin1").doc("siteStatus/other").set({ on: true }));
});

test("the freeze setting is admin only", async () => {
  await assertFails(anon().doc("devMode/freeze").get());
  await assertFails(as("s1").doc("devMode/freeze").get());
  await assertFails(as("s1").doc("devMode/freeze").set({ on: false }));
  await assertSucceeds(as("admin1").doc("devMode/freeze").get());
  await assertSucceeds(as("admin1").doc("devMode/freeze").set({ on: false, areas: {}, audiences: {}, allow: [] }));
  await assertFails(as("admin1").doc("devMode/other").set({ on: true }));
});

test("held items: admins read and clear them, nobody writes them", async () => {
  await assertFails(as("s1").doc("devHeld/h1").get());
  await assertSucceeds(as("admin1").collection("devHeld").get());
  await assertFails(as("admin1").collection("devHeld").add({ kind: "email" }));
  await assertFails(as("admin1").doc("devHeld/h1").update({ subject: "x" }));
  await assertSucceeds(as("admin1").doc("devHeld/h1").delete());
});
