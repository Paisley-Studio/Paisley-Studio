/* =========================================================
   Paisley TECH — coach / admin management  (window.TechManage)
   ---------------------------------------------------------
   Shared by the coach portal (/tech/coach/dashboard) and Admin →
   Tech Studio, so both manage the same records the same way.

     TechManage.editMission({ me, item, students, aiTools, missions, onSaved })
         missions and challenges in techContent: learning objectives,
         instructions, the task, study materials (uploaded videos,
         documents, images, links, examples — required or recommended),
         practice activities, submission requirements, assessment
         criteria, AI tools and rules, level, availability, deadline,
         prerequisite and audience. Uploads go to Storage
         techContent/{id}/… (storage.rules), so a new mission is saved
         as a draft before its first upload.
     TechManage.editLive({ me, item, students, coaches })
         techLiveClasses: topic, what they will learn, date, time,
         length, Google Meet link, coach, audience, status.
     TechManage.mountActivity(host, { me, students, studentId })
         activity timeline + last seen (techActivity, techStudents).
     TechManage.mountPractice(host, { me, students, studentId })
         practice work, read-only, with a coach note (techPractice).

   me.role is 'coach' or 'admin'. Coaches only ever target their own
   builders (firestore.rules enforces the same).
   Needs TechUI (tech-helpers.js) and the global `db`.
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var uid = function () { return Math.random().toString(36).slice(2, 10); };

  function modal(title, wide) {
    T.injectStyle();
    var bg = document.createElement('div');
    bg.className = 'tk-modal';
    bg.innerHTML = '<div role="dialog" aria-modal="true" style="width:min(' + (wide ? '860px' : '560px') + ',100%)"><div style="display:flex;justify-content:space-between;align-items:center;gap:1rem"><h3 style="margin:0">' + esc(title) + '</h3><button type="button" class="tk-btn sm" data-x aria-label="Close"><i class="fas fa-xmark"></i></button></div><div class="tm-body" style="margin-top:.8rem"></div><div class="tm-foot" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-top:1rem;border-top:1px solid var(--line,rgba(38,51,49,.12));padding-top:.8rem"></div></div>';
    document.body.appendChild(bg);
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    function close() { document.removeEventListener('keydown', onKey); bg.remove(); }
    document.addEventListener('keydown', onKey);
    bg.querySelector('[data-x]').onclick = close;
    return { el: bg, body: bg.querySelector('.tm-body'), foot: bg.querySelector('.tm-foot'), close: close };
  }
  function studentPicker(students, selected, name) {
    if (!students.length) return '<div class="tk-sub">No builders yet.</div>';
    return '<div class="tm-picks" style="max-height:180px;overflow:auto;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:10px;padding:.4rem .6rem">' +
      '<label class="tk-ai-check"><input type="checkbox" data-allpick="' + name + '"> <b>Select all</b></label>' +
      students.map(function (s) { return '<label class="tk-ai-check"><input type="checkbox" name="' + name + '" value="' + esc(s.id) + '"' + (selected.indexOf(s.id) !== -1 ? ' checked' : '') + '> ' + esc(s.name || s.email || s.id) + '</label>'; }).join('') + '</div>';
  }
  function wirePicker(root, name) {
    var all = root.querySelector('[data-allpick="' + name + '"]');
    if (all) all.addEventListener('change', function () { root.querySelectorAll('input[name="' + name + '"]').forEach(function (x) { x.checked = all.checked; }); });
  }
  function picked(root, name) { return [].map.call(root.querySelectorAll('input[name="' + name + '"]:checked'), function (x) { return x.value; }); }
  function toLocalInput(ts) {
    var d = T.toDate(ts); if (!d) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------------- missions ---------------- */
  function editMission(o) {
    var me = o.me, isCoach = me.role === 'coach';
    var c = Object.assign({ kind: 'mission', status: 'draft', materials: [], practice: [], criteria: [], audience: isCoach ? 'selected' : 'all', studentIds: [] }, o.item || {});
    var id = c.id || null;
    var students = (o.students || []).filter(function (s) { return s.status === 'Active'; });
    var tools = (o.aiTools || []);
    var m = modal(id ? 'Edit ' + (c.kind === 'challenge' ? 'challenge' : 'mission') : 'New mission', true);
    var discs = Array.isArray(c.disciplines) ? c.disciplines : (c.discipline ? [c.discipline] : []);
    var lvl = function (sel) { return T.LEVELS.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (Number(sel) === i + 1 ? ' selected' : '') + '>' + (i + 1) + ' · ' + n + '</option>'; }).join(''); };
    var mats = (c.materials || []).map(function (x) { return Object.assign({ id: x.id || uid() }, x); });
    var prac = (c.practice || []).slice(), crit = (c.criteria || []).slice();

    function matRow(x, i) {
      return '<div class="tk-mat" data-mrow="' + i + '"><div class="tk-row">' +
        '<div class="tk-f"><label>Type</label><select data-mf="type">' + Object.keys(T.MATERIAL_TYPES).map(function (k) { return '<option value="' + k + '"' + (x.type === k ? ' selected' : '') + '>' + T.MATERIAL_TYPES[k] + '</option>'; }).join('') + '</select></div>' +
        '<div class="tk-f" style="grid-column:span 2"><label>Title</label><input data-mf="title" maxlength="140" value="' + esc(x.title || '') + '"></div></div>' +
        '<div class="tk-f"><label>Description</label><input data-mf="description" maxlength="400" value="' + esc(x.description || '') + '"></div>' +
        '<div class="tk-f"><label>Link (YouTube, Vimeo, a document…) or upload a file</label><div style="display:flex;gap:.4rem;flex-wrap:wrap"><input data-mf="url" maxlength="800" placeholder="https://" value="' + esc(x.url || '') + '" style="flex:1;min-width:200px">' +
          '<label class="tk-btn sm" style="margin:0"><i class="fas fa-upload"></i> Upload<input type="file" data-mup="' + i + '" hidden accept="video/*,image/*,audio/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip"></label></div><div class="tk-sub" data-mst="' + i + '" style="margin:.3rem 0 0">' + (x.path ? 'Uploaded file' : '') + '</div></div>' +
        '<div class="tk-f"><label>Notes for the builder</label><textarea data-mf="notes" maxlength="1000" style="min-height:50px">' + esc(x.notes || '') + '</textarea></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><label class="tk-ai-check"><input type="checkbox" data-mf="required"' + (x.required ? ' checked' : '') + '> Required before the main task</label><button type="button" class="tk-btn sm danger" data-mdel="' + i + '">Remove</button></div></div>';
    }
    function pracRow(x, i) {
      return '<div class="tk-item" data-prow="' + i + '" style="flex-wrap:wrap"><input class="tk-in" data-pf="title" placeholder="Activity title" maxlength="120" value="' + esc(x.title || '') + '" style="flex:1;min-width:160px">' +
        '<select class="tk-in" data-pf="type" style="width:auto">' + [['code', 'Code'], ['writing', 'Writing'], ['research', 'Research'], ['ai', 'AI exploration'], ['other', 'Other']].map(function (k) { return '<option value="' + k[0] + '"' + (x.type === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>' +
        '<textarea class="tk-in" data-pf="instructions" placeholder="What to try" maxlength="1500" style="flex-basis:100%;min-height:50px">' + esc(x.instructions || '') + '</textarea>' +
        '<input class="tk-in" data-pf="starter" placeholder="Starter code or text (optional)" maxlength="4000" value="' + esc(x.starter || '') + '" style="flex:1">' +
        '<button type="button" class="tk-btn sm danger" data-pdel="' + i + '">Remove</button></div>';
    }
    function critRow(x, i) {
      return '<div class="tk-item" data-crow="' + i + '"><input class="tk-in" data-cf="name" placeholder="Criterion, e.g. It works as described" maxlength="140" value="' + esc(x.name || '') + '" style="flex:1"><input class="tk-in" data-cf="description" placeholder="What meeting it looks like" maxlength="400" value="' + esc(x.description || '') + '" style="flex:2"><button type="button" class="tk-btn sm danger" data-cdel="' + i + '">×</button></div>';
    }
    function read() {
      mats = [].map.call(m.body.querySelectorAll('[data-mrow]'), function (row, i) {
        var v = function (k) { var el = row.querySelector('[data-mf="' + k + '"]'); return el.type === 'checkbox' ? el.checked : el.value.trim(); };
        return Object.assign({}, mats[i], { type: v('type'), title: v('title').slice(0, 140), description: v('description').slice(0, 400), url: T.safeUrl(v('url')), notes: v('notes').slice(0, 1000), required: v('required') });
      });
      prac = [].map.call(m.body.querySelectorAll('[data-prow]'), function (row) {
        var v = function (k) { return row.querySelector('[data-pf="' + k + '"]').value.trim(); };
        return { title: v('title').slice(0, 120), type: v('type'), instructions: v('instructions').slice(0, 1500), starter: v('starter').slice(0, 4000) };
      });
      crit = [].map.call(m.body.querySelectorAll('[data-crow]'), function (row) {
        return { name: row.querySelector('[data-cf="name"]').value.trim().slice(0, 140), description: row.querySelector('[data-cf="description"]').value.trim().slice(0, 400) };
      });
    }
    function paintLists() {
      m.body.querySelector('#tmMats').innerHTML = mats.map(matRow).join('') || '<div class="tk-sub">No materials yet.</div>';
      m.body.querySelector('#tmPrac').innerHTML = prac.map(pracRow).join('') || '<div class="tk-sub">No practice activities yet.</div>';
      m.body.querySelector('#tmCrit').innerHTML = crit.map(critRow).join('') || '<div class="tk-sub">No criteria yet.</div>';
    }
    var missions = (o.missions || []).filter(function (x) { return x.id !== id && (x.kind === 'mission' || x.kind === 'challenge'); });
    m.body.innerHTML =
      '<div class="tk-row"><div class="tk-f"><label>Type</label><select id="tmK"><option value="mission"' + (c.kind === 'mission' ? ' selected' : '') + '>Mission</option><option value="challenge"' + (c.kind === 'challenge' ? ' selected' : '') + '>Challenge</option></select></div>' +
        '<div class="tk-f"><label>Level</label><select id="tmL"><option value="">Any level</option>' + lvl(c.level) + '</select></div>' +
        '<div class="tk-f"><label>Project type (opens this workspace)</label><select id="tmCt"><option value="">Builder chooses</option>' + T.CREATION_TYPES.map(function (k) { return '<option value="' + k + '"' + (c.creationType === k ? ' selected' : '') + '>' + esc(T.CREATION_LABEL[k]) + ' → ' + esc(T.WORKSPACE_NAME[T.workspaceFor(k)]) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="tk-f"><label>Title</label><input id="tmT" maxlength="120" value="' + esc(c.title || '') + '"></div>' +
      '<div class="tk-f"><label>Description (one or two lines)</label><input id="tmS" maxlength="300" value="' + esc(c.summary || '') + '"></div>' +
      '<div class="tk-f"><label>Disciplines</label><div>' + T.DISCIPLINES.map(function (d) { return '<label class="tk-ai-check" style="display:inline-flex"><input type="checkbox" class="tmDisc" value="' + esc(d) + '"' + (discs.indexOf(d) !== -1 ? ' checked' : '') + '> ' + esc(d) + '</label>'; }).join('') + '</div></div>' +
      '<div class="tk-f"><label>Learning objectives</label><textarea id="tmObj" maxlength="1500">' + esc(c.objectives || '') + '</textarea></div>' +
      '<div class="tk-f"><label>Instructions</label><textarea id="tmB" maxlength="8000">' + esc(c.body || '') + '</textarea></div>' +
      '<div class="tk-f"><label>The main task (task requirements)</label><textarea id="tmBr" maxlength="3000">' + esc(c.brief || '') + '</textarea></div>' +
      '<h4 class="tk-h4">Study materials and videos</h4><div class="tk-sub">Builders see these on the mission before they start the main task.</div><div id="tmMats" class="tk-mats"></div><button type="button" class="tk-btn sm" id="tmAddMat" style="margin-top:.5rem"><i class="fas fa-plus"></i> Add material</button>' +
      '<h4 class="tk-h4">Practice activities</h4><div id="tmPrac" class="tk-list"></div><button type="button" class="tk-btn sm" id="tmAddPrac" style="margin-top:.5rem"><i class="fas fa-plus"></i> Add practice</button>' +
      '<div class="tk-f" style="margin-top:.8rem"><label>Submission requirements</label><textarea id="tmSr" maxlength="1500">' + esc(c.submissionReq || '') + '</textarea></div>' +
      '<h4 class="tk-h4">Assessment criteria</h4><div id="tmCrit" class="tk-list"></div><button type="button" class="tk-btn sm" id="tmAddCrit" style="margin-top:.5rem"><i class="fas fa-plus"></i> Add criterion</button>' +
      '<h4 class="tk-h4">AI tools and rules</h4>' + (tools.length ? '<div>' + tools.map(function (t) { var on = (c.aiTools || []).some(function (x) { return x.name === (t.name || t.title); }); return '<label class="tk-ai-check" style="display:inline-flex"><input type="checkbox" class="tmTool" value="' + esc(t.id) + '"' + (on ? ' checked' : '') + '> ' + esc(t.name || t.title) + '</label>'; }).join('') + '</div>' : '<div class="tk-sub">No approved AI tools yet (Admin → Tech Studio → AI Toolbox).</div>') +
      '<div class="tk-f"><label>AI rules for this mission</label><textarea id="tmAR" maxlength="2000" style="min-height:60px">' + esc(c.aiRules || '') + '</textarea></div>' +
      '<div class="tk-row"><div class="tk-f"><label>Available from (optional)</label><input id="tmFrom" type="datetime-local" value="' + esc(toLocalInput(c.availableFrom)) + '"></div>' +
        '<div class="tk-f"><label>Deadline (optional)</label><input id="tmDue" type="date" value="' + esc(c.deadline || '') + '"></div>' +
        '<div class="tk-f"><label>Unlocks after mastering</label><select id="tmPre"><option value="">Nothing</option>' + missions.map(function (x) { return '<option value="' + esc(x.id) + '"' + (c.prereqId === x.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') + '</select></div></div>' +
      '<h4 class="tk-h4">Who gets it</h4>' + (isCoach ? '<div class="tk-sub">Your builders only.</div>' :
        '<div class="tk-vis"><label class="tk-ai-check"><input type="radio" name="tmAud" value="all"' + (c.audience !== 'selected' ? ' checked' : '') + '> Every active builder</label><label class="tk-ai-check"><input type="radio" name="tmAud" value="selected"' + (c.audience === 'selected' ? ' checked' : '') + '> Chosen builders</label></div>') +
      '<div id="tmWho"' + (!isCoach && c.audience !== 'selected' ? ' hidden' : '') + '>' + studentPicker(students, c.studentIds || (isCoach && !id ? students.map(function (s) { return s.id; }) : []), 'tmStu') + '</div>';
    paintLists();
    wirePicker(m.body, 'tmStu');
    m.body.querySelectorAll('input[name="tmAud"]').forEach(function (r) { r.addEventListener('change', function () { m.body.querySelector('#tmWho').hidden = r.value !== 'selected'; }); });
    m.body.querySelector('#tmAddMat').onclick = function () { read(); mats.push({ id: uid(), type: 'video', required: true }); paintLists(); };
    m.body.querySelector('#tmAddPrac').onclick = function () { read(); prac.push({ type: 'code' }); paintLists(); };
    m.body.querySelector('#tmAddCrit').onclick = function () { read(); crit.push({}); paintLists(); };
    m.body.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mdel],[data-pdel],[data-cdel]'); if (!t) return; read();
      if (t.dataset.mdel) mats.splice(Number(t.dataset.mdel), 1);
      if (t.dataset.pdel) prac.splice(Number(t.dataset.pdel), 1);
      if (t.dataset.cdel) crit.splice(Number(t.dataset.cdel), 1);
      paintLists();
    });

    var err = function (t) { var el = m.foot.querySelector('#tmErr'); el.textContent = t || ''; };
    function data(status) {
      read();
      var aud = isCoach ? 'selected' : ((m.body.querySelector('input[name="tmAud"]:checked') || {}).value || 'all');
      var from = m.body.querySelector('#tmFrom').value;
      var picks = (o.aiTools || []).filter(function (t) { return [].some.call(m.body.querySelectorAll('.tmTool:checked'), function (x) { return x.value === t.id; }); });
      return {
        kind: m.body.querySelector('#tmK').value,
        title: m.body.querySelector('#tmT').value.trim().slice(0, 120),
        summary: m.body.querySelector('#tmS').value.trim().slice(0, 300),
        level: Number(m.body.querySelector('#tmL').value) || 0,
        creationType: m.body.querySelector('#tmCt').value || '',
        disciplines: [].map.call(m.body.querySelectorAll('.tmDisc:checked'), function (x) { return x.value; }),
        objectives: m.body.querySelector('#tmObj').value.trim().slice(0, 1500),
        body: m.body.querySelector('#tmB').value.trim().slice(0, 8000),
        brief: m.body.querySelector('#tmBr').value.trim().slice(0, 3000),
        submissionReq: m.body.querySelector('#tmSr').value.trim().slice(0, 1500),
        materials: mats.filter(function (x) { return x.title || x.url; }).slice(0, 30),
        practice: prac.filter(function (x) { return x.title || x.instructions; }).slice(0, 12),
        criteria: crit.filter(function (x) { return x.name; }).slice(0, 12),
        aiTools: picks.map(function (t) { return { name: t.name || t.title || '', url: T.safeUrl(t.url) || '', category: t.category || '' }; }),
        aiRules: m.body.querySelector('#tmAR').value.trim().slice(0, 2000),
        availableFrom: from ? firebase.firestore.Timestamp.fromDate(new Date(from)) : null,
        deadline: m.body.querySelector('#tmDue').value || '',
        prereqId: m.body.querySelector('#tmPre').value || '',
        audience: aud,
        studentIds: aud === 'selected' ? picked(m.body, 'tmStu').slice(0, 500) : [],
        status: status,
        updatedAt: FV().serverTimestamp()
      };
    }
    async function save(status, keepOpen) {
      var d = data(status);
      if (!d.title) { err('A title is required.'); return null; }
      if (d.audience === 'selected' && !d.studentIds.length && status === 'published') { err('Choose at least one builder.'); return null; }
      if (!id) {
        Object.assign(d, { createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), order: 0, resources: [] });
        var r = await db.collection('techContent').add(d); id = r.id;
      } else await db.collection('techContent').doc(id).update(d);
      c.status = status;
      if (!keepOpen) { m.close(); if (o.onSaved) o.onSaved(id, status); }
      return id;
    }
    /* Uploads: the mission has to exist first (storage.rules checks who created it). */
    m.body.addEventListener('change', async function (e) {
      var inp = e.target.closest('[data-mup]'); if (!inp) return;
      var f = inp.files[0]; if (!f) return;
      var i = Number(inp.dataset.mup), st = m.body.querySelector('[data-mst="' + i + '"]');
      var max = /^video\//.test(f.type) ? 500 : 50;
      if (f.size > max * 1024 * 1024) { st.textContent = 'Too large: ' + (max === 500 ? 'videos up to 500 MB' : 'files up to 50 MB') + '.'; return; }
      try {
        read();
        if (!id) { st.textContent = 'Saving the mission as a draft first…'; if (!(await save(c.status === 'published' ? 'published' : 'draft', true))) { st.textContent = ''; return; } }
        var path = 'techContent/' + id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
        var task = firebase.storage().ref(path).put(f, { contentType: f.type || undefined });
        task.on('state_changed', function (s) { st.textContent = 'Uploading ' + Math.round(s.bytesTransferred / s.totalBytes * 100) + '%…'; });
        await task;
        var url = await task.snapshot.ref.getDownloadURL();
        mats[i] = Object.assign({}, mats[i], { url: url, path: path, contentType: f.type || '', size: f.size, title: mats[i].title || f.name.slice(0, 140),
          type: /^video\//.test(f.type) ? 'video' : /^image\//.test(f.type) ? 'image' : (mats[i].type === 'example' ? 'example' : 'document') });
        paintLists();
        await db.collection('techContent').doc(id).update({ materials: mats.slice(0, 30), updatedAt: FV().serverTimestamp() });
        var st2 = m.body.querySelector('[data-mst="' + i + '"]'); if (st2) st2.textContent = 'Uploaded ✓ ' + f.name;
      } catch (er) { st.textContent = 'Upload failed: ' + T.errMsg(er); }
    });
    m.foot.innerHTML = '<span id="tmErr" style="color:#b8362a;font-weight:700;font-size:.82rem;margin-right:auto"></span>' +
      (id ? '<button type="button" class="tk-btn danger sm" data-del>Delete</button>' : '') +
      '<button type="button" class="tk-btn" data-draft>Save draft</button><button type="button" class="tk-btn primary" data-pub><i class="fas fa-paper-plane"></i> ' + (c.status === 'published' ? 'Save (released)' : 'Release to builders') + '</button>';
    var busy = function (on) { m.foot.querySelectorAll('button').forEach(function (x) { x.disabled = on; }); };
    m.foot.querySelector('[data-draft]').onclick = function () { busy(true); save('draft').catch(function (e) { err(T.errMsg(e)); }).then(function () { busy(false); }); };
    m.foot.querySelector('[data-pub]').onclick = function () { busy(true); save('published').catch(function (e) { err(T.errMsg(e)); }).then(function () { busy(false); }); };
    if (m.foot.querySelector('[data-del]')) m.foot.querySelector('[data-del]').onclick = function () {
      if (!confirm('Delete this mission? Builders keep any projects they started from it.')) return;
      db.collection('techContent').doc(id).delete().then(function () { m.close(); if (o.onSaved) o.onSaved(null); }).catch(function (e) { err(T.errMsg(e)); });
    };
  }

  /* ---------------- live classes ---------------- */
  function editLive(o) {
    var me = o.me, isCoach = me.role === 'coach';
    var c = Object.assign({ status: 'scheduled', durationMins: 60, audience: isCoach ? 'selected' : 'all', studentIds: [] }, o.item || {});
    var id = c.id || null;
    var students = (o.students || []).filter(function (s) { return s.status === 'Active'; });
    var coaches = (o.coaches || []).filter(function (x) { return x.status === 'Active'; });
    var m = modal(id ? 'Edit live class' : 'Schedule a live class', true);
    m.body.innerHTML =
      '<div class="tk-f"><label>Class topic</label><input id="lcT" maxlength="140" value="' + esc(c.topic || '') + '"></div>' +
      '<div class="tk-f"><label>What builders will learn</label><input id="lcL" maxlength="300" value="' + esc(c.learn || '') + '"></div>' +
      '<div class="tk-f"><label>Description (optional)</label><textarea id="lcD" maxlength="1500" style="min-height:60px">' + esc(c.description || '') + '</textarea></div>' +
      '<div class="tk-row"><div class="tk-f"><label>Date and time (your local time)</label><input id="lcW" type="datetime-local" value="' + esc(toLocalInput(c.startAt)) + '"></div>' +
        '<div class="tk-f"><label>Length (minutes)</label><input id="lcM" type="number" min="15" max="240" step="5" value="' + esc(c.durationMins || 60) + '"></div>' +
        '<div class="tk-f"><label>Status</label><select id="lcS">' + [['scheduled', 'Scheduled'], ['cancelled', 'Cancelled'], ['completed', 'Completed']].map(function (k) { return '<option value="' + k[0] + '"' + (c.status === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="tk-f"><label>Google Meet link</label><input id="lcU" maxlength="300" placeholder="https://meet.google.com/abc-defg-hij" value="' + esc(c.meetUrl || '') + '"></div>' +
      (isCoach ? '' : '<div class="tk-f"><label>Coach</label><select id="lcC"><option value="">Studio Desk</option>' + coaches.map(function (x) { return '<option value="' + esc(x.id) + '"' + (c.coachId === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>') +
      '<h4 class="tk-h4">Who is invited</h4>' + (isCoach ? '' : '<div class="tk-vis"><label class="tk-ai-check"><input type="radio" name="lcAud" value="all"' + (c.audience !== 'selected' ? ' checked' : '') + '> Every active builder</label><label class="tk-ai-check"><input type="radio" name="lcAud" value="selected"' + (c.audience === 'selected' ? ' checked' : '') + '> Chosen builders</label></div>') +
      '<div id="lcWho"' + (!isCoach && c.audience !== 'selected' ? ' hidden' : '') + '>' + studentPicker(students, c.studentIds || [], 'lcStu') + '</div>' +
      '<p class="tk-sub" style="margin-top:.6rem">Builders, their parents or guardians, the coach and the Studio Desk are notified by bell and email when you save, change the time, link or topic, or cancel.</p>';
    wirePicker(m.body, 'lcStu');
    m.body.querySelectorAll('input[name="lcAud"]').forEach(function (r) { r.addEventListener('change', function () { m.body.querySelector('#lcWho').hidden = r.value !== 'selected'; }); });
    m.foot.innerHTML = '<span id="lcErr" style="color:#b8362a;font-weight:700;font-size:.82rem;margin-right:auto"></span>' + (id ? '<button type="button" class="tk-btn danger sm" data-del>Delete</button>' : '') + '<button type="button" class="tk-btn primary" data-go><i class="fas fa-floppy-disk"></i> Save</button>';
    var err = function (t) { m.foot.querySelector('#lcErr').textContent = t; };
    m.foot.querySelector('[data-go]').onclick = function () {
      var btn = this, w = m.body.querySelector('#lcW').value, url = m.body.querySelector('#lcU').value.trim();
      var topic = m.body.querySelector('#lcT').value.trim();
      if (!topic) return err('Add the class topic.');
      if (!w) return err('Choose the date and time.');
      if (url && !/^https:\/\//i.test(url)) return err('The Meet link must start with https://');
      var aud = isCoach ? 'selected' : ((m.body.querySelector('input[name="lcAud"]:checked') || {}).value || 'all');
      var sel = picked(m.body, 'lcStu');
      if (aud === 'selected' && !sel.length) return err('Choose at least one builder.');
      var coachSel = isCoach ? null : m.body.querySelector('#lcC');
      var coachId = isCoach ? me.uid : (coachSel.value || ''), coach = coaches.filter(function (x) { return x.id === coachId; })[0];
      var d = {
        topic: topic.slice(0, 140), learn: m.body.querySelector('#lcL').value.trim().slice(0, 300), description: m.body.querySelector('#lcD').value.trim().slice(0, 1500),
        startAt: firebase.firestore.Timestamp.fromDate(new Date(w)), durationMins: Math.max(15, Math.min(240, Number(m.body.querySelector('#lcM').value) || 60)),
        meetUrl: url.slice(0, 300), status: m.body.querySelector('#lcS').value,
        coachId: coachId, coachName: isCoach ? (me.name || '') : (coach ? coach.name : 'Studio Desk'),
        audience: aud, studentIds: aud === 'selected' ? sel.slice(0, 300) : [], updatedAt: FV().serverTimestamp()
      };
      btn.disabled = true;
      var p = id ? db.collection('techLiveClasses').doc(id).update(d)
        : db.collection('techLiveClasses').add(Object.assign(d, { createdBy: me.uid, createdAt: FV().serverTimestamp() }));
      p.then(function () { m.close(); if (o.onSaved) o.onSaved(); }).catch(function (e) { btn.disabled = false; err(T.errMsg(e)); });
    };
    if (m.foot.querySelector('[data-del]')) m.foot.querySelector('[data-del]').onclick = function () {
      if (!confirm('Delete this class? If it has not happened yet, everyone invited is told it is cancelled.')) return;
      db.collection('techLiveClasses').doc(id).delete().then(function () { m.close(); if (o.onSaved) o.onSaved(); }).catch(function (e) { err(T.errMsg(e)); });
    };
  }

  /* ---------------- activity + last seen ---------------- */
  function mountActivity(host, o) {
    T.injectStyle();
    var students = o.students || [], unsubs = [], lists = {}, dead = false;
    var single = o.studentId ? students.filter(function (s) { return s.id === o.studentId; }) : students.filter(function (s) { return s.status === 'Active'; });
    function paint() {
      if (dead) return;
      var all = [];
      Object.keys(lists).forEach(function (k) { all = all.concat(lists[k]); });
      all.sort(function (a, b) { return (T.toDate(b.at) || 0) - (T.toDate(a.at) || 0); });
      var rows = single.slice().sort(function (a, b) { return (T.toDate(T.lastSeen(b)) || 0) - (T.toDate(T.lastSeen(a)) || 0); }).map(function (s) {
        var last = (lists[s.id] || [])[0] || all.filter(function (x) { return x.studentId === s.id; })[0];
        return '<tr><td><b>' + esc(s.name || '') + '</b></td><td>' + esc(T.ago(T.lastSeen(s))) + '</td><td class="tk-sub" style="margin:0">' + (last ? esc(last.label) + ' · ' + esc(T.ago(last.at)) : '—') + '</td></tr>';
      }).join('');
      host.innerHTML = (o.studentId ? '' : '<div class="tk-box" style="margin-bottom:.9rem"><h3>Last seen</h3><div class="tk-scroll"><table class="tk-table"><thead><tr><th>Builder</th><th>Last seen</th><th>Latest activity</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">No builders.</td></tr>') + '</tbody></table></div></div>') +
        '<div class="tk-box"><h3>' + (o.studentId ? 'Activity' : 'Recent activity') + '</h3>' + (o.studentId && single[0] ? '<div class="tk-sub">Last seen ' + esc(T.ago(T.lastSeen(single[0]))) + '</div>' : '') + T.activityRows(all.slice(0, o.studentId ? 80 : 120)) + '</div>';
    }
    if (o.me.role === 'admin' && !o.studentId) {
      unsubs.push(db.collection('techActivity').orderBy('at', 'desc').limit(200).onSnapshot(function (s) { lists = { all: s.docs.map(function (d) { return d.data(); }) }; paint(); }, function (e) { host.innerHTML = '<div class="tk-empty">Could not load activity: ' + esc(T.errMsg(e)) + '</div>'; }));
    } else {
      single.slice(0, 60).forEach(function (s) {
        unsubs.push(db.collection('techActivity').where('studentId', '==', s.id).orderBy('at', 'desc').limit(o.studentId ? 80 : 12).onSnapshot(function (q) { lists[s.id] = q.docs.map(function (d) { return d.data(); }); paint(); }, function (e) { console.warn('activity', e); }));
      });
    }
    paint();
    return { destroy: function () { dead = true; unsubs.forEach(function (u) { u(); }); } };
  }

  /* ---------------- practice (read-only + coach note) ---------------- */
  function mountPractice(host, o) {
    T.injectStyle();
    var students = o.students || [], unsubs = [], lists = {}, open = null, dead = false;
    var who = function (id) { var s = students.filter(function (x) { return x.id === id; })[0]; return s ? s.name : ''; };
    function paint() {
      if (dead) return;
      var all = [];
      Object.keys(lists).forEach(function (k) { all = all.concat(lists[k]); });
      all.sort(function (a, b) { return (T.toDate(b.updatedAt) || 0) - (T.toDate(a.updatedAt) || 0); });
      if (!all.length) { host.innerHTML = '<div class="tk-empty">No practice work yet. Practice is never graded; it shows here so you can see what builders are trying.</div>'; return; }
      host.innerHTML = '<div class="tk-list">' + all.map(function (p) {
        var isOpen = open === p.id;
        return '<div class="tk-box"><div style="display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;align-items:center"><div><b>' + esc(p.title || 'Practice') + '</b> <span class="tk-pill">' + esc(p.type || '') + '</span>' +
          (p.helpRequested ? ' <span class="tk-pill warn">Asked for help</span>' : '') + (p.done ? ' <span class="tk-pill ok">Done</span>' : '') +
          '<div class="tk-sub" style="margin:0">' + esc(who(p.studentId) || p.studentName || '') + (p.missionTitle ? ' · for ' + esc(p.missionTitle) : '') + ' · ' + esc(T.ago(p.updatedAt)) + '</div></div>' +
          '<button type="button" class="tk-btn sm" data-popen="' + esc(p.id) + '">' + (isOpen ? 'Close' : 'Open') + '</button></div>' +
          (isOpen ? '<div style="margin-top:.6rem">' + (p.instructions ? '<div class="tk-fb">' + esc(p.instructions) + '</div>' : '') +
            (p.writingHtml ? '<div class="tk-article" style="margin-top:.5rem">' + T.cleanHtml(p.writingHtml) + '</div>' : '') +
            ((p.codeFiles || []).length ? p.codeFiles.map(function (f) { return '<details><summary>' + esc(f.name) + '</summary><pre class="tk-code">' + esc(f.content) + '</pre></details>'; }).join('') : '') +
            (p.text ? '<div class="tk-prose" style="margin-top:.5rem">' + esc(p.text) + '</div>' : '') +
            '<div class="tk-f" style="margin-top:.6rem"><label>Note to the builder</label><textarea data-pnote="' + esc(p.id) + '" maxlength="1500">' + esc(p.coachNote || '') + '</textarea></div>' +
            '<button type="button" class="tk-btn sm primary" data-psave="' + esc(p.id) + '">Save note' + (p.helpRequested ? ' and mark help given' : '') + '</button></div>' : '') +
          (!isOpen && p.coachNote ? '<div class="tk-fb coach" style="margin-top:.5rem">' + esc(p.coachNote) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-popen],[data-psave]'); if (!t) return;
      if (t.dataset.popen) { open = open === t.dataset.popen ? null : t.dataset.popen; paint(); return; }
      var id = t.dataset.psave, note = host.querySelector('[data-pnote="' + id + '"]').value.trim().slice(0, 1500);
      t.disabled = true;
      db.collection('techPractice').doc(id).update({ coachNote: note, coachNoteBy: o.me.name || '', coachNoteAt: FV().serverTimestamp(), helpRequested: false, updatedAt: FV().serverTimestamp() })
        .then(function () { t.textContent = 'Saved ✓'; }).catch(function (er) { t.disabled = false; alert(T.errMsg(er)); });
    });
    var targets = o.studentId ? [o.studentId] : students.map(function (s) { return s.id; });
    if (o.me.role === 'admin' && !o.studentId) {
      unsubs.push(db.collection('techPractice').orderBy('updatedAt', 'desc').limit(120).onSnapshot(function (s) { lists = { all: s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }) }; paint(); }, function (e) { host.innerHTML = '<div class="tk-empty">' + esc(T.errMsg(e)) + '</div>'; }));
    } else {
      targets.slice(0, 60).forEach(function (sid) {
        unsubs.push(db.collection('techPractice').where('studentId', '==', sid).onSnapshot(function (s) { lists[sid] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, function (e) { console.warn('practice', e); }));
      });
    }
    paint();
    return { destroy: function () { dead = true; unsubs.forEach(function (u) { u(); }); } };
  }

  g.TechManage = { editMission: editMission, editLive: editLive, mountActivity: mountActivity, mountPractice: mountPractice, modal: modal };
})(window);
