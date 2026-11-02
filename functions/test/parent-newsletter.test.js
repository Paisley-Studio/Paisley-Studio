// Run: cd functions && npm test
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../parent-newsletter")._internals;
const { templates } = require("../email-templates");
const Tech = require("../tech")._internals;

test("recipients: one send per email, opted-out and already-delivered parents left out", () => {
  const parents = [
    { uid: "a", email: "a@x.com", name: "A" },
    { uid: "a2", email: "A@X.com", name: "A again" },
    { uid: "b", email: "b@x.com" },
    { uid: "c", email: "c@x.com" },
    { uid: "d", email: "not-an-email" },
    { uid: "e" }
  ];
  const out = N.buildRecipients(parents, new Set(["b"]), new Set(["c"]));
  assert.deepEqual(out.map((p) => p.uid), ["a"]);
});

test("audience: Tech Studio-only guardians are not emailed", () => {
  const out = N.mainPortalParents([{ uid: "p1" }, { uid: "techOnly" }], [{ parentUid: "p1", studentUid: "k" }]);
  assert.deepEqual(out.map((p) => p.uid), ["p1"]);
});

test("claim: a sent newsletter never goes twice; a stuck send can be picked up", () => {
  const now = Date.now();
  assert.ok(N.claimError("sent", 0, now));
  assert.ok(N.claimError("sending", now - 60000, now));
  assert.equal(N.claimError("sending", now - 3600000, now), "");
  assert.equal(N.claimError("draft", 0, now), "");
  assert.equal(N.claimError("partial", 0, now), "");
  assert.equal(N.claimError("failed", 0, now), "");
});

test("content: needs a subject and something to read or watch", () => {
  assert.ok(N.checkContent({ body: "x" }));
  assert.ok(N.checkContent({ subject: "x" }));
  assert.equal(N.checkContent({ subject: "x", body: "y" }), "");
  assert.equal(N.checkContent({ subject: "x", imageUrl: "https://a/b.png" }), "");
});

test("unsubscribe token: valid only for its own parent", () => {
  const t = N.unsubToken("u1", "key");
  assert.equal(N.tokenOk("u1", t, "key"), true);
  assert.equal(N.tokenOk("u2", t, "key"), false);
  assert.equal(N.tokenOk("u1", t, "other"), false);
  assert.equal(N.tokenOk("u1", "", "key"), false);
  assert.match(N.unsubUrl("u1", "key"), /parentNewsletterUnsubscribe\?u=u1&t=/);
});

test("runPool: stops when told, and reports how many it started", async () => {
  const seen = [];
  const started = await N.runPool([1, 2, 3, 4], 1, async (x) => { seen.push(x); }, () => seen.length >= 2);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(started, 2);
});

test("newsletter email: Paisley colours, escaped text, unsubscribe link, video as a button", () => {
  const { subject, html } = templates.parentNewsletter({
    newsletter: {
      subject: "Half term offer", body: "Line <b>one</b>\n\nLine two",
      imageUrl: "https://cdn.example.com/p.png", videoUrl: "https://cdn.example.com/v.mp4", ctaLabel: "Enrol", ctaUrl: "/tech"
    },
    parentName: "Asha Otieno", unsubUrl: "https://example.com/unsub?u=1&t=2"
  });
  assert.equal(subject, "Half term offer");
  assert.ok(!/linear-gradient|radial-gradient/.test(html), "no colour blends");
  assert.ok(html.includes("#245F5A"), "Paisley deep green");
  assert.ok(html.includes("#55BFB3"), "Paisley teal button");
  assert.ok(!/#D7263D|#0B0B0B|#0E7C47/i.test(html), "only Paisley colours");
  assert.ok(html.includes("Line &lt;b&gt;one&lt;/b&gt;"));
  assert.ok(html.includes("Hi Asha"));
  assert.ok(html.includes("Watch the video"));
  assert.ok(html.includes("https://cdn.example.com/p.png"));
  assert.ok(/\/tech"/.test(html), "relative button link is made absolute");
  assert.ok(html.includes("unsub?u=1&amp;t=2"));
  assert.ok(!/IGCSE|CBC|Tech Studio/.test(html), "no programme wording in the shared shell");
});

test("newsletter email: unsafe links are dropped", () => {
  const { html } = templates.parentNewsletter({
    newsletter: { subject: "s", body: "b", imageUrl: "http://x/y.png", videoUrl: "javascript:alert(1)", ctaLabel: "Go", ctaUrl: "//evil.example" },
    parentName: "", unsubUrl: "https://example.com/u"
  });
  assert.ok(!html.includes("http://x/y.png"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("evil.example"));
});

test("other emails keep their usual branded header", () => {
  const { render } = require("../email-templates");
  assert.ok(render({ heading: "x" }).includes("linear-gradient"));
});

test("Tech: AI is not a discipline of its own", () => {
  assert.equal(Tech.TECH_DISCIPLINES.indexOf("AI"), -1);
  assert.deepEqual(Tech.normDisciplines(["AI", "Coding", "Music", "Nonsense"]), ["Coding", "Music"]);
  assert.equal(Tech.disciplineLabel("Music"), "Music with AI");
  assert.equal(Tech.disciplineLabel("AI"), "Coding with AI");
});
