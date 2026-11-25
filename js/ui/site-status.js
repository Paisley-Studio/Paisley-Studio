/* =========================================================
   Paisley Studio — "Under maintenance" banner (every page)
   -----------------------------------------------------------
   Admin > Settings > Developer mode > Maintenance banner writes
   siteStatus/maintenance { on, title, message, startsAt, endsAt, tone }.
   Every page loads this file; it reads that one document over Firestore's
   REST API (no Firebase SDK needed, works signed out) and shows a small
   floating card. It never blocks the page: people keep working, the card
   only tells them. It can be shrunk to a dot and opened again.

   Before startsAt: "Maintenance planned" with a countdown to the start.
   Between startsAt and endsAt: "Under maintenance", time left, progress.
   After endsAt (or switched off): nothing.

   PaisleySiteStatus.refresh()          read again now
   PaisleySiteStatus.preview(data|null) show given data (the admin's preview), null to stop
========================================================= */
(function (g) {
  'use strict';
  if (g.PaisleySiteStatus) return;
  var PROJECT = 'paisley-89c77';
  try { if (g.firebase && g.firebase.apps && g.firebase.apps.length) PROJECT = g.firebase.app().options.projectId || PROJECT; } catch (e) { }
  var URL_ = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/siteStatus/maintenance';
  var CACHE_KEY = 'pz-site-status', CACHE_MS = 60 * 1000, POLL_MS = 3 * 60 * 1000;
  var host = null, root = null, data = null, previewing = false, tick = null;

  function val(f) {
    if (!f) return null;
    if ('booleanValue' in f) return f.booleanValue;
    if ('stringValue' in f) return f.stringValue;
    if ('timestampValue' in f) return Date.parse(f.timestampValue);
    if ('integerValue' in f) return Number(f.integerValue);
    if ('nullValue' in f) return null;
    return null;
  }
  function parse(doc) {
    var f = (doc && doc.fields) || {};
    return { on: val(f.on) === true, title: val(f.title) || '', message: val(f.message) || '', startsAt: val(f.startsAt) || 0, endsAt: val(f.endsAt) || 0, tone: val(f.tone) || 'info', updatedAt: val(f.updatedAt) || 0 };
  }
  function cached() {
    try { var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); if (c && Date.now() - c.at < CACHE_MS) return c.d; } catch (e) { }
    return undefined;
  }
  function load(force) {
    var c = force ? undefined : cached();
    if (c !== undefined) return Promise.resolve(c);
    return fetch(URL_, { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json().then(parse);
    }).then(function (d) {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), d: d })); } catch (e) { }
      return d;
    });
  }

  /* ---- What to say ---- */
  function phase(d, now) {
    if (!d || !d.on) return '';
    if (d.endsAt && now >= d.endsAt) return '';
    if (d.startsAt && now < d.startsAt) return 'soon';
    return 'now';
  }
  function span(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + ' h' + (r ? ' ' + r + ' min' : '');
    return Math.round(h / 24) + ' days';
  }
  function clock(t) {
    try { return new Date(t).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(t).toString(); }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* Font Awesome 6 shapes, inline (the banner lives in its own shadow root, so page styles and icon fonts never reach it). */
  var ICON = {
    wrench: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M352 320c88.4 0 160-71.6 160-160 0-15.3-2.2-30.1-6.2-44.2-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7H336c-8.8 0-16-7.2-16-16v-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0 263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1 0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9l181.6-181.6c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>',
    clock: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M256 0a256 256 0 1 1 0 512 256 256 0 1 1 0-512zm-24 120v136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg>',
    minus: '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M432 256c0 17.7-14.3 32-32 32H48c-17.7 0-32-14.3-32-32s14.3-32 32-32h352c17.7 0 32 14.3 32 32z"/></svg>'
  };
  var CSS = [
    ':host{all:initial}',
    '.wrap{position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:"Quicksand",system-ui,-apple-system,"Segoe UI",sans-serif;color:#263331;pointer-events:none}',
    '.card{pointer-events:auto;width:min(360px,calc(100vw - 36px));background:#fff;border:1px solid rgba(38,51,49,.12);border-left:4px solid #55BFB3;border-radius:16px;box-shadow:0 14px 40px rgba(15,26,20,.18);padding:.9rem 1rem .85rem;position:relative;overflow:hidden;animation:pzIn .55s cubic-bezier(.2,.9,.25,1.2) both}',
    '.card.warn{border-left-color:#F39C12}',
    '.top{display:flex;align-items:flex-start;gap:.7rem}',
    '.badge{position:relative;flex:0 0 auto;width:38px;height:38px;border-radius:12px;background:#E5F2EF;color:#245F5A;display:grid;place-items:center}',
    '.warn .badge{background:#FDF1DF;color:#9A5B00}',
    '.badge svg{width:18px;height:18px;animation:pzTurn 2.6s ease-in-out infinite;transform-origin:50% 50%}',
    '.badge::after{content:"";position:absolute;inset:-4px;border-radius:15px;border:2px solid #55BFB3;opacity:0;animation:pzRing 2s ease-out infinite}',
    '.warn .badge::after{border-color:#F39C12}',
    '.txt{flex:1;min-width:0}',
    '.k{display:flex;align-items:center;gap:.4rem;font-size:.66rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#245F5A}',
    '.warn .k{color:#9A5B00}',
    '.dot{width:7px;height:7px;border-radius:50%;background:#55BFB3;animation:pzBlink 1.3s ease-in-out infinite}',
    '.warn .dot{background:#F39C12}',
    '.t{font-size:.98rem;font-weight:800;margin:.15rem 0 .2rem;line-height:1.25}',
    '.m{font-size:.82rem;font-weight:600;color:#5A6E6A;line-height:1.45;white-space:pre-line}',
    '.when{display:flex;align-items:center;gap:.35rem;margin-top:.55rem;font-size:.75rem;font-weight:700;color:#245F5A}',
    '.when svg{width:12px;height:12px}',
    '.bar{height:4px;border-radius:4px;background:#E5F2EF;margin-top:.55rem;overflow:hidden}',
    '.bar i{display:block;height:100%;width:0;background:#55BFB3;border-radius:4px;transition:width .8s ease}',
    '.warn .bar i{background:#F39C12}',
    '.bar.run i{width:35%;animation:pzSlide 1.8s ease-in-out infinite}',
    '.min{flex:0 0 auto;width:28px;height:28px;border:none;border-radius:8px;background:transparent;color:#5A6E6A;cursor:pointer;display:grid;place-items:center}',
    '.min:hover,.min:focus-visible{background:#E5F2EF;color:#245F5A;outline:none}',
    '.min svg{width:12px;height:12px}',
    '.pill{pointer-events:auto;display:flex;align-items:center;gap:.45rem;border:1px solid rgba(38,51,49,.12);background:#fff;color:#245F5A;border-radius:999px;padding:.5rem .85rem .5rem .55rem;box-shadow:0 10px 28px rgba(15,26,20,.16);font:inherit;font-size:.78rem;font-weight:800;cursor:pointer;animation:pzIn .45s cubic-bezier(.2,.9,.25,1.2) both}',
    '.pill .badge{width:26px;height:26px;border-radius:50%}',
    '.pill .badge svg{width:13px;height:13px}',
    '.pill .badge::after{border-radius:50%}',
    '.pill.warn{color:#9A5B00}',
    '.pill:focus-visible{outline:3px solid rgba(85,191,179,.45);outline-offset:2px}',
    '@keyframes pzIn{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:none}}',
    '@keyframes pzTurn{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-22deg)}80%{transform:rotate(16deg)}90%{transform:rotate(-8deg)}}',
    '@keyframes pzRing{0%{opacity:.7;transform:scale(.85)}100%{opacity:0;transform:scale(1.35)}}',
    '@keyframes pzBlink{0%,100%{opacity:1}50%{opacity:.25}}',
    '@keyframes pzSlide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}',
    '@media (max-width:560px){.wrap{left:12px;right:12px;bottom:12px;display:flex;justify-content:center}.card{width:100%}}',
    '@media (prefers-reduced-motion:reduce){.card,.pill,.badge svg,.badge::after,.dot,.bar.run i{animation:none!important}.bar i{transition:none}}',
    '@media print{.wrap{display:none}}'
  ].join('');

  function minKey(d) { return 'pz-site-status-min-' + (d.updatedAt || 0); }
  function isMin(d) { try { return !previewing && sessionStorage.getItem(minKey(d)) === '1'; } catch (e) { return false; } }
  function setMin(d, v) { try { if (v) sessionStorage.setItem(minKey(d), '1'); else sessionStorage.removeItem(minKey(d)); } catch (e) { } }

  function ensureRoot() {
    if (root) return root;
    if (!document.body) return null;
    host = document.createElement('div');
    host.id = 'pz-site-status';
    host.setAttribute('data-nosnippet', '');
    document.body.appendChild(host);
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = '<style>' + CSS + '</style><div class="wrap" role="region" aria-label="Site status"></div>';
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]'); if (!b || !data) return;
      setMin(data, b.getAttribute('data-act') === 'min');
      paint();
      var f = root.querySelector(b.getAttribute('data-act') === 'min' ? '.pill' : '.min'); if (f) f.focus();
    });
    return root;
  }
  function clear() {
    if (tick) { clearInterval(tick); tick = null; }
    if (root) { var w = root.querySelector('.wrap'); if (w) w.innerHTML = ''; }
  }
  function paint() {
    var now = Date.now(), ph = phase(data, now);
    if (!ph) { clear(); return; }
    if (!ensureRoot()) return;
    var w = root.querySelector('.wrap'), d = data, warn = d.tone === 'warn' ? ' warn' : '';
    var title = d.title || (ph === 'soon' ? 'Maintenance planned' : 'We are improving Paisley Studio');
    var k = ph === 'soon' ? 'Planned maintenance' : 'Under maintenance';
    var when = '', pct = -1;
    if (ph === 'soon') when = 'Starts in ' + span(d.startsAt - now) + ' · ' + clock(d.startsAt) + (d.endsAt ? ' to ' + clock(d.endsAt) : '');
    else if (d.endsAt) {
      when = 'Back to normal in about ' + span(d.endsAt - now) + ' · until ' + clock(d.endsAt);
      if (d.startsAt && d.endsAt > d.startsAt) pct = Math.min(100, Math.max(2, (now - d.startsAt) / (d.endsAt - d.startsAt) * 100));
    } else when = 'You can keep working. Some things may be slow for a little while.';
    if (isMin(d)) {
      w.innerHTML = '<button type="button" class="pill' + warn + '" data-act="max" aria-label="' + esc(k) + ': show details"><span class="badge">' + ICON.wrench + '</span>' + esc(k) + '</button>';
    } else {
      w.innerHTML = '<div class="card' + warn + '" role="status" aria-live="polite"><div class="top"><span class="badge">' + ICON.wrench + '</span><div class="txt">' +
        '<div class="k"><span class="dot"></span>' + esc(k) + '</div><div class="t">' + esc(title) + '</div>' +
        (d.message ? '<div class="m">' + esc(d.message) + '</div>' : '') +
        '<div class="when">' + ICON.clock + '<span>' + esc(when) + '</span></div>' +
        '<div class="bar' + (pct < 0 ? ' run' : '') + '"><i' + (pct >= 0 ? ' style="width:' + pct.toFixed(1) + '%"' : '') + '></i></div>' +
        '</div><button type="button" class="min" data-act="min" aria-label="Make this smaller" title="Make this smaller">' + ICON.minus + '</button></div></div>';
    }
    if (!tick) tick = setInterval(function () { if (data) paint(); }, 30 * 1000);
  }
  function refresh(force) {
    if (previewing) return Promise.resolve();
    return load(force).then(function (d) { data = d; paint(); }, function () { /* offline or blocked: say nothing */ });
  }
  function start() {
    refresh(false);
    setInterval(function () { if (!document.hidden) refresh(true); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
  }

  g.PaisleySiteStatus = {
    refresh: function () { return refresh(true); },
    preview: function (d) {
      if (d) { previewing = true; data = Object.assign({ on: true, tone: 'info', updatedAt: 0 }, d); paint(); }
      else { previewing = false; data = null; clear(); refresh(true); }
    },
    _phase: phase, _parse: parse
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
