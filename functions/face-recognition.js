/* =========================================================
   Paisley Studio — optional facial recognition for attendance
   -----------------------------------------------------------
   One school-wide switch, held by the Studio Desk:

     attendanceSettings/recognition   status: disabled | enabled | suspended,
                                      threshold, margin, retentionDays,
                                      studentsApproved (+ dpia), history
     privateConfig/faceRecognition    engine URL + API key (no client may read it)
     faceProfiles/{uid}               one per enrolled-or-consenting person, linked by
                                      account id (never by name): personType student|tutor,
                                      consent, enrollment state. No image, no template.
     faceAttempts/{auto id}           every recognition attempt: who, lesson, result,
                                      similarity, threshold. No image. Pruned after retentionDays.
     attendanceAudit                  enable / disable / suspend, consent, enrol, remove.

   Reference photos are uploaded by the Studio Desk and passed straight to
   the self-hosted engine (functions/face-provider.js), which keeps the face
   example under the subject "s_<uid>" or "t_<uid>". Firebase keeps no copy.
   Check-in frames are sent to the engine, compared, and discarded.

   Server-side gates on every call (the browser is never trusted):
     - the switch is "enabled" (not disabled, not suspended), read fresh;
     - students only once the Studio Desk has approved student processing
       (DPIA reference recorded);
     - the caller has a faceProfiles doc of the right type, consent granted,
       status enrolled;
     - exactly one face, best match is the caller's own subject, similarity
       at or above the threshold, and clearly ahead of any other subject.
   Anything else is a refusal, logged, and the normal check-in stays available.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const W = require("./work-shared");
const P = require("./face-provider");
const A = require("./attendance")._internals;

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;
const TS = () => admin.firestore.Timestamp;

const DEFAULTS = { status: "disabled", threshold: 0.9, margin: 0.05, retentionDays: 90, studentsApproved: false, dpia: null };
const MAX_IMAGE_CHARS = 1400000;           // about 1 MB of JPEG as base64
const MAX_ATTEMPTS_PER_10_MIN = 8;
const PERSON = { student: { col: "students", prefix: "s_" }, tutor: { col: "tutorAccounts", prefix: "t_" } };
const CONSENT_METHODS = ["signed_form", "parent_portal", "email", "in_person", "self_portal"];

const settingsRef = () => db().collection("attendanceSettings").doc("recognition");
async function settings() {
  const s = await settingsRef().get();   // always fresh: switching off must take effect at once
  return Object.assign({}, DEFAULTS, s.exists ? s.data() : {});
}
const subjectOf = (type, uid) => PERSON[type].prefix + uid;
const profileRef = (uid) => db().collection("faceProfiles").doc(uid);
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 500); }
function requireAuth(request) { if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in again."); return request.auth.uid; }
async function isAdmin(uid) { return (await db().collection("admins").doc(uid).get()).exists; }
function audit(row) { return db().collection("attendanceAudit").add(Object.assign({ at: FV().serverTimestamp(), area: "recognition" }, row)); }

function cleanImage(img) {
  let b64 = String(img || "");
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,/i.exec(b64);
  if (m) b64 = b64.slice(m[0].length);
  if (!b64 || b64.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new HttpsError("invalid-argument", "The picture could not be read. Try again.");
  return b64.replace(/\s+/g, "");
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

/* ---------------- recognition (one person, one face) ---------------- */
async function logAttempt(row) {
  const cfg = row.cfg || {};
  const days = Math.max(1, Math.min(3650, Number(cfg.retentionDays) || DEFAULTS.retentionDays));
  await db().collection("faceAttempts").add({
    personId: row.uid, personType: row.type, personName: row.name || "", purpose: row.purpose, sessionId: row.sessionId || "", entryId: row.entryId || "",
    result: row.result, similarity: row.similarity == null ? null : Math.round(row.similarity * 1000) / 1000, threshold: cfg.threshold || null,
    provider: row.provider || "", at: FV().serverTimestamp(), expireAt: TS().fromMillis(Date.now() + days * 86400000)
  });
}
const FEEDBACK = {
  no_face: "Please reposition your face: look straight at the camera in good light.",
  multiple_faces: "Only you should be in front of the camera. Please try again on your own.",
  no_match: "Face not recognised. Try again, or use the normal check-in.",
  low_confidence: "Face not recognised clearly enough. Please reposition your face, or use the normal check-in.",
  ambiguous: "Face not recognised clearly enough. Please use the normal check-in.",
  wrong_person: "Face not recognised. Manual check-in required."
};
async function recognise(uid, type, imageRaw, ctx) {
  const cfg = await settings();
  if (cfg.status !== "enabled" || (type === "student" && !cfg.studentsApproved)) {
    throw new HttpsError("failed-precondition", "Facial recognition is not available. Please use the normal check-in.", { fallback: true, reason: "disabled" });
  }
  const pRef = profileRef(uid);
  const p = await pRef.get();
  const prof = p.exists ? p.data() : null;
  if (!prof || prof.personType !== type || prof.status !== "enrolled" || !prof.consent || prof.consent.status !== "granted") {
    throw new HttpsError("failed-precondition", "You are not enrolled for facial recognition. Please use the normal check-in.", { fallback: true, reason: "not_enrolled" });
  }
  // Rate limit per person (transaction so two tabs cannot both slip through).
  await db().runTransaction(async (tx) => {
    const s = await tx.get(pRef);
    const now = Date.now();
    const recent = ((s.data() || {}).attemptTimes || []).filter((t) => t > now - 10 * 60000);
    if (recent.length >= MAX_ATTEMPTS_PER_10_MIN) throw new HttpsError("resource-exhausted", "Too many attempts. Please use the normal check-in.", { fallback: true, reason: "rate_limited" });
    tx.update(pRef, { attemptTimes: recent.concat([now]).slice(-MAX_ATTEMPTS_PER_10_MIN) });
  });
  const b64 = cleanImage(imageRaw);
  const base = { uid, type, name: prof.name, purpose: ctx.purpose, sessionId: ctx.sessionId, entryId: ctx.entryId, cfg };
  let prov, out;
  try {
    prov = await P.provider();
    out = await prov.recognize(b64);
  } catch (e) {
    await logAttempt(Object.assign({}, base, { result: "engine_unavailable", provider: prov ? prov.name : "" }));
    if (e instanceof P.ProviderRejected) throw new HttpsError("invalid-argument", FEEDBACK.no_face, { fallback: false, reason: "no_face" });
    throw new HttpsError("unavailable", "Recognition is unavailable right now. Please use the normal check-in.", { fallback: true, reason: "engine_unavailable" });
  }
  const faces = (out.faces || []).filter((f) => f.probability >= 0.8 || f.probability === 0);
  let result, sim = null;
  if (!faces.length) result = "no_face";
  else if (faces.length > 1) result = "multiple_faces";
  else {
    const m = faces[0].matches || [], top = m[0], second = m.filter((x) => top && x.subject !== top.subject)[0];
    sim = top ? top.similarity : null;
    if (!top) result = "no_match";
    else if (top.subject !== subjectOf(type, uid)) result = top.similarity >= cfg.threshold ? "wrong_person" : "no_match";
    else if (top.similarity < cfg.threshold) result = "low_confidence";
    else if (second && top.similarity - second.similarity < cfg.margin) result = "ambiguous";
    else result = "matched";
  }
  // Re-read the switch: a disable during the call stops the attempt from counting.
  const again = await settings();
  if (result === "matched" && (again.status !== "enabled" || (type === "student" && !again.studentsApproved))) result = "disabled_during_attempt";
  await logAttempt(Object.assign({}, base, { result, similarity: result === "wrong_person" ? null : sim, provider: prov.name }));
  if (result === "matched") {
    await pRef.update({ consecutiveFailures: 0, lastMatchedAt: FV().serverTimestamp(), attention: null });
    return { similarity: sim };
  }
  const fails = (prof.consecutiveFailures || 0) + 1;
  await pRef.update({ consecutiveFailures: FV().increment(1), lastFailedAt: FV().serverTimestamp(),
    attention: fails >= 3 ? { reason: "Repeated recognition failures (" + fails + " in a row). Check the reference photo.", at: TS().now() } : (prof.attention || null) });
  if (result === "disabled_during_attempt") throw new HttpsError("failed-precondition", "Facial recognition was switched off. Please use the normal check-in.", { fallback: true, reason: "disabled" });
  throw new HttpsError("permission-denied", FEEDBACK[result] || FEEDBACK.no_match, { fallback: result !== "no_face", reason: result });
}

async function studentFaceCheckIn(uid, data) {
  const entryId = String(data.entryId || "");
  const r = await recognise(uid, "student", data.image, { purpose: "student_check_in", entryId });
  // Same engine as the I'm Here button: server time, one record, one strike at most.
  return Object.assign(await A.checkIn(uid, entryId, Date.now(), { method: "face", similarity: r.similarity }), { recognised: true });
}
async function tutorFaceVerify(uid, data) {
  const sid = String(data.sessionId || "");
  const s = await db().collection("attendanceSessions").doc(sid).get();
  if (!s.exists || (s.data().tutorIds || []).indexOf(uid) === -1) throw new HttpsError("permission-denied", "This is not your lesson.");
  const r = await recognise(uid, "tutor", data.image, { purpose: "tutor_verification", sessionId: sid });
  return Object.assign(await A.recordTutorPresence(uid, sid, Date.now(), { method: "face", similarity: r.similarity }), { recognised: true });
}

/* ---------------- consent and enrollment ---------------- */
async function personOf(type, uid) {
  if (!PERSON[type]) throw new HttpsError("invalid-argument", "Choose a student or a tutor.");
  const s = await db().collection(PERSON[type].col).doc(String(uid || "")).get();
  if (!s.exists) throw new HttpsError("not-found", "That account does not exist.");
  const d = s.data();
  if (type === "student" && d.studentType && d.studentType !== "online") throw new HttpsError("failed-precondition", "Only online-school students take timetabled registers, so only they can be enrolled.");
  return { id: s.id, name: d.name || (type === "tutor" ? "Tutor" : "Student"), email: d.email || "" };
}
async function deleteEnrollment(type, uid, why, actor) {
  let engine = "not_needed";
  const p = await profileRef(uid).get();
  if (p.exists && (p.data().status === "enrolled" || p.data().enrolledAt)) {
    try { const prov = await P.provider(); await prov.remove(subjectOf(type, uid)); engine = "deleted"; }
    catch (e) { engine = "pending"; }   // retried by the daily job until the engine confirms
  }
  await profileRef(uid).set({ status: engine === "pending" ? "deletion_pending" : "not_enrolled", enrolledAt: null, removedAt: FV().serverTimestamp(), removal: { reason: why, by: actor.uid, byName: actor.name, engine }, updatedAt: FV().serverTimestamp() }, { merge: true });
  return engine;
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
  await ref.set(Object.assign({ personId: uid, personType: type, name: person.name, subject: subjectOf(type, uid), consent: row, consentHistory: FV().arrayUnion(row), updatedAt: FV().serverTimestamp() },
    existing.exists ? {} : { createdAt: FV().serverTimestamp() }), { merge: true });
  let engine = null;
  if (row.status === "withdrawn") engine = await deleteEnrollment(type, uid, "Consent withdrawn", actor);
  else { const cur = (await ref.get()).data(); if (!cur.status || cur.status === "not_enrolled" || cur.status === "withdrawn") await ref.update({ status: "awaiting_photo" }); }
  await audit({ action: row.status === "granted" ? "face_consent_granted" : "face_consent_withdrawn", personId: uid, personType: type, actorId: actor.uid, actorRole: actor.role, actorName: actor.name, after: { method: row.method, relationship: row.relationship, engine } });
  return { ok: true, consent: row.status, engine };
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
    if (st === "enabled") {
      const prov = await P.provider(true);
      if (!prov.configured()) throw new HttpsError("failed-precondition", "Connect the recognition engine first (engine URL and API key).");
      let h; try { h = await prov.health(); } catch (e) { h = { ok: false, detail: e.message }; }
      if (!h.ok) throw new HttpsError("failed-precondition", "The recognition engine did not answer: " + h.detail);
    }
    await settingsRef().set({ status: st, updatedAt: FV().serverTimestamp(), updatedBy: uid, history: FV().arrayUnion({ status: st, reason, by: uid, at: TS().now() }) }, { merge: true });
    await audit({ action: "recognition_" + st, actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { status: cfg.status }, after: { status: st } });
    return { ok: true, status: st };
  }
  if (action === "config") {
    needReason();
    const threshold = Number(data.threshold), margin = Number(data.margin), days = Math.round(Number(data.retentionDays));
    if (!(threshold >= 0.8 && threshold <= 0.995)) throw new HttpsError("invalid-argument", "The confidence threshold must be between 0.80 and 0.995.");
    if (!(margin >= 0 && margin <= 0.3)) throw new HttpsError("invalid-argument", "The margin must be between 0 and 0.30.");
    if (!(days >= 7 && days <= 730)) throw new HttpsError("invalid-argument", "Keep attempt logs between 7 and 730 days.");
    await settingsRef().set({ threshold, margin, retentionDays: days, updatedAt: FV().serverTimestamp(), updatedBy: uid, history: FV().arrayUnion({ config: { threshold, margin, retentionDays: days }, reason, by: uid, at: TS().now() }) }, { merge: true });
    await audit({ action: "recognition_config", actorId: uid, actorRole: "admin", actorName: actor.name, reason, before: { threshold: cfg.threshold, margin: cfg.margin, retentionDays: cfg.retentionDays }, after: { threshold, margin, retentionDays: days } });
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
  if (action === "engine") {
    needReason();
    const url = clean(data.url, 300).replace(/\/+$/, "");
    if (!/^https:\/\/[^\s/]+/i.test(url)) throw new HttpsError("invalid-argument", "Give the engine's HTTPS address, e.g. https://face.example.com");
    const patch = { provider: "compreface", url, updatedAt: FV().serverTimestamp(), updatedBy: uid };
    if (clean(data.apiKey, 200)) patch.apiKey = clean(data.apiKey, 200);
    await db().collection("privateConfig").doc("faceRecognition").set(patch, { merge: true });
    P.resetCache();
    await settingsRef().set({ engine: { provider: "compreface", host: url.replace(/^https:\/\//i, "").split("/")[0], keySet: !!(patch.apiKey || (await P.engineConfig(true)).apiKey), updatedAt: TS().now() } }, { merge: true });
    await audit({ action: "recognition_engine_changed", actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { host: url.replace(/^https:\/\//i, "").split("/")[0], keyChanged: !!patch.apiKey } });
    return engineTest();
  }
  if (action === "test") return engineTest();
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
    if (!p.exists || !p.data().consent || p.data().consent.status !== "granted") throw new HttpsError("failed-precondition", "Record consent before uploading a reference photo.");
    const b64 = cleanImage(data.image);
    const prov = await P.provider();
    try { await prov.enroll(subjectOf(type, pid), b64); }
    catch (e) {
      if (e instanceof P.ProviderRejected) throw new HttpsError("invalid-argument", e.message);
      throw new HttpsError("unavailable", "The recognition engine is unavailable. Try again later.");
    }
    const replacing = p.data().status === "enrolled";
    await profileRef(pid).set({ personId: pid, personType: type, name: person.name, subject: subjectOf(type, pid), status: "enrolled", enrolledAt: FV().serverTimestamp(), enrolledBy: uid,
      photoVersion: FV().increment(1), consecutiveFailures: 0, attention: null, provider: prov.name, updatedAt: FV().serverTimestamp() }, { merge: true });
    await audit({ action: replacing ? "face_photo_replaced" : "face_enrolled", personId: pid, personType: type, actorId: uid, actorRole: "admin", actorName: actor.name });
    return { ok: true, replaced: replacing };
  }
  if (action === "remove") {
    needReason();
    const type = String(data.personType), pid = String(data.personId);
    await personOf(type, pid).catch(() => null);
    const engine = await deleteEnrollment(type, pid, reason, actor);
    await audit({ action: "face_enrollment_removed", personId: pid, personType: type, actorId: uid, actorRole: "admin", actorName: actor.name, reason, after: { engine } });
    return { ok: true, engine };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
}
async function engineTest() {
  const prov = await P.provider(true);
  if (!prov.configured()) return { ok: false, detail: "Not configured" };
  try { const h = await prov.health(); await settingsRef().set({ engineCheck: { ok: h.ok, detail: h.detail, at: TS().now() } }, { merge: true }); return h; }
  catch (e) { await settingsRef().set({ engineCheck: { ok: false, detail: e.message, at: TS().now() } }, { merge: true }); return { ok: false, detail: e.message }; }
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
    // Students and tutors see nothing while the feature is off; parents still see an existing consent so they can withdraw it.
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
  const profs = await db().collection("faceProfiles").where("status", "in", ["enrolled", "deletion_pending"]).get();
  for (const d of profs.docs) {
    const p = d.data(), type = p.personType;
    if (!PERSON[type]) continue;
    const acct = await db().collection(PERSON[type].col).doc(d.id).get();
    const sys = { uid: "system", name: "System", role: "system" };
    if (p.status === "deletion_pending" || !acct.exists) {
      const engine = await deleteEnrollment(type, d.id, acct.exists ? "Retrying deletion" : "Account deleted", sys);
      if (engine !== "pending") { out.enrollmentsDeleted++; await audit({ action: "face_enrollment_removed", personId: d.id, personType: type, actorId: "system", actorRole: "system", actorName: "System", reason: acct.exists ? "Deletion retried" : "Account deleted" }); }
      continue;
    }
    const st = String(acct.data().status || "Active");
    if (st !== "Active" && !(p.attention && /no longer active/.test(p.attention.reason))) {
      await d.ref.update({ attention: { reason: "Account no longer active (" + st + "). Remove the enrollment if they have left.", at: TS().now() } });
      out.flagged++;
    }
  }
  return out;
}

/* ---------------- exports ---------------- */
const CALL = { cors: true, region: W.LOCATION, timeoutSeconds: 30, memory: "512MiB" };
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
exports._internals = { settings, availabilityFor, recognise, studentFaceCheckIn, tutorFaceVerify, adminAction, consentCall, retention, subjectOf, DEFAULTS };
