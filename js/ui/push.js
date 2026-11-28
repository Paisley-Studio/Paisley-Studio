/* =========================================================
   Paisley push notifications on this device  (window.PaisleyPush)
   ---------------------------------------------------------
   Firebase Cloud Messaging for the web. Once someone turns it on, their
   Paisley notifications (Tech Studio bells, group chat messages) show on
   that laptop or phone even when the page is closed. Each device is
   turned on separately; the browser asks for permission once.

     /firebase-messaging-sw.js            the push service worker (own scope,
                                          so it never touches /sw.js)
     registerPushToken (callable)         saves pushTokens/{sha256(token)}
                                          for the signed-in uid; on:false forgets it
     sendTestPush (callable)              a test notification to the caller

     PaisleyPush.init({ uid, role, app })   call once after sign-in
     PaisleyPush.mountButton(host)          a topbar button with the state
     PaisleyPush.prompt()                   a card asking to turn it on (once a week)
     PaisleyPush.enable() / disable()       (enable needs a click: browsers require it)
     PaisleyPush.forget()                   before signing out: this device stops
                                          getting this person's notifications
     PaisleyPush.state()  'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported'
     PaisleyPush.onChange(fn) -> off()

   iPhone and iPad get web push only from a site added to the Home Screen
   (iOS 16.4+), so there the state is 'ios-install' until it is.
========================================================= */
(function (g) {
  'use strict';
  if (g.PaisleyPush) return;
  var SDK = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js';
  var SW_URL = '/firebase-messaging-sw.js?v=1', SW_SCOPE = '/firebase-cloud-messaging-push-scope';
  /* Optional: the public key from Firebase console > Project settings > Cloud Messaging >
     Web Push certificates. Empty uses Firebase's default key, which works as well. */
  var VAPID_KEY = '';
  var LS_TOKEN = 'pz-push', LS_SNOOZE = 'pz-push-snooze';
  var ctx = { uid: '', role: '', app: '' }, subs = [], loader = null, started = false, msgOff = null;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function saved() { try { return JSON.parse(ls(LS_TOKEN) || 'null'); } catch (e) { return null; } }
  function isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return (g.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function supported() { return g.isSecureContext && 'Notification' in g && 'serviceWorker' in navigator && 'PushManager' in g; }
  function state() {
    if (!supported()) return isIOS() && !standalone() ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted') { var s = saved(); return s && s.uid === ctx.uid && s.token ? 'on' : 'off'; }
    return 'off';
  }
  function changed() { var st = state(); subs.slice().forEach(function (f) { try { f(st); } catch (e) { } }); }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  function errText(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }

  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load notifications.')); }; document.head.appendChild(s); });
  }
  function messaging() {
    if (loader) return loader;
    loader = (firebase.messaging ? Promise.resolve() : loadScript(SDK)).then(function () {
      return Promise.resolve(firebase.messaging.isSupported ? firebase.messaging.isSupported() : true);
    }).then(function (ok) {
      if (!ok) throw new Error('This browser cannot show notifications.');
      var m = firebase.messaging();
      if (!msgOff) msgOff = m.onMessage(function (p) { toast(p); });
      return m;
    });
    loader.catch(function () { loader = null; });
    return loader;
  }
  function functionsReady() {
    if (typeof firebase.functions === 'function') return Promise.resolve(firebase.functions());
    return loadScript('https://www.gstatic.com/firebasejs/10.13.0/firebase-functions-compat.js').then(function () { return firebase.functions(); });
  }
  function call(name, data) { return functionsReady().then(function (f) { return f.httpsCallable(name)(data); }); }
  function swReady() {
    return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).then(function (reg) {
      if (reg.active) return reg;
      return new Promise(function (res) {
        var w = reg.installing || reg.waiting; if (!w) return res(reg);
        w.addEventListener('statechange', function () { if (w.state === 'activated') res(reg); });
        setTimeout(function () { res(reg); }, 8000);
      });
    });
  }
  function device() {
    var u = navigator.userAgent, os = /Android/.test(u) ? 'Android' : isIOS() ? 'iPhone/iPad' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux|CrOS/.test(u) ? 'Laptop' : 'Device';
    var br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
    return br + ' on ' + os;
  }
  /* Fetch this device's token and file it under the signed-in person. */
  function register(m) {
    return swReady().then(function (reg) {
      var opt = { serviceWorkerRegistration: reg }; if (VAPID_KEY) opt.vapidKey = VAPID_KEY;
      return m.getToken(opt);
    }).then(function (token) {
      if (!token) throw new Error('The browser gave no notification token.');
      var s = saved();
      if (s && s.uid === ctx.uid && s.token === token && Date.now() - (s.at || 0) < 3 * 86400000) return token;
      return call('registerPushToken', { token: token, on: true, app: ctx.app, role: ctx.role, device: device() }).then(function () {
        ls(LS_TOKEN, JSON.stringify({ uid: ctx.uid, token: token, at: Date.now() })); return token;
      });
    }).then(function (t) { changed(); return t; });
  }
  function enable() {
    if (!ctx.uid) return Promise.reject(new Error('Sign in first.'));
    var st = state();
    if (st === 'unsupported') return Promise.reject(new Error('This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari.'));
    if (st === 'ios-install') return Promise.reject(new Error('On iPhone or iPad, add Paisley to your Home Screen first (Share, then Add to Home Screen).'));
    if (st === 'blocked') return Promise.reject(new Error('Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.'));
    var ask = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    return Promise.resolve(ask).then(function (p) {
      changed();
      if (p !== 'granted') throw new Error(p === 'denied' ? 'Notifications were blocked. You can allow them later in your browser’s site settings.' : 'Notifications were not turned on.');
      return messaging();
    }).then(register);
  }
  function disable() {
    var s = saved();
    return messaging().then(function (m) { return m.deleteToken().catch(function () { }); }, function () { })
      .then(function () { return s && s.token ? call('registerPushToken', { token: s.token, on: false }).catch(function () { }) : null; })
      .then(function () { ls(LS_TOKEN, null); changed(); });
  }
  /* Before signing out: the next person on this browser must not get these notifications. */
  function forget() {
    var s = saved(); if (!s || !s.token) return Promise.resolve();
    var done = call('registerPushToken', { token: s.token, on: false }).catch(function () { }).then(function () { ls(LS_TOKEN, null); });
    return Promise.race([done, new Promise(function (r) { setTimeout(r, 2500); })]);
  }
  function init(o) {
    ctx = { uid: o.uid || '', role: o.role || '', app: o.app || 'tech' };
    if (!started) { started = true; styleOnce(); }
    var s = saved();
    if (s && s.uid && s.uid !== ctx.uid) ls(LS_TOKEN, null);
    /* Already allowed on this device: keep the token fresh quietly (no prompt). */
    if (supported() && Notification.permission === 'granted') messaging().then(register).catch(function (e) { console.warn('push:', errText(e)); });
    changed();
    return { state: state, enable: enable, disable: disable };
  }

  /* ---------- looks ---------- */
  var styled = false;
  function styleOnce() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent = [
      '.pzp-btn{position:relative;display:inline-flex;align-items:center;gap:.45rem;height:40px;padding:0 .85rem;border-radius:12px;border:1.5px solid rgba(38,51,49,.1);background:#fff;color:#245F5A;font:inherit;font-weight:800;font-size:.8rem;cursor:pointer;box-shadow:0 2px 8px rgba(36,95,90,.06);transition:border-color .15s,box-shadow .15s}',
      '.pzp-btn:hover{border-color:#55BFB3;box-shadow:0 6px 16px rgba(36,95,90,.12)}',
      '.pzp-btn .dot{width:8px;height:8px;border-radius:50%;background:#b9c4c2}.pzp-btn.on .dot{background:#2EB872}.pzp-btn.bad .dot{background:#E74C3C}',
      '.pzp-btn.off{background:#245F5A;border-color:#245F5A;color:#fff}.pzp-btn.off:hover{background:#1c4f4a}',
      '@media(max-width:640px){.pzp-btn .w{display:none}.pzp-btn{width:40px;padding:0;justify-content:center}.pzp-btn .dot{position:absolute;margin:-18px -18px 0 0}}',
      '.pzp-wrap{position:relative;display:inline-flex}',
      '.pzp-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:3000;width:min(340px,calc(100vw - 24px));background:#fff;border:1px solid rgba(38,51,49,.1);border-radius:18px;box-shadow:0 20px 50px rgba(15,26,20,.22);padding:1.1rem;color:#1D2A28;font-size:.86rem;line-height:1.5;animation:pzpIn .14s ease-out}',
      '.pzp-pop h4{margin:0 0 .35rem;font-size:1rem;color:#245F5A;display:flex;gap:.5rem;align-items:center}',
      '.pzp-pop p{margin:0 0 .7rem;color:#5A6E6A;font-weight:600}',
      '.pzp-pop ol{margin:0 0 .8rem 1.1rem;padding:0;color:#3d4f4c;font-weight:600}.pzp-pop li{margin:.2rem 0}',
      '.pzp-acts{display:flex;gap:.5rem;flex-wrap:wrap}',
      '.pzp-a{border:1.5px solid rgba(38,51,49,.12);background:#fff;color:#245F5A;border-radius:12px;padding:.55rem .95rem;font:inherit;font-weight:800;font-size:.8rem;cursor:pointer;display:inline-flex;gap:.4rem;align-items:center}',
      '.pzp-a.p{background:#245F5A;border-color:#245F5A;color:#fff}.pzp-a:disabled{opacity:.6;cursor:wait}',
      '.pzp-msg{font-size:.78rem;font-weight:700;margin-top:.6rem;min-height:0}.pzp-msg:empty{display:none}',
      '.pzp-card{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2900;width:min(520px,calc(100vw - 24px));display:flex;gap:.9rem;align-items:flex-start;background:#fff;border:1px solid rgba(38,51,49,.1);border-radius:20px;box-shadow:0 22px 60px rgba(15,26,20,.25);padding:1rem 1.1rem;animation:pzpUp .25s cubic-bezier(.16,1,.3,1)}',
      '.pzp-card .ic{width:46px;height:46px;border-radius:14px;flex:none;display:grid;place-items:center;background:linear-gradient(135deg,#55BFB3,#245F5A);color:#fff;font-size:1.2rem}',
      '.pzp-card b{display:block;color:#245F5A;font-size:.98rem;margin-bottom:.15rem}.pzp-card p{margin:0 0 .7rem;color:#5A6E6A;font-size:.84rem;font-weight:600;line-height:1.45}',
      '.pzp-toast{position:fixed;right:18px;top:18px;z-index:3100;width:min(360px,calc(100vw - 24px));display:flex;gap:.75rem;align-items:flex-start;background:#fff;border:1px solid rgba(38,51,49,.1);border-left:5px solid #55BFB3;border-radius:14px;box-shadow:0 16px 40px rgba(15,26,20,.22);padding:.8rem .9rem;cursor:pointer;animation:pzpIn .2s ease-out;font-size:.84rem}',
      '.pzp-toast img{width:36px;height:36px;border-radius:9px}.pzp-toast b{display:block;color:#245F5A}.pzp-toast span{color:#5A6E6A;font-weight:600;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
      '@keyframes pzpIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
      '@keyframes pzpUp{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* What to say for each state. Everyone is told it is per device: laptops and phones. */
  function explain(st) {
    if (st === 'on') return '<h4><i class="fas fa-bell"></i> Notifications are on</h4><p>This device shows your Paisley notifications, even when this page is closed. Turn them on on every laptop and phone you use.</p>';
    if (st === 'blocked') return '<h4><i class="fas fa-bell-slash"></i> Notifications are blocked</h4><p>Your browser is blocking notifications from Paisley. To allow them:</p><ol><li>Click the lock or settings icon to the left of the web address.</li><li>Set <b>Notifications</b> to <b>Allow</b>.</li><li>Reload this page.</li></ol>';
    if (st === 'ios-install') return '<h4><i class="fas fa-mobile-screen"></i> On iPhone or iPad</h4><p>Apple shows notifications only for sites on your Home Screen (iOS 16.4 or later):</p><ol><li>Open this page in Safari.</li><li>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</li><li>Open Paisley from your Home Screen, sign in and tap Notifications.</li></ol>';
    if (st === 'unsupported') return '<h4><i class="fas fa-bell-slash"></i> Not available here</h4><p>This browser cannot show notifications. Use Chrome, Edge, Firefox or Safari, on a laptop or phone.</p>';
    return '<h4><i class="fas fa-bell"></i> Get notified on this device</h4><p>Turn on notifications to hear about new messages, group chats, classes and marked work on this laptop or phone, even when Paisley is closed. Your browser will ask you to allow them.</p><p style="margin-top:-.3rem">Do this on every device you use.</p>';
  }
  function mountButton(host) {
    if (!host) return null;
    styleOnce();
    var wrap = document.createElement('span'); wrap.className = 'pzp-wrap';
    host.appendChild(wrap);
    var pop = null;
    function paint() {
      var st = state(), on = st === 'on', cls = on ? 'on' : st === 'blocked' || st === 'unsupported' ? 'bad' : 'off';
      var b = wrap.querySelector('.pzp-btn');
      var html = '<button type="button" class="pzp-btn ' + cls + '" aria-haspopup="dialog" aria-expanded="' + (!!pop) + '" title="Notifications on this device"><i class="fas ' + (on ? 'fa-bell' : st === 'off' ? 'fa-bell' : 'fa-bell-slash') + '"></i><span class="w">' + (on ? 'Notifications on' : st === 'off' || st === 'ios-install' ? 'Turn on notifications' : 'Notifications off') + '</span><span class="dot" aria-hidden="true"></span></button>';
      if (b) b.outerHTML = html; else wrap.insertAdjacentHTML('afterbegin', html);
      if (pop) fillPop();
    }
    function fillPop() {
      var st = state();
      pop.innerHTML = explain(st) + '<div class="pzp-acts">' +
        (st === 'off' ? '<button type="button" class="pzp-a p" data-p="on"><i class="fas fa-bell"></i> Turn on</button>' : '') +
        (st === 'on' ? '<button type="button" class="pzp-a p" data-p="test"><i class="fas fa-paper-plane"></i> Send me a test</button><button type="button" class="pzp-a" data-p="off">Turn off here</button>' : '') +
        (st === 'blocked' ? '<button type="button" class="pzp-a p" data-p="reload"><i class="fas fa-rotate"></i> I allowed them, reload</button>' : '') +
        '<button type="button" class="pzp-a" data-p="close">Close</button></div><div class="pzp-msg" role="status"></div>';
    }
    function close() { if (pop) { pop.remove(); pop = null; paint(); document.removeEventListener('mousedown', outside); } }
    function outside(e) { if (pop && !wrap.contains(e.target)) close(); }
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('.pzp-btn')) { if (pop) { close(); return; } pop = document.createElement('div'); pop.className = 'pzp-pop'; pop.setAttribute('role', 'dialog'); wrap.appendChild(pop); fillPop(); paint(); document.addEventListener('mousedown', outside); return; }
      var a = e.target.closest('[data-p]'); if (!a) return;
      var msg = pop && pop.querySelector('.pzp-msg'), say = function (t, ok) { if (msg) { msg.style.color = ok ? '#1d8b57' : '#b8362a'; msg.textContent = t; } };
      var p = a.dataset.p;
      if (p === 'close') close();
      else if (p === 'reload') location.reload();
      else if (p === 'on') { a.disabled = true; enable().then(function () { fillPop(); say('Done. You will get notifications on this device.', true); }, function (er) { a.disabled = false; fillPop(); say(errText(er)); }); }
      else if (p === 'off') { a.disabled = true; disable().then(function () { fillPop(); say('Turned off on this device.', true); }); }
      else if (p === 'test') { a.disabled = true; call('sendTestPush', {}).then(function (r) { a.disabled = false; var n = (r && r.data && r.data.sent) || 0; say(n ? 'Sent. It shows when this page is in the background or closed (or as a note here).' : 'No device is set up yet. Try turning it off and on again.', !!n); }, function (er) { a.disabled = false; say(errText(er)); }); }
    });
    var off = onChange(paint);
    paint();
    return { destroy: function () { off(); close(); wrap.remove(); } };
  }
  /* A card asking to turn notifications on. Shown at most once a week per device. */
  function prompt(o) {
    o = o || {};
    styleOnce();
    var st = state();
    if (st !== 'off' && st !== 'ios-install') return;
    var snooze = Number(ls(LS_SNOOZE) || 0); if (snooze && Date.now() < snooze) return;
    if (document.querySelector('.pzp-card')) return;
    var c = document.createElement('div'); c.className = 'pzp-card'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Turn on notifications');
    c.innerHTML = '<span class="ic"><i class="fas fa-bell"></i></span><div style="flex:1;min-width:0"><b>Turn on notifications</b><p>' + esc(o.text || 'Know the moment your coach or your group messages you, on your laptop and your phone, even when Paisley is closed.') +
      (st === 'ios-install' ? ' On iPhone or iPad, first add Paisley to your Home Screen: tap Share, then Add to Home Screen.' : ' Do this once on each device you use.') + '</p>' +
      '<div class="pzp-acts">' + (st === 'off' ? '<button type="button" class="pzp-a p" data-k="on"><i class="fas fa-bell"></i> Turn on</button>' : '') + '<button type="button" class="pzp-a" data-k="later">Not now</button></div><div class="pzp-msg" role="status"></div></div>';
    document.body.appendChild(c);
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b) return;
      if (b.dataset.k === 'later') { ls(LS_SNOOZE, String(Date.now() + 7 * 86400000)); c.remove(); return; }
      b.disabled = true;
      enable().then(function () { c.remove(); }, function (er) { b.disabled = false; var m = c.querySelector('.pzp-msg'); m.style.color = '#b8362a'; m.textContent = errText(er); ls(LS_SNOOZE, String(Date.now() + 7 * 86400000)); });
    });
  }
  /* A notification that arrives while the page is open and in front: a small card. */
  function toast(p) {
    styleOnce();
    var n = (p && p.notification) || {}, d = (p && p.data) || {};
    if (!n.title && !d.title) return;
    var t = document.createElement('div'); t.className = 'pzp-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<img src="/icon-192.png" alt=""><div style="min-width:0"><b>' + esc(n.title || d.title) + '</b><span>' + esc(n.body || d.body || '') + '</span></div>';
    document.body.appendChild(t);
    var link = d.link || (p.fcmOptions && p.fcmOptions.link) || '';
    t.addEventListener('click', function () { t.remove(); if (link) { try { var u = new URL(link, location.href); if (u.origin === location.origin) { if (u.pathname === location.pathname) { location.hash = u.hash; } else location.href = u.href; } } catch (e) { } } });
    setTimeout(function () { t.remove(); }, 7000);
  }

  g.PaisleyPush = { init: init, enable: enable, disable: disable, forget: forget, state: state, onChange: onChange, mountButton: mountButton, prompt: prompt, supported: supported };
})(window);
