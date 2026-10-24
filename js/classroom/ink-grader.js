/* =========================================================
   INK GRADING WORKSPACE — Paisley Studio
   -----------------------------------------------------------
   Full-screen marking overlay used for homework submissions and
   PDF-mode exam attempts (Admin and Tutor portals).

     InkGrader.open({
       docRef,          // Firestore ref of the submission / attempt
       data,            // its current data
       item,            // { title, subjectName, topicTitle, ... }
       cid, itemId,     // classroom id + assignment/exam id (storage path)
       user,            // { uid, name }
       kind,            // 'assignment' | 'exam'
       onDone           // called after Save Draft / Grade closes the screen
     });

   Libraries (CDN only, loaded lazily, no build step):
     pdf.js 3.11.174  - renders the student's PDF
     pdf-lib 1.17.1   - burns the ink into a NEW PDF on Grade
========================================================= */
(function (global) {
  'use strict';

  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

  var SWATCHES = [
    { name: 'Teal', hex: '#55BFB3' },
    { name: 'Deep green', hex: '#245F5A' },
    { name: 'Red', hex: '#E74C3C' },
    { name: 'Black', hex: '#263331' },
    { name: 'Yellow', hex: '#F5C842' }
  ];
  var AUTOSAVE_MS = 3000;
  var AUTOSAVE_STROKES = 20;
  var MAX_INK_BYTES = 900 * 1024;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(s);
    });
  }
  var libsPromise = null;
  function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = Promise.all([
      global.pdfjsLib ? Promise.resolve() : loadScript(PDFJS_URL),
      global.PDFLib ? Promise.resolve() : loadScript(PDFLIB_URL)
    ]).then(function () {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }).catch(function (e) { libsPromise = null; throw e; });
    return libsPromise;
  }
  function fetchBytes(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Could not download the student\u2019s file (' + r.status + ').');
      return r.arrayBuffer();
    });
  }
  function safeName(s) {
    return String(s || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'work';
  }
  function hexToRgb(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function injectStyle() {
    if (document.getElementById('ink-style')) return;
    var st = document.createElement('style');
    st.id = 'ink-style';
    st.textContent = [
      '.ink-root{position:fixed;inset:0;z-index:400;background:var(--paper,#F1F9F7);display:flex;flex-direction:column;font-family:var(--font,inherit);color:var(--ink,#263331)}',
      '.ink-top{display:flex;align-items:center;gap:.6rem;padding:.6rem .9rem;background:var(--surface,#fff);border-bottom:1px solid var(--line,rgba(38,51,49,.1));flex-wrap:wrap}',
      '.ink-top .ttl{flex:1;min-width:180px}',
      '.ink-top .ttl b{display:block;font-size:.95rem;color:var(--brand-deep,#245F5A)}',
      '.ink-top .ttl small{color:var(--muted,#5A6E6A);font-size:.74rem}',
      '.ink-status{font-size:.74rem;color:var(--muted,#5A6E6A);display:inline-flex;align-items:center;gap:.35rem}',
      '.ink-status.bad{color:var(--error,#E74C3C)}',
      '.ink-tools{display:flex;align-items:center;gap:.35rem;padding:.45rem .9rem;background:var(--sage,#E5F2EF);border-bottom:1px solid var(--line,rgba(38,51,49,.1));flex-wrap:wrap}',
      '.ink-tools .sep{width:1px;height:24px;background:var(--line,rgba(38,51,49,.18));margin:0 .25rem}',
      '.ink-btn{min-width:36px;height:36px;padding:0 .6rem;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.1));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:700;font-size:.78rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.4rem}',
      '.ink-btn:hover{border-color:var(--brand,#55BFB3)}',
      '.ink-btn.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.ink-btn:disabled{opacity:.45;cursor:not-allowed}',
      '.ink-btn.primary{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.ink-btn.primary:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3)}',
      '.ink-btn.correction{background:#F5C842;color:#263331;border-color:#F5C842}',
      '.ink-btn.correction:hover{background:#e0b32e}',
      '.ink-sw{width:26px;height:26px;border-radius:50%;border:2px solid var(--surface,#fff);box-shadow:0 0 0 1.5px var(--line,rgba(38,51,49,.25));cursor:pointer;padding:0}',
      '.ink-sw.on{box-shadow:0 0 0 2.5px var(--brand-deep,#245F5A)}',
      '.ink-width{display:inline-flex;align-items:center;gap:.4rem;color:var(--brand-deep,#245F5A)}',
      '.ink-width input{width:110px;accent-color:var(--brand-deep,#245F5A)}',
      '.ink-stage{flex:1;overflow:auto;padding:1rem;display:flex;justify-content:center;align-items:flex-start;background:var(--paper,#F1F9F7)}',
      '.ink-page{position:relative;background:#fff;box-shadow:0 4px 22px rgba(38,51,49,.18);border-radius:4px;line-height:0}',
      '.ink-page canvas{display:block}',
      '.ink-page .ink-over{position:absolute;inset:0;touch-action:none;cursor:crosshair}',
      '.ink-nav{display:flex;align-items:center;gap:.5rem;padding:.4rem .9rem;background:var(--surface,#fff);border-top:1px solid var(--line,rgba(38,51,49,.1));justify-content:center;flex-wrap:wrap}',
      '.ink-nav input{width:56px;padding:.35rem .4rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:8px;font-family:inherit;text-align:center}',
      '.ink-msg{margin:auto;max-width:480px;text-align:center;padding:2rem 1rem;color:var(--muted,#5A6E6A);line-height:1.6}',
      '.ink-text{white-space:pre-wrap;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;padding:1rem;max-width:760px;width:100%;line-height:1.6;font-size:.92rem}',
      '@media (max-width:700px){.ink-btn .lbl{display:none}.ink-top{padding:.5rem}.ink-stage{padding:.4rem}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function open(opts) {
    injectStyle();
    var data = opts.data || {};
    var item = opts.item || {};
    var user = opts.user || { uid: '', name: '' };
    var FV = firebase.firestore.FieldValue;
    var localKey = 'paisley-ink:' + opts.docRef.path;

    var S = {
      pdf: null, imageBlob: null, isImage: false, sourceBytes: null,
      pageCount: 0, pageIdx: 0, ink: { version: 1, pages: [] },
      tool: 'pen', color: SWATCHES[0].hex, width: 4,
      undo: [], redo: [], selected: null,
      drawing: null, dirty: false, strokesSinceSave: 0, saving: false, saveTimer: null,
      closed: false, renderToken: 0, dims: []
    };

    var root = document.createElement('div');
    root.className = 'ink-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="ink-top">' +
        '<button type="button" class="ink-btn" data-a="close" title="Close"><i class="fas fa-xmark"></i></button>' +
        '<div class="ttl"><b>' + esc(data.studentName || 'Student') + '</b><small>' + esc(item.title || '') + (item.subjectName ? ' \u00b7 ' + esc(item.subjectName) : '') + (item.topicTitle ? ' \u00b7 ' + esc(item.topicTitle) : '') + '</small></div>' +
        '<span class="ink-status" id="inkStatus"><i class="fas fa-circle-check"></i> Ready</span>' +
        '<button type="button" class="ink-btn" data-a="draft"><i class="fas fa-floppy-disk"></i><span class="lbl">Save Draft</span></button>' +
        '<button type="button" class="ink-btn primary btn-primary" data-a="grade"><i class="fas fa-check"></i><span class="lbl">Grade</span></button>' +
      '</div>' +
      '<div class="ink-tools" id="inkTools">' +
        '<button type="button" class="ink-btn on" data-tool="pen" title="Pen"><i class="fas fa-pen"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="highlighter" title="Highlighter"><i class="fas fa-highlighter"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="eraser" title="Eraser (removes the stroke you touch)"><i class="fas fa-eraser"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="select" title="Select a stroke, then press delete"><i class="fas fa-arrow-pointer"></i></button>' +
        '<span class="sep"></span>' +
        '<i class="fas fa-palette" style="color:var(--brand-deep,#245F5A)" title="Colour"></i>' +
        SWATCHES.map(function (s, i) { return '<button type="button" class="ink-sw' + (i === 0 ? ' on' : '') + '" data-color="' + s.hex + '" title="' + s.name + '" style="background:' + s.hex + '"></button>'; }).join('') +
        '<span class="sep"></span>' +
        '<label class="ink-width" title="Stroke width"><i class="fas fa-sliders-h"></i><input type="range" id="inkWidth" min="1" max="24" value="4"></label>' +
        '<span class="sep"></span>' +
        '<button type="button" class="ink-btn" data-a="undo" title="Undo"><i class="fas fa-rotate-left"></i></button>' +
        '<button type="button" class="ink-btn" data-a="redo" title="Redo"><i class="fas fa-rotate-right"></i></button>' +
        '<button type="button" class="ink-btn" data-a="delstroke" title="Delete selected stroke"><i class="fas fa-scissors"></i></button>' +
        '<button type="button" class="ink-btn" data-a="clear" title="Clear this page"><i class="fas fa-trash-can"></i></button>' +
      '</div>' +
      '<div class="ink-stage" id="inkStage"><div class="ink-msg"><i class="fas fa-spinner fa-spin"></i> Opening the student\u2019s work\u2026</div></div>' +
      '<div class="ink-nav">' +
        '<button type="button" class="ink-btn" data-a="prev" title="Previous page"><i class="fas fa-chevron-left"></i></button>' +
        '<span>Page <input type="number" id="inkJump" min="1" value="1"> of <b id="inkTotal">1</b></span>' +
        '<button type="button" class="ink-btn" data-a="next" title="Next page"><i class="fas fa-chevron-right"></i></button>' +
      '</div>';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    var stage = root.querySelector('#inkStage');
    var statusEl = root.querySelector('#inkStatus');
    var pageBox = null, baseCanvas = null, overCanvas = null;

    function setStatus(kind, text) {
      var icon = { ok: 'fa-circle-check', saving: 'fa-spinner fa-spin', local: 'fa-triangle-exclamation', err: 'fa-circle-exclamation' }[kind] || 'fa-circle-check';
      statusEl.className = 'ink-status' + (kind === 'err' || kind === 'local' ? ' bad' : '');
      statusEl.innerHTML = '<i class="fas ' + icon + '"></i> ' + esc(text);
    }
    function now() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

    function pageInk(i) {
      while (S.ink.pages.length <= i) S.ink.pages.push({ pageNumber: S.ink.pages.length + 1, strokes: [] });
      return S.ink.pages[i];
    }
    function cleanInk() {
      var out = { version: 1, pages: [] };
      S.ink.pages.forEach(function (p, i) { out.pages.push({ pageNumber: i + 1, strokes: p.strokes || [] }); });
      while (out.pages.length && !out.pages[out.pages.length - 1].strokes.length) out.pages.pop();
      return out;
    }

    function mirrorLocal() {
      try { localStorage.setItem(localKey, JSON.stringify({ at: Date.now(), ink: cleanInk() })); } catch (e) { /* quota */ }
    }
    var mirrorTimer = null;
    function scheduleMirror() { clearTimeout(mirrorTimer); mirrorTimer = setTimeout(mirrorLocal, 400); }

    function markChanged(addedStroke) {
      S.dirty = true;
      if (addedStroke) S.strokesSinceSave++;
      scheduleMirror();
      clearTimeout(S.saveTimer);
      S.saveTimer = setTimeout(function () { saveInk(); }, AUTOSAVE_MS);
      if (S.strokesSinceSave >= AUTOSAVE_STROKES) saveInk();
      syncButtons();
    }

    function saveInk() {
      clearTimeout(S.saveTimer);
      if (S.saving || !S.dirty) return Promise.resolve(true);
      var ink = cleanInk();
      var json = JSON.stringify(ink);
      if (json.length > MAX_INK_BYTES) {
        setStatus('err', 'Ink is too large to sync. Grade now or clear some marks.');
        return Promise.resolve(false);
      }
      S.saving = true; S.dirty = false; S.strokesSinceSave = 0;
      setStatus('saving', 'Saving\u2026');
      return opts.docRef.set({
        inkData: ink, inkUpdatedAt: FV.serverTimestamp(), gradedBy: user.uid, gradedByName: user.name || ''
      }, { merge: true }).then(function () {
        S.saving = false;
        setStatus('ok', 'Saved ' + now());
        if (S.dirty) saveInk();
        return true;
      }).catch(function (e) {
        console.error('ink autosave:', e);
        S.saving = false; S.dirty = true;
        mirrorLocal();
        setStatus('local', 'Offline \u2014 kept on this device, will retry');
        clearTimeout(S.saveTimer);
        S.saveTimer = setTimeout(saveInk, 8000);
        return false;
      });
    }
    function onOnline() { if (S.dirty) saveInk(); }
    window.addEventListener('online', onOnline);
    function onBeforeUnload(e) { if (S.dirty) { mirrorLocal(); e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);

    function layout(dim) {
      var avail = Math.max(280, stage.clientWidth - 24);
      var w = Math.min(avail, 980);
      return { cssW: w, cssH: w * dim.h / dim.w };
    }

    async function renderPage() {
      var token = ++S.renderToken;
      var dim = S.dims[S.pageIdx] || { w: 1, h: 1.414 };
      var L = layout(dim);
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

      stage.innerHTML = '';
      pageBox = document.createElement('div');
      pageBox.className = 'ink-page';
      pageBox.style.width = L.cssW + 'px'; pageBox.style.height = L.cssH + 'px';
      baseCanvas = document.createElement('canvas');
      baseCanvas.width = Math.round(L.cssW * dpr); baseCanvas.height = Math.round(L.cssH * dpr);
      baseCanvas.style.width = L.cssW + 'px'; baseCanvas.style.height = L.cssH + 'px';
      overCanvas = document.createElement('canvas');
      overCanvas.className = 'ink-over';
      overCanvas.width = baseCanvas.width; overCanvas.height = baseCanvas.height;
      overCanvas.style.width = L.cssW + 'px'; overCanvas.style.height = L.cssH + 'px';
      pageBox.appendChild(baseCanvas); pageBox.appendChild(overCanvas);
      stage.appendChild(pageBox);
      bindPointer();

      var bctx = baseCanvas.getContext('2d');
      bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
      try {
        if (S.isImage) {
          var img = await new Promise(function (res, rej) {
            var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('Could not read the image.')); };
            im.src = URL.createObjectURL(S.imageBlob);
          });
          if (token !== S.renderToken) return;
          bctx.drawImage(img, 0, 0, baseCanvas.width, baseCanvas.height);
        } else {
          var page = await S.pdf.getPage(S.pageIdx + 1);
          if (token !== S.renderToken) return;
          var base = page.getViewport({ scale: 1 });
          var vp = page.getViewport({ scale: baseCanvas.width / base.width });
          await page.render({ canvasContext: bctx, viewport: vp }).promise;
        }
      } catch (e) {
        if (token !== S.renderToken) return;
        console.error('render page:', e);
      }
      if (token !== S.renderToken) return;
      redraw();
      root.querySelector('#inkJump').value = String(S.pageIdx + 1);
      syncButtons();
    }

    function drawStroke(ctx, st, W, H, highlight) {
      var pts = st.points || [];
      if (!pts.length) return;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = st.color;
      ctx.lineWidth = Math.max(1, st.width * W / 1000);
      if (st.tool === 'highlighter') { ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'multiply'; }
      ctx.beginPath();
      ctx.moveTo(pts[0].x * W, pts[0].y * H);
      if (pts.length === 1) ctx.lineTo(pts[0].x * W + 0.01, pts[0].y * H);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
      ctx.stroke();
      if (highlight) {
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#245F5A'; ctx.lineWidth = 1.5;
        var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        pts.forEach(function (p) { minx = Math.min(minx, p.x * W); maxx = Math.max(maxx, p.x * W); miny = Math.min(miny, p.y * H); maxy = Math.max(maxy, p.y * H); });
        var pad = st.width * W / 1000 + 4;
        ctx.strokeRect(minx - pad, miny - pad, maxx - minx + 2 * pad, maxy - miny + 2 * pad);
      }
      ctx.restore();
    }
    function redraw(live) {
      if (!overCanvas) return;
      var ctx = overCanvas.getContext('2d');
      var W = overCanvas.width, H = overCanvas.height;
      ctx.clearRect(0, 0, W, H);
      var strokes = pageInk(S.pageIdx).strokes;
      strokes.forEach(function (st, i) { drawStroke(ctx, st, W, H, S.selected === i); });
      if (live) drawStroke(ctx, live, W, H, false);
    }

    function norm(e) {
      var r = overCanvas.getBoundingClientRect();
      return { x: round4(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))), y: round4(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))) };
    }
    function distToStroke(st, p, W, H) {
      var best = 1e9, pts = st.points;
      for (var i = 0; i < pts.length; i++) {
        var ax = pts[i].x * W, ay = pts[i].y * H, bx = (pts[i + 1] || pts[i]).x * W, by = (pts[i + 1] || pts[i]).y * H;
        var px = p.x * W, py = p.y * H, dx = bx - ax, dy = by - ay;
        var t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
        var d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (d < best) best = d;
      }
      return best - st.width * W / 2000;
    }
    function hit(p, reach) {
      var W = overCanvas.getBoundingClientRect().width, H = overCanvas.getBoundingClientRect().height;
      var strokes = pageInk(S.pageIdx).strokes;
      for (var i = strokes.length - 1; i >= 0; i--) if (distToStroke(strokes[i], p, W, H) <= reach) return i;
      return -1;
    }

    function pushUndo(action) { S.undo.push(action); S.redo.length = 0; if (S.undo.length > 300) S.undo.shift(); }

    function bindPointer() {
      overCanvas.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button > 0) return;
        e.preventDefault();
        overCanvas.setPointerCapture(e.pointerId);
        var p = norm(e);
        if (S.tool === 'eraser') { S.drawing = { erase: true }; eraseAt(p); return; }
        if (S.tool === 'select') { var i = hit(p, 10); S.selected = i >= 0 ? i : null; redraw(); syncButtons(); return; }
        var w = S.tool === 'highlighter' ? S.width * 3.2 : S.width;
        S.drawing = { stroke: { tool: S.tool, color: S.color, width: round4(w), points: [p] } };
        redraw(S.drawing.stroke);
      });
      overCanvas.addEventListener('pointermove', function (e) {
        if (!S.drawing) return;
        e.preventDefault();
        var p = norm(e);
        if (S.drawing.erase) { eraseAt(p); return; }
        var pts = S.drawing.stroke.points, last = pts[pts.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.0012) return;
        pts.push(p);
        redraw(S.drawing.stroke);
      });
      function end(e) {
        if (!S.drawing) return;
        if (!S.drawing.erase) {
          var st = S.drawing.stroke;
          pageInk(S.pageIdx).strokes.push(st);
          pushUndo({ t: 'add', page: S.pageIdx, stroke: st });
          S.drawing = null;
          redraw();
          markChanged(true);
        } else {
          S.drawing = null;
        }
      }
      overCanvas.addEventListener('pointerup', end);
      overCanvas.addEventListener('pointercancel', end);
    }
    function eraseAt(p) {
      var i = hit(p, 9);
      if (i < 0) return;
      var strokes = pageInk(S.pageIdx).strokes;
      var removed = strokes.splice(i, 1)[0];
      if (S.selected != null) S.selected = null;
      pushUndo({ t: 'del', page: S.pageIdx, index: i, stroke: removed });
      redraw(); markChanged(false);
    }

    function doUndo() {
      var a = S.undo.pop(); if (!a) return;
      var strokes = pageInk(a.page).strokes;
      if (a.t === 'add') { var k = strokes.lastIndexOf(a.stroke); if (k >= 0) strokes.splice(k, 1); }
      else if (a.t === 'del') strokes.splice(Math.min(a.index, strokes.length), 0, a.stroke);
      else if (a.t === 'clear') pageInk(a.page).strokes = a.strokes.slice();
      S.redo.push(a); S.selected = null;
      if (a.page !== S.pageIdx) { S.pageIdx = a.page; renderPage(); } else redraw();
      markChanged(false);
    }
    function doRedo() {
      var a = S.redo.pop(); if (!a) return;
      var strokes = pageInk(a.page).strokes;
      if (a.t === 'add') strokes.push(a.stroke);
      else if (a.t === 'del') { var k = strokes.indexOf(a.stroke); if (k >= 0) strokes.splice(k, 1); }
      else if (a.t === 'clear') pageInk(a.page).strokes = [];
      S.undo.push(a); S.selected = null;
      if (a.page !== S.pageIdx) { S.pageIdx = a.page; renderPage(); } else redraw();
      markChanged(false);
    }
    function doDeleteSelected() {
      if (S.selected == null) return;
      var strokes = pageInk(S.pageIdx).strokes;
      var removed = strokes.splice(S.selected, 1)[0];
      pushUndo({ t: 'del', page: S.pageIdx, index: S.selected, stroke: removed });
      S.selected = null; redraw(); markChanged(false);
    }
    async function doClear() {
      var cur = pageInk(S.pageIdx).strokes;
      if (!cur.length) return;
      if (!await PaisleyUI.confirm('Clear all marks on this page?')) return;
      pushUndo({ t: 'clear', page: S.pageIdx, strokes: cur.slice() });
      pageInk(S.pageIdx).strokes = []; S.selected = null; redraw(); markChanged(false);
    }
    function goto(i) {
      if (i < 0 || i >= S.pageCount || i === S.pageIdx) { root.querySelector('#inkJump').value = String(S.pageIdx + 1); return; }
      S.pageIdx = i; S.selected = null; renderPage();
    }
    function syncButtons() {
      var q = function (a) { return root.querySelector('[data-a="' + a + '"]'); };
      q('undo').disabled = !S.undo.length; q('redo').disabled = !S.redo.length;
      q('delstroke').disabled = S.selected == null;
      q('prev').disabled = S.pageIdx <= 0; q('next').disabled = S.pageIdx >= S.pageCount - 1;
      root.querySelector('#inkTotal').textContent = String(S.pageCount || 1);
    }

    async function buildGradedPdf() {
      var L = global.PDFLib;
      var ink = cleanInk();
      var doc;
      if (S.isImage) {
        doc = await L.PDFDocument.create();
        var bytes = new Uint8Array(await S.imageBlob.arrayBuffer());
        var img = /png$/i.test(S.imageBlob.type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        var scale = 595 / img.width;
        var pg = doc.addPage([595, img.height * scale]);
        pg.drawImage(img, { x: 0, y: 0, width: 595, height: img.height * scale });
      } else {
        doc = await L.PDFDocument.load(S.sourceBytes, { ignoreEncryption: true });
      }
      var pages = doc.getPages();
      ink.pages.forEach(function (pi, idx) {
        var page = pages[idx]; if (!page || !pi.strokes.length) return;
        var size = page.getSize(), W = size.width, H = size.height;
        var rot = ((page.getRotation().angle % 360) + 360) % 360;
        var dispW = (rot === 90 || rot === 270) ? H : W;
        function map(u, v) {
          if (rot === 90) return { x: v * W, y: u * H };
          if (rot === 180) return { x: W - u * W, y: v * H };
          if (rot === 270) return { x: W * (1 - v), y: H - u * H };
          return { x: u * W, y: H - v * H };
        }
        pi.strokes.forEach(function (st) {
          if (!st.points || !st.points.length) return;
          var c = hexToRgb(st.color);
          var thick = Math.max(0.6, st.width * dispW / 1000);
          var pts = st.points.length === 1 ? [st.points[0], { x: st.points[0].x + 0.0004, y: st.points[0].y }] : st.points;
          var path = '';
          pts.forEach(function (p, k) {
            var m = map(p.x, p.y);
            path += (k ? ' L ' : 'M ') + m.x.toFixed(2) + ' ' + (H - m.y).toFixed(2);
          });
          var o = { x: 0, y: H, borderColor: L.rgb(c.r, c.g, c.b), borderWidth: thick, borderLineCap: L.LineCapStyle.Round };
          if (st.tool === 'highlighter') { o.borderOpacity = 0.35; o.blendMode = L.BlendMode.Multiply; }
          page.drawSvgPath(path, o);
        });
      });
      return doc.save();
    }

    function gradeDialog() {
      var wasGraded = data.status === 'Graded';
      var ov = document.createElement('div');
      ov.className = 'cr-overlay cr-root';
      ov.style.zIndex = '500';
      ov.innerHTML =
        '<div class="cr-modal" role="dialog" aria-modal="true"><div class="cr-modal-head"><h3>' + (wasGraded ? 'Update marks' : 'Grade work') + '</h3>' +
        '<button type="button" class="cr-btn sm" data-x="close"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="cr-modal-body">' +
          '<div class="cr-row2"><div class="cr-field"><label>Score</label><input type="number" id="gScore" min="0" step="any" value="' + (data.grade != null && !isNaN(Number(data.grade)) ? esc(data.grade) : '') + '"></div>' +
          '<div class="cr-field"><label>Max score</label><input type="number" id="gMax" min="0" step="any" value="' + (data.maxScore != null ? esc(data.maxScore) : '') + '"></div></div>' +
          '<div class="cr-field"><label>Feedback</label><textarea id="gFb" rows="5" style="width:100%" placeholder="Write feedback for the student">' + esc(data.feedback || '') + '</textarea></div>' +
          '<div class="cr-note">The student and parent will be emailed and notified. A copy of the work with your ink on it is generated for download.</div>' +
        '</div>' +
        '<div class="cr-modal-foot" style="justify-content:space-between; flex-wrap:wrap;"><div style="display:flex; gap:.5rem; flex-wrap:wrap;">' +
          '<button type="button" class="ink-btn correction" data-a="correction" title="Require student to re-attempt"><i class="fas fa-rotate-left"></i> Request Corrections</button>' +
          '<button type="button" class="ink-btn" data-a="no-result" title="Release feedback without a score">Grade without result</button>' +
        '</div><div style="display:flex; gap:.5rem;">' +
          '<button type="button" class="cr-btn" data-a="cancel">Cancel</button>' +
          '<button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Grade & Release</button>' +
        '</div></div></div>';
      document.body.appendChild(ov);
      var errEl = ov.querySelector('#gErr');
      function close() { ov.remove(); }
      ov.querySelector('[data-x="close"]').onclick = close;
      ov.querySelector('[data-a="cancel"]').onclick = close;

      // Grade with result
      ov.querySelector('[data-a="go"]').onclick = async function () {
        var btn = this;
        var score = parseFloat(ov.querySelector('#gScore').value), max = parseFloat(ov.querySelector('#gMax').value);
        var fb = ov.querySelector('#gFb').value.trim();
        if (isNaN(score) || isNaN(max)) { alert('Enter both the score and the maximum score.'); return; }
        if (max <= 0 || score < 0 || score > max) { alert('The score must be between 0 and the maximum.'); return; }
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Grading...';
        try {
          await finalizeGrade(score, max, fb, 'Graded');
          close();
          finish();
        } catch (e) {
          console.error('grade:', e);
          alert(e.code === 'storage/unauthorized' ? 'You do not have permission to store the graded copy.' : ('Could not grade: ' + (e.message || e)));
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Grade & Release';
        }
      };

      // Grade without result (no score)
      ov.querySelector('[data-a="no-result"]').onclick = async function () {
        var btn = this;
        var fb = ov.querySelector('#gFb').value.trim();
        if (!fb) { alert('Please write feedback when grading without a result.'); return; }
        if (!await PaisleyUI.confirm('Release this feedback without a score?')) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Grading...';
        try {
          await finalizeGrade(null, null, fb, 'Graded');
          close();
          finish();
        } catch (e) {
          console.error('grade:', e);
          alert(e.code === 'storage/unauthorized' ? 'You do not have permission to store the graded copy.' : ('Could not grade: ' + (e.message || e)));
          btn.disabled = false; btn.innerHTML = 'Grade without result';
        }
      };

      // Request Corrections
      ov.querySelector('[data-a="correction"]').onclick = async function () {
        var btn = this;
        var fb = ov.querySelector('#gFb').value.trim();
        if (!fb) { alert('Please write feedback explaining what needs to be corrected.'); return; }
        if (!await PaisleyUI.confirm('Send this back to the student for corrections?')) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        try {
          await finalizeGrade(null, null, fb, 'Corrections');
          close();
          finish();
        } catch (e) {
          console.error('correction:', e);
          alert('Could not request corrections: ' + (e.message || e));
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate-left"></i> Request Corrections';
        }
      };
    }

    async function finalizeGrade(score, max, feedback, status) {
      await saveInkNow();
      var inkNow = cleanInk();
      var gradedFileUrl = '', gradedFileName = '', gradedStoragePath = '';
      var hasInk = inkNow.pages.some(function (p) { return p.strokes.length; });
      var markable = S.pdf || S.isImage;
      if (markable) {
        var bytes = await buildGradedPdf();
        gradedFileName = (status === 'Corrections' ? 'corrections_' : 'graded_') + safeName(data.studentName) + '_' + safeName(item.title) + '.pdf';
        gradedStoragePath = 'graded-submissions/' + opts.cid + '/' + opts.itemId + '/' + (data.studentId || opts.docRef.id) + '/' + gradedFileName;
        var ref = firebase.storage().ref(gradedStoragePath);
        await ref.put(new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        gradedFileUrl = await ref.getDownloadURL();
      }
      
      var update = {
        status: status,
        feedback: feedback,
        gradedBy: user.uid, gradedByName: user.name || '', gradedAt: FV.serverTimestamp(),
        released: true, releasedAt: FV.serverTimestamp(),
        inkData: hasInk ? inkNow : null, inkUpdatedAt: FV.serverTimestamp()
      };
      if (status === 'Graded') {
        update.grade = score;
        update.maxScore = max;
      } else if (status === 'Corrections') {
        update.grade = null;
        update.maxScore = null;
      }
      if (markable) { update.gradedFileUrl = gradedFileUrl; update.gradedFileName = gradedFileName; update.gradedStoragePath = gradedStoragePath; }
      
      await opts.docRef.set(update, { merge: true });
      try { localStorage.removeItem(localKey); } catch (e) { /* ignore */ }
      S.dirty = false;
    }

    function saveInkNow() {
      S.dirty = true;
      return new Promise(function (resolve, reject) {
        (function wait() {
          if (S.saving) { setTimeout(wait, 150); return; }
          saveInk().then(function (ok) { ok ? resolve() : reject(new Error('Could not save the ink. Check your connection and try again.')); });
        })();
      });
    }

    function teardown() {
      S.closed = true;
      clearTimeout(S.saveTimer); clearTimeout(mirrorTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      root.remove();
    }
    function finish() { teardown(); if (opts.onDone) opts.onDone(); }

    async function closeWithSave() {
      if (S.dirty || S.saving) {
        setStatus('saving', 'Saving\u2026');
        try { await saveInkNow(); } catch (e) {
          if (!await PaisleyUI.confirm('The latest marks could not be saved to the server. They are kept on this device and restored next time you open this work. Close anyway?')) return;
        }
      }
      finish();
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tool],[data-color],[data-a]'); if (!t) return;
      if (t.dataset.tool) {
        S.tool = t.dataset.tool; S.selected = null;
        Array.prototype.forEach.call(root.querySelectorAll('[data-tool]'), function (b) { b.classList.toggle('on', b === t); });
        if (overCanvas) overCanvas.style.cursor = S.tool === 'select' ? 'pointer' : (S.tool === 'eraser' ? 'cell' : 'crosshair');
        redraw(); syncButtons();
      } else if (t.dataset.color) {
        S.color = t.dataset.color;
        Array.prototype.forEach.call(root.querySelectorAll('[data-color]'), function (b) { b.classList.toggle('on', b === t); });
        if (S.tool === 'eraser' || S.tool === 'select') root.querySelector('[data-tool="pen"]').click();
      } else {
        var a = t.dataset.a;
        if (a === 'close') closeWithSave();
        else if (a === 'undo') doUndo();
        else if (a === 'redo') doRedo();
        else if (a === 'delstroke') doDeleteSelected();
        else if (a === 'clear') doClear();
        else if (a === 'prev') goto(S.pageIdx - 1);
        else if (a === 'next') goto(S.pageIdx + 1);
        else if (a === 'draft') {
          setStatus('saving', 'Saving draft\u2026');
          saveInkNow().then(function () { setStatus('ok', 'Draft saved ' + now() + ' \u2014 marks not released'); }).catch(function (er) { setStatus('err', er.message); });
        }
        else if (a === 'grade') gradeDialog();
      }
    });
    root.querySelector('#inkWidth').addEventListener('input', function () { S.width = Number(this.value); });
    root.querySelector('#inkJump').addEventListener('change', function () { goto(Number(this.value) - 1); });
    function onKey(e) {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (S.selected != null) { e.preventDefault(); doDeleteSelected(); } }
      else if (e.key === 'ArrowRight') goto(S.pageIdx + 1);
      else if (e.key === 'ArrowLeft') goto(S.pageIdx - 1);
    }
    document.addEventListener('keydown', onKey);
    var resizeT = null;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (S.pageCount) renderPage(); }, 200); }
    window.addEventListener('resize', onResize);

    (async function boot() {
      var server = data.inkData && data.inkData.pages ? data.inkData : null;
      var serverAt = data.inkUpdatedAt && data.inkUpdatedAt.toMillis ? data.inkUpdatedAt.toMillis() : 0;
      var local = null;
      try { local = JSON.parse(localStorage.getItem(localKey) || 'null'); } catch (e) { local = null; }
      if (local && local.ink && local.at > serverAt) { S.ink = local.ink; S.dirty = true; setStatus('local', 'Restored unsaved marks from this device'); }
      else if (server) S.ink = JSON.parse(JSON.stringify(server));
      if (!S.ink.pages) S.ink = { version: 1, pages: [] };

      var url = data.fileUrl || '';
      var type = String(data.fileType || '').toLowerCase();
      var name = String(data.fileName || '').toLowerCase();
      var isPdf = /pdf/.test(type) || /\.pdf$/.test(name);
      var isImg = /^image\//.test(type) || /\.(jpe?g|png|webp)$/.test(name);

      if (!url) {
        stage.innerHTML = data.textAnswer
          ? '<div class="ink-text"><b>Typed answer</b><br><br>' + esc(data.textAnswer) + '</div>'
          : '<div class="ink-msg"><i class="fas fa-file-circle-question" style="font-size:2rem"></i><br>This student has not attached a file.</div>';
        root.querySelector('.ink-tools').style.display = 'none';
        root.querySelector('.ink-nav').style.display = 'none';
        return;
      }
      if (!isPdf && !isImg) {
        stage.innerHTML = '<div class="ink-msg"><i class="fas fa-file" style="font-size:2rem"></i><br>This file type cannot be marked with ink here. ' +
          '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Download it</a>, then give the score and feedback with Grade.</div>';
        root.querySelector('.ink-tools').style.display = 'none';
        root.querySelector('.ink-nav').style.display = 'none';
        return;
      }
      try {
        await ensureLibs();
        if (isImg) {
          var buf = await fetchBytes(url);
          S.isImage = true;
          S.imageBlob = new Blob([buf], { type: /png/.test(type + name) ? 'image/png' : 'image/jpeg' });
          var im = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(S.imageBlob); });
          S.pageCount = 1; S.dims = [{ w: im.naturalWidth, h: im.naturalHeight }];
        } else {
          S.sourceBytes = new Uint8Array(await fetchBytes(url));
          S.pdf = await global.pdfjsLib.getDocument({ data: S.sourceBytes.slice() }).promise;
          S.pageCount = S.pdf.numPages;
          for (var i = 1; i <= S.pageCount; i++) {
            var pg = await S.pdf.getPage(i), vp = pg.getViewport({ scale: 1 });
            S.dims.push({ w: vp.width, h: vp.height });
          }
        }
        root.querySelector('#inkJump').max = String(S.pageCount);
        await renderPage();
        if (!local || local.at <= serverAt) setStatus('ok', server ? 'Marks restored' : 'Ready');
      } catch (e) {
        console.error('ink boot:', e);
        stage.innerHTML = '<div class="ink-msg"><i class="fas fa-triangle-exclamation" style="font-size:2rem;color:var(--error,#E74C3C)"></i><br>' + esc(e.message || 'Could not open this file.') +
          '<br><br>If this keeps happening, the storage bucket may need CORS enabled (see CHANGELOG.md).</div>';
      }
    })();

    return { close: closeWithSave };
  }

  global.InkGrader = { open: open };
})(window);