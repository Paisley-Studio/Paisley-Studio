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

   Programs (Nov 2026): Python, Java, C, C++ and PHP files run in a Terminal,
   on the Advanced IDE's engine (js/tech/advanced-ide/ide-runner.js, loaded on
   the first run). A project changes as soon as it holds a program file: a
   Run picker and the Terminal appear (beside the Preview when there is a web
   page too). Input: the page cannot pause a program, so when one asks for
   input the terminal asks the builder and runs it again with every answer so
   far, with the same random seed. Errors get a plain-English tip and a Go to
   line button (PaisleyLangs.explain). Uploaded pictures and sounds are real
   files for the program. Java goes to the runCode function.

   Look: the Paisley IDE palette (Black #05080B, Slate #0E1A24, Cyan #00B4F0,
   White), dark or light (the sun/moon button, kept per browser), a welcome
   that lifts blur-to-sharp when the editor is ready, file tabs, a status bar.

   Never losing work: every change is also kept in localStorage until the save
   lands, saved when the tab is hidden or closed, and offered back ("Bring them
   back") if it never reached the server.

   Uploads: CodeLab.checkUpload reads a file's first bytes; a script renamed
   cat.png, an SVG, or a picture hiding web code is refused before upload
   (functions/upload-guard.js checks again on the server).

   Safety: the preview iframe has allow-scripts only (no allow-same-origin),
   so student code runs in a null origin and cannot reach the page, cookies
   or Firestore. Programs run in the runner's opaque-origin sandbox too.

   CodeLab.mount(host, { build, me, canEdit, onSave(payload) -> Promise,
                         uploadAsset(file) -> Promise<{ url, storagePath }>,
                         collab: { ref, presence, me: { uid, name } },
                         mode: 'code' | 'doc', title, draftKey,
                         advanced(button),     adds an "Advanced IDE" button (Practice uses it)
                         share(body, close) })  adds a Share button; the page fills the sheet it opens
     -> { destroy(), flush() -> Promise, state(), setShare(state), shareBody() }
        setShare('' | 'requested' | 'approved' | 'declined') marks the Share button
   CodeLab.buildPreview(files, active, assets) -> html
   CodeLab.load() -> Promise   (warms the editor libraries)
   CodeLab.checkUpload(file) -> Promise<{ ok, type, reason }>
   CodeLab.starterCode(lang, name), CodeLab.isProgram(file), CodeLab.binaryFiles(assets)
========================================================= */
(function (g) {
  'use strict';

  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var MAX_FILES = 60;
  var MAX_FILE_BYTES = 200 * 1024;
  var MAX_ASSETS = 60;
  var MAX_ASSET_BYTES = 50 * 1024 * 1024;
  var UP_ACCEPT = 'image/*,video/*,audio/*,font/*,.ttf,.otf,.woff,.woff2,.webp,.heic,.mov,.mp4,.mp3,.wav';
  var CODE_ACCEPT = '.html,.htm,.css,.js,.mjs,.json,.md,.txt,.csv,.py,.java,.c,.h,.cpp,.hpp,.cc,.php';
  /* run: the language runs as a program (in the terminal) through the Advanced IDE's sandboxed
     runner (js/tech/advanced-ide/ide-runner.js), loaded the first time a program file appears. */
  var LANGS = {
    html: { label: 'HTML', icon: 'fab fa-html5', color: '#E34F26', mode: 'htmlmixed' },
    css: { label: 'CSS', icon: 'fab fa-css3-alt', color: '#1572B6', mode: 'css' },
    js: { label: 'JavaScript', icon: 'fab fa-js', color: '#E8B90C', mode: 'javascript' },
    json: { label: 'JSON', icon: 'fas fa-code', color: '#C08A00', mode: { name: 'javascript', json: true } },
    md: { label: 'Markdown', icon: 'fab fa-markdown', color: '#5B7385', mode: 'markdown' },
    txt: { label: 'Text', icon: 'fas fa-file-lines', color: '#5B7385', mode: 'text/plain' },
    py: { label: 'Python', icon: 'fab fa-python', color: '#3776AB', mode: 'python', run: 'python' },
    java: { label: 'Java', icon: 'fab fa-java', color: '#E76F00', mode: 'text/x-java', run: 'java' },
    c: { label: 'C', badge: 'C', color: '#5C6BC0', mode: 'text/x-csrc', run: 'c' },
    cpp: { label: 'C++', badge: 'C++', color: '#00599C', mode: 'text/x-c++src', run: 'cpp' },
    php: { label: 'PHP', icon: 'fab fa-php', color: '#777BB4', mode: 'application/x-httpd-php', run: 'php' }
  };
  function isProgram(f) { return !!f && !!(LANGS[f.lang] || {}).run && !/\.(h|hpp|hh|hxx)$/i.test(f.name); }
  /* The language's own icon in its usual colour: HTML orange-red, CSS blue, JavaScript yellow, Python blue. */
  function langIcon(lang) {
    var m = LANGS[lang] || LANGS.txt;
    if (m.badge) return '<span class="cl-li cl-badge" style="--c:' + m.color + '" aria-hidden="true">' + m.badge + '</span>';
    return '<i class="' + m.icon + ' cl-li" style="color:' + m.color + '" aria-hidden="true"></i>';
  }
  var COLORS = ['#E8590C', '#7048E8', '#1C7ED6', '#D6336C', '#2B8A3E', '#F59F00', '#0C8599', '#5F3DC4'];

  function langOf(name) {
    var lower = String(name || '').toLowerCase();
    if (/\.(html?|xhtml)$/.test(lower)) return 'html';
    if (/\.css$/.test(lower)) return 'css';
    if (/\.(js|mjs|jsx)$/.test(lower)) return 'js';
    if (/\.json$/.test(lower)) return 'json';
    if (/\.md$/.test(lower)) return 'md';
    if (/\.py$/.test(lower)) return 'py';
    if (/\.java$/.test(lower)) return 'java';
    if (/\.(c|h)$/.test(lower)) return 'c';
    if (/\.(cpp|cc|cxx|hpp|hh|hxx)$/.test(lower)) return 'cpp';
    if (/\.php$/.test(lower)) return 'php';
    /* Unknown endings (.txt, .csv, data files) open as plain text, never as a web page. */
    return 'txt';
  }
  function defaultFile(lang, name) {
    if (lang === 'html') return { name: name || 'index.html', lang: 'html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>My project</title>\n</head>\n<body>\n  <h1>Hello, studio!</h1>\n</body>\n</html>\n' };
    if (lang === 'css') return { name: name || 'style.css', lang: 'css', content: 'body {\n  font-family: sans-serif;\n  background: #F1F9F7;\n  color: #263331;\n  padding: 2rem;\n}\n' };
    if (lang === 'js') return { name: name || 'script.js', lang: 'js', content: 'console.log("Code Lab is alive");\n' };
    if (lang === 'md') return { name: name || 'notes.md', lang: 'md', content: '# Notes\n\n' };
    if (STARTERS[lang]) return { name: name || STARTER_NAMES[lang], lang: lang, content: starterCode(lang, name || STARTER_NAMES[lang]) };
    return { name: name || 'notes.txt', lang: lang, content: '' };
  }
  /* Every starter runs straight away: press Run and see what it does. */
  var STARTER_NAMES = { py: 'main.py', java: 'Main.java', c: 'main.c', cpp: 'main.cpp', php: 'index.php' };
  var STARTERS = {
    py: 'name = input("What is your name? ")\nprint("Hello, " + name + "! Welcome to Python.")\n',
    java: 'import java.util.Scanner;\n\npublic class %CLASS% {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.print("What is your name? ");\n        String name = in.nextLine();\n        System.out.println("Hello, " + name + "! Welcome to Java.");\n    }\n}\n',
    c: '#include <stdio.h>\n\nint main(void) {\n    char name[50];\n    printf("What is your name? ");\n    scanf("%49s", name);\n    printf("Hello, %s! Welcome to C.\\n", name);\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << "What is your name? ";\n    getline(cin, name);\n    cout << "Hello, " << name << "! Welcome to C++." << endl;\n    return 0;\n}\n',
    php: '<?php\n$name = readline("What is your name? ");\necho "Hello, $name! Welcome to PHP.\\n";\n'
  };
  function starterCode(lang, name) {
    var cls = baseOf(name || '').replace(/\.\w+$/, '').replace(/\W/g, '') || 'Main';
    return String(STARTERS[lang] || '').replace('%CLASS%', cls);
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
  /* What an uploaded file is, by its type or (when the computer gives none) its ending:
     an upload MIME type, 'code' for a file to edit, 'svg' (refused), or '' for anything else. */
  var EXT_TYPES = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
    avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', '3gp': 'video/3gpp', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2'
  };
  function typeOfFile(f) {
    var ext = (/\.(\w+)$/.exec(String(f.name || '').toLowerCase()) || [])[1] || '', t = String(f.type || '').toLowerCase();
    if (ext === 'svg' || /svg/.test(t)) return 'svg';
    if (/^(html?|css|js|mjs|json|md|txt|csv|py|java|c|h|cpp|cc|cxx|hpp|hh|php|in|dat)$/.test(ext)) return 'code';
    if (/^(image|video|audio|font)\//.test(t)) return t;
    return EXT_TYPES[ext] || '';
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ---------------------------------------------------------
     Upload check: a picture must really be a picture.
     The first bytes of a file say what it is, whatever its name
     says. A script renamed cat.png, an SVG (which can carry code),
     or a picture with web code hidden inside is refused before it
     is uploaded. functions/upload-guard.js checks the same again on
     the server and deletes anything that slips through.
     checkUpload(file) -> Promise<{ ok, type, reason }>
     --------------------------------------------------------- */
  var SIGS = [
    ['image/png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], ['image/jpeg', [0xFF, 0xD8, 0xFF]], ['image/gif', 'GIF87a'], ['image/gif', 'GIF89a'],
    ['image/bmp', 'BM'], ['image/x-icon', [0, 0, 1, 0]], ['video/webm', [0x1A, 0x45, 0xDF, 0xA3]], ['audio/ogg', 'OggS'], ['audio/flac', 'fLaC'],
    ['audio/mpeg', 'ID3'], ['font/woff', 'wOFF'], ['font/woff2', 'wOF2'], ['font/otf', 'OTTO'], ['font/ttf', [0, 1, 0, 0]], ['font/ttf', 'true']
  ];
  function ascii(b, from, to) { var s = ''; for (var i = from; i < to && i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
  function startsWith(b, sig, at) {
    at = at || 0;
    var arr = typeof sig === 'string' ? sig.split('').map(function (c) { return c.charCodeAt(0); }) : sig;
    for (var i = 0; i < arr.length; i++) if (b[at + i] !== arr[i]) return false;
    return true;
  }
  function sniffBytes(b) {
    for (var i = 0; i < SIGS.length; i++) if (startsWith(b, SIGS[i][1])) return SIGS[i][0];
    if (startsWith(b, 'RIFF')) { var k = ascii(b, 8, 12); if (k === 'WEBP') return 'image/webp'; if (k === 'WAVE') return 'audio/wav'; if (k === 'AVI ') return 'video/x-msvideo'; }
    if (ascii(b, 4, 8) === 'ftyp') {
      var brand = ascii(b, 8, 12).toLowerCase();
      if (/^avi[fs]/.test(brand)) return 'image/avif';
      if (/^(hei[cxms]|hev[cxms]|mif1|msf1)/.test(brand)) return 'image/heic';
      if (/^(m4a|m4b|f4a)/.test(brand)) return 'audio/mp4';
      if (/^qt/.test(brand)) return 'video/quicktime';
      if (/^3g/.test(brand)) return 'video/3gpp';
      return 'video/mp4';
    }
    if (b[0] === 0xFF && (b[1] & 0xF6) === 0xF0) return 'audio/aac';
    if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return 'audio/mpeg';
    return '';
  }
  /* Web code hidden in a file (a "polyglot"): refused whatever the file looks like at the start. */
  var HIDDEN_CODE = /<script|<\?php|<html|<iframe|<svg|<object|<embed|javascript:/i;
  function kindWord(t) { return { image: 'a picture', video: 'a video', audio: 'a sound', font: 'a font' }[String(t).split('/')[0]] || 'something else'; }
  function readHead(f, n) {
    var part = f.slice ? f.slice(0, n) : f;
    if (part.arrayBuffer) return part.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    return new Promise(function (res, rej) { var rd = new FileReader(); rd.onload = function () { res(new Uint8Array(rd.result)); }; rd.onerror = function () { rej(rd.error); }; rd.readAsArrayBuffer(part); });
  }
  function checkUpload(f) {
    var claimed = typeOfFile(f);
    if (claimed === 'svg') return Promise.resolve({ ok: false, reason: f.name + ': SVG pictures can carry code, so they cannot be uploaded. Save it as PNG or JPG and try again.' });
    return readHead(f, 65536).then(function (b) {
      var found = sniffBytes(b);
      if (!found) return { ok: false, reason: f.name + ' is not a real picture, video, sound or font (what is inside does not match its name), so it was not uploaded.' };
      var fk = found.split('/')[0], ck = claimed ? claimed.split('/')[0] : '';
      /* mp4, webm and ogg hold sound or video, so either name is honest. */
      var av = /^(audio|video)$/.test(fk) && /^(audio|video)$/.test(ck) && /(mp4|webm|ogg|quicktime|3gpp|matroska|x-m4a)/.test(found + ' ' + claimed);
      if (ck && ck !== fk && !av) return { ok: false, reason: f.name + ' is named like ' + kindWord(claimed) + ' but it is really ' + kindWord(found) + '. Upload the real file.' };
      var text = ''; for (var i = 0; i < b.length; i += 8192) text += String.fromCharCode.apply(null, b.subarray(i, Math.min(b.length, i + 8192)));
      if (HIDDEN_CODE.test(text)) return { ok: false, reason: f.name + ' has web code hidden inside it, so it was not uploaded.' };
      return { ok: true, type: ck === fk && claimed ? claimed : (av && claimed ? claimed : found) };
    }, function () { return { ok: false, reason: 'Could not read ' + f.name + '.' }; });
  }

  /* ---------------------------------------------------------
     Libraries (lazy)
     --------------------------------------------------------- */
  var CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
  var EMMET_URL = 'https://cdn.jsdelivr.net/npm/@emmetio/codemirror-plugin@1.2.4/dist/browser.min.js';
  var CM_SCRIPTS = [
    ['mode/xml/xml.min.js', 'mode/javascript/javascript.min.js', 'mode/css/css.min.js', 'mode/markdown/markdown.min.js',
      'mode/python/python.min.js', 'mode/clike/clike.min.js',
      'addon/hint/show-hint.min.js', 'addon/edit/closetag.min.js', 'addon/edit/closebrackets.min.js', 'addon/edit/matchbrackets.min.js',
      'addon/fold/xml-fold.min.js', 'addon/selection/active-line.min.js', 'addon/comment/comment.min.js', 'addon/search/searchcursor.min.js'],
    ['mode/htmlmixed/htmlmixed.min.js', 'addon/hint/xml-hint.min.js', 'addon/hint/css-hint.min.js', 'addon/hint/javascript-hint.min.js', 'addon/hint/anyword-hint.min.js', 'addon/edit/matchtags.min.js'],
    ['addon/hint/html-hint.min.js', 'mode/php/php.min.js']
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

  /* ---------------------------------------------------------
     Running programs (Python, Java, C, C++, PHP)
     The same engine as the Advanced IDE: a sandboxed, opaque-origin
     iframe whose workers run Pyodide, Clang/WASI and php-wasm; Java
     goes to the runCode function. One runner per page, shared by
     every IDE on it, loaded the first time a program runs.
     --------------------------------------------------------- */
  var RUNTIME_JS = ['/js/tech/advanced-ide/ide-langs.js?v=3', '/js/tech/advanced-ide/ide-runner.js?v=3'];
  var runtimeP = null, RUNNER = null, RUN_LISTENERS = [];
  function loadRuntime() {
    if (runtimeP) return runtimeP;
    runtimeP = (g.PaisleyLangs ? Promise.resolve() : loadScript(RUNTIME_JS[0]))
      .then(function () { return g.PaisleyRunner ? null : loadScript(RUNTIME_JS[1]); })
      .then(function () {
        if (!RUNNER) RUNNER = g.PaisleyRunner.create({ onProgress: function (lang, info) { RUN_LISTENERS.slice().forEach(function (fn) { try { fn(lang, info); } catch (e) { } }); } });
        return RUNNER;
      })
      .catch(function (e) { runtimeP = null; throw e; });
    return runtimeP;
  }
  /* Uploaded pictures and sounds become real files for the program (open("images/cat.png", "rb")). */
  var BIN_CACHE = {};
  function binaryFiles(list) {
    var total = 0;
    var want = (list || []).filter(function (a) {
      if (!a || !/^https:\/\//.test(a.url || '') || !/^(image|audio)\//.test(a.type || '') || (a.size || 0) > 8 * 1048576) return false;
      total += a.size || 0; return total <= 24 * 1048576;
    });
    return Promise.all(want.map(function (a) {
      var p = BIN_CACHE[a.url] || (BIN_CACHE[a.url] = fetch(a.url, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).catch(function (e) { delete BIN_CACHE[a.url]; throw e; }));
      return p.then(function (buf) { return { name: a.name, binary: true, bytes: new Uint8Array(buf.slice(0)) }; }, function () { return null; });
    })).then(function (r) { return r.filter(Boolean); });
  }
  /* Words offered as you type in each program language, on top of the words already in the file. */
  var PROG_WORDS = {
    py: 'print input len range int str float bool list dict set tuple def return if elif else for while in not and or import from as class self True False None try except finally raise with lambda pass break continue global append extend insert remove pop sort sorted reverse keys values items get split join strip lower upper replace format enumerate zip min max sum abs round open read write readlines random randint choice shuffle uniform math sqrt floor ceil pi time sleep isdigit isalpha startswith endswith find count __name__ __main__',
    java: 'public private protected static void main String System.out.println System.out.print System.out.printf class int double boolean char long float new return if else for while do switch case default break continue Scanner nextInt nextLine next nextDouble hasNextLine ArrayList HashMap import java.util.Scanner java.util.ArrayList java.util.HashMap java.util.Random length size add get put remove contains equals charAt substring toUpperCase toLowerCase Math.random Math.max Math.min Math.abs Math.pow Math.sqrt Integer.parseInt Double.parseDouble this extends implements interface try catch finally throw throws null true false final',
    c: '#include stdio.h stdlib.h string.h math.h time.h printf scanf fgets puts putchar getchar int main void return char float double long short unsigned const if else for while do switch case default break continue struct typedef sizeof malloc calloc free strlen strcpy strcat strcmp NULL rand srand time sqrt pow abs',
    cpp: '#include iostream string vector map set algorithm cmath using namespace std cout cin endl getline string vector push_back pop_back size empty begin end sort auto int main void return char float double long bool true false const if else for while do switch case break continue class struct public private protected new delete nullptr this rand srand time sqrt pow abs',
    php: 'echo print function return if elseif else foreach for while do switch case break continue as array count strlen strtoupper strtolower str_replace explode implode trim isset empty unset true false null class new public private protected static readline fgets STDIN intval floatval rand mt_rand date in_array array_push array_keys json_encode json_decode printf sprintf'
  };
  PROG_WORDS.c = PROG_WORDS.c.split(' '); PROG_WORDS.cpp = PROG_WORDS.cpp.split(' '); PROG_WORDS.py = PROG_WORDS.py.split(' '); PROG_WORDS.java = PROG_WORDS.java.split(' '); PROG_WORDS.php = PROG_WORDS.php.split(' ');

  /* ---------------------------------------------------------
     Look: the Paisley IDE palette, dark or light, kept per browser.
     Black #05080B base, Slate #0E1A24 depth, Cyan #00B4F0 accent,
     White for text and the light theme.
     --------------------------------------------------------- */
  var THEME_KEY = 'pz-cl-theme';
  function readTheme() { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
    document.documentElement.setAttribute('data-cl-theme', t);
    [].forEach.call(document.querySelectorAll('.cl-shell'), function (s) { s.setAttribute('data-theme', t); });
    [].forEach.call(document.querySelectorAll('[data-clcmd="theme"]'), function (b) { themeButton(b, t); });
  }
  function themeButton(b, t) { b.innerHTML = '<i class="fas fa-' + (t === 'light' ? 'moon' : 'sun') + '"></i>'; b.title = t === 'light' ? 'Dark mode' : 'Light mode'; b.setAttribute('aria-label', b.title); }
  /* The opening: the first IDE on a page gets the full welcome, later ones a short fade. */
  var WELCOMED = false;
  var REDUCED = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function msOf(ts) { if (!ts) return 0; if (typeof ts === 'number') return ts; if (ts.toMillis) return ts.toMillis(); if (ts.seconds) return ts.seconds * 1000; return +new Date(ts) || 0; }

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
  /* project(word) -> [{ name, snip, label, lang }]: the project's own files offered first
     (link style.css, script game.js, a about.html, img images/cat.png), with their real paths. */
  function tagHint(ed, project) {
    var cur = ed.getCursor(), line = ed.getLine(cur.line), end = cur.ch, start = end;
    while (start && /[\w!]/.test(line.charAt(start - 1))) start--;
    var word = line.slice(start, end), before = line.slice(0, start);
    if (!word || !(/^\s*$/.test(before) || /<[^<>]*>\s*$/.test(before))) return null;
    if (/\w/.test(line.charAt(end))) return null;   /* in the middle of a word */
    var CMg = g.CodeMirror, from = CMg.Pos(cur.line, start), to = CMg.Pos(cur.line, end), list;
    function item(name, snip, label, lang) {
      return {
        text: name, snip: snip,
        render: function (el) { el.innerHTML = (lang ? langIcon(lang).replace('cl-li', 'cl-li cl-h-ic') : '') + '<b class="cl-h-tag">' + esc(label || name) + '</b><span class="cl-h-snip">' + esc(snip.replace('|', '').replace(/\n\s*/g, ' ')) + '</span>'; },
        hint: function (cm, data, c) { putSnippet(cm, data.from, data.to, c.snip); }
      };
    }
    if (word.charAt(0) === '!') list = word === '!' ? [item('!', PAGE_SNIP, '! whole page')] : [];
    else {
      var w = word.toLowerCase();
      list = (project ? project(w) : []).map(function (p) { return item(p.name, p.snip, p.label, p.lang); })
        .concat(TAG_SNIPS.filter(function (t) { return t[0].indexOf(w) === 0; }).map(function (t) { return item(t[0], t[1], t[2]); }));
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
    var byName = {}, byLower = {}, byBase = {};
    files.forEach(function (f) {
      byName[f.name] = f; byLower[f.name.toLowerCase()] = f;
      var b = baseOf(f.name).toLowerCase(); byBase[b] = byBase[b] ? 'many' : f;
    });
    /* The file a link points to. Forgiving like a teacher, not a browser: a different
       capital letter, or the file sitting in another folder (when only one has that name), still works. */
    function find(p, lang) {
      if (p == null) return null;
      var f = byName[p] || byLower[p.toLowerCase()];
      if (!f) { var b = byBase[baseOf(p).toLowerCase()]; if (b && b !== 'many') f = b; }
      return f && (!lang || f.lang === lang) ? f : null;
    }
    var missing = [];
    function local(u) { return !!u && !/^([a-z]+:|\/\/|#|data:|blob:)/i.test(String(u).trim()); }
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
    out = out.replace(/<link\b[^>]*>/gi, function (m) {
      var hm = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m); if (!hm) return m;
      var rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(m), href = hm[1];
      if (rel && !/stylesheet/i.test(rel[1])) return m;
      var f = find(resolve(href, here), 'css');
      if (f) return '<style data-file="' + esc(f.name) + '">\n' + cssFix(f.content, dirOf(f.name)) + '\n</style>';
      if (local(href)) missing.push(href);
      return m;
    });
    /* A script linked in <head> would run before the page exists (getElementById finds nothing),
       so it waits for the page, like defer. It loads from a data: link so that defer works. */
    var headEnd = out.search(/<\/head>|<body[\s>]/i);
    out = out.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function (m, a, src, b, at) {
      var f = find(resolve(src, here), 'js');
      if (!f) { if (local(src)) missing.push(src); return m; }
      var attrs = (a + ' ' + b).replace(/\s+/g, ' ').trim(), code = jsFix(f.content);
      var inHead = headEnd !== -1 && at < headEnd && !/\b(defer|async)\b|type\s*=\s*["']module/i.test(attrs);
      if (inHead) return '<script' + (attrs ? ' ' + attrs : '') + ' defer data-file="' + esc(f.name) + '" src="data:text/javascript;charset=utf-8,' + encodeURIComponent(code + '\n//# sourceURL=' + f.name) + '"><\/script>';
      return '<script' + (attrs ? ' ' + attrs : '') + ' data-file="' + esc(f.name) + '">\n' + code.replace(/<\/script/gi, '<\\/script') + '\n//# sourceURL=' + f.name + '\n<\/script>';
    });
    out = out.replace(/\b(src|href|poster|data)\s*=\s*(["'])([^"']+)\2/gi, function (m, attr, q, u) {
      var p = resolve(u, here); return p && assetUrl[p] ? attr + '=' + q + assetUrl[p] + q : m;
    });
    out = out.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, function (m, a, body) { return '<style' + a + '>' + cssFix(body, here) + '</style>'; });
    out = out.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, function (m, a, body, c) { return a + jsFix(body) + c; });
    out = out.replace(/\bstyle\s*=\s*"([^"]*url\([^"]*)"/gi, function (m, body) { return 'style="' + cssFix(body, here).replace(/"/g, "'") + '"'; });
    var warn = missing.length ? '<script>' + missing.map(function (h) { return 'console.warn(' + JSON.stringify('Could not find "' + h + '" in this project. Check the file name and its folder.').replace(/</g, '\\u003c') + ');'; }).join('') + '<\/script>' : '';
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, function (m) { return m + HARNESS + warn; });
    else out = HARNESS + warn + out;
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
  var MOUNTS = 0;
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

    function upAccept() { return (opts.uploadAsset ? UP_ACCEPT + ',' : '') + CODE_ACCEPT; }
    var theme = readTheme();
    document.documentElement.setAttribute('data-cl-theme', theme);
    var cinematic = !WELCOMED && !docMode && !REDUCED; WELCOMED = true;
    hostEl.innerHTML =
      '<div class="cl-shell cl-booting' + (docMode ? ' cl-docmode' : '') + (cinematic ? ' cl-cine' : '') + '" data-theme="' + theme + '">' +
        /* The welcome: painted at once, lifted when the editor is ready (blur to sharp, like the Advanced IDE). */
        '<div class="cl-splash" aria-hidden="true"><div class="cl-sp-in">' +
          '<div class="cl-sp-logo"><i class="fas fa-code"></i></div>' +
          '<div class="cl-sp-k">Paisley Tech Studio</div>' +
          '<div class="cl-sp-t"><span>Paisley</span> <span class="ac">VS Code</span></div>' +
          '<div class="cl-sp-s">Your ideas. Your code. Let’s build.</div>' +
          '<div class="cl-sp-bar"><i></i></div><div class="cl-sp-l">Opening the editor</div></div></div>' +
        '<div class="cl-head">' +
          (docMode ? '' : '<button type="button" class="cl-btn cl-treebtn" data-clcmd="tree" title="Files" aria-label="Show files"><i class="fas fa-folder-tree"></i></button>') +
          (docMode ? '' : '<span class="cl-brand" title="Paisley VS Code"><span class="lg"><i class="fas fa-code"></i></span><b>Paisley <span>VS Code</span></b></span>') +
          '<div class="cl-crumb" aria-live="polite"></div>' +
          '<div class="cl-people" aria-label="Who is here"></div>' +
          '<div class="cl-actions">' +
            /* Only where the page asks for it (Practice): opens the Advanced Paisley IDE. */
            (typeof opts.advanced === 'function' && !docMode && g.PaisleyIDEEntry ? g.PaisleyIDEEntry.button({ compact: true, label: 'Advanced IDE' }).replace(' data-advanced-ide', ' data-clcmd="advanced"') : '') +
            (docMode ? '' : '<button type="button" class="cl-btn cl-icon" data-clcmd="layout" title="Side by side / stacked" aria-label="Change layout"><i class="fas fa-table-columns"></i></button>') +
            /* Where the page asks for it (class work, practice): ask to publish, then copy the link. */
            (typeof opts.share === 'function' ? '<button type="button" class="cl-btn cl-sharebtn" data-clcmd="share" title="Share your work: ask to publish, then copy the link"><i class="fas fa-globe"></i> <span>Share</span></button>' : '') +
            '<button type="button" class="cl-btn cl-icon" data-clcmd="theme"></button>' +
            '<button type="button" class="cl-btn cl-icon cl-fullbtn" data-clcmd="full" title="Full screen" aria-label="Full screen" aria-pressed="false"><i class="fas fa-expand"></i></button>' +
            (canEdit && !collab ? '<button type="button" class="cl-btn cl-save" data-clcmd="save"><i class="fas fa-floppy-disk"></i> Save</button>' : '') +
            /* What Run starts: the file you are looking at; the picker opens another one. */
            (docMode ? '' : '<label class="cl-runwrap" hidden title="What Run starts"><i class="fas fa-file-code"></i><select class="cl-runsel" aria-label="File to run"></select></label>') +
            '<button type="button" class="cl-btn cl-stop" data-clcmd="stop" title="Stop" hidden><i class="fas fa-stop"></i> Stop</button>' +
            '<button type="button" class="cl-btn cl-run" data-clcmd="run" title="Run (Ctrl+Enter)" aria-label="Run"><i class="fas fa-play"></i> Run</button>' +
          '</div>' +
        '</div>' +
        '<div class="cl-body">' +
          (docMode ? '' : '<aside class="cl-tree" aria-label="Project files"><div class="cl-tree-h">Explorer</div><div class="cl-tree-acts">' +
            (canEdit ? '<button type="button" class="cl-btn" data-clcmd="add" title="New file: main.py, about.html, style.css, game.js"><i class="fas fa-file-circle-plus"></i> File</button>' +
              '<button type="button" class="cl-btn" data-clcmd="folder" title="New folder, for example images or videos"><i class="fas fa-folder-plus"></i> Folder</button>' +
              '<label class="cl-btn cl-uplabel" title="' + (opts.uploadAsset ? 'Upload pictures, videos, sounds or code files from your device' : 'Upload code files from your device') + '" style="margin:0" tabindex="0" role="button"><i class="fas fa-upload"></i> Upload<input type="file" class="cl-upin" multiple hidden accept="' + upAccept() + '"></label>' : '') +
            '</div><div class="cl-tree-list"></div><div class="cl-tree-note"></div></aside>') +
          '<div class="cl-edit-wrap">' + (docMode ? '' : '<div class="cl-tabs" role="tablist" aria-label="Open files"></div>') + '<div class="cl-banner" role="status" hidden></div><div class="cl-suggest" role="status" hidden></div><div class="cl-edit-host"><textarea class="cl-fallback" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"' + (canEdit ? '' : ' readonly') + ' aria-label="Code"></textarea></div>' +
            '<div class="cl-meta"><span class="cl-lang"></span><span class="cl-status" role="status"></span></div></div>' +
          '<div class="cl-preview-wrap">' +
            (docMode ? '' : '<div class="cl-otabs" role="tablist" hidden><button type="button" class="cl-otab" data-clcmd="otab" data-o="term" role="tab"><i class="fas fa-terminal"></i> Terminal</button><button type="button" class="cl-otab" data-clcmd="otab" data-o="prev" role="tab"><i class="fas fa-display"></i> Preview</button></div>') +
            '<div class="cl-prevpane"><iframe class="cl-preview" sandbox="allow-scripts allow-modals" referrerpolicy="no-referrer" title="Live preview"></iframe>' +
            (docMode ? '' : '<details class="cl-console"><summary><i class="fas fa-terminal"></i> Console <span class="cl-count"></span></summary><div class="cl-log"></div></details>') + '</div>' +
            (docMode ? '' : '<div class="cl-termpane" hidden><div class="cl-term" tabindex="0" aria-live="polite" aria-label="Program output"></div>' +
              '<form class="cl-inrow" hidden><label class="cl-inq" for="clIn' + (++MOUNTS) + '"><i class="fas fa-keyboard"></i> Your program is waiting for you. Type your answer and press Enter.</label>' +
              '<div class="cl-inline"><i class="fas fa-chevron-right"></i><input id="clIn' + MOUNTS + '" class="cl-in" autocomplete="off" spellcheck="false"><button type="submit" class="cl-btn cl-run">Send</button></div></form></div>') +
          '</div>' +
        '</div>' +
      '</div>';

    var q = function (s) { return hostEl.querySelector(s); };
    var crumbEl = q('.cl-crumb'), langEl = q('.cl-lang'), statusEl = q('.cl-status'), frame = q('.cl-preview'), bodyEl = q('.cl-body'),
      treeEl = q('.cl-tree-list'), peopleEl = q('.cl-people'), logEl = q('.cl-log'), countEl = q('.cl-count'), fallback = q('.cl-fallback'),
      tabsEl = q('.cl-tabs'), termEl = q('.cl-term'), bannerEl = q('.cl-banner');
    themeButton(q('[data-clcmd="theme"]'), theme);
    var cm = null, docs = {}, applying = false;
    var openTabs = [];

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
          return '<div class="cl-node cl-dir' + (curFolder === x ? ' on' : '') + '" style="' + pad + '" data-dir="' + esc(x) + '"><i class="fas fa-folder' + (open ? '-open' : '') + '"></i> <span class="cl-dn">' + esc(baseOf(x)) + '</span>' +
            (canEdit && opts.uploadAsset ? '<button type="button" class="cl-up" data-clnode="upto" data-p="' + esc(x) + '" title="Upload ' + esc(pickWord(x)) + ' from your computer into ' + esc(x) + '/" aria-label="Upload into ' + esc(x) + '"><i class="fas fa-upload"></i> Upload</button>' : '') +
            (canEdit ? '<span class="cl-node-acts"><button type="button" data-clnode="newin" data-p="' + esc(x) + '" title="New file here" aria-label="New file in ' + esc(x) + '"><i class="fas fa-plus"></i></button><button type="button" data-clnode="renamedir" data-p="' + esc(x) + '" title="Rename folder" aria-label="Rename folder ' + esc(x) + '"><i class="fas fa-pen"></i></button><button type="button" data-clnode="deldir" data-p="' + esc(x) + '" title="Delete folder" aria-label="Delete folder ' + esc(x) + '"><i class="fas fa-trash"></i></button></span>' : '') + '</div>' +
            (open ? itemsIn(x) : '');
        }).join('') + fs.map(function (f) {
          return '<div class="cl-node cl-file' + (f.name === activeName ? ' on' : '') + '" style="' + pad + '" data-file="' + esc(f.name) + '"' + (canEdit ? ' title="Double-click to rename"' : '') + '>' + langIcon(f.lang) + ' <span class="cl-dn">' + esc(baseOf(f.name)) + '</span>' +
            (canEdit ? '<span class="cl-node-acts"><button type="button" data-clnode="rename" data-p="' + esc(f.name) + '" title="Rename or move" aria-label="Rename ' + esc(f.name) + '"><i class="fas fa-pen"></i></button><button type="button" data-clnode="del" data-p="' + esc(f.name) + '" title="Delete" aria-label="Delete ' + esc(f.name) + '"><i class="fas fa-trash"></i></button></span>' : '') + '</div>';
        }).join('') + as.map(function (a) {
          var ic = /^image\//.test(a.type) ? 'fa-image' : /^video\//.test(a.type) ? 'fa-film' : /^audio\//.test(a.type) ? 'fa-music' : 'fa-file';
          return '<div class="cl-node cl-asset" style="' + pad + '" data-asset="' + esc(a.name) + '" title="Click to use it in your code"><i class="fas ' + ic + '"></i> <span class="cl-dn">' + esc(baseOf(a.name)) + '</span>' +
            '<span class="cl-node-acts"><button type="button" data-clnode="useasset" data-p="' + esc(a.name) + '" title="Insert into code" aria-label="Insert ' + esc(a.name) + '"><i class="fas fa-code"></i></button>' +
            (canEdit ? '<button type="button" data-clnode="renameasset" data-p="' + esc(a.name) + '" title="Rename or move" aria-label="Rename ' + esc(a.name) + '"><i class="fas fa-pen"></i></button><button type="button" data-clnode="delasset" data-p="' + esc(a.name) + '" title="Delete" aria-label="Delete ' + esc(a.name) + '"><i class="fas fa-trash"></i></button>' : '') + '</span></div>';
        }).join('');
      }
      treeEl.innerHTML = '<div class="cl-node cl-dir cl-root' + (curFolder === '' ? ' on' : '') + '" data-dir=""><i class="fas fa-box-archive"></i> ' + esc(opts.title || 'My project') + '</div>' + itemsIn('');
      var n = q('.cl-tree-note'); if (n) n.textContent = assets.length ? 'Click a picture or video to put it in your code.' : (opts.uploadAsset && canEdit ? 'Make a folder (for example images or videos), press its Upload button and pick files from your device. You can also drag files here.' : (canEdit ? 'Upload or drag code files here: HTML, CSS, JavaScript, Python, Java, C, C++ or PHP.' : ''));
    }
    function renderCrumb() {
      var f = activeFile();
      crumbEl.innerHTML = f ? langIcon(f.lang) + ' ' + esc(f.name) : '';
      langEl.textContent = f ? (LANGS[f.lang] || LANGS.txt).label + (cm && canEdit ? (f.lang === 'html' ? ' · Type a tag (d → div), Enter or Tab writes it' : '') + ' · Ctrl+Space for suggestions' + (f.lang === 'html' || f.lang === 'css' ? ' · Emmet: ul>li*3 then Tab' : '') + (isProgram(f) ? ' · Ctrl+Enter runs it' : '') : '') : '';
      renderTabs(); syncRunUi();
    }
    /* Open files as tabs above the editor, like VS Code. */
    function renderTabs() {
      if (!tabsEl) return;
      if (openTabs.indexOf(activeName) === -1 && file(activeName)) openTabs.push(activeName);
      openTabs = openTabs.filter(function (n, i) { return file(n) && openTabs.indexOf(n) === i; });
      tabsEl.innerHTML = openTabs.map(function (n) {
        var f = file(n);
        return '<button type="button" class="cl-tab' + (n === activeName ? ' on' : '') + '" role="tab" aria-selected="' + (n === activeName) + '" data-file="' + esc(n) + '" title="' + esc(n) + '">' + langIcon(f.lang) + '<span>' + esc(baseOf(n)) + '</span>' +
          (openTabs.length > 1 ? '<span class="x" data-clnode="closetab" data-p="' + esc(n) + '" role="button" aria-label="Close ' + esc(n) + '"><i class="fas fa-xmark"></i></span>' : '') + '</button>';
      }).join('');
      var on = tabsEl.querySelector('.cl-tab.on'); if (on && on.scrollIntoView) try { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
    }
    function closeTab(n) {
      var i = openTabs.indexOf(n); if (i === -1 || openTabs.length < 2) return;
      openTabs.splice(i, 1);
      if (activeName === n) { activeName = openTabs[Math.min(i, openTabs.length - 1)]; loadActive(); } else renderTabs();
    }
    function retab(from, to) { openTabs = openTabs.map(function (n) { return n === from ? to : n; }); }

    /* ---------- editor ---------- */
    function cmMode(f) { return (LANGS[f.lang] || LANGS.txt).mode; }
    function docFor(f) {
      if (!docs[f.name]) docs[f.name] = g.CodeMirror.Doc(f.content, cmMode(f));
      return docs[f.name];
    }
    function loadActive() {
      var f = activeFile(); if (!f) return;
      if (cm) {
        applying = true; cm.swapDoc(docFor(f)); applying = false; cm.setOption('readOnly', canEdit ? false : 'nocursor');
        /* Python, Java, C, C++ and PHP are written with four spaces; web files with two. */
        var four = !!(LANGS[f.lang] || {}).run; cm.setOption('indentUnit', four ? 4 : 2); cm.setOption('tabSize', four ? 4 : 2);
      }
      else { fallback.value = f.content; fallback.scrollTop = 0; }
      renderTree(); renderCrumb(); paintRemoteCursors(); schedulePreview();
      if (!docMode) warmFor(f);
    }
    /* Suggestions must sit inside the IDE while it is full screen, or the browser hides them. */
    function hintBox() { var sh = hostEl.querySelector('.cl-shell'); return sh && sh.classList.contains('cl-full') ? sh : document.body; }
    function smartHint(ed, o) {
      var CMg = g.CodeMirror, cur = ed.getCursor(), tok = ed.getTokenAt(cur);
      var inner = CMg.innerMode(ed.getMode(), tok.state).mode.name, r = null;
      try {
        if ((r = pathHint(ed))) return r;
        if (inner === 'xml' && !/tag|attribute|string|comment/.test(tok.type || '') && (r = tagHint(ed, projectItems))) return r;
        var lang = (activeFile() || {}).lang;
        if (PROG_WORDS[lang] && inner !== 'xml' && inner !== 'css' && inner !== 'javascript') r = jsHint(ed, PROG_WORDS[lang]);
        else if (inner === 'xml' && CMg.hint.html) r = CMg.hint.html(ed, o);
        else if (inner === 'css' && CMg.hint.css) r = CMg.hint.css(ed, o);
        else if (inner === 'javascript') r = jsHint(ed);
      } catch (e) { r = null; }
      if (!r || !r.list || !r.list.length) r = CMg.hint.anyword ? CMg.hint.anyword(ed, o) : null;
      return r;
    }
    function jsHint(ed, words) {
      var cur = ed.getCursor(), line = ed.getLine(cur.line), end = cur.ch, start = end;
      while (start && /[\w$.#]/.test(line.charAt(start - 1))) start--;
      var word = line.slice(start, end); if (!word) return null;
      var seen = {}, list = [];
      var own = (ed.getValue().match(/[A-Za-z_$][\w$]{2,}/g) || []);
      (words || JS_WORDS).concat(own).forEach(function (w) { if (!seen[w] && w !== word && w.toLowerCase().indexOf(word.toLowerCase()) === 0) { seen[w] = 1; list.push(w); } });
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
      var typed = ch.text.join(''); if (typed.length !== 1 && typed !== '""' && typed !== "''" && typed !== '()') return;
      if (/^[\w.\/\-"'()]+$/.test(typed) && pathHint(ed)) { ed.showHint({ hint: smartHint, container: hintBox(), completeSingle: false, closeCharacters: /["'()\s>]/ }); return; }
      if (typed.length !== 1) return;
      var lang = (activeFile() || {}).lang;
      var tok = ed.getTokenAt(ed.getCursor()), inner = g.CodeMirror.innerMode(ed.getMode(), tok.state).mode.name;
      var go = false;
      if (inner === 'xml') go = (/[\w!]/.test(typed) && !/tag|attribute|string|comment/.test(tok.type || '') && !!tagHint(ed, projectItems)) || typed === '<' || (typed === ' ' && /^<\w/.test(ed.getLine(ed.getCursor().line).slice(0, ed.getCursor().ch).split('>').pop() || '')) || (/\w/.test(typed) && /tag|attribute/.test(tok.type || ''));
      else if (inner === 'css') go = /[\w-]/.test(typed) && !/comment/.test(tok.type || '');
      else if (inner === 'javascript' || lang === 'js') go = /[\w.$]/.test(typed) && !/comment|string/.test(tok.type || '');
      else if (PROG_WORDS[lang]) go = /[\w.$#]/.test(typed) && !/comment|string/.test(tok.type || '') && !!jsHint(ed, PROG_WORDS[lang]) && jsHint(ed, PROG_WORDS[lang]).list.length > 0;
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
      writeDraft();
      schedulePreview();
    }
    /* Work is never lost: every change is also kept in this browser until the save lands, and
       offered back on the next visit if it never did (offline, the tab closed mid-save). */
    var draftKey = canEdit && !collab && (opts.draftKey || build.id) ? 'pz-cl-draft-' + (opts.draftKey || build.id) : '', draftTimer = null;
    function simpleFiles() { return files.map(function (f) { return { name: f.name, lang: f.lang, content: f.content }; }); }
    function writeDraft() {
      if (!draftKey) return;
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(function () { draftTimer = null; if (dirty) lsSet(draftKey, { at: Date.now(), files: simpleFiles(), folders: folders.slice(), active: activeName }); }, 400);
    }
    function clearDraft() { if (!draftKey) return; if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } lsSet(draftKey, null); }
    function offerDraft() {
      if (!draftKey || !bannerEl) return;
      var d = lsGet(draftKey);
      if (!d || !Array.isArray(d.files) || !d.files.length) return;
      if (JSON.stringify(d.files) === JSON.stringify(simpleFiles()) || (d.at || 0) <= msOf(build.codeAt || build.updatedAt)) { clearDraft(); return; }
      var mins = Math.max(1, Math.round((Date.now() - d.at) / 60000));
      bannerEl.innerHTML = '<i class="fas fa-clock-rotate-left"></i><span>You have changes from ' + (mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h') + ' ago that did not reach the server.</span>' +
        '<button type="button" class="cl-btn cl-run" data-cldraft="1">Bring them back</button><button type="button" class="cl-btn" data-cldraft="0">Discard</button>';
      bannerEl.hidden = false;
      bannerEl.onclick = function (e) {
        var b = e.target.closest('[data-cldraft]'); if (!b) return;
        bannerEl.hidden = true;
        if (b.dataset.cldraft !== '1') { clearDraft(); return; }
        files = d.files.map(function (f) { var n = cleanName(f.name) || 'untitled.txt'; return { name: n, lang: f.lang || langOf(n), content: String(f.content || '') }; });
        folders = (d.folders || folders).map(cleanName).filter(Boolean);
        docs = {}; activeName = file(d.active) ? d.active : files[0].name; openTabs = [activeName];
        loadActive(); dirty = true; flushSave();
        setStatus('Your changes are back.', 'ok');
      };
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
        if (!dirty) clearDraft();
        setStatus(collab ? 'Saved for everyone' : 'Saved', 'ok');
      }).catch(function (e) {
        saving = false; dirty = true; pending = null;
        writeDraft();
        setStatus('Not saved: ' + ((e && e.message) || e) + '. Your work is kept in this browser. Retrying…', 'err', true);
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
    function schedulePreview() { if (previewTimer) clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 350); }
    /* The preview follows the code by itself (a moment after each change); Run starts it again from scratch.
       The same page is not re-loaded (that would only empty the console). */
    var lastDoc = null, runs = 0;
    function renderPreview(force) {
      if (dead) return;
      var html;
      try {
        var page = previewPage && file(previewPage) ? previewPage : activeName;
        html = docMode ? mdPage((files[0] || {}).content || '') : buildPreview(files, page, assets);
      } catch (e) {
        html = '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#b8362a"><p>Preview failed: ' + esc(e.message || e) + '</p></body></html>';
      }
      if (force !== true && html === lastDoc) return;
      lastDoc = html;
      if (logEl) { logEl.innerHTML = ''; logCount = 0; if (countEl) countEl.textContent = ''; }
      frame.srcdoc = force === true ? html + '\n<!-- run ' + (++runs) + ' -->' : html;
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

    /* ---------- programs: Python, Java, C, C++, PHP ----------
       A project changes as soon as it holds a program file: the Run picker shows what runs,
       and a Terminal (beside the Preview when there is a web page too) shows the output.
       This page cannot pause a program while it waits for typing, so when a program asks for
       input the terminal asks the builder, then runs it again with every answer so far
       (random numbers keep the same seed, so the run plays out the same way). */
    var outMode = 'prev', lastProg = '', answers = [], runSeed = 0, running = false, runTok = 0, runFile = null;
    function hasHtml() { return files.some(function (f) { return f.lang === 'html'; }); }
    function programs() { return files.filter(isProgram); }
    function mainProgram() { var p = programs(); return (p.filter(function (f) { return /^main\./i.test(baseOf(f.name)); })[0] || p[0] || null); }
    /* What Run starts: the program you are looking at; a web file runs the page; otherwise the last program run, or main. */
    function runTarget() {
      var a = activeFile();
      if (isProgram(a)) return a.name;
      if (a && /^(html|css|js)$/.test(a.lang) && hasHtml()) return '@web';
      if (isProgram(file(lastProg))) return lastProg;
      var m = mainProgram();
      return m ? m.name : '@web';
    }
    function setOut(mode) {
      if (docMode) return;
      outMode = mode;
      var pp = q('.cl-prevpane'), tp = q('.cl-termpane');
      if (pp) pp.hidden = mode !== 'prev';
      if (tp) tp.hidden = mode !== 'term';
      [].forEach.call(hostEl.querySelectorAll('.cl-otab'), function (b) { var on = b.dataset.o === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      if (mode === 'term' && termEl && !termEl.childNodes.length) termEmpty();
    }
    function syncRunUi() {
      if (docMode) return;
      var progs = programs(), web = hasHtml(), shell = q('.cl-shell');
      shell.classList.toggle('cl-prog', progs.length > 0);
      var ot = q('.cl-otabs'); if (ot) ot.hidden = !(progs.length && web);
      if (progs.length && !web && outMode !== 'term') setOut('term');
      else if (!progs.length && outMode !== 'prev') setOut('prev');
      var wrap = q('.cl-runwrap'), sel = q('.cl-runsel');
      if (!wrap || !sel) return;
      wrap.hidden = !progs.length;
      if (!progs.length) return;
      var t = runTarget();
      var opts2 = (web ? [['@web', 'Web page (preview)']] : []).concat(progs.map(function (f) { return [f.name, f.name]; }));
      sel.innerHTML = opts2.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === t ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
    }
    function langName(r) { return { python: 'Python 3', java: 'Java', c: 'C', cpp: 'C++', php: 'PHP 8' }[r] || r; }
    function termEmpty() {
      if (!termEl) return;
      termEl.innerHTML = '<div class="cl-term-empty"><b><i class="fas fa-terminal"></i> Your program’s output shows here.</b> Press <kbd>Run</kbd> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>).<ul>' +
        '<li>When your program asks a question (like <code>input()</code>), a box appears here. Type your answer and press Enter.</li>' +
        '<li>Errors come with a tip in plain English and a button that jumps to the line.</li>' +
        '<li>Pictures and sounds you upload are files your program can open, for example <code>images/cat.png</code>.</li></ul></div>';
    }
    function tPrint(text, cls) {
      if (!termEl) return;
      var e = termEl.querySelector('.cl-term-empty'); if (e) termEl.innerHTML = '';
      var last = termEl.lastChild;
      if (last && last.nodeType === 1 && last.tagName === 'SPAN' && last.className === 'cl-t ' + (cls || 'out')) last.textContent += text;
      else { var s = document.createElement('span'); s.className = 'cl-t ' + (cls || 'out'); s.textContent = text; termEl.appendChild(s); }
      if (termEl.childNodes.length > 3000) termEl.removeChild(termEl.firstChild);
      termEl.scrollTop = termEl.scrollHeight;
    }
    function tSys(kind, icon, html) {
      if (!termEl) return;
      var e = termEl.querySelector('.cl-term-empty'); if (e) termEl.innerHTML = '';
      var last = termEl.lastChild;
      if (last && last.tagName === 'SPAN' && !/\n$/.test(last.textContent)) tPrint('\n');
      var d = document.createElement('div'); d.className = 'cl-sys ' + (kind || ''); d.innerHTML = '<i class="fas ' + icon + '"></i><span>' + html + '</span>';
      termEl.appendChild(d); termEl.scrollTop = termEl.scrollHeight;
    }
    function tHint(text, at, extra) {
      if (!termEl || (!text && !extra)) return;
      var d = document.createElement('div'); d.className = 'cl-hint';
      d.innerHTML = '<i class="fas fa-lightbulb"></i><div>' + (text ? esc(text) : '') + (at ? ' <button type="button" class="cl-btn" data-clcmd="goto" data-f="' + esc(at.file) + '" data-l="' + (+at.line || 1) + '"><i class="fas fa-arrow-right"></i> Go to ' + esc(baseOf(at.file)) + ', line ' + (+at.line || 1) + '</button>' : '') + (extra || '') + '</div>';
      termEl.appendChild(d); termEl.scrollTop = termEl.scrollHeight;
    }
    /* "File "x.py", line 5" / "in index.php:7" / "Main.java:12" / "main.c:4:2" */
    function locate(text) {
      var s = String(text || ''), m, hits = [];
      var re = /File "([^"]+)", line (\d+)|in ([\w./\-]+\.php)(?: on line |:)(\d+)|\(([\w]+\.java):(\d+)\)|([\w./\-]+\.java):(\d+)|([\w./\-]+\.(?:c|cpp|cc|h|hpp)):(\d+):(\d+)/g;
      while ((m = re.exec(s))) {
        var fn = m[1] || m[3] || m[5] || m[7] || m[9], ln = +(m[2] || m[4] || m[6] || m[8] || m[10]);
        if (fn && file(fn)) hits.push({ file: fn, line: ln });
      }
      return hits.length ? hits[hits.length - 1] : null;
    }
    function gotoLine(name, line) {
      if (!file(name)) return;
      if (activeName !== name) { activeName = name; curFolder = dirOf(name); loadActive(); }
      if (!cm) return;
      var ln = Math.max(0, Math.min(cm.lineCount() - 1, (+line || 1) - 1));
      cm.setCursor({ line: ln, ch: 0 }); cm.scrollIntoView({ line: ln, ch: 0 }, 80); cm.focus();
      var h = cm.addLineClass(ln, 'background', 'cl-errline');
      setTimeout(function () { try { cm.removeLineClass(h, 'background', 'cl-errline'); } catch (e) { } }, 2600);
    }
    function setRunning(on) {
      running = on;
      var r = q('.cl-head .cl-run'), s = q('.cl-head .cl-stop');
      if (r) r.hidden = on; if (s) s.hidden = !on;
    }
    function hideAsk() { var row = q('.cl-inrow'); if (row) row.hidden = true; }
    function askAnswer() {
      var row = q('.cl-inrow'), inp = q('.cl-in'); if (!row) return;
      row.hidden = false; inp.value = ''; setOut('term');
      setTimeout(function () { try { inp.focus(); } catch (e) { } }, 30);
      termEl.scrollTop = termEl.scrollHeight;
    }
    function doRun() {
      var t = runTarget();
      if (t === '@web' || !file(t)) { previewPage = null; setOut('prev'); renderPreview(true); setStatus('Running', 'ok'); return; }
      runProgram(file(t), false);
    }
    function runProgram(f, again) {
      if (!f || docMode) return;
      runTok++;
      if (running && RUNNER) { try { RUNNER.stop(); } catch (e) { } }
      var tok = runTok, key = LANGS[f.lang].run, starved = false, out = '', javaOut = [];
      lastProg = f.name; runFile = f.name;
      if (!again) { answers = []; runSeed = Date.now(); }
      if (canEdit && dirty) flushSave();
      hideAsk(); setOut('term');
      termEl.innerHTML = '';
      tSys('run', 'fa-play', 'Running <b>' + esc(f.name) + '</b> · ' + esc(langName(key)) + (answers.length ? ' · with your ' + (answers.length === 1 ? 'answer' : answers.length + ' answers') : ''));
      setRunning(true);
      loadRuntime().then(function (R) {
        if (tok !== runTok) return;
        var st = key === 'java' ? 'ready' : R.state(key === 'c' ? 'cpp' : key);
        if (st !== 'ready' && !again) tSys('', 'fa-cloud-arrow-down', key === 'python' ? 'Getting Python ready. The first time takes a little while (about 12 MB), then it is quick.' : key === 'php' ? 'Getting PHP ready. The first time takes a little while.' : key === 'java' ? '' : 'Getting the C/C++ compiler ready. The first time takes a little while.');
        return (key === 'java' ? Promise.resolve([]) : binaryFiles(assets)).then(function (bins) {
          if (tok !== runTok) return;
          return R.run({ lang: key, files: files.map(function (x) { return { name: x.name, content: x.content }; }).concat(bins), entry: f.name, stdin: answers.length ? answers.join('\n') + '\n' : '', live: false, seed: runSeed }, {
            out: function (s, t) {
              if (tok !== runTok || starved) return;
              if (key === 'java') { javaOut.push([s, t]); return; }
              out += t; tPrint(t, s === 'stderr' ? 'err' : 'out');
            },
            echo: function (t) { if (tok === runTok && !starved) tPrint(t + '\n', 'echo'); },
            starved: function () { starved = true; },
            phase: function (p) {
              if (tok !== runTok) return;
              if (p === 'compile') tSys('', 'fa-gears', R.state('cpp') === 'ready' ? 'Compiling…' : 'Getting the C/C++ compiler ready (the first time takes a little while)…');
              if (p === 'remote') tSys('', 'fa-cloud-arrow-up', 'Sending your code to the Paisley code runner…');
            }
          }).then(function (res) {
            if (tok !== runTok) return;
            res = res || {};
            if (key === 'java') {
              /* Java runs remotely with all its input at once: running out of input means it wants more. */
              var all = javaOut.map(function (x) { return x[1]; }).join('');
              if (/NoSuchElementException/.test(all) && /Scanner|System\.in/.test(files.filter(function (x) { return x.lang === 'java'; }).map(function (x) { return x.content; }).join('\n'))) starved = true;
              javaOut.forEach(function (x) { if (!(starved && x[0] === 'stderr')) { out += x[1]; tPrint(x[1], x[0] === 'stderr' ? 'err' : 'out'); } });
            }
            setRunning(false);
            finishProgram(res, f, key, starved, out);
          });
        });
      }).catch(function (e) {
        if (tok !== runTok) return;
        setRunning(false);
        tSys('bad', 'fa-triangle-exclamation', esc((e && e.message) || 'The code runner could not start.'));
        tHint('Check your internet connection, then press Run again.');
      });
    }
    function finishProgram(res, f, key, starved, out) {
      var L = g.PaisleyLangs;
      if (res.stopped) { tSys('bad', 'fa-stop', 'Stopped.'); return; }
      if (starved && !res.failed && res.phase !== 'compile') {
        tSys('ask', 'fa-keyboard', 'Your program is asking for something. Type it below and press Enter.');
        askAnswer(); return;
      }
      if (res.notConfigured) {
        tSys('bad', 'fa-cloud', 'Java could not run yet.');
        tHint('Java runs on the Paisley code runner, a sealed server sandbox, and the Studio Desk has not switched it on yet. Python, C, C++, PHP and web pages run right here.');
        return;
      }
      if (res.failed && key === 'java') {
        tSys('bad', 'fa-cloud', 'Java could not run here.');
        tHint(/not available on this page/i.test(res.message || '') ? 'Java runs on the Paisley code runner, which needs a Tech Studio sign-in. Read the code here, or ask the maker to show it to you running.' : (res.message || 'The Paisley code runner could not be reached. Check your connection and try again.'));
        return;
      }
      if (res.failed) {
        var offline = /download|network|fetch|load/i.test(res.message || '');
        tSys('bad', 'fa-triangle-exclamation', offline ? esc(langName(key)) + ' could not be downloaded.' : esc(langName(key)) + ' stopped unexpectedly.');
        tHint(offline ? 'Check your internet connection, then press Run again.' : 'It has been restarted with a clean slate' + (res.message ? ' (' + res.message + ')' : '') + '. Press Run to try again.');
        return;
      }
      if (res.phase === 'compile') {
        if (res.stderr) tPrint(res.stderr + (/\n$/.test(res.stderr) ? '' : '\n'), 'err');
        var d = (res.diagnostics || []).filter(function (x) { return x.severity === 'error'; })[0] || (res.diagnostics || [])[0];
        tSys('bad', 'fa-circle-xmark', 'Did not compile' + (d ? ': ' + esc(d.message) : '') + '.');
        tHint((L && L.explain(f.lang, (d && d.message) || res.stderr)) || 'Fix the first error, then run again. Later errors often go away once the first one is fixed.', d && file(d.file) ? { file: d.file, line: d.line } : null);
        return;
      }
      var ok = res.ok && !res.code;
      if (ok) { tSys('ok', 'fa-circle-check', 'Finished.'); return; }
      var at = res.file && res.line && file(res.file) ? { file: res.file, line: res.line } : locate(out);
      tSys('bad', 'fa-circle-xmark', res.type && res.type !== 'runtime' && res.type !== 'crash' ? 'Stopped with ' + esc(res.type) + '.' : res.code ? 'Finished with exit code ' + res.code + '.' : 'The program stopped with an error.');
      var hint = L ? L.explain(f.lang, out + '\n' + (res.message || '')) : '';
      tHint(hint || (at ? 'Look at this line and the one above it.' : 'Read the red message from the bottom up: the last line says what went wrong.'), at);
      if (at) gotoLine(at.file, at.line);
    }
    function stopRun() { if (running && RUNNER) RUNNER.stop(); hideAsk(); }
    var inForm = q('.cl-inrow');
    if (inForm) inForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = q('.cl-in').value, f = file(runFile);
      if (!f) { hideAsk(); return; }
      answers.push(String(v).slice(0, 2000));
      runProgram(f, true);
    });
    function onRuntime(lang, info) { if (running && info && info.state === 'loading' && info.label) setStatus(info.label, '', true); else if (running && info && info.state === 'ready') setStatus(''); }
    RUN_LISTENERS.push(onRuntime);
    /* C and C++ compile in the tools worker, so opening a .c / .cpp file prepares the compiler at once and
       Run is quick. Python and PHP start on the first Run (a second copy in the background would only cost memory). */
    var warmed = {};
    function warmFor(f) {
      var key = f && (LANGS[f.lang] || {}).run; if ((key !== 'c' && key !== 'cpp') || warmed.cpp) return;
      warmed.cpp = 1;
      setTimeout(function () { if (dead) return; loadRuntime().then(function (R) { if (!dead) R.warm('cpp').catch(function () { }); }).catch(function () { }); }, 1200);
    }

    /* ---------- share sheet ----------
       Opens inside the IDE (it keeps full screen); the page fills the body and repaints it as the
       publish state changes. The page's own click handlers see the sheet's buttons (it sits in the host). */
    var shareBox = null;
    function closeShare() {
      if (!shareBox) return;
      shareBox.remove(); shareBox = null;
      document.removeEventListener('keydown', shareKey, true);
      var b = q('[data-clcmd="share"]'); if (b) b.focus();
    }
    function shareKey(e) { if (e.key === 'Escape' && shareBox) { e.preventDefault(); e.stopPropagation(); closeShare(); } }
    function openShare() {
      if (typeof opts.share !== 'function') return;
      if (canEdit) flushSave();
      if (shareBox) { closeShare(); return; }
      shareBox = document.createElement('div');
      shareBox.className = 'cl-dlg'; shareBox.setAttribute('role', 'dialog'); shareBox.setAttribute('aria-modal', 'true'); shareBox.setAttribute('aria-label', 'Share your work');
      shareBox.innerHTML = '<div class="cl-dlg-box cl-sharebox"><div class="cl-share-h"><span class="cl-share-ic"><i class="fas fa-globe"></i></span><div><b>Share your work</b><small>Your coach or the Studio Desk checks it first. Then you get a link for friends and family.</small></div>' +
        '<button type="button" class="cl-btn cl-icon" data-clshare="close" aria-label="Close"><i class="fas fa-xmark"></i></button></div><div class="cl-share-b"></div></div>';
      (q('.cl-shell') || hostEl).appendChild(shareBox);
      shareBox.addEventListener('mousedown', function (e) { if (e.target === shareBox) closeShare(); });
      shareBox.querySelector('[data-clshare="close"]').addEventListener('click', closeShare);
      document.addEventListener('keydown', shareKey, true);
      try { opts.share(shareBox.querySelector('.cl-share-b'), closeShare); } catch (e) { console.warn('share sheet:', e); }
      var f = shareBox.querySelector('.cl-share-b button, .cl-share-b input'); if (f) f.focus();
    }
    function setShare(st) {
      var b = q('[data-clcmd="share"]'); if (!b) return;
      b.classList.toggle('on', st === 'approved'); b.classList.toggle('wait', st === 'requested');
      b.querySelector('i').className = 'fas ' + (st === 'requested' ? 'fa-hourglass-half' : 'fa-globe');
      b.querySelector('span').textContent = st === 'approved' ? 'Shared' : (st === 'requested' ? 'Asked' : 'Share');
    }

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
      askName('New file name, for example main.py, about.html, game.js, style.css, Main.java or main.c' + (dir ? ' (it goes in ' + dir + '/)' : ''), '').then(function (n) { if (n) makeFile(n, dir); });
    }
    function makeFile(n, dir) {
      /* "images", "Videos" or "sounds" typed as a file name means a folder for uploads, not images.html. */
      if (!/\.\w+$/.test(n) && MEDIA_DIR.test(baseOf(n))) { makeFolder(n, dir || ''); return; }
      if (dir && n.indexOf('/') === -1) n = dir + '/' + n;
      if (!/\.\w+$/.test(n)) n += '.html';
      if (taken(n)) { setStatus('There is already a file called ' + n, 'err'); return; }
      var lang = langOf(n), f = defaultFile(lang, n);
      if (lang === 'html') f.content = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>' + baseOf(n).replace(/\.\w+$/, '') + '</title>\n</head>\n<body>\n  \n</body>\n</html>\n';
      if (lang === 'css' || lang === 'js') f.content = '';
      /* The first file of a program language gets a starter that runs; a second one starts empty
         (a Java file always holds its class, or it cannot compile). */
      if (STARTERS[lang]) f.content = lang === 'java' ? (files.some(function (x) { return x.lang === 'java'; }) ? 'public class ' + (baseOf(n).replace(/\.\w+$/, '').replace(/\W/g, '') || 'Helper') + ' {\n\n}\n' : starterCode('java', n))
        : (files.some(function (x) { return x.lang === lang; }) || /\.(h|hpp|hh|hxx)$/i.test(n) ? '' : starterCode(lang, n));
      files.push(f); delete deleted[n]; activeName = n; loadActive(); structural();
      suggestLinks(f);
      if (cm) cm.focus();
    }
    /* The toolbar's New folder always makes it at the top of the project (type pages/extra for one inside
       another). Nothing opens by itself: the folder appears in the list with its own Upload button. */
    function addFolder() {
      askName('Folder name, for example images, videos or pages', '').then(function (n) { if (n) makeFolder(n, ''); });
    }
    function makeFolder(n, parent) {
      if (parent && n.indexOf('/') === -1) n = parent + '/' + n;
      var same = allFolders().filter(function (d) { return d.toLowerCase() === n.toLowerCase(); })[0];
      if (same) { openFolder[same] = true; renderTree(); setStatus('There is already a folder called ' + same + '.', 'err'); return; }
      if (taken(n)) { setStatus('There is already a file called ' + n, 'err'); return; }
      folders.push(n); delete deleted[n]; openFolder[n] = true; structural();
      setStatus('Folder ' + n + ' made.' + (opts.uploadAsset ? ' Press its Upload button to add ' + pickWord(n) + '.' : ''), 'ok', true);
    }
    /* Rename in place: a plain name keeps the thing in its folder. A name with a folder in front
       (pages/about.html) moves it there, and a / in front (/about.html) moves it to the top. */
    function askPlace(oldName, isDir) {
      var here = dirOf(oldName);
      return dialog('New name for ' + baseOf(oldName) + (here ? '. It stays in ' + here + '/.' : '.') + ' To move it, type a folder in front, for example ' + (isDir ? 'pages/' : 'images/') + baseOf(oldName) + (here ? ', or /' + baseOf(oldName) + ' for the top.' : '.'), baseOf(oldName), 'Rename').then(function (raw) {
        if (raw == null) return null;
        raw = String(raw).trim().replace(/\\/g, '/');
        var n = cleanName(raw); if (!n) return null;
        if (raw.charAt(0) === '/' || raw.indexOf('/') !== -1) return n;
        return here ? cleanName(here + '/' + n) : n;
      });
    }
    /* What a folder is for, from its name: images, videos, sounds or anything. */
    var MEDIA_DIR = /^(images?|imgs?|pictures?|pics?|photos?|videos?|movies?|clips?|media|assets|sounds?|audio|music)$/i;
    function pickWord(dir) {
      var b = baseOf(dir);
      return /^(images?|imgs?|pictures?|pics?|photos?)$/i.test(b) ? 'pictures' : /^(videos?|movies?|clips?)$/i.test(b) ? 'videos' : /^(sounds?|audio|music)$/i.test(b) ? 'sounds' : 'pictures or videos';
    }
    function acceptFor(dir) {
      var w = dir == null ? '' : pickWord(dir);
      return w === 'pictures' ? 'image/*,.webp,.heic' : w === 'videos' ? 'video/*,.mov,.mp4,.webm' : w === 'sounds' ? 'audio/*,.mp3,.wav' : upAccept();
    }
    var upDir = null;
    function pickInto(dir) {
      if (!upIn) return;
      upDir = dir; upIn.accept = acceptFor(dir);
      try { upIn.click(); } catch (e) { }
    }
    /* A new name with no ending keeps the old one (style -> style.css). */
    function keepExt(n, old) { var m = /\.\w+$/.exec(baseOf(old)); return /\.\w+$/.test(baseOf(n)) || !m ? n : n + m[0]; }
    function renameFile(name) {
      var f = file(name); if (!f) return;
      askPlace(f.name).then(function (n) {
        if (n) n = keepExt(n, f.name);
        if (n && n !== f.name) moveFile(f, name, n);
      });
    }
    function moveFile(f, name, n) {
      if (taken(n, f)) { setStatus('There is already something called ' + n, 'err'); return; }
      var lang = langOf(n);
      deleted[f.name] = true; if (docs[f.name]) { docs[n] = docs[f.name]; delete docs[f.name]; }
      if (lang !== f.lang && docs[n]) delete docs[n];
      retab(f.name, n); if (lastProg === f.name) lastProg = n;
      f.name = n; f.lang = lang; delete deleted[n];
      if (activeName === name) activeName = n;
      if (previewPage === name) previewPage = n;
      var map = {}; map[name] = n; var fixed = relink(map);
      loadActive(); structural();
      setStatus('Renamed to ' + baseOf(n) + (fixed ? '. Links in ' + fixed + ' file' + (fixed === 1 ? '' : 's') + ' updated.' : ''), 'ok');
    }
    function renameFolder(dir) {
      askPlace(dir, true).then(function (n) {
        if (!n || n === dir) return;
        if (n.indexOf(dir + '/') === 0) { setStatus('A folder cannot go inside itself.', 'err'); return; }
        if (allFolders().indexOf(n) !== -1 || taken(n)) { setStatus('There is already something called ' + n, 'err'); return; }
        var pre = dir + '/', map = {};
        function moved(x) { return x === dir ? n : x.indexOf(pre) === 0 ? n + '/' + x.slice(pre.length) : x; }
        files.forEach(function (f) {
          var nn = moved(f.name); if (nn === f.name) return;
          map[f.name] = nn; deleted[f.name] = true; delete deleted[nn];
          if (docs[f.name]) { docs[nn] = docs[f.name]; delete docs[f.name]; }
          if (activeName === f.name) activeName = nn;
          retab(f.name, nn);
          if (previewPage === f.name) previewPage = nn;
          f.name = nn;
        });
        assets.forEach(function (a) { var nn = moved(a.name); if (nn === a.name) return; map[a.name] = nn; deleted[a.name] = true; delete deleted[nn]; a.name = nn; });
        folders = folders.map(function (d) { var nd = moved(d); if (nd !== d) { deleted[d] = true; delete deleted[nd]; } return nd; });
        if (folders.indexOf(n) === -1) folders.push(n);
        Object.keys(openFolder).forEach(function (k) { var nk = moved(k); if (nk !== k) { openFolder[nk] = openFolder[k]; delete openFolder[k]; } });
        openFolder[n] = true; curFolder = n;
        var fixed = relink(map);
        loadActive(); structural();
        setStatus('Folder renamed to ' + n + (fixed ? '. Links in ' + fixed + ' file' + (fixed === 1 ? '' : 's') + ' updated.' : ''), 'ok');
      });
    }
    function renameAsset(name) {
      var a = assets.filter(function (x) { return x.name === name; })[0]; if (!a) return;
      askPlace(a.name).then(function (n) {
        if (n) n = keepExt(n, a.name);
        if (!n || n === a.name) return;
        if (taken(n, a)) { setStatus('There is already something called ' + n, 'err'); return; }
        var map = {}; map[a.name] = n; deleted[a.name] = true; delete deleted[n]; a.name = n;
        var fixed = relink(map);
        renderTree(); structural(); schedulePreview();
        setStatus('Renamed to ' + baseOf(n) + (fixed ? '. Links in ' + fixed + ' file' + (fixed === 1 ? '' : 's') + ' updated.' : ''), 'ok');
      });
    }
    /* Change a file's text from code (relinking, the Link it button) and keep its editor in step. */
    function setText(f, text) {
      if (f.content === text) return;
      var d = docs[f.name];
      if (d) { var r = region(d.getValue(), text); applying = true; d.replaceRange(r.text, d.posFromIndex(r.from), d.posFromIndex(r.to), 'link'); applying = false; }
      else if (!cm && f.name === activeName) fallback.value = text;
      f.content = text;
    }
    /* After renames ({ oldPath: newPath }) the links in pages, styles and scripts follow
       the files, so a renamed style.css or a renamed folder never breaks the page. */
    function relink(map) {
      var back = {}; Object.keys(map).forEach(function (o) { back[map[o]] = o; });
      var known = {}; files.concat(assets).forEach(function (x) { known[back[x.name] || x.name] = x.name; });
      var changed = 0;
      files.forEach(function (f) {
        if (!/^(html|css|js)$/.test(f.lang)) return;
        var oldName = back[f.name] || f.name;
        var text = f.content.replace(/(["'(])([^"'()\s<>:?#]+\.\w{1,6})(?=["')])/g, function (m, q, ref) {
          var target = joinPath(dirOf(oldName), ref); if (target == null) return m;
          var now = known[target]; if (!now) return m;
          if (now === target && oldName === f.name) return m;
          var nr = ref.charAt(0) === '/' ? '/' + now : (/^\.\//.test(ref) ? './' : '') + relBetween(f.name, now);
          return nr === ref ? m : q + nr;
        });
        if (text !== f.content) { setText(f, text); changed++; }
      });
      return changed;
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
    function relFrom(target) { return relBetween(activeName, target); }
    /* The path to write in fromFile to reach target: "pages/a.html" -> "css/s.css" is "../css/s.css". */
    function relBetween(fromFile, target) {
      var from = dirOf(fromFile).split('/').filter(Boolean), to = target.split('/');
      while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift(); }
      return from.map(function () { return '..'; }).concat(to).join('/');
    }

    /* ---------- linking files: suggestions and the "Link it" bar ---------- */
    function linkTag(lang, rel) { return lang === 'css' ? '<link rel="stylesheet" href="' + rel + '">' : '<script src="' + rel + '"></script>'; }
    function linkedIn(page, rel) { var c = page.content; return c.indexOf('"' + rel + '"') !== -1 || c.indexOf("'" + rel + "'") !== -1 || c.indexOf('"./' + rel + '"') !== -1; }
    /* Typing a word on its own in a page offers the project's own files, with their real paths. */
    function projectItems(w) {
      var page = activeFile(); if (!page || page.lang !== 'html') return [];
      var out = [];
      function hit(words, name) { return words.some(function (k) { return k.indexOf(w) === 0; }) || baseOf(name).toLowerCase().indexOf(w) === 0; }
      files.forEach(function (f) {
        if (f.name === page.name) return;
        var rel = relFrom(f.name), done = linkedIn(page, rel);
        if (f.lang === 'css' && hit(['link', 'css', 'style', 'stylesheet'], f.name)) out.push({ name: 'link', lang: 'css', label: 'link ' + rel + (done ? '  (linked)' : ''), snip: linkTag('css', rel), done: done });
        else if (f.lang === 'js' && hit(['script', 'js', 'javascript'], f.name)) out.push({ name: 'script', lang: 'js', label: 'script ' + rel + (done ? '  (linked)' : ''), snip: linkTag('js', rel), done: done });
        else if (f.lang === 'html' && hit(['a', 'page', 'link'], f.name)) out.push({ name: 'a', lang: 'html', label: 'a → ' + rel, snip: '<a href="' + rel + '">|' + baseOf(f.name).replace(/\.\w+$/, '') + '</a>', done: false });
      });
      assets.forEach(function (a) {
        var rel = relFrom(a.name), t = a.type || '';
        if (/^image\//.test(t) && hit(['img', 'image', 'picture'], a.name)) out.push({ name: 'img', lang: '', label: 'img ' + rel, snip: '<img src="' + rel + '" alt="">' });
        else if (/^video\//.test(t) && hit(['video'], a.name)) out.push({ name: 'video', lang: '', label: 'video ' + rel, snip: '<video src="' + rel + '" controls width="480"></video>' });
        else if (/^audio\//.test(t) && hit(['audio', 'sound'], a.name)) out.push({ name: 'audio', lang: '', label: 'audio ' + rel, snip: '<audio src="' + rel + '" controls></audio>' });
      });
      return out.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); });
    }
    /* Inside href="…" / src="…" (and CSS url(…)): the project's real file paths. */
    function pathHint(ed) {
      var f = activeFile(); if (!f || !/^(html|css)$/.test(f.lang)) return null;
      var cur = ed.getCursor(), before = ed.getLine(cur.line).slice(0, cur.ch), tag = '', typed = null;
      var m = f.lang === 'html' ? /<(\w+)\b[^<>]*?\b(href|src|poster)\s*=\s*["']([^"'<>]*)$/i.exec(before) : null;
      if (m) { tag = m[1].toLowerCase(); typed = m[3]; }
      else { var u = /url\(\s*["']?([^"')\s]*)$/i.exec(before); if (!u) return null; tag = 'url'; typed = u[1]; }
      if (/^([a-z]+:|\/\/|#)/i.test(typed)) return null;
      var onlyFiles = { link: ['css'], script: ['js'], a: ['html'] }[tag];
      var media = { img: /^image\//, url: /^image\//, video: /^video\//, audio: /^(audio|video)\//, source: /^(audio|video)\// }[tag];
      var t = typed.toLowerCase(), list = [];
      function ok(name, rel) { return !t || rel.toLowerCase().indexOf(t) === 0 || baseOf(name).toLowerCase().indexOf(t) === 0; }
      if (!media) files.forEach(function (x) {
        if (x.name === f.name || (onlyFiles && onlyFiles.indexOf(x.lang) === -1)) return;
        var rel = relFrom(x.name); if (ok(x.name, rel)) list.push({ text: rel, render: function (el) { el.innerHTML = langIcon(x.lang).replace('cl-li', 'cl-li cl-h-ic') + esc(rel); } });
      });
      if (!onlyFiles) assets.forEach(function (a) {
        if (media && !media.test(a.type || '')) return;
        var rel = relFrom(a.name); if (ok(a.name, rel)) list.push({ text: rel, render: function (el) { el.innerHTML = '<i class="fas fa-image cl-h-ic" style="color:#7048E8"></i>' + esc(rel); } });
      });
      if (!list.length) return null;
      var CMg = g.CodeMirror;
      return { list: list, from: CMg.Pos(cur.line, cur.ch - typed.length), to: cur };
    }
    /* After a new style / script / page is made: offer to link it in one press. */
    function suggestLinks(made) {
      var bar = q('.cl-suggest'); if (!bar || !canEdit || docMode) return;
      var jobs = [];
      if (made.lang === 'css' || made.lang === 'js') {
        var page = file('index.html') || files.filter(function (x) { return x.lang === 'html'; })[0];
        if (page && !linkedIn(page, relBetween(page.name, made.name))) jobs.push({ page: page, f: made });
      } else if (made.lang === 'html') {
        files.forEach(function (x) { if ((x.lang === 'css' || x.lang === 'js') && !linkedIn(made, relBetween(made.name, x.name))) jobs.push({ page: made, f: x }); });
      }
      if (!jobs.length) { bar.hidden = true; return; }
      var names = jobs.map(function (j) { return baseOf(j.f.name); });
      bar.innerHTML = '<span>' + langIcon(jobs[0].f.lang) + ' Link <b>' + esc(names.join(', ')) + '</b> to <b>' + esc(baseOf(jobs[0].page.name)) + '</b> so it works on the page?</span>' +
        '<button type="button" class="cl-btn cl-save" data-sg="yes"><i class="fas fa-link"></i> Link it</button><button type="button" class="cl-btn" data-sg="no">Not now</button>';
      bar.hidden = false;
      bar.onclick = function (e) {
        var b = e.target.closest('[data-sg]'); if (!b) return;
        bar.hidden = true;
        if (b.dataset.sg !== 'yes') return;
        jobs.forEach(function (j) { addLink(j.page, j.f); });
        markDirty();
        setStatus('Linked ' + names.join(', ') + ' in ' + baseOf(jobs[0].page.name), 'ok');
      };
    }
    /* Styles go just before </head>, scripts just before </body>. */
    function addLink(page, f) {
      var rel = relBetween(page.name, f.name), tag = linkTag(f.lang, rel), c = page.content, at;
      if (linkedIn(page, rel)) return;
      if (f.lang === 'css') at = c.search(/<\/head>/i); else at = c.search(/<\/body>/i);
      if (at === -1) at = f.lang === 'css' ? (c.search(/<body[\s>]/i) === -1 ? 0 : c.search(/<body[\s>]/i)) : c.length;
      var lineStart = at ? c.lastIndexOf('\n', at - 1) + 1 : 0, lead = c.slice(lineStart, at);
      /* </head> on its own line: the tag goes on a new line above it, indented one step more. */
      if (!lead.trim()) setText(page, c.slice(0, lineStart) + lead + '  ' + tag + '\n' + c.slice(lineStart));
      else setText(page, c.slice(0, at) + '\n  ' + tag + '\n' + c.slice(at));
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
    if (upLabel) upLabel.addEventListener('click', function (e) { if (e.target !== upIn) { upDir = null; upIn.accept = upAccept(); } });
    if (upLabel) upLabel.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); upDir = null; upIn.accept = upAccept(); upIn.click(); } });
    if (upIn) upIn.addEventListener('change', function (e) {
      var list = [].slice.call(e.target.files || []); e.target.value = '';
      var target = upDir; upDir = null; upIn.accept = upAccept();
      uploadList(list, target);
    });
    /* Files from the device: pictures, video, sound and fonts. Code files (.html .css .js ...) dropped
       or picked become ordinary project files the builder can edit. */
    var maxUp = Math.min(MAX_ASSET_BYTES, (opts.maxUploadMb || 50) * 1024 * 1024), maxUpMb = Math.round(maxUp / 1048576);
    function uploadList(list, target) {
      if (!canEdit) return;
      var okCount = 0;
      list.reduce(function (p, f0) {
        return p.then(function () {
          var t = typeOfFile(f0);
          if (t === 'code') return addCodeFile(f0, target).then(function (ok) { if (ok) okCount++; });
          if (!opts.uploadAsset) { setStatus(f0.name + ': pictures and videos cannot be uploaded here.', 'err', true); return; }
          if (assets.length >= MAX_ASSETS) { setStatus('A project can hold ' + MAX_ASSETS + ' uploads.', 'err', true); return; }
          if (t === 'svg') { setStatus(f0.name + ': SVG pictures cannot be uploaded. Save it as PNG or JPG and try again.', 'err', true); return; }
          if (!t) { setStatus(f0.name + ': upload pictures (PNG, JPG, GIF, WEBP), videos (MP4, WEBM), sounds (MP3, WAV) or fonts, or code files (HTML, CSS, JS).', 'err', true); return; }
          if (f0.size > maxUp) { setStatus(f0.name + ' is too big (' + Math.round(f0.size / 1048576) + ' MB). The limit is ' + maxUpMb + ' MB.', 'err', true); return; }
          setStatus('Checking ' + f0.name + '…', '', true);
          /* What is inside must match the name: a script renamed cat.png never leaves the computer. */
          return checkUpload(f0).then(function (chk) {
          if (!chk.ok) { setStatus(chk.reason, 'err', true); return; }
          /* The type stored is the one the file really is (some computers give none for .webp, .heic, .mov or fonts). */
          var f = f0;
          if (f0.type !== chk.type) { try { f = new File([f0], f0.name, { type: chk.type }); } catch (er) { f = f0; } }
          t = chk.type;
          var dir = target != null ? target : homeFor(t);
          var n = cleanName((dir ? dir + '/' : '') + f.name); var k = 1;
          while (taken(n)) { n = cleanName((dir ? dir + '/' : '') + f.name.replace(/(\.\w+)?$/, '-' + (++k) + '$1')); }
          setStatus('Uploading ' + f.name + '…', '', true);
          return Promise.resolve(opts.uploadAsset(f, n)).then(function (r) {
            assets.push({ name: n, url: r.url, storagePath: r.storagePath || '', type: f.type || t, size: f.size });
            delete deleted[n]; openFolder[dirOf(n)] = true; okCount++;
            return structural().then(function () { setStatus('Uploaded ' + baseOf(n) + '. Click it to put it in your code.', 'ok'); });
          }).catch(function (er) { setStatus('Upload of ' + f.name + ' failed: ' + upError(er), 'err', true); });
          });
        });
      }, Promise.resolve()).then(function () { if (okCount > 1) setStatus('Added ' + okCount + ' files.', 'ok'); });
    }
    /* Where an upload with no folder chosen goes: an existing images / videos / sounds folder, else a new one. */
    function homeFor(t) {
      var w = /^image\//.test(t) ? 'pictures' : /^video\//.test(t) ? 'videos' : /^audio\//.test(t) ? 'sounds' : '';
      var mine = w && allFolders().filter(function (d) { return MEDIA_DIR.test(baseOf(d)) && pickWord(d) === w; }).sort(function (a, b) { return a.split('/').length - b.split('/').length; })[0];
      return mine || ({ pictures: 'images', videos: 'videos', sounds: 'sounds' }[w] || 'fonts');
    }
    function upError(er) {
      var c = (er && er.code) || '';
      if (/unauthorized|permission/.test(c)) return 'this kind of file is not allowed, or it is over ' + maxUpMb + ' MB. Pictures, videos, sounds and fonts only.';
      if (/canceled/.test(c)) return 'cancelled.';
      if (/retry-limit|network/.test(c) || (er && /network/i.test(er.message || ''))) return 'the internet connection dropped. Try again.';
      if (/quota/.test(c)) return 'storage is full. Tell your coach.';
      return (er && er.message) || String(er);
    }
    function addCodeFile(f, target) {
      if (files.length >= MAX_FILES) { setStatus('A project can hold ' + MAX_FILES + ' files.', 'err', true); return Promise.resolve(false); }
      if (f.size > MAX_FILE_BYTES) { setStatus(f.name + ' is too big for a code file (200 KB at most).', 'err', true); return Promise.resolve(false); }
      return new Promise(function (done) {
        var rd = new FileReader();
        rd.onload = function () {
          var dir = target != null ? target : '';
          var n = cleanName((dir ? dir + '/' : '') + f.name);
          var existing = file(n) || files.filter(function (x) { return x.name.toLowerCase() === n.toLowerCase(); })[0];
          if (existing) { existing.content = String(rd.result || ''); delete docs[existing.name]; }
          else { files.push({ name: n, lang: langOf(n), content: String(rd.result || '') }); delete deleted[n]; }
          activeName = existing ? existing.name : n; openFolder[dirOf(activeName)] = true; loadActive();
          structural().then(function () { setStatus((existing ? 'Replaced ' : 'Added ') + baseOf(activeName) + '.', 'ok'); done(true); }, function () { done(false); });
        };
        rd.onerror = function () { setStatus('Could not read ' + f.name, 'err', true); done(false); };
        rd.readAsText(f);
      });
    }
    /* Drag files from the computer onto the file list. */
    var treeBox = q('.cl-tree');
    if (treeBox && canEdit) {
      treeBox.addEventListener('dragover', function (e) {
        if (!e.dataTransfer || [].indexOf.call(e.dataTransfer.types || [], 'Files') === -1) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; treeBox.classList.add('cl-drop');
      });
      treeBox.addEventListener('dragleave', function (e) { if (!treeBox.contains(e.relatedTarget)) treeBox.classList.remove('cl-drop'); });
      treeBox.addEventListener('drop', function (e) {
        if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
        e.preventDefault(); treeBox.classList.remove('cl-drop');
        var d = e.target.closest && e.target.closest('[data-dir]');
        uploadList([].slice.call(e.dataTransfer.files), d ? d.dataset.dir : null);
      });
    }

    /* ---------- clicks ---------- */
    hostEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-clcmd],[data-clnode],[data-file],[data-dir],[data-asset]'); if (!b || !hostEl.contains(b)) return;
      if (b.dataset.clcmd) {
        var cmd = b.dataset.clcmd;
        if (cmd === 'save') flushSave();
        else if (cmd === 'run') doRun();
        else if (cmd === 'stop') stopRun();
        else if (cmd === 'theme') setTheme(readTheme() === 'light' ? 'dark' : 'light');
        else if (cmd === 'otab') setOut(b.dataset.o === 'term' ? 'term' : 'prev');
        else if (cmd === 'goto') gotoLine(b.dataset.f, b.dataset.l);
        else if (cmd === 'layout') bodyEl.classList.toggle('cl-stacked');
        else if (cmd === 'full') toggleFull();
        else if (cmd === 'tree') hostEl.querySelector('.cl-shell').classList.toggle('cl-tree-open');
        else if (cmd === 'advanced') { flushSave(); opts.advanced(b); }
        else if (cmd === 'share') openShare();
        else if (!canEdit) return;
        else if (cmd === 'add') addFile('');
        else if (cmd === 'folder') addFolder();
        return;
      }
      if (b.dataset.clnode) {
        e.stopPropagation();
        var p = b.dataset.p, a = b.dataset.clnode;
        if (a === 'useasset') useAsset(p);
        else if (a === 'closetab') closeTab(p);
        else if (!canEdit) return;
        else if (a === 'rename') renameFile(p);
        else if (a === 'renamedir') renameFolder(p);
        else if (a === 'renameasset') renameAsset(p);
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

    /* Double-click a file, folder or upload in the tree to rename it. */
    hostEl.addEventListener('dblclick', function (e) {
      if (!canEdit) return;
      var n = e.target.closest('[data-file],[data-dir],[data-asset]'); if (!n || !hostEl.contains(n) || e.target.closest('.cl-node-acts,.cl-up')) return;
      e.preventDefault();
      if (n.dataset.file != null) renameFile(n.dataset.file);
      else if (n.dataset.asset != null) renameAsset(n.dataset.asset);
      else if (n.dataset.dir) renameFolder(n.dataset.dir);
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

    function onLeave(e) { if (dirty && canEdit) { writeDraftNow(); flushSave(); e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onLeave);
    /* Leaving the tab, closing the laptop or switching app: save now, and keep a copy here. */
    function writeDraftNow() { if (draftKey && dirty) lsSet(draftKey, { at: Date.now(), files: simpleFiles(), folders: folders.slice(), active: activeName }); }
    function onHide() { if (document.visibilityState === 'hidden' && dirty && canEdit) { writeDraftNow(); flushSave(); } }
    function onPageHide() { if (dirty && canEdit) { writeDraftNow(); flushSave(); } }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    var runSel = q('.cl-runsel');
    if (runSel) runSel.addEventListener('change', function () {
      var v = runSel.value;
      if (v === '@web') { var pg = file('index.html') || files.filter(function (x) { return x.lang === 'html'; })[0]; if (pg) { activeName = pg.name; loadActive(); } }
      else if (file(v)) { activeName = v; curFolder = dirOf(v); loadActive(); }
    });
    hostEl.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !(e.target.closest && e.target.closest('.cl-inrow,.cl-dlg'))) { e.preventDefault(); doRun(); }
    });

    /* ---------- boot ---------- */
    renderTree(); loadActive();
    setTimeout(renderPreview, 80);
    setStatus('Loading the editor…', '', true);
    var shell0 = q('.cl-shell'), revealAt = Date.now() + (cinematic ? 1500 : 320);
    function reveal() {
      var wait = revealAt - Date.now();
      if (wait > 0) { setTimeout(reveal, wait); return; }
      if (dead || !shell0) return;
      shell0.classList.add('cl-ready'); shell0.classList.remove('cl-booting');
      setTimeout(function () { var sp = shell0.querySelector('.cl-splash'); if (sp) sp.remove(); if (cm) cm.refresh(); }, 700);
    }
    setTimeout(reveal, 8000);   /* never stuck behind the welcome, even if the editor library hangs */
    load().then(function (CMg) { if (dead) return; startEditor(CMg); setStatus(''); reveal(); offerDraft(); })
      .catch(function (e) { console.warn('Code Lab editor:', e); setStatus('Simple editor (the full editor could not load).', '', true); reveal(); offerDraft(); });

    return {
      flush: function () { return flushSave(); },
      state: function () { return payload(); },
      setShare: setShare,
      shareBody: function () { return shareBox ? shareBox.querySelector('.cl-share-b') : null; },
      refresh: function () { if (cm) cm.refresh(); },
      destroy: function () {
        if (dead) return;
        if (dirty && canEdit) flushSave();
        if (dirty && canEdit) writeDraftNow();
        dead = true;
        closeShare();
        [saveTimer, previewTimer, statusTimer, presTimer, draftTimer].forEach(function (t) { if (t) clearTimeout(t); });
        if (beat) clearInterval(beat);
        unsubs.forEach(function (u) { try { u(); } catch (e) { } });
        if (collab && collab.presence && canEdit && me.uid) collab.presence.doc(me.uid).delete().catch(function () { });
        if (running && RUNNER) { runTok++; try { RUNNER.stop(); } catch (e) { } }
        var li = RUN_LISTENERS.indexOf(onRuntime); if (li !== -1) RUN_LISTENERS.splice(li, 1);
        window.removeEventListener('message', onMessage);
        window.removeEventListener('beforeunload', onLeave);
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
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

  /* ---------- Style ----------
     The Paisley IDE palette (img/IDE-COLOR PALLETES.jpg): Black #05080B base, Slate #0E1A24 depth,
     Cyan #00B4F0 accent, White for text and the light theme, and the black-to-cyan gradient. */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.cl-shell{--k-bg:#05080B;--k-panel:#0E1A24;--k-panel2:#132636;--k-hover:rgba(0,180,240,.10);--k-on:rgba(0,180,240,.18);--k-line:rgba(255,255,255,.08);--k-line2:rgba(0,180,240,.32);--k-text:#E8F1F6;--k-muted:#8FA3B3;--k-faint:#5B7385;--k-accent:#00B4F0;--k-accent-text:#33C4F4;--k-term:#03060A;--k-err:#FF6B6B;--k-ok:#3DDC97;--k-warn:#FFB86B;--k-folder:#E8B04B;',
      '  --t-kw:#00B4F0;--t-str:#9BE7C4;--t-num:#FFB86B;--t-com:#5B7385;--t-tag:#00B4F0;--t-attr:#A5E6FF;--t-def:#FFFFFF;--t-var2:#C3E8FF;--t-type:#7FDBFF;--t-prop:#C3E8FF;--t-op:#8FA3B3;--t-builtin:#FFD27A;--t-meta:#C6B3FF;',
      '  display:flex;flex-direction:column;border:1px solid var(--k-line);border-radius:14px;overflow:hidden;background:var(--k-bg);color:var(--k-text);position:relative;box-shadow:0 10px 30px rgba(5,8,11,.18)}',
      '.cl-shell[data-theme="light"]{--k-bg:#FFFFFF;--k-panel:#F3F8FB;--k-panel2:#E6F1F7;--k-hover:rgba(0,119,163,.07);--k-on:rgba(0,180,240,.16);--k-line:rgba(14,26,36,.12);--k-line2:rgba(0,150,200,.40);--k-text:#05080B;--k-muted:#4A5C6A;--k-faint:#8A9BA7;--k-accent:#00B4F0;--k-accent-text:#0077A3;--k-term:#F7FAFC;--k-err:#C62828;--k-ok:#1A7F5A;--k-warn:#9A5B00;--k-folder:#B7791F;',
      '  --t-kw:#0077A3;--t-str:#1A7F5A;--t-num:#B4501F;--t-com:#7A8C99;--t-tag:#0077A3;--t-attr:#8A5A00;--t-def:#05080B;--t-var2:#0E4C6E;--t-type:#0E5A8A;--t-prop:#0E4C6E;--t-op:#4A5C6A;--t-builtin:#7A4A00;--t-meta:#6B3FA0;box-shadow:0 10px 30px rgba(14,26,36,.10)}',
      /* the opening */
      '.cl-splash{position:absolute;inset:0;z-index:40;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 38%,#0E1A24 0%,#05080B 68%);color:#fff;transition:opacity .6s ease,transform .7s cubic-bezier(.2,.7,.2,1),filter .6s;pointer-events:none}',
      '.cl-shell[data-theme="light"] .cl-splash{background:radial-gradient(ellipse at 50% 38%,#E3F6FD 0%,#FFFFFF 70%);color:#05080B}',
      '.cl-sp-in{text-align:center;padding:0 1rem}',
      '.cl-sp-logo{width:54px;height:54px;margin:0 auto 1rem;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#0E1A24,#00B4F0);color:#fff;font-size:1.3rem;box-shadow:0 0 0 1px rgba(0,180,240,.35),0 10px 30px rgba(0,180,240,.25);animation:clPop .6s cubic-bezier(.2,.7,.2,1) both}',
      '.cl-sp-k{font-size:.64rem;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:#7FDBFF;animation:clRise .6s .1s both}.cl-shell[data-theme="light"] .cl-sp-k{color:#0077A3}',
      '.cl-sp-t{margin:.45rem 0 0;font-size:clamp(1.3rem,3.4vw,2.1rem);font-weight:800;letter-spacing:.02em;line-height:1.1}.cl-sp-t span{display:inline-block;animation:clRise .7s .18s both}.cl-sp-t .ac{color:#00B4F0;animation-delay:.32s}.cl-shell[data-theme="light"] .cl-sp-t .ac{color:#0077A3}',
      '.cl-sp-s{margin:.6rem 0 0;font-size:.9rem;font-weight:600;font-style:italic;opacity:.75;animation:clRise .7s .45s both}',
      '.cl-sp-bar{width:min(220px,60vw);height:3px;margin:1.2rem auto 0;border-radius:3px;background:rgba(0,180,240,.16);overflow:hidden;position:relative;animation:clRise .5s .55s both}',
      '.cl-sp-bar i{position:absolute;top:0;bottom:0;width:36%;border-radius:3px;background:linear-gradient(90deg,#0E1A24,#00B4F0,#E6F8FF);animation:clSlide 1.1s ease-in-out infinite}',
      '.cl-sp-l{margin-top:.55rem;font-size:.7rem;font-weight:700;opacity:.6;animation:clRise .5s .6s both}',
      '.cl-shell:not(.cl-cine) .cl-sp-logo,.cl-shell:not(.cl-cine) .cl-sp-k,.cl-shell:not(.cl-cine) .cl-sp-t span,.cl-shell:not(.cl-cine) .cl-sp-s,.cl-shell:not(.cl-cine) .cl-sp-bar,.cl-shell:not(.cl-cine) .cl-sp-l{animation-duration:.2s;animation-delay:0s}',
      '.cl-shell.cl-booting>.cl-head,.cl-shell.cl-booting>.cl-body{opacity:0;filter:blur(6px);transform:scale(.99)}',
      '.cl-shell>.cl-head,.cl-shell>.cl-body{transition:opacity .6s ease,filter .6s ease,transform .7s cubic-bezier(.2,.7,.2,1)}',
      '.cl-shell.cl-ready .cl-splash{opacity:0;transform:scale(1.05);filter:blur(6px)}',
      '.cl-docmode .cl-splash{display:none}.cl-docmode.cl-booting>.cl-head,.cl-docmode.cl-booting>.cl-body{opacity:1;filter:none;transform:none}',
      '@keyframes clRise{from{opacity:0;transform:translateY(12px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}',
      '@keyframes clPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}',
      '@keyframes clSlide{0%{left:-36%}100%{left:100%}}',
      /* head */
      '.cl-head{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.4rem .55rem;background:var(--k-panel);border-bottom:1px solid var(--k-line)}',
      '.cl-head::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,#05080B,#0E1A24 30%,#00B4F0 72%,#E6F8FF);opacity:.9;pointer-events:none}',
      '.cl-brand{display:inline-flex;align-items:center;gap:.45rem;flex:none;font-size:.78rem;font-weight:800;letter-spacing:.01em;white-space:nowrap;color:var(--k-text)}',
      '.cl-brand .lg{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:linear-gradient(135deg,#0E1A24,#00B4F0);color:#fff;font-size:.68rem;box-shadow:0 0 0 1px rgba(0,180,240,.35)}.cl-brand b span{color:var(--k-accent-text)}',
      '@media(max-width:520px){.cl-brand b{display:none}}',
      '.cl-crumb{flex:1;min-width:120px;font-weight:700;font-size:.8rem;color:var(--k-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cl-crumb i{margin-right:.2rem}',
      '.cl-actions{display:flex;gap:.3rem;flex-wrap:wrap;align-items:center}',
      '.cl-btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;padding:.36rem .62rem;border:1px solid var(--k-line);border-radius:8px;background:transparent;color:var(--k-text);font:inherit;font-weight:700;font-size:.74rem;cursor:pointer;transition:background .15s,border-color .15s,color .15s,transform .12s}',
      '.cl-btn:hover{border-color:var(--k-line2);background:var(--k-hover)}.cl-btn:active{transform:scale(.97)}.cl-btn:focus-visible{outline:2px solid var(--k-accent);outline-offset:1px}',
      '.cl-btn.cl-icon{width:31px;padding:.36rem 0}',
      '.cl-btn.cl-save{background:var(--k-panel2);border-color:var(--k-line2);color:var(--k-text)}',
      '.cl-btn.cl-run{background:var(--k-accent);border-color:var(--k-accent);color:#05080B;font-weight:800}.cl-btn.cl-run:hover{background:#33C4F4;border-color:#33C4F4}',
      '.cl-btn.cl-stop{background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.45);color:var(--k-err)}',
      '.cl-runwrap{display:inline-flex;align-items:center;gap:.3rem;height:31px;padding:0 .2rem 0 .5rem;border:1px solid var(--k-line);border-radius:8px;background:var(--k-bg);color:var(--k-muted);font-size:.72rem;margin:0}.cl-runwrap[hidden]{display:none}',
      '.cl-runsel{border:0;background:transparent;color:var(--k-text);font:inherit;font-weight:700;font-size:.74rem;max-width:150px;padding:.2rem;cursor:pointer;outline:none}.cl-runsel option{background:var(--k-panel);color:var(--k-text)}',
      '.cl-treebtn{display:none}',
      '.cl-up{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:.25rem;border:1px solid var(--k-line2);background:var(--k-on);color:var(--k-accent-text);border-radius:99px;padding:.05rem .45rem;font:inherit;font-size:.62rem;font-weight:800;cursor:pointer}.cl-up:hover{background:var(--k-accent);color:#05080B}.cl-up i{color:inherit!important;width:auto!important;opacity:1!important}',
      '.cl-up + .cl-node-acts{margin-left:.2rem}',
      /* full screen and dialogs */
      '.cl-shell.cl-full{position:fixed;inset:0;z-index:2000;border-radius:0;border:0}',
      '.cl-dlg{position:fixed;inset:0;z-index:3200;background:rgba(5,8,11,.55);display:grid;place-items:center;padding:16px}',
      '.cl-dlg-box{width:min(440px,100%);background:var(--k-panel);color:var(--k-text);border:1px solid var(--k-line2);border-radius:14px;padding:1rem 1.1rem;box-shadow:0 18px 50px rgba(0,0,0,.35);font-family:inherit}',
      '.cl-dlg-box p{margin:0 0 .7rem;font-size:.9rem;font-weight:600;line-height:1.4}',
      '.cl-dlg-box input{width:100%;box-sizing:border-box;padding:.55rem .7rem;border:1px solid var(--k-line2);border-radius:9px;font:13px ui-monospace,Menlo,Consolas,monospace;color:var(--k-text);background:var(--k-bg);outline:none}',
      '.cl-dlg-box input:focus{border-color:var(--k-accent);box-shadow:0 0 0 3px rgba(0,180,240,.2)}',
      '.cl-dlg-acts{display:flex;justify-content:flex-end;gap:.45rem;margin-top:.8rem}',
      '.cl-sharebtn.on{color:var(--k-accent-text);border-color:var(--k-line2);background:var(--k-on)}.cl-sharebtn.wait{color:var(--k-warn)}',
      '.cl-sharebox{width:min(500px,100%);padding:0;overflow:hidden;animation:clShareIn .3s cubic-bezier(.2,.9,.3,1.15) both}',
      '.cl-share-h{display:flex;gap:.7rem;align-items:flex-start;padding:1rem 1rem .85rem;border-bottom:1px solid var(--k-line)}',
      '.cl-share-h>div{flex:1;min-width:0}.cl-share-h b{display:block;font-size:.98rem}.cl-share-h small{display:block;color:var(--k-muted);font-size:.78rem;line-height:1.4;margin-top:.15rem}',
      '.cl-share-ic{flex:0 0 auto;width:36px;height:36px;border-radius:10px;background:var(--k-on);color:var(--k-accent-text);display:grid;place-items:center}',
      '.cl-share-b{padding:1rem;font-size:.86rem;line-height:1.5}',
      '.cl-share-b p{margin:0 0 .7rem}',
      '.cl-share-b .cl-shr-state{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:700;padding:.25rem .6rem;border-radius:20px;background:var(--k-on);color:var(--k-accent-text);margin-bottom:.6rem}',
      '.cl-share-b .cl-shr-state.wait{background:rgba(255,184,107,.14);color:var(--k-warn)}.cl-share-b .cl-shr-state.no{background:rgba(255,107,107,.12);color:var(--k-err)}',
      '.cl-share-b .cl-shr-note{border-left:3px solid var(--k-warn);background:var(--k-panel2);padding:.55rem .7rem;border-radius:8px;margin:0 0 .7rem}',
      '.cl-share-b .cl-shr-link{display:flex;gap:.4rem;margin:.2rem 0 .7rem}',
      '.cl-share-b .cl-shr-link input{flex:1;min-width:0;padding:.5rem .65rem;border:1px solid var(--k-line2);border-radius:8px;background:var(--k-bg);color:var(--k-text);font:12px ui-monospace,Menlo,Consolas,monospace}',
      '.cl-share-b .cl-shr-acts{display:flex;gap:.45rem;flex-wrap:wrap}',
      '.cl-share-b a.cl-btn{text-decoration:none}',
      '@keyframes clShareIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}',
      '.cl-shell.cl-full .cl-body,.cl-shell.cl-full .cl-body.cl-stacked{height:auto;flex:1;min-height:0}',
      '.cl-shell:fullscreen{width:100vw;height:100vh}',
      'html.cl-noscroll,html.cl-noscroll body{overflow:hidden}',
      '@media(max-width:860px){.cl-shell.cl-full .cl-body{grid-template-rows:minmax(0,1fr) 40vh}}',
      /* layout */
      '.cl-body{display:grid;grid-template-columns:230px minmax(0,1fr) minmax(0,1fr);height:min(72vh,620px);min-height:380px;background:var(--k-bg)}',
      '.cl-docmode .cl-body{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}',
      '.cl-body.cl-stacked{grid-template-columns:230px minmax(0,1fr);grid-template-rows:1fr 1fr}.cl-body.cl-stacked .cl-tree{grid-row:1 / span 2}',
      /* explorer */
      '.cl-tree{border-right:1px solid var(--k-line);background:var(--k-panel);display:flex;flex-direction:column;min-width:0;overflow:hidden}',
      '.cl-tree-h{padding:.5rem .7rem .2rem;font-size:.62rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--k-faint)}',
      '.cl-tree-acts{display:flex;flex-wrap:wrap;gap:.25rem;padding:.35rem .45rem .45rem;border-bottom:1px solid var(--k-line)}.cl-tree-acts .cl-btn{padding:.3rem .45rem;font-size:.68rem}',
      '.cl-tree-acts .cl-uplabel{border-color:var(--k-line2);color:var(--k-accent-text)}',
      '.cl-tree-list{flex:1;overflow:auto;padding:.25rem 0}',
      '.cl-tree-note{padding:.45rem .65rem;font-size:.68rem;color:var(--k-faint);font-weight:600;line-height:1.4;border-top:1px solid var(--k-line)}',
      '.cl-node{position:relative;display:flex;align-items:center;gap:.4rem;padding:.28rem .5rem;font-size:.78rem;font-weight:600;color:var(--k-text);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid transparent}',
      '.cl-node i{width:14px;text-align:center;color:var(--k-muted);flex:none}.cl-dir i{color:var(--k-folder)}.cl-asset i{color:var(--k-accent)}',
      '.cl-node i.cl-li,.cl-crumb i.cl-li{opacity:1;font-size:.95em}.CodeMirror-hint .cl-h-ic{width:1.1em;text-align:center;margin-right:.35em}',
      '.cl-badge{display:inline-grid;place-items:center;min-width:16px;height:14px;padding:0 2px;border-radius:3px;background:var(--c);color:#fff;font:800 8px/1 system-ui,sans-serif;letter-spacing:-.02em;flex:none;vertical-align:middle}',
      '.cl-node:hover{background:var(--k-hover)}.cl-node.on{background:var(--k-on);border-left-color:var(--k-accent)}',
      '.cl-root{font-weight:800;color:var(--k-muted);text-transform:uppercase;font-size:.68rem;letter-spacing:.06em}',
      '.cl-node-acts{margin-left:auto;display:none;gap:.1rem;flex:none}.cl-node:hover .cl-node-acts,.cl-node.on .cl-node-acts{display:inline-flex}',
      /* Touch screens have no hover: keep a folder's buttons showing so new file / upload can be found. */
      '@media(hover:none){.cl-dir .cl-node-acts{display:inline-flex}.cl-node-acts button{padding:.25rem .35rem;font-size:.8rem}}',
      '.cl-dir>.cl-dn,.cl-file>.cl-dn,.cl-asset>.cl-dn{overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.cl-tree.cl-drop{outline:2px dashed var(--k-accent);outline-offset:-4px;background:var(--k-hover)}',
      '.cl-node-acts button{border:0;background:transparent;padding:.1rem .25rem;cursor:pointer;color:var(--k-muted);font-size:.7rem}.cl-node-acts button:hover{color:var(--k-accent-text)}',
      /* editor */
      '.cl-edit-wrap{display:flex;flex-direction:column;border-right:1px solid var(--k-line);min-width:0;min-height:0;background:var(--k-bg)}',
      '.cl-tabs{display:flex;overflow-x:auto;overflow-y:hidden;background:var(--k-panel);border-bottom:1px solid var(--k-line);flex:none;scrollbar-width:thin}',
      '.cl-tab{display:inline-flex;align-items:center;gap:.4rem;padding:.42rem .55rem .42rem .7rem;border:0;border-right:1px solid var(--k-line);border-top:2px solid transparent;background:transparent;color:var(--k-muted);font:inherit;font-size:.74rem;font-weight:700;white-space:nowrap;cursor:pointer;flex:none}',
      '.cl-tab:hover{color:var(--k-text);background:var(--k-hover)}.cl-tab.on{background:var(--k-bg);color:var(--k-text);border-top-color:var(--k-accent)}',
      '.cl-tab .x{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;opacity:.45;font-size:.66rem}.cl-tab .x:hover{opacity:1;background:var(--k-hover)}',
      '.cl-banner{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;padding:.45rem .6rem;background:rgba(255,184,107,.12);border-bottom:1px solid rgba(255,184,107,.35);font-size:.76rem;font-weight:700;color:var(--k-text)}.cl-banner[hidden]{display:none}.cl-banner>span{flex:1;min-width:180px}.cl-banner>i{color:var(--k-warn)}',
      '.cl-suggest{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.45rem .6rem;background:var(--k-on);border-bottom:1px solid var(--k-line2);font-size:.76rem;font-weight:700;color:var(--k-text)}.cl-suggest[hidden]{display:none}.cl-suggest>span{flex:1;min-width:180px}',
      '.cl-edit-host{flex:1;min-height:0;position:relative}',
      '.cl-edit-host .CodeMirror{height:100%;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Menlo,Consolas,monospace;font-size:13.5px;line-height:1.6;background:var(--k-bg);color:var(--k-text)}',
      '.cl-shell .CodeMirror .CodeMirror-gutters{background:var(--k-bg);border-right:1px solid var(--k-line)}',
      '.cl-shell .CodeMirror .CodeMirror-linenumber{color:var(--k-faint)}',
      '.cl-shell .CodeMirror .CodeMirror-cursor{border-left:2px solid var(--k-accent)}',
      '.cl-shell .CodeMirror .CodeMirror-activeline-background{background:var(--k-panel)}',
      '.cl-shell .CodeMirror .CodeMirror-activeline .CodeMirror-gutter-elt{color:var(--k-accent-text)}',
      '.cl-shell .CodeMirror .CodeMirror-selected,.cl-shell .CodeMirror-focused .CodeMirror-selected{background:rgba(0,180,240,.26)}',
      '.cl-shell .CodeMirror .CodeMirror-matchingbracket{color:var(--k-accent)!important;background:rgba(0,180,240,.14);outline:1px solid var(--k-line2)}',
      '.cl-shell .CodeMirror .CodeMirror-matchingtag{background:rgba(0,180,240,.15)}',
      '.cl-shell .CodeMirror .cl-errline{background:rgba(255,107,107,.18)}',
      '.cl-shell .CodeMirror .cm-keyword{color:var(--t-kw)}.cl-shell .CodeMirror .cm-string,.cl-shell .CodeMirror .cm-string-2{color:var(--t-str)}',
      '.cl-shell .CodeMirror .cm-number,.cl-shell .CodeMirror .cm-atom{color:var(--t-num)}.cl-shell .CodeMirror .cm-comment{color:var(--t-com);font-style:italic}',
      '.cl-shell .CodeMirror .cm-tag{color:var(--t-tag)}.cl-shell .CodeMirror .cm-attribute,.cl-shell .CodeMirror .cm-qualifier{color:var(--t-attr)}',
      '.cl-shell .CodeMirror .cm-def{color:var(--t-def);font-weight:600}.cl-shell .CodeMirror .cm-variable{color:var(--k-text)}.cl-shell .CodeMirror .cm-variable-2{color:var(--t-var2)}',
      '.cl-shell .CodeMirror .cm-variable-3,.cl-shell .CodeMirror .cm-type{color:var(--t-type)}.cl-shell .CodeMirror .cm-property{color:var(--t-prop)}',
      '.cl-shell .CodeMirror .cm-operator,.cl-shell .CodeMirror .cm-bracket,.cl-shell .CodeMirror .cm-punctuation{color:var(--t-op)}.cl-shell .CodeMirror .cm-builtin{color:var(--t-builtin)}',
      '.cl-shell .CodeMirror .cm-meta{color:var(--t-meta)}.cl-shell .CodeMirror .cm-header{color:var(--t-tag);font-weight:800}.cl-shell .CodeMirror .cm-link{color:var(--t-tag)}.cl-shell .CodeMirror .cm-error{color:var(--k-err)}',
      '.cl-fallback{width:100%;height:100%;padding:.8rem 1rem;border:0;outline:none;resize:none;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;line-height:1.55;background:var(--k-bg);color:var(--k-text);tab-size:2;box-sizing:border-box}',
      '.cl-meta{display:flex;justify-content:space-between;gap:.6rem;align-items:center;padding:.3rem .8rem;background:var(--k-panel);border-top:1px solid var(--k-line);font-size:.68rem;color:var(--k-muted);font-weight:700}',
      '.cl-status{text-align:right}',
      /* output: preview and terminal */
      '.cl-preview-wrap{position:relative;min-width:0;min-height:0;background:var(--k-panel);display:flex;flex-direction:column}',
      '.cl-otabs{display:flex;gap:0;background:var(--k-panel);border-bottom:1px solid var(--k-line);flex:none}.cl-otabs[hidden]{display:none}',
      '.cl-otab{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .85rem;border:0;border-top:2px solid transparent;background:transparent;color:var(--k-muted);font:inherit;font-size:.74rem;font-weight:800;cursor:pointer}.cl-otab.on{color:var(--k-text);background:var(--k-bg);border-top-color:var(--k-accent)}',
      '.cl-prevpane{flex:1;display:flex;flex-direction:column;min-height:0}.cl-prevpane[hidden],.cl-termpane[hidden]{display:none}',
      '.cl-preview{flex:1;width:100%;min-height:200px;border:0;display:block;background:#fff}',
      '.cl-console{border-top:1px solid var(--k-line);background:var(--k-term);color:var(--k-text);font-size:.74rem}',
      '.cl-console summary{cursor:pointer;padding:.35rem .7rem;font-weight:800;color:var(--k-accent-text)}',
      '.cl-log{max-height:150px;overflow:auto;padding:0 .7rem .5rem;font-family:ui-monospace,Menlo,Consolas,monospace}',
      '.cl-logrow{padding:.15rem 0;border-bottom:1px solid var(--k-line);white-space:pre-wrap;word-break:break-word}.cl-logrow.error{color:var(--k-err)}.cl-logrow.warn{color:var(--k-warn)}',
      '.cl-termpane{flex:1;display:flex;flex-direction:column;min-height:0;background:var(--k-term)}',
      '.cl-term{flex:1;overflow:auto;padding:.7rem .85rem;font:12.5px/1.6 "JetBrains Mono","Cascadia Code",ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:var(--k-text);outline:none}',
      '.cl-t.err{color:var(--k-err)}.cl-t.echo{color:var(--k-accent-text);font-weight:700}',
      '.cl-sys{display:flex;align-items:center;gap:.5rem;margin:.35rem 0;padding:.3rem .55rem;border-radius:7px;background:var(--k-panel);font-family:inherit;font-size:.74rem;font-weight:700;color:var(--k-muted);white-space:normal}',
      '.cl-sys.run i{color:var(--k-accent)}.cl-sys.ok{color:var(--k-ok)}.cl-sys.bad{color:var(--k-err)}.cl-sys.ask{color:var(--k-accent-text);background:var(--k-on)}',
      '.cl-hint{display:flex;gap:.55rem;margin:.35rem 0 .6rem;padding:.55rem .65rem;border-radius:9px;border:1px solid var(--k-line2);background:var(--k-on);font-family:Quicksand,system-ui,sans-serif;font-size:.8rem;font-weight:600;line-height:1.45;white-space:normal;color:var(--k-text)}.cl-hint>i{color:#FFD27A;margin-top:.15rem}.cl-hint .cl-btn{margin-top:.4rem;font-size:.7rem}',
      '.cl-term-empty{font-family:Quicksand,system-ui,sans-serif;white-space:normal;color:var(--k-muted);font-size:.82rem;line-height:1.5}.cl-term-empty b{color:var(--k-text)}.cl-term-empty ul{margin:.5rem 0 0;padding-left:1.1rem}.cl-term-empty li{margin:.2rem 0}',
      '.cl-term-empty code,.cl-term-empty kbd{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.76rem;padding:.05rem .3rem;border-radius:4px;background:var(--k-panel);border:1px solid var(--k-line)}',
      '.cl-inrow{flex:none;border-top:1px solid var(--k-line2);background:var(--k-panel);padding:.5rem .6rem}.cl-inrow[hidden]{display:none}',
      '.cl-inq{display:block;font-size:.74rem;font-weight:800;color:var(--k-accent-text);margin-bottom:.35rem}',
      '.cl-inline{display:flex;align-items:center;gap:.4rem}.cl-inline>i{color:var(--k-accent)}',
      '.cl-in{flex:1;min-width:0;padding:.45rem .6rem;border:1px solid var(--k-line2);border-radius:8px;background:var(--k-bg);color:var(--k-text);font:13px ui-monospace,Menlo,Consolas,monospace;outline:none}.cl-in:focus{border-color:var(--k-accent);box-shadow:0 0 0 3px rgba(0,180,240,.2)}',
      /* live coding together */
      '.cl-people{display:flex;gap:.3rem;flex-wrap:wrap}',
      '.cl-person{display:inline-flex;align-items:center;gap:.3rem;padding:.15rem .5rem .15rem .15rem;border-radius:99px;background:var(--k-bg);border:1.5px solid var(--c);font-size:.68rem;font-weight:800;color:var(--k-text)}',
      '.cl-person b{width:18px;height:18px;border-radius:50%;background:var(--c);color:#fff;display:grid;place-items:center;font-size:.62rem}',
      '.cl-rcur{position:relative;border-left:2px solid var(--c);margin-left:-1px;height:1.3em;display:inline-block;vertical-align:text-bottom}',
      '.cl-rtag{position:absolute;bottom:100%;left:-2px;background:var(--c);color:#fff;font:700 10px/1.4 sans-serif;padding:0 4px;border-radius:3px 3px 3px 0;white-space:nowrap;pointer-events:none;z-index:5}',
      '.cl-rline{background:rgba(0,180,240,.07)}',
      /* suggestions (drawn on the page, or inside the IDE when full screen) */
      '.CodeMirror-hints{z-index:1000;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25)}',
      'html[data-cl-theme="dark"] .CodeMirror-hints{background:#0E1A24;border:1px solid rgba(0,180,240,.3)}html[data-cl-theme="dark"] .CodeMirror-hint{color:#E8F1F6}',
      '.CodeMirror-hint .cl-h-tag{display:inline-block;min-width:4.5em;font-weight:700}.CodeMirror-hint .cl-h-snip{margin-left:.8em;opacity:.6;font-size:11.5px}',
      /* Above the practice pop-up (600) and full screen (2000); CodeMirror's own sheet loads later and sets 10. */
      'body .CodeMirror-hints{z-index:3000!important;max-width:min(460px,90vw)}body .emmet-abbreviation-preview{z-index:3000!important}body li.CodeMirror-hint-active{background:#00B4F0!important;color:#05080B!important}.CodeMirror-hint{overflow:hidden;text-overflow:ellipsis}',
      '.emmet-abbreviation-preview{z-index:1000;background:#fff;border:1px solid #D6E9F4;border-radius:8px;padding:.4rem .6rem;box-shadow:0 8px 24px rgba(0,0,0,.12);font-size:12px}',
      'html[data-cl-theme="dark"] .emmet-abbreviation-preview{background:#0E1A24;border-color:rgba(0,180,240,.3);color:#E8F1F6}',
      /* small screens */
      '@media(max-width:860px){.cl-body,.cl-body.cl-stacked{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(300px,1fr) 300px;height:auto}.cl-docmode .cl-body{grid-template-columns:minmax(0,1fr)}',
      '  .cl-tree{display:none;position:absolute;z-index:20;top:44px;left:0;bottom:0;width:min(280px,85%);box-shadow:8px 0 24px rgba(0,0,0,.3)}.cl-tree-open .cl-tree{display:flex}.cl-treebtn{display:inline-flex}',
      '  .cl-edit-wrap{border-right:0;border-bottom:1px solid var(--k-line);min-height:300px}}',
      '@media(prefers-reduced-motion:reduce){.cl-btn,.cl-node{transition:none}.cl-shell>.cl-head,.cl-shell>.cl-body,.cl-splash{transition:opacity .2s!important;filter:none!important;transform:none!important}.cl-splash *{animation:none!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  g.CodeLab = {
    mount: mount, buildPreview: buildPreview, load: load, merge3: merge3, mdHtml: mdHtml, langOf: langOf, typeOfFile: typeOfFile,
    checkUpload: checkUpload, sniffBytes: sniffBytes, isProgram: isProgram, loadRuntime: loadRuntime, binaryFiles: binaryFiles, LANGS: LANGS, starterCode: starterCode, STARTER_NAMES: STARTER_NAMES,
    theme: readTheme, setTheme: setTheme
  };
})(window);
