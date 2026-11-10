/* =========================================================
   CLASSROOM WORK TOOLS — Paisley Studio   (window.WorkTools)
   ---------------------------------------------------------
   Coding in ordinary classroom homework and classwork, plus the
   read-only "Preview" staff use to see work as students see it.

   The IDE is Paisley VS Code (js/tech/code-lab.js, loaded on demand).
   The Studio Desk turns it on per piece of work under Tools:

     assignments/{aid}.tools.ide = { enabled, codeFiles, codeActive }   (codeFiles = starter code, optional)
     lessons/{lid}.tools.ide     = same, for classwork

   ICT, Computing and Computer Science subjects (any id or name that
   reads that way, so a subject the Studio Desk creates later is caught
   too) get the IDE switched on by default for new work.

   Students: the code autosaves to codeDrafts/{uid}_{itemId} while they
   work and is handed in on the submission itself
   (codeFiles, codeFolders, codeActive, codeAt; see firestore.rules).
   Staff: "Code" opens and runs it; Grade turns it into a PDF for the
   ink grader (InkGrader.open({ source })).

     WorkTools.isIct(subjectId, subjectName)
     WorkTools.ideOf(item) -> the ide tool or null
     WorkTools.hasCode(sub)
     WorkTools.toolsField(host, { tools, subjectId, subjectName, isNew }) -> { value() }
     WorkTools.mountStudentIde(host, { item, sub, uid, cid, kind, readOnly }) -> { payload(), hasCode(), destroy() }
     WorkTools.openCodeView({ sub, item, studentName, onMark })
     WorkTools.inkSource(sub, item, studentName) -> Promise<{ bytes, type, name } | null>
     WorkTools.previewItem(item, { kind })
========================================================= */
(function (global) {
  'use strict';

  var PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  var CODELAB_URL = (function () {
    try { return new URL('../tech/code-lab.js?v=tech17', document.currentScript.src).href; } catch (e) { return '/js/tech/code-lab.js?v=tech17'; }
  })();
  var MAX_CODE_BYTES = 700 * 1024;      /* a submission doc must stay well under Firestore's 1 MB */
  var ICT_RE = /(^|[^a-z])(ict|computing|computer\s*science|computer\s*studies|information\s*(and\s*)?communications?\s*technology|coding|programming)([^a-z]|$)/i;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function U() { return global.ClassroomUI && global.ClassroomUI.util; }
  function okUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function FV() { return firebase.firestore.FieldValue; }
  function toDate(t) { var u = U(); return u ? u.toDate(t) : (t && t.toDate ? t.toDate() : null); }
  function fmtDateTime(t) { var u = U(); return u ? u.fmtDateTime(t) : String(t || ''); }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(s);
    });
  }
  var labP = null;
  function ensureCodeLab() {
    if (global.CodeLab) return Promise.resolve(global.CodeLab);
    if (!labP) labP = loadScript(CODELAB_URL).then(function () {
      if (!global.CodeLab) throw new Error('Paisley VS Code did not load.');
      return global.CodeLab;
    }).catch(function (e) { labP = null; throw e; });
    return labP;
  }
  var pdfP = null;
  function ensurePdfLib() {
    if (global.PDFLib) return Promise.resolve(global.PDFLib);
    if (!pdfP) pdfP = loadScript(PDFLIB_URL).then(function () { return global.PDFLib; }).catch(function (e) { pdfP = null; throw e; });
    return pdfP;
  }

  /* ---------------- detection ---------------- */
  function isIct(subjectId, subjectName) {
    var id = String(subjectId || '').replace(/[-_]+/g, ' ');
    var label = '';
    try { if (subjectId && typeof lmzSubjectLabel === 'function') label = lmzSubjectLabel(subjectId); } catch (e) { }
    return [id, String(subjectName || ''), label].some(function (s) { return s && ICT_RE.test(s); });
  }
  function ideOf(it) { var t = it && it.tools && it.tools.ide; return t && t.enabled ? t : null; }
  function cleanFiles(list) {
    return (Array.isArray(list) ? list : []).filter(function (f) { return f && f.name; }).slice(0, 60).map(function (f) {
      return { name: String(f.name), lang: f.lang || '', content: String(f.content || '') };
    });
  }
  function hasCode(sub) { return !!sub && Array.isArray(sub.codeFiles) && sub.codeFiles.some(function (f) { return f && String(f.content || '').trim(); }); }
  function codeBytes(files) { try { return new Blob([JSON.stringify(files || [])]).size; } catch (e) { return JSON.stringify(files || []).length; } }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.wt-tools{border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:14px;padding:.75rem .85rem;background:var(--surface,#fff)}',
      '.wt-tools-head{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.55rem}',
      '.wt-tools-head label{margin:0!important}',
      '.wt-ict{display:inline-flex;align-items:center;gap:.3rem;font-size:.68rem;font-weight:800;color:#1d6b61;background:rgba(85,191,179,.16);border-radius:99px;padding:.15rem .6rem}',
      '.wt-tool{display:flex!important;gap:.7rem;align-items:flex-start;padding:.65rem .75rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;cursor:pointer;background:var(--paper,#F1F9F7);text-transform:none!important;letter-spacing:0!important;font-weight:600!important;margin:0!important}',
      '.wt-tool:hover{border-color:var(--brand,#55BFB3)}',
      '.wt-tool.on{border-color:var(--brand-deep,#245F5A);background:rgba(85,191,179,.1)}',
      '.wt-tool input{margin-top:.25rem;width:auto!important;accent-color:var(--brand-deep,#245F5A)}',
      '.wt-tool .ic{width:34px;height:34px;border-radius:10px;background:var(--brand-deep,#245F5A);color:#F5C842;display:grid;place-items:center;flex:none}',
      '.wt-tool .tx b{display:block;font-size:.88rem;color:var(--brand-deep,#245F5A)}',
      '.wt-tool .tx small{display:block;font-size:.76rem;color:var(--muted,#5A6E6A);line-height:1.45;margin-top:.1rem}',
      '.wt-starter{margin-top:.6rem;padding:.6rem .75rem;border-radius:12px;border:1px dashed var(--line,rgba(38,51,49,.25));display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}',
      '.wt-starter[hidden]{display:none}',
      '.wt-starter .sum{flex:1;min-width:200px;font-size:.8rem;color:var(--ink,#263331)}',
      '.wt-starter .sum i{color:var(--brand-deep,#245F5A);margin-right:.3rem}',
      '.wt-ide{margin:.4rem 0 .2rem}',
      '.wt-ide .cl-shell{min-height:420px}',
      '.wt-ide-note{display:flex;gap:.5rem;align-items:flex-start;font-size:.78rem;color:var(--muted,#5A6E6A);margin:.4rem 0 .2rem;line-height:1.45}',
      '.wt-ide-note i{color:var(--brand-deep,#245F5A);margin-top:.15rem}',
      '.wt-banner{display:flex;gap:.6rem;align-items:flex-start;padding:.7rem .85rem;border-radius:12px;background:#EEF3FF;border:1px solid #C9D6F7;color:#243b73;font-size:.82rem;line-height:1.45;margin-bottom:.9rem}',
      '.wt-banner i{margin-top:.15rem}',
      '.wt-meta{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.7rem}',
      '.wt-meta span{display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;font-weight:800;padding:.2rem .6rem;border-radius:99px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.wt-h{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--brand-deep,#245F5A);margin:1rem 0 .45rem}',
      '.wt-instr{white-space:pre-wrap;line-height:1.6;font-size:.9rem;background:var(--paper,#F1F9F7);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;padding:.8rem .9rem}',
      '.wt-res{border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.55rem .7rem;margin-bottom:.45rem;background:var(--surface,#fff)}',
      '.wt-res-row{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}',
      '.wt-res-row .nm{flex:1;min-width:140px;font-weight:700;font-size:.86rem;word-break:break-word}',
      '.wt-res-row .nm small{display:block;font-weight:600;color:var(--muted,#5A6E6A);font-size:.72rem}',
      '.wt-res-row > i{color:var(--brand-deep,#245F5A);width:18px;text-align:center}',
      '.wt-view{margin-top:.55rem}',
      '.wt-view iframe{width:100%;height:70vh;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:10px;background:#fff}',
      '.wt-view img{max-width:100%;border-radius:10px;border:1px solid var(--line,rgba(38,51,49,.12))}',
      '.wt-view video,.wt-view audio{width:100%;border-radius:10px}',
      '.wt-hand{display:flex;gap:.5rem;flex-wrap:wrap}',
      '.wt-hand span{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:700;padding:.35rem .7rem;border-radius:10px;background:var(--paper,#F1F9F7);border:1px solid var(--line,rgba(38,51,49,.12))}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------
     Admin: the Tools field in the homework / classwork forms
     --------------------------------------------------------- */
  function toolsField(host, o) {
    injectStyle();
    o = o || {};
    var ict = isIct(o.subjectId, o.subjectName);
    var cur = (o.tools && o.tools.ide) || null;
    var enabled = cur ? !!cur.enabled : (o.isNew !== false && ict);
    var starter = cur && Array.isArray(cur.codeFiles) ? { codeFiles: cleanFiles(cur.codeFiles), codeActive: cur.codeActive || '' } : { codeFiles: [], codeActive: '' };
    host.innerHTML =
      '<div class="wt-tools">' +
        '<div class="wt-tools-head"><label>Tools</label>' +
          (ict ? '<span class="wt-ict"><i class="fas fa-microchip"></i> ' + esc(o.subjectName || 'ICT') + ' subject: Paisley VS Code is suggested</span>' : '') +
        '</div>' +
        '<label class="wt-tool' + (enabled ? ' on' : '') + '"><input type="checkbox" data-wt="ide"' + (enabled ? ' checked' : '') + '>' +
          '<span class="ic"><i class="fas fa-code"></i></span>' +
          '<span class="tx"><b>Paisley VS Code (IDE)</b><small>Students write HTML, CSS and JavaScript, run it and hand in their code. Tutors and the Studio Desk can open it, run it and mark it.</small></span></label>' +
        '<div class="wt-starter"' + (enabled ? '' : ' hidden') + '>' +
          '<div class="sum" data-wt="sum"></div>' +
          '<button type="button" class="cr-btn sm primary" data-wt="edit"><i class="fas fa-pen-to-square"></i> <span>Write starter code</span></button>' +
          '<button type="button" class="cr-btn sm" data-wt="clear"><i class="fas fa-eraser"></i> Remove</button>' +
        '</div>' +
      '</div>';
    var box = host.querySelector('[data-wt="ide"]'), card = host.querySelector('.wt-tool'), panel = host.querySelector('.wt-starter');
    function paint() {
      var n = starter.codeFiles.filter(function (f) { return f.content.trim(); }).length;
      host.querySelector('[data-wt="sum"]').innerHTML = n
        ? '<i class="fas fa-file-code"></i> Starter code: <b>' + n + ' file' + (n === 1 ? '' : 's') + '</b> (' + esc(starter.codeFiles.map(function (f) { return f.name; }).slice(0, 4).join(', ')) + (starter.codeFiles.length > 4 ? '…' : '') + '). Students see this when they open the work.'
        : '<i class="fas fa-file-circle-plus"></i> No starter code: students begin with an empty page. Add code if you want them to start from yours.';
      host.querySelector('[data-wt="edit"] span').textContent = n ? 'Edit starter code' : 'Write starter code';
      host.querySelector('[data-wt="clear"]').style.display = n ? '' : 'none';
    }
    box.addEventListener('change', function () { card.classList.toggle('on', box.checked); panel.hidden = !box.checked; });
    host.querySelector('[data-wt="clear"]').onclick = function () { starter = { codeFiles: [], codeActive: '' }; paint(); };
    host.querySelector('[data-wt="edit"]').onclick = function () {
      editStarter(starter, o.title || 'Starter code').then(function (next) { if (next) { starter = next; paint(); } });
    };
    paint();
    return {
      value: function () {
        return { ide: { enabled: !!box.checked, codeFiles: starter.codeFiles, codeActive: starter.codeActive || '' } };
      }
    };
  }

  function editStarter(starter, title) {
    return new Promise(function (resolve) {
      var u = U(), lab = null, done = false;
      var m = u.openModal({ title: 'Starter code', wide: true, onClose: function () { if (lab) lab.destroy(); if (!done) resolve(null); } });
      m.body.innerHTML = '<div class="wt-ide-note"><i class="fas fa-circle-info"></i><span>Write the code students should start with. Add files with the file button, press Run to check it. Leave it empty if they should start from a blank page.</span></div><div class="wt-ide" id="wtStarterHost"><div class="cr-empty"><i class="fas fa-spinner fa-spin"></i> Opening Paisley VS Code…</div></div>';
      m.foot.innerHTML = '<span class="cr-err" id="wtErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="use"><i class="fas fa-check"></i> Use this code</button>';
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      ensureCodeLab().then(function (CL) {
        var hostEl = m.body.querySelector('#wtStarterHost');
        if (!hostEl) return;
        lab = CL.mount(hostEl, { build: { id: 'starter', codeFiles: starter.codeFiles.length ? starter.codeFiles : null, codeActive: starter.codeActive }, canEdit: true, title: title, onSave: function () { return Promise.resolve(); } });
      }).catch(function (e) { m.body.querySelector('#wtStarterHost').innerHTML = '<div class="cr-empty">' + esc(e.message || e) + '</div>'; });
      m.foot.querySelector('[data-a="use"]').onclick = function () {
        if (!lab) { m.close(); return; }
        Promise.resolve(lab.flush()).catch(function () { }).then(function () {
          var st = lab.state(), files = cleanFiles(st.codeFiles);
          if (codeBytes(files) > MAX_CODE_BYTES / 2) { m.foot.querySelector('#wtErr').textContent = 'The starter code is too large. Keep it under 350 KB.'; return; }
          done = true;
          resolve({ codeFiles: files, codeActive: st.codeActive || '' });
          m.close(true);
        });
      };
    });
  }

  /* ---------------------------------------------------------
     Students: the IDE inside "Hand in my work"
     --------------------------------------------------------- */
  function mountStudentIde(host, o) {
    injectStyle();
    var tool = ideOf(o.item) || {};
    var draftRef = o.uid && o.item && o.item.id ? db.collection('codeDrafts').doc(o.uid + '_' + o.item.id) : null;
    var lab = null, dead = false, latest = null;
    host.innerHTML = '<div class="wt-ide"><div class="cr-empty"><i class="fas fa-spinner fa-spin"></i> Opening Paisley VS Code…</div></div>';
    var slot = host.querySelector('.wt-ide');
    var subAt = o.sub ? ((toDate(o.sub.codeAt || o.sub.updatedAt || o.sub.submittedAt) || { getTime: function () { return 0; } }).getTime()) : 0;

    var seedP = o.readOnly || !draftRef ? Promise.resolve(null) : draftRef.get().then(function (d) { return d.exists ? d.data() : null; }).catch(function () { return null; });
    var ready = Promise.all([seedP, ensureCodeLab()]).then(function (res) {
      if (dead) return;
      var draft = res[0], CL = res[1], seed;
      var draftAt = draft ? ((toDate(draft.codeAt) || { getTime: function () { return 0; } }).getTime()) : 0;
      if (o.readOnly) seed = o.sub;
      else if (draft && hasCode(draft) && (!hasCode(o.sub) || draftAt > subAt)) seed = draft;
      else if (hasCode(o.sub)) seed = o.sub;
      else seed = { codeFiles: tool.codeFiles && tool.codeFiles.length ? tool.codeFiles : null, codeActive: tool.codeActive || '' };
      latest = { codeFiles: cleanFiles(seed && seed.codeFiles), codeFolders: (seed && seed.codeFolders) || [], codeActive: (seed && seed.codeActive) || '' };
      slot.innerHTML = '';
      lab = CL.mount(slot, {
        build: { id: 'cw_' + (o.item && o.item.id), codeFiles: latest.codeFiles.length ? latest.codeFiles : null, codeFolders: latest.codeFolders, codeActive: latest.codeActive },
        canEdit: !o.readOnly, title: (o.item && o.item.title) || 'My code',
        onSave: function (p) {
          latest = { codeFiles: cleanFiles(p.codeFiles), codeFolders: (p.codeFolders || []).slice(0, 60), codeActive: p.codeActive || '' };
          if (!draftRef || o.readOnly) return Promise.resolve();
          if (codeBytes(latest.codeFiles) > MAX_CODE_BYTES) return Promise.reject(new Error('your code is over 700 KB'));
          return draftRef.set({
            studentId: o.uid, itemId: o.item.id, cid: o.cid || '', kind: o.kind || '',
            codeFiles: latest.codeFiles, codeFolders: latest.codeFolders, codeActive: latest.codeActive,
            codeAt: FV().serverTimestamp()
          });
        }
      });
    }).catch(function (e) {
      if (!dead) slot.innerHTML = '<div class="cr-empty"><i class="fas fa-triangle-exclamation"></i> ' + esc(e.message || e) + '</div>';
    });

    return {
      ready: ready,
      payload: function () {
        return ready.then(function () {
          if (!lab) return latest;
          return Promise.resolve(lab.flush()).catch(function () { }).then(function () {
            var st = lab.state();
            return { codeFiles: cleanFiles(st.codeFiles), codeFolders: (st.codeFolders || []).slice(0, 60), codeActive: st.codeActive || '' };
          });
        });
      },
      clearDraft: function () { if (draftRef) return draftRef.delete().catch(function () { }); return Promise.resolve(); },
      destroy: function () { dead = true; if (lab) { try { lab.destroy(); } catch (e) { } lab = null; } }
    };
  }
  function checkCodeSize(p) {
    if (codeBytes(p && p.codeFiles) > MAX_CODE_BYTES) throw new Error('Your code is larger than 700 KB. Split big files or remove pasted pictures and try again.');
  }

  /* ---------------------------------------------------------
     Staff: open, run and mark a student's code
     --------------------------------------------------------- */
  function openCodeView(o) {
    injectStyle();
    var sub = o.sub || {}, lab = null;
    var m = U().openModal({ title: (o.studentName ? o.studentName + ' · ' : '') + ((o.item && o.item.title) || 'Code'), wide: true, onClose: function () { if (lab) lab.destroy(); } });
    var when = sub.submittedAt || sub.updatedAt;
    m.body.innerHTML =
      '<div class="wt-ide-note"><i class="fas fa-code"></i><span>' + (when ? 'Handed in ' + esc(fmtDateTime(when)) + '. ' : '') + 'Press <b>Run</b> to see it working. This is read-only: nothing you do here changes the student’s work.</span></div>' +
      (sub.textAnswer ? '<div class="wt-h">Their written answer</div><div class="wt-instr">' + esc(sub.textAnswer) + '</div>' : '') +
      (okUrl(sub.fileUrl) ? '<div style="margin:.6rem 0"><a class="cr-btn sm" href="' + esc(sub.fileUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-paperclip"></i> ' + esc(sub.fileName || 'Their upload') + '</a></div>' : '') +
      '<div class="wt-h">Their code</div><div class="wt-ide" id="wtViewHost"><div class="cr-empty"><i class="fas fa-spinner fa-spin"></i> Opening Paisley VS Code…</div></div>';
    m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Close</button>' + (o.onMark ? '<button type="button" class="cr-btn primary" data-a="mark"><i class="fas fa-pen-nib"></i> Mark it</button>' : '');
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
    var mk = m.foot.querySelector('[data-a="mark"]');
    if (mk) mk.onclick = function () { m.close(); o.onMark(); };
    ensureCodeLab().then(function (CL) {
      var h = m.body.querySelector('#wtViewHost'); if (!h) return;
      lab = CL.mount(h, { build: { id: 'view_' + (o.item && o.item.id) + '_' + (sub.studentId || ''), codeFiles: cleanFiles(sub.codeFiles), codeFolders: sub.codeFolders || [], codeActive: sub.codeActive || '' }, canEdit: false, title: o.studentName || 'Code' });
    }).catch(function (e) { var h = m.body.querySelector('#wtViewHost'); if (h) h.innerHTML = '<div class="cr-empty">' + esc(e.message || e) + '</div>'; });
  }

  /* The code (and any typed answer) as a PDF the ink grader can mark. */
  function winAnsi(s) {
    return String(s || '').replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/…/g, '...').replace(/\t/g, '  ').replace(/\r/g, '').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
  }
  async function codePdf(o) {
    var L = await ensurePdfLib();
    var doc = await L.PDFDocument.create();
    var sans = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold), mono = await doc.embedFont(L.StandardFonts.Courier);
    var W = 595, H = 842, M = 44, ink = L.rgb(0.15, 0.2, 0.19), deep = L.rgb(0.14, 0.37, 0.35), grey = L.rgb(0.42, 0.47, 0.46), sage = L.rgb(0.9, 0.95, 0.94);
    var page, y;
    function newPage() { page = doc.addPage([W, H]); y = H - M; }
    function need(h) { if (y - h < M + 14) newPage(); }
    function wrap(text, font, size, width) {
      var out = [];
      String(text).split('\n').forEach(function (para) {
        var line = '';
        para.split(/\s+/).forEach(function (w) {
          var t = line ? line + ' ' + w : w;
          if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
        });
        out.push(line);
      });
      return out;
    }
    newPage();
    page.drawText(winAnsi(o.title || 'Code').slice(0, 80), { x: M, y: y, size: 16, font: bold, color: deep }); y -= 20;
    page.drawText(winAnsi([o.who, o.subtitle].filter(Boolean).join('  |  ')).slice(0, 110), { x: M, y: y, size: 9.5, font: sans, color: grey }); y -= 22;
    if (String(o.text || '').trim()) {
      need(30); page.drawText('Written answer', { x: M, y: y, size: 11, font: bold, color: deep }); y -= 16;
      wrap(winAnsi(o.text), sans, 10.5, W - 2 * M).forEach(function (ln) { need(14); page.drawText(ln, { x: M, y: y, size: 10.5, font: sans, color: ink }); y -= 14; });
      y -= 10;
    }
    var size = 8.6, lh = 11.2, gutter = 30, per = Math.floor((W - 2 * M - gutter) / (size * 0.6));
    var files = (o.files || []).filter(function (f) { return String(f.content || '').trim(); });
    files.forEach(function (f) {
      need(40); y -= 4;
      page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: sage });
      page.drawText(winAnsi(f.name).slice(0, 90), { x: M + 6, y: y, size: 10, font: bold, color: deep });
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
    if (!files.length) { need(14); page.drawText('(No code was handed in.)', { x: M, y: y, size: 11, font: sans, color: grey }); }
    var pages = doc.getPages();
    pages.forEach(function (p, i) { var t = 'Page ' + (i + 1) + ' of ' + pages.length; p.drawText(t, { x: W - M - sans.widthOfTextAtSize(t, 8), y: 22, size: 8, font: sans, color: grey }); });
    return doc.save();
  }
  /* For the ink grader: code with no uploaded file is marked as a PDF of the code. */
  function inkSource(sub, item, studentName) {
    if (!hasCode(sub) || okUrl(sub && sub.fileUrl)) return Promise.resolve(null);
    return codePdf({
      title: (item && item.title) || 'Code', who: studentName || (sub && sub.studentName) || '',
      subtitle: [(item && item.subjectName), (item && item.topicTitle)].filter(Boolean).join(' · '),
      text: sub.textAnswer || '', files: sub.codeFiles
    }).then(function (bytes) { return { bytes: bytes, type: 'application/pdf', name: 'code.pdf' }; });
  }

  /* ---------------------------------------------------------
     Preview: the work exactly as students see it, read-only
     --------------------------------------------------------- */
  function download(url, name, btn) {
    var label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading'; }
    fetch(url).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }).then(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = name || 'download';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }).catch(function () { window.open(url, '_blank', 'noopener'); }).then(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    });
  }
  function resourcesOf(it, kind) {
    var out = [];
    var list = Array.isArray(it.attachments) ? it.attachments : [];
    if (!list.length && it.attachedPdfUrl) list = [{ name: it.attachedPdfName || 'Attached PDF', url: it.attachedPdfUrl, type: 'application/pdf' }];
    list.forEach(function (a) {
      if (!a || !okUrl(a.url)) return;
      if (a.kind === 'link') { out.push({ link: true, name: a.name || a.url, url: a.url }); return; }
      out.push({ name: a.name || 'Attachment', url: a.url, type: a.type || a.fileType || '', size: a.size || 0 });
    });
    if (kind === 'exam' && okUrl(it.examPdfUrl) && !list.some(function (a) { return a && a.url === it.examPdfUrl; })) out.unshift({ name: it.examPdfName || 'Exam paper.pdf', url: it.examPdfUrl, type: 'application/pdf' });
    (Array.isArray(it.links) ? it.links : []).forEach(function (l) { if (l && okUrl(l.url)) out.push({ link: true, name: l.label || l.url, url: l.url }); });
    return out;
  }
  function viewKind(r) {
    var n = String(r.name || '').toLowerCase(), t = String(r.type || '').toLowerCase();
    if (/pdf/.test(t) || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\//.test(t) || /\.(jpe?g|png|gif|webp)$/.test(n)) return 'img';
    if (/^video\//.test(t) || /\.(mp4|webm|mov)$/.test(n)) return 'video';
    if (/^audio\//.test(t) || /\.(mp3|wav|m4a|ogg)$/.test(n)) return 'audio';
    return '';
  }
  function previewItem(it, o) {
    injectStyle();
    o = o || {};
    var u = U(), lab = null;
    var kind = o.kind || (it.kind === 'exam' || it.examType ? 'exam' : (it.isClasswork || it.kind === 'lesson' ? 'lesson' : 'assignment'));
    var typeLabel = kind === 'exam' ? 'Exam' : (kind === 'lesson' ? 'Classwork' : 'Homework');
    var due = kind === 'exam' ? (it.submissionDeadline || it.examDate) : it.dueAt;
    var m = u.openModal({ title: 'Preview — ' + (it.title || typeLabel), wide: true, onClose: function () { if (lab) lab.destroy(); } });
    var tool = ideOf(it), res = resourcesOf(it, kind);
    var instr = kind === 'lesson'
      ? (it.content && String(it.content).trim() ? '<div class="cr-prose">' + (global.ClassroomUI && global.ClassroomUI.sanitizeHtml ? global.ClassroomUI.sanitizeHtml(it.content) : esc(it.content)) + '</div>' : '')
      : ((it.description || it.requirements) ? '<div class="wt-instr">' + esc(it.description || it.requirements) + '</div>' : '');
    var h = '<div class="wt-banner"><i class="fas fa-eye"></i><span><b>Student view.</b> This is what your students see. It is read-only: you cannot edit it or hand anything in here. Use Download to keep a copy of any file.</span></div>' +
      '<div class="wt-meta"><span><i class="fas ' + (kind === 'exam' ? 'fa-file-pen' : (kind === 'lesson' ? 'fa-book-open' : 'fa-clipboard-check')) + '"></i> ' + typeLabel + '</span>' +
        (it.subjectName ? '<span><i class="fas fa-layer-group"></i> ' + esc(it.subjectName) + '</span>' : '') +
        (it.topicTitle ? '<span><i class="fas fa-folder"></i> ' + esc(it.topicTitle) + '</span>' : '') +
        (due ? '<span><i class="fas fa-calendar-day"></i> ' + (kind === 'exam' ? 'Submissions by ' : 'Due ') + esc(fmtDateTime(due)) + '</span>' : '<span><i class="fas fa-calendar"></i> No deadline</span>') +
        (tool ? '<span><i class="fas fa-code"></i> Paisley VS Code</span>' : '') +
      '</div>' +
      '<h3 style="margin:.2rem 0 .3rem;color:var(--brand-deep,#245F5A)">' + esc(it.title || typeLabel) + '</h3>' +
      '<div class="wt-h">' + (kind === 'lesson' ? 'Lesson notes' : 'Instructions') + '</div>' + (instr || '<div class="cr-note">No instructions were written for this ' + typeLabel.toLowerCase() + '.</div>') +
      '<div class="wt-h">Files and links</div>' +
      (res.length ? res.map(function (r, i) {
        var vk = r.link ? '' : viewKind(r);
        var icon = r.link ? 'fa-link' : (vk === 'pdf' ? 'fa-file-pdf' : (vk === 'img' ? 'fa-image' : (vk === 'video' ? 'fa-film' : (vk === 'audio' ? 'fa-music' : 'fa-file'))));
        return '<div class="wt-res"><div class="wt-res-row"><i class="fas ' + icon + '"></i><span class="nm">' + esc(r.name) +
          (r.size && u.fmtSize ? '<small>' + esc(u.fmtSize(r.size)) + '</small>' : (r.link ? '<small>' + esc(r.url) + '</small>' : '')) + '</span>' +
          (vk ? '<button type="button" class="cr-btn sm" data-pv="view" data-i="' + i + '"><i class="fas fa-eye"></i> Preview</button>' : '') +
          '<a class="cr-btn sm" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none"><i class="fas fa-arrow-up-right-from-square"></i> Open</a>' +
          (!r.link ? '<button type="button" class="cr-btn sm primary" data-pv="dl" data-i="' + i + '"><i class="fas fa-download"></i> Download</button>' : '') +
          '</div><div class="wt-view" data-v="' + i + '" hidden></div></div>';
      }).join('') : '<div class="cr-note">No files or links are attached.</div>') +
      (tool ? '<div class="wt-h">Paisley VS Code — what students start with</div>' +
        (tool.codeFiles && tool.codeFiles.some(function (f) { return String(f.content || '').trim(); })
          ? '<div class="wt-ide" id="wtPrevIde"><div class="cr-empty"><i class="fas fa-spinner fa-spin"></i> Opening Paisley VS Code…</div></div>'
          : '<div class="cr-note">Students start from an empty page and write their own code.</div>') : '') +
      '<div class="wt-h">What students hand in</div><div class="wt-hand">' +
        (tool ? '<span><i class="fas fa-code"></i> Their code</span>' : '') +
        '<span><i class="fas fa-keyboard"></i> A typed answer</span><span><i class="fas fa-file-arrow-up"></i> A PDF or photo</span>' +
      '</div>';
    m.body.innerHTML = h;
    m.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
    m.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pv]'); if (!b) return;
      var r = res[Number(b.dataset.i)]; if (!r) return;
      if (b.dataset.pv === 'dl') { download(r.url, r.name, b); return; }
      var box = m.body.querySelector('[data-v="' + b.dataset.i + '"]');
      if (!box.hidden) { box.hidden = true; box.innerHTML = ''; b.innerHTML = '<i class="fas fa-eye"></i> Preview'; return; }
      var vk = viewKind(r), src = esc(r.url);
      box.innerHTML = vk === 'pdf' ? '<iframe src="' + src + '#toolbar=0" title="' + esc(r.name) + '"></iframe>'
        : vk === 'img' ? '<img src="' + src + '" alt="' + esc(r.name) + '">'
        : vk === 'video' ? '<video src="' + src + '" controls controlsList="nodownload" playsinline></video>'
        : '<audio src="' + src + '" controls></audio>';
      box.hidden = false;
      b.innerHTML = '<i class="fas fa-eye-slash"></i> Hide';
    });
    var ideHost = m.body.querySelector('#wtPrevIde');
    if (ideHost) ensureCodeLab().then(function (CL) {
      if (!ideHost.isConnected) return;
      ideHost.innerHTML = '';
      lab = CL.mount(ideHost, { build: { id: 'preview_' + it.id, codeFiles: cleanFiles(tool.codeFiles), codeActive: tool.codeActive || '' }, canEdit: false, title: it.title || 'Starter code' });
    }).catch(function (e) { ideHost.innerHTML = '<div class="cr-empty">' + esc(e.message || e) + '</div>'; });
  }

  global.WorkTools = {
    isIct: isIct, ideOf: ideOf, hasCode: hasCode,
    toolsField: toolsField, mountStudentIde: mountStudentIde, checkCodeSize: checkCodeSize,
    openCodeView: openCodeView, inkSource: inkSource, codePdf: codePdf,
    previewItem: previewItem, ensureCodeLab: ensureCodeLab
  };
})(window);
