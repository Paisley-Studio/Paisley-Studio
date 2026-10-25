/* =========================================================
   Paisley Studio — Notifications & Email (SMTP)
   -----------------------------------------------------------
   What this file does:
     • Sends branded emails via SMTP (nodemailer) using the
       shared templates in ./email-templates.js
     • Writes in-app notifications to `personalNotifications`
     • Owns these Cloud Function exports:
         - onStudentSignup        (notify admins of new student)
         - onLiveClassScheduled   (notify students + guardians)
         - onHomeworkAssigned     (notify matching students)
         - createParentAccount    (admin-only callable)

   SMTP credentials are Cloud Functions v2 secrets — set them once
   with:
     firebase functions:secrets:set SMTP_HOST
     firebase functions:secrets:set SMTP_PORT
     firebase functions:secrets:set SMTP_USER
     firebase functions:secrets:set SMTP_PASS
     firebase functions:secrets:set SMTP_FROM

   If the secrets aren't set, sendEmail() logs and resolves rather
   than throwing — so a missing SMTP config degrades to "no email
   sent" instead of breaking the Firestore write that triggered it.
========================================================= */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const { templates } = require("./email-templates");


/* ---------------------------------------------------------
   Firebase Auth action links (password set / reset).
   Without `continue` settings users land on the default
   firebaseapp.com handler and are never sent back. These settings
   return them to the right portal on the production domain.
   NOTE: the domain must be listed under Authentication → Settings →
   Authorized domains in the Firebase Console.
--------------------------------------------------------- */
const { PORTALS } = require("./email-templates");
function actionSettings(portal) {
  const url = PORTALS[portal] || PORTALS.student;
  return { url, handleCodeInApp: false };
}

const LOCATION = "us-central1";

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");

// Every export in this file that sends email must list these in its
// `secrets: [...]` option so Cloud Functions injects them at runtime.
const SMTP_SECRETS = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM];

/* ---------------------------------------------------------
   SMTP transport (lazy, cached)
--------------------------------------------------------- */
let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!SMTP_HOST.value() || !SMTP_USER.value() || !SMTP_PASS.value()) return null;
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port: Number(SMTP_PORT.value() || 587),
    secure: Number(SMTP_PORT.value() || 587) === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
  });
  return cachedTransporter;
}

async function sendEmail(to, subject, html, attachments) {
  if (!to) return { sent: false, reason: "no recipient" };
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("sendEmail: SMTP not configured, skipping send to", to);
    return { sent: false, reason: "smtp not configured" };
  }
  try {
    await transporter.sendMail({
      from: SMTP_FROM.value() || SMTP_USER.value(),
      to,
      subject,
      html,
      ...(attachments && attachments.length ? { attachments } : {})
    });
    return { sent: true };
  } catch (err) {
    console.error("sendEmail error:", err);
    return { sent: false, reason: err.message };
  }
}

/* ---------------------------------------------------------
   Firestore helper: one row per recipient per event.
   These show up as badge counters / toasts in the portals.
--------------------------------------------------------- */
async function addPersonalNotification(data) {
  return admin.firestore().collection("personalNotifications").add({
    ...data,
    read: false,
    emailSent: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/* ---------------------------------------------------------
   Subject matching — students only get notified for the
   subjects they actually take (falls back to whole-Key-Stage
   when a student has no subjects recorded yet).
   Subject ids and display names are normalised the same way
   lms-helpers.js does on the client.
--------------------------------------------------------- */
function subjectKey(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\((a-level|igcse|as-level|as level|a level)\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^maths?$/, "mathematics");
}

function studentTakes(student, subjectName) {
  if (!subjectName) return true;
  const want = subjectKey(subjectName);
  if (Array.isArray(student.subjects) && student.subjects.length) {
    return student.subjects.some((x) => subjectKey(x) === want);
  }
  if (student.subject) return subjectKey(student.subject) === want;
  return true; // no subjects recorded yet — keep the Key-Stage-wide behaviour
}

/* =========================================================
   1. onStudentSignup — new student registers.
   Notifies every admin (Firestore + email).
========================================================= */
exports.onStudentSignup = onDocumentCreated(
  {
    document: "students/{studentId}",
    region: LOCATION,
    secrets: SMTP_SECRETS
  },
  async (event) => {
    const student = event.data.data() || {};
    if (student.studentType === "remote") return; // admitted by an admin, not a self-registration
    const studentId = event.params.studentId;
    const db = admin.firestore();

    const adminsSnap = await db.collection("admins").get();

    for (const doc of adminsSnap.docs) {
      // In-app notification
      await addPersonalNotification({
        recipientId: doc.id,
        recipientType: "admin",
        type: "student_signup",
        title: "New student registration",
        message: `${student.name || "A student"} (${student.email || "no email"}) registered for ${student.keyStage || "an unspecified Key Stage"}${student.year ? ", Year " + student.year : ""}.`,
        relatedEntity: "students",
        relatedEntityId: studentId
      });

      // Email
      const adminData = doc.data() || {};
      let email = adminData.email;
      if (!email) {
        try {
          email = (await admin.auth().getUser(doc.id)).email;
        } catch (e) { /* ignore */ }
      }
      if (email) {
        const t = templates.adminNewStudentSignup({ student });
        await sendEmail(email, t.subject, t.html);
      }
    }
  }
);

/* =========================================================
   2. onLiveClassScheduled — a tutor/admin schedules a class.
   Notifies enrolled students (Key Stage + subject match) and
   their linked guardians.
========================================================= */
exports.onLiveClassScheduled = onDocumentCreated(
  {
    document: "liveClasses/{classId}",
    region: LOCATION,
    secrets: SMTP_SECRETS
  },
  async (event) => {
    const liveClass = event.data.data() || {};
    const classId = event.params.classId;
    const db = admin.firestore();

    const studentsSnap = await db
      .collection("students")
      .where("keyStage", "==", liveClass.keyStage || "")
      .get();

    for (const doc of studentsSnap.docs) {
      const student = doc.data();
      if (student.studentType === "remote" || student.studentType === "tuition") continue; // remote / tuition learners have no live-class feed
      if (!studentTakes(student, liveClass.subject)) continue;

      // In-app
      await addPersonalNotification({
        recipientId: doc.id,
        recipientType: "student",
        type: "class_scheduled",
        title: "New live class scheduled",
        message: `${liveClass.title || "A class"} (${liveClass.subject || ""}) is scheduled.`,
        relatedEntity: "liveClasses",
        relatedEntityId: classId,
        subject: liveClass.subject || "",
        keyStage: liveClass.keyStage || ""
      });

      // Email — student
      if (student.email) {
        const t = templates.liveClassScheduled({
          recipientName: student.name,
          student,
          liveClass
        });
        await sendEmail(student.email, t.subject, t.html);
      }

      // Email — linked guardian (structured guardians[] preferred, single
      // guardianEmail is the legacy fallback)
      const guardianEmails = new Set();
      if (Array.isArray(student.guardians)) {
        student.guardians.forEach((g) => g && g.email && guardianEmails.add(g.email));
      }
      if (student.guardianEmail) guardianEmails.add(student.guardianEmail);

      for (const email of guardianEmails) {
        const t = templates.liveClassScheduled({
          recipientName: student.guardianName || "there",
          student,
          liveClass
        });
        await sendEmail(email, t.subject, t.html);
      }
    }
  }
);

/* =========================================================
   3. onHomeworkAssigned — new homework posted.
   Notifies students who take that subject at that Key Stage.
========================================================= */
exports.onHomeworkAssigned = onDocumentCreated(
  {
    document: "homework/{homeworkId}",
    region: LOCATION,
    secrets: SMTP_SECRETS
  },
  async (event) => {
    const hw = event.data.data() || {};
    const homeworkId = event.params.homeworkId;
    const db = admin.firestore();

    const studentsSnap = await db
      .collection("students")
      .where("keyStage", "==", hw.keyStage || "")
      .get();

    for (const doc of studentsSnap.docs) {
      const student = doc.data();
      if (student.studentType === "remote" || student.studentType === "tuition") continue; // legacy homework is online-only
      if (!studentTakes(student, hw.subject)) continue;

      // In-app
      await addPersonalNotification({
        recipientId: doc.id,
        recipientType: "student",
        type: "homework_assigned",
        title: "New homework posted",
        message: `${hw.title || "New homework"} (${hw.subject || ""}) has been posted.`,
        relatedEntity: "homework",
        relatedEntityId: homeworkId,
        subject: hw.subject || "",
        keyStage: hw.keyStage || ""
      });

      // Email — student
      if (student.email) {
        const t = templates.homeworkAssigned({ student, homework: hw });
        await sendEmail(student.email, t.subject, t.html);
      }
    }
  }
);

/* =========================================================
   4. createParentAccount — admin-only callable.
   -----------------------------------------------------------
   Links every guardian on a student to the Parent Portal:
     • Brand-new parent  → Auth user created, reset link emailed
                           (they have no password yet).
     • Existing parent   → reuses their Auth identity, gets a
                           "new child linked" email (no password
                           change needed).
   Never creates a duplicate Auth user for an email that already
   has one. Refuses to use the student's own email as a parent.
========================================================= */

/* Link every guardian of a student to the Parent Portal (shared by the
   admin callable below and by remote admission). Never creates a duplicate
   Auth user for an email that already has one; deterministic link ids make
   re-running safe. Returns one result row per guardian. */
function normalizePhonePassword(phone) {
  const p = String(phone || "").replace(/[\s\-().]/g, "");
  return p.length >= 6 ? p : "";
}

/* Last 9 digits of the phone number, so +254 700 000 000, 0700000000 and
   700000000 all match each other. Used for phone sign-in lookups. */
function phoneKey(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 6 ? d.slice(-9) : "";
}

async function linkGuardians(db, studentId, student, guardians) {
  const studentEmail = String(student.email || "").trim().toLowerCase();
  const results = [];
  const seen = new Set();

  for (const g of guardians) {
    const email = String(g.email).trim();
    const emailKey = email.toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) { results.push({ email, skipped: "invalid email" }); continue; }
    if (seen.has(emailKey)) { results.push({ email, skipped: "duplicate of another guardian" }); continue; }
    seen.add(emailKey);
    if (emailKey === studentEmail) { results.push({ email, skipped: "same as the student's own sign-in email" }); continue; }

    const name = g.name || "Parent/Guardian";
    let parentUid;
    let created = false;
    let phonePassword = "";
    try {
      parentUid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (e) {
      if (e && e.code && e.code !== "auth/user-not-found") throw e;
      // New parents sign in with their email and the guardian phone number the
      // student gave at sign-up (spaces/dashes removed). Too-short or missing
      // numbers fall back to a random password + emailed reset link.
      phonePassword = normalizePhonePassword(g.phone);
      const createdUser = await admin.auth().createUser({
        email, password: phonePassword || crypto.randomBytes(18).toString("base64url"), displayName: name
      });
      parentUid = createdUser.uid;
      created = true;
    }

    if (parentUid === studentId) { results.push({ email, skipped: "same identity as the student" }); continue; }

    const parentRef = db.collection("parentAccounts").doc(parentUid);
    const parentSnap = await parentRef.get();
    const pKey = phoneKey(g.phone);
    await parentRef.set({
      name: g.name || (parentSnap.exists ? parentSnap.data().name : "") || "",
      email,
      ...(pKey ? { phoneKeys: admin.firestore.FieldValue.arrayUnion(pKey) } : {}),
      ...(parentSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
    }, { merge: true });

    const linkRef = db.collection("parentStudentLinks").doc(parentUid + "_" + studentId);
    const linkSnap = await linkRef.get();
    const newLink = !linkSnap.exists;
    if (newLink) {
      await linkRef.set({ parentUid, studentUid: studentId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    let emailSent = false;
    if (created && phonePassword) {
      const t = templates.parentWelcomePhone({ parentName: name, student, phone: phonePassword });
      emailSent = !!(await sendEmail(email, t.subject, t.html)).sent;
    } else if (created) {
      let resetLink = null;
      try { resetLink = await admin.auth().generatePasswordResetLink(email, actionSettings("parent")); }
      catch (e) { console.error("Could not generate password reset link:", e); }
      if (resetLink) {
        const t = templates.parentWelcomeNew({ parentName: name, student, resetLink });
        emailSent = !!(await sendEmail(email, t.subject, t.html)).sent;
      }
    } else if (newLink) {
      // Existing parent: no password change, just a heads-up about the new child.
      const t = templates.parentNewChild({ parentName: name, student });
      emailSent = !!(await sendEmail(email, t.subject, t.html)).sent;
    }
    results.push({ email, parentUid, created, emailSent, newLink });
  }
  return results;
}

function guardiansOf(student) {
  let guardians = Array.isArray(student.guardians) ? student.guardians : [];
  if (!guardians.length && (student.guardianEmail || student.guardianPhone)) {
    guardians = [{ name: student.guardianName || "", email: student.guardianEmail || "", phone: student.guardianPhone || "" }];
  }
  return guardians.filter((g) => g && g.email);
}

exports.createParentAccount = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const db = admin.firestore();
    if (!(await db.collection("admins").doc(request.auth.uid).get()).exists) throw new HttpsError("permission-denied", "Admins only.");

    const d = request.data || {};
    const studentId = d.studentId || "";
    if (!studentId) throw new HttpsError("invalid-argument", "studentId required.");
    const studentRef = db.collection("students").doc(studentId);
    const studentDoc = await studentRef.get();
    if (!studentDoc.exists) throw new HttpsError("not-found", "Student not found.");
    const student = studentDoc.data() || {};

    // An explicitly supplied parent (the admin "Add parent" form) is added to
    // the student's guardian list first, so it is kept on the record and linked.
    const extraEmail = String(d.parentEmail || "").trim();
    if (extraEmail) {
      if (!/^\S+@\S+\.\S+$/.test(extraEmail)) throw new HttpsError("invalid-argument", "That parent email is not valid.");
      const list = Array.isArray(student.guardians) ? student.guardians.slice() : [];
      if (!normalizePhonePassword(d.parentPhone)) {
        throw new HttpsError("invalid-argument", "A phone number (at least 6 digits) is required for every additional guardian.");
      }
      if (!list.some((g) => String(g.email || "").toLowerCase() === extraEmail.toLowerCase())) {
        if (list.length >= 4) throw new HttpsError("failed-precondition", "A student can have at most four guardians on record.");
        list.push({ name: String(d.parentName || "").trim().slice(0, 120), email: extraEmail, phone: String(d.parentPhone || "").trim().slice(0, 40) });
        await studentRef.update({ guardians: list });
        student.guardians = list;
      }
    }

    let guardians = guardiansOf(student);
    if (extraEmail) guardians = guardians.filter((g) => String(g.email).toLowerCase() === extraEmail.toLowerCase());
    if (!guardians.length) {
      throw new HttpsError("failed-precondition", "This student has no structured guardian email/phone on file. Add it via Student Management first.");
    }

    const results = await linkGuardians(db, studentId, student, guardians);
    const linked = results.filter((r) => r.parentUid);
    if (!linked.length) {
      throw new HttpsError("failed-precondition", "No guardian could be linked: " + results.map((r) => r.email + " (" + r.skipped + ")").join("; "));
    }
    return { results, parentUid: linked[0].parentUid, emailSent: linked.some((r) => r.emailSent) };
  }
);

/* =========================================================
   5. backfillParentPhonePasswords — admin-only callable.
   -----------------------------------------------------------
   One-time (safe to re-run) upgrade for parent accounts that
   existed before phone sign-in:
     • Records every guardian's phone on their parent account so
       they can sign in with the phone number.
     • Sets the password to the phone number ONLY for parents who
       have never signed in (so nobody who already chose their own
       password is locked out) and emails them the new details.
   data: { dryRun (default true), sendEmails (default true) }
========================================================= */
exports.backfillParentPhonePasswords = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const db = admin.firestore();
    if (!(await db.collection("admins").doc(request.auth.uid).get()).exists) throw new HttpsError("permission-denied", "Admins only.");

    const d = request.data || {};
    const dryRun = d.dryRun !== false;
    const sendEmails = d.sendEmails !== false;
    const out = { dryRun, passwordsSet: [], phoneOnly: [], skipped: [], emailed: 0 };
    const seen = new Set();

    const students = await db.collection("students").get();
    for (const sDoc of students.docs) {
      const student = sDoc.data() || {};
      for (const g of guardiansOf(student)) {
        const email = String(g.email).trim();
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const pw = normalizePhonePassword(g.phone);
        const pKey = phoneKey(g.phone);
        if (!pw) { out.skipped.push({ email, why: "no usable phone number" }); continue; }

        let user;
        try { user = await admin.auth().getUserByEmail(email); }
        catch (e) {
          if (e && e.code === "auth/user-not-found") { out.skipped.push({ email, why: "no login yet" }); continue; }
          throw e;
        }
        if (user.uid === sDoc.id) { out.skipped.push({ email, why: "same login as the student" }); continue; }
        const pRef = db.collection("parentAccounts").doc(user.uid);
        if (!(await pRef.get()).exists) { out.skipped.push({ email, why: "not a parent account" }); continue; }

        const neverSignedIn = !user.metadata.lastSignInTime;
        if (!dryRun) await pRef.set({ phoneKeys: admin.firestore.FieldValue.arrayUnion(pKey) }, { merge: true });

        if (!neverSignedIn) { out.phoneOnly.push(email); continue; }

        if (!dryRun) {
          await admin.auth().updateUser(user.uid, { password: pw });
          if (sendEmails) {
            try {
              const t = templates.parentPhoneLoginUpdate({ parentName: g.name || "Parent/Guardian", student, phone: pw });
              if ((await sendEmail(email, t.subject, t.html)).sent) out.emailed++;
            } catch (e) { console.warn("backfill: email failed", email, e.message || e); }
          }
        }
        out.passwordsSet.push(email);
      }
    }
    return out;
  }
);

/* =========================================================
   6. parentPhoneLogin — public callable.
   -----------------------------------------------------------
   Lets a parent sign in with phone number + password. Looks up
   parent accounts holding that phone, checks the password against
   each one, and returns the matching email ONLY if the password is
   right. The browser then signs in normally with that email.
   Works for every guardian linked to a child, each with their own
   password.
========================================================= */
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAWoYsa1mwAi6guBU8LuDi2fN5hTj5AXkw";
const WEB_ORIGIN  = process.env.PORTAL_ORIGIN || "https://paisley-89c77.firebaseapp.com";

exports.parentPhoneLogin = onCall(
  { cors: true, region: LOCATION },
  async (request) => {
    const d = request.data || {};
    const key = phoneKey(d.phone);
    const password = String(d.password || "");
    const bad = new HttpsError("permission-denied", "Incorrect phone number or password.");
    if (!key || !password) throw bad;

    const snap = await admin.firestore().collection("parentAccounts").where("phoneKeys", "array-contains", key).limit(10).get();
    for (const doc of snap.docs) {
      const email = doc.data().email;
      if (!email) continue;
      try {
        const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + WEB_API_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Referer": WEB_ORIGIN + "/" },
          body: JSON.stringify({ email, password, returnSecureToken: false })
        });
        if (r.ok) return { email };
      } catch (e) { console.warn("parentPhoneLogin: verify failed", e.message || e); }
    }
    throw bad;
  }
);

/* =========================================================
   Public exports
   -----------------------------------------------------------
   `sendEmail` is used by index.js for the new triggers that
   live in that file. Everything already exported above via
   `exports.xxx = ...` stays as-is — this block re-declares
   them in one place so `require("./notifications")` returns
   the complete set.
========================================================= */
module.exports = {
  onStudentSignup:      exports.onStudentSignup,
  onLiveClassScheduled: exports.onLiveClassScheduled,
  onHomeworkAssigned:   exports.onHomeworkAssigned,
  createParentAccount:  exports.createParentAccount,
  backfillParentPhonePasswords: exports.backfillParentPhonePasswords,
  parentPhoneLogin:     exports.parentPhoneLogin,
  sendEmail,
  linkGuardians,
  guardiansOf,
  actionSettings
};