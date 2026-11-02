/* Storage rules tests for Paisley Tech Studio build files (techBuilds/{studentId}/{buildId}/{file}).
 *   firebase emulators:exec --project paisley-tech-storage --only firestore,storage "node --test tests/rules/tech.storage.test.js"
 * (--project must match the projectId below: storage rules read Firestore under the emulator's project.)
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const st = (uid) => env.authenticatedContext(uid).storage();
const file = () => new Uint8Array([1, 2, 3]);
const meta = { contentType: "image/png" };

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "paisley-tech-storage",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
    storage: { rules: fs.readFileSync("storage.rules", "utf8") }
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("techCoaches/coach1").set({ status: "Active" });
    await db.doc("techCoaches/paused").set({ status: "Inactive" });
    await db.doc("techStudents/kid1").set({ status: "Active", coachId: "coach1" });
    await db.doc("techStudents/pend").set({ status: "Pending" });
    await db.doc("techGuardianLinks/mum_kid1").set({ parentUid: "mum", studentUid: "kid1" });
    await db.doc("techBuilds/b1").set({ studentId: "kid1", coachId: "coach1" });
    await db.doc("techBuilds/bp").set({ studentId: "pend" });
    await ctx.storage().ref("techBuilds/kid1/b1/seed.png").put(file(), meta);
  });
});
test.after(async () => { await env.cleanup(); });

test("an active builder uploads into their own build only", async () => {
  await assertSucceeds(st("kid1").ref("techBuilds/kid1/b1/a.png").put(file(), meta));
  await assertFails(st("kid1").ref("techBuilds/kid1/bp/a.png").put(file(), meta));
  await assertFails(st("pend").ref("techBuilds/pend/bp/a.png").put(file(), meta));
  await assertFails(st("kid1").ref("techBuilds/kid1/b1/a.html").put(file(), { contentType: "text/html" }));
});

test("builder, active coach and linked guardian can read build files", async () => {
  await assertSucceeds(st("kid1").ref("techBuilds/kid1/b1/seed.png").getMetadata());
  await assertSucceeds(st("coach1").ref("techBuilds/kid1/b1/seed.png").getMetadata());
  await assertSucceeds(st("mum").ref("techBuilds/kid1/b1/seed.png").getMetadata());
  await assertFails(st("paused").ref("techBuilds/kid1/b1/seed.png").getMetadata());
  await assertFails(st("stranger").ref("techBuilds/kid1/b1/seed.png").getMetadata());
});

test("mission materials: the mission's coach or an admin uploads; TECH members read", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("techCoaches/coach2").set({ status: "Active" });
    await ctx.firestore().doc("admins/admin1").set({ name: "Desk" });
    await ctx.firestore().doc("techContent/m1").set({ createdBy: "coach1", kind: "mission", status: "draft" });
  });
  const video = { contentType: "video/mp4" }, pdf = { contentType: "application/pdf" };
  await assertSucceeds(st("coach1").ref("techContent/m1/intro.mp4").put(file(), video));
  await assertSucceeds(st("coach1").ref("techContent/m1/notes.pdf").put(file(), pdf));
  await assertSucceeds(st("admin1").ref("techContent/m1/extra.pdf").put(file(), pdf));
  await assertFails(st("coach2").ref("techContent/m1/x.mp4").put(file(), video));
  await assertFails(st("kid1").ref("techContent/m1/x.png").put(file(), meta));
  await assertFails(st("coach1").ref("techContent/m1/x.html").put(file(), { contentType: "text/html" }));
  await assertSucceeds(st("kid1").ref("techContent/m1/intro.mp4").getMetadata());
  await assertFails(st("stranger").ref("techContent/m1/intro.mp4").getMetadata());
});

test("navigation video: only admins upload; only active builders and admins get it", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("admins/desk").set({ name: "Desk" });
    await ctx.storage().ref("techSettings/navVideo/seed.mp4").put(file(), { contentType: "video/mp4" });
  });
  const path = "techSettings/navVideo/seed.mp4";
  await assertSucceeds(st("kid1").ref(path).getMetadata());
  await assertSucceeds(st("desk").ref(path).getMetadata());
  await assertFails(st("pend").ref(path).getMetadata());
  await assertFails(st("mum").ref(path).getMetadata());
  await assertFails(st("stranger").ref(path).getMetadata());
  await assertSucceeds(st("desk").ref("techSettings/navVideo/new.mp4").put(file(), { contentType: "video/mp4" }));
  await assertFails(st("desk").ref("techSettings/navVideo/new.png").put(file(), meta));
  await assertFails(st("kid1").ref("techSettings/navVideo/kid.mp4").put(file(), { contentType: "video/mp4" }));
  await assertFails(st("coach1").ref("techSettings/navVideo/c.mp4").put(file(), { contentType: "video/mp4" }));
  await assertFails(st("kid1").ref(path).delete());
});
