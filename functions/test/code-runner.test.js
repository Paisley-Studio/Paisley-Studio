// Run: cd functions && node --test test/code-runner.test.js
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "paisley-test";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "paisley-test" });
const { _test } = require("../code-runner");
const { runCodeHandler, buildSubmission, javaMainClass, diagnostics, shape, zip, crc32, cleanName } = _test;

/* A tiny Firestore: get/set and a transaction over plain objects. */
function fakeDb(docs) {
  const store = Object.assign({}, docs);
  const ref = (path) => ({
    path,
    get: async () => ({ exists: path in store, data: () => store[path] }),
    set: async (v) => { store[path] = v; },
  });
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(c + "/" + id) }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v) => { store[r.path] = v; } }),
  };
}
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const ok = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const JAVA = { name: "Main.java", content: "public class Main { public static void main(String[] a) { System.out.println(\"hi\"); } }" };
const IDE_ON = { "techSettings/advancedIde": { enabled: true, levels: ["intermediate"], students: [] } };
const CONFIGURED = Object.assign({ "admins/boss": {}, "techStudents/kid": { status: "Active" }, "techStudents/waiting": { status: "Pending" }, "serverConfig/codeRunner": { url: "https://judge.example/", key: "secret" } }, IDE_ON);

test("needs a signed-in user", async () => {
  await assert.rejects(runCodeHandler({ data: {} }, { db: fakeDb({}) }), /Sign in/);
});

test("refuses anyone who is not an active builder, coach or admin", async () => {
  const db = fakeDb(CONFIGURED);
  await assert.rejects(runCodeHandler({ auth: { uid: "waiting" }, data: { language: "java", files: [JAVA], entry: "Main.java" } }, { db, fetch: ok({}) }), (e) => e.code === "permission-denied");
  await assert.rejects(runCodeHandler({ auth: { uid: "stranger" }, data: { language: "java", files: [JAVA], entry: "Main.java" } }, { db, fetch: ok({}) }), (e) => e.code === "permission-denied");
});

test("builders need the Advanced IDE switched on for them (Admin > Tech Studio > Controls)", async () => {
  const base = { "techStudents/kid": { status: "Active", skillLevel: "beginner" }, "techCoaches/coach": { status: "Active" }, "serverConfig/codeRunner": { url: "https://judge.example/" } };
  const call = (db, uid) => runCodeHandler({ auth: { uid }, data: { language: "java", files: [JAVA], entry: "Main.java" } }, { db, fetch: ok({ stdout: "", status: { id: 3 } }) });
  await assertRejectsCode(call(fakeDb(base), "kid"), "permission-denied", /not been switched on for you/);
  await assertRejectsCode(call(fakeDb(Object.assign({}, base, { "techSettings/advancedIde": { enabled: true, levels: ["intermediate"], students: [] } })), "kid"), "permission-denied");
  await call(fakeDb(Object.assign({}, base, { "techSettings/advancedIde": { enabled: true, levels: ["beginner"], students: [] } })), "kid");
  await call(fakeDb(Object.assign({}, base, { "techSettings/advancedIde": { enabled: true, levels: [], students: ["kid"] } })), "kid");
  await assertRejectsCode(call(fakeDb(Object.assign({}, base, { "techSettings/advancedIde": { enabled: false, levels: ["beginner"], students: ["kid"] } })), "kid"), "permission-denied");
  await call(fakeDb(base), "coach");   // coaches review builders' work whatever the switch says
});
async function assertRejectsCode(p, code, re) { await assert.rejects(p, (e) => e.code === code && (!re || re.test(e.message))); }

test("says clearly when the runner has not been configured, and calls nothing", async () => {
  let called = false;
  const db = fakeDb(Object.assign({ "techStudents/kid": { status: "Active" } }, IDE_ON));
  delete process.env.CODE_RUNNER_URL;
  await assert.rejects(
    runCodeHandler({ auth: { uid: "kid" }, data: { language: "java", files: [JAVA], entry: "Main.java" } }, { db, fetch: async () => { called = true; } }),
    (e) => e.code === "failed-precondition" && /not been switched on/.test(e.message));
  assert.equal(called, false);
});

test("a single Main.java goes to Judge0's Java with the key header", async () => {
  let seen;
  const db = fakeDb(CONFIGURED);
  const res = await runCodeHandler({ auth: { uid: "kid" }, data: { language: "java", files: [JAVA], entry: "Main.java", stdin: "Ada\n" } }, {
    db, fetch: async (url, init) => { seen = { url, init }; return ok({ stdout: b64("hi\n"), status: { id: 3, description: "Accepted" }, exit_code: 0, time: "0.1", memory: 1000 })(); },
  });
  assert.equal(seen.url, "https://judge.example/submissions?base64_encoded=true&wait=true");
  assert.equal(seen.init.headers["X-Auth-Token"], "secret");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.language_id, 62);
  assert.equal(Buffer.from(body.stdin, "base64").toString(), "Ada\n");
  assert.deepEqual({ ok: res.ok, stdout: res.stdout, code: res.code }, { ok: true, stdout: "hi\n", code: 0 });
});

test("several Java files become a multi-file program that starts the right class", () => {
  const files = [
    { name: "app/Game.java", content: "package app;\npublic class Game { public static void main(String[] a) {} }" },
    { name: "app/Player.java", content: "package app;\nclass Player {}" },
  ];
  assert.equal(javaMainClass(files, "app/Game.java"), "app.Game");
  const body = buildSubmission("java", files, "app/Game.java", "", {});
  assert.equal(body.language_id, 89);
  const raw = Buffer.from(body.additional_files, "base64");
  assert.equal(raw.readUInt32LE(0), 0x04034b50);
  const text = raw.toString("latin1");
  assert.ok(text.includes("app/Player.java"));
  assert.ok(text.includes("java -cp out app.Game"));
  assert.ok(text.includes("javac -encoding UTF-8"));
});

test("compile errors come back with problem markers", () => {
  const r = shape({ status: { id: 6, description: "Compilation Error" }, compile_output: b64("./Main.java:3: error: ';' expected\n        int x = 1\n                 ^\n1 error\n") });
  assert.equal(r.ok, false);
  assert.equal(r.phase, "compile");
  assert.deepEqual(r.diagnostics, [{ file: "Main.java", line: 3, col: 1, severity: "error", message: "';' expected" }]);
});

test("gcc diagnostics are read too", () => {
  assert.deepEqual(diagnostics("main.c:4:9: warning: unused variable 'x'"), [{ file: "main.c", line: 4, col: 9, severity: "warning", message: "unused variable 'x'" }]);
});

test("time limits and runtime errors explain themselves", () => {
  assert.match(shape({ status: { id: 5, description: "Time Limit Exceeded" } }).message, /too long/);
  const rt = shape({ status: { id: 11, description: "Runtime Error (NZEC)" }, stderr: b64("Exception in thread \"main\" java.lang.ArithmeticException: / by zero\n"), exit_code: 1 });
  assert.equal(rt.ok, false);
  assert.match(rt.stderr, /by zero/);
});

test("file names cannot climb out of the project", () => {
  assert.equal(cleanName("../../etc/passwd"), "etc/passwd");
  assert.equal(cleanName("a/./b.java"), "a/b.java");
  assert.equal(cleanName("bad$name.java"), "");
});

test("limits: too many runs in a minute are refused", async () => {
  const db = fakeDb(CONFIGURED);
  const call = () => runCodeHandler({ auth: { uid: "boss" }, data: { language: "python", files: [{ name: "main.py", content: "print(1)" }], entry: "main.py" } },
    { db, now: () => 1000, fetch: ok({ stdout: b64("1\n"), status: { id: 3 } }) });
  for (let i = 0; i < 15; i++) await call();
  await assert.rejects(call(), (e) => e.code === "resource-exhausted");
});

test("oversized programs are refused before anything is sent", async () => {
  const db = fakeDb(CONFIGURED);
  const big = "x".repeat(300 * 1024);
  await assert.rejects(runCodeHandler({ auth: { uid: "kid" }, data: { language: "c", files: [{ name: "main.c", content: big }], entry: "main.c" } }, { db, fetch: ok({}) }), /too large/);
});

test("the zip is well formed", () => {
  const z = zip([{ name: "a.txt", content: "hello" }]);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.equal(crc32(Buffer.from("hello")), 0x3610a686);
});
