// =========================================================
// PASSWORD VISIBILITY TOGGLE (eye icon)
// ---------------------------------------------------------
// Every <input type="password"> in any page that loads this file
// (add it to any new page with a password field) —
// including ones rendered later into modals — gets a show/hide button.
// The button is type="button" so it never submits a form, and the input
// keeps its id/name/handlers untouched (it is only wrapped).
// =========================================================
(function () {
  if (typeof document === 'undefined' || window.__lmzPwToggleInstalled) return;
  window.__lmzPwToggleInstalled = true;

  function injectStyle() {
    if (document.getElementById('lmz-pw-style')) return;
    var st = document.createElement('style');
    st.id = 'lmz-pw-style';
    st.textContent =
      '.lmz-pw-wrap{position:relative;display:block;width:100%;flex:1 1 auto;min-width:0}' +
      '.lmz-pw-wrap>input{width:100%;box-sizing:border-box;padding-right:2.6rem !important}' +
      '.lmz-pw-toggle{position:absolute;top:50%;right:.5rem;transform:translateY(-50%);background:none;border:0;' +
      'padding:.35rem .45rem;cursor:pointer;color:var(--muted,#5A6E6A);font-size:.95rem;line-height:1;border-radius:6px}' +
      '.lmz-pw-toggle:hover{color:var(--brand-deep,#245F5A)}' +
      '.lmz-pw-toggle:focus-visible{outline:2px solid var(--brand,#55BFB3);outline-offset:1px}' +
      // Pages that style every <i> inside a field as an absolutely-positioned left icon
      // (admin login) must not move the eye icon.
      '.lmz-pw-toggle i{position:static !important;transform:none !important;left:auto !important;top:auto !important;color:inherit !important;pointer-events:none}';
    document.head.appendChild(st);
  }

  function enhance(input) {
    if (!input || input.dataset.lmzPw === '1' || !input.parentNode) return;
    input.dataset.lmzPw = '1';
    var wrap = document.createElement('span');
    wrap.className = 'lmz-pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lmz-pw-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
    btn.addEventListener('click', function () {
      var reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      btn.firstChild.className = reveal ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
    wrap.appendChild(btn);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    var list = root.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  function start() {
    injectStyle();
    scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
