/* =========================================================
   TECH (admin) — Paisley Studio · mounted inside admin/index.html like Tuition.
   TechAdmin.mount(rootEl, { uid, name }) -> { destroy() }
   Tabs: Applications · Builders · Builds · Content · Messages · TECH Wall
   Registration channel: student signs up (Pending) -> admin approves / declines here
   -> Active (unlocked, welcome email + bell via functions/tech.js) -> Inactive (locked) -> unlock again.
   Data model (same as tech/dashboard.html + js/tech/tech-helpers.js):
     students/{uid} studentType "tech", status, techCoachId/techCoachName
     techBuilds, techContent, techShowcase, techChats (+ /messages)
   Needs: classroom-helpers.js (ClassroomUI), tech-helpers.js (TechUI), firebase.
========================================================= */
(function (g) {
  'use strict';
  var CU = g.ClassroomUI.util, T = g.TechUI, esc = CU.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var KINDS = [['mission', 'Mission'], ['topic', 'Topic'], ['challenge', 'Challenge'], ['resource', 'Resource']];

  function ts(d) { var x = CU.toDate(d); return x ? x.getTime() : 0; }
  function errMsg(e) { return T.errMsg(e); }
  function badge(s) {
    var cls = s === 'Active' ? 'b-confirmed' : (s === 'Inactive' || s === 'Declined' ? 'b-declined' : 'b-pending');
    return '<span class="badge ' + cls + '">' + esc(s || 'Pending') + '</span>';
  }
  function stat(n, l) { return '<div class="cr-panel" style="margin:0;padding:.8rem 1rem"><div style="font-size:1.4rem;font-weight:800;color:var(--brand-deep)">' + n + '</div><div class="cr-note">' + l + '</div></div>'; }
  function fmtDate(d) { var x = CU.toDate(d); return x ? x.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

  function mount(root, o) {
    var db = (typeof g.db !== 'undefined' && g.db) || (typeof window.db !== 'undefined' && window.db) || firebase.firestore();
    CU.injectStyle(); T.injectStyle();
    root.classList.add('cr-root');
    var S = { tab: 'applications', students: [], builds: [], wall: [], content: [], chats: [], tutors: [], loaded: false, q: '', status: 'all', kind: 'all', unsubs: [], ws: null, chat: null };

    function status(s) { return s.status || 'Pending'; }
    function pending() { return S.students.filter(function (s) { return status(s) === 'Pending'; }); }
    function reviewNeeded() { return S.builds.filter(function (b) { return b.reviewState === 'requested' || b.showcase === 'requested'; }); }
    function coachName(id) { var t = S.tutors.filter(function (x) { return x.id === id; })[0]; return t ? t.name : ''; }
    function toast(m, bad) { var el = root.querySelector('#txMsg'); if (el) { el.textContent = m; el.style.color = bad ? 'var(--error,#E74C3C)' : 'var(--brand-deep,#245F5A)'; setTimeout(function () { if (el.textContent === m) el.textContent = ''; }, 4000); } }
    function cleanLive() { if (S.ws) { S.ws.destroy(); S.ws = null; } if (S.chat) { S.chat.destroy(); S.chat = null; } }

    /* ---------------- data ---------------- */
    function listen(q, key, after) {
      S.unsubs.push(q.onSnapshot(function (snap) {
        S[key] = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        if (after) after();
        if (key === 'students') S.loaded = true;
        if (S.loaded && !document.querySelector('.cr-overlay')) render(); else if (S.loaded) renderTabsOnly();
      }, function (e) { console.warn('tech ' + key + ':', e); if (key === 'students') { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">Could not load TECH students: ' + esc(errMsg(e)) + '</div></div>'; } }));
    }
    listen(db.collection('students').where('studentType', '==', 'tech'), 'students');
    listen(db.collection('techBuilds'), 'builds', function () { S.builds.sort(function (a, b) { return ts(b.updatedAt) - ts(a.updatedAt); }); });
    listen(db.collection('techShowcase'), 'wall');
    listen(db.collection('techContent'), 'content', function () { S.content.sort(function (a, b) { return ts(b.createdAt) - ts(a.createdAt); }); });
    listen(db.collection('techChats'), 'chats', function () { S.chats.sort(function (a, b) { return ts(b.lastAt) - ts(a.lastAt); }); });
    db.collection('tutorAccounts').get().then(function (snap) {
      S.tutors = snap.docs.map(function (d) { var x = d.data(); return { id: d.id, name: x.name || x.email || 'Tutor', status: x.status }; })
        .filter(function (t) { return !t.status || /^active$/i.test(t.status); })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }).catch(function (e) { console.warn('tutor accounts:', e); });

    /* ---------------- shell ---------------- */
    function tabsHtml() {
      var pa = pending().length, rv = reviewNeeded().length;
      var tabs = [['applications', 'fa-user-plus', 'Applications', pa], ['builders', 'fa-user-graduate', 'Builders', 0], ['builds', 'fa-hammer', 'Builds', rv], ['content', 'fa-bullseye', 'Missions & content', 0], ['messages', 'fa-comments', 'Messages', 0], ['wall', 'fa-trophy', 'TECH Wall', 0]];
      return '<div class="cr-tabs" role="tablist" id="txTabs">' + tabs.map(function (t) {
        return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="cr-btn ' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><i class="fas ' + t[1] + '"></i> ' + t[2] +
          (t[3] ? ' <span class="cr-badge-red" style="position:static;display:inline-flex;margin-left:.3rem">' + t[3] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function renderTabsOnly() { var el = root.querySelector('#txTabs'); if (el) el.outerHTML = tabsHtml(); }
    function render() {
      cleanLive();
      root.innerHTML = tabsHtml() + '<div id="txBody"></div><div class="cr-note" id="txMsg" role="status" style="margin-top:.6rem"></div>';
      var b = root.querySelector('#txBody');
      if (!S.loaded) { b.innerHTML = '<div class="cr-empty">Loading TECH…</div>'; return; }
      ({ applications: applications, builders: builders, builds: builds, content: content, messages: messages, wall: wall }[S.tab] || applications)(b);
    }

    /* ---------------- applications (Pending → approve / decline) ---------------- */
    function applications(b) {
      var list = pending().sort(function (a, c) { return ts(a.createdAt) - ts(c.createdAt); });
      var h = '<div class="cr-bar"><div><h3>Applications</h3><div class="cr-sub">New TECH sign-ups waiting for approval. Approving unlocks their studio, emails them and (optionally) pairs a coach.</div></div></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No applications waiting. 🎉</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Applicant</th><th>Age</th><th>Interests</th><th>Guardian</th><th>Applied</th><th></th></tr></thead><tbody>' + list.map(function (s) {
        var tp = s.techProfile || {};
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email) + (s.phone ? ' · ' + esc(s.phone) : '') + '</div></td>' +
          '<td>' + (/^u/.test(s.ageGroup || '') ? 'Under 18' : (s.ageGroup ? '18+' : '—')) + '</td>' +
          '<td class="cr-note">' + esc(tp.identity || '') + ((tp.interests || []).length ? ' · ' + esc(tp.interests.join(', ')) : '') + '</td>' +
          '<td class="cr-note">' + (s.guardianEmail ? esc(s.guardianName || '') + '<br>' + esc(s.guardianEmail) + (s.guardianPhone ? '<br>' + esc(s.guardianPhone) : '') : '—') + '</td>' +
          '<td class="cr-note">' + fmtDate(s.createdAt) + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="approve" data-id="' + esc(s.id) + '"><i class="fas fa-check"></i> Approve</button>' +
          '<button type="button" class="cr-btn sm danger" data-a="decline" data-id="' + esc(s.id) + '"><i class="fas fa-xmark"></i> Decline</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function coachOpts(cur) { return '<option value="">— No coach yet —</option>' + S.tutors.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join(''); }
    function openApprove(s) {
      var m = CU.openModal({ title: 'Approve — ' + s.name });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.8rem">' + esc(s.email) + '</div><div class="cr-field"><label for="txCoach">Pair a TECH coach (optional)</label><select id="txCoach">' + coachOpts('') + '</select></div>' +
        '<div class="cr-note">Approving unlocks the studio immediately and sends the student a welcome email.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Approve and unlock</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var btn = this, cid = m.body.querySelector('#txCoach').value; btn.disabled = true;
        setStatus(s.id, 'Active', cid ? { techCoachId: cid, techCoachName: coachName(cid) } : null).then(function () { m.close(); toast(s.name + ' approved and unlocked.'); }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }
    function setStatus(id, st, extra) {
      var d = { status: st, updatedAt: FV().serverTimestamp() };
      if (st === 'Active') { d.admittedBy = o.uid; d.approvedAt = FV().serverTimestamp(); }
      if (extra) Object.assign(d, extra);
      return db.collection('students').doc(id).update(d);
    }

    /* ---------------- builders ---------------- */
    function builders(b) {
      var all = S.students.filter(function (s) { return status(s) !== 'Pending'; }), q = S.q.trim().toLowerCase();
      var list = all.filter(function (s) { return (S.status === 'all' || status(s) === S.status) && (!q || (s.name + ' ' + s.email).toLowerCase().indexOf(q) > -1); }).sort(function (a, c) { return String(a.name).localeCompare(String(c.name)); });
      var n = function (f) { return all.filter(f).length; };
      var h = '<div class="cr-bar"><div><h3>TECH builders</h3><div class="cr-sub">Approved students. Pair coaches, lock or unlock accounts.</div></div></div>' +
        '<div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' + stat(all.length, 'Total') + stat(n(function (s) { return s.status === 'Active'; }), 'Active') + stat(n(function (s) { return s.status === 'Inactive'; }), 'Locked') + stat(n(function (s) { return s.techCoachId; }), 'With a coach') + stat(S.builds.length, 'Builds') + '</div>' +
        '<div class="cr-filters"><input type="search" data-f="q" placeholder="Search name or email…" value="' + esc(S.q) + '" aria-label="Search" style="min-width:230px"><select data-f="status" aria-label="Status">' +
        [['all', 'All'], ['Active', 'Active'], ['Inactive', 'Locked'], ['Declined', 'Declined']].map(function (x) { return '<option value="' + x[0] + '"' + (S.status === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">' + (all.length ? 'No builders match these filters.' : 'No approved TECH builders yet. Approve an application to start.') + '</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Status</th><th>Coach</th><th>Builds</th><th>Last seen</th><th></th></tr></thead><tbody>' + list.map(function (s) {
        var nb = S.builds.filter(function (x) { return x.studentId === s.id; }).length, id = esc(s.id);
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email) + '</div></td><td>' + badge(status(s)) + '</td>' +
          '<td>' + esc(s.techCoachName || coachName(s.techCoachId) || '—') + '</td><td>' + nb + '</td><td class="cr-note">' + fmtDate(s.lastLoginAt) + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="coach" data-id="' + id + '" title="Pair coach"><i class="fas fa-chalkboard-user"></i></button>' +
          (s.status === 'Active' ? '<button type="button" class="cr-btn sm danger" data-a="lock" data-id="' + id + '" title="Lock account"><i class="fas fa-lock"></i></button>'
            : '<button type="button" class="cr-btn sm primary" data-a="unlock" data-id="' + id + '" title="Unlock account"><i class="fas fa-lock-open"></i> Unlock</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openCoach(s) {
      var m = CU.openModal({ title: 'Coach — ' + s.name });
      m.body.innerHTML = '<div class="cr-field"><label for="txCoach">TECH coach</label><select id="txCoach">' + coachOpts(s.techCoachId || '') + '</select></div><div class="cr-note">Coaches are your existing tutors. They see this builder and their builds in the tutor dashboard.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var btn = this, cid = m.body.querySelector('#txCoach').value, nm = cid ? coachName(cid) : ''; btn.disabled = true;
        var bt = db.batch();
        bt.update(db.collection('students').doc(s.id), { techCoachId: cid, techCoachName: nm, updatedAt: FV().serverTimestamp() });
        S.builds.filter(function (x) { return x.studentId === s.id; }).forEach(function (x) { bt.update(db.collection('techBuilds').doc(x.id), { tutorId: cid, tutorName: nm }); });
        bt.commit().then(function () { m.close(); toast('Coach updated.'); }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }

    /* ---------------- builds ---------------- */
    function builds(b) {
      var h = '<div class="cr-bar"><div><h3>Builds</h3><div class="cr-sub">Everything students are making. Open one to read the brief, files and feedback, or to approve it for the TECH Wall.</div></div></div>';
      if (!S.builds.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No student builds yet.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Build</th><th>Builder</th><th>Stage</th><th>Coach</th><th>Needs</th><th></th></tr></thead><tbody>' + S.builds.map(function (x) {
        var need = x.showcase === 'requested' ? '<span class="badge b-pending">Wall request</span>' : x.reviewState === 'requested' ? '<span class="badge b-pending">Review</span>' : x.showcase === 'approved' ? '<span class="badge b-confirmed">On the Wall</span>' : '—';
        return '<tr><td><b>' + esc(x.title) + '</b><div class="cr-note">' + esc(x.category || '') + '</div></td><td>' + esc(x.studentName) + '</td><td><span class="badge b-plain">' + esc(T.STATUS_LABEL[x.status] || x.status) + '</span> ' + (Number(x.progress) || 0) + '%</td><td class="cr-note">' + esc(x.tutorName || '—') + '</td><td>' + need + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="open" data-id="' + esc(x.id) + '"><i class="fas fa-eye"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openBuild(id) {
      var x = S.builds.filter(function (y) { return y.id === id; })[0]; if (!x) return;
      var m = CU.openModal({ title: x.title || 'Build', wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txWs"></div>';
      S.ws = T.mountWorkspace(m.body.querySelector('#txWs'), { id: id, me: { uid: o.uid, role: 'admin', name: o.name || 'Studio Desk' } });
      m.foot.innerHTML = (x.showcase === 'requested' ? '<button type="button" class="cr-btn primary" data-a="pub"><i class="fas fa-trophy"></i> Publish to TECH Wall</button>' : '') + '<button type="button" class="cr-btn" data-a="x">Close</button>';
      function done() { if (S.ws) { S.ws.destroy(); S.ws = null; } m.close(); }
      m.foot.querySelector('[data-a="x"]').onclick = done;
      var p = m.foot.querySelector('[data-a="pub"]');
      if (p) p.onclick = function () { p.disabled = true; T.approveShowcase(x, { uid: o.uid }).then(function () { toast('Published to the TECH Wall.'); done(); }).catch(function (e) { p.disabled = false; toast(errMsg(e), true); }); };
    }

    /* ---------------- content (missions, topics, challenges, resources) ---------------- */
    function content(b) {
      var list = S.content.filter(function (c) { return S.kind === 'all' || c.kind === S.kind; });
      var h = '<div class="cr-bar"><div><h3>Missions &amp; content</h3><div class="cr-sub">What builders see in their studio. Drafts stay hidden until published. Coaches can add their own too.</div></div><button type="button" class="cr-btn primary" data-a="new"><i class="fas fa-plus"></i> New item</button></div>' +
        '<div class="cr-filters"><select data-f="kind" aria-label="Type"><option value="all">All types</option>' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (S.kind === k[0] ? ' selected' : '') + '>' + k[1] + 's</option>'; }).join('') + '</select></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">Nothing here yet. Add the first mission.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Title</th><th>Type</th><th>Level</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (c) {
        var live = c.status === 'published', id = esc(c.id);
        return '<tr><td><b>' + esc(c.title) + '</b><div class="cr-note">' + esc(c.summary || '') + '</div></td><td><span class="badge b-plain">' + esc(c.kind || '') + '</span></td><td>' + esc(c.level || '—') + '</td><td class="cr-note">' + esc(coachName(c.createdBy) || (c.createdBy === o.uid ? 'Studio Desk' : '—')) + '</td><td>' + (live ? '<span class="badge b-confirmed">Live</span>' : '<span class="badge b-pending">Draft</span>') + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="toggle" data-id="' + id + '" title="' + (live ? 'Unpublish' : 'Publish') + '"><i class="fas ' + (live ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + id + '" title="Edit"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm danger" data-a="del" data-id="' + id + '" title="Delete"><i class="fas fa-trash"></i></button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openEditor(id) {
      var c = S.content.filter(function (x) { return x.id === id; })[0] || { kind: 'mission', status: 'draft' };
      var m = CU.openModal({ title: id ? 'Edit item' : 'New item', wide: true });
      m.body.innerHTML = '<div class="cr-row2"><div class="cr-field"><label for="ctK">Type</label><select id="ctK">' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (c.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="ctL">Level (1–7)</label><input id="ctL" type="number" min="1" max="7" value="' + esc(c.level || '') + '"></div></div>' +
        '<div class="cr-field"><label for="ctT">Title</label><input id="ctT" maxlength="120" value="' + esc(c.title || '') + '"></div>' +
        '<div class="cr-field"><label for="ctS">One-line summary</label><input id="ctS" maxlength="300" value="' + esc(c.summary || '') + '"></div>' +
        '<div class="cr-field"><label for="ctB">Details</label><textarea id="ctB" rows="6" maxlength="8000">' + esc(c.body || '') + '</textarea></div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="ctU">Link (https://…)</label><input id="ctU" value="' + esc(c.url || '') + '"></div>' +
        '<div class="cr-field"><label for="ctP">Status</label><select id="ctP"><option value="draft">Draft (hidden)</option><option value="published"' + (c.status === 'published' ? ' selected' : '') + '>Published</option></select></div></div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var $ = function (i) { return m.body.querySelector('#' + i).value.trim(); }, err = m.foot.querySelector('#txErr'), btn = this;
        if (!$('ctT')) { err.textContent = 'A title is required.'; return; }
        var d = { kind: $('ctK'), title: $('ctT').slice(0, 120), summary: $('ctS').slice(0, 300), body: $('ctB').slice(0, 8000), url: T.safeUrl($('ctU')), level: Math.max(0, Math.min(7, Number($('ctL')) || 0)), status: $('ctP'), updatedAt: FV().serverTimestamp() };
        btn.disabled = true;
        var p = id ? db.collection('techContent').doc(id).update(d) : db.collection('techContent').add(Object.assign(d, { createdBy: o.uid, createdAt: FV().serverTimestamp() }));
        p.then(function () { m.close(); toast('Saved.'); }).catch(function (e) { btn.disabled = false; err.textContent = errMsg(e); });
      };
    }

    /* ---------------- messages ---------------- */
    function messages(b) {
      var h = '<div class="cr-bar"><div><h3>Messages</h3><div class="cr-sub">Coach ↔ builder conversations. You can read and join any of them.</div></div></div>';
      if (!S.chats.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No conversations yet.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Coach</th><th>Last message</th><th>When</th><th></th></tr></thead><tbody>' + S.chats.map(function (c) {
        return '<tr><td><b>' + esc(c.studentName || 'Builder') + '</b></td><td>' + esc(c.tutorName || '—') + '</td><td class="cr-note">' + esc(c.lastMessage || '—') + '</td><td class="cr-note">' + fmtDate(c.lastAt) + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="chat" data-id="' + esc(c.id) + '"><i class="fas fa-comments"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openChat(id) {
      var c = S.chats.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      var m = CU.openModal({ title: (c.studentName || 'Builder') + ' ↔ ' + (c.tutorName || 'Coach'), wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txCh"></div>';
      S.chat = T.mountChat(m.body.querySelector('#txCh'), { studentId: c.studentId, studentName: c.studentName, coachId: c.tutorId, coachName: c.tutorName, me: { uid: o.uid, role: 'admin', name: o.name || 'Studio Desk' } });
      m.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { cleanLive(); m.close(); };
    }

    /* ---------------- TECH Wall ---------------- */
    function wall(b) {
      var req = S.builds.filter(function (x) { return x.showcase === 'requested'; });
      var h = '<div class="cr-bar"><div><h3>TECH Wall</h3><div class="cr-sub">Only builds you approve appear publicly, with a first name only.</div></div></div><h4 style="margin:.2rem 0 .6rem;color:var(--brand-deep)">Waiting for approval</h4>';
      h += req.length ? '<div class="cr-table-wrap"><table class="cr-table"><tbody>' + req.map(function (x) { return '<tr><td><b>' + esc(x.title) + '</b><div class="cr-note">by ' + esc(T.firstName(x.studentName)) + '</div></td><td style="text-align:right"><button type="button" class="cr-btn sm primary" data-a="open" data-id="' + esc(x.id) + '"><i class="fas fa-eye"></i> Review &amp; publish</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No requests.</div></div>';
      h += '<h4 style="margin:1.4rem 0 .6rem;color:var(--brand-deep)">On the Wall (' + S.wall.length + ')</h4>';
      h += S.wall.length ? '<div class="cr-table-wrap"><table class="cr-table"><tbody>' + S.wall.map(function (w) {
        return '<tr><td><b>' + esc(w.title) + '</b><div class="cr-note">by ' + esc(w.displayName) + ' · ' + esc(w.category || '') + '</div></td><td style="text-align:right"><div class="cr-actions" style="justify-content:flex-end"><button type="button" class="cr-btn sm ' + (w.featured ? 'primary' : '') + '" data-a="feat" data-id="' + esc(w.id) + '"><i class="fas fa-star"></i> ' + (w.featured ? 'Featured' : 'Feature') + '</button><button type="button" class="cr-btn sm danger" data-a="unpub" data-id="' + esc(w.id) + '"><i class="fas fa-xmark"></i> Remove</button></div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">Nothing published yet.</div></div>';
      b.innerHTML = h;
    }

    /* ---------------- events ---------------- */
    function fail(e) { toast(errMsg(e), true); }
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-a]'); if (!t) return; var a = t.dataset.a, id = t.dataset.id;
      var stu = function () { return S.students.filter(function (x) { return x.id === id; })[0]; };
      if (a === 'tab') { S.tab = t.dataset.v; render(); }
      else if (a === 'approve') { var s = stu(); if (s) openApprove(s); }
      else if (a === 'decline') { var d = stu(); if (d && confirm('Decline ' + d.name + '? They will not be able to use TECH.')) setStatus(id, 'Declined').then(function () { toast('Application declined.'); }).catch(fail); }
      else if (a === 'lock') { var l = stu(); if (l && confirm('Lock ' + l.name + '’s account? They will lose access until you unlock it.')) setStatus(id, 'Inactive').then(function () { toast('Account locked.'); }).catch(fail); }
      else if (a === 'unlock') { setStatus(id, 'Active').then(function () { toast('Account unlocked.'); }).catch(fail); }
      else if (a === 'coach') { var c = stu(); if (c) openCoach(c); }
      else if (a === 'open') openBuild(id);
      else if (a === 'new') openEditor();
      else if (a === 'edit') openEditor(id);
      else if (a === 'toggle') { var it = S.content.filter(function (x) { return x.id === id; })[0]; if (it) db.collection('techContent').doc(id).update({ status: it.status === 'published' ? 'draft' : 'published', updatedAt: FV().serverTimestamp() }).catch(fail); }
      else if (a === 'del') { if (confirm('Delete this item? This cannot be undone.')) db.collection('techContent').doc(id).delete().catch(fail); }
      else if (a === 'chat') openChat(id);
      else if (a === 'feat') { var w = S.wall.filter(function (x) { return x.id === id; })[0]; if (w) db.collection('techShowcase').doc(id).update({ featured: !w.featured }).catch(fail); }
      else if (a === 'unpub') { if (confirm('Remove this build from the public TECH Wall?')) T.removeShowcase({ id: id }).then(function () { toast('Removed from the Wall.'); }).catch(fail); }
    });
    root.addEventListener('input', function (e) { if (e.target.dataset.f === 'q') { S.q = e.target.value; var pos = e.target.selectionStart; render(); var i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { } } } });
    root.addEventListener('change', function (e) { var f = e.target.dataset.f; if (f === 'status' || f === 'kind') { S[f] = e.target.value; render(); } });

    return { destroy: function () { S.unsubs.forEach(function (u) { u(); }); cleanLive(); } };
  }
  g.TechAdmin = { mount: mount };
})(window);