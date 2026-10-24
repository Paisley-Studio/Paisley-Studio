/* =========================================================
   WORK UI (core + staff) — Paisley Studio
========================================================= */
(function (global) {
  'use strict';

  var U = global.ClassroomUI && global.ClassroomUI.util;
  if (!U) { console.error('work-helpers.js needs classroom-helpers.js loaded first.'); return; }
  var esc = U.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var DAY = 86400000;

  function injectStyle() {
    U.injectStyle();
    if (document.getElementById('wk-style')) return;
    var st = document.createElement('style');
    st.id = 'wk-style';
    st.textContent = [
      '.cr-badge.b-confirmed{background:rgba(46,184,114,.12);color:#1d8b57}',
      '.cr-badge.b-pending{background:rgba(232,163,61,.14);color:#96690f}',
      '.cr-badge.b-declined{background:rgba(231,76,60,.1);color:#b8362a}',
      '.cr-badge.b-plain{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.cr-badge.b-grant{background:rgba(155,89,182,.12);color:#7c3f96}',
      '.wk-chips{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center}',
      '.wk-chip{font-size:.7rem;font-weight:700;color:var(--muted,#5A6E6A);background:var(--paper,#F1F9F7);border-radius:99px;padding:.15rem .55rem;display:inline-flex;gap:.3rem;align-items:center}',
      '.wk-ic{width:2rem;text-align:center;color:var(--brand-deep,#245F5A)}',
      '.wk-drop{border:2px dashed var(--line,rgba(38,51,49,.25));border-radius:14px;padding:1.2rem;text-align:center;color:var(--muted,#5A6E6A);cursor:pointer;background:var(--paper,#F1F9F7);transition:border-color .15s}',
      '.wk-drop:hover,.wk-drop.over{border-color:var(--brand,#55BFB3)}',
      '.wk-drop b{color:var(--brand-deep,#245F5A)}',
      '.wk-pick{max-height:200px;overflow:auto;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:10px;padding:.3rem}',
      '.wk-pick label{display:flex;gap:.5rem;align-items:center;padding:.3rem .4rem;font-size:.84rem;cursor:pointer;border-radius:8px}',
      '.wk-pick label:hover{background:var(--paper,#F1F9F7)}',
      '.wk-q{border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;padding:.7rem;margin-bottom:.6rem;background:var(--paper,#F1F9F7)}',
      '.wk-radio{display:flex;gap:1rem;flex-wrap:wrap;font-size:.86rem}',
      '.wk-radio label{display:inline-flex;gap:.4rem;align-items:center;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:600;color:inherit}',
      '.wk-tbl td .cr-btn{margin-right:.25rem}',
      '.wk-box{background:var(--sage,#E5F2EF);border-radius:12px;padding:.8rem 1rem;font-size:.84rem;margin-bottom:.9rem;white-space:pre-wrap}',
      '.wk-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.76rem}',
      '.wk-btn-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem}',
      '.wk-pill-window{display:inline-flex;align-items:center;gap:.35rem;font-size:.7rem;font-weight:800;padding:.2rem .6rem;border-radius:99px;letter-spacing:.03em}',
      '.wk-pill-window.open{background:rgba(46,184,114,.14);color:#1d8b57}',
      '.wk-pill-window.closed{background:rgba(90,110,106,.14);color:#4b5e5a}',
      '.wk-pill-window.auto{background:rgba(74,144,217,.14);color:#2b6cad}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function pill(cls, text, icon) {
    return '<span class="cr-badge ' + cls + '">' + (icon ? '<i class="fas ' + icon + '" style="margin-right:.3rem"></i>' : '') + esc(text) + '</span>';
  }
  function collName(kind) { return kind === 'exam' ? 'exams' : (kind === 'lesson' ? 'lessons' : 'assignments'); }
  function subName(kind) { return kind === 'exam' ? 'attempts' : 'submissions'; }
  function coll(cid, tid, kind) { return U.clsRef(cid).collection('topics').doc(tid).collection(collName(kind)); }
  function flatExamsRef(cid) { return U.clsRef(cid).collection('exams'); }
  function flatExamRef(cid, eid) { return flatExamsRef(cid).doc(eid); }
  function flatExamSubmissionsRef(cid, eid) { return flatExamRef(cid, eid).collection('submissions'); }
  function dueOf(item, kind) { return U.toDate(kind === 'exam' ? item.examDate : item.dueAt); }
  function fmtScore(s) {
    if (!s) return '';
    if (s.grade != null && s.maxScore != null) return s.grade + '/' + s.maxScore;
    return s.grade != null ? String(s.grade) : '';
  }

  function windowState(exam) {
    var now = Date.now();
    var examDate = exam.examDate ? U.toDate(exam.examDate) : null;
    var deadline = exam.submissionDeadline ? U.toDate(exam.submissionDeadline) : null;
    if (exam.submissionsOpen === true) return { mode: 'manual-open', label: 'Submissions open', cls: 'open' };
    if (examDate && deadline && now >= examDate.getTime() && now <= deadline.getTime()) {
      return { mode: 'auto-open', label: 'Submissions open (auto)', cls: 'auto' };
    }
    if (examDate && now < examDate.getTime()) return { mode: 'not-started', label: 'Not open yet', cls: 'closed' };
    return { mode: 'closed', label: 'Submissions closed', cls: 'closed' };
  }
  function isWindowOpen(exam) {
    var w = windowState(exam);
    return w.mode === 'manual-open' || w.mode === 'auto-open';
  }

  function workState(item, sub, kind) {
    var now = Date.now();
    if (sub && sub.status === 'Graded') return { k: 'graded', cls: 'b-confirmed', icon: 'fa-circle-check', text: 'Graded: ' + (fmtScore(sub) || 'done') };
    if (sub && sub.status === 'Corrections') return { k: 'corrections', cls: 'b-declined', icon: 'fa-rotate-left', text: 'Corrections requested' };
    if (sub && sub.status === 'Suspended') return { k: 'suspended', cls: 'b-declined', icon: 'fa-ban', text: 'Suspended' };
    if (sub && sub.status === 'In progress') return { k: 'progress', cls: 'b-pending', icon: 'fa-hourglass-half', text: 'In progress' };
    if (sub) return { k: 'submitted', cls: 'b-pending', icon: 'fa-inbox', text: 'Submitted \u2013 awaiting grading' };
    var due = dueOf(item, kind);
    if (due && due.getTime() < now) return { k: 'overdue', cls: 'b-declined', icon: 'fa-triangle-exclamation', text: 'Overdue' };
    return { k: 'pending', cls: 'b-plain', icon: 'fa-circle', text: 'Not submitted' };
  }

  async function loadEnrolled(cls) {
    var snap = await db.collection('students').where('keyStage', '==', cls.keyStage).get();
    var want = lmzSubjectKey(cls.subjectId);
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) {
      if (String(s.status || '').toLowerCase() === 'pending') return false;
      var subs = lmzSubjectKeys(s.subjects);
      if (subs.indexOf(want) === -1) return false;
      return !(s.year != null && cls.year != null && Number(s.year) !== Number(cls.year));
    }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }

  async function loadClassHomework(cid, topics, tutorOnly) {
    var items = [];
    
    var parts = await Promise.all(topics.map(function (t) {
      var q = coll(cid, t.id, 'assignment');
      if (tutorOnly) q = q.where('audiences.tutors', '==', true);
      return q.get().then(function (snap) {
        return snap.docs.map(function (d) { return Object.assign({ id: d.id, tid: t.id, cid: cid, kind: 'assignment' }, d.data()); });
      });
    }));
    parts.forEach(function (p) { items = items.concat(p); });

    var lParts = await Promise.all(topics.map(function (t) {
      var q = coll(cid, t.id, 'lesson');
      if (tutorOnly) q = q.where('audiences.tutors', '==', true);
      else q = q.where('status', '==', 'published');
      
      return q.get().then(function (snap) {
        return snap.docs.map(function (d) { 
          return Object.assign({ id: d.id, tid: t.id, cid: cid, kind: 'lesson', isClasswork: true }, d.data()); 
        });
      });
    }));
    lParts.forEach(function (p) { items = items.concat(p); });

    var subs = {};
    await Promise.all(items.map(function (it) {
      return coll(cid, it.tid, it.kind).doc(it.id).collection('submissions').get().then(function (snap) {
        var m = {}; snap.docs.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
        subs[it.id] = m;
      }).catch(function () { subs[it.id] = {}; });
    }));

    return { items: items, subs: subs };
  }

  async function loadFlatExams(cid, tutorOnly) {
    var fq = flatExamsRef(cid);
    if (tutorOnly) fq = fq.where('audiences.tutors', '==', true);
    var snap = await fq.get();
    var items = snap.docs.map(function (d) { return Object.assign({ id: d.id, cid: cid, flat: true }, d.data()); });
    items.sort(function (a, b) {
      var da = (a.examDate && U.toDate(a.examDate)) || (a.createdAt && U.toDate(a.createdAt)) || 0;
      var db2 = (b.examDate && U.toDate(b.examDate)) || (b.createdAt && U.toDate(b.createdAt)) || 0;
      return db2 - da;
    });
    var subs = {};
    await Promise.all(items.map(function (it) {
      return flatExamSubmissionsRef(cid, it.id).get().then(function (s) {
        var m = {}; s.docs.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
        subs[it.id] = m;
      }).catch(function () { subs[it.id] = {}; });
    }));
    return { items: items, subs: subs };
  }

  var AUD_LABEL = { online: 'Online', remote: 'Remote', tuition: 'Tuition', tutors: 'Tutors' };
  function studentAud(s) { var t = s && s.studentType; return t === 'remote' ? 'remote' : (t === 'tuition' ? 'tuition' : 'online'); }
  function effAudiences(it) { return it && it.audiences && typeof it.audiences === 'object' ? it.audiences : { online: true, remote: false, tuition: false, tutors: true }; }
  function studentSees(s, it) {
    return effAudiences(it)[studentAud(s)] === true || (Array.isArray(it.releasedTo) && it.releasedTo.indexOf(s.id) !== -1);
  }
  function audChips(it) {
    var a = effAudiences(it);
    return Object.keys(AUD_LABEL).map(function (k) {
      return '<span class="wk-chip" style="' + (a[k] ? 'background:rgba(46,184,114,.14);color:#1d8b57' : 'opacity:.5') + '" title="' + (a[k] ? 'Posted to ' : 'Not posted to ') + AUD_LABEL[k] + '">' + AUD_LABEL[k] + '</span>';
    }).join('');
  }
  function audienceOf(item, enrolled) {
    if (item.recipients && item.recipients.length) {
      var byId = {}; enrolled.forEach(function (s) { byId[s.id] = s; });
      return item.recipients.map(function (id) { return byId[id] || { id: id, name: 'Student' }; }).filter(function (s) { return !s.status || studentSees(s, item); });
    }
    return enrolled.filter(function (s) { return studentSees(s, item); });
  }

  function uploadTo(path, file, contentType, onProgress) {
    var ref = firebase.storage().ref(path);
    var task = ref.put(file, { contentType: contentType || file.type });
    return new Promise(function (resolve, reject) {
      task.on('state_changed', function (s) { if (onProgress) onProgress(Math.round(s.bytesTransferred / s.totalBytes * 100)); },
        function (err) { reject(new Error(err.code === 'storage/unauthorized' ? 'You do not have permission to upload here.' : 'Upload failed. Check your connection and try again.')); },
        function () { ref.getDownloadURL().then(function (url) { resolve({ url: url, path: path, name: file.name }); }).catch(reject); });
    });
  }
  function cleanName(n) { return Date.now() + '_' + String(n).replace(/[^a-zA-Z0-9._-]/g, '_'); }

  function pad(n) { return U.pad2(n); }
  function dtParts(d) { return d ? { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) } : { date: '', time: '17:00' }; }
  function tsFromLocal(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    var d = new Date(dateStr + 'T' + timeStr);
    if (isNaN(d.getTime())) return null;
    return firebase.firestore.Timestamp.fromDate(d);
  }

  function recipientsHtml(prefix) {
    return '<div class="cr-field"><label>Recipients</label>' +
      '<div class="wk-radio"><label><input type="radio" name="' + prefix + 'Aud" value="class" checked> Whole class</label>' +
      '<label><input type="radio" name="' + prefix + 'Aud" value="students"> Select students</label></div>' +
      '<div id="' + prefix + 'Pick" style="display:none;margin-top:.5rem"><div class="wk-pick" id="' + prefix + 'List"><div class="cr-note" style="padding:.5rem">Loading students\u2026</div></div></div></div>';
  }
  function wireRecipients(m, prefix, cls, existing) {
    var pick = m.body.querySelector('#' + prefix + 'Pick'), list = m.body.querySelector('#' + prefix + 'List');
    var chosen = {}; (existing || []).forEach(function (id) { chosen[id] = true; });
    var loaded = false;
    function setAud(v) { pick.style.display = v === 'students' ? '' : 'none'; if (v === 'students' && !loaded) load(); }
    Array.prototype.forEach.call(m.body.querySelectorAll('input[name="' + prefix + 'Aud"]'), function (r) {
      r.addEventListener('change', function () { setAud(r.value); });
    });
    if (existing && existing.length) { m.body.querySelector('input[name="' + prefix + 'Aud"][value="students"]').checked = true; setAud('students'); }
    async function load() {
      loaded = true;
      try {
        var students = await loadEnrolled(cls);
        list.innerHTML = students.length ? students.map(function (s) {
          return '<label><input type="checkbox" value="' + esc(s.id) + '"' + (chosen[s.id] ? ' checked' : '') + '> ' + esc(s.name || s.email || s.id) + '</label>';
        }).join('') : '<div class="cr-note" style="padding:.5rem">No students are enrolled in this classroom yet.</div>';
      } catch (e) { list.innerHTML = '<div class="cr-err" style="padding:.5rem">Could not load students: ' + esc(e.message || e) + '</div>'; }
    }
    return function read() {
      var aud = m.body.querySelector('input[name="' + prefix + 'Aud"]:checked').value;
      if (aud === 'class') return { audience: 'class', recipients: [] };
      var ids = Array.prototype.map.call(list.querySelectorAll('input[type=checkbox]:checked'), function (c) { return c.value; });
      return { audience: 'students', recipients: ids };
    };
  }

  function openPostAssignment(o) {
    injectStyle();
    var cls = o.cls, topics = o.topics, user = o.user, ex = o.existing || null;
    var aid = ex ? ex.id : U.clsRef(cls.id).collection('topics').doc().id;
    var uploaded = null, busy = false;
    var due = ex ? dueOf(ex, 'assignment') : null, dp = dtParts(due);
    var topicId0 = ex ? ex.tid : (o.topicId || (topics[0] && topics[0].id) || '');

    var m = U.openModal({ title: ex ? 'Edit assignment' : 'Prepare assignment \u2014 ' + U.displayName(cls) + ' Year ' + cls.year, wide: true,
      beforeClose: function () { if (busy) { alert('An upload is still in progress.'); return false; } return true; } });
    
    var currentAud = ex && ex.audiences ? ex.audiences : { online: false, remote: false, tuition: false, tutors: true };
    if (o.scope === 'remote') currentAud = { online: false, remote: true, tuition: false, tutors: true };
    if (o.scope === 'tuition') currentAud = { online: false, remote: false, tuition: true, tutors: true };

    m.body.innerHTML =
      '<div class="cr-row2"><div class="cr-field"><label>Title</label><input type="text" id="wkTitle" maxlength="200" value="' + esc(ex ? ex.title : (o.lessonTitle ? 'Homework: ' + o.lessonTitle : '')) + '"></div>' +
      '<div class="cr-field"><label>Topic</label><select id="wkTopic"' + (ex ? ' disabled' : '') + '>' + topics.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === topicId0 ? ' selected' : '') + '>' + esc(t.title) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="cr-field"><label>Description / instructions</label><textarea id="wkDesc" rows="4" style="width:100%">' + esc(ex ? ex.description : '') + '</textarea></div>' +
      '<div class="cr-field"><label>Deadline <span class="cr-note" style="font-weight:600">(optional)</span></label><div class="cr-actions"><input type="date" id="wkDate" value="' + dp.date + '"><input type="time" id="wkTime" value="' + dp.time + '"></div></div>' +
      
      '<div class="cr-field" style="background:var(--sage); padding:.7rem; border-radius:9px; margin-top:.5rem; margin-bottom:1rem;">' +
        '<label style="margin-bottom:.4rem;">Who is this for? (Default: Tutors)</label>' +
        '<div class="wk-radio" style="gap:1.5rem;">' +
          '<label><input type="checkbox" id="wkAudTutors" ' + (currentAud.tutors ? 'checked' : '') + '> Tutors</label>' +
          '<label><input type="checkbox" id="wkAudOnline" ' + (currentAud.online ? 'checked' : '') + '> Online Students</label>' +
          '<label><input type="checkbox" id="wkAudRemote" ' + (currentAud.remote ? 'checked' : '') + '> Remote Students</label>' +
        '</div>' +
        '<div class="cr-note" style="margin-top:.4rem">If you select Tutors, they must release it to their students.</div>' +
      '</div>' +

      '<div class="cr-field"><label>Attach PDF (optional)</label><div id="wkPdfNow">' + (ex && ex.attachedPdfName ? '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(ex.attachedPdfName) + '</span></div>' : '') + '</div>' +
      '<button type="button" class="cr-btn sm" data-a="pdf"><i class="fas fa-upload"></i> ' + (ex && ex.attachedPdfName ? 'Replace PDF' : 'Choose PDF') + '</button>' +
      '<input type="file" id="wkPdfIn" accept="application/pdf,.pdf" style="display:none"><div class="cr-prog" id="wkProg" style="display:none"><div></div></div></div>' +
      recipientsHtml('wkR');
      
    m.foot.innerHTML = '<span class="cr-err" id="wkErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button>' +
      '<button type="button" class="cr-btn primary" data-a="save"><i class="fas fa-paper-plane"></i> ' + (ex ? 'Save changes' : 'Save assignment') + '</button>';
    var errEl = m.foot.querySelector('#wkErr');
    var readRecipients = wireRecipients(m, 'wkR', cls, ex ? ex.recipients : []);

    var fileIn = m.body.querySelector('#wkPdfIn'), prog = m.body.querySelector('#wkProg');
    m.body.querySelector('[data-a="pdf"]').onclick = function () { fileIn.click(); };
    fileIn.onchange = async function () {
      var f = fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { errEl.textContent = 'Please choose a PDF file.'; return; }
      if (f.size > 25 * 1024 * 1024) { errEl.textContent = 'That PDF is larger than 25 MB.'; return; }
      errEl.textContent = ''; busy = true; prog.style.display = '';
      try {
        var path = 'classroom-files/' + cls.subjectId + '/' + cls.id + '/' + aid + '/' + cleanName(f.name);
        uploaded = await uploadTo(path, f, 'application/pdf', function (p) { prog.firstChild.style.width = p + '%'; });
        m.body.querySelector('#wkPdfNow').innerHTML = '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(f.name) + '<small>Ready</small></span></div>';
      } catch (e) { errEl.textContent = e.message; }
      busy = false; prog.style.display = 'none';
    };
    m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
    
    m.foot.querySelector('[data-a="save"]').onclick = async function () {
      var btn = this; errEl.textContent = '';
      if (busy) { errEl.textContent = 'Please wait for the upload to finish.'; return; }
      var title = m.body.querySelector('#wkTitle').value.trim();
      var tid = m.body.querySelector('#wkTopic').value;
      var d = m.body.querySelector('#wkDate').value, t = m.body.querySelector('#wkTime').value;
      if (!title) { errEl.textContent = 'Please enter a title.'; return; }
      if (!tid) { errEl.textContent = 'Choose a topic.'; return; }
      var when = null;
      if (d || t) {
        if (!d || !t) { errEl.textContent = 'Set both a date and a time for the deadline, or leave both empty.'; return; }
        when = new Date(d + 'T' + t);
        if (isNaN(when.getTime())) { errEl.textContent = 'That deadline is not valid.'; return; }
        if (!ex && when.getTime() <= Date.now()) { errEl.textContent = 'The deadline must be in the future.'; return; }
      }
      
      var rec = readRecipients();
      var auds = {
        tutors: m.body.querySelector('#wkAudTutors').checked,
        online: m.body.querySelector('#wkAudOnline').checked,
        remote: m.body.querySelector('#wkAudRemote').checked,
        tuition: false
      };
      
      if (!auds.tutors && !auds.online && !auds.remote) {
        errEl.textContent = 'Choose at least one audience (Tutors or Students).'; return;
      }
      
      if (auds.online || auds.remote) {
         if (rec.audience === 'students' && !rec.recipients.length) { errEl.textContent = 'Tick at least one student, or choose Whole class.'; return; }
      }

      var topic = topics.filter(function (x) { return x.id === tid; })[0];
      var data = {
        title: title, description: m.body.querySelector('#wkDesc').value.trim(),
        subjectId: cls.subjectId, subjectName: U.displayName(cls), keyStage: cls.keyStage, year: cls.year,
        topicId: tid, topicTitle: topic ? topic.title : '',
        recipients: rec.recipients, audience: rec.audience,
        audiences: auds,
        updatedAt: FV().serverTimestamp()
      };
      if (when) data.dueAt = firebase.firestore.Timestamp.fromDate(when);
      
      if (uploaded) { data.attachedPdfUrl = uploaded.url; data.attachedPdfName = uploaded.name; data.attachedPdfPath = uploaded.path; }
      if (!ex) {
        data.attachedPdfUrl = data.attachedPdfUrl || ''; data.attachedPdfName = data.attachedPdfName || '';
        data.reminderSent = false; data.graceNoticeSent = false; data.reportSent = false;
        data.tutorId = user.uid; data.tutorName = user.name || ''; data.createdBy = user.uid; data.createdAt = FV().serverTimestamp();
      } else if (when && due && when.getTime() !== due.getTime()) {
        data.reminderSent = false; data.graceNoticeSent = false; data.reportSent = false;
      }
      btn.disabled = true;
      try {
        await coll(cls.id, tid, 'assignment').doc(aid).set(data, { merge: true });
        m.close(true);
        if (o.afterSave) await o.afterSave();
        else alert('Assignment saved.');
      } catch (e) {
        console.error('post assignment:', e);
        errEl.textContent = 'Could not save: ' + (e.code === 'permission-denied' ? 'you do not have permission.' : (e.message || e));
        btn.disabled = false;
      }
    };
  }

  function openCreateExam(o) {
    injectStyle();
    var cls = o.cls, user = o.user, ex = o.existing || null;
    var eid = ex ? ex.id : flatExamsRef(cls.id).doc().id;
    var uploaded = ex && ex.examPdfUrl
      ? { url: ex.examPdfUrl, name: ex.examPdfName || 'exam.pdf', path: ex.examPdfPath || '' }
      : null;
    var busy = false;
    var examDateParts = dtParts(ex && ex.examDate ? U.toDate(ex.examDate) : null);
    var deadlineParts  = dtParts(ex && ex.submissionDeadline ? U.toDate(ex.submissionDeadline) : null);
    var type0 = (ex && ex.examType) || 'Midterm';
    var manualOpen0 = ex ? (ex.submissionsOpen === true) : false;

    var m = U.openModal({
      title: ex ? 'Edit exam' : 'Create exam \u2014 ' + U.displayName(cls) + ' Year ' + cls.year,
      wide: true,
      beforeClose: function () { if (busy) { alert('An upload is still in progress.'); return false; } return true; }
    });

    m.body.innerHTML =
      '<div class="cr-field"><label>Exam type</label>' +
        '<div class="wk-radio">' +
          '<label><input type="radio" name="xType" value="Midterm"' + (type0 === 'Midterm' ? ' checked' : '') + '> Midterm</label>' +
          '<label><input type="radio" name="xType" value="End of Term"' + (type0 === 'End of Term' ? ' checked' : '') + '> End of Term</label>' +
        '</div>' +
      '</div>' +
      '<div class="cr-field"><label>Exam title</label><input type="text" id="xTitle" maxlength="200" value="' + esc(ex ? ex.title : '') + '" placeholder="e.g. Midterm Paper 1"></div>' +
      '<div class="cr-row2">' +
        '<div class="cr-field"><label>Exam date</label>' +
          '<div class="cr-actions"><input type="date" id="xDate" value="' + examDateParts.date + '"><input type="time" id="xTime" value="' + (examDateParts.time || '09:00') + '"></div>' +
          '<div class="cr-note" style="margin-top:.3rem">The day the student sits the paper.</div>' +
        '</div>' +
        '<div class="cr-field"><label>Submission deadline</label>' +
          '<div class="cr-actions"><input type="date" id="xDeadDate" value="' + deadlineParts.date + '"><input type="time" id="xDeadTime" value="' + (deadlineParts.time || '21:00') + '"></div>' +
          '<div class="cr-note" style="margin-top:.3rem">After this, the window closes automatically.</div>' +
        '</div>' +
      '</div>' +
      '<div class="cr-field"><label>Requirements / instructions (optional)</label>' +
        '<textarea id="xReq" rows="3" style="width:100%" placeholder="e.g. Calculator allowed.">' + esc(ex ? (ex.requirements || '') : '') + '</textarea>' +
      '</div>' +
      '<div class="cr-field"><label>Exam paper (PDF)</label>' +
        '<div id="xPdfNow">' +
          (uploaded ? '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(uploaded.name) + '<small>' + (ex ? 'Current paper' : 'Ready') + '</small></span></div>' : '') +
        '</div>' +
        '<button type="button" class="cr-btn sm" data-a="pdf"><i class="fas fa-upload"></i> ' + (uploaded ? 'Replace PDF' : 'Choose PDF') + '</button>' +
        '<input type="file" id="xPdfIn" accept="application/pdf,.pdf" style="display:none">' +
        '<div class="cr-prog" id="xProg" style="display:none"><div></div></div>' +
      '</div>' +
      '<div class="cr-field"><label>Submission window</label>' +
        '<div class="wk-radio">' +
          '<label><input type="checkbox" id="xManualOpen"' + (manualOpen0 ? ' checked' : '') + '> Open submissions now (manual override)</label>' +
        '</div>' +
        '<div class="cr-note" style="margin-top:.4rem">If not overridden, submissions open automatically at the exam date.</div>' +
      '</div>';

    m.foot.innerHTML =
      '<span class="cr-err" id="xErr"></span>' +
      '<button type="button" class="cr-btn" data-a="cancel">Cancel</button>' +
      '<button type="button" class="cr-btn" data-s="Draft"><i class="fas fa-floppy-disk"></i> Save draft</button>' +
      '<button type="button" class="cr-btn primary" data-s="Published"><i class="fas fa-paper-plane"></i> ' + (ex ? 'Save &amp; publish' : 'Publish') + '</button>';

    var errEl = m.foot.querySelector('#xErr');

    var fileIn = m.body.querySelector('#xPdfIn'), prog = m.body.querySelector('#xProg');
    m.body.querySelector('[data-a="pdf"]').onclick = function () { fileIn.click(); };
    fileIn.onchange = async function () {
      var f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { errEl.textContent = 'Please choose a PDF file.'; return; }
      if (f.size > 25 * 1024 * 1024) { errEl.textContent = 'That PDF is larger than 25 MB.'; return; }
      errEl.textContent = ''; busy = true; prog.style.display = '';
      try {
        var path = 'classroom-files/' + cls.subjectId + '/' + cls.id + '/exams/' + eid + '/' + cleanName(f.name);
        var res = await uploadTo(path, f, 'application/pdf', function (p) { prog.firstChild.style.width = p + '%'; });
        uploaded = { url: res.url, name: f.name, path: res.path };
        m.body.querySelector('#xPdfNow').innerHTML = '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(f.name) + '<small>Ready</small></span></div>';
      } catch (e) { errEl.textContent = e.message; }
      busy = false; prog.style.display = 'none';
    };

    m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };

    function readForm() {
      var type = m.body.querySelector('input[name="xType"]:checked').value;
      var title = m.body.querySelector('#xTitle').value.trim();
      var d = m.body.querySelector('#xDate').value, t = m.body.querySelector('#xTime').value;
      var dd = m.body.querySelector('#xDeadDate').value, dt = m.body.querySelector('#xDeadTime').value;
      var req = m.body.querySelector('#xReq').value.trim();
      var manualOpen = m.body.querySelector('#xManualOpen').checked;
      return { type: type, title: title, examTs: tsFromLocal(d, t), deadlineTs: tsFromLocal(dd, dt), req: req, manualOpen: manualOpen };
    }

    Array.prototype.forEach.call(m.foot.querySelectorAll('[data-s]'), function (btn) {
      btn.onclick = async function () {
        errEl.textContent = '';
        if (busy) { errEl.textContent = 'Please wait for the upload to finish.'; return; }
        var f = readForm();
        if (!f.title) { errEl.textContent = 'Please enter the exam title.'; return; }
        if (!f.examTs) { errEl.textContent = 'Choose the exam date and time.'; return; }
        if (!f.deadlineTs) { errEl.textContent = 'Choose the submission deadline.'; return; }
        if (f.deadlineTs.toDate().getTime() < f.examTs.toDate().getTime()) {
          errEl.textContent = 'The submission deadline must be after the exam date.'; return;
        }
        if (!uploaded) { errEl.textContent = 'Upload the exam paper (PDF).'; return; }
        var status = btn.dataset.s;

        var data = {
          examType: f.type,
          title: f.title,
          subjectId: cls.subjectId,
          subjectName: U.displayName(cls),
          keyStage: cls.keyStage,
          year: cls.year,
          examDate: f.examTs,
          submissionDeadline: f.deadlineTs,
          requirements: f.req,
          examPdfUrl: uploaded.url,
          examPdfName: uploaded.name,
          examPdfPath: uploaded.path,
          submissionsOpen: f.manualOpen === true,
          status: status,
          updatedAt: FV().serverTimestamp()
        };

        if (!ex) {
          data.tutorId = user.uid;
          data.tutorName = user.name || '';
          data.createdBy = user.uid;
          data.createdAt = FV().serverTimestamp();
          data.notificationsSentAt = null;
        } else if (status === 'Published' && ex.status !== 'Published') {
          data.notificationsSentAt = null;
        } else if (f.examTs.toDate().getTime() !== (ex.examDate ? U.toDate(ex.examDate).getTime() : 0)) {
          data.parentNoticeSent = false;
        }

        btn.disabled = true;
        try {
          await flatExamRef(cls.id, eid).set(data, { merge: true });
          m.close(true);
          if (o.afterSave) await o.afterSave();
        } catch (e) {
          console.error('save flat exam:', e);
          errEl.textContent = 'Could not save: ' + (e.code === 'permission-denied' ? 'you do not have permission to post in this subject.' : (e.message || e));
          btn.disabled = false;
        }
      };
    });
  }

  async function setFlatExamStatus(cid, eid, patch) {
    await flatExamRef(cid, eid).update(Object.assign({ updatedAt: FV().serverTimestamp() }, patch));
  }

  function openGradeFlatExamInk(ctx) {
    if (!global.InkGrader) {
      alert('The grading workspace did not load. Refresh the page and try again.');
      return;
    }
    var subRef = flatExamSubmissionsRef(ctx.cid, ctx.exam.id).doc(ctx.student.id);
    var data = Object.assign({ studentName: ctx.student.name || (ctx.sub && ctx.sub.studentName) }, ctx.sub || {});
    global.InkGrader.open({
      docRef: subRef,
      data: data,
      item: ctx.exam,
      cid: ctx.cid,
      itemId: ctx.exam.id,
      user: ctx.user,
      kind: 'exam',
      onDone: async function () {
        if (ctx.onDone) await ctx.onDone();
      }
    });
  }

  async function openRelease(it, user) {
    var m = U.openModal({ title: 'Release to my students \u2014 ' + it.title });
    m.body.innerHTML = '<div class="cr-empty">Loading your students\u2026</div>';
    m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Close</button>';
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
    
    var found = {};
    var qs = [db.collection('students').where('tutorIds', 'array-contains', user.uid), db.collection('students').where('tutorId', '==', user.uid)];
    var snaps = await Promise.all(qs.map(function (q) { return q.get().catch(function () { return { docs: [] }; }); }));
    snaps.forEach(function (sn) { sn.docs.forEach(function (d) { found[d.id] = Object.assign({ id: d.id }, d.data()); }); });
    
    var clsSnap = await U.clsRef(it.cid).get();
    var cls = clsSnap.exists ? clsSnap.data() : {};
    var want = lmzSubjectKey(it.subjectId || cls.subjectId);
    
    var list = Object.keys(found).map(function (k) { return found[k]; }).filter(function (st) {
      if (['pending', 'suspended'].indexOf(String(st.status || '').toLowerCase()) !== -1) return false;
      if (lmzSubjectKeys(st.subjects).indexOf(want) === -1) return false;
      return !(st.year != null && cls.year != null && Number(st.year) !== Number(cls.year));
    }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    
    if (!list.length) { m.body.innerHTML = '<div class="cr-empty">None of your students take this subject in this Year.</div>'; return; }
    
    var rdp = dtParts(it.dueAt ? U.toDate(it.dueAt) : null);
    var needsDue = !it.examDate;
    m.body.innerHTML = (needsDue ? '<div class="cr-field" style="margin-bottom:.8rem"><label>Deadline <span style="color:#c0392b">*</span></label><div class="cr-actions"><input type="date" id="rlDate" value="' + rdp.date + '"><input type="time" id="rlTime" value="' + (rdp.time || '17:00') + '"></div><div class="cr-note" style="margin-top:.3rem">Set the deadline for your students. This is the date we track for this work.</div></div>' : '') +
      '<div class="cr-note" style="margin-bottom:.6rem">Choose the students you teach who should receive this now.</div>' +
      '<label style="display:flex; align-items:center; gap:.5rem; margin-bottom:.8rem; font-weight:800; color:var(--brand-deep); cursor:pointer; padding:.5rem; background:var(--sage); border-radius:8px;">' +
        '<input type="checkbox" id="rlSelectAll" checked> Select All Students' +
      '</label>' +
      '<div class="wk-pick" style="max-height:300px; overflow-y:auto;">' +
      list.map(function (st) {
        var already = (it.releasedTo || []).indexOf(st.id) !== -1;
        return '<label style="display:flex; align-items:center; gap:.5rem; padding:.4rem; border-bottom:1px solid var(--line-soft); cursor:pointer;">' +
          '<input type="checkbox" value="' + esc(st.id) + '" checked> ' + 
          esc(st.name || st.email || st.id) +
          (st.studentType === 'remote' ? ' <span class="cr-note">(remote)</span>' : (st.studentType === 'tuition' ? ' <span class="cr-note">(CBC tuition)</span>' : '')) + 
          (already ? ' <span class="cr-note" style="color:var(--brand)">— already released</span>' : '') +
        '</label>';
      }).join('') + '</div>';
      
    m.foot.innerHTML = '<span class="cr-err" id="rlErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-share-from-square"></i> Release</button>';
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };

    var selectAllBox = m.body.querySelector('#rlSelectAll');
    var studentBoxes = m.body.querySelectorAll('.wk-pick input[type="checkbox"]');
    
    selectAllBox.onchange = function() {
      studentBoxes.forEach(function(box) { box.checked = selectAllBox.checked; });
    };
    studentBoxes.forEach(function(box) {
      box.onchange = function() {
        var allChecked = true;
        studentBoxes.forEach(function(b) { if (!b.checked) allChecked = false; });
        selectAllBox.checked = allChecked;
      };
    });
    
    m.foot.querySelector('[data-a="go"]').onclick = async function () {
      var ids = Array.prototype.map.call(m.body.querySelectorAll('.wk-pick input:checked'), function (c) { return c.value; });
      var err = m.foot.querySelector('#rlErr');
      if (!ids.length) { err.textContent = 'Tick at least one student.'; return; }
      var dueIso = null;
      if (needsDue) {
        var rd = m.body.querySelector('#rlDate').value, rt = m.body.querySelector('#rlTime').value;
        if (!rd || !rt) { err.textContent = 'Please set the deadline before releasing.'; return; }
        var rw = new Date(rd + 'T' + rt);
        if (isNaN(rw.getTime())) { err.textContent = 'That deadline is not valid.'; return; }
        if (rw.getTime() <= Date.now()) { err.textContent = 'The deadline must be in the future.'; return; }
        dueIso = rw.toISOString();
      }
      var btn = this; btn.disabled = true;
      
      // Items carry their topic as `tid` (loaded from the topic's sub-collection); `topicId` only exists
      // on some newer documents, and never on lessons. Using topicId alone built a wrong path and the
      // server answered "That item no longer exists".
      var topicRef = it.tid || it.topicId || '';
      var typeCol = it.kind === 'lesson' || it.isClasswork === true ? 'lessons'
        : (it.kind === 'assignment' ? 'assignments'
        : (it.kind === 'exam' ? 'exams' : (it.examDate ? 'exams' : 'assignments')));
      var path = (it.flat || !topicRef)
        ? 'classrooms/' + it.cid + '/exams/' + it.id
        : 'classrooms/' + it.cid + '/topics/' + topicRef + '/' + typeCol + '/' + it.id;

      var errEl = err;
      try {
        PaisleyUI.loader.show('Releasing to ' + ids.length + ' student' + (ids.length === 1 ? '' : 's'), 'Sending it out and notifying your students');
        var r = await firebase.functions().httpsCallable('tutorReleaseWork')({ path: path, studentIds: ids, dueAt: dueIso });
        var n = ((r.data && r.data.released) || []).length;
        PaisleyUI.loader.hide(true);
        m.close(true);
        PaisleyUI.alert('\u201c' + (it.title || 'This work') + '\u201d is now live for ' + n + ' student' + (n === 1 ? '' : 's') + '. They can open it straight away.', { type: 'success', title: 'Released successfully', okLabel: 'Great' });
        if (window.ClassroomUI && window.ClassroomUI._refresh) window.ClassroomUI._refresh();
      } catch (e2) {
        PaisleyUI.loader.hide(true);
        errEl.textContent = '';
        btn.disabled = false;
        PaisleyUI.alert((e2 && e2.message) || 'Could not release.', { type: 'error', title: 'Release failed' });
      }
    };
  }

  function mountManagement(root, opts) {
    injectStyle();
    var kind = opts.kind === 'exams' ? 'exam' : 'assignment';
    var isAdmin = opts.role === 'admin';
    var title = kind === 'exam' ? 'Exam Management' : 'Homework Management';
    var tutorSubjects = lmzSubjectKeys(opts.subjects || []);
    var tutorKS = opts.keyStages || [];
    var user = { uid: opts.uid, name: opts.name || (isAdmin ? 'Studio Desk' : 'Tutor') };
    var S = { screen: 'list', tab: 'classes', classrooms: null, cls: null, topics: [], items: [], subs: {}, enrolled: [], collapsed: {}, filters: { subject: '', ks: '', year: '', board: '' }, view: 'active', granted: [], monitoringOnly: !!opts.monitoringOnly };
    root.classList.add('cr-root');

    async function loadClassrooms() {
      root.innerHTML = '<div class="cr-empty">Loading\u2026</div>';
      try {
        if (isAdmin) S.classrooms = U.snapDocs(await db.collection('classrooms').get());
        else {
          var parts = await Promise.all(tutorSubjects.map(function (k) { return db.collection('classrooms').where('subjectId', '==', k).get().then(U.snapDocs); }));
          S.classrooms = [].concat.apply([], parts).filter(function (c) { return !tutorKS.length || tutorKS.indexOf(c.keyStage) !== -1; });
          S.granted = await loadGranted();
        }
      } catch (e) { root.innerHTML = '<div class="cr-empty">Could not load: ' + esc(e.message || e) + '</div>'; return; }
      renderList();
    }

    async function loadGranted() {
      try {
        var snap = await db.collection('gradingGrants').where('tutorId', '==', user.uid).get();
        var want = kind === 'exam' ? 'exam' : 'homework';
        var rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .filter(function (g) { return g.revoked !== true && g.taskType === want && g.taskPath; });
        var out = [];
        for (var i = 0; i < rows.length; i++) {
          var taskPath = rows[i].taskPath;
          var p = taskPath.split('/');
          var cid, tid = null, itemId, isFlat = false;
          if (p[0] === 'classrooms' && p[2] === 'topics' && p.length === 6) {
            cid = p[1]; tid = p[3]; itemId = p[5];
          } else if (p[0] === 'classrooms' && p[2] === 'exams' && p.length === 4) {
            cid = p[1]; itemId = p[3]; isFlat = true;
          } else {
            continue;
          }
          try {
            var doc = await db.doc(taskPath).get();
            if (doc.exists) out.push(Object.assign({ id: doc.id, cid: cid, tid: tid, flat: isFlat }, doc.data()));
          } catch (e) { /* not readable any more */ }
        }
        return out;
      } catch (e) { return []; }
    }

    function renderList() {
      S.screen = 'list';
      if (!isAdmin && !tutorSubjects.length) { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">No subjects have been assigned to your account yet.</div></div>'; return; }
      var subText;
      if (kind === 'exam') {
        subText = isAdmin
          ? 'Subject \u2192 Exams. Pick a subject, then create Midterm or End-of-Term papers.'
          : 'Subject \u2192 Exams. Open an exam to see every student\u2019s hand-in and grade their work.';
      } else {
        subText = 'Subject \u2192 Topic \u2192 Assignment. Open an assignment to see every student and grade their work.';
      }
      var h = '<div class="cr-bar"><div><h3>' + title + '</h3><div class="cr-sub">' + subText + '</div></div>' +
        (isAdmin ? '<button type="button" class="cr-btn primary" data-a="add-class"><i class="fas fa-plus"></i> Add classroom</button>' : '') + '</div>';
      if (isAdmin) {
        h += '<div class="cr-tabs">' +
          '<button type="button" class="cr-btn ' + (S.tab === 'classes' ? 'on' : '') + '" data-a="tab" data-v="classes"><i class="fas fa-chalkboard"></i> Classrooms</button>' +
          '<button type="button" class="cr-btn ' + (S.tab === 'legacy' ? 'on' : '') + '" data-a="tab" data-v="legacy"><i class="fas fa-box-archive"></i> Legacy</button>' +
          (kind === 'assignment' ? '<button type="button" class="cr-btn ' + (S.tab === 'jobs' ? 'on' : '') + '" data-a="tab" data-v="jobs"><i class="fas fa-bolt"></i> Automation</button>' : '') +
        '</div>';
        if (S.tab === 'legacy') { root.innerHTML = h + '<div id="wkLegacy"></div>'; renderLegacy(); return; }
        if (S.tab === 'jobs') { root.innerHTML = h + '<div id="wkJobs"></div>'; renderJobs(); return; }
      }
      var list = (S.classrooms || []).filter(function (c) {
        var f = S.filters;
        if ((opts.audience === 'tuition') !== /^CBC\b/i.test(String(c.keyStage || ''))) return false;
        return (!f.subject || c.subjectId === f.subject) && (!f.ks || c.keyStage === f.ks) && (!f.year || String(c.year) === f.year) && (!f.board || U.boardOf(c) === f.board);
      });
      if (isAdmin) {
        h += '<div class="cr-filters"><select data-f="f-board" aria-label="Exam board">' + U.boardOptionsHtml(S.filters.board, true) + '</select>' + sel('f-subject', 'All subjects', LMZ_SUBJECTS.map(function (s) { return [s.id, s.name]; }), S.filters.subject) +
          sel('f-ks', 'All Key Stages', (opts.audience === 'tuition' && typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : U.KEY_STAGES).map(function (k) { return [k, U.ksShort(k)]; }), S.filters.ks) +
          sel('f-year', 'All Years', (opts.audience === 'tuition' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).map(function (y) { return [String(y), (opts.audience === 'tuition' ? 'Grade ' : 'Year ') + y]; }), S.filters.year) + '</div>';
      }
      if (!isAdmin && S.granted.length) {
        h += '<div class="cr-panel"><h4 style="margin:0 0 .5rem;color:var(--brand-deep,#245F5A)"><i class="fas fa-user-shield"></i> Granted to me</h4>' +
          S.granted.map(function (g, i) {
            return '<div class="cr-lesson"><span class="tt">' + esc(g.title) +
              '<small>' + esc(g.subjectName || g.subject || '') + (g.topicTitle ? ' \u00b7 ' + esc(g.topicTitle) : '') + (g.flat ? ' \u00b7 ' + esc(g.examType || '') : '') + '</small></span>' +
              pill('b-grant', 'Granted', 'fa-user-shield') +
              '<button type="button" class="cr-btn sm primary" data-a="open-granted" data-i="' + i + '"><i class="fas fa-eye"></i> Open</button></div>';
          }).join('') + '</div>';
      }
      if (!list.length) {
        h += '<div class="cr-panel"><div class="cr-empty">' + ((S.classrooms || []).length
          ? 'No classrooms match these filters.'
          : (isAdmin ? 'No classrooms yet. Use \u201cAdd classroom\u201d to start one.' : 'No classroom exists yet for your subjects. The Studio Desk creates classrooms.')) + '</div></div>';
      } else {
        list.sort(function (a, b) { return U.displayName(a).localeCompare(U.displayName(b)) || (a.year || 0) - (b.year || 0); });
        h += '<div class="cr-grid">' + list.map(function (c) {
          return '<button type="button" class="cr-card" data-a="open" data-id="' + esc(c.id) + '"><div class="ic"><i class="fas ' + (kind === 'exam' ? 'fa-file-pen' : 'fa-book-open') + '"></i></div><h4>' + esc(U.displayName(c)) +
            '</h4><div class="meta">Year ' + esc(c.year) + ' \u00b7 ' + esc(U.ksShort(c.keyStage)) + '</div><div style="margin-top:.4rem">' + U.boardBadge(c) + '</div></button>';
        }).join('') + '</div>';
      }
      root.innerHTML = h;
    }
    function sel(id, all, pairs, cur) {
      return '<select data-f="' + id + '" aria-label="' + esc(all) + '"><option value="">' + esc(all) + '</option>' +
        pairs.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (String(cur) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>';
    }

    async function openClass(cid, focusItemId) {
      root.innerHTML = '<div class="cr-empty">Loading\u2026</div>';
      try {
        var doc = await U.clsRef(cid).get();
        if (!doc.exists) throw new Error('Classroom not found.');
        S.cls = Object.assign({ id: doc.id }, doc.data());
        S.view = 'active';
        await reload();
      } catch (e) { root.innerHTML = '<div class="cr-empty">Could not open: ' + esc(e.message || e) + '</div>'; return; }
      render();
      if (focusItemId) { var it = S.items.filter(function (x) { return x.id === focusItemId; })[0]; if (it) openDetail(it); }
    }
    async function reload() {
      S.topics = await U.loadTopics(S.cls.id);
      var enrolledP = loadEnrolled(S.cls).catch(function () { return []; });
      if (kind === 'exam') {
        var res = await Promise.all([loadFlatExams(S.cls.id, !isAdmin), enrolledP]);
        S.items = res[0].items; S.subs = res[0].subs; S.enrolled = res[1];
      } else {
        var res2 = await Promise.all([loadClassHomework(S.cls.id, S.topics, !isAdmin), enrolledP]);
        S.items = res2[0].items; S.subs = res2[0].subs; S.enrolled = res2[1];
      }
      if (opts.audience) {
        S.items = S.items.filter(function (it) { return effAudiences(it)[opts.audience] === true; });
        S.enrolled = S.enrolled.filter(function (st) { return studentAud(st) === opts.audience; });
      }
    }
    async function refresh() { await reload(); render(); }

    function counts(it) {
      var aud = audienceOf(it, S.enrolled), subs = S.subs[it.id] || {};
      var submitted = 0, graded = 0;
      aud.forEach(function (s) {
        var x = subs[s.id];
        if (!x) return;
        if (x.status !== 'In progress' && x.status !== 'Suspended') submitted++;
        if (x.status === 'Graded') graded++;
      });
      return { total: aud.length, submitted: submitted, graded: graded };
    }

    // Past Work = every recipient has handed in AND every piece is graded.
    function isPast(it) {
      var c = counts(it);
      return c.total > 0 && c.graded === c.total;
    }

    function itemPill(it) {
      var c = counts(it);
      if (kind === 'exam') {
        var statusPill = it.status === 'Published'
          ? pill('b-confirmed', 'Published')
          : it.status === 'Closed'
            ? pill('b-plain', 'Closed')
            : pill('b-pending', 'Draft');
        var typePill = pill('b-plain', it.examType || 'Exam');
        var w = windowState(it);
        var windowPill = '<span class="wk-pill-window ' + w.cls + '">' + (w.mode === 'auto-open' ? '<i class="fas fa-clock"></i> ' : (w.mode === 'manual-open' ? '<i class="fas fa-lock-open"></i> ' : '<i class="fas fa-lock"></i> ')) + esc(w.label) + '</span>';
        return statusPill + ' ' + typePill + ' ' + windowPill;
      }
      
      var due = dueOf(it, 'assignment');
      if (c.total && c.graded === c.total) return pill('b-confirmed', 'All graded', 'fa-circle-check');
      if (due && due.getTime() < Date.now() && c.submitted < c.total) return pill('b-declined', 'Overdue', 'fa-triangle-exclamation');
      if (c.submitted > c.graded) return pill('b-pending', (c.submitted - c.graded) + ' to grade', 'fa-inbox');
      return pill('b-plain', 'Open');
    }

    function canEdit(it) { return isAdmin; }

    // Admin-only. Rendered on EVERY assignment, classwork and exam row (and in the detail view): never conditional on state.
    function delBtnHtml(it) {
      return isAdmin ? '<button type="button" class="cr-btn sm danger" data-a="del" data-id="' + esc(it.id) + '" title="Removes it from tutors and students only" style="border-color:#E74C3C;color:#E74C3C;background:#fff;flex-shrink:0;white-space:nowrap"><i class="fas fa-trash"></i> ' + (it.isClasswork ? 'Withdraw' : 'Delete') + '</button>' : '';
    }

    function render() {
      S.screen = 'class';
      var c = S.cls, name = U.displayName(c);
      var pastCount = S.items.filter(isPast).length;
      if (S.view === 'past' && !pastCount) S.view = 'active';
      var ITEMS = S.items.filter(function (it) { return isPast(it) === (S.view === 'past'); });
      var topBtn;
      if (kind === 'exam') {
        topBtn = isAdmin ? '<button type="button" class="cr-btn primary" data-a="add-flat-exam"><i class="fas fa-plus"></i> New exam</button>' : '';
      } else {
        topBtn = (isAdmin && !S.monitoringOnly && !opts.audience) ? '<button type="button" class="cr-btn primary" data-a="add-topic"><i class="fas fa-plus"></i> Add Topic</button>' : '';
      }
      var h = '<div class="cr-crumb"><a data-a="back">' + title + '</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(name) + ' \u2014 Year ' + esc(c.year) + '</span></div>' +
        '<div class="cr-bar"><div><h3>' + esc(name) + ' \u2014 Year ' + esc(c.year) + '</h3><div class="cr-board-row">' + U.boardBadge(c) + '</div><div class="cr-sub">' + esc(U.ksShort(c.keyStage)) + ' \u00b7 ' + S.enrolled.length + ' enrolled student' + (S.enrolled.length === 1 ? '' : 's') + '</div>' + (isAdmin && !S.monitoringOnly && !opts.audience ? '<div class="cr-note" style="margin-top:.25rem">Prepared work reaches students only when you post it: Classroom \u2192 Publish.</div>' : '') + '</div>' +
        topBtn + '</div>' +
        '<div class="cr-tabs"><button type="button" class="cr-btn ' + (S.view === 'active' ? 'on' : '') + '" data-a="view" data-v="active"><i class="fas fa-inbox"></i> Current</button>' +
        '<button type="button" class="cr-btn ' + (S.view === 'past' ? 'on' : '') + '" data-a="view" data-v="past"><i class="fas fa-box-archive"></i> Past Work (' + pastCount + ')</button></div>' +
        (S.view === 'past' ? '<div class="cr-note" style="margin-bottom:.6rem">Past Work holds only work that every student has handed in and that has been fully graded.' + (isAdmin ? ' Use the bin button to wipe an item completely \u2014 tutors and students will no longer see it.' : '') + '</div>' : '');

      if (kind === 'exam') {
        if (!ITEMS.length) {
          h += '<div class="cr-panel"><div class="cr-empty">' + (S.view === 'past' ? 'Nothing in Past Work yet.' : isAdmin
            ? 'No exams in this subject yet. Click \u201cNew exam\u201d to create a Midterm or End-of-Term paper.'
            : 'No exams posted for this subject yet. The Studio Desk sets exams — check back soon.') + '</div></div>';
        } else {
          h += '<div class="cr-panel"><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Title</th><th>Type</th><th>Exam date</th><th>Submissions by</th><th>Students</th><th></th></tr></thead><tbody>';
          ITEMS.forEach(function (it) {
            var cnt = counts(it);
            var examDate = it.examDate ? U.fmtDateTime(U.toDate(it.examDate)) : '—';
            var deadline = it.submissionDeadline ? U.fmtDateTime(U.toDate(it.submissionDeadline)) : '—';
            var adminControls = isAdmin || canEdit(it)
              ? (canEdit(it) ? '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + esc(it.id) + '"><i class="fas fa-pen"></i> Edit</button>' : '') +
                (isAdmin
                  ? (it.status === 'Published'
                      ? '<button type="button" class="cr-btn sm" data-a="close-exam" data-id="' + esc(it.id) + '"><i class="fas fa-lock"></i> Close</button>'
                      : '<button type="button" class="cr-btn sm" data-a="publish-exam" data-id="' + esc(it.id) + '"><i class="fas fa-upload"></i> Mark ready</button>') +
                    (it.submissionsOpen === true
                      ? '<button type="button" class="cr-btn sm" data-a="close-window" data-id="' + esc(it.id) + '"><i class="fas fa-lock"></i> Close submissions</button>'
                      : '<button type="button" class="cr-btn sm" data-a="open-window" data-id="' + esc(it.id) + '"><i class="fas fa-lock-open"></i> Open submissions</button>')
                  : '') +
                ''
              : '';
            h += '<tr>' +
              '<td><b>' + esc(it.title || 'Exam') + '</b>' + (it.tutorName ? '<div class="cr-note">' + esc(it.tutorName) + '</div>' : '') + '<div class="wk-chips" style="margin-top:.25rem">' + audChips(it) + '</div></td>' +
              '<td>' + pill('b-plain', it.examType || '—') + '</td>' +
              '<td>' + esc(examDate) + '</td>' +
              '<td>' + esc(deadline) + '</td>' +
              '<td><span class="wk-chips"><span class="wk-chip"><i class="fas fa-users"></i> ' + cnt.total + '</span><span class="wk-chip"><i class="fas fa-inbox"></i> ' + cnt.submitted + '</span><span class="wk-chip"><i class="fas fa-circle-check"></i> ' + cnt.graded + '</span></span></td>' +
              '<td><div class="cr-actions">' +
                '<button type="button" class="cr-btn sm primary" data-a="detail" data-id="' + esc(it.id) + '"><i class="fas fa-eye"></i> Open</button>' +
                adminControls +
                delBtnHtml(it) +
                '<span style="align-self:center; margin-left:.4rem;">' + itemPill(it) + '</span>' +
              '</div></td>' +
            '</tr>';
          });
          h += '</tbody></table></div></div>';
        }
      } else {
        if (!S.topics.length) h += '<div class="cr-panel"><div class="cr-empty">' + (isAdmin && !S.monitoringOnly && !opts.audience
          ? 'No topics yet. Add a topic, then add assignments inside it.'
          : 'No topics have been added to this classroom yet. The Studio Desk manages topics — check back soon.') + '</div></div>';
        S.topics.forEach(function (t) {
          var rows = ITEMS.filter(function (x) { return x.tid === t.id; }).sort(function (a, b) {
            var da = dueOf(a, 'assignment'), db2 = dueOf(b, 'assignment');
            return (da ? da.getTime() : 0) - (db2 ? db2.getTime() : 0);
          });
          if (S.view === 'past' && !rows.length) return;
          var open = !S.collapsed[t.id];
          var topicActions = (isAdmin && !S.monitoringOnly && !opts.audience) ? '<div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="add-assignment" data-id="' + esc(t.id) + '"><i class="fas fa-plus"></i> Prepare assignment</button></div>' : '';
          h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t" data-a="toggle" data-id="' + esc(t.id) + '"><i class="fas fa-chevron-' + (open ? 'down' : 'right') + '" style="font-size:.7rem;margin-right:.4rem"></i>' +
            esc(t.title) + '<small>' + rows.length + ' assignment' + (rows.length === 1 ? '' : 's') + '</small></span>' +
            topicActions + '</div>';
          if (open) {
            if (!rows.length) h += '<div class="cr-empty">' + (isAdmin && !S.monitoringOnly && !opts.audience ? 'No assignments in this topic yet. Use \u201cPrepare assignment\u201d above.' : 'No assignments posted to this audience yet.') + '</div>';
            rows.forEach(function (it) {
              var cnt = counts(it), due = dueOf(it, 'assignment');
              var isLesson = it.isClasswork === true;
              var icon = isLesson ? 'fa-book-open' : 'fa-clipboard-check';
              var typeLabel = isLesson ? ' · Classwork' : '';
              h += '<div class="cr-lesson"><span class="wk-ic"><i class="fas ' + icon + '"></i></span>' +
                '<span class="tt" data-a="detail" data-id="' + esc(it.id) + '" style="cursor:pointer">' + esc(it.title) + '<small>' + (due ? 'Due: ' + esc(U.fmtDateTime(due)) : typeLabel) + (it.tutorName ? ' \u00b7 ' + esc(it.tutorName) : '') + '</small></span>' +
                '<span class="wk-chips" title="Posted to">' + audChips(it) + '</span>' +
                '<span class="wk-chips"><span class="wk-chip"><i class="fas fa-users"></i> ' + cnt.total + '</span><span class="wk-chip"><i class="fas fa-inbox"></i> ' + cnt.submitted + '</span><span class="wk-chip"><i class="fas fa-circle-check"></i> ' + cnt.graded + '</span></span>' +
                itemPill(it) +
                '<div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="detail" data-id="' + esc(it.id) + '"><i class="fas fa-eye"></i> Open</button>' +
                (!isAdmin && !isLesson ? '<button type="button" class="cr-btn sm" data-a="release" data-id="' + esc(it.id) + '"><i class="fas fa-share-from-square"></i> Release to my students</button>' : '') +
                (canEdit(it) && !isLesson ? '<button type="button" class="cr-btn sm" data-a="edit" data-id="' + esc(it.id) + '"><i class="fas fa-pen"></i></button>' : '') +
                delBtnHtml(it) + '</div></div>';
            });
          }
          h += '</div>';
        });
      }
      root.innerHTML = h;
    }

    async function openDetail(it) {
      var m = U.openModal({ title: it.title, wide: true });
      m.foot.innerHTML = (isAdmin ? '<button type="button" class="cr-btn danger" data-a="del-here" style="margin-right:auto;border-color:#E74C3C;color:#E74C3C;background:#fff"><i class="fas fa-trash"></i> ' + (it.isClasswork ? 'Withdraw' : 'Delete') + '</button>' : '') +
        '<button type="button" class="cr-btn" data-a="close">Close</button>';
      m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };
      var delHere = m.foot.querySelector('[data-a="del-here"]');
      if (delHere) delHere.onclick = async function () { var ok = await deleteItem(it); if (ok) m.close(); };
      async function paint() {
        m.body.innerHTML = '<div class="cr-empty">Loading\u2026</div>';
        var subs = {};
        try {
          if (kind === 'exam') {
            var sn = await flatExamSubmissionsRef(it.cid, it.id).get();
            sn.docs.forEach(function (d) { subs[d.id] = Object.assign({ id: d.id }, d.data()); });
          } else {
            var k = it.isClasswork ? 'lesson' : 'assignment';
            var sn2 = await coll(it.cid, it.tid, k).doc(it.id).collection('submissions').get();
            sn2.docs.forEach(function (d) { subs[d.id] = Object.assign({ id: d.id }, d.data()); });
          }
        } catch (e) { m.body.innerHTML = '<div class="cr-empty">Could not load: ' + esc(e.message || e) + '</div>'; return; }

        var aud = audienceOf(it, S.enrolled);
        var head = '<div style="margin-bottom:.8rem">' +
          '<div class="cr-note"><b>' + esc(it.subjectName || '') + '</b>' +
            (kind === 'exam' ? ' \u00b7 ' + esc(it.examType || '') : ' \u00b7 ' + esc(it.topicTitle || '')) + '<br>' +
            (kind === 'exam'
              ? 'Exam date: ' + esc(it.examDate ? U.fmtDateTime(U.toDate(it.examDate)) : '—') + '<br>' +
                'Submissions by: ' + esc(it.submissionDeadline ? U.fmtDateTime(U.toDate(it.submissionDeadline)) : '—') + '<br>' +
                windowState(it).label
              : (it.dueAt ? 'Deadline: ' + esc(U.fmtDateTime(U.toDate(it.dueAt))) : 'No deadline')) +
          '</div>' +
          '<div class="wk-chips" style="margin-top:.5rem">' + itemPill(it) +
            (kind === 'exam' && it.examPdfUrl ? '<a class="cr-btn sm" href="' + esc(it.examPdfUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pdf"></i> ' + esc(it.examPdfName || 'Exam PDF') + '</a>' : '') +
            (!it.isClasswork && it.attachedPdfUrl ? '<a class="cr-btn sm" href="' + esc(it.attachedPdfUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pdf"></i> ' + esc(it.attachedPdfName || 'Attached PDF') + '</a>' : '') +
            ((isAdmin && !it.isClasswork) ? '<button type="button" class="cr-btn sm" data-a="grant"><i class="fas fa-user-shield"></i> Grant grading rights</button>' : '') +
          '</div>' +
          (it.requirements ? '<div class="wk-box" style="margin-top:.6rem">' + esc(it.requirements) + '</div>' : '') +
          (it.description && !it.isClasswork ? '<div class="wk-box" style="margin-top:.6rem">' + esc(it.description) + '</div>' : '') +
        '</div>';

        var rows = aud.map(function (s) {
          var sub = subs[s.id] || null;
          var st = workState(it, sub, kind);
          var canGrade = sub && sub.status !== 'In progress';
          return '<tr>' +
            '<td><b>' + esc(s.name || s.email || s.id) + '</b></td>' +
            '<td>' + pill(st.cls, st.text, st.icon) + '</td>' +
            '<td>' + (sub && (sub.submittedAt || sub.updatedAt) ? esc(U.fmtDateTime(sub.submittedAt || sub.updatedAt)) : '—') + '</td>' +
            '<td>' +
              (sub && sub.fileUrl ? '<a class="cr-btn sm" href="' + esc(sub.fileUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-file"></i> File</a>' : '') +
              (sub && sub.gradedFileUrl ? '<a class="cr-btn sm" href="' + esc(sub.gradedFileUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-download"></i> Graded</a>' : '') +
              (canGrade
                ? (kind === 'exam'
                    ? '<button type="button" class="cr-btn sm primary" data-a="grade-flat" data-s="' + esc(s.id) + '"><i class="fas fa-pen-nib"></i> ' + (sub.status === 'Graded' ? 'Review' : 'Grade') + '</button>'
                    : (global.InkGrader
                        ? '<button type="button" class="cr-btn sm primary" data-a="grade-ink" data-s="' + esc(s.id) + '"><i class="fas fa-pen-nib"></i> ' + (sub.status === 'Graded' ? 'Review' : 'Grade') + '</button>'
                        : ''))
                : '') +
            '</td>' +
          '</tr>';
        }).join('');

        m.body.innerHTML = head + (aud.length
          ? '<div class="cr-table-wrap"><table class="cr-table wk-tbl" style="min-width:560px"><thead><tr><th>Student</th><th>State</th><th>Handed in</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<div class="cr-empty">No students are assigned to this item.</div>');

        var gb = m.body.querySelector('[data-a="grant"]'); if (gb) gb.onclick = function () { openGrant(it); };

        Array.prototype.forEach.call(m.body.querySelectorAll('[data-a="grade-flat"]'), function (b) {
          b.onclick = function () {
            var sid = b.dataset.s, sub = subs[sid], stu = aud.filter(function (x) { return x.id === sid; })[0] || {};
            openGradeFlatExamInk({
              cid: it.cid, exam: it, student: Object.assign({ id: sid }, stu), sub: sub, user: user,
              onDone: async function () { await refresh(); paint(); }
            });
          };
        });

        Array.prototype.forEach.call(m.body.querySelectorAll('[data-a="grade-ink"]'), function (b) {
          b.onclick = function () {
            var sid = b.dataset.s, sub = subs[sid], stu = aud.filter(function (x) { return x.id === sid; })[0] || {};
            if (!global.InkGrader) { alert('The grading workspace did not load. Refresh the page and try again.'); return; }
            
            var col = it.isClasswork ? 'lessons' : 'assignments';
            global.InkGrader.open({
              docRef: U.clsRef(it.cid).collection('topics').doc(it.tid).collection(col).doc(it.id).collection('submissions').doc(sid),
              data: Object.assign({ studentName: stu.name || sub.studentName }, sub), item: it, cid: it.cid, itemId: it.id, user: user, kind: it.isClasswork ? 'lesson' : 'assignment',
              onDone: async function () { await refresh(); paint(); }
            });
          };
        });
      }
      paint();
    }

    function openGrant(it) {
      var m = U.openModal({ title: 'Grant grading rights' });
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.7rem">Choose a tutor who may see and mark this ' + (kind === 'exam' ? 'exam' : 'assignment') + '. It then appears in their \u201cGranted to me\u201d list.</div><div class="cr-field"><label>Tutor</label><select id="gTutor"><option value="">Loading\u2026</option></select></div>';
      m.foot.innerHTML = '<span class="cr-err" id="gErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-user-shield"></i> Grant</button>';
      var tsel = m.body.querySelector('#gTutor'), tut = {};
      getAllTutorAccounts().then(function (snap) {
        tsel.innerHTML = '<option value="">Choose a tutor</option>' + snap.docs.map(function (d) { tut[d.id] = d.data(); return '<option value="' + esc(d.id) + '">' + esc(d.data().name || d.data().email) + '</option>'; }).join('');
      });
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="go"]').onclick = async function () {
        var id = tsel.value; if (!id) { m.foot.querySelector('#gErr').textContent = 'Choose a tutor.'; return; }
        try {
          var type = kind === 'exam' ? 'exam' : 'homework';
          await grantGradingRight(type, it.id, id, tut[id].name || '', user.uid);
          var taskPath = (kind === 'exam' && it.flat)
            ? 'classrooms/' + it.cid + '/exams/' + it.id
            : 'classrooms/' + it.cid + '/topics/' + it.tid + '/' + collName(kind) + '/' + it.id;
          await db.collection('gradingGrants').doc(gradingGrantId(type, it.id, id)).update({ taskPath: taskPath, taskTitle: it.title });
          m.close(); alert('Grading rights granted.');
        } catch (e) { m.foot.querySelector('#gErr').textContent = e.message || String(e); }
      };
    }

    function openAddClassroom() {
      if (!isAdmin) return;
      var m = U.openModal({ title: 'Add classroom' });
      m.body.innerHTML = '<div class="cr-field"><label>Key Stage</label><select id="nKs">' + U.KEY_STAGES.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-row2"><div class="cr-field"><label>Year</label><select id="nYear"></select></div><div class="cr-field"><label>Subject</label><select id="nSub"></select></div></div>' +
        '<div class="cr-field"><label>Exam board</label><select id="nBoard">' + U.boardOptionsHtml(U.DEFAULT_BOARD, false) + '</select></div>' +
        '<div class="cr-note">A classroom is one subject for one Year on one exam board.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="nErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="create">Open classroom</button>';
      var ks = m.body.querySelector('#nKs'), yr = m.body.querySelector('#nYear'), sb = m.body.querySelector('#nSub');
      function fill() {
        yr.innerHTML = lmzYearsForKeyStage(ks.value).map(function (y) { return '<option value="' + y + '">Year ' + y + '</option>'; }).join('');
        sb.innerHTML = lmzSubjectsForKeyStage(ks.value).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
      }
      ks.onchange = fill; fill();
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="create"]').onclick = async function () {
        this.disabled = true;
        try { var c = await U.ensureClassroom(sb.value, ks.value, yr.value, user, m.body.querySelector('#nBoard').value); m.close(true); S.classrooms = null; await openClass(c.id); }
        catch (e) { m.foot.querySelector('#nErr').textContent = 'Could not create: ' + (e.message || e); this.disabled = false; }
      };
    }

    function openTopicModal() {
      if (!isAdmin) return;
      var m = U.openModal({ title: 'Add topic' });
      m.body.innerHTML = '<div class="cr-field"><label>Topic title</label><input type="text" id="tT" maxlength="200" placeholder="e.g. Algebra"></div>';
      m.foot.innerHTML = '<span class="cr-err" id="tE"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="save">Add topic</button>';
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="save"]').onclick = async function () {
        var t = m.body.querySelector('#tT').value.trim(); if (!t) { m.foot.querySelector('#tE').textContent = 'Enter a title.'; return; }
        var max = S.topics.reduce(function (a, x) { return Math.max(a, x.order || 0); }, 0);
        try {
          await U.clsRef(S.cls.id).collection('topics').add({ title: t, description: '', order: max + 1, createdAt: FV().serverTimestamp(), createdBy: user.uid });
          m.close(true); await refresh();
        } catch (e) { m.foot.querySelector('#tE').textContent = e.message || String(e); }
      };
    }

    // Delete from Homework / Exam Management removes ONLY what was pushed out: the posted
    // homework or exam, its attached text/files, and the hand-ins. It never touches the
    // classroom, its topics or the lesson notes. Classwork IS a lesson (the notes), so for
    // classwork this only withdraws it from tutors and students and keeps the notes.
    async function deleteItem(it) {
      if (!isAdmin) { alert('Only the Studio Desk (admin) can delete work.'); return false; }
      var isFlat = kind === 'exam';
      var isLesson = !isFlat && it.isClasswork === true;
      var k = isFlat ? 'exam' : (isLesson ? 'lesson' : 'assignment');
      var itemRef = isFlat ? flatExamRef(it.cid, it.id) : coll(it.cid, it.tid, k).doc(it.id);
      var subCol = isFlat ? flatExamSubmissionsRef(it.cid, it.id) : itemRef.collection('submissions');
      var cnt = Object.keys(S.subs[it.id] || {}).length;
      var handins = cnt ? (cnt + ' handed-in piece' + (cnt === 1 ? '' : 's') + ' of student work and their graded copies') : 'any student hand-ins';
      var msg = isLesson
        ? 'WITHDRAW \u201c' + it.title + '\u201d from tutors and students?\n\nIt disappears for tutors, students and parents, and ' + handins + ' are removed.\n\nYour lesson, its notes and files, the topic and the classroom are NOT deleted. You can post it again from Classroom \u2192 Publish.'
        : 'DELETE \u201c' + it.title + '\u201d from tutors and students?\n\nThis removes the posted ' + (isFlat ? 'exam' : 'homework') + ', the text and files attached to it, and ' + handins + '.\n\nYour classroom, topics and lesson notes are NOT touched.\n\nThis cannot be undone.';
      if (!await PaisleyUI.confirm(msg)) return false;
      try {
        // Only files that live in THIS item's own folders may be deleted. Anything else (for
        // example a path shared with lesson notes) is skipped on purpose.
        var subj = (S.cls && S.cls.subjectId) || String((String(it.cid).match(/^(.*?)_y\d+/) || [])[1] || '');
        var own = [
          'classroom-files/' + subj + '/' + it.cid + '/' + (isFlat ? 'exams/' : '') + it.id + '/',
          'graded-submissions/' + subj + '/' + it.cid + '/' + it.id + '/'
        ];
        function ownFile(p) { p = String(p || ''); return !!subj && own.some(function (pre) { return p.indexOf(pre) === 0; }); }
        var sn = await subCol.get();
        var paths = [];
        sn.docs.forEach(function (d) {
          var x = d.data() || {};
          if (ownFile(x.storagePath)) paths.push(x.storagePath);
          if (ownFile(x.gradedStoragePath)) paths.push(x.gradedStoragePath);
        });
        if (!isLesson) {
          if (ownFile(it.attachedPdfPath)) paths.push(it.attachedPdfPath);
          if (ownFile(it.examPdfPath)) paths.push(it.examPdfPath);
          (it.attachments || []).forEach(function (a) { if (a && ownFile(a.storagePath)) paths.push(a.storagePath); });
        }
        for (var i = 0; i < sn.docs.length; i += 400) {
          var b = db.batch();
          sn.docs.slice(i, i + 400).forEach(function (d) { b.delete(d.ref); });
          await b.commit();
        }
        if (isLesson) {
          // Keep the lesson and its notes; just stop it reaching anyone.
          await itemRef.update({
            audiences: { online: false, remote: false, tuition: false, tutors: false },
            releasedTo: [], releasedParents: [],
            withdrawnAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await itemRef.delete();
        }
        // Bell notifications that point at this item (students, parents, tutors).
        try {
          var ids = [it.cid + '/' + (it.tid || '') + '/' + it.id, it.cid + '/' + it.id];
          for (var q = 0; q < ids.length; q++) {
            var ns = await db.collection('personalNotifications').where('relatedEntityId', '==', ids[q]).get();
            for (var j = 0; j < ns.docs.length; j += 400) {
              var nb = db.batch();
              ns.docs.slice(j, j + 400).forEach(function (d) { nb.delete(d.ref); });
              await nb.commit();
            }
          }
        } catch (ne) { console.warn('notification cleanup skipped:', ne && (ne.code || ne.message)); }
        await Promise.all(paths.map(function (pth) { return firebase.storage().ref(pth).delete().catch(function () {}); }));
        S.view = 'active';
        await refresh();
        return true;
      } catch (e) { alert('Could not ' + (isLesson ? 'withdraw' : 'delete') + ': ' + (e.message || e)); return false; }
    }

    async function renderLegacy() {
      if (!isAdmin) return;
      var host = root.querySelector('#wkLegacy');
      host.innerHTML = '<div class="cr-panel"><h4 style="margin:0 0 .4rem;color:var(--brand-deep,#245F5A)">Move legacy ' + (kind === 'exam' ? 'exams' : 'homework') + ' into the classroom tree</h4>' +
        '<div class="cr-note" style="margin-bottom:.7rem">The old lists below stay readable and are never deleted. The migration copies homework, exams and submissions under \u201cEarlier homework and exams\u201d. Running it again is safe: nothing already moved is touched, and no one is emailed.</div>' +
        '<div class="cr-actions"><button type="button" class="cr-btn" data-a="mig" data-dry="1"><i class="fas fa-magnifying-glass"></i> Preview (no changes)</button>' +
        '<button type="button" class="cr-btn primary" data-a="mig"><i class="fas fa-right-left"></i> Run migration</button></div><pre class="wk-box wk-mono" id="wkMigOut" style="display:none;margin-top:.7rem"></pre></div>' +
        '<div class="cr-panel"><h4 style="margin:0 0 .6rem;color:var(--brand-deep,#245F5A)">Legacy ' + (kind === 'exam' ? 'exams' : 'homework') + ' (read-only)</h4><div id="wkLegacyTbl"><div class="cr-empty">Loading\u2026</div></div></div>';
      try {
        var snap = await db.collection(kind === 'exam' ? 'exams' : 'homework').get();
        var rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        host.querySelector('#wkLegacyTbl').innerHTML = rows.length
          ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Title</th><th>Subject</th><th>Key Stage</th><th>' + (kind === 'exam' ? 'Type' : 'Due') + '</th><th>Status</th></tr></thead><tbody>' +
              rows.map(function (r) {
                return '<tr><td><b>' + esc(r.title || '') + '</b></td><td>' + esc(r.subject || '') + '</td><td>' + esc(U.ksShort(r.keyStage)) + '</td><td>' +
                  esc(kind === 'exam' ? (r.examMode === 'link' ? 'External' : 'Questions') : (r.dueDate || '')) + '</td><td>' + pill('b-plain', r.status || 'Posted') + '</td></tr>';
              }).join('') +
            '</tbody></table></div>'
          : '<div class="cr-empty">Nothing in the legacy list.</div>';
      } catch (e) {
        host.querySelector('#wkLegacyTbl').innerHTML = '<div class="cr-empty">Could not load: ' + esc(e.message || e) + '</div>';
      }
    }
    async function runMigration(dry, btn) {
      if (!isAdmin) return;
      var out = root.querySelector('#wkMigOut'); out.style.display = ''; out.textContent = 'Working\u2026';
      btn.disabled = true;
      try {
        var res = await firebase.functions().httpsCallable('migrateLegacyHomeworkAndExams')({ dryRun: !!dry });
        var r = res.data;
        out.textContent = (r.dryRun ? 'PREVIEW (nothing written)\n' : 'DONE\n') +
          'Homework:    ' + r.homework.created + ' to create, ' + r.homework.existing + ' already moved, ' + r.homework.skipped + ' skipped\n' +
          'Exams:       ' + r.exams.created + ' to create, ' + r.exams.existing + ' already moved, ' + r.exams.skipped + ' skipped\n' +
          'Submissions: ' + r.submissions.created + ' to create, ' + r.submissions.existing + ' already moved\n' +
          'Classrooms created: ' + r.classroomsCreated + '\n' + (r.notes.length ? '\nNotes:\n- ' + r.notes.join('\n- ') : '');
      } catch (e) { out.textContent = 'Failed: ' + (e.message || e); }
      btn.disabled = false;
    }

    function renderJobs() {
      if (!isAdmin) return;
      var jobs = [['reminder', 'Deadline reminder (24h)', 'fa-bell'], ['grace', 'Overdue + 48h extension notice', 'fa-hourglass-half'], ['report', 'Unattended Work Report', 'fa-clipboard-list'], ['exam', 'Exam paper to parents (48h)', 'fa-file-pen']];
      root.querySelector('#wkJobs').innerHTML = '<div class="cr-panel"><h4 style="margin:0 0 .4rem;color:var(--brand-deep,#245F5A)">Run an automation now</h4>' +
        '<div class="cr-note" style="margin-bottom:.7rem">These jobs run every hour on their own. Use these buttons to test. Each item is only ever processed once, so pressing a button twice is harmless.</div>' +
        '<div class="cr-actions">' + jobs.map(function (j) { return '<button type="button" class="cr-btn" data-a="job" data-j="' + j[0] + '"><i class="fas ' + j[2] + '"></i> ' + j[1] + '</button>'; }).join('') + '</div>' +
        '<pre class="wk-box wk-mono" id="wkJobOut" style="display:none;margin-top:.7rem"></pre></div>';
    }
    async function runJob(j, btn) {
      if (!isAdmin) return;
      var out = root.querySelector('#wkJobOut'); out.style.display = ''; out.textContent = 'Running\u2026'; btn.disabled = true;
      try { var r = await firebase.functions().httpsCallable('runDeadlineJob')({ job: j }); out.textContent = JSON.stringify(r.data, null, 2); }
      catch (e) { out.textContent = 'Failed: ' + (e.message || e); }
      btn.disabled = false;
    }

    root.addEventListener('click', async function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      var a = el.dataset.a, id = el.dataset.id;
      var item = id ? S.items.filter(function (x) { return x.id === id; })[0] : null;
      try {
        if (a === 'open') openClass(id);
        else if (a === 'back') { S.classrooms = null; loadClassrooms(); }
        else if (a === 'tab') { S.tab = el.dataset.v; renderList(); }
        else if (a === 'view') { S.view = el.dataset.v; render(); }
        else if (a === 'add-class') { if (isAdmin) openAddClassroom(); }
        else if (a === 'add-topic') { if (isAdmin) openTopicModal(); }
        else if (a === 'toggle') { S.collapsed[id] = !S.collapsed[id]; render(); }
        else if (a === 'detail' && item) openDetail(item);
        else if (a === 'open-granted') {
          var g = S.granted[Number(el.dataset.i)];
          if (g) {
            var c = await U.clsRef(g.cid).get();
            S.cls = Object.assign({ id: c.id }, c.data());
            await reload(); render();
            var it2 = S.items.filter(function (x) { return x.id === g.id; })[0] || g;
            openDetail(it2);
          }
        }
        else if (a === 'release' && item) global.WorkUI.openRelease(item, user);
        else if (a === 'add-assignment') {
          if (!isAdmin) { alert('Assignments are prepared by the Studio Desk.'); return; }
          openPostAssignment({ cls: S.cls, topics: S.topics, topicId: id, user: user, afterSave: refresh });
        }
        else if (a === 'add-flat-exam') { if (isAdmin) openCreateExam({ cls: S.cls, user: user, afterSave: refresh }); }
        else if (a === 'edit' && item) {
          if (!canEdit(item)) { alert('Only the Studio Desk can edit prepared work.'); return; }
          if (kind === 'exam') openCreateExam({ cls: S.cls, existing: item, user: user, afterSave: refresh });
          else openPostAssignment({ cls: S.cls, topics: S.topics, existing: item, user: user, afterSave: refresh });
        }
        else if (a === 'del' && item) deleteItem(item);
        else if (a === 'publish-exam' && item) { if (isAdmin) { await setFlatExamStatus(item.cid, item.id, { status: 'Published' }); await refresh(); } }
        else if (a === 'close-exam' && item) { if (isAdmin) { await setFlatExamStatus(item.cid, item.id, { status: 'Closed' }); await refresh(); } }
        else if (a === 'open-window' && item) { if (isAdmin) { await setFlatExamStatus(item.cid, item.id, { submissionsOpen: true }); await refresh(); } }
        else if (a === 'close-window' && item) { if (isAdmin) { await setFlatExamStatus(item.cid, item.id, { submissionsOpen: false }); await refresh(); } }
        else if (a === 'mig') { if (isAdmin) runMigration(el.dataset.dry === '1', el); }
        else if (a === 'job') { if (isAdmin) runJob(el.dataset.j, el); }
      } catch (err) { console.error(err); alert('Something went wrong: ' + (err.message || err)); }
    });
    root.addEventListener('change', function (e) {
      var f = e.target.dataset && e.target.dataset.f; if (!f) return;
      if (f === 'f-subject') S.filters.subject = e.target.value;
      if (f === 'f-ks') S.filters.ks = e.target.value;
      if (f === 'f-year') S.filters.year = e.target.value;
      if (f === 'f-board') S.filters.board = e.target.value;
      renderList();
    });

    // Live refresh: keeps statuses current without a page reload.
    var refreshing = false;
    async function smartRefresh() {
      if (refreshing || !root.isConnected || S.screen !== 'class' || !S.cls) return;
      refreshing = true;
      var y = window.scrollY;
      try { await reload(); render(); window.scrollTo(0, y); } catch (e) { /* keep the current view */ }
      refreshing = false;
    }
    if (window.ClassroomUI) window.ClassroomUI._refresh = smartRefresh;
    var pollTimer = setInterval(function () {
      if (!root.isConnected) { clearInterval(pollTimer); return; }
      if (document.hidden || document.querySelector('.cr-overlay, .pui-ov')) return;
      smartRefresh();
    }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !document.querySelector('.cr-overlay, .pui-ov')) smartRefresh(); });
    loadClassrooms();
    return { reload: loadClassrooms };
  }

  global.WorkUI = global.WorkUI || {};
  Object.assign(global.WorkUI, {
    mountManagement: mountManagement,
    openPostAssignment: openPostAssignment,
    openCreateExam: openCreateExam,
    openGradeFlatExamInk: openGradeFlatExamInk,
    openRelease: openRelease,
    _h: {
      U: U, esc: esc, pill: pill,
      coll: coll, collName: collName, subName: subName,
      flatExamsRef: flatExamsRef, flatExamRef: flatExamRef, flatExamSubmissionsRef: flatExamSubmissionsRef,
      workState: workState, dueOf: dueOf, fmtScore: fmtScore,
      windowState: windowState, isWindowOpen: isWindowOpen,
      loadEnrolled: loadEnrolled, uploadTo: uploadTo, cleanName: cleanName,
      injectStyle: injectStyle, audienceOf: audienceOf, effAudiences: effAudiences, studentAud: studentAud, studentSees: studentSees
    }
  });
})(window);