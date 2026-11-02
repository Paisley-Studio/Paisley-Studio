/* =========================================================
   Paisley Tech Studio: groups  (window.TechGroups)
   ---------------------------------------------------------
   A coach or admin puts builders in a named group and gives the group
   tasks. Members see their group, who is in it and its tasks, and do
   each task together in one live Code IDE: everyone's edits merge, and
   each person's cursor shows to the others with their name.

     techGroups/{gid}   { name, memberIds[], members: [{ id, name }], track,
                          coachId, createdBy, createdByName, createdAt, updatedAt }
     techGroups/{gid}/tasks/{tid}
                        { title, brief, kind: 'code' | 'writing', groupId, groupName,
                          createdBy, createdByName, createdAt,
                          codeFiles, codeFolders, codeAssets (shared work),
                          status: Draft | Submitted | Graded | Corrections, submittedBy...,
                          feedback, grade, maxScore, gradedFileUrl, history (marking) }
     techGroups/{gid}/tasks/{tid}/presence/{uid}   where each member's cursor is

   A writing task is one shared document (writing.md) in the same IDE.
   Marking is the class-work ink marking (TechWork.openWorkView).

     TechGroups.mountManager(host, { me, students })   admin and coach
     TechGroups.mountMine(host, { me, student })        a builder
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var GROUPS = function () { return db.collection('techGroups'); };
  var docs = function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id, ref: d.ref }, d.data()); }); };
  var KINDS = [['code', 'Code together (HTML, CSS, JavaScript)'], ['writing', 'Write together (one shared document)']];

  function starter(kind, title) {
    if (kind === 'writing') return [{ name: 'writing.md', lang: 'md', content: '# ' + (title || 'Our writing') + '\n\n' }];
    return [
      { name: 'index.html', lang: 'html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>' + String(title || 'Our project').replace(/[<>&"]/g, '') + '</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>' + String(title || 'Our project').replace(/[<>&"]/g, '') + '</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n' },
      { name: 'style.css', lang: 'css', content: 'body {\n  font-family: sans-serif;\n  padding: 2rem;\n}\n' },
      { name: 'script.js', lang: 'js', content: '' }
    ];
  }
  function style() {
    if (g.TechWork) g.TechWork.style();
    if (document.getElementById('tg-style')) return;
    var s = document.createElement('style'); s.id = 'tg-style';
    s.textContent = [
      '.tg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem}',
      '.tg-card{display:flex;flex-direction:column;gap:.5rem;width:100%;text-align:left;font:inherit;padding:1.1rem;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;cursor:pointer;box-shadow:0 4px 14px rgba(36,95,90,.04)}',
      '.tg-card:hover{border-color:var(--brand,#55BFB3)}.tg-card b{font-size:1.05rem;color:var(--brand-deep,#245F5A)}',
      '.tg-people{display:flex;flex-wrap:wrap;gap:.35rem}',
      '.tg-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem .2rem .2rem;border-radius:99px;background:var(--sage,#E5F2EF);font-size:.76rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tg-chip i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--brand-deep,#245F5A);color:#fff;font-style:normal;font-size:.68rem}',
      '.tg-chip.me i{background:#F5C842;color:#3b2d00}',
      '.tg-pick{max-height:300px;overflow:auto;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;padding:.3rem}',
      '.tg-pick label{display:flex;gap:.5rem;align-items:center;padding:.4rem .5rem;border-radius:8px;cursor:pointer;font-weight:700;font-size:.86rem}',
      '.tg-pick label:hover{background:var(--sage,#E5F2EF)}.tg-pick small{color:var(--muted,#5A6E6A);font-weight:600;margin-left:auto}',
      '.tg-task{display:flex;align-items:center;gap:.8rem;padding:.75rem 1rem;border-top:1px solid var(--line,rgba(38,51,49,.08));flex-wrap:wrap}',
      '.tg-task:first-child{border-top:0}.tg-task .t{flex:1;min-width:180px}.tg-task .t b{display:block;font-weight:800;color:var(--ink,#263331)}.tg-task .t small{color:var(--muted,#5A6E6A);font-weight:600;font-size:.78rem}',
      '.tg-box{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;margin-bottom:1rem;overflow:hidden}',
      '.tg-box-head{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.9rem 1rem;background:var(--sage,#E5F2EF)}',
      '.tg-box-head h3{margin:0;font-size:1.05rem;color:var(--brand-deep,#245F5A);flex:1}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function chips(members, meId) {
    return '<div class="tg-people">' + (members || []).map(function (m) {
      return '<span class="tg-chip' + (m.id === meId ? ' me' : '') + '"><i>' + esc(initials(m.name)) + '</i>' + esc(m.id === meId ? 'You' : T.firstName(m.name)) + '</span>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------
     Staff: groups, members, tasks, marking
     --------------------------------------------------------- */
  function mountManager(host, o) {
    var CU = g.ClassroomUI.util, me = o.me, isAdmin = me.role === 'admin';
    CU.injectStyle(); T.injectStyle(); style(); if (g.TechWork) g.TechWork.style();
    host.classList.add('cr-root');
    var students = (o.students || []).filter(function (s) { return s.status === 'Active'; });
    var mine = {}; students.forEach(function (s) { mine[s.id] = s; });
    var S = { groups: null, open: null, tasks: [], mineOnly: !isAdmin }, unsub = null, taskUnsub = null, dead = false;
    function note(t, bad) { var el = host.querySelector('#tgNote'); if (el) { el.textContent = t || ''; el.style.color = bad ? '#b8362a' : 'var(--brand-deep,#245F5A)'; } }
    function fail(e) { note(T.errMsg(e), true); }
    unsub = GROUPS().onSnapshot(function (s) {
      if (dead) return;
      S.groups = docs(s).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (S.open) { S.open = S.groups.filter(function (x) { return x.id === S.open.id; })[0] || null; if (!S.open) closeGroup(); }
      paint();
    }, function (e) { host.innerHTML = '<div class="cr-empty">Could not load groups: ' + esc(T.errMsg(e)) + '</div>'; });

    function visible(gr) { return !S.mineOnly || gr.createdBy === me.uid || gr.coachId === me.uid || (gr.memberIds || []).some(function (id) { return mine[id]; }); }
    function openGroup(gr) {
      closeGroup(); S.open = gr;
      taskUnsub = gr.ref.collection('tasks').onSnapshot(function (s) {
        S.tasks = docs(s).sort(function (a, b) { return (T.toDate(b.createdAt) || 0) - (T.toDate(a.createdAt) || 0); }); paint();
      }, fail);
      paint();
    }
    function closeGroup() { if (taskUnsub) taskUnsub(); taskUnsub = null; S.open = null; S.tasks = []; }
    function canChange(gr) { return isAdmin || gr.createdBy === me.uid; }

    function paint() {
      if (dead) return;
      if (S.groups === null) { host.innerHTML = '<div class="cr-empty">Loading groups…</div>'; return; }
      if (S.open) return paintGroup();
      var list = S.groups.filter(visible);
      host.innerHTML = '<div class="cr-bar"><div><h3>Groups</h3><div class="cr-sub">Put builders together, give the group a task, and they code it together in one live Paisley VS Code, each seeing where the others are typing. You mark it with ink like class work.</div></div>' +
        '<button type="button" class="cr-btn primary" data-g="new"><i class="fas fa-plus"></i> New group</button></div>' +
        (isAdmin ? '' : '<label class="cr-note" style="display:inline-flex;gap:.4rem;align-items:center;margin-bottom:.8rem;cursor:pointer"><input type="checkbox" data-g="mineonly"' + (S.mineOnly ? ' checked' : '') + '> Only groups with my builders</label>') +
        (list.length ? '<div class="tg-grid">' + list.map(function (gr) {
          return '<button type="button" class="tg-card" data-g="open" data-id="' + esc(gr.id) + '"><b><i class="fas fa-people-group"></i> ' + esc(gr.name) + '</b>' +
            '<span class="cr-note">' + (gr.memberIds || []).length + ' builder' + ((gr.memberIds || []).length === 1 ? '' : 's') + (gr.track ? ' · ' + esc(T.TRACK_LABEL[gr.track] || '') : '') + (gr.createdByName ? ' · by ' + esc(gr.createdByName) : '') + '</span>' + chips(gr.members) + '</button>';
        }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No groups yet. Use “New group”, name it, and pick the builders.</div></div>') +
        '<div class="cr-note" id="tgNote" role="status" style="margin-top:.6rem"></div>';
    }
    function paintGroup() {
      var gr = S.open, can = canChange(gr);
      var todo = S.tasks.filter(function (t) { return t.status === 'Submitted'; }).length;
      host.innerHTML = '<div class="cr-crumb"><a data-g="back">Groups</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(gr.name) + '</span></div>' +
        '<div class="tg-box"><div class="tg-box-head"><h3><i class="fas fa-people-group"></i> ' + esc(gr.name) + '</h3>' +
          (can ? '<button type="button" class="cr-btn sm" data-g="edit"><i class="fas fa-user-pen"></i> Members and name</button><button type="button" class="cr-btn sm danger" data-g="del" aria-label="Delete group"><i class="fas fa-trash"></i></button>' : '') + '</div>' +
          '<div style="padding:.9rem 1rem">' + chips(gr.members) + '</div></div>' +
        '<div class="cr-bar"><div><h3>Tasks' + (todo ? ' <span class="cr-badge draft">' + todo + ' to mark</span>' : '') + '</h3><div class="cr-sub">Every member sees each task and works on it at the same time. Any member can hand it in for the group.</div></div>' +
          '<button type="button" class="cr-btn primary" data-g="task"><i class="fas fa-plus"></i> Give a task</button></div>' +
        (S.tasks.length ? '<div class="tg-box">' + S.tasks.map(function (t) {
          return '<div class="tg-task"><span class="t"><b>' + esc(t.title) + '</b><small>' + (t.kind === 'writing' ? 'Writing together' : 'Coding together') + (t.createdByName ? ' · ' + esc(t.createdByName) : '') + (t.codeByName ? ' · last change by ' + esc(t.codeByName) : '') + '</small></span>' +
            g.TechWork.statePill(t.status) + (g.TechWork.scoreText(t) ? '<span class="tc-pill">' + esc(g.TechWork.scoreText(t)) + '</span>' : '') +
            '<button type="button" class="cr-btn sm' + (t.status === 'Submitted' ? ' primary' : '') + '" data-g="opentask" data-id="' + esc(t.id) + '"><i class="fas ' + (t.status === 'Submitted' ? 'fa-pen-nib' : 'fa-eye') + '"></i> ' + (t.status === 'Submitted' ? 'Open and mark' : 'Watch live') + '</button>' +
            (isAdmin || t.createdBy === me.uid ? '<button type="button" class="cr-btn sm" data-g="edittask" data-id="' + esc(t.id) + '" aria-label="Edit task"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm danger" data-g="deltask" data-id="' + esc(t.id) + '" aria-label="Delete task"><i class="fas fa-trash"></i></button>' : '') + '</div>';
        }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No tasks yet. “Give a task” says what to make; the group works on it together.</div></div>') +
        '<div class="cr-note" id="tgNote" role="status" style="margin-top:.6rem"></div>';
    }

    function openEditGroup(gr) {
      var m = CU.openModal({ title: gr ? 'Group: ' + gr.name : 'New group', wide: true });
      var picked = {}; ((gr && gr.memberIds) || []).forEach(function (id) { picked[id] = true; });
      var known = {}; students.forEach(function (s) { known[s.id] = s; });
      ((gr && gr.members) || []).forEach(function (x) { if (!known[x.id]) known[x.id] = { id: x.id, name: x.name, status: 'Active' }; });
      var all = Object.keys(known).map(function (k) { return known[k]; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var track = (gr && gr.track) || '';
      function rows() {
        return all.filter(function (s) { return !track || picked[s.id] || T.trackOf(s.skillLevel) === track; }).map(function (s) {
          return '<label><input type="checkbox" data-pick="' + esc(s.id) + '"' + (picked[s.id] ? ' checked' : '') + '> ' + esc(s.name || s.email || 'Builder') + '<small>' + esc(T.SKILL_LABEL[s.skillLevel] || 'No level yet') + '</small></label>';
        }).join('') || '<div class="cr-empty">No active builders' + (track ? ' at this level' : '') + '.</div>';
      }
      m.body.innerHTML = '<div class="cr-row2"><div class="cr-field"><label for="tgN">Group name</label><input type="text" id="tgN" maxlength="80" placeholder="e.g. Team Rocket" value="' + esc(gr ? gr.name : '') + '"></div>' +
        '<div class="cr-field"><label for="tgL">Level</label><select id="tgL"><option value="">Any level</option>' + T.TRACKS.map(function (t) { return '<option value="' + t + '"' + (track === t ? ' selected' : '') + '>' + esc(T.TRACK_LABEL[t]) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="cr-field"><label>Builders in the group</label><div class="tg-pick" id="tgPick">' + rows() + '</div><div class="cr-note" id="tgCount" style="margin-top:.3rem"></div></div>';
      var count = function () { var n = Object.keys(picked).filter(function (k) { return picked[k]; }).length; m.body.querySelector('#tgCount').textContent = n + ' picked (up to 30).'; };
      count();
      m.body.addEventListener('change', function (e) {
        if (e.target.id === 'tgL') { track = e.target.value; m.body.querySelector('#tgPick').innerHTML = rows(); }
        if (e.target.dataset.pick) { picked[e.target.dataset.pick] = e.target.checked; count(); }
      });
      m.foot.innerHTML = '<span class="cr-err" id="tgE"></span><button type="button" class="cr-btn" data-x>Cancel</button><button type="button" class="cr-btn primary" data-go>' + (gr ? 'Save' : 'Create group') + '</button>';
      m.foot.querySelector('[data-x]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = async function () {
        var b = this, err = m.foot.querySelector('#tgE'), name = m.body.querySelector('#tgN').value.trim();
        var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
        if (!name) { err.textContent = 'Give the group a name.'; return; }
        if (ids.length < 2) { err.textContent = 'Pick at least two builders.'; return; }
        if (ids.length > 30) { err.textContent = 'A group can have up to 30 builders.'; return; }
        var members = ids.map(function (id) { return { id: id, name: (known[id] && known[id].name) || 'Builder' }; });
        var d = { name: name.slice(0, 80), track: track, memberIds: ids, members: members, updatedAt: FV().serverTimestamp() };
        b.disabled = true;
        try {
          if (gr) await gr.ref.update(d);
          else {
            await GROUPS().add(Object.assign(d, { coachId: isAdmin ? '' : me.uid, createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp() }));
          }
          m.close();
          note(gr ? 'Saved. New members are told.' : 'Group created. The builders are told.');
        } catch (e) { b.disabled = false; err.textContent = T.errMsg(e); }
      };
      m.body.querySelector('#tgN').focus();
    }
    function openTaskEditor(t) {
      var gr = S.open, m = CU.openModal({ title: (t ? 'Edit task · ' : 'Give a task · ') + gr.name, wide: true });
      m.body.innerHTML = '<div class="cr-field"><label for="tgT">Task title</label><input type="text" id="tgT" maxlength="140" placeholder="e.g. Build a quiz page together" value="' + esc(t ? t.title : '') + '"></div>' +
        '<div class="cr-field"><label for="tgB">What should they make? (requirements)</label><textarea id="tgB" rows="5" maxlength="3000" placeholder="List what the finished work must do. Say who could do which part.">' + esc(t ? (t.brief || '') : '') + '</textarea></div>' +
        (t ? '' : '<div class="cr-field"><label for="tgK">How they work</label><select id="tgK">' + KINDS.map(function (k) { return '<option value="' + k[0] + '">' + esc(k[1]) + '</option>'; }).join('') + '</select></div>');
      m.foot.innerHTML = '<span class="cr-err" id="tgE"></span><button type="button" class="cr-btn" data-x>Cancel</button><button type="button" class="cr-btn primary" data-go><i class="fas fa-paper-plane"></i> ' + (t ? 'Save' : 'Give to the group') + '</button>';
      m.foot.querySelector('[data-x]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = async function () {
        var b = this, err = m.foot.querySelector('#tgE'), title = m.body.querySelector('#tgT').value.trim(), brief = m.body.querySelector('#tgB').value.trim();
        if (!title) { err.textContent = 'Give the task a title.'; return; }
        if (!brief) { err.textContent = 'Say what they should make.'; return; }
        b.disabled = true;
        try {
          if (t) await t.ref.update({ title: title.slice(0, 140), brief: brief.slice(0, 3000), updatedAt: FV().serverTimestamp() });
          else {
            var kind = m.body.querySelector('#tgK').value;
            await gr.ref.collection('tasks').add({
              title: title.slice(0, 140), brief: brief.slice(0, 3000), kind: kind, groupId: gr.id, groupName: gr.name,
              codeFiles: starter(kind, title), codeFolders: [], codeAssets: [], codeActive: kind === 'writing' ? 'writing.md' : 'index.html',
              status: 'Draft', submitCount: 0, createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp()
            });
          }
          m.close(); note(t ? 'Task saved.' : 'Task given. Everyone in the group gets a bell and an email.');
        } catch (e) { b.disabled = false; err.textContent = T.errMsg(e); }
      };
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b || b.tagName === 'INPUT') return;
      var a = b.dataset.g, id = b.dataset.id;
      var task = function () { return S.tasks.filter(function (x) { return x.id === id; })[0]; };
      if (a === 'new') openEditGroup(null);
      else if (a === 'open') { var gr = S.groups.filter(function (x) { return x.id === id; })[0]; if (gr) openGroup(gr); }
      else if (a === 'back') { closeGroup(); paint(); }
      else if (a === 'edit') openEditGroup(S.open);
      else if (a === 'del') {
        if (S.tasks.length) { note('Delete the group’s tasks first.', true); return; }
        if (confirm('Delete the group “' + S.open.name + '”?')) S.open.ref.delete().then(function () { closeGroup(); paint(); }).catch(fail);
      }
      else if (a === 'task') openTaskEditor(null);
      else if (a === 'edittask') { var et = task(); if (et) openTaskEditor(et); }
      else if (a === 'deltask') { var dt = task(); if (dt && confirm('Delete the task “' + dt.title + '” and the group’s work on it?')) dt.ref.delete().catch(fail); }
      else if (a === 'opentask') {
        var t = task(); if (!t) return;
        g.TechWork.openWorkView({
          me: me, ref: t.ref, data: t, title: t.title, subtitle: 'Group: ' + S.open.name, who: S.open.name, kind: t.kind === 'writing' ? 'doc' : 'code', brief: t.brief,
          folder: 'group_' + S.open.id, key: t.id, live: true, presence: t.ref.collection('presence'), familyNote: 'Everyone in the group and their families are told.'
        });
      }
    });
    host.addEventListener('change', function (e) { if (e.target.dataset.g === 'mineonly') { S.mineOnly = e.target.checked; paint(); } });
    paint();
    return { destroy: function () { dead = true; if (unsub) unsub(); closeGroup(); } };
  }

  /* ---------------------------------------------------------
     Builder: my groups, my teammates, our tasks, live together
     --------------------------------------------------------- */
  function mountMine(host, o) {
    T.injectStyle(); style(); if (g.TechWork) g.TechWork.style();
    var me = o.me, student = o.student, S = { groups: null, tasks: {}, open: null }, unsubs = [], taskUnsubs = {}, dead = false, lab = null, taskUnsub = null;
    unsubs.push(GROUPS().where('memberIds', 'array-contains', me.uid).onSnapshot(function (s) {
      if (dead) return;
      S.groups = docs(s).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      S.groups.forEach(function (gr) {
        if (taskUnsubs[gr.id]) return;
        taskUnsubs[gr.id] = gr.ref.collection('tasks').onSnapshot(function (ts) {
          S.tasks[gr.id] = docs(ts).sort(function (a, b) { return (T.toDate(b.createdAt) || 0) - (T.toDate(a.createdAt) || 0); });
          if (!S.open) paint();
        }, function (e) { console.warn('group tasks:', e); });
      });
      if (!S.open) paint();
    }, function (e) { host.innerHTML = '<div class="tc-empty">Could not load your groups: ' + esc(T.errMsg(e)) + '</div>'; }));

    function paint() {
      if (dead || S.open) return;
      if (S.groups === null) { host.innerHTML = '<div class="tc-empty">Loading your groups…</div>'; return; }
      if (!S.groups.length) { host.innerHTML = '<div class="tc-empty"><i class="fas fa-people-group" style="font-size:1.6rem;display:block;margin-bottom:.5rem"></i>You are not in a group yet. When your coach puts you in one, you will see your teammates and your group tasks here.</div>'; return; }
      host.innerHTML = S.groups.map(function (gr) {
        var tasks = S.tasks[gr.id] || [];
        return '<div class="tg-box"><div class="tg-box-head"><h3><i class="fas fa-people-group"></i> ' + esc(gr.name) + '</h3><span class="tc-pill">' + (gr.memberIds || []).length + ' builders</span></div>' +
          '<div style="padding:.9rem 1rem;border-bottom:1px solid var(--line,rgba(38,51,49,.08))"><div class="tw-note" style="margin-bottom:.4rem">You work with</div>' + chips(gr.members, me.uid) + '</div>' +
          (tasks.length ? tasks.map(function (t) {
            return '<div class="tg-task"><span class="t"><b>' + esc(t.title) + '</b><small>' + (t.kind === 'writing' ? 'Writing together' : 'Coding together') + (t.codeByName ? ' · last change by ' + esc(t.codeBy === me.uid ? 'you' : T.firstName(t.codeByName)) : '') + '</small></span>' +
              g.TechWork.statePill(t.status) + '<button type="button" class="tc-btn sm" data-gm="task" data-g="' + esc(gr.id) + '" data-id="' + esc(t.id) + '"><i class="fas ' + (t.status === 'Draft' || t.status === 'Corrections' ? 'fa-code' : 'fa-eye') + '"></i> ' + (t.status === 'Draft' || t.status === 'Corrections' ? 'Work on it' : 'Open') + '</button></div>';
          }).join('') : '<div class="tc-empty" style="border:0;border-radius:0">No group tasks yet.</div>') + '</div>';
      }).join('');
    }
    function editable(t) { return t.status === 'Draft' || t.status === 'Corrections'; }
    function openTask(gr, t) {
      S.open = { group: gr, task: t };
      var ref = t.ref, lastEditable = null;
      host.innerHTML = '<div class="tc-crumb"><button type="button" data-gm="back">My group</button> <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(gr.name) + '</span></div>' +
        '<h2 class="tc-title">' + esc(t.title) + '</h2>' +
        '<div class="tc-panel"><h3><i class="fas fa-list-check"></i> What to make</h3><div class="tc-prose tc-plain">' + esc(t.brief || '') + '</div><div style="margin-top:.7rem">' + chips(gr.members, me.uid) + '</div></div>' +
        '<div id="tgHead"></div><div id="tgLab"></div>';
      var headEl = host.querySelector('#tgHead'), labEl = host.querySelector('#tgLab');
      function paintHead(d) {
        var can = editable(d);
        headEl.innerHTML = '<div class="tw-bar">' + g.TechWork.statePill(d.status) + (d.submittedAt ? '<span class="tw-note">Handed in ' + esc(T.toDate(d.submittedAt) ? T.toDate(d.submittedAt).toLocaleString() : '') + (d.submittedByName ? ' by ' + esc(d.submittedBy === me.uid ? 'you' : d.submittedByName) : '') + '</span>' : '') +
          '<span class="grow"></span>' + (can ? '<button type="button" class="tc-btn" data-gm="submit"><i class="fas fa-paper-plane"></i> ' + (d.status === 'Corrections' ? 'Hand in again for the group' : 'Hand in for the group') + '</button>' : (d.status === 'Submitted' ? '<span class="tw-note"><i class="fas fa-hourglass-half"></i> With your coach for marking.</span>' : '')) + '</div>' +
          '<div class="tw-msg" id="tgMsg" role="status"></div>' + g.TechWork.feedbackHtml(d, 'Your group') +
          (can ? '<p class="tw-note" style="margin:0 0 .6rem">Everyone in the group types here at the same time. Coloured cursors show where your teammates are. ' + (d.kind === 'writing' ? 'Use # for headings and - for lists.' : 'Upload pictures on the left and click one to use it.') + '</p>' : '');
      }
      function mountLab(d) {
        var can = editable(d);
        if (lab && lastEditable === can) return;
        if (lab) { lab.destroy(); lab = null; }
        lastEditable = can;
        lab = g.CodeLab.mount(labEl, {
          build: d, canEdit: can, mode: d.kind === 'writing' ? 'doc' : 'code', title: gr.name,
          collab: { ref: ref, presence: ref.collection('presence'), me: { uid: me.uid, name: me.name || student.name || '' } },
          uploadAsset: can ? function (f) {
            var path = 'techGroupWork/' + gr.id + '/' + t.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
            var r = firebase.storage().ref(path);
            return r.put(f, { contentType: f.type || undefined, cacheControl: 'public,max-age=31536000' }).then(function () { return r.getDownloadURL(); }).then(function (url) { return { url: url, storagePath: path }; });
          } : null
        });
      }
      paintHead(t); mountLab(t);
      taskUnsub = ref.onSnapshot(function (s) { if (dead || !s.exists || !S.open) return; var d = Object.assign({ id: s.id, ref: ref }, s.data()); S.open.task = d; paintHead(d); mountLab(d); }, function () { });
      window.scrollTo(0, 0);
    }
    function closeTask() { if (lab) { lab.destroy(); lab = null; } if (taskUnsub) taskUnsub(); taskUnsub = null; S.open = null; paint(); }
    async function submit(btn) {
      var t = S.open && S.open.task, msg = host.querySelector('#tgMsg'); if (!t) return;
      if (!confirm('Hand this in for the whole group? Nobody can change it until your coach has looked at it.')) return;
      btn.disabled = true;
      try {
        if (lab) await lab.flush();
        await t.ref.update({ status: 'Submitted', submittedAt: FV().serverTimestamp(), submittedBy: me.uid, submittedByName: me.name || student.name || '', submitCount: FV().increment(1), updatedAt: FV().serverTimestamp() });
        if (msg) msg.textContent = 'Handed in for the group.';
      } catch (e) { btn.disabled = false; if (msg) { msg.textContent = 'Could not hand it in: ' + T.errMsg(e); msg.style.color = '#b8362a'; } }
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-gm]'); if (!b) return;
      var a = b.dataset.gm;
      if (a === 'task') {
        var gr = (S.groups || []).filter(function (x) { return x.id === b.dataset.g; })[0];
        var t = gr && (S.tasks[gr.id] || []).filter(function (x) { return x.id === b.dataset.id; })[0];
        if (gr && t) openTask(gr, t);
      }
      else if (a === 'back') closeTask();
      else if (a === 'submit') submit(b);
    });
    paint();
    return {
      openTask: function (gid, tid) { var gr = (S.groups || []).filter(function (x) { return x.id === gid; })[0]; var t = gr && (S.tasks[gid] || []).filter(function (x) { return x.id === tid; })[0]; if (gr && t) openTask(gr, t); },
      count: function () { var n = 0; Object.keys(S.tasks).forEach(function (k) { n += S.tasks[k].filter(editable).length; }); return n; },
      destroy: function () { dead = true; if (lab) lab.destroy(); if (taskUnsub) taskUnsub(); unsubs.forEach(function (u) { u(); }); Object.keys(taskUnsubs).forEach(function (k) { taskUnsubs[k](); }); }
    };
  }

  g.TechGroups = { mountManager: mountManager, mountMine: mountMine, starter: starter };
})(window);
