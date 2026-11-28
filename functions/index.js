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
     • onLessonSubmissionWritten  (Classwork submissions)
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

const { onInit } = require("firebase-functions/v2");

onInit(() => {
  admin.initializeApp();
});

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
exports.backfillParentPhonePasswords = notifications.backfillParentPhonePasswords;
exports.parentPhoneLogin     = notifications.parentPhoneLogin;

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
exports.repairReleasedAudiences        = publishing.repairReleasedAudiences;
exports.repairExamTutorAccess         = publishing.repairExamTutorAccess;

const examTimetable = require("./exam-timetable");
exports.publishExamTimetable          = examTimetable.publishExamTimetable;
exports.examTimetablePdf              = examTimetable.examTimetablePdf;
exports.publishScheduledExamTimetables = examTimetable.publishScheduledExamTimetables;
exports.onResourcePosted              = publishing.onResourcePosted;
exports.onResourceMessage             = publishing.onResourceMessage;
exports.backfillAudiences             = publishing.backfillAudiences;
exports.onAssignmentAudienceChanged   = publishing.onAssignmentAudienceChanged;
exports.onNestedExamAudienceChanged   = publishing.onNestedExamAudienceChanged;
exports.onLessonAudienceChanged       = publishing.onLessonAudienceChanged;  // <--- NEW

const remote = require("./remote");
exports.admitRemoteStudent            = remote.admitRemoteStudent;
exports.resendRemoteInvite            = remote.resendRemoteInvite;
exports.setRemoteStudentStatus        = remote.setRemoteStudentStatus;
exports.onRemoteTicketCreated         = remote.onRemoteTicketCreated;

const tuition = require("./tuition");
exports.onTuitionStudentActivated     = tuition.onTuitionStudentActivated;
exports.onTuitionRequestCreated       = tuition.onTuitionRequestCreated;
exports.onTuitionRequestUpdated       = tuition.onTuitionRequestUpdated;
exports.onTuitionMessageCreated       = tuition.onTuitionMessageCreated;
exports.onTuitionTimetableCreated     = tuition.onTuitionTimetableCreated;
exports.onTuitionTicketCreated        = tuition.onTuitionTicketCreated;

const tutorChat = require("./tutor-chat");
exports.onTutorChatMessageCreated     = tutorChat.onTutorChatMessageCreated;

const parentNewsletter = require("./parent-newsletter");
exports.sendParentNewsletter          = parentNewsletter.sendParentNewsletter;
exports.parentNewsletterUnsubscribe   = parentNewsletter.parentNewsletterUnsubscribe;

const tech = require("./tech");
exports.onTechEnrolmentCreated        = tech.onTechEnrolmentCreated;
exports.onTechEnrolmentUpdated        = tech.onTechEnrolmentUpdated;
exports.onTechBuildCreated            = tech.onTechBuildCreated;
exports.onTechBuildUpdated            = tech.onTechBuildUpdated;
exports.onTechFeedbackCreated         = tech.onTechFeedbackCreated;
exports.onTechMessageCreated          = tech.onTechMessageCreated;
exports.onTechGuardianMessageCreated  = tech.onTechGuardianMessageCreated;
exports.onTechContentWritten          = tech.onTechContentWritten;
exports.onTechLessonWritten           = tech.onTechLessonWritten;
exports.submitTechQuiz                = tech.submitTechQuiz;
exports.onTechLessonWorkWritten       = tech.onTechLessonWorkWritten;
exports.onTechPracticeWritten         = tech.onTechPracticeWritten;
exports.onTechLessonProgressWritten   = tech.onTechLessonProgressWritten;
exports.onTechGroupWritten            = tech.onTechGroupWritten;
exports.onTechGroupTaskWritten        = tech.onTechGroupTaskWritten;
exports.onTechGroupChatMessage        = tech.onTechGroupChatMessage;
exports.emailTechGroupMessage         = tech.emailTechGroupMessage;

const pushNotes = require("./push");
exports.registerPushToken             = pushNotes.registerPushToken;
exports.sendTestPush                  = pushNotes.sendTestPush;
exports.onTechNotificationPush        = pushNotes.onTechNotificationPush;
exports.onTechLiveClassWritten        = tech.onTechLiveClassWritten;
exports.onTechFamilyDeskMessage       = tech.onTechFamilyDeskMessage;
exports.createTechCoach               = tech.createTechCoach;
exports.sendTechCoachAccess           = tech.sendTechCoachAccess;
exports.onTechCoachApplied            = tech.onTechCoachApplied;
exports.techLinkGuardians             = tech.techLinkGuardians;
exports.nudgeTechChat                 = tech.nudgeTechChat;
exports.admitToTechStudio             = tech.admitToTechStudio;
exports.onTechHomeworkWritten         = tech.onTechHomeworkWritten;
exports.onTechHomeworkWorkWritten     = tech.onTechHomeworkWorkWritten;
exports.migrateTechArchitecture       = tech.migrateTechArchitecture;
exports.techShare                     = tech.techShare;

// Advanced Paisley IDE: Java (and fallback) runs, forwarded to an isolated Judge0-compatible sandbox.
const codeRunner = require("./code-runner");
exports.runCode                       = codeRunner.runCode;
const uploadGuard = require("./upload-guard");
exports.checkTechUpload               = uploadGuard.checkTechUpload;

// Developer mode (Admin > Settings): the freeze's safety net. The holds themselves live in dev-freeze.js.
const devMode = require("./dev-mode");
exports.onFreezePersonalNotification = devMode.onFreezePersonalNotification;
exports.onFreezeTechNotification    = devMode.onFreezeTechNotification;

const attendance = require("./attendance");
exports.attendanceToday               = attendance.attendanceToday;
exports.attendanceCheckIn             = attendance.attendanceCheckIn;
exports.attendanceResolve             = attendance.attendanceResolve;
exports.attendanceSubmit              = attendance.attendanceSubmit;
exports.attendanceExplain             = attendance.attendanceExplain;
exports.attendanceRequest             = attendance.attendanceRequest;
exports.attendanceAdmin               = attendance.attendanceAdmin;
exports.attendanceSweep               = attendance.attendanceSweep;
exports.onAttendanceStrikeCreated     = attendance.onAttendanceStrikeCreated;
exports.onAttendanceRecordUpdated     = attendance.onAttendanceRecordUpdated;
exports.onAttendanceNotificationCreated = attendance.onAttendanceNotificationCreated;
exports.attendanceTutorCheckIn        = attendance.attendanceTutorCheckIn;

// Optional facial recognition for attendance (Admin > Attendance > Facial recognition).
const face = require("./face-recognition");
exports.faceAdmin                     = face.faceAdmin;
exports.faceCheckIn                   = face.faceCheckIn;
exports.faceTutorVerify               = face.faceTutorVerify;
exports.faceConsent                   = face.faceConsent;
exports.faceRetention                 = face.faceRetention;

const subjects = require("./subjects");
exports.renameSubject                 = subjects.renameSubject;

const work = require("./work");
exports.onAssignmentPosted            = work.onAssignmentPosted;
exports.onExamPostedOrPublished       = work.onExamPostedOrPublished;
exports.onSubmissionWritten           = work.onSubmissionWritten;
exports.onExamAttemptWritten          = work.onExamAttemptWritten;
exports.onLessonSubmissionWritten     = work.onLessonSubmissionWritten;  // <--- NEW
exports.migrateLegacyHomeworkAndExams = work.migrateLegacyHomeworkAndExams;

const workFile = require("./work-file");
exports.fetchWorkFile                 = workFile.fetchWorkFile;   // marking screen download fallback (no bucket CORS needed)

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
    // New students start fresh: work posted to the class before this moment is not theirs.
    if (!after.activatedAt) {
      try { await event.data.after.ref.update({ activatedAt: admin.firestore.FieldValue.serverTimestamp() }); }
      catch (e) { console.error("onStudentActivated: activatedAt write failed:", e); }
    }
    // TECH students get their own welcome (functions/tech.js → onTechStudentActivated) with the TECH sign-in link.
    if (student.studentType === "tech") return;
    if (!student.email) return;
    try {
      await notifications.addPersonalNotification({
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
      db.collection(conv.programme === "tech" ? "techStudents" : "students").doc(studentUid).get()
    ]);
    const parent  = parentSnap.exists  ? parentSnap.data()  : {};
    /* A Tech Studio family hears from Tech Studio, on its own guardian portal. */
    const student = Object.assign({}, studentSnap.exists ? studentSnap.data() : {}, conv.programme === "tech" ? { studentType: "tech" } : {});
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
        await notifications.addPersonalNotification({
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
        await notifications.addPersonalNotification({
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

   Fires when the exam is POSTED (Classroom > Publish: it becomes
   visible to an audience, or is released to students by name).
   An exam without an `audiences` map was never posted and sends
   nothing (it used to count as posted to every online student).

   Behaviour per student in scope (subject + Year + board, or the
   students the desk picked / the freeze's test accounts):
     • Student: bell + "Exam released, check with your parent"
       email. No paper.
     • Each linked parent: bell + email WITH the paper attached,
       asking them to give it to the child when the exam opens.
     • Tutors who teach it (or only those the desk picked,
       `tutorNotify`): bell + their own email (examPostedTutor):
       get ready to mark, submissions show in the Classroom.
       Never the paper, never student wording.
   Every bell goes through notifyOnce and every email through
   sendEmail, so developer mode's freeze holds them.

   Idempotency: `notificationsSentAt` is stamped inside a
   transaction before sending. A second trigger pass is a no-op.
========================================================= */
exports.onFlatExamPosted = onDocumentWritten(
  { document: "classrooms/{cid}/exams/{eid}", region: LOCATION, secrets: SMTP_SECRETS },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (!after) return;
    const WS = require("./work-shared");

    /* Only posting (Classroom > Publish, publishClassroomContent) sends an exam to anyone. An exam
       without an `audiences` map was never posted: it must not reach the whole class by default. */
    if (!after.audiences || typeof after.audiences !== "object") return;

    // Audiences the exam has JUST become visible to, plus students the desk (or the freeze's test
    // list) released it to by name. Each is claimed once, so retries never notify twice.
    const becameVisible = (aud) => WS.isVisibleTo(after, aud, "Published") && !WS.isVisibleTo(before, aud, "Published");
    const wanted = ["online", "remote", "tuition", "tutors"].filter(becameVisible);
    const livePublished = String(after.status || "") === "Published";
    const hadRel = (before && Array.isArray(before.releasedTo)) ? before.releasedTo : [];
    const wasLive = before && String(before.status || "") === "Published";
    const newlyReleased = livePublished ? (Array.isArray(after.releasedTo) ? after.releasedTo : []).filter((x) => !wasLive || hadRel.indexOf(x) === -1) : [];
    if (!wanted.length && !newlyReleased.length) return;

    const claimed = await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(event.data.after.ref);
      if (!snap.exists) return { auds: [], ids: [] };
      const d = snap.data() || {};
      const sent = d.notificationsSent || {};
      const auds = wanted.filter((a) => sent[a] !== true);
      const told = Array.isArray(d.notifiedStudents) ? d.notifiedStudents : [];
      const ids = newlyReleased.filter((x) => told.indexOf(x) === -1);
      if (!auds.length && !ids.length) return { auds: [], ids: [] };
      const patch = { notificationsSentAt: admin.firestore.FieldValue.serverTimestamp() };
      auds.forEach((a) => { patch["notificationsSent." + a] = true; });
      if (ids.length) patch.notifiedStudents = admin.firestore.FieldValue.arrayUnion(...ids);
      tx.update(event.data.after.ref, patch);
      return { auds, ids };
    });
    if (!claimed.auds.length && !claimed.ids.length) return;

    const { cid, eid } = event.params;
    const exam = after;
    const db = admin.firestore();
    if (!exam.subjectId || !exam.keyStage) {
      console.warn(`onFlatExamPosted: exam ${eid} missing subjectId or keyStage, skipping.`);
      return;
    }
    const examDate = exam.examDate && exam.examDate.toDate ? exam.examDate.toDate() : (exam.examDate ? new Date(exam.examDate) : null);
    const examClassroom = await WS.classroomOf(cid);
    const entityId = `${cid}/flat/${eid}`;
    const key = WS.stableId(entityId, "flatExamPosted");

    /* ---- Who: students of the subject + Year + board on a posted portal, or those released by name ---- */
    /* Students of the class on the given portals (auds), plus the ones named in ids. */
    async function studentsWith(auds, ids) {
      const out = new Map();
      const studentAuds = auds.filter((a) => a !== "tutors");
      if (studentAuds.length) {
        const wantYear = exam.year != null ? Number(exam.year) : null;
        const studentsSnap = await db.collection("students").where("keyStage", "==", exam.keyStage).get();
        for (const stuDoc of studentsSnap.docs) {
          const student = stuDoc.data() || {};
          const subjects = Array.isArray(student.subjects) ? student.subjects : [];
          if (!subjects.includes(exam.subjectId)) continue;
          if (wantYear != null && student.year != null && Number(student.year) !== wantYear) continue;
          if (["suspended", "pending"].indexOf(String(student.status || "").toLowerCase()) !== -1) continue;
          if (studentAuds.indexOf(WS.studentAudience(student)) === -1) continue;
          if (examClassroom && WS.studentBoard(student, exam.subjectId) !== WS.boardOf(examClassroom)) continue;
          if (exam.audience === "students" && (exam.recipients || []).indexOf(stuDoc.id) === -1) continue;
          out.set(stuDoc.id, { id: stuDoc.id, ...student });
        }
      }
      for (const sid of ids) {
        if (out.has(sid)) continue;
        const sd = await db.collection("students").doc(sid).get();
        if (sd.exists && String((sd.data() || {}).status || "").toLowerCase() !== "suspended") out.set(sid, { id: sid, ...sd.data() });
      }
      return out;
    }
    const recipients = await studentsWith(claimed.auds, claimed.ids);

    /* The paper goes to parents only (never to students or tutors), and is fetched only if a parent needs it. */
    let paperAttachment, paperTried = false;
    async function paper() {
      if (paperTried) return paperAttachment;
      paperTried = true;
      try {
        let buf = null;
        if (exam.examPdfPath) { const [data] = await admin.storage().bucket().file(exam.examPdfPath).download(); buf = data; }
        else if (exam.examPdfUrl) { const resp = await fetch(exam.examPdfUrl); if (resp.ok) buf = Buffer.from(await resp.arrayBuffer()); }
        if (buf) paperAttachment = [{ filename: exam.examPdfName || "exam.pdf", content: buf, contentType: "application/pdf" }];
      } catch (e) { console.warn("onFlatExamPosted: could not download the paper for the parents' email:", e.message || e); }
      return paperAttachment;
    }

    let studentsTold = 0, parentsTold = 0, tutorsTold = 0;
    for (const student of recipients.values()) {
      const studentId = student.id;
      try {
        /* Bells go through the freeze check (notifyOnce); a held bell means no email either. */
        const told = await WS.notifyOnce(`flatexam_${key}_${studentId}`, studentId, "student", {
          type: "exam_posted", title: "Exam released",
          message: `${exam.title || "An exam"} (${exam.subjectName || ""}) has been released. Check with your parent; you will be told when to hand it in.`,
          relatedEntity: "exam", relatedEntityId: entityId, emailSent: !!student.email
        });
        if (told && student.email) {
          const t = templates.examPostedStudent({ student, exam, examDate });
          const r = await sendEmail(student.email, t.subject, t.html, undefined, undefined, { area: "exams" });
          if (r && r.sent) studentsTold++;
        }
      } catch (e) { console.warn("onFlatExamPosted: student notice failed", studentId, e.message || e); }

      try {
        for (const parent of await WS.parentsOfStudent(studentId)) {
          const told = await WS.notifyOnce(`flatexam_${key}_${parent.id}_${studentId}`, parent.id, "parent", {
            type: "exam_posted", title: `New exam for ${student.name || "your child"}`,
            message: `${exam.title || "An exam"} (${exam.subjectName || ""})${examDate ? " on " + examDate.toLocaleDateString("en-GB") : ""}. The paper is in your email and in the Exams section.`,
            relatedEntity: "exam", relatedEntityId: entityId, emailSent: !!parent.email, extra: { studentId }
          });
          if (!told || !parent.email) continue;
          const t = templates.examPostedParent({ parentName: parent.name, student, exam, examDate });
          const r = await sendEmail(parent.email, t.subject, t.html, (await paper()) || undefined, undefined, { area: "exams" });
          if (r && r.sent) parentsTold++;
        }
      } catch (e) { console.warn("onFlatExamPosted: parent notice failed", studentId, e.message || e); }
    }

    /* ---- Tutors who teach this subject, Key Stage and board (or only those the desk picked):
       a bell and their own email. Never the paper, never the student wording. ---- */
    /* First time tutors get it: who has it, when it opens and closes. Later, when the desk gives it
       to more students by name, the same tutors hear who was added. */
    const tutorsFirst = claimed.auds.indexOf("tutors") !== -1;
    const tutorsMore = !tutorsFirst && WS.isVisibleTo(after, "tutors", "Published") && claimed.ids.length > 0;
    if (tutorsFirst || tutorsMore) {
      try {
        const classLabel = WS.classTag(exam.subjectName || "", examClassroom);
        const openAuds = ["online", "remote", "tuition"].filter((a) => WS.isVisibleTo(after, a, "Published"));
        const given = tutorsFirst ? await studentsWith(openAuds, Array.isArray(after.releasedTo) ? after.releasedTo : []) : recipients;
        const names = Array.from(given.values()).map((s) => s.name || "A student").sort((a, b) => a.localeCompare(b));
        const win = WS.examWindow(exam);
        const moreKey = tutorsMore ? WS.stableId(entityId, "moreStudents", claimed.ids.slice().sort().join(",")) : "";
        for (const tutor of await WS.examTutors(exam, examClassroom)) {
          const told = await WS.notifyOnce(tutorsMore ? `flatexammore_${moreKey}_${tutor.id}` : `flatexam_${key}_${tutor.id}`, tutor.id, "tutor", {
            type: "exam_posted",
            title: tutorsMore ? `${names.length} more student${names.length === 1 ? "" : "s"} given ${exam.title || "an exam"}` : `Exam released in ${classLabel || "your subject"}`,
            message: `${exam.title || "An exam"} (${classLabel}) ${tutorsMore ? "was also given to" : "was released to"} ${names.length} student${names.length === 1 ? "" : "s"}. Opens: ${win.opens}. Closes: ${win.closes}. Get ready to mark: each submission arrives in the Classroom.`,
            relatedEntity: "exam", relatedEntityId: entityId, emailSent: !!tutor.email, extra: WS.boardExtra(examClassroom)
          });
          if (!told || !tutor.email) continue;
          const t = templates.examPostedTutor({ tutorName: tutor.name, exam, examDate, classLabel, students: names, more: tutorsMore, window: win });
          const r = await sendEmail(tutor.email, t.subject, t.html, undefined, undefined, { area: "exams" });
          if (r && r.sent) tutorsTold++;
        }
      } catch (e) { console.warn("onFlatExamPosted: tutor notification pass failed", e.message || e); }
    }
    console.log(`onFlatExamPosted ${eid}: ${recipients.size} student(s) in scope; emailed ${studentsTold} student(s), ${parentsTold} parent(s), ${tutorsTold} tutor(s).`);
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
    const { cid, eid, studentId } = event.params;
    const WS = require("./work-shared");
    const db = admin.firestore();

    /* A student handed in (or re-handed in after corrections): tell the tutors who mark this exam
       (those who teach the class, or only those the desk picked). Once per hand-in round. */
    const wasIn = before && (before.status === "Submitted" || before.status === "Graded");
    if (after.status === "Submitted" && !wasIn && after.handIn !== "physical") {
      try {
        const ex = await db.doc(`classrooms/${cid}/exams/${eid}`).get();
        const e = ex.exists ? ex.data() : {};
        const cls = await WS.classroomOf(cid);
        const board = WS.boardLabel(cls);
        const resub = !!(before && before.status === "Corrections");
        const at = WS.toDate(after.submittedAt) || WS.toDate(after.updatedAt);
        const round = WS.stableId(cid, eid, studentId, resub ? "resub" : "sub", String(at ? at.getTime() : (resub ? "r" : "0")));
        const who = after.studentName || "A student";
        const tutors = await WS.examTutors(e, cls);
        if (e.tutorId && !tutors.some((t) => t.id === e.tutorId)) tutors.push({ id: e.tutorId });
        for (const tutor of tutors) {
          const told = await WS.notifyOnce(`flatexamsub_${round}_${tutor.id}`, tutor.id, "tutor", {
            type: "exam_submitted", title: resub ? "Exam resubmitted" : "Exam submitted: ready to mark",
            message: `${who} ${resub ? "resubmitted corrected work for" : "handed in"} ${e.title || "an exam"} (${WS.classTag(e.subjectName || "", cls) || e.subjectName || ""}${board && !WS.classTag(e.subjectName || "", cls) ? ", " + board : ""}). Open it in the Classroom to mark.`,
            relatedEntity: "exam", relatedEntityId: `${cid}/flat/${eid}`, emailSent: !!tutor.email, extra: Object.assign({ studentId }, WS.boardExtra(cls))
          });
          if (!told || !tutor.email) continue;
          const t = templates.examSubmittedTutor({ tutorName: tutor.name, exam: e, studentName: who, classLabel: WS.classTag(e.subjectName || "", cls) || e.subjectName || "", resub });
          await sendEmail(tutor.email, t.subject, t.html, undefined, undefined, { area: "exams" });
        }
      } catch (err) { console.warn("onFlatExamSubmissionWritten: tutor hand-in notice failed", err.message || err); }
      return;
    }

    // Only a tutor action (Graded / Corrections with released=true and a NEW gradedAt) notifies.
    // Ink autosaves never change gradedAt, so they never email anyone.
    const status = after.status;
    if (after.released !== true || (status !== "Graded" && status !== "Corrections")) return;
    const gA = WS.toDate(after.gradedAt), gB = before ? WS.toDate(before.gradedAt) : null;
    const changed = !before || !before.released || before.status !== status || String(gA || "") !== String(gB || "");
    if (!changed) return;

    const claimed = await WS.claimOnce(WS.stableId("flatgraded", cid, eid, studentId, status, String(gA ? gA.getTime() : "0")));
    if (!claimed) return;

    const isCorr = status === "Corrections";
    const [examSnap, studentSnap] = await Promise.all([
      db.doc(`classrooms/${cid}/exams/${eid}`).get(),
      db.collection("students").doc(studentId).get()
    ]);
    const exam    = examSnap.exists    ? examSnap.data()    : {};
    const student = studentSnap.exists ? { id: studentId, ...studentSnap.data() } : { id: studentId, name: after.studentName, email: after.studentEmail };
    const subj = exam.subjectName || "";
    const score = after.grade != null && after.maxScore != null ? `${after.grade}/${after.maxScore}` : (after.grade != null ? String(after.grade) : "see feedback");
    const studentMsg = isCorr
      ? `"${exam.title || "Your exam"}" (${subj}) needs corrections. Open it to read your tutor's notes and upload your corrected work.`
      : `Your results for "${exam.title || "your exam"}" (${subj}) are ready: ${score}. Open it to see your feedback and download your marked copy.`;
    const parentMsg = isCorr
      ? `${student.name || "Your child"}'s exam "${exam.title || ""}" (${subj}) has been sent back for corrections.`
      : `Results for ${student.name || "your child"}'s exam "${exam.title || ""}" (${subj}) are ready: ${score}. The marked copy is in the Parent Portal.`;
    const evType = isCorr ? "exam_corrections" : "exam_results_released";
    const fileUrl = after.gradedFileUrl || "", fileName = after.gradedFileName || "";
    const mail = (audience, parentName) => isCorr
      ? templates.homeworkGraded({ audience, student, parentName, kind: "exam", item: exam, submission: after })
      : templates.examResultsReleased({ audience, student, parentName, exam, submission: after });

    // Student: email + bell + Notices panel (with marked-copy link)
    try { if (student.email) { const t = mail("student"); await sendEmail(student.email, t.subject, t.html); } }
    catch (err) { console.warn("onFlatExamSubmissionWritten: student email failed", err.message || err); }
    try {
      await WS.notify(studentId, "student", {
        type: evType, title: isCorr ? "Exam: corrections requested" : "Results released", message: studentMsg,
        relatedEntity: "exam", relatedEntityId: `${cid}/flat/${eid}`, emailSent: !!student.email
      });
      await WS.addStudentNotice(studentId, "student", {
        type: isCorr ? "corrections" : "graded",
        title: isCorr ? `Corrections requested: ${exam.title || "Exam"}` : `Exam graded: ${exam.title || "Exam"}`,
        message: studentMsg, fileUrl, fileName, studentId, studentName: student.name
      });
    } catch (err) { console.warn("onFlatExamSubmissionWritten: student notice failed", err.message || err); }

    // Every linked parent / guardian: email + bell + Notices panel
    try {
      const parents = await WS.parentsOfStudent(studentId);
      for (const p of parents) {
        try { if (p.email) { const t = mail("parent", p.name); await sendEmail(p.email, t.subject, t.html); } }
        catch (err) { console.warn("onFlatExamSubmissionWritten: parent email failed", p.email, err.message || err); }
        try {
          await WS.notify(p.id, "parent", {
            type: evType,
            title: isCorr ? `${student.name || "Your child"}: exam corrections requested` : `Results released: ${student.name || "your child"}`,
            message: parentMsg, relatedEntity: "exam", relatedEntityId: `${cid}/flat/${eid}`, emailSent: !!p.email, extra: { studentId }
          });
          await WS.addStudentNotice(p.id, "parent", {
            type: isCorr ? "corrections" : "graded",
            title: isCorr ? `${student.name || "Your child"}: exam corrections requested` : `${student.name || "Your child"}: exam graded`,
            message: parentMsg, fileUrl, fileName, studentId, studentName: student.name
          });
        } catch (err) { console.warn("onFlatExamSubmissionWritten: parent notice failed", err.message || err); }
      }
    } catch (err) { console.warn("onFlatExamSubmissionWritten: parent lookup failed", err.message || err); }
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