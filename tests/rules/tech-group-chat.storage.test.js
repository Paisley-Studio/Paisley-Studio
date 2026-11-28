/* Storage rules tests for group chat files and voice notes (techGroupChat/{gid}/m|staff/{uid}/{file}).
 *   firebase emulators:exec --project paisley-tech-storage --only firestore,storage "node --test tests/rules/tech-group-chat.storage.test.js"
 * (--project must match the projectId below: storage rules read Firestore under the emulator's project.)
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const st = (uid) => env.authenticatedContext(uid).storage();
const file = () => new Uint8Array([1, 2, 3]);

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "paisley-tech-storage",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
    storage: { rules: fs.readFileSync("storage.rules", "utf8") }
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/desk").set({ name: "Desk" });
    await db.doc("techCoaches/coach1").set({ status: "Active" });
    await db.doc("techGroups/g1").set({ name: "Team", memberIds: ["kid1", "kid2"], createdBy: "coach1" });
    await ctx.storage().ref("techGroupChat/g1/m/kid1/seed.webm").put(file(), { contentType: "audio/webm" });
  });
});
test.after(async () => { await env.cleanup(); });

test("members send voice notes, photos and files under their own name", async () => {
  await assertSucceeds(st("kid1").ref("techGroupChat/g1/m/kid1/v.webm").put(file(), { contentType: "audio/webm" }));
  await assertSucceeds(st("kid2").ref("techGroupChat/g1/m/kid2/plan.pdf").put(file(), { contentType: "application/pdf" }));
  await assertFails(st("kid1").ref("techGroupChat/g1/m/kid2/v.webm").put(file(), { contentType: "audio/webm" }));   // not me
  await assertFails(st("kid3").ref("techGroupChat/g1/m/kid3/v.webm").put(file(), { contentType: "audio/webm" }));   // not in the group
  await assertFails(st("kid1").ref("techGroupChat/g1/m/kid1/x.html").put(file(), { contentType: "text/html" }));
  await assertFails(st("kid1").ref("techGroupChat/g1/m/kid1/x.svg").put(file(), { contentType: "image/svg+xml" }));
  await assertFails(st("kid1").ref("techGroupChat/g1/staff/kid1/v.webm").put(file(), { contentType: "audio/webm" })); // staff folder
});

test("coaches and the desk send under staff/", async () => {
  await assertSucceeds(st("coach1").ref("techGroupChat/g1/staff/coach1/a.png").put(file(), { contentType: "image/png" }));
  await assertSucceeds(st("desk").ref("techGroupChat/g1/staff/desk/a.png").put(file(), { contentType: "image/png" }));
  await assertFails(st("kid1").ref("techGroupChat/g1/staff/coach1/a.png").put(file(), { contentType: "image/png" }));
});

test("members and coaches read; strangers do not", async () => {
  await assertSucceeds(st("kid2").ref("techGroupChat/g1/m/kid1/seed.webm").getMetadata());
  await assertSucceeds(st("coach1").ref("techGroupChat/g1/m/kid1/seed.webm").getMetadata());
  await assertFails(st("kid3").ref("techGroupChat/g1/m/kid1/seed.webm").getMetadata());
});
