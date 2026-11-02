// Run: cd functions && npm test
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "paisley-test" });
const { _internals } = require("../tech");
const { gradeTechQuiz, trackOf, workEvent, lessonTitle } = _internals;

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

test("beginners get their own track; intermediate, expert and unset share the other", () => {
  assert.equal(trackOf("beginner"), "beginner");
  assert.equal(trackOf("intermediate"), "advanced");
  assert.equal(trackOf("expert"), "advanced");
  assert.equal(trackOf(undefined), "advanced");
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
  assert.equal(workEvent(null, { status: "Nonsense" }), "");
});

test("a lesson without a title is named by its topic", () => {
  assert.equal(lessonTitle({ title: "Loops", topicTitle: "Flow" }), "Loops");
  assert.equal(lessonTitle({ topicTitle: "Flow" }), "Flow lesson");
  assert.equal(lessonTitle({ type: "test", topicTitle: "Flow" }), "Flow practice test");
  assert.equal(lessonTitle({}), "New lesson");
});
