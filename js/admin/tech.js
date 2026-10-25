/* =========================================================
   TECH (admin) — Paisley Studio · mounted inside admin/index.html like Tuition.
   TechAdmin.mount(rootEl, { uid, name }) -> { destroy() }
   Tabs: Dashboard · Students (incl. pending) · Coaches · Paths · Missions ·
         Challenges · AI Toolbox · Projects · Showcase
   A TECH student is students/{uid} with studentType "tech". Coaches are the existing tutorAccounts.
   Needs: tech-helpers.js, tech.css, firebase firestore.
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechData, esc = T.esc;
  var DAY = 864e5;
  var CATS = [['AI assistants', /assistant|chatbot|buddy|bot/i], ['Websites', /web|site|landing/i], ['Games', /game|play/i], ['Creative projects', /creative|campaign|film|video|music|image|story|brand/i],
    ['Research projects', /research|science|investig|study/i], ['Business projects', /business|shop|market|startup|budget|finance/i], ['Apps', /\bapp\b|mobile|dashboard/i]];
  function catOf(p) { var s = p.title + ' ' + (p.skills || []).join(' '); for (var i = 0; i < CATS.length; i++) if (CATS[i][1].test(s)) return CATS[i][0]; return 'Other'; }

  // generic content schemas: one editor + table for paths / missions / challenges / tools
  var SCHEMA = {
    techPaths: { label: 'Learning path', f: [['title', 'Title'], ['level', 'Level (1–7)', 'number'], ['blurb', 'What students learn', 'area'], ['order', 'Order', 'number'], ['published', 'Published', 'bool']], cols: ['title', 'level', 'published'] },
    techMissions: { label: 'Mission', f: [['title', 'Title'], ['pathId', 'Learning path', 'path'], ['brief', 'Mission brief', 'area'], ['topics', 'Topics (comma separated)'], ['skills', 'Skills (comma separated)'], ['link', 'Resource link (https://…)'], ['order', 'Order', 'number'], ['published', 'Published', 'bool']], cols: ['title', 'pathId', 'published'] },
    techChallenges: { label: 'Challenge', f: [['title', 'Title'], ['brief', 'Challenge brief', 'area'], ['deadline', 'Deadline (text, e.g. 30 Nov)'], ['starter', 'Starter material link (https://…)'], ['order', 'Order', 'number'], ['published', 'Published', 'bool']], cols: ['title', 'deadline', 'published'] },
    techTools: { label: 'Tool / resource', f: [['title', 'Name'], ['category', 'Outcome', 'cat'], ['group', 'Group (e.g. Chatbots, Images, Research)'], ['what', 'What it does', 'area'], ['how', 'How to use it', 'area'], ['example', 'Example'], ['url', 'Link (https://…)'], ['order', 'Order', 'number'], ['published', 'Published', 'bool']], cols: ['title', 'category', 'published'] }
  };

  function mount(root, o) {
    var fs = firebase.firestore(), S = { tab: 'dash', students: [], projects: [], show: [], tutors: [], content: {}, filter: 'Pending' }, offs = [];
    var TABS = [['dash', 'Dashboard'], ['students', 'Students'], ['coaches', 'Coaches'], ['techPaths', 'Learning paths'], ['techMissions', 'Missions'], ['techChallenges', 'Challenges'], ['techTools', 'AI Toolbox'], ['projects', 'Projects'], ['messages', 'Messages'], ['showcase', 'Showcase']];
    function msg(t, bad) { var el = root.querySelector('#txaMsg'); if (el) { el.textContent = t; el.style.color = bad ? 'var(--tx-err)' : 'var(--tx-deep)'; } }
    function nameOf(id) { var t = S.tutors.filter(function (x) { return x.id === id; })[0]; return t ? (t.name || t.displayName || t.email || id) : '—'; }
    function pathName(id) { var p = (S.content.techPaths || []).filter(function (x) { return x.id === id; })[0]; return p ? p.title : '—'; }
    function load(col) { return fs.collection(col).get().then(function (s) { S.content[col] = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }); }

    var chat = null;
    function draw() {
      if (chat) { chat.destroy(); chat = null; }
      root.innerHTML = '<div class="tx-tabs" role="tablist">' + TABS.map(function (t) { return '<button class="tx-tab ' + (S.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '">' + t[1] + (t[0] === 'students' && pend().length ? ' (' + pend().length + ')' : '') + '</button>'; }).join('') + '</div><div id="txaBody"></div><div class="tx-msg" id="txaMsg" role="status"></div>';
      var b = root.querySelector('#txaBody'), v = S.tab;
      if (v === 'dash') dash(b); else if (v === 'students') students(b); else if (v === 'coaches') coaches(b);
      else if (SCHEMA[v]) crud(b, v); else if (v === 'projects') projects(b); else if (v === 'messages') messages(b); else showcase(b);
    }
    function pend() { return S.students.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }); }
    function stat(n, l) { return '<div class="tx-stat"><b>' + n + '</b><span>' + l + '</span></div>'; }

    function dash(b) {
      var now = Date.now(), act = S.students.filter(function (s) { return s.status === 'Active'; }).length;
      var building = S.projects.filter(function (p) { return p.status === 'BUILDING' || p.status === 'TESTING'; }).length;
      var week = S.projects.filter(function (p) { return p.status === 'READY' && now - (T.toDate(p.updatedAt) || 0) < 7 * DAY; }).length;
      var review = S.projects.filter(function (p) { return p.status === 'TESTING' || p.showcase === 'requested'; }).length;
      var counts = {}; S.projects.forEach(function (p) { var c = catOf(p); counts[c] = (counts[c] || 0) + 1; });
      b.innerHTML = '<h3 style="font-family:Quicksand;color:var(--tx-deep);margin:0 0 .6rem">TECH activity</h3><div class="tx-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">' +
        stat(act, 'students enrolled') + stat(building, 'building right now') + stat(week, 'projects completed this week') + stat(review, 'awaiting review') + stat(pend().length, 'new accounts pending') + stat(S.show.length, 'on the TECH Wall') + '</div>' +
        '<h3 style="font-family:Quicksand;color:var(--tx-deep);margin:1.4rem 0 .6rem">What are they building?</h3>' +
        (S.projects.length ? '<div class="tx-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">' + Object.keys(counts).map(function (k) { return '<div class="tx-card"><b style="font-size:1.5rem;color:var(--tx-deep)">' + counts[k] + '</b><div class="tx-muted tx-small">' + k + '</div></div>'; }).join('') + '</div>' : '<div class="tx-empty">No builds yet. Once TECH students start projects, you’ll see what they’re making here.</div>');
    }

    function students(b) {
      var list = S.students.filter(function (s) { return S.filter === 'All' || (s.status || 'Pending') === S.filter; });
      b.innerHTML = '<div class="tx-field" style="max-width:220px"><label>Show</label><select id="txaF">' + ['Pending', 'Active', 'Inactive', 'All'].map(function (x) { return '<option ' + (x === S.filter ? 'selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
        (list.length ? '<div class="tx-scroll"><table class="tx-table"><thead><tr><th>Student</th><th>Status</th><th>Coach</th><th>Interests</th><th></th></tr></thead><tbody>' + list.map(function (s) {
          var cid = (s.tutorIds && s.tutorIds[0]) || s.tutorId || '';
          return '<tr><td><b>' + esc(s.name) + '</b><div class="tx-muted tx-small">' + esc(s.email) + (s.ageGroup === 'u18' ? ' · under 18, guardian ' + esc(s.guardianEmail) : '') + '</div></td><td><span class="tx-chip ' + (s.status === 'Active' ? 'ok' : s.status === 'Inactive' ? 'warn' : 'gold') + '">' + esc(s.status || 'Pending') + '</span></td>' +
            '<td><select data-coach="' + s.id + '"><option value="">— none —</option>' + S.tutors.map(function (t) { return '<option value="' + t.id + '" ' + (t.id === cid ? 'selected' : '') + '>' + esc(t.name || t.displayName || t.email) + '</option>'; }).join('') + '</select></td>' +
            '<td class="tx-small">' + esc((s.techProfile && s.techProfile.identity) || '') + (s.techProfile && s.techProfile.goals && s.techProfile.goals.length ? ' · ' + esc(s.techProfile.goals.join(', ')) : '') + '</td>' +
            '<td>' + (s.status === 'Active' ? '<button class="tx-btn sm ghost" data-st="Inactive" data-id="' + s.id + '">Deactivate</button>' : '<button class="tx-btn sm" data-st="Active" data-id="' + s.id + '">Approve</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="tx-empty">No ' + S.filter.toLowerCase() + ' TECH students.</div>');
    }
    function coaches(b) {
      b.innerHTML = S.tutors.length ? '<div class="tx-grid">' + S.tutors.map(function (t) {
        var mine = S.students.filter(function (s) { return (s.tutorIds || []).indexOf(t.id) > -1 || s.tutorId === t.id; }), ps = S.projects.filter(function (p) { return (p.coachIds || []).indexOf(t.id) > -1; });
        return '<div class="tx-card"><span class="tx-chip">COACH</span><h3 style="font-size:1.05rem;margin:.4rem 0;color:var(--tx-deep)">' + esc(t.name || t.displayName || t.email) + '</h3><div class="tx-muted tx-small">' + mine.length + ' TECH builders · ' + ps.length + ' builds · ' + ps.filter(function (p) { return p.status === 'TESTING'; }).length + ' to review</div></div>';
      }).join('') + '</div><p class="tx-muted tx-small">Coaches are your existing tutors. Assign them to builders in the Students tab.</p>' : '<div class="tx-empty">No tutor accounts found.</div>';
    }

    function crud(b, col) {
      var sc = SCHEMA[col], list = S.content[col];
      if (!list) { b.innerHTML = '<div class="tx-empty">Loading…</div>'; load(col).then(draw, function (e) { msg(e.message, true); }); return; }
      b.innerHTML = '<button class="tx-btn sm" data-new="' + col + '">+ New ' + sc.label.toLowerCase() + '</button><div style="margin-top:.8rem">' + (list.length ? '<div class="tx-scroll"><table class="tx-table"><thead><tr>' + sc.cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' + list.map(function (r) {
        return '<tr>' + sc.cols.map(function (c) { var v = r[c]; if (c === 'published') v = v ? '<span class="tx-chip ok">Live</span>' : '<span class="tx-chip">Draft</span>'; else if (c === 'pathId') v = esc(pathName(v)); else v = esc(v); return '<td>' + v + '</td>'; }).join('') +
          '<td style="white-space:nowrap"><button class="tx-btn sm ghost" data-edit="' + col + '" data-id="' + r.id + '">Edit</button> <button class="tx-btn sm danger" data-del="' + col + '" data-id="' + r.id + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="tx-empty">Nothing here yet. Add the first ' + sc.label.toLowerCase() + '.</div>') + '</div>';
      if (col === 'techMissions' && !S.content.techPaths) load('techPaths').then(draw);
    }
    function editor(col, id) {
      var sc = SCHEMA[col], rec = (S.content[col] || []).filter(function (x) { return x.id === id; })[0] || { published: false };
      var ov = document.createElement('div'); ov.className = 'tx-ov';
      ov.innerHTML = '<div class="tx-modal" style="max-width:560px"><h3>' + (id ? 'Edit ' : 'New ') + sc.label.toLowerCase() + '</h3>' + sc.f.map(function (f) {
        var k = f[0], t = f[2], v = rec[k] == null ? '' : rec[k], h;
        if (t === 'area') h = '<textarea data-k="' + k + '">' + esc(v) + '</textarea>';
        else if (t === 'bool') h = '<select data-k="' + k + '" data-t="bool"><option value="0">Draft (hidden)</option><option value="1" ' + (v ? 'selected' : '') + '>Published</option></select>';
        else if (t === 'cat') h = '<select data-k="' + k + '">' + Object.keys(T.TOOL_CATS).map(function (c) { return '<option ' + (c === v ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select>';
        else if (t === 'path') h = '<select data-k="' + k + '"><option value="">—</option>' + (S.content.techPaths || []).map(function (p) { return '<option value="' + p.id + '" ' + (p.id === v ? 'selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select>';
        else h = '<input data-k="' + k + '" ' + (t === 'number' ? 'type="number" data-t="num"' : '') + ' value="' + esc(v) + '">';
        return '<div class="tx-field"><label>' + f[1] + '</label>' + h + '</div>';
      }).join('') + '<div style="display:flex;gap:.5rem"><button class="tx-btn" id="eSave">Save</button><button class="tx-btn ghost" id="eNo">Cancel</button></div><div class="tx-msg" id="eMsg"></div></div>';
      document.body.appendChild(ov);
      ov.querySelector('#eNo').onclick = function () { ov.remove(); };
      ov.querySelector('#eSave').onclick = function () {
        var d = {}; ov.querySelectorAll('[data-k]').forEach(function (el) { d[el.dataset.k] = el.dataset.t === 'bool' ? el.value === '1' : el.dataset.t === 'num' ? Number(el.value || 0) : el.value.trim(); });
        if (!d.title) { ov.querySelector('#eMsg').textContent = 'A title is required.'; return; }
        ['link', 'starter', 'url'].forEach(function (k) { if (d[k] && !T.safeUrl(d[k])) d[k] = ''; });
        var ref = id ? fs.collection(col).doc(id).update(d) : fs.collection(col).add(Object.assign(d, { createdBy: o.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
        ref.then(function () { ov.remove(); return load(col); }).then(draw).catch(function (e) { ov.querySelector('#eMsg').textContent = e.message; });
      };
    }

    function messages(b) {
      b.innerHTML = '<div id="txaChat"></div>';
      chat = g.TechUI.mountChat(b.querySelector('#txaChat'), { uid: o.uid, name: o.name || 'Studio Desk', role: 'admin', emptyText: 'No coach–student conversations yet. You can read and join any of them here.', loadThreads: function () {
        return fs.collection('techChats').get().then(function (sn) { return sn.docs.map(function (d) { var c = d.data(); return { id: d.id, title: (c.studentName || 'Student') + ' ↔ ' + (c.tutorName || 'Coach'), studentId: c.studentId, studentName: c.studentName, tutorId: c.tutorId, tutorName: c.tutorName, exists: true }; }); });
      } });
    }
    function projects(b) {
      b.innerHTML = S.projects.length ? '<div class="tx-scroll"><table class="tx-table"><thead><tr><th>Build</th><th>Builder</th><th>Status</th><th>Coach</th><th></th></tr></thead><tbody>' + S.projects.map(function (p) {
        return '<tr><td><b>' + esc(p.title) + '</b><div class="tx-muted tx-small">' + esc(catOf(p)) + '</div></td><td>' + esc(p.ownerName) + '</td><td><span class="tx-chip">' + p.status + '</span> ' + (p.progress || 0) + '%</td><td class="tx-small">' + esc((p.coachIds || []).map(nameOf).join(', ') || '—') + '</td><td><button class="tx-btn sm" data-open="' + p.id + '">Review</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="tx-empty">No student builds yet.</div>';
    }
    function showcase(b) {
      var req = S.projects.filter(function (p) { return p.showcase === 'requested'; });
      b.innerHTML = '<h3 style="font-family:Quicksand;color:var(--tx-deep);margin:0 0 .5rem">Waiting for approval</h3>' + (req.length ? req.map(function (p) { return '<div class="tx-card" style="margin-bottom:.5rem;display:flex;justify-content:space-between;gap:1rem;align-items:center"><div><b>' + esc(p.title) + '</b><div class="tx-muted tx-small">by ' + esc(T.firstName(p.ownerName)) + '</div></div><button class="tx-btn sm" data-open="' + p.id + '">Review &amp; publish</button></div>'; }).join('') : '<div class="tx-empty">No requests.</div>') +
        '<h3 style="font-family:Quicksand;color:var(--tx-deep);margin:1.2rem 0 .5rem">On the TECH Wall</h3>' + (S.show.length ? '<div class="tx-grid">' + S.show.map(function (w) { return '<div class="tx-card"><b>' + esc(w.title) + '</b><div class="tx-muted tx-small">by ' + esc(w.displayName) + '</div><div style="margin-top:.6rem;display:flex;gap:.4rem"><button class="tx-btn sm ' + (w.featured ? 'gold' : 'ghost') + '" data-feat="' + w.id + '">' + (w.featured ? 'Featured' : 'Feature') + '</button><button class="tx-btn sm danger" data-unpub="' + w.id + '">Remove</button></div></div>'; }).join('') + '</div>' : '<div class="tx-empty">Nothing published yet.</div>');
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return; var d = t.dataset;
      if (d.tab) { S.tab = d.tab; draw(); }
      else if (d.st) fs.collection('students').doc(d.id).update({ status: d.st, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).then(function () { msg('Updated.'); }).catch(function (er) { msg(er.message, true); });
      else if (d.new) editor(d.new);
      else if (d.edit) editor(d.edit, d.id);
      else if (d.del) { if (confirm('Delete this item? This cannot be undone.')) fs.collection(d.del).doc(d.id).delete().then(function () { return load(d.del); }).then(draw).catch(function (er) { msg(er.message, true); }); }
      else if (d.open) g.TechUI.openProject(d.open, { role: 'admin', uid: o.uid, name: o.name || 'Studio Desk' });
      else if (d.feat) { var w = S.show.filter(function (x) { return x.id === d.feat; })[0]; fs.collection('techShowcase').doc(d.feat).update({ featured: !w.featured }).catch(function (er) { msg(er.message, true); }); }
      else if (d.unpub) { if (confirm('Remove this build from the public TECH Wall?')) T.unpublish(d.unpub).catch(function (er) { msg(er.message, true); }); }
    });
    root.addEventListener('change', function (e) {
      var s = e.target;
      if (s.id === 'txaF') { S.filter = s.value; draw(); }
      else if (s.dataset.coach !== undefined) {   // assign a coach: student doc + coachIds on their builds
        var sid = s.dataset.id || s.dataset.coach, tid = s.value, ids = tid ? [tid] : [];
        var b = fs.batch(); b.update(fs.collection('students').doc(sid), { tutorIds: ids, tutorId: tid || firebase.firestore.FieldValue.delete(), tutorName: tid ? nameOf(tid) : firebase.firestore.FieldValue.delete() });
        S.projects.filter(function (p) { return p.ownerId === sid; }).forEach(function (p) { b.update(fs.collection('techProjects').doc(p.id), { coachIds: ids }); });
        b.commit().then(function () { msg('Coach updated.'); }).catch(function (er) { msg(er.message, true); });
      }
    });

    function listen(q, key, fn) { offs.push(q.onSnapshot(function (sn) { S[key] = sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); if (fn) fn(); if (S.tab !== 'projects' || !document.querySelector('.tx-ov')) draw(); }, function (er) { msg(er.message, true); })); }
    fs.collection('tutorAccounts').get().then(function (sn) { S.tutors = sn.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); draw(); }).catch(function () { });
    listen(fs.collection('students').where('studentType', '==', 'tech'), 'students');
    listen(fs.collection('techProjects'), 'projects', function () { S.projects.sort(function (a, b) { return (T.toDate(b.updatedAt) || 0) - (T.toDate(a.updatedAt) || 0); }); });
    listen(fs.collection('techShowcase'), 'show');
    draw();
    return { destroy: function () { offs.forEach(function (f) { f(); }); if (chat) chat.destroy(); } };
  }
  g.TechAdmin = { mount: mount };
})(window);
