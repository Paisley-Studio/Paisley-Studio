/* =========================================================
   Paisley Studio — CBC Tuition (triggers)
   -----------------------------------------------------------
   A "tuition student" is a students/{uid} record whose studentType
   is "tuition". They self-register (status "Pending"), an admin
   approves them in the Tuition panel, and from then on they are
   either:
        tuitionMode "tutored" — paired with one or more tutors
        tuitionMode "self"    — materials + assessment only

   Triggers in this file:
     onTuitionStudentActivated   Pending → Active: links the parents
                                 they listed at registration and
                                 makes sure tuitionMode is set.
     onTuitionRequestCreated     a student asked for a tutor: bell +
                                 email to every admin.
     onTuitionRequestUpdated     admin approved / declined: tells the
                                 student.
     onTuitionMessageCreated     chat message: bell to the other side.
     onTuitionTimetableCreated   a lesson was scheduled: bell to the
                                 student.
     onTuitionTicketCreated      support ticket from a tuition
                                 student: bell + email to admins.
========================================================= */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const { render, PORTALS } = require("./email-templates");
const notifications = require("./notifications");
const { SMTP_SECRETS } = require("./work-shared");

const LOCATION = "us-central1";
const FV = () => admin.firestore.FieldValue;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function bell(recipientId, recipientType, type, title, message, entity, entityId) {
  if (!recipientId) return;
  try {
    await admin.firestore().collection("personalNotifications").add({
      recipientId, recipientType, type, title, message,
      relatedEntity: entity || "", relatedEntityId: entityId || "",
      read: false, emailSent: false, createdAt: FV().serverTimestamp()
    });
  } catch (e) { console.warn("tuition bell failed:", e.message); }
}

async function adminRecipients() {
  const db = admin.firestore();
  const snap = await db.collection("admins").get();
  const out = [];
  for (const d of snap.docs) {
    let email = (d.data() || {}).email;
    if (!email) { try { email = (await admin.auth().getUser(d.id)).email; } catch (e) { /* ignore */ } }
    out.push({ id: d.id, email });
  }
  return out;
}

async function alertAdmins({ type, title, message, entity, entityId, emailSubject, emailBody }) {
  const admins = await adminRecipients();
  for (const a of admins) {
    await bell(a.id, "admin", type, title, message, entity, entityId);
    if (a.email) {
      try {
        const html = render({
          preheader: message, heading: "Admin alert", intro: esc(title),
          body: emailBody, cta: { label: "Open Tuition panel", url: PORTALS.admin + "#tuition" }
        });
        await notifications.sendEmail(a.email, emailSubject || title, html);
      } catch (e) { console.warn("tuition admin email failed:", e.message); }
    }
  }
}

/* ---------- Pending → Active ---------- */
exports.onTuitionStudentActivated = onDocumentUpdated(
  { document: "students/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (after.studentType !== "tuition") return;
    if (String(before.status || "").toLowerCase() !== "pending") return;
    if (String(after.status || "").toLowerCase() !== "active") return;
    const db = admin.firestore();
    const studentId = event.params.studentId;
    if (!after.tuitionMode) {
      await event.data.after.ref.update({ tuitionMode: "self" }).catch(() => {});
    }
    const guardians = (Array.isArray(after.guardians) ? after.guardians : []).filter((g) => g && g.email);
    if (guardians.length) {
      try { await notifications.linkGuardians(db, studentId, after, guardians); }
      catch (e) { console.warn("tuition linkGuardians failed:", e.message); }
    }
  }
);

/* ---------- tutor requests ---------- */
exports.onTuitionRequestCreated = onDocumentCreated(
  { document: "tuitionRequests/{reqId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const r = event.data.data() || {};
    const subjects = (r.subjectNames || []).join(", ") || "all subjects";
    await alertAdmins({
      type: "tuition_request", title: "Tutor requested",
      message: `${r.studentName || "A CBC student"} asked for a tutor (${subjects}).`,
      entity: "tuitionRequests", entityId: event.params.reqId,
      emailSubject: `Tutor request — ${r.studentName || "CBC student"}`,
      emailBody: `<p style="margin:0 0 8px;"><strong>${esc(r.studentName || "A CBC student")}</strong> (${esc(r.grade || "")}) asked for a tutor.</p>
        <p style="margin:0 0 8px;">Subjects: ${esc(subjects)}</p>
        <p style="margin:0;white-space:pre-wrap;">${esc(String(r.note || "").slice(0, 600))}</p>`
    });
  }
);

exports.onTuitionRequestUpdated = onDocumentUpdated(
  { document: "tuitionRequests/{reqId}", region: LOCATION },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (before.status === after.status || !after.studentId) return;
    if (after.status === "Approved") {
      await bell(after.studentId, "student", "tuition_tutor_paired", "Tutor assigned",
        "Your tutor request was approved. Open Chat to say hello and check your Timetable.", "tuitionRequests", event.params.reqId);
    } else if (after.status === "Declined") {
      await bell(after.studentId, "student", "tuition_tutor_declined", "Tutor request update",
        after.adminNote ? `We could not pair you yet: ${String(after.adminNote).slice(0, 160)}` : "We could not pair you with a tutor yet. Please contact the Studio Desk.",
        "tuitionRequests", event.params.reqId);
    }
  }
);

/* ---------- chat ---------- */
exports.onTuitionMessageCreated = onDocumentCreated(
  { document: "tuitionChats/{chatId}/messages/{mid}", region: LOCATION },
  async (event) => {
    const m = event.data.data() || {};
    const chat = (await admin.firestore().collection("tuitionChats").doc(event.params.chatId).get()).data() || {};
    const preview = String(m.text || "").slice(0, 140) || "Sent an attachment";
    if (m.senderRole === "student") {
      await bell(chat.tutorId, "tutor", "tuition_message", `Message from ${chat.studentName || "a student"}`, preview, "tuitionChats", event.params.chatId);
    } else {
      await bell(chat.studentId, "student", "tuition_message", `Message from ${m.senderName || "your tutor"}`, preview, "tuitionChats", event.params.chatId);
    }
  }
);

/* ---------- timetable ---------- */
exports.onTuitionTimetableCreated = onDocumentCreated(
  { document: "tuitionTimetable/{eid}", region: LOCATION },
  async (event) => {
    const e = event.data.data() || {};
    if (!e.studentId) return;
    await bell(e.studentId, "student", "tuition_timetable", "New lesson on your timetable",
      `${e.title || e.subjectName || "Lesson"} — ${e.day || ""} ${e.startTime || ""}`.trim(), "tuitionTimetable", event.params.eid);
  }
);

/* ---------- support tickets ---------- */
exports.onTuitionTicketCreated = onDocumentCreated(
  { document: "tickets/{ticketId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const t = event.data.data() || {};
    if (t.studentType !== "tuition") return;
    await alertAdmins({
      type: "tuition_ticket", title: "New CBC tuition ticket",
      message: `${t.studentName || "A CBC student"}: ${t.subject || ""}`,
      entity: "tickets", entityId: event.params.ticketId,
      emailSubject: `CBC tuition ticket — ${t.subject || "Support"}`,
      emailBody: `<p style="margin:0 0 8px;"><strong>${esc(t.subject || "—")}</strong></p><p style="margin:0;white-space:pre-wrap;">${esc(String(t.message || "").slice(0, 600))}</p>`
    });
  }
);
