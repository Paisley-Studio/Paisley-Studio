/* =========================================================
   Paisley code runner (Advanced Paisley IDE)
   ---------------------------------------------------------
   runCode is the integration boundary for languages the browser cannot
   compile reliably (Java), and a fallback for the others. It NEVER runs
   student code itself: it forwards the files to an isolated,
   Judge0-compatible execution service and returns what came back.

   Configuration (nothing runs until one of these is set):
     environment  CODE_RUNNER_URL, CODE_RUNNER_KEY, CODE_RUNNER_KEY_HEADER, CODE_RUNNER_HOST
     or Firestore serverConfig/codeRunner { url, key, keyHeader, host, enabled, commands }
                  (serverConfig is closed to every client by the rules; set it in the console)
   url        e.g. https://judge0.example.org (self-hosted Judge0 CE) or
              https://judge0-ce.p.rapidapi.com
   key        sent in keyHeader (default X-Auth-Token; RapidAPI uses X-RapidAPI-Key, with host
              sent as X-RapidAPI-Host)
   commands   optional overrides of the compile/run scripts used for multi-file programs

   Who: active coaches and admins, and active builders the Studio Desk has given the Advanced IDE
   (Admin > Tech Studio > Controls, techSettings/advancedIde).
   Limits: 40 files, 256 KB of source, 64 KB of input, 15 runs a minute and
   300 a day per person (codeRunUsage/{uid}, server only).
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const LOCATION = "us-central1";
const LIMITS = { files: 40, bytes: 256 * 1024, stdin: 64 * 1024, out: 64 * 1024, perMinute: 15, perDay: 300 };

/* Judge0 CE language ids. 89 = "Multi-file program" (a zip with compile and run scripts). */
const SINGLE = { java: 62, python: 71, c: 50, cpp: 54, php: 68 };
const MULTI = 89;
/* Paths inside the Judge0 CE sandbox image. Override with serverConfig/codeRunner.commands. */
const COMMANDS = {
  java: { compile: "/usr/local/openjdk13/bin/javac -encoding UTF-8 -d out $(find . -name '*.java' -not -path './out/*')", run: "/usr/local/openjdk13/bin/java -cp out {main}" },
  python: { compile: "", run: "/usr/local/python-3.8.1/bin/python3 {entry}" },
  c: { compile: "/usr/local/gcc-9.2.0/bin/gcc -std=c11 -O1 -Wall -o prog $(find . -name '*.c') -lm", run: "./prog" },
  cpp: { compile: "/usr/local/gcc-9.2.0/bin/g++ -std=c++17 -O1 -Wall -o prog $(find . -name '*.cpp' -o -name '*.cc' -o -name '*.cxx')", run: "LD_LIBRARY_PATH=/usr/local/gcc-9.2.0/lib64 ./prog" },
  php: { compile: "", run: "/usr/local/php-7.4.1/bin/php {entry}" },
};
const SOURCE_EXT = { java: /\.java$/i, python: /\.py$/i, c: /\.(c|h)$/i, cpp: /\.(cpp|cc|cxx|h|hpp|hh|hxx)$/i, php: /\.php$/i };

/* ---------- small helpers ---------- */
const b64 = (s) => Buffer.from(String(s == null ? "" : s), "utf8").toString("base64");
const unb64 = (s) => (s ? Buffer.from(String(s), "base64").toString("utf8") : "");
const clip = (s) => (s.length > LIMITS.out ? s.slice(0, LIMITS.out) + "\n… (output cut short)" : s);

function cleanName(n) {
  const parts = String(n || "").replace(/\\/g, "/").split("/").map((p) => p.trim()).filter((p) => p && p !== "." && p !== "..");
  const name = parts.join("/");
  return /^[\w.\-/ ]{1,160}$/.test(name) ? name : "";
}

/* The fully qualified class to start, from the entry file: package + file name. */
function javaMainClass(files, entry) {
  const f = files.find((x) => x.name === entry) || files.find((x) => /static\s+void\s+main\s*\(/.test(x.content));
  if (!f) return "Main";
  const base = f.name.split("/").pop().replace(/\.java$/i, "");
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(f.content);
  return pkg ? pkg[1] + "." + base : base;
}

/* ---------- a stored (uncompressed) zip, enough for Judge0's additional_files ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const locals = [], centrals = []; let offset = 0;
  entries.forEach(({ name, content, mode }) => {
    const nameBuf = Buffer.from(name, "utf8"), data = Buffer.from(content, "utf8"), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(((mode || 0o644) << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  });
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([cd, end]));
}

/* ---------- configuration ---------- */
async function config(db) {
  const env = process.env;
  if (env.CODE_RUNNER_URL) {
    return { url: env.CODE_RUNNER_URL, key: env.CODE_RUNNER_KEY || "", keyHeader: env.CODE_RUNNER_KEY_HEADER || "X-Auth-Token", host: env.CODE_RUNNER_HOST || "", commands: {} };
  }
  const snap = await db.collection("serverConfig").doc("codeRunner").get().catch(() => null);
  const c = snap && snap.exists ? snap.data() : null;
  if (!c || !c.url || c.enabled === false) return null;
  return { url: String(c.url), key: String(c.key || ""), keyHeader: String(c.keyHeader || "X-Auth-Token"), host: String(c.host || ""), commands: c.commands || {} };
}

/* ---------- who may run ---------- */
/* Admin > Tech Studio > Controls (techSettings/advancedIde). Same test as advancedIdeAllowed() in firestore.rules. */
const IDE_LEVELS = ["beginner", "intermediate", "expert"];
function ideAllowed(cfg, uid, student) {
  if (!cfg || cfg.enabled !== true) return false;
  const lvl = IDE_LEVELS.includes(student.skillLevel) ? student.skillLevel : "intermediate";
  return (Array.isArray(cfg.students) && cfg.students.includes(uid)) || (Array.isArray(cfg.levels) && cfg.levels.includes(lvl));
}
/* "" when allowed, else why not. Coaches and admins can always run (they review builders' work). */
async function allowed(db, uid) {
  const [a, s, c] = await Promise.all([
    db.collection("admins").doc(uid).get(),
    db.collection("techStudents").doc(uid).get(),
    db.collection("techCoaches").doc(uid).get(),
  ]);
  if (a.exists || (c.exists && c.data().status === "Active")) return "";
  if (!(s.exists && s.data().status === "Active")) return "Only Tech Studio builders, coaches and admins can run code here.";
  const cfg = await db.collection("techSettings").doc("advancedIde").get();
  return ideAllowed(cfg.exists ? cfg.data() : null, uid, s.data()) ? "" : "The Advanced Paisley IDE has not been switched on for you. Your coach or the Studio Desk can turn it on.";
}

async function takeRun(db, uid, now) {
  const ref = db.collection("codeRunUsage").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
    const perMinute = d.minute === minute ? (d.minuteCount || 0) : 0;
    const perDay = d.day === day ? (d.dayCount || 0) : 0;
    if (perMinute >= LIMITS.perMinute) return "minute";
    if (perDay >= LIMITS.perDay) return "day";
    tx.set(ref, { minute, minuteCount: perMinute + 1, day, dayCount: perDay + 1, at: admin.firestore.FieldValue.serverTimestamp() });
    return "";
  });
}

/* ---------- the request to the execution service ---------- */
function buildSubmission(language, files, entry, stdin, commands) {
  const sources = files.filter((f) => SOURCE_EXT[language].test(f.name));
  const single = files.length === 1 && sources.length === 1 && !files[0].name.includes("/");
  const base = { stdin: b64(stdin), cpu_time_limit: 5, wall_time_limit: 15, memory_limit: 256000 };
  if (language === "java") {
    const main = javaMainClass(files, entry);
    /* Judge0's own Java expects class Main in Main.java. */
    if (single && main === "Main" && /\bclass\s+Main\b/.test(sources[0].content)) return Object.assign(base, { language_id: SINGLE.java, source_code: b64(sources[0].content) });
    const cmd = Object.assign({}, COMMANDS.java, commands.java || {});
    return multi(base, files, cmd.compile, cmd.run.replace("{main}", main));
  }
  if (single && entry === files[0].name) return Object.assign(base, { language_id: SINGLE[language], source_code: b64(files[0].content) });
  const cmd = Object.assign({}, COMMANDS[language], commands[language] || {});
  return multi(base, files, cmd.compile, cmd.run.replace("{entry}", "'" + entry.replace(/'/g, "") + "'"));
}
function multi(base, files, compile, run) {
  const entries = files.map((f) => ({ name: f.name, content: f.content }));
  if (compile) entries.push({ name: "compile", content: "#!/bin/bash\n" + compile + "\n", mode: 0o755 });
  entries.push({ name: "run", content: "#!/bin/bash\n" + run + "\n", mode: 0o755 });
  return Object.assign(base, { language_id: MULTI, source_code: "", additional_files: zip(entries).toString("base64") });
}

/* javac / gcc / g++ "file:line: error: message" lines, for the editor's problem markers. */
function diagnostics(text) {
  const out = [];
  String(text || "").split("\n").forEach((l) => {
    let m = /^\.?\/?([\w./\-]+\.java):(\d+): (error|warning): (.*)$/.exec(l);
    if (m) return out.push({ file: m[1], line: +m[2], col: 1, severity: m[3], message: m[4] });
    m = /^\.?\/?([\w./\-]+):(\d+):(\d+): (fatal error|error|warning): (.*)$/.exec(l);
    if (m) out.push({ file: m[1], line: +m[2], col: +m[3], severity: m[4] === "warning" ? "warning" : "error", message: m[5] });
  });
  return out.slice(0, 100);
}

function shape(r) {
  const status = (r && r.status) || {};
  const compileOut = clip(unb64(r.compile_output));
  const stdout = clip(unb64(r.stdout));
  const stderrText = clip(unb64(r.stderr));
  const id = Number(status.id) || 0;
  const res = {
    ok: id === 3, status: status.description || "", stdout, stderr: stderrText,
    code: r.exit_code == null ? (id === 3 ? 0 : 1) : Number(r.exit_code),
    time: r.time == null ? null : Number(r.time), memory: r.memory == null ? null : Number(r.memory),
  };
  if (id === 6) { res.phase = "compile"; res.stderr = compileOut; res.diagnostics = diagnostics(compileOut); }
  else if (compileOut) res.diagnostics = diagnostics(compileOut);
  if (id === 5) res.message = "The program ran for too long and was stopped (time limit).";
  else if (id === 13 || id === 14) { res.failed = true; res.message = "The code runner had a problem: " + (unb64(r.message) || status.description || "unknown"); }
  else if (id >= 7 && id <= 12) res.message = (unb64(r.message) || status.description || "Runtime error");
  return res;
}

async function send(cfg, body, fetchImpl) {
  const headers = { "Content-Type": "application/json" };
  if (cfg.key) headers[cfg.keyHeader] = cfg.key;
  if (cfg.host) headers["X-RapidAPI-Host"] = cfg.host;
  const url = cfg.url.replace(/\/+$/, "") + "/submissions?base64_encoded=true&wait=true";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!r.ok || !data) {
      console.error("code runner HTTP", r.status, text.slice(0, 300));
      throw new HttpsError("unavailable", r.status === 429 ? "The code runner is busy. Try again in a minute." : "The code runner could not run this program right now.");
    }
    return data;
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("code runner", e && e.message);
    throw new HttpsError("unavailable", "The code runner could not be reached. Try again in a moment.");
  } finally { clearTimeout(timer); }
}

/* The callable's work, separated so tests can pass their own db and fetch. */
async function runCodeHandler(req, deps) {
  const db = deps.db, now = deps.now ? deps.now() : Date.now();
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const d = req.data || {};
  const language = String(d.language || "");
  if (!SINGLE[language]) throw new HttpsError("invalid-argument", "That language cannot run on the code runner.");
  if (!Array.isArray(d.files) || !d.files.length) throw new HttpsError("invalid-argument", "There are no files to run.");
  if (d.files.length > LIMITS.files) throw new HttpsError("invalid-argument", "A program can have at most " + LIMITS.files + " files.");
  let bytes = 0;
  const files = d.files.map((f) => {
    const name = cleanName(f && f.name), content = String((f && f.content) || "");
    if (!name) throw new HttpsError("invalid-argument", "A file name is not allowed: " + String(f && f.name).slice(0, 60));
    bytes += Buffer.byteLength(content, "utf8");
    return { name, content };
  });
  if (bytes > LIMITS.bytes) throw new HttpsError("invalid-argument", "The program is too large to run (" + Math.round(bytes / 1024) + " KB; the limit is 256 KB).");
  const stdin = String(d.stdin || "");
  if (stdin.length > LIMITS.stdin) throw new HttpsError("invalid-argument", "The input is too long (64 KB at most).");
  const entry = cleanName(d.entry) || files[0].name;
  if (!files.some((f) => f.name === entry)) throw new HttpsError("invalid-argument", "The file to run is not in the project.");

  const denied = await allowed(db, uid);
  if (denied) throw new HttpsError("permission-denied", denied);
  const cfg = await config(db);
  if (!cfg) throw new HttpsError("failed-precondition", "The Paisley code runner has not been switched on yet, so " + (language === "java" ? "Java" : "this program") + " cannot run. Ask your coach or the Studio Desk.");
  const limited = await takeRun(db, uid, now);
  if (limited) throw new HttpsError("resource-exhausted", limited === "minute" ? "That is a lot of runs in one minute. Wait a moment and try again." : "You have reached today's limit for the code runner. It resets tomorrow.");

  const body = buildSubmission(language, files, entry, stdin, cfg.commands || {});
  return shape(await send(cfg, body, deps.fetch || fetch));
}

exports.runCode = onCall({ region: LOCATION, timeoutSeconds: 90, memory: "256MiB" }, (req) => runCodeHandler(req, { db: admin.firestore() }));
exports._test = { runCodeHandler, ideAllowed, buildSubmission, javaMainClass, diagnostics, shape, zip, crc32, cleanName, LIMITS };
