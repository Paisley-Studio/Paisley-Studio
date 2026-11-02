/* =========================================================
   Paisley Studio — Remote Students (admin callables)
========================================================= */
const { onRequest } = require("firebase-functions/v2/https");
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

// Helper for manual error responses
function sendError(res, code, message) {
  res.status(code).send(JSON.stringify({ error: { status: "INVALID_ARGUMENT", message } }));
}

const clean = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function validateAdmission(d) {
  const name = clean(d.name, 120);
  const email = clean(d.email, 200).toLowerCase();
  const keyStage = clean(d.keyStage, 80);
  const year = Number(d.year);
  if (!name) throw new Error("Student name is required.");
  if (!EMAIL_RE.test(email)) throw new Error("A valid student email is required.");
  if (!KEY_STAGE_YEARS[keyStage]) throw new Error("Choose a valid Key Stage.");
  if (KEY_STAGE_YEARS[keyStage].indexOf(year) === -1) throw new Error("That Year is not part of the chosen Key Stage.");
  const subjects = Array.from(new Set((Array.isArray(d.subjects) ? d.subjects : []).map((x) => clean(x, 60)).filter(Boolean)));
  if (!subjects.length || subjects.length > 20) throw new Error("Choose between 1 and 20 subjects.");
  const subjectNames = (Array.isArray(d.subjectNames) ? d.subjectNames : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 20);
  const guardians = (Array.isArray(d.guardians) ? d.guardians : []).slice(0, 4).map((g) => ({
    name: clean(g && g.name, 120), email: clean(g && g.email, 200).toLowerCase(), phone: clean(g && g.phone, 40)
  })).filter((g) => g.email || g.name || g.phone);
  if (!guardians.length) throw new Error("At least one parent or guardian is required.");
  guardians.forEach((g, i) => {
    if (!EMAIL_RE.test(g.email)) throw new Error(`Parent / Guardian ${i + 1} needs a valid email.`);
    if (g.email === email) throw new Error("A parent cannot use the student's own email.");
  });
  return { name, email, keyStage, year, subjects, subjectNames, guardians, phone: clean(d.phone, 40) };
}

async function sendInvite(student) {
  const link = await admin.auth().generatePasswordResetLink(student.email, notifications.actionSettings("remote"));
  const t = templates.remoteStudentInvite({ student, resetLink: link });
  return !!(await notifications.sendEmail(student.email, t.subject, t.html)).sent;
}

/* ---------------------------------------------------------
   ADMIT REMOTE STUDENT (Manual HTTP Request + CORS)
--------------------------------------------------------- */
exports.admitRemoteStudent = onRequest(
  { region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 120 },
  async (req, res) => {
    // 1. Manually handle CORS preflight
    res.set("Access-Control-Allow-Origin", "https://www.paisleystudio.online");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      // 2. Manually parse the Firebase Callable payload
      const body = req.body || {};
      const data = body.data || {};
      
      // 3. Auth Check (Since it's onRequest, we must check the token manually)
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.replace("Bearer ", "");
      if (!idToken) throw new Error("You must be signed in.");
      
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const callerUid = decodedToken.uid;

      // Check if caller is admin
      const adminSnap = await admin.firestore().collection("admins").doc(callerUid).get();
      if (!adminSnap.exists) throw new Error("Admins only.");

      // 4. Run the admission logic
      const v = validateAdmission(data);
      const db = admin.firestore();

      let uid, createdAuth = false;
      try {
        uid = (await admin.auth().getUserByEmail(v.email)).uid;
      } catch (e) {
        if (!e || e.code !== "auth/user-not-found") throw new Error("Could not check the email address.");
      }
      
      if (uid) {
        const existing = await db.collection("students").doc(uid).get();
        if (existing.exists && existing.data().studentType === "remote") {
          const results = await notifications.linkGuardians(db, uid, existing.data(), v.guardians);
          res.status(200).send(JSON.stringify({ result: { uid, existing: true, created: false, inviteSent: false, parents: results } }));
          return;
        }
        throw new Error("That email already belongs to another Paisley Studio account.");
      }
      
      uid = (await admin.auth().createUser({
        email: v.email, password: crypto.randomBytes(18).toString("base64url"), displayName: v.name
      })).uid;
      createdAuth = true;

      const g0 = v.guardians[0];
      const record = {
        name: v.name, email: v.email, phone: v.phone, keyStage: v.keyStage, year: v.year,
        subjects: v.subjects, subjectNames: v.subjectNames,
        guardians: v.guardians, guardianName: g0.name, guardianEmail: g0.email, guardianPhone: g0.phone,
        parentContact: v.guardians.map((g) => [g.name, g.email, g.phone].filter(Boolean).join(" · ")).join(" | "),
        role: "student", studentType: "remote", status: "Active",
        admittedBy: callerUid, admittedAt: admin.firestore.FieldValue.serverTimestamp(),
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      try {
        await db.collection("students").doc(uid).create(record);
      } catch (e) {
        if (createdAuth) await admin.auth().deleteUser(uid).catch(() => {});
        if (e && (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message)))) throw new Error("A student record already exists for that account.");
        throw new Error("Could not save the student record.");
      }

      let parents = [];
      try { parents = await notifications.linkGuardians(db, uid, record, v.guardians); }
      catch (e) { console.error("parent linking failed", e); parents = [{ error: e.message || "failed" }]; }

      let inviteSent = false;
      try { inviteSent = await sendInvite(record); } catch (e) { console.error("invite failed", e); }

      res.status(200).send(JSON.stringify({ result: { uid, existing: false, created: true, inviteSent, parents } }));

    } catch (error) {
      console.error("admitRemoteStudent error:", error);
      sendError(res, 400, error.message || "An error occurred.");
    }
  }
);

/* ---------------------------------------------------------
   RESEND REMOTE INVITE
--------------------------------------------------------- */
async function loadRemote(studentId) {
  const id = clean(studentId, 128);
  if (!id) throw new Error("studentId required.");
  const ref = admin.firestore().collection("students").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Student not found.");
  if (snap.data().studentType !== "remote") throw new Error("That is not a remote student.");
  return { ref, id, data: snap.data() };
}

exports.resendRemoteInvite = onRequest(
  { region: LOCATION, secrets: SMTP_SECRETS },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "https://www.paisleystudio.online");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.replace("Bearer ", "");
      if (!idToken) throw new Error("You must be signed in.");
      
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const callerUid = decodedToken.uid;
      const adminSnap = await admin.firestore().collection("admins").doc(callerUid).get();
      if (!adminSnap.exists) throw new Error("Admins only.");

      const s = await loadRemote((req.body.data || {}).studentId);
      if (String(s.data.status || "").toLowerCase() === "suspended") throw new Error("Reactivate the student first.");
      
      const inviteSent = await sendInvite(s.data);
      res.status(200).send(JSON.stringify({ result: { inviteSent } }));
    } catch (error) {
      sendError(res, 400, error.message);
    }
  }
);

/* ---------------------------------------------------------
   SET REMOTE STUDENT STATUS
--------------------------------------------------------- */
exports.setRemoteStudentStatus = onRequest(
  { region: LOCATION },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "https://www.paisleystudio.online");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    try {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.replace("Bearer ", "");
      if (!idToken) throw new Error("You must be signed in.");
      
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const callerUid = decodedToken.uid;
      const adminSnap = await admin.firestore().collection("admins").doc(callerUid).get();
      if (!adminSnap.exists) throw new Error("Admins only.");

      const status = clean((req.body.data || {}).status, 20);
      if (["Active", "Suspended"].indexOf(status) === -1) throw new Error("Status must be Active or Suspended.");
      
      const s = await loadRemote((req.body.data || {}).studentId);
      await admin.auth().updateUser(s.id, { disabled: status === "Suspended" });
      if (status === "Suspended") await admin.auth().revokeRefreshTokens(s.id);
      await s.ref.update({ status, statusChangedAt: admin.firestore.FieldValue.serverTimestamp(), statusChangedBy: callerUid });
      
      res.status(200).send(JSON.stringify({ result: { status } }));
    } catch (error) {
      sendError(res, 400, error.message);
    }
  }
);

/* ---------------------------------------------------------
   ON REMOTE TICKET CREATED
   Fires when a remote student raises a support ticket.
   Sends a bell + email to every admin.
--------------------------------------------------------- */
exports.onRemoteTicketCreated = onDocumentCreated(
  { document: "tickets/{ticketId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const ticket = event.data.data() || {};
    if (ticket.studentType !== "remote") return;
    const db = admin.firestore();
    const admins = await db.collection("admins").get();
    for (const doc of admins.docs) {
      const adminData = doc.data() || {};
      const email = adminData.email;
      try {
        await db.collection("personalNotifications").add({
          recipientId: doc.id,
          recipientType: "admin",
          type: "remote_ticket",
          title: "New remote student ticket",
          message: `${ticket.studentName || "A remote student"}: ${ticket.subject || ""}`,
          relatedEntity: "tickets",
          relatedEntityId: event.params.ticketId,
          read: false,
          emailSent: !!email,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) { /* ignore */ }
      if (email) {
        try {
          const t = templates.adminNewRemoteTicket({ student: ticket, ticket });
          await notifications.sendEmail(email, t.subject, t.html);
        } catch (e) { console.warn("remote ticket email failed", e.message); }
      }
    }
  }
);

exports._internals = { validateAdmission, KEY_STAGE_YEARS };