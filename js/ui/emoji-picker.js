/* =========================================================
   Paisley emoji picker for message boxes (WhatsApp style).

   Adds a smiley button next to every chat / message / reply box on
   the page and opens a picker (search, categories, recents, skin
   tones) above it. Picked emoji go in at the cursor, and the picker
   stays open for more, like WhatsApp.

   Which boxes: any <textarea> (or text <input>) with data-emoji, or a
   textarea whose placeholder talks about a message, reply or comment.
   data-emoji="off" opts a box out. Boxes added later (re-rendered
   chats) are found by a MutationObserver, so pages need only load
   this file:  <script src="/js/ui/emoji-picker.js?v=1"></script>

   The picker is the emoji-picker-element web component from jsDelivr;
   if it cannot load, a built-in grid of common emoji is used.
   This is for what people TYPE to each other. The site's own UI still
   uses Font Awesome icons, never emoji (the button is fa-face-smile).
   ========================================================= */
(function (g) {
  'use strict';
  if (g.PaisleyEmoji) return;

  var PICKER_URL = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.26.3/index.js';
  var MATCH = /message|reply|comment|chat|write to|ask the studio/i;
  var FALLBACK = ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 🤓 😎 🥳 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😮 😯 😲 😳 🥺 😢 😭 😤 😠 😡 🤯 😱 😴 🤗 🤭 🤫 ' +
    '👍 👎 👌 ✌️ 🤞 🤟 👏 🙌 👐 🙏 💪 👋 ✋ 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💯 ✨ 🔥 ⭐ 🌟 🎉 🎊 🎈 🎁 🏆 🥇 ✅ ❌ ❓ ❗ 💡 📚 📖 ✏️ 📝 💻 🖥️ ⌨️ 🖱️ 📱 🎨 🎵 🎧 🎬 📷 🚀 ⏰ 📅 ☕ 🍕 ⚽ 🏀').split(' ');

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.pz-emo-btn{flex:none;align-self:flex-end;width:38px;height:38px;border-radius:50%;border:0;background:transparent;color:var(--brand-deep,#245F5A);font-size:1.2rem;cursor:pointer;display:inline-grid;place-items:center;transition:background .15s,color .15s}',
      '.pz-emo-btn:hover,.pz-emo-btn.on{background:var(--sage,#E5F2EF);color:var(--brand,#55BFB3)}',
      '.pz-emo-btn:focus-visible{outline:3px solid #F5C842;outline-offset:2px}',
      '.pz-emo-row{display:flex;gap:.35rem;align-items:flex-end}.pz-emo-row>textarea,.pz-emo-row>input{flex:1;min-width:0}',
      '.pz-emo-pop{position:fixed;z-index:5000;background:#fff;border:1px solid rgba(38,51,49,.14);border-radius:16px;box-shadow:0 18px 48px rgba(38,51,49,.26);overflow:hidden;animation:pzEmoIn .14s ease-out}',
      '.pz-emo-pop emoji-picker{--border-size:0;--background:#fff;--indicator-color:var(--brand,#55BFB3);--outline-color:var(--brand,#55BFB3);--input-border-radius:10px;--num-columns:8;--emoji-size:1.45rem;width:min(352px,calc(100vw - 20px));height:min(380px,60vh);display:block}',
      '.pz-emo-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:.5rem;width:min(352px,calc(100vw - 20px));max-height:min(320px,55vh);overflow:auto}',
      '.pz-emo-grid button{border:0;background:none;font-size:1.45rem;line-height:1;padding:.3rem 0;border-radius:8px;cursor:pointer}.pz-emo-grid button:hover{background:var(--sage,#E5F2EF)}',
      '@keyframes pzEmoIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  var lib = null;
  function loadPicker() {
    if (lib) return lib;
    if (g.customElements && customElements.get('emoji-picker')) return (lib = Promise.resolve(true));
    lib = new Promise(function (res) {
      try {
        var s = document.createElement('script');
        s.type = 'module'; s.src = PICKER_URL;
        s.onload = function () { customElements.whenDefined('emoji-picker').then(function () { res(true); }); };
        s.onerror = function () { res(false); };
        document.head.appendChild(s);
        setTimeout(function () { res(!!(g.customElements && customElements.get('emoji-picker'))); }, 8000);
      } catch (e) { res(false); }
    });
    return lib;
  }

  /* Put text at the caret (or over the selection) and tell the page it changed. */
  function insertAt(field, text) {
    if (field.disabled || field.readOnly) return;
    var v = field.value, s = field.selectionStart, e = field.selectionEnd;
    if (s == null) { s = e = v.length; }
    var max = field.maxLength > 0 ? field.maxLength : Infinity;
    if (v.length - (e - s) + text.length > max) return;
    field.value = v.slice(0, s) + text + v.slice(e);
    var at = s + text.length;
    try { field.setSelectionRange(at, at); } catch (x) { }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var open = null;   /* { pop, btn, field } */
  function close() {
    if (!open) return;
    open.pop.remove(); open.btn.classList.remove('on'); open.btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocDown, true); document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    open = null;
  }
  function onDocDown(e) { if (open && !open.pop.contains(e.target) && !open.btn.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape' && open) { e.stopPropagation(); var f = open.field; close(); f.focus(); } }
  function place() {
    if (!open) return;
    var r = open.btn.getBoundingClientRect(), pw = open.pop.offsetWidth, ph = open.pop.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.min(Math.max(10, r.left), vw - pw - 10);
    var top = r.top - ph - 8;
    if (top < 10) top = Math.min(r.bottom + 8, vh - ph - 10);
    open.pop.style.left = left + 'px'; open.pop.style.top = Math.max(10, top) + 'px';
  }
  function toggle(btn, field) {
    if (open && open.btn === btn) { close(); field.focus(); return; }
    close();
    var pop = document.createElement('div');
    pop.className = 'pz-emo-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Emoji');
    /* Inside a full-screen element the picker must live in it, or the browser hides it. */
    (document.fullscreenElement || document.body).appendChild(pop);
    open = { pop: pop, btn: btn, field: field };
    btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDocDown, true); document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    pop.innerHTML = '<div class="pz-emo-grid" style="display:block;padding:1rem;color:#5A6E6A;font:600 .8rem system-ui">Loading emoji…</div>';
    place();
    loadPicker().then(function (ok) {
      if (!open || open.pop !== pop) return;
      pop.innerHTML = '';
      if (ok) {
        var el = document.createElement('emoji-picker');
        el.classList.add('light');
        el.addEventListener('emoji-click', function (ev) { var u = ev.detail && ev.detail.unicode; if (u) insertAt(field, u); });
        pop.appendChild(el);
      } else {
        var grid = document.createElement('div'); grid.className = 'pz-emo-grid';
        grid.innerHTML = FALLBACK.map(function (x) { return '<button type="button" aria-label="' + x + '">' + x + '</button>'; }).join('');
        grid.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) insertAt(field, b.textContent); });
        pop.appendChild(grid);
      }
      place();
    });
  }

  function wanted(f) {
    if (!f || f.__pzEmoji || f.closest('.CodeMirror, .cl-shell, .ink-root')) return false;
    var d = f.getAttribute('data-emoji');
    if (d === 'off') return false;
    if (d != null) return true;
    if (f.tagName !== 'TEXTAREA') return false;
    return MATCH.test(f.getAttribute('placeholder') || '') || MATCH.test(f.getAttribute('aria-label') || '');
  }
  function attach(field) {
    if (!wanted(field)) return;
    field.__pzEmoji = true;
    injectStyle();
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pz-emo-btn';
    btn.title = 'Emoji'; btn.setAttribute('aria-label', 'Add emoji'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="far fa-face-smile" aria-hidden="true"></i>';
    /* keep the caret where it was while the button is pressed */
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () { toggle(btn, field); loadPicker(); });
    var parent = field.parentNode, disp = '';
    try { disp = getComputedStyle(parent).display; } catch (e) { }
    if (/flex|grid/.test(disp) && getComputedStyle(parent).flexDirection !== 'column') {
      parent.insertBefore(btn, field);
    } else {
      /* A box on its own line: put it and the button in one row. */
      var row = document.createElement('div'); row.className = 'pz-emo-row';
      row.style.marginTop = field.style.marginTop; field.style.marginTop = '0';
      parent.insertBefore(row, field); row.appendChild(btn); row.appendChild(field);
    }
    /* warm the library while they type */
    field.addEventListener('focus', function () { loadPicker(); }, { once: true });
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('textarea, input[data-emoji]')) attach(root);
    root.querySelectorAll('textarea, input[data-emoji]').forEach(attach);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
      if (open && !document.body.contains(open.field)) close();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  g.PaisleyEmoji = { attach: function (f) { if (f) { f.setAttribute('data-emoji', ''); attach(f); } }, insert: insertAt, close: close };
})(window);
