/* =========================================================
   LMS HELPERS — Paisley Studio Student Portal & Exam Centre
   -----------------------------------------------------------
   Load AFTER firebase-config.js (and firebase-auth-compat.js)
   on any page that touches the LMS collections below.

   Collections:
     • students        — one doc per learner, doc ID = Auth UID
     • examResults     — graded results (only "released" ones reach students)
     • homework        — homework/resources posted by tutors/admin
     • submissions     — a student's homework response (text + file)
     • exams           — online exam definitions (question bank)
     • examAttempts    — a student's attempt at an online exam
     • tickets         — student support tickets to tutors/admin
     • tutorAccounts   — tutor logins (Phase 5), doc ID = Auth UID
     • notes           — revision notes / materials (Phase 6)
     • notifications   — notices (Phase 6)
     • timetables      — timetables (Phase 6)
     • liveClasses     — Cloudflare RealtimeKit sessions (Phase 7)
     • gradingGrants   — per-task grading rights granted by admin (Phase B)
     • activities / activityAttempts — Wordwall-style activity engine
     • timetableEntries — flat, one-doc-per-session timetable (new model;
       legacy `timetables` slots[]-per-doc collection is left untouched
       for backward compatibility)
     • liveClassSessions / liveClassIntegrityEvents — live-class monitoring
     • parentAccounts / parentStudentLinks — parent portal
     • personalNotifications — per-recipient alerts (separate from the
       `notifications` announcements feed)

   NOTE: KEY_STAGES and DAYS_OF_WEEK are declared with `var`, not `const`,
   on purpose. If any page loads this file twice, or if another included
   script declares the same top-level name, `const` throws
   "Identifier 'X' has already been declared" which aborts the entire
   file and makes every function in it undefined. `var` tolerates the
   duplicate declaration without aborting.
========================================================= */

var KEY_STAGES = [
  'Key Stage 2 (Years 3-6)',
  'Key Stage 3 (Years 7-9)',
  'Key Stage 4 (Years 10-11) — IGCSE',
  'Key Stage 5 (Years 12-13) — A-Level'
];

// ---------------------------------------------------------
// STUDENTS
// ---------------------------------------------------------

function createStudentProfile(uid, data) {
  return db.collection('students').doc(uid).set({
    ...data,
    role: 'student',
    status: 'Pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getStudentProfile(uid) {
  return db.collection('students').doc(uid).get();
}

function updateStudentProfile(uid, data) {
  return db.collection('students').doc(uid).update(data);
}

function deleteStudentProfile(uid) {
  return db.collection('students').doc(uid).delete();
}

// ---------------------------------------------------------
// EXAM RESULTS
// ---------------------------------------------------------

function addExamResult(data) {
  return db.collection('examResults').add({
    ...data,
    released: data.released === true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateExamResult(id, data) {
  return db.collection('examResults').doc(id).update(data);
}

function deleteExamResult(id) {
  return db.collection('examResults').doc(id).delete();
}

function getResultsForStudent(uid) {
  return db.collection('examResults')
    .where('studentId', '==', uid)
    .where('released', '==', true)
    .get();
}

function getAllResultsForStudent(uid) {
  return db.collection('examResults')
    .where('studentId', '==', uid)
    .get();
}

function releaseExamResult(id) {
  return db.collection('examResults').doc(id).update({
    released: true,
    releasedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function holdExamResult(id) {
  return db.collection('examResults').doc(id).update({ released: false });
}

// ---------------------------------------------------------
// HOMEWORK
// ---------------------------------------------------------

function addHomework(data) {
  return db.collection('homework').add({
    ...data,
    postedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateHomework(id, data) {
  return db.collection('homework').doc(id).update(data);
}

function deleteHomework(id) {
  return db.collection('homework').doc(id).delete();
}

function getHomeworkForKeyStage(keyStage) {
  return db.collection('homework').where('keyStage', '==', keyStage).get();
}

// ---------------------------------------------------------
// SUBMISSIONS
// ---------------------------------------------------------
//
// A submission can carry a text answer, an uploaded file, or both.
// Status starts as 'Submitted'. Once graded it becomes 'Graded'.
// Students can edit their answer via updateHomeworkAnswer() until
// the tutor grades it.

function addSubmission(data) {
  const authorTutorId = data.authorTutorId || '';
  const authorRole    = data.authorRole    || 'admin';
  return db.collection('submissions').add({
    ...data,
    textAnswer: (typeof data.textAnswer === 'string') ? data.textAnswer : '',
    authorTutorId: authorTutorId,
    authorRole:    authorRole,
    status: 'Submitted',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Preferred entry point from the student homework page.
// Accepts: studentId, studentName, studentEmail, keyStage,
//          homeworkId, homeworkTitle, subject,
//          textAnswer (string), fileUrl, fileName, fileType,
//          note, authorTutorId, authorRole.
// The student can provide just text, just a file, or both.
function submitHomeworkWithAnswer(data) {
  return db.collection('submissions').add({
    studentId:     data.studentId     || '',
    studentName:   data.studentName   || '',
    studentEmail:  data.studentEmail  || '',
    keyStage:      data.keyStage      || '',
    homeworkId:    data.homeworkId    || '',
    homeworkTitle: data.homeworkTitle || '',
    subject:       data.subject       || '',
    textAnswer:    (typeof data.textAnswer === 'string') ? data.textAnswer : '',
    fileUrl:       data.fileUrl       || '',
    fileName:      data.fileName      || '',
    fileType:      data.fileType      || '',
    note:          (typeof data.note === 'string') ? data.note : '',
    authorTutorId: data.authorTutorId || '',
    authorRole:    data.authorRole    || 'admin',
    status: 'Submitted',
    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// Allow a student to edit their submission before it's graded.
// Doesn't touch authorTutorId/authorRole/studentId.
function updateHomeworkAnswer(id, data) {
  return db.collection('submissions').doc(id).update({
    textAnswer: (typeof data.textAnswer === 'string') ? data.textAnswer : '',
    fileUrl:    data.fileUrl  || '',
    fileName:   data.fileName || '',
    fileType:   data.fileType || '',
    note:       (typeof data.note === 'string') ? data.note : '',
    updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
  });
}

function gradeSubmission(id, grade, feedback) {
  return db.collection('submissions').doc(id).update({
    status: 'Graded',
    grade: grade,
    feedback: feedback || '',
    gradedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getSubmissionsForStudent(uid) {
  return db.collection('submissions').where('studentId', '==', uid).get();
}

function getSubmissionsForHomework(homeworkId) {
  return db.collection('submissions').where('homeworkId', '==', homeworkId).get();
}

// ---------------------------------------------------------
// EXAMS
// ---------------------------------------------------------

function addExam(data) {
  return db.collection('exams').add({
    ...data,
    status: data.status || 'Draft',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateExam(id, data) {
  return db.collection('exams').doc(id).update(data);
}

function deleteExam(id) {
  return db.collection('exams').doc(id).delete();
}

function getExamsForKeyStage(keyStage) {
  return db.collection('exams')
    .where('keyStage', '==', keyStage)
    .where('status', '==', 'Published')
    .get();
}

// ---------------------------------------------------------
// EXAM ATTEMPTS
// ---------------------------------------------------------

function startExamAttempt(data) {
  const authorTutorId = data.authorTutorId || '';
  const authorRole    = data.authorRole    || 'admin';
  return db.collection('examAttempts').add({
    ...data,
    authorTutorId: authorTutorId,
    authorRole:    authorRole,
    status: 'In progress',
    startedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function submitExamAttempt(id, data) {
  return db.collection('examAttempts').doc(id).update({
    answers: data.answers || {},
    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'Awaiting grading'
  });
}

// Manually save score and feedback on an attempt.
//
// Accepts EITHER call style:
//   gradeExamAttempt(id, { score, maxScore, feedback, gradedBy })
//   gradeExamAttempt(id, score, maxScore, feedback, gradedBy)
//
// Every value is normalised before it reaches Firestore, because
// Firestore rejects `undefined` (but accepts `null`). Numbers that
// are not finite become null; strings that are not strings become ''.
function gradeExamAttempt(id, a, b, c, d) {
  let score, maxScore, feedback, gradedBy;
  if (a !== null && typeof a === 'object') {
    score    = a.score;
    maxScore = a.maxScore;
    feedback = a.feedback;
    gradedBy = a.gradedBy;
  } else {
    score    = a;
    maxScore = b;
    feedback = c;
    gradedBy = d;
  }

  const out = {
    status: 'Graded',
    score:    (typeof score    === 'number' && isFinite(score))    ? score    : null,
    maxScore: (typeof maxScore === 'number' && isFinite(maxScore)) ? maxScore : null,
    feedback: (typeof feedback === 'string') ? feedback : '',
    gradedBy: (typeof gradedBy === 'string') ? gradedBy : '',
    gradedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  return db.collection('examAttempts').doc(id).update(out);
}

// Release a graded attempt — creates the released examResults doc
// that the student dashboard will read. Every value is normalised
// so nothing `undefined` ever reaches Firestore.
function releaseExamAttempt(attemptId, studentId, keyStage, subject, examTitle, score, maxScore) {
  return db.collection('examResults').add({
    studentId: (typeof studentId === 'string') ? studentId : '',
    attemptId: (typeof attemptId === 'string') ? attemptId : '',
    subject:   (typeof subject   === 'string') ? subject   : '',
    examTitle: (typeof examTitle === 'string') ? examTitle : '',
    score:     (typeof score     === 'number' && isFinite(score))    ? score    : null,
    maxScore:  (typeof maxScore  === 'number' && isFinite(maxScore)) ? maxScore : null,
    keyStage:  (typeof keyStage  === 'string') ? keyStage  : '',
    released: true,
    releasedAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt:  firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getAttemptsForStudent(uid) {
  return db.collection('examAttempts').where('studentId', '==', uid).get();
}

function getAllExamAttempts() {
  return db.collection('examAttempts').get();
}

function getAttemptsForExam(examId) {
  return db.collection('examAttempts').where('examId', '==', examId).get();
}

// ---------------------------------------------------------
// SHARED UTILITIES
// ---------------------------------------------------------

function lmsToDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
}

function lmsFmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function lmsInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ---------------------------------------------------------
// TUTOR ACCOUNTS (PHASE 5)
// ---------------------------------------------------------

function tutorSlugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function isTutorSlugTaken(slug, ignoreUid) {
  return db.collection('tutorAccounts').where('slug', '==', slug).get()
    .then(function (snap) {
      if (!snap || snap.empty) return false;
      return snap.docs.some(function (d) { return d.id !== ignoreUid; });
    });
}

function createTutorAccount(uid, data) {
  return db.collection('tutorAccounts').doc(uid).set({
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    slug: data.slug || tutorSlugify(data.name),
    subjects: data.subjects || [],
    keyStages: data.keyStages || [],
    teaching: Array.isArray(data.teaching) ? data.teaching : [],
    role: 'tutor',
    status: data.status || 'Active',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getTutorAccount(uid) {
  return db.collection('tutorAccounts').doc(uid).get();
}

function getTutorBySlug(slug) {
  // Public slug lookup now goes through the `lookupTutorBySlug` Cloud
  // Function. Reason: Firestore rules keep tutorAccounts locked to
  // signed-in users, so an anonymous visitor to /tutor/{slug} would
  // always get permission-denied querying it directly. The function
  // runs server-side with the Admin SDK and returns a minimal payload.
  //
  // The return value is shaped like a Firestore QuerySnapshot so the
  // existing caller in tutor/login.html keeps working unchanged:
  //   snap.empty       → true | false
  //   snap.docs[0].id  → uid
  //   snap.docs[0].data() → { name, slug, status, email }
  const cleanSlug = String(slug == null ? '' : slug).trim().toLowerCase();
  if (!cleanSlug) {
    return Promise.resolve({ empty: true, docs: [] });
  }
  if (!firebase || !firebase.functions) {
    return Promise.reject(new Error('Firebase Functions SDK not loaded on this page.'));
  }
  const callable = firebase.functions().httpsCallable('lookupTutorBySlug');
  return callable({ slug: cleanSlug }).then(function (result) {
    const data = (result && result.data) || {};
    if (!data.found || !data.tutor) {
      return { empty: true, docs: [] };
    }
    const t = data.tutor;
    return {
      empty: false,
      docs: [{
        id: t.uid,
        data: function () {
          return {
            name:   t.name   || '',
            slug:   t.slug   || cleanSlug,
            status: t.status || 'Active',
            email:  t.email  || ''
          };
        }
      }]
    };
  });
}

function getAllTutorAccounts() {
  return db.collection('tutorAccounts').get();
}

function updateTutorAccount(uid, data) {
  return db.collection('tutorAccounts').doc(uid).update(data);
}

function deleteTutorAccount(uid) {
  return db.collection('tutorAccounts').doc(uid).delete();
}

function getStudentsForTutor(uid) {
  return db.collection('students').where('tutorId', '==', uid).get();
}

function assignStudentToTutor(studentUid, tutorUid, tutorName, tutorSlug) {
  return db.collection('students').doc(studentUid).update({
    tutorId: tutorUid || '',
    tutorName: tutorName || '',
    tutorSlug: tutorSlug || ''
  });
}

// ---------------------------------------------------------
// NOTES / MATERIALS (PHASE 6)
// ---------------------------------------------------------

function addNote(data) {
  return db.collection('notes').add({
    ...data,
    postedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateNote(id, data) { return db.collection('notes').doc(id).update(data); }
function deleteNote(id)       { return db.collection('notes').doc(id).delete(); }

function getNotesForKeyStage(keyStage) {
  return db.collection('notes').where('keyStage', '==', keyStage).get();
}

// ---------------------------------------------------------
// NOTIFICATIONS (PHASE 6)
// ---------------------------------------------------------

function addNotification(data) {
  return db.collection('notifications').add({
    ...data,
    postedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateNotification(id, data) { return db.collection('notifications').doc(id).update(data); }
function deleteNotification(id)       { return db.collection('notifications').doc(id).delete(); }

function getNotificationsForKeyStage(keyStage) {
  return db.collection('notifications').where('keyStage', '==', keyStage).get();
}

// ---------------------------------------------------------
// TIMETABLES (PHASE 6)
// ---------------------------------------------------------

function addTimetable(data) {
  return db.collection('timetables').add({
    ...data,
    postedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateTimetable(id, data) { return db.collection('timetables').doc(id).update(data); }
function deleteTimetable(id)       { return db.collection('timetables').doc(id).delete(); }

function getTimetablesForKeyStage(keyStage) {
  return db.collection('timetables').where('keyStage', '==', keyStage).get();
}

// ---------------------------------------------------------
// LIVE CLASSES (PHASE 7 — Cloudflare RealtimeKit)
// ---------------------------------------------------------

var REALTIMEKIT_WORKER_URL = 'https://paisley-realtime-worker.manchamdevelopers.workers.dev';

function makeJitsiRoom(title) {
  const base = tutorSlugify(title) || 'class';
  return 'paisley-' + base + '-' + Math.random().toString(36).slice(2, 8);
}

function createRealtimeKitMeeting(title) {
  // The worker now requires a signed-in staff user (Firebase ID token).
  var cu = firebase.auth().currentUser;
  if (!cu) return Promise.reject(new Error('Please sign in again to start a live class.'));
  return cu.getIdToken().then(function (idToken) {
    return fetch(REALTIMEKIT_WORKER_URL + '/api/create-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify({ title: title || 'Live Class' })
    });
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        throw new Error('Worker /api/create-meeting failed: ' + res.status + ' ' + t);
      });
    }
    return res.json();
  }).then(function (data) {
    if (!data || !data.meetingId) {
      throw new Error('Worker did not return a meetingId.');
    }
    return data.meetingId;
  });
}

function addLiveClass(data) {
  return db.collection('liveClasses').add({
    title: data.title || '',
    subject: data.subject || '',
    keyStage: data.keyStage || '',
    startAt: data.startAt || null,
    duration: data.duration || 60,
    hostId: data.hostId || '',
    hostName: data.hostName || '',
    hostRole: data.hostRole || 'admin',
    tutorId: data.tutorId || '',
    notes: data.notes || '',
    status: 'Scheduled',
    meetingId: '',                    // filled in when the class starts
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateLiveClass(id, data) { return db.collection('liveClasses').doc(id).update(data); }
function deleteLiveClass(id)       { return db.collection('liveClasses').doc(id).delete(); }

function startLiveClass(id) {
  return db.collection('liveClasses').doc(id).get().then(function (doc) {
    if (!doc.exists) throw new Error('Live class not found.');
    const existing = doc.data() || {};
    if (existing.meetingId) {
      return db.collection('liveClasses').doc(id).update({
        status: 'Live',
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    return createRealtimeKitMeeting(existing.title || 'Live Class')
      .then(function (meetingId) {
        return db.collection('liveClasses').doc(id).update({
          status: 'Live',
          meetingId: meetingId,
          startedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
  });
}

function endLiveClass(id) {
  return db.collection('liveClasses').doc(id).update({
    status: 'Ended',
    endedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function () {
    return closeStaleSessionsForClass(id);
  });
}

function getLiveClassesForKeyStage(keyStage) {
  return db.collection('liveClasses').where('keyStage', '==', keyStage).get();
}

function watchLiveClassesForKeyStage(keyStage, cb, errCb) {
  return db.collection('liveClasses')
    .where('keyStage', '==', keyStage)
    .onSnapshot(function (snap) {
      cb(snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
    }, errCb || function (e) { console.error('liveClasses listener:', e); });
}

function lmsFmtDateTime(d) {
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// =========================================================
// PHASE B — GRADING GRANTS
// =========================================================

function gradingGrantId(taskType, taskId, tutorId) {
  const clean = (s) => String(s || '')
    .replace(/[\/\s]+/g, '_')
    .replace(/[^\w\-:]/g, '')
    .slice(0, 200);
  return clean(taskType) + '_' + clean(taskId) + '_' + clean(tutorId);
}

function grantGradingRight(taskType, taskId, tutorId, tutorName, grantedBy) {
  if (taskType !== 'homework' && taskType !== 'exam') {
    return Promise.reject(new Error('gradingGrantId: taskType must be "homework" or "exam".'));
  }
  if (!taskId) return Promise.reject(new Error('grantGradingRight: taskId is required.'));
  if (!tutorId) return Promise.reject(new Error('grantGradingRight: tutorId is required.'));

  const id = gradingGrantId(taskType, taskId, tutorId);
  return db.collection('gradingGrants').doc(id).set({
    taskType: taskType,
    taskId: taskId,
    tutorId: tutorId,
    tutorName: tutorName || '',
    grantedBy: grantedBy || '',
    grantedAt: firebase.firestore.FieldValue.serverTimestamp(),
    revoked: false
  }, { merge: true });
}

function revokeGradingRight(grantId, revokedBy) {
  return db.collection('gradingGrants').doc(grantId).update({
    revoked: true,
    revokedAt: firebase.firestore.FieldValue.serverTimestamp(),
    revokedBy: revokedBy || ''
  });
}

function reactivateGradingRight(grantId, reactivatedBy) {
  return db.collection('gradingGrants').doc(grantId).update({
    revoked: false,
    reactivatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reactivatedBy: reactivatedBy || ''
  });
}

function deleteGradingRight(grantId) {
  return db.collection('gradingGrants').doc(grantId).delete();
}

function getGrantsForTutor(tutorId) {
  return db.collection('gradingGrants').where('tutorId', '==', tutorId).get();
}

function getActiveGrantsForTutor(tutorId) {
  return db.collection('gradingGrants')
    .where('tutorId', '==', tutorId)
    .where('revoked', '==', false)
    .get();
}

function getGrantsForTask(taskType, taskId) {
  return db.collection('gradingGrants')
    .where('taskType', '==', taskType)
    .where('taskId', '==', taskId)
    .get();
}

function hasGradingRightForTask(taskType, taskId, tutorId) {
  const id = gradingGrantId(taskType, taskId, tutorId);
  return db.collection('gradingGrants').doc(id).get().then(function (doc) {
    if (!doc.exists) return false;
    const d = doc.data() || {};
    return d.revoked !== true && d.tutorId === tutorId;
  });
}

function watchGrantsForTutor(tutorId, cb, errCb) {
  return db.collection('gradingGrants')
    .where('tutorId', '==', tutorId)
    .onSnapshot(function (snap) {
      cb(snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
    }, errCb || function (e) { console.error('gradingGrants listener:', e); });
}

function watchGrantsForTask(taskType, taskId, cb, errCb) {
  return db.collection('gradingGrants')
    .where('taskType', '==', taskType)
    .where('taskId', '==', taskId)
    .onSnapshot(function (snap) {
      cb(snap.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
    }, errCb || function (e) { console.error('gradingGrants task listener:', e); });
}

// =========================================================
// EXAM INTEGRITY (Phase 8)
// =========================================================

function recordViolation(attemptId, type, durationMs, description) {
  if (!firebase || !firebase.functions) {
    return Promise.reject(new Error('Firebase Functions SDK not loaded on this page.'));
  }
  const callable = firebase.functions().httpsCallable('recordViolation');
  return callable({
    attemptId: attemptId,
    type: type,
    durationMs: durationMs || 0,
    description: description || ''
  }).then(function (result) {
    return result.data;
  });
}

// =========================================================
// ACTIVITIES — Wordwall-style engine (Phase 9)
// =========================================================

function addActivity(data) {
  return db.collection('activities').add({
    ...data,
    status: data.status || 'Draft',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateActivity(id, data) {
  return db.collection('activities').doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function deleteActivity(id) { return db.collection('activities').doc(id).delete(); }

function getActivity(id) { return db.collection('activities').doc(id).get(); }

function getActivitiesForKeyStage(keyStage) {
  return db.collection('activities')
    .where('keyStage', '==', keyStage)
    .where('status', '==', 'Published')
    .get();
}

function getActivitiesForOwner(ownerId) {
  return db.collection('activities').where('ownerId', '==', ownerId).get();
}

function getAllActivities() { return db.collection('activities').get(); }

function startActivityAttempt(data) {
  return db.collection('activityAttempts').add({
    ...data,
    status: 'In progress',
    startedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function finishActivityAttempt(id, data) {
  return db.collection('activityAttempts').doc(id).update({
    ...data,
    status: 'Completed',
    completedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function getAttemptsForActivity(activityId) {
  return db.collection('activityAttempts').where('activityId', '==', activityId).get();
}

function getActivityAttemptsForStudent(uid) {
  return db.collection('activityAttempts').where('studentId', '==', uid).get();
}

// =========================================================
// TIMETABLE ENTRIES — flat, one doc per session (new model)
// =========================================================

function addTimetableEntry(data) {
  return db.collection('timetableEntries').add({
    dayOfWeek: data.dayOfWeek || '',
    date: data.date || null,
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    subjectId: data.subjectId || '',
    subjectName: data.subjectName || '',
    classId: data.classId || '',
    keyStage: data.keyStage || '',
    tutorId: data.tutorId || null,
    tutorName: data.tutorName || null,
    room: data.room || '',
    notes: data.notes || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function updateTimetableEntry(id, data) {
  return db.collection('timetableEntries').doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function deleteTimetableEntry(id) { return db.collection('timetableEntries').doc(id).delete(); }

function getAllTimetableEntries() { return db.collection('timetableEntries').get(); }

function getTimetableEntriesForKeyStage(keyStage) {
  return db.collection('timetableEntries').where('keyStage', '==', keyStage).get();
}

var DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function groupTimetableEntriesByDay(entries) {
  const byDay = {};
  DAYS_OF_WEEK.forEach(d => { byDay[d] = []; });
  (entries || []).forEach(e => {
    const day = DAYS_OF_WEEK.includes(e.dayOfWeek) ? e.dayOfWeek : 'Monday';
    byDay[day].push(e);
  });
  DAYS_OF_WEEK.forEach(d => {
    byDay[d].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  });
  return byDay;
}

// =========================================================
// LIVE CLASS INTEGRITY (Phase — live class monitoring)
// ---------------------------------------------------------
// Sessions are 1 per (studentId, classId). findOpenSessionForStudent
// lets the client reuse an existing session instead of creating a
// duplicate every time the class doc updates.
//
// getEventsForSession deliberately does NOT use .orderBy() — that
// would require a composite index (sessionId + timestamp). Sorting
// happens client-side instead, which is fine for the small number
// of events a single session produces.
// =========================================================

function startLiveClassSession(data) {
  return db.collection('liveClassSessions').add({
    studentId: data.studentId,
    studentName: data.studentName || '',
    studentEmail: data.studentEmail || '',
    classId: data.classId,
    classTitle: data.classTitle || '',
    classOpenedAt: firebase.firestore.FieldValue.serverTimestamp(),
    classJoinedAt: null,
    classLeftAt: null,
    lastActivityAt: firebase.firestore.FieldValue.serverTimestamp(),
    totalDuration: 0,
    violationCount: 0
  });
}

function markLiveClassSessionJoined(sessionId) {
  return db.collection('liveClassSessions').doc(sessionId).update({
    classJoinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function markLiveClassSessionLeft(sessionId, totalDurationSeconds) {
  return db.collection('liveClassSessions').doc(sessionId).update({
    classLeftAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastActivityAt: firebase.firestore.FieldValue.serverTimestamp(),
    totalDuration: totalDurationSeconds || 0
  });
}

function touchLiveClassSession(sessionId) {
  return db.collection('liveClassSessions').doc(sessionId).update({
    lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function bumpLiveClassViolationCount(sessionId) {
  return db.collection('liveClassSessions').doc(sessionId).update({
    violationCount: firebase.firestore.FieldValue.increment(1)
  });
}

function recordLiveClassEvent(data) {
  return db.collection('liveClassIntegrityEvents').add({
    studentId: data.studentId,
    classId: data.classId,
    sessionId: data.sessionId,
    eventType: data.eventType,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    duration: data.duration || 0,
    page: data.page || (typeof location !== 'undefined' ? location.pathname : ''),
    destination: data.destination || null,
    metadata: data.metadata || {}
  });
}

function findOpenSessionForStudent(studentId, classId) {
  return db.collection('liveClassSessions')
    .where('studentId', '==', studentId)
    .where('classId', '==', classId)
    .get()
    .then(function (snap) {
      if (snap.empty) return null;
      const all = snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
      const open = all.filter(function (s) { return !s.classLeftAt; });
      if (open.length) {
        open.sort(function (a, b) {
          const av = (a.classOpenedAt && a.classOpenedAt.seconds) || 0;
          const bv = (b.classOpenedAt && b.classOpenedAt.seconds) || 0;
          return bv - av;
        });
        return open[0];
      }
      all.sort(function (a, b) {
        const av = (a.classOpenedAt && a.classOpenedAt.seconds) || 0;
        const bv = (b.classOpenedAt && b.classOpenedAt.seconds) || 0;
        return bv - av;
      });
      return all[0];
    });
}

function closeStaleSessionsForClass(classId) {
  return db.collection('liveClassSessions')
    .where('classId', '==', classId)
    .get()
    .then(function (snap) {
      const stale = snap.docs.filter(function (d) {
        const s = d.data();
        return !s.classLeftAt;
      });
      if (!stale.length) return;
      const batch = db.batch();
      stale.forEach(function (d) {
        const s = d.data();
        let duration = 0;
        if (s.classJoinedAt && s.classJoinedAt.seconds) {
          duration = Math.max(0, Math.round((Date.now() / 1000) - s.classJoinedAt.seconds));
        }
        batch.update(d.ref, {
          classLeftAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastActivityAt: firebase.firestore.FieldValue.serverTimestamp(),
          totalDuration: duration
        });
      });
      return batch.commit();
    });
}

function getSessionsForClass(classId) {
  return db.collection('liveClassSessions').where('classId', '==', classId).get();
}

function getEventsForSession(sessionId) {
  return db.collection('liveClassIntegrityEvents')
    .where('sessionId', '==', sessionId)
    .get()
    .then(function (snap) {
      const docs = snap.docs.slice().sort(function (a, b) {
        const av = (a.data().timestamp && a.data().timestamp.seconds) || 0;
        const bv = (b.data().timestamp && b.data().timestamp.seconds) || 0;
        return av - bv;
      });
      return { docs: docs };
    });
}

function getSessionsForTutorClasses(classIds) {
  if (!classIds || !classIds.length) return Promise.resolve([]);
  return db.collection('liveClassSessions')
    .where('classId', 'in', classIds.slice(0, 30))
    .get()
    .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

// =========================================================
// PARENT PORTAL
// =========================================================

function parentStudentLinkId(parentUid, studentUid) {
  return String(parentUid) + '_' + String(studentUid);
}

function getParentAccount(uid) { return db.collection('parentAccounts').doc(uid).get(); }

function getLinksForParent(parentUid) {
  return db.collection('parentStudentLinks').where('parentUid', '==', parentUid).get();
}

function getChildrenForParent(parentUid) {
  return getLinksForParent(parentUid).then(snap => {
    const studentIds = snap.docs.map(d => d.data().studentUid);
    return Promise.all(studentIds.map(uid =>
      getStudentProfile(uid).then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null)
    )).then(list => list.filter(Boolean));
  });
}

// =========================================================
// PERSONAL NOTIFICATIONS
// =========================================================

function getTicketsForStudent(uid) {
  return db.collection('tickets').where('studentId', '==', uid).get();
}

function getMyPersonalNotifications(uid, limit) {
  return db.collection('personalNotifications')
    .where('recipientId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(limit || 30)
    .get();
}

function watchMyPersonalNotifications(uid, cb, errCb) {
  return db.collection('personalNotifications')
    .where('recipientId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, errCb || (e => console.error('personalNotifications listener:', e)));
}

function markPersonalNotificationRead(id) {
  return db.collection('personalNotifications').doc(id).update({ read: true });
}

function getMyActiveAttemptForExam(examId) {
  const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
  if (!uid) return Promise.resolve(null);
  return db.collection('examAttempts')
    .where('studentId', '==', uid)
    .get()
    .then(function (snap) {
      const mine = snap.docs
        .map(function (d) { return { id: d.id, ...d.data() }; })
        .filter(function (a) { return a.examId === examId; });
      if (!mine.length) return null;
      const suspended = mine.find(function (a) {
        return a.integrity && a.integrity.status === 'suspended';
      });
      if (suspended) return suspended;
      const active = mine
        .filter(function (a) { return a.status === 'In progress'; })
        .sort(function (a, b) {
          const av = a.startedAt && a.startedAt.seconds ? a.startedAt.seconds : 0;
          const bv = b.startedAt && b.startedAt.seconds ? b.startedAt.seconds : 0;
          return bv - av;
        })[0];
      if (active) return active;
      return mine.sort(function (a, b) {
        const av = a.submittedAt && a.submittedAt.seconds ? a.submittedAt.seconds : 0;
        const bv = b.submittedAt && b.submittedAt.seconds ? b.submittedAt.seconds : 0;
        return bv - av;
      })[0];
    });
}

// =========================================================
// SUBJECT CATALOGUE, YEAR MODEL & SUBJECT-SCOPED TIMETABLES
// ---------------------------------------------------------
// The public site already defined which subjects exist at which Key
// Stage (subjects.html / enrolment.html) but nothing in the Firestore
// data did — students, tutors and timetable sessions each held free
// text. This single catalogue is now the one source of subject
// identity for all of them:
//
//   students.subjects      → [subjectId, ...]   (+ subjectNames for display)
//   tutorAccounts.subjects → [subjectId, ...]   (+ subjectNames for display)
//   timetableEntries.subjectId (+ subjectName kept for old records)
//
// Every reader goes through lmzSubjectKey(), which accepts EITHER an id
// or an old free-text name ("Mathematics (A-Level)", "maths") and returns
// the same canonical key, so records written before this upgrade keep
// working and nothing has to be migrated destructively.
// =========================================================

var LMZ_KEY_STAGE_YEARS = { 2: [3, 4, 5, 6], 3: [7, 8, 9], 4: [10, 11], 5: [12, 13],
  // CBC (Kenya) bands — numbers 21-24 never collide with the British Key Stages.
  21: [1, 2, 3], 22: [4, 5, 6], 23: [7, 8, 9], 24: [10, 11, 12],
  // TECH (Digital AI Literacy) — one programme, seven levels (AI Aware … AI Guru).
  31: [1, 2, 3, 4, 5, 6, 7] };

// CBC learning bands. The band name is stored in `keyStage` and the Grade in
// `year`, so the existing classroom / homework / exam machinery works unchanged.
// Deliberately NOT part of KEY_STAGES, so CBC never appears in online / remote flows.
var CBC_BANDS = [
  'CBC Lower Primary (Grades 1-3)',
  'CBC Upper Primary (Grades 4-6)',
  'CBC Junior School (Grades 7-9)',
  'CBC Senior School (Grades 10-12)'
];
function lmzIsCbcBand(ks) { return /^CBC\b/i.test(String(ks || '')); }

// TECH — Digital AI Literacy. Coaches are tutors who tick this discipline; the level plays the role of the Year.
// Not part of KEY_STAGES or CBC_BANDS, so it never leaks into online or tuition flows.
var TECH_BANDS = ['TECH Digital AI Literacy (Levels 1-7)'];
function lmzIsTechBand(ks) { return /^TECH\b/i.test(String(ks || '')); }

var LMZ_SUBJECTS = [
  { id: 'english',            name: 'English',            keyStages: [2, 3, 4, 5] },
  { id: 'mathematics',        name: 'Mathematics',        keyStages: [2, 3, 4, 5], aliases: ['maths', 'math'] },
  { id: 'science',            name: 'Science',            keyStages: [2, 3] },
  { id: 'computing',          name: 'Computing',          keyStages: [2, 3] },
  { id: 'physics',            name: 'Physics',            keyStages: [4, 5] },
  { id: 'chemistry',          name: 'Chemistry',          keyStages: [4, 5] },
  { id: 'biology',            name: 'Biology',            keyStages: [4, 5] },
  { id: 'computer-science',   name: 'Computer Science',   keyStages: [4] },
  { id: 'history',            name: 'History',            keyStages: [4] },
  { id: 'geography',          name: 'Geography',          keyStages: [4] },
  { id: 'business-studies',   name: 'Business Studies',   keyStages: [4] },
  { id: 'economics',          name: 'Economics',          keyStages: [4] },
  { id: 'accounting',         name: 'Accounting',         keyStages: [4] },
  { id: 'psychology',         name: 'Psychology',         keyStages: [5] },
  { id: 'sociology',          name: 'Sociology',          keyStages: [5] },
  { id: 'further-mathematics', name: 'Further Mathematics', keyStages: [5], aliases: ['further maths'] },

  // ---- CBC (tuition) subjects. Ids are prefixed `cbc-` and names start with "CBC"
  // so they can never be confused with the British subjects of the same name. ----
  // ---- TECH (Digital AI Literacy) subjects. Ids are prefixed `tech-`. ----
  { id: 'tech-ai-literacy',       name: 'TECH AI Literacy',               keyStages: [31] },
  { id: 'tech-prompting',         name: 'TECH Prompting and AI Tools',    keyStages: [31] },
  { id: 'tech-research-safety',   name: 'TECH Research, Ethics and Safety', keyStages: [31] },
  { id: 'tech-creative-ai',       name: 'TECH Creative AI',               keyStages: [31] },
  { id: 'tech-web-apps',          name: 'TECH Websites and Apps',         keyStages: [31] },
  { id: 'tech-ai-assistants',     name: 'TECH Building AI Assistants',    keyStages: [31] },
  { id: 'tech-data-automation',   name: 'TECH Data and Automation',       keyStages: [31] },
  { id: 'tech-projects',          name: 'TECH Capstone Projects',         keyStages: [31] },

  { id: 'cbc-english',            name: 'CBC English',                    keyStages: [21, 22, 23, 24] },
  { id: 'cbc-kiswahili',          name: 'CBC Kiswahili',                  keyStages: [21, 22, 23, 24] },
  { id: 'cbc-mathematics',        name: 'CBC Mathematics',                keyStages: [21, 22, 23, 24] },
  { id: 'cbc-environmental',      name: 'CBC Environmental Activities',   keyStages: [21] },
  { id: 'cbc-creative-arts',      name: 'CBC Creative Arts',              keyStages: [21, 22, 23] },
  { id: 'cbc-religious-edu',      name: 'CBC Religious Education',        keyStages: [21, 22, 23] },
  { id: 'cbc-science-tech',       name: 'CBC Science and Technology',     keyStages: [22] },
  { id: 'cbc-agri-nutrition',     name: 'CBC Agriculture and Nutrition',  keyStages: [22] },
  { id: 'cbc-social-studies',     name: 'CBC Social Studies',             keyStages: [22, 23] },
  { id: 'cbc-integrated-science', name: 'CBC Integrated Science',         keyStages: [23] },
  { id: 'cbc-pretechnical',       name: 'CBC Pre-Technical Studies',      keyStages: [23] },
  { id: 'cbc-agriculture',        name: 'CBC Agriculture',                keyStages: [23] },
  { id: 'cbc-business-studies',   name: 'CBC Business Studies',           keyStages: [23, 24] },
  { id: 'cbc-physics',            name: 'CBC Physics',                    keyStages: [24] },
  { id: 'cbc-chemistry',          name: 'CBC Chemistry',                  keyStages: [24] },
  { id: 'cbc-biology',            name: 'CBC Biology',                    keyStages: [24] },
  { id: 'cbc-computer-science',   name: 'CBC Computer Science',           keyStages: [24] },
  { id: 'cbc-history',            name: 'CBC History and Citizenship',    keyStages: [24] },
  { id: 'cbc-geography',          name: 'CBC Geography',                  keyStages: [24] }
];

function lmzKeyStageNumber(ks) {
  if (/^TECH\b/i.test(String(ks || ''))) return 31;
  var cbc = /^CBC\s+(Lower|Upper|Junior|Senior)/i.exec(String(ks || ''));
  if (cbc) return { lower: 21, upper: 22, junior: 23, senior: 24 }[cbc[1].toLowerCase()];
  var m = /Key Stage\s*(\d)/i.exec(String(ks || ''));
  return m ? Number(m[1]) : 0;
}

function lmzYearsForKeyStage(ks) {
  return (LMZ_KEY_STAGE_YEARS[lmzKeyStageNumber(ks)] || []).slice();
}

function lmzSubjectsForKeyStage(ks) {
  var n = lmzKeyStageNumber(ks);
  return LMZ_SUBJECTS.filter(function (s) { return s.keyStages.indexOf(n) !== -1; });
}

// Lower-case, strip "(A-Level)"/"(IGCSE)" style suffixes, collapse spaces.
function lmzNormSubjectText(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/\((a-level|igcse|as-level|as level|a level)\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

var _lmzSubjectLookup = null;
function lmzSubjectLookup() {
  if (_lmzSubjectLookup) return _lmzSubjectLookup;
  _lmzSubjectLookup = {};
  LMZ_SUBJECTS.forEach(function (s) {
    _lmzSubjectLookup[lmzNormSubjectText(s.id)] = s.id;
    _lmzSubjectLookup[lmzNormSubjectText(s.name)] = s.id;
    (s.aliases || []).forEach(function (a) { _lmzSubjectLookup[lmzNormSubjectText(a)] = s.id; });
  });
  return _lmzSubjectLookup;
}

// Canonical key for a subject id OR an old free-text subject name.
// Catalogue subjects return their catalogue id; anything else returns a
// slug of the text so unknown legacy subjects still compare consistently.
function lmzSubjectKey(v) {
  var norm = lmzNormSubjectText(v);
  if (!norm) return '';
  var hit = lmzSubjectLookup()[norm];
  return hit || norm.replace(/\s+/g, '-');
}

function lmzIsCatalogueSubject(key) {
  return LMZ_SUBJECTS.some(function (s) { return s.id === key; });
}

function lmzSubjectKeys(list) {
  var out = [];
  (Array.isArray(list) ? list : []).forEach(function (x) {
    var k = lmzSubjectKey(x);
    if (k && out.indexOf(k) === -1) out.push(k);
  });
  return out;
}

function lmzSubjectLabel(key) {
  for (var i = 0; i < LMZ_SUBJECTS.length; i++) {
    if (LMZ_SUBJECTS[i].id === key) return LMZ_SUBJECTS[i].name;
  }
  // Unknown legacy subject: prettify the slug ("art-and-design" → "Art And Design")
  return String(key || '').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function lmzSubjectLabels(list) {
  return lmzSubjectKeys(list).map(lmzSubjectLabel);
}

// What gets written to a profile: ids under `subjects`, names under
// `subjectNames` (the latter only exists so older code that printed
// `subjects` as text can still be given something readable).
function lmzSubjectWriteFields(list) {
  var keys = lmzSubjectKeys(list);
  return { subjects: keys, subjectNames: keys.map(lmzSubjectLabel) };
}

// =========================================================
// TUTOR TEACHING SCOPE  (exact Key Stage + subject + Years)
//
//   tutorAccounts.teaching = [ { keyStage, subjectId, years:[7,8,9] }, ... ]
//
// One entry per Key Stage + subject, listing the exact Years the tutor takes.
// A tutor sees ONLY those classrooms, resources and timetable sessions: KS3
// English never exposes KS4 English.
//
// `subjects` and `keyStages` on the tutor are still written, as the union of
// the entries, because the security rules and cloud functions read them.
//
// Tutors saved before this existed have no `teaching` field. They keep their old
// meaning (every ticked subject in every ticked Key Stage, all Years) until the
// Studio Desk next saves them.
// =========================================================
function lmzTeachingKeyStages() {
  return KEY_STAGES.concat(typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : [], typeof TECH_BANDS !== 'undefined' ? TECH_BANDS : []);
}

// Tidy raw entries: one per Key Stage + subject, Years limited to that stage's Years.
function lmzNormTeaching(list) {
  var order = lmzTeachingKeyStages(), byKey = {}, out = [];
  (Array.isArray(list) ? list : []).forEach(function (e) {
    if (!e) return;
    var ks = String(e.keyStage || ''), sid = lmzSubjectKey(e.subjectId);
    if (!ks || !sid || order.indexOf(ks) === -1) return;
    var valid = lmzYearsForKeyStage(ks);
    var yrs = (Array.isArray(e.years) ? e.years : []).map(Number).filter(function (y) { return valid.indexOf(y) !== -1; });
    var k = ks + '|' + sid;
    if (!byKey[k]) { byKey[k] = { keyStage: ks, subjectId: sid, years: [] }; out.push(byKey[k]); }
    yrs.forEach(function (y) { if (byKey[k].years.indexOf(y) === -1) byKey[k].years.push(y); });
  });
  out.forEach(function (e) { e.years.sort(function (a, b) { return a - b; }); });
  out.sort(function (a, b) {
    return (order.indexOf(a.keyStage) - order.indexOf(b.keyStage)) || lmzSubjectLabel(a.subjectId).localeCompare(lmzSubjectLabel(b.subjectId));
  });
  return out;
}

// What an old-style tutor (subjects[] + keyStages[]) effectively teaches, as entries.
function lmzLegacyTeaching(tutor) {
  var subs = lmzSubjectKeys(tutor && tutor.subjects), ks = (tutor && tutor.keyStages) || [], out = [];
  var stages = ks.length ? ks : lmzTeachingKeyStages();
  stages.forEach(function (k) {
    var offered = lmzSubjectsForKeyStage(k).map(function (s) { return s.id; });
    subs.forEach(function (sid) { if (offered.indexOf(sid) !== -1) out.push({ keyStage: k, subjectId: sid, years: [] }); });
  });
  return lmzNormTeaching(out);
}

// The tutor's entries. An empty `years` list means every Year of that Key Stage.
function lmzTutorTeaching(tutor) {
  if (tutor && Array.isArray(tutor.teaching)) return lmzNormTeaching(tutor.teaching);
  return lmzLegacyTeaching(tutor);
}

// Does this tutor teach this subject in this Key Stage (and Year, when given)?
function lmzTutorCovers(tutor, subjectId, keyStage, year) {
  if (!tutor) return false;
  var sid = lmzSubjectKey(subjectId);
  if (!sid) return false;
  if (!Array.isArray(tutor.teaching)) {
    if (lmzSubjectKeys(tutor.subjects).indexOf(sid) === -1) return false;
    var ks = tutor.keyStages || [];
    return !ks.length || ks.indexOf(keyStage) !== -1;
  }
  var noYear = year == null || year === '';
  return lmzNormTeaching(tutor.teaching).some(function (e) {
    if (e.subjectId !== sid || e.keyStage !== keyStage) return false;
    return noYear || !e.years.length || e.years.indexOf(Number(year)) !== -1;
  });
}

function lmzTutorSubjectKeys(tutor) {
  if (tutor && Array.isArray(tutor.teaching)) {
    var out = [];
    lmzNormTeaching(tutor.teaching).forEach(function (e) { if (out.indexOf(e.subjectId) === -1) out.push(e.subjectId); });
    return out;
  }
  return lmzSubjectKeys(tutor && tutor.subjects);
}

function lmzTutorKeyStages(tutor) {
  if (tutor && Array.isArray(tutor.teaching)) {
    var out = [];
    lmzNormTeaching(tutor.teaching).forEach(function (e) { if (out.indexOf(e.keyStage) === -1) out.push(e.keyStage); });
    return out;
  }
  return ((tutor && tutor.keyStages) || []).slice();
}

// Everything to write on a tutor profile for a set of entries.
function lmzTeachingWriteFields(list) {
  var teaching = lmzNormTeaching(list), ks = [], subs = [];
  teaching.forEach(function (e) {
    if (ks.indexOf(e.keyStage) === -1) ks.push(e.keyStage);
    if (subs.indexOf(e.subjectId) === -1) subs.push(e.subjectId);
  });
  return { teaching: teaching, keyStages: ks, subjects: subs, subjectNames: subs.map(lmzSubjectLabel) };
}

// "Year 7", "Years 7-9", "Years 7, 9", "Grades 4-6"
function lmzYearsLabel(keyStage, years) {
  var all = lmzYearsForKeyStage(keyStage), ys = (years && years.length ? years : all).slice().sort(function (a, b) { return a - b; });
  var word = lmzIsCbcBand(keyStage) ? 'Grade' : (lmzIsTechBand(keyStage) ? 'Level' : 'Year');
  if (!ys.length) return '';
  if (ys.length === 1) return word + ' ' + ys[0];
  var runs = [], start = ys[0], prev = ys[0];
  for (var i = 1; i <= ys.length; i++) {
    if (ys[i] === prev + 1) { prev = ys[i]; continue; }
    runs.push(start === prev ? String(start) : (prev - start === 1 ? start + ', ' + prev : start + '\u2013' + prev));
    start = prev = ys[i];
  }
  return word + 's ' + runs.join(', ');
}

// "Key Stage 3", "KS4 IGCSE" style short names.
function lmzKeyStageShort(ks) {
  var s = String(ks || '');
  if (lmzIsTechBand(s)) return 'TECH';
  if (lmzIsCbcBand(s)) return s.replace(/^CBC\s+/i, '').replace(/\s*\(.*/, '');
  return s.replace(/\s*\(.*/, '');
}

// Plain-text lines for the tutor's own sidebar / lists: "English \u00b7 Key Stage 3 \u00b7 Years 7\u20139"
function lmzTeachingLines(tutor) {
  return lmzTutorTeaching(tutor).map(function (e) {
    return lmzSubjectLabel(e.subjectId) + ' \u00b7 ' + lmzKeyStageShort(e.keyStage) + ' \u00b7 ' + lmzYearsLabel(e.keyStage, e.years);
  });
}

function lmzEntrySubjectKey(entry) {
  return lmzSubjectKey((entry && (entry.subjectId || entry.subjectName)) || '');
}

function lmzFilterEntriesBySubjectKeys(entries, keys) {
  var set = {};
  (keys || []).forEach(function (k) { set[k] = true; });
  return (entries || []).filter(function (e) { return set[lmzEntrySubjectKey(e)] === true; });
}

// ---- Guardians (structured; replaces reading the joined string) ----
function lmzGuardiansOf(student) {
  var s = student || {};
  if (Array.isArray(s.guardians) && s.guardians.length) {
    return s.guardians.filter(function (g) { return g && (g.email || g.name || g.phone); });
  }
  if (s.guardianEmail || s.guardianName || s.guardianPhone) {
    return [{ name: s.guardianName || '', email: s.guardianEmail || '', phone: s.guardianPhone || '' }];
  }
  return [];
}

// ---- Timetable reads ---------------------------------------
// Firestore security rules cannot filter a collection query, so these
// always ask for ONE subject at a time (equality on subjectId). The
// rules (firestore.rules → timetableEntries) then confirm that subject
// really belongs to the signed-in student / tutor / parent.

function _lmzEntryQueries(keyStage, subjectKeys) {
  var base = db.collection('timetableEntries');
  if (keyStage) base = base.where('keyStage', '==', keyStage);
  if (!subjectKeys) return [base];
  return subjectKeys.map(function (k) { return base.where('subjectId', '==', k); });
}

function _lmzSnapToEntries(snap) {
  return snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
}

function _lmzFlatten(buckets) {
  var seen = {}, out = [];
  buckets.forEach(function (list) {
    (list || []).forEach(function (e) { if (!seen[e.id]) { seen[e.id] = true; out.push(e); } });
  });
  return out;
}

// Students (and a parent viewing one child). A student with no subjects
// saved yet (created before this upgrade) keeps seeing their whole Key
// Stage until the Studio Desk records their subjects.
function lmzStudentEntryScope(student) {
  var keys = lmzSubjectKeys(student && student.subjects);
  return { keyStage: (student && student.keyStage) || '', subjectKeys: keys.length ? keys : null, legacyAllSubjects: !keys.length };
}

function getTimetableEntriesForStudent(student) {
  var scope = lmzStudentEntryScope(student);
  if (!scope.keyStage) return Promise.resolve([]);
  return Promise.all(_lmzEntryQueries(scope.keyStage, scope.subjectKeys).map(function (q) {
    return q.get().then(_lmzSnapToEntries);
  })).then(_lmzFlatten);
}

function watchTimetableEntriesForStudent(student, cb, errCb) {
  var scope = lmzStudentEntryScope(student);
  if (!scope.keyStage) { cb([]); return function () {}; }
  var queries = _lmzEntryQueries(scope.keyStage, scope.subjectKeys);
  var buckets = queries.map(function () { return []; });
  var unsubs = queries.map(function (q, i) {
    return q.onSnapshot(function (snap) {
      buckets[i] = _lmzSnapToEntries(snap);
      cb(_lmzFlatten(buckets));
    }, errCb || function (e) { console.error('timetableEntries listener:', e); });
  });
  return function () { unsubs.forEach(function (u) { u(); }); };
}

// Tutors: only their assigned subjects — never the whole timetable. No
// assigned subjects means an empty list, not everything.
function watchTimetableEntriesForTutor(tutor, cb, errCb) {
  var keys = lmzTutorSubjectKeys(tutor);
  if (!keys.length) { cb([]); return function () {}; }
  var queries = _lmzEntryQueries('', keys);
  var buckets = queries.map(function () { return []; });
  var unsubs = queries.map(function (q, i) {
    return q.onSnapshot(function (snap) {
      buckets[i] = _lmzSnapToEntries(snap);
      // Only the exact Key Stage + subject pairs this tutor was given (KS3 English never shows KS4 English).
      cb(_lmzFlatten(buckets).filter(function (e) { return lmzTutorCovers(tutor, lmzEntrySubjectKey(e), e.keyStage); }));
    }, errCb || function (e) { console.error('timetableEntries listener:', e); });
  });
  return function () { unsubs.forEach(function (u) { u(); }); };
}

// ---- Room / meeting-link display ---------------------------
// Students, parents and tutors see JOIN for a meeting URL and plain
// text for an ordinary room name. The admin form still stores whatever
// was typed, and the admin grid still shows it raw.
function lmzMeetingUrl(room) {
  var r = String(room == null ? '' : room).trim();
  if (!r) return '';
  if (/^https?:\/\/\S+$/i.test(r)) return r;
  if (/^(meet\.google\.com|([\w-]+\.)*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/\S*$/i.test(r)) return 'https://' + r;
  return '';
}

function lmzRoomHtml(room) {
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var url = lmzMeetingUrl(room);
  if (url) {
    lmzInjectJoinStyle();
    return '<a class="lmz-join-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-video" aria-hidden="true"></i> JOIN</a>';
  }
  return esc(String(room || '').trim() || '—');
}

// Parents must NOT get a clickable join link. If the room is a meeting URL
// we show plain text only; ordinary room names are shown as-is.
function lmzRoomHtmlNoJoin(room) {
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  if (lmzMeetingUrl(room)) return '<span title="Online class - students join from their own portal">Online class</span>';
  return esc(String(room || '').trim() || '\u2014');
}

function lmzInjectJoinStyle() {
  if (typeof document === 'undefined' || document.getElementById('lmz-join-style')) return;
  var st = document.createElement('style');
  st.id = 'lmz-join-style';
  st.textContent =
    '.lmz-join-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .7rem;border-radius:8px;' +
    'background:var(--brand-deep,#245F5A);color:#fff !important;font-weight:800;font-size:.72rem;letter-spacing:.03em;' +
    'text-decoration:none;white-space:nowrap}' +
    '.lmz-join-btn:hover{background:var(--brand,#55BFB3)}';
  document.head.appendChild(st);
}

// ---- Admin ↔ parent private conversations -------------------
// parentConversations/{parentUid}_{studentUid}            (one thread per parent+child)
//   └ messages/{id}  { senderUid, senderRole, senderName, text, read, createdAt }
// Same id format as parentStudentLinks, so the security rules can prove
// a parent really is linked to the child the thread is about. Students
// have no rule that matches these paths, so the database refuses them.

function parentConversationId(parentUid, studentUid) {
  return parentStudentLinkId(parentUid, studentUid);
}

function sendParentMessage(ctx, text) {
  // ctx: { parentUid, studentUid, senderUid, senderRole ('admin'|'parent'), senderName,
  //        parentName, studentName, keyStage, year }
  var body = String(text || '').trim();
  if (!body) return Promise.reject(new Error('Write a message first.'));
  if (body.length > 4000) return Promise.reject(new Error('That message is too long (4000 characters max).'));
  var cid = parentConversationId(ctx.parentUid, ctx.studentUid);
  var convRef = db.collection('parentConversations').doc(cid);
  var msgRef = convRef.collection('messages').doc();
  var fromAdmin = ctx.senderRole === 'admin';
  var batch = db.batch();
  batch.set(convRef, {
    parentUid: ctx.parentUid,
    studentUid: ctx.studentUid,
    parentName: ctx.parentName || '',
    studentName: ctx.studentName || '',
    keyStage: ctx.keyStage || '',
    year: (typeof ctx.year === 'number') ? ctx.year : null,
    lastMessage: body.slice(0, 140),
    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSenderRole: ctx.senderRole,
    unreadForAdmin: !fromAdmin,
    unreadForParent: fromAdmin
  }, { merge: true });
  batch.set(msgRef, {
    conversationId: cid,
    parentUid: ctx.parentUid,
    studentUid: ctx.studentUid,
    adminUid: fromAdmin ? ctx.senderUid : null,
    senderUid: ctx.senderUid,
    senderRole: ctx.senderRole,
    senderName: ctx.senderName || '',
    text: body,
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return batch.commit();
}

function watchParentMessages(parentUid, studentUid, cb, errCb) {
  return db.collection('parentConversations').doc(parentConversationId(parentUid, studentUid))
    .collection('messages')
    .onSnapshot(function (snap) {
      var list = snap.docs.map(function (d) { return { id: d.id, ...d.data() }; });
      list.sort(function (a, b) {
        var av = (a.createdAt && a.createdAt.seconds) || Number.MAX_SAFE_INTEGER; // pending server timestamp sorts last
        var bv = (b.createdAt && b.createdAt.seconds) || Number.MAX_SAFE_INTEGER;
        return av - bv;
      });
      cb(list);
    }, errCb || function (e) { console.error('parent messages listener:', e); });
}

// Recipient marks the other side's messages as read.
function markParentThreadRead(parentUid, studentUid, readerRole, messages) {
  var cid = parentConversationId(parentUid, studentUid);
  var convRef = db.collection('parentConversations').doc(cid);
  var otherRole = readerRole === 'admin' ? 'parent' : 'admin';
  var unread = (messages || []).filter(function (m) { return m.senderRole === otherRole && m.read !== true; });
  if (!unread.length) return Promise.resolve();
  var batch = db.batch();
  unread.forEach(function (m) { batch.update(convRef.collection('messages').doc(m.id), { read: true }); });
  var flag = {};
  flag[readerRole === 'admin' ? 'unreadForAdmin' : 'unreadForParent'] = false;
  batch.update(convRef, flag);
  return batch.commit();
}

function getParentConversationsForParent(parentUid) {
  return db.collection('parentConversations').where('parentUid', '==', parentUid).get();
}

// =========================================================
// PASSWORD VISIBILITY TOGGLE (eye icon)
// ---------------------------------------------------------
// Every <input type="password"> in any page that loads this file —
// including ones rendered later into modals — gets a show/hide button.
// The button is type="button" so it never submits a form, and the input
// keeps its id/name/handlers untouched (it is only wrapped).
// =========================================================
(function () {
  if (typeof document === 'undefined' || window.__lmzPwToggleInstalled) return;
  window.__lmzPwToggleInstalled = true;

  function injectStyle() {
    if (document.getElementById('lmz-pw-style')) return;
    var st = document.createElement('style');
    st.id = 'lmz-pw-style';
    st.textContent =
      '.lmz-pw-wrap{position:relative;display:block;width:100%;flex:1 1 auto;min-width:0}' +
      '.lmz-pw-wrap>input{padding-right:2.6rem !important}' +
      '.lmz-pw-toggle{position:absolute;top:50%;right:.5rem;transform:translateY(-50%);background:none;border:0;' +
      'padding:.35rem .45rem;cursor:pointer;color:var(--muted,#5A6E6A);font-size:.95rem;line-height:1;border-radius:6px}' +
      '.lmz-pw-toggle:hover{color:var(--brand-deep,#245F5A)}' +
      '.lmz-pw-toggle:focus-visible{outline:2px solid var(--brand,#55BFB3);outline-offset:1px}' +
      // Pages that style every <i> inside a field as an absolutely-positioned left icon
      // (admin login) must not move the eye icon.
      '.lmz-pw-toggle i{position:static !important;transform:none !important;left:auto !important;top:auto !important;color:inherit !important;pointer-events:none}';
    document.head.appendChild(st);
  }

  function enhance(input) {
    if (!input || input.dataset.lmzPw === '1' || !input.parentNode) return;
    input.dataset.lmzPw = '1';
    var wrap = document.createElement('span');
    wrap.className = 'lmz-pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lmz-pw-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
    btn.addEventListener('click', function () {
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      btn.firstChild.className = reveal ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
    wrap.appendChild(btn);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    var list = root.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  function start() {
    injectStyle();
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// =========================================================
// UNIFIED NOTIFICATION BELL + NAV BADGES
// ---------------------------------------------------------
// mountNotificationBell(containerEl, uid, role, opts)
//   containerEl  element that will hold the bell (its content is replaced)
//   uid          the signed-in user's uid (admin, tutor, student or parent)
//   role         'admin' | 'tutor' | 'student' | 'parent'
//   opts.navBadges  { homework:'#navHw', exams:'#navEx', ... }  selector or element
//                   of the .nav-badge span for each category; set live and
//                   cleared when that nav item is opened
//   opts.navigate   function(category) called when a notification is clicked
// Returns { unsubscribe, markCategoryRead(category) }.
// Everything comes from personalNotifications (recipientId == uid), live.
// =========================================================
function lmzNotifCategory(n) {
  var t = String((n && n.type) || '').toLowerCase();
  var ent = String((n && n.relatedEntity) || '').toLowerCase();
  if (ent === 'unattendedreport' || t === 'unattended_report' || t.indexOf('notice') === 0 || t === 'graded') return 'notices';
  if (ent === 'assignment' || t.indexOf('homework') === 0) return 'homework';
  if (ent === 'exam' || t.indexOf('exam') === 0) return 'exams';
  if (t.indexOf('ticket') !== -1) return 'tickets';
  if (t.indexOf('message') !== -1) return 'messages';
  if (t.indexOf('lesson') !== -1 || t.indexOf('classroom') !== -1) return 'classroom';
  return 'other';
}

function lmzInjectBellStyle() {
  if (document.getElementById('lmz-bell-style')) return;
  var st = document.createElement('style');
  st.id = 'lmz-bell-style';
  st.textContent = [
    '.lmz-bell{position:relative;display:inline-block}',
    '.lmz-bell-btn{position:relative;width:38px;height:38px;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.1));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:.95rem}',
    '.lmz-bell-btn:hover{border-color:var(--brand,#55BFB3)}',
    '.lmz-bell-btn .ping{position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:var(--gold,#F5C842);border:2px solid var(--paper,#F1F9F7);display:none}',
    '.lmz-bell-btn.has .ping{display:block}',
    '.lmz-bell-count{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:var(--error,#E74C3C);color:#fff;font-size:.62rem;font-weight:800;display:none;align-items:center;justify-content:center;font-family:inherit}',
    '.lmz-bell-btn.has .lmz-bell-count{display:inline-flex}',
    '.lmz-bell-menu{position:absolute;right:0;top:46px;width:340px;max-width:92vw;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;box-shadow:0 12px 36px rgba(38,51,49,.18);z-index:250;display:none;overflow:hidden;text-align:left;font-family:inherit;color:var(--ink,#263331)}',
    '.lmz-bell-menu.open{display:block}',
    '.lmz-bell-head{display:flex;align-items:center;justify-content:space-between;padding:.7rem .9rem;background:var(--sage,#E5F2EF);font-weight:800;font-size:.86rem;color:var(--brand-deep,#245F5A)}',
    '.lmz-bell-head button{border:none;background:none;color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:700;font-size:.74rem;cursor:pointer;text-decoration:underline}',
    '.lmz-bell-list{max-height:380px;overflow-y:auto}',
    '.lmz-bell-item{display:flex;gap:.6rem;padding:.65rem .9rem;border-top:1px solid var(--line,rgba(38,51,49,.06));cursor:pointer}',
    '.lmz-bell-item:hover{background:var(--paper,#F1F9F7)}',
    '.lmz-bell-item.unread{background:rgba(85,191,179,.08)}',
    '.lmz-bell-item .ic{width:30px;height:30px;border-radius:9px;background:rgba(85,191,179,.14);color:var(--brand-deep,#245F5A);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.8rem}',
    '.lmz-bell-item b{display:block;font-size:.8rem}',
    '.lmz-bell-item span.m{display:block;font-size:.76rem;color:var(--muted,#5A6E6A);line-height:1.4}',
    '.lmz-bell-item small{display:block;font-size:.68rem;color:var(--muted,#5A6E6A);margin-top:.15rem}',
    '.lmz-bell-empty{padding:1.4rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.82rem}'
  ].join('\n');
  document.head.appendChild(st);
}

function mountNotificationBell(containerEl, uid, role, opts) {
  opts = opts || {};
  if (!containerEl || !uid) return { unsubscribe: function () {}, markCategoryRead: function () {} };
  lmzInjectBellStyle();
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICONS = { homework: 'fa-book-open', exams: 'fa-file-pen', notices: 'fa-bullhorn', tickets: 'fa-headset', messages: 'fa-envelope', classroom: 'fa-chalkboard', other: 'fa-bell' };

  containerEl.innerHTML =
    '<div class="lmz-bell"><button type="button" class="icon-btn lmz-bell-btn" title="Notifications" aria-label="Notifications" aria-haspopup="true">' +
    '<i class="fas fa-bell" aria-hidden="true"></i><span class="ping" aria-hidden="true"></span><span class="lmz-bell-count" aria-live="polite">0</span></button>' +
    '<div class="lmz-bell-menu" role="menu"><div class="lmz-bell-head"><span>Notifications</span><button type="button" data-a="all">Mark all read</button></div><div class="lmz-bell-list"></div></div></div>';
  var btn = containerEl.querySelector('.lmz-bell-btn'), menu = containerEl.querySelector('.lmz-bell-menu');
  var listEl = containerEl.querySelector('.lmz-bell-list'), countEl = containerEl.querySelector('.lmz-bell-count');
  var items = [], unsub = null;

  function badgeEl(sel) { return typeof sel === 'string' ? document.querySelector(sel) : sel; }
  function paint() {
    var unread = items.filter(function (n) { return !n.read; });
    countEl.textContent = unread.length > 99 ? '99+' : String(unread.length);
    btn.classList.toggle('has', unread.length > 0);
    var recent = items.slice(0, 15);
    listEl.innerHTML = recent.length ? recent.map(function (n, i) {
      var cat = lmzNotifCategory(n), d = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate() : null;
      return '<div class="lmz-bell-item' + (n.read ? '' : ' unread') + '" data-i="' + i + '" role="menuitem" tabindex="0"><div class="ic"><i class="fas ' + (ICONS[cat] || ICONS.other) + '"></i></div><div><b>' + esc(n.title || 'Notification') + '</b><span class="m">' + esc(n.message || '') + '</span>' +
        (d ? '<small>' + esc(d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</small>' : '') + '</div></div>';
    }).join('') : '<div class="lmz-bell-empty"><i class="fas fa-bell-slash"></i><br>You are all caught up.</div>';
    // nav badges, per category
    var nb = opts.navBadges || {};
    Object.keys(nb).forEach(function (cat) {
      var el = badgeEl(nb[cat]); if (!el) return;
      var c = unread.filter(function (n) { return lmzNotifCategory(n) === cat; }).length;
      el.textContent = String(c);
      if (c) { el.style.display = ''; if (window.getComputedStyle(el).display === 'none') el.style.display = 'inline-flex'; } else el.style.display = 'none';
    });
  }

  function onSnap(snap) {
    items = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    items.sort(function (a, b) { var x = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now(); var y = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now(); return y - x; });
    paint();
    if (typeof opts.onChange === 'function') { try { opts.onChange(items); } catch (e) { console.warn('bell onChange:', e); } }
  }
  function subscribe(withOrder) {
    var q = db.collection('personalNotifications').where('recipientId', '==', uid);
    if (withOrder) q = q.orderBy('createdAt', 'desc');
    unsub = q.limit(60).onSnapshot(onSnap, function (e) {
      console.error('notification bell:', e);
      // Missing composite index: fall back to an unordered query (sorted here instead).
      if (withOrder) { try { unsub(); } catch (x) { /* ignore */ } subscribe(false); }
    });
  }
  subscribe(true);

  function markRead(list) {
    var targets = list.filter(function (n) { return !n.read; });
    if (!targets.length) return Promise.resolve();
    var batch = db.batch();
    targets.slice(0, 400).forEach(function (n) { batch.update(db.collection('personalNotifications').doc(n.id), { read: true }); });
    return batch.commit().catch(function (e) { console.error('mark read:', e); });
  }
  function markCategoryRead(cat) { return markRead(items.filter(function (n) { return lmzNotifCategory(n) === cat; })); }
  // Mark every notification about one work item (its id is the last part of relatedEntityId) as read.
  // kinds (optional): only those types, e.g. ['homework_assigned','exam_posted'] for "new work" alerts.
  function markEntityRead(itemId, kinds) {
    return markRead(items.filter(function (n) {
      if (String(n.relatedEntityId || '').split('/').pop() !== String(itemId)) return false;
      return !kinds || kinds.indexOf(n.type) !== -1;
    }));
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', function (e) { if (!containerEl.contains(e.target)) menu.classList.remove('open'); });
  containerEl.querySelector('[data-a="all"]').addEventListener('click', function () { markRead(items); });
  listEl.addEventListener('click', function (e) {
    var row = e.target.closest('.lmz-bell-item'); if (!row) return;
    var n = items[Number(row.dataset.i)]; if (!n) return;
    markRead([n]);
    menu.classList.remove('open');
    if (opts.navigate) opts.navigate(lmzNotifCategory(n), n);
  });
  // Opening a nav item clears that category.
  var nb2 = opts.navBadges || {};
  Object.keys(nb2).forEach(function (cat) {
    var el = badgeEl(nb2[cat]); var nav = el && el.closest ? el.closest('.nav-item') : null;
    if (nav) nav.addEventListener('click', function () { markCategoryRead(cat); });
  });

  return { unsubscribe: function () { if (unsub) unsub(); }, markCategoryRead: markCategoryRead, markEntityRead: markEntityRead, getItems: function () { return items; } };
}

// Notices addressed to one student or parent (unattended work reports, graded work, reminders).
function watchMyStudentNotices(uid, cb, errCb) {
  return db.collection('studentNotices').where('recipientId', '==', uid).onSnapshot(function (snap) {
    var rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    rows.sort(function (a, b) { return (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0); });
    cb(rows);
  }, errCb || function (e) { console.error('studentNotices listener:', e); });
}