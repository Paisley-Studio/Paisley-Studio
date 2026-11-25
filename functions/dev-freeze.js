/* =========================================================
   Paisley Studio — Developer mode: freezing (Admin > Settings > Developer mode)
   -----------------------------------------------------------
   While the Studio Desk tests (posting a class, setting homework, trying an exam
   on a live student account) it can hold what the system would normally send:

     devMode/freeze  {
       on: bool, until: Timestamp|null,              // ends by itself at `until`
       areas:     { tech, classes, homework, exams, live, attendance,
                    tuition, messages, accounts, newsletter, other: bool },  // true = held
       audiences: { students, parents, tutors, coaches: bool },          // true = held
       allow: [{ uid, email, name, role }],          // test accounts: always receive
       note, updatedAt, updatedBy
     }

   Held means: the in-app notification is not written (personalNotifications,
   techNotifications, attendanceNotifications) and the email is not sent. Each
   held item is written to devHeld/{id} so the desk sees exactly what would have
   gone out. Admins always receive. Nothing is queued for later: when the freeze
   ends, new events go out as normal and held ones stay held.

   Where it is enforced:
     • notifications.sendEmail           (every email in the system)
     • work-shared notify / notifyOnce,  notifications.addPersonalNotification,
       tech.techNotify                   (before the write)
     • onFreezeNotificationCreated       (safety net: any notification written
       elsewhere, including by browsers, is moved to devHeld at once)

   The area comes from the running Cloud Function (FUNCTION_TARGET / K_SERVICE,
   one function per instance), else from the notification's type.
========================================================= */
const admin = require("firebase-admin");

const AREAS = ["tech", "classes", "homework", "exams", "live", "attendance", "tuition", "messages", "accounts", "newsletter", "other"];
const AUDIENCES = ["students", "parents", "tutors", "coaches"];

/* Exported function name -> area. Order matters (first match wins). */
const FN_AREAS = [
  [/tech|guardian/i, "tech"],
  [/tuition/i, "tuition"],
  [/attendance|face/i, "attendance"],
  [/ticket|message|chat|conversation/i, "messages"],
  [/exam/i, "exams"],
  [/homework|assignment|submission|deadline|overdue|unattended|releasework|workfile/i, "homework"],
  [/liveclass|timetable/i, "live"],
  [/lesson|resource|publish|audience/i, "classes"],
  [/newsletter/i, "newsletter"],
  [/signup|activated|account|remote|parent|tutor|student/i, "accounts"]
];
/* Notification type -> area, for notifications written outside a known function. */
const TYPE_AREAS = [
  [/tech|build|mission|showcase|practice|coach|guardian/i, "tech"],
  [/tuition/i, "tuition"],
  [/attendance|unattended|absence|absent|strike|late|register/i, "attendance"],
  [/class_scheduled|live|meeting/i, "live"],
  [/ticket|message|chat|reply/i, "messages"],
  [/exam/i, "exams"],
  [/homework|assignment|work|overdue|submission|graded|marked|correction|due/i, "homework"],
  [/lesson|material|topic|resource|posted|publication/i, "classes"],
  [/signup|account|approved|enrol|activated/i, "accounts"]
];
const ROLE_AUDIENCE = { student: "students", builder: "students", parent: "parents", guardian: "parents", tutor: "tutors", coach: "coaches" };

function fnName() { return String(process.env.FUNCTION_TARGET || process.env.K_SERVICE || ""); }
function pick(table, s) {
  if (!s) return "";
  for (const [re, area] of table) if (re.test(s)) return area;
  return "";
}
function areaOfFunction(name) { return pick(FN_AREAS, name === undefined ? fnName() : name); }
function areaOfType(type, collection) {
  if (collection === "techNotifications") return "tech";
  if (collection === "attendanceNotifications") return "attendance";
  return pick(TYPE_AREAS, String(type || "")) || "other";
}
function audienceOf(role) { return ROLE_AUDIENCE[String(role || "").toLowerCase()] || ""; }
function millis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  if (t._seconds != null) return t._seconds * 1000;
  const d = new Date(t); return isNaN(d.getTime()) ? 0 : d.getTime();
}

/* ---- The setting, cached briefly per instance (it is read on every send). ---- */
const CACHE_MS = 20 * 1000;
let cache = { at: 0, cfg: null };
async function config(force) {
  if (!force && cache.at && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  let cfg = null;
  try {
    const s = await admin.firestore().collection("devMode").doc("freeze").get();
    cfg = s.exists ? s.data() : null;
  } catch (e) { console.warn("dev freeze: could not read the setting:", e.message); cfg = cache.cfg; }
  cache = { at: Date.now(), cfg };
  return cfg;
}
function _setConfig(cfg) { cache = { at: cfg === undefined ? 0 : Date.now(), cfg: cfg || null }; }

function active(cfg, now) {
  if (!cfg || cfg.on !== true) return false;
  const until = millis(cfg.until);
  return !until || until > (now || Date.now());
}
function allowed(cfg, who) {
  const list = Array.isArray(cfg.allow) ? cfg.allow : [];
  const uid = String(who.uid || ""), email = String(who.email || "").trim().toLowerCase();
  return list.some((a) => a && ((uid && a.uid === uid) || (email && String(a.email || "").trim().toLowerCase() === email)));
}
function areaHeld(cfg, area) { return !!(cfg.areas && cfg.areas[area || "other"] === true); }
function audienceHeld(cfg, aud) {
  const a = cfg.audiences || {};
  if (!aud) return AUDIENCES.some((k) => a[k] === true);   // unknown person: held if anyone is held
  return a[aud] === true;
}

/* Pure decision, for tests and for the browser preview. who: { uid, email, role, admin } */
function decide(cfg, who, area, now) {
  if (!active(cfg, now)) return false;
  if (!who || who.admin || String(who.role || "").toLowerCase() === "admin") return false;
  if (allowed(cfg, who)) return false;
  if (!areaHeld(cfg, area)) return false;
  return audienceHeld(cfg, audienceOf(who.role));
}

/* ---- Who an email address belongs to (only looked up while a freeze is on). ---- */
const WHO_MS = 5 * 60 * 1000;
const whoCache = new Map();
const EMAIL_COLLECTIONS = [["admins", "admin"], ["tutorAccounts", "tutor"], ["techCoaches", "coach"], ["parentAccounts", "parent"], ["students", "student"], ["techStudents", "student"]];
async function whoIsEmail(email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return { email: key, role: "" };
  const hit = whoCache.get(key);
  if (hit && Date.now() - hit.at < WHO_MS) return hit.who;
  const db = admin.firestore();
  let who = { email: key, role: "" };
  for (const [col, role] of EMAIL_COLLECTIONS) {
    try {
      let s = await db.collection(col).where("email", "==", key).limit(1).get();
      if (s.empty && key !== String(email).trim()) s = await db.collection(col).where("email", "==", String(email).trim()).limit(1).get();
      if (!s.empty) { who = { email: key, role, uid: s.docs[0].id, admin: role === "admin" }; break; }
    } catch (e) { /* a collection without the field: try the next */ }
  }
  whoCache.set(key, { at: Date.now(), who });
  return who;
}

/* ---- The held log ---- */
let recorder = null;   /* tests swap it */
function _setRecorder(fn) { recorder = fn || null; }
async function record(kind, info) {
  if (recorder) return recorder(kind, info);
  try {
    await admin.firestore().collection("devHeld").add(Object.assign({
      kind, fn: fnName().slice(0, 80), at: admin.firestore.FieldValue.serverTimestamp()
    }, info));
  } catch (e) { console.warn("dev freeze: could not log a held item:", e.message); }
}

/* Should this in-app notification be held? Logs it when it is. */
async function holdNotification(collection, recipientId, role, fields) {
  const cfg = await config();
  if (!active(cfg)) return false;
  const f = fields || {};
  /* The type says most (publishClassroomContent posts lessons, homework and exams alike); then the function. */
  const typed = collection === "personalNotifications" ? pick(TYPE_AREAS, String(f.type || "")) : areaOfType(f.type, collection);
  const area = typed || areaOfFunction() || "other";
  if (!decide(cfg, { uid: recipientId, role }, area)) return false;
  await record("notification", {
    area, collection, recipientId: String(recipientId || ""), role: String(role || ""),
    type: String(f.type || "").slice(0, 80), title: String(f.title || "").slice(0, 200), message: String(f.message || "").slice(0, 400)
  });
  return true;
}
/* Should this email be held? Logs it when it is. */
async function holdEmail(to, subject, areaHint) {
  const cfg = await config();
  if (!active(cfg)) return false;
  const area = (AREAS.indexOf(areaHint) > -1 ? areaHint : "") || areaOfFunction() || "other";
  if (!areaHeld(cfg, area)) return false;
  const list = String(to || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  /* Several addresses in one email: held only if every one of them is held. */
  for (const addr of list) {
    const who = await whoIsEmail(addr);
    if (!decide(cfg, who, area)) return false;
  }
  await record("email", { area, email: list.join(", ").slice(0, 300), subject: String(subject || "").slice(0, 200) });
  return true;
}
/* True while a freeze is on: callers mark the notifications they checked so the safety net skips them. */
async function isOn() { return active(await config()); }

module.exports = {
  AREAS, AUDIENCES, config, active, decide, areaOfFunction, areaOfType, audienceOf,
  holdNotification, holdEmail, isOn, whoIsEmail, record, _setConfig, _setRecorder, _whoCache: whoCache
};
