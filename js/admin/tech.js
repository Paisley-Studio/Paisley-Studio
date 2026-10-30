/* =========================================================
   TECH (admin) — Paisley Studio · mounted inside admin/index.html
   TechAdmin.mount(rootEl, { uid, name }) -> { destroy() }
   Tabs: Applications · Builders · Coaches · Builds · Studio Builder · AI Toolbox · Messages · TECH Wall
   TECH is its own architecture: techStudents (applications + builders), techCoaches (not tutors),
   techGuardianLinks / techGuardianChats (families), techNotifications (TECH bell), plus techBuilds,
   techContent, techShowcase, techChats, techProgress, shareTokens. See functions/tech.js.
   Needs: classroom-helpers.js (ClassroomUI), tech-helpers.js (TechUI), firebase (+ functions).
========================================================= */
(function (g) {
  'use strict';
  var CU = g.ClassroomUI.util, T = g.TechUI, esc = CU.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var KINDS = [
    ['mission', 'Mission'],
    ['topic', 'Topic'],
    ['path', 'Learning path'],
    ['challenge', 'Challenge'],
    ['resource', 'Resource'],
    ['template', 'Template'],
    ['tool', 'General tool'],
    ['aiTool', 'AI tool']
  ];
  var AI_CATEGORIES = ['BUILD', 'CREATE', 'THINK', 'WORK', 'SAFETY'];

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
    var S = {
      tab: 'applications',
      students: [], builds: [], wall: [], content: [], chats: [], gchats: [], classes: [], desk: [],
      bf: 'all', panel: null,
      coaches: [], legacy: 0, loaded: false,
      q: '', status: 'all',
      kind: 'all', discipline: 'all', level: 'all',
      unsubs: [], ws: null, chat: null
    };

    function status(s) { return s.status || 'Pending'; }
    function pending() { return S.students.filter(function (s) { return status(s) === 'Pending'; }); }
    function reviewNeeded() { return S.builds.filter(function (b) { return b.reviewState === 'requested' || b.showcase === 'requested' || b.mastery === 'requested'; }); }
    function coachName(id) { var t = S.coaches.filter(function (x) { return x.id === id; })[0]; return t ? t.name : ''; }
    function activeCoaches() { return S.coaches.filter(function (c) { return c.status === 'Active'; }); }
    function call(name, data) { return firebase.functions().httpsCallable(name)(data || {}).then(function (r) { return r.data; }); }
    function toast(m, bad) { var el = root.querySelector('#txMsg'); if (el) { el.textContent = m; el.style.color = bad ? 'var(--error,#E74C3C)' : 'var(--brand-deep,#245F5A)'; setTimeout(function () { if (el.textContent === m) el.textContent = ''; }, 4000); } }
    function cleanLive() { if (S.ws) { S.ws.destroy(); S.ws = null; } if (S.chat) { S.chat.destroy(); S.chat = null; } if (S.panel) { S.panel.destroy(); S.panel = null; } }
    var me = function () { return { uid: o.uid, role: 'admin', name: o.name || 'Studio Desk' }; };
    var missionOf = function (id) { return S.content.filter(function (c) { return c.id === id; })[0] || null; };

    /* ---------------- data ---------------- */
    function listen(q, key, after) {
      S.unsubs.push(q.onSnapshot(function (snap) {
        S[key] = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        if (after) after();
        if (key === 'students') S.loaded = true;
        /* Open modals and the live Activity / Practice panels keep their state; only the tab badges refresh. */
        var busy = document.querySelector('.cr-overlay') || (S.panel && (S.tab === 'activity' || S.tab === 'practice'));
        if (S.loaded && !busy) render(); else if (S.loaded) renderTabsOnly();
      }, function (e) { console.warn('tech ' + key + ':', e); if (key === 'students') { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">Could not load TECH students: ' + esc(errMsg(e)) + '</div></div>'; } }));
    }
    listen(db.collection('techStudents'), 'students');
    listen(db.collection('techBuilds'), 'builds', function () { S.builds.sort(function (a, b) { return ts(b.updatedAt) - ts(a.updatedAt); }); });
    listen(db.collection('techShowcase'), 'wall');
    listen(db.collection('techContent'), 'content', function () { S.content.sort(function (a, b) { return ts(b.createdAt) - ts(a.createdAt); }); });
    listen(db.collection('techChats'), 'chats', function () { S.chats.sort(function (a, b) { return ts(b.lastAt) - ts(a.lastAt); }); });
    listen(db.collection('techGuardianChats'), 'gchats', function () { S.gchats.sort(function (a, b) { return ts(b.lastAt) - ts(a.lastAt); }); });
    listen(db.collection('techCoaches'), 'coaches', function () { S.coaches.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); });
    listen(db.collection('techLiveClasses'), 'classes', function () { S.classes = T.sortLive(S.classes); });
    listen(db.collection('parentConversations').where('programme', '==', 'tech'), 'desk', function () { S.desk.sort(function (a, b) { return ts(b.lastMessageAt) - ts(a.lastMessageAt); }); });
    /* Legacy TECH builders still stored as students/{uid} studentType "tech" (before migrateTechArchitecture). */
    db.collection('students').where('studentType', '==', 'tech').get().then(function (snap) {
      S.legacy = snap.docs.filter(function (d) { return !d.data().techMigratedAt; }).length;
      if (S.loaded) render();
    }).catch(function (e) { console.warn('legacy tech students:', e); });

    /* ---------------- shell ---------------- */
    function tabsHtml() {
      var pa = pending().length, rv = reviewNeeded().length;
      var tabs = [
        ['applications', 'fa-user-plus', 'Applications', pa],
        ['builders', 'fa-user-graduate', 'Builders', 0],
        ['coaches', 'fa-chalkboard-user', 'Coaches', 0],
        ['builds', 'fa-hammer', 'Projects & reviews', rv],
        ['missions', 'fa-bullseye', 'Missions', 0],
        ['content', 'fa-layer-group', 'Studio Builder', 0],
        ['aitools', 'fa-robot', 'AI Toolbox', 0],
        ['live', 'fa-video', 'Live classes', S.classes.filter(function (c) { return T.liveState(c) === 'live'; }).length],
        ['activity', 'fa-wave-square', 'Activity', 0],
        ['practice', 'fa-flask', 'Practice', 0],
        ['reports', 'fa-chart-column', 'Performance', 0],
        ['messages', 'fa-comments', 'Messages', 0],
        ['desk', 'fa-headset', 'Family desk', S.desk.filter(function (c) { return c.unreadForAdmin; }).length],
        ['wall', 'fa-trophy', 'Showcase', 0]
      ];
      return '<div class="cr-tabs" role="tablist" id="txTabs">' + tabs.map(function (t) {
        return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" class="cr-btn ' + (S.tab === t[0] ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '"><i class="fas ' + t[1] + '"></i> ' + t[2] +
          (t[3] ? ' <span class="cr-badge-red" style="position:static;display:inline-flex;margin-left:.3rem">' + t[3] + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function renderTabsOnly() { var el = root.querySelector('#txTabs'); if (el) el.outerHTML = tabsHtml(); }
    function render() {
      cleanLive();
      root.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:.4rem" id="txBellRow"></div>' + legacyBanner() + tabsHtml() + '<div id="txBody"></div><div class="cr-note" id="txMsg" role="status" style="margin-top:.6rem"></div>';
      mountAdminBell();
      var b = root.querySelector('#txBody');
      if (!S.loaded) { b.innerHTML = '<div class="cr-empty">Loading TECH…</div>'; return; }
      var view = ({ applications: applications, builders: builders, coaches: coaches, builds: builds, missions: missionsTab, content: content, aitools: aiTools, live: liveTab, activity: activityTab, practice: practiceTab, reports: reports, messages: messages, desk: deskTab, wall: wall }[S.tab] || applications);
      view(b);
    }
    /* The TECH bell survives re-renders: its element is moved into each new header row. */
    var bellEl = null;
    function mountAdminBell() {
      var row = root.querySelector('#txBellRow'); if (!row) return;
      if (!bellEl) { bellEl = document.createElement('div'); S.bell = T.mountBell(bellEl, { uid: o.uid, onOpen: function (n) {
        if (n.buildId && S.builds.some(function (x) { return x.id === n.buildId; })) { openBuild(n.buildId); return true; }
        if (n.type === 'tech_application') { S.tab = 'applications'; render(); return true; }
        if (n.classId) { S.tab = 'live'; render(); return true; }
        if (n.type === 'tech_desk_message') { S.tab = 'desk'; render(); return true; }
        if (n.chatId) { S.tab = 'messages'; render(); return true; }
        return true;
      } }); }
      row.appendChild(bellEl);
    }
    function legacyBanner() {
      if (!S.legacy) return '';
      return '<div class="cr-panel" style="border-left:4px solid var(--warn,#E8A33D);margin-bottom:1rem"><b>' + S.legacy + ' TECH builder' + (S.legacy === 1 ? ' is' : 's are') + ' still on the old student records.</b>' +
        '<div class="cr-note" style="margin:.3rem 0 .7rem">Move them to the new TECH architecture: builders keep their status and coach, tutors who coach become TECH coaches (same login), and guardians of active builders get their TECH guardian login by email. Safe to run more than once.</div>' +
        '<div class="cr-actions"><button type="button" class="cr-btn sm" data-a="migrate" data-dry="1"><i class="fas fa-magnifying-glass"></i> Preview</button><button type="button" class="cr-btn sm primary" data-a="migrate"><i class="fas fa-right-left"></i> Move to new TECH</button></div><div class="cr-note" id="txMig" style="margin-top:.5rem"></div></div>';
    }

    /* ---------------- applications ---------------- */
    function applications(b) {
      var list = pending().sort(function (a, c) { return ts(a.createdAt) - ts(c.createdAt); });
      var h = '<div class="cr-bar"><div><h3>Applications</h3><div class="cr-sub">New TECH sign-ups waiting for approval. Approving unlocks their studio, emails them and (optionally) pairs a coach.</div></div></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No applications waiting. 🎉</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Applicant</th><th>Age</th><th>Interests</th><th>Guardian</th><th>Applied</th><th></th></tr></thead><tbody>' + list.map(function (s) {
        var tp = s.techProfile || {}, gs = (s.guardians || []).length ? s.guardians : (s.guardianEmail ? [{ name: s.guardianName, email: s.guardianEmail, phone: s.guardianPhone }] : []);
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email) + (s.phone ? ' · ' + esc(s.phone) : '') + '</div>' +
          ((s.programmes || []).length ? '<span class="badge b-plain">Also: ' + esc(s.programmes.join(', ')) + '</span>' : '') + '</td>' +
          '<td>' + (/^u/.test(s.ageGroup || '') ? 'Under 18' : (s.ageGroup ? '18+' : '—')) + '</td>' +
          '<td class="cr-note">' + esc(tp.identity || '') + ((tp.interests || []).length ? ' · ' + esc(tp.interests.join(', ')) : '') + '</td>' +
          '<td class="cr-note">' + (gs.length ? gs.map(function (g) { return esc(g.name || '') + (g.relationship ? ' (' + esc(g.relationship) + ')' : '') + '<br>' + esc(g.email || '') + (g.phone ? '<br>' + esc(g.phone) : ''); }).join('<hr style="border:0;border-top:1px solid var(--line);margin:.35rem 0">') : '—') + '</td>' +
          '<td class="cr-note">' + fmtDate(s.createdAt) + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="approve" data-id="' + esc(s.id) + '"><i class="fas fa-check"></i> Approve</button>' +
          '<button type="button" class="cr-btn sm danger" data-a="decline" data-id="' + esc(s.id) + '"><i class="fas fa-xmark"></i> Decline</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function coachOpts(cur) { return '<option value="">— No coach yet —</option>' + activeCoaches().map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join(''); }
    function noCoachNote() { return activeCoaches().length ? '' : '<div class="cr-note" style="margin-top:.4rem">No TECH coaches yet. Add one in the <b>Coaches</b> tab.</div>'; }
    function openApprove(s) {
      var m = CU.openModal({ title: 'Approve — ' + s.name });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.8rem">' + esc(s.email) + '</div><div class="cr-field"><label for="txCoach">Pair a TECH coach (optional)</label><select id="txCoach">' + coachOpts('') + '</select>' + noCoachNote() + '</div>' +
        '<div class="cr-note">Approving unlocks the studio immediately, sends the builder a welcome email, and emails each parent or guardian their TECH guardian login.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Approve and unlock</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var btn = this, cid = m.body.querySelector('#txCoach').value; btn.disabled = true;
        setStatus(s.id, 'Active', cid ? { coachId: cid, coachName: coachName(cid) } : null).then(function () { m.close(); toast(s.name + ' approved and unlocked.'); }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }
    function setStatus(id, st, extra) {
      var d = { status: st, updatedAt: FV().serverTimestamp() };
      if (st === 'Active') { d.admittedBy = o.uid; d.approvedAt = FV().serverTimestamp(); }
      if (extra) Object.assign(d, extra);
      return db.collection('techStudents').doc(id).update(d);
    }

    /* ---------------- builders ---------------- */
    function builders(b) {
      var all = S.students.filter(function (s) { return status(s) !== 'Pending'; }), q = S.q.trim().toLowerCase();
      var list = all.filter(function (s) { return (S.status === 'all' || status(s) === S.status) && (!q || (s.name + ' ' + s.email).toLowerCase().indexOf(q) > -1); }).sort(function (a, c) { return String(a.name).localeCompare(String(c.name)); });
      var n = function (f) { return all.filter(f).length; };
      var h = '<div class="cr-bar"><div><h3>TECH builders</h3><div class="cr-sub">Approved students. Pair coaches, lock or unlock accounts.</div></div></div>' +
        '<div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' + stat(all.length, 'Total') + stat(n(function (s) { return s.status === 'Active'; }), 'Active') + stat(n(function (s) { return s.status === 'Inactive'; }), 'Locked') + stat(n(function (s) { return s.coachId; }), 'With a coach') + stat(S.builds.length, 'Builds') + '</div>' +
        '<div class="cr-filters"><input type="search" data-f="q" placeholder="Search name or email…" value="' + esc(S.q) + '" aria-label="Search" style="min-width:230px"><select data-f="status" aria-label="Status">' +
        [['all', 'All'], ['Active', 'Active'], ['Inactive', 'Locked'], ['Declined', 'Declined']].map(function (x) { return '<option value="' + x[0] + '"' + (S.status === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">' + (all.length ? 'No builders match these filters.' : 'No approved TECH builders yet. Approve an application to start.') + '</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Status</th><th>Coach</th><th>Guardians</th><th>Builds</th><th>Mastered</th><th>Last seen</th><th></th></tr></thead><tbody>' + list.map(function (s) {
        var nb = S.builds.filter(function (x) { return x.studentId === s.id; }).length;
        var nm = S.builds.filter(function (x) { return x.studentId === s.id && x.mastery === 'approved'; }).length;
        var id = esc(s.id);
        var ng = (s.guardianAccounts || []).length;
        return '<tr><td><b>' + esc(s.name) + '</b><div class="cr-note">' + esc(s.email) + '</div>' + ((s.programmes || []).length ? '<span class="badge b-plain">Also: ' + esc(s.programmes.join(', ')) + '</span>' : '') + '</td><td>' + badge(status(s)) + '</td>' +
          '<td>' + esc(s.coachName || coachName(s.coachId) || '—') + '</td><td>' + (ng ? ng + ' linked' : ((s.guardians || []).length ? '<span class="cr-note">Not linked</span>' : '—')) + '</td><td>' + nb + '</td><td>' + nm + '</td><td class="cr-note" title="' + esc(fmtDate(T.lastSeen(s))) + '">' + esc(T.ago(T.lastSeen(s))) + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="coach" data-id="' + id + '" title="Pair coach"><i class="fas fa-chalkboard-user"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="guardians" data-id="' + id + '" title="Parents and guardians"><i class="fas fa-user-shield"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="actof" data-id="' + id + '" title="Activity timeline"><i class="fas fa-wave-square"></i></button>' +
          (s.status === 'Active' ? '<button type="button" class="cr-btn sm danger" data-a="lock" data-id="' + id + '" title="Lock account"><i class="fas fa-lock"></i></button>'
            : '<button type="button" class="cr-btn sm primary" data-a="unlock" data-id="' + id + '" title="Unlock account"><i class="fas fa-lock-open"></i> Unlock</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openCoach(s) {
      var m = CU.openModal({ title: 'Coach — ' + s.name });
      m.body.innerHTML = '<div class="cr-field"><label for="txCoach">TECH coach</label><select id="txCoach">' + coachOpts(s.coachId || '') + '</select>' + noCoachNote() + '</div><div class="cr-note">The coach sees this builder, their projects and their family in the TECH coach portal. Existing projects and family conversations move to the new coach automatically.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var btn = this, cid = m.body.querySelector('#txCoach').value, nm = cid ? coachName(cid) : ''; btn.disabled = true;
        db.collection('techStudents').doc(s.id).update({ coachId: cid, coachName: nm, updatedAt: FV().serverTimestamp() }).then(function () { m.close(); toast('Coach updated.'); }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }

    function openGuardians(s) {
      var m = CU.openModal({ title: 'Parents and guardians — ' + s.name });
      var linked = s.guardianAccounts || [], given = s.guardians || [], res = s.guardianLinkResults || [];
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem">Linked guardians sign in to the TECH guardian portal (/tech/parent) with their email or phone. Parents who already use the Parent Portal keep the same login.</div>' +
        '<h4 style="margin:.2rem 0 .4rem;color:var(--brand-deep)">Linked</h4>' + (linked.length ? linked.map(function (g) { return '<div>• ' + esc(g.name || 'Guardian') + '</div>'; }).join('') : '<div class="cr-note">Nobody linked yet.</div>') +
        (given.length ? '<h4 style="margin:.9rem 0 .4rem;color:var(--brand-deep)">On the application</h4>' + given.map(function (g) { return '<div class="cr-note">' + esc(g.name || '') + (g.relationship ? ' (' + esc(g.relationship) + ')' : '') + ' · ' + esc(g.email || '') + ' · ' + esc(g.phone || '') + '</div>'; }).join('') : '') +
        (res.some(function (r) { return r.skipped; }) ? '<div class="cr-note" style="margin-top:.5rem;color:#b8362a">' + res.filter(function (r) { return r.skipped; }).map(function (r) { return esc(r.email) + ': ' + esc(r.skipped); }).join('<br>') + '</div>' : '') +
        '<h4 style="margin:1rem 0 .4rem;color:var(--brand-deep)">Add a guardian</h4>' +
        '<div class="cr-field"><label for="tgN">Name</label><input id="tgN" maxlength="80"></div>' +
        '<div class="cr-field"><label for="tgR">Relationship</label><input id="tgR" maxlength="40" placeholder="Mother, Father, Guardian…"></div>' +
        '<div class="cr-field"><label for="tgE">Email</label><input id="tgE" type="email"></div>' +
        '<div class="cr-field"><label for="tgP">Phone (their first password)</label><input id="tgP" type="tel"></div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Close</button>' +
        '<button type="button" class="cr-btn" data-a="relink" title="Link everyone on the application, the student record and the Parent Portal"' + (s.status === 'Active' ? '' : ' disabled') + '><i class="fas fa-link"></i> Re-link all</button>' +
        '<button type="button" class="cr-btn primary" data-a="add"' + (s.status === 'Active' ? '' : ' disabled title="Approve the builder first"') + '><i class="fas fa-user-plus"></i> Add and link</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      function run(btn, guardian) {
        btn.disabled = true; m.foot.querySelector('#txErr').textContent = '';
        call('techLinkGuardians', { studentId: s.id, guardian: guardian }).then(function (r) {
          var ok = (r.results || []).filter(function (x) { return x.parentUid; }).length;
          m.close(); toast(ok + ' guardian' + (ok === 1 ? '' : 's') + ' linked.');
        }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      }
      m.foot.querySelector('[data-a="relink"]').onclick = function () { run(this, null); };
      m.foot.querySelector('[data-a="add"]').onclick = function () {
        var g = { name: m.body.querySelector('#tgN').value.trim(), relationship: m.body.querySelector('#tgR').value.trim(), email: m.body.querySelector('#tgE').value.trim(), phone: m.body.querySelector('#tgP').value.trim() };
        if (!g.name || !/^\S+@\S+\.\S+$/.test(g.email)) { m.foot.querySelector('#txErr').textContent = 'Name and a valid email are required.'; return; }
        run(this, g);
      };
    }

    /* ---------------- coaches ---------------- */
    function coaches(b) {
      var h = '<div class="cr-bar"><div><h3>TECH coaches</h3><div class="cr-sub">Coaches are separate from tutors. Each signs in at their own link /tech/coach/{slug} and sees only their own builders, projects and families. You can also create and edit coaches on the Tutors page.</div></div><button type="button" class="cr-btn primary" data-a="new-coach"><i class="fas fa-plus"></i> Add coach</button></div>';
      if (!S.coaches.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No TECH coaches yet. Add your first coach to start pairing builders.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Coach</th><th>Status</th><th>Builders</th><th>Waiting reviews</th><th>Disciplines</th><th></th></tr></thead><tbody>' + S.coaches.map(function (c) {
        var nb = S.students.filter(function (s) { return s.coachId === c.id && s.status === 'Active'; }).length;
        var nr = S.builds.filter(function (x) { return x.coachId === c.id && (x.reviewState === 'requested' || x.showcase === 'requested' || x.mastery === 'requested'); }).length;
        return '<tr><td><b>' + esc(c.name) + '</b><div class="cr-note">' + esc(c.email || '') + (c.phone ? ' · ' + esc(c.phone) : '') + '</div><div class="cr-note">' + (c.slug ? 'Link: /tech/coach/' + esc(c.slug) : 'No personal link yet (set one on the Tutors page)') + '</div>' + (c.migratedFromTutor ? '<span class="badge b-plain">Was a tutor coach</span>' : '') + '</td>' +
          '<td>' + badge(c.status === 'Active' ? 'Active' : 'Inactive') + '</td><td>' + nb + '</td><td>' + nr + '</td><td class="cr-note">' + esc((c.disciplines || []).join(', ') || '—') + '</td>' +
          '<td><div class="cr-actions">' + (c.status === 'Active'
            ? '<button type="button" class="cr-btn sm danger" data-a="coach-off" data-id="' + esc(c.id) + '" title="Pause coach"><i class="fas fa-pause"></i></button>'
            : '<button type="button" class="cr-btn sm primary" data-a="coach-on" data-id="' + esc(c.id) + '"><i class="fas fa-play"></i> Activate</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openNewCoach() {
      var m = CU.openModal({ title: 'Add a TECH coach' });
      m.body.innerHTML = '<div class="cr-field"><label for="tcN">Name</label><input id="tcN" maxlength="120"></div>' +
        '<div class="cr-field"><label for="tcE">Email (their sign-in)</label><input id="tcE" type="email"></div>' +
        '<div class="cr-field"><label for="tcP">Phone (optional)</label><input id="tcP" type="tel"></div>' +
        '<div class="cr-field"><label>Disciplines</label><div style="display:flex;flex-wrap:wrap;gap:.4rem">' + T.DISCIPLINES.map(function (d) { return '<label style="display:inline-flex;gap:.3rem;align-items:center;font-size:.85rem"><input type="checkbox" value="' + esc(d) + '"> ' + esc(d) + '</label>'; }).join('') + '</div></div>' +
        '<div class="cr-note">A new email gets a TECH coach login and a set-password email. If the email already has a Paisley login (for example a tutor), that same login becomes a TECH coach too.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Add coach</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var btn = this, d = { name: m.body.querySelector('#tcN').value.trim(), email: m.body.querySelector('#tcE').value.trim(), phone: m.body.querySelector('#tcP').value.trim(),
          disciplines: [].map.call(m.body.querySelectorAll('input[type=checkbox]:checked'), function (x) { return x.value; }) };
        btn.disabled = true;
        call('createTechCoach', d).then(function (r) { m.close(); toast(d.name + ' added as a TECH coach' + (r.emailSent ? ' and emailed.' : '.')); })
          .catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }

    /* ---------------- builds ---------------- */
    /* Every project — assigned missions and SELF-LED student projects, submitted or not. */
    function builds(b) {
      var F = {
        all: function () { return true; },
        waiting: function (x) { return x.reviewState === 'requested' || x.reviewState === 'reviewing' || x.showcase === 'requested'; },
        mission: function (x) { return !T.isSelfLed(x); }, self: function (x) { return T.isSelfLed(x); },
        draft: function (x) { return T.projectState(x) === 'in_progress'; },
        revision: function (x) { return T.projectState(x) === 'revision'; },
        approved: function (x) { return ['approved', 'mastered'].indexOf(T.projectState(x)) !== -1; },
        published: function (x) { return x.showcase === 'approved'; },
        nocoach: function (x) { return !x.coachId; }
      };
      var LAB = { all: 'All', waiting: 'Waiting for review', mission: 'Missions', self: 'Self-led', draft: 'Not submitted', revision: 'Revision', approved: 'Approved', published: 'Published', nocoach: 'No coach' };
      var list = S.builds.filter(F[S.bf] || F.all);
      var h = '<div class="cr-bar"><div><h3>Projects &amp; reviews</h3><div class="cr-sub">Every mission and self-led project, including work not submitted yet. Open one to see the work, assess it, grade it, approve mastery or publish it.</div></div></div>' +
        '<div class="cr-filters">' + Object.keys(LAB).map(function (k) { return '<button type="button" class="cr-btn sm ' + (S.bf === k ? 'on primary' : '') + '" data-a="bf" data-v="' + k + '">' + LAB[k] + ' (' + S.builds.filter(F[k]).length + ')</button>'; }).join('') + '</div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">Nothing here.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Project</th><th>Builder</th><th>Coach</th><th>State</th><th>Grade</th><th>Updated</th><th></th></tr></thead><tbody>' + list.map(function (x) {
        var disc = T.disciplinesOf(x).join(', ');
        return '<tr><td><b>' + esc(x.title) + '</b><div style="margin:.2rem 0">' + T.originTag(x) + '</div><div class="cr-note">' + esc(T.CREATION_LABEL[x.category] || x.category || '') + (disc ? ' · ' + esc(disc) : '') + '</div></td><td>' + esc(x.studentName) + '</td><td class="cr-note">' + esc(x.coachName || '—') + '</td>' +
          '<td>' + T.statePill(x) + (x.showcase === 'approved' ? ' <span class="tk-pill gold">Published</span>' : x.showcase === 'requested' ? ' <span class="tk-pill warn">Publish request</span>' : '') + ((Number(x.submissionCount) || 0) > 1 ? '<div class="cr-note">' + x.submissionCount + ' submissions</div>' : '') + '</td>' +
          '<td>' + (x.gradeLabel ? esc(x.gradeLabel) + (x.gradeScore != null && x.gradeScore !== '' ? ' · ' + esc(x.gradeScore) + '%' : '') : '—') + '</td><td class="cr-note">' + fmtDate(x.updatedAt) + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="open" data-id="' + esc(x.id) + '"><i class="fas fa-eye"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    /* ---------------- Missions (shared editor with the coach portal) ---------------- */
    function missionsTab(b) {
      var list = S.content.filter(function (c) { return c.kind === 'mission' || c.kind === 'challenge'; });
      var h = '<div class="cr-bar"><div><h3>Missions</h3><div class="cr-sub">Learning objectives, instructions, study materials and videos, practice, the task, submission requirements, assessment criteria, AI tools, level, availability and who gets it. Coaches write missions for their own builders; you can edit any.</div></div><button type="button" class="cr-btn primary" data-a="newm"><i class="fas fa-plus"></i> New mission</button></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No missions yet.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Mission</th><th>Level</th><th>Materials</th><th>For</th><th>Started</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (c) {
        var mats = c.materials || [], vids = mats.filter(function (x) { return x.type === 'video'; }).length;
        var started = S.builds.filter(function (x) { return x.missionId === c.id || x.challengeId === c.id; });
        return '<tr><td><b>' + esc(c.title) + '</b><div class="cr-note">' + esc(c.kind === 'challenge' ? 'Challenge' : 'Mission') + ((c.disciplines || []).length ? ' · ' + esc(c.disciplines.join(', ')) : '') + (c.deadline ? ' · due ' + esc(c.deadline) : '') + '</div></td>' +
          '<td>' + (c.level ? esc(T.levelName(c.level)) : '—') + '</td><td class="cr-note">' + mats.length + (vids ? ' (' + vids + ' video' + (vids === 1 ? '' : 's') + ')' : '') + ' · ' + (c.practice || []).length + ' practice · ' + (c.criteria || []).length + ' criteria</td>' +
          '<td class="cr-note">' + (c.audience === 'selected' ? (c.studentIds || []).length + ' builder(s)' : 'Everyone') + '</td>' +
          '<td>' + started.length + ' <span class="cr-note">(' + started.filter(function (x) { return x.mastery === 'approved'; }).length + ' mastered)</span></td>' +
          '<td class="cr-note">' + esc(coachName(c.createdBy) || (c.createdByName || 'Studio Desk')) + '</td>' +
          '<td>' + (c.status === 'published' ? '<span class="badge b-confirmed">Released</span>' : '<span class="badge b-pending">Draft</span>') + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="editm" data-id="' + esc(c.id) + '"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm" data-a="toggle" data-id="' + esc(c.id) + '" title="' + (c.status === 'published' ? 'Unrelease' : 'Release') + '"><i class="fas ' + (c.status === 'published' ? 'fa-eye-slash' : 'fa-paper-plane') + '"></i></button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    function openMission(id) {
      TechManage.editMission({ me: me(), item: id ? missionOf(id) : null, students: S.students, missions: S.content,
        aiTools: S.content.filter(function (c) { return c.kind === 'aiTool' && c.status === 'published'; }), onSaved: function () { toast('Mission saved.'); } });
    }

    /* ---------------- Live classes ---------------- */
    function liveTab(b) {
      var h = '<div class="cr-bar"><div><h3>Live classes</h3><div class="cr-sub">Google Meet sessions. Builders, their parents or guardians, the coach and admins are notified when a class is scheduled, changed or cancelled.</div></div><button type="button" class="cr-btn primary" data-a="newlive"><i class="fas fa-plus"></i> Schedule a class</button></div>';
      b.innerHTML = h + (S.classes.length ? '<div style="display:grid;gap:.7rem">' + S.classes.map(function (c) {
        return T.liveCardHtml(c, { manage: true }) + '<div class="cr-note" style="margin:-.3rem 0 0 .4rem">' + (c.audience === 'selected' ? 'For ' + esc((c.studentIds || []).map(function (id) { var s = S.students.filter(function (x) { return x.id === id; })[0]; return s ? s.name : 'a builder'; }).join(', ')) : 'For every active builder') + ((c.parentUids || []).length ? ' · ' + c.parentUids.length + ' guardian(s) can see it' : '') + '</div>';
      }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No live classes yet.</div></div>');
    }
    function activityTab(b) {
      b.innerHTML = '<div class="cr-bar"><div><h3>Activity</h3><div class="cr-sub">Real events recorded as builders work: sessions, projects opened and saved, materials and videos, practice, submissions, revisions, reviews, mastery and publication. Last seen is the latest of sign-in and activity.</div></div></div><div id="txPanel"></div>';
      S.panel = TechManage.mountActivity(b.querySelector('#txPanel'), { me: me(), students: S.students });
    }
    function practiceTab(b) {
      b.innerHTML = '<div class="cr-bar"><div><h3>Practice</h3><div class="cr-sub">Practice work is never graded. Coaches answer help requests; you can too.</div></div></div><div id="txPanel"></div>';
      S.panel = TechManage.mountPractice(b.querySelector('#txPanel'), { me: me(), students: S.students });
    }
    function openActivityOf(id) {
      var s = S.students.filter(function (x) { return x.id === id; })[0]; if (!s) return;
      var m = CU.openModal({ title: (s.name || 'Builder') + ' · activity', wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txAct"></div>';
      S.panel = TechManage.mountActivity(m.body.querySelector('#txAct'), { me: me(), students: S.students, studentId: id });
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { cleanLive(); m.close(); };
    }

    /* ---------------- Performance ---------------- */
    function reports(b) {
      var act = S.students.filter(function (s) { return s.status === 'Active'; });
      var week = Date.now() - 7 * 864e5;
      var seen7 = act.filter(function (s) { return (CU.toDate(T.lastSeen(s)) || 0) > week; }).length;
      var subs = S.builds.filter(function (x) { return (Number(x.submissionCount) || 0) > 0; });
      var grades = {}; T.GRADES.forEach(function (g2) { grades[g2] = 0; });
      S.builds.forEach(function (x) { if (x.gradeLabel && grades[x.gradeLabel] != null) grades[x.gradeLabel]++; });
      var byDisc = T.DISCIPLINES.map(function (d) {
        var inD = S.builds.filter(function (x) { return T.disciplinesOf(x).indexOf(d) !== -1; });
        return '<tr><td><b>' + esc(d) + '</b></td><td>' + inD.length + '</td><td>' + inD.filter(function (x) { return (Number(x.submissionCount) || 0) > 0; }).length + '</td><td>' + inD.filter(function (x) { return x.mastery === 'approved'; }).length + '</td><td>' + inD.filter(function (x) { return x.showcase === 'approved'; }).length + '</td></tr>';
      }).join('');
      var byCoach = S.coaches.map(function (c) {
        var cb = S.builds.filter(function (x) { return x.coachId === c.id; });
        var waiting = cb.filter(function (x) { return x.reviewState === 'requested' || x.reviewState === 'reviewing'; });
        var oldest = waiting.reduce(function (m2, x) { var t2 = ts(x.submittedAt); return t2 && (!m2 || t2 < m2) ? t2 : m2; }, 0);
        return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + S.students.filter(function (s) { return s.coachId === c.id && s.status === 'Active'; }).length + '</td><td>' + waiting.length + '</td><td class="cr-note">' + (oldest ? T.ago(new Date(oldest)) : '—') + '</td><td>' + cb.filter(function (x) { return x.reviewedAt; }).length + '</td></tr>';
      }).join('');
      b.innerHTML = '<div class="cr-bar"><div><h3>Performance</h3><div class="cr-sub">Live figures from TECH records.</div></div></div>' +
        '<div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' + stat(act.length, 'Active builders') + stat(seen7, 'Seen in the last 7 days') + stat(S.builds.length, 'Projects') + stat(S.builds.filter(function (x) { return T.isSelfLed(x); }).length, 'Self-led projects') + stat(subs.length, 'Submitted at least once') + stat(S.builds.filter(function (x) { return x.reviewState === 'requested' || x.reviewState === 'reviewing'; }).length, 'Waiting for review') + stat(S.builds.filter(function (x) { return x.mastery === 'approved'; }).length, 'Mastered') + stat(S.builds.filter(function (x) { return x.showcase === 'approved'; }).length, 'Published') + '</div>' +
        '<h4 style="margin:.4rem 0 .6rem;color:var(--brand-deep)">Grades given</h4><div class="cr-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1rem">' + T.GRADES.map(function (g2) { return stat(grades[g2], g2); }).join('') + '</div>' +
        '<h4 style="margin:.4rem 0 .6rem;color:var(--brand-deep)">By discipline</h4><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Discipline</th><th>Projects</th><th>Submitted</th><th>Mastered</th><th>Published</th></tr></thead><tbody>' + byDisc + '</tbody></table></div>' +
        '<h4 style="margin:1.2rem 0 .6rem;color:var(--brand-deep)">By coach</h4><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Coach</th><th>Builders</th><th>Waiting</th><th>Oldest waiting</th><th>Reviewed</th></tr></thead><tbody>' + (byCoach || '<tr><td colspan="5">No coaches.</td></tr>') + '</tbody></table></div>';
    }

    /* ---------------- Family desk (parent ↔ Studio Desk) ---------------- */
    function deskTab(b) {
      var h = '<div class="cr-bar"><div><h3>Family desk</h3><div class="cr-sub">Private messages from TECH parents and guardians to the Studio Desk (the same system as the Parent Portal). Coach conversations stay in Messages.</div></div></div>';
      b.innerHTML = h + (S.desk.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Parent / guardian</th><th>Builder</th><th>Last message</th><th>When</th><th></th></tr></thead><tbody>' + S.desk.map(function (c) {
        return '<tr><td><b>' + esc(c.parentName || 'Guardian') + '</b></td><td>' + esc(c.studentName || '') + '</td><td class="cr-note">' + (c.unreadForAdmin ? '<span class="badge b-pending">New</span> ' : '') + esc(c.lastMessage || '') + '</td><td class="cr-note">' + fmtDate(c.lastMessageAt) + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="desk" data-id="' + esc(c.parentUid + '_' + c.studentUid) + '"><i class="fas fa-comments"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No messages from TECH families yet.</div></div>');
    }
    function openDesk(cid) {
      var c = S.desk.filter(function (x) { return x.parentUid + '_' + x.studentUid === cid; })[0]; if (!c) return;
      var ref = db.collection('parentConversations').doc(cid);
      var m = CU.openModal({ title: (c.parentName || 'Guardian') + ' about ' + (c.studentName || 'their child'), wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem"><i class="fas fa-lock"></i> Private between the Studio Desk and this family. They get an email when you reply.</div><div id="dkList" style="max-height:360px;overflow:auto;display:flex;flex-direction:column;gap:.4rem"></div>' +
        '<textarea id="dkText" rows="3" maxlength="4000" style="width:100%;margin-top:.8rem;padding:.6rem;border:1.5px solid var(--line);border-radius:10px;font:inherit" placeholder="Reply…"></textarea>';
      var list = m.body.querySelector('#dkList');
      var u = ref.collection('messages').orderBy('createdAt').limitToLast(200).onSnapshot(function (s) {
        var msgs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        list.innerHTML = msgs.map(function (x) { var mine = x.senderRole === 'admin'; return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:80%;background:' + (mine ? 'var(--brand,#55BFB3)' : 'var(--sage,#E5F2EF)') + ';border-radius:12px;padding:.5rem .75rem;white-space:pre-wrap"><div class="cr-note" style="font-weight:800">' + esc(mine ? (x.senderName || 'Studio Desk') : (x.senderName || 'Parent')) + ' · ' + fmtDate(x.createdAt) + '</div>' + esc(x.text) + '</div>'; }).join('') || '<div class="cr-empty">No messages.</div>';
        list.scrollTop = list.scrollHeight;
        var unread = msgs.filter(function (x) { return x.senderRole === 'parent' && x.read !== true; });
        if (unread.length) { var bt = db.batch(); unread.forEach(function (x) { bt.update(ref.collection('messages').doc(x.id), { read: true }); }); bt.update(ref, { unreadForAdmin: false }); bt.commit().catch(function () { }); }
      });
      S.panel = { destroy: u };
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Close</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-paper-plane"></i> Send</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { cleanLive(); m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var text = m.body.querySelector('#dkText').value.trim(), btn = this; if (!text) return; btn.disabled = true;
        var bt = db.batch();
        bt.set(ref, { lastMessage: text.slice(0, 140), lastMessageAt: FV().serverTimestamp(), lastSenderRole: 'admin', unreadForAdmin: false, unreadForParent: true }, { merge: true });
        bt.set(ref.collection('messages').doc(), { conversationId: cid, parentUid: c.parentUid, studentUid: c.studentUid, adminUid: o.uid, senderUid: o.uid, senderRole: 'admin', senderName: o.name || 'Studio Desk', text: text.slice(0, 4000), read: false, createdAt: FV().serverTimestamp() });
        bt.commit().then(function () { m.body.querySelector('#dkText').value = ''; btn.disabled = false; }).catch(function (e) { btn.disabled = false; m.foot.querySelector('#txErr').textContent = errMsg(e); });
      };
    }
    function openBuild(id) {
      var x = S.builds.filter(function (y) { return y.id === id; })[0]; if (!x) return;
      var m = CU.openModal({ title: x.title || 'Build', wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txWs"></div>';
      S.ws = T.mountWorkspace(m.body.querySelector('#txWs'), { id: id, me: me(), mission: x.missionId ? missionOf(x.missionId) : null, findMission: missionOf });
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { cleanLive(); m.close(); };
    }

    /* ---------------- Studio Builder (content) ---------------- */
    function content(b) {
      var list = S.content.filter(function (c) {
        if (S.kind !== 'all' && c.kind !== S.kind) return false;
        if (S.discipline !== 'all') {
          var d = Array.isArray(c.disciplines) ? c.disciplines : (c.discipline ? [c.discipline] : []);
          if (d.indexOf(S.discipline) === -1) return false;
        }
        if (S.level !== 'all' && String(c.level || '') !== String(S.level)) return false;
        return true;
      });
      var levelOpts = '<option value="all">All levels</option>' + T.LEVELS.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (S.level === String(i + 1) ? ' selected' : '') + '>' + (i + 1) + ' · ' + n + '</option>'; }).join('');
      var discOpts = '<option value="all">All disciplines</option>' + T.DISCIPLINES.map(function (d) { return '<option' + (S.discipline === d ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('');
      var h = '<div class="cr-bar"><div><h3>Studio Builder</h3><div class="cr-sub">Missions, topics, paths, challenges, resources, templates, and general tools. Drafts stay hidden until published.</div></div><button type="button" class="cr-btn primary" data-a="new"><i class="fas fa-plus"></i> New item</button></div>' +
        '<div class="cr-filters"><select data-f="kind" aria-label="Type"><option value="all">All types</option>' + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (S.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>' +
        '<select data-f="discipline" aria-label="Discipline">' + discOpts + '</select>' +
        '<select data-f="level" aria-label="Level">' + levelOpts + '</select></div>';
      h += '<div class="cr-note" style="margin:-.3rem 0 .8rem">Missions and challenges, with study materials and videos, are edited in the <b>Missions</b> tab.</div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">Nothing here yet. Add the first item.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Title</th><th>Type</th><th>Level</th><th>Discipline</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (c) {
        var live = c.status === 'published', id = esc(c.id);
        var disc = Array.isArray(c.disciplines) && c.disciplines.length ? c.disciplines.join(', ') : (c.discipline || '—');
        return '<tr><td><b>' + esc(c.title) + '</b><div class="cr-note">' + esc(c.summary || '') + '</div></td><td><span class="badge b-plain">' + esc(c.kind || '') + '</span></td><td>' + (c.level ? esc(T.levelName(c.level)) : '—') + '</td><td class="cr-note">' + esc(disc) + '</td><td class="cr-note">' + esc(coachName(c.createdBy) || (c.createdBy === o.uid ? 'Studio Desk' : '—')) + '</td><td>' + (live ? '<span class="badge b-confirmed">Live</span>' : '<span class="badge b-pending">Draft</span>') + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="toggle" data-id="' + id + '" title="' + (live ? 'Unpublish' : 'Publish') + '"><i class="fas ' + (live ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + id + '" title="Edit"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm danger" data-a="del" data-id="' + id + '" title="Delete"><i class="fas fa-trash"></i></button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    function openEditor(id) {
      var c = S.content.filter(function (x) { return x.id === id; })[0] || { kind: 'mission', status: 'draft' };
      var isAI = c.kind === 'aiTool';
      var m = CU.openModal({ title: id ? 'Edit item' : 'New item', wide: true });
      var kindOpts = KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (c.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('');
      var discChecks = T.DISCIPLINES.map(function (d) {
        var on = (Array.isArray(c.disciplines) ? c.disciplines : (c.discipline ? [c.discipline] : [])).indexOf(d) !== -1;
        return '<label style="display:inline-flex;gap:.35rem;align-items:center;margin:0 .5rem .35rem 0;font-size:.82rem;font-weight:600;text-transform:none;letter-spacing:0;cursor:pointer"><input type="checkbox" class="ctDisc" value="' + esc(d) + '"' + (on ? ' checked' : '') + '> ' + esc(d) + '</label>';
      }).join('');
      var creationOpts = '<option value="">—</option>' + T.CREATION_TYPES.map(function (k) { return '<option value="' + k + '"' + (c.creationType === k ? ' selected' : '') + '>' + esc(T.CREATION_LABEL[k] || k) + '</option>'; }).join('');
      var aiCatOpts = AI_CATEGORIES.map(function (k) { return '<option value="' + k + '"' + (c.category === k ? ' selected' : '') + '>' + k + '</option>'; }).join('');
      m.body.innerHTML =
        '<div class="cr-row2"><div class="cr-field"><label for="ctK">Type</label><select id="ctK">' + kindOpts + '</select></div>' +
        '<div class="cr-field"><label for="ctL">Level (1–7)</label><input id="ctL" type="number" min="1" max="7" value="' + esc(c.level || '') + '"></div></div>' +
        '<div class="cr-field"><label for="ctT">Title</label><input id="ctT" maxlength="120" value="' + esc(c.title || '') + '"></div>' +
        '<div class="cr-field"><label for="ctS">One-line summary</label><input id="ctS" maxlength="300" value="' + esc(c.summary || '') + '"></div>' +
        '<div class="cr-field"><label>Disciplines</label><div id="ctDisc">' + discChecks + '</div></div>' +
        '<div class="cr-field"><label for="ctCt">Creation type</label><select id="ctCt">' + creationOpts + '</select></div>' +
        '<div class="cr-field"><label for="ctObj">Learning objectives (optional)</label><textarea id="ctObj" rows="2" maxlength="1000">' + esc(c.objectives || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="ctB">Details / activities</label><textarea id="ctB" rows="6" maxlength="8000">' + esc(c.body || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="ctBr">Creation brief (optional)</label><textarea id="ctBr" rows="3" maxlength="2000">' + esc(c.brief || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="ctSr">Submission requirements (optional)</label><textarea id="ctSr" rows="2" maxlength="1000">' + esc(c.submissionReq || '') + '</textarea></div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="ctU">Link (https://…)</label><input id="ctU" value="' + esc(c.url || '') + '"></div>' +
        '<div class="cr-field"><label for="ctP">Status</label><select id="ctP"><option value="draft"' + (c.status === 'draft' ? ' selected' : '') + '>Draft (hidden)</option><option value="published"' + (c.status === 'published' ? ' selected' : '') + '>Published</option></select></div></div>' +
        '<div id="ctAIBLOCKS" style="' + (isAI ? '' : 'display:none') + '"><div class="cr-field"><label for="ctAC">AI tool category</label><select id="ctAC">' + aiCatOpts + '</select></div>' +
        '<div class="cr-field"><label for="ctAD">Description</label><textarea id="ctAD" rows="2" maxlength="800">' + esc(c.description || '') + '</textarea></div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="ctAAge">Age guidance</label><input id="ctAAge" value="' + esc(c.ageGuidance || '') + '"></div>' +
        '<div class="cr-field"><label for="ctADis">Disclosure required</label><input id="ctADis" value="' + esc(c.disclosure || '') + '"></div></div>' +
        '<div class="cr-field"><label for="ctAPerm">Permitted uses</label><textarea id="ctAPerm" rows="2" maxlength="800">' + esc(c.permitted || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="ctARes">Restrictions</label><textarea id="ctARes" rows="2" maxlength="800">' + esc(c.restrictions || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="ctASaf">Safety instructions</label><textarea id="ctASaf" rows="2" maxlength="800">' + esc(c.safety || '') + '</textarea></div></div>' +
        '<div id="ctMISSIONBLOCKS" style="' + (isAI ? 'display:none' : '') + '"><div class="cr-field"><label for="ctAIRules">AI usage rules (optional)</label><textarea id="ctAIRules" rows="3" maxlength="2000">' + esc(c.aiRules || '') + '</textarea></div>' +
        '<div class="cr-field"><label>Approved AI tools (pick from the AI Toolbox)</label><div id="ctAITools">' + renderAiToolPicker(c.aiTools || []) + '</div></div></div>';
      m.foot.innerHTML = '<span class="cr-err" id="txErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-floppy-disk"></i> Save</button>';
      m.foot.querySelector('[data-a="x"]').onclick = m.close;

      var kindSel = m.body.querySelector('#ctK');
      kindSel.addEventListener('change', function () {
        var isAI2 = kindSel.value === 'aiTool';
        m.body.querySelector('#ctAIBLOCKS').style.display = isAI2 ? '' : 'none';
        m.body.querySelector('#ctMISSIONBLOCKS').style.display = isAI2 ? 'none' : '';
      });

      m.foot.querySelector('[data-a="go"]').onclick = function () {
        var $ = function (i) { return m.body.querySelector('#' + i); }, err = m.foot.querySelector('#txErr'), btn = this;
        if (!$('ctT').value.trim()) { err.textContent = 'A title is required.'; return; }
        var kind = $('ctK').value;
        var disciplines = Array.prototype.map.call(m.body.querySelectorAll('.ctDisc:checked'), function (x) { return x.value; });
        var aiToolIds = Array.prototype.map.call(m.body.querySelectorAll('.ctAiTool:checked'), function (x) { return x.value; });
        var aiTools = aiToolIds.map(function (tid) {
          var t = S.content.filter(function (x) { return x.id === tid; })[0];
          if (!t) return null;
          return { name: t.name || t.title || '', url: T.safeUrl(t.url) || '', category: t.category || '' };
        }).filter(Boolean);
        var d = {
          kind: kind,
          title: $('ctT').value.trim().slice(0, 120),
          summary: $('ctS').value.trim().slice(0, 300),
          body: $('ctB').value.trim().slice(0, 8000),
          objectives: $('ctObj').value.trim().slice(0, 1000),
          brief: $('ctBr').value.trim().slice(0, 2000),
          submissionReq: $('ctSr').value.trim().slice(0, 1000),
          creationType: $('ctCt').value || '',
          url: T.safeUrl($('ctU').value),
          level: Math.max(0, Math.min(7, Number($('ctL').value) || 0)),
          status: $('ctP').value,
          disciplines: disciplines,
          updatedAt: FV().serverTimestamp()
        };
        if (kind === 'aiTool') {
          d.category = $('ctAC').value;
          d.description = $('ctAD').value.trim().slice(0, 800);
          d.ageGuidance = $('ctAAge').value.trim().slice(0, 200);
          d.disclosure = $('ctADis').value.trim().slice(0, 400);
          d.permitted = $('ctAPerm').value.trim().slice(0, 800);
          d.restrictions = $('ctARes').value.trim().slice(0, 800);
          d.safety = $('ctASaf').value.trim().slice(0, 800);
        } else {
          d.aiRules = $('ctAIRules').value.trim().slice(0, 2000);
          d.aiTools = aiTools;
        }
        btn.disabled = true;
        var p = id ? db.collection('techContent').doc(id).update(d) : db.collection('techContent').add(Object.assign(d, { createdBy: o.uid, createdAt: FV().serverTimestamp() }));
        p.then(function () { m.close(); toast('Saved.'); }).catch(function (e) { btn.disabled = false; err.textContent = errMsg(e); });
      };
    }

    function renderAiToolPicker(selectedTools) {
      var tools = S.content.filter(function (c) { return c.kind === 'aiTool' && c.status === 'published'; });
      if (!tools.length) return '<div class="cr-note">No published AI tools yet. Add one in the AI Toolbox tab.</div>';
      var selectedNames = selectedTools.map(function (t) { return t.name || ''; });
      return tools.map(function (t) {
        var on = selectedNames.indexOf(t.name || '') !== -1 || selectedNames.indexOf(t.title || '') !== -1;
        return '<label style="display:flex;gap:.4rem;align-items:flex-start;padding:.35rem .5rem;border-radius:8px;margin:0 0 .2rem 0;font-size:.82rem;font-weight:600;text-transform:none;letter-spacing:0;cursor:pointer"><input type="checkbox" class="ctAiTool" value="' + esc(t.id) + '"' + (on ? ' checked' : '') + '> <span><b>' + esc(t.name || t.title) + '</b>' + (t.category ? ' <span class="cr-note">· ' + esc(t.category) + '</span>' : '') + '</span></label>';
      }).join('');
    }

    /* ---------------- AI Toolbox (dedicated tab) ---------------- */
    function aiTools(b) {
      var list = S.content.filter(function (c) { return c.kind === 'aiTool'; });
      var h = '<div class="cr-bar"><div><h3>AI Toolbox</h3><div class="cr-sub">Approved AI tools students can use. Attach them to missions in the Studio Builder.</div></div><button type="button" class="cr-btn primary" data-a="new-ai"><i class="fas fa-plus"></i> New AI tool</button></div>';
      if (!list.length) { b.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No AI tools yet. Add Claude, ChatGPT, an image generator — whatever you approve for your builders.</div></div>'; return; }
      b.innerHTML = h + '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Tool</th><th>Category</th><th>Age</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (c) {
        var live = c.status === 'published';
        return '<tr><td><b>' + esc(c.name || c.title) + '</b><div class="cr-note">' + esc(c.description || c.summary || '') + '</div>' + (c.url ? '<div class="cr-note"><a href="' + esc(T.safeUrl(c.url)) + '" target="_blank" rel="noopener">' + esc(c.url) + '</a></div>' : '') + '</td>' +
          '<td><span class="badge b-plain">' + esc(c.category || '—') + '</span></td>' +
          '<td class="cr-note">' + esc(c.ageGuidance || '—') + '</td>' +
          '<td>' + (live ? '<span class="badge b-confirmed">Live</span>' : '<span class="badge b-pending">Draft</span>') + '</td>' +
          '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="toggle" data-id="' + esc(c.id) + '"><i class="fas ' + (live ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
          '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + esc(c.id) + '"><i class="fas fa-pen"></i></button>' +
          '<button type="button" class="cr-btn sm danger" data-a="del" data-id="' + esc(c.id) + '"><i class="fas fa-trash"></i></button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    /* ---------------- messages ---------------- */
    function messages(b) {
      var h = '<div class="cr-bar"><div><h3>Messages</h3><div class="cr-sub">Coach ↔ builder and coach ↔ family conversations. You can read and join any of them.</div></div></div>';
      var bt = S.chats.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Coach</th><th>Last message</th><th>When</th><th></th></tr></thead><tbody>' + S.chats.map(function (c) {
        return '<tr><td><b>' + esc(c.studentName || 'Builder') + '</b></td><td>' + esc(c.coachName || c.tutorName || '—') + '</td><td class="cr-note">' + esc(c.lastMessage || '—') + '</td><td class="cr-note">' + fmtDate(c.lastAt) + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="chat" data-id="' + esc(c.id) + '"><i class="fas fa-comments"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No builder conversations yet.</div></div>';
      var gt = S.gchats.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Guardian</th><th>Builder</th><th>Coach</th><th>Last message</th><th>When</th><th></th></tr></thead><tbody>' + S.gchats.map(function (c) {
        return '<tr><td><b>' + esc(c.parentName || 'Guardian') + '</b></td><td>' + esc(c.studentName || '') + '</td><td>' + (c.coachId ? esc(c.coachName || '') : '<span class="badge b-pending">No coach — reply as Studio Desk</span>') + '</td><td class="cr-note">' + esc(c.lastMessage || '—') + '</td><td class="cr-note">' + fmtDate(c.lastAt) + '</td>' +
          '<td><button type="button" class="cr-btn sm primary" data-a="gchat" data-id="' + esc(c.id) + '"><i class="fas fa-comments"></i> Open</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No family conversations yet.</div></div>';
      b.innerHTML = h + '<h4 style="margin:.2rem 0 .6rem;color:var(--brand-deep)">Builders</h4>' + bt + '<h4 style="margin:1.4rem 0 .6rem;color:var(--brand-deep)">Families</h4>' + gt;
    }
    function openGuardianChat(id) {
      var c = S.gchats.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      var m = CU.openModal({ title: (c.parentName || 'Guardian') + ' ↔ ' + (c.coachName || 'Studio Desk') + ' · ' + (c.studentName || ''), wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txCh"></div>';
      S.chat = T.mountChat(m.body.querySelector('#txCh'), { kind: 'guardian', parentUid: c.parentUid, parentName: c.parentName, studentId: c.studentId, studentName: c.studentName, coachId: c.coachId, coachName: c.coachName, me: { uid: o.uid, role: 'admin', name: o.name || 'Studio Desk' } });
      m.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { cleanLive(); m.close(); };
    }
    function openChat(id) {
      var c = S.chats.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      var m = CU.openModal({ title: (c.studentName || 'Builder') + ' ↔ ' + (c.coachName || c.tutorName || 'Coach'), wide: true, onClose: cleanLive });
      m.body.innerHTML = '<div id="txCh"></div>';
      S.chat = T.mountChat(m.body.querySelector('#txCh'), { studentId: c.studentId, studentName: c.studentName, coachId: c.coachId || c.tutorId, coachName: c.coachName || c.tutorName, me: { uid: o.uid, role: 'admin', name: o.name || 'Studio Desk' } });
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
      else if (a === 'guardians') { var gs = stu(); if (gs) openGuardians(gs); }
      else if (a === 'new-coach') openNewCoach();
      else if (a === 'coach-off' || a === 'coach-on') {
        var on = a === 'coach-on', co = S.coaches.filter(function (x) { return x.id === id; })[0];
        if (co && (on || confirm('Pause ' + co.name + '? They will not be able to sign in to the coach portal until you activate them again.')))
          db.collection('techCoaches').doc(id).update({ status: on ? 'Active' : 'Inactive', updatedAt: FV().serverTimestamp() }).then(function () { toast(on ? 'Coach activated.' : 'Coach paused.'); }).catch(fail);
      }
      else if (a === 'gchat') openGuardianChat(id);
      else if (a === 'migrate') {
        var dry = !!t.dataset.dry, out = root.querySelector('#txMig');
        if (!dry && !confirm('Move all legacy TECH builders to the new TECH architecture now? Guardians of active builders will be emailed their TECH login.')) return;
        t.disabled = true; out.textContent = dry ? 'Checking…' : 'Moving…';
        call('migrateTechArchitecture', { dryRun: dry }).then(function (r) {
          var line = r.students + ' builder(s), ' + r.coaches + ' coach(es), ' + r.builds + ' build(s), ' + r.chats + ' chat(s)' + (dry ? ' would move.' : ' moved, ' + r.guardiansLinked + ' guardian link(s).') + (r.errors && r.errors.length ? ' Errors: ' + r.errors.join('; ') : '');
          if (!dry) { S.legacy = 0; render(); toast(line); } else { t.disabled = false; out.textContent = line; }
        }).catch(function (e) { t.disabled = false; out.textContent = errMsg(e); });
      }
      else if (a === 'open') openBuild(id);
      else if (a === 'bf') { S.bf = t.dataset.v; render(); }
      else if (a === 'newm') openMission(null);
      else if (a === 'editm') openMission(id);
      else if (a === 'newlive') TechManage.editLive({ me: me(), students: S.students, coaches: S.coaches });
      else if (a === 'actof') openActivityOf(id);
      else if (a === 'desk') openDesk(id);
      else if (a === 'new') openEditor();
      else if (a === 'new-ai') {
        /* Jump to the editor pre-set to aiTool */
        var fake = document.createElement('div');
        /* simplest: open editor with a synthetic kind */
        var origContent = S.content;
        /* we can't prefill via the shared editor cleanly, so just call openEditor without id and then set the kind dropdown */
        openEditor();
        setTimeout(function () {
          var k = document.querySelector('.cr-overlay #ctK');
          if (k) { k.value = 'aiTool'; k.dispatchEvent(new Event('change')); }
        }, 20);
      }
      else if (a === 'edit') { var ed = missionOf(id); if (ed && (ed.kind === 'mission' || ed.kind === 'challenge')) openMission(id); else openEditor(id); }
      else if (a === 'toggle') { var it = S.content.filter(function (x) { return x.id === id; })[0]; if (it) db.collection('techContent').doc(id).update({ status: it.status === 'published' ? 'draft' : 'published', updatedAt: FV().serverTimestamp() }).catch(fail); }
      else if (a === 'del') { if (confirm('Delete this item? This cannot be undone.')) db.collection('techContent').doc(id).delete().catch(fail); }
      else if (a === 'chat') openChat(id);
      else if (a === 'feat') { var w = S.wall.filter(function (x) { return x.id === id; })[0]; if (w) db.collection('techShowcase').doc(id).update({ featured: !w.featured }).catch(fail); }
      else if (a === 'unpub') { if (confirm('Remove this build from the public TECH Wall?')) T.removeShowcase({ id: id }).then(function () { toast('Removed from the Wall.'); }).catch(fail); }
    });
    /* Live-class cards render their own edit buttons (TechUI.liveCardHtml). */
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-editlive]'); if (!t) return;
      TechManage.editLive({ me: me(), item: S.classes.filter(function (c) { return c.id === t.dataset.editlive; })[0], students: S.students, coaches: S.coaches });
    });
    root.addEventListener('input', function (e) { if (e.target.dataset.f === 'q') { S.q = e.target.value; var pos = e.target.selectionStart; render(); var i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { } } } });
    root.addEventListener('change', function (e) {
      var f = e.target.dataset.f;
      if (f === 'status' || f === 'kind' || f === 'discipline' || f === 'level') { S[f] = e.target.value; render(); }
    });

    return { destroy: function () { S.unsubs.forEach(function (u) { u(); }); cleanLive(); if (S.bell) S.bell.destroy(); } };
  }
  g.TechAdmin = { mount: mount };
})(window);