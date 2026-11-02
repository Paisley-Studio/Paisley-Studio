/* =========================================================
   ParentAds: the ads on the parent Overview and the Newsletter tab.
   Used by parent/dashboard.html (never the Tech Studio guardian portal), and by
   the admin composer for its live preview. Needs js/ui/fast-video.js.

     parentAds/{id}              written by admins only. Parents read status 'live'.
     parentNewsletters/{id}      written by admins only. Parents read published ones.
     parentNewsletterPrefs/{uid} a parent's email choice and last-read time.

   An ad is simple: a banner image, a video (link or upload) or just writing,
   with an optional heading, text, button and running words.

   It must not be a nuisance: it sits below the child's figures and never pops
   up, video is muted until asked and plays only on screen, nothing downloads on
   Data Saver or 2G until pressed, and a parent can close any ad. A closed ad stays
   closed for that login, and comes back the next time they sign in.
   ========================================================= */
(function (g) {
  'use strict';
  var LOGO = 'https://aws-filez.s3.eu-north-1.amazonaws.com/cropped-Paisely-logo-Resized.png';
  var ROTATE_MS = 10000, HIDE_KEY = 'paisleyClosedAds';

  function fbdb() { return (typeof db !== 'undefined' && db) || firebase.firestore(); }
  function FV() { return firebase.firestore.FieldValue; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toDate(t) { if (!t) return null; if (t.toDate) return t.toDate(); if (t.seconds) return new Date(t.seconds * 1000); var d = new Date(t); return isNaN(d) ? null : d; }
  function httpsUrl(u) { u = String(u || '').trim(); return /^https:\/\//i.test(u) ? u : ''; }
  /* A button may also go to one of our own pages, such as /tech. */
  function linkUrl(u) { u = String(u || '').trim(); return /^https:\/\//i.test(u) || /^\/(?!\/)/.test(u) ? u : ''; }
  function extAttrs(u) { return /^https:/i.test(u) ? ' target="_blank" rel="noopener"' : ''; }
  function reducedMotion() { return !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* Which login is this? Firebase changes lastSignInTime each time someone signs in,
     so closed ads reset on every login whichever page or device they sign out from. */
  function loginId() {
    try {
      var u = firebase.auth().currentUser;
      return u ? u.uid + '|' + ((u.metadata && u.metadata.lastSignInTime) || '') : '';
    } catch (e) { return ''; }
  }
  var memory = { login: null, ids: {} };   /* for a private window, where storage can fail */
  function closedAds() {
    var login = loginId(), out = memory.login === login ? Object.assign({}, memory.ids) : {};
    try {
      var s = JSON.parse(localStorage.getItem(HIDE_KEY) || '{}') || {};
      if (s.login === login) Object.assign(out, s.ids || {});
    } catch (e) { /* memory is enough */ }
    return out;
  }
  function closeAd(id) {
    var ids = closedAds(); ids[id] = true;
    memory = { login: loginId(), ids: ids };
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(memory)); } catch (e) { /* kept in memory */ }
  }

  function ctaHtml(label, url) {
    var u = linkUrl(url); if (!u) return '';
    return '<a class="pa-cta" href="' + esc(u) + '"' + extAttrs(u) + '>' + esc(label || 'Find out more') + ' <i class="fas fa-arrow-right" aria-hidden="true"></i></a>';
  }
  function tickerHtml(words) {
    words = String(words || '').trim(); if (!words) return '';
    var bit = '<span><i class="fas fa-star" aria-hidden="true"></i> ' + esc(words) + '</span>', run = '';
    for (var i = 0; i < 16; i++) run += bit;
    return '<div class="pa-ticker" aria-hidden="true"><div class="pa-ticker-run">' + run + '</div></div>';
  }
  function kindOf(ad) { return ad.kind === 'video' || ad.kind === 'image' ? ad.kind : 'text'; }
  function mediaHtml(ad, kind, preview) {
    var url = httpsUrl(ad.mediaUrl), F = g.FastVideo;
    if (kind === 'image' && url) {
      var img = '<img src="' + esc(url) + '" alt="' + esc(ad.headline || 'From Paisley Studio') + '" loading="lazy" decoding="async">', lk = linkUrl(ad.ctaUrl);
      return lk ? '<a class="pa-banner" href="' + esc(lk) + '"' + extAttrs(lk) + '>' + img + '</a>' : '<div class="pa-banner">' + img + '</div>';
    }
    if (kind === 'video' && url) {
      if (F.embed(url)) return '<div class="pa-video">' + F.embedHtml(url, { title: ad.headline || 'Video' }) + '</div>';
      return '<div class="pa-video">' + F.videoHtml(url, { attrs: 'muted loop data-fv-preload="' + (F.isCheap() ? 'none' : 'metadata') + '" data-pa-video' }) +
        (preview ? '' : '<button type="button" class="pa-sound" data-pa-sound aria-label="Play with sound"><i class="fas fa-volume-high" aria-hidden="true"></i><span>Play with sound</span></button>') + '</div>';
    }
    return '';
  }
  /* One ad, ready to place. opts.preview leaves out the controls a parent gets. */
  function adHtml(ad, opts) {
    opts = opts || {};
    var kind = kindOf(ad), head = String(ad.headline || '').trim(), body = String(ad.body || '').trim(), cta = ctaHtml(ad.ctaLabel, ad.ctaUrl);
    var hasCopy = !!(head || body || cta);
    var copy = hasCopy || kind === 'text'
      ? '<div class="pa-copy"><div class="pa-from"><img src="' + LOGO + '" alt="" width="18" height="18">Paisley Studio</div>' +
        (head ? '<h3 class="pa-head">' + esc(head) + '</h3>' : '') + (body ? '<p class="pa-body">' + esc(body) + '</p>' : '') + cta + '</div>'
      : '';
    var x = opts.preview ? '' : '<button type="button" class="pa-x" data-pa-hide="' + esc(ad.id || '') + '" aria-label="Close this ad" title="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>';
    return '<article class="pa-ad kind-' + kind + (hasCopy ? ' has-copy' : '') + '">' + x +
      '<div class="pa-main">' + mediaHtml(ad, kind, opts.preview) + copy + '</div>' + tickerHtml(ad.ticker) + '</article>';
  }

  /* ---------- the ads on the Overview ---------- */
  function mountAds(host, o) {
    o = o || {};
    var root = document.createElement('section');
    root.className = 'pa-root'; root.hidden = true;
    root.setAttribute('aria-label', 'From Paisley Studio');
    var all = [], shown = [], current = 0, lastKey = '', timer = null, holding = false, soundOn = false, inView = false, dead = false, playIO = null, scrollT = null;

    function rail() { return root.querySelector('.pa-rail'); }
    function slides() { return [].slice.call(root.querySelectorAll('.pa-slide')); }
    function paint() {
      if (dead) return;
      var closed = closedAds();
      shown = all.filter(function (a) { return !closed[a.id]; })
        .sort(function (a, b) { return (toDate(b.publishedAt) || 0) - (toDate(a.publishedAt) || 0); });
      var key = JSON.stringify(shown.map(function (a) { return [a.id, a.updatedAt && a.updatedAt.seconds]; }));
      if (key === lastKey) return;
      lastKey = key;
      root.hidden = !shown.length;
      if (!shown.length) { root.innerHTML = ''; return; }
      current = Math.min(current, shown.length - 1);
      root.innerHTML = '<div class="pa-rail" tabindex="-1">' + shown.map(function (a) { return '<div class="pa-slide" data-id="' + esc(a.id) + '">' + adHtml(a) + '</div>'; }).join('') + '</div>' +
        (shown.length > 1 ? '<div class="pa-dots" role="group" aria-label="Choose an ad">' + shown.map(function (a, i) { return '<button type="button" data-pa-dot="' + i + '" aria-label="Ad ' + (i + 1) + ' of ' + shown.length + '"></button>'; }).join('') + '</div>' : '');
      soundOn = false;
      rail().addEventListener('scroll', onScroll, { passive: true });
      observe(); paintDots(); syncVideos(); arm();
    }
    function paintDots() { [].forEach.call(root.querySelectorAll('[data-pa-dot]'), function (d, i) { d.classList.toggle('on', i === current); if (i === current) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); }); }
    function onScroll() {
      clearTimeout(scrollT);
      scrollT = setTimeout(function () {
        var r = rail(); if (!r || !r.clientWidth) return;
        var i = Math.round(r.scrollLeft / (r.scrollWidth / Math.max(1, shown.length)));
        if (i !== current && i >= 0 && i < shown.length) { current = i; soundOn = false; paintDots(); syncVideos(); }
      }, 90);
    }
    function goTo(i, smooth) {
      var r = rail(), s = slides()[i]; if (!r || !s) return;
      current = i;
      r.scrollTo({ left: s.offsetLeft - r.offsetLeft, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
      paintDots(); syncVideos();
    }
    /* Only the ad on screen plays. On a cheap connection nothing plays until pressed. */
    function syncVideos() {
      slides().forEach(function (s, i) {
        var v = s.querySelector('video[data-pa-video]'); if (!v) return;
        if (!soundOn) v.muted = true;
        var go = i === current && inView && !document.hidden && (soundOn || (!g.FastVideo.isCheap() && !reducedMotion()));
        if (go) { if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () { }); } }
        else if (!v.paused) v.pause();
      });
    }
    function arm() {
      clearInterval(timer); timer = null;
      if (shown.length < 2 || reducedMotion()) return;
      timer = setInterval(function () {
        if (holding || soundOn || !inView || document.hidden) return;
        goTo((current + 1) % shown.length, true);
      }, ROTATE_MS);
    }
    function observe() {
      if (!g.IntersectionObserver) { inView = true; return; }
      if (!playIO) {
        playIO = new IntersectionObserver(function (es) { es.forEach(function (e) { inView = e.isIntersecting; }); syncVideos(); }, { threshold: .4 });
        playIO.observe(root);
      }
    }
    root.addEventListener('pointerenter', function () { holding = true; });
    root.addEventListener('pointerleave', function () { holding = false; });
    root.addEventListener('focusin', function () { holding = true; });
    root.addEventListener('focusout', function () { holding = false; });
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pa-hide],[data-pa-dot],[data-pa-sound]'); if (!t) return;
      if (t.dataset.paHide !== undefined) {
        closeAd(t.dataset.paHide); lastKey = ''; paint();
        if (!root.hidden) goTo(current, false);
      } else if (t.dataset.paDot !== undefined) { goTo(Number(t.dataset.paDot), true); }
      else {
        var v = t.parentNode.querySelector('video');
        if (!v) return;
        soundOn = true;
        var card = t.closest('.pa-ad'); if (card) card.classList.add('is-open');
        v.muted = false; v.loop = false; v.controls = true; v.preload = 'auto';
        v.currentTime = 0;
        var p = v.play(); if (p && p.catch) p.catch(function () { });
        t.remove();
      }
    });
    document.addEventListener('visibilitychange', syncVideos);
    var unsub = fbdb().collection('parentAds').where('status', '==', 'live').onSnapshot(function (s) {
      all = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      all.forEach(function (a) { if (a.kind === 'video') g.FastVideo.preconnect(a.mediaUrl); });
      paint();
    }, function (e) { console.warn('parent ads:', e); root.hidden = true; });

    function attach(el) {
      if (!el) return;
      var at = current;
      el.appendChild(root);
      /* The Tech Studio guardian overview redraws itself, so put the ads back as they were. */
      if (shown.length) { goTo(at, false); syncVideos(); }
    }
    attach(host);
    return {
      attach: attach,
      destroy: function () {
        dead = true; unsub(); clearInterval(timer); clearTimeout(scrollT);
        document.removeEventListener('visibilitychange', syncVideos);
        if (playIO) playIO.disconnect();
        root.remove();
      }
    };
  }

  /* ---------- newsletters ---------- */
  function letterHtml(n) {
    var image = httpsUrl(n.imageUrl), video = httpsUrl(n.videoUrl), at = toDate(n.sentAt), media = '';
    if (video) media = '<div class="pn-media">' + g.FastVideo.html(video, { title: n.subject, poster: image }) + '</div>';
    else if (image) media = '<img class="pn-pic" src="' + esc(image) + '" alt="" loading="lazy" decoding="async">';
    return '<article class="pn-letter">' + media + '<div class="pn-text"><h3>' + esc(n.subject || 'Newsletter') + '</h3>' +
      (at ? '<span class="pn-date">' + esc(at.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })) + '</span>' : '') +
      (n.body ? '<div class="pn-body">' + esc(n.body) + '</div>' : '') + ctaHtml(n.ctaLabel, n.ctaUrl) + '</div></article>';
  }

  /* One shared feed per page, for the tab and for the unread bubble. */
  var feed = null;
  function feedFor(uid) {
    if (feed && feed.uid === uid) return feed;
    var f = feed = { uid: uid, list: [], prefs: {}, ready: false, subs: [] };
    function emit() { f.subs.slice().forEach(function (fn) { fn(f); }); }
    fbdb().collection('parentNewsletters').where('published', '==', true).orderBy('sentAt', 'desc').limit(40).onSnapshot(function (s) {
      f.list = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); f.ready = true; emit();
    }, function (e) { console.warn('newsletters:', e); f.ready = true; f.failed = true; emit(); });
    fbdb().collection('parentNewsletterPrefs').doc(uid).onSnapshot(function (d) { f.prefs = d.exists ? d.data() : {}; emit(); }, function (e) { console.warn('newsletter prefs:', e); });
    return f;
  }
  function unreadCount(f) {
    var last = toDate(f.prefs.lastReadAt);
    return f.list.filter(function (n) { var at = toDate(n.sentAt); return at && (!last || at > last); }).length;
  }
  function savePrefs(uid, patch) { return fbdb().collection('parentNewsletterPrefs').doc(uid).set(Object.assign({ updatedAt: FV().serverTimestamp() }, patch), { merge: true }); }
  function markRead(uid) { return savePrefs(uid, { lastReadAt: FV().serverTimestamp() }).catch(function (e) { console.warn('newsletter read:', e); }); }
  /* cb(n) whenever the number of unread newsletters changes. */
  function watchUnread(uid, cb) {
    var f = feedFor(uid), fn = function () { cb(unreadCount(f)); };
    f.subs.push(fn); fn();
    return function () { f.subs = f.subs.filter(function (x) { return x !== fn; }); };
  }

  function mountNewsletter(host, o) {
    var uid = o.uid, f = feedFor(uid), openId = null, opening = null;
    host.innerHTML = '<div class="pn-wrap"><div class="pn-pref"><div><b>Newsletters by email</b><span>News and offers from Paisley Studio. Messages about your child are not affected.</span></div>' +
      '<label class="pn-switch"><input type="checkbox" id="pnEmail" checked aria-label="Email me newsletters"><i aria-hidden="true"></i><span id="pnEmailLbl">On</span></label></div>' +
      '<div class="pn-note" id="pnNote" role="status"></div><div id="pnBody"></div></div>';
    var box = host.querySelector('.pn-wrap'), body = host.querySelector('#pnBody'), sw = host.querySelector('#pnEmail'), lbl = host.querySelector('#pnEmailLbl'), note = host.querySelector('#pnNote');
    sw.addEventListener('change', function () {
      note.textContent = ''; sw.disabled = true;
      savePrefs(uid, { emailOptOut: !sw.checked }).catch(function (e) {
        sw.checked = !sw.checked; note.textContent = 'Could not save that. Please try again.'; console.warn(e);
      }).then(function () { sw.disabled = false; });
    });
    function paint() {
      sw.checked = f.prefs.emailOptOut !== true;
      lbl.textContent = sw.checked ? 'On' : 'Off';
      if (!f.ready) { body.innerHTML = '<div class="pn-empty">Loading…</div>'; return; }
      if (!f.list.length) { body.innerHTML = '<div class="pn-empty"><b>Nothing here yet</b>' + (f.failed ? 'Newsletters could not be loaded just now.' : 'Newsletters from Paisley Studio will appear here, and in your inbox.') + '</div>'; return; }
      if (!f.list.some(function (n) { return n.id === openId; })) openId = f.list[0].id;
      var last = opening === null ? toDate(f.prefs.lastReadAt) : opening;
      if (opening === null) opening = last || 0;
      var sig = openId + '|' + f.list.map(function (n) { return n.id; }).join(',');
      /* A video keeps playing if something unrelated changes. */
      if (box.dataset.sig === sig) return;
      box.dataset.sig = sig;
      var cur = f.list.filter(function (n) { return n.id === openId; })[0];
      body.innerHTML = '<div class="pn-cols"><nav class="pn-list" aria-label="Newsletters">' + f.list.map(function (n) {
        var at = toDate(n.sentAt), fresh = at && (!last || at > last);
        return '<button type="button" class="pn-item' + (n.id === openId ? ' on' : '') + '" data-pn="' + esc(n.id) + '"' + (n.id === openId ? ' aria-current="true"' : '') + '><b>' + (fresh ? '<span class="pn-new">New</span>' : '') + esc(n.subject || 'Newsletter') + '</b><small>' + (at ? esc(at.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })) : '') + '</small></button>';
      }).join('') + '</nav>' + letterHtml(cur) + '</div>';
    }
    body.addEventListener('click', function (e) {
      var t = e.target.closest('[data-pn]'); if (!t) return;
      openId = t.dataset.pn; paint();
    });
    f.subs.push(paint); paint();
    return { update: paint, destroy: function () { f.subs = f.subs.filter(function (x) { return x !== paint; }); host.innerHTML = ''; } };
  }

  g.ParentAds = {
    adHtml: adHtml, letterHtml: letterHtml, mountAds: mountAds, mountNewsletter: mountNewsletter,
    watchUnread: watchUnread, markRead: markRead, httpsUrl: httpsUrl, linkUrl: linkUrl, toDate: toDate
  };
})(window);
