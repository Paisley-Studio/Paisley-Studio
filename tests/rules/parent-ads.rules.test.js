/* Firestore rules: only admins run ads and newsletters; parents read what is live.
 *   npm i --no-save @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "node --test tests/rules/parent-ads.rules.test.js"
 */
const test = require("node:test");
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "paisley-ads-rules", firestore: { rules: fs.readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("admins/admin1").set({ name: "Desk" });
    await db.doc("tutorAccounts/tutor1").set({ name: "Tutor", status: "Active" });
    await db.doc("techCoaches/coach1").set({ name: "Coach", status: "Active" });
    await db.doc("students/kid1").set({ name: "Kid", status: "Active" });
    await db.doc("parentAccounts/mum").set({ name: "Mum", email: "mum@x.com" });
    await db.doc("parentAccounts/dad").set({ name: "Dad", email: "dad@x.com" });
    await db.doc("parentAds/live1").set({ status: "live", headline: "Offer" });
    await db.doc("parentAds/draft1").set({ status: "draft", headline: "Secret" });
    await db.doc("parentNewsletters/sent1").set({ published: true, status: "sent", subject: "s", sentAt: new Date() });
    await db.doc("parentNewsletters/draft1").set({ published: false, status: "draft", subject: "d" });
    await db.doc("parentNewsletters/sent1/deliveries/mum").set({ at: new Date() });
    await db.doc("parentNewsletterPrefs/dad").set({ emailOptOut: true, optOutSource: "email-link" });
  });
});
test.after(async () => { await env.cleanup(); });

const ad = { status: "live", headline: "Mine" };
for (const who of ["tutor1", "coach1", "kid1", "mum"]) {
  test(`${who} cannot run an ad or a newsletter`, async () => {
    await assertFails(as(who).collection("parentAds").add(ad));
    await assertFails(as(who).doc("parentAds/live1").update({ headline: "x" }));
    await assertFails(as(who).doc("parentAds/live1").delete());
    await assertFails(as(who).collection("parentNewsletters").add({ subject: "x" }));
    await assertFails(as(who).doc("parentNewsletters/sent1").update({ subject: "x" }));
  });
}
test("admin runs ads and newsletters, and sees drafts", async () => {
  const db = as("admin1");
  await assertSucceeds(db.collection("parentAds").add(ad));
  await assertSucceeds(db.doc("parentAds/draft1").get());
  await assertSucceeds(db.collection("parentNewsletters").add({ subject: "x", status: "draft", published: false }));
  await assertSucceeds(db.doc("parentNewsletters/draft1").get());
  await assertSucceeds(db.doc("parentNewsletters/sent1/deliveries/mum").get());
});
test("parents read live ads and sent newsletters, and nothing else", async () => {
  const db = as("mum");
  await assertSucceeds(db.collection("parentAds").where("status", "==", "live").get());
  await assertSucceeds(db.doc("parentAds/live1").get());
  await assertFails(db.doc("parentAds/draft1").get());
  await assertFails(db.collection("parentAds").get());
  await assertSucceeds(db.collection("parentNewsletters").where("published", "==", true).get());
  await assertFails(db.doc("parentNewsletters/draft1").get());
  await assertFails(db.doc("parentNewsletters/sent1/deliveries/mum").get());
});
test("tutors, students and strangers do not get parent ads", async () => {
  await assertFails(as("tutor1").doc("parentAds/live1").get());
  await assertFails(as("kid1").doc("parentAds/live1").get());
  await assertFails(env.unauthenticatedContext().firestore().doc("parentAds/live1").get());
});
test("a parent controls only their own email choice", async () => {
  const db = as("mum");
  await assertSucceeds(db.doc("parentNewsletterPrefs/mum").set({ emailOptOut: true }, { merge: true }));
  await assertSucceeds(db.doc("parentNewsletterPrefs/mum").set({ emailOptOut: false }, { merge: true }));
  await assertFails(db.doc("parentNewsletterPrefs/dad").set({ emailOptOut: false }, { merge: true }));
  await assertFails(db.doc("parentNewsletterPrefs/dad").get());
  await assertFails(db.doc("parentNewsletterPrefs/mum").set({ somethingElse: 1 }, { merge: true }));
  /* A parent who unsubscribed by email link can still turn newsletters back on. */
  await assertSucceeds(as("dad").doc("parentNewsletterPrefs/dad").set({ emailOptOut: false }, { merge: true }));
  await assertFails(as("tutor1").doc("parentNewsletterPrefs/tutor1").set({ emailOptOut: true }));
});
