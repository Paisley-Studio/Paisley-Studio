/* =========================================================
   Paisley Advanced IDE — runtime worker
   ---------------------------------------------------------
   Runs inside the opaque-origin sandbox (see ide-runner.js), never
   on the Paisley origin, so student code cannot reach the signed-in
   session, cookies, IndexedDB or Firestore.

   A module worker started from a data: URL (see ide-runner.js);
   runtimes come in through import().
   The same file runs as two workers:
     role 'tools' : language help (Jedi for Python, live checks) and the
                    C/C++ compiler (compiling is not running student code)
     role 'run'   : runs a program; Stop terminates this worker only

   Runtimes (WebAssembly, loaded lazily, bytes fetched through the
   parent so they are cached in Cache Storage):
     Python  Pyodide (+ Jedi)
     C, C++  YoWASP Clang/LLD -> wasm32-wasi, run with browser_wasi_shim
     PHP     php-wasm
   Java has no reliable browser compiler, so it runs on the Paisley code
   runner (Cloud Function -> isolated sandbox); not in this file.

   Input: lines typed in the Input tab are read first. When the page is
   cross-origin isolated, a program that wants more blocks on a
   SharedArrayBuffer until the student types a line in the terminal.
========================================================= */
'use strict';

let CFG = null;              // { role, urls, proxy: [prefixes] }
let ctl = null, buf = null;  // stdin SharedArrayBuffer views
const enc = new TextEncoder();
const post = (m, transfer) => self.postMessage(m, transfer || []);

/* ---------- runtime bytes come from the parent (cached there) ---------- */
const realFetch = self.fetch.bind(self);
let fetchSeq = 0;
const fetchWait = new Map();
function proxied(url) { return CFG && CFG.proxy.some(p => url.indexOf(p) === 0); }
self.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || '';
  if (!proxied(url) || (init && init.method && init.method !== 'GET')) return realFetch(input, init);
  return new Promise((resolve, reject) => {
    const id = ++fetchSeq;
    fetchWait.set(id, { resolve, reject });
    post({ t: 'fetch', id, url, lang: loadingLang });
  });
};
function fetched(m) {
  const w = fetchWait.get(m.id); if (!w) return;
  fetchWait.delete(m.id);
  if (!m.ok) return w.reject(new TypeError('Could not download ' + m.url + (m.error ? ' (' + m.error + ')' : '')));
  w.resolve(new Response(m.buf, { status: 200, headers: { 'content-type': m.type || 'application/octet-stream' } }));
}

/* ---------- input ---------- */
let queue = [];          // lines typed in the Input tab before Run
let interactive = false;
let runId = 0;
function nextLine() {
  if (queue.length) { const l = queue.shift(); post({ t: 'echo', id: runId, text: l }); return l; }
  if (!interactive || !ctl) return null;
  Atomics.store(ctl, 0, 0);
  post({ t: 'input', id: runId });
  Atomics.wait(ctl, 0, 0);
  if (Atomics.load(ctl, 0) === 2) return null;      // end of input
  const n = Atomics.load(ctl, 1);
  return new TextDecoder().decode(buf.slice(0, n));
}
function setInput(text, live) {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  queue = t ? t.replace(/\n$/, '').split('\n') : [];
  interactive = !!live && !!ctl;
}

/* ---------- output, streamed ---------- */
function streamer(stream) {
  const dec = new TextDecoder();
  return bytes => { if (bytes && bytes.length) post({ t: 'out', id: runId, stream, text: dec.decode(bytes, { stream: true }) }); };
}

/* ---------- loading ---------- */
let loadingLang = '';
const loaded = {};
function progress(lang, label) { post({ t: 'progress', lang, label }); }
/* Runtimes start one at a time (PHP's start-up briefly needs a stand-in document,
   which must not be there while Pyodide works out where it is running). */
let loadChain = Promise.resolve();
const KEY_LANG = { py: 'python', jedi: 'python', clang: 'cpp', php: 'php' };
function once(key, fn) {
  if (!loaded[key]) {
    /* When a runtime finishes loading, the page hears it is ready (ending any download progress). */
    loaded[key] = loadChain.then(fn).then(v => { progress(KEY_LANG[key] || key, ''); return v; }).catch(e => { delete loaded[key]; throw e; });
    loadChain = loaded[key].catch(() => {});
  }
  return loaded[key];
}

/* =========================================================
   Python (Pyodide)
========================================================= */
const PY_ROOT = '/home/pyodide/project';
const PY_HELPERS = `
import sys, os, json, runpy, traceback
__pz_root = ${JSON.stringify(PY_ROOT)}
def __pz_rel(p):
    p = str(p or '')
    return p[len(__pz_root) + 1:] if p.startswith(__pz_root + '/') else p
def __pz_run(entry):
    os.chdir(__pz_root)
    if __pz_root not in sys.path: sys.path.insert(0, __pz_root)
    for name, mod in list(sys.modules.items()):
        f = getattr(mod, '__file__', None) or ''
        if f.startswith(__pz_root + '/'): del sys.modules[name]
    try:
        runpy.run_path(entry, run_name='__main__')
        return json.dumps({'ok': True, 'code': 0})
    except SystemExit as e:
        c = e.code
        if c is None: code = 0
        elif isinstance(c, int): code = c
        else:
            print(c, file=sys.stderr); code = 1
        return json.dumps({'ok': code == 0, 'code': code})
    except BaseException as e:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if str(f.filename).startswith(__pz_root)]
        out = []
        if frames:
            out.append('Traceback (most recent call last):')
            for f in frames:
                out.append('  File "%s", line %s, in %s' % (__pz_rel(f.filename), f.lineno, f.name))
                if f.line: out.append('    ' + f.line.strip())
        file, line, col = None, None, None
        if isinstance(e, SyntaxError):
            file, line, col = __pz_rel(e.filename), e.lineno, e.offset
            out.append('  File "%s", line %s' % (file, line))
            if e.text: out.append('    ' + e.text.rstrip('\\n').strip())
            out.append('%s: %s' % (type(e).__name__, e.msg))
        else:
            if frames: file, line = __pz_rel(frames[-1].filename), frames[-1].lineno
            msg = str(e)
            out.append(type(e).__name__ + (': ' + msg if msg else ''))
        sys.stdout.flush()
        print('\\n'.join(out), file=sys.stderr)
        return json.dumps({'ok': False, 'code': 1, 'type': type(e).__name__, 'message': str(getattr(e, 'msg', '') or e), 'file': file, 'line': line, 'col': col})
`;
const PY_TOOLS = `
import jedi, json
__pz_proj = jedi.Project(__pz_root)
__pz_last = []
def __pz_script(path, code):
    return jedi.Script(code, path=__pz_root + '/' + path, project=__pz_proj)
def __pz_complete(path, code, line, col):
    global __pz_last
    __pz_last = __pz_script(path, code).complete(line, col)[:200]
    return json.dumps([[c.name, c.type, c.name_with_symbols, c.complete or ''] for c in __pz_last])
def __pz_detail(i):
    try:
        c = __pz_last[i]
        sigs = c.get_signatures()
        return json.dumps({'detail': sigs[0].to_string() if sigs else c.description, 'doc': c.docstring(raw=True)[:2500]})
    except Exception:
        return json.dumps({})
def __pz_sig(path, code, line, col):
    out = []
    for s in __pz_script(path, code).get_signatures(line, col)[:3]:
        out.append({'label': s.to_string(), 'params': [p.to_string() for p in s.params], 'index': s.index, 'doc': s.docstring(raw=True)[:1500]})
    return json.dumps(out)
def __pz_hover(path, code, line, col):
    sc = __pz_script(path, code)
    names = sc.help(line, col) or sc.infer(line, col)
    for n in names[:1]:
        sigs = n.get_signatures() if n.type in ('function', 'class') else []
        return json.dumps({'title': sigs[0].to_string() if sigs else n.description, 'doc': n.docstring(raw=True)[:2500], 'type': n.type})
    return 'null'
def __pz_check(path, code):
    out = []
    for e in __pz_script(path, code).get_syntax_errors()[:20]:
        out.append({'line': e.line, 'col': e.column + 1, 'endLine': e.until_line, 'endCol': e.until_column + 1, 'message': e.get_message()})
    return json.dumps(out)
`;
function loadPython(withJedi) {
  return once('py', async () => {
    loadingLang = 'python'; progress('python', 'Starting Python');
    const { loadPyodide } = await import(CFG.urls.pyodide + 'pyodide.mjs');
    const py = await loadPyodide({ indexURL: CFG.urls.pyodide, stdout: () => {}, stderr: () => {} });
    py.FS.mkdirTree(PY_ROOT);
    py.runPython(PY_HELPERS);
    return py;
  }).then(py => withJedi ? once('jedi', async () => {
    loadingLang = 'python'; progress('python', 'Loading Python suggestions (Jedi)');
    await py.loadPackage(['jedi'], { messageCallback: () => {} });
    py.runPython(PY_TOOLS);
    return py;
  }) : py);
}
function pyWriteFiles(py, files) {
  const keep = new Set();
  files.filter(f => !f.binary).forEach(f => {
    const p = PY_ROOT + '/' + f.name;
    keep.add(p);
    py.FS.mkdirTree(p.slice(0, p.lastIndexOf('/')));
    py.FS.writeFile(p, f.content);
  });
  /* forget files deleted in the IDE */
  (function walk(dir) {
    let names = [];
    try { names = py.FS.readdir(dir); } catch (e) { return; }
    names.forEach(n => {
      if (n === '.' || n === '..' || n === '__pycache__') return;
      const p = dir + '/' + n, st = py.FS.stat(p);
      if (py.FS.isDir(st.mode)) walk(p);
      else if (!keep.has(p)) { try { py.FS.unlink(p); } catch (e) {} }
    });
  })(PY_ROOT);
}
async function runPython(m) {
  const py = await loadPython(false);
  pyWriteFiles(py, m.files);
  const code = m.files.filter(f => /\.py$/i.test(f.name)).map(f => f.content).join('\n');
  try {
    loadingLang = 'python';
    await py.loadPackagesFromImports(code, { messageCallback: s => { if (/^Loading /.test(s)) progress('python', s); } });
  } catch (e) { /* an unknown import fails later with a clear ModuleNotFoundError */ }
  post({ t: 'started', id: runId });
  py.setStdout({ write: streamerBytes('stdout'), isatty: true });
  py.setStderr({ write: streamerBytes('stderr'), isatty: true });
  /* isatty false: otherwise input() writes its prompt to stderr, like a terminal would. */
  py.setStdin({ stdin: () => { const l = nextLine(); return l === null ? undefined : l + '\n'; }, isatty: false });
  const res = JSON.parse(py.globals.get('__pz_run')(PY_ROOT + '/' + m.entry));
  return res;
}
function streamerBytes(stream) {
  const s = streamer(stream);
  return bytes => { s(bytes); return bytes.length; };
}

/* =========================================================
   C / C++ (YoWASP Clang -> WASI)
========================================================= */
const C_EXT = /\.c$/i, CPP_EXT = /\.(cpp|cc|cxx)$/i, HDR_EXT = /\.(h|hpp|hh|hxx|inc)$/i;
function loadClang() {
  return once('clang', async () => {
    loadingLang = 'cpp'; progress('cpp', 'Starting the C/C++ compiler');
    const mod = await import(CFG.urls.clang);
    /* The bundle fetches the compiler itself (about 18 MB) on its first run, so warm it with a
       tiny compile: "ready" then really means ready, and the download shows its progress. */
    await mod.runClang(['clang', '-fsyntax-only', 'warm.c'], { 'warm.c': 'int main(void) { return 0; }\n' }, { stderr: () => {}, stdout: () => {} });
    return mod;
  });
}
function tree(files) {
  const root = {};
  files.filter(f => !f.binary).forEach(f => {
    const parts = f.name.split('/'); let d = root;
    parts.slice(0, -1).forEach(p => { d = d[p] = d[p] && typeof d[p] === 'object' && !(d[p] instanceof Uint8Array) ? d[p] : {}; });
    d[parts[parts.length - 1]] = f.content;
  });
  return root;
}
function clangDiagnostics(text) {
  const out = [];
  String(text || '').split('\n').forEach(l => {
    const m = /^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/.exec(l);
    if (m) out.push({ file: m[1].replace(/^\.\//, ''), line: +m[2], col: +m[3], severity: m[4] === 'fatal error' ? 'error' : m[4], message: m[5] });
  });
  return out;
}
async function compileC(m) {
  const { runClang } = await loadClang();
  const cpp = m.lang === 'cpp';
  const sources = m.check ? [m.check] : m.files.filter(f => (cpp ? CPP_EXT : C_EXT).test(f.name)).map(f => f.name);
  if (!sources.length) return { ok: false, stderr: 'There is no ' + (cpp ? '.cpp' : '.c') + ' file to compile.', diagnostics: [] };
  const args = [cpp ? 'clang++' : 'clang', cpp ? '-std=c++17' : '-std=c17', '-Wall', '-fno-color-diagnostics'];
  if (cpp) args.push('-fno-exceptions');
  if (m.check) args.push('-fsyntax-only', m.check);
  else args.push('-O1', ...sources, '-o', 'program.wasm');
  let err = '';
  const opts = { stderr: b => { if (b) err += new TextDecoder().decode(b); }, stdout: b => { if (b) err += new TextDecoder().decode(b); } };
  try {
    const out = await runClang(args, tree(m.files), opts);
    const wasm = m.check ? null : out['program.wasm'];
    return { ok: true, stderr: err, diagnostics: clangDiagnostics(err), wasm };
  } catch (e) {
    if (e && typeof e.code === 'number') return { ok: false, stderr: err, diagnostics: clangDiagnostics(err) };
    throw e;
  }
}
let wasiMod = null;
async function runWasi(m) {
  if (!wasiMod) { loadingLang = m.lang; wasiMod = await import(CFG.urls.wasi); }
  const { WASI, Fd, File, PreopenDirectory, Directory, wasi: W } = wasiMod;
  class Stdin extends Fd {
    constructor() { super(); this.pending = new Uint8Array(0); }
    fd_fdstat_get() { return { ret: 0, fdstat: new W.Fdstat(W.FILETYPE_CHARACTER_DEVICE, 0) }; }
    fd_read(size) {
      if (!this.pending.length) {
        const l = nextLine();
        if (l === null) return { ret: 0, data: new Uint8Array(0) };
        this.pending = enc.encode(l + '\n');
      }
      const data = this.pending.slice(0, size);
      this.pending = this.pending.slice(data.length);
      return { ret: 0, data };
    }
  }
  class Out extends Fd {
    constructor(stream) { super(); this.s = streamer(stream); }
    fd_fdstat_get() { const f = new W.Fdstat(W.FILETYPE_CHARACTER_DEVICE, 0); f.fs_rights_base = BigInt(W.RIGHTS_FD_WRITE); return { ret: 0, fdstat: f }; }
    fd_write(data) { this.s(data); return { ret: 0, nwritten: data.byteLength }; }
  }
  function dir(files) {
    const root = new Map();
    files.filter(f => !f.binary).forEach(f => {
      const parts = f.name.split('/'); let d = root;
      parts.slice(0, -1).forEach(p => { if (!d.get(p)) d.set(p, new Directory(new Map())); d = d.get(p).contents; });
      d.set(parts[parts.length - 1], new File(enc.encode(f.content)));
    });
    return root;
  }
  const wasi = new WASI([m.entry || 'program'], [], [new Stdin(), new Out('stdout'), new Out('stderr'), new PreopenDirectory('.', dir(m.files))]);
  const module = await WebAssembly.compile(m.wasm);
  const inst = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  post({ t: 'started', id: runId });
  try {
    const code = wasi.start(inst);
    return { ok: code === 0, code };
  } catch (e) {
    const msg = String(e && e.message || e);
    post({ t: 'out', id: runId, stream: 'stderr', text: '\nThe program crashed: ' + msg + '\n' });
    return { ok: false, code: 134, type: 'crash', message: msg };
  }
}

/* =========================================================
   PHP (php-wasm)
========================================================= */
const PHP_ROOT = '/project';
function loadPhp() {
  return once('php', async () => {
    loadingLang = 'php'; progress('php', 'Starting PHP');
    /* The web build reads window/document once while it starts (for canvas features we do
       not use). A worker has neither, so a bare stand-in exists only while PHP starts. */
    const stub = !self.document;
    if (stub) {
      const none = () => null;
      self.window = self;
      self.document = { addEventListener() {}, removeEventListener() {}, getElementById: none, querySelector: none, body: null, fullscreenEnabled: false };
    }
    try {
      /* PhpBase, not PhpWeb: PhpWeb wraps every run in Web Locks and an IndexedDB sync,
         neither of which an opaque-origin sandbox may use (nor needs). */
      const base = CFG.urls.php.replace(/[^/]+$/, '');
      const { PhpBase } = await import(base + 'PhpBase.mjs');
      const php = new PhpBase(import(base + 'php8.4-web.mjs'), { version: '8.4' });
      await php.binary;
      return php;
    } finally {
      if (stub) { delete self.window; delete self.document; }
    }
  });
}
const PHP_PRELUDE = "<?php if(!defined('STDIN'))define('STDIN',fopen('php://stdin','r'));if(!defined('STDOUT'))define('STDOUT',fopen('php://stdout','w'));if(!defined('STDERR'))define('STDERR',fopen('php://stderr','w'));" +
  "if(!function_exists('__pz_readline')){function __pz_readline($p=''){if($p!=='')echo $p;$l=fgets(STDIN);return $l===false?false:rtrim($l,\"\\r\\n\");}}";
/* readline() waits forever in this build; it is pointed at STDIN instead (same line, so line numbers stay true). */
function phpSource(src) { return String(src).replace(/(^|[^\w$>:\\])readline\s*\(/g, '$1__pz_readline('); }
async function phpFs(php, files) {
  const bin = await php.binary, FS = bin.FS;
  (function rm(d) {
    let names = []; try { names = FS.readdir(d); } catch (e) { return; }
    names.forEach(n => { if (n === '.' || n === '..') return; const p = d + '/' + n; if (FS.isDir(FS.stat(p).mode)) { rm(p); FS.rmdir(p); } else FS.unlink(p); });
  })(PHP_ROOT);
  try { FS.mkdir(PHP_ROOT); } catch (e) {}
  files.filter(f => !f.binary).forEach(f => {
    const p = PHP_ROOT + '/' + f.name, parts = f.name.split('/');
    let d = PHP_ROOT; parts.slice(0, -1).forEach(x => { d += '/' + x; try { FS.mkdir(d); } catch (e) {} });
    FS.writeFile(p, /\.php$/i.test(f.name) ? phpSource(f.content) : f.content);
  });
}
function phpClean(s) { return String(s).replace(/php-wasm run script/g, 'the runner').replace(new RegExp(PHP_ROOT + '/', 'g'), ''); }
async function runPhp(m) {
  const php = await loadPhp();
  await php.refresh();
  await phpFs(php, m.files);
  /* PHP reads stdin one byte at a time through buffers.stdin.shift(). buffers is frozen, but the
     array in it is not, so it gets its own shift that fetches a line when it runs dry.
     Emscripten keeps asking for bytes until it gets "nothing more" (null), so after each line
     we say exactly that; null with nothing read yet means the end of input. */
  const q = php.buffers.stdin;
  let lineDone = false;
  q.length = 0;
  q.shift = function () {
    if (!this.length) {
      if (lineDone) { lineDone = false; return undefined; }
      try { php.flush(); } catch (e) {}
      const l = nextLine();
      if (l === null) return undefined;
      Array.prototype.push.apply(this, Array.from(enc.encode(l + '\n')));
    }
    const b = Array.prototype.shift.call(this);
    if (!this.length) lineDone = true;
    return b;
  };
  const onOut = e => post({ t: 'out', id: runId, stream: 'stdout', text: phpClean([].concat(e.detail).join('')) });
  const onErr = e => post({ t: 'out', id: runId, stream: 'stderr', text: phpClean([].concat(e.detail).join('')) });
  php.addEventListener('output', onOut); php.addEventListener('error', onErr);
  post({ t: 'started', id: runId });
  try {
    const code = await php.run(PHP_PRELUDE + 'chdir(' + JSON.stringify(PHP_ROOT) + ');require ' + JSON.stringify(PHP_ROOT + '/' + m.entry) + ';');
    try { php.flush(); } catch (e) {}
    return { ok: !code, code: code || 0 };
  } finally {
    php.removeEventListener('output', onOut); php.removeEventListener('error', onErr);
  }
}
async function checkPhp(m) {
  const php = await loadPhp();
  let out = '';
  const on = e => { out += [].concat(e.detail).join(''); };
  php.addEventListener('output', on);
  try {
    await php.run('<?php try{token_get_all(' + JSON.stringify(m.code) + ',TOKEN_PARSE);echo "@@OK";}catch(\\ParseError $e){echo "@@ERR",$e->getLine(),"|",$e->getMessage();}');
  } finally { php.removeEventListener('output', on); }
  const r = /@@ERR(\d+)\|([^\n]*)/.exec(out);
  return r ? [{ line: +r[1], col: 1, message: r[2] }] : [];
}

/* =========================================================
   Messages
========================================================= */
async function handle(m) {
  if (m.t === 'init') {
    CFG = m.cfg;
    if (m.stdin) { ctl = new Int32Array(m.stdin, 0, 2); buf = new Uint8Array(m.stdin, 8); }
    return;
  }
  if (m.t === 'fetched') return fetched(m);
  const reply = (data, transfer) => post(Object.assign({ t: 'result', id: m.id }, data), transfer);
  try {
    if (m.t === 'warm') {
      if (m.lang === 'python') await loadPython(CFG.role === 'tools');
      else if (m.lang === 'c' || m.lang === 'cpp') await loadClang();
      else if (m.lang === 'php') await loadPhp();
      progress(m.lang, '');
      return reply({ ok: true });
    }
    if (m.t === 'run') {
      runId = m.id; setInput(m.stdin, m.live);
      let res;
      if (m.lang === 'python') res = await runPython(m);
      else if (m.lang === 'php') res = await runPhp(m);
      else if (m.lang === 'wasi') res = await runWasi(m);
      else throw new Error('This worker cannot run ' + m.lang);
      progress(m.lang === 'wasi' ? 'cpp' : m.lang, '');
      return post({ t: 'done', id: m.id, res });
    }
    if (m.t === 'compile') {
      const r = await compileC(m);
      progress('cpp', '');
      return reply(r, r.wasm ? [r.wasm.buffer] : []);
    }
    if (m.t === 'py') {
      const py = await loadPython(true);
      if (m.files) pyWriteFiles(py, m.files);
      const fn = py.globals.get('__pz_' + m.op);
      const out = fn(...m.args);
      fn.destroy && fn.destroy();
      return reply({ ok: true, data: JSON.parse(out) });
    }
    if (m.t === 'phpcheck') return reply({ ok: true, data: await checkPhp(m) });
  } catch (e) {
    const msg = String(e && (e.message || e)) || 'Unknown error';
    if (m.t === 'run') return post({ t: 'done', id: m.id, res: { ok: false, code: 1, type: 'runtime', message: msg, failed: true } });
    return reply({ ok: false, error: msg });
  }
}
self.onmessage = e => { handle(e.data); };
