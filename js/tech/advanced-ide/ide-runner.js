/* =========================================================
   Paisley Advanced IDE — execution providers
   ---------------------------------------------------------
   One provider per language, so no language depends on another's engine:

     web      HTML / CSS / JavaScript   live preview (sandboxed iframe, CodeLab.buildPreview)
     python   Python                    Pyodide (WebAssembly) in the sandbox
     c, cpp   C, C++                    YoWASP Clang -> wasm32-wasi, run in the sandbox
     php      PHP                       php-wasm (WebAssembly) in the sandbox
     java     Java                      Paisley code runner: the runCode Cloud Function
                                        forwards to an isolated Judge0-compatible sandbox.
                                        Never runs on the Paisley servers themselves.

   The sandbox is an iframe with sandbox="allow-scripts" (an opaque
   origin: no cookies, no IndexedDB, no Firebase session). Its two Web
   Workers (runner-worker.js) do the work. That matters when a coach runs
   a builder's code: the code cannot read the coach's sign-in.

   Runtime downloads go through this page (fetchRuntime), which keeps
   them in Cache Storage and reports real progress. Only the pinned
   runtime URLs below may be fetched this way.

   PaisleyRunner.create({ onProgress(lang, info) }) -> runner
     runner.ready                       Promise<{ isolated }>
     runner.run(opts, handlers)         Promise<result>
     runner.input(text) / runner.endInput() / runner.stop()
     runner.compile(lang, files, check) Promise<{ ok, diagnostics, stderr }>
     runner.py(op, args, files)         Python language help (Jedi)
     runner.phpCheck(code)              PHP syntax check
     runner.warm(lang)                  start downloading a runtime
     runner.state(lang)                 'idle' | 'loading' | 'ready' | 'error'
========================================================= */
(function (g) {
  'use strict';

  var URLS = {
    pyodide: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',
    clang: 'https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/bundle.js',
    wasi: 'https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js',
    php: 'https://cdn.jsdelivr.net/npm/php-wasm@0.2.0/PhpWeb.mjs'
  };
  var PROXY = [URLS.pyodide, URLS.clang.replace(/[^/]+$/, ''), URLS.php.replace(/[^/]+$/, '')];
  /* Real sizes of the big downloads (they arrive compressed, so Content-Length cannot be used). */
  var SIZES = {
    'llvm.core.wasm': 75532134, 'llvm-resources.tar': 29665280
  };
  var CACHE = 'paisley-ide-runtimes-v1';
  var WORKER_URL = '/js/tech/advanced-ide/runner-worker.js?v=2';
  var LANG_NAME = { python: 'Python', c: 'C', cpp: 'C/C++', php: 'PHP', java: 'Java' };

  function typeOf(url) {
    if (/\.wasm(\?|$)/.test(url)) return 'application/wasm';
    if (/\.m?js(\?|$)/.test(url)) return 'text/javascript';
    if (/\.json(\?|$)/.test(url)) return 'application/json';
    return 'application/octet-stream';
  }
  function mb(n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1); }

  /* Fetches a pinned runtime file, from Cache Storage when we have it. */
  function fetchRuntime(url, onBytes) {
    if (!PROXY.some(function (p) { return url.indexOf(p) === 0; })) return Promise.reject(new Error('Not a runtime file'));
    var cacheP = (g.caches && g.caches.open) ? g.caches.open(CACHE).catch(function () { return null; }) : Promise.resolve(null);
    return cacheP.then(function (cache) {
      return (cache ? cache.match(url) : Promise.resolve(null)).then(function (hit) {
        if (hit) return hit.arrayBuffer().then(function (b) { onBytes(b.byteLength, b.byteLength, true); return b; });
        return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var base = url.split('/').pop().split('?')[0];
          var total = SIZES[base] || (res.headers.get('content-encoding') ? 0 : +res.headers.get('content-length') || 0);
          if (!res.body || !res.body.getReader) return res.arrayBuffer();
          var reader = res.body.getReader(), parts = [], got = 0;
          return (function pump() {
            return reader.read().then(function (r) {
              if (r.done) {
                var out = new Uint8Array(got), at = 0;
                parts.forEach(function (p) { out.set(p, at); at += p.length; });
                onBytes(got, got, false);
                return out.buffer;
              }
              parts.push(r.value); got += r.value.length; onBytes(got, total, false);
              return pump();
            });
          })();
        }).then(function (b) {
          if (cache) cache.put(url, new Response(b.slice(0), { headers: { 'content-type': typeOf(url) } })).catch(function () { });
          return b;
        });
      });
    });
  }

  /* The sandbox page: makes the workers and passes messages both ways. */
  var SANDBOX = '<!DOCTYPE html><meta charset="utf-8"><script>(function(){' +
    'var P=parent,W={},SRC=null,CFG=null,ISO=!!(self.crossOriginIsolated&&typeof SharedArrayBuffer==="function");' +
    'function tr(m){var t=[];if(m&&m.buf instanceof ArrayBuffer)t.push(m.buf);if(m&&m.wasm&&m.wasm.buffer instanceof ArrayBuffer)t.push(m.wasm.buffer);return t}' +
    /* A module worker from a data: URL: a blob: module worker cannot start from an opaque origin,
       and Pyodide refuses classic workers. */
    'function make(role){var w=new Worker("data:text/javascript;charset=utf-8,"+encodeURIComponent(SRC),{type:"module"});var s=ISO?new SharedArrayBuffer(8+65536):null;w._s=s;' +
    'w.onmessage=function(e){var m=e.data;m.role=role;P.postMessage(m,"*",tr(m))};' +
    'w.onerror=function(e){e.preventDefault&&e.preventDefault();P.postMessage({t:"crash",role:role,message:(e&&e.message)||"The runtime stopped unexpectedly."},"*")};' +
    'w.postMessage({t:"init",cfg:Object.assign({},CFG,{role:role}),stdin:s});W[role]=w;return w}' +
    'addEventListener("message",function(e){if(e.source!==P)return;var m=e.data||{};' +
    'if(m.t==="boot"){SRC=m.src;CFG=m.cfg;P.postMessage({t:"booted",isolated:ISO},"*");return}' +
    'if(m.t==="stdin"){var w=W.run;if(!w||!w._s)return;var c=new Int32Array(w._s,0,2),b=new Uint8Array(w._s,8);' +
    'if(m.eof)Atomics.store(c,0,2);else{var x=new TextEncoder().encode(m.text||"").slice(0,65536);b.set(x);Atomics.store(c,1,x.length);Atomics.store(c,0,1)}Atomics.notify(c,0);return}' +
    'if(m.t==="kill"){if(W[m.role]){W[m.role].terminate();delete W[m.role]}return}' +
    'var t=W[m.role]||make(m.role);t.postMessage(m,tr(m))});' +
    'P.postMessage({t:"hello"},"*")})();<\/script>';

  function create(o) {
    o = o || {};
    var frame = null, win = null, seq = 0, pending = {}, current = null, states = {}, dl = {};
    var readyResolve, readyReject;
    var ready = new Promise(function (res, rej) { readyResolve = res; readyReject = rej; });
    var isolated = false;

    function setState(lang, s, info) {
      states[lang] = s;
      if (o.onProgress) o.onProgress(lang, Object.assign({ state: s }, info || {}));
    }

    /* Download progress per language, summed over that language's files. */
    function onBytes(lang, url, got, total, cached) {
      var d = dl[lang] = dl[lang] || {};
      d[url] = { got: got, total: total || 0, cached: cached };
      var sumGot = 0, sumTotal = 0, unknown = false;
      Object.keys(d).forEach(function (k) { sumGot += d[k].got; if (d[k].total) sumTotal += Math.max(d[k].total, d[k].got); else unknown = true; });
      /* Files arrive compressed, so a known total gives a percentage; otherwise the amount so far. */
      var pct = sumTotal && !unknown ? Math.min(99, Math.round(sumGot / sumTotal * 100)) : null;
      setState(lang, 'loading', { pct: pct, label: (cached ? 'Opening ' : 'Downloading ') + (LANG_NAME[lang] || lang) + (pct != null ? ' · ' + pct + '%' : ' · ' + mb(sumGot) + ' MB') });
    }

    function boot() {
      if (!g.WebAssembly || !g.Worker) { readyReject(new Error('This browser cannot run code here. Try the latest Chrome, Edge, Firefox or Safari.')); return; }
      frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('allow', 'cross-origin-isolated');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      frame.title = 'Code runner';
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      frame.srcdoc = SANDBOX;
      document.body.appendChild(frame);
      win = frame.contentWindow;
    }

    g.addEventListener('message', function (e) {
      if (!frame || e.source !== frame.contentWindow) return;
      var m = e.data || {};
      if (m.t === 'hello') {
        fetch(WORKER_URL, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(function (src) { win.postMessage({ t: 'boot', src: src, cfg: { urls: URLS, proxy: PROXY } }, '*'); })
          .catch(function (er) { readyReject(new Error('Could not start the code runner (' + er.message + ').')); });
        return;
      }
      if (m.t === 'booted') { isolated = !!m.isolated; readyResolve({ isolated: isolated }); return; }
      if (m.t === 'fetch') {
        var lang = m.lang || 'python';
        fetchRuntime(m.url, function (got, total, cached) { onBytes(lang, m.url, got, total, cached); })
          .then(function (b) { win.postMessage({ t: 'fetched', role: m.role, id: m.id, ok: true, url: m.url, buf: b, type: typeOf(m.url) }, '*', [b]); })
          .catch(function (er) { win.postMessage({ t: 'fetched', role: m.role, id: m.id, ok: false, url: m.url, error: er.message }, '*'); });
        return;
      }
      if (m.t === 'progress') {
        if (m.label) setState(m.lang, 'loading', { label: m.label, pct: null });
        else { dl[m.lang] = {}; setState(m.lang, 'ready', {}); if (m.lang === 'cpp') setState('c', 'ready', {}); }
        return;
      }
      if (m.t === 'crash') {
        if (current && current.role === m.role) finish({ ok: false, code: 1, type: 'runtime', message: m.message, failed: true, restart: true });
        reset(m.role);
        return;
      }
      if (current && m.id === current.id) {
        if (m.t === 'out') current.h.out && current.h.out(m.stream, m.text);
        else if (m.t === 'echo') current.h.echo && current.h.echo(m.text);
        else if (m.t === 'input') current.h.input && current.h.input();
        else if (m.t === 'started') current.h.started && current.h.started();
        else if (m.t === 'done') finish(m.res);
        return;
      }
      if (m.t === 'result' && pending[m.id]) {
        var p = pending[m.id]; delete pending[m.id];
        if (m.ok === false && m.restart) reset(p.role);
        if (m.ok === false && m.error) { var er = new Error(m.error); er.restart = !!m.restart; p.reject(er); } else p.resolve(m);
      }
    });

    /* Throws a worker away (its runtime broke, or it was stopped). The next call starts a fresh one,
       which loads its runtime again from Cache Storage. */
    function reset(role) {
      if (win) win.postMessage({ t: 'kill', role: role }, '*');
      Object.keys(pending).forEach(function (id) {
        if (pending[id].role !== role) return;
        var p = pending[id]; delete pending[id];
        var er = new Error('The runtime restarted.'); er.restart = true; p.reject(er);
      });
      if (role === 'tools') {
        ['python', 'cpp', 'c', 'php'].forEach(function (l) { if (states[l]) setState(l, 'idle', {}); });
        if (o.onReset) o.onReset(role);
      }
    }

    function call(role, msg, transfer) {
      return ready.then(function () {
        return new Promise(function (resolve, reject) {
          var id = ++seq;
          pending[id] = { resolve: resolve, reject: reject, role: role };
          win.postMessage(Object.assign({ role: role, id: id }, msg), '*', transfer || []);
        });
      });
    }

    function finish(res) {
      var c = current; if (!c) return;
      current = null;
      if (res && res.restart && c.role === 'run') reset('run');
      c.resolve(res || { ok: false, code: 1 });
    }

    function remote(opts) {
      if (!g.firebase || !firebase.functions) return Promise.resolve({ ok: false, failed: true, message: 'The Paisley code runner is not available on this page.' });
      var fn = firebase.functions().httpsCallable('runCode', { timeout: 75000 });
      return fn({ language: opts.lang, entry: opts.entry, stdin: opts.stdin || '', files: opts.files.filter(function (f) { return !f.binary; }).map(function (f) { return { name: f.name, content: f.content }; }) })
        .then(function (r) { return r.data; })
        .catch(function (e) {
          var code = String(e && e.code || '');
          if (/failed-precondition/.test(code)) return { ok: false, failed: true, notConfigured: true, message: e.message };
          if (/resource-exhausted/.test(code)) return { ok: false, failed: true, message: e.message || 'You have run a lot of programs in a short time. Wait a minute and try again.' };
          if (/unavailable|deadline|internal/.test(code)) return { ok: false, failed: true, message: 'The Paisley code runner could not be reached. Check your connection and try again.' };
          return { ok: false, failed: true, message: (e && e.message) || 'The program could not be sent to the code runner.' };
        });
    }

    /* opts: { lang, files, entry, stdin, live }
       h:    { out(stream, text), echo(text), input(), started(), phase(name) } */
    function run(opts, h) {
      h = h || {};
      if (current) stop();
      if (opts.lang === 'java') {
        h.phase && h.phase('remote');
        var token = {};
        current = { id: -1, role: 'remote', h: h, token: token };
        return new Promise(function (resolve) {
          current.resolve = resolve;
          remote(opts).then(function (res) {
            if (!current || current.token !== token) return;
            if (res.stdout) h.out && h.out('stdout', res.stdout);
            if (res.stderr) h.out && h.out('stderr', res.stderr);
            finish(res);
          });
        });
      }
      var exec = function (msg, transfer) {
        return ready.then(function () {
          return new Promise(function (resolve) {
            var id = ++seq;
            current = { id: id, role: 'run', h: h, resolve: resolve };
            setState(opts.lang, states[opts.lang] === 'ready' ? 'ready' : 'loading', { label: 'Starting ' + (LANG_NAME[opts.lang] || opts.lang), pct: null });
            win.postMessage(Object.assign({ t: 'run', role: 'run', id: id, stdin: opts.stdin || '', live: !!opts.live, files: opts.files, entry: opts.entry }, msg), '*', transfer || []);
          });
        });
      };
      if (opts.lang === 'c' || opts.lang === 'cpp') {
        h.phase && h.phase('compile');
        var stopped = false;
        current = { id: -2, role: 'tools', h: h, resolve: function (r) { stopped = true; compileDone(r); } };
        var compileDone;
        return new Promise(function (resolve) {
          compileDone = resolve;
          compile(opts.lang, opts.files).then(function (r) {
            if (stopped) return;
            current = null;
            if (!r.ok) return resolve({ ok: false, code: 1, phase: 'compile', diagnostics: r.diagnostics, stderr: r.stderr });
            if (r.stderr) h.out && h.out('stderr', r.stderr);
            h.phase && h.phase('run');
            exec({ lang: 'wasi', wasm: r.wasm, entry: opts.entry }, [r.wasm.buffer]).then(function (res) { res.diagnostics = r.diagnostics; resolve(res); });
          }).catch(function (e) { if (!stopped) { current = null; resolve({ ok: false, code: 1, failed: true, message: e.message }); } });
        });
      }
      h.phase && h.phase('run');
      return exec({ lang: opts.lang });
    }

    function stop() {
      if (!current) return;
      var role = current.role;
      if (role === 'run' || role === 'tools') win.postMessage({ t: 'kill', role: role }, '*');
      if (role === 'tools') Object.keys(pending).forEach(function (id) { if (pending[id].role === 'tools') { pending[id].reject(new Error('Stopped')); delete pending[id]; } });
      finish({ ok: false, code: 130, stopped: true });
    }

    function compile(lang, files, check) {
      return call('tools', { t: 'compile', lang: lang, files: files, check: check || null }).then(function (m) { return m; });
    }

    boot();
    return {
      ready: ready,
      get isolated() { return isolated; },
      run: run,
      stop: stop,
      running: function () { return !!current; },
      input: function (text) { if (win) win.postMessage({ t: 'stdin', text: String(text) }, '*'); },
      endInput: function () { if (win) win.postMessage({ t: 'stdin', eof: true }, '*'); },
      compile: compile,
      py: function (op, args, files) { return call('tools', { t: 'py', op: op, args: args, files: files || null }).then(function (m) { return m.data; }); },
      phpCheck: function (code) { return call('tools', { t: 'phpcheck', code: code }).then(function (m) { return m.data; }); },
      warm: function (lang) {
        if (lang === 'java' || states[lang] === 'ready' || states[lang] === 'loading') return Promise.resolve();
        setState(lang, 'loading', { label: 'Preparing ' + (LANG_NAME[lang] || lang), pct: null });
        var role = 'tools';
        return call(role, { t: 'warm', lang: lang }).then(function () { setState(lang, 'ready', {}); if (lang === 'c' || lang === 'cpp') { setState('c', 'ready', {}); setState('cpp', 'ready', {}); } },
          function (e) { setState(lang, 'error', { label: e.message }); throw e; });
      },
      state: function (lang) { return states[lang] || 'idle'; },
      urls: URLS
    };
  }

  g.PaisleyRunner = { create: create, fetchRuntime: fetchRuntime, URLS: URLS };
})(window);
