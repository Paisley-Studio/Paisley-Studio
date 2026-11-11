/* =========================================================
   Paisley Tech Studio button for Paisley students.
   A student the Studio Desk admitted to Tech Studio (admitToTechStudio)
   has techStudents/{uid} with status Active on the same login. This adds
   "Paisley Tech Studio" to the sidebar of their normal portal (online,
   remote, CBC tuition), so they open it without signing in again.
   Load after the Firebase SDKs and firebase-config.js:
     <script src="/js/ui/tech-entry.js?v=1"></script>
   ========================================================= */
(function (g) {
  'use strict';
  if (g.PaisleyTechEntry || !g.firebase || !firebase.auth) return;
  g.PaisleyTechEntry = true;
  function add(nav) {
    if (!nav || nav.querySelector('[data-tech-entry]')) return;
    var a = document.createElement('a');
    a.className = 'nav-item'; a.href = '/tech/dashboard.html'; a.setAttribute('data-tech-entry', '');
    a.style.textDecoration = 'none';
    a.innerHTML = '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Paisley Tech Studio';
    nav.appendChild(a);
  }
  firebase.auth().onAuthStateChanged(function (user) {
    if (!user) return;
    firebase.firestore().collection('techStudents').doc(user.uid).get().then(function (d) {
      if (!d.exists || d.data().status !== 'Active') return;
      var nav = document.querySelector('.sidebar-nav');
      if (nav) add(nav);
      else document.addEventListener('DOMContentLoaded', function () { add(document.querySelector('.sidebar-nav')); });
    }).catch(function () { /* not a builder, or offline: no button */ });
  });
})(window);
