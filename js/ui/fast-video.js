/* =========================================================
   FastVideo: the one way Paisley plays a posted video.
   Works with an AWS link (S3 or CloudFront, .mp4 / .webm / .mov / .m3u8),
   a YouTube, Vimeo or Google Drive link, or a file uploaded to Firebase Storage.
   A Drive video plays in Google's own player (drive.google.com/file/d/ID/preview),
   so the file must be shared as "Anyone with the link" (Viewer is enough).

   Why videos start quickly here:
   - The connection to the video host is opened before anyone presses play.
   - The video in view starts buffering straight away on a normal connection
     (on Data Saver or 2G it only fetches the first few seconds' worth of
     information, so nobody's data bundle is spent without asking).
   - The next video in a playlist is warmed up in advance.
   - .m3u8 (HLS) links play adaptively, so a slow line gets a lower quality
     instead of a frozen picture. hls.js is only downloaded when one is used.
   - YouTube and Vimeo players load only when pressed. They are heavy pages.
   - Leaving a video cancels its download, so the next one has the line.

   What this file cannot do is make a badly prepared file fast. See
   "Hosting videos on AWS" in TECH_UPGRADE.md.

   Markup: <video data-fv data-fv-src="https://..." controls playsinline></video>
   Any such element added to the page is wired up automatically.
     data-fv-preload="auto|metadata|none"  overrides the connection-aware choice
     data-fv-autoplay                      starts as soon as it can
   ========================================================= */
(function (g) {
  'use strict';
  if (g.FastVideo) return;

  var HLS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js';
  var FILE_RE = /\.(mp4|m4v|mov|webm|ogv)$/i;
  var HLS_RE = /\.m3u8$/i;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(u) { return String(u || '').trim(); }
  function pathOf(u) { try { return new URL(u).pathname; } catch (e) { return ''; } }
  function isHttp(u) { return /^https?:\/\//i.test(clean(u)); }
  function isHls(u) { return HLS_RE.test(pathOf(clean(u))); }
  function isFile(u) { return FILE_RE.test(pathOf(clean(u))); }

  function ytId(u) { var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(clean(u)); return m ? m[1] : ''; }
  function vimeoId(u) { var m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(clean(u)); return m ? m[1] : ''; }
  /* drive.google.com/file/d/ID/view, /open?id=ID, /uc?id=ID, docs.google.com/file/d/ID */
  function driveId(u) {
    u = clean(u);
    if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(u) || /\/folders\//i.test(u)) return '';
    var m = /\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/i.exec(u) || /[?&]id=([\w-]{10,})/i.exec(u);
    return m ? m[1] : '';
  }
  function isDrive(u) { return !!driveId(u); }
  /* The player page for a YouTube, Vimeo or Google Drive link, otherwise ''. */
  function embed(u) {
    var y = ytId(u); if (y) return 'https://www.youtube-nocookie.com/embed/' + y;
    var v = vimeoId(u); if (v) return 'https://player.vimeo.com/video/' + v;
    var d = driveId(u); if (d) return 'https://drive.google.com/file/d/' + d + '/preview';
    return '';
  }
  /* True when the link is plainly a video, whatever type the form says. */
  function isVideoLink(u) { return isHttp(u) && (!!embed(u) || isHls(u) || isFile(u)); }

  /* A sentence explaining why a pasted link cannot play, or '' when it looks fine. */
  function problem(u) {
    u = clean(u);
    if (!u) return '';
    if (/^s3:\/\//i.test(u)) return 'That is the S3 URI, which browsers cannot open. In the AWS console open the file and copy its Object URL (it starts with https://).';
    if (/console\.aws\.amazon\.com/i.test(u)) return 'That is a link to the AWS console page. Copy the file’s Object URL or your CloudFront link instead.';
    if (/^http:\/\//i.test(u)) return 'This link starts with http://. Browsers block those on a secure site, so use the https:// address.';
    if (!/^https:\/\//i.test(u)) return 'A video link must start with https://.';
    if (/^https:\/\/(drive|docs)\.google\.com\//i.test(u) && !driveId(u)) return 'That is a Google Drive folder or page, not a video. In Drive, open the video, press Share, set it to “Anyone with the link” and copy that link.';
    return '';
  }

  function conn() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null; }
  /* Data Saver or a very slow line: do not spend the family's data before they ask. */
  function isCheap() { var c = conn(); return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))); }

  var opened = {};
  function preconnect(u) {
    if (!document.head) return;
    var origin = ''; try { origin = new URL(clean(u)).origin; } catch (e) { return; }
    if (!/^https:/.test(origin) || opened[origin]) return;
    opened[origin] = true;
    ['preconnect', 'dns-prefetch'].forEach(function (rel) {
      var l = document.createElement('link'); l.rel = rel; l.href = origin; document.head.appendChild(l);
    });
  }

  var hlsLoading = null;
  function loadHls() {
    if (g.Hls) return Promise.resolve(g.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = HLS_SRC; s.async = true;
      s.onload = function () { res(g.Hls); };
      s.onerror = function () { hlsLoading = null; rej(new Error('Could not load the video player.')); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.fv-wait{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;z-index:2}',
      '.fv-wait.on{display:flex}',
      '.fv-wait span{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.28);border-top-color:#F5C842;animation:fvSpin .8s linear infinite}',
      '@keyframes fvSpin{to{transform:rotate(360deg)}}',
      '.fv-err{position:absolute;inset:0;display:flex;flex-direction:column;gap:.6rem;align-items:center;justify-content:center;text-align:center;padding:1rem;background:#245F5A;color:#fff;font-weight:700;font-size:.9rem;z-index:3}',
      '.fv-err button{border:0;border-radius:10px;background:#F5C842;color:#3b2d00;font:inherit;font-weight:800;padding:.5rem 1.1rem;cursor:pointer}',
      '.fv-face{position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;background:#245F5A center/cover no-repeat;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.fv-face b{width:76px;height:76px;border-radius:50%;background:#55BFB3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem;transition:transform .15s}',
      '.fv-face:hover b,.fv-face:focus-visible b{transform:scale(1.1)}',
      '@media (prefers-reduced-motion:reduce){.fv-wait span{animation-duration:2.4s}.fv-face b{transition:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  /* <video> markup for a posted file or HLS link. */
  function videoHtml(u, o) {
    o = o || {};
    var a = ' data-fv data-fv-src="' + esc(clean(u)) + '" playsinline';
    if (o.poster) a += ' poster="' + esc(o.poster) + '"';
    if (o.attrs) a += ' ' + o.attrs;
    return '<video' + a + '></video>';
  }
  /* A YouTube or Vimeo player that only loads when pressed. */
  function embedHtml(u, o) {
    o = o || {};
    var y = ytId(u), d = driveId(u), poster = o.poster || (y ? 'https://i.ytimg.com/vi/' + y + '/hqdefault.jpg' : (d ? 'https://drive.google.com/thumbnail?id=' + d + '&sz=w1280' : ''));
    preconnect(embed(u));
    return '<button type="button" class="fv-face" data-fv-embed="' + esc(embed(u)) + '" data-fv-title="' + esc(o.title || 'Video') + '" aria-label="Play ' + esc(o.title || 'video') + '"' +
      (poster ? ' style="background-image:url(&quot;' + esc(poster) + '&quot;)"' : '') + '><b aria-hidden="true">&#9654;</b></button>';
  }
  /* Whichever of the two fits the link. Always needs a positioned parent. */
  function html(u, o) { return embed(u) ? embedHtml(u, o) : videoHtml(u, Object.assign({ attrs: 'controls preload="metadata"' }, o || {})); }

  function ensureRelative(el) { if (el && getComputedStyle(el).position === 'static') el.style.position = 'relative'; }

  function enhance(v, opts) {
    if (!v || v._fv) return v;
    var src = v.getAttribute('data-fv-src'); if (!src) return v;
    style();
    v._fv = { src: src };
    var parent = v.parentNode;
    var wait = document.createElement('div');
    wait.className = 'fv-wait'; wait.setAttribute('aria-hidden', 'true'); wait.innerHTML = '<span></span>';
    if (parent) { ensureRelative(parent); parent.appendChild(wait); }
    var on = function () { wait.classList.add('on'); }, off = function () { wait.classList.remove('on'); };
    v._fv.wait = wait;
    ['waiting', 'seeking'].forEach(function (n) { v.addEventListener(n, on); });
    ['playing', 'canplay', 'loadeddata', 'loadedmetadata', 'pause', 'seeked', 'error', 'suspend'].forEach(function (n) { v.addEventListener(n, off); });
    v.addEventListener('error', function () { if (v.getAttribute('src')) showError(v); });

    preconnect(src);
    v.preload = v.getAttribute('data-fv-preload') || (isCheap() ? 'metadata' : 'auto');
    var auto = (opts && opts.autoplay) || v.hasAttribute('data-fv-autoplay');
    attach(v, src, auto);
    if (auto) on();
    return v;
  }
  function attach(v, src, auto) {
    var play = function () { if (!auto) return; var p = v.play(); if (p && p.catch) p.catch(function () { /* the browser wants a press on play */ }); };
    if (isHls(src) && !v.canPlayType('application/vnd.apple.mpegurl')) {
      loadHls().then(function (Hls) {
        if (!v.isConnected && !v._fv) return;
        if (!Hls || !Hls.isSupported()) { showError(v); return; }
        var h = new Hls({ capLevelToPlayerSize: true, startFragPrefetch: true, maxBufferLength: 20, backBufferLength: 30, enableWorker: true });
        v._fv.hls = h;
        h.on(Hls.Events.ERROR, function (_, d) {
          if (!d || !d.fatal) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { h.recoverMediaError(); return; }
          showError(v);
        });
        h.loadSource(src); h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, play);
      }).catch(function () { showError(v); });
      return;
    }
    v.src = src;
    play();
  }
  function showError(v) {
    if (!v._fv || v._fv.err || !v.parentNode) return;
    if (v._fv.wait) v._fv.wait.classList.remove('on');
    var box = document.createElement('div');
    box.className = 'fv-err';
    box.innerHTML = '<div>This video could not be loaded.</div><button type="button">Try again</button>';
    v._fv.err = box;
    box.querySelector('button').addEventListener('click', function () {
      box.remove(); v._fv.err = null;
      if (v._fv.hls) { v._fv.hls.destroy(); v._fv.hls = null; }
      attach(v, v._fv.src, true);
    });
    v.parentNode.appendChild(box);
  }
  /* Stops the download. Call it when a video is taken off the page. */
  function release(v) {
    if (!v || !v._fv) return;
    var f = v._fv; v._fv = null;
    if (f.hls) f.hls.destroy();
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* already gone */ }
    if (f.wait) f.wait.remove();
    if (f.err) f.err.remove();
  }

  /* Opens the connection to the next video and fetches its index, ready for the click. */
  var warmed = {}, warmCount = 0;
  function prewarm(u) {
    u = clean(u);
    if (!isHttp(u)) return;
    if (embed(u)) { preconnect(embed(u)); return; }
    preconnect(u);
    if (isCheap() || warmed[u]) return;
    if (isHls(u)) { if (!g.Hls) loadHls().catch(function () { }); return; }
    if (warmCount >= 4) return;
    warmCount++;
    var v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.src = u;
    warmed[u] = v;
  }

  /* Tries a link without playing it: { ok, ms, duration, width, height, message }.
     For the "Test link" buttons on the staff screens. */
  function test(u) {
    u = clean(u);
    var why = problem(u);
    if (!u) return Promise.resolve({ ok: false, message: 'Paste a link first.' });
    if (why) return Promise.resolve({ ok: false, message: why });
    if (isDrive(u)) return Promise.resolve({ ok: true, embed: true, message: 'Google Drive link. It plays in Google’s player on the page. In Drive, set Share > General access to “Anyone with the link” (Viewer is enough), or students see a sign-in or “no access” screen.' });
    if (embed(u)) return Promise.resolve({ ok: true, embed: true, message: 'YouTube/Vimeo link. It plays in their player when pressed.' });
    return new Promise(function (res) {
      var v = document.createElement('video'), t0 = Date.now(), done = false, hls = null;
      v.muted = true; v.preload = 'metadata';
      function finish(r) {
        if (done) return; done = true;
        if (hls) hls.destroy();
        try { v.removeAttribute('src'); v.load(); } catch (e) { /* nothing to stop */ }
        res(r);
      }
      var timer = setTimeout(function () { finish({ ok: false, message: 'No answer from that link after 25 seconds. Check it is public and the address is complete.' }); }, 25000);
      v.addEventListener('loadedmetadata', function () {
        clearTimeout(timer);
        finish({ ok: true, ms: Date.now() - t0, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      });
      var bad = function () {
        clearTimeout(timer);
        finish({ ok: false, message: 'That link did not open as a video. On AWS, check the object is public (or use the CloudFront link) and that it is an MP4 or M3U8 file.' });
      };
      v.addEventListener('error', bad);
      if (isHls(u) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        loadHls().then(function (Hls) {
          if (done) return;
          if (!Hls || !Hls.isSupported()) return bad();
          hls = new Hls();
          hls.on(Hls.Events.ERROR, function (_, d) {
            if (!d || !d.fatal) return;
            clearTimeout(timer);
            finish({ ok: false, message: 'The M3U8 link could not be read. Your S3 bucket or CloudFront must allow this website in its CORS settings (see TECH_UPGRADE.md).' });
          });
          hls.loadSource(u); hls.attachMedia(v);
        }).catch(bad);
      } else v.src = u;
    });
  }
  /* The sentence a staff screen shows after test(). */
  function testMessage(r) {
    if (!r.ok) return r.message;
    if (r.embed) return r.message;
    var s = (r.ms / 1000).toFixed(1), parts = ['Link works. It answered in ' + s + 's'];
    if (r.duration && isFinite(r.duration)) parts.push(Math.floor(r.duration / 60) + ':' + String(Math.round(r.duration % 60)).padStart(2, '0') + ' long');
    if (r.height) parts.push(r.height + 'p');
    var msg = parts.join(' · ') + '.';
    if (r.ms > 2500) msg += ' That is slow to start: serve it through CloudFront and export it for fast start (see TECH_UPGRADE.md).';
    return msg;
  }

  /* Automatic wiring: anything with data-fv on the page, now or later. */
  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches('video[data-fv]')) enhance(node);
    if (node.querySelectorAll) [].forEach.call(node.querySelectorAll('video[data-fv]'), function (v) { enhance(v); });
  }
  function drop(node) {
    if (!node || node.nodeType !== 1) return;
    var list = node.matches && node.matches('video[data-fv]') ? [node] : [].slice.call(node.querySelectorAll ? node.querySelectorAll('video[data-fv]') : []);
    /* Moved rather than removed (the ad carousel re-attaches itself): leave it playing. */
    list.forEach(function (v) { if (!v.isConnected) release(v); });
  }
  function watch() {
    scan(document.documentElement);
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        [].forEach.call(r.addedNodes, scan);
        [].forEach.call(r.removedNodes, drop);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-fv-embed]'); if (!b) return;
      var f = document.createElement('iframe'), src = b.getAttribute('data-fv-embed');
      f.src = /^https:\/\/drive\.google\.com\//.test(src) ? src : src + (src.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1&rel=0';
      f.title = b.getAttribute('data-fv-title') || 'Video';
      f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.setAttribute('allowfullscreen', '');
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
      b.replaceWith(f);
    });
  }
  if (document.head) style();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  g.FastVideo = {
    esc: esc, embed: embed, isDrive: isDrive, driveId: driveId, isVideoLink: isVideoLink, isHls: isHls, isFile: isFile, problem: problem, isCheap: isCheap,
    preconnect: preconnect, prewarm: prewarm, html: html, videoHtml: videoHtml, embedHtml: embedHtml,
    enhance: enhance, release: release, test: test, testMessage: testMessage
  };
})(window);
