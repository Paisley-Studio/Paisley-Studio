// Run: cd functions && npm test        (node:test; no Firebase needed)
// Exam timetables: session cleaning, who takes what, and the PDF.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const X = require("../exam-timetable")._internals;
const { templates } = require("../email-templates");

const RAW = [
  { id: "b", subjectId: "physics", subjectName: "Physics", date: "2026-12-08", start: "09:00", end: "10:15" },
  { id: "a", subjectId: "mathematics", subjectName: "Mathematics", paper: "Paper 1", date: "2026-12-07", start: "09:00", end: "10:30" },
  { id: "bad1", subjectId: "", date: "2026-12-07", start: "09:00" },          // no subject
  { id: "bad2", subjectId: "english", date: "7/12/2026", start: "09:00" },    // bad date
  { id: "bad3", subjectId: "english", date: "2026-12-07", start: "" }         // no start
];

test("sessions: invalid ones dropped, the rest in date and time order", () => {
  const s = X.cleanSessions(RAW);
  assert.deepEqual(s.map((x) => x.id), ["a", "b"]);
});

test("duration and day labels", () => {
  assert.equal(X.duration({ start: "09:00", end: "10:30" }), "1 h 30 min");
  assert.equal(X.duration({ start: "09:00", end: "10:00" }), "1 h");
  assert.equal(X.duration({ start: "09:00", end: "09:45" }), "45 min");
  assert.equal(X.duration({ start: "10:00", end: "09:00" }), "");
  assert.match(X.dayLabel("2026-12-07", true), /Monday/);
});

test("a student gets only the subjects they take, on the timetable's board", () => {
  const s = X.cleanSessions(RAW);
  const st = { subjects: ["mathematics"], board: "cambridge" };
  assert.equal(X.takes(st, s[0], ""), true);
  assert.equal(X.takes(st, s[1], ""), false);
  assert.equal(X.takes(st, s[0], "edexcel"), false, "a Cambridge student is not on an Edexcel timetable");
  assert.equal(X.takes({ subjects: ["mathematics"], subjectBoards: { mathematics: "edexcel" } }, s[0], "edexcel"), true);
});

test("content hash changes only when the timetable does", () => {
  const s = X.cleanSessions(RAW);
  const a = X.hashOf({ title: "Mocks" }, s), b = X.hashOf({ title: "Mocks" }, s), c = X.hashOf({ title: "Mocks 2" }, s);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("the PDF builds, and runs onto more pages for a long timetable", async () => {
  const { PDFDocument } = require("pdf-lib");
  const tt = { title: "End of Term Exams", series: "December 2026", keyStage: "Key Stage 4 (Years 10-11) — IGCSE", year: 10, instructions: "Bring two pens." };
  const one = await X.buildPdf({ tt, sessions: X.cleanSessions(RAW), forName: "Amani Otieno", forLine: "KS4 | Year 10", generatedAt: new Date() });
  assert.ok(one.length > 5000);
  assert.equal((await PDFDocument.load(one)).getPageCount(), 1);
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ id: "s" + i, subjectId: "x" + i, subjectName: "Subject " + i, date: "2026-12-" + String(7 + (i % 10)).padStart(2, "0"), start: "09:00", end: "10:00" });
  const long = await X.buildPdf({ tt, sessions: X.cleanSessions(many), forName: "Full timetable", forLine: "", generatedAt: new Date() });
  assert.ok((await PDFDocument.load(long)).getPageCount() >= 2);
});

test("emails: students prepare, parents help, tutors get their subjects", () => {
  const tt = { title: "Mocks", keyStage: "Key Stage 4 (Years 10-11) — IGCSE", year: 10 };
  const sessions = X.cleanSessions(RAW);
  const st = templates.examTimetableMail({ audience: "student", student: { name: "Amani Otieno" }, tt, sessions });
  assert.match(st.subject, /Your exam timetable/);
  assert.match(st.html, /Getting ready/);
  assert.match(st.html, /Mathematics/);
  const pa = templates.examTimetableMail({ audience: "parent", name: "Mrs Otieno", kids: [{ student: { name: "Amani Otieno" }, sessions }], tt });
  assert.match(pa.subject, /Amani/);
  assert.match(pa.html, /How you can help/);
  const tu = templates.examTimetableMail({ audience: "tutor", name: "Mr Kamau", tt, sessions: [sessions[0]], studentCount: 12, updated: true });
  assert.match(tu.subject, /Updated exam timetable/);
  assert.match(tu.html, /12 students/);
  assert.doesNotMatch(tu.html + st.html + pa.html, /localhost/);
});
