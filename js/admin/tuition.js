/* =========================================================
   TUITION (admin) — Paisley Studio  ·  CBC tuition panel
   -----------------------------------------------------------
   Top-level tabs:
     Applications    — approve / decline new CBC sign-ups, set the learning mode
     Students        — manage CBC students, pair tutors, link parents, view chats
     Tutor requests  — self-study students asking for a tutor: approve and pair
     Timetable       — schedule weekly lessons (shared with tutors)
     Classroom       — Classwork · Publish · Homework & marking · Exams & marking
     Support         — tickets raised from the Tuition portal

   A "tuition student" is a students/{uid} record with studentType "tuition".
   tuitionMode:  "tutored"  → paired with tutor(s) (subjectTutors / tutorIds)
                 "self"     → materials + assessment only

   Requires: classroom-helpers.js, work-helpers.js, publish-helpers.js,
   tuition-helpers.js, lms-helpers.js, firebase auth / firestore / functions.
========================================================= */
(function (global) {
  'use strict';
  var CU = global.ClassroomUI.util, WH = global.WorkUI._h, esc = CU.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var PAGE_SIZES = [10, 25, 50];

  function ts(d) { var x = CU.toDate(d); return x ? x.getTime() : 0; }
  function errMsg(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }
  function toast(el, msg, bad) { if (el) { el.textContent = msg; el.style.color = bad ? 'var(--error,#E74C3C)' : 'var(--brand-deep,#245F5A)'; } }
  function statusBadge(s) {
    var cls = s === 'Active' ? 'b-confirmed' : (s === 'Suspended' || s === 'Declined' ? 'b-declined' : 'b-pending');
    return '<span class="badge ' + cls + '">' + esc(s || 'Pending') + '</span>';
  }
  function guardians(s) { return (s.guardians && s.guardians.length ? s.guardians : (s.guardianEmail ? [{ name: s.guardianName, email: s.guardianEmail, phone: s.guardianPhone }] : [])); }
  function bandShort(ks) { return CU.ksShort ? CU.ksShort(ks) : String(ks || '').replace(/\s*\(.*/, ''); }
  function gradeText(s) { return s.year ? 'Grade ' + s.year : ''; }
  function tutorsOf(s) {
    var out = {}, map = s.subjectTutors || {};
    Object.keys(map).forEach(function (k) { var e = map[k] || {}; if (e.tutorId) out[e.tutorId] = e.tutorName || 'Tutor'; });
    (s.tutorIds || []).forEach(function (id) { if (!out[id]) out[id] = (id === s.tutorId && s.tutorName) || 'Tutor'; });
    return Object.keys(out).map(function (id) { return { id: id, name: out[id] }; });
  }
  function modeOf(s) { return tutorsOf(s).length ? 'tutored' : (s.tuitionMode === 'tutored' ? 'tutored' : 'self'); }
  function modePill(s) {
    return modeOf(s) === 'tutored'
      ? '<span class="badge b-confirmed">With tutor</span>'
      : '<span class="badge b-plain">Self-study</span>';
  }
  async function callable(name, data) {
    var res = await firebase.functions().httpsCallable(name)(data);
    return res.data;
  }

  function mount(root, opts) {
    CU.injectStyle(); WH.injectStyle();
    root.classList.add('cr-root');
    var S = {
      tab: 'applications', dsub: 'classwork',
      students: [], requests: [], tutors: [], links: [], parents: {}, loaded: false,
      q: '', status: 'all', band: 'all', sort: 'newest', page: 1, size: 10, unsubs: [], tt: null
    };

    /* ---------------- data ---------------- */
    function listen() {
      S.unsubs.forEach(function (u) { u(); }); S.unsubs = [];
      S.unsubs.push(db.collection('students').where('studentType', '==', 'tuition').onSnapshot(function (snap) {
        S.students = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        S.loaded = true; loadLinks();
      }, function (e) { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">Could not load tuition students: ' + esc(errMsg(e)) + '</div></div>'; }));
      S.unsubs.push(db.collection('tuitionRequests').onSnapshot(function (snap) {
        S.requests = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        if (S.loaded && (S.tab === 'requests' || S.tab === 'applications')) render(); else if (S.loaded) renderTabsOnly();
      }, function (e) { console.warn('tuition requests:', e); }));
      db.collection('tutorAccounts').get().then(function (snap) {
        S.tutors = snap.docs.map(function (d) { return { id: d.id, name: d.data().name || d.data().email || 'Tutor', status: d.data().status, subjects: d.data().subjects || [] }; })
          .filter(function (t) { return !t.status || t.status === 'Active' || t.status === 'active'; })
          .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      }).catch(function (e) { console.warn('tutor accounts:', e); });
    }
    async function loadLinks() {
      try {
        var ids = S.students.map(function (s) { return s.id; }), links = [];
        for (var i = 0; i < ids.length; i += 10) {
          var snap = await db.collection('parentStudentLinks').where('studentUid', 'in', ids.slice(i, i + 10)).get();
          snap.docs.forEach(function (d) { links.push(Object.assign({ id: d.id }, d.data())); });
        }
        S.links = links;
        var need = Array.from(new Set(links.map(function (l) { return l.parentUid; }))).filter(function (u) { return !S.parents[u]; });
        await Promise.all(need.map(function (u) {
          return db.collection('parentAccounts').doc(u).get().then(function (d) {
            S.parents[u] = d.exists ? Object.assign({ id: u }, d.data()) : { id: u, name: '(unknown)', email: '' };
          }).catch(function () {});
        }));
      } catch (e) { console.warn('tuition links:', e); }
      render();
    }
    function parentsOf(sid) { return S.links.filter(function (l) { return l.studentUid === sid; }).map(function (l) { return S.parents[l.parentUid] || { id: l.parentUid, name: '…', email: '' }; }); }
    function find(id) { return S.students.filter(function (x) { return x.id === id; })[0]; }
    function pendingApps() { return S.students.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }); }
    function pendingReqs() { return S.requests.filter(function (r) { return r.status === 'Pending'; }); }

    /* ---------------- shell ---------------- */
    function tabsHtml() {
      var pa = pendingApps().length, pr = pendingReqs().length;
      var tabs = [
        ['applications', 'fa-inbox', 'Applications', pa],
        ['students', 'fa-user-graduate', 'Students', 0],
        ['requests', 'fa-user-plus', 'Tutor requests', pr],
        ['timetable', 'fa-calendar-week', 'Timetable', 0],
        ['delivery', 'fa-chalkboard', 'Classroom & Homework', 0],
        ['support', 'fa-headset', 'Support', 0]
      ];
      return '<div class="cr-tabs" role="tablist" id="tuTabs">' + tabs.map(function (t) {
        return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="cr-btn ' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><i class="fas ' + t[1] + '"></i> ' + t[2] +
          (t[3] ? ' <span class="cr-badge-red" style="position:static;display:inline-flex;margin-left:.3rem">' + t[3] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function renderTabsOnly() { var el = root.querySelector('#tuTabs'); if (el) el.outerHTML = tabsHtml(); }
    function render() {
      root.innerHTML = tabsHtml() + '<div id="tuBody"></div>';
      var body = root.querySelector('#tuBody');
      if (S.tab === 'delivery') { renderDelivery(body); return; }
      if (S.tab === 'timetable') { renderTimetable(body); return; }
      if (!S.loaded) { body.innerHTML = '<div class="cr-empty">Loading CBC tuition students…</div>'; return; }
      if (S.tab === 'applications') renderApplications(body);
      else if (S.tab === 'students') renderStudents(body);
      else if (S.tab === 'requests') renderRequests(body);
      else renderSupport(body);
    }

    /* ---------------- applications ---------------- */
    function renderApplications(body) {
      var list = pendingApps().sort(function (a, b) { return ts(a.createdAt) - ts(b.createdAt); });
      var h = '<div class="cr-bar"><div><h3>Applications</h3><div class="cr-sub">New CBC tuition sign-ups waiting for approval. Approving activates the account, links the parents they listed and sets how they learn.</div></div></div>';
      if (!list.length) { body.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No applications waiting. 🎉</div></div>'; return; }
      h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Applicant</th><th>Band / Grade</th><th>Subjects</th><th>Parents / guardians</th><th>Applied</th><th></th></tr></thead><tbody>' + list.map(function (s) {
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email || '') + (s.phone ? ' · ' + esc(s.phone) : '') + '</div></td>' +
          '<td>' + esc(bandShort(s.keyStage)) + '<div class="cr-note">' + esc(gradeText(s)) + '</div></td>' +
          '<td>' + (lmzSubjectLabels(s.subjects).length ? esc(lmzSubjectLabels(s.subjects).join(', ')) : '<span class="cr-note">None chosen</span>') + '</td>' +
          '<td>' + (esc(guardians(s).map(function (g) { return g.name || g.email; }).join(', ')) || '—') + '</td>' +
          '<td>' + esc(s.createdAt ? CU.fmtDateTime(s.createdAt) : '—') + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="approve" data-id="' + esc(s.id) + '"><i class="fas fa-check"></i> Approve</button>' +
          '<button type="button" class="cr-btn sm danger" data-a="decline" data-id="' + esc(s.id) + '"><i class="fas fa-xmark"></i> Decline</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
      body.innerHTML = h;
    }

    /* Pair-tutors form (shared by Approve, Pair and Request approval). Returns reader. */
    function pairForm(m, s, withMode) {
      var subjects = lmzSubjectKeys(s.subjects), cur = s.subjectTutors || {};
      var tutOpts = function (sel) {
        return '<option value="">— none —</option>' + S.tutors.map(function (t) { return '<option value="' + esc(t.id) + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
      };
      var h = '';
      if (withMode) {
        h += '<div class="cr-field"><label>How will this student learn?</label>' +
          '<label style="display:flex;gap:.5rem;align-items:center;font-weight:600;text-transform:none"><input type="radio" name="tuMode" value="self"' + (modeOf(s) === 'self' ? ' checked' : '') + '> Self-study — materials and assessment, no tutor chat</label>' +
          '<label style="display:flex;gap:.5rem;align-items:center;font-weight:600;text-transform:none"><input type="radio" name="tuMode" value="tutored"' + (modeOf(s) === 'tutored' ? ' checked' : '') + '> With a tutor — chat, marking and a tutor timetable</label></div>';
      }
      h += '<div id="tuPair"><div class="cr-field"><label>Same tutor for every subject (optional)</label><select id="tuAll">' + tutOpts('') + '</select></div>' +
        (subjects.length ? subjects.map(function (k) {
          return '<div class="cr-field"><label for="tuT-' + esc(k) + '">' + esc(lmzSubjectLabel(k)) + '</label><select id="tuT-' + esc(k) + '" data-subj="' + esc(k) + '">' + tutOpts((cur[k] || {}).tutorId) + '</select></div>';
        }).join('') : '<div class="cr-note">This student has not chosen subjects yet.</div>') + '</div>';
      m.body.insertAdjacentHTML('beforeend', h);
      m.body.insertAdjacentHTML('beforeend', '<div id="tuBoards"><h4 style="margin:.8rem 0 .4rem;font-size:.8rem;color:var(--brand-deep)">Exam board</h4>' + CU.boardAssignHtml(s, subjects, 'tb') + '</div>');
      var all = m.body.querySelector('#tuAll');
      all.addEventListener('change', function () { m.body.querySelectorAll('[data-subj]').forEach(function (sel) { sel.value = all.value; }); });
      return function read() {
        var mode = withMode ? (m.body.querySelector('input[name="tuMode"]:checked') || {}).value : null;
        var subjectTutors = {}, ids = {};
        m.body.querySelectorAll('[data-subj]').forEach(function (sel) {
          if (!sel.value) return;
          var t = S.tutors.filter(function (x) { return x.id === sel.value; })[0]; if (!t) return;
          subjectTutors[sel.dataset.subj] = { tutorId: t.id, tutorName: t.name, tutorSlug: '' };
          ids[t.id] = true;
        });
        var tutorIds = Object.keys(ids), first = tutorIds.length ? subjectTutors[Object.keys(subjectTutors)[0]] : null;
        var bd = CU.readBoardAssign(m.body.querySelector('#tuBoards'), 'tb');
        return {
          board: bd.board, subjectBoards: bd.subjectBoards,
          mode: mode, subjectTutors: subjectTutors, tutorIds: tutorIds,
          tutorId: first ? first.tutorId : '', tutorName: first ? first.tutorName : '', tutorSlug: ''
        };
      };
    }
    function pairFields(r, forceMode) {
      var mode = forceMode || r.mode || (r.tutorIds.length ? 'tutored' : 'self');
      var bf = { board: r.board || firebase.firestore.FieldValue.delete(), subjectBoards: r.subjectBoards || {} };
      if (mode === 'self') return { board: bf.board, subjectBoards: bf.subjectBoards, tuitionMode: 'self', subjectTutors: {}, tutorIds: [], tutorId: '', tutorName: '', tutorSlug: '' };
      return { board: bf.board, subjectBoards: bf.subjectBoards, tuitionMode: 'tutored', subjectTutors: r.subjectTutors, tutorIds: r.tutorIds, tutorId: r.tutorId, tutorName: r.tutorName, tutorSlug: r.tutorSlug };
    }

    function openApprove(s) {
      var m = CU.openModal({ title: 'Approve — ' + s.name, wide: true });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.8rem">' + esc(bandShort(s.keyStage)) + ' · ' + esc(gradeText(s)) + ' · ' + esc(lmzSubjectLabels(s.subjects).join(', ') || 'no subjects chosen yet') + '</div>';
      var read = pairForm(m, s, true);
      m.foot.innerHTML = '<span class="cr-err" id="tuErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Approve and activate</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      var busy = false;
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        if (busy) return; busy = true; var btn = this, err = m.foot.querySelector('#tuErr'); err.textContent = ''; btn.disabled = true;
        var r = read();
        if (r.mode === 'tutored' && !r.tutorIds.length) { err.textContent = 'Pick at least one tutor, or choose Self-study.'; busy = false; btn.disabled = false; return; }
        try {
          await db.collection('students').doc(s.id).update(Object.assign(pairFields(r), {
            status: 'Active', approvedAt: FV().serverTimestamp(), approvedBy: opts.uid || ''
          }));
          m.close(true);
        } catch (e) { err.textContent = errMsg(e); busy = false; btn.disabled = false; }
      };
    }
    async function decline(s) {
      var ok = await CU.confirmModal({ title: 'Decline application', danger: true, confirmLabel: 'Decline', message: 'Decline <b>' + esc(s.name) + '</b>’s application? They will not be able to sign in.' });
      if (!ok) return;
      try { await db.collection('students').doc(s.id).update({ status: 'Declined', declinedAt: FV().serverTimestamp() }); }
      catch (e) { alert('Could not decline: ' + errMsg(e)); }
    }

    /* ---------------- students ---------------- */
    function filtered() {
      var q = S.q.trim().toLowerCase();
      var list = S.students.filter(function (s) {
        if ((s.status || 'Pending') === 'Pending') return false;     // applications live in their own tab
        if (S.status !== 'all') {
          if (S.status === 'tutored' || S.status === 'self') { if (modeOf(s) !== S.status) return false; }
          else if ((s.status || 'Pending') !== S.status) return false;
        }
        if (S.band !== 'all' && s.keyStage !== S.band) return false;
        if (q) {
          var hay = [s.name, s.email, s.phone, guardians(s).map(function (g) { return g.name + ' ' + g.email; }).join(' '), lmzSubjectLabels(s.subjects).join(' ')].join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      var by = { name: function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); },
        band: function (a, b) { return String(a.keyStage || '').localeCompare(String(b.keyStage || '')) || (a.year || 0) - (b.year || 0); },
        newest: function (a, b) { return ts(b.createdAt) - ts(a.createdAt); } };
      return list.sort(by[S.sort] || by.newest);
    }
    function sel(key, val, options) {
      return '<select data-f="' + key + '" aria-label="' + esc(key) + '">' + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }
    function renderStudents(body) {
      var all = S.students.filter(function (s) { return (s.status || 'Pending') !== 'Pending'; }), list = filtered();
      var pages = Math.max(1, Math.ceil(list.length / S.size)); if (S.page > pages) S.page = pages;
      var rows = list.slice((S.page - 1) * S.size, S.page * S.size);
      var n = function (f) { return all.filter(f).length; };
      var h = '<div class="cr-bar"><div><h3>CBC tuition students</h3><div class="cr-sub">Approved learners. Pair tutors, adjust subjects, link parents and review their chats.</div></div></div>' +
        '<div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' +
        [['Total', all.length], ['Active', n(function (s) { return s.status === 'Active'; })], ['With a tutor', n(function (s) { return modeOf(s) === 'tutored'; })], ['Self-study', n(function (s) { return modeOf(s) === 'self'; })]].map(function (x) {
          return '<div class="cr-panel" style="margin:0;padding:.8rem 1rem"><div style="font-size:1.4rem;font-weight:800;color:var(--brand-deep)">' + x[1] + '</div><div class="cr-note">' + x[0] + '</div></div>';
        }).join('') + '</div>' +
        '<div class="cr-filters"><input type="search" data-f="q" placeholder="Search name, email, parent, subject…" value="' + esc(S.q) + '" aria-label="Search" style="min-width:230px">' +
        sel('status', S.status, [['all', 'All students'], ['Active', 'Active'], ['Suspended', 'Suspended'], ['Declined', 'Declined'], ['tutored', 'With a tutor'], ['self', 'Self-study']]) +
        sel('band', S.band, [['all', 'All bands']].concat((typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : []).map(function (k) { return [k, bandShort(k)]; }))) +
        sel('sort', S.sort, [['newest', 'Newest first'], ['name', 'Name A–Z'], ['band', 'Band / Grade']]) + '</div>';
      if (!rows.length) { body.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">' + (all.length ? 'No students match these filters.' : 'No approved CBC students yet. Approve an application to start.') + '</div></div>'; return; }
      h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Student</th><th>Band / Grade</th><th>Subjects</th><th>Mode</th><th>Parents</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (s) {
        var ps = parentsOf(s.id), tt = tutorsOf(s);
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email || '') + (s.phone ? ' · ' + esc(s.phone) : '') + '</div></td>' +
          '<td>' + esc(bandShort(s.keyStage)) + '<div class="cr-note">' + esc(gradeText(s)) + '</div></td>' +
          '<td>' + (lmzSubjectLabels(s.subjects).length ? esc(lmzSubjectLabels(s.subjects).join(', ')) : '<span class="cr-note">None</span>') + '</td>' +
          '<td>' + modePill(s) + (tt.length ? '<div class="cr-note">' + esc(tt.map(function (t) { return t.name; }).join(', ')) + '</div>' : '') + '</td>' +
          '<td>' + (ps.length ? ps.map(function (p) { return esc(p.name || p.email); }).join('<br>') : esc(guardians(s).map(function (g) { return g.name || g.email; }).join(', ') || '—') + '<div class="cr-note">no portal account yet</div>') + '</td>' +
          '<td>' + statusBadge(s.status) + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="view" data-id="' + esc(s.id) + '"><i class="fas fa-eye"></i> Profile</button>' +
          '<button type="button" class="cr-btn sm" data-a="pair" data-id="' + esc(s.id) + '" title="Pair tutor"><i class="fas fa-chalkboard-user"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + esc(s.id) + '" title="Edit"><i class="fas fa-pen"></i></button>' +
          (s.status === 'Suspended' || s.status === 'Declined'
            ? '<button type="button" class="cr-btn sm" data-a="reactivate" data-id="' + esc(s.id) + '"><i class="fas fa-user-check"></i></button>'
            : '<button type="button" class="cr-btn sm danger" data-a="suspend" data-id="' + esc(s.id) + '" title="Suspend"><i class="fas fa-user-slash"></i></button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' +
        '<div class="cr-bar" style="margin-top:.7rem"><span class="cr-note">' + list.length + ' record' + (list.length === 1 ? '' : 's') + ' · page ' + S.page + ' of ' + pages + '</span><div class="cr-actions">' +
        '<select data-f="size" aria-label="Rows per page">' + PAGE_SIZES.map(function (z) { return '<option value="' + z + '"' + (z === S.size ? ' selected' : '') + '>' + z + ' per page</option>'; }).join('') + '</select>' +
        '<button type="button" class="cr-btn sm" data-a="prev"' + (S.page <= 1 ? ' disabled' : '') + '>Prev</button><button type="button" class="cr-btn sm" data-a="next"' + (S.page >= pages ? ' disabled' : '') + '>Next</button></div></div>';
      body.innerHTML = h;
    }

    async function setStatus(s, status) {
      try { await db.collection('students').doc(s.id).update({ status: status }); } catch (e) { alert('Could not update: ' + errMsg(e)); }
    }

    function openPair(s, afterSave) {
      var m = CU.openModal({ title: 'Pair tutor — ' + s.name, wide: true });
      var read = pairForm(m, s, true);
      m.foot.innerHTML = '<span class="cr-err" id="tuErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var err = m.foot.querySelector('#tuErr'), btn = this; err.textContent = ''; btn.disabled = true;
        var r = read();
        if (r.mode === 'tutored' && !r.tutorIds.length) { err.textContent = 'Pick at least one tutor, or choose Self-study.'; btn.disabled = false; return; }
        try { await db.collection('students').doc(s.id).update(pairFields(r)); m.close(true); if (afterSave) afterSave(); }
        catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
      };
    }

    function openEdit(s) {
      var m = CU.openModal({ title: 'Edit — ' + s.name, wide: true });
      var bands = typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : [];
      m.body.innerHTML = '<div class="cr-row2"><div class="cr-field"><label for="edBand">Learning band</label><select id="edBand">' + bands.map(function (b) { return '<option value="' + esc(b) + '"' + (b === s.keyStage ? ' selected' : '') + '>' + esc(bandShort(b)) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="edGrade">Grade</label><select id="edGrade"></select></div></div>' +
        '<div class="cr-field"><label>Subjects</label><div id="edSubj" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.35rem"></div></div>' +
        '<div class="cr-field"><label for="edStatus">Account status</label><select id="edStatus">' + ['Active', 'Suspended', 'Declined'].map(function (x) { return '<option' + (x === s.status ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>';
      var band = m.body.querySelector('#edBand'), grade = m.body.querySelector('#edGrade'), subj = m.body.querySelector('#edSubj');
      var mine = lmzSubjectKeys(s.subjects);
      function refresh(keep) {
        var yrs = lmzYearsForKeyStage(band.value);
        grade.innerHTML = yrs.map(function (y) { return '<option value="' + y + '"' + (Number(s.year) === y ? ' selected' : '') + '>Grade ' + y + '</option>'; }).join('');
        var chosen = keep ? mine : Array.prototype.map.call(subj.querySelectorAll('input:checked'), function (c) { return c.value; });
        subj.innerHTML = lmzSubjectsForKeyStage(band.value).map(function (x) { return '<label style="display:flex;gap:.45rem;align-items:center;font-size:.86rem"><input type="checkbox" value="' + esc(x.id) + '"' + (chosen.indexOf(x.id) !== -1 ? ' checked' : '') + '> ' + esc(x.name) + '</label>'; }).join('');
      }
      band.addEventListener('change', function () { refresh(false); });
      refresh(true);
      m.foot.innerHTML = '<span class="cr-err" id="tuErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var err = m.foot.querySelector('#tuErr'), btn = this; err.textContent = '';
        var ids = Array.prototype.map.call(subj.querySelectorAll('input:checked'), function (c) { return c.value; });
        if (!ids.length) { err.textContent = 'Choose at least one subject.'; return; }
        btn.disabled = true;
        // Drop tutor picks for subjects that were removed.
        var st = {}, cur = s.subjectTutors || {}, tids = {};
        ids.forEach(function (k) { if (cur[k]) { st[k] = cur[k]; tids[cur[k].tutorId] = true; } });
        var tutorIds = Object.keys(tids), first = tutorIds.length ? st[Object.keys(st)[0]] : null;
        try {
          await db.collection('students').doc(s.id).update(Object.assign({
            keyStage: band.value, year: Number(grade.value), status: m.body.querySelector('#edStatus').value,
            subjectTutors: st, tutorIds: tutorIds, tutorId: first ? first.tutorId : '', tutorName: first ? first.tutorName : ''
          }, lmzSubjectWriteFields(ids)));
          m.close(true);
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
      };
    }

    function openProfile(s) {
      var m = CU.openModal({ title: s.name, wide: true });
      var ps = parentsOf(s.id), tt = tutorsOf(s);
      m.body.innerHTML = '<div class="cr-panel"><div class="cr-row2"><div><b>Email</b><div class="cr-note">' + esc(s.email || '—') + '</div><b>Phone</b><div class="cr-note">' + esc(s.phone || '—') + '</div></div>' +
        '<div><b>Band / Grade</b><div class="cr-note">' + esc(s.keyStage || '—') + (s.year ? ' · Grade ' + esc(s.year) : '') + '</div><b>Account</b><div class="cr-note">' + statusBadge(s.status) + ' ' + modePill(s) + '</div></div></div>' +
        '<b>Subjects</b><div class="cr-note">' + esc(lmzSubjectLabels(s.subjects).join(', ') || 'None') + '</div>' +
        '<b style="display:block;margin-top:.5rem">Tutors</b><div class="cr-note">' + (tt.length ? tt.map(function (t) { return esc(t.name); }).join(', ') : 'None — self-study') + '</div>' +
        '<b style="display:block;margin-top:.5rem">Parents / guardians</b><div class="cr-note">' + (ps.length ? ps.map(function (p) { return esc(p.name || '') + ' &lt;' + esc(p.email || '') + '&gt;'; }).join('<br>') : 'No linked portal accounts yet.') + '</div></div>' +
        '<div class="cr-panel" style="margin-top:1rem"><h4 style="margin:0 0 .6rem;color:var(--brand-deep)">Add a parent / guardian</h4><div class="cr-row2">' +
        '<div class="cr-field"><label for="apName">Name</label><input id="apName" maxlength="120"></div><div class="cr-field"><label for="apEmail">Email</label><input id="apEmail" maxlength="200"></div></div>' +
        '<div class="cr-field" style="max-width:260px"><label for="apPhone">Phone</label><input id="apPhone" maxlength="40"></div>' +
        '<button type="button" class="cr-btn primary" id="apGo"><i class="fas fa-user-plus"></i> Create / link parent</button> <span class="cr-note" id="apMsg" role="status"></span>' +
        '<div class="cr-note" style="margin-top:.4rem">An existing parent account (matched by email) is reused, so a parent with children on different curriculums keeps one login.</div></div>';
      m.foot.innerHTML = tt.map(function (t) { return '<button type="button" class="cr-btn" data-chat="' + esc(t.id) + '"><i class="fas fa-comments"></i> Chat with ' + esc(t.name) + '</button>'; }).join('') + '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelectorAll('[data-chat]').forEach(function (b) {
        b.onclick = function () {
          var t = tt.filter(function (x) { return x.id === b.dataset.chat; })[0];
          var cm = CU.openModal({ title: 'Chat — ' + s.name + ' & ' + t.name, wide: true });
          global.TuitionUI.mountChat(cm.body, { studentId: s.id, studentName: s.name, tutorId: t.id, tutorName: t.name, me: { uid: opts.uid, role: 'admin', name: opts.name || 'Studio Desk' } });
          cm.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>'; cm.foot.querySelector('[data-a="x"]').onclick = function () { cm.close(); };
        };
      });
      m.body.querySelector('#apGo').onclick = async function () {
        var msg = m.body.querySelector('#apMsg'), name = m.body.querySelector('#apName').value.trim(), email = m.body.querySelector('#apEmail').value.trim(), phone = m.body.querySelector('#apPhone').value.trim();
        if (!name || !/^\S+@\S+\.\S+$/.test(email)) { toast(msg, 'Enter the parent’s name and a valid email.', true); return; }
        toast(msg, 'Working…');
        try {
          var r = await callable('createParentAccount', { studentId: s.id, parentEmail: email, parentName: name, parentPhone: phone });
          var x = (r.results || [])[0] || {};
          toast(msg, x.skipped ? 'Skipped: ' + x.skipped : (x.created ? 'Parent account created and email sent.' : 'Existing parent account linked.'), !!x.skipped);
          await loadLinks();
        } catch (e) { toast(msg, errMsg(e), true); }
      };
    }

    /* ---------------- tutor requests ---------------- */
    function renderRequests(body) {
      var rows = S.requests.slice().sort(function (a, b) { return (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || ts(b.createdAt) - ts(a.createdAt); });
      var h = '<div class="cr-bar"><div><h3>Tutor requests</h3><div class="cr-sub">Self-study students asking for a tutor. Approving pairs them and switches on tutor chat and marking.</div></div></div>';
      if (!rows.length) { body.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No tutor requests yet.</div></div>'; return; }
      h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Student</th><th>Subjects</th><th>Note</th><th>Status</th><th>Requested</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
        var st = find(r.studentId);
        return '<tr><td><b>' + esc(r.studentName || (st && st.name) || '—') + '</b><div class="cr-note">' + esc(r.grade || '') + '</div></td>' +
          '<td>' + esc((r.subjectNames || []).join(', ') || 'All subjects') + '</td><td style="max-width:260px">' + esc(r.note || '') + (r.adminNote ? '<div class="cr-note"><b>Admin:</b> ' + esc(r.adminNote) + '</div>' : '') + '</td>' +
          '<td>' + statusBadge(r.status) + '</td><td>' + esc(r.createdAt ? CU.fmtDateTime(r.createdAt) : '—') + '</td>' +
          '<td>' + (r.status === 'Pending'
            ? '<div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="req-approve" data-id="' + esc(r.id) + '"><i class="fas fa-check"></i> Approve and pair</button><button type="button" class="cr-btn sm danger" data-a="req-decline" data-id="' + esc(r.id) + '"><i class="fas fa-xmark"></i></button></div>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      body.innerHTML = h;
    }
    function reqFind(id) { return S.requests.filter(function (r) { return r.id === id; })[0]; }
    function approveRequest(r) {
      var s = find(r.studentId);
      if (!s) { alert('This student record could not be found.'); return; }
      var m = CU.openModal({ title: 'Pair a tutor — ' + s.name, wide: true });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.8rem">Requested: ' + esc((r.subjectNames || []).join(', ') || 'all subjects') + (r.note ? '<br>“' + esc(r.note) + '”' : '') + '</div>';
      // pre-select the requested subjects only when none are paired yet
      var read = pairForm(m, s, false);
      m.body.insertAdjacentHTML('beforeend', '<div class="cr-field"><label for="rqNote">Note to the student (optional)</label><input id="rqNote" maxlength="200"></div>');
      m.foot.innerHTML = '<span class="cr-err" id="tuErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Approve and pair</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var err = m.foot.querySelector('#tuErr'), btn = this; err.textContent = '';
        var p = read();
        if (!p.tutorIds.length) { err.textContent = 'Pick at least one tutor.'; return; }
        btn.disabled = true;
        try {
          await db.collection('students').doc(s.id).update(pairFields(p, 'tutored'));
          await db.collection('tuitionRequests').doc(r.id).update({ status: 'Approved', adminNote: m.body.querySelector('#rqNote').value.trim(), resolvedAt: FV().serverTimestamp(), resolvedBy: opts.uid || '' });
          m.close(true);
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
      };
    }
    async function declineRequest(r) {
      var note = await PaisleyUI.prompt('Optional note for the student (why it could not be approved yet):', {title:'Decline request', multiline:true, confirmLabel:'Decline'});
      if (note === null) return;
      try { await db.collection('tuitionRequests').doc(r.id).update({ status: 'Declined', adminNote: note.trim().slice(0, 200), resolvedAt: FV().serverTimestamp(), resolvedBy: opts.uid || '' }); }
      catch (e) { alert('Could not update: ' + errMsg(e)); }
    }

    /* ---------------- timetable ---------------- */
    function renderTimetable(body) {
      if (!S.loaded) { body.innerHTML = '<div class="cr-empty">Loading…</div>'; return; }
      body.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem"><i class="fas fa-calendar-week"></i> Lessons you add here appear on the student’s Timetable and in their parents’ dashboard. Tutors can add lessons for their own students too.</div><div id="tuTT"></div>';
      var active = S.students.filter(function (s) { return s.status === 'Active'; }).map(function (s) { return { id: s.id, name: s.name, subjects: lmzSubjectKeys(s.subjects) }; });
      global.TuitionUI.mountTimetable(body.querySelector('#tuTT'), {
        mode: 'admin', students: active, tutors: S.tutors, subjectName: lmzSubjectLabel,
        user: { uid: opts.uid, role: 'admin', name: opts.name || 'Studio Desk' }
      });
    }

    /* ---------------- delivery ---------------- */
    function renderDelivery(body) {
      var sub = S.dsub || 'classwork';
      var tabs = [['classwork', 'Classwork'], ['publish', 'Publish'], ['homework', 'Homework & marking'], ['exams', 'Exams & marking']];
      body.innerHTML = '<div class="cr-tabs">' + tabs.map(function (t) {
        return '<button type="button" class="cr-btn ' + (sub === t[0] ? 'on' : '') + '" data-a="dsub" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="tuDel"></div>';
      var host = body.querySelector('#tuDel');
      if (sub === 'classwork') {
        host.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem"><i class="fas fa-graduation-cap"></i> Author revision lessons and resources for <b>CBC tuition students only</b>. Create a classroom for a band, Grade and subject, then add topics and lessons. Online and remote students never see this content.</div><div id="tuCw"></div>';
        global.ClassroomUI.mountManager(host.querySelector('#tuCw'), { role: 'admin', uid: opts.uid, name: opts.name || 'Studio Desk', scope: 'tuition' });
        return;
      }
      if (sub === 'publish') {
        if (!global.PublishUI) { host.innerHTML = '<div class="cr-empty">Publishing is unavailable on this page.</div>'; return; }
        global.PublishUI.mount(host, { user: { uid: opts.uid, name: opts.name || 'Studio Desk' }, scope: 'tuition' });
        return;
      }
      global.WorkUI.mountManagement(host, {
        kind: sub === 'exams' ? 'exams' : 'homework', role: 'admin', uid: opts.uid, name: opts.name || 'Studio Desk',
        audience: 'tuition', monitoringOnly: true
      });
    }

    /* ---------------- support ---------------- */
    async function renderSupport(body) {
      body.innerHTML = '<div class="cr-empty">Loading tickets…</div>';
      try {
        var snap = await db.collection('tickets').where('studentType', '==', 'tuition').get();
        var rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ts(b.createdAt) - ts(a.createdAt); });
        body.innerHTML = '<div class="cr-bar"><div><h3>CBC tuition tickets</h3><div class="cr-sub">Raised from the Tuition portal. Reply from the existing Student Tickets screen.</div></div><button type="button" class="cr-btn" data-a="goto-tickets"><i class="fas fa-arrow-up-right-from-square"></i> Open Student Tickets</button></div>' +
          (rows.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Student</th><th>Subject</th><th>Status</th><th>Raised</th></tr></thead><tbody>' + rows.map(function (t) {
            return '<tr><td>' + esc(t.studentName || '') + '</td><td><b>' + esc(t.subject || '') + '</b><div class="cr-note">' + esc((t.message || '').slice(0, 120)) + '</div></td><td>' + esc(t.status || 'Open') + '</td><td>' + esc(t.createdAt ? CU.fmtDateTime(t.createdAt) : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No tickets from CBC tuition students yet.</div></div>');
      } catch (e) { body.innerHTML = '<div class="cr-empty">Could not load tickets: ' + esc(errMsg(e)) + '</div>'; }
    }

    /* ---------------- events ---------------- */
    function gotoNav(view) { var b = document.querySelector('.nav-item[data-view="' + view + '"]'); if (b) b.click(); }
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return; var a = el.dataset.a, id = el.dataset.id, s;
      if (a === 'tab') { S.tab = el.dataset.v; render(); }
      else if (a === 'approve') { s = find(id); if (s) openApprove(s); }
      else if (a === 'decline') { s = find(id); if (s) decline(s); }
      else if (a === 'view') { s = find(id); if (s) openProfile(s); }
      else if (a === 'edit') { s = find(id); if (s) openEdit(s); }
      else if (a === 'pair') { s = find(id); if (s) openPair(s); }
      else if (a === 'suspend') { s = find(id); if (s) setStatus(s, 'Suspended'); }
      else if (a === 'reactivate') { s = find(id); if (s) setStatus(s, 'Active'); }
      else if (a === 'req-approve') { var r = reqFind(id); if (r) approveRequest(r); }
      else if (a === 'req-decline') { var r2 = reqFind(id); if (r2) declineRequest(r2); }
      else if (a === 'prev') { S.page = Math.max(1, S.page - 1); render(); }
      else if (a === 'next') { S.page++; render(); }
      else if (a === 'dsub') { S.dsub = el.dataset.v; render(); }
      else if (a === 'goto-tickets') gotoNav('tickets');
    });
    root.addEventListener('change', function (e) {
      var f = e.target.dataset && e.target.dataset.f; if (!f) return;
      if (f === 'size') S.size = Number(e.target.value); else S[f] = e.target.value; S.page = 1; render();
    });
    root.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.f === 'q') {
        S.q = e.target.value; S.page = 1; var pos = e.target.selectionStart; render();
        var i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
      }
    });

    render(); listen();
    return { destroy: function () { S.unsubs.forEach(function (u) { u(); }); } };
  }

  global.TuitionAdmin = { mount: mount };
})(window);