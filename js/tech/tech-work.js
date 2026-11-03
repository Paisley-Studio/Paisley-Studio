/* =========================================================
   Paisley Tech Studio: class work  (window.TechWork)
   ---------------------------------------------------------
   A lesson (or practice test) can ask builders to make something:
     techLessons/{id}.task = { brief, kind: 'code' | 'writing' }
   The builder does it right there, in Paisley VS Code (CodeLab) or the
   writing pad (WritingStudio), and hands it in. One doc per builder:

     techLessonWork/{uid}_{lessonId}
       { studentId, studentName, coachId, lessonId, lessonTitle, courseId, courseName,
         topicId, topicTitle, track, kind,
         codeFiles, codeFolders, codeAssets, codeActive | writingHtml,
         taskAnswers: { questionId: text }   (answers to task.questions, marked with the work)
         snapshotUrl, snapshotPath, snapshotAt   a picture of the work taken at hand-in
                                                 (takeSnapshot); the family's email shows it
         publishState: '' | requested | approved | declined | unpublished
                   the builder asks to publish handed-in work; their coach or an admin
                   approves (functions make techShowcase/cw_{workId}, a public /tech/p/ link,
                   saved as shareUrl) or declines with publishNote.
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
  function answered(d) { var a = (d && d.taskAnswers) || {}; return Object.keys(a).filter(function (k) { return String(a[k] || '').trim(); }).length; }
  function taskQs(task) { return ((task && task.questions) || []).filter(function (q) { return q && q.id && String(q.text || '').trim(); }); }
  /* The questions and the builder's answers, read-only (staff viewer, family, after hand-in). */
  function answersHtml(qs, ans, title) {
    if (!qs || !qs.length) return '';
    ans = ans || {};
    return '<div class="tw-qs"><h4><i class="fas fa-circle-question"></i> ' + esc(title || 'Questions') + '</h4>' + qs.map(function (q, i) {
      var a = String(ans[q.id] || '').trim();
      return '<div class="tw-q"><div class="lb">' + (i + 1) + '. ' + esc(q.text) + '</div><div class="tw-ans' + (a ? '' : ' none') + '">' + (a ? esc(a) : 'No answer') + '</div></div>';
    }).join('') + '</div>';
  }
  /* ---- Publishing handed-in work ---- */
  var PUB_KEYS_OK = ['Submitted', 'Graded', 'Corrections'];
  function canAskPublish(d) { return !!d && PUB_KEYS_OK.indexOf(d.status) > -1; }
  function shareLink(d) { return d && d.publishState === 'approved' && T.safeUrl(d.shareUrl) ? T.safeUrl(d.shareUrl) : ''; }
  function linkBox(url) {
    return '<div class="tw-share"><input type="text" readonly value="' + esc(url) + '" aria-label="Share link" onclick="this.select()">' +
      '<button type="button" class="tc-btn sm" data-tw="copy" data-url="' + esc(url) + '"><i class="fas fa-copy"></i> Copy link</button>' +
      '<a class="tc-btn light sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i> Open</a></div>';
  }
  /* What the builder (and their family) see about publishing this work. */
  function publishHtml(d, isBuilder, who) {
    if (!canAskPublish(d)) return '';
    var st = d.publishState || '', url = shareLink(d), h = '<div class="tw-pub' + (st === 'approved' ? ' on' : '') + '"><div class="hd"><i class="fas fa-globe"></i> <b>Share it with friends and family</b></div>';
    if (st === 'approved' && url) h += '<p>' + (isBuilder ? 'Published! Anyone with this link can see your work.' : 'Published. Anyone with this link can see ' + esc(who) + '’s work.') + '</p>' + linkBox(url) + (isBuilder ? '<button type="button" class="tc-btn light sm" data-tw="unpub" style="margin-top:.5rem"><i class="fas fa-eye-slash"></i> Take it down</button>' : '');
    else if (st === 'approved') h += '<p><i class="fas fa-spinner fa-spin"></i> Making the link…</p>';
    else if (st === 'requested') h += '<p><span class="tc-pill mid"><i class="fas fa-hourglass-half"></i> Publish request sent</span> ' + (isBuilder ? 'Your coach or the Studio Desk will look at it.' : 'Waiting for the coach.') + '</p>' + (isBuilder ? '<button type="button" class="tc-btn light sm" data-tw="unpub">Cancel the request</button>' : '');
    else if (st === 'declined') h += '<div class="tw-pubnote"><b>Not published yet.</b>' + (d.publishNote ? ' ' + esc(d.publishNote) : '') + (d.publishDecidedByName ? '<small> · ' + esc(d.publishDecidedByName) + '</small>' : '') + '</div>' +
      (isBuilder ? '<button type="button" class="tc-btn sm" data-tw="pubreq" style="margin-top:.5rem"><i class="fas fa-paper-plane"></i> I fixed it, ask again</button>' : '');
    else h += isBuilder ? '<p>Proud of it? Ask to publish it. Your coach or the Studio Desk checks it first, then you get a link to share.</p><button type="button" class="tc-btn sm" data-tw="pubreq"><i class="fas fa-paper-plane"></i> Ask to publish</button>' : '<p>' + esc(who) + ' has not asked to publish this.</p>';
    return h + '</div>';
  }
  function copyText(t, btn) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Copied'; }, function () { prompt('Copy this link', t); });
  }
  function hasWork(d, kind) {
    if (!d) return false;
    if (kind === 'writing') return String(d.writingHtml || '').replace(/<[^>]+>/g, '').trim().length > 0 || /<img/i.test(d.writingHtml || '');
    return (d.codeFiles || []).some(function (f) { return String(f.content || '').trim().length > 0; });
  }

  /* ---------------------------------------------------------
     Snapshot: a picture of the work at hand-in, for the coach,
     the admins' bell and the family's "see what they built" email.
     The page (or the writing) is drawn by html-to-image inside a
     sandboxed frame, so the builder's code never runs with the
     studio's origin; the frame only posts the picture back. (It draws
     through an SVG; html2canvas cannot work there, as it copies the
     page into a nested frame the sandbox will not let it read.)
     If that fails, a plain card with the first lines is drawn.
     --------------------------------------------------------- */
  var SNAP_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js';
  var SNAP_W = 1024, SNAP_H = 640;
  function snapHtml(html) {
    return new Promise(function (resolve) {
      var token = 'snap' + Math.random().toString(36).slice(2), done = false;
      var post = 'function(u){parent.postMessage({paisleySnap:"' + token + '",url:u||""},"*")}';
      var cap = '<script src="' + SNAP_LIB + '"><\/script><script>(function(){var send=' + post + ';function go(){setTimeout(function(){try{' +
        /* a browser paints the body's background over the whole window; the copy has to be told */
        'var de=document.documentElement,hs=getComputedStyle(de),bs=getComputedStyle(document.body),bg=bs.backgroundColor;' +
        'if(hs.backgroundImage==="none"&&hs.backgroundColor==="rgba(0, 0, 0, 0)"){de.style.background=bs.background;}de.style.minHeight="' + SNAP_H + 'px";' +
        'htmlToImage.toJpeg(document.documentElement,{width:' + SNAP_W + ',height:' + SNAP_H + ',canvasWidth:' + SNAP_W + ',canvasHeight:' + SNAP_H + ',pixelRatio:1,quality:0.85,skipFonts:true,' +
        'backgroundColor:bg&&bg!=="rgba(0, 0, 0, 0)"?bg:"#ffffff"}).then(send,function(){send("")})' +
        '}catch(e){send("")}},900)}if(document.readyState==="complete")go();else addEventListener("load",go)})();<\/script>';
      var doc = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, function () { return cap + '</body>'; }) : html + cap;
      var fr = document.createElement('iframe');
      fr.setAttribute('sandbox', 'allow-scripts');
      fr.setAttribute('aria-hidden', 'true'); fr.setAttribute('title', 'Snapshot'); fr.tabIndex = -1;
      fr.style.cssText = 'position:fixed;left:0;top:0;width:' + SNAP_W + 'px;height:' + SNAP_H + 'px;border:0;opacity:0;pointer-events:none;z-index:-1';
      function finish(url) { if (done) return; done = true; g.removeEventListener('message', onMsg); clearTimeout(timer); fr.remove(); resolve(/^data:image\//.test(url || '') ? url : ''); }
      function onMsg(e) { if (e.source === fr.contentWindow && e.data && e.data.paisleySnap === token) finish(e.data.url); }
      g.addEventListener('message', onMsg);
      var timer = setTimeout(function () { finish(''); }, 12000);
      fr.srcdoc = doc;
      document.body.appendChild(fr);
    });
  }
  /* The fallback: the work's first lines on a Paisley card. */
  function snapCard(title, lines, mono) {
    var c = document.createElement('canvas'); c.width = SNAP_W; c.height = SNAP_H;
    var x = c.getContext('2d');
    x.fillStyle = mono ? '#1E2A28' : '#FFFFFF'; x.fillRect(0, 0, SNAP_W, SNAP_H);
    x.fillStyle = '#245F5A'; x.fillRect(0, 0, SNAP_W, 64);
    x.fillStyle = '#FFFFFF'; x.font = 'bold 24px system-ui, sans-serif'; x.fillText(String(title).slice(0, 70), 32, 41);
    x.fillStyle = mono ? '#D8E8E4' : '#263331'; x.font = (mono ? '17px Consolas, Menlo, monospace' : '19px Georgia, serif');
    var y = 104, step = mono ? 24 : 30;
    lines.slice(0, Math.floor((SNAP_H - 110) / step)).forEach(function (ln) { x.fillText(String(ln).replace(/\t/g, '  ').slice(0, mono ? 92 : 84), 32, y); y += step; });
    return c.toDataURL('image/jpeg', 0.85);
  }
  function wrapText(text, width) {
    var out = [];
    String(text).split(/\n+/).forEach(function (para) {
      var line = '';
      para.split(/\s+/).forEach(function (w) { if ((line + ' ' + w).trim().length > width) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
      if (line) out.push(line); out.push('');
    });
    return out;
  }
  /* Returns a data: URL (JPEG), never fails. */
  function takeSnapshot(d, kind, title) {
    d = d || {};
    var plain = function () {
      if (kind === 'writing') {
        var div = document.createElement('div'); div.innerHTML = T.cleanHtml(d.writingHtml || '');
        return snapCard(title, wrapText(div.textContent || '', 84), false);
      }
      var f = (d.codeFiles || []).filter(function (x) { return /\.html?$/i.test(x.name); })[0] || (d.codeFiles || [])[0] || { name: '', content: '' };
      return snapCard(title + (f.name ? ' · ' + f.name : ''), String(f.content || '').split('\n'), true);
    };
    var html = '';
    try {
      if (kind === 'writing') {
        html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:36px 56px;font-family:Georgia,serif;font-size:19px;line-height:1.7;color:#263331;background:#fff}h1,h2,h3{font-family:system-ui,sans-serif;color:#245F5A;line-height:1.25}img{max-width:100%;height:auto}.hd{font:700 13px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#55BFB3;margin-bottom:18px}</style></head><body><div class="hd">' + esc(title) + '</div>' + T.cleanHtml(d.writingHtml || '') + '</body></html>';
      } else if (g.CodeLab && g.CodeLab.buildPreview && (d.codeFiles || []).some(function (x) { return /\.html?$/i.test(x.name); })) {
        html = g.CodeLab.buildPreview(d.codeFiles || [], d.codeActive || '', d.codeAssets || []);
      }
    } catch (e) { html = ''; }
    if (!html) return Promise.resolve(plain());
    return snapHtml(html).then(function (url) { return url || plain(); }, plain);
  }
  /* Uploads the picture beside the builder's other uploads for this lesson. */
  function uploadSnapshot(dataUrl, studentId, lessonId) {
    var path = 'techWork/' + studentId + '/' + lessonId + '/snapshot_' + Date.now() + '.jpg';
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var ref = firebase.storage().ref(path);
      return ref.put(blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' }).then(function () { return ref.getDownloadURL(); });
    }).then(function (url) { return { url: url, path: path }; });
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
      '.tw-step.done b{background:#2EB872;color:#fff}',
      '.tw-pub{margin:.8rem 0;padding:.8rem .9rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;background:#fff;font-size:.86rem}.tw-pub.on{border-color:rgba(46,184,114,.4);background:rgba(46,184,114,.05)}',
      '.tw-pub .hd{display:flex;align-items:center;gap:.45rem;margin-bottom:.35rem;color:var(--brand-deep,#245F5A)}.tw-pub .hd i{color:var(--brand,#55BFB3)}.tw-pub p{margin:.2rem 0 .5rem;color:var(--muted,#5A6E6A);line-height:1.5}',
      '.tw-share{display:flex;gap:.4rem;flex-wrap:wrap}.tw-share input{flex:1;min-width:160px;padding:.45rem .6rem;border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:9px;font:inherit;font-size:.8rem;background:#F7FAF9}',
      '.tw-pubnote{padding:.55rem .7rem;border-radius:10px;background:rgba(243,156,18,.12);color:#7a5200;line-height:1.45}.tw-pubnote small{color:var(--muted,#5A6E6A)}',
      '.tw-pop{display:grid;grid-template-columns:300px minmax(0,1fr);gap:1rem;align-items:start}',
      '.tw-shot{display:flex;align-items:center;gap:.7rem;margin:0 0 .8rem;padding:.45rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;background:#fff;text-decoration:none;color:var(--brand-deep,#245F5A);font-size:.8rem;font-weight:800}.tw-shot img{width:150px;height:94px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line,rgba(38,51,49,.1))}',
      '.tw-ctx{padding:0 0 .85rem;margin:0 0 .85rem;border-bottom:1px solid var(--line,rgba(38,51,49,.1))}',
      '.tw-eyebrow{display:block;font-size:.66rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#C08A00}',
      '.tw-ctx h3{margin:.25rem 0 .5rem;font-size:1.08rem;line-height:1.3;font-weight:800;color:var(--brand-deep,#245F5A)}.tw-ctx h3 span{color:var(--muted,#5A6E6A);font-weight:700}',
      '.tw-qs{margin-top:1rem;padding-top:.85rem;border-top:1px solid var(--line,rgba(38,51,49,.1))}',
      '.tw-qs h4{margin:0 0 .3rem}.tw-qs > p{margin:0 0 .7rem}',
      '.tw-q{margin:0 0 .75rem}.tw-q label,.tw-q .lb{display:block;font-weight:700;font-size:.86rem;line-height:1.4;margin-bottom:.3rem;color:var(--ink,#263331)}',
      '.tw-q textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:10px;padding:.5rem .65rem;font:inherit;font-size:.86rem;line-height:1.45;resize:vertical;background:#fff}',
      '.tw-q textarea:focus{outline:none;border-color:var(--brand,#2E7C74);box-shadow:0 0 0 3px rgba(46,124,116,.14)}',
      '.tw-ans{background:var(--sage,#E5F2EF);border-radius:10px;padding:.5rem .65rem;font-size:.86rem;line-height:1.5;white-space:pre-wrap}.tw-ans.none{background:#fff;border:1px dashed var(--line,rgba(38,51,49,.2));color:var(--muted,#5A6E6A);font-style:italic}',
      '.tw-side{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;padding:1rem;max-height:calc(100vh - 120px);overflow:auto}',
      '.tw-side h4{margin:0 0 .5rem;font-size:.92rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tw-side .tw-bar{flex-direction:column;align-items:stretch;margin:.9rem 0 .4rem}.tw-side .tw-bar .grow{display:none}.tw-side .tw-bar .tc-btn{width:100%}',
      '.tw-side .tw-fb{padding:.8rem .9rem}.tw-side .tw-fb .score{font-size:1.2rem}',
      '.tw-main{min-width:0}.tw-pop .cl-body{height:calc(100vh - 225px);min-height:380px}.tw-pop .tw-article{max-height:calc(100vh - 170px)}',
      '@media(max-width:860px){.tw-pop{grid-template-columns:minmax(0,1fr)}.tw-side{max-height:none}.tw-pop .cl-body{height:auto}}'
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
    var pq = o.questions || [];
    if (pq.length) {
      need(30); page.drawText('Questions', { x: M, y: y, size: 12, font: bold, color: deep }); y -= 18;
      pq.forEach(function (q, i) {
        wrapWords((i + 1) + '. ' + q.text, bold, 10, W - 2 * M).forEach(function (ln) { need(14); page.drawText(ln, { x: M, y: y, size: 10, font: bold, color: ink }); y -= 14; });
        var a = String((o.answers || {})[q.id] || '').trim();
        (a ? a.split(/\n+/) : ['(No answer.)']).forEach(function (para) {
          wrapWords(para, sans, 10.5, W - 2 * M - 14).forEach(function (ln) { need(15); page.drawText(ln, { x: M + 14, y: y, size: 10.5, font: sans, color: a ? ink : grey }); y -= 15; });
        });
        y -= 8;
      });
      y -= 6;
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
      bytes = await workPdf({ title: o.title, who: o.who, kind: o.kind, brief: o.brief, questions: o.questions || [], answers: d.taskAnswers || {}, files: d.codeFiles || [], writingHtml: o.kind === 'doc' ? g.CodeLab.mdHtml(((d.codeFiles || [])[0] || {}).content || '') : d.writingHtml, assets: d.codeAssets || [] });
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
      return '<div id="twPubInfo" style="margin-bottom:.6rem"></div><div class="tw-bar">' + statePill(d.status) + (d.submittedAt ? '<span class="tw-note">Handed in ' + esc(fmt(d.submittedAt)) + (d.submittedByName ? ' by ' + esc(d.submittedByName) : '') + (d.submitCount > 1 ? ' · round ' + d.submitCount : '') + '</span>' : '') +
        (o.subtitle ? '<span class="tw-note grow" style="text-align:right">' + esc(o.subtitle) + '</span>' : '') + '</div>' +
        (d.snapshotUrl && T.safeUrl(d.snapshotUrl) ? '<a class="tw-shot" href="' + esc(T.safeUrl(d.snapshotUrl)) + '" target="_blank" rel="noopener noreferrer" title="Open the picture taken at hand-in"><img src="' + esc(T.safeUrl(d.snapshotUrl)) + '" alt="Picture of the work at hand-in" loading="lazy"><span><i class="fas fa-camera"></i> Picture at hand-in</span></a>' : '') +
        (o.brief ? '<div class="tc-panel" style="padding:.8rem 1rem"><b style="color:var(--brand-deep,#245F5A)">What they had to make</b><div class="tc-plain" style="margin-top:.3rem;font-size:.9rem">' + esc(o.brief) + '</div></div>' : '') +
        ((o.questions || []).length ? '<div class="tc-panel" style="padding:.2rem 1rem .4rem">' + answersHtml(o.questions, d.taskAnswers, 'Their answers').replace('class="tw-qs"', 'class="tw-qs" style="border:0;margin-top:0"') + '</div>' : '') +
        feedbackHtml(d);
    }
    m.body.innerHTML = '<div id="twHead">' + head() + '</div><div id="twWork"></div>';
    var hostW = m.body.querySelector('#twWork');
    if (o.kind === 'writing') hostW.innerHTML = d.writingHtml ? '<div class="tw-article">' + T.cleanHtml(d.writingHtml) + '</div>' : '<div class="tc-empty">Nothing written yet.</div>';
    else if (!g.CodeLab) hostW.innerHTML = '<div class="tc-empty">Paisley VS Code is not loaded on this page.</div>';
    else lab = g.CodeLab.mount(hostW, { build: d, canEdit: false, mode: o.kind === 'doc' ? 'doc' : 'code', title: o.who, collab: o.live ? { ref: o.ref, presence: o.presence, me: { uid: o.me.uid, name: o.me.name } } : null });
    if (o.live) unsub = o.ref.onSnapshot(function (s) { if (s.exists) { d = s.data(); var h = m.body.querySelector('#twHead'); if (h) h.innerHTML = head(); paintFoot(); } }, function () { });
    function decidePublish(k, btn) {
      if (k === 'copy') { copyText(shareLink(d), btn); return; }
      var up = { publishDecidedBy: o.me.uid, publishDecidedByName: o.me.name || '', publishDecidedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
      if (k === 'approve') { if (!confirm('Publish this for anyone with the link to see? Only ' + (o.who ? T.firstName(o.who) + '\u2019s' : 'the builder\u2019s') + ' first name is shown.')) return; up.publishState = 'approved'; up.publishNote = ''; }
      else if (k === 'decline') { var why = prompt('Why not yet? The builder sees this note (for example: add your name to the page, fix the broken picture).', ''); if (why === null) return; up.publishState = 'declined'; up.publishNote = String(why).trim().slice(0, 600); }
      else if (k === 'unpublish') { if (!confirm('Take it down? The share link stops working.')) return; up.publishState = 'unpublished'; }
      btn.disabled = true;
      o.ref.update(up).then(function () { d = Object.assign({}, d, up, { publishDecidedAt: new Date() }); paintFoot(); }).catch(function (e) { btn.disabled = false; alert('Could not save: ' + T.errMsg(e)); });
    }
    function paintFoot() {
      var canMark = d.status && d.status !== 'Draft';
      m.foot.innerHTML = '<span class="tw-note" style="margin-right:auto">' + (canMark ? 'Mark it with ink, give a score and feedback, or ask for corrections. ' + esc(o.familyNote || 'The builder and their family are told.') : 'Not handed in yet. You can watch it, and mark it once it is handed in.') + '</span>' +
        '<button type="button" class="cr-btn" data-x>Close</button>' +
        (d.publishState === 'requested' ? '<button type="button" class="cr-btn" data-pub="decline"><i class="fas fa-rotate-left"></i> Decline publishing</button><button type="button" class="cr-btn primary" data-pub="approve"><i class="fas fa-globe"></i> Approve publishing</button>' : '') +
        (d.publishState === 'approved' ? (shareLink(d) ? '<button type="button" class="cr-btn" data-pub="copy"><i class="fas fa-copy"></i> Copy share link</button>' : '') + '<button type="button" class="cr-btn" data-pub="unpublish"><i class="fas fa-eye-slash"></i> Unpublish</button>' : '') +
        (canMark ? '<button type="button" class="cr-btn primary" data-mark><i class="fas fa-pen-nib"></i> ' + (d.status === 'Graded' ? 'Review the marks' : 'Mark with ink') + '</button>' : '');
      [].forEach.call(m.foot.querySelectorAll('[data-pub]'), function (pb) { pb.onclick = function () { decidePublish(pb.dataset.pub, pb); }; });
      m.foot.querySelector('[data-x]').onclick = function () { m.close(); };
      var mk = m.foot.querySelector('[data-mark]');
      var pubInfo = m.body.querySelector('#twPubInfo');
      if (pubInfo) pubInfo.innerHTML = d.publishState === 'requested' ? '<div class="tw-pubnote"><b>' + esc(o.who || 'The builder') + ' asks to publish this.</b> Approve it to make a public link they can share, or decline it with a note so they can fix it (ask for corrections too if the work needs changes).</div>'
        : d.publishState === 'approved' ? '<div class="tw-pub on" style="margin:0 0 .8rem"><div class="hd"><i class="fas fa-globe"></i> <b>Published</b></div>' + (shareLink(d) ? linkBox(shareLink(d)) : '<p>Making the link…</p>') + '</div>'
        : d.publishState === 'declined' ? '<div class="tw-pubnote"><b>Publishing declined.</b> ' + esc(d.publishNote || '') + '</div>' : '';
      if (mk) mk.onclick = function () {
        mk.disabled = true;
        openMarking({ me: o.me, ref: o.ref, data: d, title: o.title, subtitle: o.subtitle, who: o.who, kind: o.kind, brief: o.brief, questions: o.questions, folder: o.folder, key: o.key,
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
    var briefText = l.task.brief || (kind === 'writing' ? 'Write about what you learnt in this lesson.' : 'Try out what you learnt in this lesson.');
    var qs = taskQs(l.task), answers = null, ansTimer = null, ansSaving = Promise.resolve();
    var toolName = kind === 'writing' ? 'Writing pad' : 'Paisley VS Code';
    /* Which lesson this is, so the work always carries its class, topic and lesson. */
    var ctx = '<div class="tw-ctx"><span class="tw-eyebrow">' + esc(l.courseName || 'Class work') + '</span><h3>' + esc(l.topicTitle || '') + (l.topicTitle ? ' <span>· ' + esc(label) + '</span>' : esc(label)) + '</h3>' +
      '<span class="tc-pill"><i class="fas ' + (kind === 'writing' ? 'fa-pen-nib' : 'fa-code') + '"></i> ' + toolName + '</span>' + (qs.length ? ' <span class="tc-pill"><i class="fas fa-circle-question"></i> ' + qs.length + ' question' + (qs.length === 1 ? '' : 's') + '</span>' : '') + '</div>';
    /* layout 'pop': the lesson, requirements, questions and hand-in on the left; the IDE or writing pad filling the rest. */
    if (o.layout === 'pop') host.innerHTML = '<div class="tw-pop"><aside class="tw-side">' + ctx + '<h4><i class="fas ' + (kind === 'writing' ? 'fa-pen-nib' : 'fa-list-check') + '"></i> ' + (kind === 'writing' ? 'What to write' : 'What to build') + '</h4>' +
      '<div class="tc-prose tc-plain" style="font-size:.9rem">' + esc(briefText) + '</div><div id="twQs"></div><div id="twHead"></div></aside><div class="tw-main" id="twEd"></div></div>';
    else host.innerHTML = '<div class="tc-panel" style="margin-bottom:.8rem">' + ctx + '<h3><i class="fas ' + (kind === 'writing' ? 'fa-pen-nib' : 'fa-code') + '"></i> ' + (kind === 'writing' ? 'What to write' : 'What to build') + '</h3>' +
      '<div class="tc-prose tc-plain">' + esc(briefText) + '</div><div id="twQs"></div></div>' +
      '<div id="twHead"></div><div id="twEd"></div>';
    var qsEl = host.querySelector('#twQs');
    /* The task's questions: typed beside the work, saved as they type, handed in with it. */
    function paintQs() {
      if (!qs.length || !qsEl) return;
      var ed = editable();
      if (ed && qsEl.dataset.ed === '1') return;          /* never repaint under the builder's typing */
      qsEl.dataset.ed = ed ? '1' : '0';
      if (!ed) { answers = null; qsEl.innerHTML = answersHtml(qs, data && data.taskAnswers, isBuilder ? 'Your answers' : 'Questions'); return; }
      answers = Object.assign({}, (data && data.taskAnswers) || {});
      qsEl.innerHTML = '<div class="tw-qs"><h4><i class="fas fa-circle-question"></i> Answer these</h4><p class="tw-note">They save as you type and go in with your work.</p>' + qs.map(function (q, i) {
        return '<div class="tw-q"><label for="twq_' + esc(q.id) + '">' + (i + 1) + '. ' + esc(q.text) + '</label><textarea id="twq_' + esc(q.id) + '" data-twq="' + esc(q.id) + '" rows="3" maxlength="3000" placeholder="Your answer">' + esc(answers[q.id] || '') + '</textarea></div>';
      }).join('') + '</div>';
    }
    function saveAnswers() {
      if (ansTimer) { clearTimeout(ansTimer); ansTimer = null; }
      if (!answers) return ansSaving;
      var copy = {}; qs.forEach(function (q) { if (answers[q.id] != null) copy[q.id] = String(answers[q.id]).slice(0, 3000); });
      ansSaving = ansSaving.then(function () { return save({ taskAnswers: copy }); }).catch(function (e) {
        var msg = host.querySelector('#twMsg'); if (msg) { msg.textContent = 'Could not save your answers: ' + T.errMsg(e); msg.style.color = '#b8362a'; }
      });
      return ansSaving;
    }
    if (qsEl) qsEl.addEventListener('input', function (e) {
      var id = e.target.getAttribute('data-twq'); if (!id || !answers) return;
      answers[id] = e.target.value;
      if (ansTimer) clearTimeout(ansTimer);
      ansTimer = setTimeout(saveAnswers, 700);
    });
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
        feedbackHtml(data, isBuilder ? 'You' : first) + publishHtml(data, isBuilder, first) +
        (!isBuilder && !data ? '<div class="tc-empty">' + esc(first) + ' has not started this yet.</div>' : '') +
        (isBuilder && editable() ? '<p class="tw-note" style="margin:0 0 .6rem">' + (kind === 'writing' ? 'It saves as you write.' : 'It saves as you type. Press Run to see your page. Make a folder such as images or videos, press its Upload button to add files from your computer, then click a file to use it.') + '</p>' : '');
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
        if (!g.CodeLab) { edEl.innerHTML = '<div class="tc-empty">Paisley VS Code is not loaded on this page.</div>'; return; }
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
        await saveAnswers();
        var snap = await ref.get();
        var cur = snap.exists ? snap.data() : null;
        if (!hasWork(cur, kind) && !answered(cur)) { msg.textContent = kind === 'writing' ? 'Write something first.' : 'Write some code first.'; msg.style.color = '#b8362a'; busy = false; btn.disabled = false; return; }
        var left = qs.length - qs.filter(function (q) { return String(((cur && cur.taskAnswers) || {})[q.id] || '').trim(); }).length;
        if (!confirm((left ? 'You have not answered ' + left + ' of the ' + qs.length + ' questions. ' : '') + 'Hand this in for marking? You cannot change it until your coach has looked at it.')) { busy = false; btn.disabled = false; return; }
        /* A picture of the work goes with it, for the coach, the admins and the family. */
        msg.textContent = 'Taking a picture of your work…'; msg.style.color = 'var(--brand-deep,#245F5A)';
        var shot = null;
        try {
          var pic = await takeSnapshot(cur, kind, (l.topicTitle ? l.topicTitle + ' · ' : '') + label);
          shot = await uploadSnapshot(pic, student.id, l.id);
        } catch (e) { console.warn('work snapshot:', e); }
        msg.textContent = 'Handing it in…';
        var up = { status: 'Submitted', submittedAt: FV().serverTimestamp(), submitCount: FV().increment(1), updatedAt: FV().serverTimestamp() };
        if (shot) Object.assign(up, { snapshotUrl: shot.url, snapshotPath: shot.path, snapshotAt: FV().serverTimestamp() });
        await ref.update(up);
        T.logActivity(me, 'project_saved', 'Handed in ' + label, { origin: 'class' });
        msg.textContent = 'Handed in. Your coach and your family are told.'; msg.style.color = 'var(--brand-deep,#245F5A)';
      } catch (e) { msg.textContent = 'Could not hand it in: ' + T.errMsg(e); msg.style.color = '#b8362a'; btn.disabled = false; }
      busy = false;
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tw]'); if (!b) return;
      var k = b.dataset.tw;
      if (k === 'submit') submit(b);
      else if (k === 'copy') copyText(b.dataset.url, b);
      else if ((k === 'pubreq' || k === 'unpub') && isBuilder && data) {
        if (k === 'unpub' && data.publishState === 'approved' && !confirm('Take your work down? The link will stop working.')) return;
        b.disabled = true;
        ref.update({ publishState: k === 'pubreq' ? 'requested' : 'unpublished', publishRequestedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() })
          .then(function () { if (k === 'pubreq') T.logActivity(me, 'publish_requested', 'Asked to publish ' + label, { origin: 'class' }); })
          .catch(function (er) { b.disabled = false; var msg = host.querySelector('#twMsg'); if (msg) { msg.textContent = 'Could not send it: ' + T.errMsg(er); msg.style.color = '#b8362a'; } });
      }
    });
    var unsub = ref.onSnapshot(function (s) {
      if (dead) return;
      data = s.exists ? s.data() : null; loaded = true;
      paintHead(); paintQs(); mountEditor();
    }, function (e) {
      if (dead) return;
      /* No doc yet reads as permission-denied for a builder's own missing doc in some setups: start empty. */
      loaded = true; data = null; paintHead(); paintQs(); mountEditor();
      console.warn('lesson work:', e && e.code);
    });
    return {
      refresh: function () { if (editor && editor.refresh) editor.refresh(); },
      flush: function () { return Promise.all([editor && editor.flush ? editor.flush() : null, ansTimer ? saveAnswers() : null]); },
      destroy: function () { if (ansTimer) saveAnswers(); dead = true; unsub(); if (editor) { try { editor.destroy(); } catch (e) { } } }
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
    var FILTERS = [['todo', 'To mark'], ['publish', 'Publish requests'], ['all', 'All'], ['Graded', 'Marked'], ['Corrections', 'Corrections asked'], ['Draft', 'Still working']];
    function paint() {
      if (S.rows === null) { host.innerHTML = '<div class="cr-empty">Loading hand-ins…</div>'; return; }
      var qq = S.q.trim().toLowerCase();
      var list = S.rows.filter(function (r) {
        var okF = S.f === 'all' || (S.f === 'todo' ? r.status === 'Submitted' : S.f === 'publish' ? r.publishState === 'requested' : r.status === S.f);
        return okF && (!qq || (String(r.studentName) + ' ' + r.lessonTitle + ' ' + r.courseName).toLowerCase().indexOf(qq) !== -1);
      });
      var todo = S.rows.filter(function (r) { return r.status === 'Submitted'; }).length, pubs = S.rows.filter(function (r) { return r.publishState === 'requested'; }).length;
      host.innerHTML = '<div class="cr-filters">' + FILTERS.map(function (f) { return '<button type="button" class="cr-btn sm' + (S.f === f[0] ? ' primary' : '') + '" data-hf="' + f[0] + '">' + esc(f[1]) + (f[0] === 'todo' && todo ? ' (' + todo + ')' : '') + (f[0] === 'publish' && pubs ? ' (' + pubs + ')' : '') + '</button>'; }).join('') +
        '<input type="search" data-hq placeholder="Search builder or lesson…" aria-label="Search" value="' + esc(S.q) + '"></div>' +
        (list.length ? '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Lesson</th><th>Class</th><th>State</th><th>Handed in</th><th>Score</th><th></th></tr></thead><tbody>' + list.map(function (r) {
          var s = byId[r.studentId], name = (s && s.name) || r.studentName || 'Builder';
          return '<tr><td><b>' + esc(name) + '</b></td><td>' + esc(r.lessonTitle || '') + '<div class="cr-note">' + (r.kind === 'writing' ? 'Writing' : 'Code') + '</div></td><td class="cr-note">' + esc(r.courseName || '') + (r.topicTitle ? ' · ' + esc(r.topicTitle) : '') + '</td>' +
            '<td>' + statePill(r.status) + (r.publishState === 'requested' ? ' <span class="tc-pill mid"><i class="fas fa-globe"></i> Wants to publish</span>' : r.publishState === 'approved' ? ' <span class="tc-pill good"><i class="fas fa-globe"></i> Published</span>' : '') + '</td><td class="cr-note">' + esc(fmt(r.submittedAt)) + '</td><td>' + esc(scoreText(r) || '–') + '</td>' +
            '<td><button type="button" class="cr-btn sm' + (r.status === 'Submitted' ? ' primary' : '') + '" data-open="' + esc(r.id) + '"><i class="fas ' + (r.status === 'Submitted' ? 'fa-pen-nib' : 'fa-eye') + '"></i> ' + (r.status === 'Submitted' ? 'Open and mark' : 'Open') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' :
          '<div class="cr-panel"><div class="cr-empty">' + (S.f === 'todo' ? 'Nothing waiting to be marked.' : S.f === 'publish' ? 'Nobody is asking to publish right now.' : 'No class work here yet.') + ' Builders hand in from the lesson’s “Make it” step.</div></div>');
    }
    host.addEventListener('click', function (e) {
      var f = e.target.closest('[data-hf]'); if (f) { S.f = f.dataset.hf; paint(); return; }
      var b = e.target.closest('[data-open]'); if (!b) return;
      var r = (S.rows || []).filter(function (x) { return x.id === b.dataset.open; })[0]; if (!r) return;
      var s = byId[r.studentId];
      db.collection('techLessons').doc(r.lessonId).get().then(function (ls) {
        var lesson = ls.exists ? ls.data() : {};
        openWorkView({ me: me, ref: r.ref, data: r, title: r.lessonTitle, subtitle: (r.courseName || '') + (r.topicTitle ? ' · ' + r.topicTitle : ''), who: (s && s.name) || r.studentName,
          kind: r.kind || kindOf(lesson.task), brief: lesson.task && lesson.task.brief, questions: taskQs(lesson.task), folder: r.studentId, key: r.lessonId });
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
    kindOf: kindOf, workId: workId, taskQs: taskQs, answersHtml: answersHtml, statePill: statePill, feedbackHtml: feedbackHtml, scoreText: scoreText, hasWork: hasWork, style: style,
    takeSnapshot: takeSnapshot, publishHtml: publishHtml, mountLessonWork: mountLessonWork, mountHandIns: mountHandIns, openWorkView: openWorkView, openMarking: openMarking, workPdf: workPdf, textBlocks: textBlocks
  };
})(window);
