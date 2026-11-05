// Published work stays live: a builder's saves refresh the public copy (techShowcase).
// Run: cd functions && npm test
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "paisley-test" });
const { buildShowcaseContent, liveWork, changedAny, workShowcase, BUILD_CONTENT_KEYS, WORK_CONTENT_KEYS } = require("../tech")._internals;

test("a saved project change is noticed; review and stage changes are not", () => {
  const b = { title: "Bot", codeFiles: [{ name: "index.html", content: "<h1>1</h1>" }], reviewState: "approved" };
  assert.equal(changedAny(b, Object.assign({}, b, { codeFiles: [{ name: "index.html", content: "<h1>2</h1>" }] }), BUILD_CONTENT_KEYS), true);
  assert.equal(changedAny(b, Object.assign({}, b, { reviewNote: "Nice", progress: 80 }), BUILD_CONTENT_KEYS), false);
});

test("the refreshed project copy has the new content and no private fields", () => {
  const c = buildShowcaseContent({
    title: "Bot", brief: "A bot", studentName: "Ann Smith", studentId: "s1", grade: "A",
    codeFiles: [{ name: "index.html", lang: "html", content: "<h1>New</h1>" }, { name: "empty.js", content: "  " }],
    files: [{ url: "https://x/a.png", name: "a.png", type: "image/png" }, { url: "javascript:alert(1)", name: "b.png" }],
    workUrl: "http://insecure", aiReflection: { tools: ["ChatGPT"], contribution: "All the CSS" }
  });
  assert.deepEqual(c.codeFiles.map((f) => f.name), ["index.html"]);
  assert.equal(c.images.length, 1); assert.equal(c.coverUrl, "https://x/a.png");
  assert.equal(c.previewUrl, "");
  assert.equal(c.contribution, "All the CSS");
  for (const k of ["studentName", "studentId", "grade", "displayName", "featured", "approvedBy", "publishedAt"]) assert.ok(!(k in c), k);
});

test("class work shows its published version once the builder has edited it", () => {
  const marked = { kind: "code", codeFiles: [{ name: "index.html", content: "<h1>marked</h1>" }], codeActive: "index.html" };
  assert.equal(workShowcase(liveWork(marked), null).codeFiles[0].content, "<h1>marked</h1>");
  const edited = Object.assign({}, marked, { liveAt: new Date(), liveCodeFiles: [{ name: "index.html", content: "<h1>better</h1>" }] });
  assert.equal(workShowcase(liveWork(edited), null).codeFiles[0].content, "<h1>better</h1>");
  assert.equal(edited.codeFiles[0].content, "<h1>marked</h1>", "the marked hand-in is untouched");
  assert.equal(changedAny(marked, edited, WORK_CONTENT_KEYS), true);
  assert.equal(changedAny(edited, Object.assign({}, edited, { publishNote: "x" }), WORK_CONTENT_KEYS), false);
});
