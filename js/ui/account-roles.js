/* =========================================================
   PaisleyRoles: one login can be many things at once.
   Firebase allows one login per email, so a tutor who is also a parent and a
   coach has one login with several accounts on it. A role comes from which
   collection holds the user's uid, never from their age or a role field.

   PaisleyRoles.find(user)                 -> Promise<[{ key, label, about, icon, href }]>
   PaisleyRoles.linksHtml(roles)           -> links for a "wrong portal" message, or ''
   PaisleyRoles.showPicker(el, roles, o)   -> the "Which account?" screen

   Needs the global Firestore `db` (firebase-config.js) and Firebase auth.
   ========================================================= */
(function (g) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safe(p) { return p.catch(function () { return null; }); }
  function doc(c, id) { return safe(db.collection(c).doc(id).get()); }
  function has(s) { return !!(s && s.exists); }
  function hasLink(s) { return !!(s && !s.empty); }

  function studentPortal(type) {
    if (type === 'remote') return ['Remote student', '/remote/dashboard.html'];
    if (type === 'tuition') return ['CBC tuition student', '/tuition/dashboard.html'];
    return ['Student', '/student/dashboard.html'];
  }

  function find(user) {
    var uid = user.uid;
    return Promise.all([
      doc('admins', uid), doc('tutorAccounts', uid), doc('techCoaches', uid), doc('techStudents', uid), doc('students', uid), doc('parentAccounts', uid),
      safe(db.collection('parentStudentLinks').where('parentUid', '==', uid).limit(1).get()),
      safe(db.collection('techGuardianLinks').where('parentUid', '==', uid).limit(1).get())
    ]).then(function (r) {
      var out = [];
      function add(key, label, about, icon, href) { out.push({ key: key, label: label, about: about, icon: icon, href: href }); }
      if (has(r[0])) add('admin', 'Admin', 'The Studio Desk dashboard', 'fa-gauge-high', '/admin');
      if (has(r[1]) && r[1].data().status !== 'Suspended') add('tutor', 'Tutor', 'Your classes, students and marking', 'fa-chalkboard-user', '/tutor/index.html');
      if (has(r[2]) && r[2].data().status === 'Active') add('coach', 'Tech Studio coach', 'Your builders, reviews and missions', 'fa-wand-magic-sparkles', '/tech/coach/dashboard.html');
      if (has(r[3])) add('builder', 'Tech Studio builder', 'Your missions and projects', 'fa-hammer', '/tech/dashboard.html');
      if (has(r[4]) && r[4].data().studentType !== 'tech') {
        var sp = studentPortal(r[4].data().studentType);
        add('student', sp[0], 'Your classes and work', 'fa-graduation-cap', sp[1]);
      }
      if (has(r[5]) && hasLink(r[6])) add('parent', 'Parent', 'Your child’s classes and progress', 'fa-user-group', '/parent/dashboard.html');
      if (hasLink(r[7])) add('guardian', 'Tech Studio guardian', 'Your child’s Tech Studio projects', 'fa-shield-heart', '/tech/parent/dashboard.html');
      return out;
    });
  }

  function linksHtml(roles) {
    return (roles || []).map(function (r) { return '<a href="' + esc(r.href) + '" style="font-weight:800;text-decoration:underline">' + esc(r.label) + '</a>'; }).join(' · ');
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.ar-box{font-family:Quicksand,sans-serif;color:#263331}',
      '.ar-box h2{margin:0 0 .25rem;font-size:1.5rem;font-weight:800;color:#245F5A}',
      '.ar-box>p{margin:0 0 1rem;font-size:.9rem;font-weight:600;color:#5A6E6A}',
      '.ar-item{display:flex;align-items:center;gap:.8rem;padding:.75rem .9rem;margin-bottom:.5rem;background:#fff;border:1.5px solid rgba(38,51,49,.12);border-radius:14px;text-decoration:none;color:inherit;transition:border-color .2s,background .2s}',
      '.ar-item:hover,.ar-item:focus-visible{border-color:#55BFB3;background:#E5F2EF}',
      '.ar-ico{flex:none;width:40px;height:40px;border-radius:12px;background:#E5F2EF;color:#245F5A;display:flex;align-items:center;justify-content:center}',
      '.ar-t{flex:1;min-width:0}.ar-t b{display:block;font-size:.95rem;font-weight:800;color:#245F5A}.ar-t small{display:block;font-size:.78rem;font-weight:600;color:#5A6E6A}',
      '.ar-go{color:#55BFB3;font-size:.8rem}',
      '.ar-more{margin-top:.9rem;font-size:.82rem;font-weight:600;color:#5A6E6A;text-align:center;line-height:1.7}',
      '.ar-more a,.ar-more button{color:#245F5A;font-weight:800;background:none;border:0;padding:0;font:inherit;font-weight:800;cursor:pointer;text-decoration:underline}'
    ].join('');
    document.head.appendChild(st);
  }
  /* o.email is shown so people can see which login this is. */
  function showPicker(el, roles, o) {
    o = o || {}; style();
    var keys = roles.map(function (r) { return r.key; }), more = [];
    if (keys.indexOf('coach') === -1 && keys.indexOf('builder') === -1) more.push('<a href="/tech/coach/index.html?apply=1">Apply to be a Tech Studio coach</a>');
    if (keys.indexOf('builder') === -1 && keys.indexOf('coach') === -1) more.push('<a href="/tech/index.html?tab=signup">Join Tech Studio as a builder</a>');
    el.innerHTML = '<div class="ar-box"><h2>Which account?</h2><p>' + esc(o.email || 'This login') + ' has more than one Paisley account. Choose where to go.</p>' +
      roles.map(function (r) {
        return '<a class="ar-item" href="' + esc(r.href) + '"><span class="ar-ico"><i class="fas ' + esc(r.icon) + '" aria-hidden="true"></i></span><span class="ar-t"><b>' + esc(r.label) + '</b><small>' + esc(r.about) + '</small></span><i class="fas fa-chevron-right ar-go" aria-hidden="true"></i></a>';
      }).join('') +
      '<div class="ar-more">' + (more.length ? more.join('<br>') + '<br>' : '') + '<button type="button" data-ar-out>Sign out</button></div></div>';
    el.querySelector('[data-ar-out]').addEventListener('click', function () { firebase.auth().signOut().then(function () { location.reload(); }); });
  }

  g.PaisleyRoles = { find: find, linksHtml: linksHtml, showPicker: showPicker };
})(window);
