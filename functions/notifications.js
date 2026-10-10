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
exports.createParentAccount = onCall(
  {
    cors: true,
    region: LOCATION,
    secrets: SMTP_SECRETS
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const callerUid = request.auth.uid;
    const db = admin.firestore();

    const callerAdminDoc = await db.collection("admins").doc(callerUid).get();
    if (!callerAdminDoc.exists) {
      throw new HttpsError("permission-denied", "Admins only.");
    }

    const studentId = (request.data && request.data.studentId) || "";
    if (!studentId) throw new HttpsError("invalid-argument", "studentId required.");

    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) throw new HttpsError("not-found", "Student not found.");
    const student = studentDoc.data() || {};
    const studentEmail = String(student.email || "").trim().toLowerCase();

    let guardians = Array.isArray(student.guardians) ? student.guardians : [];
    if (!guardians.length && (student.guardianEmail || student.guardianPhone)) {
      guardians = [{
        name: student.guardianName || "",
        email: student.guardianEmail || "",
        phone: student.guardianPhone || ""
      }];
    }
    guardians = guardians.filter((g) => g && g.email);
    if (!guardians.length) {
      throw new HttpsError(
        "failed-precondition",
        "This student has no structured guardian email/phone on file. Add it via Student Management first."
      );
    }

    const results = [];
    const seen = new Set();

    for (const g of guardians) {
      const email = String(g.email).trim();
      const emailKey = email.toLowerCase();

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        results.push({ email, skipped: "invalid email" });
        continue;
      }
      if (seen.has(emailKey)) {
        results.push({ email, skipped: "duplicate of another guardian" });
        continue;
      }
      seen.add(emailKey);
      if (emailKey === studentEmail) {
        results.push({ email, skipped: "same as the student's own sign-in email" });
        continue;
      }

      const name = g.name || "Parent/Guardian";
      let parentUid;
      let created = false;

      try {
        const existing = await admin.auth().getUserByEmail(email);
        parentUid = existing.uid;
      } catch (e) {
        // No existing Auth user → create one with an initial password.
        // The initial password is never stored in Firestore; the parent
        // immediately gets a reset link so they set their own.
        const phone = String(g.phone || "").replace(/\s+/g, "");
        const initialPassword =
          phone.length >= 6 ? phone : crypto.randomBytes(12).toString("base64url");
        const createdUser = await admin.auth().createUser({
          email,
          password: initialPassword,
          displayName: name
        });
        parentUid = createdUser.uid;
        created = true;
      }

      if (parentUid === studentId) {
        results.push({ email, skipped: "same identity as the student" });
        continue;
      }

      // Upsert the parent role record.
      const parentRef = db.collection("parentAccounts").doc(parentUid);
      const parentSnap = await parentRef.get();
      await parentRef.set(
        {
          name: g.name || (parentSnap.exists ? parentSnap.data().name : "") || "",
          email,
          ...(parentSnap.exists
            ? {}
            : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
        },
        { merge: true }
      );

      // Deterministic link id — re-running is safe.
      const linkRef = db
        .collection("parentStudentLinks")
        .doc(parentUid + "_" + studentId);
      const linkSnap = await linkRef.get();
      if (!linkSnap.exists) {
        await linkRef.set({
          parentUid,
          studentUid: studentId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // ---- Email ----
      let emailSent = false;

      if (created) {
        // Brand-new parent → reset link, then back to the login page.
        let resetLink = null;
        try {
          resetLink = await admin.auth().generatePasswordResetLink(email);
        } catch (e) {
          console.error("Could not generate password reset link:", e);
        }
        if (resetLink) {
          const t = templates.parentWelcomeNew({
            parentName: name,
            student,
            resetLink
          });
          const r = await sendEmail(email, t.subject, t.html);
          emailSent = !!r.sent;
        }
      } else {
        // Existing parent (an admin, a tutor, another child's parent,
        // or any other Paisley Studio account) → no password change,
        // just a heads-up that a new child is now linked.
        const t = templates.parentNewChild({
          parentName: name,
          student
        });
        const r = await sendEmail(email, t.subject, t.html);
        emailSent = !!r.sent;
      }

      results.push({ email, parentUid, created, emailSent });
    }

    const linked = results.filter((r) => r.parentUid);
    if (!linked.length) {
      throw new HttpsError(
        "failed-precondition",
        "No guardian could be linked: " +
          results.map((r) => r.email + " (" + r.skipped + ")").join("; ")
      );
    }

    return {
      results,
      parentUid: linked[0].parentUid,
      emailSent: linked.some((r) => r.emailSent)
    };
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
  sendEmail
};