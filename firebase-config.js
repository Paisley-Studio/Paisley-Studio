/* =========================================================
   FIREBASE CONFIG — Paisley Studio
   -----------------------------------------------------------
   This file initialises Firebase and creates a shared `db`
   object. Every page that needs to save or read data must
   load this file BEFORE any code that calls saveEnrolment(),
   saveTutorApplication(), saveMessage(), or saveNewsletterSignup().

   Required script tag order on every form page:

     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
     <script src="firebase-config.js"></script>
     <script src="firestore-helpers.js"></script>

   That's it — no build step, no npm, just static files.

   NOTE ON `var` vs `const`:
   `firebaseConfig` and `db` are declared with `var`, not `const`,
   on purpose. If any page loads this file twice, or if another
   included script declares the same top-level name, `const` would
   throw "Identifier 'X' has already been declared" which aborts
   the entire file and leaves `db` undefined. `var` tolerates the
   duplicate declaration without aborting, and `firebase.initializeApp`
   is idempotent enough that a second call is harmless.
========================================================= */

var firebaseConfig = {
  apiKey: "AIzaSyAWoYsa1mwAi6guBU8LuDi2fN5hTj5AXkw",
  authDomain: "paisley-89c77.firebaseapp.com",
  projectId: "paisley-89c77",
  storageBucket: "paisley-89c77.firebasestorage.app",
  messagingSenderId: "868570828182",
  appId: "1:868570828182:web:30569aef997646d902a1b7",
  measurementId: "G-ENF7YHKMDY"
};

// Initialise Firebase once, reuse everywhere.
// Guarded so a second load of this file doesn't throw
// "Firebase App named '[DEFAULT]' already exists".
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Shared Firestore handle — every helper uses this
var db = firebase.firestore();