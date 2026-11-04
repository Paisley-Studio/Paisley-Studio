// Homework number order (lmzWorkOrder) and the Renew notice (handleWorkWrite branch 1c).
// Run: cd functions && npm test        (uses node:test; no Firebase needed)
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const W = require("../work-shared");

function loadLms() {
  const box = { console, firebase: { firestore: { FieldValue: {} } }, db: {} };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "lms-helpers.js"), "utf8"), box);
  return box;
}
const L = loadLms();

test("homework lists go in number order, then unnumbered work oldest first", () => {
  const titles = ["Homework 10", "Homework 2", "Fractions recap", "Homework 1", "HW 3: algebra", "Algebra intro", "Homework 2b"];
  const items = titles.map((t, i) => ({ title: t, createdAt: new Date(2026, 0, 10 - i) }));
  assert.deepEqual(items.sort(L.lmzWorkOrder).map((x) => x.title),
    ["Homework 1", "Homework 2", "Homework 2b", "HW 3: algebra", "Homework 10", "Algebra intro", "Fractions recap"]);
});

/* A fake of the few work-shared calls the trigger makes. */
function fakeW(item) {
  const sent = [], claims = new Set(), saved = {};
  const doc = (p) => ({ get: async () => ({ exists: p.indexOf("/submissions/") === -1, data: () => (p.startsWith("students/") ? { name: "Ann", email: "ann@example.com" } : item) }) });
  const names = ["db", "claimOnce", "notify", "parentsOfStudent", "sendEmail", "addStudentNotice", "classroomOf"];
  names.forEach((n) => { saved[n] = W[n]; });
  W.db = () => ({ doc, collection: (c) => ({ doc: (id) => doc(c + "/" + id) }) });
  W.claimOnce = async (k) => { if (claims.has(k)) return false; claims.add(k); return true; };
  W.notify = async (uid, role, n) => { sent.push({ uid, role, n }); };
  W.parentsOfStudent = async () => [{ id: "par1", name: "Pat", email: "pat@example.com" }];
  W.sendEmail = async () => { sent.push({ email: true }); };
  W.addStudentNotice = async () => { sent.push({ notice: true }); };
  W.classroomOf = async () => ({});
  return { sent, restore: () => names.forEach((n) => { W[n] = saved[n]; }) };
}
function ev(before, after) {
  return {
    params: { cid: "maths_y10", tid: "t1", aid: "hw1", studentId: "s1" },
    data: { before: { exists: !!before, data: () => before }, after: { exists: !!after, data: () => after } }
  };
}

test("Renew tells the student and parents the work is open again, once, without a corrections email", async () => {
  const f = fakeW({ title: "Homework 4", subjectName: "Maths" });
  try {
    const work = require("../work");
    const graded = { status: "Graded", released: true, grade: 5, maxScore: 5, gradedAt: new Date(2026, 9, 1) };
    const renewed = Object.assign({}, graded, { status: "Corrections", grade: null, maxScore: null, renewedAt: new Date(2026, 9, 2), renewNote: "Now do 6 to 10" });
    await work.onSubmissionWritten.run(ev(graded, renewed));
    assert.equal(f.sent.filter((x) => x.email).length, 0, "no corrections email");
    const notes = f.sent.filter((x) => x.n);
    assert.deepEqual(notes.map((x) => x.uid), ["s1", "par1"]);
    assert.match(notes[0].n.title, /open again/);
    assert.match(notes[0].n.message, /Now do 6 to 10/);
    await work.onSubmissionWritten.run(ev(graded, renewed));
    assert.equal(f.sent.filter((x) => x.n).length, 2, "a retried trigger does not notify twice");
    // A later real "Corrections" (new gradedAt, same renewedAt) is the normal corrections path.
    const corr = Object.assign({}, renewed, { gradedAt: new Date(2026, 9, 5), feedback: "fix q7" });
    f.sent.length = 0;
    await work.onSubmissionWritten.run(ev(Object.assign({}, renewed, { status: "Submitted" }), corr));
    assert.ok(f.sent.some((x) => x.n && /corrections requested/i.test(x.n.title)));
  } finally { f.restore(); }
});
