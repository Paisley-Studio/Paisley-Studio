/* =========================================================
   Paisley Tech Studio — Code Lab (the one IDE)
   ---------------------------------------------------------
   Used by projects (techBuilds), class work (techLessonWork) and
   group tasks (techGroups/{gid}/tasks/{tid}, coded together live).

   Saved on the doc it edits:
     codeFiles   = [{ name: 'css/style.css', lang, content }]   (max 60 files, 200 KB each)
     codeFolders = ['images', 'css']                           (empty folders the builder made)
     codeAssets  = [{ name: 'images/cat.png', url, storagePath, type, size }]
     codeActive  = 'index.html'
   A name may hold folders ("pages/about.html"). The preview resolves
   relative links, <link>/<script src>, src/href/url() and plain
   "images/cat.png" strings in JS to the uploaded files.

   Editor: CodeMirror 5 (cdnjs) with HTML/CSS/JS colouring, autocomplete
   as you type (Ctrl+Space any time), Emmet (type ul>li*3 then Tab),
   auto-closing tags and brackets, Ctrl+/ comments, Ctrl+S save.
   Everything loads lazily the first time an IDE opens. If the CDN is
   unreachable it falls back to a plain text box, so work never stops.

   Live mode (opts.collab): every member edits the same doc. Changes are
   merged in a transaction (a three-way merge per file against the last
   version this browser saw), and each person's cursor shows to the others
   with their name, through collab.presence/{uid}.

   Safety: the preview iframe has allow-scripts only (no allow-same-origin),
   so student code runs in a null origin and cannot reach the page, cookies
   or Firestore.

   CodeLab.mount(host, { build, me, canEdit, onSave(payload) -> Promise,
                         uploadAsset(file) -> Promise<{ url, storagePath }>,
                         collab: { ref, presence, me: { uid, name } },
                         mode: 'code' | 'doc', title })
     -> { destroy(), flush() -> Promise, state() }
   CodeLab.buildPreview(files, active, assets) -> html
   CodeLab.load() -> Promise   (warms the editor libraries)
========================================================= */
(function (g) {
  'use strict';

  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var MAX_FILES = 60;
  var MAX_FILE_BYTES = 200 * 1024;
  var MAX_ASSETS = 60;
  var MAX_ASSET_BYTES = 50 * 1024 * 1024;
  var UP_ACCEPT = 'image/*,video/*,audio/*,font/*,.ttf,.otf,.woff,.woff2';
  var LANGS = {
    html: { label: 'HTML', icon: 'fab fa-html5', mode: 'htmlmixed' },
    css: { label: 'CSS', icon: 'fab fa-css3-alt', mode: 'css' },
    js: { label: 'JavaScript', icon: 'fab fa-js', mode: 'javascript' },
    json: { label: 'JSON', icon: 'fas fa-brackets-curly', mode: { name: 'javascript', json: true } },
    md: { label: 'Markdown', icon: 'fab fa-markdown', mode: 'markdown' },
    txt: { label: 'Text', icon: 'fas fa-file-lines', mode: 'text/plain' }
  };
  var COLORS = ['#E8590C', '#7048E8', '#1C7ED6', '#D6336C', '#2B8A3E', '#F59F00', '#0C8599', '#5F3DC4'];

  function langOf(name) {
    var lower = String(name || '').toLowerCase();
    if (/\.(html?|xhtml)$/.test(lower)) return 'html';
    if (/\.css$/.test(lower)) return 'css';
    if (/\.(js|mjs|jsx)$/.test(lower)) return 'js';
    if (/\.json$/.test(lower)) return 'json';
    if (/\.md$/.test(lower)) return 'md';
    if (/\.txt$/.test(lower)) return 'txt';
    return 'html';
  }
  function defaultFile(lang, name) {
    if (lang === 'html') return { name: name || 'index.html', lang: 'html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>My project</title>\n</head>\n<body>\n  <h1>Hello, studio!</h1>\n</body>\n</html>\n' };
    if (lang === 'css') return { name: name || 'style.css', lang: 'css', content: 'body {\n  font-family: sans-serif;\n  background: #F1F9F7;\n  color: #263331;\n  padding: 2rem;\n}\n' };
    if (lang === 'js') return { name: name || 'script.js', lang: 'js', content: 'console.log("Code Lab is alive");\n' };
    if (lang === 'md') return { name: name || 'notes.md', lang: 'md', content: '# Notes\n\n' };
    return { name: name || 'notes.txt', lang: lang, content: '' };
  }
  function cleanName(s) {
    return String(s || '').trim().replace(/\\/g, '/').split('/').map(function (p) { return p.replace(/[^\w.\-]/g, '_').replace(/^\.+$/, ''); })
      .filter(Boolean).join('/').slice(0, 120);
  }
  function dirOf(p) { var i = String(p).lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i); }
  function baseOf(p) { var i = String(p).lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1); }
  /* "css" + "../images/a.png" -> "images/a.png" */
  function joinPath(base, rel) {
    rel = String(rel || '').trim();
    if (!rel || /^([a-z]+:|\/\/|#|data:|blob:)/i.test(rel)) return null;
    rel = rel.split(/[?#]/)[0];
    var parts = (rel.charAt(0) === '/' ? [] : (base ? base.split('/') : [])).concat(rel.replace(/^\/+/, '').split('/'));
    var out = [];
    parts.forEach(function (p) { if (!p || p === '.') return; if (p === '..') out.pop(); else out.push(p); });
    return out.join('/');
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------------------------------------------------------
     Libraries (lazy)
     --------------------------------------------------------- */
  var CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
  var EMMET_URL = 'https://cdn.jsdelivr.net/npm/@emmetio/codemirror-plugin@1.2.4/dist/browser.min.js';
  var CM_SCRIPTS = [
    ['mode/xml/xml.min.js', 'mode/javascript/javascript.min.js', 'mode/css/css.min.js', 'mode/markdown/markdown.min.js',
      'addon/hint/show-hint.min.js', 'addon/edit/closetag.min.js', 'addon/edit/closebrackets.min.js', 'addon/edit/matchbrackets.min.js',
      'addon/fold/xml-fold.min.js', 'addon/selection/active-line.min.js', 'addon/comment/comment.min.js', 'addon/search/searchcursor.min.js'],
    ['mode/htmlmixed/htmlmixed.min.js', 'addon/hint/xml-hint.min.js', 'addon/hint/css-hint.min.js', 'addon/hint/javascript-hint.min.js', 'addon/hint/anyword-hint.min.js', 'addon/edit/matchtags.min.js'],
    ['addon/hint/html-hint.min.js']
  ];
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-cl-src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.async = false; s.setAttribute('data-cl-src', src);
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector('link[data-cl-href="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.setAttribute('data-cl-href', href); document.head.appendChild(l);
  }
  var libs = null;
  function load() {
    if (libs) return libs;
    loadCss(CM_BASE + 'codemirror.min.css'); loadCss(CM_BASE + 'addon/hint/show-hint.min.css');
    libs = (g.CodeMirror ? Promise.resolve() : loadScript(CM_BASE + 'codemirror.min.js'))
      .then(function () { return Promise.all(CM_SCRIPTS[0].map(function (p) { return loadScript(CM_BASE + p); })); })
      .then(function () { return Promise.all(CM_SCRIPTS[1].map(function (p) { return loadScript(CM_BASE + p); })); })
      .then(function () { return Promise.all(CM_SCRIPTS[2].map(function (p) { return loadScript(CM_BASE + p); })); })
      .then(function () { return loadScript(EMMET_URL).catch(function (e) { console.warn('Emmet did not load:', e); }); })
      .then(function () { return g.CodeMirror; })
      .catch(function (e) { libs = null; throw e; });
    return libs;
  }

  /* HTML tags offered as you type a word on its own (d -> div): picking one writes the whole tag,
     opening and closing, with the cursor where the content goes (| marks it). Most used first. */
  var BLOCK = function (t) { return '<' + t + '>\n  |\n</' + t + '>'; };
  var PAGE_SNIP = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My page</title>\n</head>\n<body>\n  |\n</body>\n</html>';
  /* doc, DOC, html or ! all give the whole starting page (the boilerplate). */
  var TAG_SNIPS = [
    ['div', '<div>|</div>'], ['doc', PAGE_SNIP, 'doc  whole page'], ['html', PAGE_SNIP, 'html  whole page'], ['p', '<p>|</p>'], ['h1', '<h1>|</h1>'], ['h2', '<h2>|</h2>'], ['h3', '<h3>|</h3>'],
    ['a', '<a href="|"></a>'], ['img', '<img src="|" alt="">'], ['button', '<button>|</button>'],
    ['ul', '<ul>\n  <li>|</li>\n</ul>'], ['ol', '<ol>\n  <li>|</li>\n</ol>'], ['li', '<li>|</li>'], ['span', '<span>|</span>'],
    ['section', BLOCK('section')], ['header', BLOCK('header')], ['footer', BLOCK('footer')], ['nav', BLOCK('nav')], ['main', BLOCK('main')],
    ['article', BLOCK('article')], ['aside', BLOCK('aside')], ['form', BLOCK('form')],
    ['input', '<input type="text" placeholder="|">'], ['label', '<label>|</label>'], ['textarea', '<textarea>|</textarea>'],
    ['select', '<select>\n  <option>|</option>\n</select>'], ['option', '<option>|</option>'],
    ['table', '<table>\n  <tr>\n    <td>|</td>\n  </tr>\n</table>'], ['tr', '<tr>\n  <td>|</td>\n</tr>'], ['td', '<td>|</td>'], ['th', '<th>|</th>'],
    ['br', '<br>|'], ['hr', '<hr>|'], ['strong', '<strong>|</strong>'], ['em', '<em>|</em>'], ['b', '<b>|</b>'], ['i', '<i>|</i>'],
    ['small', '<small>|</small>'], ['mark', '<mark>|</mark>'], ['blockquote', '<blockquote>|</blockquote>'], ['pre', '<pre>|</pre>'], ['code', '<code>|</code>'],
    ['video', '<video src="|" controls></video>'], ['audio', '<audio src="|" controls></audio>'], ['iframe', '<iframe src="|"></iframe>'],
    ['canvas', '<canvas id="|" width="400" height="300"></canvas>'], ['figure', BLOCK('figure')], ['figcaption', '<figcaption>|</figcaption>'],
    ['style', BLOCK('style')], ['script', BLOCK('script')], ['link', '<link rel="stylesheet" href="|">'],
    ['meta', '<meta charset="UTF-8">|'], ['title', '<title>|</title>'], ['head', BLOCK('head')], ['body', BLOCK('body')],
    ['h4', '<h4>|</h4>'], ['h5', '<h5>|</h5>'], ['h6', '<h6>|</h6>']
  ];
  /* Writes a snippet over the typed word, indented like its line, with the cursor at |. */
  function putSnippet(cm, from, to, snip) {
    var indent = /^\s*/.exec(cm.getLine(from.line))[0];
    snip = snip.replace(/\n/g, '\n' + indent);
    var at = snip.indexOf('|'); if (at < 0) at = snip.length; else snip = snip.slice(0, at) + snip.slice(at + 1);
    cm.replaceRange(snip, from, to, '+complete');
    var lines = snip.slice(0, at).split('\n');
    cm.setCursor({ line: from.line + lines.length - 1, ch: lines.length === 1 ? from.ch + at : lines[lines.length - 1].length });
  }
  /* The tag list for the word before the cursor, when that word stands on its own
     (start of a line, or just after a tag), never inside a tag or an Emmet abbreviation. */
  function tagHint(ed) {
    var cur = ed.getCursor(), line = ed.getLine(cur.line), end = cur.ch, start = end;
    while (start && /[\w!]/.test(line.charAt(start - 1))) start--;
    var word = line.slice(start, end), before = line.slice(0, start);
    if (!word || !(/^\s*$/.test(before) || /<[^<>]*>\s*$/.test(before))) return null;
    if (/\w/.test(line.charAt(end))) return null;   /* in the middle of a word */
    var CMg = g.CodeMirror, from = CMg.Pos(cur.line, start), to = CMg.Pos(cur.line, end), list;
    function item(name, snip, label) {
      return {
        text: name, snip: snip,
        render: function (el) { el.innerHTML = '<b class="cl-h-tag">' + esc(label || name) + '</b><span class="cl-h-snip">' + esc(snip.replace('|', '').replace(/\n\s*/g, ' ')) + '</span>'; },
        hint: function (cm, data, c) { putSnippet(cm, data.from, data.to, c.snip); }
      };
    }
    if (word.charAt(0) === '!') list = word === '!' ? [item('!', PAGE_SNIP, '! whole page')] : [];
    else {
      var w = word.toLowerCase();
      list = TAG_SNIPS.filter(function (t) { return t[0].indexOf(w) === 0; }).map(function (t) { return item(t[0], t[1], t[2]); });
    }
    return list.length ? { list: list, from: from, to: to } : null;
  }

  /* Words offered as you type JavaScript, on top of the words already in the file. */
  var JS_WORDS = ('document window console.log console.error alert prompt confirm function return const let var if else for while do switch case break continue ' +
    'true false null undefined new this class extends constructor async await try catch finally throw typeof instanceof ' +
    'document.querySelector document.querySelectorAll document.getElementById document.createElement document.body ' +
    'addEventListener removeEventListener appendChild removeChild innerHTML textContent innerText classList.add classList.remove classList.toggle classList.contains ' +
    'style setAttribute getAttribute value checked disabled preventDefault target ' +
    'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame Math.random Math.floor Math.round Math.ceil Math.max Math.min Math.abs ' +
    'parseInt parseFloat Number String Boolean Array Object JSON.stringify JSON.parse localStorage.getItem localStorage.setItem ' +
    'length push pop shift unshift slice splice map filter forEach reduce find findIndex includes indexOf join split toUpperCase toLowerCase trim ' +
    'fetch then catch Date Date.now getContext fillRect fillStyle strokeStyle beginPath arc fill stroke clearRect ' +
    'click input change submit keydown keyup mouseover mouseout load DOMContentLoaded').split(' ');

  /* ---------------------------------------------------------
     Preview: one self-contained page from the files and uploads
     --------------------------------------------------------- */
  function buildPreview(files, active, assets) {
    files = (files || []).map(function (f) { return { name: f.name, lang: f.lang || langOf(f.name), content: String(f.content || '') }; });
    var assetUrl = {};
    (assets || []).forEach(function (a) { if (a && a.name && /^https:\/\//.test(a.url || '')) assetUrl[a.name] = a.url; });
    var byName = {}; files.forEach(function (f) { byName[f.name] = f; });
    var html = byName[active] && byName[active].lang === 'html' ? byName[active] : (byName['index.html'] || files.filter(function (f) { return f.lang === 'html'; })[0]);
    if (!html) {
      if (files.length === 1 && files[0].lang === 'md') return mdPage(files[0].content);
      var css = files.filter(function (f) { return f.lang === 'css'; }).map(function (f) { return f.content; }).join('\n');
      var js = files.filter(function (f) { return f.lang === 'js'; }).map(function (f) { return f.content; }).join('\n');
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style>' + HARNESS + '</head>' +
        '<body style="font-family:sans-serif;padding:2rem;background:#F1F9F7;color:#5A6E6A"><p>Add an HTML file (for example index.html) to see your page here.</p>' +
        '<script>' + js + '<\/script></body></html>';
    }
    var here = dirOf(html.name);
    function resolve(rel, base) { var p = joinPath(base, rel); return p == null ? null : p; }
    function cssFix(text, base) {
      return String(text).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (m, q, u) { var p = resolve(u, base); return p && assetUrl[p] ? 'url("' + assetUrl[p] + '")' : m; });
    }
    function jsFix(text) {
      return String(text).replace(/(['"`])((?:\.{0,2}\/)?[\w\-./ ]+\.\w{2,5})\1/g, function (m, q, u) { var p = resolve(u, here); return p && assetUrl[p] ? q + assetUrl[p] + q : m; });
    }
    var out = html.content;
    out = out.replace(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, function (m, href) {
      var p = resolve(href, here), f = p && byName[p];
      return f && f.lang === 'css' ? '<style data-file="' + esc(p) + '">\n' + cssFix(f.content, dirOf(p)) + '\n</style>' : m;
    });
    out = out.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function (m, a, src, b) {
      var p = resolve(src, here), f = p && byName[p];
      return f && f.lang === 'js' ? '<script' + a.replace(/\s+$/, '') + b + '>\n' + jsFix(f.content).replace(/<\/script/gi, '<\\/script') + '\n<\/script>' : m;
    });
    out = out.replace(/\b(src|href|poster|data)\s*=\s*(["'])([^"']+)\2/gi, function (m, attr, q, u) {
      var p = resolve(u, here); return p && assetUrl[p] ? attr + '=' + q + assetUrl[p] + q : m;
    });
    out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, function (m, a, body) { return '<style' + a + '>' + cssFix(body, here) + '</style>'; });
    out = out.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, function (m, a, body, c) { return a + jsFix(body) + c; });
    out = out.replace(/\bstyle\s*=\s*"([^"]*url\([^"]*)"/gi, function (m, body) { return 'style="' + cssFix(body, here).replace(/"/g, "'") + '"'; });
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, function (m) { return m + HARNESS; });
    else out = HARNESS + out;
    return out;
  }
  /* Runs inside the preview: forwards console output and errors, and turns links
     to the project's own pages into a message so the IDE can open that page. */
  var HARNESS = '<script>(function(){var P=parent;function s(k,a){try{P.postMessage({__cl:1,k:k,t:[].map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ").slice(0,2000)},"*")}catch(e){}}' +
    '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){s(k,arguments);try{o.apply(console,arguments)}catch(e){}}});' +
    'addEventListener("error",function(e){s("error",[e.message+(e.lineno?" (line "+e.lineno+")":"")])});' +
    'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h||/^(https?:|mailto:|tel:|#|javascript:)/i.test(h))return;e.preventDefault();try{P.postMessage({__cl:1,k:"nav",t:h},"*")}catch(x){}},true)})();<\/script>';

  function mdHtml(md) {
    var lines = String(md || '').split('\n'), out = [], list = null, para = [];
    function inline(t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } if (list) { out.push('</' + list + '>'); list = null; } }
    lines.forEach(function (l) {
      var h = /^(#{1,4})\s+(.*)$/.exec(l), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
      if (h) { flush(); out.push('<h' + (h[1].length + 1) + '>' + inline(h[2]) + '</h' + (h[1].length + 1) + '>'); }
      else if (ul || ol) { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } var tag = ul ? 'ul' : 'ol'; if (list !== tag) { if (list) out.push('</' + list + '>'); out.push('<' + tag + '>'); list = tag; } out.push('<li>' + inline((ul || ol)[1]) + '</li>'); }
      else if (!l.trim()) flush();
      else { if (list) { out.push('</' + list + '>'); list = null; } para.push(l.trim()); }
    });
    flush();
    return out.join('\n');
  }
  function mdPage(md) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;max-width:720px;margin:1.5rem auto;padding:0 1.2rem;line-height:1.7;color:#263331}h2,h3,h4,h5{font-family:sans-serif;color:#245F5A}</style></head><body>' + mdHtml(md) + '</body></html>';
  }

  /* ---------------------------------------------------------
     Three-way merge of one text: base -> mine and base -> theirs,
     each taken as one changed stretch. Edits in different places
     both survive; edits on the same stretch keep mine.
     --------------------------------------------------------- */
  function region(a, b) {
    var p = 0, n = Math.min(a.length, b.length);
    while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    var s = 0;
    while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return { from: p, to: a.length - s, text: b.slice(p, b.length - s) };
  }
  function merge3(base, mine, theirs) {
    if (mine === theirs || theirs === base) return mine;
    if (mine === base) return theirs;
    var m = region(base, mine), t = region(base, theirs);
    if (m.to <= t.from) return base.slice(0, m.from) + m.text + base.slice(m.to, t.from) + t.text + base.slice(t.to);
    if (t.to <= m.from) return base.slice(0, t.from) + t.text + base.slice(t.to, m.from) + m.text + base.slice(m.to);
    return mine;
  }

  /* ---------------------------------------------------------
     The IDE
     --------------------------------------------------------- */
  var FULL = { key: '', at: 0 };   /* the last full-screen IDE, so a re-draw keeps it full screen */
  function mount(hostEl, opts) {
    if (!hostEl) throw new Error('CodeLab.mount: missing host element');
    injectStyle();
    opts = opts || {};
    var build = opts.build || {};
    var canEdit = !!opts.canEdit;
    var docMode = opts.mode === 'doc';
    var save = typeof opts.onSave === 'function' ? opts.onSave : function () { return Promise.resolve(); };
    var collab = opts.collab && opts.collab.ref ? opts.collab : null;
    var me = (collab && collab.me) || opts.me || {};
    var dead = false;

    function seedFiles(src) {
      var list = Array.isArray(src.codeFiles) && src.codeFiles.length ? src.codeFiles : null;
      if (!list) return docMode ? [{ name: 'writing.md', lang: 'md', content: '' }] : [defaultFile('html')];
      return list.map(function (f) { var n = cleanName(f.name) || 'untitled.txt'; return { name: n, lang: f.lang || langOf(n), content: String(f.content || '') }; });
    }
    var files = seedFiles(build);
    var folders = (build.codeFolders || []).map(cleanName).filter(Boolean);
    var assets = (build.codeAssets || []).filter(function (a) { return a && a.name && a.url; }).map(function (a) { return Object.assign({}, a); });
    var activeName = build.codeActive && files.some(function (f) { return f.name === build.codeActive; }) ? build.codeActive : (files.filter(function (f) { return f.name === 'index.html'; })[0] || files[0]).name;
    var previewPage = null;     /* the html page shown, when it differs from the open file */
    var openFolder = {}, curFolder = '';
    /* Live mode: what this browser last saw on the server, per file. */
    var base = {}; files.forEach(function (f) { base[f.name] = f.content; });

    hostEl.innerHTML =
      '<div class="cl-shell' + (docMode ? ' cl-docmode' : '') + '">' +
        '<div class="cl-head">' +
          (docMode ? '' : '<button type="button" class="cl-btn cl-treebtn" data-clcmd="tree" title="Files" aria-label="Show files"><i class="fas fa-folder-tree"></i></button>') +
          (docMode ? '' : '<span class="cl-brand" title="Paisley VS Code"><i class="fas fa-code"></i><b>Paisley VS Code</b></span>') +
          '<div class="cl-crumb" aria-live="polite"></div>' +
          '<div class="cl-people" aria-label="Who is here"></div>' +
          '<div class="cl-actions">' +
            (docMode ? '' : '<button type="button" class="cl-btn" data-clcmd="layout" title="Side by side / stacked" aria-label="Change layout"><i class="fas fa-table-columns"></i></button>') +
            '<button type="button" class="cl-btn cl-fullbtn" data-clcmd="full" title="Full screen" aria-label="Full screen" aria-pressed="false"><i class="fas fa-expand"></i></button>' +
            (canEdit && !collab ? '<button type="button" class="cl-btn cl-save" data-clcmd="save"><i class="fas fa-floppy-disk"></i> Save</button>' : '') +
            '<button type="button" class="cl-btn cl-run" data-clcmd="run" title="Run" aria-label="Run"><i class="fas fa-play"></i> Run</button>' +
          '</div>' +
        '</div>' +
        '<div class="cl-body">' +
          (docMode ? '' : '<aside class="cl-tree" aria-label="Project files"><div class="cl-tree-acts">' +
            (canEdit ? '<button type="button" class="cl-btn" data-clcmd="add" title="New file"><i class="fas fa-file-circle-plus"></i></button>' +
              '<button type="button" class="cl-btn" data-clcmd="folder" title="New folder"><i class="fas fa-folder-plus"></i></button>' +
              (opts.uploadAsset ? '<label class="cl-btn cl-uplabel" title="Upload pictures, videos or sounds from your computer" style="margin:0"><i class="fas fa-upload"></i><input type="file" class="cl-upin" multiple hidden accept="' + UP_ACCEPT + '"></label>' : '') : '') +
            '</div><div class="cl-tree-list"></div><div class="cl-tree-note"></div></aside>') +
          '<div class="cl-edit-wrap"><div class="cl-edit-host"><textarea class="cl-fallback" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"' + (canEdit ? '' : ' readonly') + ' aria-label="Code"></textarea></div>' +
            '<div class="cl-meta"><span class="cl-lang"></span><span class="cl-status" role="status"></span></div></div>' +
          '<div class="cl-preview-wrap"><iframe class="cl-preview" sandbox="allow-scripts allow-modals" referrerpolicy="no-referrer" title="Live preview"></iframe>' +
            (docMode ? '' : '<details class="cl-console"><summary><i class="fas fa-terminal"></i> Console <span class="cl-count"></span></summary><div class="cl-log"></div></details>') + '</div>' +
        '</div>' +
      '</div>';

    var q = function (s) { return hostEl.querySelector(s); };
    var crumbEl = q('.cl-crumb'), langEl = q('.cl-lang'), statusEl = q('.cl-status'), frame = q('.cl-preview'), bodyEl = q('.cl-body'),
      treeEl = q('.cl-tree-list'), peopleEl = q('.cl-people'), logEl = q('.cl-log'), countEl = q('.cl-count'), fallback = q('.cl-fallback');
    var cm = null, docs = {}, applying = false;

    /* ---------- status ---------- */
    var statusTimer = null;
    function setStatus(text, kind, stay) {
      statusEl.textContent = text || '';
      statusEl.style.color = kind === 'err' ? '#b8362a' : kind === 'ok' ? '#1d8b57' : '';
      if (statusTimer) clearTimeout(statusTimer);
      if (text && !stay) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 3500);
    }

    function file(name) { return files.filter(function (f) { return f.name === name; })[0]; }
    function activeFile() { return file(activeName); }

    /* ---------- file tree ---------- */
    function allFolders() {
      var set = {};
      folders.forEach(function (d) { var p = ''; d.split('/').forEach(function (x) { p = p ? p + '/' + x : x; set[p] = 1; }); });
      files.concat(assets).forEach(function (f) { var d = dirOf(f.name), p = ''; if (!d) return; d.split('/').forEach(function (x) { p = p ? p + '/' + x : x; set[p] = 1; }); });
      return Object.keys(set).sort();
    }
    function renderTree() {
      if (!treeEl) return;
      var dirs = allFolders();
      function itemsIn(d) {
        var sub = dirs.filter(function (x) { return dirOf(x) === d; });
        var fs = files.filter(function (f) { return dirOf(f.name) === d; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        var as = assets.filter(function (a) { return dirOf(a.name) === d; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        var depth = d ? d.split('/').length : 0, pad = 'padding-left:' + (0.4 + depth * 0.85) + 'rem';
        return sub.map(function (x) {
          var open = openFolder[x] !== false;
          return '<div class="cl-node cl-dir' + (curFolder === x ? ' on' : '') + '" style="' + pad + '" data-dir="' + esc(x) + '"><i class="fas fa-folder' + (open ? '-open' : '') + '"></i> ' + esc(baseOf(x)) +
            (canEdit && opts.uploadAsset ? '<button type="button" class="cl-up" data-clnode="upto" data-p="' + esc(x) + '" title="Upload ' + esc(pickWord(x)) + ' from your computer into ' + esc(x) + '/" aria-label="Upload into ' + esc(x) + '"><i class="fas fa-upload"></i> Upload</button>' : '') +
            (canEdit ? '<span class="cl-node-acts"><button type="button" data-clnode="newin" data-p="' + esc(x) + '" title="New file here" aria-label="New file in ' + esc(x) + '"><i class="fas fa-plus"></i></button><button type="button" data-clnode="deldir" data-p="' + esc(x) + '" title="Delete folder" aria-label="Delete folder ' + esc(x) + '"><i class="fas fa-trash"></i></button></span>' : '') + '</div>' +
            (open ? itemsIn(x) : '');
        }).join('') + fs.map(function (f) {
          var meta = LANGS[f.lang] || LANGS.txt;
          return '<div class="cl-node cl-file' + (f.name === activeName ? ' on' : '') + '" style="' + pad + '" data-file="' + esc(f.name) + '"><i class="' + meta.icon + '"></i> ' + esc(baseOf(f.name)) +
            (canEdit ? '<span class="cl-node-acts"><button type="button" data-clnode="rename" data-p="' + esc(f.name) + '" title="Rename or move" aria-label="Rename ' + esc(f.name) + '"><i class="fas fa-i-cursor"></i></button><button type="button" data-clnode="del" data-p="' + esc(f.name) + '" title="Delete" aria-label="Delete ' + esc(f.name) + '"><i class="fas fa-trash"></i></button></span>' : '') + '</div>';
        }).join('') + as.map(function (a) {
          var ic = /^image\//.test(a.type) ? 'fa-image' : /^video\//.test(a.type) ? 'fa-film' : /^audio\//.test(a.type) ? 'fa-music' : 'fa-file';
          return '<div class="cl-node cl-asset" style="' + pad + '" data-asset="' + esc(a.name) + '" title="Click to use it in your code"><i class="fas ' + ic + '"></i> ' + esc(baseOf(a.name)) +
            '<span class="cl-node-acts"><button type="button" data-clnode="useasset" data-p="' + esc(a.name) + '" title="Insert into code" aria-label="Insert ' + esc(a.name) + '"><i class="fas fa-code"></i></button>' +
            (canEdit ? '<button type="button" data-clnode="delasset" data-p="' + esc(a.name) + '" title="Delete" aria-label="Delete ' + esc(a.name) + '"><i class="fas fa-trash"></i></button>' : '') + '</span></div>';
        }).join('');
      }
      treeEl.innerHTML = '<div class="cl-node cl-dir cl-root' + (curFolder === '' ? ' on' : '') + '" data-dir=""><i class="fas fa-box-archive"></i> ' + esc(opts.title || 'My project') + '</div>' + itemsIn('');
      var n = q('.cl-tree-note'); if (n) n.textContent = assets.length ? 'Click a picture or video to put it in your code.' : (opts.uploadAsset && canEdit ? 'Make a folder (for example images or videos), press its Upload button and pick files from your computer.' : '');
    }
    function renderCrumb() {
      var f = activeFile();
      crumbEl.innerHTML = f ? '<i class="' + (LANGS[f.lang] || LANGS.txt).icon + '"></i> ' + esc(f.name) : '';
      langEl.textContent = f ? (LANGS[f.lang] || LANGS.txt).label + (cm && canEdit ? (f.lang === 'html' ? ' · Type a tag (d → div), Enter or Tab writes it' : '') + ' · Ctrl+Space for suggestions' + (f.lang === 'html' || f.lang === 'css' ? ' · Emmet: ul>li*3 then Tab' : '') : '') : '';
    }

    /* ---------- editor ---------- */
    function cmMode(f) { return (LANGS[f.lang] || LANGS.txt).mode; }
    function docFor(f) {
      if (!docs[f.name]) docs[f.name] = g.CodeMirror.Doc(f.content, cmMode(f));
      return docs[f.name];
    }
    function loadActive() {
      var f = activeFile(); if (!f) return;
      if (cm) { applying = true; cm.swapDoc(docFor(f)); applying = false; cm.setOption('readOnly', canEdit ? false : 'nocursor'); }
      else { fallback.value = f.content; fallback.scrollTop = 0; }
      renderTree(); renderCrumb(); paintRemoteCursors(); schedulePreview();
    }
    /* Suggestions must sit inside the IDE while it is full screen, or the browser hides them. */
    function hintBox() { var sh = hostEl.querySelector('.cl-shell'); return sh && sh.classList.contains('cl-full') ? sh : document.body; }
    function smartHint(ed, o) {
      var CMg = g.CodeMirror, cur = ed.getCursor(), tok = ed.getTokenAt(cur);
      var inner = CMg.innerMode(ed.getMode(), tok.state).mode.name, r = null;
      try {
        if (inner === 'xml' && !/tag|attribute|string|comment/.test(tok.type || '') && (r = tagHint(ed))) return r;
        if (inner === 'xml' && CMg.hint.html) r = CMg.hint.html(ed, o);
        else if (inner === 'css' && CMg.hint.css) r = CMg.hint.css(ed, o);
        else if (inner === 'javascript') r = jsHint(ed);
      } catch (e) { r = null; }
      if (!r || !r.list || !r.list.length) r = CMg.hint.anyword ? CMg.hint.anyword(ed, o) : null;
      return r;
    }
    function jsHint(ed) {
      var cur = ed.getCursor(), line = ed.getLine(cur.line), end = cur.ch, start = end;
      while (start && /[\w$.]/.test(line.charAt(start - 1))) start--;
      var word = line.slice(start, end); if (!word) return null;
      var seen = {}, list = [];
      var own = (ed.getValue().match(/[A-Za-z_$][\w$]{2,}/g) || []);
      JS_WORDS.concat(own).forEach(function (w) { if (!seen[w] && w !== word && w.toLowerCase().indexOf(word.toLowerCase()) === 0) { seen[w] = 1; list.push(w); } });
      return { list: list.slice(0, 40), from: g.CodeMirror.Pos(cur.line, start), to: g.CodeMirror.Pos(cur.line, end) };
    }
    function startEditor(CMg) {
      if (dead || !CMg) return;
      var hostDiv = q('.cl-edit-host');
      hostDiv.innerHTML = '';
      var f = activeFile();
      var keys = {
        'Ctrl-Space': function (ed) { ed.showHint({ hint: smartHint, container: hintBox(), completeSingle: false }); },
        'Ctrl-S': function () { flushSave(); }, 'Cmd-S': function () { flushSave(); },
        'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
        /* Tab: expand the Emmet abbreviation being typed (ul>li*3, .box, m10), else indent. */
        Tab: function (ed) {
          if (ed.somethingSelected()) return ed.indentSelection('add');
          var lang = (activeFile() || {}).lang || '';
          if (CMg.commands.emmetExpandAbbreviation && /html|css/.test(lang)) {
            if (CMg.commands.emmetExpandAbbreviation(ed) !== CMg.Pass) return;
            /* Not tracked while typing (the cursor came back to it): read it from the line. */
            var cur = ed.getCursor(), before = ed.getLine(cur.line).slice(0, cur.ch), tok = ed.getTokenAt(cur);
            var inner = CMg.innerMode(ed.getMode(), tok.state).mode.name;
            var ok = /[\w)\]}*+>.#$]$/.test(before) && !/comment|string/.test(tok.type || '') &&
              (inner === 'css' ? !/:/.test(before.split(/[;{]/).pop()) : inner === 'xml' && !/tag|attribute/.test(tok.type || ''));
            if (ok && CMg.commands.emmetExpandAbbreviationAll) {
              var gen = ed.changeGeneration();
              CMg.commands.emmetExpandAbbreviationAll(ed);
              if (ed.changeGeneration() !== gen) return;
            }
          }
          ed.execCommand('insertSoftTab');
        },
        'Shift-Tab': function (ed) { ed.indentSelection('subtract'); }
      };
      if (CMg.commands.emmetInsertLineBreak) keys.Enter = 'emmetInsertLineBreak';
      if (CMg.commands.emmetResetAbbreviation) keys.Esc = 'emmetResetAbbreviation';
      cm = CMg(hostDiv, {
        value: docFor(f), lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false, lineWrapping: docMode,
        autoCloseTags: true, autoCloseBrackets: true, matchBrackets: true, matchTags: { bothTags: true }, styleActiveLine: canEdit,
        readOnly: canEdit ? false : 'nocursor', extraKeys: keys, viewportMargin: 30,
        emmet: { mark: !docMode, preview: false, markTagPairs: true, previewOpenTag: false, autoRenameTags: true }
      });
      cm.on('change', function (ed, ch) {
        if (applying || !canEdit) return;
        var cf = activeFile(); if (!cf) return;
        cf.content = ed.getValue();
        if (cf.content.length > MAX_FILE_BYTES) setStatus('This file is very long. Split it into smaller files.', 'err', true);
        markDirty();
        if (ch.origin === '+input' && !docMode) maybeHint(ed, ch);
      });
      cm.on('cursorActivity', function () { sendPresence(); });
      cm.on('blur', function () { if (dirty && !collab) flushSave(); });
      cm.setSize('100%', '100%');
      renderCrumb(); paintRemoteCursors();
      setTimeout(function () { if (cm) cm.refresh(); }, 50);
    }
    function maybeHint(ed, ch) {
      if (ed.state.completionActive) return;
      var typed = ch.text.join(''); if (typed.length !== 1) return;
      var lang = (activeFile() || {}).lang;
      var tok = ed.getTokenAt(ed.getCursor()), inner = g.CodeMirror.innerMode(ed.getMode(), tok.state).mode.name;
      var go = false;
      if (inner === 'xml') go = (/[\w!]/.test(typed) && !/tag|attribute|string|comment/.test(tok.type || '') && !!tagHint(ed)) || typed === '<' || (typed === ' ' && /^<\w/.test(ed.getLine(ed.getCursor().line).slice(0, ed.getCursor().ch).split('>').pop() || '')) || (/\w/.test(typed) && /tag|attribute/.test(tok.type || ''));
      else if (inner === 'css') go = /[\w-]/.test(typed) && !/comment/.test(tok.type || '');
      else if (inner === 'javascript' || lang === 'js') go = /[\w.$]/.test(typed) && !/comment|string/.test(tok.type || '');
      if (go) ed.showHint({ hint: smartHint, container: hintBox(), completeSingle: false, closeCharacters: /[\s()\[\]{};:>,"']/ });
    }
    fallback.addEventListener('input', function () {
      if (!canEdit || cm) return;
      var f = activeFile(); if (!f) return; f.content = fallback.value; markDirty();
    });
    fallback.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); }
      if (e.key === 'Tab' && canEdit) {
        e.preventDefault(); var s = fallback.selectionStart, en = fallback.selectionEnd;
        fallback.value = fallback.value.slice(0, s) + '  ' + fallback.value.slice(en); fallback.selectionStart = fallback.selectionEnd = s + 2;
        var f = activeFile(); if (f) { f.content = fallback.value; markDirty(); }
      }
    });

    /* ---------- saving ---------- */
    var dirty = false, saving = false, saveTimer = null, pending = null;
    function markDirty() {
      dirty = true;
      setStatus(collab ? 'Syncing…' : 'Unsaved', '', true);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, collab ? 450 : 1500);
      schedulePreview();
    }
    function payload() {
      return {
        codeFiles: files.map(function (f) { return { name: f.name, lang: f.lang, content: f.content }; }),
        codeFolders: folders.slice(0, 60), codeAssets: assets.slice(0, MAX_ASSETS), codeActive: activeName,
        codeAt: FV().serverTimestamp()
      };
    }
    function flushSave() {
      if (!canEdit || dead) return Promise.resolve();
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (!dirty) return pending || Promise.resolve();
      if (saving) { saveTimer = setTimeout(flushSave, 300); return pending || Promise.resolve(); }
      var big = files.filter(function (f) { return f.content.length > MAX_FILE_BYTES; })[0];
      if (big) { setStatus(big.name + ' is over 200 KB, so it was not saved. Split it into smaller files.', 'err', true); return Promise.resolve(); }
      saving = true; dirty = false;
      pending = (collab ? pushCollab() : Promise.resolve(save(payload()))).then(function () {
        saving = false; pending = null;
        setStatus(collab ? 'Saved for everyone' : 'Saved', 'ok');
      }).catch(function (e) {
        saving = false; dirty = true; pending = null;
        setStatus('Not saved: ' + ((e && e.message) || e) + '. Retrying…', 'err', true);
        saveTimer = setTimeout(flushSave, 5000);
      });
      return pending;
    }
    /* Structural changes (new file, rename, folder, upload) save straight away. */
    function structural() { dirty = true; renderTree(); renderCrumb(); return flushSave(); }

    /* ---------- live mode ---------- */
    var unsubs = [], deleted = {}, others = {}, myColor = COLORS[Math.abs(hash(me.uid || 'x')) % COLORS.length];
    function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
    function mergeFiles(remote) {
      var out = [], seen = {};
      (remote || []).forEach(function (rf) {
        var n = cleanName(rf.name); if (!n || seen[n]) return; seen[n] = 1;
        if (deleted[n]) return;
        var lf = file(n), rc = String(rf.content || '');
        if (!lf) { if (base[n] != null) return; out.push({ name: n, lang: rf.lang || langOf(n), content: rc }); return; }
        out.push({ name: n, lang: lf.lang, content: merge3(base[n] != null ? base[n] : rc, lf.content, rc) });
      });
      files.forEach(function (lf) { if (!seen[lf.name] && base[lf.name] == null) out.push({ name: lf.name, lang: lf.lang, content: lf.content }); });
      return out;
    }
    function mergeList(remote, mine, key) {
      var out = (remote || []).slice(), names = {};
      out.forEach(function (x) { names[key ? x[key] : x] = 1; });
      (mine || []).forEach(function (x) { var k = key ? x[key] : x; if (!names[k] && !deleted[k]) out.push(x); });
      return out.filter(function (x) { return !deleted[key ? x[key] : x]; });
    }
    function adopt(merged) {
      /* Put the merged text into the editors without moving anyone's cursor more than needed. */
      var keepActive = activeName;
      merged.forEach(function (m) {
        var lf = file(m.name);
        if (!lf) { files.push(m); return; }
        if (lf.content === m.content) return;
        var d = docs[m.name];
        if (d) {
          var r = region(d.getValue(), m.content);
          applying = true;
          d.replaceRange(r.text, d.posFromIndex(r.from), d.posFromIndex(r.to), 'remote');
          applying = false;
        } else if (!cm && m.name === activeName) {
          var s = fallback.selectionStart; fallback.value = m.content; try { fallback.selectionStart = fallback.selectionEnd = Math.min(s, m.content.length); } catch (e) { }
        }
        lf.content = m.content;
      });
      var names = {}; merged.forEach(function (m) { names[m.name] = 1; });
      files = files.filter(function (f) { return names[f.name]; });
      if (!files.length) files = [docMode ? { name: 'writing.md', lang: 'md', content: '' } : defaultFile('html')];
      if (!file(keepActive)) { activeName = files[0].name; loadActive(); }
      renderTree(); schedulePreview();
    }
    function pushCollab() {
      var ref = collab.ref, sent = {}, gone = Object.assign({}, deleted);
      return firebase.firestore().runTransaction(function (tx) {
        return tx.get(ref).then(function (snap) {
          var d = snap.exists ? snap.data() : {};
          sent = {}; files.forEach(function (f) { sent[f.name] = f.content; });
          var merged = mergeFiles(d.codeFiles || []);
          var up = {
            codeFiles: merged, codeFolders: mergeList(d.codeFolders, folders).slice(0, 60),
            codeAssets: mergeList(d.codeAssets, assets, 'name').slice(0, MAX_ASSETS),
            codeAt: FV().serverTimestamp(), codeBy: me.uid || '', codeByName: me.name || ''
          };
          tx.update(ref, up);
          return up;
        });
      }).then(function (up) {
        up.codeFiles.forEach(function (f) { base[f.name] = f.content; });
        Object.keys(base).forEach(function (k) { if (!up.codeFiles.some(function (f) { return f.name === k; })) delete base[k]; });
        folders = up.codeFolders; assets = up.codeAssets;
        Object.keys(gone).forEach(function (k) { delete deleted[k]; });
        /* Anything typed while the transaction ran is kept on top of the saved result. */
        var result = up.codeFiles.map(function (m) {
          var lf = file(m.name), now = lf ? lf.content : m.content;
          return { name: m.name, lang: m.lang, content: merge3(sent[m.name] != null ? sent[m.name] : m.content, now, m.content) };
        });
        adopt(result);
        if (result.some(function (m) { return base[m.name] !== m.content; })) markDirty();
      });
    }
    function onRemote(snap) {
      if (dead || !snap.exists || snap.metadata.hasPendingWrites) return;
      var d = snap.data();
      var remote = (d.codeFiles || []).map(function (f) { return { name: cleanName(f.name), lang: f.lang || langOf(f.name), content: String(f.content || '') }; });
      var merged = canEdit ? mergeFiles(remote) : remote;
      remote.forEach(function (f) { base[f.name] = f.content; });
      Object.keys(base).forEach(function (k) { if (!remote.some(function (f) { return f.name === k; })) delete base[k]; });
      folders = canEdit ? mergeList(d.codeFolders, folders) : (d.codeFolders || []);
      assets = canEdit ? mergeList(d.codeAssets, assets, 'name') : (d.codeAssets || []);
      adopt(merged);
      if (canEdit && merged.some(function (m) { return base[m.name] !== m.content; })) markDirty();
      if (d.codeByName && d.codeBy !== me.uid) setStatus(d.codeByName + ' made a change', '');
    }
    var presTimer = null, beat = null;
    function sendPresence() {
      if (!collab || !collab.presence || !canEdit || !me.uid) return;
      if (presTimer) return;
      presTimer = setTimeout(function () {
        presTimer = null; if (dead) return;
        var c = cm ? cm.getCursor() : { line: 0, ch: 0 };
        collab.presence.doc(me.uid).set({ uid: me.uid, name: me.name || '', color: myColor, file: activeName, line: c.line, ch: c.ch, at: FV().serverTimestamp() }).catch(function () { });
      }, 250);
    }
    var marks = [];
    function paintRemoteCursors() {
      marks.forEach(function (m) { try { m.clear(); } catch (e) { } }); marks = [];
      var now = Date.now(), list = Object.keys(others).map(function (k) { return others[k]; }).filter(function (p) { return p.uid !== me.uid && (!p.atMs || now - p.atMs < 120000); });
      peopleEl.innerHTML = list.map(function (p) {
        return '<span class="cl-person" style="--c:' + esc(p.color || '#1C7ED6') + '" title="' + esc(p.name) + ' is on ' + esc(p.file) + ', line ' + ((p.line || 0) + 1) + '"><b>' + esc(String(p.name || '?').charAt(0).toUpperCase()) + '</b><span>' + esc(String(p.name || '').split(' ')[0]) + ' · ' + esc(baseOf(p.file || '')) + ':' + ((p.line || 0) + 1) + '</span></span>';
      }).join('');
      if (!cm) return;
      list.filter(function (p) { return p.file === activeName; }).forEach(function (p) {
        var el = document.createElement('span'); el.className = 'cl-rcur'; el.style.setProperty('--c', p.color || '#1C7ED6');
        el.innerHTML = '<span class="cl-rtag">' + esc(String(p.name || '').split(' ')[0]) + '</span>';
        var pos = g.CodeMirror.Pos(Math.min(p.line || 0, cm.lineCount() - 1), p.ch || 0);
        marks.push(cm.setBookmark(pos, { widget: el, insertLeft: true }));
        marks.push(cm.addLineClass ? { clear: (function (ln) { var h = cm.addLineClass(ln, 'background', 'cl-rline'); return function () { cm.removeLineClass(h, 'background', 'cl-rline'); }; })(pos.line) } : { clear: function () { } });
      });
    }
    if (collab) {
      unsubs.push(collab.ref.onSnapshot({ includeMetadataChanges: false }, onRemote, function (e) { setStatus('Live link lost: ' + (e.message || e), 'err', true); }));
      if (collab.presence) {
        unsubs.push(collab.presence.onSnapshot(function (s) {
          others = {};
          s.docs.forEach(function (d) { var x = d.data(); var t = x.at && x.at.toMillis ? x.at.toMillis() : 0; others[d.id] = Object.assign({ atMs: t }, x); });
          paintRemoteCursors();
        }, function () { }));
        if (canEdit && me.uid) { sendPresence(); beat = setInterval(sendPresence, 30000); }
      }
    }

    /* ---------- preview + console ---------- */
    var previewTimer = null, logCount = 0;
    function schedulePreview() { if (previewTimer) clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 600); }
    function renderPreview() {
      if (dead) return;
      if (logEl) { logEl.innerHTML = ''; logCount = 0; if (countEl) countEl.textContent = ''; }
      try {
        var page = previewPage && file(previewPage) ? previewPage : activeName;
        frame.srcdoc = docMode ? mdPage((files[0] || {}).content || '') : buildPreview(files, page, assets);
      } catch (e) {
        frame.srcdoc = '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#b8362a"><p>Preview failed: ' + esc(e.message || e) + '</p></body></html>';
      }
    }
    function onMessage(e) {
      if (dead || e.source !== frame.contentWindow || !e.data || !e.data.__cl) return;
      var d = e.data;
      if (d.k === 'nav') {
        var cur = file(previewPage) || activeFile();
        var p = joinPath(dirOf((cur && cur.lang === 'html' ? cur.name : 'index.html')), d.t);
        if (p && file(p) && file(p).lang === 'html') { previewPage = p; renderPreview(); setStatus('Showing ' + p, 'ok'); }
        else setStatus('The link ' + d.t + ' does not match a page in this project.', 'err');
        return;
      }
      if (!logEl) return;
      logCount++;
      if (logCount > 200) return;
      var row = document.createElement('div'); row.className = 'cl-logrow ' + d.k; row.textContent = d.t;
      logEl.appendChild(row); logEl.scrollTop = logEl.scrollHeight;
      if (countEl) countEl.textContent = '(' + logCount + ')';
      if (d.k === 'error') { var det = q('.cl-console'); if (det) det.open = true; }
    }
    window.addEventListener('message', onMessage);

    /* ---------- files, folders, uploads ---------- */
    /* Questions are asked inside the IDE, not with prompt()/confirm(): those boxes make the browser leave full screen. */
    function dialog(msg, value, okLabel) {
      return new Promise(function (done) {
        var box = document.createElement('div'), ask = value != null;
        box.className = 'cl-dlg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
        box.innerHTML = '<form class="cl-dlg-box"><p>' + esc(msg) + '</p>' + (ask ? '<input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="' + esc(msg) + '">' : '') +
          '<div class="cl-dlg-acts"><button type="button" class="cl-btn" data-dlg="no">Cancel</button><button type="submit" class="cl-btn cl-save">' + esc(okLabel || 'OK') + '</button></div></form>';
        (q('.cl-shell') || document.body).appendChild(box);
        var inp = box.querySelector('input'), form = box.querySelector('form');
        function end(v) { box.remove(); document.removeEventListener('keydown', onKey, true); done(v); if (cm && ask) cm.focus(); }
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(ask ? null : false); } }
        document.addEventListener('keydown', onKey, true);
        form.addEventListener('submit', function (e) { e.preventDefault(); end(ask ? inp.value : true); });
        box.querySelector('[data-dlg=no]').addEventListener('click', function () { end(ask ? null : false); });
        box.addEventListener('mousedown', function (e) { if (e.target === box) end(ask ? null : false); });
        setTimeout(function () { if (inp) { inp.value = value || ''; inp.focus(); inp.select(); } else form.querySelector('[type=submit]').focus(); }, 0);
      });
    }
    function askName(msg, start) { return dialog(msg, start || '').then(function (n) { return n == null ? null : cleanName(n); }); }
    function sure(msg) { return dialog(msg, null, 'Delete'); }
    function taken(n, except) { var low = n.toLowerCase(); return files.some(function (f) { return f !== except && f.name.toLowerCase() === low; }) || assets.some(function (a) { return a !== except && a.name.toLowerCase() === low; }); }
    function addFile(dir) {
      if (files.length >= MAX_FILES) { setStatus('A project can hold ' + MAX_FILES + ' files.', 'err'); return; }
      askName('New file name, for example about.html, game.js or style.css' + (dir ? ' (it goes in ' + dir + '/)' : ''), '').then(function (n) { if (n) makeFile(n, dir); });
    }
    function makeFile(n, dir) {
      if (dir && n.indexOf('/') === -1) n = dir + '/' + n;
      if (!/\.\w+$/.test(n)) n += '.html';
      if (taken(n)) { setStatus('There is already a file called ' + n, 'err'); return; }
      var lang = langOf(n), f = defaultFile(lang, n);
      if (lang === 'html') f.content = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>' + baseOf(n).replace(/\.\w+$/, '') + '</title>\n</head>\n<body>\n  \n</body>\n</html>\n';
      if (lang === 'css' || lang === 'js') f.content = '';
      files.push(f); delete deleted[n]; activeName = n; loadActive(); structural();
      if (cm) cm.focus();
    }
    function addFolder() {
      askName('Folder name, for example images or pages' + (curFolder ? ' (inside ' + curFolder + '/)' : ''), '').then(function (n) { if (n) makeFolder(n); });
    }
    function makeFolder(n) {
      if (curFolder && n.indexOf('/') === -1) n = curFolder + '/' + n;
      if (allFolders().indexOf(n) !== -1) { setStatus('That folder already exists.', 'err'); return; }
      folders.push(n); delete deleted[n]; openFolder[n] = true; curFolder = n; structural();
      if (opts.uploadAsset) {
        setStatus('Folder ' + n + ' made. Press its Upload button to add ' + pickWord(n) + ' from your computer.', 'ok', true);
        /* A pictures or videos folder opens the file picker straight away (if the browser allows it). */
        if (MEDIA_DIR.test(baseOf(n))) pickInto(n);
      }
    }
    /* What a folder is for, from its name: images, videos, sounds or anything. */
    var MEDIA_DIR = /^(images?|imgs?|pictures?|pics?|photos?|videos?|movies?|clips?|media|assets|sounds?|audio|music)$/i;
    function pickWord(dir) {
      var b = baseOf(dir);
      return /^(images?|imgs?|pictures?|pics?|photos?)$/i.test(b) ? 'pictures' : /^(videos?|movies?|clips?)$/i.test(b) ? 'videos' : /^(sounds?|audio|music)$/i.test(b) ? 'sounds' : 'pictures or videos';
    }
    function acceptFor(dir) {
      var w = dir == null ? '' : pickWord(dir);
      return w === 'pictures' ? 'image/*' : w === 'videos' ? 'video/*' : w === 'sounds' ? 'audio/*' : UP_ACCEPT;
    }
    var upDir = null;
    function pickInto(dir) {
      if (!upIn) return;
      upDir = dir; upIn.accept = acceptFor(dir);
      try { upIn.click(); } catch (e) { }
    }
    function renameFile(name) {
      var f = file(name); if (!f) return;
      askName('Rename or move. Use a folder name to move it, for example pages/' + baseOf(f.name), f.name).then(function (n) { if (n && n !== f.name) moveFile(f, name, n); });
    }
    function moveFile(f, name, n) {
      if (taken(n, f)) { setStatus('That name is taken.', 'err'); return; }
      deleted[f.name] = true; if (docs[f.name]) { docs[n] = docs[f.name]; delete docs[f.name]; }
      f.name = n; f.lang = langOf(n); delete deleted[n];
      if (activeName === name) activeName = n;
      loadActive(); if (cm && docs[n]) cm.setOption('mode', cmMode(f)); structural();
    }
    function deleteFile(name) {
      if (files.length <= 1) { setStatus('Keep at least one file.', 'err'); return; }
      sure('Delete ' + name + '?').then(function (ok) {
        if (!ok) return;
        files = files.filter(function (x) { return x.name !== name; }); delete docs[name]; deleted[name] = true;
        if (activeName === name) activeName = files[0].name;
        loadActive(); structural();
      });
    }
    function deleteFolder(dir) {
      var inside = files.filter(function (f) { return f.name.indexOf(dir + '/') === 0; }).length + assets.filter(function (a) { return a.name.indexOf(dir + '/') === 0; }).length;
      (inside ? sure('Delete the folder ' + dir + ' and the ' + inside + ' thing' + (inside === 1 ? '' : 's') + ' in it?') : Promise.resolve(true)).then(function (ok) { if (ok) dropFolder(dir); });
    }
    function dropFolder(dir) {
      files.filter(function (f) { return f.name.indexOf(dir + '/') === 0; }).forEach(function (f) { deleted[f.name] = true; delete docs[f.name]; });
      assets.filter(function (a) { return a.name.indexOf(dir + '/') === 0; }).forEach(function (a) { deleted[a.name] = true; });
      files = files.filter(function (f) { return f.name.indexOf(dir + '/') !== 0; });
      assets = assets.filter(function (a) { return a.name.indexOf(dir + '/') !== 0; });
      folders = folders.filter(function (d) { var gone = d === dir || d.indexOf(dir + '/') === 0; if (gone) deleted[d] = true; return !gone; });
      if (!files.length) files = [defaultFile('html')];
      if (!file(activeName)) activeName = files[0].name;
      curFolder = ''; loadActive(); structural();
    }
    function snippetFor(a) {
      var lang = (activeFile() || {}).lang, rel = relFrom(a.name);
      if (lang === 'css') return 'url("' + rel + '")';
      if (lang === 'js') return '"' + rel + '"';
      if (/^image\//.test(a.type)) return '<img src="' + rel + '" alt="">';
      if (/^video\//.test(a.type)) return '<video src="' + rel + '" controls width="480"></video>';
      if (/^audio\//.test(a.type)) return '<audio src="' + rel + '" controls></audio>';
      return rel;
    }
    function relFrom(target) {
      var from = dirOf(activeName).split('/').filter(Boolean), to = target.split('/');
      while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift(); }
      return from.map(function () { return '..'; }).concat(to).join('/');
    }
    function useAsset(name) {
      var a = assets.filter(function (x) { return x.name === name; })[0]; if (!a) return;
      var text = snippetFor(a);
      if (cm && canEdit) { cm.replaceSelection(text); cm.focus(); setStatus('Added ' + baseOf(a.name) + ' to your code', 'ok'); }
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { setStatus('Copied: ' + text, 'ok'); }, function () { setStatus(text); });
      else setStatus(text);
    }
    function deleteAsset(name) {
      sure('Delete ' + name + '? Code that uses it will show a broken picture.').then(function (ok) {
        if (!ok) return;
        assets = assets.filter(function (a) { return a.name !== name; }); deleted[name] = true; structural();
      });
    }
    var upIn = q('.cl-upin');
    /* The toolbar's upload goes to the folder that is selected; a folder's own Upload button goes there. */
    var upLabel = q('.cl-uplabel');
    if (upLabel) upLabel.addEventListener('click', function (e) { if (e.target !== upIn) { upDir = null; upIn.accept = UP_ACCEPT; } });
    if (upIn) upIn.addEventListener('change', function (e) {
      var list = [].slice.call(e.target.files || []); e.target.value = '';
      var target = upDir; upDir = null; upIn.accept = UP_ACCEPT;
      list.reduce(function (p, f) {
        return p.then(function () {
          if (assets.length >= MAX_ASSETS) { setStatus('A project can hold ' + MAX_ASSETS + ' uploads.', 'err'); return; }
          if (f.size > MAX_ASSET_BYTES) { setStatus(f.name + ' is over 50 MB.', 'err'); return; }
          if (!/^(image|video|audio|font)\//.test(f.type || '') && !/\.(ttf|otf|woff2?)$/i.test(f.name)) { setStatus(f.name + ': upload pictures, video, sound or fonts.', 'err'); return; }
          var dir = target != null ? target : (curFolder || (/^image\//.test(f.type) ? 'images' : /^video\//.test(f.type) ? 'videos' : /^audio\//.test(f.type) ? 'sounds' : 'fonts'));
          var n = cleanName(dir + '/' + f.name); var k = 1;
          while (taken(n)) { n = cleanName(dir + '/' + f.name.replace(/(\.\w+)?$/, '-' + (++k) + '$1')); }
          setStatus('Uploading ' + f.name + '…', '', true);
          return Promise.resolve(opts.uploadAsset(f, n)).then(function (r) {
            assets.push({ name: n, url: r.url, storagePath: r.storagePath || '', type: f.type || '', size: f.size });
            delete deleted[n]; openFolder[dirOf(n)] = true;
            return structural().then(function () { setStatus('Uploaded ' + baseOf(n) + '. Click it to use it.', 'ok'); });
          }).catch(function (er) { setStatus('Upload failed: ' + ((er && er.message) || er), 'err', true); });
        });
      }, Promise.resolve());
    });

    /* ---------- clicks ---------- */
    hostEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-clcmd],[data-clnode],[data-file],[data-dir],[data-asset]'); if (!b || !hostEl.contains(b)) return;
      if (b.dataset.clcmd) {
        var cmd = b.dataset.clcmd;
        if (cmd === 'save') flushSave();
        else if (cmd === 'run') { previewPage = null; renderPreview(); setStatus('Running', 'ok'); }
        else if (cmd === 'layout') bodyEl.classList.toggle('cl-stacked');
        else if (cmd === 'full') toggleFull();
        else if (cmd === 'tree') hostEl.querySelector('.cl-shell').classList.toggle('cl-tree-open');
        else if (!canEdit) return;
        else if (cmd === 'add') addFile(curFolder);
        else if (cmd === 'folder') addFolder();
        return;
      }
      if (b.dataset.clnode) {
        e.stopPropagation();
        var p = b.dataset.p, a = b.dataset.clnode;
        if (a === 'useasset') useAsset(p);
        else if (!canEdit) return;
        else if (a === 'rename') renameFile(p);
        else if (a === 'del') deleteFile(p);
        else if (a === 'newin') addFile(p);
        else if (a === 'deldir') deleteFolder(p);
        else if (a === 'delasset') deleteAsset(p);
        else if (a === 'upto') { curFolder = p; openFolder[p] = true; renderTree(); pickInto(p); }
        return;
      }
      if (b.dataset.file != null) {
        if (dirty && !collab) flushSave();
        activeName = b.dataset.file; curFolder = dirOf(activeName); previewPage = null; loadActive();
        hostEl.querySelector('.cl-shell').classList.remove('cl-tree-open');
        if (cm) cm.focus();
      } else if (b.dataset.asset != null) useAsset(b.dataset.asset);
      else if (b.dataset.dir != null) {
        var d = b.dataset.dir;
        if (d && curFolder === d) openFolder[d] = openFolder[d] === false; else openFolder[d] = true;
        curFolder = d; renderTree();
      }
    });

    /* Full screen: the whole IDE fills the screen. Uses the browser's full screen where it
       exists (Esc leaves it); otherwise (iPhone) it covers the page until pressed again. */
    var shellEl = hostEl.querySelector('.cl-shell');
    function isFull() { return shellEl.classList.contains('cl-full'); }
    function setFull(on) {
      shellEl.classList.toggle('cl-full', on);
      document.documentElement.classList.toggle('cl-noscroll', on);
      var b = hostEl.querySelector('.cl-fullbtn');
      if (b) { b.setAttribute('aria-pressed', on); b.title = on ? 'Leave full screen' : 'Full screen'; b.innerHTML = '<i class="fas fa-' + (on ? 'compress' : 'expand') + '"></i>'; }
      setTimeout(function () { if (cm) cm.refresh(); }, 60);
    }
    function toggleFull() {
      var want = !isFull(), root = document.documentElement;
      setFull(want);
      try {
        if (want && root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(function () { });
        else if (!want && document.fullscreenElement === root && document.exitFullscreen) document.exitFullscreen().catch(function () { });
      } catch (e) { }
    }
    /* The browser can drop its own full screen (Esc, a file picker); the IDE stays big until its button is pressed. */
    function onFsChange() { }
    document.addEventListener('fullscreenchange', onFsChange);
    /* The same work mounted again straight away (the page re-drew it) comes back full screen. */
    var fullKey = (collab && collab.ref && collab.ref.path) || build.id || opts.title || '';
    if (FULL.key && FULL.key === fullKey && Date.now() - FULL.at < 2500) { FULL.key = ''; setFull(true); }

    function onLeave(e) { if (dirty && canEdit) { flushSave(); e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onLeave);

    /* ---------- boot ---------- */
    renderTree(); loadActive();
    setTimeout(renderPreview, 80);
    setStatus('Loading the editor…', '', true);
    load().then(function (CMg) { if (dead) return; startEditor(CMg); setStatus(''); })
      .catch(function (e) { console.warn('Code Lab editor:', e); setStatus('Simple editor (the full editor could not load).', '', true); });

    return {
      flush: function () { return flushSave(); },
      state: function () { return payload(); },
      refresh: function () { if (cm) cm.refresh(); },
      destroy: function () {
        if (dead) return;
        if (dirty && canEdit) flushSave();
        dead = true;
        [saveTimer, previewTimer, statusTimer, presTimer].forEach(function (t) { if (t) clearTimeout(t); });
        if (beat) clearInterval(beat);
        unsubs.forEach(function (u) { try { u(); } catch (e) { } });
        if (collab && collab.presence && canEdit && me.uid) collab.presence.doc(me.uid).delete().catch(function () { });
        window.removeEventListener('message', onMessage);
        window.removeEventListener('beforeunload', onLeave);
        document.removeEventListener('fullscreenchange', onFsChange);
        if (isFull()) {
          document.documentElement.classList.remove('cl-noscroll');
          FULL.key = fullKey; FULL.at = Date.now();
          /* Leave the browser's full screen only if no IDE took it back. */
          setTimeout(function () { if (FULL.key === fullKey && !document.querySelector('.cl-shell.cl-full')) { FULL.key = ''; try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { } } }, 600);
        }
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
      '.cl-shell{display:flex;flex-direction:column;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:14px;overflow:hidden;background:#fff;position:relative}',
      '.cl-head{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.4rem .5rem;background:var(--paper,#F1F9F7);border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.cl-brand{display:inline-flex;align-items:center;gap:.35rem;flex:none;padding:.22rem .6rem;border-radius:8px;background:var(--brand-deep,#245F5A);color:#fff;font-size:.74rem;font-weight:800;letter-spacing:.01em;white-space:nowrap}.cl-brand i{color:#F5C842}',
      '@media(max-width:520px){.cl-brand b{display:none}}',
      '.cl-up{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:.25rem;border:1px solid rgba(192,138,0,.45);background:#FFF7E6;color:#8A6200;border-radius:99px;padding:.05rem .45rem;font:inherit;font-size:.62rem;font-weight:800;cursor:pointer}.cl-up:hover{background:#F5C842;color:#3d2c00}.cl-up i{color:inherit!important;width:auto!important;opacity:1!important}',
      '.cl-up + .cl-node-acts{margin-left:.2rem}',
      '.cl-crumb{flex:1;min-width:120px;font-weight:800;font-size:.8rem;color:var(--brand-deep,#245F5A);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cl-crumb i{opacity:.75;margin-right:.2rem}',
      '.cl-actions{display:flex;gap:.25rem;flex-wrap:wrap}',
      '.cl-btn{display:inline-flex;align-items:center;gap:.3rem;padding:.35rem .6rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:8px;background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.72rem;cursor:pointer}',
      '.cl-btn:hover{border-color:var(--brand,#55BFB3);background:var(--sage,#E5F2EF)}',
      '.cl-btn.cl-save{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.cl-btn.cl-run{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.cl-treebtn{display:none}',
      '.cl-shell.cl-full{position:fixed;inset:0;z-index:2000;border-radius:0;border:0}',
      '.cl-dlg{position:fixed;inset:0;z-index:3200;background:rgba(15,26,20,.35);display:grid;place-items:center;padding:16px}',
      '.cl-dlg-box{width:min(420px,100%);background:#fff;border:1px solid #D5E3DF;border-radius:14px;padding:1rem 1.1rem;box-shadow:0 18px 50px rgba(0,0,0,.2);font-family:inherit}',
      '.cl-dlg-box p{margin:0 0 .7rem;font-size:.9rem;font-weight:600;color:#263331;line-height:1.4}',
      '.cl-dlg-box input{width:100%;box-sizing:border-box;padding:.55rem .7rem;border:1px solid #D5E3DF;border-radius:9px;font:13px ui-monospace,Menlo,Consolas,monospace;color:#263331;outline:none}',
      '.cl-dlg-box input:focus{border-color:#55BFB3;box-shadow:0 0 0 3px rgba(85,191,179,.2)}',
      '.cl-dlg-acts{display:flex;justify-content:flex-end;gap:.45rem;margin-top:.8rem}',
      '.cl-shell.cl-full .cl-body,.cl-shell.cl-full .cl-body.cl-stacked{height:auto;flex:1;min-height:0}',
      '.cl-shell:fullscreen{width:100vw;height:100vh;background:#fff}',
      'html.cl-noscroll,html.cl-noscroll body{overflow:hidden}',
      '@media(max-width:860px){.cl-shell.cl-full .cl-body{grid-template-rows:minmax(0,1fr) 40vh}}',
      '.cl-body{display:grid;grid-template-columns:200px minmax(0,1fr) minmax(0,1fr);height:min(72vh,620px);min-height:380px}',
      '.cl-docmode .cl-body{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}',
      '.cl-body.cl-stacked{grid-template-columns:200px minmax(0,1fr);grid-template-rows:1fr 1fr}.cl-body.cl-stacked .cl-tree{grid-row:1 / span 2}',
      '.cl-tree{border-right:1px solid var(--line,rgba(38,51,49,.12));background:#FAFCFB;display:flex;flex-direction:column;min-width:0;overflow:hidden}',
      '.cl-tree-acts{display:flex;gap:.25rem;padding:.4rem;border-bottom:1px solid var(--line,rgba(38,51,49,.08))}',
      '.cl-tree-list{flex:1;overflow:auto;padding:.25rem 0}',
      '.cl-tree-note{padding:.4rem .6rem;font-size:.68rem;color:var(--muted,#5A6E6A);font-weight:600;line-height:1.35}',
      '.cl-node{position:relative;display:flex;align-items:center;gap:.4rem;padding:.3rem .5rem;font-size:.78rem;font-weight:700;color:var(--ink,#263331);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cl-node i{width:14px;text-align:center;color:var(--brand-deep,#245F5A);opacity:.8;flex:none}.cl-dir i{color:#C08A00}.cl-asset i{color:#7048E8}',
      '.cl-node:hover{background:var(--sage,#E5F2EF)}.cl-node.on{background:#DDEFEA;color:var(--brand-deep,#245F5A)}',
      '.cl-node-acts{margin-left:auto;display:none;gap:.1rem}.cl-node:hover .cl-node-acts,.cl-node.on .cl-node-acts{display:inline-flex}',
      '.cl-node-acts button{border:0;background:transparent;padding:.1rem .25rem;cursor:pointer;color:var(--muted,#5A6E6A);font-size:.7rem}.cl-node-acts button:hover{color:var(--brand-deep,#245F5A)}',
      '.cl-edit-wrap{display:flex;flex-direction:column;border-right:1px solid var(--line,rgba(38,51,49,.12));min-width:0;min-height:0}',
      '.cl-edit-host{flex:1;min-height:0;position:relative}',
      '.cl-edit-host .CodeMirror{height:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13.5px;line-height:1.55}',
      '.cl-edit-host .CodeMirror-gutters{background:#F6FAF9;border-right:1px solid #E3EEEB}.cl-edit-host .CodeMirror-activeline-background{background:#F1F9F7}',
      '.cl-fallback{width:100%;height:100%;padding:.8rem 1rem;border:0;outline:none;resize:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;line-height:1.55;background:#fff;color:var(--ink,#263331);tab-size:2;box-sizing:border-box}',
      '.cl-meta{display:flex;justify-content:space-between;gap:.6rem;align-items:center;padding:.3rem .8rem;background:var(--paper,#F1F9F7);border-top:1px solid var(--line,rgba(38,51,49,.12));font-size:.68rem;color:var(--muted,#5A6E6A);font-weight:800}',
      '.cl-status{text-align:right}',
      '.cl-preview-wrap{position:relative;min-width:0;min-height:0;background:#fff;display:flex;flex-direction:column}',
      '.cl-preview{flex:1;width:100%;min-height:200px;border:0;display:block;background:#fff}',
      '.cl-console{border-top:1px solid var(--line,rgba(38,51,49,.12));background:#1E2725;color:#D8E6E2;font-size:.74rem}',
      '.cl-console summary{cursor:pointer;padding:.35rem .7rem;font-weight:800;color:#BFE3DA}',
      '.cl-log{max-height:150px;overflow:auto;padding:0 .7rem .5rem;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '.cl-logrow{padding:.15rem 0;border-bottom:1px solid rgba(255,255,255,.06);white-space:pre-wrap;word-break:break-word}.cl-logrow.error{color:#FF8A80}.cl-logrow.warn{color:#FFD166}',
      '.cl-people{display:flex;gap:.3rem;flex-wrap:wrap}',
      '.cl-person{display:inline-flex;align-items:center;gap:.3rem;padding:.15rem .5rem .15rem .15rem;border-radius:99px;background:#fff;border:1.5px solid var(--c);font-size:.68rem;font-weight:800;color:var(--ink,#263331)}',
      '.cl-person b{width:18px;height:18px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-size:.62rem}',
      '.cl-rcur{position:relative;border-left:2px solid var(--c);margin-left:-1px;height:1.3em;display:inline-block;vertical-align:text-bottom}',
      '.cl-rtag{position:absolute;bottom:100%;left:-2px;background:var(--c);color:#fff;font:700 10px/1.4 sans-serif;padding:0 4px;border-radius:3px 3px 3px 0;white-space:nowrap;pointer-events:none;z-index:5}',
      '.cl-rline{background:rgba(28,126,214,.06)}',
      '.CodeMirror-hints{z-index:1000;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15)}',
      '.CodeMirror-hint-active{background:#245F5A}',
      '.CodeMirror-hint .cl-h-tag{display:inline-block;min-width:4.5em;font-weight:700}.CodeMirror-hint .cl-h-snip{margin-left:.8em;opacity:.6;font-size:11.5px}',
      /* Above the practice pop-up (600) and full screen (2000); CodeMirror's own sheet loads later and sets 10. */
      'body .CodeMirror-hints{z-index:3000!important;max-width:min(460px,90vw)}body .emmet-abbreviation-preview{z-index:3000!important}body li.CodeMirror-hint-active{background:#245F5A!important;color:#fff!important}.CodeMirror-hint{overflow:hidden;text-overflow:ellipsis}',
      '.emmet-abbreviation-preview{z-index:1000;background:#fff;border:1px solid #D5E3DF;border-radius:8px;padding:.4rem .6rem;box-shadow:0 8px 24px rgba(0,0,0,.12);font-size:12px}',
      '@media(max-width:860px){.cl-body,.cl-body.cl-stacked{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(300px,1fr) 300px;height:auto}.cl-docmode .cl-body{grid-template-columns:minmax(0,1fr)}',
      '  .cl-tree{display:none;position:absolute;z-index:20;top:42px;left:0;bottom:0;width:240px;box-shadow:8px 0 24px rgba(0,0,0,.12)}.cl-tree-open .cl-tree{display:flex}.cl-treebtn{display:inline-flex}',
      '  .cl-edit-wrap{border-right:0;border-bottom:1px solid var(--line,rgba(38,51,49,.12));min-height:300px}}',
      '@media(prefers-reduced-motion:reduce){.cl-btn,.cl-node{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  g.CodeLab = { mount: mount, buildPreview: buildPreview, load: load, merge3: merge3, mdHtml: mdHtml, langOf: langOf };
})(window);
