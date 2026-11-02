/* =========================================================
   REMOTE STUDENTS (admin) — Paisley Studio
   -----------------------------------------------------------
   The one new admin navigation item. It manages remote students,
   their parents, classwork authoring, delivery monitoring and
   support.

   Top-level tabs:  Students · Parents · Classroom & Homework · Support

   Inside "Classroom & Homework":
     Classwork            — author lessons for remote students only
     Posted content       — what was posted to remote students
     Homework & marking   — remote work monitoring + ink grading
     Exams & marking      — remote exam marking

   A "remote student" is simply a students/{uid} record whose
   studentType is "remote" (set only by the admitRemoteStudent function).

   Requires: classroom-helpers.js, work-helpers.js (+ ink-grader.js for
   grading), lms-helpers.js, firebase auth/firestore/functions.
========================================================= */
(function (global) {
  'use strict';
  var CU = global.ClassroomUI.util, WH = global.WorkUI._h, esc = CU.esc;
  var PAGE_SIZES = [10, 25, 50];

  // Manual fetch wrapper for the explicit CORS Cloud Functions
  async function fetchAction(name, data) {
    var user = firebase.auth().currentUser;
    if (!user) throw new Error("You must be signed in.");
    var token = await user.getIdToken();
    var res = await fetch('https://us-central1-paisley-89c77.cloudfunctions.net/' + name, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ data: data })
    });
    var json = await res.json();
    if (!res.ok || json.error) {
      throw new Error((json.error && json.error.message) || 'Request failed');
    }
    return json.result;
  }

  function ts(d) { var x = CU.toDate(d); return x ? x.getTime() : 0; }
  function statusBadge(s) {
    var cls = s === 'Active' ? 'b-confirmed' : (s === 'Suspended' ? 'b-declined' : 'b-pending');
    return '<span class="badge ' + cls + '">' + esc(s || 'Pending') + '</span>';
  }
  function guardians(s) { return (s.guardians && s.guardians.length ? s.guardians : (s.guardianEmail ? [{ name: s.guardianName, email: s.guardianEmail, phone: s.guardianPhone }] : [])); }
  function toast(el, msg, bad) { if (el) { el.textContent = msg; el.style.color = bad ? 'var(--error,#E74C3C)' : 'var(--brand-deep,#245F5A)'; } }
  function errMsg(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }

  function mount(root, opts) {
    CU.injectStyle(); WH.injectStyle();
    root.classList.add('cr-root');
    var S = {
      tab: 'students', dsub: 'classwork',
      students: [], links: [], parents: {}, loaded: false,
      q: '', status: 'all', ks: 'all', sort: 'newest', page: 1, size: 10, unsub: null
    };

    /* ---------------- data ---------------- */
    function listen() {
      if (S.unsub) S.unsub();
      S.unsub = db.collection('students').where('studentType', '==', 'remote').onSnapshot(function (snap) {
        S.students = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        S.loaded = true; loadLinks();
      }, function (e) { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">Could not load remote students: ' + esc(e.message || e) + '</div></div>'; });
    }
    async function loadLinks() {
      try {
        var ids = S.students.map(function (s) { return s.id; });
        var links = [];
        for (var i = 0; i < ids.length; i += 10) {
          var snap = await db.collection('parentStudentLinks').where('studentUid', 'in', ids.slice(i, i + 10)).get();
          snap.docs.forEach(function (d) { links.push(Object.assign({ id: d.id }, d.data())); });
        }
        S.links = links;
        var need = Array.from(new Set(links.map(function (l) { return l.parentUid; }))).filter(function (u) { return !S.parents[u]; });
        await Promise.all(need.map(function (u) { return db.collection('parentAccounts').doc(u).get().then(function (d) { S.parents[u] = d.exists ? Object.assign({ id: u }, d.data()) : { id: u, name: '(unknown)', email: '' }; }).catch(function () {}); }));
      } catch (e) { console.warn('remote links:', e); }
      render();
    }
    function parentsOf(sid) { return S.links.filter(function (l) { return l.studentUid === sid; }).map(function (l) { return S.parents[l.parentUid] || { id: l.parentUid, name: '…', email: '' }; }); }

    /* ---------------- shell ---------------- */
    function render() {
      var tabs = [
        ['students', 'fa-user-graduate', 'Students'],
        ['parents', 'fa-people-roof', 'Parents'],
        ['delivery', 'fa-chalkboard', 'Classroom & Homework'],
        ['support', 'fa-headset', 'Support']
      ];
      var h = '<div class="cr-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="cr-btn ' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><i class="fas ' + t[1] + '"></i> ' + t[2] + '</button>';
      }).join('') + '</div><div id="rsBody"></div>';
      root.innerHTML = h;
      var body = root.querySelector('#rsBody');
      if (S.tab === 'delivery') { renderDelivery(body); return; }
      if (!S.loaded) { body.innerHTML = '<div class="cr-empty">Loading remote students…</div>'; return; }
      if (S.tab === 'students') renderStudents(body);
      else if (S.tab === 'parents') renderParents(body);
      else renderSupport(body);
    }

    /* ---------------- students ---------------- */
    function filtered() {
      var q = S.q.trim().toLowerCase();
      var list = S.students.filter(function (s) {
        if (S.status !== 'all') { var st = s.status || 'Pending'; if (S.status === 'Invited' ? (st !== 'Active' || s.lastLoginAt) : st !== S.status) return false; }
        if (S.ks !== 'all' && s.keyStage !== S.ks) return false;
        if (q) {
          var hay = [s.name, s.email, s.phone, (s.guardians || []).map(function (g) { return g.name + ' ' + g.email; }).join(' '), lmzSubjectLabels(s.subjects).join(' ')].join(' ').toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      var by = { name: function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); },
        ks: function (a, b) { return String(a.keyStage || '').localeCompare(String(b.keyStage || '')) || (a.year || 0) - (b.year || 0); },
        newest: function (a, b) { return ts(b.createdAt) - ts(a.createdAt); },
        login: function (a, b) { return ts(b.lastLoginAt) - ts(a.lastLoginAt); } };
      return list.sort(by[S.sort] || by.newest);
    }
    function accountState(s) { return s.status === 'Suspended' ? 'Suspended' : (s.lastLoginAt ? 'Activated' : 'Invited — not yet signed in'); }

    function renderStudents(body) {
      var all = S.students, list = filtered();
      var pages = Math.max(1, Math.ceil(list.length / S.size)); if (S.page > pages) S.page = pages;
      var rows = list.slice((S.page - 1) * S.size, S.page * S.size);
      var n = function (f) { return all.filter(f).length; };
      var h = '<div class="cr-bar"><div><h3>Remote students</h3><div class="cr-sub">Admit and manage students who learn through the Remote Student portal.</div></div>' +
        '<button type="button" class="cr-btn primary" data-a="admit"><i class="fas fa-user-plus"></i> Admit remote student</button></div>' +
        '<div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' +
        [['Total', all.length], ['Active', n(function (s) { return s.status === 'Active'; })], ['Invited, not signed in', n(function (s) { return s.status === 'Active' && !s.lastLoginAt; })], ['Suspended', n(function (s) { return s.status === 'Suspended'; })]].map(function (x) {
          return '<div class="cr-panel" style="margin:0;padding:.8rem 1rem"><div style="font-size:1.4rem;font-weight:800;color:var(--brand-deep)">' + x[1] + '</div><div class="cr-note">' + x[0] + '</div></div>';
        }).join('') + '</div>' +
        '<div class="cr-filters"><input type="search" data-f="q" placeholder="Search name, email, parent, subject…" value="' + esc(S.q) + '" aria-label="Search remote students" style="min-width:230px">' +
        sel('status', S.status, [['all', 'All statuses'], ['Active', 'Active'], ['Invited', 'Invited, not signed in'], ['Suspended', 'Suspended']]) +
        sel('ks', S.ks, [['all', 'All Key Stages']].concat(CU.KEY_STAGES.map(function (k) { return [k, CU.ksShort(k)]; }))) +
        sel('sort', S.sort, [['newest', 'Newest first'], ['name', 'Name A–Z'], ['ks', 'Key Stage / Year'], ['login', 'Last sign-in']]) + '</div>';
      if (!rows.length) h += '<div class="cr-panel"><div class="cr-empty">' + (all.length ? 'No remote students match these filters.' : 'No remote students yet. Use “Admit remote student” to add the first one.') + '</div></div>';
      else {
        h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Student</th><th>Key Stage</th><th>Subjects</th><th>Parents / guardians</th><th>Account</th><th></th></tr></thead><tbody>' + rows.map(function (s) {
          var ps = parentsOf(s.id);
          return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email || '') + (s.phone ? ' · ' + esc(s.phone) : '') + '</div></td>' +
            '<td>' + esc(CU.ksShort(s.keyStage)) + '<div class="cr-note">' + (s.year ? 'Year ' + esc(s.year) : '') + '</div></td>' +
            '<td>' + (lmzSubjectLabels(s.subjects).length ? esc(lmzSubjectLabels(s.subjects).join(', ')) : '<span class="cr-note">None</span>') + '</td>' +
            '<td>' + (ps.length ? ps.map(function (p) { return esc(p.name || p.email); }).join('<br>') : esc(guardians(s).map(function (g) { return g.name || g.email; }).join(', ') || '—') + '<div class="cr-note">no portal account yet</div>') + '</td>' +
            '<td>' + statusBadge(s.status) + '<div class="cr-note">' + esc(accountState(s)) + '</div></td>' +
            '<td><div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="view" data-id="' + esc(s.id) + '"><i class="fas fa-eye"></i> Profile</button>' +
            '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + esc(s.id) + '"><i class="fas fa-pen"></i></button>' +
            (s.status === 'Suspended'
              ? '<button type="button" class="cr-btn sm" data-a="reactivate" data-id="' + esc(s.id) + '"><i class="fas fa-user-check"></i> Reactivate</button>'
              : '<button type="button" class="cr-btn sm danger" data-a="suspend" data-id="' + esc(s.id) + '"><i class="fas fa-user-slash"></i> Suspend</button>') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' +
          '<div class="cr-bar" style="margin-top:.7rem"><span class="cr-note">' + list.length + ' record' + (list.length === 1 ? '' : 's') + ' · page ' + S.page + ' of ' + pages + '</span><div class="cr-actions">' +
          '<select data-f="size" aria-label="Rows per page">' + PAGE_SIZES.map(function (z) { return '<option value="' + z + '"' + (z === S.size ? ' selected' : '') + '>' + z + ' per page</option>'; }).join('') + '</select>' +
          '<button type="button" class="cr-btn sm" data-a="prev"' + (S.page <= 1 ? ' disabled' : '') + '>Previous</button><button type="button" class="cr-btn sm" data-a="next"' + (S.page >= pages ? ' disabled' : '') + '>Next</button></div></div>';
      }
      body.innerHTML = h;
    }
    function sel(key, cur, pairs) {
      return '<select data-f="' + key + '" aria-label="' + esc(key) + '">' + pairs.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (String(cur) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>';
    }

    /* ---- admit / edit ---- */
    function subjectChecks(ks, chosen) {
      return lmzSubjectsForKeyStage(ks).map(function (s) {
        return '<label style="display:inline-flex;gap:.35rem;margin:0 .8rem .3rem 0;font-size:.84rem"><input type="checkbox" value="' + esc(s.id) + '"' + (chosen.indexOf(s.id) !== -1 ? ' checked' : '') + '> ' + esc(s.name) + '</label>';
      }).join('');
    }
    function guardianBlock(i, g) {
      g = g || {};
      return '<div class="cr-row2"><div class="cr-field"><label>Parent / guardian ' + (i + 1) + ' name</label><input type="text" data-g="' + i + '" data-k="name" value="' + esc(g.name || '') + '" maxlength="120"></div>' +
        '<div class="cr-field"><label>Email</label><input type="text" data-g="' + i + '" data-k="email" value="' + esc(g.email || '') + '" maxlength="200"></div></div>' +
        '<div class="cr-field"><label>Phone</label><input type="text" data-g="' + i + '" data-k="phone" value="' + esc(g.phone || '') + '" maxlength="40"></div>';
    }
    function readGuardians(m) {
      var out = [];
      [0, 1].forEach(function (i) {
        var g = {}; ['name', 'email', 'phone'].forEach(function (k) { var el = m.body.querySelector('[data-g="' + i + '"][data-k="' + k + '"]'); g[k] = el ? el.value.trim() : ''; });
        if (g.name || g.email || g.phone) out.push(g);
      });
      return out;
    }
    function studentForm(m, s) {
      var ks0 = s ? s.keyStage : CU.KEY_STAGES[1], chosen = s ? lmzSubjectKeys(s.subjects) : [];
      m.body.innerHTML = '<div class="cr-row2"><div class="cr-field"><label for="rsName">Full name</label><input type="text" id="rsName" maxlength="120" value="' + esc(s ? s.name : '') + '"></div>' +
        '<div class="cr-field"><label for="rsEmail">Student sign-in email</label><input type="text" id="rsEmail" maxlength="200" value="' + esc(s ? s.email : '') + '"' + (s ? ' disabled' : '') + '></div></div>' +
        '<div class="cr-field"><label for="rsPhone">Student phone (optional)</label><input type="text" id="rsPhone" maxlength="40" value="' + esc(s ? s.phone || '' : '') + '"></div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="rsKs">Key Stage</label><select id="rsKs">' + CU.KEY_STAGES.map(function (k) { return '<option value="' + esc(k) + '"' + (k === ks0 ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="rsYear">Year</label><select id="rsYear"></select></div></div>' +
        '<div class="cr-field"><label>Subjects</label><div id="rsSubjects"></div></div>' +
        (s ? '<div id="rsBoards"></div>' : '') +
        (s ? '' : '<h4 style="margin:.6rem 0;font-size:.8rem;color:var(--brand-deep)">Parents / guardians (at least one)</h4>' + guardianBlock(0) + '<details><summary class="cr-note" style="cursor:pointer">Add a second parent / guardian</summary>' + guardianBlock(1) + '</details>');
      var ks = m.body.querySelector('#rsKs'), yr = m.body.querySelector('#rsYear'), sb = m.body.querySelector('#rsSubjects');
      function fill(keep) {
        yr.innerHTML = lmzYearsForKeyStage(ks.value).map(function (y) { return '<option value="' + y + '"' + (s && Number(s.year) === y ? ' selected' : '') + '>Year ' + y + '</option>'; }).join('');
        var cur = keep ? Array.prototype.map.call(sb.querySelectorAll('input:checked'), function (c) { return c.value; }) : chosen;
        sb.innerHTML = subjectChecks(ks.value, cur);
      }
      var bx = m.body.querySelector('#rsBoards');
      function drawBoards() {
        if (!bx) return;
        var cur = bx.children.length ? CU.readBoardAssign(bx, 'rb') : { board: s.board || '', subjectBoards: s.subjectBoards || {} };
        var keys = Array.prototype.map.call(sb.querySelectorAll('input:checked'), function (c) { return c.value; });
        bx.innerHTML = '<h4 style="margin:.8rem 0 .4rem;font-size:.8rem;color:var(--brand-deep)">Exam board</h4>' + CU.boardAssignHtml(cur, keys, 'rb');
      }
      ks.addEventListener('change', function () { fill(true); drawBoards(); }); fill(false); drawBoards();
      sb.addEventListener('change', drawBoards);
      return function read() {
        return { name: m.body.querySelector('#rsName').value.trim(), email: m.body.querySelector('#rsEmail').value.trim(), phone: m.body.querySelector('#rsPhone').value.trim(),
          keyStage: ks.value, year: Number(yr.value), subjects: Array.prototype.map.call(sb.querySelectorAll('input:checked'), function (c) { return c.value; }),
          boards: bx && bx.children.length ? CU.readBoardAssign(bx, 'rb') : null };
      };
    }

    function openAdmit() {
      var m = CU.openModal({ title: 'Admit remote student', wide: true });
      var read = studentForm(m, null);
      m.foot.innerHTML = '<span class="cr-err" id="rsErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-paper-plane"></i> Admit and send invitation</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      var busy = false;
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        if (busy) return; var err = m.foot.querySelector('#rsErr'), btn = this; err.textContent = '';
        var d = read(); d.guardians = readGuardians(m);
        d.subjectNames = lmzSubjectLabels(d.subjects);
        if (!d.name || !/^\S+@\S+\.\S+$/.test(d.email)) { err.textContent = 'Enter the student’s name and a valid email.'; return; }
        if (!d.subjects.length) { err.textContent = 'Choose at least one subject.'; return; }
        if (!d.guardians.length || d.guardians.some(function (g) { return !/^\S+@\S+\.\S+$/.test(g.email || ''); })) { err.textContent = 'Each parent / guardian needs a valid email.'; return; }
        busy = true; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Admitting…';
        try {
          var r = await fetchAction('admitRemoteStudent', d);
          var okp = (r.parents || []).filter(function (p) { return p.parentUid; }).length;
          m.body.innerHTML = '<div class="cr-panel" style="margin:0"><h4 style="margin:0 0 .5rem;color:var(--brand-deep)"><i class="fas fa-circle-check" style="color:#1d8b57"></i> ' + (r.existing ? 'Already admitted' : 'Student admitted') + '</h4>' +
            '<p style="font-size:.88rem;margin:.2rem 0">' + (r.existing ? 'This email already belongs to a remote student; their parents were re-checked and no duplicate was created.' : (r.inviteSent ? 'An invitation with a single-use password link was emailed to ' + esc(d.email) + '.' : '<b>The invitation email could not be sent</b> (check the SMTP settings). Use “Resend invitation” from the student’s profile.')) + '</p>' +
            '<p style="font-size:.88rem;margin:.2rem 0">' + okp + ' parent / guardian account' + (okp === 1 ? '' : 's') + ' linked.</p></div>';
          m.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>'; m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(true); };
        } catch (e) { busy = false; btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Admit and send invitation'; err.textContent = errMsg(e); }
      };
    }

    function openEdit(s) {
      var m = CU.openModal({ title: 'Edit — ' + s.name, wide: true });
      var read = studentForm(m, s);
      m.foot.innerHTML = '<span class="cr-err" id="rsErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go">Save changes</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var err = m.foot.querySelector('#rsErr'), d = read(), btn = this;
        if (!d.name) { err.textContent = 'Name is required.'; return; }
        if (!d.subjects.length) { err.textContent = 'Choose at least one subject.'; return; }
        btn.disabled = true;
        try {
          var bset = {};
          if (d.boards) {
            var sbm = {}; d.subjects.forEach(function (k) { if (d.boards.subjectBoards[k]) sbm[k] = d.boards.subjectBoards[k]; });
            bset = { board: d.boards.board || firebase.firestore.FieldValue.delete(), subjectBoards: sbm };
          }
          await db.collection('students').doc(s.id).update(Object.assign({ name: d.name, phone: d.phone, keyStage: d.keyStage, year: d.year,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, bset, lmzSubjectWriteFields(d.subjects)));
          m.close(true);
        } catch (e) { err.textContent = errMsg(e); btn.disabled = false; }
      };
    }

    async function setStatus(s, status) {
      var verb = status === 'Suspended' ? 'Suspend' : 'Reactivate';
      var ok = await CU.confirmModal({ title: verb + ' access', danger: status === 'Suspended', confirmLabel: verb,
        message: status === 'Suspended' ? 'Suspend <b>' + esc(s.name) + '</b>? They will be signed out and unable to sign in until reactivated. Their work and records are kept.' : 'Reactivate <b>' + esc(s.name) + '</b>? They will be able to sign in again.' });
      if (!ok) return;
      try { await fetchAction('setRemoteStudentStatus', { studentId: s.id, status: status }); } catch (e) { alert('Could not update: ' + errMsg(e)); }
    }

    /* ---- profile + progress ---- */
    async function loadProgress(s) {
      var rows = [], year = s.year != null ? Number(s.year) : null;
      var subjects = lmzSubjectKeys(s.subjects);
      await Promise.all(subjects.map(async function (subj) {
        var cls = await CU.findClassroom(subj, year, s.keyStage).catch(function () { return null; });
        if (!cls) return;
        var topics = await CU.loadTopics(cls.id);
        await Promise.all(topics.map(async function (t) {
          var snap = await WH.coll(cls.id, t.id, 'assignment').where('audiences.remote', '==', true).get().catch(function () { return { docs: [] }; });
          await Promise.all(snap.docs.map(async function (d) {
            var it = Object.assign({ id: d.id, tid: t.id, cid: cls.id }, d.data());
            if (it.audience !== 'class' && (it.recipients || []).indexOf(s.id) === -1) return;
            var sd = await WH.coll(cls.id, t.id, 'assignment').doc(d.id).collection('submissions').doc(s.id).get().catch(function () { return null; });
            it.sub = sd && sd.exists ? sd.data() : null; it.subject = CU.displayName(cls); rows.push(it);
          }));
        }));
      }));
      return rows;
    }
    async function openProfile(s) {
      var m = CU.openModal({ title: s.name, wide: true });
      var ps = parentsOf(s.id);
      m.body.innerHTML = '<div class="cr-panel"><div class="cr-row2"><div><b>Email</b><div class="cr-note">' + esc(s.email || '—') + '</div><b>Phone</b><div class="cr-note">' + esc(s.phone || '—') + '</div></div>' +
        '<div><b>Key Stage</b><div class="cr-note">' + esc(s.keyStage || '—') + (s.year ? ' · Year ' + esc(s.year) : '') + '</div><b>Account</b><div class="cr-note">' + statusBadge(s.status) + ' ' + esc(accountState(s)) + (s.lastLoginAt ? ' · last sign-in ' + esc(CU.fmtDateTime(s.lastLoginAt)) : '') + '</div></div></div>' +
        '<b>Subjects</b><div class="cr-note">' + esc(lmzSubjectLabels(s.subjects).join(', ') || 'None') + '</div>' +
        '<b style="display:block;margin-top:.5rem">Parents / guardians</b><div class="cr-note">' + (ps.length ? ps.map(function (p) { return esc(p.name || '') + ' &lt;' + esc(p.email || '') + '&gt;'; }).join('<br>') : 'No linked portal account yet — open the Parents tab to link one.') + '</div></div>' +
        '<div id="rsProg"><div class="cr-empty">Loading homework progress…</div></div>';
      m.foot.innerHTML = '<span class="cr-err" id="rsErr"></span>' + (s.status !== 'Suspended' ? '<button type="button" class="cr-btn" data-a="invite"><i class="fas fa-envelope"></i> Resend invitation</button>' : '') + '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      var inv = m.foot.querySelector('[data-a="invite"]');
      if (inv) inv.onclick = async function () {
        inv.disabled = true; var e = m.foot.querySelector('#rsErr');
        try { var r = await fetchAction('resendRemoteInvite', { studentId: s.id }); toast(e, r.inviteSent ? 'Invitation sent.' : 'Could not send the email — check SMTP settings.', !r.inviteSent); }
        catch (x) { toast(e, errMsg(x), true); } inv.disabled = false;
      };
      try {
        var rows = await loadProgress(s), now = Date.now(), c = { submitted: 0, graded: 0, outstanding: 0, overdue: 0 };
        rows.forEach(function (it) {
          var due = CU.toDate(it.dueAt);
          if (it.sub && it.sub.status === 'Graded') c.graded++; else if (it.sub && it.sub.status !== 'In progress') c.submitted++;
          else { c.outstanding++; if (due && due.getTime() < now) c.overdue++; }
        });
        m.body.querySelector('#rsProg').innerHTML = '<h4 style="margin:.4rem 0;color:var(--brand-deep)">Homework progress</h4>' +
          '<div class="wk-chips" style="margin-bottom:.6rem"><span class="wk-chip">Awaiting marking: ' + c.submitted + '</span><span class="wk-chip">Graded: ' + c.graded + '</span><span class="wk-chip">Outstanding: ' + c.outstanding + '</span><span class="wk-chip" style="' + (c.overdue ? 'color:var(--error)' : '') + '">Overdue: ' + c.overdue + '</span></div>' +
          (rows.length ? '<div class="cr-table-wrap"><table class="cr-table" style="min-width:560px"><thead><tr><th>Homework</th><th>Subject</th><th>Due</th><th>Status</th><th>Mark</th></tr></thead><tbody>' + rows.sort(function (a, b) { return ts(a.dueAt) - ts(b.dueAt); }).map(function (it) {
            var st = WH.workState(it, it.sub, 'assignment');
            return '<tr><td>' + esc(it.title) + '</td><td>' + esc(it.subject) + '</td><td>' + esc(it.dueAt ? CU.fmtDateTime(it.dueAt) : '—') + '</td><td>' + WH.pill(st.cls, st.text, st.icon) + '</td><td>' + (it.sub && it.sub.released && it.sub.grade != null ? esc(WH.fmtScore(it.sub)) : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="cr-empty">No homework has been posted to remote students for this student’s subjects yet.</div>');
      } catch (e2) { m.body.querySelector('#rsProg').innerHTML = '<div class="cr-empty">Could not load progress: ' + esc(e2.message || e2) + '</div>'; }
    }

    /* ---------------- parents ---------------- */
    function renderParents(body) {
      var byParent = {};
      S.links.forEach(function (l) { (byParent[l.parentUid] = byParent[l.parentUid] || []).push(l); });
      var ids = Object.keys(byParent);
      var h = '<div class="cr-bar"><div><h3>Parents &amp; guardians</h3><div class="cr-sub">Linked to remote students through verified relationships. Parents see only their own linked children — and a parent of both online and remote children sees each child’s own content.</div></div></div>';
      if (!ids.length) h += '<div class="cr-panel"><div class="cr-empty">No parent accounts are linked to remote students yet. Admitting a student creates or links their parents automatically; you can also link one below.</div></div>';
      else h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Parent / guardian</th><th>Remote children</th><th></th></tr></thead><tbody>' + ids.map(function (pid) {
        var p = S.parents[pid] || { name: '…', email: '' };
        return '<tr><td><b>' + esc(p.name || '—') + '</b><div class="cr-note">' + esc(p.email || '') + '</div></td><td>' + byParent[pid].map(function (l) {
          var st = S.students.filter(function (x) { return x.id === l.studentUid; })[0];
          return '<div>' + esc(st ? st.name : '(removed)') + ' <button type="button" class="cr-btn sm danger" title="Remove this link" data-a="unlink" data-p="' + esc(pid) + '" data-s="' + esc(l.studentUid) + '"><i class="fas fa-link-slash"></i></button> ' +
            '<button type="button" class="cr-btn sm" title="Move this link to a different student" data-a="move" data-p="' + esc(pid) + '" data-s="' + esc(l.studentUid) + '"><i class="fas fa-right-left"></i></button></div>';
        }).join('') + '</td><td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="parent-reset" data-e="' + esc(p.email || '') + '"><i class="fas fa-envelope"></i> Send password setup email</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
      h += '<div class="cr-panel" style="margin-top:1rem"><h4 style="margin:0 0 .6rem;color:var(--brand-deep)">Create or link a parent</h4><div class="cr-row2">' +
        '<div class="cr-field"><label for="lpStudent">Remote student</label><select id="lpStudent">' + S.students.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="lpName">Parent name</label><input type="text" id="lpName" maxlength="120"></div></div><div class="cr-row2">' +
        '<div class="cr-field"><label for="lpEmail">Parent email</label><input type="text" id="lpEmail" maxlength="200"></div><div class="cr-field"><label for="lpPhone">Phone (required)</label><input type="text" id="lpPhone" maxlength="40"></div></div>' +
        '<div class="cr-actions"><button type="button" class="cr-btn primary" data-a="link-parent"' + (S.students.length ? '' : ' disabled') + '><i class="fas fa-user-plus"></i> Create / link parent</button><span class="cr-note" id="lpMsg" role="status"></span></div>' +
        '<div class="cr-note" style="margin-top:.4rem">An existing parent account (matched by email) is reused — never duplicated — and a new parent receives a single-use password link.</div></div>';
      body.innerHTML = h;
    }
    async function linkParent(body) {
      var msg = body.querySelector('#lpMsg'), sid = body.querySelector('#lpStudent').value;
      var name = body.querySelector('#lpName').value.trim(), email = body.querySelector('#lpEmail').value.trim(), phone = body.querySelector('#lpPhone').value.trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || phone.replace(/\D/g, '').length < 6) { toast(msg, 'Enter the parent’s name, a valid email and a phone number (required).', true); return; }
      toast(msg, 'Working…');
      try {
        var r = await fn('createParentAccount', { studentId: sid, parentEmail: email, parentName: name, parentPhone: phone });
        var x = (r.results || [])[0] || {};
        toast(msg, x.skipped ? 'Skipped: ' + x.skipped : (x.created ? 'Parent account created and email sent.' : 'Existing parent account linked.'), !!x.skipped);
        await loadLinks();
      } catch (e) { toast(msg, errMsg(e), true); }
    }
    async function unlink(pid, sid) {
      var st = S.students.filter(function (x) { return x.id === sid; })[0];
      var ok = await CU.confirmModal({ title: 'Remove parent link', danger: true, confirmLabel: 'Remove link', message: 'Stop <b>' + esc((S.parents[pid] || {}).name || 'this parent') + '</b> seeing <b>' + esc(st ? st.name : 'this student') + '</b>’s portal data? Their parent account is kept.' });
      if (!ok) return;
      try { await db.collection('parentStudentLinks').doc(pid + '_' + sid).delete(); await loadLinks(); } catch (e) { alert('Could not remove: ' + errMsg(e)); }
    }
    function move(pid, sid) {
      var m = CU.openModal({ title: 'Move parent link' });
      m.body.innerHTML = '<p style="font-size:.88rem;margin-top:0">Use this to correct a link made to the wrong child. The parent will lose access to the current student and gain access to the one you choose.</p><div class="cr-field"><label for="mvTo">Correct remote student</label><select id="mvTo">' +
        S.students.filter(function (x) { return x.id !== sid; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div>';
      m.foot.innerHTML = '<span class="cr-err" id="mvErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go">Move link</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var to = m.body.querySelector('#mvTo').value; if (!to) return; this.disabled = true;
        try {
          var b = db.batch();
          b.delete(db.collection('parentStudentLinks').doc(pid + '_' + sid));
          b.set(db.collection('parentStudentLinks').doc(pid + '_' + to), { parentUid: pid, studentUid: to, createdAt: firebase.firestore.FieldValue.serverTimestamp(), correctedFrom: sid });
          await b.commit(); m.close(true); await loadLinks();
        } catch (e) { m.foot.querySelector('#mvErr').textContent = errMsg(e); this.disabled = false; }
      };
    }
    async function parentReset(email) {
      if (!email) return;
      try { await firebase.auth().sendPasswordResetEmail(email, { url: location.origin + '/parent/index.html' }); alert('Password setup email sent to ' + email + '.'); }
      catch (e) { alert('Could not send: ' + errMsg(e)); }
    }

    /* ---------------- delivery: classwork / content / homework / exams ---------------- */
    function renderDelivery(body) {
      var sub = S.dsub || 'classwork';
      var tabs = [
        ['classwork', 'Classwork'],
        ['content', 'Posted content'],
        ['homework', 'Homework & marking'],
        ['exams', 'Exams & marking']
      ];
      body.innerHTML = '<div class="cr-tabs">' + tabs.map(function (t) {
          return '<button type="button" class="cr-btn ' + (sub === t[0] ? 'on' : '') + '" data-a="dsub" data-v="' + t[0] + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="rsDel"></div>';
      var host = body.querySelector('#rsDel');
      if (sub === 'classwork') { renderClasswork(host); return; }
      if (sub === 'content') { renderPostedContent(host); return; }
      // Homework / Exams: same management screens (and ink grading) used everywhere else, narrowed to remote work + remote students.
      WorkUI.mountManagement(host, { 
        kind: sub === 'exams' ? 'exams' : 'homework', 
        role: 'admin', 
        uid: opts.uid, 
        name: opts.name || 'Studio Desk', 
        audience: 'remote',
        monitoringOnly: true 
      });
    }

    /* ---------------- classwork (remote-scoped classroom builder) ---------------- */
    function renderClasswork(host) {
      host.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem">' +
        '<i class="fas fa-house-laptop"></i> ' +
        'Author lessons and resources for <b>remote students only</b>. Every lesson saved here is posted to Remote — no need to pick an audience. ' +
        'Online students and tutors never see this content.</div>' +
        '<div id="rsCw"></div>';
      var inner = host.querySelector('#rsCw');
      CU.injectStyle();
      global.ClassroomUI.mountManager(inner, {
        role: 'admin',
        uid: opts.uid,
        name: opts.name || 'Studio Desk',
        scope: 'remote'
      });
    }

    async function renderPostedContent(host) {
      host.innerHTML = '<div class="cr-filters">' +
        '<select id="pcKs" aria-label="Key Stage"><option value="">Choose a Key Stage</option>' + CU.KEY_STAGES.map(function (k) { return '<option value="' + esc(k) + '"' + (S.pcKs === k ? ' selected' : '') + '>' + esc(CU.ksShort(k)) + '</option>'; }).join('') + '</select></div><div id="pcOut"><div class="cr-empty">Choose a Key Stage to see what has been posted to remote students.</div></div>';
      var ksEl = host.querySelector('#pcKs'), out = host.querySelector('#pcOut');
      async function load() {
        S.pcKs = ksEl.value; if (!S.pcKs) return;
        out.innerHTML = '<div class="cr-empty">Loading…</div>';
        try {
          var cls = CU.snapDocs(await db.collection('classrooms').where('keyStage', '==', S.pcKs).get()), rows = [];
          await Promise.all(cls.map(async function (c) { // every classroom at once (was one at a time)
            var topics = await CU.loadTopics(c.id);
            await Promise.all(topics.map(async function (t) {
              var r = await Promise.all([
                CU.clsRef(c.id).collection('topics').doc(t.id).collection('lessons').where('audiences.remote', '==', true).get().catch(function () { return { docs: [] }; }),
                WH.coll(c.id, t.id, 'assignment').where('audiences.remote', '==', true).get().catch(function () { return { docs: [] }; })]);
              r[0].docs.forEach(function (d) { var x = d.data(); rows.push({ k: 'Lesson', title: x.title, cls: CU.displayName(c) + ' · Year ' + c.year, topic: t.title, state: x.status === 'published' ? 'Live' : x.status, at: (x.publication && x.publication.remote && x.publication.remote.publishedAt) || x.publishedAt }); });
              r[1].docs.forEach(function (d) { var x = d.data(); rows.push({ k: 'Homework', title: x.title, cls: CU.displayName(c) + ' · Year ' + c.year, topic: t.title, state: x.dueAt ? 'Due ' + CU.fmtDateTime(x.dueAt) : 'No deadline', at: (x.publication && x.publication.remote && x.publication.remote.publishedAt) }); });
            }));
            var fx = await db.collection('classrooms').doc(c.id).collection('exams').where('audiences.remote', '==', true).get().catch(function () { return { docs: [] }; });
            fx.docs.forEach(function (d) { var x = d.data(); rows.push({ k: 'Exam', title: x.title, cls: CU.displayName(c) + ' · Year ' + c.year, topic: x.examType || '', state: x.status, at: x.publication && x.publication.remote && x.publication.remote.publishedAt }); });
          }));
          rows.sort(function (a, b) { return ts(b.at) - ts(a.at); });
          out.innerHTML = rows.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Type</th><th>Title</th><th>Classroom</th><th>Topic</th><th>State / deadline</th><th>Posted</th></tr></thead><tbody>' + rows.map(function (r) {
            return '<tr><td>' + esc(r.k) + '</td><td><b>' + esc(r.title) + '</b></td><td>' + esc(r.cls) + '</td><td>' + esc(r.topic) + '</td><td>' + esc(r.state || '') + '</td><td>' + esc(r.at ? CU.fmtDateTime(r.at) : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">Nothing has been posted to remote students in this Key Stage yet.</div></div>';
        } catch (e) { out.innerHTML = '<div class="cr-empty">Could not load: ' + esc(e.message || e) + '</div>'; }
      }
      ksEl.addEventListener('change', load); if (S.pcKs) load();
    }

    /* ---------------- support ---------------- */
    async function renderSupport(body) {
      body.innerHTML = '<div class="cr-empty">Loading tickets…</div>';
      try {
        var snap = await db.collection('tickets').where('studentType', '==', 'remote').get();
        var rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return ts(b.createdAt) - ts(a.createdAt); });
        body.innerHTML = '<div class="cr-bar"><div><h3>Remote student tickets</h3><div class="cr-sub">Raised from the Remote Student portal. Reply from the existing Student Tickets screen.</div></div><button type="button" class="cr-btn" data-a="goto-tickets"><i class="fas fa-headset"></i> Open Student Tickets</button></div>' +
          (rows.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Student</th><th>Subject</th><th>Status</th><th>Raised</th></tr></thead><tbody>' + rows.map(function (t) {
            return '<tr><td>' + esc(t.studentName || '') + '</td><td><b>' + esc(t.subject || '') + '</b><div class="cr-note">' + esc((t.message || '').slice(0, 120)) + '</div></td><td>' + esc(t.status || 'Open') + '</td><td>' + esc(t.createdAt ? CU.fmtDateTime(t.createdAt) : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No tickets from remote students yet.</div></div>');
      } catch (e) { body.innerHTML = '<div class="cr-empty">Could not load tickets: ' + esc(e.message || e) + '</div>'; }
    }

    /* ---------------- events ---------------- */
    function find(id) { return S.students.filter(function (x) { return x.id === id; })[0]; }
    function gotoNav(view) { var b = document.querySelector('.nav-item[data-view="' + view + '"]'); if (b) b.click(); }
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return; var a = el.dataset.a, id = el.dataset.id;
      if (a === 'tab') { S.tab = el.dataset.v; render(); }
      else if (a === 'admit') openAdmit();
      else if (a === 'view') { var s = find(id); if (s) openProfile(s); }
      else if (a === 'edit') { var s2 = find(id); if (s2) openEdit(s2); }
      else if (a === 'suspend') { var s3 = find(id); if (s3) setStatus(s3, 'Suspended'); }
      else if (a === 'reactivate') { var s4 = find(id); if (s4) setStatus(s4, 'Active'); }
      else if (a === 'prev') { S.page = Math.max(1, S.page - 1); render(); }
      else if (a === 'next') { S.page++; render(); }
      else if (a === 'link-parent') linkParent(root.querySelector('#rsBody'));
      else if (a === 'unlink') unlink(el.dataset.p, el.dataset.s);
      else if (a === 'move') move(el.dataset.p, el.dataset.s);
      else if (a === 'parent-reset') parentReset(el.dataset.e);
      else if (a === 'dsub') { S.dsub = el.dataset.v; render(); }
      else if (a === 'goto-tickets') gotoNav('tickets');
    });
    root.addEventListener('change', function (e) {
      var f = e.target.dataset && e.target.dataset.f; if (!f) return;
      if (f === 'size') S.size = Number(e.target.value); else S[f] = e.target.value; S.page = 1; render();
    });
    root.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.f === 'q') { S.q = e.target.value; S.page = 1; var pos = e.target.selectionStart; render(); var i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
    });

    render(); listen();
    return { destroy: function () { if (S.unsub) S.unsub(); } };
  }

  global.RemoteAdmin = { mount: mount };
})(window);