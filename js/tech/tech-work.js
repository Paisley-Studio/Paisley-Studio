/* =========================================================
   Paisley Tech Studio: class work  (window.TechWork)
   ---------------------------------------------------------
   A lesson (or practice test) can ask builders to make something:
     techLessons/{id}.task = { brief, kind: 'code' | 'writing' }
   The builder does it right there, in the Code IDE (CodeLab) or the
   writing pad (WritingStudio), and hands it in. One doc per builder:

     techLessonWork/{uid}_{lessonId}
       { studentId, studentName, coachId, lessonId, lessonTitle, courseId, courseName,
         topicId, topicTitle, track, kind,
         codeFiles, codeFolders, codeAssets, codeActive | writingHtml,
         status: Draft | Submitted | Graded | Corrections, submittedAt, submitCount,
         feedback, grade, maxScore, gradedBy*, gradedAt, gradedFileUrl, inkData, history }

   Coaches and admins see hand-ins per class or per lesson, run the code,
   and mark it with ink like classroom homework: the work is turned into a
   PDF on the page (each file with line numbers, or the writing) and
   opened in InkGrader. The marked copy goes to techGraded/. Builders and
   their guardians see the feedback, the score and the marked copy.

   Group tasks (TechGroups) use the same marking, viewer and PDF.

     TechWork.mountLessonWork(host, { me, student, lesson, label })
     TechWork.mountHandIns(host, { me, students, lessonId })
     TechWork.openWorkView({ me, ref, data, title, subtitle, who, kind, brief, folder, key, live, presence })
     TechWork.openMarking({ me, ref, data, title, subtitle, who, folder, key, kind, onDone })
     TechWork.workPdf({ title, who, kind, files, writingHtml, assets }) -> Uint8Array
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var WORK = function () { return db.collection('techLessonWork'); };
  var PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  var STATES = {
    Draft: ['In progress', 'fa-pen', ''],
    Submitted: ['Handed in', 'fa-inbox', 'mid'],
    Graded: ['Marked', 'fa-circle-check', 'good'],
    Corrections: ['Corrections asked', 'fa-rotate-left', 'low']
  };

  function kindOf(task) {
    if (!task) return '';
    if (task.kind === 'code' || task.kind === 'writing') return task.kind;
    return ['WRITING', 'RESEARCH'].indexOf(task.category) !== -1 ? 'writing' : 'code';
  }
  function workId(uid, lessonId) { return uid + '_' + lessonId; }
  function fmt(ts) { var d = T.toDate(ts); return d ? d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function statePill(st) { var s = STATES[st] || ['Not started', 'fa-circle', '']; return '<span class="tc-pill ' + s[2] + '"><i class="fas ' + s[1] + '"></i> ' + esc(s[0]) + '</span>'; }
  function scoreText(d) { return d && d.grade != null && d.grade !== '' && d.maxScore ? d.grade + ' / ' + d.maxScore : ''; }
  function hasWork(d, kind) {
    if (!d) return false;
    if (kind === 'writing') return String(d.writingHtml || '').replace(/<[^>]+>/g, '').trim().length > 0 || /<img/i.test(d.writingHtml || '');
    return (d.codeFiles || []).some(function (f) { return String(f.content || '').trim().length > 0; });
  }

  function style() {
    /* The .tc-* pieces (pills, panels, buttons) come from TechClasses. */
    if (g.TechClasses && g.TechClasses.style) g.TechClasses.style();
    if (document.getElementById('tw-style')) return;
    var s = document.createElement('style'); s.id = 'tw-style';
    s.textContent = [
      '.tw-bar{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin:.2rem 0 .8rem}',
      '.tw-bar .grow{flex:1}',
      '.tw-fb{border-radius:14px;padding:1rem 1.1rem;margin-bottom:1rem;background:#F4F8FF;border:1.5px solid #C9DBF5}',
      '.tw-fb.ok{background:rgba(46,184,114,.08);border-color:rgba(46,184,114,.35)}.tw-fb.redo{background:#FFF7E6;border-color:#F5C842}',
      '.tw-fb h4{margin:0 0 .4rem;font-size:.92rem;color:var(--brand-deep,#245F5A)}',
      '.tw-fb .score{font-size:1.4rem;font-weight:800;color:var(--brand-deep,#245F5A);margin:.1rem 0 .3rem}',
      '.tw-fb .txt{white-space:pre-wrap;line-height:1.55;font-size:.9rem}',
      '.tw-fb details{margin-top:.6rem;font-size:.82rem}.tw-fb details p{margin:.35rem 0;white-space:pre-wrap}',
      '.tw-article{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;padding:1.1rem 1.3rem;line-height:1.7;font-size:.95rem;max-height:70vh;overflow:auto}',
      '.tw-article img{max-width:100%;height:auto}',
      '.tw-note{font-size:.8rem;font-weight:600;color:var(--muted,#5A6E6A)}',
      '.tw-msg{font-size:.84rem;font-weight:700;min-height:1.1rem}',
      '.tw-steps{display:flex;gap:.4rem;flex-wrap:wrap;margin:0 0 1rem}',
      '.tw-step{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem 1rem;border-radius:99px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;font:inherit;font-weight:800;font-size:.84rem;color:var(--muted,#5A6E6A);cursor:pointer}',
      '.tw-step b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:.72rem}',
      '.tw-step.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.tw-step.on b{background:#fff}',
      '.tw-step.done b{background:#2EB872;color:#fff}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* The coach's verdict, for the builder, their family and the staff viewer. */
  function feedbackHtml(d, who) {
    if (!d || (d.status !== 'Graded' && d.status !== 'Corrections')) return '';
    var redo = d.status === 'Corrections', sc = scoreText(d);
    var hist = (d.history || []).filter(function (h) { return h && (h.feedback || h.markedFileUrl); });
    return '<div class="tw-fb ' + (redo ? 'redo' : 'ok') + '"><h4><i class="fas ' + (redo ? 'fa-rotate-left' : 'fa-circle-check') + '"></i> ' +
      (redo ? 'Corrections asked' : 'Marked') + (d.gradedByName ? ' by ' + esc(d.gradedByName) : '') + (d.gradedAt ? ' · ' + esc(fmt(d.gradedAt)) : '') + '</h4>' +
      (sc ? '<div class="score">' + esc(sc) + '</div>' : '') +
      (d.feedback ? '<div class="txt">' + esc(d.feedback) + '</div>' : '') +
      (T.safeUrl(d.gradedFileUrl) ? '<p style="margin:.6rem 0 0"><a class="tc-btn light sm" href="' + esc(T.safeUrl(d.gradedFileUrl)) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pdf"></i> See the marked copy</a></p>' : '') +
      (redo ? '<p class="tw-note" style="margin:.6rem 0 0">' + esc(who || 'Fix it') + (who ? ' can fix it' : '') + ' below, then hand it in again.</p>' : '') +
      (hist.length ? '<details><summary>Earlier rounds (' + hist.length + ')</summary>' + hist.map(function (h) {
        return '<p><b>Round ' + esc(h.round || '') + '</b>' + (h.gradedByName ? ' · ' + esc(h.gradedByName) : '') + (h.feedback ? ': ' + esc(h.feedback) : '') +
          (T.safeUrl(h.markedFileUrl) ? ' <a href="' + esc(T.safeUrl(h.markedFileUrl)) + '" target="_blank" rel="noopener noreferrer">marked copy</a>' : '') + '</p>';
      }).join('') + '</details>' : '') + '</div>';
  }

  /* ---------------------------------------------------------
     Work -> PDF, so a coach can mark code and writing with ink
     --------------------------------------------------------- */
  var pdfLib = null;
  function loadPdfLib() {
    if (g.PDFLib) return Promise.resolve(g.PDFLib);
    if (pdfLib) return pdfLib;
    pdfLib = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PDFLIB_URL; s.async = true;
      s.onload = function () { res(g.PDFLib); }; s.onerror = function () { pdfLib = null; rej(new Error('Could not load the PDF maker.')); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  /* The standard PDF fonts only know Western characters; anything else becomes "?". */
  /* Line breaks are kept: callers split on them before drawing. */
  function winAnsi(t) {
    return String(t == null ? '' : t).replace(/\r/g, '').replace(/\t/g, '  ').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '?')
      .replace(/[^\n\x20-\x7E\xA0-\xFF•–—‘’“”€]/g, '?');
  }
  function oneLine(t) { return winAnsi(t).replace(/\n+/g, ' '); }
  function textBlocks(html) {
    var out = [];
    var root = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html').body.firstChild;
    (function walk(n) {
      [].forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) { var t = c.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push({ t: 'p', s: t }); return; }
        if (c.nodeType !== 1) return;
        var tag = c.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) out.push({ t: 'h', s: c.textContent.trim() });
        else if (tag === 'li') out.push({ t: 'li', s: c.textContent.replace(/\s+/g, ' ').trim() });
        else if (/^(ul|ol|div|section|article|blockquote|figure)$/.test(tag)) walk(c);
        else if (tag === 'img') out.push({ t: 'p', s: '[picture' + (c.getAttribute('alt') ? ': ' + c.getAttribute('alt') : '') + ']' });
        else if (tag === 'pre') out.push({ t: 'pre', s: c.textContent });
        else if (tag !== 'br') { var tx = c.textContent.replace(/\s+/g, ' ').trim(); if (tx) out.push({ t: 'p', s: tx }); }
      });
    })(root);
    return out;
  }
  async function workPdf(o) {
    var L = await loadPdfLib();
    var doc = await L.PDFDocument.create();
    var mono = await doc.embedFont(L.StandardFonts.Courier), sans = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    var W = 595.28, H = 841.89, M = 42, page = null, y = 0;
    var deep = L.rgb(0.141, 0.373, 0.353), grey = L.rgb(0.45, 0.5, 0.49), ink = L.rgb(0.15, 0.2, 0.19), sage = L.rgb(0.898, 0.949, 0.937);
    function newPage() {
      page = doc.addPage([W, H]); y = H - M;
      page.drawText(oneLine(o.title || 'Work').slice(0, 80), { x: M, y: y, size: 10, font: bold, color: deep });
      var who = oneLine(o.who || '').slice(0, 50), ww = sans.widthOfTextAtSize(who, 9);
      page.drawText(who, { x: W - M - ww, y: y, size: 9, font: sans, color: grey });
      y -= 8; page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.6, color: sage });
      y -= 18;
    }
    function need(h) { if (!page || y - h < M) newPage(); }
    function wrapWords(t, font, size, width) {
      var words = oneLine(t).split(' '), lines = [], cur = '';
      words.forEach(function (w) {
        var next = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(next, size) <= width) cur = next;
        else { if (cur) lines.push(cur); while (font.widthOfTextAtSize(w, size) > width) { var k = Math.max(1, Math.floor(w.length * width / font.widthOfTextAtSize(w, size))); lines.push(w.slice(0, k)); w = w.slice(k); } cur = w; }
      });
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    }
    newPage();
    if (o.brief) {
      wrapWords('Task: ' + o.brief.replace(/\s+/g, ' '), sans, 9.5, W - 2 * M).slice(0, 12).forEach(function (ln) { need(13); page.drawText(ln, { x: M, y: y, size: 9.5, font: sans, color: grey }); y -= 13; });
      y -= 8;
    }
    if (o.kind === 'writing') {
      var blocks = textBlocks(o.writingHtml);
      if (!blocks.length) blocks = [{ t: 'p', s: '(Nothing written.)' }];
      blocks.forEach(function (b) {
        var font = b.t === 'h' ? bold : (b.t === 'pre' ? mono : sans), size = b.t === 'h' ? 13 : (b.t === 'pre' ? 9 : 11), lh = size * 1.45;
        var indent = b.t === 'li' ? 14 : 0;
        var lines = b.t === 'pre' ? winAnsi(b.s).split('\n') : wrapWords(b.s, font, size, W - 2 * M - indent);
        if (b.t === 'h') y -= 4;
        lines.forEach(function (ln, i) {
          need(lh);
          if (b.t === 'li' && i === 0) page.drawText('•', { x: M + 3, y: y, size: size, font: sans, color: ink });
          page.drawText(ln, { x: M + indent, y: y, size: size, font: font, color: b.t === 'h' ? deep : ink });
          y -= lh;
        });
        y -= b.t === 'li' ? 1 : 6;
      });
    } else {
      var size = 8.6, lh = 11.2, gutter = 30, per = Math.floor((W - 2 * M - gutter) / (size * 0.6));
      (o.files || []).filter(function (f) { return String(f.content || '').trim(); }).forEach(function (f) {
        need(40); y -= 4;
        page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: sage });
        page.drawText(oneLine(f.name), { x: M + 6, y: y, size: 10, font: bold, color: deep });
        y -= 22;
        winAnsi(f.content).split('\n').forEach(function (line, i) {
          var chunks = []; for (var p = 0; p === 0 || p < line.length; p += per) chunks.push(line.slice(p, p + per));
          chunks.forEach(function (c, k) {
            need(lh);
            if (k === 0) { var n = String(i + 1), nw = mono.widthOfTextAtSize(n, 7.5); page.drawText(n, { x: M + gutter - 8 - nw, y: y, size: 7.5, font: mono, color: grey }); }
            else page.drawText('>', { x: M + gutter - 12, y: y, size: 7.5, font: mono, color: grey });
            page.drawText(c, { x: M + gutter, y: y, size: size, font: mono, color: ink });
            y -= lh;
          });
        });
        y -= 10;
      });
      if (!(o.files || []).some(function (f) { return String(f.content || '').trim(); })) { need(14); page.drawText('(No code yet.)', { x: M, y: y, size: 11, font: sans, color: grey }); y -= 14; }
    }
    if ((o.assets || []).length) {
      need(30); y -= 6;
      page.drawText('Uploaded files', { x: M, y: y, size: 10, font: bold, color: deep }); y -= 14;
      o.assets.forEach(function (a) { need(12); page.drawText(oneLine('- ' + a.name), { x: M, y: y, size: 9, font: sans, color: ink }); y -= 12; });
    }
    var pages = doc.getPages();
    pages.forEach(function (p, i) { var t = 'Page ' + (i + 1) + ' of ' + pages.length; p.drawText(t, { x: W - M - sans.widthOfTextAtSize(t, 8), y: 22, size: 8, font: sans, color: grey }); });
    return doc.save();
  }

  /* ---------------------------------------------------------
     Marking: the same ink screen as classroom homework
     --------------------------------------------------------- */
  async function openMarking(o) {
    if (!g.InkGrader) { alert('The marking screen did not load. Refresh the page and try again.'); return; }
    var d = o.data || {};
    var bytes;
    try {
      bytes = await workPdf({ title: o.title, who: o.who, kind: o.kind, brief: o.brief, files: d.codeFiles || [], writingHtml: o.kind === 'doc' ? g.CodeLab.mdHtml(((d.codeFiles || [])[0] || {}).content || '') : d.writingHtml, assets: d.codeAssets || [] });
    } catch (e) { alert('Could not prepare the work for marking: ' + T.errMsg(e)); return; }
    g.InkGrader.open({
      docRef: o.ref,
      data: Object.assign({}, d, { studentName: o.who || d.studentName || 'Builder', fileUrl: '', fileName: '' }),
      item: { title: o.title || 'Work', subjectName: o.subtitle || '' },
      cid: 'tech', itemId: o.key,
      user: { uid: o.me.uid, name: o.me.name || '' },
      kind: 'assignment',
      source: { bytes: bytes, type: 'application/pdf', name: 'work.pdf' },
      gradedPath: function (fileName) { return 'techGraded/' + o.folder + '/' + o.key + '/' + Date.now() + '_' + fileName; },
      onDone: function () { if (o.onDone) o.onDone(); }
    });
  }

  /* ---------------------------------------------------------
     Staff viewer: run the code, read the writing, then mark it
     --------------------------------------------------------- */
  function openWorkView(o) {
    style();
    var CU = g.ClassroomUI.util, d = o.data || {}, lab = null, unsub = null;
    var m = CU.openModal({ title: (o.who ? o.who + ' · ' : '') + (o.title || 'Work'), wide: true, onClose: function () { if (lab) lab.destroy(); if (unsub) unsub(); } });
    function head() {
      return '<div class="tw-bar">' + statePill(d.status) + (d.submittedAt ? '<span class="tw-note">Handed in ' + esc(fmt(d.submittedAt)) + (d.submittedByName ? ' by ' + esc(d.submittedByName) : '') + (d.submitCount > 1 ? ' · round ' + d.submitCount : '') + '</span>' : '') +
        (o.subtitle ? '<span class="tw-note grow" style="text-align:right">' + esc(o.subtitle) + '</span>' : '') + '</div>' +
        (o.brief ? '<div class="tc-panel" style="padding:.8rem 1rem"><b style="color:var(--brand-deep,#245F5A)">What they had to make</b><div class="tc-plain" style="margin-top:.3rem;font-size:.9rem">' + esc(o.brief) + '</div></div>' : '') +
        feedbackHtml(d);
    }
    m.body.innerHTML = '<div id="twHead">' + head() + '</div><div id="twWork"></div>';
    var hostW = m.body.querySelector('#twWork');
    if (o.kind === 'writing') hostW.innerHTML = d.writingHtml ? '<div class="tw-article">' + T.cleanHtml(d.writingHtml) + '</div>' : '<div class="tc-empty">Nothing written yet.</div>';
    else if (!g.CodeLab) hostW.innerHTML = '<div class="tc-empty">The Code IDE is not loaded on this page.</div>';
    else lab = g.CodeLab.mount(hostW, { build: d, canEdit: false, mode: o.kind === 'doc' ? 'doc' : 'code', title: o.who, collab: o.live ? { ref: o.ref, presence: o.presence, me: { uid: o.me.uid, name: o.me.name } } : null });
    if (o.live) unsub = o.ref.onSnapshot(function (s) { if (s.exists) { d = s.data(); var h = m.body.querySelector('#twHead'); if (h) h.innerHTML = head(); paintFoot(); } }, function () { });
    function paintFoot() {
      var canMark = d.status && d.status !== 'Draft';
      m.foot.innerHTML = '<span class="tw-note" style="margin-right:auto">' + (canMark ? 'Mark it with ink, give a score and feedback, or ask for corrections. ' + esc(o.familyNote || 'The builder and their family are told.') : 'Not handed in yet. You can watch it, and mark it once it is handed in.') + '</span>' +
        '<button type="button" class="cr-btn" data-x>Close</button>' +
        (canMark ? '<button type="button" class="cr-btn primary" data-mark><i class="fas fa-pen-nib"></i> ' + (d.status === 'Graded' ? 'Review the marks' : 'Mark with ink') + '</button>' : '');
      m.foot.querySelector('[data-x]').onclick = function () { m.close(); };
      var mk = m.foot.querySelector('[data-mark]');
      if (mk) mk.onclick = function () {
        mk.disabled = true;
        openMarking({ me: o.me, ref: o.ref, data: d, title: o.title, subtitle: o.subtitle, who: o.who, kind: o.kind, brief: o.brief, folder: o.folder, key: o.key,
          onDone: function () { m.close(); if (o.onDone) o.onDone(); } }).then(function () { mk.disabled = false; });
      };
    }
    paintFoot();
    return m;
  }

  /* ---------------------------------------------------------
     Builder: the "Make it" step of a lesson (guardians read it)
     --------------------------------------------------------- */
  function mountLessonWork(host, o) {
    style();
    var me = o.me, student = o.student, l = o.lesson, kind = kindOf(l.task), isBuilder = me.role === 'student';
    var ref = WORK().doc(workId(student.id, l.id));
    var data = null, loaded = false, editor = null, editorEditable = null, dead = false, busy = false;
    var label = o.label || l.title || 'Lesson';
    function editable() { return isBuilder && (!data || data.status === 'Draft' || data.status === 'Corrections'); }
    function baseFields() {
      return {
        studentId: student.id, studentName: student.name || '', coachId: student.coachId || '',
        lessonId: l.id, lessonTitle: label, courseId: l.courseId || '', courseName: l.courseName || '',
        topicId: l.topicId || '', topicTitle: l.topicTitle || '', track: l.track || '', kind: kind
      };
    }
    /* The first save creates the doc; anything saved while that is on its way waits for it. */
    var creating = null;
    function save(p) {
      p = Object.assign({}, p, { updatedAt: FV().serverTimestamp() });
      if (data) return ref.update(p);
      if (creating) return creating.then(function () { return ref.update(p); });
      creating = ref.set(Object.assign(baseFields(), p, { status: 'Draft', createdAt: FV().serverTimestamp() }))
        .catch(function (e) { creating = null; throw e; });
      return creating;
    }
    host.innerHTML = '<div class="tc-panel" style="margin-bottom:.8rem"><h3><i class="fas ' + (kind === 'writing' ? 'fa-pen-nib' : 'fa-code') + '"></i> ' + (kind === 'writing' ? 'What to write' : 'What to build') + '</h3>' +
      '<div class="tc-prose tc-plain">' + esc(l.task.brief || '') + '</div></div>' +
      '<div id="twHead"></div><div id="twEd"></div>';
    var headEl = host.querySelector('#twHead'), edEl = host.querySelector('#twEd');
    function paintHead() {
      var st = data && data.status, first = T.firstName(student.name);
      var right = '';
      if (isBuilder) {
        if (editable()) right = '<button type="button" class="tc-btn" data-tw="submit"><i class="fas fa-paper-plane"></i> ' + (st === 'Corrections' ? 'Hand in again' : 'Hand in for marking') + '</button>';
        else if (st === 'Submitted') right = '<span class="tw-note"><i class="fas fa-hourglass-half"></i> With your coach for marking. You can look, but not change it now.</span>';
      }
      headEl.innerHTML = '<div class="tw-bar">' + statePill(st) + (data && data.submittedAt ? '<span class="tw-note">Handed in ' + esc(fmt(data.submittedAt)) + '</span>' : '') + '<span class="grow"></span>' + right + '</div>' +
        '<div class="tw-msg" id="twMsg" role="status"></div>' +
        feedbackHtml(data, isBuilder ? 'You' : first) +
        (!isBuilder && !data ? '<div class="tc-empty">' + esc(first) + ' has not started this yet.</div>' : '') +
        (isBuilder && editable() ? '<p class="tw-note" style="margin:0 0 .6rem">' + (kind === 'writing' ? 'It saves as you write.' : 'It saves as you type. Press Run to see your page. Make folders and upload pictures on the left, then click a picture to use it.') + '</p>' : '');
    }
    function mountEditor() {
      var want = editable();
      if (editor && editorEditable === want) return;
      if (editor) { try { editor.destroy(); } catch (e) { } editor = null; }
      if (!isBuilder && !data) { edEl.innerHTML = ''; return; }
      editorEditable = want;
      var build = Object.assign({ id: ref.id, studentId: student.id }, data || {});
      if (kind === 'writing') {
        if (!want) { edEl.innerHTML = data && data.writingHtml ? '<div class="tw-article">' + T.cleanHtml(data.writingHtml) + '</div>' : ''; return; }
        if (!g.WritingStudio) { edEl.innerHTML = '<div class="tc-empty">The writing pad is not loaded on this page.</div>'; return; }
        editor = g.WritingStudio.mount(edEl, { build: build, me: me, canEdit: want, files: [], onSave: save, imagePath: function (fn) { return 'techWork/' + student.id + '/' + l.id + '/' + fn; } });
      } else {
        if (!g.CodeLab) { edEl.innerHTML = '<div class="tc-empty">The Code IDE is not loaded on this page.</div>'; return; }
        editor = g.CodeLab.mount(edEl, {
          build: build, me: me, canEdit: want, title: label, onSave: save,
          uploadAsset: want ? function (f) {
            var path = 'techWork/' + student.id + '/' + l.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
            var r = firebase.storage().ref(path);
            return r.put(f, { contentType: f.type || undefined, cacheControl: 'public,max-age=31536000' }).then(function () { return r.getDownloadURL(); }).then(function (url) { return { url: url, storagePath: path }; });
          } : null
        });
      }
    }
    async function submit(btn) {
      var msg = host.querySelector('#twMsg');
      if (busy) return; busy = true; btn.disabled = true;
      try {
        if (editor && editor.flush) await editor.flush();
        var snap = await ref.get();
        var cur = snap.exists ? snap.data() : null;
        if (!hasWork(cur, kind)) { msg.textContent = kind === 'writing' ? 'Write something first.' : 'Write some code first.'; msg.style.color = '#b8362a'; busy = false; btn.disabled = false; return; }
        if (!confirm('Hand this in for marking? You cannot change it until your coach has looked at it.')) { busy = false; btn.disabled = false; return; }
        await ref.update({ status: 'Submitted', submittedAt: FV().serverTimestamp(), submitCount: FV().increment(1), updatedAt: FV().serverTimestamp() });
        T.logActivity(me, 'project_saved', 'Handed in ' + label, { origin: 'class' });
        msg.textContent = 'Handed in. Your coach is told.'; msg.style.color = 'var(--brand-deep,#245F5A)';
      } catch (e) { msg.textContent = 'Could not hand it in: ' + T.errMsg(e); msg.style.color = '#b8362a'; btn.disabled = false; }
      busy = false;
    }
    host.addEventListener('click', function (e) { var b = e.target.closest('[data-tw="submit"]'); if (b) submit(b); });
    var unsub = ref.onSnapshot(function (s) {
      if (dead) return;
      data = s.exists ? s.data() : null; loaded = true;
      paintHead(); mountEditor();
    }, function (e) {
      if (dead) return;
      /* No doc yet reads as permission-denied for a builder's own missing doc in some setups: start empty. */
      loaded = true; data = null; paintHead(); mountEditor();
      console.warn('lesson work:', e && e.code);
    });
    return {
      refresh: function () { if (editor && editor.refresh) editor.refresh(); },
      flush: function () { return editor && editor.flush ? editor.flush() : Promise.resolve(); },
      destroy: function () { dead = true; unsub(); if (editor) { try { editor.destroy(); } catch (e) { } } }
    };
  }

  /* ---------------------------------------------------------
     Staff: every hand-in, newest first (per lesson or all)
     --------------------------------------------------------- */
  function mountHandIns(host, o) {
    style(); T.injectStyle();
    var me = o.me, isAdmin = me.role === 'admin', S = { rows: null, f: 'todo', q: '' }, dead = false, unsub = null;
    var byId = {}; (o.students || []).forEach(function (s) { byId[s.id] = s; });
    var q = WORK();
    if (!isAdmin) q = q.where('coachId', '==', me.uid);
    if (o.lessonId) q = q.where('lessonId', '==', o.lessonId);
    else if (isAdmin) q = q.orderBy('updatedAt', 'desc').limit(400);
    unsub = q.onSnapshot(function (s) {
      if (dead) return;
      S.rows = s.docs.map(function (d) { return Object.assign({ id: d.id, ref: d.ref }, d.data()); })
        .sort(function (a, b) { return (T.toDate(b.submittedAt || b.updatedAt) || 0) - (T.toDate(a.submittedAt || a.updatedAt) || 0); });
      paint();
    }, function (e) { if (!dead) host.innerHTML = '<div class="cr-empty">Could not load hand-ins: ' + esc(T.errMsg(e)) + '</div>'; });
    var FILTERS = [['todo', 'To mark'], ['all', 'All'], ['Graded', 'Marked'], ['Corrections', 'Corrections asked'], ['Draft', 'Still working']];
    function paint() {
      if (S.rows === null) { host.innerHTML = '<div class="cr-empty">Loading hand-ins…</div>'; return; }
      var qq = S.q.trim().toLowerCase();
      var list = S.rows.filter(function (r) {
        var okF = S.f === 'all' || (S.f === 'todo' ? r.status === 'Submitted' : r.status === S.f);
        return okF && (!qq || (String(r.studentName) + ' ' + r.lessonTitle + ' ' + r.courseName).toLowerCase().indexOf(qq) !== -1);
      });
      var todo = S.rows.filter(function (r) { return r.status === 'Submitted'; }).length;
      host.innerHTML = '<div class="cr-filters">' + FILTERS.map(function (f) { return '<button type="button" class="cr-btn sm' + (S.f === f[0] ? ' primary' : '') + '" data-hf="' + f[0] + '">' + esc(f[1]) + (f[0] === 'todo' && todo ? ' (' + todo + ')' : '') + '</button>'; }).join('') +
        '<input type="search" data-hq placeholder="Search builder or lesson…" aria-label="Search" value="' + esc(S.q) + '"></div>' +
        (list.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Lesson</th><th>Class</th><th>State</th><th>Handed in</th><th>Score</th><th></th></tr></thead><tbody>' + list.map(function (r) {
          var s = byId[r.studentId], name = (s && s.name) || r.studentName || 'Builder';
          return '<tr><td><b>' + esc(name) + '</b></td><td>' + esc(r.lessonTitle || '') + '<div class="cr-note">' + (r.kind === 'writing' ? 'Writing' : 'Code') + '</div></td><td class="cr-note">' + esc(r.courseName || '') + (r.topicTitle ? ' · ' + esc(r.topicTitle) : '') + '</td>' +
            '<td>' + statePill(r.status) + '</td><td class="cr-note">' + esc(fmt(r.submittedAt)) + '</td><td>' + esc(scoreText(r) || '–') + '</td>' +
            '<td><button type="button" class="cr-btn sm' + (r.status === 'Submitted' ? ' primary' : '') + '" data-open="' + esc(r.id) + '"><i class="fas ' + (r.status === 'Submitted' ? 'fa-pen-nib' : 'fa-eye') + '"></i> ' + (r.status === 'Submitted' ? 'Open and mark' : 'Open') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' :
          '<div class="cr-panel"><div class="cr-empty">' + (S.f === 'todo' ? 'Nothing waiting to be marked.' : 'No class work here yet.') + ' Builders hand in from the lesson’s “Make it” step.</div></div>');
    }
    host.addEventListener('click', function (e) {
      var f = e.target.closest('[data-hf]'); if (f) { S.f = f.dataset.hf; paint(); return; }
      var b = e.target.closest('[data-open]'); if (!b) return;
      var r = (S.rows || []).filter(function (x) { return x.id === b.dataset.open; })[0]; if (!r) return;
      var s = byId[r.studentId];
      db.collection('techLessons').doc(r.lessonId).get().then(function (ls) {
        var lesson = ls.exists ? ls.data() : {};
        openWorkView({ me: me, ref: r.ref, data: r, title: r.lessonTitle, subtitle: (r.courseName || '') + (r.topicTitle ? ' · ' + r.topicTitle : ''), who: (s && s.name) || r.studentName,
          kind: r.kind || kindOf(lesson.task), brief: lesson.task && lesson.task.brief, folder: r.studentId, key: r.lessonId });
      }).catch(function () {
        openWorkView({ me: me, ref: r.ref, data: r, title: r.lessonTitle, who: r.studentName, kind: r.kind, folder: r.studentId, key: r.lessonId });
      });
    });
    host.addEventListener('input', function (e) {
      if (!e.target.hasAttribute('data-hq')) return;
      S.q = e.target.value; var pos = e.target.selectionStart; paint();
      var i = host.querySelector('[data-hq]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { } }
    });
    paint();
    return { destroy: function () { dead = true; if (unsub) unsub(); } };
  }

  g.TechWork = {
    kindOf: kindOf, workId: workId, statePill: statePill, feedbackHtml: feedbackHtml, scoreText: scoreText, hasWork: hasWork, style: style,
    mountLessonWork: mountLessonWork, mountHandIns: mountHandIns, openWorkView: openWorkView, openMarking: openMarking, workPdf: workPdf, textBlocks: textBlocks
  };
})(window);
