/* =========================================================
   Paisley Studio — Cloud Functions (main entry point)
   -----------------------------------------------------------
   Existing contents (unchanged in this revision):
     1. Vertex AI (Gemini) exam importer ............ importExamFromText
     2. Exam integrity ............................... recordViolation
     3. Parent access map builders ................... syncParentAccessOnLink
                                                       syncParentAccessOnStudent
                                                       refreshParentAccess
     4. Tutor role creation .......................... createTutorForExistingAccount
     5. Student deletion ............................. deleteStudentAccount
     6. Student approval email ....................... onStudentActivated
     7. Tutor welcome email .......................... onTutorCreated
     8. Admin → parent message email ................. onParentConversationMessage
     9. Ticket reply emails .......................... onTicketReplied

   Flat subject-scoped exams:
    10. onFlatExamPosted
          classrooms/{cid}/exams/{eid} just went to Published.
          Emails parents the paper (attachment), gives students
          a heads-up (no attachment), and sends every subject
          tutor who teaches the exam's Key Stage a bell + email
          ("New exam posted"). One email per recipient.

    11. onFlatExamSubmissionWritten
          Fires when InkGrader releases a tutor-marked flat-exam
          submission (released flips false → true). Emails the
          student and every linked parent with the wording
          "Results released". Fires once per release.

   MULTI-TUTOR SUPPORT (this revision):
     Students can now have many tutors — one per subject. The
     student doc carries:
        tutorIds:       [ "tutorA", "tutorB", ... ]   (for queries)
        subjectTutors:  { "mathematics": { tutorId, tutorName, tutorSlug }, ... }
        tutorId, tutorName, tutorSlug:  legacy single-tutor fields,
          kept in sync with the first entry of subjectTutors.
     Tickets can be addressed to a specific tutor via:
        targetTutorId, targetTutorName, subjectId, subjectName
     `onTicketReplied` routes the notification to `targetTutorId`
     when present, and falls back to the legacy single tutor.

   NOT in this file (deliberately — kept in work.js / deadlines.js):
     • onAssignmentPosted         (nested legacy + new flat assignments)
     • onExamPostedOrPublished    (nested legacy exams only)
     • onSubmissionWritten        (nested submissions)
     • onExamAttemptWritten       (nested PDF exam attempts)
     • migrateLegacyHomeworkAndExams
     • homeworkDeadlineReminder / grace / report
     • examReminderToParents      (patched separately to accept flat exams)

   Email infrastructure lives in:
     • ./email-templates.js   (branded HTML, one function per email)
     • ./notifications.js     (sendEmail + SMTP transport + existing triggers)

   Every function that sends mail lists `secrets: SMTP_SECRETS`
   so Cloud Functions injects the SMTP credentials.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentWritten,
  onDocumentUpdated,
  onDocumentCreated
} = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { VertexAI } = require("@google-cloud/vertexai");

admin.initializeApp();

/* ---------------------------------------------------------
   Shared email infrastructure
--------------------------------------------------------- */
const notifications = require("./notifications");
const sendEmail = notifications.sendEmail;
const { templates } = require("./email-templates");

exports.onStudentSignup      = notifications.onStudentSignup;
exports.onLiveClassScheduled = notifications.onLiveClassScheduled;
exports.onHomeworkAssigned   = notifications.onHomeworkAssigned;
exports.createParentAccount  = notifications.createParentAccount;

const classroom = require("./classroom");
exports.publishScheduledLessons  = classroom.publishScheduledLessons;
exports.onClassroomLessonDeleted = classroom.onClassroomLessonDeleted;

const deadlines = require("./deadlines");
exports.homeworkDeadlineReminder     = deadlines.homeworkDeadlineReminder;
exports.homeworkOverdueGraceNotice   = deadlines.homeworkOverdueGraceNotice;
exports.generateUnattendedWorkReport = deadlines.generateUnattendedWorkReport;
exports.examReminderToParents        = deadlines.examReminderToParents;
exports.runDeadlineJob               = deadlines.runDeadlineJob;

const publishing = require("./publishing");
exports.publishClassroomContent       = publishing.publishClassroomContent;
exports.tutorReleaseWork              = publishing.tutorReleaseWork;
exports.backfillAudiences             = publishing.backfillAudiences;
exports.onAssignmentAudienceChanged   = publishing.onAssignmentAudienceChanged;
exports.onNestedExamAudienceChanged   = publishing.onNestedExamAudienceChanged;

const remote = require("./remote");
exports.admitRemoteStudent            = remote.admitRemoteStudent;
exports.resendRemoteInvite            = remote.resendRemoteInvite;
exports.setRemoteStudentStatus        = remote.setRemoteStudentStatus;
exports.onRemoteTicketCreated         = remote.onRemoteTicketCreated;

const work = require("./work");
exports.onAssignmentPosted           = work.onAssignmentPosted;
exports.onExamPostedOrPublished      = work.onExamPostedOrPublished;
exports.onSubmissionWritten          = work.onSubmissionWritten;
exports.onExamAttemptWritten         = work.onExamAttemptWritten;
exports.migrateLegacyHomeworkAndExams = work.migrateLegacyHomeworkAndExams;

/* ---------------------------------------------------------
   Config
--------------------------------------------------------- */
const PROJECT_ID = "paisley-89c77";
const LOCATION   = "us-central1";
const MODEL_NAME = "gemini-2.5-flash";

const ADMIN_EMAILS = ["info@paisleystudio.online"];

const MAX_VIOLATIONS = 5;
const ALLOWED_VIOLATION_TYPES = [
  'tab_switch',
  'fullscreen_exit',
  'upload_grace_exceeded'
];

const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");
const SMTP_SECRETS = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM];

let vertexClient = null;
function getVertex() {
  if (!vertexClient) {
    vertexClient = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  }
  return vertexClient;
}

/* =========================================================
   1. importExamFromText — Vertex AI exam parser (unchanged)
========================================================= */
exports.importExamFromText = onCall(
  { cors: true, region: LOCATION, timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid   = request.auth.uid;
    const email = request.auth.token.email || "";
    let isAdmin = ADMIN_EMAILS.includes(email);
    if (!isAdmin) {
      const doc = await admin.firestore().collection("admins").doc(uid).get();
      isAdmin = doc.exists && doc.data().role === "admin";
    }
    if (!isAdmin) throw new HttpsError("permission-denied", "Admins only.");

    const rawText = (request.data && request.data.rawText) || "";
    if (!rawText || rawText.length < 20) throw new HttpsError("invalid-argument", "No text to parse.");
    if (rawText.length > 60000) throw new HttpsError("invalid-argument", "Text too long — split the PDF.");

    const vertex = getVertex();
    const model = vertex.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 }
    });
    const prompt = `
You are an exam-paper parser. The text below was extracted from a clean PDF exam paper.
Your job: extract EVERY question and return STRICT JSON only. No prose, no markdown.
Rules:
- "type" must be one of: "mcq", "written", "essay"
- If the question has lettered or numbered choices, it is "mcq" and you MUST list "options".
- If it says "Answer: X" or "Correct: X" or has a marked answer, set "correctIndex" (0-based).
- If the answer is not marked, set "correctIndex" to null.
- Preserve question wording EXACTLY as in the text.
- Do NOT invent questions.
Return shape:
{ "questions": [ { "question": "string", "type": "mcq", "options": [], "correctIndex": 0 } ] }
TEXT START
${rawText}
TEXT END`.trim();

    let parsed;
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("Empty response from Gemini");
      const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.error("Gemini/Vertex error:", err);
      throw new HttpsError("internal", "Gemini failed: " + err.message);
    }
    return { questions: Array.isArray(parsed.questions) ? parsed.questions : [] };
  }
);

/* =========================================================
   2. recordViolation — exam integrity (unchanged)
========================================================= */
exports.recordViolation = onCall(
  { cors: true, region: LOCATION, timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid = request.auth.uid;
    const attemptId    = (request.data && request.data.attemptId)    || "";
    const type         = (request.data && request.data.type)         || "";
    const durationMs   = (request.data && request.data.durationMs)   || 0;
    const description  = (request.data && request.data.description)  || "";
    if (!attemptId) throw new HttpsError("invalid-argument", "attemptId required.");
    if (!ALLOWED_VIOLATION_TYPES.includes(type)) throw new HttpsError("invalid-argument", "Unknown violation type: " + type);

    const db = admin.firestore();
    const ref = db.collection("examAttempts").doc(attemptId);
    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Attempt not found.");
        const data = snap.data() || {};
        if (data.studentId !== uid) throw new HttpsError("permission-denied", "Not your attempt.");
        const integrity = data.integrity || {};
        const currentCount = Number(integrity.violationCount || 0);
        const currentStatus = integrity.status || 'active';
        if (currentStatus === 'suspended') return { alreadySuspended: true, violationCount: currentCount, maxViolations: MAX_VIOLATIONS };
        if (data.status && data.status !== 'In progress' && data.status !== 'Awaiting grading') return { alreadyDone: true, violationCount: currentCount, maxViolations: MAX_VIOLATIONS };
        const newCount = currentCount + 1;
        const isSuspended = newCount >= MAX_VIOLATIONS;
        const list = Array.isArray(integrity.violations) ? integrity.violations.slice(-29) : [];
        list.push({ id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), type, description: description || type, durationMs: durationMs || 0, at: Date.now(), by: uid });
        const newIntegrity = {
          violationCount: newCount, maxViolations: MAX_VIOLATIONS, canContinue: !isSuspended,
          canAttemptAgain: !isSuspended, status: isSuspended ? 'suspended' : 'active',
          suspendedAt: isSuspended ? Date.now() : (integrity.suspendedAt || null), violations: list
        };
        tx.update(ref, { integrity: newIntegrity });
        if (isSuspended) tx.update(ref, { status: 'Suspended' });
        return { violationCount: newCount, maxViolations: MAX_VIOLATIONS, canContinue: !isSuspended, canAttemptAgain: !isSuspended, suspended: isSuspended };
      });
      return result;
    } catch (err) {
      console.error("recordViolation error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err.message || "Could not record violation.");
    }
  }
);

/* =========================================================
   3. Accounts, roles & access helpers (unchanged)
========================================================= */
async function requireAdminCaller(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await admin.firestore().collection("admins").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Admins only.");
  return request.auth.uid;
}

const { rebuildParentAccess } = require("./parent-access");

exports.syncParentAccessOnLink = onDocumentWritten(
  { document: "parentStudentLinks/{linkId}", region: LOCATION },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const uids = new Set([before && before.parentUid, after && after.parentUid].filter(Boolean));
    for (const uid of uids) await rebuildParentAccess(uid);
  }
);

exports.syncParentAccessOnStudent = onDocumentWritten(
  { document: "students/{studentId}", region: LOCATION },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const sig = (d) => d ? JSON.stringify([d.keyStage || "", (d.subjects || []).slice().sort(), d.studentType || "online"]) : "deleted";
    if (sig(before) === sig(after)) return;
    const links = await admin.firestore().collection("parentStudentLinks")
      .where("studentUid", "==", event.params.studentId).get();
    const parentUids = new Set(links.docs.map((d) => d.data().parentUid).filter(Boolean));
    for (const uid of parentUids) await rebuildParentAccess(uid);
  }
);

exports.refreshParentAccess = onCall(
  { cors: true, region: LOCATION },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid = request.auth.uid;
    const parent = await admin.firestore().collection("parentAccounts").doc(uid).get();
    if (!parent.exists) throw new HttpsError("permission-denied", "Not a parent account.");
    const count = await rebuildParentAccess(uid);
    return { slots: count };
  }
);

/* =========================================================
   4. createTutorForExistingAccount (unchanged)
========================================================= */
exports.createTutorForExistingAccount = onCall(
  { cors: true, region: LOCATION, secrets: SMTP_SECRETS },
  async (request) => {
    await requireAdminCaller(request);
    const d = request.data || {};
    const email = String(d.email || "").trim();
    const name = String(d.name || "").trim();
    const slug = String(d.slug || "").trim();
    const initialPassword = String(d.initialPassword || "").trim();
    if (!email || !name || !slug) throw new HttpsError("invalid-argument", "name, email and slug are required.");

    let user;
    try { user = await admin.auth().getUserByEmail(email); }
    catch (e) { throw new HttpsError("not-found", "No existing account uses that email."); }

    const db = admin.firestore();
    if ((await db.collection("students").doc(user.uid).get()).exists) throw new HttpsError("failed-precondition", "That email belongs to a student account, which cannot also be a tutor.");
    if ((await db.collection("tutorAccounts").doc(user.uid).get()).exists) throw new HttpsError("already-exists", "That account is already a tutor.");
    const slugClash = await db.collection("tutorAccounts").where("slug", "==", slug).limit(1).get();
    if (!slugClash.empty) throw new HttpsError("already-exists", "That login slug is already in use.");

    let passwordForEmail = "";
    if (initialPassword) {
      if (initialPassword.length < 6) throw new HttpsError("invalid-argument", "Initial password must be at least 6 characters.");
      await admin.auth().updateUser(user.uid, { password: initialPassword });
      passwordForEmail = initialPassword;
    } else {
      passwordForEmail = crypto.randomBytes(9).toString("base64url");
      await admin.auth().updateUser(user.uid, { password: passwordForEmail });
    }

    const subjects = Array.isArray(d.subjects) ? d.subjects.map(String).filter(Boolean) : [];
    await db.collection("tutorAccounts").doc(user.uid).set({
      name, email,
      phone: String(d.phone || ""),
      slug, subjects,
      subjectNames: Array.isArray(d.subjectNames) ? d.subjectNames.map(String) : [],
      keyStages: Array.isArray(d.keyStages) ? d.keyStages.map(String) : [],
      role: "tutor",
      status: "Active",
      welcomeEmailSent: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const t = templates.tutorWelcome({ tutor: { name, email }, password: passwordForEmail });
    const sendResult = await sendEmail(email, t.subject, t.html);
    return { uid: user.uid, emailSent: !!sendResult.sent };
  }
);

/* =========================================================
   5. deleteStudentAccount (unchanged)
========================================================= */
exports.deleteStudentAccount = onCall(
  { cors: true, region: LOCATION },
  async (request) => {
    const callerUid = await requireAdminCaller(request);
    const studentId = String((request.data && request.data.studentId) || "");
    const confirmEmail = String((request.data && request.data.confirmEmail) || "").trim().toLowerCase();
    if (!studentId) throw new HttpsError("invalid-argument", "studentId required.");
    if (studentId === callerUid) throw new HttpsError("failed-precondition", "You cannot delete your own account from here.");

    const db = admin.firestore();
    const ref = db.collection("students").doc(studentId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Student not found.");
    const student = snap.data() || {};
    if (confirmEmail !== String(student.email || "").trim().toLowerCase()) throw new HttpsError("failed-precondition", "Confirmation email does not match this student.");

    await db.collection("archivedStudents").doc(studentId).set({
      ...student,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: callerUid,
      archiveReason: "deleted_by_admin"
    });

    const otherRoles = await Promise.all([
      db.collection("admins").doc(studentId).get(),
      db.collection("tutorAccounts").doc(studentId).get(),
      db.collection("parentAccounts").doc(studentId).get()
    ]);
    const keepAuth = otherRoles.some((d) => d.exists);
    let authDeleted = false;
    if (!keepAuth) {
      try { await admin.auth().deleteUser(studentId); authDeleted = true; }
      catch (e) { if (e.code === "auth/user-not-found") authDeleted = true; else throw new HttpsError("internal", "Could not delete the sign-in account: " + e.message); }
    }

    const links = await db.collection("parentStudentLinks").where("studentUid", "==", studentId).get();
    const batch = db.batch();
    links.docs.forEach((l) => batch.delete(l.ref));
    batch.delete(ref);
    await batch.commit();

    return { archived: true, authDeleted, keptLoginBecauseOtherRole: keepAuth };
  }
);

/* =========================================================
   6. onStudentActivated (unchanged)
========================================================= */
exports.onStudentActivated = onDocumentUpdated(
  { document: "students/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data() || {};
    const beforeStatus = String(before.status || "").toLowerCase();
    const afterStatus  = String(after.status  || "").toLowerCase();
    if (beforeStatus === afterStatus) return;
    if (afterStatus !== "active") return;
    if (beforeStatus !== "pending") return;
    const student = after;
    if (!student.email) return;
    try {
      await admin.firestore().collection("personalNotifications").add({
        recipientId: event.params.studentId,
        recipientType: "student",
        type: "account_approved",
        title: "Account approved",
        message: "Welcome to Paisley Studio — your account is active. Log in to start learning.",
        read: false, emailSent: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.error("onStudentActivated: notification write failed:", e); }
    const t = templates.studentApproved({ student });
    const sendResult = await sendEmail(student.email, t.subject, t.html);
    console.log("onStudentActivated: email to", student.email, "→", sendResult);
  }
);

/* =========================================================
   7. onTutorCreated (unchanged)
========================================================= */
exports.onTutorCreated = onDocumentCreated(
  { document: "tutorAccounts/{tutorId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const tutor = event.data.data() || {};
    if (!tutor.email) return;
    if (tutor.welcomeEmailSent === true) return;
    let resetLink = null;
    try { resetLink = await admin.auth().generatePasswordResetLink(tutor.email, notifications.actionSettings("tutor")); }
    catch (e) { console.error("onTutorCreated: could not generate reset link:", e); }
    const t = templates.tutorWelcome({ tutor, password: null });
    const html = resetLink
      ? t.html.replace(
          /<p style="margin:18px 0 0;font-size:13px;color:#5A6E6A;">[\s\S]*?<\/p>/,
          `<p style="margin:18px 0 0;font-size:13px;color:#5A6E6A;">Set your password first — click the button above. The link expires soon for your safety.</p>
           <p style="margin:8px 0 0;font-size:12px;color:#5A6E6A;word-break:break-all;">Or paste this into your browser: ${resetLink}</p>`
        )
      : t.html;
    const sendResult = await sendEmail(tutor.email, t.subject, html);
    console.log("onTutorCreated: email to", tutor.email, "→", sendResult);
    try { await event.data.ref.set({ welcomeEmailSent: true }, { merge: true }); } catch (e) {}
  }
);

/* =========================================================
   8. onParentConversationMessage (unchanged)
========================================================= */
exports.onParentConversationMessage = onDocumentCreated(
  { document: "parentConversations/{cid}/messages/{mid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const msg = event.data.data() || {};
    const cid = event.params.cid;
    if (msg.senderRole !== "admin") return;
    const db = admin.firestore();
    let conv;
    try { conv = (await db.collection("parentConversations").doc(cid).get()).data() || {}; }
    catch (e) { console.error("onParentConversationMessage: could not read conversation:", e); return; }
    const parentUid  = conv.parentUid;
    const studentUid = conv.studentUid;
    if (!parentUid || !studentUid) return;
    const [parentSnap, studentSnap] = await Promise.all([
      db.collection("parentAccounts").doc(parentUid).get(),
      db.collection("students").doc(studentUid).get()
    ]);
    const parent  = parentSnap.exists  ? parentSnap.data()  : {};
    const student = studentSnap.exists ? studentSnap.data() : {};
    const email = parent.email;
    if (!email) return;
    const t = templates.parentNewMessage({ parentName: parent.name || "there", student });
    const sendResult = await sendEmail(email, t.subject, t.html);
    console.log("onParentConversationMessage: email to", email, "→", sendResult);
  }
);

/* =========================================================
   9. onTicketReplied
   -----------------------------------------------------------
   Fires when a ticket's `reply` field is written.

   MULTI-TUTOR ROUTING:
     A ticket can be addressed to a specific tutor via
     `targetTutorId`. When the student replies, the notification
     goes to that tutor. For legacy tickets created before
     multi-tutor support, we fall back to `ticket.tutorId` and
     then `student.tutorId`, so old behaviour is preserved.
========================================================= */
exports.onTicketReplied = onDocumentUpdated(
  { document: "tickets/{ticketId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data() || {};
    const beforeReply = String(before.reply || "");
    const afterReply  = String(after.reply  || "");
    if (beforeReply === afterReply) return;
    if (!afterReply) return;
    const ticket = after;
    const db = admin.firestore();
    const senderRole = String(ticket.lastSenderRole || "").toLowerCase();

    let student = {};
    try {
      const snap = await db.collection("students").doc(ticket.studentId).get();
      if (snap.exists) student = snap.data() || {};
    } catch (e) { console.error("onTicketReplied: could not read student:", e); }

    // ---- staff → student ----
    if (!senderRole || senderRole === "tutor" || senderRole === "admin") {
      const email = student.email || ticket.studentEmail;
      if (email) {
        const t = templates.ticketReplyStudent({ student, ticket });
        const sendResult = await sendEmail(email, t.subject, t.html);
        console.log("onTicketReplied → student:", email, "→", sendResult);
      }
      try {
        await db.collection("personalNotifications").add({
          recipientId: ticket.studentId,
          recipientType: "student",
          type: "ticket_reply",
          title: ticket.targetAdmin ? "Paisley Studio replied" : "Your tutor replied",
          message: `Reply on ticket: ${ticket.subject || ""}`.trim(),
          relatedEntity: "tickets", relatedEntityId: event.params.ticketId,
          read: false, emailSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {}
      return;
    }

    // ---- student → tutor ----
    if (senderRole === "student") {
      // Multi-tutor routing:
      //   1. ticket.targetTutorId   — the specific tutor the ticket is for
      //   2. ticket.tutorId         — legacy field on the ticket
      //   3. student.tutorId        — legacy single-tutor field on the student
      const tutorUid = ticket.targetTutorId || ticket.tutorId || student.tutorId;
      if (!tutorUid) return;

      let tutorEmail = "";
      try {
        const tSnap = await db.collection("tutorAccounts").doc(tutorUid).get();
        if (tSnap.exists) tutorEmail = tSnap.data().email || "";
      } catch (e) {}
      if (!tutorEmail) return;

      const t = templates.ticketReplyTutor({ student, ticket });
      const sendResult = await sendEmail(tutorEmail, t.subject, t.html);
      console.log("onTicketReplied → tutor:", tutorEmail, "→", sendResult);

      // Bell for the tutor. Include the subject so the notification
      // makes sense when the tutor teaches several subjects for this
      // student.
      try {
        const subjectBit = ticket.subjectName ? ` (${ticket.subjectName})` : "";
        await db.collection("personalNotifications").add({
          recipientId: tutorUid,
          recipientType: "tutor",
          type: "ticket_reply",
          title: "New ticket reply from a student",
          message: `${student.name || "A student"} replied${subjectBit} on ticket: ${ticket.subject || ""}`.trim(),
          relatedEntity: "tickets", relatedEntityId: event.params.ticketId,
          extra: { subjectId: ticket.subjectId || null },
          read: false, emailSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {}
      return;
    }
  }
);

/* =========================================================
   10. onFlatExamPosted
   -----------------------------------------------------------
   Flat subject-scoped exams live at:
     classrooms/{cid}/exams/{eid}

   Fires when the doc is created OR when its status flips to
   "Published" for the first time.

   Behaviour per student in the exam's subject + year:
     • Student receives a "heads-up" email with no attachment.
     • Every linked parent receives the same email, WITH the
       exam paper attached as a PDF.
     • Every subject tutor who teaches the exam's Key Stage
       receives a bell + email ("New exam posted") so they
       know to expect hand-ins and can grade them once the
       window opens.

   Idempotency: `notificationsSentAt` is stamped inside a
   transaction before sending. A second trigger pass is a no-op.
========================================================= */
exports.onFlatExamPosted = onDocumentWritten(
  { document: "classrooms/{cid}/exams/{eid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (!after) return;

    // Audience-aware: act only on the audiences this exam has JUST become
    // visible to (online students / remote students / tutors). Each audience
    // is claimed once, so a retry or a later post to another audience never
    // re-notifies people who were already told.
    const WS = require("./work-shared");
    const becameVisible = (aud) => WS.isVisibleTo(after, aud, "Published") && !WS.isVisibleTo(before, aud, "Published");
    const wanted = ["online", "remote", "tutors"].filter(becameVisible);
    if (!wanted.length) return;

    const claimedAuds = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(event.data.after.ref);
      if (!snap.exists) return [];
      const d = snap.data() || {};
      const sent = d.notificationsSent || {};
      const todo = wanted.filter((a) => sent[a] !== true);
      if (!todo.length) return [];
      const patch = { notificationsSentAt: admin.firestore.FieldValue.serverTimestamp() };
      todo.forEach((a) => { patch["notificationsSent." + a] = true; });
      tx.update(event.data.after.ref, patch);
      return todo;
    });
    if (!claimedAuds.length) return;

    const { cid, eid } = event.params;
    const exam = after;
    const db = admin.firestore();

    if (!exam.subjectId || !exam.keyStage) {
      console.warn(`onFlatExamPosted: exam ${eid} missing subjectId or keyStage — skipping.`);
      return;
    }

    const examDate = exam.examDate && exam.examDate.toDate
      ? exam.examDate.toDate()
      : (exam.examDate ? new Date(exam.examDate) : null);

    let paperAttachment = null;
    try {
      if (exam.examPdfUrl || exam.examPdfPath) {
        let buf = null;
        if (exam.examPdfPath) {
          const bucket = admin.storage().bucket();
          const [data] = await bucket.file(exam.examPdfPath).download();
          buf = data;
        } else if (exam.examPdfUrl) {
          const resp = await fetch(exam.examPdfUrl);
          if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
        }
        if (buf) {
          paperAttachment = [{
            filename: exam.examPdfName || "exam.pdf",
            content: buf,
            contentType: "application/pdf"
          }];
        }
      }
    } catch (e) {
      console.warn("onFlatExamPosted: could not download paper for attachment:", e.message || e);
    }

    const wantYear = exam.year != null ? Number(exam.year) : null;
    const studentsSnap = await db.collection("students")
      .where("keyStage", "==", exam.keyStage)
      .get();

    for (const stuDoc of studentsSnap.docs) {
      const student = stuDoc.data() || {};
      const subjects = Array.isArray(student.subjects) ? student.subjects : [];
      if (!subjects.includes(exam.subjectId)) continue;
      if (wantYear != null && student.year != null && Number(student.year) !== wantYear) continue;
      if (String(student.status || "").toLowerCase() === "suspended") continue;
      if (claimedAuds.indexOf(WS.studentAudience(student)) === -1) continue;

      const studentId = stuDoc.id;

      try {
        await db.collection("personalNotifications").add({
          recipientId: studentId,
          recipientType: "student",
          type: "exam_posted",
          title: "New exam posted",
          message: `${exam.title || "An exam"} (${exam.subjectName || ""}) has been posted. Ask your parent to print the paper.`,
          relatedEntity: "exam",
          relatedEntityId: `${cid}/flat/${eid}`,
          read: false, emailSent: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) { /* ignore */ }

      if (student.email) {
        try {
          const t = templates.examPostedStudent({ student, exam, examDate });
          await sendEmail(student.email, t.subject, t.html);
        } catch (e) { console.warn("onFlatExamPosted: student email failed", student.email, e.message || e); }
      }

      try {
        const links = await db.collection("parentStudentLinks")
          .where("studentUid", "==", studentId).get();
        for (const link of links.docs) {
          const parentUid = link.data().parentUid;
          if (!parentUid) continue;
          const parentSnap = await db.collection("parentAccounts").doc(parentUid).get();
          if (!parentSnap.exists) continue;
          const parent = parentSnap.data() || {};
          if (!parent.email) continue;
          try {
            const t = templates.examPostedParent({ parentName: parent.name, student, exam, examDate });
            await sendEmail(parent.email, t.subject, t.html, paperAttachment || undefined);
          } catch (e) { console.warn("onFlatExamPosted: parent email failed", parent.email, e.message || e); }
          try {
            await db.collection("personalNotifications").add({
              recipientId: parentUid,
              recipientType: "parent",
              type: "exam_posted",
              title: `New exam for ${student.name || "your child"}`,
              message: `${exam.title || "An exam"} (${exam.subjectName || ""})${examDate ? " on " + examDate.toLocaleDateString("en-GB") : ""}.`,
              relatedEntity: "exam",
              relatedEntityId: `${cid}/flat/${eid}`,
              read: false, emailSent: !!parent.email,
              extra: { studentId }
            });
          } catch (e) { /* ignore */ }
        }
      } catch (e) { console.warn("onFlatExamPosted: parent link read failed", e.message || e); }
    }

    /* ---------------------------------------------------------
       Tutors — bell + email for every subject tutor who
       teaches the exam's Key Stage. They need to know the exam
       exists so they can mark the hand-ins once the window opens.
    --------------------------------------------------------- */
    try {
      const tutorsSnap = claimedAuds.indexOf("tutors") === -1 ? { docs: [] } : await db.collection("tutorAccounts").get();
      for (const tutDoc of tutorsSnap.docs) {
        const tutor = tutDoc.data() || {};
        if (String(tutor.status || "").toLowerCase() === "suspended") continue;
        const tutorSubjects = Array.isArray(tutor.subjects) ? tutor.subjects : [];
        if (tutorSubjects.indexOf(exam.subjectId) === -1) continue;
        const tutorKs = Array.isArray(tutor.keyStages) ? tutor.keyStages : [];
        if (tutorKs.length && tutorKs.indexOf(exam.keyStage) === -1) continue;

        const tutorId = tutDoc.id;

        // Bell
        try {
          await db.collection("personalNotifications").add({
            recipientId: tutorId,
            recipientType: "tutor",
            type: "exam_posted",
            title: "New exam posted",
            message: `${exam.title || "An exam"} (${exam.subjectName || ""})${examDate ? " on " + examDate.toLocaleDateString("en-GB") : ""} — you will be able to grade hand-ins once the submission window opens.`,
            relatedEntity: "exam",
            relatedEntityId: `${cid}/flat/${eid}`,
            read: false, emailSent: !!tutor.email,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) { /* ignore */ }

        // Email — reuse the student heads-up template. It is written
        // audience-neutral ("A new exam has just been posted for you"),
        // and the tutor just needs to know a paper is up and to expect
        // hand-ins. If you'd prefer a distinct tutor wording, add an
        // `examPostedTutor` template in email-templates.js and swap
        // the call below.
        if (tutor.email) {
          try {
            const t = templates.examPostedStudent({
              student: { name: tutor.name || "Tutor" },
              exam,
              examDate
            });
            await sendEmail(tutor.email, t.subject, t.html, paperAttachment || undefined);
          } catch (e) { console.warn("onFlatExamPosted: tutor email failed", tutor.email, e.message || e); }
        }
      }
    } catch (e) {
      console.warn("onFlatExamPosted: tutor notification pass failed", e.message || e);
    }
  }
);

/* =========================================================
   11. onFlatExamSubmissionWritten
   -----------------------------------------------------------
   Fires when a flat exam submission doc is written.

   The InkGrader writes ink data as the tutor draws. Those
   writes must NOT trigger emails. Only the Grade action flips
   `released` from false → true; that's the one signal we act on.

   On the release transition:
     • Bell for the student: "Results released".
     • Bell for every linked parent.
     • Email to the student: "Results released" (score + feedback).
     • Email to every linked parent: "Results released".

   Idempotency: writes `releaseNotifiedAt` on the submission doc
   inside the same server-side check. If the trigger were to fire
   twice (edge case with retries), the second run sees the flag
   and exits. Re-release after edits fires again — intentional,
   the student should know their result was updated.
========================================================= */
exports.onFlatExamSubmissionWritten = onDocumentWritten(
  { document: "classrooms/{cid}/exams/{eid}/submissions/{studentId}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (!after) return;                                 // deletion

    const beforeReleased = !!(before && before.released === true);
    const afterReleased  = !!(after  && after.released  === true);
    if (!afterReleased) return;                         // not released
    if (afterReleased === beforeReleased) return;       // no transition

    const { cid, eid, studentId } = event.params;
    const db = admin.firestore();

    // Claim the notification so a retry can't email twice.
    const claimed = await db.runTransaction(async (tx) => {
      const ref = db.doc(`classrooms/${cid}/exams/${eid}/submissions/${studentId}`);
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const d = snap.data() || {};
      if (d.releaseNotifiedAt) return false;
      tx.update(ref, { releaseNotifiedAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return;

    // Fetch exam + student.
    const [examSnap, studentSnap] = await Promise.all([
      db.doc(`classrooms/${cid}/exams/${eid}`).get(),
      db.collection("students").doc(studentId).get()
    ]);
    const exam    = examSnap.exists    ? examSnap.data()    : {};
    const student = studentSnap.exists ? studentSnap.data() : {};

    // Bell for the student.
    try {
      await db.collection("personalNotifications").add({
        recipientId: studentId,
        recipientType: "student",
        type: "exam_results_released",
        title: "Results released",
        message: `Your results for "${exam.title || "your exam"}" (${exam.subjectName || ""}) are now available.`,
        relatedEntity: "exam",
        relatedEntityId: `${cid}/flat/${eid}`,
        read: false, emailSent: !!student.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { /* ignore */ }

    // Email the student.
    if (student.email) {
      try {
        const t = templates.examResultsReleased({
          audience: "student",
          student,
          exam,
          submission: after
        });
        await sendEmail(student.email, t.subject, t.html);
      } catch (e) { console.warn("onFlatExamSubmissionWritten: student email failed", e.message || e); }
    }

    // Parents — bell + email.
    try {
      const links = await db.collection("parentStudentLinks")
        .where("studentUid", "==", studentId).get();
      for (const link of links.docs) {
        const parentUid = link.data().parentUid;
        if (!parentUid) continue;
        const parentSnap = await db.collection("parentAccounts").doc(parentUid).get();
        if (!parentSnap.exists) continue;
        const parent = parentSnap.data() || {};

        try {
          await db.collection("personalNotifications").add({
            recipientId: parentUid,
            recipientType: "parent",
            type: "exam_results_released",
            title: `Results released: ${student.name || "your child"}`,
            message: `Results for "${exam.title || "an exam"}" (${exam.subjectName || ""}) are now available.`,
            relatedEntity: "exam",
            relatedEntityId: `${cid}/flat/${eid}`,
            read: false, emailSent: !!parent.email,
            extra: { studentId },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) { /* ignore */ }

        if (parent.email) {
          try {
            const t = templates.examResultsReleased({
              audience: "parent",
              student,
              parentName: parent.name,
              exam,
              submission: after
            });
            await sendEmail(parent.email, t.subject, t.html);
          } catch (e) { console.warn("onFlatExamSubmissionWritten: parent email failed", parent.email, e.message || e); }
        }
      }
    } catch (e) { console.warn("onFlatExamSubmissionWritten: parent link read failed", e.message || e); }
  }
);


/* =========================================================
   12. lookupTutorBySlug
   -----------------------------------------------------------
   Public callable. Resolves a tutor login slug to a minimal
   public payload so /tutor/{slug} can pre-fill the sign-in
   form WITHOUT opening tutorAccounts to unauthenticated reads.

   Why this exists:
     Before this function, tutor/login.html called
     getTutorBySlug() which ran a Firestore query against
     tutorAccounts. The rules require isSignedIn() — so an
     anonymous visitor to /tutor/brian-ndungu always got
     permission-denied, and the page fell into its error state.

     Rather than open tutorAccounts to public reads (which
     would leak phone, subjects, and any internal notes on
     every tutor doc), this function runs on the server with
     the Admin SDK — which bypasses rules — and returns only
     the fields the login page needs.

   Returns:
     { found: true,  tutor: { uid, name, slug, status, email } }
     { found: false }

   Never throws for "not found" — the caller treats a miss as
   a normal "unrecognised link" case, not an error.
========================================================= */
exports.lookupTutorBySlug = onCall(
  { cors: true, region: LOCATION, timeoutSeconds: 15, memory: "256MiB" },
  async (request) => {
    const raw = request.data && request.data.slug;
    const slug = String(raw == null ? "" : raw).trim().toLowerCase();

    if (!slug || slug.length > 64 || !/^[a-z0-9-]+$/.test(slug)) {
      return { found: false };
    }

    const db = admin.firestore();
    try {
      const snap = await db
        .collection("tutorAccounts")
        .where("slug", "==", slug)
        .limit(1)
        .get();

      if (snap.empty) return { found: false };

      const doc = snap.docs[0];
      const d = doc.data() || {};

      return {
        found: true,
        tutor: {
          uid: doc.id,
          name: typeof d.name === "string" ? d.name : "",
          slug: typeof d.slug === "string" ? d.slug : slug,
          status: typeof d.status === "string" ? d.status : "Active",
          email: typeof d.email === "string" ? d.email : ""
        }
      };
    } catch (err) {
      console.error("lookupTutorBySlug error:", err);
      return { found: false };
    }
  }
);