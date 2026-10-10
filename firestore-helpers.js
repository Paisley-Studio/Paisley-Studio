/* =========================================================
   FIRESTORE HELPERS — Paisley Studio
   -----------------------------------------------------------
   Load AFTER firebase-config.js on every page with a form.

   Each function returns a Promise, so you can chain
   .then() / .catch() the same way the FormSubmit fetch()
   calls already work.

   Collections written to:
     • enrolments  — from enrolment.html
     • tutors      — from teach-with-us.html
     • messages    — from index.html contact form
     • newsletter  — from the footer form on every page

   Every new record gets:
     • status: "New"  (or "Active" for newsletter)
     • createdAt: server timestamp (from Firebase, not the browser)
========================================================= */


// ---- Students / parents: enrolment.html -------------------
function saveEnrolment(data) {
  return db.collection('enrolments').add({
    ...data,
    status: 'New',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}


// ---- Tutors: teach-with-us.html ----------------------------
function saveTutorApplication(data) {
  return db.collection('tutors').add({
    ...data,
    status: 'New',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}


// ---- Contact form: index.html ------------------------------
function saveMessage(data) {
  return db.collection('messages').add({
    ...data,
    status: 'New',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}


// ---- Newsletter: footer form on every page -----------------
function saveNewsletterSignup(email, source) {
  return db.collection('newsletter').add({
    email: email,
    source: source || 'Footer',
    status: 'Active',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}