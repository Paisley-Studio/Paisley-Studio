/* Admin > Key Stages & Fees > Subject names.
   Renaming calls the renameSubject callable (functions/subjects.js): the new name is saved in
   lmsSettings/subjects (every page reads it through lms-helpers.js) and copied onto the stored
   subjectName / subjectNames of timetables, classrooms and their work, resources, profiles and
   open attendance registers. Subject ids never change, so access and history are untouched. */
var SubjectNamesAdmin = (function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var GROUPS = [['British curriculum (KS2 to KS5)', function (s) { return !/^(cbc|tech)-/.test(s.id); }], ['CBC tuition', function (s) { return /^cbc-/.test(s.id); }]];
  function mount(el) {
    function paint(msg) {
      el.innerHTML = '<div class="panel"><div class="panel-head"><div><h3><i class="fas fa-pen-to-square"></i> Subject names</h3>' +
        '<div class="sub">Rename a subject and it changes everywhere: dashboards, timetables, classrooms, homework, exams, reports and emails. Records keep their history.</div></div></div>' +
        (msg ? '<div style="margin:0 0 .8rem;font-weight:700;font-size:.82rem;color:' + (msg.bad ? '#b8362a' : '#1d8b57') + '">' + esc(msg.text) + '</div>' : '') +
        GROUPS.map(function (g) {
          var list = LMZ_SUBJECTS.filter(g[1]);
          return '<div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:.9rem 0 .4rem">' + esc(g[0]) + '</div>' +
            '<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Name shown everywhere</th><th></th></tr></thead><tbody>' +
            list.map(function (s) {
              return '<tr><td class="cell-sub">' + esc(s.originalName || s.name) + (s.originalName ? '<br><span style="font-size:.7rem">renamed</span>' : '') + '</td>' +
                '<td><input type="text" data-sn="' + esc(s.id) + '" value="' + esc(s.name) + '" maxlength="60" aria-label="Name for ' + esc(s.name) + '" style="width:100%;min-width:160px;font-family:inherit;font-size:.84rem;padding:.45rem .6rem;border:1.5px solid var(--line);border-radius:9px;box-sizing:border-box"></td>' +
                '<td><button type="button" class="btn btn-primary btn-sm" data-sn-save="' + esc(s.id) + '"><i class="fas fa-check"></i> Save</button></td></tr>';
            }).join('') + '</tbody></table></div>';
        }).join('') + '</div>';
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-sn-save]'); if (!b) return;
      var id = b.dataset.snSave, input = el.querySelector('[data-sn="' + id + '"]'), name = input.value.replace(/\s+/g, ' ').trim();
      var subj = LMZ_SUBJECTS.filter(function (s) { return s.id === id; })[0];
      if (!subj || name === subj.name) return;
      if (name.length < 2) { paint({ bad: true, text: 'A subject name needs at least 2 characters.' }); return; }
      b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
      firebase.functions().httpsCallable('renameSubject')({ subjectId: id, name: name, currentName: subj.name }).then(function (r) {
        var map = {}; map[id] = name; lmzApplySubjectNames(map);
        try { var c = JSON.parse(localStorage.getItem('lmzSubjectNames') || '{}'); c[id] = name; localStorage.setItem('lmzSubjectNames', JSON.stringify(c)); } catch (er) { }
        var u = (r.data && r.data.updated) || {}, total = Object.keys(u).reduce(function (a, k) { return a + (u[k] || 0); }, 0);
        paint({ text: '"' + name + '" saved. ' + total + ' stored record' + (total === 1 ? '' : 's') + ' updated.' });
      }).catch(function (er) { paint({ bad: true, text: (er && er.message) || 'Could not rename the subject.' }); });
    });
    paint();
    window.addEventListener('lmz-subjects', function () { if (!el.contains(document.activeElement)) paint(); });
  }
  return { mount: mount };
})();
