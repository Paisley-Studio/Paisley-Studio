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
       source,          // optional { bytes, type, name }: work made on the page (code, writing) as a PDF
       onDone           // called after Save Draft / Grade closes the screen
     });

   Tools: pen, highlighter, text, eraser, select (drag to move). The round
   + button opens the tools pill: rotate (90 / 45 either way, 180, 360 back
   to the start, any angle on the slider), crop, delete / restore a page,
   text, cut / copy / paste / delete a mark, and every pen colour.

   Ink is stored per page (inkData.pages[i]):
     strokes: [{ tool: pen|highlighter, color, width, points: [{x,y}] }
               | { tool: 'text', color, size, x, y, text }]
     view:    { rot: degrees clockwise, crop: { x, y, w, h } | null }   (optional)
     removed: true                                                      (page left out of the marked copy)
   Points are 0..1 of the page AS SHOWN (after rotate and crop); widths and
   text sizes are per 1000 of the shown width. Changing the view moves the
   marks with the page, so nothing drifts.

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
    { name: 'Yellow', hex: '#F5C842' },
    { name: 'Blue', hex: '#2F6FDE' },
    { name: 'Purple', hex: '#7B4FD6' },
    { name: 'Orange', hex: '#F08C2E' }
  ];
  var TOP_SWATCHES = 5;                    /* the toolbar shows the first five; the pill shows all */
  var AUTOSAVE_MS = 3000;
  var AUTOSAVE_STROKES = 20;
  var MAX_INK_BYTES = 900 * 1024;
  var MAX_SRC_PX = 4096;                   /* largest side of the offscreen page picture */
  var MIN_CROP = 0.05;
  var TEXT_FONT = 'Helvetica, Arial, sans-serif';
  var TEXT_SIZE = 22;

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
      if (!r.ok) throw new Error('Could not download the student’s file (' + r.status + ').');
      return r.arrayBuffer();
    });
  }
  function safeName(s) {
    return String(s || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'work';
  }
  function hexToRgb(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    if (isNaN(n)) n = 0x263331;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  function round4(n) { return Math.round(n * 10000) / 10000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  /* Standard PDF fonts only know WinAnsi; anything else becomes '?'. */
  function winAnsi(s) {
    return String(s || '').replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/…/g, '...').replace(/\t/g, '  ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  }
  function sniffImage(bytes) {
    var b = new Uint8Array(bytes.slice ? bytes.slice(0, 12) : bytes);
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'jpg';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
    return '';
  }

  /* ---------------- page view geometry (rotate + crop) ---------------- */
  function normAngle(d) { d = Math.round(Number(d) || 0) % 360; if (d < 0) d += 360; return d; }
  function signedAngle(d) { d = normAngle(d); return d > 180 ? d - 360 : d; }
  function fullCrop(c) { return !c || (c.x <= 0.0005 && c.y <= 0.0005 && c.w >= 0.9995 && c.h >= 0.9995); }
  function effView(v) { return { rot: normAngle(v && v.rot), crop: v && v.crop && !fullCrop(v.crop) ? v.crop : { x: 0, y: 0, w: 1, h: 1 } }; }
  function isIdentity(v) { var e = effView(v); return e.rot === 0 && fullCrop(e.crop); }
  function sameView(a, b) { var x = effView(a), y = effView(b); return x.rot === y.rot && JSON.stringify(x.crop) === JSON.stringify(y.crop); }
  function rotBox(dim, deg) {
    var r = deg * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return { W: dim.w * c + dim.h * s, H: dim.w * s + dim.h * c };
  }
  function dispSize(dim, v) { var e = effView(v), B = rotBox(dim, e.rot); return { w: B.W * e.crop.w, h: B.H * e.crop.h }; }
  /* source 0..1 -> shown 0..1 */
  function srcToDisp(pt, dim, v) {
    var e = effView(v), B = rotBox(dim, e.rot), r = e.rot * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    var x = (pt.x - 0.5) * dim.w, y = (pt.y - 0.5) * dim.h;
    var nx = (x * co - y * si + B.W / 2) / B.W, ny = (x * si + y * co + B.H / 2) / B.H;
    return { x: (nx - e.crop.x) / e.crop.w, y: (ny - e.crop.y) / e.crop.h };
  }
  /* shown 0..1 -> source 0..1 */
  function dispToSrc(pt, dim, v) {
    var e = effView(v), B = rotBox(dim, e.rot), r = e.rot * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    var rx = (e.crop.x + pt.x * e.crop.w) * B.W - B.W / 2, ry = (e.crop.y + pt.y * e.crop.h) * B.H - B.H / 2;
    return { x: (rx * co + ry * si) / dim.w + 0.5, y: (-rx * si + ry * co) / dim.h + 0.5 };
  }
  /* Keep the same part of the page when the angle changes (the box around the old crop). */
  function cropForRotation(dim, oldV, newRot) {
    if (fullCrop(effView(oldV).crop)) return null;
    var xs = [], ys = [];
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (c) {
      var q = srcToDisp(dispToSrc({ x: c[0], y: c[1] }, dim, oldV), dim, { rot: newRot });
      xs.push(q.x); ys.push(q.y);
    });
    var x0 = clamp(Math.min.apply(null, xs), 0, 1), y0 = clamp(Math.min.apply(null, ys), 0, 1);
    var x1 = clamp(Math.max.apply(null, xs), 0, 1), y1 = clamp(Math.max.apply(null, ys), 0, 1);
    var c = { x: round4(x0), y: round4(y0), w: round4(Math.max(MIN_CROP, x1 - x0)), h: round4(Math.max(MIN_CROP, y1 - y0)) };
    return fullCrop(c) ? null : c;
  }
  function translateMark(m, dx, dy) {
    var n = clone(m);
    if (n.tool === 'text') { n.x = round4(n.x + dx); n.y = round4(n.y + dy); }
    else n.points = n.points.map(function (p) { return { x: round4(p.x + dx), y: round4(p.y + dy) }; });
    return n;
  }

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
      '.ink-sw{width:26px;height:26px;border-radius:50%;border:2px solid var(--surface,#fff);box-shadow:0 0 0 1.5px var(--line,rgba(38,51,49,.25));cursor:pointer;padding:0;flex:none}',
      '.ink-sw.on{box-shadow:0 0 0 2.5px var(--brand-deep,#245F5A)}',
      '.ink-custom{position:relative;display:inline-block;background:conic-gradient(#E74C3C,#F5C842,#55BFB3,#2F6FDE,#7B4FD6,#E74C3C)}',
      '.ink-custom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}',
      '.ink-custom .dot{position:absolute;inset:7px;border-radius:50%;background:var(--c,#fff);border:1.5px solid #fff;pointer-events:none}',
      '.ink-width{display:inline-flex;align-items:center;gap:.4rem;color:var(--brand-deep,#245F5A)}',
      '.ink-width input{width:110px;accent-color:var(--brand-deep,#245F5A)}',
      '.ink-main{flex:1;min-height:0;position:relative;display:flex}',
      '.ink-stage{flex:1;overflow:auto;padding:1rem;display:flex;justify-content:center;align-items:flex-start;background:var(--paper,#F1F9F7)}',
      '.ink-page{position:relative;background:#fff;box-shadow:0 4px 22px rgba(38,51,49,.18);border-radius:4px;line-height:0;flex:none}',
      '.ink-page canvas{display:block}',
      '.ink-page .ink-over{position:absolute;inset:0;touch-action:none;cursor:crosshair}',
      '.ink-textbox{position:absolute;z-index:3;min-width:140px;min-height:1.6em;padding:2px 4px;margin:-3px 0 0 -5px;border:1.5px dashed var(--brand-deep,#245F5A);border-radius:6px;background:rgba(255,255,255,.9);font-family:' + TEXT_FONT + ';font-weight:600;line-height:1.25;resize:none;overflow:hidden;outline:none;box-shadow:0 4px 14px rgba(38,51,49,.15);white-space:pre}',
      '.ink-gone{position:absolute;inset:0;z-index:2;background:rgba(241,249,247,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.7rem;line-height:1.4;text-align:center;color:var(--brand-deep,#245F5A);font-weight:800;padding:1rem}',
      '.ink-gone i{font-size:2rem;color:var(--muted,#5A6E6A)}',
      '.ink-crop{position:absolute;inset:0;z-index:2;overflow:hidden;touch-action:none;cursor:crosshair}',
      '.ink-crop .box{position:absolute;border:2px solid #fff;outline:1.5px dashed var(--brand-deep,#245F5A);box-shadow:0 0 0 9999px rgba(20,32,30,.52);cursor:move;touch-action:none}',
      '.ink-crop .hd{position:absolute;width:18px;height:18px;background:#fff;border:2.5px solid var(--brand-deep,#245F5A);border-radius:5px;touch-action:none}',
      '.ink-crop .hd[data-h="nw"]{left:-10px;top:-10px;cursor:nwse-resize}.ink-crop .hd[data-h="ne"]{right:-10px;top:-10px;cursor:nesw-resize}',
      '.ink-crop .hd[data-h="sw"]{left:-10px;bottom:-10px;cursor:nesw-resize}.ink-crop .hd[data-h="se"]{right:-10px;bottom:-10px;cursor:nwse-resize}',
      '.ink-cropbar{position:absolute;left:50%;transform:translateX(-50%);bottom:18px;z-index:7;background:var(--brand-deep,#245F5A);color:#fff;border-radius:99px;padding:.4rem .45rem .4rem 1rem;display:flex;gap:.45rem;align-items:center;box-shadow:0 14px 36px rgba(36,95,90,.35);font-size:.8rem;font-weight:700;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center}',
      '.ink-cropbar .ink-chip{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.3)}',
      '.ink-cropbar .ink-chip.go{background:#fff;color:var(--brand-deep,#245F5A);border-color:#fff}',
      /* the + button and its floating pill */
      '.ink-fab{position:absolute;right:22px;bottom:20px;z-index:6;width:56px;height:56px;border-radius:50%;border:0;background:var(--brand-deep,#245F5A);color:#fff;font-size:1.35rem;box-shadow:0 10px 28px rgba(36,95,90,.38);cursor:pointer;display:grid;place-items:center;transition:background .2s,transform .2s}',
      '.ink-fab:hover{background:var(--brand,#55BFB3);transform:translateY(-1px)}',
      '.ink-fab i{transition:transform .25s ease}',
      '.ink-fab.open i{transform:rotate(45deg)}',
      '.ink-fab:focus-visible{outline:3px solid #F5C842;outline-offset:3px}',
      '.ink-pill{position:absolute;right:22px;bottom:88px;z-index:6;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:22px;box-shadow:0 18px 48px rgba(38,51,49,.24);padding:.75rem .85rem;display:flex;flex-wrap:wrap;gap:.7rem 1rem;max-width:min(780px,calc(100% - 44px));transform-origin:bottom right;animation:inkPop .18s ease-out}',
      '.ink-pill[hidden]{display:none}',
      '.ink-grp{display:flex;flex-direction:column;gap:.35rem;min-width:0}',
      '.ink-grp>small{font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.ink-grp .row{display:flex;gap:.3rem;flex-wrap:wrap;align-items:center}',
      '.ink-chip{height:34px;padding:0 .7rem;border-radius:99px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--paper,#F1F9F7);color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:800;font-size:.74rem;display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;white-space:nowrap}',
      '.ink-chip:hover{border-color:var(--brand,#55BFB3)}',
      '.ink-chip.on{background:var(--brand-deep,#245F5A);color:#fff;border-color:var(--brand-deep,#245F5A)}',
      '.ink-chip:disabled{opacity:.4;cursor:not-allowed}',
      '.ink-chip.danger{color:#b8362a}',
      '.ink-angle{display:inline-flex;align-items:center;gap:.45rem;font-size:.74rem;font-weight:800;color:var(--brand-deep,#245F5A);padding:0 .2rem}',
      '.ink-angle input{width:150px;accent-color:var(--brand-deep,#245F5A)}',
      '.ink-angle b{min-width:3.2em;text-align:right}',
      '@keyframes inkPop{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}',
      '.ink-nav{display:flex;align-items:center;gap:.5rem;padding:.4rem .9rem;background:var(--surface,#fff);border-top:1px solid var(--line,rgba(38,51,49,.1));justify-content:center;flex-wrap:wrap}',
      '.ink-nav input{width:56px;padding:.35rem .4rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:8px;font-family:inherit;text-align:center}',
      '.ink-msg{margin:auto;max-width:480px;text-align:center;padding:2rem 1rem;color:var(--muted,#5A6E6A);line-height:1.6}',
      '.ink-banner{display:flex;gap:.7rem;align-items:flex-start;flex-wrap:wrap;padding:.55rem .9rem;background:#EEF3FF;border-bottom:2px solid #6C8EE8;font-size:.82rem;color:#243b73;line-height:1.45}',
      '.ink-banner b.tag{background:#6C8EE8;color:#fff;border-radius:99px;padding:.12rem .6rem;font-size:.72rem;white-space:nowrap}',
      '.ink-banner a{color:#243b73;font-weight:800;text-decoration:underline}',
      '.ink-banner .prevfb{flex:1;min-width:220px;white-space:pre-wrap}',
      '.ink-text{white-space:pre-wrap;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;padding:1rem;max-width:760px;width:100%;line-height:1.6;font-size:.92rem}',
      '@media (max-width:700px){.ink-btn .lbl{display:none}.ink-top{padding:.5rem}.ink-stage{padding:.4rem .4rem 5rem}' +
        '.ink-pill{left:10px;right:10px;bottom:84px;max-width:none;max-height:58vh;overflow:auto;border-radius:18px}.ink-fab{right:14px;bottom:14px}.ink-angle input{width:120px}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function grp(label, inner) { return '<div class="ink-grp"><small>' + esc(label) + '</small><div class="row">' + inner + '</div></div>'; }
  function swatchHtml(list, first) {
    return list.map(function (s) {
      return '<button type="button" class="ink-sw' + (s.hex === first ? ' on' : '') + '" data-color="' + s.hex + '" title="' + esc(s.name) + '" aria-label="' + esc(s.name) + ' pen" style="background:' + s.hex + '"></button>';
    }).join('') +
      '<label class="ink-sw ink-custom" title="Pick any colour"><span class="dot"></span><input type="color" class="ink-color-in" value="' + first + '" aria-label="Pick any pen colour"></label>';
  }

  function open(opts) {
    injectStyle();
    var data = opts.data || {};
    var item = opts.item || {};
    var user = opts.user || { uid: '', name: '' };
    var FV = firebase.firestore.FieldValue;
    var localKey = 'paisley-ink:' + opts.docRef.path;

    // ---- Resubmission awareness -------------------------------------------------
    // One submission document is reused for every attempt. Each time the tutor sends
    // work back, finalizeGrade() appends the finished round to `history`, so:
    //   history.length === number of rounds already sent back.
    function msOf(t) { return t && t.toMillis ? t.toMillis() : (typeof t === 'number' ? t : 0); }
    var hist = Array.isArray(data.history) ? data.history : [];
    var isResub = data.status === 'Submitted' && (hist.length > 0 || !!data.gradedAt);
    var round = hist.length ? hist.length + 1 : (isResub ? 2 : 1);   // legacy: graded once before, no log
    var lastPrev = hist.length ? hist[hist.length - 1] : (isResub ? { feedback: data.feedback || '', markedFileUrl: data.gradedFileUrl || '', markedFileName: data.gradedFileName || '' } : null);
    var submittedMs = msOf(data.submittedAt);

    var S = {
      pdf: null, imageBytes: null, imageKind: '', imgEl: null, isImage: false, sourceBytes: null,
      pageCount: 0, pageIdx: 0, ink: { version: 2, pages: [] },
      tool: 'pen', color: SWATCHES[0].hex, width: 4, textSize: TEXT_SIZE,
      undo: [], redo: [], selected: null, clip: null, clipPage: -1,
      drawing: null, dirty: false, strokesSinceSave: 0, saving: false, saveTimer: null,
      closed: false, renderToken: 0, dims: [],
      cropping: null, textEd: null, editingIdx: null, pillOpen: false, cssW: 0, cssH: 0
    };

    var root = document.createElement('div');
    root.className = 'ink-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="ink-top">' +
        '<button type="button" class="ink-btn" data-a="close" title="Close"><i class="fas fa-xmark"></i></button>' +
        '<div class="ttl"><b>' + esc(data.studentName || 'Student') + '</b><small>' + esc(item.title || '') + (item.subjectName ? ' · ' + esc(item.subjectName) : '') + (item.topicTitle ? ' · ' + esc(item.topicTitle) : '') + '</small></div>' +
        '<span class="ink-status" id="inkStatus"><i class="fas fa-circle-check"></i> Ready</span>' +
        '<button type="button" class="ink-btn" data-a="draft"><i class="fas fa-floppy-disk"></i><span class="lbl">Save Draft</span></button>' +
        '<button type="button" class="ink-btn primary btn-primary" data-a="grade"><i class="fas fa-check"></i><span class="lbl">Grade</span></button>' +
      '</div>' +
      (isResub && lastPrev
        ? '<div class="ink-banner"><b class="tag"><i class="fas fa-rotate"></i> Resubmission – Attempt ' + round + '</b>' +
          '<div class="prevfb"><b>Your feedback last time:</b> ' + esc(lastPrev.feedback || '(none recorded)') + '</div>' +
          (lastPrev.markedFileUrl && /^https:\/\//.test(lastPrev.markedFileUrl) ? '<a href="' + esc(lastPrev.markedFileUrl) + '" target="_blank" rel="noopener noreferrer"><i class="fas fa-file-pen"></i> Your marked copy from last time</a>' : '') +
          '</div>'
        : '') +
      '<div class="ink-tools" id="inkTools">' +
        '<button type="button" class="ink-btn on" data-tool="pen" title="Pen"><i class="fas fa-pen"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="highlighter" title="Highlighter"><i class="fas fa-highlighter"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="text" title="Text: click the page and type"><i class="fas fa-font"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="eraser" title="Eraser (removes the mark you touch)"><i class="fas fa-eraser"></i></button>' +
        '<button type="button" class="ink-btn" data-tool="select" title="Select a mark: drag to move it, or delete, cut or copy it"><i class="fas fa-arrow-pointer"></i></button>' +
        '<span class="sep"></span>' +
        '<i class="fas fa-palette" style="color:var(--brand-deep,#245F5A)" title="Colour"></i>' +
        swatchHtml(SWATCHES.slice(0, TOP_SWATCHES), SWATCHES[0].hex) +
        '<span class="sep"></span>' +
        '<label class="ink-width" title="Pen width"><i class="fas fa-sliders-h"></i><input type="range" id="inkWidth" min="1" max="24" value="4"></label>' +
        '<span class="sep"></span>' +
        '<button type="button" class="ink-btn" data-a="undo" title="Undo (Ctrl+Z)"><i class="fas fa-rotate-left"></i></button>' +
        '<button type="button" class="ink-btn" data-a="redo" title="Redo (Ctrl+Y)"><i class="fas fa-rotate-right"></i></button>' +
        '<button type="button" class="ink-btn" data-a="delstroke" title="Delete the selected mark (Delete)"><i class="fas fa-delete-left"></i></button>' +
        '<button type="button" class="ink-btn" data-a="clear" title="Clear every mark on this page"><i class="fas fa-trash-can"></i></button>' +
      '</div>' +
      '<div class="ink-main">' +
        '<div class="ink-stage" id="inkStage"><div class="ink-msg"><i class="fas fa-spinner fa-spin"></i> Opening the student’s work…</div></div>' +
        '<div class="ink-pill" id="inkPill" role="toolbar" aria-label="More marking tools" hidden>' +
          grp('Rotate page',
            '<button type="button" class="ink-chip" data-a="rot" data-d="-90" title="Turn left 90°"><i class="fas fa-rotate-left"></i> 90°</button>' +
            '<button type="button" class="ink-chip" data-a="rot" data-d="-45" title="Turn left 45°"><i class="fas fa-rotate-left"></i> 45°</button>' +
            '<button type="button" class="ink-chip" data-a="rot" data-d="45" title="Turn right 45°">45° <i class="fas fa-rotate-right"></i></button>' +
            '<button type="button" class="ink-chip" data-a="rot" data-d="90" title="Turn right 90°">90° <i class="fas fa-rotate-right"></i></button>' +
            '<button type="button" class="ink-chip" data-a="rot" data-d="180" title="Turn upside down"><i class="fas fa-arrows-rotate"></i> 180°</button>' +
            '<button type="button" class="ink-chip" data-a="rotreset" title="A full turn: back to how it was handed in"><i class="fas fa-circle-notch"></i> 360°</button>' +
            '<label class="ink-angle" title="Any angle: drag to straighten a photo"><i class="fas fa-compass-drafting"></i><input type="range" id="inkAngle" min="-180" max="180" step="1" value="0" aria-label="Page angle"><b id="inkAngleVal">0°</b></label>') +
          grp('Page',
            '<button type="button" class="ink-chip" data-a="crop" title="Keep only part of the page"><i class="fas fa-crop-simple"></i> Crop</button>' +
            '<button type="button" class="ink-chip danger" data-a="delpage" title="Leave this page out of the marked copy"><i class="fas fa-file-circle-minus"></i> <span>Delete page</span></button>') +
          grp('Marks',
            '<button type="button" class="ink-chip" data-tool="text" title="Type on the work"><i class="fas fa-font"></i> Text</button>' +
            '<button type="button" class="ink-chip" data-a="cut" title="Cut the selected mark (Ctrl+X)"><i class="fas fa-scissors"></i> Cut</button>' +
            '<button type="button" class="ink-chip" data-a="copy" title="Copy the selected mark (Ctrl+C)"><i class="fas fa-copy"></i> Copy</button>' +
            '<button type="button" class="ink-chip" data-a="paste" title="Paste (Ctrl+V), on any page"><i class="fas fa-paste"></i> Paste</button>' +
            '<button type="button" class="ink-chip danger" data-a="delstroke" title="Delete the selected mark"><i class="fas fa-trash-can"></i> Delete</button>') +
          grp('Pen colour', swatchHtml(SWATCHES, SWATCHES[0].hex)) +
          grp('Text size',
            '<label class="ink-angle" title="Size of new text, or of the selected text"><i class="fas fa-text-height"></i><input type="range" id="inkTextSize" min="10" max="64" step="1" value="' + TEXT_SIZE + '" aria-label="Text size"><b id="inkTextSizeVal">' + TEXT_SIZE + '</b></label>') +
        '</div>' +
        '<button type="button" class="ink-fab" data-a="pill" aria-expanded="false" aria-controls="inkPill" title="More tools: rotate, crop, text, cut, colours"><i class="fas fa-plus"></i></button>' +
        '<div class="ink-cropbar" id="inkCropBar" hidden><span><i class="fas fa-crop-simple"></i> Drag the box to the part to keep</span>' +
          '<button type="button" class="ink-chip" data-a="cropcancel">Cancel</button>' +
          '<button type="button" class="ink-chip" data-a="cropfull">Whole page</button>' +
          '<button type="button" class="ink-chip go" data-a="cropapply"><i class="fas fa-check"></i> Apply crop</button></div>' +
      '</div>' +
      '<div class="ink-nav">' +
        '<button type="button" class="ink-btn" data-a="prev" title="Previous page"><i class="fas fa-chevron-left"></i></button>' +
        '<span>Page <input type="number" id="inkJump" min="1" value="1"> of <b id="inkTotal">1</b></span>' +
        '<button type="button" class="ink-btn" data-a="next" title="Next page"><i class="fas fa-chevron-right"></i></button>' +
      '</div>';
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    var stage = root.querySelector('#inkStage');
    var statusEl = root.querySelector('#inkStatus');
    var pillEl = root.querySelector('#inkPill');
    var fabEl = root.querySelector('.ink-fab');
    var cropBar = root.querySelector('#inkCropBar');
    var pageBox = null, baseCanvas = null, overCanvas = null;
    function all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

    function setStatus(kind, text) {
      var icon = { ok: 'fa-circle-check', saving: 'fa-spinner fa-spin', local: 'fa-triangle-exclamation', err: 'fa-circle-exclamation' }[kind] || 'fa-circle-check';
      statusEl.className = 'ink-status' + (kind === 'err' || kind === 'local' ? ' bad' : '');
      statusEl.innerHTML = '<i class="fas ' + icon + '"></i> ' + esc(text);
    }
    function now() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

    function pageInk(i) {
      while (S.ink.pages.length <= i) S.ink.pages.push({ pageNumber: S.ink.pages.length + 1, strokes: [] });
      var p = S.ink.pages[i];
      if (!Array.isArray(p.strokes)) p.strokes = [];
      return p;
    }
    function cleanInk() {
      var out = { version: 2, pages: [] };
      S.ink.pages.forEach(function (p, i) {
        var o = { pageNumber: i + 1, strokes: p.strokes || [] };
        if (p.view && !isIdentity(p.view)) { var e = effView(p.view); o.view = { rot: e.rot, crop: fullCrop(e.crop) ? null : e.crop }; }
        if (p.removed) o.removed = true;
        out.pages.push(o);
      });
      while (out.pages.length) {
        var last = out.pages[out.pages.length - 1];
        if (last.strokes.length || last.view || last.removed) break;
        out.pages.pop();
      }
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
      setStatus('saving', 'Saving…');
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
        setStatus('local', 'Offline — kept on this device, will retry');
        clearTimeout(S.saveTimer);
        S.saveTimer = setTimeout(saveInk, 8000);
        return false;
      });
    }
    function onOnline() { if (S.dirty) saveInk(); }
    window.addEventListener('online', onOnline);
    function onBeforeUnload(e) { if (S.dirty) { mirrorLocal(); e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);

    function layout(ds) {
      var avail = Math.max(280, stage.clientWidth - 24);
      var w = Math.min(avail, 980);
      return { cssW: w, cssH: w * ds.h / ds.w };
    }

    function imageEl() {
      if (S.imgEl) return Promise.resolve(S.imgEl);
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { S.imgEl = im; res(im); };
        im.onerror = function () { rej(new Error('Could not read the image.')); };
        im.src = URL.createObjectURL(new Blob([S.imageBytes], { type: S.imageKind === 'png' ? 'image/png' : (S.imageKind === 'webp' ? 'image/webp' : 'image/jpeg') }));
      });
    }

    /* Paint page i, turned and cropped by `view`, to fill a outW x outH canvas. */
    async function paintSource(ctx, i, view, outW, outH, token) {
      var dim = S.dims[i] || { w: 1, h: 1.414 }, e = effView(view), B = rotBox(dim, e.rot), ds = dispSize(dim, view);
      var sc = outW / ds.w;
      var k = Math.min(sc, MAX_SRC_PX / Math.max(dim.w, dim.h));
      var src = document.createElement('canvas');
      src.width = Math.max(1, Math.round(dim.w * k)); src.height = Math.max(1, Math.round(dim.h * k));
      var sctx = src.getContext('2d');
      sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, src.width, src.height);
      if (S.isImage) {
        var img = await imageEl();
        sctx.drawImage(img, 0, 0, src.width, src.height);
      } else {
        var page = await S.pdf.getPage(i + 1);
        if (token != null && token !== S.renderToken) return false;
        var base = page.getViewport({ scale: 1 });
        await page.render({ canvasContext: sctx, viewport: page.getViewport({ scale: src.width / base.width }) }).promise;
      }
      if (token != null && token !== S.renderToken) return false;
      ctx.save();
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
      ctx.scale(sc, sc);
      ctx.translate(-e.crop.x * B.W, -e.crop.y * B.H);
      ctx.translate(B.W / 2, B.H / 2);
      ctx.rotate(e.rot * Math.PI / 180);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, -dim.w / 2, -dim.h / 2, dim.w, dim.h);
      ctx.restore();
      return true;
    }

    async function renderPage() {
      if (S.textEd) S.textEd.commit();
      var token = ++S.renderToken;
      var i = S.pageIdx, pg = pageInk(i), dim = S.dims[i] || { w: 1, h: 1.414 };
      var view = S.cropping ? { rot: effView(pg.view).rot } : pg.view;
      var L = layout(dispSize(dim, view));
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      S.cssW = L.cssW; S.cssH = L.cssH;

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
      setCursor();

      var bctx = baseCanvas.getContext('2d');
      bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
      try {
        await paintSource(bctx, i, view, baseCanvas.width, baseCanvas.height, token);
      } catch (e) {
        if (token !== S.renderToken) return;
        console.error('render page:', e);
      }
      if (token !== S.renderToken) return;
      redraw();
      if (pg.removed && !S.cropping) {
        var gone = document.createElement('div');
        gone.className = 'ink-gone';
        gone.innerHTML = '<i class="fas fa-file-circle-minus"></i><div>This page is left out of the marked copy.</div>' +
          '<button type="button" class="ink-chip" data-a="delpage"><i class="fas fa-rotate-left"></i> Restore page</button>';
        pageBox.appendChild(gone);
      }
      if (S.cropping) mountCrop();
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
    function textBox(ctx, m, W, H) {
      var fs = Math.max(4, m.size * W / 1000), lines = String(m.text || '').split('\n'), w = 0;
      ctx.save(); ctx.font = '600 ' + fs + 'px ' + TEXT_FONT;
      lines.forEach(function (ln) { w = Math.max(w, ctx.measureText(ln).width); });
      ctx.restore();
      return { x: m.x * W, y: m.y * H, w: Math.max(w, fs * 0.6), h: lines.length * fs * 1.25, fs: fs, lines: lines };
    }
    function drawText(ctx, m, W, H, highlight) {
      var b = textBox(ctx, m, W, H);
      ctx.save();
      ctx.font = '600 ' + b.fs + 'px ' + TEXT_FONT;
      ctx.textBaseline = 'top'; ctx.fillStyle = m.color;
      b.lines.forEach(function (ln, k) { ctx.fillText(ln, b.x, b.y + k * b.fs * 1.25); });
      if (highlight) {
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#245F5A'; ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
      }
      ctx.restore();
    }
    function drawMark(ctx, m, W, H, hl) { if (m.tool === 'text') drawText(ctx, m, W, H, hl); else drawStroke(ctx, m, W, H, hl); }
    function redraw(live) {
      if (!overCanvas) return;
      var ctx = overCanvas.getContext('2d');
      var W = overCanvas.width, H = overCanvas.height;
      ctx.clearRect(0, 0, W, H);
      if (S.cropping) return;
      var strokes = pageInk(S.pageIdx).strokes;
      strokes.forEach(function (st, i) { if (i !== S.editingIdx) drawMark(ctx, st, W, H, S.selected === i); });
      if (live) drawMark(ctx, live, W, H, false);
    }

    function norm(e) {
      var r = overCanvas.getBoundingClientRect();
      return { x: round4(clamp((e.clientX - r.left) / r.width, 0, 1)), y: round4(clamp((e.clientY - r.top) / r.height, 0, 1)) };
    }
    function distToStroke(st, p, W, H) {
      var best = 1e9, pts = st.points || [];
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
      var r = overCanvas.getBoundingClientRect(), W = r.width, H = r.height, ctx = overCanvas.getContext('2d');
      var strokes = pageInk(S.pageIdx).strokes;
      for (var i = strokes.length - 1; i >= 0; i--) {
        var m = strokes[i];
        if (m.tool === 'text') {
          var b = textBox(ctx, m, W, H), px = p.x * W, py = p.y * H, pad = Math.max(4, reach / 2);
          if (px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad) return i;
        } else if (distToStroke(m, p, W, H) <= reach) return i;
      }
      return -1;
    }

    function pushUndo(action) { S.undo.push(action); S.redo.length = 0; if (S.undo.length > 300) S.undo.shift(); }
    function snapshotAction(i, before) { pushUndo({ t: 'page', page: i, before: before, after: clone(pageInk(i)) }); }

    function setCursor() {
      if (!overCanvas) return;
      overCanvas.style.cursor = { select: 'pointer', eraser: 'cell', text: 'text' }[S.tool] || 'crosshair';
    }

    function bindPointer() {
      overCanvas.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button > 0) return;
        e.preventDefault();
        if (S.textEd) { S.textEd.commit(); return; }
        if (S.cropping || pageInk(S.pageIdx).removed) return;
        if (S.pillOpen && window.innerWidth <= 700) setPill(false);
        var p = norm(e);
        if (S.tool === 'text') {
          var ti = hit(p, 6), list = pageInk(S.pageIdx).strokes;
          if (ti >= 0 && list[ti].tool === 'text') openTextEditor(ti); else openTextEditor(-1, p);
          return;
        }
        overCanvas.setPointerCapture(e.pointerId);
        if (S.tool === 'eraser') { S.drawing = { erase: true }; eraseAt(p); return; }
        if (S.tool === 'select') {
          var i = hit(p, 10); S.selected = i >= 0 ? i : null; redraw(); syncButtons();
          if (i >= 0) S.drawing = { move: true, start: p, before: clone(pageInk(S.pageIdx)), orig: clone(pageInk(S.pageIdx).strokes[i]), moved: false };
          return;
        }
        var w = S.tool === 'highlighter' ? S.width * 3.2 : S.width;
        S.drawing = { stroke: { tool: S.tool, color: S.color, width: round4(w), points: [p] } };
        redraw(S.drawing.stroke);
      });
      overCanvas.addEventListener('pointermove', function (e) {
        if (!S.drawing) return;
        e.preventDefault();
        var p = norm(e);
        if (S.drawing.erase) { eraseAt(p); return; }
        if (S.drawing.move) {
          var dx = p.x - S.drawing.start.x, dy = p.y - S.drawing.start.y;
          if (!S.drawing.moved && Math.abs(dx) + Math.abs(dy) < 0.003) return;
          S.drawing.moved = true;
          pageInk(S.pageIdx).strokes[S.selected] = translateMark(S.drawing.orig, dx, dy);
          redraw();
          return;
        }
        var pts = S.drawing.stroke.points, last = pts[pts.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.0012) return;
        pts.push(p);
        redraw(S.drawing.stroke);
      });
      function end() {
        if (!S.drawing) return;
        var d = S.drawing; S.drawing = null;
        if (d.erase) return;
        if (d.move) {
          if (d.moved) { snapshotAction(S.pageIdx, d.before); markChanged(false); }
          return;
        }
        var st = d.stroke;
        pageInk(S.pageIdx).strokes.push(st);
        pushUndo({ t: 'add', page: S.pageIdx, stroke: st });
        redraw();
        markChanged(true);
      }
      overCanvas.addEventListener('pointerup', end);
      overCanvas.addEventListener('pointercancel', end);
      overCanvas.addEventListener('dblclick', function (e) {
        if (S.tool !== 'select' || S.cropping) return;
        var i = hit(norm(e), 8), list = pageInk(S.pageIdx).strokes;
        if (i >= 0 && list[i].tool === 'text') openTextEditor(i);
      });
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

    /* ---------- text on the work ---------- */
    function openTextEditor(index, p) {
      var pi = S.pageIdx, pg = pageInk(pi);
      var existing = index >= 0 ? pg.strokes[index] : null;
      var m = existing ? clone(existing) : { tool: 'text', color: S.color, size: S.textSize, x: p.x, y: p.y, text: '' };
      S.selected = null;
      S.editingIdx = existing ? index : null;
      redraw();
      var ta = document.createElement('textarea');
      ta.className = 'ink-textbox';
      ta.value = m.text || '';
      ta.setAttribute('aria-label', 'Text on the work');
      ta.placeholder = 'Type here…';
      ta.style.left = (m.x * S.cssW) + 'px';
      ta.style.top = (m.y * S.cssH) + 'px';
      ta.style.fontSize = Math.max(8, m.size * S.cssW / 1000) + 'px';
      ta.style.color = m.color;
      ta.style.maxWidth = Math.max(160, S.cssW - m.x * S.cssW - 4) + 'px';
      pageBox.appendChild(ta);
      function fit() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; ta.style.width = 'auto'; ta.style.width = Math.max(140, ta.scrollWidth + 12) + 'px'; }
      fit();
      setTimeout(function () { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { } }, 0);
      var done = false;
      function finish(cancel) {
        if (done) return; done = true;
        S.textEd = null; S.editingIdx = null;
        var txt = ta.value.replace(/\s+$/, '').slice(0, 2000);
        ta.remove();
        if (cancel || S.pageIdx !== pi) { redraw(); return; }
        var page = pageInk(pi), before = clone(page);
        if (!txt.trim()) {
          if (existing) { page.strokes.splice(index, 1); snapshotAction(pi, before); markChanged(false); }
          redraw(); return;
        }
        if (existing && existing.text === txt) { redraw(); return; }
        m.text = txt;
        if (existing) page.strokes[index] = m; else page.strokes.push(m);
        snapshotAction(pi, before);
        markChanged(true);
        if (existing) { S.selected = index; }
        redraw();
      }
      ta.addEventListener('input', fit);
      ta.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); finish(true); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(false); }
      });
      ta.addEventListener('blur', function () { finish(false); });
      S.textEd = { commit: function () { finish(false); }, cancel: function () { finish(true); } };
    }

    /* ---------- undo / redo ---------- */
    /* By reference first; a page-level undo swaps in copies, so fall back to matching the content. */
    function findMark(list, m) {
      var k = list.lastIndexOf(m); if (k >= 0) return k;
      var j = JSON.stringify(m);
      for (var i = list.length - 1; i >= 0; i--) if (JSON.stringify(list[i]) === j) return i;
      return -1;
    }
    function viewChanged(a) { return a.t === 'page' && (!sameView(a.before.view, a.after.view) || !!a.before.removed !== !!a.after.removed); }
    function afterHistory(a) {
      S.selected = null;
      if (a.page !== S.pageIdx) { S.pageIdx = a.page; renderPage(); }
      else if (viewChanged(a)) renderPage();
      else redraw();
      markChanged(false);
    }
    function doUndo() {
      if (S.textEd) S.textEd.commit();
      var a = S.undo.pop(); if (!a) return;
      var strokes = pageInk(a.page).strokes;
      if (a.t === 'add') { var k = findMark(strokes, a.stroke); if (k >= 0) strokes.splice(k, 1); }
      else if (a.t === 'del') strokes.splice(Math.min(a.index, strokes.length), 0, a.stroke);
      else if (a.t === 'clear') pageInk(a.page).strokes = a.strokes.slice();
      else if (a.t === 'page') S.ink.pages[a.page] = clone(a.before);
      S.redo.push(a);
      afterHistory(a);
    }
    function doRedo() {
      if (S.textEd) S.textEd.commit();
      var a = S.redo.pop(); if (!a) return;
      var strokes = pageInk(a.page).strokes;
      if (a.t === 'add') strokes.push(a.stroke);
      else if (a.t === 'del') { var k = findMark(strokes, a.stroke); if (k >= 0) strokes.splice(k, 1); }
      else if (a.t === 'clear') pageInk(a.page).strokes = [];
      else if (a.t === 'page') S.ink.pages[a.page] = clone(a.after);
      S.undo.push(a);
      afterHistory(a);
    }

    /* ---------- marks: delete, cut, copy, paste, recolour ---------- */
    function doDeleteSelected() {
      if (S.selected == null) return;
      var strokes = pageInk(S.pageIdx).strokes;
      var removed = strokes.splice(S.selected, 1)[0];
      pushUndo({ t: 'del', page: S.pageIdx, index: S.selected, stroke: removed });
      S.selected = null; redraw(); markChanged(false);
    }
    function doCopy() {
      if (S.selected == null) return;
      S.clip = clone(pageInk(S.pageIdx).strokes[S.selected]); S.clipPage = S.pageIdx;
      setStatus('ok', 'Copied — press Paste on any page');
      syncButtons();
    }
    function doCut() { if (S.selected == null) return; doCopy(); doDeleteSelected(); setStatus('ok', 'Cut — press Paste on any page'); }
    function doPaste() {
      if (!S.clip || S.cropping) return;
      var pi = S.pageIdx, pg = pageInk(pi);
      if (pg.removed) return;
      var before = clone(pg);
      var m = S.clipPage === pi ? translateMark(S.clip, 0.025, 0.025) : clone(S.clip);
      pg.strokes.push(m);
      S.clip = clone(m); S.clipPage = pi;
      snapshotAction(pi, before);
      setTool('select');
      S.selected = pg.strokes.length - 1;
      redraw(); markChanged(true);
    }
    function restyleSelected(fn) {
      if (S.selected == null) return false;
      var pg = pageInk(S.pageIdx), before = clone(pg), m = pg.strokes[S.selected];
      if (!m || fn(m) === false) return false;
      snapshotAction(S.pageIdx, before); redraw(); markChanged(false);
      return true;
    }
    async function doClear() {
      var cur = pageInk(S.pageIdx).strokes;
      if (!cur.length) return;
      if (!await PaisleyUI.confirm('Clear all marks on this page?')) return;
      pushUndo({ t: 'clear', page: S.pageIdx, strokes: cur.slice() });
      pageInk(S.pageIdx).strokes = []; S.selected = null; redraw(); markChanged(false);
    }

    /* ---------- page: rotate, crop, delete ---------- */
    function applyView(i, newV) {
      var pg = pageInk(i), dim = S.dims[i];
      if (sameView(pg.view, newV)) { renderPage(); return; }
      var before = clone(pg), oldV = pg.view;
      var f = dispSize(dim, oldV).w / dispSize(dim, newV).w;
      function mp(p) { var q = srcToDisp(dispToSrc(p, dim, oldV), dim, newV); return { x: round4(q.x), y: round4(q.y) }; }
      pg.strokes = pg.strokes.map(function (m) {
        var n = clone(m);
        if (m.tool === 'text') { var q = mp(m); n.x = q.x; n.y = q.y; n.size = round4(m.size * f); }
        else { n.points = (m.points || []).map(mp); n.width = round4(m.width * f); }
        return n;
      });
      if (isIdentity(newV)) delete pg.view;
      else { var e = effView(newV); pg.view = { rot: e.rot, crop: fullCrop(e.crop) ? null : e.crop }; }
      S.selected = null;
      snapshotAction(i, before);
      markChanged(false);
      renderPage();
    }
    function setAngle(deg) {
      if (S.cropping) closeCrop();
      if (S.textEd) S.textEd.commit();
      var i = S.pageIdx, pg = pageInk(i);
      if (pg.removed || !S.dims[i]) return;
      var nr = normAngle(deg);
      if (nr === effView(pg.view).rot) { syncButtons(); return; }
      applyView(i, { rot: nr, crop: cropForRotation(S.dims[i], pg.view, nr) });
    }
    function rotateBy(d) { setAngle(effView(pageInk(S.pageIdx).view).rot + d); }

    function startCrop() {
      var pg = pageInk(S.pageIdx);
      if (pg.removed || !S.dims[S.pageIdx]) return;
      if (S.textEd) S.textEd.commit();
      var c = effView(pg.view).crop;
      S.cropping = { rect: fullCrop(c) ? { x: 0.06, y: 0.06, w: 0.88, h: 0.88 } : clone(c) };
      setPill(false);
      cropBar.hidden = false; fabEl.hidden = true;
      renderPage();
    }
    function closeCrop() { S.cropping = null; cropBar.hidden = true; fabEl.hidden = false; }
    function applyCrop(whole) {
      if (!S.cropping) return;
      var r = S.cropping.rect, pg = pageInk(S.pageIdx);
      closeCrop();
      var crop = whole || fullCrop(r) ? null : { x: round4(r.x), y: round4(r.y), w: round4(r.w), h: round4(r.h) };
      applyView(S.pageIdx, { rot: effView(pg.view).rot, crop: crop });
    }
    function mountCrop() {
      var layer = document.createElement('div');
      layer.className = 'ink-crop';
      layer.innerHTML = '<div class="box"><span class="hd" data-h="nw"></span><span class="hd" data-h="ne"></span><span class="hd" data-h="sw"></span><span class="hd" data-h="se"></span></div>';
      pageBox.appendChild(layer);
      var box = layer.querySelector('.box'), drag = null;
      function place() {
        var r = S.cropping.rect;
        box.style.left = (r.x * 100) + '%'; box.style.top = (r.y * 100) + '%';
        box.style.width = (r.w * 100) + '%'; box.style.height = (r.h * 100) + '%';
      }
      function at(e) { var rc = layer.getBoundingClientRect(); return { x: clamp((e.clientX - rc.left) / rc.width, 0, 1), y: clamp((e.clientY - rc.top) / rc.height, 0, 1) }; }
      place();
      layer.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button > 0) return;
        e.preventDefault();
        layer.setPointerCapture(e.pointerId);
        var p = at(e), h = e.target.dataset && e.target.dataset.h;
        if (h) drag = { mode: h, r0: clone(S.cropping.rect) };
        else if (e.target === box) drag = { mode: 'move', r0: clone(S.cropping.rect), p0: p };
        else { drag = { mode: 'new', p0: p, r0: clone(S.cropping.rect) }; S.cropping.rect = { x: p.x, y: p.y, w: 0, h: 0 }; place(); }
      });
      layer.addEventListener('pointermove', function (e) {
        if (!drag || !S.cropping) return;
        var p = at(e), r0 = drag.r0, r;
        if (drag.mode === 'move') {
          r = { x: clamp(r0.x + p.x - drag.p0.x, 0, 1 - r0.w), y: clamp(r0.y + p.y - drag.p0.y, 0, 1 - r0.h), w: r0.w, h: r0.h };
        } else if (drag.mode === 'new') {
          r = { x: Math.min(drag.p0.x, p.x), y: Math.min(drag.p0.y, p.y), w: Math.abs(p.x - drag.p0.x), h: Math.abs(p.y - drag.p0.y) };
        } else {
          var l = r0.x, t = r0.y, rr = r0.x + r0.w, b = r0.y + r0.h;
          if (drag.mode.indexOf('w') > -1) l = Math.min(p.x, rr - MIN_CROP);
          if (drag.mode.indexOf('e') > -1) rr = Math.max(p.x, l + MIN_CROP);
          if (drag.mode.indexOf('n') > -1) t = Math.min(p.y, b - MIN_CROP);
          if (drag.mode.indexOf('s') > -1) b = Math.max(p.y, t + MIN_CROP);
          r = { x: l, y: t, w: rr - l, h: b - t };
        }
        S.cropping.rect = r; place();
      });
      function up() {
        if (!drag || !S.cropping) { drag = null; return; }
        var r = S.cropping.rect;
        if (drag.mode === 'new' && (r.w < MIN_CROP || r.h < MIN_CROP)) { S.cropping.rect = drag.r0; place(); }
        drag = null;
      }
      layer.addEventListener('pointerup', up);
      layer.addEventListener('pointercancel', up);
    }
    function togglePageRemoved() {
      if (S.cropping) return;
      var i = S.pageIdx, pg = pageInk(i), before = clone(pg);
      if (!pg.removed) {
        var kept = 0;
        for (var k = 0; k < S.pageCount; k++) if (!(S.ink.pages[k] && S.ink.pages[k].removed)) kept++;
        if (kept <= 1) { PaisleyUI.alert('At least one page has to stay in the marked copy.'); return; }
        pg.removed = true;
      } else delete pg.removed;
      S.selected = null;
      snapshotAction(i, before);
      markChanged(false);
      renderPage();
    }

    function goto(i) {
      if (i < 0 || i >= S.pageCount || i === S.pageIdx) { root.querySelector('#inkJump').value = String(S.pageIdx + 1); return; }
      if (S.textEd) S.textEd.commit();
      if (S.cropping) closeCrop();
      S.pageIdx = i; S.selected = null; renderPage();
    }
    function setTool(t) {
      if (S.textEd) S.textEd.commit();
      S.tool = t; S.selected = null;
      all('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
      setCursor(); redraw(); syncButtons();
    }
    function setColor(hex) {
      S.color = hex;
      all('[data-color]').forEach(function (b) { b.classList.toggle('on', b.dataset.color.toLowerCase() === String(hex).toLowerCase()); });
      all('.ink-custom').forEach(function (l) { l.style.setProperty('--c', hex); var inp = l.querySelector('input'); if (inp && inp.value !== hex) inp.value = hex; });
      if (S.selected != null) { restyleSelected(function (m) { if (m.color === hex) return false; m.color = hex; }); return; }
      if (S.tool === 'eraser' || S.tool === 'select') setTool('pen');
    }
    function setPill(on) {
      S.pillOpen = !!on;
      pillEl.hidden = !on;
      fabEl.classList.toggle('open', !!on);
      fabEl.setAttribute('aria-expanded', on ? 'true' : 'false');
      fabEl.title = on ? 'Close the tools' : 'More tools: rotate, crop, text, cut, colours';
      syncButtons();
    }
    function syncButtons() {
      function q(a) { return all('[data-a="' + a + '"]'); }
      function dis(a, v) { q(a).forEach(function (b) { b.disabled = !!v; }); }
      var pg = pageInk(S.pageIdx), noPage = !S.pageCount || !S.dims[S.pageIdx];
      dis('undo', !S.undo.length); dis('redo', !S.redo.length);
      ['delstroke', 'cut', 'copy'].forEach(function (a) { dis(a, S.selected == null); });
      dis('paste', !S.clip || pg.removed);
      ['rot', 'rotreset', 'crop'].forEach(function (a) { dis(a, noPage || pg.removed); });
      dis('prev', S.pageIdx <= 0); dis('next', S.pageIdx >= S.pageCount - 1);
      var dp = pillEl.querySelector('[data-a="delpage"] span');
      if (dp) dp.textContent = pg.removed ? 'Restore page' : 'Delete page';
      var ang = signedAngle(effView(pg.view).rot), ai = root.querySelector('#inkAngle');
      if (ai && document.activeElement !== ai) ai.value = String(ang);
      if (ai) ai.disabled = noPage || !!pg.removed;
      root.querySelector('#inkAngleVal').textContent = ang + '°';
      root.querySelector('#inkTotal').textContent = String(S.pageCount || 1);
    }

    /* ---------- the marked PDF ---------- */
    async function canvasJpeg(cv) {
      var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.9); });
      if (!blob) throw new Error('Could not prepare a page picture.');
      return new Uint8Array(await blob.arrayBuffer());
    }
    async function buildGradedPdf() {
      var L = global.PDFLib;
      var ink = cleanInk();
      function info(i) { return ink.pages[i] || { strokes: [] }; }
      var keep = [];
      for (var i = 0; i < S.pageCount; i++) if (!info(i).removed) keep.push(i);
      if (!keep.length) throw new Error('Every page has been deleted. Restore at least one page.');
      var srcDoc = S.isImage ? null : await L.PDFDocument.load(S.sourceBytes, { ignoreEncryption: true });
      var srcPages = srcDoc ? srcDoc.getPages() : [];
      function pageRot(k) { return srcPages[k] ? ((srcPages[k].getRotation().angle % 360) + 360) % 360 : 0; }
      function hasText(k) { return (info(k).strokes || []).some(function (m) { return m.tool === 'text'; }); }
      function vectorOk(k) { return !S.isImage && isIdentity(info(k).view) && (pageRot(k) === 0 || !hasText(k)); }
      var font = null;

      async function drawMarks(doc, page, marks, rot) {
        var size = page.getSize(), W = size.width, H = size.height;
        var dispW = (rot === 90 || rot === 270) ? H : W;
        function map(u, v) {
          if (rot === 90) return { x: v * W, y: u * H };
          if (rot === 180) return { x: W - u * W, y: v * H };
          if (rot === 270) return { x: W * (1 - v), y: H - u * H };
          return { x: u * W, y: H - v * H };
        }
        for (var n = 0; n < marks.length; n++) {
          var st = marks[n], c = hexToRgb(st.color);
          if (st.tool === 'text') {
            if (!font) font = await doc.embedFont(L.StandardFonts.HelveticaBold);
            var fs = Math.max(4, st.size * W / 1000);
            String(st.text || '').split('\n').forEach(function (ln, k) {
              var t = winAnsi(ln); if (!t) return;
              page.drawText(t, { x: st.x * W, y: H - st.y * H - fs * 0.82 - k * fs * 1.25, size: fs, font: font, color: L.rgb(c.r, c.g, c.b) });
            });
            continue;
          }
          if (!st.points || !st.points.length) continue;
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
        }
      }

      // Nothing turned, cropped or deleted: draw straight onto the student's own PDF.
      if (srcDoc && keep.length === S.pageCount && keep.every(vectorOk)) {
        for (var a = 0; a < keep.length; a++) await drawMarks(srcDoc, srcPages[keep[a]], info(keep[a]).strokes, pageRot(keep[a]));
        return srcDoc.save();
      }
      var doc = await L.PDFDocument.create();
      for (var k2 = 0; k2 < keep.length; k2++) {
        var idx = keep[k2], p = info(idx);
        if (vectorOk(idx)) {
          var cp = (await doc.copyPages(srcDoc, [idx]))[0];
          doc.addPage(cp);
          await drawMarks(doc, cp, p.strokes, pageRot(idx));
          continue;
        }
        var dim = S.dims[idx], ds = dispSize(dim, p.view);
        var unit = S.isImage ? 595 / dim.w : 1;
        var pw = ds.w * unit, ph = ds.h * unit, img;
        if (S.isImage && isIdentity(p.view) && (S.imageKind === 'png' || S.imageKind === 'jpg')) {
          img = S.imageKind === 'png' ? await doc.embedPng(S.imageBytes) : await doc.embedJpg(S.imageBytes);
        } else {
          var pxW = Math.round(clamp(pw * 2.4, 900, 2200));
          var cv = document.createElement('canvas');
          cv.width = pxW; cv.height = Math.max(1, Math.round(pxW * ds.h / ds.w));
          await paintSource(cv.getContext('2d'), idx, p.view, cv.width, cv.height, null);
          img = await doc.embedJpg(await canvasJpeg(cv));
        }
        var pg2 = doc.addPage([pw, ph]);
        pg2.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
        await drawMarks(doc, pg2, p.strokes, 0);
      }
      return doc.save();
    }

    function gradeDialog() {
      if (S.textEd) S.textEd.commit();
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
      var hasInk = inkNow.pages.some(function (p) { return p.strokes.length || p.view || p.removed; });
      var markable = S.pdf || S.isImage;
      if (markable) {
        var bytes = await buildGradedPdf();
        gradedFileName = (status === 'Corrections' ? 'corrections_' : 'graded_') + (round > 1 ? 'attempt' + round + '_' : '') + safeName(data.studentName) + '_' + safeName(item.title) + '.pdf';
        if (typeof opts.gradedPath === 'function') gradedStoragePath = opts.gradedPath(gradedFileName);
        else {
          var gradedSubject = String((opts.cid.match(/^(.*?)_y\d+/) || [])[1] || (item && item.subjectId) || opts.cid.split('_')[0]);
          gradedStoragePath = 'graded-submissions/' + gradedSubject + '/' + opts.cid + '/' + opts.itemId + '/' + (data.studentId || opts.docRef.id) + '/' + gradedFileName;
        }
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

      // Keep a permanent record of the round being sent back, so the next hand-in can be
      // told apart from this one and the tutor can always see what was said last time.
      if (status === 'Corrections' && data.status !== 'Corrections') {
        update.history = FV.arrayUnion({
          round: round,
          outcome: 'Corrections',
          studentFileUrl: data.fileUrl || '',
          studentFileName: data.fileName || '',
          studentText: data.textAnswer || '',
          submittedAtMs: submittedMs || 0,
          markedFileUrl: (markable ? gradedFileUrl : (data.gradedFileUrl || '')) || '',
          markedFileName: (markable ? gradedFileName : (data.gradedFileName || '')) || '',
          feedback: feedback || '',
          gradedByName: user.name || '',
          at: Date.now()
        });
      }
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
      if (S.imgEl && S.imgEl.src) { try { URL.revokeObjectURL(S.imgEl.src); } catch (e) { } }
      root.remove();
    }
    function finish() { teardown(); if (opts.onDone) opts.onDone(); }

    async function closeWithSave() {
      if (S.textEd) S.textEd.commit();
      if (S.dirty || S.saving) {
        setStatus('saving', 'Saving…');
        try { await saveInkNow(); } catch (e) {
          if (!await PaisleyUI.confirm('The latest marks could not be saved to the server. They are kept on this device and restored next time you open this work. Close anyway?')) return;
        }
      }
      finish();
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tool],[data-color],[data-a]'); if (!t || t.disabled) return;
      if (t.dataset.tool) { setTool(t.dataset.tool); if (t.dataset.tool === 'text' && window.innerWidth <= 700) setPill(false); return; }
      if (t.dataset.color) { setColor(t.dataset.color); return; }
      var a = t.dataset.a;
      if (a === 'close') closeWithSave();
      else if (a === 'undo') doUndo();
      else if (a === 'redo') doRedo();
      else if (a === 'delstroke') doDeleteSelected();
      else if (a === 'cut') doCut();
      else if (a === 'copy') doCopy();
      else if (a === 'paste') doPaste();
      else if (a === 'clear') doClear();
      else if (a === 'prev') goto(S.pageIdx - 1);
      else if (a === 'next') goto(S.pageIdx + 1);
      else if (a === 'pill') setPill(!S.pillOpen);
      else if (a === 'rot') rotateBy(Number(t.dataset.d) || 0);
      else if (a === 'rotreset') setAngle(0);
      else if (a === 'crop') startCrop();
      else if (a === 'cropapply') applyCrop(false);
      else if (a === 'cropfull') applyCrop(true);
      else if (a === 'cropcancel') { closeCrop(); renderPage(); }
      else if (a === 'delpage') togglePageRemoved();
      else if (a === 'draft') {
        if (S.textEd) S.textEd.commit();
        setStatus('saving', 'Saving draft…');
        saveInkNow().then(function () { setStatus('ok', 'Draft saved ' + now() + ' — marks not released'); }).catch(function (er) { setStatus('err', er.message); });
      }
      else if (a === 'grade') gradeDialog();
    });
    all('.ink-color-in').forEach(function (inp) {
      inp.addEventListener('input', function () { S.color = inp.value; all('.ink-custom').forEach(function (l) { l.style.setProperty('--c', inp.value); }); });
      inp.addEventListener('change', function () { setColor(inp.value); });
    });
    root.querySelector('#inkWidth').addEventListener('input', function () { S.width = Number(this.value); });
    root.querySelector('#inkJump').addEventListener('change', function () { goto(Number(this.value) - 1); });
    var angIn = root.querySelector('#inkAngle');
    angIn.addEventListener('input', function () { root.querySelector('#inkAngleVal').textContent = this.value + '°'; });
    angIn.addEventListener('change', function () { setAngle(Number(this.value)); });
    var tsIn = root.querySelector('#inkTextSize');
    tsIn.addEventListener('input', function () { S.textSize = Number(this.value); root.querySelector('#inkTextSizeVal').textContent = this.value; });
    tsIn.addEventListener('change', function () {
      var v = Number(this.value);
      restyleSelected(function (m) { if (m.tool !== 'text' || m.size === v) return false; m.size = v; });
    });
    function onKey(e) {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      if (document.querySelector('.cr-overlay')) return;        /* the grade dialog is open */
      var mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      else if (mod && k === 'y') { e.preventDefault(); doRedo(); }
      else if (mod && k === 'x') { if (S.selected != null) { e.preventDefault(); doCut(); } }
      else if (mod && k === 'c') { if (S.selected != null) { e.preventDefault(); doCopy(); } }
      else if (mod && k === 'v') { if (S.clip) { e.preventDefault(); doPaste(); } }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (S.selected != null) { e.preventDefault(); doDeleteSelected(); } }
      else if (e.key === 'Escape') {
        if (S.cropping) { closeCrop(); renderPage(); }
        else if (S.pillOpen) setPill(false);
        else if (S.selected != null) { S.selected = null; redraw(); syncButtons(); }
      }
      else if (S.cropping) return;
      else if (e.key === 'ArrowRight') goto(S.pageIdx + 1);
      else if (e.key === 'ArrowLeft') goto(S.pageIdx - 1);
    }
    document.addEventListener('keydown', onKey);
    var resizeT = null;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { if (S.pageCount) renderPage(); }, 200); }
    window.addEventListener('resize', onResize);

    function hideMarkingTools() {
      root.querySelector('.ink-tools').style.display = 'none';
      root.querySelector('.ink-nav').style.display = 'none';
      fabEl.hidden = true; pillEl.hidden = true;
    }

    (async function boot() {
      var server = data.inkData && data.inkData.pages ? data.inkData : null;
      var serverAt = data.inkUpdatedAt && data.inkUpdatedAt.toMillis ? data.inkUpdatedAt.toMillis() : 0;
      // A resubmission is a NEW file. Marks drawn on the previous attempt must never be
      // laid over it, so ink older than the latest hand-in is discarded.
      if (isResub && submittedMs && serverAt && submittedMs > serverAt) { server = null; serverAt = 0; }
      var local = null;
      try { local = JSON.parse(localStorage.getItem(localKey) || 'null'); } catch (e) { local = null; }
      if (isResub && local && submittedMs && local.at < submittedMs) local = null;
      if (local && local.ink && local.at > serverAt) { S.ink = local.ink; S.dirty = true; setStatus('local', 'Restored unsaved marks from this device'); }
      else if (server) S.ink = JSON.parse(JSON.stringify(server));
      if (!S.ink || !Array.isArray(S.ink.pages)) S.ink = { version: 2, pages: [] };

      // opts.source: work made on the page (classroom or Tech Studio code, writing) turned into a PDF,
      // marked without a download. { bytes: Uint8Array | ArrayBuffer, type, name }.
      var src = opts.source && opts.source.bytes ? opts.source : null;
      var url = src ? 'local:' + (src.name || 'work.pdf') : (data.fileUrl || '');
      var type = String(src ? (src.type || 'application/pdf') : (data.fileType || '')).toLowerCase();
      var name = String(src ? (src.name || 'work.pdf') : (data.fileName || '')).toLowerCase();
      var getBytes = !src ? fetchBytes : function () { return Promise.resolve(src.bytes instanceof Uint8Array ? src.bytes.buffer.slice(src.bytes.byteOffset, src.bytes.byteOffset + src.bytes.byteLength) : src.bytes); };
      var isPdf = /pdf/.test(type) || /\.pdf$/.test(name);
      var isImg = /^image\//.test(type) || /\.(jpe?g|png|webp)$/.test(name);

      if (!url) {
        stage.innerHTML = data.textAnswer
          ? '<div class="ink-text"><b>Typed answer</b><br><br>' + esc(data.textAnswer) + '</div>'
          : '<div class="ink-msg"><i class="fas fa-file-circle-question" style="font-size:2rem"></i><br>This student has not attached a file.</div>';
        hideMarkingTools();
        return;
      }
      if (!isPdf && !isImg) {
        stage.innerHTML = '<div class="ink-msg"><i class="fas fa-file" style="font-size:2rem"></i><br>This file type cannot be marked with ink here. ' +
          '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Download it</a>, then give the score and feedback with Grade.</div>';
        hideMarkingTools();
        return;
      }
      try {
        await ensureLibs();
        if (isImg) {
          var buf = await getBytes(url);
          S.isImage = true;
          S.imageBytes = new Uint8Array(buf);
          S.imageKind = sniffImage(S.imageBytes) || (/png/.test(type + name) ? 'png' : 'jpg');
          var im = await imageEl();
          S.pageCount = 1; S.dims = [{ w: im.naturalWidth || 1000, h: im.naturalHeight || 1414 }];
        } else {
          S.sourceBytes = new Uint8Array(await getBytes(url));
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
        fabEl.hidden = true;
      }
    })();

    syncButtons();
    return { close: closeWithSave };
  }

  global.InkGrader = { open: open };
})(window);
