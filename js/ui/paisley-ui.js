/* Paisley UI — modal dialogs, loader and toasts (replaces native alert/confirm/prompt).
 *
 *   PaisleyUI.alert(msg, {title, type})        -> Promise
 *   PaisleyUI.confirm(msg, {title, confirmLabel, cancelLabel, danger}) -> Promise<boolean>
 *   PaisleyUI.prompt(msg, {title, value, placeholder, multiline}) -> Promise<string|null>
 *   PaisleyUI.loader.show('Releasing…') / .update('text') / .hide()
 *   PaisleyUI.toast(msg, type)
 *   PaisleyUI.run(promiseOrFn, {loading, success, successTitle}) -> shows loader, then success/error modal
 *
 * window.alert is overridden so every existing alert('…') becomes a styled modal
 * (non-blocking; type — success / error / warning / info — is inferred from the text).
 */
(function (global) {
  'use strict';
  if (global.PaisleyUI) return;

  var nativeAlert = global.alert ? global.alert.bind(global) : function () {};
  var css = '\
.pui-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(20,24,28,.52);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .18s ease}\
.pui-ov.in{opacity:1}\
.pui-card{width:100%;max-width:420px;background:#fff;color:#1f2933;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.28);padding:1.7rem 1.5rem 1.3rem;text-align:center;transform:translateY(14px) scale(.96);transition:transform .22s cubic-bezier(.2,.9,.3,1.2);font-family:inherit;max-height:90vh;overflow:auto}\
.pui-ov.in .pui-card{transform:none}\
.pui-ico{width:64px;height:64px;border-radius:50%;margin:0 auto .9rem;display:flex;align-items:center;justify-content:center;font-size:1.7rem}\
.pui-ico svg{width:34px;height:34px}\
.pui-success .pui-ico{background:#E5F2EF;color:#245F5A}\
.pui-error .pui-ico{background:#fde8e8;color:#d33d3d}\
.pui-warning .pui-ico{background:#FFF6D6;color:#9a7400}\
.pui-info .pui-ico{background:#E5F2EF;color:#245F5A}\
.pui-question .pui-ico{background:#E5F2EF;color:#245F5A}\
.pui-title{margin:0 0 .4rem;font-size:1.2rem;font-weight:800}\
.pui-msg{margin:0 0 1.2rem;font-size:.93rem;line-height:1.55;color:#4b5563;white-space:pre-line;word-break:break-word}\
.pui-input{width:100%;box-sizing:border-box;margin:0 0 1.1rem;padding:.7rem .85rem;border:1.5px solid #d6dbe1;border-radius:12px;font:inherit;font-size:.95rem;outline:none;transition:border-color .15s,box-shadow .15s}\
.pui-input:focus{border-color:#55BFB3;box-shadow:0 0 0 3px rgba(85,191,179,.22)}\
.pui-btns{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap}\
.pui-btn{flex:1 1 120px;border:0;border-radius:12px;padding:.72rem 1.1rem;font:inherit;font-weight:800;font-size:.92rem;cursor:pointer;transition:transform .1s,filter .15s}\
.pui-btn:hover{filter:brightness(1.06)}.pui-btn:active{transform:scale(.97)}\
.pui-btn.ghost{background:#eef0f3;color:#374151}\
.pui-btn.main{background:#55BFB3;color:#fff}\
.pui-success .pui-btn.main{background:#55BFB3}\
.pui-error .pui-btn.main,.pui-btn.main.danger{background:#d33d3d}\
.pui-warning .pui-btn.main{background:#245F5A}\
.pui-loader-card{max-width:300px;padding:2rem 1.5rem}\
.pui-spin{width:44px;height:44px;margin:0 auto 1rem;border-radius:50%;border:4px solid #E5F2EF;border-top-color:#55BFB3;animation:puispin .8s linear infinite}\
.pui-lt{font-weight:800;font-size:1rem;margin:0}\
.pui-ls{font-size:.82rem;color:#6b7280;margin:.3rem 0 0}\
.pui-dots:after{content:"";animation:puidots 1.4s steps(4,end) infinite}\
@keyframes puispin{to{transform:rotate(360deg)}}\
@keyframes puidots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}\
.pui-check path{stroke-dasharray:40;stroke-dashoffset:40;animation:puidraw .5s .15s ease forwards}\
@keyframes puidraw{to{stroke-dashoffset:0}}\
.pui-toasts{position:fixed;top:1rem;right:1rem;z-index:100001;display:flex;flex-direction:column;gap:.5rem;pointer-events:none}\
.pui-toast{pointer-events:auto;min-width:230px;max-width:340px;background:#1f2933;color:#fff;border-radius:12px;padding:.75rem 1rem;font-size:.88rem;box-shadow:0 10px 30px rgba(0,0,0,.25);border-left:5px solid #55BFB3;transform:translateX(120%);transition:transform .25s ease}\
.pui-toast.in{transform:none}.pui-toast.success{border-color:#55BFB3}.pui-toast.error{border-color:#d33d3d}.pui-toast.warning{border-color:#F5C842}\
@media (prefers-color-scheme:dark){.pui-card{background:#252a31;color:#f1f3f5}.pui-msg,.pui-ls{color:#aab2bd}.pui-btn.ghost{background:#363d46;color:#e5e7eb}.pui-input{background:#1c2026;color:#fff;border-color:#454d58}}\
';

  function injectCss() {
    if (document.getElementById('pui-css')) return;
    var s = document.createElement('style'); s.id = 'pui-css'; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var ICONS = {
    success: '<svg class="pui-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 11v6M12 7.2v.1"/></svg>',
    question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 9a3 3 0 115 2c-.9.8-2.2 1.2-2.2 3"/><path d="M12 17.4v.1"/></svg>'
  };
  var TITLES = { success: 'Done', error: 'Something went wrong', warning: 'Please check', info: 'Notice', question: 'Are you sure?' };

  function guessType(msg) {
    var m = String(msg || '').toLowerCase();
    if (/could not|couldn.t|can.t|cannot|failed|error|denied|not allowed|do not have permission|did not load|not loaded|unable|something went wrong|does not match|suspended|not a tutor/.test(m)) return 'error';
    if (/please|must|only |required|at least|no .* yet|already|first|still in progress|enter |choose |select |add /.test(m)) return 'warning';
    if (/success|saved|released|deleted|copied|granted|sent|created|updated|revoked|reactivated|started|ended|done|complete/.test(m)) return 'success';
    return 'info';
  }

  var stack = [];
  function openOverlay(innerHtml, cardClass, type) {
    injectCss();
    var ov = document.createElement('div');
    ov.className = 'pui-ov';
    ov.innerHTML = '<div class="pui-card ' + (cardClass || '') + ' pui-' + type + '" role="dialog" aria-modal="true">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('in'); }); });
    return ov;
  }
  function closeOverlay(ov) {
    if (!ov || !ov.parentNode) return;
    ov.classList.remove('in');
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 200);
  }

  function dialog(kind, message, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var type = o.type || (kind === 'alert' ? guessType(message) : 'question');
      var isConfirm = kind === 'confirm', isPrompt = kind === 'prompt';
      if (isConfirm && o.danger === undefined && /^\s*(delete|permanently|remove|revoke|end |reset)/i.test(message)) { o.danger = true; type = 'warning'; if (!o.confirmLabel) o.confirmLabel = /^\s*(revoke)/i.test(message) ? 'Yes, revoke' : /^\s*end /i.test(message) ? 'Yes, end' : /^\s*reset/i.test(message) ? 'Yes, reset' : /^\s*remove/i.test(message) ? 'Yes, remove' : 'Yes, delete'; }
      if (isConfirm && !o.confirmLabel && /^\s*sign out/i.test(message)) o.confirmLabel = 'Sign out';
      var title = o.title || (isPrompt ? 'Enter a value' : TITLES[type]);
      var input = '';
      if (isPrompt) input = o.multiline
        ? '<textarea class="pui-input" rows="3" placeholder="' + esc(o.placeholder || '') + '">' + esc(o.value || '') + '</textarea>'
        : '<input class="pui-input" type="' + (o.password ? 'password' : 'text') + '" placeholder="' + esc(o.placeholder || '') + '" value="' + esc(o.value || '') + '">';
      var btns = (isConfirm || isPrompt)
        ? '<button type="button" class="pui-btn ghost" data-r="no">' + esc(o.cancelLabel || 'Cancel') + '</button><button type="button" class="pui-btn main' + (o.danger ? ' danger' : '') + '" data-r="yes">' + esc(o.confirmLabel || (isPrompt ? 'OK' : 'Yes, continue')) + '</button>'
        : '<button type="button" class="pui-btn main" data-r="yes">' + esc(o.okLabel || 'OK') + '</button>';
      var ov = openOverlay('<div class="pui-ico">' + ICONS[type] + '</div><h3 class="pui-title">' + esc(title) + '</h3><p class="pui-msg">' + esc(message) + '</p>' + input + '<div class="pui-btns">' + btns + '</div>', '', type);
      var field = ov.querySelector('.pui-input');
      var done = false;
      function finish(yes) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey, true);
        closeOverlay(ov);
        resolve(isPrompt ? (yes ? field.value : null) : (isConfirm ? !!yes : undefined));
      }
      function onKey(e) {
        if (ov !== stackTop()) return;
        if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter' && !(field && field.tagName === 'TEXTAREA')) { e.preventDefault(); finish(true); }
      }
      stack.push(ov);
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('click', function (e) {
        var r = e.target.getAttribute && e.target.getAttribute('data-r');
        if (r) finish(r === 'yes');
        else if (e.target === ov && !isConfirm && !isPrompt && !o.sticky) finish(true);
      });
      var f = field || ov.querySelector('[data-r="yes"]');
      setTimeout(function () { try { f.focus(); if (field && field.select) field.select(); } catch (e) {} }, 60);
    });
  }
  function stackTop() { stack = stack.filter(function (o) { return o.parentNode; }); return stack[stack.length - 1]; }

  // ---- loader -------------------------------------------------------------
  var loaderEl = null, loaderCount = 0;
  var loader = {
    show: function (text, sub) {
      loaderCount++;
      if (loaderEl) { loader.update(text, sub); return; }
      loaderEl = openOverlay('<div class="pui-spin"></div><p class="pui-lt">' + esc(text || 'Working') + '<span class="pui-dots"></span></p><p class="pui-ls">' + esc(sub || 'Please wait, this will only take a moment.') + '</p>', 'pui-loader-card', 'info');
    },
    update: function (text, sub) {
      if (!loaderEl) return;
      if (text != null) loaderEl.querySelector('.pui-lt').firstChild.nodeValue = text;
      if (sub != null) loaderEl.querySelector('.pui-ls').textContent = sub;
    },
    hide: function (force) {
      loaderCount = force ? 0 : Math.max(0, loaderCount - 1);
      if (loaderCount === 0 && loaderEl) { closeOverlay(loaderEl); loaderEl = null; }
    }
  };

  // ---- toast --------------------------------------------------------------
  function toast(msg, type) {
    injectCss();
    var box = document.querySelector('.pui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'pui-toasts'; document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'pui-toast ' + (type || 'info'); t.textContent = msg;
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }, 3600);
  }

  // ---- loader -> success/error helper ------------------------------------
  function run(work, o) {
    o = o || {};
    loader.show(o.loading || 'Working', o.loadingSub);
    var p;
    try { p = typeof work === 'function' ? work() : work; } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (res) {
      loader.hide(true);
      var msg = typeof o.success === 'function' ? o.success(res) : o.success;
      if (msg) return dialog('alert', msg, { type: 'success', title: o.successTitle || 'Success' }).then(function () { return res; });
      return res;
    }, function (err) {
      loader.hide(true);
      return dialog('alert', (o.errorPrefix || 'Could not complete: ') + ((err && err.message) || err), { type: 'error' }).then(function () { throw err; });
    });
  }

  global.PaisleyUI = {
    alert: function (m, o) { return dialog('alert', m, o); },
    confirm: function (m, o) { return dialog('confirm', m, o); },
    prompt: function (m, o) { return dialog('prompt', m, o); },
    loader: loader, toast: toast, run: run, _native: nativeAlert
  };
  // Drop-in: every legacy alert('...') now renders as a styled modal.
  global.alert = function (m) { global.PaisleyUI.alert(m == null ? '' : String(m)); };
})(window);