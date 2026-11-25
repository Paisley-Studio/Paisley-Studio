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

/* Practice projects (Practice lab, Advanced IDE) publish too, Python and friends included. */
const { practiceShowcase, practiceShowcaseContent, practiceShowcaseId, practiceLanguage, PRACTICE_CONTENT_KEYS } = require("../tech")._internals;

test("a published Python practice keeps its files, language and run file, and only a first name", () => {
  const p = {
    type: "advanced", title: "Guess my number", studentId: "kid", studentName: "Ada Lovelace", coachNote: "private note",
    ide: { v: 1, lang: "py", entry: "main.py" },
    codeFiles: [{ name: "main.py", lang: "py", content: "print('hi')" }, { name: "empty.py", lang: "py", content: "  " }],
    codeAssets: [{ name: "images/cat.png", url: "https://firebasestorage.googleapis.com/x", type: "image/png", storagePath: "techWork/kid/x" }, { name: "bad.png", url: "http://insecure/x", type: "image/png" }]
  };
  const sc = practiceShowcase(p, { name: "Ada Lovelace" });
  assert.equal(sc.displayName, "Ada");
  assert.equal(sc.language, "Python");
  assert.equal(sc.category, "CODE");
  assert.equal(sc.origin, "practice");
  assert.equal(sc.codeActive, "main.py");
  assert.deepEqual(sc.codeFiles.map((f) => f.name), ["main.py"]);
  assert.deepEqual(sc.codeAssets, [{ name: "images/cat.png", url: "https://firebasestorage.googleapis.com/x", type: "image/png" }]);
  assert.equal(JSON.stringify(sc).includes("private note"), false);
  assert.equal(JSON.stringify(sc).includes("storagePath"), false);
  assert.equal(practiceShowcaseId("abc/def"), "pr_abc_def");
});

test("practice language comes from the project, or from its files", () => {
  assert.equal(practiceLanguage({ ide: { lang: "java" } }), "Java");
  assert.equal(practiceLanguage({ type: "code", codeFiles: [{ name: "main.cpp" }] }), "C++");
  assert.equal(practiceLanguage({ type: "code", codeFiles: [{ name: "index.html" }, { name: "style.css" }] }), "Web page");
});

test("saving published practice refreshes the content fields only", () => {
  const b = { title: "A", codeFiles: [{ name: "main.py", content: "1" }], publishState: "approved" };
  assert.equal(changedAny(b, Object.assign({}, b, { coachNote: "x", updatedAt: 2 }), PRACTICE_CONTENT_KEYS), false);
  assert.equal(changedAny(b, Object.assign({}, b, { codeFiles: [{ name: "main.py", content: "2" }] }), PRACTICE_CONTENT_KEYS), true);
  const c = practiceShowcaseContent({ type: "writing", title: "My story", writingHtml: "<p>Hi</p>", codeFiles: [{ name: "x.py", content: "1" }] });
  assert.deepEqual(c.codeFiles, []);
  assert.equal(c.writingHtml, "<p>Hi</p>");
  assert.equal("displayName" in c, false, "a refresh never changes the name shown");
});
