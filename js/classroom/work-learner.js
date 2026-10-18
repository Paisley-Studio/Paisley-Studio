/* =========================================================
   WORK UI (student + parent) — Paisley Studio
   -----------------------------------------------------------
   Student
     loadStudentWork / studentTopicRows / openStudentItem / openStudentLesson
         -> homework appears INSIDE classroom topics (unchanged)
         -> legacy (nested) exams appear INSIDE classroom topics
         -> NEW flat exams (classrooms/{cid}/exams/{eid}) appear
            in the Exams tab as soon as they are Published, whether
            or not the submission window is open yet. When the
            window opens the upload box appears; when it hasn't
            opened, the exam shows a "not open yet" note.
         -> lessons (Classwork) now allow students to upload a response.
     mountStudentHome(root, {kind:'homework'|'exams', uid, profile})
         -> the Homework / Exams nav tabs
   Parent (read-only; never writes)
     mountParentWork(root, {kind, child, filter})
========================================================= */
(function (global) {
  'use strict';
  var W = global.WorkUI;
  if (!W || !W._h) { console.error('work-learner.js needs work-helpers.js loaded first.'); return; }
  var H = W._h, U = H.U, esc = H.esc, pill = H.pill, coll = H.coll;
  var FV = function () { return firebase.firestore.FieldValue; };

  /* ---------------------------------------------------------
     INLINE loader
  --------------------------------------------------------- */
  function inlineLoaderHtml(msg) {
    return '<div class="wk-inline-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:3rem 1rem;">' +
      '<div style="width:42px;height:42px;border:4px solid rgba(38,51,49,.1);border-top-color:#55BFB3;border-radius:50%;animation:wk-spin .8s linear infinite"></div>' +
      '<div style="color:#245F5A;font-weight:700;font-size:.9rem">' + esc(msg || 'Loading…') + '</div></div>';
  }
  function ensureSpinKeyframe() {
    if (document.getElementById('wk-spin-keyframe')) return;
    var st = document.createElement('style');
    st.id = 'wk-spin-keyframe';
    st.textContent = '@keyframes wk-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------
     Data
  --------------------------------------------------------- */
  function audOf(profileOrChild) { return profileOrChild && profileOrChild.studentType === 'remote' ? 'remote' : 'online'; }
  function noDocs() { return { docs: [] }; }

  // loadStudentWork(cls, topics, uid, profile [, only])
  //   only (optional) = any of 'lessons' | 'assignments' | 'exams'. The Homework tab asks
  //   for just 'assignments', Exams for just 'exams', the login badge for just 'lessons';
  //   omit it to get everything (classroom home / class view).
  async function loadStudentWork(cls, topics, uid, profile, only) {
    var out = { assignments: [], exams: [], lessons: [] };
    var FLAG = 'audiences.' + audOf(profile);
    var want = { lessons: true, assignments: true, exams: true };
    if (only && only.length) { want = {}; only.forEach(function (k) { want[k] = true; }); }
    var tsig = topics.map(function (t) { return t.id; }).join(',');
    // Each section is cached for a short time (and de-duplicated while in flight),
    // so the badge count, Classroom, Homework and Exams share the same reads.
    function cached(section, extra, fn) {
      if (!U.memo) return fn();
      return U.memo('wk|' + section + '|' + cls.id + '|' + uid + '|' + audOf(profile) + '|' + extra, fn);
    }

    // ---- lessons (Classwork) ----
    async function loadLessons() {
      var res = [];
      await Promise.all(topics.map(async function (t) {
        var base = coll(cls.id, t.id, 'lesson');
        var qs = [];
        // Read what's published for me
        var a = base.where('status', '==', 'published').where(FLAG, '==', true);
        var b = base.where('releasedTo', 'array-contains', uid); // delivered by tutor
        var snaps = await Promise.all([a.get(), b.get().catch(noDocs)]);
        var seen = {};
        snaps.forEach(function (sn) { sn.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; qs.push(Object.assign({ id: d.id, tid: t.id, cid: cls.id }, d.data())); } }); });
        
        await Promise.all(qs.map(async function (it) {
          var d = await base.doc(it.id).collection('submissions').doc(uid).get().catch(function () { return null; });
          it.sub = d && d.exists ? Object.assign({ id: d.id }, d.data()) : null;
        }));
        res = res.concat(qs);
      }));
      return res;
    }

    // ---- homework ----
    async function loadAssignments() {
      var res = [];
      await Promise.all(topics.map(async function (t) {
        var base = coll(cls.id, t.id, 'assignment');
        var qs = [];
        var a = base.where('audience', '==', 'class').where(FLAG, '==', true);
        var b = base.where('recipients', 'array-contains', uid).where(FLAG, '==', true);
        var c = base.where('releasedTo', 'array-contains', uid);
        var snaps = await Promise.all([a.get(), b.get(), c.get().catch(noDocs)]);
        var seen = {};
        snaps.forEach(function (sn) { sn.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; qs.push(Object.assign({ id: d.id, tid: t.id, cid: cls.id }, d.data())); } }); });
        await Promise.all(qs.map(async function (it) {
          var d = await base.doc(it.id).collection('submissions').doc(uid).get().catch(function () { return null; });
          it.sub = d && d.exists ? Object.assign({ id: d.id }, d.data()) : null;
        }));
        res = res.concat(qs);
      }));
      return res;
    }

    // ---- legacy nested exams ----
    async function loadNestedExams(allAttemptsCache) {
      var res = [];
      await Promise.all(topics.map(async function (t) {
        var base = coll(cls.id, t.id, 'exam');
        var qs = [];
        var a = base.where('audience', '==', 'class').where('status', '==', 'Published').where(FLAG, '==', true);
        var b = base.where('recipients', 'array-contains', uid).where('status', '==', 'Published').where(FLAG, '==', true);
        var c = base.where('releasedTo', 'array-contains', uid).where('status', '==', 'Published');
        var snaps = await Promise.all([a.get(), b.get(), c.get().catch(noDocs)]);
        var seen = {};
        snaps.forEach(function (sn) { sn.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; qs.push(Object.assign({ id: d.id, tid: t.id, cid: cls.id, flat: false }, d.data())); } }); });
        await Promise.all(qs.map(async function (it) {
          if (it.examMode === 'ai') {
            if (allAttemptsCache.value === null) {
              allAttemptsCache.value = await db.collection('examAttempts').where('studentId', '==', uid).get()
                .then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); })
                .catch(function () { return []; });
            }
            it.sub = allAttemptsCache.value.filter(function (x) { return x.examId === it.legacyExamId; })[0] || null;
          } else {
            var d = await base.doc(it.id).collection('attempts').doc(uid).get().catch(function () { return null; });
            it.sub = d && d.exists ? Object.assign({ id: d.id }, d.data()) : null;
          }
        }));
        res = res.concat(qs);
      }));
      return res;
    }

    // ---- flat exams ----
    async function loadFlatExams() {
      var snap = await H.flatExamsRef(cls.id).where(FLAG, '==', true).where('status', '==', 'Published').get().catch(noDocs);
      var items = snap.docs.map(function (d) { return Object.assign({ id: d.id, cid: cls.id, flat: true }, d.data()); });
      var out = [];
      await Promise.all(items.map(async function (it) {
        var s = await H.flatExamSubmissionsRef(cls.id, it.id).doc(uid).get().catch(function () { return null; });
        it.sub = s && s.exists ? Object.assign({ id: s.id }, s.data()) : null;

        if (String(it.status || '') !== 'Published') return;
        out.push(it);
      }));
      return out;
    }

    // All requested sections run at the same time (they used to run one after another).
    var parts = await Promise.all([
      want.lessons     ? cached('lessons', tsig, loadLessons)      : [],
      want.assignments ? cached('assign',  tsig, loadAssignments)  : [],
      want.exams       ? cached('nested',  tsig, function () { return loadNestedExams({ value: null }); }) : [],
      want.exams       ? cached('flat',    '',   loadFlatExams)    : []
    ]);
    out.lessons = parts[0].slice();
    out.assignments = parts[1].slice();
    out.exams = parts[2].concat(parts[3]);
    return out;
  }

  function stateOf(it, kind) { return H.workState(it, it.sub || null, kind); }

  function rowHtml(it, kind, extraSmall) {
    var st = stateOf(it, kind);
    var due = kind === 'exam'
      ? (it.flat ? U.toDate(it.examDate) : H.dueOf(it, kind))
      : H.dueOf(it, kind);

    var mode = '';
    if (kind === 'exam') {
      if (it.flat) {
        mode = pill('b-plain', it.examType || 'Exam', 'fa-file-pen');
      } else {
        mode = it.examMode === 'pdf'
          ? pill('b-plain', 'PDF exam', 'fa-file-pdf')
          : it.examMode === 'link'
            ? pill('b-plain', 'External', 'fa-arrow-up-right-from-square')
            : pill('b-plain', 'Online exam', 'fa-shield-halved');
      }
    }

    return '<div class="cr-lesson student" data-a="work-open" data-k="' + kind +
        '" data-cid="' + esc(it.cid || '') +
        '" data-t="' + esc(it.tid || '') + '" data-id="' + esc(it.id) +
        '" data-flat="' + (it.flat ? '1' : '0') + '" tabindex="0" role="button">' +
      '<span class="wk-ic"><i class="fas ' + (kind === 'exam' ? 'fa-file-pen' : 'fa-clipboard-check') + '"></i></span>' +
      '<span class="tt">' + esc(it.title) + '<small>' +
        (extraSmall ? esc(extraSmall) + ' \u00b7 ' : '') +
        (due ? (kind === 'exam' ? 'Exam: ' : 'Due: ') + esc(U.fmtDateTime(due)) : '') +
      '</small></span>' +
      mode + pill(st.cls, st.text, st.icon) +
      '<i class="fas fa-chevron-right" style="font-size:.7rem;color:var(--muted,#5A6E6A)"></i></div>';
  }

  function studentTopicRows(work, topicId) {
    H.injectStyle();
    var rows = '';
    work.assignments.filter(function (x) { return x.tid === topicId; }).sort(sortDue('assignment')).forEach(function (x) { rows += rowHtml(x, 'assignment'); });
    work.exams.filter(function (x) { return !x.flat && x.tid === topicId; }).sort(sortDue('exam')).forEach(function (x) { rows += rowHtml(x, 'exam'); });
    return rows;
  }
  function sortDue(kind) {
    return function (a, b) {
      var da = kind === 'exam'
        ? (a.flat ? U.toDate(a.examDate) : H.dueOf(a, kind))
        : H.dueOf(a, kind);
      var db2 = kind === 'exam'
        ? (b.flat ? U.toDate(b.examDate) : H.dueOf(b, kind))
        : H.dueOf(b, kind);
      return (da ? da.getTime() : 0) - (db2 ? db2.getTime() : 0);
    };
  }

  /* ---------------------------------------------------------
     Student: open Homework / Exam item
  --------------------------------------------------------- */
  async function openStudentItem(o) {
    H.injectStyle();

    if (!o || !o.cid) {
      console.warn('openStudentItem: missing cid — cannot build a Firestore path.', o);
      alert('This item is no longer available. Please refresh the page.');
      return;
    }
    if (!o.id) {
      console.warn('openStudentItem: missing item id.', o);
      alert('This item is no longer available. Please refresh the page.');
      return;
    }
    var isFlatPrecheck = o.flat === true || o.flat === '1';
    if (!isFlatPrecheck && !o.tid) {
      console.warn('openStudentItem: missing tid for a non-flat item.', o);
      alert('This item is no longer available. Please refresh the page.');
      return;
    }

    var kind = o.kind === 'exam' ? 'exam' : 'assignment';
    var isFlat = isFlatPrecheck;
    var base, submissionCollRef;
    if (isFlat) {
      base = H.flatExamRef(o.cid, o.id);
      submissionCollRef = H.flatExamSubmissionsRef(o.cid, o.id);
    } else {
      base = coll(o.cid, o.tid, kind).doc(o.id);
      submissionCollRef = coll(o.cid, o.tid, kind).doc(o.id).collection(H.subName(kind));
    }

    var m = U.openModal({ title: 'Loading\u2026', wide: true });
    m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="close">Close</button>';
    m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };

    var it, sub = null;
    async function load() {
      var d = await base.get();
      if (!d.exists) throw new Error('This item is no longer available.');
      it = Object.assign({ id: d.id, tid: o.tid, cid: o.cid, flat: isFlat }, d.data());
      if (isFlat) {
        var s = await submissionCollRef.doc(o.uid).get().catch(function () { return null; });
        sub = s && s.exists ? Object.assign({ id: s.id }, s.data()) : null;
      } else if (kind === 'exam' && it.examMode === 'ai') {
        var q = await db.collection('examAttempts').where('studentId', '==', o.uid).get();
        var hit = q.docs.filter(function (x) { return x.data().examId === it.legacyExamId; })[0];
        sub = hit ? Object.assign({ id: hit.id }, hit.data()) : null;
      } else {
        var s2 = await submissionCollRef.doc(o.uid).get();
        sub = s2.exists ? Object.assign({ id: s2.id }, s2.data()) : null;
      }
    }

    async function paint() {
      try { await load(); } catch (e) { m.body.innerHTML = '<div class="cr-empty">' + esc(e.message || e) + '</div>'; return; }
      m.el.querySelector('.cr-modal-head h3').textContent = it.title;

      var st = H.workState(it, sub, kind);
      var due = isFlat ? U.toDate(it.examDate) : H.dueOf(it, kind);

      var graded = sub && sub.status === 'Graded' && sub.released !== false;

      var h = '<div class="wk-chips" style="margin-bottom:.8rem">' +
        pill(st.cls, st.text, st.icon) +
        '<span class="wk-chip"><i class="fas fa-book"></i> ' + esc(it.subjectName || it.subject || '') + '</span>' +
        (it.flat
          ? '<span class="wk-chip"><i class="fas fa-tag"></i> ' + esc(it.examType || 'Exam') + '</span>'
          : (it.topicTitle ? '<span class="wk-chip"><i class="fas fa-layer-group"></i> ' + esc(it.topicTitle) + '</span>' : '')) +
        (due ? '<span class="wk-chip"><i class="fas fa-calendar-day"></i> ' + (kind === 'exam' ? 'Exam: ' : 'Due: ') + esc(U.fmtDateTime(due)) + '</span>' : '') +
      '</div>';

      if (it.requirements) h += '<div class="wk-box">' + esc(it.requirements) + '</div>';
      if (it.description)    h += '<div class="wk-box">' + esc(it.description) + '</div>';

      if (!isFlat && kind === 'exam' && it.examMode === 'ai') {
        var done = sub && sub.status && sub.status !== 'In progress';
        h += '<div class="wk-box"><b>Online exam</b><br>Duration: ' + esc(it.duration || 30) + ' minutes \u00b7 ' + esc((it.questions || []).length) + ' questions.<br>' +
          'The exam opens full screen and your activity is monitored. Leaving the screen is recorded.</div>';
        if (sub && sub.status === 'Suspended') h += '<div class="cr-err">This attempt was suspended. Please contact your tutor.</div>';
        else if (done) h += '<div class="cr-note">You have completed this exam. Your result appears in My Results once it is marked.</div>';
        else h += '<a class="cr-btn primary" href="exam.html?id=' + encodeURIComponent(it.legacyExamId) + '" style="text-decoration:none"><i class="fas fa-play"></i> ' + (sub ? 'Resume exam' : 'Start exam') + '</a>';
      }
      else if (!isFlat && kind === 'exam' && it.examMode === 'link') {
        h += '<a class="cr-btn primary" href="' + esc(U.safeUrl(it.externalURL)) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Open external exam</a>';
      }
      else {
        if (!isFlat && it.attachedPdfUrl) {
          h += '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(it.attachedPdfName || 'Attached PDF') +
            '<small>Download the instructions</small></span>' +
            '<a class="cr-btn sm primary" href="' + esc(it.attachedPdfUrl) + '" target="_blank" rel="noopener noreferrer" download><i class="fas fa-download"></i> Download</a></div>';
        }
        if (isFlat && it.examPdfUrl) {
          h += '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(it.examPdfName || 'Exam paper') +
            '<small>Your parent has the printable paper. Ask them for your printed copy — you cannot download the paper here.</small></span></div>';
        }

        if (graded) {
          var headline = isFlat ? 'Results released' : 'Result:';
          h += '<div class="wk-box"><b>' + headline + (isFlat ? '' : ' ' + esc(H.fmtScore(sub) || 'Graded')) + '</b>' +
            (isFlat && H.fmtScore(sub) ? ' <span style="color:var(--brand-deep);font-weight:700;">' + esc(H.fmtScore(sub)) + '</span>' : '') +
            (sub.feedback ? '<br><br>' + esc(sub.feedback) : '') + '</div>';
          if (sub.gradedFileUrl) {
            h += '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(sub.gradedFileName || 'Marked copy') +
              '<small>Your work with the tutor\u2019s marks</small></span>' +
              '<a class="cr-btn sm primary" href="' + esc(sub.gradedFileUrl) + '" target="_blank" rel="noopener noreferrer" download="' + esc(sub.gradedFileName || 'graded.pdf') + '"><i class="fas fa-download"></i> Download marked copy</a></div>';
          }
        }

        if (sub && sub.fileUrl) {
          h += '<div class="cr-res"><i class="fas fa-paperclip"></i><span class="nm">' + esc(sub.fileName || 'Your upload') +
            '<small>Handed in' + (sub.submittedAt || sub.updatedAt ? ' ' + esc(U.fmtDateTime(sub.submittedAt || sub.updatedAt)) : '') + '</small></span>' +
            '<a class="cr-btn sm" href="' + esc(sub.fileUrl) + '" target="_blank" rel="noopener noreferrer">View</a></div>';
        }

        var canHandIn = true;
        if (isFlat) {
          if (!H.isWindowOpen(it)) canHandIn = false;
        } else if (kind === 'exam') {
          if (it.status !== 'Published') canHandIn = false;
        }
        if (graded) canHandIn = false;

        if (!canHandIn) {
          if (isFlat && !H.isWindowOpen(it)) {
            var nowMs = Date.now();
            var startMs = 0, endMs = 0;
            if (it.examDate) {
              startMs = it.examDate.toDate ? it.examDate.toDate().getTime() : (it.examDate.seconds ? it.examDate.seconds * 1000 : 0);
            }
            if (it.submissionDeadline) {
              endMs = it.submissionDeadline.toDate ? it.submissionDeadline.toDate().getTime() : (it.submissionDeadline.seconds ? it.submissionDeadline.seconds * 1000 : 0);
            }
            if (startMs && nowMs < startMs) {
              h += '<div class="cr-note">This exam opens on ' + esc(U.fmtDateTime(U.toDate(it.examDate))) + '. Come back then to download the paper and upload your work.</div>';
            } else if (endMs && nowMs > endMs) {
              h += '<div class="cr-note">The submission window for this exam has closed. If you have already uploaded your work it will still be marked.</div>';
            } else {
              h += '<div class="cr-note">This exam is not currently open for submissions.</div>';
            }
          } else if (kind === 'exam' && !isFlat && it.status !== 'Published') {
            h += '<div class="cr-note">This exam is closed.</div>';
          }
        } else {
          var promptLabel = sub ? 'Replace your work' : (kind === 'exam' ? 'Upload completed exam paper' : 'Upload completed work');

          h += '<h4 style="margin:1rem 0 .5rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A)">' + promptLabel + '</h4>' +
            '<div class="wk-drop" id="wkDrop"><i class="fas fa-cloud-arrow-up" style="font-size:1.6rem;color:var(--brand-deep,#245F5A)"></i><br><b>Choose a file</b> or drop it here<br><small>PDF, JPG or PNG up to 25 MB</small></div>' +
            '<input type="file" id="wkFile" accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png" style="display:none">' +
            '<div id="wkChosen" class="cr-note" style="margin-top:.5rem"></div><div class="cr-prog" id="wkProg" style="display:none"><div></div></div>' +
            '<div class="cr-field" style="margin-top:.7rem"><label>Note to your tutor (optional)</label><textarea id="wkNote" rows="2" style="width:100%">' + esc(sub ? sub.note || '' : '') + '</textarea></div>' +
            (sub ? '<div class="cr-note">You can replace your work until it has been marked.</div>' : '');
        }
      }

      m.body.innerHTML = h;

      var drop = m.body.querySelector('#wkDrop'), fileIn = m.body.querySelector('#wkFile');
      if (drop) {
        var chosen = null, chosenEl = m.body.querySelector('#wkChosen');
        function pick(f) {
          if (!f) return;
          if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { chosenEl.innerHTML = '<span class="cr-err">Please choose a PDF, JPG or PNG.</span>'; return; }
          if (f.size > 25 * 1024 * 1024) { chosenEl.innerHTML = '<span class="cr-err">That file is larger than 25 MB.</span>'; return; }
          chosen = f; chosenEl.innerHTML = '<i class="fas fa-file"></i> ' + esc(f.name) + ' (' + U.fmtSize(f.size) + ')'; submitBtn.disabled = false;
        }
        drop.onclick = function () { fileIn.click(); };
        fileIn.onchange = function () { pick(fileIn.files[0]); };
        ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
        drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });

        m.foot.innerHTML = '<span class="cr-err" id="wkErr"></span><button type="button" class="cr-btn" data-a="close">Close</button>' +
          '<button type="button" class="cr-btn primary" data-a="submit" disabled><i class="fas fa-paper-plane"></i> ' +
            (sub ? 'Replace work' : 'Hand in') + '</button>';
        m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };
        var submitBtn = m.foot.querySelector('[data-a="submit"]'), errEl = m.foot.querySelector('#wkErr');

        submitBtn.onclick = async function () {
          if (!chosen) return;
          errEl.textContent = ''; submitBtn.disabled = true;
          var prog = m.body.querySelector('#wkProg'); prog.style.display = '';
          try {
            var path;
            if (isFlat) {
              path = 'classroom-files/' + it.subjectId + '/' + o.cid + '/exams/' + o.id + '/submissions/' + o.uid + '/' + H.cleanName(chosen.name);
            } else {
              path = 'classroom-files/' + it.subjectId + '/' + o.cid + '/' + o.id + '/submissions/' + o.uid + '/' + H.cleanName(chosen.name);
            }
            var type = /\.pdf$/i.test(chosen.name) ? 'application/pdf' : (/\.png$/i.test(chosen.name) ? 'image/png' : 'image/jpeg');
            var up = await H.uploadTo(path, chosen, type, function (p) { prog.firstChild.style.width = p + '%'; });
            var ref = submissionCollRef.doc(o.uid);
            var note = m.body.querySelector('#wkNote').value.trim();

            if (sub) {
              await ref.update({
                fileUrl: up.url,
                fileName: chosen.name,
                fileType: type,
                storagePath: path,
                note: note,
                textAnswer: '',
                updatedAt: FV().serverTimestamp()
              });
              if (sub.storagePath) firebase.storage().ref(sub.storagePath).delete().catch(function () {});
            } else {
              var p = o.profile || {};
              await ref.set({
                studentId: o.uid,
                studentName: p.name || '',
                studentEmail: p.email || '',
                fileUrl: up.url,
                fileName: chosen.name,
                fileType: type,
                storagePath: path,
                note: note,
                textAnswer: '',
                status: 'Submitted',
                released: false,
                createdAt: FV().serverTimestamp(),
                updatedAt: FV().serverTimestamp(),
                submittedAt: FV().serverTimestamp()
              });
            }

            if (U.clearMemo) U.clearMemo('wk|'); // fresh data after a hand-in
            if (o.onChange) o.onChange();

            m.close(true);
            if (o.onChange) { try { await o.onChange(); } catch (e) { /* ignore */ } }

            const isExamSubmission = (kind === 'exam');
            const successTitle = isExamSubmission ? 'Exam paper handed in' : 'Work handed in';
            const successBody  = isExamSubmission
              ? 'Your completed exam paper has been received. Your tutor will mark it and release the result when ready.'
              : 'Your work has been received. Your tutor will mark it and release the result when ready.';

            const sm = U.openModal({ title: successTitle });
            sm.body.innerHTML =
              '<div style="text-align:center;padding:1rem 0 .5rem;">' +
                '<div style="width:64px;height:64px;border-radius:50%;background:rgba(46,184,114,.14);color:#1d8b57;display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:1rem;">' +
                  '<i class="fas fa-circle-check"></i>' +
                '</div>' +
                '<div style="font-weight:800;font-size:1.05rem;color:var(--brand-deep,#245F5A);margin-bottom:.4rem;">' +
                  esc(chosen.name || 'Your file') +
                '</div>' +
                '<div style="font-size:.86rem;color:var(--muted,#5A6E6A);line-height:1.6;">' +
                  esc(successBody) +
                '</div>' +
              '</div>';
            sm.foot.innerHTML =
              '<button type="button" class="cr-btn primary" data-a="ok" style="min-width:120px;justify-content:center;">' +
                '<i class="fas fa-check"></i> Close' +
              '</button>';
            sm.foot.querySelector('[data-a="ok"]').onclick = function () { sm.close(true); };
          } catch (e) {
            console.error('hand in:', e);
            errEl.textContent = e.code === 'permission-denied'
              ? 'You cannot hand this in — it may be marked, or the submission window is closed.'
              : (e.message || 'Could not hand in. Please try again.');
            submitBtn.disabled = false; prog.style.display = 'none';
          }
        };
      } else {
        m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="close">Close</button>';
        m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };
      }
    }
    paint();
  }

  /* ---------------------------------------------------------
     Student: open Classwork Lesson item
  --------------------------------------------------------- */
  async function openStudentLesson(cls, lesson, uid, profile, onChange) {
    H.injectStyle();
    var base = U.clsRef(cls.id).collection('topics').doc(lesson.topicId).collection('lessons').doc(lesson.id);
    var submissionCollRef = base.collection('submissions');

    var m = U.openModal({ title: lesson.title, wide: true });
    m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="close">Close</button>';
    m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };

    var sub = null;
    async function load() {
      var s = await submissionCollRef.doc(uid).get().catch(function () { return null; });
      sub = s && s.exists ? Object.assign({ id: s.id }, s.data()) : null;
    }

    async function paint() {
      try { await load(); } catch (e) { m.body.innerHTML = '<div class="cr-empty">' + esc(e.message || e) + '</div>'; return; }
      
      var st = H.workState(lesson, sub, 'lesson');
      var h = '<div class="wk-chips" style="margin-bottom:.8rem">' +
        pill(st.cls, st.text, st.icon) +
        '<span class="wk-chip"><i class="fas fa-book"></i> ' + esc(cls.subjectName) + '</span>' +
      '</div>';

      if (sub && sub.status === 'Graded' && sub.released !== false) {
        h += '<div class="wk-box"><b>Graded</b>' +
          (sub.feedback ? '<br><br>' + esc(sub.feedback) : '') + '</div>';
        if (sub.gradedFileUrl) {
          h += '<div class="cr-res"><i class="fas fa-file-pdf"></i><span class="nm">' + esc(sub.gradedFileName || 'Marked copy') +
            '<small>Your work with the tutor\u2019s marks</small></span>' +
            '<a class="cr-btn sm primary" href="' + esc(sub.gradedFileUrl) + '" target="_blank" rel="noopener noreferrer" download><i class="fas fa-download"></i> Download marked copy</a></div>';
        }
      } else if (sub && sub.status === 'Corrections') {
        h += '<div class="wk-box" style="background:rgba(232,163,61,.14);border:1px solid rgba(232,163,61,.35);color:#96690f">' +
          '<b>Corrections Requested</b><br>' + esc(sub.feedback || 'Please review and re-submit your work.') + '</div>';
      }

      if (sub && sub.fileUrl) {
        h += '<div class="cr-res"><i class="fas fa-paperclip"></i><span class="nm">' + esc(sub.fileName || 'Your upload') +
          '<small>Handed in' + (sub.submittedAt || sub.updatedAt ? ' ' + esc(U.fmtDateTime(sub.submittedAt || sub.updatedAt)) : '') + '</small></span>' +
          '<a class="cr-btn sm" href="' + esc(sub.fileUrl) + '" target="_blank" rel="noopener noreferrer">View</a></div>';
      }

      var canHandIn = (!sub || sub.status !== 'Graded');

      if (!canHandIn) {
        m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="close">Close</button>';
        m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };
      } else {
        var promptLabel = sub ? 'Replace your work' : 'Upload completed work';
        h += '<h4 style="margin:1rem 0 .5rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A)">' + promptLabel + '</h4>' +
          '<div class="wk-drop" id="wkDrop"><i class="fas fa-cloud-arrow-up" style="font-size:1.6rem;color:var(--brand-deep,#245F5A)"></i><br><b>Choose a file</b> or drop it here<br><small>PDF, JPG or PNG up to 25 MB</small></div>' +
          '<input type="file" id="wkFile" accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png" style="display:none">' +
          '<div id="wkChosen" class="cr-note" style="margin-top:.5rem"></div><div class="cr-prog" id="wkProg" style="display:none"><div></div></div>' +
          '<div class="cr-field" style="margin-top:.7rem"><label>Note to your tutor (optional)</label><textarea id="wkNote" rows="2" style="width:100%">' + esc(sub ? sub.note || '' : '') + '</textarea></div>';

        m.body.innerHTML = h;

        var drop = m.body.querySelector('#wkDrop'), fileIn = m.body.querySelector('#wkFile');
        var chosen = null, chosenEl = m.body.querySelector('#wkChosen');
        function pick(f) {
          if (!f) return;
          if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { chosenEl.innerHTML = '<span class="cr-err">Please choose a PDF, JPG or PNG.</span>'; return; }
          if (f.size > 25 * 1024 * 1024) { chosenEl.innerHTML = '<span class="cr-err">That file is larger than 25 MB.</span>'; return; }
          chosen = f; chosenEl.innerHTML = '<i class="fas fa-file"></i> ' + esc(f.name) + ' (' + U.fmtSize(f.size) + ')'; submitBtn.disabled = false;
        }
        drop.onclick = function () { fileIn.click(); };
        fileIn.onchange = function () { pick(fileIn.files[0]); };
        ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
        drop.addEventListener('drop', function (e) { pick(e.dataTransfer.files[0]); });

        m.foot.innerHTML = '<span class="cr-err" id="wkErr"></span><button type="button" class="cr-btn" data-a="close">Close</button>' +
          '<button type="button" class="cr-btn primary" data-a="submit" disabled><i class="fas fa-paper-plane"></i> ' +
            (sub ? 'Replace work' : 'Hand in') + '</button>';
        m.foot.querySelector('[data-a="close"]').onclick = function () { m.close(); };
        var submitBtn = m.foot.querySelector('[data-a="submit"]'), errEl = m.foot.querySelector('#wkErr');

        submitBtn.onclick = async function () {
          if (!chosen) return;
          errEl.textContent = ''; submitBtn.disabled = true;
          var prog = m.body.querySelector('#wkProg'); prog.style.display = '';
          try {
            var path = 'classroom-files/' + cls.subjectId + '/' + cls.id + '/' + lesson.id + '/submissions/' + uid + '/' + H.cleanName(chosen.name);
            var type = /\.pdf$/i.test(chosen.name) ? 'application/pdf' : (/\.png$/i.test(chosen.name) ? 'image/png' : 'image/jpeg');
            var up = await H.uploadTo(path, chosen, type, function (p) { prog.firstChild.style.width = p + '%'; });
            var ref = submissionCollRef.doc(uid);
            var note = m.body.querySelector('#wkNote').value.trim();

            if (sub) {
              await ref.update({
                fileUrl: up.url,
                fileName: chosen.name,
                fileType: type,
                storagePath: path,
                note: note,
                textAnswer: '',
                status: 'Submitted',
                updatedAt: FV().serverTimestamp()
              });
              if (sub.storagePath) firebase.storage().ref(sub.storagePath).delete().catch(function () {});
            } else {
              var p = profile || {};
              await ref.set({
                studentId: uid,
                studentName: p.name || '',
                studentEmail: p.email || '',
                fileUrl: up.url,
                fileName: chosen.name,
                fileType: type,
                storagePath: path,
                note: note,
                textAnswer: '',
                status: 'Submitted',
                released: false,
                createdAt: FV().serverTimestamp(),
                updatedAt: FV().serverTimestamp(),
                submittedAt: FV().serverTimestamp()
              });
            }

            if (U.clearMemo) U.clearMemo('wk|'); // fresh data after a hand-in
            m.close(true);
            if (onChange) { try { await onChange(); } catch (e) { /* ignore */ } }

            const sm = U.openModal({ title: 'Work handed in' });
            sm.body.innerHTML =
              '<div style="text-align:center;padding:1rem 0 .5rem;">' +
                '<div style="width:64px;height:64px;border-radius:50%;background:rgba(46,184,114,.14);color:#1d8b57;display:inline-flex;align-items:center;justify-content:center;font-size:1.8rem;margin-bottom:1rem;">' +
                  '<i class="fas fa-circle-check"></i>' +
                '</div>' +
                '<div style="font-weight:800;font-size:1.05rem;color:var(--brand-deep,#245F5A);margin-bottom:.4rem;">' +
                  esc(chosen.name || 'Your file') +
                '</div>' +
                '<div style="font-size:.86rem;color:var(--muted,#5A6E6A);line-height:1.6;">' +
                  'Your Classwork response has been received. Your tutor will mark it and release the result when ready.' +
                '</div>' +
              '</div>';
            sm.foot.innerHTML =
              '<button type="button" class="cr-btn primary" data-a="ok" style="min-width:120px;justify-content:center;">' +
                '<i class="fas fa-check"></i> Close' +
              '</button>';
            sm.foot.querySelector('[data-a="ok"]').onclick = function () { sm.close(true); };
          } catch (e) {
            console.error('hand in:', e);
            errEl.textContent = e.code === 'permission-denied'
              ? 'You cannot hand this in — it may be marked, or the submission window is closed.'
              : (e.message || 'Could not hand in. Please try again.');
            submitBtn.disabled = false; prog.style.display = 'none';
          }
        };
      }
    }
    paint();
  }

  /* ---------------------------------------------------------
     Student: Homework / Exams tabs
  --------------------------------------------------------- */
  function mountStudentHome(root, opts) {
    H.injectStyle(); root.classList.add('cr-root');
    ensureSpinKeyframe();
    var kind = opts.kind === 'exams' ? 'exam' : 'assignment';
    var profile = opts.profile || {}, subjects = lmzSubjectKeys(profile.subjects);
    var year = profile.year != null && profile.year !== '' ? Number(profile.year) : null;
    var S = { groups: null, filter: 'all' };

    async function load() {
      root.innerHTML = inlineLoaderHtml(kind === 'exam' ? 'Loading your exams…' : 'Loading your homework…');
      
      var results = await Promise.all(subjects.map(async function (sub) {
        try {
          var cls = await (U.findClassroomCached || U.findClassroom)(sub, year, profile.keyStage);
          if (!cls) return null;
          var topics = kind === 'exam' ? [] : await (U.loadTopicsCached || U.loadTopics)(cls.id);
          var work = await loadStudentWork(cls, topics, opts.uid, profile, [kind === 'exam' ? 'exams' : 'assignments']);
          return {
            cls: cls,
            topics: topics,
            items: kind === 'exam' ? work.exams : work.assignments
          };
        } catch (e) { console.warn('student work for', sub, e); return null; }
      }));
      
      S.groups = results.filter(Boolean);
      render();
    }

    function passes(it) {
      var k = stateOf(it, kind).k;
      if (S.filter === 'all') return true;
      if (S.filter === 'todo') return k === 'pending' || k === 'overdue' || k === 'progress';
      if (S.filter === 'submitted') return k === 'submitted';
      if (S.filter === 'graded') return k === 'graded';
      return true;
    }

    function render() {
      var tabs = [['all', 'All'], ['todo', 'To do'], ['submitted', 'Handed in'], ['graded', 'Graded']];
      var h = '<div class="cr-bar"><div><h3>' + (kind === 'exam' ? 'Exams' : 'Homework') + '</h3><div class="cr-sub">' +
        (kind === 'exam'
          ? 'Hand in completed exam papers during the submission window.'
          : 'Grouped by subject and topic, the same way as your classroom.') +
        '</div></div></div>' +
        '<div class="cr-tabs">' + tabs.map(function (t) { return '<button type="button" class="cr-btn ' + (S.filter === t[0] ? 'on' : '') + '" data-a="filter" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';

      var any = false;

      S.groups.forEach(function (g) {
        var items = g.items.filter(passes);
        if (!items.length) return;
        any = true;

        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">' + esc(U.displayName(g.cls)) +
          '<small>Year ' + esc(g.cls.year) + '</small></span></div>';

        if (kind === 'exam') {
          var flatItems = items.filter(function (x) { return x.flat; }).sort(sortDue('exam'));
          var nestedItems = items.filter(function (x) { return !x.flat; });

          flatItems.forEach(function (x) { h += rowHtml(x, 'exam'); });

          g.topics.forEach(function (t) {
            var rows = nestedItems.filter(function (x) { return x.tid === t.id; }).sort(sortDue('exam'));
            if (!rows.length) return;
            h += '<div class="cr-lesson" style="background:var(--paper,#F1F9F7)"><span class="tt" style="font-weight:800;color:var(--brand-deep,#245F5A)">' + esc(t.title) + '</span></div>';
            rows.forEach(function (x) { h += rowHtml(x, 'exam'); });
          });
        } else {
          g.topics.forEach(function (t) {
            var rows = items.filter(function (x) { return x.tid === t.id; }).sort(sortDue('assignment'));
            if (!rows.length) return;
            h += '<div class="cr-lesson" style="background:var(--paper,#F1F9F7)"><span class="tt" style="font-weight:800;color:var(--brand-deep,#245F5A)">' + esc(t.title) + '</span></div>';
            rows.forEach(function (x) { h += rowHtml(x, 'assignment'); });
          });
        }
        h += '</div>';
      });

      if (!any) {
        h += '<div class="cr-panel"><div class="cr-empty">' +
          (S.filter === 'all'
            ? (kind === 'exam'
                ? 'No exams to hand in right now.'
                : 'Nothing has been set yet.')
            : 'Nothing in this list.') +
        '</div></div>';
      }
      root.innerHTML = h;
    }

    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      if (el.dataset.a === 'filter') { S.filter = el.dataset.v; render(); }
      else if (el.dataset.a === 'work-open') {
        var cid = el.dataset.cid || '';
        if (!cid) {
          var wantFlat = el.dataset.flat === '1';
          var ownerGroup = S.groups.filter(function (g) {
            return g.items.some(function (x) {
              return x.id === el.dataset.id && (!!x.flat) === wantFlat;
            });
          })[0];
          if (ownerGroup && ownerGroup.cls && ownerGroup.cls.id) cid = ownerGroup.cls.id;
        }
        if (!cid) {
          console.warn('work-open: no owning classroom found for', {
            id: el.dataset.id, tid: el.dataset.t, kind: el.dataset.k, flat: el.dataset.flat
          });
          alert('This item is no longer available. Please refresh the page.');
          return;
        }
        openStudentItem({
          kind: el.dataset.k,
          cid: cid,
          tid: el.dataset.t || null,
          id: el.dataset.id,
          flat: el.dataset.flat === '1',
          uid: opts.uid,
          profile: profile,
          onChange: load
        });
      }
    });
    root.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.a === 'work-open') { e.preventDefault(); e.target.click(); } });
    load();
    return { reload: load };
  }

  /* ---------------------------------------------------------
     Parent: strictly read-only
  --------------------------------------------------------- */
  async function loadParentWork(child, kind) {
    var PFLAG = 'audiences.' + audOf(child);
    var year = child.year != null && child.year !== '' ? Number(child.year) : null;
    var groups = [];
    var subjects = lmzSubjectKeys(child.subjects);

    for (var i = 0; i < subjects.length; i++) {
      try {
        var cls = await U.findClassroom(subjects[i], year, child.keyStage);
        if (!cls) continue;

        if (kind === 'assignment') {
          var topics = await U.loadTopics(cls.id), items = [];
          await Promise.all(topics.map(async function (t) {
            var q = coll(cls.id, t.id, 'assignment').where(PFLAG, '==', true);
            var snap = await q.get();
            var mine = snap.docs.map(function (d) { return Object.assign({ id: d.id, tid: t.id, cid: cls.id }, d.data()); }).filter(function (x) {
              return x.audience === 'class' || (x.recipients || []).indexOf(child.id) !== -1;
            });
            await Promise.all(mine.map(async function (it) {
              var d = await coll(cls.id, t.id, 'assignment').doc(it.id).collection('submissions').doc(child.id).get().catch(function () { return null; });
              it.sub = d && d.exists ? Object.assign({ id: d.id }, d.data()) : null;
              items.push(it);
            }));
          }));
          groups.push({ cls: cls, topics: topics, items: items });
        } else {
          var items2 = [], flatItems = [];

          var topics2 = await U.loadTopics(cls.id);
          await Promise.all(topics2.map(async function (t) {
            var q = coll(cls.id, t.id, 'exam').where('status', '==', 'Published').where(PFLAG, '==', true);
            var snap = await q.get();
            var mine = snap.docs.map(function (d) { return Object.assign({ id: d.id, tid: t.id, cid: cls.id, flat: false }, d.data()); }).filter(function (x) {
              return x.audience === 'class' || (x.recipients || []).indexOf(child.id) !== -1;
            });
            await Promise.all(mine.map(async function (it) {
              if (it.examMode === 'ai') {
                var q2 = await db.collection('examAttempts').where('studentId', '==', child.id).get().catch(function () { return { docs: [] }; });
                var hit = q2.docs.filter(function (x) { return x.data().examId === it.legacyExamId; })[0];
                it.sub = hit ? Object.assign({ id: hit.id }, hit.data(), { grade: hit.data().score }) : null;
              } else {
                var d = await coll(cls.id, t.id, 'exam').doc(it.id).collection('attempts').doc(child.id).get().catch(function () { return null; });
                it.sub = d && d.exists ? Object.assign({ id: d.id }, d.data()) : null;
              }
              items2.push(it);
            }));
          }));

          try {
            var fSnap = await H.flatExamsRef(cls.id).where(PFLAG, '==', true).where('status', '==', 'Published').get();
            await Promise.all(fSnap.docs.map(async function (d) {
              var it = Object.assign({ id: d.id, cid: cls.id, flat: true }, d.data());
              if (String(it.status || '') !== 'Published') return;
              var s = await H.flatExamSubmissionsRef(cls.id, it.id).doc(child.id).get().catch(function () { return null; });
              it.sub = s && s.exists ? Object.assign({ id: s.id }, s.data()) : null;
              flatItems.push(it);
            }));
          } catch (e) { /* flat exams are optional */ }

          groups.push({ cls: cls, topics: topics2, items: items2, flatItems: flatItems });
        }
      } catch (e) { console.warn('parent work for', subjects[i], e); }
    }
    return groups;
  }

  /* ---------------------------------------------------------
     Parent-side filter
  --------------------------------------------------------- */
  function itemPassesFilter(it, kind, filter) {
    if (!filter || filter === 'all') return true;
    var st = H.workState(it, it.sub || null, kind);
    if (filter === 'graded')    return st.k === 'graded';
    if (filter === 'submitted') return st.k === 'submitted';
    if (filter === 'todo' || filter === 'upcoming') {
      if (st.k === 'pending' || st.k === 'overdue' || st.k === 'progress') return true;
      if (kind === 'exam' && it.flat) {
        var when = U.toDate(it.examDate);
        if (when && when.getTime() >= Date.now()) return true;
      }
      return false;
    }
    return true;
  }

  function mountParentWork(root, opts) {
    H.injectStyle(); root.classList.add('cr-root');
    ensureSpinKeyframe();
    var kind = opts.kind === 'exams' ? 'exam' : 'assignment';
    var child = opts.child;
    var filter = opts.filter || 'all';
    root.innerHTML = inlineLoaderHtml(kind === 'exam' ? 'Loading exams…' : 'Loading homework…');

    loadParentWork(child, kind).then(function (groups) {
      var h = '<div class="cr-bar"><div><h3>' + (kind === 'exam' ? 'Exams' : 'Homework') + ' \u2014 ' + esc(child.name || 'your child') +
        '</h3><div class="cr-sub">' +
        (kind === 'exam'
          ? 'Exam papers can be downloaded here so you can print them for the day.'
          : 'View only. Homework is handed in by your child from their own portal.') +
        '</div></div></div>';

      var total = 0, graded = 0, pending = 0, overdue = 0;
      function tally(it) {
        total++;
        var k = stateOf(it, kind).k;
        if (k === 'graded') graded++;
        else if (k === 'overdue') overdue++;
        else if (k === 'pending' || k === 'submitted' || k === 'progress') pending++;
      }
      groups.forEach(function (g) {
        (g.items || []).forEach(tally);
        (g.flatItems || []).forEach(tally);
      });

      h += '<div class="wk-chips" style="margin-bottom:1rem">' +
        pill('b-confirmed', graded + ' graded', 'fa-circle-check') +
        pill('b-pending', pending + ' pending', 'fa-hourglass-half') +
        pill('b-declined', overdue + ' overdue', 'fa-triangle-exclamation') +
      '</div>';

      if (!total) h += '<div class="cr-panel"><div class="cr-empty">Nothing has been set yet.</div></div>';

      var anyShown = false;

      groups.forEach(function (g) {
        var flatShown = (g.flatItems || []).filter(function (it) { return itemPassesFilter(it, kind, filter); });
        var nestedShown = (g.items || []).filter(function (it) { return itemPassesFilter(it, kind, filter); });

        if (!flatShown.length && !nestedShown.length) return;
        anyShown = true;

        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">' + esc(U.displayName(g.cls)) +
          '<small>Year ' + esc(g.cls.year) + '</small></span></div>';

        if (kind === 'exam') {
          flatShown.slice().sort(sortDue('exam')).forEach(function (it) {
            var st = stateOf(it, kind);
            var examDate = it.examDate ? U.toDate(it.examDate) : null;
            var deadline = it.submissionDeadline ? U.toDate(it.submissionDeadline) : null;
            var open = H.isWindowOpen(it);
            h += '<div class="cr-lesson" style="align-items:flex-start">' +
              '<span class="wk-ic"><i class="fas fa-file-pen"></i></span>' +
              '<span class="tt">' + esc(it.title) +
                '<small>' + esc(it.examType || 'Exam') +
                  (examDate ? ' \u00b7 ' + esc(U.fmtDateTime(examDate)) : '') +
                  (deadline ? ' \u00b7 submissions by ' + esc(U.fmtDateTime(deadline)) : '') +
                '</small>' +
                (it.requirements ? '<small style="margin-top:.3rem;white-space:pre-wrap">' + esc(it.requirements) + '</small>' : '') +
                (st.k === 'graded' && it.sub && it.sub.feedback ? '<small style="margin-top:.3rem"><b>Tutor feedback:</b> ' + esc(it.sub.feedback) + '</small>' : '') +
              '</span>' +
              pill(st.cls, st.text, st.icon) +
              (open
                ? pill('b-confirmed', 'Submissions open', 'fa-lock-open')
                : pill('b-plain', 'Submissions closed', 'fa-lock')) +
              (it.examPdfUrl
                ? '<a class="cr-btn sm primary" href="' + esc(it.examPdfUrl) + '" target="_blank" rel="noopener noreferrer" download><i class="fas fa-download"></i> Download paper</a>'
                : '<span class="pill flat">Paper not uploaded</span>') +
            '</div>';
          });

          g.topics.forEach(function (t) {
            var rows = nestedShown.filter(function (x) { return x.tid === t.id; }).sort(sortDue('exam'));
            if (!rows.length) return;
            h += '<div class="cr-lesson" style="background:var(--paper,#F1F9F7)"><span class="tt" style="font-weight:800;color:var(--brand-deep,#245F5A)">' + esc(t.title) + '</span></div>';
            rows.forEach(function (it) {
              var st = stateOf(it, kind), due = H.dueOf(it, kind);
              h += '<div class="cr-lesson" style="align-items:flex-start">' +
                '<span class="wk-ic"><i class="fas fa-file-pen"></i></span>' +
                '<span class="tt">' + esc(it.title) +
                  '<small>' + (due ? 'Exam: ' + esc(U.fmtDateTime(due)) : '') + (it.tutorName ? ' \u00b7 ' + esc(it.tutorName) : '') + '</small>' +
                  (it.description ? '<small style="margin-top:.3rem;white-space:pre-wrap">' + esc(it.description) + '</small>' : '') +
                  (st.k === 'graded' && it.sub && it.sub.feedback ? '<small style="margin-top:.3rem"><b>Tutor feedback:</b> ' + esc(it.sub.feedback) + '</small>' : '') +
                '</span>' +
                pill(st.cls, st.text, st.icon) +
                (it.examMode === 'pdf' && it.examPdfUrl
                  ? '<a class="cr-btn sm primary" href="' + esc(it.examPdfUrl) + '" target="_blank" rel="noopener noreferrer" download><i class="fas fa-download"></i> Download exam PDF</a>'
                  : '') +
              '</div>';
            });
          });
        } else {
          g.topics.forEach(function (t) {
            var rows = nestedShown.filter(function (x) { return x.tid === t.id; }).sort(sortDue('assignment'));
            if (!rows.length) return;
            h += '<div class="cr-lesson" style="background:var(--paper,#F1F9F7)"><span class="tt" style="font-weight:800;color:var(--brand-deep,#245F5A)">' + esc(t.title) + '</span></div>';
            rows.forEach(function (it) {
              var st = stateOf(it, kind), due = H.dueOf(it, kind);
              h += '<div class="cr-lesson" style="align-items:flex-start">' +
                '<span class="wk-ic"><i class="fas fa-clipboard-check"></i></span>' +
                '<span class="tt">' + esc(it.title) +
                  '<small>' + (due ? 'Due: ' + esc(U.fmtDateTime(due)) : '') + (it.tutorName ? ' \u00b7 ' + esc(it.tutorName) : '') + '</small>' +
                  (it.description ? '<small style="margin-top:.3rem;white-space:pre-wrap">' + esc(it.description) + '</small>' : '') +
                  (st.k === 'graded' && it.sub && it.sub.feedback ? '<small style="margin-top:.3rem"><b>Tutor feedback:</b> ' + esc(it.sub.feedback) + '</small>' : '') +
                '</span>' +
                pill(st.cls, st.text, st.icon) +
              '</div>';
            });
          });
        }
        h += '</div>';
      });

      if (total && !anyShown) {
        h += '<div class="cr-panel"><div class="cr-empty">Nothing matches the current filter. Try a different chip above.</div></div>';
      }

      root.innerHTML = h;
    }).catch(function (e) {
      root.innerHTML = '<div class="cr-empty">Could not load: ' + esc(e.message || e) + '</div>';
    });
  }

  Object.assign(W, {
    loadStudentWork: loadStudentWork,
    studentTopicRows: studentTopicRows,
    openStudentItem: openStudentItem,
    openStudentLesson: openStudentLesson,
    mountStudentHome: mountStudentHome,
    mountParentWork: mountParentWork
  });
})(window);