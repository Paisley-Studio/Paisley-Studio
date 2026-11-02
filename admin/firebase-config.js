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
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyAWoYsa1mwAi6guBU8LuDi2fN5hTj5AXkw",
  authDomain: "paisley-89c77.firebaseapp.com",
  projectId: "paisley-89c77",
  storageBucket: "paisley-89c77.firebasestorage.app",
  messagingSenderId: "868570828182",
  appId: "1:868570828182:web:30569aef997646d902a1b7",
  measurementId: "G-ENF7YHKMDY"
};

// Initialise Firebase once, reuse everywhere
firebase.initializeApp(firebaseConfig);

// Shared Firestore handle — every helper uses this
const db = firebase.firestore();