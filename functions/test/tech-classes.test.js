// Run: cd functions && npm test
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "paisley-test" });
const { _internals } = require("../tech");
const { gradeTechQuiz, trackOf, tracksFor, workEvent, lessonTitle, lessonGate, gateMet, workSnapshotHtml, classPassed, byCourse, hasVideo, workShowcase, showcaseIdOf } = _internals;

const QUESTIONS = [
  { id: "a", type: "mcq", text: "Pick b", options: ["a", "b", "c"] },
  { id: "b", type: "truefalse", text: "True?", options: ["True", "False"] },
  { id: "c", type: "short", text: "Name the loop" }
];
const KEY = { a: { correct: 1, explanation: "Because b." }, b: { correct: 0 }, c: { accepted: ["for loop", "while"] } };

test("every right answer scores full marks", () => {
  const r = gradeTechQuiz(QUESTIONS, KEY, { a: 1, b: 0, c: "  FOR   Loop " });
  assert.equal(r.score, 3); assert.equal(r.total, 3); assert.equal(r.percent, 100);
  assert.ok(r.review.every((x) => x.correct));
});

test("wrong answers are marked and shown with the right one", () => {
  const r = gradeTechQuiz(QUESTIONS, KEY, { a: 0, b: 1, c: "recursion" });
  assert.equal(r.score, 0); assert.equal(r.percent, 0);
  assert.equal(r.review[0].given, "a"); assert.equal(r.review[0].answer, "b"); assert.equal(r.review[0].explanation, "Because b.");
  assert.equal(r.review[1].answer, "True");
  assert.equal(r.review[2].answer, "for loop");
});

test("missing or junk answers never score", () => {
  const r = gradeTechQuiz(QUESTIONS, KEY, { a: 99, b: "", c: "" });
  assert.equal(r.score, 0);
  assert.equal(r.review[0].given, ""); assert.equal(r.review[1].given, "");
  assert.equal(gradeTechQuiz(QUESTIONS, KEY, {}).score, 0);
  assert.equal(gradeTechQuiz(QUESTIONS, {}, { a: 1, b: 0, c: "x" }).score, 0);
  assert.equal(gradeTechQuiz([], KEY, {}).percent, null);
});

test("written answers need no options or key and stay out of the score", () => {
  const qs = QUESTIONS.concat([{ id: "d", type: "open", text: "Explain a loop" }]);
  const r = gradeTechQuiz(qs, KEY, { a: 1, b: 1, c: "while", d: "  It repeats steps.\nAgain." });
  assert.equal(r.score, 2); assert.equal(r.total, 3); assert.equal(r.percent, 67); assert.equal(r.openCount, 1);
  assert.equal(r.review[3].open, true); assert.equal(r.review[3].correct, null);
  assert.equal(r.review[3].given, "  It repeats steps.\nAgain.");
  const only = gradeTechQuiz([{ id: "d", type: "open", text: "Why?" }], {}, { d: "Because." });
  assert.equal(only.total, 0); assert.equal(only.percent, null); assert.equal(only.openCount, 1);
});

test("the percent rounds", () => {
  assert.equal(gradeTechQuiz(QUESTIONS, KEY, { a: 1 }).percent, 33);
  assert.equal(gradeTechQuiz(QUESTIONS, KEY, { a: 1, b: 0 }).percent, 67);
});

test("every level has its own classes; old 'advanced' classes still reach intermediate and expert", () => {
  assert.equal(trackOf("beginner"), "beginner");
  assert.equal(trackOf("intermediate"), "intermediate");
  assert.equal(trackOf("expert"), "expert");
  assert.equal(trackOf(undefined), "intermediate");
  assert.deepEqual(tracksFor("beginner"), ["beginner"]);
  assert.deepEqual(tracksFor("intermediate"), ["intermediate", "advanced"]);
  assert.deepEqual(tracksFor("expert"), ["expert", "advanced"]);
});

test("a level passes only when every step it asks for is done", () => {
  const ts = { toMillis: () => 1 };
  const full = { type: "lesson", video: { url: "https://x/v.mp4" }, questions: QUESTIONS, task: { kind: "code" } };
  assert.equal(gateMet(full, {}, null), false);
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 67 }, null), false);                        // no hand-in yet
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 40 }, { status: "Graded", nextAllowed: true }), false);   // under 50%
  // handing in, or even a mark, is not enough: the coach must press Allow next lesson
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 50 }, { status: "Submitted" }), false);
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 90 }, { status: "Graded", submitCount: 1 }), false);
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 90 }, { status: "Corrections", submitCount: 1 }), false);
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 50 }, { status: "Graded", nextAllowed: true }), true);
  assert.equal(gateMet(full, { watchedAt: ts, bestPercent: 90 }, { status: "Draft" }), false);
  // the admin's choice: only the quiz, at 80%
  const quizOnly = Object.assign({}, full, { gate: { watch: false, quiz: true, work: false, pass: 80 } });
  assert.equal(gateMet(quizOnly, { bestPercent: 70 }, null), false);
  assert.equal(gateMet(quizOnly, { bestPercent: 80 }, null), true);
  // a step the lesson does not have is skipped; nothing to do means opening it is enough
  assert.equal(gateMet({ type: "lesson", notes: "<p>Hi</p>" }, { openedAt: ts }, null), true);
  assert.equal(gateMet({ type: "lesson", notes: "<p>Hi</p>" }, {}, null), false);
  assert.equal(gateMet({ type: "test", video: { url: "https://x" }, questions: [{ id: "o", type: "open", text: "Why?" }] }, { attempts: 1, lastAttemptAt: ts }, null), true);
  assert.equal(lessonGate({ type: "lesson", gate: { quiz: true, pass: "" }, questions: QUESTIONS }).pass, 50);
  assert.equal(lessonGate({ type: "lesson", gate: { quiz: true, pass: 140 }, questions: QUESTIONS }).pass, 100);
});

test("a class is passed when every posted lesson in it is finished; classes go in order", () => {
  const ts = { toMillis: () => 1 };
  const a = { id: "a", type: "lesson", notes: "x" }, b = { id: "b", type: "lesson", task: { kind: "code" } };
  assert.equal(classPassed([], {}, {}), false);                                         // nothing posted yet: not passed
  assert.equal(classPassed([a, b], { a: { openedAt: ts } }, {}), false);                 // one lesson left
  assert.equal(classPassed([a, b], { a: { openedAt: ts } }, { b: { status: "Submitted" } }), false);   // waiting for the coach
  assert.equal(classPassed([a, b], { a: { passedAt: ts } }, { b: { status: "Graded", submitCount: 1 } }), false);
  assert.equal(classPassed([a, b], { a: { passedAt: ts } }, { b: { status: "Graded", submitCount: 1, nextAllowed: true } }), true);
  assert.equal(classPassed([a, b], { a: { passedAt: ts }, b: { passedAt: ts } }, {}), true);            // passed before stays passed
  const order = [{ name: "Web", order: 2 }, { name: "Scratch", order: 1 }, { name: "Art" }, { name: "AI", order: 2 }].sort(byCourse).map((c) => c.name);
  assert.deepEqual(order, ["Art", "Scratch", "AI", "Web"]);
});

test("the family's hand-in email shows the picture only from an https link", () => {
  assert.match(workSnapshotHtml("https://firebasestorage.googleapis.com/x.jpg?alt=media", "Ama"), /<img src="https:\/\/firebasestorage/);
  assert.equal(workSnapshotHtml("javascript:alert(1)", "Ama"), "");
  assert.equal(workSnapshotHtml("", "Ama"), "");
  assert.doesNotMatch(workSnapshotHtml("https://x/a.jpg\"onerror=\"x", "Ama"), /"onerror="/);
});

test("class work: a hand-in, a mark and a correction are each told once", () => {
  const t1 = { toMillis: () => 1000 }, t2 = { toMillis: () => 2000 };
  assert.equal(workEvent({ status: "Draft" }, { status: "Submitted", submitCount: 1 }), "submitted");
  assert.equal(workEvent({ status: "Submitted", submitCount: 1 }, { status: "Submitted", submitCount: 1, inkData: {} }), "");
  assert.equal(workEvent({ status: "Submitted" }, { status: "Graded", gradedAt: t1 }), "graded");
  assert.equal(workEvent({ status: "Graded", gradedAt: t1 }, { status: "Graded", gradedAt: t1, inkData: {} }), "");
  assert.equal(workEvent({ status: "Graded", gradedAt: t1 }, { status: "Graded", gradedAt: t2 }), "graded");
  assert.equal(workEvent({ status: "Submitted" }, { status: "Corrections", gradedAt: t1 }), "corrections");
  assert.equal(workEvent({ status: "Corrections", submitCount: 1 }, { status: "Submitted", submitCount: 2 }), "submitted");
  assert.equal(workEvent(null, { status: "Draft" }), "");
  // Renew: a fresh hand-in asked of marked work is its own event, once per renewal
  assert.equal(workEvent({ status: "Graded", gradedAt: t1 }, { status: "Corrections", gradedAt: t1, renewedAt: t2 }), "renewed");
  assert.equal(workEvent({ status: "Corrections", gradedAt: t1, renewedAt: t2 }, { status: "Corrections", gradedAt: t1, renewedAt: t2, codeFiles: [] }), "");
  // Allow next lesson is not a marking event (it is announced on its own)
  assert.equal(workEvent({ status: "Graded", gradedAt: t1 }, { status: "Graded", gradedAt: t1, nextAllowed: true }), "");
  assert.equal(workEvent(null, { status: "Nonsense" }), "");
});

test("a lesson without a title is named by its topic", () => {
  assert.equal(lessonTitle({ title: "Loops", topicTitle: "Flow" }), "Loops");
  assert.equal(lessonTitle({ topicTitle: "Flow" }), "Flow lesson");
  assert.equal(lessonTitle({ type: "test", topicTitle: "Flow" }), "Flow practice test");
  assert.equal(lessonTitle({}), "New lesson");
});

test("a lesson with several videos asks for them to be watched; watchedAt means all of them", () => {
  const ts = { toMillis: () => 1 };
  const l = { type: "lesson", videos: [{ url: "https://a" }, { url: "https://b" }] };
  assert.equal(hasVideo(l), true);
  assert.equal(hasVideo({ type: "lesson", videos: [] }), false);
  assert.equal(lessonGate(l).watch, true);
  assert.equal(gateMet(l, { watchedVideos: { 0: true } }, null), false);
  assert.equal(gateMet(l, { watchedVideos: { 0: true, 1: true }, watchedAt: ts }, null), true);
});

test("published class work shows only the first name and the work, never ids or marks", () => {
  const a = { kind: "code", lessonTitle: "Lesson 1", courseName: "CODING", topicTitle: "Flow", studentId: "kid1", coachId: "c1", grade: 9, feedback: "x", codeFiles: [{ name: "index.html", content: "<h1>Hi</h1>" }], snapshotUrl: "https://x/s.jpg" };
  const p = workShowcase(a, { name: "Amina Otieno" });
  assert.equal(p.displayName, "Amina");
  assert.equal(p.category, "CODE"); assert.equal(p.origin, "class");
  for (const k of ["studentId", "coachId", "grade", "feedback"]) assert.equal(k in p, false);
  assert.equal(p.codeFiles.length, 1);
  assert.equal(showcaseIdOf("kid1_l1"), "cw_kid1_l1");
  assert.equal(workShowcase({ kind: "writing", writingHtml: "<p>Hi</p>" }, { name: "Ben" }).category, "WRITING");
});
