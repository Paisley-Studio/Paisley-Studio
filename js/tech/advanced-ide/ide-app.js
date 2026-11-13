/* =========================================================
   Paisley Advanced IDE — the workspace (/tech/ide)
   ---------------------------------------------------------
   Projects are techPractice docs with type 'advanced', so they sit in
   the builder's Practice list, coaches and admins see them in their
   practice views (read only, with a note), and the existing rules
   apply unchanged: only the builder writes, parents have no access.

     codeFiles   [{ name, lang, content }]   lang ids from PaisleyLangs
     codeFolders ['src', ...]                 empty folders
     codeActive  'main.py'                    the open file
     ide         { v: 1, lang, entry, open: [names], template }

   Code Lab practice docs are never changed here: "bring this practice"
   copies its files into a new Advanced IDE project.

   PaisleyIDE.start({ store?, user? })   store/user replace Firebase in tests
========================================================= */
(function (g) {
  'use strict';

  var L = g.PaisleyLangs;
  var MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
  var MAX_FILES = 60, MAX_FILE = 200 * 1024, MAX_DOC = 900 * 1024;
  var reduced = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i); }
  function baseOf(p) { var i = p.lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1); }
  function cleanName(s) {
    return String(s || '').trim().replace(/\\/g, '/').split('/').map(function (p) { return p.trim().replace(/[^\w.\- ]/g, '_').replace(/^\.+$/, ''); })
      .filter(Boolean).join('/').slice(0, 120);
  }
  function ago(ms) {
    if (!ms) return '';
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function msOf(ts) { if (!ts) return 0; if (typeof ts === 'number') return ts; if (ts.toMillis) return ts.toMillis(); if (ts.seconds) return ts.seconds * 1000; return +new Date(ts) || 0; }
  function errMsg(e) {
    var c = String(e && e.code || '');
    if (/permission-denied/.test(c)) return 'You do not have permission to do that.';
    if (/unavailable|network/.test(c)) return 'You seem to be offline. Check your connection and try again.';
    return (e && e.message) || 'Something went wrong.';
  }

  /* ---------- settings (this browser only) ---------- */
  var SET_KEY = 'pz-ide-settings';
  var DEF = { theme: 'dark', fontSize: 14, tabSize: 4, wordWrap: false, minimap: false, autoSave: true, liveInput: true, warm: true, livePreview: true };
  function readSettings() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } }
  function writeSettings(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) { } }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  /* =========================================================
     Welcome sequence
  ========================================================= */
  var Intro = (function () {
    var root, bar, label, canvas, ctx, raf = 0, parts = [], rockets = [], minUntil = 0, revealed = false, readyFlag = false, onReveal = null, t0 = 0;
    var COLORS = ['#55BFB3', '#7BCBC2', '#F5C842', '#FFFFFF', '#3F9F95'];
    function start(cinematic) {
      root = $('#aiIntro'); if (!root) return;
      bar = $('.ai-bar', root); label = $('.ai-load p', root); canvas = $('canvas', root);
      t0 = performance.now();
      minUntil = t0 + (cinematic && !reduced ? 2700 : 450);
      if (!cinematic || reduced) root.classList.add('quick');
      requestAnimationFrame(function () { root.classList.add('play'); });
      $('.ai-skip', root).onclick = skip;
      document.addEventListener('keydown', keySkip);
      if (cinematic && !reduced && canvas) fireworks();
    }
    function keySkip(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip(); }
    function skip() { minUntil = 0; maybe(); }
    function fireworks() {
      ctx = canvas.getContext('2d');
      var dpr = Math.min(2, g.devicePixelRatio || 1);
      function size() { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      size(); g.addEventListener('resize', size);
      var W = function () { return innerWidth; }, H = function () { return innerHeight; };
      for (var i = 0; i < 46; i++) parts.push({ x: Math.random() * W(), y: Math.random() * H(), vx: (Math.random() - .5) * .12, vy: -.08 - Math.random() * .18, r: .6 + Math.random() * 1.4, a: .08 + Math.random() * .22, c: COLORS[i % 2], life: Infinity, mote: true });
      [[.22, 120], [.78, 420], [.5, 760], [.34, 1080], [.66, 1300]].forEach(function (p) {
        setTimeout(function () { rockets.push({ x: W() * p[0], y: H() + 10, vy: -(H() * .0105 + 4.2), ty: H() * (.2 + Math.random() * .16), c: COLORS[Math.floor(Math.random() * 3)] }); }, p[1]);
      });
      var last = performance.now();
      (function loop(now) {
        var dt = Math.min(2.5, (now - last) / 16.7); last = now;
        ctx.clearRect(0, 0, W(), H());
        rockets = rockets.filter(function (r) {
          r.y += r.vy * dt; r.vy *= Math.pow(.985, dt);
          ctx.fillStyle = r.c; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(r.x, r.y, 1.8, 0, 6.283); ctx.fill();
          ctx.globalAlpha = .25; ctx.fillRect(r.x - .6, r.y, 1.2, 14);
          if (r.y <= r.ty) {
            var n = 38 + Math.floor(Math.random() * 14);
            for (var k = 0; k < n; k++) { var a = k / n * 6.283, s = 1.3 + Math.random() * 2.3; parts.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + Math.random() * 1.3, a: 1, c: Math.random() < .7 ? r.c : COLORS[Math.floor(Math.random() * COLORS.length)], life: 1, decay: .011 + Math.random() * .01 }); }
            return false;
          }
          return true;
        });
        parts = parts.filter(function (p) {
          if (p.mote) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -5) { p.y = H() + 5; p.x = Math.random() * W(); } }
          else { p.vx *= Math.pow(.97, dt); p.vy = p.vy * Math.pow(.97, dt) + .035 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= p.decay * dt; p.a = Math.max(0, p.life); }
          if (p.life <= 0) return false;
          ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          return true;
        });
        ctx.globalAlpha = 1;
        if (!revealed || performance.now() - t0 < 4000) raf = requestAnimationFrame(loop);
      })(last);
    }
    function step(text, pct) {
      if (!root) return;
      if (label) label.textContent = text || '';
      if (bar) { bar.classList.toggle('indet', pct == null); $('i', bar).style.width = pct == null ? '' : Math.max(4, Math.min(100, pct)) + '%'; }
    }
    function ready(fn) { readyFlag = true; onReveal = fn; maybe(); }
    function maybe() {
      if (!readyFlag || revealed) return;
      var wait = minUntil - performance.now();
      if (wait > 0) { setTimeout(maybe, wait); return; }
      revealed = true;
      document.removeEventListener('keydown', keySkip);
      step('Ready', 100);
      root.classList.add('out');
      if (onReveal) onReveal();
      setTimeout(function () { cancelAnimationFrame(raf); if (root && root.parentNode) root.parentNode.removeChild(root); root = null; }, 950);
    }
    function fail(msg, actionHtml) {
      if (!root) return;
      document.removeEventListener('keydown', keySkip);
      $('.ai-load', root).innerHTML = '<div class="ai-intro-err" role="alert">' + esc(msg) + (actionHtml ? '<div style="margin-top:.7rem">' + actionHtml + '</div>' : '') + '</div>';
      $('.ai-skip', root).hidden = true;
    }
    return { start: start, step: step, ready: ready, fail: fail };
  })();

  /* =========================================================
     Monaco (lazy, from jsDelivr)
  ========================================================= */
  var monacoP = null;
  function loadMonaco() {
    if (monacoP) return monacoP;
    monacoP = new Promise(function (resolve, reject) {
      if (g.monaco && g.monaco.editor) return resolve(g.monaco);
      var workerSrc = "self.MonacoEnvironment={baseUrl:'" + MONACO + "/'};importScripts('" + MONACO + "/vs/base/worker/workerMain.js');";
      g.MonacoEnvironment = { getWorkerUrl: function () { return URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })); } };
      var s = document.createElement('script');
      s.src = MONACO + '/vs/loader.js';
      s.onload = function () {
        g.require.config({ paths: { vs: MONACO + '/vs' } });
        g.require(['vs/editor/editor.main'], function () { resolve(g.monaco); }, function (e) { reject(new Error('The editor did not load (' + (e && e.message || 'network') + ').')); });
      };
      s.onerror = function () { reject(new Error('The editor could not be downloaded. Check your connection.')); };
      document.head.appendChild(s);
    });
    monacoP.catch(function () { monacoP = null; });
    return monacoP;
  }
  function themes(monaco) {
    monaco.editor.defineTheme('paisley-dark', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment', foreground: '5F7A74', fontStyle: 'italic' }, { token: 'keyword', foreground: '7BCBC2' }, { token: 'string', foreground: 'F5C842' },
        { token: 'number', foreground: 'F2A07B' }, { token: 'type', foreground: '8BD3E6' }, { token: 'type.identifier', foreground: '8BD3E6' },
        { token: 'delimiter', foreground: 'A3B9B3' }, { token: 'tag', foreground: '55BFB3' }, { token: 'attribute.name', foreground: 'E8C872' },
        { token: 'attribute.value', foreground: 'F5C842' }, { token: 'metatag', foreground: 'C5A3F0' }, { token: 'regexp', foreground: 'F28FAD' }
      ],
      colors: {
        'editor.background': '#0E1513', 'editor.foreground': '#D9E7E3', 'editorLineNumber.foreground': '#45605A', 'editorLineNumber.activeForeground': '#9FD9D1',
        'editor.lineHighlightBackground': '#15201D', 'editor.lineHighlightBorder': '#15201D', 'editorCursor.foreground': '#55BFB3',
        'editor.selectionBackground': '#245F5A99', 'editor.inactiveSelectionBackground': '#245F5A55', 'editor.findMatchHighlightBackground': '#F5C84233',
        'editorIndentGuide.background1': '#1D2A27', 'editorIndentGuide.activeBackground1': '#2F4842', 'editorWidget.background': '#16211E', 'editorWidget.border': '#2A3E39',
        'editorSuggestWidget.background': '#16211E', 'editorSuggestWidget.border': '#2A3E39', 'editorSuggestWidget.selectedBackground': '#245F5A', 'editorSuggestWidget.highlightForeground': '#55BFB3',
        'editorHoverWidget.background': '#16211E', 'editorHoverWidget.border': '#2A3E39', 'scrollbarSlider.background': '#7BCBC222', 'scrollbarSlider.hoverBackground': '#7BCBC240',
        'editorBracketMatch.background': '#245F5A66', 'editorBracketMatch.border': '#55BFB3', 'minimap.background': '#0E1513', 'editorGutter.background': '#0E1513',
        'editorError.foreground': '#F0786A', 'editorWarning.foreground': '#E8A33D', 'input.background': '#0E1513', 'focusBorder': '#55BFB3'
      }
    });
    monaco.editor.defineTheme('paisley-light', {
      base: 'vs', inherit: true,
      rules: [
        { token: 'comment', foreground: '7D948F', fontStyle: 'italic' }, { token: 'keyword', foreground: '1E6B64', fontStyle: 'bold' }, { token: 'string', foreground: '9A6A00' },
        { token: 'number', foreground: 'B4502B' }, { token: 'type', foreground: '1F6FA3' }, { token: 'tag', foreground: '1E6B64' }, { token: 'attribute.name', foreground: '9A6A00' }
      ],
      colors: {
        'editor.background': '#FFFFFF', 'editor.lineHighlightBackground': '#F1F8F6', 'editorCursor.foreground': '#245F5A', 'editor.selectionBackground': '#7BCBC266',
        'editorLineNumber.foreground': '#A7BAB5', 'editorLineNumber.activeForeground': '#245F5A', 'editorSuggestWidget.selectedBackground': '#DCEFEB', 'focusBorder': '#55BFB3'
      }
    });
  }

  /* =========================================================
     Firestore store (tests pass their own)
  ========================================================= */
  function firestoreStore() {
    var FV = function () { return firebase.firestore.FieldValue; };
    var col = function () { return db.collection('techPractice'); };
    return {
      load: function (id) { return col().doc(id).get().then(function (s) { return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }); },
      listMine: function (uid) {
        return col().where('studentId', '==', uid).get().then(function (s) {
          return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        });
      },
      create: function (data) { data.createdAt = FV().serverTimestamp(); data.updatedAt = FV().serverTimestamp(); return col().add(data).then(function (r) { return r.id; }); },
      save: function (id, patch) { patch.updatedAt = FV().serverTimestamp(); return col().doc(id).update(patch); },
      log: function (me, label, practiceId) {
        return db.collection('techActivity').add({ studentId: me.uid, studentName: me.name || '', type: 'practice_saved', label: String(label).slice(0, 200), practiceId: practiceId, at: FV().serverTimestamp() }).catch(function () { });
      }
    };
  }
  /* Admin > Tech Studio > Controls (techSettings/advancedIde). Same test as advancedIdeAllowed() in firestore.rules. */
  function ideAllowed(cfg, uid, student) {
    if (!cfg || cfg.enabled !== true) return false;
    var lvl = ['beginner', 'intermediate', 'expert'].indexOf(student.skillLevel) > -1 ? student.skillLevel : 'intermediate';
    return (cfg.students || []).indexOf(uid) > -1 || (cfg.levels || []).indexOf(lvl) > -1;
  }
  function whoAmI(user) {
    var uid = user.uid;
    return db.collection('techStudents').doc(uid).get().then(function (s) {
      if (s.exists && s.data().status === 'Active') {
        var st = s.data();
        return db.collection('techSettings').doc('advancedIde').get().then(function (c) { return c.exists ? c.data() : null; }, function () { return null; }).then(function (cfg) {
          return { uid: uid, role: 'student', name: st.name || '', coachId: st.coachId || '', skillLevel: st.skillLevel || '', ideAccess: ideAllowed(cfg, uid, st) };
        });
      }
      if (s.exists) return { uid: uid, role: 'pending', name: s.data().name || '', coachId: s.data().coachId || '' };
      return Promise.all([db.collection('techCoaches').doc(uid).get().catch(function () { return null; }), db.collection('admins').doc(uid).get().catch(function () { return null; })]).then(function (r) {
        if (r[1] && r[1].exists) return { uid: uid, role: 'admin', name: (r[1].data() || {}).name || 'Admin' };
        if (r[0] && r[0].exists && r[0].data().status === 'Active') return { uid: uid, role: 'coach', name: r[0].data().name || 'Coach' };
        return { uid: uid, role: 'none' };
      });
    });
  }

  /* =========================================================
     Start
  ========================================================= */
  function start(opts) {
    opts = opts || {};
    var cinematic = false;
    try { cinematic = sessionStorage.getItem('pz-ide-welcome') === '1'; sessionStorage.removeItem('pz-ide-welcome'); } catch (e) { }
    Intro.start(cinematic);
    var params = new URLSearchParams(location.search);
    var store = opts.store || firestoreStore();
    var editorP = loadMonaco();
    Intro.step('Signing you in', null);

    var meP = opts.user ? Promise.resolve(opts.user) : new Promise(function (resolve) {
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { location.href = '/tech/index.html'; return; }
        resolve(whoAmI(u));
      });
    });

    meP.then(function (me) {
      if (me.role === 'none') { Intro.fail('This account is not part of Paisley Tech Studio.', '<a href="/tech/index.html">Go to Tech Studio</a>'); return; }
      if (me.role === 'pending') { Intro.fail('Your Tech Studio account is waiting for approval from the Studio Desk.', '<a href="/tech/dashboard">Back to Tech Studio</a>'); return; }
      if (me.role === 'student' && me.ideAccess === false) { Intro.fail('The Advanced Paisley IDE has not been switched on for you yet. Your coach or the Studio Desk can open it.', '<a href="/tech/dashboard#practice">Back to Tech Studio</a>'); return; }
      var pid = params.get('p');
      Intro.step(pid ? 'Opening your project' : 'Getting your projects', null);
      var projP = pid ? store.load(pid) : Promise.resolve(null);
      var listP = !pid && me.role === 'student' ? store.listMine(me.uid).catch(function () { return []; }) : Promise.resolve([]);
      var fromP = !pid && params.get('from') && me.role === 'student' ? store.load(params.get('from')).catch(function () { return null; }) : Promise.resolve(null);
      projP.then(function (proj) {
        if (pid && !proj) { Intro.fail('This project was not found. It may have been deleted.', '<a href="/tech/ide">Open the Advanced IDE</a>'); return; }
        if (proj && proj.type !== 'advanced') { Intro.fail('This practice belongs to Paisley Code Lab, not the Advanced IDE.', '<a href="/tech/dashboard#practice">Back to Practice</a>'); return; }
        Intro.step('Loading the editor', null);
        Promise.all([editorP, listP, fromP]).then(function (r) {
          var ws = Workspace(r[0], { me: me, store: store, list: r[1], from: r[2] && r[2].studentId === me.uid ? r[2] : null });
          g.PaisleyIDE.workspace = ws;
          if (proj) ws.open(proj); else ws.launcher();
          /* If the Studio Desk switches the IDE off for this builder while they work, it locks (the rules refuse saves too). */
          if (me.role === 'student' && !opts.user) {
            db.collection('techSettings').doc('advancedIde').onSnapshot(function (c) {
              db.collection('techStudents').doc(me.uid).get().then(function (s) {
                var ok = ideAllowed(c.exists ? c.data() : null, me.uid, s.exists ? s.data() : {});
                if (!ok) ws.revoke(); else ws.restore();
              });
            }, function () { });
          }
          Intro.ready(function () { ws.reveal(); });
        }, function (e) {
          Intro.fail(e.message || 'The editor could not load.', '<button type="button" onclick="location.reload()">Try again</button>');
        });
      }, function (e) { Intro.fail(errMsg(e), '<button type="button" onclick="location.reload()">Try again</button>'); });
    }, function (e) { Intro.fail(errMsg(e), '<button type="button" onclick="location.reload()">Try again</button>'); });
  }

  /* =========================================================
     The workspace
  ========================================================= */
  function Workspace(monaco, o) {
    var me = o.me, store = o.store, S = readSettings();
    themes(monaco);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ target: monaco.languages.typescript.ScriptTarget.ES2020, allowNonTsExtensions: true, allowJs: true, checkJs: false, lib: ['es2020', 'dom'] });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { monaco.editor.remeasureFonts(); });
    /* Monaco rejects with "Canceled" when it drops a suggestion or hover it no longer needs; that is not an error. */
    g.addEventListener('unhandledrejection', function (e) { if (e.reason && (e.reason.name === 'Canceled' || e.reason.message === 'Canceled')) e.preventDefault(); });

    var P = null;                 // the open project
    var models = {};              // name -> monaco model
    var saved = {};               // name -> content at last save
    var groups = [], focus = 0;
    var running = false, runText = '', runLang = '';
    var saveTimer = 0, draftTimer = 0, prevTimer = 0, savedOnce = false, saving = false, dirtyMeta = false;
    var sideView = lsGet('pz-ide-side') || 'explorer', openDirs = {};

    var runner = g.PaisleyRunner.create({
      onProgress: onRuntime,
      onReset: function () { intel.resetJedi(); if (P && S.warm) setTimeout(function () { warm(P.lang); }, 300); }
    });
    var intel = g.PaisleyIntel.setup(monaco, {
      files: function () { return P ? P.files : []; }, runner: runner,
      pathOf: function (m) { return nameOfModel(m); }, langOfModel: function (m) { var n = nameOfModel(m); var f = file(n); return f ? f.lang : 'txt'; },
      projectLang: function () { return P ? P.lang : ''; },
      onPyState: function (s) { pyState = s; status(); },
      onMarkers: function () { }
    });
    var pyState = 'idle';

    /* ---------- the shell ---------- */
    var app = el(
      '<div id="aiApp" data-theme="' + esc(S.theme) + '">' +
        '<header class="ai-top">' +
          '<a class="ai-brand" href="/tech/dashboard#practice" id="aiHome" title="Back to Tech Studio"><span class="logo"><i class="fas fa-terminal"></i></span><b>Advanced <span>Paisley</span> IDE</b></a>' +
          '<span class="ai-sep hide-s"></span>' +
          '<div class="ai-proj"><button type="button" class="ai-proj-name" id="aiName" title="Rename project"></button><span class="ai-chip hide-s" id="aiLangChip"></span><span class="ai-chip ro" id="aiRo" hidden><i class="fas fa-eye"></i> Read only</span></div>' +
          '<span class="ai-save hide-s" id="aiSave" role="status"></span>' +
          '<div class="ai-run-grp" id="aiRunGrp"><select class="ai-entry" id="aiEntry" title="The file Run starts from" aria-label="File to run"></select>' +
            '<button type="button" class="ai-btn primary" id="aiRun" title="Run (F5 or Ctrl+Enter)"><i class="fas fa-play"></i><span class="lbl">Run</span><span class="k">F5</span></button>' +
            '<button type="button" class="ai-btn stop" id="aiStop" title="Stop (Shift+F5)" hidden><i class="fas fa-stop"></i><span class="lbl">Stop</span></button></div>' +
          '<div class="ai-top-r">' +
            '<button type="button" class="ai-btn icon hide-s" id="aiSplitBtn" title="Split editor (Ctrl+\\)"><i class="fas fa-table-columns"></i></button>' +
            '<button type="button" class="ai-btn icon" id="aiPrevBtn" title="Preview" hidden><i class="fas fa-display"></i></button>' +
            '<button type="button" class="ai-btn icon hide-s" id="aiPanelBtn" title="Show or hide the panel (Ctrl+J)"><i class="fas fa-terminal"></i></button>' +
            '<button type="button" class="ai-btn icon" id="aiFull" title="Full screen (F11)"><i class="fas fa-expand"></i></button>' +
            '<button type="button" class="ai-btn icon" id="aiExit" title="Back to Tech Studio"><i class="fas fa-arrow-right-from-bracket"></i></button>' +
          '</div>' +
        '</header>' +
        '<div class="ai-main" id="aiMain">' +
          '<nav class="ai-acts" aria-label="Views">' +
            act('explorer', 'fa-copy', 'Explorer (Ctrl+Shift+E)') + act('search', 'fa-magnifying-glass', 'Search (Ctrl+Shift+F)') + act('tools', 'fa-puzzle-piece', 'Language tools') +
            '<span class="grow"></span>' + act('keys', 'fa-keyboard', 'Keyboard shortcuts') + act('settings', 'fa-gear', 'Settings') +
          '</nav>' +
          '<aside class="ai-side" id="aiSide"><div class="ai-side-h"><span id="aiSideTitle"></span><div class="acts" id="aiSideActs"></div></div><div class="ai-side-b" id="aiSideBody"></div></aside>' +
          '<div class="ai-resize v" id="aiSideRz" role="separator" aria-orientation="vertical" title="Drag to resize"></div>' +
          '<section class="ai-center" id="aiCenter">' +
            '<div id="aiBanner"></div>' +
            '<div class="ai-edrow" id="aiEdrow">' +
              group(0) + '<div class="ai-resize split" id="aiSplitRz" hidden></div>' + group(1) +
              '<div class="ai-resize" id="aiPrevRz" hidden></div>' +
              '<div class="ai-prev" id="aiPrev" hidden><div class="ai-prev-h"><i class="fas fa-display"></i>&nbsp;Preview<span class="sp"></span>' +
                '<button type="button" class="ai-btn icon on" id="aiLive" title="Live preview: refresh as you type"><i class="fas fa-bolt"></i></button>' +
                '<button type="button" class="ai-btn icon" data-w="" title="Full width"><i class="fas fa-desktop"></i></button><button type="button" class="ai-btn icon" data-w="tablet" title="Tablet width"><i class="fas fa-tablet-screen-button"></i></button><button type="button" class="ai-btn icon" data-w="phone" title="Phone width"><i class="fas fa-mobile-screen"></i></button>' +
                '<button type="button" class="ai-btn icon" id="aiPrevRefresh" title="Refresh"><i class="fas fa-rotate-right"></i></button><button type="button" class="ai-btn icon" id="aiPrevClose" title="Close preview"><i class="fas fa-xmark"></i></button></div>' +
                '<div class="ai-prev-body" id="aiPrevBody"><div class="ai-prev-empty">Press Run to see your page here.</div></div></div>' +
            '</div>' +
            '<div class="ai-resize h" id="aiPanelRz" role="separator" aria-orientation="horizontal" title="Drag to resize"></div>' +
            '<div class="ai-panel" id="aiPanel">' +
              '<div class="ai-ptabs" role="tablist">' +
                '<button type="button" class="ai-ptab on" data-ptab="term" role="tab"><i class="fas fa-terminal"></i> Terminal</button>' +
                '<button type="button" class="ai-ptab" data-ptab="probs" role="tab">Problems <span class="n" id="aiProbN">0</span></button>' +
                '<button type="button" class="ai-ptab" data-ptab="input" role="tab">Input <span class="n" id="aiInN" hidden></span></button>' +
                '<span class="sp"></span>' +
                '<button type="button" class="ai-btn icon" id="aiClear" title="Clear the terminal"><i class="fas fa-ban"></i></button>' +
                '<button type="button" class="ai-btn icon" id="aiMaxPanel" title="Maximise the panel"><i class="fas fa-chevron-up"></i></button>' +
                '<button type="button" class="ai-btn icon" id="aiClosePanel" title="Close the panel (Ctrl+J)"><i class="fas fa-xmark"></i></button>' +
              '</div>' +
              '<div class="ai-pbody">' +
                '<div class="ai-pane" data-pane="term"><div class="ai-term" id="aiTerm" tabindex="0" aria-live="polite"></div>' +
                  '<div class="ai-inrow" id="aiInRow" hidden><i class="fas fa-chevron-right p"></i><input id="aiInLine" autocomplete="off" spellcheck="false" aria-label="Type input for your program and press Enter">' +
                  '<button type="button" class="ai-btn ghost" id="aiInSend">Send</button><button type="button" class="ai-btn" id="aiInEnd" title="End of input (Ctrl+D)">End input</button></div></div>' +
                '<div class="ai-pane" data-pane="probs" hidden><div class="ai-probs" id="aiProbs"></div></div>' +
                '<div class="ai-pane" data-pane="input" hidden><div class="ai-stdin"><p id="aiInHelp"></p><textarea id="aiStdin" spellcheck="false" placeholder="One answer per line, for example:\nAda\n14"></textarea></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="ai-launch" id="aiLaunch" hidden></div>' +
          '</section>' +
        '</div>' +
        '<footer class="ai-status" id="aiStatus"></footer>' +
      '</div>');
    function act(v, ic, t) { return '<button type="button" class="ai-act" data-view="' + v + '" title="' + t + '" aria-label="' + t + '"><i class="fas ' + ic + '"></i></button>'; }
    function group(i) {
      return '<div class="ai-group' + (i ? ' second' : '') + '" id="aiG' + i + '"' + (i ? ' hidden' : '') + '><div class="ai-tabs"><div class="ai-tablist" role="tablist"></div><div class="ai-tabs-r">' +
        '<button type="button" class="ai-btn icon" data-gcmd="runfile" title="Run this file" hidden><i class="fas fa-play"></i></button>' +
        '<button type="button" class="ai-btn icon" data-gcmd="format" title="Format document (Shift+Alt+F)"><i class="fas fa-align-left"></i></button>' +
        (i ? '<button type="button" class="ai-btn icon" data-gcmd="unsplit" title="Close split"><i class="fas fa-xmark"></i></button>' : '') +
        '</div></div><div class="ai-ed"></div></div>';
    }
    document.body.appendChild(app);
    var q = function (s) { return $(s, app); };
    var term = q('#aiTerm'), stdinEl = q('#aiStdin');

    /* ---------- editors ---------- */
    function editorOptions() {
      return {
        theme: S.theme === 'light' ? 'paisley-light' : 'paisley-dark', fontFamily: "'JetBrains Mono','Cascadia Code','Fira Code',Consolas,monospace", fontSize: S.fontSize, fontLigatures: true,
        tabSize: S.tabSize, insertSpaces: true, detectIndentation: true, automaticLayout: true, minimap: { enabled: S.minimap }, wordWrap: S.wordWrap ? 'on' : 'off',
        smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', renderLineHighlight: 'all', bracketPairColorization: { enabled: true },
        guides: { bracketPairs: 'active', indentation: true }, autoClosingBrackets: 'always', autoClosingQuotes: 'always', autoIndent: 'full', formatOnPaste: true, formatOnType: true,
        suggestOnTriggerCharacters: true, quickSuggestions: { other: true, comments: false, strings: false }, parameterHints: { enabled: true }, folding: true, showFoldingControls: 'mouseover',
        lineNumbers: 'on', scrollBeyondLastLine: false, padding: { top: 10, bottom: 10 }, fixedOverflowWidgets: true, stickyScroll: { enabled: true }, tabCompletion: 'on',
        snippetSuggestions: 'inline', wordBasedSuggestions: 'matchingDocuments', suggest: { showStatusBar: true }, readOnly: !(P && P.canEdit), 'semanticHighlighting.enabled': true
      };
    }
    function makeGroup(i) {
      var root = q('#aiG' + i);
      var gr = { i: i, root: root, list: $('.ai-tablist', root), ed: null, host: $('.ai-ed', root), tabs: [], active: null, views: {} };
      gr.ed = monaco.editor.create(gr.host, Object.assign(editorOptions(), { model: null }));
      gr.ed.onDidFocusEditorText(function () { focus = i; status(); });
      gr.ed.onDidChangeCursorPosition(function () { if (focus === i) status(); });
      gr.ed.addCommand(monaco.KeyCode.F5, function () { run(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () { run(); });
      gr.ed.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F5, function () { stop(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () { saveNow(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, function () { quickOpen(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, function () { toggleSide(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, function () { togglePanel(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash, function () { toggleSplit(); });
      gr.ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, function () { showSide('search'); });
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-gcmd],[data-tab],[data-tabx]'); if (!t) return;
        if (t.dataset.tabx) { e.stopPropagation(); closeTab(gr, t.dataset.tabx); return; }
        if (t.dataset.tab) { openFile(t.dataset.tab, i); return; }
        var c = t.dataset.gcmd;
        if (c === 'runfile') run(gr.active);
        else if (c === 'format') format(gr);
        else if (c === 'unsplit') toggleSplit(false);
      });
      root.addEventListener('auxclick', function (e) { var t = e.target.closest('[data-tab]'); if (t && e.button === 1) closeTab(gr, t.dataset.tab); });
      root.addEventListener('dblclick', function (e) { if (e.target.closest('.ai-tabs') && !e.target.closest('button.ai-btn')) toggleZen(); });
      return gr;
    }
    groups = [makeGroup(0), makeGroup(1)];
    function G() { return groups[focus] && !groups[focus].root.hidden ? groups[focus] : groups[0]; }

    function uriOf(name) { return monaco.Uri.parse('file:///project/' + name.split('/').map(encodeURIComponent).join('/')); }
    function nameOfModel(m) { if (!m) return ''; for (var n in models) if (models[n] === m) return n; return ''; }
    function file(name) { return P ? P.files.filter(function (f) { return f.name === name; })[0] : null; }
    function modelFor(f) {
      if (models[f.name] && !models[f.name].isDisposed()) return models[f.name];
      var old = monaco.editor.getModel(uriOf(f.name)); if (old) old.dispose();
      var m = monaco.editor.createModel(f.content, L.info(f.lang).monaco, uriOf(f.name));
      models[f.name] = m;
      m.onDidChangeContent(function () {
        var ff = file(nameOfModel(m)); if (!ff) return;
        ff.content = m.getValue();
        changed(ff);
        intel.lint(m);
      });
      intel.lint(m);
      return m;
    }
    function changed(f) {
      intel.filesChanged();
      paintTabs(); scheduleSave(); scheduleDraft();
      if (f && /^(html|css|js)$/.test(f.lang) && !q('#aiPrev').hidden && S.livePreview) { clearTimeout(prevTimer); prevTimer = setTimeout(function () { runWeb(null, true); }, 700); }
    }

    /* ---------- tabs ---------- */
    function openFile(name, gi, at) {
      var f = file(name); if (!f) return;
      var gr = groups[gi == null ? (G().i) : gi];
      if (gr.root.hidden) gr = groups[0];
      if (gr.active && gr.ed.getModel()) gr.views[gr.active] = gr.ed.saveViewState();
      if (gr.tabs.indexOf(name) === -1) gr.tabs.push(name);
      gr.active = name;
      gr.ed.setModel(modelFor(f));
      if (gr.views[name]) gr.ed.restoreViewState(gr.views[name]);
      gr.ed.updateOptions({ readOnly: !P.canEdit });
      if (at) { gr.ed.revealLineInCenter(at.line); gr.ed.setPosition({ lineNumber: at.line, column: at.col || 1 }); if (at.sel) gr.ed.setSelection(at.sel); }
      focus = gr.i;
      if (P.canEdit && P.active !== name && gr.i === 0) { P.active = name; dirtyMeta = true; scheduleSave(); }
      P.active = gr.i === 0 ? name : P.active;
      paintTabs(); paintTree(); status(); welcome();
      gr.ed.focus();
      if (innerWidth <= 900) q('#aiMain').classList.add('noside');
    }
    function closeTab(gr, name) {
      var i = gr.tabs.indexOf(name); if (i === -1) return;
      gr.tabs.splice(i, 1); delete gr.views[name];
      if (gr.active === name) {
        gr.active = gr.tabs[Math.min(i, gr.tabs.length - 1)] || null;
        gr.ed.setModel(gr.active ? modelFor(file(gr.active)) : null);
      }
      if (gr.i === 0) { dirtyMeta = true; scheduleSave(); }
      paintTabs(); welcome(); status();
    }
    function isDirty(name) { var f = file(name); return !!f && saved[name] !== f.content; }
    function paintTabs() {
      groups.forEach(function (gr) {
        gr.list.innerHTML = gr.tabs.map(function (n) {
          var f = file(n); if (!f) return '';
          return '<button type="button" class="ai-tab' + (n === gr.active ? ' on' : '') + (P.canEdit && isDirty(n) ? ' dirty' : '') + '" data-tab="' + esc(n) + '" role="tab" aria-selected="' + (n === gr.active) + '" title="' + esc(n) + '">' +
            L.icon(f.lang) + '<span class="nm">' + esc(baseOf(n)) + '</span><span class="x" data-tabx="' + esc(n) + '" role="button" aria-label="Close ' + esc(n) + '"><i class="fas fa-xmark"></i></span></button>';
        }).join('');
        var on = gr.list.querySelector('.ai-tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        var rf = $('[data-gcmd="runfile"]', gr.root), af = gr.active && file(gr.active);
        rf.hidden = !(af && L.runnerFor(af.lang) && af.name !== P.entry);
      });
    }
    function welcome() {
      groups.forEach(function (gr) {
        var w = $('.ai-welcome', gr.host);
        if (gr.active) { if (w) w.remove(); return; }
        if (w) return;
        gr.host.appendChild(el('<div class="ai-welcome"><div><div class="logo"><i class="fas fa-terminal"></i></div><h3>Open a file from the explorer to start</h3><div class="ai-keys">' + keysHtml(true) + '</div></div></div>'));
      });
    }

    /* ---------- explorer ---------- */
    function folders() {
      var set = {};
      (P.folders || []).concat(P.files.map(function (f) { return dirOf(f.name); })).forEach(function (d) { var p = ''; if (!d) return; d.split('/').forEach(function (x) { p = p ? p + '/' + x : x; set[p] = 1; }); });
      return Object.keys(set).sort();
    }
    function paintTree() {
      if (sideView !== 'explorer') return;
      var body = q('#aiSideBody'); if (!body) return;
      if (!P) { body.innerHTML = ''; return; }
      var dirs = folders(), active = G().active;
      function items(d, depth) {
        var pad = 'padding-left:' + (.35 + depth * .8) + 'rem';
        return dirs.filter(function (x) { return dirOf(x) === d; }).map(function (x) {
          var open = openDirs[x] !== false;
          return '<div class="ai-node' + (open ? ' open' : '') + '" style="' + pad + '" data-dir="' + esc(x) + '" tabindex="0" role="treeitem" aria-expanded="' + open + '"><i class="fas fa-chevron-right chev"></i><i class="fas fa-folder' + (open ? '-open' : '') + ' ai-dir-ic"></i><span class="nm">' + esc(baseOf(x)) + '</span>' +
            (P.canEdit ? '<button type="button" class="more" data-more aria-label="Folder actions"><i class="fas fa-ellipsis"></i></button>' : '') + '</div>' + (open ? items(x, depth + 1) : '');
        }).join('') + P.files.filter(function (f) { return dirOf(f.name) === d; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (f) {
          return '<div class="ai-node' + (f.name === active ? ' on' : '') + '" style="' + pad + '" data-file="' + esc(f.name) + '" tabindex="0" role="treeitem" title="' + esc(f.name) + '"><span class="chev"></span>' + L.icon(f.lang) + '<span class="nm">' + esc(baseOf(f.name)) + '</span>' +
            (f.name === P.entry ? '<span class="tag" title="Run starts here">Run</span>' : '') + (P.canEdit ? '<button type="button" class="more" data-more aria-label="File actions"><i class="fas fa-ellipsis"></i></button>' : '') + '</div>';
        }).join('');
      }
      body.innerHTML = '<div class="ai-tree" role="tree">' + (P.files.length || dirs.length ? items('', 0) : '<div class="ai-empty-side">No files yet. Use the buttons above to add one.</div>') + '</div>' +
        (P.canEdit ? '<div class="ai-note" style="padding:.8rem .9rem 0">' + P.files.length + ' of ' + MAX_FILES + ' files. Double-click a file to rename it; right-click for more.</div>' : '');
    }
    function nodeMenu(node, x, y) {
      if (!P.canEdit) return;
      if (node.dataset.dir) {
        var d = node.dataset.dir;
        menu(x, y, [
          { icon: 'fa-file-circle-plus', label: 'New file here', fn: function () { newFile(d); } },
          { icon: 'fa-folder-plus', label: 'New folder here', fn: function () { newFolder(d); } }, '-',
          { icon: 'fa-pen', label: 'Rename folder', fn: function () { renameFolder(d); } },
          { icon: 'fa-trash', label: 'Delete folder', danger: true, fn: function () { deleteFolder(d); } }
        ]);
      } else {
        var n = node.dataset.file, f = file(n);
        menu(x, y, [
          { icon: 'fa-up-right-from-square', label: 'Open', fn: function () { openFile(n); } },
          { icon: 'fa-table-columns', label: 'Open to the side', fn: function () { toggleSplit(true); openFile(n, 1); } },
          L.runnerFor(f.lang) ? { icon: 'fa-play', label: n === P.entry ? 'Run (this is the run file)' : 'Set as the run file', fn: function () { setEntry(n); } } : null, '-',
          { icon: 'fa-pen', label: 'Rename', kbd: 'F2', fn: function () { renameFile(n); } },
          { icon: 'fa-clone', label: 'Duplicate', fn: function () { duplicate(n); } },
          { icon: 'fa-trash', label: 'Delete', kbd: 'Del', danger: true, fn: function () { deleteFile(n); } }
        ].filter(Boolean));
      }
    }

    /* ---------- file operations ---------- */
    function defaultExt() { return { py: 'py', java: 'java', c: 'c', cpp: 'cpp', php: 'php', js: 'js', html: 'html', css: 'css' }[P.lang] || 'txt'; }
    function starterFor(name, lang) {
      var base = baseOf(name).replace(/\.[^.]+$/, '');
      if (lang === 'java') return 'public class ' + base.replace(/\W/g, '') + ' {\n\n}\n';
      if (lang === 'php') return '<?php\n\n';
      if (lang === 'html') return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>' + base + '</title>\n</head>\n<body>\n\n</body>\n</html>\n';
      if (/\.(h|hpp|hh)$/i.test(name)) { var gd = base.toUpperCase().replace(/\W/g, '_') + '_H'; return lang === 'cpp' ? '#pragma once\n\n' : '#ifndef ' + gd + '\n#define ' + gd + '\n\n\n#endif\n'; }
      return '';
    }
    function validName(n, except) {
      if (!n) return 'Give it a name.';
      if (P.files.some(function (f) { return f.name === n && f.name !== except; })) return 'There is already a file called ' + n + '.';
      if (folders().indexOf(n) !== -1) return 'There is a folder with that name.';
      return '';
    }
    function newFile(inDir) {
      if (P.files.length >= MAX_FILES) return toast('A project can have ' + MAX_FILES + ' files at most.');
      var base = (inDir ? inDir + '/' : '');
      ask({ title: 'New file', text: 'Name it with its extension: .py, .java, .c, .h, .cpp, .php, .html, .css, .js, .txt. Use a slash for a folder, like src/game.' + defaultExt() + '.', value: base + (P.lang === 'java' ? 'Helper.java' : 'untitled.' + defaultExt()), ok: 'Create', selectBase: true }).then(function (v) {
        if (v == null) return;
        var n = cleanName(v); if (n && !/\.[^./]+$/.test(n)) n += '.' + defaultExt();
        var bad = validName(n); if (bad) return toast(bad);
        var lang = L.langOf(n, P.lang);
        P.files.push({ name: n, lang: lang, content: starterFor(n, lang) });
        if (dirOf(n)) openDirs[dirOf(n)] = true;
        saved[n] = null; afterFiles(); openFile(n);
      });
    }
    function newFolder(inDir) {
      ask({ title: 'New folder', text: 'Folders keep a bigger project tidy.', value: (inDir ? inDir + '/' : '') + 'folder', ok: 'Create', selectBase: true }).then(function (v) {
        if (v == null) return;
        var d = cleanName(v); if (!d) return;
        if (folders().indexOf(d) !== -1) return toast('That folder already exists.');
        P.folders = (P.folders || []).concat([d]); openDirs[d] = true; dirtyMeta = true; afterFiles();
      });
    }
    function renameFile(n) {
      ask({ title: 'Rename', text: 'You can move it into a folder too: src/' + baseOf(n), value: n, ok: 'Rename', selectBase: true }).then(function (v) {
        if (v == null) return;
        var to = cleanName(v); if (!to || to === n) return;
        var bad = validName(to, n); if (bad) return toast(bad);
        moveFile(n, to); afterFiles();
      });
    }
    function moveFile(n, to) {
      var f = file(n); if (!f) return;
      if (models[n]) { f.content = models[n].getValue(); models[n].dispose(); delete models[n]; }
      f.name = to; f.lang = L.langOf(to, P.lang);
      saved[to] = saved[n]; delete saved[n];
      if (P.entry === n) P.entry = to;
      if (P.active === n) P.active = to;
      groups.forEach(function (gr) {
        var i = gr.tabs.indexOf(n); if (i !== -1) gr.tabs[i] = to;
        if (gr.active === n) { gr.active = to; gr.ed.setModel(modelFor(f)); }
      });
    }
    function duplicate(n) {
      var f = file(n); if (!f) return;
      if (P.files.length >= MAX_FILES) return toast('A project can have ' + MAX_FILES + ' files at most.');
      var m = /^(.*?)(\.[^.]+)?$/.exec(n), k = 2, to;
      do { to = m[1] + '-' + k + (m[2] || ''); k++; } while (file(to));
      P.files.push({ name: to, lang: f.lang, content: f.content }); saved[to] = null; afterFiles(); openFile(to);
    }
    function deleteFile(n) {
      confirmBox({ title: 'Delete ' + baseOf(n) + '?', text: 'This removes the file from the project. It cannot be undone.', ok: 'Delete', danger: true }).then(function (yes) {
        if (!yes) return;
        removeFile(n);
        afterFiles();
      });
    }
    function removeFile(n) {
      P.files = P.files.filter(function (f) { return f.name !== n; });
      if (models[n]) { monaco.editor.setModelMarkers(models[n], 'pz-run', []); models[n].dispose(); delete models[n]; }
      delete saved[n];
      groups.forEach(function (gr) { if (gr.tabs.indexOf(n) !== -1) closeTab(gr, n); });
      if (P.entry === n) P.entry = L.defaultEntry(P.lang, P.files) || '';
    }
    function renameFolder(d) {
      ask({ title: 'Rename folder', value: d, ok: 'Rename', selectBase: true }).then(function (v) {
        if (v == null) return;
        var to = cleanName(v); if (!to || to === d) return;
        if (folders().indexOf(to) !== -1) return toast('That folder already exists.');
        P.files.filter(function (f) { return f.name.indexOf(d + '/') === 0; }).forEach(function (f) { moveFile(f.name, to + f.name.slice(d.length)); });
        P.folders = (P.folders || []).map(function (x) { return x === d || x.indexOf(d + '/') === 0 ? to + x.slice(d.length) : x; });
        dirtyMeta = true; afterFiles();
      });
    }
    function deleteFolder(d) {
      var inside = P.files.filter(function (f) { return f.name.indexOf(d + '/') === 0; });
      confirmBox({ title: 'Delete the folder ' + baseOf(d) + '?', text: inside.length ? 'Its ' + inside.length + ' file' + (inside.length === 1 ? '' : 's') + ' will be deleted too. This cannot be undone.' : 'The folder is empty.', ok: 'Delete', danger: true }).then(function (yes) {
        if (!yes) return;
        inside.forEach(function (f) { removeFile(f.name); });
        P.folders = (P.folders || []).filter(function (x) { return x !== d && x.indexOf(d + '/') !== 0; });
        dirtyMeta = true; afterFiles();
      });
    }
    function setEntry(n) { P.entry = n; dirtyMeta = true; afterFiles(); toast('Run now starts from ' + n + '.'); }
    function afterFiles() { intel.filesChanged(); paintEntry(); paintTree(); paintTabs(); welcome(); status(); scheduleSave(true); scheduleDraft(); syncPrevButton(); }
    function paintEntry() {
      var sel = q('#aiEntry'), run = P.files.filter(function (f) { return L.runnerFor(f.lang); });
      if (!P.entry || !file(P.entry)) P.entry = L.defaultEntry(P.lang, P.files) || (run[0] && run[0].name) || '';
      sel.innerHTML = run.length ? run.map(function (f) { return '<option value="' + esc(f.name) + '"' + (f.name === P.entry ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('') : '<option value="">No runnable file</option>';
      sel.disabled = !P.canEdit || run.length < 2;
      q('#aiRun').disabled = !run.length;
    }

    /* ---------- side bar ---------- */
    /* An activity icon toggles its view, like VS Code; everything else just shows it. */
    function showSide(v, toggle) {
      var main = q('#aiMain');
      if (toggle && sideView === v && !main.classList.contains('noside')) { main.classList.add('noside'); paintActs(); return; }
      sideView = v; lsSet('pz-ide-side', v);
      main.classList.remove('noside');
      paintActs(); paintSide();
    }
    function toggleSide() { var main = q('#aiMain'); main.classList.toggle('noside'); if (!main.classList.contains('noside')) paintSide(); paintActs(); }
    function paintActs() {
      var hidden = q('#aiMain').classList.contains('noside');
      app.querySelectorAll('.ai-act').forEach(function (b) { b.classList.toggle('on', !hidden && b.dataset.view === sideView); });
    }
    function paintSide() {
      var title = q('#aiSideTitle'), acts = q('#aiSideActs'), body = q('#aiSideBody');
      acts.innerHTML = '';
      if (sideView === 'explorer') {
        title.textContent = P ? P.title : 'Explorer';
        if (P && P.canEdit) acts.innerHTML = '<button type="button" class="ai-btn icon" data-side="newfile" title="New file (Alt+N)"><i class="fas fa-file-circle-plus"></i></button><button type="button" class="ai-btn icon" data-side="newfolder" title="New folder"><i class="fas fa-folder-plus"></i></button><button type="button" class="ai-btn icon" data-side="collapse" title="Collapse folders"><i class="fas fa-minus"></i></button>';
        paintTree();
      } else if (sideView === 'search') {
        title.textContent = 'Search';
        body.innerHTML = '<div class="ai-search"><div class="ai-field"><input id="aiFind" placeholder="Search every file" aria-label="Search"><button type="button" class="ai-btn icon" id="aiFindCase" title="Match case">Aa</button><button type="button" class="ai-btn icon" id="aiFindRe" title="Use a regular expression">.*</button></div>' +
          (P && P.canEdit ? '<div class="ai-field"><input id="aiRepl" placeholder="Replace with" aria-label="Replace with"><button type="button" class="ai-btn icon" id="aiReplAll" title="Replace all"><i class="fas fa-right-left"></i></button></div>' : '') +
          '<div class="ai-search-sum" id="aiFindSum"></div><div id="aiFindRes"></div></div>';
        var fi = q('#aiFind'); fi.value = searchState.text; fi.focus(); fi.select();
        q('#aiFindCase').classList.toggle('on', searchState.cs); q('#aiFindRe').classList.toggle('on', searchState.re);
        fi.oninput = function () { searchState.text = fi.value; doSearch(); };
        q('#aiFindCase').onclick = function () { searchState.cs = !searchState.cs; this.classList.toggle('on', searchState.cs); doSearch(); };
        q('#aiFindRe').onclick = function () { searchState.re = !searchState.re; this.classList.toggle('on', searchState.re); doSearch(); };
        if (q('#aiReplAll')) q('#aiReplAll').onclick = replaceAll;
        doSearch();
      } else if (sideView === 'tools') {
        title.textContent = 'Language tools';
        paintTools();
      } else if (sideView === 'settings') {
        title.textContent = 'Settings';
        body.innerHTML = '<div class="ai-set">' +
          '<label class="row">Theme<select id="sTheme"><option value="dark">Paisley dark</option><option value="light">Paisley light</option></select></label>' +
          '<label class="row">Font size<input type="number" id="sFont" min="10" max="28"></label>' +
          '<label class="row">Tab size<select id="sTab"><option>2</option><option>4</option><option>8</option></select></label>' +
          '<label class="row">Word wrap<input type="checkbox" class="ai-switch" id="sWrap"></label>' +
          '<label class="row">Minimap<input type="checkbox" class="ai-switch" id="sMini"></label>' +
          '<label class="row">Save automatically<input type="checkbox" class="ai-switch" id="sAuto"></label>' +
          '<label class="row">Type input while a program runs<input type="checkbox" class="ai-switch" id="sLive"></label>' +
          '<label class="row">Prepare the language when a project opens<input type="checkbox" class="ai-switch" id="sWarm"></label>' +
          '<p class="ai-note">These settings are kept in this browser.' + (runner.isolated ? '' : ' This browser cannot pause a program for typing, so programs read their input from the Input tab.') + '</p></div>';
        q('#sTheme').value = S.theme; q('#sFont').value = S.fontSize; q('#sTab').value = String(S.tabSize);
        q('#sWrap').checked = S.wordWrap; q('#sMini').checked = S.minimap; q('#sAuto').checked = S.autoSave; q('#sLive').checked = S.liveInput; q('#sWarm').checked = S.warm;
        q('#sLive').disabled = !runner.isolated;
        body.querySelector('.ai-set').onchange = function () {
          S.theme = q('#sTheme').value; S.fontSize = Math.max(10, Math.min(28, +q('#sFont').value || 14)); S.tabSize = +q('#sTab').value;
          S.wordWrap = q('#sWrap').checked; S.minimap = q('#sMini').checked; S.autoSave = q('#sAuto').checked; S.liveInput = q('#sLive').checked; S.warm = q('#sWarm').checked;
          writeSettings(S); applySettings();
        };
      } else if (sideView === 'keys') {
        title.textContent = 'Keyboard shortcuts';
        body.innerHTML = '<div class="ai-set"><div class="ai-keys">' + keysHtml(false) + '</div></div>';
      }
    }
    function keysHtml(short) {
      var k = [['F5', 'Run'], ['Ctrl+Enter', 'Run'], ['Shift+F5', 'Stop'], ['Ctrl+S', 'Save'], ['Ctrl+P', 'Open a file by name'], ['Ctrl+Space', 'Suggestions'], ['Ctrl+Shift+Space', 'Parameter hints'],
        ['Ctrl+F', 'Find'], ['Ctrl+H', 'Replace'], ['Ctrl+Shift+F', 'Search all files'], ['Ctrl+/', 'Comment a line'], ['Shift+Alt+F', 'Format (HTML, CSS, JS, JSON)'], ['Ctrl+Shift+[', 'Fold'], ['Ctrl+Shift+]', 'Unfold'],
        ['Alt+Up / Down', 'Move a line'], ['Ctrl+D', 'Select the next match'], ['Ctrl+B', 'Side bar'], ['Ctrl+J', 'Panel'], ['Ctrl+\\', 'Split editor'], ['Alt+N', 'New file'], ['F11', 'Full screen'], ['F1', 'Every command']];
      if (short) k = [k[0], k[3], k[4], k[5], k[9]];
      return k.map(function (x) { return '<span>' + x[0].split(' / ').map(function (p) { return '<kbd>' + esc(p) + '</kbd>'; }).join(' / ') + '</span><span>' + esc(x[1]) + '</span>'; }).join('');
    }
    function applySettings() {
      app.dataset.theme = S.theme;
      groups.forEach(function (gr) { gr.ed.updateOptions(editorOptions()); });
      monaco.editor.setTheme(S.theme === 'light' ? 'paisley-light' : 'paisley-dark');
      Object.keys(models).forEach(function (n) { models[n].updateOptions({ tabSize: S.tabSize }); });
      status();
    }

    /* ---------- search ---------- */
    var searchState = { text: '', cs: false, re: false };
    function searchRe() {
      if (!searchState.text) return null;
      try { return new RegExp(searchState.re ? searchState.text : searchState.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), searchState.cs ? 'g' : 'gi'); } catch (e) { return false; }
    }
    function doSearch() {
      var res = q('#aiFindRes'), sum = q('#aiFindSum'); if (!res || !P) return;
      var re = searchRe();
      if (re === false) { sum.textContent = 'That regular expression is not valid.'; res.innerHTML = ''; return; }
      if (!re) { sum.textContent = ''; res.innerHTML = ''; return; }
      var total = 0, html = '';
      P.files.forEach(function (f) {
        var hits = [];
        f.content.split('\n').forEach(function (line, i) {
          re.lastIndex = 0; var m;
          while ((m = re.exec(line)) && hits.length < 200) { hits.push({ line: i + 1, col: m.index + 1, len: m[0].length || 1, text: line }); if (!m[0].length) re.lastIndex++; }
        });
        if (!hits.length) return;
        total += hits.length;
        html += '<div class="ai-hit-file">' + L.icon(f.lang) + esc(f.name) + '<span class="n">' + hits.length + '</span></div>' + hits.slice(0, 60).map(function (h) {
          var s = Math.max(0, h.col - 30), pre = h.text.slice(s, h.col - 1), hit = h.text.slice(h.col - 1, h.col - 1 + h.len), post = h.text.slice(h.col - 1 + h.len, h.col + 80);
          return '<button type="button" class="ai-hit" data-hit="' + esc(f.name) + '|' + h.line + '|' + h.col + '|' + h.len + '">' + (s ? '…' : '') + esc(pre.replace(/^\s+/, '')) + '<mark>' + esc(hit) + '</mark>' + esc(post) + '</button>';
        }).join('');
      });
      sum.textContent = total ? total + ' result' + (total === 1 ? '' : 's') : 'No results.';
      res.innerHTML = html;
    }
    function replaceAll() {
      var re = searchRe(); if (!re) return;
      var to = q('#aiRepl').value, n = 0;
      P.files.forEach(function (f) {
        var c = f.content.replace(re, function (m) { n++; return searchState.re ? m.replace(new RegExp(re.source, re.flags.replace('g', '')), to) : to; });
        if (c !== f.content) {
          if (models[f.name]) models[f.name].pushEditOperations([], [{ range: models[f.name].getFullModelRange(), text: c }], function () { return null; });
          else { f.content = c; changed(f); }
        }
      });
      toast(n ? 'Replaced ' + n + ' match' + (n === 1 ? '' : 'es') + '.' : 'Nothing to replace.');
      doSearch();
    }

    /* ---------- language tools ---------- */
    var RT = {};   // runtime state per runner key
    function rtKey(lang) { var r = L.runnerFor(lang); return r === 'c' || r === 'cpp' ? 'cpp' : r; }
    function paintTools() {
      if (sideView !== 'tools') return;
      var body = q('#aiSideBody');
      body.innerHTML = '<div class="ai-tools"><p class="ai-note"><b>Full IntelliSense</b> comes from a real language service. <b>Paisley suggestions</b> are hand-built help (keywords, snippets, the standard library, your own names, parameter hints) and say so. Code runs in a sealed sandbox in your browser, except Java, which runs on the Paisley code runner.</p>' +
        L.PROJECT_LANGS.map(function (id) {
          var m = L.info(id), key = rtKey(id), st = runtimeLabel(key);
          return '<div class="ai-tool"><h4>' + L.icon(id) + ' ' + esc(m.label) + (P && P.lang === id ? '<span class="ai-chip">This project</span>' : '') + '</h4>' +
            '<span class="lv ' + m.help + '"><i class="fas ' + (m.help === 'full' ? 'fa-circle-check' : 'fa-wand-magic-sparkles') + '"></i>' + (m.help === 'full' ? 'Full IntelliSense' : 'Paisley suggestions') + '</span>' +
            '<p>' + esc(m.helpNote) + '</p><p><i class="fas fa-play" style="color:var(--brand)"></i> ' + esc(m.runNote) + '</p>' +
            '<div class="st">' + st.html + (st.can ? '<button type="button" class="ai-btn ghost" data-warm="' + key + '">' + (key === 'python' ? 'Prepare' : 'Download') + '</button>' : '') + '</div></div>';
        }).join('') + '</div>';
    }
    function runtimeLabel(key) {
      if (key === 'web') return { html: '<i class="fas fa-circle-check" style="color:var(--ok)"></i> Ready, nothing to download' };
      if (key === 'java') return { html: '<i class="fas fa-cloud"></i> Runs on the Paisley code runner' };
      var r = RT[key] || {}, s = runner.state(key);
      if (key === 'python' && pyState === 'ready') s = 'ready';
      if (s === 'ready') return { html: '<i class="fas fa-circle-check" style="color:var(--ok)"></i> Ready' };
      if (s === 'loading') return { html: '<i class="fas fa-circle-notch spin"></i> ' + esc(r.label || 'Loading') };
      if (s === 'error') return { html: '<i class="fas fa-triangle-exclamation" style="color:var(--err)"></i> Could not load', can: true };
      return { html: '<i class="fas fa-cloud-arrow-down"></i> ' + ({ python: 'About 12 MB, once', cpp: 'About 18 MB, once', php: 'About 5 MB, once' }[key] || ''), can: true };
    }
    function onRuntime(lang, info) {
      var key = lang === 'c' ? 'cpp' : lang;
      RT[key] = info;
      status(); paintTools();
      if (info.state === 'ready' && P) Object.keys(models).forEach(function (n) { var f = file(n); if (f && rtKey(f.lang) === key) intel.lint(models[n]); });
    }

    /* ---------- status bar ---------- */
    function status() {
      var bar = q('#aiStatus'); if (!bar || !P) { if (bar) bar.innerHTML = ''; return; }
      var gr = G(), f = gr.active && file(gr.active), pos = gr.ed.getPosition();
      var markers = monaco.editor.getModelMarkers({}), errs = markers.filter(function (m) { return m.severity === monaco.MarkerSeverity.Error; }).length, warns = markers.filter(function (m) { return m.severity === monaco.MarkerSeverity.Warning; }).length;
      var left = '', key = f ? rtKey(f.lang) : rtKey(P.lang), r = RT[key];
      if (r && r.state === 'loading') left += '<span><i class="fas fa-circle-notch spin"></i> ' + esc(r.label || 'Loading') + ' <span class="prog' + (r.pct == null ? ' indet' : '') + '"><i style="width:' + (r.pct || 0) + '%"></i></span></span>';
      else if (pyState === 'loading' && f && f.lang === 'py') left += '<span><i class="fas fa-circle-notch spin"></i> Loading Python IntelliSense</span>';
      if (f) {
        var m = L.info(f.lang);
        if (m.help) left += '<button type="button" data-st="tools" title="' + esc(m.helpNote || '') + '"><i class="fas ' + (m.help === 'full' ? 'fa-circle-check' : 'fa-wand-magic-sparkles') + ' lv"></i> ' + (m.help === 'full' ? 'Full IntelliSense' : 'Paisley suggestions') + (f.lang === 'py' && pyState !== 'ready' ? ' (starting)' : '') + '</button>';
      }
      left += '<button type="button" data-st="probs" title="Problems"><i class="fas fa-circle-xmark"></i> ' + errs + ' <i class="fas fa-triangle-exclamation"></i> ' + warns + '</button>';
      var right = (pos && f ? '<button type="button" class="hide-s" data-st="goto">Ln ' + pos.lineNumber + ', Col ' + pos.column + '</button>' : '') +
        '<span class="hide-s">Spaces: ' + S.tabSize + '</span>' + (f ? '<span>' + esc(L.info(f.lang).label) + '</span>' : '') +
        '<button type="button" class="hide-s" data-st="input" title="Where your program reads its input">' + (runner.isolated && S.liveInput ? '<i class="fas fa-keyboard"></i> Input: type as it runs' : '<i class="fas fa-list"></i> Input: Input tab') + '</button>' +
        '<span title="Code runs in a sealed sandbox: it cannot reach your account or this page"><i class="fas fa-shield-halved"></i></span>';
      bar.innerHTML = left + '<span class="sp"></span>' + right;
      var n = q('#aiProbN'); n.textContent = errs + warns; n.classList.toggle('err', errs > 0);
    }

    /* ---------- problems ---------- */
    function paintProblems() {
      var box = q('#aiProbs'); if (!box) return;
      var list = [];
      Object.keys(models).forEach(function (n) { monaco.editor.getModelMarkers({ resource: models[n].uri }).forEach(function (m) { list.push({ file: n, m: m }); }); });
      list.sort(function (a, b) { return a.m.severity === b.m.severity ? 0 : b.m.severity - a.m.severity; });
      box.innerHTML = list.length ? list.slice(0, 300).map(function (x) {
        var err = x.m.severity === monaco.MarkerSeverity.Error;
        return '<button type="button" class="ai-prob" data-goto="' + esc(x.file) + '|' + x.m.startLineNumber + '|' + x.m.startColumn + '"><i class="fas ' + (err ? 'fa-circle-xmark e' : 'fa-triangle-exclamation w') + '"></i><span>' + esc(x.m.message) + (x.m.source ? ' <span style="color:var(--faint)">(' + esc(x.m.source) + ')</span>' : '') + '</span><span class="where">' + esc(x.file) + ':' + x.m.startLineNumber + '</span></button>';
      }).join('') : '<div class="ai-empty-side">No problems found. Live checks run as you type' + (P && P.lang === 'java' ? '; Java errors appear when you run' : '') + '.</div>';
      status();
    }
    monaco.editor.onDidChangeMarkers(function () { paintProblems(); });

    /* ---------- panel ---------- */
    function showPanel(tab) {
      var c = q('#aiCenter'); c.classList.remove('nopanel');
      if (tab) {
        app.querySelectorAll('.ai-ptab').forEach(function (b) { b.classList.toggle('on', b.dataset.ptab === tab); b.setAttribute('aria-selected', b.dataset.ptab === tab); });
        app.querySelectorAll('.ai-pane').forEach(function (p) { p.hidden = p.dataset.pane !== tab; });
        if (tab === 'probs') paintProblems();
        if (tab === 'input') stdinEl.focus();
      }
      q('#aiClear').hidden = tab && tab !== 'term';
    }
    function togglePanel() { var c = q('#aiCenter'); if (c.classList.contains('nopanel')) showPanel(); else { c.classList.add('nopanel'); c.classList.remove('maxpanel'); } }
    function toggleMaxPanel() { var c = q('#aiCenter'); showPanel(); c.classList.toggle('maxpanel'); q('#aiMaxPanel i').className = 'fas ' + (c.classList.contains('maxpanel') ? 'fa-chevron-down' : 'fa-chevron-up'); }
    var zen = false;
    function toggleZen() {
      zen = !zen;
      q('#aiMain').classList.toggle('noside', zen);
      q('#aiCenter').classList.toggle('nopanel', zen);
      paintActs();
      toast(zen ? 'Editor maximised. Double-click the tabs again to bring the panels back.' : 'Panels restored.');
    }

    /* ---------- terminal ---------- */
    function termEmpty() {
      var lang = P ? L.info(P.lang) : null;
      term.innerHTML = '<div class="ai-term-empty"><b>This is your terminal.</b> Press <kbd>Run</kbd> or <kbd>F5</kbd> and your program’s output appears here.' +
        (P && /^(py|java|c|cpp|php)$/.test(P.lang) ? '<ul><li>' + (runner.isolated && S.liveInput ? 'When your program asks a question, a box appears here: type your answer and press Enter.' : 'Programs read their input from the Input tab. Put one answer on each line before you run.') + '</li>' +
          '<li>' + esc(lang.runNote) + '</li><li>Errors come with a plain-English explanation and a link to the line.</li></ul>' : '<ul><li>Your page opens in the preview, and anything you console.log shows up here.</li></ul>') + '</div>';
    }
    function tPrint(text, cls) {
      var e = $('.ai-term-empty', term); if (e) term.innerHTML = '';
      var last = term.lastChild;
      if (last && last.nodeType === 1 && last.tagName === 'SPAN' && last.className === (cls || 'out')) last.textContent += text;
      else { var s = document.createElement('span'); s.className = cls || 'out'; s.textContent = text; term.appendChild(s); }
      if (term.childNodes.length > 4000) term.removeChild(term.firstChild);
      term.scrollTop = term.scrollHeight;
    }
    function tSys(kind, icon, text, right) {
      var e = $('.ai-term-empty', term); if (e) term.innerHTML = '';
      if (term.lastChild && term.lastChild.textContent && !/\n$/.test(term.lastChild.textContent) && !term.lastChild.classList.contains('sys')) tPrint('\n');
      term.appendChild(el('<div class="sys ' + kind + '"><i class="fas ' + icon + '"></i><span>' + text + '</span>' + (right ? '<span class="t">' + esc(right) + '</span>' : '') + '</div>'));
      term.scrollTop = term.scrollHeight;
    }
    function tHint(text, at, extra) {
      if (!text && !extra) return;
      var n = el('<div class="hint"><i class="fas fa-lightbulb"></i><div>' + (text ? esc(text) : '') + (at ? ' <button type="button" data-goto="' + esc(at.file) + '|' + at.line + '|' + (at.col || 1) + '">Go to ' + esc(at.file) + ', line ' + at.line + '</button>' : '') + (extra || '') + '</div></div>');
      term.appendChild(n); term.scrollTop = term.scrollHeight;
    }

    /* ---------- running ---------- */
    function langName(r) { return { python: 'Python', java: 'Java', c: 'C (Clang)', cpp: 'C++ (Clang)', php: 'PHP 8.4', web: 'Web preview' }[r] || r; }
    function setRunning(on, phase) {
      running = on;
      q('#aiRun').hidden = on; q('#aiStop').hidden = !on;
      if (!on) q('#aiInRow').hidden = true;
      status();
    }
    function run(name) {
      if (!P) return;
      if (running) { stop(); }
      var entry = name || P.entry, f = file(entry);
      if (!f) { toast('Add a file to run first.'); return; }
      var r = L.runnerFor(f.lang);
      if (!r) { toast(baseOf(entry) + ' is not a program file. Choose a file to run.'); return; }
      if (P.canEdit) saveNow(true);
      Object.keys(models).forEach(function (n) { monaco.editor.setModelMarkers(models[n], 'pz-run', []); });
      /* Running always shows the terminal, so output is never hidden behind another tab. */
      showPanel('term');
      if (r === 'web') { runWeb(entry); return; }
      runText = ''; runLang = f.lang;
      var t0 = performance.now();
      var stdinText = stdinEl.value;
      var live = runner.isolated && S.liveInput;
      tSys('run', 'fa-play', 'Running <b>' + esc(entry) + '</b> · ' + esc(langName(r)), new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setRunning(true);
      var started = false;
      runner.run({ lang: r, files: P.files.map(function (x) { return { name: x.name, content: x.content }; }), entry: entry, stdin: stdinText, live: live }, {
        out: function (stream, text) { runText += text; tPrint(text, stream === 'stderr' ? 'err' : 'out'); },
        echo: function (text) { tPrint(text + '\n', 'echo'); },
        input: function () { askInput(); },
        started: function () { started = true; t0 = performance.now(); },
        phase: function (p) {
          if (p === 'compile') tSys('', 'fa-gears', runner.state('cpp') === 'ready' ? 'Compiling with Clang…' : 'Getting the C/C++ compiler ready (the first time takes a little while)…');
          if (p === 'remote') tSys('', 'fa-cloud-arrow-up', 'Sending your code to the Paisley code runner…');
        }
      }).then(function (res) {
        setRunning(false);
        finishRun(res || {}, r, entry, (performance.now() - t0) / 1000);
      });
    }
    function askInput() {
      var row = q('#aiInRow'), inp = q('#aiInLine');
      showPanel('term');
      row.hidden = false; inp.value = ''; inp.focus();
      term.scrollTop = term.scrollHeight;
    }
    function sendInput(eof) {
      var row = q('#aiInRow'), inp = q('#aiInLine');
      if (row.hidden) return;
      if (eof) { runner.endInput(); tPrint('[end of input]\n', 'echo'); }
      else { runner.input(inp.value); tPrint(inp.value + '\n', 'echo'); }
      row.hidden = true;
      var ed = G().ed; if (ed) ed.focus();
    }
    function stop() { if (!running) return; runner.stop(); }
    function finishRun(res, r, entry, secs) {
      var t = secs.toFixed(secs < 10 ? 2 : 1) + ' s';
      if (res.stopped) { tSys('bad', 'fa-stop', 'Stopped.', t); return; }
      if (res.notConfigured) {
        tSys('bad', 'fa-cloud', 'Java could not run.');
        tHint('Java runs on the Paisley code runner, an isolated server sandbox, and the Studio Desk has not switched it on yet. Python, C, C++, PHP and web projects run right here in your browser.');
        return;
      }
      if (res.failed) {
        if (runLang === 'py' && /pygame|SDL|document is not defined/i.test(runText + ' ' + (res.message || ''))) {
          tSys('bad', 'fa-gamepad', 'Pygame could not open a game window.');
          tHint('Pygame windows (pygame.display.set_mode) need a desktop window, which the Advanced IDE does not have yet. Python has been restarted, so press Run for other programs. For games in the browser, try a JavaScript project with a canvas; for charts, matplotlib works here.');
          return;
        }
        var offline = /download|network|fetch|load/i.test(res.message || '');
        tSys('bad', 'fa-triangle-exclamation', offline ? esc(langName(r)) + ' could not be downloaded.' : esc(langName(r)) + ' stopped unexpectedly.');
        tHint(offline ? 'Check your internet connection, then press Run again.'
          : 'The ' + langName(r) + ' engine hit a problem it could not recover from' + (res.message ? ' (' + res.message + ')' : '') + '. It has been restarted with a clean slate, so press Run to try again.',
          null, ' <button type="button" data-cmd="run">Run again</button>');
        return;
      }
      if (res.phase === 'compile') {
        if (res.stderr) tPrint(res.stderr + (/\n$/.test(res.stderr) ? '' : '\n'), 'err');
        var d = (res.diagnostics || []).filter(function (x) { return x.severity === 'error'; })[0] || (res.diagnostics || [])[0];
        markRun(res.diagnostics);
        tSys('bad', 'fa-circle-xmark', 'Did not compile' + (d ? ': ' + esc(d.message) : '') + '.', t);
        tHint(L.explain(runLang, (d && d.message) || res.stderr) || 'Fix the first error, then run again. Later errors often disappear once the first one is fixed.', d && file(d.file) ? { file: d.file, line: d.line, col: d.col } : null);
        return;
      }
      if (res.diagnostics && res.diagnostics.length) markRun(res.diagnostics.filter(function (x) { return x.severity === 'warning'; }));
      var at = null;
      if (res.file && res.line && file(res.file)) at = { file: res.file, line: res.line, col: res.col || 1 };
      if (!at) at = locate(runText);
      if (at) markRun([{ file: at.file, line: at.line, col: at.col, severity: 'error', message: (res.type ? res.type + ': ' : '') + (res.message || 'The program stopped here') }]);
      var ok = res.ok && !res.code;
      if (ok) tSys('ok', 'fa-circle-check', 'Finished.', t + (res.time != null ? ' · ran for ' + res.time + ' s' : ''));
      else if (res.type && res.type !== 'crash' && res.type !== 'runtime') tSys('bad', 'fa-circle-xmark', 'Stopped with ' + esc(res.type) + '.', t);
      else if (res.type === 'crash') tSys('bad', 'fa-circle-xmark', 'The program crashed.', t);
      else tSys('bad', 'fa-circle-xmark', res.code ? 'Finished with exit code ' + res.code + (res.message ? ': ' + esc(res.message) : '') + '.' : 'The program stopped with an error.', t);
      if (!ok) {
        var hint = L.explain(runLang, runText + '\n' + (res.message || ''));
        if (/EOFError|NoSuchElement|end of input/.test(runText) && !(runner.isolated && S.liveInput)) hint = 'The program wanted more input. Put one answer per line in the Input tab, then run again.';
        tHint(hint || (at ? 'Look at this line and the one above it.' : ''), at);
      }
      if (runLang === 'php' && /<(!doctype|html|body|div|p|h[1-6]|ul|table)\b/i.test(runText)) {
        tHint('', null, 'This program printed HTML. <button type="button" data-cmd="phppage">Open it as a web page</button>');
        lastPhpHtml = runText;
      }
    }
    var lastPhpHtml = '';
    /* "File "x.py", line 5" / "in index.php:7" / "on line 7" / "Main.java:12" */
    function locate(text) {
      var s = String(text || ''), m, lines = [];
      var re = /File "([^"]+)", line (\d+)|in ([\w./\-]+\.php)(?: on line |:)(\d+)|at [\w.$]+\(([\w]+\.java):(\d+)\)|([\w./\-]+\.(?:c|cpp|cc|h|hpp)):(\d+):(\d+)/g;
      while ((m = re.exec(s))) {
        var fn = m[1] || m[3] || m[5] || m[7], ln = +(m[2] || m[4] || m[6] || m[8]);
        if (fn && file(fn)) lines.push({ file: fn, line: ln, col: +(m[9] || 1) });
      }
      return lines.length ? lines[lines.length - 1] : null;
    }
    function markRun(list) {
      var by = {};
      (list || []).forEach(function (d) { if (file(d.file)) (by[d.file] = by[d.file] || []).push(d); });
      Object.keys(by).forEach(function (n) { intel.setMarkers(modelFor(file(n)), 'pz-run', by[n]); });
    }

    /* ---------- web preview ---------- */
    var prevWidth = '';
    function hasHtml() { return P.files.some(function (f) { return f.lang === 'html'; }); }
    function syncPrevButton() { q('#aiPrevBtn').hidden = !P || !hasHtml(); }
    function showPrev(on) {
      var p = q('#aiPrev'), row = q('#aiEdrow');
      p.hidden = !on; q('#aiPrevRz').hidden = !on;
      row.classList.toggle('prev', on);
      q('#aiPrevBtn').classList.toggle('on', on);
    }
    function runWeb(entry, quiet) {
      var html = entry && /\.html?$/i.test(entry) ? entry : (P.entry && /\.html?$/i.test(P.entry) ? P.entry : null);
      var page = g.CodeLab.buildPreview(P.files.map(function (f) { return { name: f.name, lang: f.lang, content: f.content }; }), html || (P.files.filter(function (f) { return f.lang === 'html'; })[0] || {}).name || '', []);
      var body = q('#aiPrevBody');
      if (hasHtml()) showPrev(true);
      var frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-modals');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = 'Preview of your page';
      frame.srcdoc = page;
      if (!hasHtml()) { frame.style.display = 'none'; }
      body.innerHTML = ''; body.appendChild(frame);
      body.className = 'ai-prev-body' + (prevWidth ? ' w-' + prevWidth : '');
      webFrame = frame;
      runLang = 'js'; runText = '';
      if (!quiet) tSys('run', 'fa-play', (hasHtml() ? 'Preview of <b>' + esc(html || 'your page') + '</b> updated' : 'Running <b>' + esc(entry || P.entry) + '</b> · JavaScript'), new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (!hasHtml() && !quiet) setTimeout(function () { if (webFrame === frame) tSys('ok', 'fa-circle-check', 'Finished.'); }, 1200);
    }
    var webFrame = null;
    g.addEventListener('message', function (e) {
      if (!webFrame || e.source !== webFrame.contentWindow) return;
      var d = e.data || {}; if (!d.__cl) return;
      if (d.k === 'nav') {
        var target = cleanName(String(d.t).split(/[?#]/)[0]);
        if (file(target)) { runWeb(target); tSys('', 'fa-link', 'Opened ' + esc(target)); }
        return;
      }
      var text = String(d.t || '') + '\n';
      runText += text;
      tPrint(text, d.k === 'error' ? 'err' : d.k === 'warn' ? 'echo' : 'out');
      if (d.k === 'error') { var hnt = L.explain('js', d.t); if (hnt) tHint(hnt); }
    });

    /* ---------- format ---------- */
    function format(gr) {
      gr = gr || G();
      var a = gr.ed.getAction('editor.action.formatDocument');
      var f = gr.active && file(gr.active);
      if (!f) return;
      if (a && a.isSupported() && /^(html|css|js|json)$/.test(f.lang)) { a.run(); return; }
      toast('Formatting is available for HTML, CSS, JavaScript and JSON. For ' + L.info(f.lang).label + ', the editor keeps your indentation as you type.');
    }

    /* ---------- split ---------- */
    function toggleSplit(on) {
      var g1 = groups[1], want = on == null ? g1.root.hidden : on;
      g1.root.hidden = !want; q('#aiSplitRz').hidden = !want;
      q('#aiEdrow').classList.toggle('split', want);
      q('#aiSplitBtn').classList.toggle('on', want);
      if (want && !g1.active) { var cur = G().active || P.entry; if (cur) openFile(cur, 1); }
      if (!want) { focus = 0; g1.tabs = []; g1.active = null; g1.ed.setModel(null); }
      paintTabs(); welcome();
    }

    /* ---------- full screen ---------- */
    function toggleFull() {
      var d = document;
      if (!d.fullscreenElement) { (d.documentElement.requestFullscreen ? d.documentElement.requestFullscreen() : Promise.reject()).catch(function () { toast('Full screen is not available in this browser.'); }); }
      else d.exitFullscreen();
    }
    document.addEventListener('fullscreenchange', function () {
      var on = !!document.fullscreenElement;
      q('#aiFull i').className = 'fas ' + (on ? 'fa-compress' : 'fa-expand');
      q('#aiFull').title = on ? 'Leave full screen (F11)' : 'Full screen (F11)';
    });
    if (!document.documentElement.requestFullscreen) q('#aiFull').hidden = true;

    /* ---------- resizing ---------- */
    function dragger(handle, onMove, onEnd) {
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.classList.add('drag');
        document.body.style.userSelect = 'none';
        var mv = function (ev) { onMove(ev); }, up = function () { handle.classList.remove('drag'); document.body.style.userSelect = ''; handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); if (onEnd) onEnd(); };
        handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
      });
    }
    var sizes = lsGet('pz-ide-sizes') || {};
    function applySizes() {
      var main = q('#aiMain'), c = q('#aiCenter'), row = q('#aiEdrow');
      if (sizes.side) main.style.setProperty('--side', sizes.side + 'px');
      if (sizes.panel) c.style.setProperty('--panel', sizes.panel + 'px');
      if (sizes.prev) row.style.setProperty('--prev', sizes.prev + 'px');
    }
    dragger(q('#aiSideRz'), function (e) { sizes.side = Math.max(170, Math.min(560, e.clientX - 48)); applySizes(); }, function () { lsSet('pz-ide-sizes', sizes); });
    dragger(q('#aiPanelRz'), function (e) { var r = q('#aiCenter').getBoundingClientRect(); sizes.panel = Math.max(90, Math.min(r.height - 80, r.bottom - e.clientY)); applySizes(); }, function () { lsSet('pz-ide-sizes', sizes); });
    dragger(q('#aiPrevRz'), function (e) { var r = q('#aiEdrow').getBoundingClientRect(); sizes.prev = Math.max(220, Math.min(r.width - 200, r.right - e.clientX)); applySizes(); }, function () { lsSet('pz-ide-sizes', sizes); });
    dragger(q('#aiSplitRz'), function (e) { var r = q('#aiEdrow').getBoundingClientRect(), pv = q('#aiPrev').hidden ? 0 : q('#aiPrev').offsetWidth + 4, w = r.width - pv - 4, x = Math.max(160, Math.min(w - 160, e.clientX - r.left)); q('#aiEdrow').style.gridTemplateColumns = x + 'px 4px minmax(0,1fr)' + (pv ? ' 4px var(--prev,36%)' : ''); });
    [q('#aiSideRz'), q('#aiPanelRz'), q('#aiPrevRz')].forEach(function (h) { h.addEventListener('dblclick', function () { sizes = {}; lsSet('pz-ide-sizes', null); ['--side', '--panel', '--prev'].forEach(function (v) { q('#aiMain').style.removeProperty(v); q('#aiCenter').style.removeProperty(v); q('#aiEdrow').style.removeProperty(v); }); }); });
    applySizes();

    /* ---------- saving ---------- */
    function payload() {
      return {
        title: P.title,
        codeFiles: P.files.map(function (f) { return { name: f.name, lang: f.lang, content: f.content }; }),
        codeFolders: (P.folders || []).slice(0, 60),
        codeActive: P.active || P.entry || '',
        ide: { v: 1, lang: P.lang, entry: P.entry || '', open: groups[0].tabs.slice(0, 20), template: P.template || '' }
      };
    }
    function anyDirty() { return dirtyMeta || P.files.some(function (f) { return saved[f.name] !== f.content; }) || Object.keys(saved).some(function (n) { return !file(n); }); }
    function scheduleSave(meta) {
      if (!P || !P.canEdit) return;
      if (meta) dirtyMeta = true;
      setSave(anyDirty() ? 'dirty' : 'saved');
      clearTimeout(saveTimer);
      if (S.autoSave) saveTimer = setTimeout(function () { saveNow(true); }, 1500);
    }
    function saveNow(quiet) {
      if (!P || !P.canEdit) return Promise.resolve();
      clearTimeout(saveTimer);
      if (!anyDirty()) { if (!quiet) setSave('saved'); return Promise.resolve(); }
      if (saving) { saveTimer = setTimeout(function () { saveNow(true); }, 800); return Promise.resolve(); }
      var big = P.files.filter(function (f) { return f.content.length > MAX_FILE; })[0];
      if (big) { setSave('error', big.name + ' is over 200 KB, so the project was not saved.'); return Promise.resolve(); }
      var data = payload();
      if (JSON.stringify(data).length > MAX_DOC) { setSave('error', 'The project is too large to save (900 KB). Remove some files.'); return Promise.resolve(); }
      var snap = {}; P.files.forEach(function (f) { snap[f.name] = f.content; });
      saving = true; setSave('saving');
      return store.save(P.id, data).then(function () {
        saving = false; saved = snap; dirtyMeta = false;
        lsSet('pz-ide-draft-' + P.id, null);
        setSave(anyDirty() ? 'dirty' : 'saved'); paintTabs();
        if (!savedOnce && me.role === 'student' && store.log) { savedOnce = true; store.log(me, 'Saved Advanced IDE project: ' + P.title, P.id); }
        if (anyDirty() && S.autoSave) scheduleSave();
      }, function (e) {
        saving = false;
        setSave('error', 'Not saved: ' + errMsg(e) + ' Your work is kept in this browser and will save when you are back online.');
        clearTimeout(saveTimer); saveTimer = setTimeout(function () { saveNow(true); }, 8000);
      });
    }
    function setSave(state, msg) {
      var e = q('#aiSave'); if (!e) return;
      e.classList.toggle('err', state === 'error');
      e.title = msg || '';
      e.innerHTML = state === 'saving' ? '<i class="fas fa-circle-notch spin"></i> Saving' : state === 'saved' ? '<i class="fas fa-cloud"></i> Saved' : state === 'error' ? '<i class="fas fa-triangle-exclamation"></i> Not saved' : state === 'dirty' ? '<i class="fas fa-circle" style="font-size:.45rem"></i> Unsaved changes' : '';
      if (state === 'error' && msg) toast(msg);
    }
    function scheduleDraft() {
      if (!P || !P.canEdit) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () { if (anyDirty()) lsSet('pz-ide-draft-' + P.id, { at: Date.now(), files: payload().codeFiles, folders: P.folders, entry: P.entry }); }, 500);
    }
    g.addEventListener('beforeunload', function (e) { if (P && P.canEdit && anyDirty()) { saveNow(true); e.preventDefault(); e.returnValue = ''; } });

    /* ---------- banners ---------- */
    function banner(html) { q('#aiBanner').innerHTML = html ? '<div class="ai-banner">' + html + '</div>' : ''; }

    /* ---------- open a project ---------- */
    function open(doc) {
      var ide = doc.ide || {};
      var lang = ide.lang || 'html';
      P = {
        id: doc.id, title: doc.title || 'Untitled project', lang: lang, template: ide.template || '',
        files: (doc.codeFiles || []).map(function (f) { var n = cleanName(f.name) || 'untitled.txt'; return { name: n, lang: f.lang && L.LANGS[f.lang] ? f.lang : L.langOf(n, lang), content: String(f.content || '') }; }),
        folders: (doc.codeFolders || []).map(cleanName).filter(Boolean), entry: ide.entry || '', active: doc.codeActive || '',
        canEdit: doc.studentId === me.uid && me.role === 'student', owner: doc.studentName || 'this builder', updatedMs: msOf(doc.updatedAt)
      };
      saved = {}; P.files.forEach(function (f) { saved[f.name] = f.content; });
      Object.keys(models).forEach(function (n) { models[n].dispose(); }); models = {};
      q('#aiLaunch').hidden = true;
      q('#aiRunGrp').hidden = false;
      projectOnly(true);
      q('#aiName').textContent = P.title; q('#aiName').disabled = !P.canEdit;
      q('#aiLangChip').innerHTML = L.icon(P.lang) + ' ' + esc(L.info(P.lang).label);
      q('#aiRo').hidden = P.canEdit;
      document.title = P.title + ' · Advanced Paisley IDE';
      if (!P.canEdit) banner('<i class="fas fa-eye"></i><span>You are viewing ' + esc(P.owner) + '’s project. You can run it; changes are not saved.</span>');
      else {
        var draft = lsGet('pz-ide-draft-' + P.id);
        if (draft && draft.at > P.updatedMs + 1000 && JSON.stringify(draft.files) !== JSON.stringify(payload().codeFiles)) {
          banner('<i class="fas fa-clock-rotate-left"></i><span>Some changes from ' + esc(ago(draft.at)) + ' did not reach the server.</span><span class="sp"></span><button type="button" class="ai-btn primary" data-draft="1">Restore them</button><button type="button" class="ai-btn ghost" data-draft="0">Discard</button>');
        } else banner('');
      }
      paintEntry();
      var openTabs = (ide.open || []).filter(function (n) { return file(n); });
      if (!openTabs.length) openTabs = [P.active && file(P.active) ? P.active : P.entry].filter(Boolean);
      groups[0].tabs = []; groups[1].tabs = [];
      openTabs.forEach(function (n) { groups[0].tabs.push(n); });
      var first = P.active && file(P.active) ? P.active : openTabs[0];
      if (first) openFile(first, 0); else { paintTabs(); welcome(); }
      setSave(P.canEdit ? 'saved' : '');
      stdinEl.value = lsGet('pz-ide-stdin-' + P.id) || '';
      updateInputHelp();
      termEmpty();
      syncPrevButton();
      showSide(sideView === 'keys' || !sideView ? 'explorer' : sideView);
      if (innerWidth <= 900) { q('#aiMain').classList.add('noside'); paintActs(); }
      if (L.HINTS[P.lang] && !lsGet('pz-ide-tipped-' + P.lang) && P.canEdit) {
        lsSet('pz-ide-tipped-' + P.lang, 1);
        setTimeout(function () { tipCard(P.lang); }, 900);
      }
      if (S.warm) warm(P.lang);
      status();
    }
    function warm(lang) {
      var key = rtKey(lang);
      if (key === 'python') intel.warmJedi();
      else if (key === 'cpp' || key === 'php') runner.warm(key).catch(function () { });
    }
    function tipCard(lang) {
      var e = $('.ai-term-empty', term);
      if (!e) return;
      e.insertAdjacentHTML('beforeend', '<div class="hint" style="margin-top:.8rem"><i class="fas fa-lightbulb"></i><div><b>New to ' + esc(L.info(lang).label) + '?</b><ul style="margin:.3rem 0 0;padding-left:1rem">' + L.HINTS[lang].map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div></div>');
    }
    function updateInputHelp() {
      q('#aiInHelp').innerHTML = runner.isolated && S.liveInput
        ? 'Lines here are read first, one per line. When they run out, your program asks you in the terminal. Handy for testing the same answers again and again.'
        : 'Your program reads these lines as its input, one per line, in order. Type them before you press Run.';
      var n = stdinEl.value ? stdinEl.value.replace(/\n$/, '').split('\n').length : 0, b = q('#aiInN');
      b.hidden = !n; b.textContent = n;
    }

    /* Controls that only mean something with a project open. */
    function projectOnly(on) {
      ['#aiLangChip', '#aiSplitBtn', '#aiPanelBtn', '#aiSave'].forEach(function (s) { q(s).hidden = !on; });
      app.querySelectorAll('.ai-act').forEach(function (b) { b.hidden = !on && b.dataset.view !== 'settings' && b.dataset.view !== 'keys'; });
    }

    /* ---------- the launcher: start or open a project ---------- */
    function launcher() {
      P = null;
      q('#aiRunGrp').hidden = true; q('#aiName').textContent = 'Start a project'; q('#aiName').disabled = true; q('#aiLangChip').innerHTML = ''; q('#aiRo').hidden = true;
      projectOnly(false);
      q('#aiMain').classList.add('noside'); paintActs();
      var box = q('#aiLaunch'); box.hidden = false;
      if (me.role !== 'student') {
        box.innerHTML = '<div class="ai-launch-in" style="grid-template-columns:1fr;max-width:620px"><div class="ai-card"><h2>Advanced <span>Paisley</span> IDE</h2><p class="lead">Builders make their own projects here. To look at one, open it from Practice in your portal: it opens here, read only, and you can run it.</p><a class="ai-btn primary" href="' + (me.role === 'admin' ? '/admin' : '/tech/coach/dashboard') + '">Back to my portal</a></div></div>';
        return;
      }
      var sel = { lang: 'py', tpl: null };
      var mine = (o.list || []).filter(function (d) { return d.type === 'advanced'; }).sort(function (a, b) { return msOf(b.updatedAt) - msOf(a.updatedAt); });
      var from = o.from && o.from.type === 'code' && (o.from.codeFiles || []).length ? o.from : null;
      function paint() {
        var tpls = L.templates(sel.lang); if (!sel.tpl || !tpls.some(function (t) { return t.id === sel.tpl; })) sel.tpl = tpls[0] && tpls[0].id;
        box.innerHTML = '<div class="ai-launch-in"><div>' +
          '<h2>Start something <span>new</span></h2><p class="lead">Pick a language and a starter. Every starter runs straight away, so press Run and see what it does, then make it yours.</p>' +
          (from ? '<div class="ai-card" style="margin-bottom:1rem"><h3>Continue a practice</h3><div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>' + esc(from.title || 'Coding experiment') + '</b><div class="ai-note">Copies its ' + from.codeFiles.length + ' file' + (from.codeFiles.length === 1 ? '' : 's') + ' into a new Advanced IDE project. The practice in Code Lab stays exactly as it is.</div></div><button type="button" class="ai-btn primary" data-fromgo>Bring it here</button></div></div>' : '') +
          '<div class="ai-card"><h3>Language</h3><div class="ai-langs">' + L.PROJECT_LANGS.map(function (id) {
            var m = L.info(id);
            return '<button type="button" class="ai-lang' + (sel.lang === id ? ' on' : '') + '" data-lang="' + id + '" aria-pressed="' + (sel.lang === id) + '">' + L.icon(id) + '<b>' + esc(m.label) + '</b><span>' + (m.run === 'java' ? 'Runs on the Paisley code runner' : m.run === 'web' ? 'Live preview' : 'Runs in your browser') + '</span></button>';
          }).join('') + '</div>' +
          '<h3 style="margin-top:1.2rem">Starter</h3><div class="ai-tpls">' + tpls.map(function (t) { return '<button type="button" class="ai-tpl' + (t.id === sel.tpl ? ' on' : '') + '" data-tpl="' + t.id + '"><b>' + esc(t.title) + '</b><span>' + esc(t.blurb) + '</span></button>'; }).join('') + '</div>' +
          '<ul class="ai-hints">' + (L.HINTS[sel.lang] || []).map(function (h) { return '<li><i class="fas fa-lightbulb"></i><span>' + esc(h) + '</span></li>'; }).join('') + '</ul>' +
          '<div class="ai-new-row"><input id="aiNewName" maxlength="80" placeholder="Project name" value="' + esc('My ' + L.info(sel.lang).label + ' project') + '" aria-label="Project name"><button type="button" class="ai-btn primary" data-create><i class="fas fa-wand-magic-sparkles"></i> Create project</button></div><div class="ai-msg" id="aiNewMsg" role="alert"></div></div>' +
          '</div><div><div class="ai-card"><h3>Your projects</h3>' + (mine.length ? '<div class="ai-plist">' + mine.map(function (d) {
            var lg = (d.ide && d.ide.lang) || 'html';
            return '<button type="button" class="ai-pitem" data-openp="' + esc(d.id) + '">' + L.icon(lg) + '<span class="t"><b>' + esc(d.title || 'Untitled') + '</b><span>' + esc(L.info(lg).label) + ' · ' + (d.codeFiles || []).length + ' file' + ((d.codeFiles || []).length === 1 ? '' : 's') + ' · ' + esc(ago(msOf(d.updatedAt))) + '</span></span><i class="fas fa-chevron-right" style="color:var(--faint)"></i></button>';
          }).join('') + '</div>' : '<p class="ai-note">Nothing yet. Your Advanced IDE projects appear here, and in Practice in Tech Studio.</p>') + '</div>' +
          '<div class="ai-card" style="margin-top:1rem"><h3>What you get</h3><ul class="ai-hints">' +
            '<li><i class="fas fa-circle-check"></i><span>Eight languages: Python, Java, C, C++, PHP, JavaScript, HTML and CSS.</span></li>' +
            '<li><i class="fas fa-circle-check"></i><span>Real runs: Python, C, C++ and PHP run in a sealed sandbox in your browser; Java runs on the Paisley code runner.</span></li>' +
            '<li><i class="fas fa-circle-check"></i><span>Suggestions as you type, parameter hints, hover docs and live error checks.</span></li>' +
            '<li><i class="fas fa-circle-check"></i><span>Saved to your Tech Studio account, so you can carry on any time.</span></li></ul></div></div></div>';
      }
      box.onclick = function (e) {
        var t = e.target.closest('[data-lang],[data-tpl],[data-create],[data-openp],[data-fromgo]'); if (!t) return;
        if (t.dataset.lang) { var nm = q('#aiNewName'), auto = nm && /^My .+ project$/.test(nm.value); sel.lang = t.dataset.lang; sel.tpl = null; paint(); if (!auto) q('#aiNewName').value = nm.value; return; }
        if (t.dataset.tpl) { var keep = q('#aiNewName').value; sel.tpl = t.dataset.tpl; paint(); q('#aiNewName').value = keep; return; }
        if (t.dataset.openp) { history.replaceState(null, '', '?p=' + encodeURIComponent(t.dataset.openp)); store.load(t.dataset.openp).then(function (d) { if (d) open(d); }); return; }
        if (t.dataset.create !== undefined || t.dataset.fromgo !== undefined) {
          var fromGo = t.dataset.fromgo !== undefined;
          var title = fromGo ? (from.title || 'Coding experiment') : (q('#aiNewName').value.trim() || 'My project').slice(0, 120);
          var files = fromGo ? from.codeFiles.map(function (f) { return { name: cleanName(f.name), lang: L.langOf(f.name, 'html'), content: String(f.content || '') }; }) : L.templateFiles(sel.lang, sel.tpl);
          var lang = fromGo ? (files.some(function (f) { return f.lang === 'html'; }) ? 'html' : 'js') : sel.lang;
          var entry = L.defaultEntry(lang, files) || (files[0] && files[0].name) || '';
          var doc = {
            studentId: me.uid, studentName: me.name || '', coachId: me.coachId || '', type: 'advanced', title: title,
            instructions: '', missionId: '', missionTitle: '', buildId: '', activity: null, writingHtml: '', text: '', done: false, helpRequested: false,
            codeFiles: files, codeFolders: fromGo ? (from.codeFolders || []) : [], codeActive: entry,
            ide: { v: 1, lang: lang, entry: entry, open: [entry], template: fromGo ? 'practice:' + from.id : sel.tpl }
          };
          t.disabled = true;
          store.create(doc).then(function (id) {
            history.replaceState(null, '', '?p=' + encodeURIComponent(id));
            doc.id = id; doc.updatedAt = Date.now();
            open(doc);
            toast('Project created. Press Run to try it.');
          }, function (er) { t.disabled = false; var m = q('#aiNewMsg'); if (m) m.textContent = 'Could not create the project: ' + errMsg(er); });
        }
      };
      paint();
      status();
    }

    /* ---------- menus, modals, toasts (never prompt/confirm: they drop full screen) ---------- */
    var menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
    function menu(x, y, items) {
      closeMenu();
      menuEl = el('<div class="ai-menu" role="menu">' + items.map(function (it, i) { return it === '-' ? '<hr>' : '<button type="button" role="menuitem" data-mi="' + i + '" class="' + (it.danger ? 'danger' : '') + '"><i class="fas ' + it.icon + '"></i>' + esc(it.label) + (it.kbd ? '<span class="kbd">' + esc(it.kbd) + '</span>' : '') + '</button>'; }).join('') + '</div>');
      app.appendChild(menuEl);
      var r = menuEl.getBoundingClientRect();
      menuEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; menuEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
      menuEl.onclick = function (e) { var b = e.target.closest('[data-mi]'); if (!b) return; var it = items[+b.dataset.mi]; closeMenu(); it.fn(); };
      var first = menuEl.querySelector('button'); if (first) first.focus();
    }
    document.addEventListener('pointerdown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
    function modal(inner, setup) {
      var bg = el('<div class="ai-modal-bg" role="dialog" aria-modal="true">' + inner + '</div>');
      app.appendChild(bg);
      var done = function () { bg.remove(); var ed = G().ed; if (ed && P) ed.focus(); };
      bg.addEventListener('pointerdown', function (e) { if (e.target === bg) { done(); if (setup.cancel) setup.cancel(); } });
      bg.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(); if (setup.cancel) setup.cancel(); } });
      setup.init(bg, done);
      return bg;
    }
    function ask(opt) {
      return new Promise(function (resolve) {
        modal('<div class="ai-modal"><h3>' + esc(opt.title) + '</h3>' + (opt.text ? '<p>' + esc(opt.text) + '</p>' : '') + '<input id="aiAsk" spellcheck="false" autocomplete="off"><div class="row"><button type="button" class="ai-btn ghost" data-no>Cancel</button><button type="button" class="ai-btn primary" data-yes>' + esc(opt.ok || 'OK') + '</button></div></div>', {
          cancel: function () { resolve(null); },
          init: function (bg, done) {
            var i = $('#aiAsk', bg); i.value = opt.value || ''; i.focus();
            if (opt.selectBase) { var v = i.value, s = v.lastIndexOf('/') + 1, d = v.lastIndexOf('.'); i.setSelectionRange(s, d > s ? d : v.length); } else i.select();
            var yes = function () { done(); resolve(i.value); };
            $('[data-yes]', bg).onclick = yes; $('[data-no]', bg).onclick = function () { done(); resolve(null); };
            i.onkeydown = function (e) { if (e.key === 'Enter') yes(); };
          }
        });
      });
    }
    function confirmBox(opt) {
      return new Promise(function (resolve) {
        modal('<div class="ai-modal"><h3>' + esc(opt.title) + '</h3><p>' + esc(opt.text || '') + '</p><div class="row"><button type="button" class="ai-btn ghost" data-no>Cancel</button><button type="button" class="ai-btn ' + (opt.danger ? 'stop' : 'primary') + '" data-yes>' + esc(opt.ok || 'OK') + '</button></div></div>', {
          cancel: function () { resolve(false); },
          init: function (bg, done) { $('[data-yes]', bg).onclick = function () { done(); resolve(true); }; $('[data-no]', bg).onclick = function () { done(); resolve(false); }; $('[data-yes]', bg).focus(); }
        });
      });
    }
    function quickOpen() {
      if (!P) return;
      modal('<div class="ai-modal ai-palette"><input id="aiQo" placeholder="Type a file name" autocomplete="off" spellcheck="false"><div class="ai-plist" id="aiQoList"></div></div>', {
        init: function (bg, done) {
          var inp = $('#aiQo', bg), list = $('#aiQoList', bg), idx = 0, shown = [];
          function paint() {
            var t = inp.value.toLowerCase();
            shown = P.files.filter(function (f) { return f.name.toLowerCase().indexOf(t) !== -1; }).slice(0, 12);
            idx = Math.min(idx, Math.max(0, shown.length - 1));
            list.innerHTML = shown.map(function (f, i) { return '<button type="button" class="ai-pitem" data-qo="' + esc(f.name) + '" style="' + (i === idx ? 'background:var(--on)' : '') + '">' + L.icon(f.lang) + '<span class="t"><b>' + esc(baseOf(f.name)) + '</b><span>' + esc(dirOf(f.name) || 'project') + '</span></span></button>'; }).join('') || '<p class="ai-note" style="padding:.5rem">No file matches.</p>';
          }
          inp.oninput = function () { idx = 0; paint(); };
          inp.onkeydown = function (e) {
            if (e.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); paint(); e.preventDefault(); }
            if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); paint(); e.preventDefault(); }
            if (e.key === 'Enter' && shown[idx]) { done(); openFile(shown[idx].name); }
          };
          list.onclick = function (e) { var b = e.target.closest('[data-qo]'); if (b) { done(); openFile(b.dataset.qo); } };
          paint(); inp.focus();
        }
      });
    }
    var toastT = 0;
    function toast(text) {
      var old = $('.ai-toast'); if (old) old.remove();
      var t = el('<div class="ai-toast" role="status">' + esc(text) + '</div>');
      app.appendChild(t); clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 3800);
    }
    function htmlPage(html) {
      modal('<div class="ai-modal wide"><div class="wide-h"><i class="fas fa-display" style="color:var(--brand)"></i><b>Your PHP page</b><button type="button" class="ai-btn icon" data-no title="Close"><i class="fas fa-xmark"></i></button></div><iframe sandbox="allow-scripts" title="PHP output as a page"></iframe></div>', {
        init: function (bg, done) { $('iframe', bg).srcdoc = html; $('[data-no]', bg).onclick = done; }
      });
    }

    /* ---------- events ---------- */
    app.addEventListener('click', function (e) {
      var t = e.target.closest('button,[data-file],[data-dir],[data-hit],[data-goto],[data-st],[data-cmd]'); if (!t || !app.contains(t)) return;
      if (t.dataset.view) { showSide(t.dataset.view, true); return; }
      if (t.dataset.side === 'newfile') return newFile('');
      if (t.dataset.side === 'newfolder') return newFolder('');
      if (t.dataset.side === 'collapse') { folders().forEach(function (d) { openDirs[d] = false; }); paintTree(); return; }
      if (t.matches('[data-more]')) { var node = t.closest('.ai-node'), r = t.getBoundingClientRect(); nodeMenu(node, r.left, r.bottom + 4); return; }
      if (t.dataset.file) { openFile(t.dataset.file); return; }
      if (t.dataset.dir) { openDirs[t.dataset.dir] = openDirs[t.dataset.dir] === false; paintTree(); return; }
      if (t.dataset.hit) { var h = t.dataset.hit.split('|'); openFile(h[0], null, { line: +h[1], col: +h[2], sel: new monaco.Selection(+h[1], +h[2], +h[1], +h[2] + +h[3]) }); return; }
      if (t.dataset.goto) { var gt = t.dataset.goto.split('|'); openFile(gt[0], null, { line: +gt[1], col: +gt[2] }); return; }
      if (t.dataset.st === 'probs') { showPanel('probs'); return; }
      if (t.dataset.st === 'tools') { showSide('tools'); return; }
      if (t.dataset.st === 'input') { showPanel('input'); return; }
      if (t.dataset.st === 'goto') { var ed = G().ed; ed.focus(); ed.trigger('status', 'editor.action.gotoLine'); return; }
      if (t.dataset.cmd === 'run') { run(); return; }
      if (t.dataset.cmd === 'phppage') { htmlPage(lastPhpHtml); return; }
      if (t.dataset.ptab) { showPanel(t.dataset.ptab); return; }
      if (t.dataset.warm) { warm(t.dataset.warm === 'python' ? 'py' : t.dataset.warm); paintTools(); return; }
      if (t.dataset.w !== undefined) { prevWidth = t.dataset.w; q('#aiPrevBody').className = 'ai-prev-body' + (prevWidth ? ' w-' + prevWidth : ''); return; }
      if (t.dataset.draft) {
        var dr = lsGet('pz-ide-draft-' + P.id);
        if (t.dataset.draft === '1' && dr) {
          dr.files.forEach(function (f) { var ex = file(f.name); if (ex) { ex.content = f.content; if (models[f.name]) models[f.name].setValue(f.content); } else P.files.push({ name: f.name, lang: L.langOf(f.name, P.lang), content: f.content }); });
          P.files = P.files.filter(function (f) { return dr.files.some(function (x) { return x.name === f.name; }); });
          if (dr.folders) P.folders = dr.folders; if (dr.entry) P.entry = dr.entry;
          afterFiles(); toast('Your changes are back.');
        } else lsSet('pz-ide-draft-' + P.id, null);
        banner(''); return;
      }
      switch (t.id) {
        case 'aiRun': run(); break;
        case 'aiStop': stop(); break;
        case 'aiFull': toggleFull(); break;
        case 'aiSplitBtn': toggleSplit(); break;
        case 'aiPanelBtn': togglePanel(); break;
        case 'aiClosePanel': togglePanel(); break;
        case 'aiMaxPanel': toggleMaxPanel(); break;
        case 'aiClear': termEmpty(); break;
        case 'aiInSend': sendInput(false); break;
        case 'aiInEnd': sendInput(true); break;
        case 'aiPrevBtn': showPrev(q('#aiPrev').hidden); if (!q('#aiPrev').hidden) runWeb(null, true); break;
        case 'aiPrevClose': showPrev(false); break;
        case 'aiPrevRefresh': runWeb(null, true); break;
        case 'aiLive': S.livePreview = !S.livePreview; writeSettings(S); t.classList.toggle('on', S.livePreview); toast(S.livePreview ? 'Live preview on: the page refreshes as you type.' : 'Live preview off: press Run to refresh.'); break;
        case 'aiName':
          if (!P || !P.canEdit) break;
          ask({ title: 'Rename project', value: P.title, ok: 'Rename' }).then(function (v) { if (v == null || !v.trim()) return; P.title = v.trim().slice(0, 120); q('#aiName').textContent = P.title; document.title = P.title + ' · Advanced Paisley IDE'; paintSide(); scheduleSave(true); });
          break;
        case 'aiExit': leave(); break;
      }
    });
    q('#aiHome').addEventListener('click', function (e) { e.preventDefault(); leave(); });
    function leave() {
      var go = function () { location.href = '/tech/dashboard#practice'; };
      if (P && P.canEdit && anyDirty()) { setSave('saving'); Promise.race([saveNow(true), new Promise(function (r) { setTimeout(r, 4000); })]).then(go); } else go();
    }
    q('#aiLive').classList.toggle('on', S.livePreview);
    app.addEventListener('contextmenu', function (e) { var n = e.target.closest('.ai-node'); if (!n || !P || !P.canEdit) return; e.preventDefault(); nodeMenu(n, e.clientX, e.clientY); });
    app.addEventListener('dblclick', function (e) { var n = e.target.closest('.ai-node[data-file]'); if (n && P && P.canEdit) renameFile(n.dataset.file); });
    app.addEventListener('keydown', function (e) {
      var n = e.target.closest && e.target.closest('.ai-node');
      if (n && P) {
        if (e.key === 'Enter') { n.click(); e.preventDefault(); }
        else if (e.key === 'F2' && n.dataset.file && P.canEdit) { renameFile(n.dataset.file); e.preventDefault(); }
        else if (e.key === 'Delete' && n.dataset.file && P.canEdit) { deleteFile(n.dataset.file); e.preventDefault(); }
        else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { var r = n.getBoundingClientRect(); nodeMenu(n, r.left + 20, r.bottom); e.preventDefault(); }
      }
    });
    q('#aiEntry').onchange = function () { P.entry = this.value; dirtyMeta = true; paintTree(); paintTabs(); scheduleSave(true); };
    q('#aiInLine').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendInput(false); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); sendInput(true); }
    });
    term.addEventListener('click', function () { if (!q('#aiInRow').hidden && !getSelection().toString()) q('#aiInLine').focus(); });
    stdinEl.addEventListener('input', function () { if (P) lsSet('pz-ide-stdin-' + P.id, stdinEl.value.slice(0, 20000)); updateInputHelp(); });

    /* Shortcuts that work anywhere (the editor handles its own when it has focus). */
    document.addEventListener('keydown', function (e) {
      if (!P) return;
      var mod = e.ctrlKey || e.metaKey, k = e.key;
      if ($('.ai-modal-bg')) return;
      if (k === 'Escape') { closeMenu(); var c = q('#aiCenter'); if (c.classList.contains('maxpanel')) toggleMaxPanel(); return; }
      if (k === 'F5' && !e.shiftKey) { e.preventDefault(); run(); }
      else if (k === 'F5' && e.shiftKey) { e.preventDefault(); stop(); }
      else if (mod && k === 'Enter' && !(e.target.closest && e.target.closest('#aiInRow'))) { e.preventDefault(); run(); }
      else if (mod && (k === 's' || k === 'S')) { e.preventDefault(); saveNow(); }
      else if (mod && (k === 'p' || k === 'P') && !e.shiftKey) { e.preventDefault(); quickOpen(); }
      else if (mod && e.shiftKey && (k === 'F' || k === 'f')) { e.preventDefault(); showSide('search'); }
      else if (mod && e.shiftKey && (k === 'E' || k === 'e')) { e.preventDefault(); showSide('explorer'); }
      else if (mod && (k === 'b' || k === 'B') && !e.shiftKey) { e.preventDefault(); toggleSide(); }
      else if (mod && (k === 'j' || k === 'J')) { e.preventDefault(); togglePanel(); }
      else if (mod && k === '`') { e.preventDefault(); showPanel('term'); }
      else if (mod && k === '\\') { e.preventDefault(); toggleSplit(); }
      else if (e.altKey && (k === 'n' || k === 'N') && P.canEdit) { e.preventDefault(); newFile(''); }
      else if (k === 'F11') { e.preventDefault(); toggleFull(); }
    }, true);
    g.addEventListener('resize', function () { if (innerWidth <= 900 && !q('#aiMain').classList.contains('noside') && P && document.activeElement && !q('#aiSide').contains(document.activeElement)) { /* keep the overlay until a file is chosen */ } });
    runner.ready.then(function () { status(); updateInputHelp(); if (P && $('.ai-term-empty', term)) termEmpty(); }, function (e) { toast(e.message); });

    /* Access switched off by the Studio Desk while the builder is here: lock, keep the unsaved draft
       in this browser (offered back next time), and say why. Switched back on: reload. */
    var revoked = false;
    function revoke() {
      if (revoked) return; revoked = true;
      if (running) stop();
      clearTimeout(saveTimer);
      if (P) { scheduleDraft(); P.canEdit = false; groups.forEach(function (gr) { gr.ed.updateOptions({ readOnly: true }); }); paintSide(); paintTabs(); setSave(''); }
      q('#aiRunGrp').hidden = true;
      var msg = '<i class="fas fa-lock"></i><span>The Studio Desk has switched the Advanced IDE off for you. Your projects are kept and open again when it is switched back on.</span><span class="sp"></span><a class="ai-btn primary" href="/tech/dashboard#practice">Back to Tech Studio</a>';
      banner(msg);
      if (!P) { var box = q('#aiLaunch'); box.onclick = null; box.innerHTML = '<div class="ai-launch-in" style="grid-template-columns:1fr;max-width:620px"><div class="ai-card"><div class="ai-banner" style="border-radius:12px">' + msg + '</div></div></div>'; }
    }
    function restore() { if (revoked) location.reload(); }

    paintActs();
    return {
      open: open,
      launcher: launcher,
      revoke: revoke,
      restore: restore,
      reveal: function () {
        requestAnimationFrame(function () { app.classList.add('in'); });
        setTimeout(function () { groups.forEach(function (gr) { gr.ed.layout(); }); var ed = G().ed; if (P && ed.getModel()) ed.focus(); }, 700);
      },
      _debug: { get P() { return P; }, run: run, runner: runner, models: models, groups: groups, saveNow: saveNow, intel: intel, monaco: monaco }
    };
  }

  g.PaisleyIDE = { start: start, _Intro: Intro };
})(window);
