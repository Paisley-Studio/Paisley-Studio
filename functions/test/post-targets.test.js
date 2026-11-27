// Run: cd functions && npm test        (node:test; no Firebase needed)
// Who exactly gets a post: the desk's picks (students, tutors) and developer mode's freeze.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../publishing")._internals;
const W = require("../work-shared");
const freeze = require("../dev-freeze");
const { templates } = require("../email-templates");

/* The class: s1, s2 online; r1 remote. Parents: s1 -> p1. */
const CLASS = [{ id: "s1", studentType: "" }, { id: "s2" }, { id: "r1", studentType: "remote" }];
W.classroomOf = async () => ({ id: "maths_y8", keyStage: "KS3", year: 8, subjectId: "maths" });
W.resolveStudents = async () => CLASS.slice();
W.parentsOfStudent = async (sid) => (sid === "s1" ? [{ id: "p1" }] : []);
freeze._setRecorder(() => {});

const FX = { type: "flatExam", path: "classrooms/maths_y8/exams/x1", cid: "maths_y8", id: "x1" };
const ALL = ["online", "remote", "tutors"];
const off = { on: false, cfg: null };
const frozen = (allow, audiences) => ({ on: true, cfg: { on: true, areas: { exams: true }, audiences: audiences || { students: true, parents: true, tutors: true }, allow: allow || [] } });

test("no picks and no freeze: the whole class, every tutor (nothing changes)", async () => {
  assert.deepEqual(await P.planFor(null, FX, ALL, undefined, off), {});
});

test("picked students: only them (of this class, on a posted portal), with their parents", async () => {
  const plan = await P.planFor(null, FX, ["online"], { students: ["s1", "r1", "stranger"] }, off);
  assert.deepEqual(plan.release, ["s1"], "remote and unknown students are dropped for an online post");
  assert.deepEqual(plan.parents, ["p1"]);
  assert.equal(plan.frozen, undefined);
});

test("tutors: none, picked, or all", async () => {
  /* Exams: "none" tells nobody, but tutors still see it so they can mark the hand-ins. */
  const none = await P.planFor(null, FX, ALL, { tutors: "none" }, off);
  assert.ok(!none.dropTutors);
  assert.deepEqual(none.tutorNotify, []);
  const HW = { type: "assignment", path: "classrooms/maths_y8/topics/t1/assignments/a1", cid: "maths_y8", id: "a1" };
  assert.equal((await P.planFor(null, HW, ALL, { tutors: "none" }, off)).dropTutors, true);
  assert.deepEqual((await P.planFor(null, FX, ALL, { tutors: ["t1"] }, off)).tutorNotify, ["t1"]);
  assert.equal((await P.planFor(null, FX, ALL, { tutors: "all" }, off)).tutorNotify, undefined);
});

test("freeze with no test accounts: no student and no tutor gets the exam", async () => {
  const plan = await P.planFor(null, FX, ALL, undefined, frozen([]));
  assert.equal(plan.dropStudents, true);
  assert.equal(plan.dropTutors, true);
  assert.deepEqual(plan.frozen, { area: "exams" });
});

test("freeze with a test student and a test tutor: only they get it", async () => {
  const plan = await P.planFor(null, FX, ALL, undefined, frozen([{ uid: "s2", role: "student" }, { uid: "p1", role: "parent" }, { uid: "t9", role: "tutor" }]));
  assert.deepEqual(plan.release, ["s2"]);
  assert.deepEqual(plan.tutorNotify, ["t9"]);
  assert.ok(!plan.dropTutors);
});

test("freeze on another area leaves exams alone", async () => {
  const cfg = frozen([]); cfg.cfg.areas = { homework: true };
  assert.deepEqual(await P.planFor(null, FX, ALL, undefined, cfg), {});
});

test("publishOne with a plan: released by name, student audiences untouched; held when nobody may get it", async () => {
  const store = new Map([[FX.path, { title: "Mid", status: "Draft", subjectId: "maths", audiences: { online: false, remote: false, tutors: false } }]]);
  const db = { doc: (p) => ({ path: p, get: async () => ({ exists: store.has(p), data: () => store.get(p) }) }),
    runTransaction: async (fn) => fn({ get: async (r) => r.get(), update: (r, patch) => store.set(r.path, Object.assign({}, store.get(r.path), patch)), set: () => {} }) };
  const ctx = { db, uid: "admin1", name: "Desk", ts: { t: 1 } };
  const r = await P.publishOne(db, ctx, db.doc(FX.path), FX, ["online", "tutors"], { release: ["s1"], parents: ["p1"], tutorNotify: ["t1"] });
  assert.equal(r.status, "published");
  assert.equal(r.released, 1);
  const d = store.get(FX.path);
  assert.equal(d.audiences.online, false, "the class is not opened up");
  assert.equal(d.audiences.tutors, true);
  assert.equal(d.status, "Published");
  assert.deepEqual(d.tutorNotify, ["t1"]);
  assert.equal(d.audience, "class");

  store.set("classrooms/maths_y8/exams/x2", { title: "Other", status: "Draft", audiences: { online: false, remote: false, tutors: false } });
  const FX2 = Object.assign({}, FX, { path: "classrooms/maths_y8/exams/x2", id: "x2" });
  const h = await P.publishOne(db, ctx, db.doc(FX2.path), FX2, ["online", "tutors"], { dropStudents: true, dropTutors: true, frozen: { area: "exams" } });
  assert.equal(h.status, "held");
  assert.equal(store.get(FX2.path).status, "Draft", "nothing changes on a held post");
});

test("exam emails: students are told to check with a parent, parents get the paper wording, tutors their own", () => {
  const exam = { title: "Midterm Paper 1", examType: "Midterm", subjectName: "Mathematics" };
  const st = templates.examPostedStudent({ student: { name: "Amani Otieno" }, exam, examDate: new Date() });
  assert.match(st.html, /check with your parent/i);
  assert.doesNotMatch(st.html, /attached/i);
  const pa = templates.examPostedParent({ parentName: "Mrs Otieno", student: { name: "Amani Otieno" }, exam, examDate: new Date() });
  assert.match(pa.html, /attached/i);
  assert.match(pa.html, /when the exam opens/i);
  const tu = templates.examPostedTutor({ tutorName: "Mr Kamau", exam, examDate: new Date(), classLabel: "Mathematics (Cambridge)" });
  assert.match(tu.html, /get ready to mark/i);
  assert.match(tu.html, /submits/i);
  assert.doesNotMatch(tu.html, /your parent|attached to this email|check with/i);
});
