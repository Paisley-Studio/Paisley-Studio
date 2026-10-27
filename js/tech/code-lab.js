/* =========================================================
   Paisley TECH — Code Lab
   ---------------------------------------------------------
   A real, working code workspace for a single techBuild.

   Fields owned on the build:
     build.codeFiles   = [{ name, lang, content }, …]    (max 40 files, 200 KB each)
     build.codeActive  = "index.html"                    (which file is open in the preview)
     build.codeAt      = serverTimestamp                  (last save)

   Features:
     - Multi-file tabs (HTML / CSS / JS / MD)
     - Add / rename / delete files
     - Live preview in a sandboxed <iframe srcdoc>
     - Preview refresh button + auto-refresh (debounced)
     - Horizontal/vertical layout toggle
     - Debounced autosave + Ctrl/Cmd+S
     - No bundler, no dependency, no eval in the parent frame.

   Safety:
     The iframe is sandboxed with allow-scripts only (no
     allow-same-origin). Student JS runs in a null origin, so
     it cannot read the parent page, cookies, IndexedDB or
     Firestore. It can still draw, play audio, animate, and be
     a fully functional interactive preview.

   Exports:
     CodeLab.mount(hostEl, { build, me, canEdit, onSave })
========================================================= */
(function (g) {
  'use strict';

  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var MAX_FILES = 40;
  var MAX_FILE_BYTES = 200 * 1024;
  var LANGS = {
    html: { label: 'HTML', icon: 'fa-html5', ext: ['.html', '.htm'], mime: 'text/html' },
    css: { label: 'CSS', icon: 'fa-css3-alt', ext: ['.css'], mime: 'text/css' },
    js: { label: 'JavaScript', icon: 'fa-js', ext: ['.js'], mime: 'text/javascript' },
    md: { label: 'Markdown', icon: 'fa-markdown', ext: ['.md', '.txt'], mime: 'text/markdown' }
  };

  function langOf(name) {
    var lower = String(name || '').toLowerCase();
    if (/\.(html?|xhtml)$/.test(lower)) return 'html';
    if (/\.css$/.test(lower)) return 'css';
    if (/\.(js|mjs|jsx)$/.test(lower)) return 'js';
    if (/\.(md|txt)$/.test(lower)) return 'md';
    return 'html';
  }
  function defaultFile(lang) {
    if (lang === 'html') return { name: 'index.html', lang: 'html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>My project</title>\n</head>\n<body>\n  <h1>Hello, studio!</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n' };
    if (lang === 'css') return { name: 'style.css', lang: 'css', content: 'body { font-family: sans-serif; background: #F1F9F7; color: #263331; padding: 2rem; }\n' };
    if (lang === 'js') return { name: 'script.js', lang: 'js', content: 'console.log("Code Lab is alive");\n' };
    return { name: 'notes.md', lang: 'md', content: '# Notes\n\nWhat I\'m building:\n\n- \n' };
  }

  /* ---------------------------------------------------------
     Build a self-contained HTML document from the file set.
     Only files under the same folder as codeActive are inlined;
     we don't try to be a real bundler.
     --------------------------------------------------------- */
  function buildPreview(files, active) {
    active = active || (files.find(function (f) { return f.lang === 'html'; }) || files[0] || {}).name;
    var html = files.find(function (f) { return f.name === active && f.lang === 'html'; });
    if (!html) {
      /* If there's no HTML, render a small "no html" message with any css/js appended for context */
      var css = files.filter(function (f) { return f.lang === 'css'; }).map(function (f) { return f.content; }).join('\n');
      var js = files.filter(function (f) { return f.lang === 'js'; }).map(function (f) { return f.content; }).join('\n');
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head>' +
        '<body style="font-family:sans-serif;padding:2rem;background:#F1F9F7;color:#5A6E6A">' +
        '<p>No HTML file is currently open. Add one, or switch to an HTML tab to preview.</p>' +
        '<script>' + js + '<\/script></body></html>';
    }
    var cssFiles = files.filter(function (f) { return f.lang === 'css'; });
    var jsFiles = files.filter(function (f) { return f.lang === 'js'; });
    /* Inline every <link href="X.css"> and <script src="Y.js"></script> whose filename exists in the file set. */
    var out = html.content;
    cssFiles.forEach(function (f) {
      var re = new RegExp('<link[^>]*href=["\']' + f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>', 'gi');
      if (re.test(out)) out = out.replace(re, '<style>\n' + f.content + '\n</style>');
    });
    jsFiles.forEach(function (f) {
      var re = new RegExp('<script[^>]*src=["\']' + f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>\\s*<\\/script>', 'gi');
      if (re.test(out)) out = out.replace(re, '<script>\n' + f.content + '\n<\/script>');
    });
    /* If no <link>/<script src> were present but files exist, append them at the end (best-effort). */
    if (cssFiles.length && out.indexOf('<style') === -1) {
      out = out.replace(/<\/head>/i, cssFiles.map(function (f) { return '<style>\n' + f.content + '\n</style>'; }).join('\n') + '\n</head>');
    }
    if (jsFiles.length && out.indexOf('<script') === -1 && out.indexOf('<\/script>') === -1) {
      out = out.replace(/<\/body>/i, jsFiles.map(function (f) { return '<script>\n' + f.content + '\n<\/script>'; }).join('\n') + '\n</body>');
    }
    return out;
  }

  function mount(hostEl, opts) {
    if (!hostEl) throw new Error('CodeLab.mount: missing host element');
    var build = opts.build || {};
    var canEdit = !!opts.canEdit;
    var save = typeof opts.onSave === 'function' ? opts.onSave : function () { };

    /* ---- Seed files ---- */
    var files = Array.isArray(build.codeFiles) && build.codeFiles.length
      ? build.codeFiles.map(function (f) { return { name: String(f.name || 'untitled'), lang: f.lang || langOf(f.name), content: String(f.content || '') }; })
      : [defaultFile('html'), defaultFile('js')];
    var activeName = build.codeActive && files.some(function (f) { return f.name === build.codeActive; })
      ? build.codeActive
      : files[0].name;

    /* ---- Layout ---- */
    hostEl.innerHTML =
      '<div class="cl-shell">' +
        '<div class="cl-head">' +
          '<div class="cl-tabs" role="tablist"></div>' +
          '<div class="cl-actions">' +
            (canEdit ? '<button type="button" class="cl-btn" data-clcmd="add" title="New file"><i class="fas fa-plus"></i> File</button>' : '') +
            (canEdit ? '<button type="button" class="cl-btn" data-clcmd="rename" title="Rename active file"><i class="fas fa-i-cursor"></i></button>' : '') +
            (canEdit ? '<button type="button" class="cl-btn cl-danger" data-clcmd="delete" title="Delete active file"><i class="fas fa-trash"></i></button>' : '') +
            '<button type="button" class="cl-btn" data-clcmd="layout" title="Toggle layout"><i class="fas fa-table-columns"></i></button>' +
            '<button type="button" class="cl-btn cl-save" data-clcmd="save"><i class="fas fa-floppy-disk"></i> Save</button>' +
            '<button type="button" class="cl-btn cl-run" data-clcmd="run" title="Refresh preview"><i class="fas fa-play"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="cl-body">' +
          '<div class="cl-edit-wrap">' +
            '<textarea class="cl-edit" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"' + (canEdit ? '' : ' readonly') + '></textarea>' +
            '<div class="cl-meta"><span class="cl-lang"></span><span class="cl-status"></span></div>' +
          '</div>' +
          '<div class="cl-preview-wrap">' +
            '<iframe class="cl-preview" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Live preview"></iframe>' +
          '</div>' +
        '</div>' +
      '</div>';

    var tabsEl = hostEl.querySelector('.cl-tabs');
    var editEl = hostEl.querySelector('.cl-edit');
    var langEl = hostEl.querySelector('.cl-lang');
    var statusEl = hostEl.querySelector('.cl-status');
    var frame = hostEl.querySelector('.cl-preview');
    var bodyEl = hostEl.querySelector('.cl-body');
    var wrapEdit = hostEl.querySelector('.cl-edit-wrap');

    /* ---------- Status text ---------- */
    var statusTimer = null;
    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.style.color = kind === 'err' ? '#b8362a' : kind === 'ok' ? '#1d8b57' : '';
      if (statusTimer) clearTimeout(statusTimer);
      if (text) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 3500);
    }

    /* ---------- Tabs ---------- */
    function renderTabs() {
      tabsEl.innerHTML = files.map(function (f) {
        var meta = LANGS[f.lang] || LANGS.html;
        var on = f.name === activeName;
        return '<button type="button" role="tab" aria-selected="' + on + '" class="cl-tab' + (on ? ' on' : '') + '" data-cltab="' + esc(f.name) + '">' +
          '<i class="fab ' + meta.icon + '"></i> ' + esc(f.name) + '</button>';
      }).join('');
      langEl.textContent = (LANGS[activeLang()] || LANGS.html).label;
    }
    function activeLang() { var f = files.find(function (x) { return x.name === activeName; }); return f ? f.lang : 'html'; }
    function activeFile() { return files.find(function (x) { return x.name === activeName; }); }

    tabsEl.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cltab]'); if (!t) return;
      if (dirty) flushSave(); /* save current before switch */
      activeName = t.dataset.cltab;
      loadActive();
    });

    function loadActive() {
      var f = activeFile();
      if (!f) return;
      editEl.value = f.content;
      editEl.scrollTop = 0;
      editEl.scrollLeft = 0;
      renderTabs();
      scheduleAutoPreview();
    }

    /* ---------- Editing ---------- */
    var dirty = false, saving = false, saveTimer = null;
    var previewTimer = null;
    editEl.addEventListener('input', function () {
      if (!canEdit) return;
      var f = activeFile(); if (!f) return;
      f.content = editEl.value;
      dirty = true;
      setStatus('Unsaved', '');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 1500);
      scheduleAutoPreview();
    });
    editEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); }
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = editEl.selectionStart, en = editEl.selectionEnd;
        editEl.value = editEl.value.slice(0, s) + '  ' + editEl.value.slice(en);
        editEl.selectionStart = editEl.selectionEnd = s + 2;
        var f = activeFile(); if (f) { f.content = editEl.value; dirty = true; }
      }
    });

    function flushSave() {
      if (!canEdit || !saving) {
        /* still allow saving read-only? no */
      }
      if (!canEdit) return;
      if (!dirty) return;
      saving = true;
      var payload = {
        codeFiles: files.map(function (f) { return { name: f.name, lang: f.lang, content: f.content }; }),
        codeActive: activeName,
        codeAt: FV().serverTimestamp()
      };
      save(payload).then(function () {
        dirty = false; saving = false;
        setStatus('Saved', 'ok');
      }).catch(function (e) {
        saving = false;
        setStatus('Save failed: ' + (e && e.message || e), 'err');
      });
    }

    /* ---------- Preview ---------- */
    function scheduleAutoPreview() {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 500);
    }
    function renderPreview() {
      try {
        var doc = buildPreview(files, activeName);
        frame.srcdoc = doc;
      } catch (e) {
        frame.srcdoc = '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#b8362a"><p>Preview failed: ' + esc(e.message || e) + '</p></body></html>';
      }
    }

    /* ---------- File actions ---------- */
    hostEl.querySelectorAll('[data-clcmd]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cmd = b.dataset.clcmd;
        if (cmd === 'save') { flushSave(); return; }
        if (cmd === 'run') { renderPreview(); setStatus('Preview refreshed', 'ok'); return; }
        if (cmd === 'layout') { toggleLayout(); return; }
        if (!canEdit) return;
        if (cmd === 'add') addFile();
        else if (cmd === 'rename') renameFile();
        else if (cmd === 'delete') deleteFile();
      });
    });

    function addFile() {
      if (files.length >= MAX_FILES) { setStatus('File limit is ' + MAX_FILES, 'err'); return; }
      var name = prompt('New file name (e.g. game.js or about.html)');
      if (!name) return;
      name = name.trim().replace(/[^\w.\-]/g, '_').slice(0, 60);
      if (!name) return;
      if (files.some(function (f) { return f.name.toLowerCase() === name.toLowerCase(); })) { setStatus('A file with that name exists', 'err'); return; }
      var lang = langOf(name);
      files.push({ name: name, lang: lang, content: defaultFile(lang).content });
      activeName = name;
      loadActive();
      dirty = true;
      flushSave();
    }
    function renameFile() {
      var f = activeFile(); if (!f) return;
      var name = prompt('Rename file', f.name);
      if (!name || name === f.name) return;
      name = name.trim().replace(/[^\w.\-]/g, '_').slice(0, 60);
      if (!name) return;
      if (files.some(function (x) { return x !== f && x.name.toLowerCase() === name.toLowerCase(); })) { setStatus('Name taken', 'err'); return; }
      f.name = name;
      f.lang = langOf(name);
      activeName = name;
      loadActive();
      dirty = true;
      flushSave();
    }
    function deleteFile() {
      if (files.length <= 1) { setStatus('Keep at least one file', 'err'); return; }
      var f = activeFile(); if (!f) return;
      if (!confirm('Delete "' + f.name + '"?')) return;
      files = files.filter(function (x) { return x !== f; });
      activeName = files[0].name;
      loadActive();
      dirty = true;
      flushSave();
    }
    function toggleLayout() {
      bodyEl.classList.toggle('cl-stacked');
    }

    /* ---------- Close guard ---------- */
    window.addEventListener('beforeunload', function onLeave(e) {
      if (dirty && canEdit) { e.preventDefault(); e.returnValue = ''; }
    });

    /* ---------- Boot ---------- */
    injectStyle();
    loadActive();
    setTimeout(renderPreview, 80);

    return {
      destroy: function () {
        if (saveTimer) clearTimeout(saveTimer);
        if (previewTimer) clearTimeout(previewTimer);
        if (statusTimer) clearTimeout(statusTimer);
        if (dirty) flushSave();
        /* Release the iframe document to stop any timers inside it */
        try { frame.srcdoc = ''; } catch (e) { }
        hostEl.innerHTML = '';
      }
    };
  }

  /* ---------- Style ---------- */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.cl-shell{display:flex;flex-direction:column;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:14px;overflow:hidden;background:#fff}',
      '.cl-head{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.4rem .5rem;background:var(--paper,#F1F9F7);border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.cl-tabs{display:flex;gap:.25rem;flex-wrap:wrap;flex:1;min-width:0;overflow-x:auto}',
      '.cl-tab{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .8rem;border-radius:8px;border:1.5px solid transparent;background:transparent;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.78rem;cursor:pointer;white-space:nowrap}',
      '.cl-tab:hover{background:var(--sage,#E5F2EF)}',
      '.cl-tab.on{background:#fff;border-color:var(--line,rgba(38,51,49,.12));color:var(--brand-deep,#245F5A)}',
      '.cl-tab i{opacity:.75}',
      '.cl-actions{display:flex;gap:.25rem;flex-wrap:wrap}',
      '.cl-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .65rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:8px;background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.72rem;cursor:pointer}',
      '.cl-btn:hover{border-color:var(--brand,#55BFB3);background:var(--sage,#E5F2EF)}',
      '.cl-btn.cl-save{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.cl-btn.cl-save:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.cl-btn.cl-run{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.cl-btn.cl-run:hover{background:var(--brand-deep,#245F5A);color:#fff}',
      '.cl-btn.cl-danger{color:#b8362a}',
      '.cl-btn.cl-danger:hover{background:#fde8e8;border-color:#f2c4c4}',
      '.cl-body{display:grid;grid-template-columns:1fr 1fr;min-height:380px}',
      '.cl-body.cl-stacked{grid-template-columns:1fr;grid-template-rows:1fr 1fr}',
      '.cl-edit-wrap{display:flex;flex-direction:column;border-right:1px solid var(--line,rgba(38,51,49,.12));min-width:0}',
      '.cl-edit{flex:1;min-height:300px;padding:.8rem 1rem;border:0;outline:none;resize:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;line-height:1.55;background:#fff;color:var(--ink,#263331);tab-size:2}',
      '.cl-edit[readonly]{background:var(--paper,#F1F9F7)}',
      '.cl-meta{display:flex;justify-content:space-between;align-items:center;padding:.3rem .8rem;background:var(--paper,#F1F9F7);border-top:1px solid var(--line,rgba(38,51,49,.12));font-size:.7rem;color:var(--muted,#5A6E6A);font-weight:800;letter-spacing:.05em;text-transform:uppercase}',
      '.cl-preview-wrap{position:relative;min-width:0;background:#fff}',
      '.cl-preview{width:100%;height:100%;min-height:300px;border:0;display:block;background:#fff}',
      '@media(max-width:640px){.cl-body{grid-template-columns:1fr;grid-template-rows:auto 260px}.cl-edit-wrap{border-right:0;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}}',
      '@media(prefers-reduced-motion:reduce){.cl-btn,.cl-tab{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  g.CodeLab = { mount: mount };
})(window);