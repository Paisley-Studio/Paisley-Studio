// Exam boards, the "new students start fresh" cutoff, paper students and the overdue report.
// Run: cd functions && npm test        (uses node:test; no Firebase needed)
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const W = require("../work-shared");
const { templates } = require("../email-templates");
const D = require("../deadlines")._internals;

const KS4 = "Key Stage 4 (Years 10-11) — IGCSE";

/* The browser helpers are plain globals, so load the real file into a sandbox. */
function loadLms() {
  const box = { console, firebase: { firestore: { FieldValue: {} } }, db: {} };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "lms-helpers.js"), "utf8"), box);
  return box;
}
const L = loadLms();

/* ---------- boards ---------- */
test("a student follows subjectBoards, then board, then Cambridge", () => {
  assert.equal(W.studentBoard({}, "maths"), "cambridge");
  assert.equal(W.studentBoard({ board: "edexcel" }, "maths"), "edexcel");
  assert.equal(W.studentBoard({ board: "edexcel", subjectBoards: { maths: "oxford_aqa" } }, "maths"), "oxford_aqa");
  assert.equal(W.studentBoard({ board: "edexcel", subjectBoards: { maths: "oxford_aqa" } }, "english"), "edexcel");
  assert.equal(W.boardOf({}), "cambridge");
});

test("a tutor with no boardScope teaches Cambridge only; boardScope decides otherwise", () => {
  const cam = { keyStage: KS4, subjectId: "english" }, edx = { keyStage: KS4, subjectId: "english", board: "edexcel" };
  assert.equal(W.tutorTeachesBoard({}, cam), true);
  assert.equal(W.tutorTeachesBoard({}, edx), false);
  const t = { boardScope: [`${KS4}|english|edexcel`] };
  assert.equal(W.tutorTeachesBoard(t, edx), true);
  assert.equal(W.tutorTeachesBoard(t, cam), false, "an Edexcel-only tutor does not get Cambridge");
  assert.equal(W.tutorTeachesBoard({}, { keyStage: "CBC Junior School (Grades 7-9)", subjectId: "cbc-english", board: "edexcel" }), true, "CBC has no boards");
});

test("browser and server agree on what a tutor covers", () => {
  const f = L.lmzTeachingWriteFields([{ keyStage: KS4, subjectId: "english", years: [10], boards: ["edexcel", "oxford_aqa"] }]);
  assert.deepEqual(Array.from(f.boardScope), [`${KS4}|english|edexcel`, `${KS4}|english|oxford_aqa`]);
  const t = { teaching: f.teaching, boardScope: f.boardScope };
  assert.equal(L.lmzTutorCovers(t, "english", KS4, 10, "edexcel"), true);
  assert.equal(L.lmzTutorCovers(t, "english", KS4, 10, "cambridge"), false);
  assert.equal(L.lmzTutorCovers(t, "english", KS4, 11, "edexcel"), false, "Years still apply");
  assert.equal(W.tutorTeachesBoard(t, { keyStage: KS4, subjectId: "english", board: "edexcel" }), true);
  assert.equal(W.tutorTeachesBoard(t, { keyStage: KS4, subjectId: "english" }), false);
});

test("tutor notifications name the board; CBC has none", () => {
  const edx = { keyStage: KS4, subjectId: "mathematics", board: "edexcel", year: 10 };
  assert.equal(W.boardLabel(edx), "Pearson Edexcel");
  assert.equal(W.boardLabel({ keyStage: KS4 }), "Cambridge");
  assert.equal(W.classTag("Mathematics", edx), "Mathematics, Pearson Edexcel, Year 10");
  assert.deepEqual(W.boardExtra(edx), { board: "edexcel" });
  const cbc = { keyStage: "CBC Junior School (Grades 7-9)", year: 8 };
  assert.equal(W.classTag("English", cbc), "English");
  assert.deepEqual(W.boardExtra(cbc), {});
  assert.equal(W.classTag("English", null), "English");
});

test("posted-work notification names the board and reaches only tutors of that board", async () => {
  const { notifyTutorsOfPost } = require("../publishing")._internals;
  const saved = { db: W.db, classroomOf: W.classroomOf, notifyOnce: W.notifyOnce };
  const sent = [];
  const tutors = [
    { id: "both", data: () => ({ subjects: ["mathematics"], keyStages: [KS4], boardScope: [`${KS4}|mathematics|cambridge`, `${KS4}|mathematics|edexcel`] }) },
    { id: "camOnly", data: () => ({ subjects: ["mathematics"], keyStages: [KS4], boardScope: [`${KS4}|mathematics|cambridge`] }) }
  ];
  W.db = () => ({ collection: () => ({ get: async () => ({ docs: tutors }) }) });
  W.classroomOf = async () => ({ subjectId: "mathematics", subjectName: "Mathematics", keyStage: KS4, year: 10, board: "edexcel" });
  W.notifyOnce = async (id, rid, type, f) => { sent.push({ rid, f }); return true; };
  try {
    await notifyTutorsOfPost({ item: { title: "Algebra sheet" }, cid: "c", entity: "c/t/a", what: "assignment" });
  } finally { Object.assign(W, saved); }
  assert.deepEqual(sent.map((s) => s.rid), ["both"]);
  assert.equal(sent[0].f.title, "New Pearson Edexcel material from the Studio Desk");
  assert.equal(sent[0].f.message, "Algebra sheet (Mathematics, Pearson Edexcel, Year 10) is ready for you in the Classroom.");
  assert.deepEqual(sent[0].f.extra, { board: "edexcel" });
});

test("teaching saved before boards existed counts as Cambridge", () => {
  const t = { teaching: [{ keyStage: KS4, subjectId: "english", years: [10, 11] }] };
  assert.deepEqual(Array.from(L.lmzTutorTeaching(t)[0].boards), ["cambridge"]);
  assert.equal(L.lmzTutorCovers(t, "english", KS4, 10, "cambridge"), true);
  assert.equal(L.lmzTutorCovers(t, "english", KS4, 10, "edexcel"), false);
  assert.equal(L.lmzTutorCovers({ subjects: ["english"], keyStages: [KS4] }, "english", KS4, 10, "edexcel"), false);
  assert.equal(L.lmzTutorCovers({ subjects: ["english"], keyStages: [KS4] }, "english", KS4, 10, "cambridge"), true);
});

test("a timetable session reaches only students on its board", () => {
  const aqa = { subjects: ["mathematics"], board: "oxford_aqa" }, edx = { subjects: ["mathematics"], board: "edexcel" }, plain = { subjects: ["mathematics"] };
  const session = (board) => ({ subjectId: "mathematics", board });
  assert.equal(L.lmzEntryForStudent(aqa, session("edexcel")), false);
  assert.equal(L.lmzEntryForStudent(edx, session("oxford_aqa")), false);
  assert.equal(L.lmzEntryForStudent(edx, session("edexcel")), true);
  assert.equal(L.lmzEntryForStudent(plain, { subjectId: "mathematics" }), true, "old sessions with no board are Cambridge");
  assert.equal(L.lmzEntryForStudent(aqa, { subjectId: "mathematics" }), false);
});

test("a student on mixed boards sees timetable documents for each of them", () => {
  const s = { subjects: ["english", "mathematics"], subjectBoards: { mathematics: "edexcel" } };
  assert.deepEqual(Array.from(L.lmzStudentBoards(s)).sort(), ["cambridge", "edexcel"]);
  assert.equal(L.lmzTimetableForStudent(s, { board: "oxford_aqa" }), false);
  assert.equal(L.lmzTimetableForStudent(s, {}), true);
});

/* ---------- new students start fresh ---------- */
const day = (n) => new Date(Date.UTC(2026, 9, n));
const posted = (n, extra) => Object.assign({ audiences: { online: true }, createdAt: day(n) }, extra);

test("work posted before activation is not inherited; work after it is", () => {
  const s = { id: "new1", activatedAt: day(10) };
  assert.equal(W.studentMaySee(s, posted(5)), false);
  assert.equal(W.studentMaySee(s, posted(12)), true);
});

test("the publish date decides, so old work posted today still reaches them", () => {
  const s = { id: "new1", activatedAt: day(10) };
  assert.equal(W.studentMaySee(s, posted(5, { publication: { online: { publishedAt: day(12) } } })), true);
  assert.equal(W.studentMaySee(s, posted(12, { publication: { online: { publishedAt: day(5) } } })), false);
});

test("a tutor releasing old work to the student by name still delivers it", () => {
  assert.equal(W.studentMaySee({ id: "new1", activatedAt: day(10) }, posted(5, { releasedTo: ["new1"] })), true);
});

test("accounts with no activatedAt keep everything they could already see", () => {
  assert.equal(W.studentMaySee({ id: "old1" }, posted(5)), true);
});

test("browser and server use the same cutoff", () => {
  const s = { id: "new1", activatedAt: day(10) };
  [posted(5), posted(12), posted(5, { releasedTo: ["new1"] }), posted(5, { publication: { online: { publishedAt: day(12) } } })].forEach((it) => {
    assert.equal(L.lmzWorkPredatesStudent(s, it, "new1"), !W.studentMaySee(s, it));
  });
  assert.equal(L.lmzWorkPredatesStudent({ id: "old" }, posted(5), "old"), false);
});

/* ---------- paper students ---------- */
test("only the explicit flag makes a paper student", () => {
  assert.equal(W.isPaperStudent({ physicalStudent: true }), true);
  assert.equal(W.isPaperStudent({ physicalStudent: false }), false);
  assert.equal(W.isPaperStudent({}), false);
});

/* ---------- overdue report ---------- */
test("the pending-work email lists each item and addresses the parent", () => {
  const items = [{ subjectName: "Maths", title: "Fractions", kindLabel: "Homework", dueAt: day(1), dueText: "1 Oct (3 days late)" }, { subjectName: "English", title: "Essay", kindLabel: "Classwork", dueAt: day(2), dueText: "2 Oct (2 days late)" }];
  const student = { id: "s1", name: "Amina" };
  const p = templates.pendingWorkReport({ audience: "parent", student, parentName: "Grace", items, reportUrl: "https://x/y.pdf" });
  assert.match(p.subject, /2 overdue/);
  assert.match(p.subject, /Amina/);
  assert.match(p.html, /Fractions/);
  assert.match(p.html, /Essay/);
  assert.match(p.html, /3 days late/);
  const s = templates.pendingWorkReport({ audience: "student", student, items, reportUrl: "" });
  assert.match(s.html, /you have/);
});

test("the report PDF builds with its own heading and all the work on it", async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ subjectName: "Maths", topicTitle: "Homework", title: "Work " + i, dueAt: day(1), dueText: "1 Oct (2 days late)" }));
  const bytes = await D.buildReportPdf({ student: { name: "Amina", year: 10 }, items, generatedAt: day(5), heading: "PENDING WORK REPORT", introText: "Late.", noteText: "Hand it in." });
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
});

test("homework, classwork and exam hand-ins are all covered, and only live ones", () => {
  const by = Object.fromEntries(D.OVERDUE_SOURCES.map((s) => [s.group, s]));
  assert.deepEqual(Object.keys(by).sort(), ["assignments", "exams", "lessons"]);
  assert.equal(by.lessons.live({ status: "draft" }), false);
  assert.equal(by.lessons.live({ status: "published" }), true);
  assert.equal(by.exams.live({ status: "Published" }, { path: "classrooms/c/exams/e" }), true);
  assert.equal(by.exams.live({ status: "Draft" }, { path: "classrooms/c/exams/e" }), false);
  assert.equal(by.exams.live({ status: "Published" }, { path: "classrooms/c/topics/t/exams/e" }), false);
});

test("the indexes the overdue report queries are declared", () => {
  const ix = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "firestore.indexes.json"), "utf8"));
  D.OVERDUE_SOURCES.forEach((s) => {
    const o = ix.fieldOverrides.find((x) => x.collectionGroup === s.group && x.fieldPath === s.field);
    assert.ok(o && o.indexes.some((i) => i.queryScope === "COLLECTION_GROUP" && i.order === "ASCENDING"), s.group + "." + s.field);
  });
});
