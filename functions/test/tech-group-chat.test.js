// Run: cd functions && npm test        (node:test; no Firebase needed)
// Group chat: who gets a push, message previews, and the web push message shape.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../tech")._internals;
const push = require("../push");

const NOW = 1_800_000_000_000;
const ts = (ms) => ({ toMillis: () => ms });
const grp = { name: "Team", memberIds: ["a", "b", "c"], coachId: "coach" };

test("teammates who are not in the chat get a push; the sender never does", () => {
  const pres = { b: { online: true, seenAt: ts(NOW - 20 * 1000) } };          // b has the chat open
  const out = T.chatPushTargets(grp, { senderId: "a", senderRole: "student" }, pres, NOW, true);
  assert.deepEqual(out, [{ uid: "c", role: "student" }, { uid: "coach", role: "coach" }]);
});

test("someone who left the chat or went quiet is pushed again", () => {
  const pres = { b: { online: false, seenAt: ts(NOW - 5 * 1000) }, c: { online: true, seenAt: ts(NOW - 10 * 60 * 1000) } };
  const out = T.chatPushTargets(grp, { senderId: "a", senderRole: "student" }, pres, NOW, true).map((x) => x.uid);
  assert.deepEqual(out, ["b", "c", "coach"]);
});

test("the coach hears builders only, and only when the group has a real coach", () => {
  assert.ok(!T.chatPushTargets(grp, { senderId: "coach", senderRole: "coach" }, {}, NOW, true).some((x) => x.role === "coach"));
  assert.ok(!T.chatPushTargets(grp, { senderId: "a", senderRole: "student" }, {}, NOW, false).some((x) => x.role === "coach"));
  assert.deepEqual(T.chatPushTargets(grp, { senderId: "coach", senderRole: "coach" }, {}, NOW, true).map((x) => x.uid), ["a", "b", "c"]);
});

test("previews say what was sent", () => {
  assert.equal(T.groupChatPreview({ text: "I'll do\nthe   CSS" }), "I'll do the CSS");
  assert.equal(T.groupChatPreview({ voice: { url: "https://x" } }), "Voice note");
  assert.equal(T.groupChatPreview({ attachments: [{ type: "image/png" }, { type: "image/jpeg" }] }), "2 photos");
  assert.equal(T.groupChatPreview({ attachments: [{ type: "application/pdf", name: "plan.pdf" }] }), "plan.pdf");
});

test("web push message: absolute https link, icon, collapsing tag", () => {
  const m = push._buildMessage(["t1"], { title: "Team", body: "Ann: hi", link: "/tech/dashboard#groups", tag: "tgchat_g1" });
  assert.deepEqual(m.tokens, ["t1"]);
  assert.match(m.webpush.fcmOptions.link, /^https:\/\/[^/]+\/tech\/dashboard#groups$/);
  assert.equal(m.data.link, m.webpush.fcmOptions.link);
  assert.equal(m.webpush.notification.tag, "tgchat_g1");
  assert.equal(m.webpush.notification.renotify, true);
  assert.match(m.webpush.notification.icon, /icon-192\.png$/);
  const abs = push._buildMessage(["t"], { title: "x", link: "https://paisleystudio.online/tech" });
  assert.equal(abs.webpush.fcmOptions.link, "https://paisleystudio.online/tech");
});
