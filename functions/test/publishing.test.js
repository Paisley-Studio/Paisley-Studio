// Run: cd functions && npm test        (uses node:test; no Firebase needed)
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../publishing")._internals;
const W = require("../work-shared");
const R = require("../remote")._internals;
const { templates, PORTALS } = require("../email-templates");

/* Minimal in-memory Firestore: doc get/update/set + runTransaction. */
function fakeDb(seed) {
  const store = new Map(Object.entries(seed));
  const ref = (path) => ({ path, get: async () => ({ exists: store.has(path), data: () => store.get(path) }) });
  return {
    store, doc: ref,
    runTransaction: async (fn) => fn({
      get: async (r) => r.get(),
      update: (r, patch) => store.set(r.path, Object.assign({}, store.get(r.path), patch)),
      set: (r, data) => store.set(r.path, data)
    })
  };
}
const HW = "classrooms/maths_y8/topics/t1/assignments/a1";
const LS = "classrooms/maths_y8/topics/t1/lessons/l1";
const FX = "classrooms/maths_y8/exams/x1";
const mk = (extra) => fakeDb(Object.assign({
  [HW]: { title: "HW1", keyStage: "KS3", year: 8, subjectId: "maths", audiences: { online: false, remote: false, tutors: false } },
  [LS]: { title: "L1", status: "draft", subjectId: "maths", audiences: { online: false, remote: false, tutors: false } },
  [FX]: { title: "Mid", status: "Draft", subjectId: "maths", audiences: { online: false, remote: false, tutors: false } }
}, extra || {}));
const ctx = (db) => ({ db, uid: "admin1", name: "Desk", requestId: "r1", ts: { t: 1 } });
const run = (db, choice, paths) => P.publishItems(db, ctx(db), choice, paths);

test("Post to Remote Students does NOT expose to online students or tutors", async () => {
  const db = mk(); await run(db, "remote", [HW]);
  assert.deepEqual(db.store.get(HW).audiences, { online: false, remote: true, tutors: false });
  assert.equal(W.studentMaySee({ id: "s", studentType: "remote" }, db.store.get(HW)), true);
  assert.equal(W.studentMaySee({ id: "s" }, db.store.get(HW)), false);
});
test("Post to Online Students does NOT expose to remote students", async () => {
  const db = mk(); await run(db, "online", [HW]);
  assert.equal(W.studentMaySee({ id: "s", studentType: "remote" }, db.store.get(HW)), false);
  assert.equal(W.studentMaySee({ id: "s" }, db.store.get(HW)), true);
});
test("Publishing to a second audience never removes the first", async () => {
  const db = mk(); await run(db, "online", [HW]); await run(db, "remote", [HW]);
  assert.deepEqual(db.store.get(HW).audiences, { online: true, remote: true, tutors: false });
  assert.ok(db.store.get(HW).publication.online && db.store.get(HW).publication.remote);
});
test("Post to Tutors only flags tutors", async () => {
  const db = mk(); await run(db, "tutors", [HW]);
  assert.deepEqual(db.store.get(HW).audiences, { online: false, remote: false, tutors: true });
});
test("Post to All = exactly the audiences the type supports", async () => {
  const db = mk(); const r = await run(db, "all", [HW]);
  assert.deepEqual(r[0].audiences.sort(), ["online", "remote", "tutors"]);
});
test("Retry is idempotent: second identical request changes nothing and reports 'already'", async () => {
  const db = mk(); const a = await run(db, "remote", [HW]); const snapshot = JSON.stringify(db.store.get(HW));
  const b = await run(db, "remote", [HW]);
  assert.equal(a[0].status, "published"); assert.equal(b[0].status, "already");
  assert.equal(JSON.stringify(db.store.get(HW)), snapshot);
  const pubs = [...db.store.keys()].filter((k) => k.startsWith("publications/"));
  assert.equal(pubs.length, 1, "exactly one publication record per item+audience");
});
test("Draft lesson is marked ready when posted; archived is refused", async () => {
  const db = mk({ ["classrooms/maths_y8/topics/t1/lessons/arch"]: { title: "Old", status: "archived" } });
  const r = await run(db, "online", [LS, "classrooms/maths_y8/topics/t1/lessons/arch"]);
  assert.equal(db.store.get(LS).status, "published"); assert.equal(r[0].markedReady, true);
  assert.equal(r[1].status, "skipped");
});
test("Draft exam becomes Published when posted; Closed exam is refused", async () => {
  const db = mk({ ["classrooms/maths_y8/exams/c"]: { title: "C", status: "Closed" } });
  await run(db, "remote", [FX]); const r = await run(db, "remote", ["classrooms/maths_y8/exams/c"]);
  assert.equal(db.store.get(FX).status, "Published"); assert.equal(r[0].status, "skipped");
});
test("Legacy record (no audiences) keeps online+tutors and gains remote only when posted", async () => {
  const db = mk({ [HW]: { title: "Old", subjectId: "maths" } });
  assert.equal(W.studentMaySee({ id: "s", studentType: "remote" }, db.store.get(HW)), false);
  await run(db, "remote", [HW]);
  assert.deepEqual(db.store.get(HW).audiences, { online: true, remote: true, tutors: true });
});
test("Invalid / non-item paths are skipped, not written", async () => {
  const db = mk(); const r = await run(db, "all", ["students/abc", "classrooms/x"]);
  assert.ok(r.every((x) => x.status === "skipped")); assert.equal(db.store.has("students/abc"), false);
});
test("Unknown audience and empty selection are rejected", async () => {
  const db = mk();
  await assert.rejects(() => run(db, "everyone", [HW]));
  await assert.rejects(() => run(db, "all", []));
});
test("Notification transition: fires on becoming visible, not on migration restatement", () => {
  const legacy = { status: "Published" };
  const backfilled = { status: "Published", audiences: P.legacyAudiences("exam", legacy) };
  assert.equal(P.becameVisible(legacy, backfilled, "online", "Published"), false, "backfill must not notify");
  const posted = { status: "Published", audiences: { online: false, remote: true, tutors: false } };
  const before = { status: "Draft", audiences: { online: false, remote: false, tutors: false } };
  assert.equal(P.becameVisible(before, posted, "remote", "Published"), true);
  assert.equal(P.becameVisible(before, posted, "online", "Published"), false);
});
test("Tutor delivery only covers the tutor's own students", () => {
  assert.equal(P.tutorTeaches({ tutorIds: ["t1"] }, "maths", "t1"), true);
  assert.equal(P.tutorTeaches({ subjectTutors: { maths: { tutorId: "t1" } } }, "maths", "t1"), true);
  assert.equal(P.tutorTeaches({ tutorIds: ["t2"] }, "maths", "t1"), false);
});
test("Remote admission validation", () => {
  const ok = { name: "A B", email: "A@x.com", keyStage: "Key Stage 3 (Years 7-9)", year: 8, subjects: ["maths"], guardians: [{ name: "P", email: "p@x.com", phone: "1" }] };
  assert.equal(R.validateAdmission(ok).email, "a@x.com");
  assert.throws(() => R.validateAdmission({ ...ok, year: 11 }));
  assert.throws(() => R.validateAdmission({ ...ok, guardians: [] }));
  assert.throws(() => R.validateAdmission({ ...ok, guardians: [{ email: "a@x.com" }] }), /own email/);
  assert.throws(() => R.validateAdmission({ ...ok, keyStage: "KS9" }));
});
test("Emails: production domain, correct portal per student type, no localhost", () => {
  const all = JSON.stringify(Object.values(PORTALS));
  assert.ok(!/localhost|127\.0\.0\.1/.test(all));
  Object.values(PORTALS).forEach((u) => assert.ok(u.startsWith("https://paisleystudio.online/")));
  const remote = templates.workPosted({ student: { name: "R", studentType: "remote" }, kind: "assignment", item: { title: "T" }, dueAt: new Date() }).html;
  const online = templates.workPosted({ student: { name: "O" }, kind: "assignment", item: { title: "T" }, dueAt: new Date() }).html;
  assert.ok(remote.includes(PORTALS.remote) && !remote.includes(PORTALS.student + '"'));
  assert.ok(online.includes(PORTALS.student));
  const g = templates.homeworkGraded({ audience: "student", student: { name: "R", studentType: "remote" }, kind: "assignment", item: { title: "T" }, submission: { grade: 5, maxScore: 10 } }).html;
  assert.ok(g.includes(PORTALS.remote));
  for (const [n, f] of Object.entries(templates)) { void n; void f; }
});
