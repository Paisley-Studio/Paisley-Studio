/* =========================================================
   Paisley Studio — Remote Students (admin callables)
   -----------------------------------------------------------
   A remote student is an ordinary students/{uid} record whose
   `studentType` is "remote". That field can only be written by this
   module (Admin SDK) or by an administrator — Firestore rules refuse it
   from the student's own client — so a normal student can never become
   a remote one by editing data or visiting a URL.

   admitRemoteStudent   Admin admits a student: creates the Auth user
                        (random password, never emailed), the student
                        record, links parents/guardians to the existing
                        Parent Portal and emails a single-use link so the
                        student sets their own password.
                        Safe to retry: it never creates a second account
                        or record for the same email.
   resendRemoteInvite   Sends a fresh password-setup link.
   setRemoteStudentStatus  Suspend / reactivate (also disables the
                        Firebase sign-in and revokes live sessions).
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");

const { templates } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const KEY_STAGE_YEARS = {
  "Key Stage 2 (Years 3-6)": [3, 4, 5, 6],
  "Key Stage 3 (Years 7-9)": [7, 8, 9],
  "Key Stage 4 (Years 10-11) — IGCSE": [10, 11],
  "Key Stage 5 (Years 12-13) — A-Level": [12, 13]
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await admin.firestore().collection("admins").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Admins only.");
  return request.auth.uid;
}

const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function validateAdmission(d) {
  const name = clean(d.name, 120);
  const email = clean(d.email, 200).toLowerCase();
  const keyStage = clean(d.keyStage, 80);
  const year = Number(d.year);
  if (!name) throw new HttpsError("invalid-argument", "Student name is required.");
  if (!EMAIL_RE.test(email)) throw new HttpsError("invalid-argument", "A valid student email is required.");
  if (!KEY_STAGE_YEARS[keyStage]) throw new HttpsError("invalid-argument", "Choose a valid Key Stage.");
  if (KEY_STAGE_YEARS[keyStage].indexOf(year) === -1) throw new HttpsError("invalid-argument", "That Year is not part of the chosen Key Stage.");
  const subjects = Array.from(new Set((Array.isArray(d.subjects) ? d.subjects : []).map((x) => clean(x, 60)).filter(Boolean)));
  if (!subjects.length || subjects.length > 20) throw new HttpsError("invalid-argument", "Choose between 1 and 20 subjects.");
  const subjectNames = (Array.isArray(d.subjectNames) ? d.subjectNames : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 20);
  const guardians = (Array.isArray(d.guardians) ? d.guardians : []).slice(0, 4).map((g) => ({
    name: clean(g && g.name, 120), email: clean(g && g.email, 200).toLowerCase(), phone: clean(g && g.phone, 40)
  })).filter((g) => g.email || g.name || g.phone);
  if (!guardians.length) throw new HttpsError("invalid-argument", "At least one parent or guardian is required.");
  guardians.forEach((g, i) => {
    if (!EMAIL_RE.test(g.email)) throw new HttpsError("invalid-argument", `Parent / Guardian ${i + 1} needs a valid email.`);
    if (g.email === email) throw new HttpsError("invalid-argument", "A parent cannot use the student's own email.");
  });
  return { name, email, keyStage, year, subjects, subjectNames, guardians, phone: clean(d.phone, 40) };
}

async function sendInvite(student) {
  const link = await admin.auth().generatePasswordResetLink(student.email, notifications.actionSettings("remote"));
  const t = templates.remoteStudentInvite({ student, resetLink: link });
  return !!(await notifications.sendEmail(student.email, t.subject, t.html)).sent;
}

exports.admitRemoteStudent = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 120 },
  async (request) => {
    const callerUid = await requireAdmin(request);
    const v = validateAdmission(request.data || {});
    const db = admin.firestore();

    // 1. Auth identity — reuse only if it already belongs to THIS remote student.
    let uid, createdAuth = false;
    try {
      uid = (await admin.auth().getUserByEmail(v.email)).uid;
    } catch (e) {
      if (!e || e.code !== "auth/user-not-found") throw new HttpsError("internal", "Could not check the email address.");
    }
    if (uid) {
      const existing = await db.collection("students").doc(uid).get();
      if (existing.exists && existing.data().studentType === "remote") {
        const results = await notifications.linkGuardians(db, uid, existing.data(), v.guardians);
        return { uid, existing: true, created: false, inviteSent: false, parents: results };
      }
      throw new HttpsError("already-exists", "That email already belongs to another Paisley Studio account.");
    }
    uid = (await admin.auth().createUser({
      email: v.email, password: crypto.randomBytes(18).toString("base64url"), displayName: v.name
    })).uid;
    createdAuth = true;

    // 2. Student record — create() fails if it somehow exists, so a retry cannot overwrite.
    const g0 = v.guardians[0];
    const record = {
      name: v.name, email: v.email, phone: v.phone, keyStage: v.keyStage, year: v.year,
      subjects: v.subjects, subjectNames: v.subjectNames,
      guardians: v.guardians, guardianName: g0.name, guardianEmail: g0.email, guardianPhone: g0.phone,
      parentContact: v.guardians.map((g) => [g.name, g.email, g.phone].filter(Boolean).join(" · ")).join(" | "),
      role: "student", studentType: "remote", status: "Active",
      admittedBy: callerUid, admittedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.collection("students").doc(uid).create(record);
    } catch (e) {
      if (createdAuth) await admin.auth().deleteUser(uid).catch(() => {});
      if (e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message)))) throw new HttpsError("already-exists", "A student record already exists for that account.");
      throw new HttpsError("internal", "Could not save the student record.");
    }

    // 3. Parents (existing Parent Portal records are reused, never duplicated).
    let parents = [];
    try { parents = await notifications.linkGuardians(db, uid, record, v.guardians); }
    catch (e) { console.error("admitRemoteStudent: parent linking failed", e); parents = [{ error: e.message || "failed" }]; }

    // 4. Invitation (single-use Firebase link, returns the student to /remote).
    let inviteSent = false;
    try { inviteSent = await sendInvite(record); } catch (e) { console.error("admitRemoteStudent: invite failed", e); }

    return { uid, existing: false, created: true, inviteSent, parents };
  }
);

async function loadRemote(studentId) {
  const id = clean(studentId, 128);
  if (!id) throw new HttpsError("invalid-argument", "studentId required.");
  const ref = admin.firestore().collection("students").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Student not found.");
  if (snap.data().studentType !== "remote") throw new HttpsError("failed-precondition", "That is not a remote student.");
  return { ref, id, data: snap.data() };
}

exports.resendRemoteInvite = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS },
  async (request) => {
    await requireAdmin(request);
    const s = await loadRemote((request.data || {}).studentId);
    if (String(s.data.status || "").toLowerCase() === "suspended") throw new HttpsError("failed-precondition", "Reactivate the student first.");
    return { inviteSent: await sendInvite(s.data) };
  }
);

exports.setRemoteStudentStatus = onCall(
  { cors: true, region: LOCATION },
  async (request) => {
    const callerUid = await requireAdmin(request);
    const status = clean((request.data || {}).status, 20);
    if (["Active", "Suspended"].indexOf(status) === -1) throw new HttpsError("invalid-argument", "Status must be Active or Suspended.");
    const s = await loadRemote((request.data || {}).studentId);
    await admin.auth().updateUser(s.id, { disabled: status === "Suspended" });
    if (status === "Suspended") await admin.auth().revokeRefreshTokens(s.id);
    await s.ref.update({ status, statusChangedAt: admin.firestore.FieldValue.serverTimestamp(), statusChangedBy: callerUid });
    return { status };
  }
);

/* A remote student raised a ticket: tell every admin (bell + email).
   Deterministic ids make a retried trigger harmless. */
const W = require("./work-shared");
exports.onRemoteTicketCreated = onDocumentCreated(
  { document: "tickets/{ticketId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const ticket = event.data.data() || {};
    if (ticket.targetAdmin !== true) return;   // tutor-addressed tickets keep their existing flow
    const db = admin.firestore();
    const student = { name: ticket.studentName, email: ticket.studentEmail, studentType: ticket.studentType };
    const admins = await db.collection("admins").get();
    for (const a of admins.docs) {
      const first = await W.notifyOnce(`ticket_${event.params.ticketId}_${a.id}`, a.id, "admin", {
        type: "ticket_created", title: "New remote student ticket",
        message: `${ticket.studentName || "A remote student"}: ${ticket.subject || "Support ticket"}`,
        relatedEntity: "tickets", relatedEntityId: event.params.ticketId
      });
      if (!first) continue;
      let email = (a.data() || {}).email;
      if (!email) { try { email = (await admin.auth().getUser(a.id)).email; } catch (e) { /* ignore */ } }
      if (email) {
        const t = templates.adminNewRemoteTicket({ student, ticket });
        await notifications.sendEmail(email, t.subject, t.html);
      }
    }
  }
);

exports._internals = { validateAdmission, KEY_STAGE_YEARS };
