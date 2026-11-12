/* =========================================================
   Paisley Studio — optional facial recognition for attendance
   -----------------------------------------------------------
   Runs entirely on Firebase and in the browser. No other server.

   The browser (js/attendance/face.js, face-api.js) finds the face in a camera
   frame or an uploaded photo and turns it into a face descriptor: 128 numbers.
   The picture never leaves the device; only the numbers come here. This
   function compares them with the person's enrolled descriptors (Euclidean
   distance; 0 = identical, about 0.6 = a different person) and decides.

     attendanceSettings/recognition   status: disabled | enabled | suspended,
                                      maxDistance, retentionDays,
                                      studentsApproved (+ dpia), history
     faceProfiles/{uid}               consent and enrollment state, linked by account id
                                      (never by name). No descriptor. Admin may read.
     faceTemplates/{uid}              the enrolled descriptors (AES-256-GCM when
                                      FACE_TEMPLATE_KEY is set). Nobody may read it but
                                      Cloud Functions; it never goes back to a browser.
     faceAttempts/{auto id}           each attempt: who, lesson, result, distance. Pruned.
     attendanceAudit                  enable / disable / suspend, consent, enrol, remove.

   Server-side gates on every attempt (the browser is never trusted):
     - the switch is "enabled", read fresh, and read again before a match counts;
     - students only once the Studio Desk has approved student processing (DPIA);
     - the caller has a faceProfiles doc of the right type, consent granted,
       status enrolled, and a template;
     - 3 frames, each 128 finite numbers, close to each other but not identical
       (a copied vector is refused), never seen before (replays are refused);
     - every frame within maxDistance of the caller's OWN template. The caller is
       the signed-in account, so one person can never register as another.
   A descriptor computed in a browser cannot prove a live person was in front of
   the camera. It confirms identity; the tutor's register stays the record.
========================================================= */
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const W = require("./work-shared");
const A = require("./attendance")._internals;

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const TS = () => admin.firestore.Timestamp;

const MODEL = "face-api.js recognition net (dlib ResNet, 128-d)";
const DIM = 128;
const DEFAULTS = { status: "disabled", maxDistance: 0.5, retentionDays: 90, studentsApproved: false, dpia: null };
const FRAMES = 3;                         // a check-in sends 3 frames taken about half a second apart
const SAME_FRAME = 0.0005;                // frames closer than this are copies, not a camera
const FRAME_SPREAD = 0.45;                // frames further apart than this are not one face
const ENROL_SPREAD = 0.6;                 // reference photos must all be the same person
const MAX_REFS = 5;
const MAX_ATTEMPTS_PER_10_MIN = 8;
const PERSON = { student: { col: "students" }, tutor: { col: "tutorAccounts" } };
const CONSENT_METHODS = ["signed_form", "parent_portal", "email", "in_person", "self_portal"];

const settingsRef = () => db().collection("attendanceSettings").doc("recognition");
const profileRef = (uid) => db().collection("faceProfiles").doc(uid);
const templateRef = (uid) => db().collection("faceTemplates").doc(uid);
async function settings() {
  const s = await settingsRef().get();   // always fresh: switching off must take effect at once
  return Object.assign({}, DEFAULTS, s.exists ? s.data() : {});
}
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 500); }
function requireAuth(request) { if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in again."); return request.auth.uid; }
async function isAdmin(uid) { return (await db().collection("admins").doc(uid).get()).exists; }
function audit(row) { return db().collection("attendanceAudit").add(Object.assign({ at: FV().serverTimestamp(), area: "recognition" }, row)); }

/* ---------------- descriptors ---------------- */
function vec(v) {
  if (!Array.isArray(v) || v.length !== DIM) return null;
  const out = new Array(DIM);
  for (let i = 0; i < DIM; i++) { const x = Number(v[i]); if (!Number.isFinite(x) || Math.abs(x) > 1) return null; out[i] = x; }
  const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
  return norm > 0.2 && norm < 3 ? out : null;     // face-api descriptors sit around norm 1; zeros or junk are refused
}
function dist(a, b) { let s = 0; for (let i = 0; i < DIM; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function vecs(list, min, max) {
  if (!Array.isArray(list) || list.length < min || list.length > max) return null;
  const out = list.map(vec);
  return out.every(Boolean) ? out : null;
}
function fingerprint(v) { return crypto.createHash("sha256").update(v.map((x) => x.toFixed(4)).join(",")).digest("hex").slice(0, 24); }

/* Templates at rest: AES-256-GCM when FACE_TEMPLATE_KEY (64 hex chars, functions/.env) is set;
   otherwise kept in a collection no client can read (Firestore encrypts it at rest). */
function key() { const k = process.env.FACE_TEMPLATE_KEY || ""; return /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, "hex") : null; }
function seal(list) {
  const k = key(), plain = JSON.stringify(list);
  if (!k) return { enc: false, data: plain };
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { enc: true, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: body.toString("base64") };
}
function open(doc) {
  if (!doc) return null;
  if (!doc.enc) return JSON.parse(doc.data);
  const k = key();
  if (!k) throw new Error("FACE_TEMPLATE_KEY is missing, so enrolled faces cannot be read.");
  const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(doc.iv, "base64"));
  d.setAuthTag(Buffer.from(doc.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(doc.data, "base64")), d.final()]).toString("utf8"));
}

/* What attendanceToday tells the browser. Nothing is offered unless every gate passes. */
async function availabilityFor(uid, role) {
  const cfg = await settings();
  if (cfg.status !== "enabled") return { available: false };
  if (role === "student" && !cfg.studentsApproved) return { available: false };
  const p = await profileRef(uid).get();
  if (!p.exists) return { available: false };
  const d = p.data();
  if (d.personType !== role || d.status !== "enrolled" || !d.consent || d.consent.status !== "granted") return { available: false };
  return { available: true };
}

/* ---------------- recognition (one person, their own template) ---------------- */
async function logAttempt(row) {
  const days = Math.max(1, Math.min(3650, Number(row.cfg.retentionDays) || DEFAULTS.retentionDays));
  await db().collection("faceAttempts").add({
    personId: row.uid, personType: row.type, personName: row.name || "", purpose: row.purpose, sessionId: row.sessionId || "", entryId: row.entryId || "",
    result: row.result, distance: row.distance == null ? null : Math.round(row.distance * 1000) / 1000, maxDistance: row.cfg.maxDistance,
    model: MODEL, at: FV().serverTimestamp(), expireAt: TS().fromMillis(Date.now() + days * 86400000)
  });
}
const FEEDBACK = {
  bad_frames: "The camera pictures could not be read. Please reposition your face and try again.",
  inconsistent: "Please hold still, facing the camera, and try again.",
  replay: "Face not recognised. Manual check-in required.",
  no_match: "Face not recognised. Try again, or use the normal check-in."
};
async function recognise(uid, type, frames, ctx) {
  const cfg = await settings();
  if (cfg.status !== "enabled" || (type === "student" && !cfg.studentsApproved)) {
    throw new HttpsError("failed-precondition", "Facial recognition is not available. Please use the normal check-in.", { fallback: true, reason: "disabled" });
  }
  const pRef = profileRef(uid);
  const [p, t] = await Promise.all([pRef.get(), templateRef(uid).get()]);
  const prof = p.exists ? p.data() : null;
  if (!prof || prof.personType !== type || prof.status !== "enrolled" || !prof.consent || prof.consent.status !== "granted" || !t.exists) {
    throw new HttpsError("failed-precondition", "You are not enrolled for facial recognition. Please use the normal check-in.", { fallback: true, reason: "not_enrolled" });
  }
  const live = vecs(frames, FRAMES, FRAMES);
  const base = { uid, type, name: prof.name, purpose: ctx.purpose, sessionId: ctx.sessionId, entryId: ctx.entryId, cfg };
  const prints = live ? live.map(fingerprint) : [];
  // Rate limit + replay check in one transaction, so two tabs cannot both slip through.
  const pre = await db().runTransaction(async (tx) => {
    const s = await tx.get(pRef), d = s.data() || {}, now = Date.now();
    const recent = (d.attemptTimes || []).filter((x) => x > now - 10 * 60000);
    if (recent.length >= MAX_ATTEMPTS_PER_10_MIN) throw new HttpsError("resource-exhausted", "Too many attempts. Please use the normal check-in.", { fallback: true, reason: "rate_limited" });
    const seen = d.seenPrints || [];
    const replay = prints.some((x) => seen.indexOf(x) !== -1);
    tx.update(pRef, { attemptTimes: recent.concat([now]).slice(-MAX_ATTEMPTS_PER_10_MIN), seenPrints: seen.concat(prints).slice(-60) });
    return { replay };
  });
  let result, best = null;
  if (!live) result = "bad_frames";
  else if (pre.replay) result = "replay";
  else {
    let spread = 0, tooClose = false;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const d = dist(live[i], live[j]); spread = Math.max(spread, d); if (d < SAME_FRAME) tooClose = true;
    }
    if (tooClose) result = "replay";
    else if (spread > FRAME_SPREAD) result = "inconsistent";
    else {
      let refs;
      try { refs = open(t.data().template); } catch (e) { console.error("face template", e.message); throw new HttpsError("unavailable", "Recognition is unavailable right now. Please use the normal check-in.", { fallback: true, reason: "error" }); }
      // Each frame must be close to the person's own enrolled faces; the worst frame decides.
      best = Math.max.apply(null, live.map((f) => Math.min.apply(null, refs.map((r) => dist(f, r)))));
      result = best <= cfg.maxDistance ? "matched" : "no_match";
    }
  }
  // Re-read the switch: a disable during the call stops the attempt from counting.
  if (result === "matched") {
    const again = await settings();
    if (again.status !== "enabled" || (type === "student" && !again.studentsApproved)) result = "disabled_during_attempt";
  }
  await logAttempt(Object.assign({}, base, { result, distance: best }));
  if (result === "matched") {
    await pRef.update({ consecutiveFailures: 0, lastMatchedAt: FV().serverTimestamp(), attention: null });
    return { distance: best };
  }
  const fails = (prof.consecutiveFailures || 0) + 1;
  await pRef.update({ consecutiveFailures: FV().increment(1), lastFailedAt: FV().serverTimestamp(),
    attention: fails >= 3 ? { reason: "Repeated recognition failures (" + fails + " in a row). Check the reference photos.", at: TS().now() } : (prof.attention || null) });
  if (result === "disabled_during_attempt") throw new HttpsError("failed-precondition", "Facial recognition was switched off. Please use the normal check-in.", { fallback: true, reason: "disabled" });
  throw new HttpsError("permission-denied", FEEDBACK[result] || FEEDBACK.no_match, { fallback: result === "replay", reason: result });
}

async function studentFaceCheckIn(uid, data) {
  const entryId = String(data.entryId || "");
  const r = await recognise(uid, "student", data.descriptors, { purpose: "student_check_in", entryId });
  // Same engine as the I'm Here button: server time, one record, one strike at most.
  return Object.assign(await A.checkIn(uid, entryId, Date.now(), { method: "face", distance: r.distance }), { recognised: true });
}
async function tutorFaceVerify(uid, data) {
  const sid = String(data.sessionId || "");
  const s = await db().collection("attendanceSessions").doc(sid).get();
  if (!s.exists || (s.data().tutorIds || []).indexOf(uid) === -1) throw new HttpsError("permission-denied", "This is not your lesson.");
  const r = await recognise(uid, "tutor", data.descriptors, { purpose: "tutor_verification", sessionId: sid });
  return Object.assign(await A.recordTutorPresence(uid, sid, Date.now(), { method: "face", distance: r.distance }), { recognised: true });
}

/* ---------------- consent and enrollment ---------------- */
async function personOf(type, uid) {
  if (!PERSON[type]) throw new HttpsError("invalid-argument", "Choose a student or a tutor.");
  const s = await db().collection(PERSON[type].col).doc(String(uid || "")).get();
  if (!s.exists) throw new HttpsError("not-found", "That account does not exist.");
  const d = s.data();
  if (type === "student" && d.studentType && d.studentType !== "online") throw new HttpsError("failed-precondition", "Only online-school students take timetabled registers, so only they can be enrolled.");
  return { id: s.id, name: d.name || (type === "tutor" ? "Tutor" : "Student") };
}
async function deleteEnrollment(uid, why, actor) {
  await templateRef(uid).delete();
  await profileRef(uid).set({ status: "not_enrolled", enrolledAt: null, refCount: 0, removedAt: FV().serverTimestamp(), removal: { reason: why, by: actor.uid, byName: actor.name }, updatedAt: FV().serverTimestamp() }, { merge: true });
}
async function setConsent(type, uid, decision, meta, actor) {
  const person = await personOf(type, uid);
  const row = {
    status: decision === "granted" ? "granted" : "withdrawn", givenBy: clean(meta.givenBy, 120) || actor.name, relationship: clean(meta.relationship, 60),
    method: CONSENT_METHODS.indexOf(meta.method) !== -1 ? meta.method : "signed_form", reference: clean(meta.reference, 200),
    recordedBy: actor.uid, recordedByName: actor.name, recordedByRole: actor.role, at: TS().now()
  };
  if (type === "student" && row.status === "granted" && !/parent|guardian|adult|18/i.test(row.relationship)) {
    throw new HttpsError("invalid-argument", "For a student, consent must come from a parent or guardian (or the student if 18 or over).");
  }
  const ref = profileRef(uid);
  const existing = await ref.get();
  await ref.set(Object.assign({ personId: uid, personType: type, name: person.name, consent: row, consentHistory: FV().arrayUnion(row), updatedAt: FV().serverTimestamp() },
    existing.exists ? {} : { createdAt: FV().serverTimestamp(), status: "not_enrolled" }), { merge: true });
  if (row.status === "withdrawn") await deleteEnrollment(uid, "Consent withdrawn", actor);
  else if (!existing.exists || ["not_enrolled", "withdrawn", undefined].indexOf(existing.data().status) !== -1) await ref.update({ status: "awaiting_photo" });
  await audit({ action: row.status === "granted" ? "face_consent_granted" : "face_consent_withdrawn", personId: uid, personType: type, actorId: actor.uid, actorRole: actor.role, actorName: actor.name, after: { method: row.method, relationship: row.relationship } });
  return { ok: true, consent: row.status };
}

/* ---------------- Studio Desk ---------------- */
async function adminAction(uid, data) {
  if (!(await isAdmin(uid))) throw new HttpsError("permission-denied", "Studio Desk only.");
  const actor = { uid, name: "Studio Desk", role: "admin" };
  const reason = clean(data.reason, 1000);
  const needReason = () => { if (reason.length < 3) throw new HttpsError("invalid-argument", "Give a reason. Every decision is recorded."); };
  const action = String(data.action || "");
  const cfg = await settings();

  if (action === "status") {
    const st = String(data.status || "");
    if (["enabled", "disabled", "suspended"].indexOf(st) === -1) throw new HttpsError("invalid-argument", "Unknown status.");
    needReason();
    await settingsRef().set({ status: st, model: MODEL, updatedAt: FV().serverTimestamp(), updatedBy: uid, history: FV().arrayUnion({ status: st, reason, by: uid, at: TS().now() }) }, { merge: true });
    await audit({ action: "recognition_" + st, actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { status: cfg.status }, after: { status: st } });
    return { ok: true, status: st };
  }
  if (action === "config") {
    needReason();
    const maxDistance = Number(data.maxDistance), days = Math.round(Number(data.retentionDays));
    if (!(maxDistance >= 0.35 && maxDistance <= 0.6)) throw new HttpsError("invalid-argument", "The match distance must be between 0.35 (strict) and 0.60 (lenient).");
    if (!(days >= 7 && days <= 730)) throw new HttpsError("invalid-argument", "Keep attempt logs between 7 and 730 days.");
    await settingsRef().set({ maxDistance, retentionDays: days, updatedAt: FV().serverTimestamp(), updatedBy: uid, history: FV().arrayUnion({ config: { maxDistance, retentionDays: days }, reason, by: uid, at: TS().now() }) }, { merge: true });
    await audit({ action: "recognition_config", actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { maxDistance: cfg.maxDistance, retentionDays: cfg.retentionDays }, after: { maxDistance, retentionDays: days } });
    return { ok: true };
  }
  if (action === "students") {
    needReason();
    const approve = data.approve === true;
    const dpia = clean(data.dpiaReference, 200);
    if (approve && dpia.length < 3) throw new HttpsError("invalid-argument", "Record the reference of the completed Data Protection Impact Assessment first.");
    if (approve && data.confirm !== true) throw new HttpsError("invalid-argument", "Confirm the safeguards checklist first.");
    await settingsRef().set({ studentsApproved: approve, dpia: approve ? { reference: dpia, approvedBy: uid, at: TS().now(), reason } : cfg.dpia, updatedAt: FV().serverTimestamp(),
      history: FV().arrayUnion({ studentsApproved: approve, dpia, reason, by: uid, at: TS().now() }) }, { merge: true });
    await audit({ action: approve ? "recognition_students_approved" : "recognition_students_withdrawn", actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { dpia } });
    return { ok: true };
  }
  if (action === "consent") {
    needReason();
    return setConsent(String(data.personType), String(data.personId), data.decision === "granted" ? "granted" : "withdrawn",
      { givenBy: data.givenBy, relationship: data.relationship, method: data.method, reference: data.reference || reason }, actor);
  }
  if (action === "enroll") {
    const type = String(data.personType), pid = String(data.personId);
    const person = await personOf(type, pid);
    if (cfg.status === "disabled") throw new HttpsError("failed-precondition", "Enable or suspend facial recognition before enrolling anyone. While it is disabled no biometric data is processed.");
    if (type === "student" && !cfg.studentsApproved) throw new HttpsError("failed-precondition", "Student enrollment opens once the Data Protection Impact Assessment is recorded and student processing is approved.");
    const p = await profileRef(pid).get();
    if (!p.exists || !p.data().consent || p.data().consent.status !== "granted") throw new HttpsError("failed-precondition", "Record consent before adding reference photos.");
    const refs = vecs(data.descriptors, 1, MAX_REFS);
    if (!refs) throw new HttpsError("invalid-argument", "The reference photos could not be read. Use 1 to " + MAX_REFS + " clear photos with one face each.");
    for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) {
      if (dist(refs[i], refs[j]) > ENROL_SPREAD) throw new HttpsError("invalid-argument", "These photos do not look like the same person. Use photos of " + person.name + " only.");
    }
    const replacing = p.data().status === "enrolled";
    await templateRef(pid).set({ personId: pid, personType: type, model: MODEL, dim: DIM, template: seal(refs), count: refs.length, updatedAt: FV().serverTimestamp() });
    await profileRef(pid).set({ personId: pid, personType: type, name: person.name, status: "enrolled", enrolledAt: FV().serverTimestamp(), enrolledBy: uid, refCount: refs.length,
      model: MODEL, photoVersion: FV().increment(1), consecutiveFailures: 0, attention: null, seenPrints: [], updatedAt: FV().serverTimestamp() }, { merge: true });
    await audit({ action: replacing ? "face_photo_replaced" : "face_enrolled", personId: pid, personType: type, actorId: uid, actorRole: "admin", actorName: actor.name, after: { photos: refs.length } });
    return { ok: true, replaced: replacing, photos: refs.length };
  }
  if (action === "remove") {
    needReason();
    const type = String(data.personType), pid = String(data.personId);
    await deleteEnrollment(pid, reason, actor);
    await audit({ action: "face_enrollment_removed", personId: pid, personType: type, actorId: uid, actorRole: "admin", actorName: actor.name, reason });
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
}

/* Parents (for their child), tutors (for themselves) and students (withdraw only) manage consent.
   Withdrawal is always possible, even while the feature is switched off. */
async function consentCall(uid, data) {
  const action = String(data.action || "status");
  const cfg = await settings();
  let type, pid, actor;
  if (data.studentId && data.studentId !== uid) {
    const link = await db().collection("parentStudentLinks").doc(uid + "_" + data.studentId).get();
    if (!link.exists) throw new HttpsError("permission-denied", "You can only manage consent for your own child.");
    const pa = await db().collection("parentAccounts").doc(uid).get();
    type = "student"; pid = String(data.studentId); actor = { uid, name: (pa.exists && pa.data().name) || "Parent", role: "parent" };
  } else {
    const [t, s] = await Promise.all([db().collection("tutorAccounts").doc(uid).get(), db().collection("students").doc(uid).get()]);
    if (t.exists) { type = "tutor"; actor = { uid, name: t.data().name || "Tutor", role: "tutor" }; }
    else if (s.exists) { type = "student"; actor = { uid, name: s.data().name || "Student", role: "student" }; }
    else throw new HttpsError("permission-denied", "No account found.");
    pid = uid;
  }
  const p = await profileRef(pid).get();
  const prof = p.exists ? p.data() : null;
  const view = () => ({ enabled: cfg.status !== "disabled" && (type === "tutor" || cfg.studentsApproved), consent: prof && prof.consent ? prof.consent.status : "none", enrolled: !!(prof && prof.status === "enrolled") });
  if (action === "status") {
    if (!view().enabled && !(actor.role === "parent" && prof && prof.consent && prof.consent.status === "granted")) return { enabled: false };
    return view();
  }
  if (action === "withdraw") return setConsent(type, pid, "withdrawn", { givenBy: actor.name, relationship: actor.role === "parent" ? "parent/guardian" : "self", method: actor.role === "parent" ? "parent_portal" : "self_portal" }, actor);
  if (action === "grant") {
    if (!view().enabled) throw new HttpsError("failed-precondition", "Facial recognition is not offered at the moment.");
    if (actor.role === "student") throw new HttpsError("permission-denied", "A parent or guardian gives consent for students. Ask them to use the Parent Portal.");
    return setConsent(type, pid, "granted", { givenBy: actor.name, relationship: actor.role === "parent" ? "parent/guardian" : "self (adult tutor)", method: actor.role === "parent" ? "parent_portal" : "self_portal", reference: "Given in the portal" }, actor);
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
}

/* ---------------- retention (daily) ---------------- */
async function retention(now) {
  const out = { attemptsDeleted: 0, enrollmentsDeleted: 0, flagged: 0 };
  const old = await db().collection("faceAttempts").where("expireAt", "<=", TS().fromMillis(now)).limit(400).get();
  const b = db().batch(); old.forEach((d) => b.delete(d.ref)); if (old.size) await b.commit();
  out.attemptsDeleted = old.size;
  const profs = await db().collection("faceProfiles").where("status", "==", "enrolled").get();
  const sys = { uid: "system", name: "System", role: "system" };
  for (const d of profs.docs) {
    const p = d.data();
    if (!PERSON[p.personType]) continue;
    const acct = await db().collection(PERSON[p.personType].col).doc(d.id).get();
    if (!acct.exists) {
      await deleteEnrollment(d.id, "Account deleted", sys);
      await audit({ action: "face_enrollment_removed", personId: d.id, personType: p.personType, actorId: "system", actorRole: "system", actorName: "System", reason: "Account deleted" });
      out.enrollmentsDeleted++;
      continue;
    }
    const st = String(acct.data().status || "Active");
    if (st !== "Active" && !(p.attention && /no longer active/.test(p.attention.reason))) {
      await d.ref.update({ attention: { reason: "Account no longer active (" + st + "). Remove the enrollment if they have left.", at: TS().now() } });
      out.flagged++;
    }
  }
  // Templates whose profile is gone or no longer enrolled are deleted.
  const tpl = await db().collection("faceTemplates").get();
  for (const d of tpl.docs) {
    const p = await profileRef(d.id).get();
    if (!p.exists || p.data().status !== "enrolled") { await d.ref.delete(); out.enrollmentsDeleted++; }
  }
  return out;
}

/* ---------------- exports ---------------- */
const CALL = { cors: true, region: W.LOCATION, timeoutSeconds: 30 };
const wrap = (fn) => async (request) => {
  try { return await fn(request); } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("face", e);
    throw new HttpsError("internal", "Recognition could not be completed. Please use the normal check-in.", { fallback: true, reason: "error" });
  }
};
exports.faceAdmin = onCall(CALL, wrap(async (request) => adminAction(requireAuth(request), request.data || {})));
exports.faceCheckIn = onCall(CALL, wrap(async (request) => studentFaceCheckIn(requireAuth(request), request.data || {})));
exports.faceTutorVerify = onCall(CALL, wrap(async (request) => tutorFaceVerify(requireAuth(request), request.data || {})));
exports.faceConsent = onCall(CALL, wrap(async (request) => consentCall(requireAuth(request), request.data || {})));
exports.faceRetention = onSchedule({ schedule: "every day 02:30", region: W.LOCATION, timeZone: W.TIME_ZONE, timeoutSeconds: 300 },
  async () => { const r = await retention(Date.now()); console.log("faceRetention", JSON.stringify(r)); });

exports.availabilityFor = availabilityFor;
exports._internals = { settings, availabilityFor, recognise, studentFaceCheckIn, tutorFaceVerify, adminAction, consentCall, retention, dist, vec, seal, open, DEFAULTS, MODEL };
