/* =========================================================
   Paisley Advanced IDE — the way in from Tech Studio
   ---------------------------------------------------------
   PaisleyIDEEntry.button({ label, sub, compact }) -> html
     The "Advanced Paisley IDE" button (deep Paisley teal, gold icon,
     a soft shimmer on hover). Give it data-advanced-ide to launch.
   PaisleyIDEEntry.launch({ from, project, origin })
     The first half of the entrance: the studio dims and blurs back, a short
     burst of Paisley-coloured confetti rises from the button, and the
     screen fades to deep charcoal. Then /tech/ide takes over with the
     welcome (it is told to play it through sessionStorage).
     from:    a Code Lab practice to offer to bring along (copied, never moved)
     project: an Advanced IDE project to reopen (a quick fade, no fireworks)
   With reduced motion it is a plain fade.
========================================================= */
(function (g) {
  'use strict';

  var CSS = '' +
    '.pz-adv{position:relative;display:inline-flex;align-items:center;gap:.65rem;padding:.72rem 1.15rem .72rem .8rem;border:1px solid rgba(123,203,194,.35);border-radius:14px;' +
      'background:#173F3B;color:#fff;font:700 .92rem/1.2 Quicksand,sans-serif;cursor:pointer;overflow:hidden;isolation:isolate;' +
      'box-shadow:0 6px 18px rgba(36,95,90,.22);transition:transform .2s cubic-bezier(.2,.7,.2,1),box-shadow .2s,border-color .2s}' +
    '.pz-adv .ic{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;background:rgba(245,200,66,.14);color:#F5C842;font-size:.95rem;transition:transform .25s}' +
    '.pz-adv .tx{display:flex;flex-direction:column;align-items:flex-start;text-align:left}' +
    '.pz-adv .tx small{font-size:.72rem;font-weight:600;color:#9FD9D1;margin-top:.15rem}' +
    '.pz-adv .go{margin-left:.35rem;font-size:.8rem;color:#7BCBC2;transition:transform .2s}' +
    '.pz-adv::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 30%,rgba(123,203,194,.18) 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s ease}' +
    '.pz-adv:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(36,95,90,.32);border-color:#55BFB3}' +
    '.pz-adv:hover::after{transform:translateX(120%)}' +
    '.pz-adv:hover .ic{transform:rotate(-6deg) scale(1.06)}' +
    '.pz-adv:hover .go{transform:translateX(3px)}' +
    '.pz-adv:active{transform:translateY(0) scale(.98)}' +
    '.pz-adv:focus-visible{outline:3px solid #F5C842;outline-offset:2px}' +
    '.pz-adv.compact{padding:.3rem .65rem .3rem .35rem;border-radius:9px;font-size:.78rem;gap:.4rem;box-shadow:none}' +
    '.pz-adv.compact .ic{width:24px;height:24px;border-radius:7px;font-size:.72rem}' +
    '.pz-adv.compact .go{display:none}' +
    '@media(max-width:520px){.pz-adv.compact .tx{display:none}.pz-adv.compact{padding:.3rem}}' +
    '.pz-adv-card{display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;padding:1.3rem 1.4rem;border-radius:20px;background:#0F1A18;color:#D9E7E3;border:1px solid rgba(123,203,194,.16);position:relative;overflow:hidden}' +
    '.pz-adv-card .t{flex:1;min-width:220px}' +
    '.pz-adv-card h3{margin:0;font:800 1.08rem/1.3 Quicksand,sans-serif;color:#fff}' +
    '.pz-adv-card h3 span{color:#55BFB3}' +
    '.pz-adv-card p{margin:.35rem 0 0;font-size:.86rem;font-weight:500;color:#A9C2BC;line-height:1.5}' +
    '.pz-adv-card .langs{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.7rem}' +
    '.pz-adv-card .langs i,.pz-adv-card .langs b{display:inline-grid;place-items:center;height:26px;min-width:26px;padding:0 .35rem;border-radius:7px;background:rgba(255,255,255,.06);font-size:.8rem;font-style:normal}' +
    '.pz-adv-card .langs b{font:800 .62rem/1 Quicksand,sans-serif;color:#C9D7F5}' +
    '.pz-adv-card .pz-adv{background:#55BFB3;color:#05241f;border-color:#55BFB3}' +
    '.pz-adv-card .pz-adv .ic{background:rgba(5,36,31,.12);color:#05241f}' +
    '.pz-adv-card .pz-adv .go{color:#05241f}' +
    '.pz-adv-card .pz-adv .tx small{color:#0d4d46}' +
    /* The page steps back behind a dimming, blurring veil (the page itself is never moved, so
       fixed sidebars stay put), then the veil deepens to the IDE's charcoal. */
    '.pz-adv-veil{position:fixed;inset:0;z-index:9999;pointer-events:all;background-color:rgba(11,15,14,.42);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);opacity:0;transition:opacity .45s ease,background-color .5s ease}' +
    '.pz-adv-veil.soft{opacity:1}' +
    '.pz-adv-veil.on{opacity:1;background-color:#0B0F0E}' +
    '.pz-adv-fx{position:fixed;inset:0;z-index:10000;pointer-events:none}' +
    '@media(prefers-reduced-motion:reduce){.pz-adv,.pz-adv *,.pz-adv::after,.pz-adv-veil{transition:none!important}}';
  function style() {
    if (document.getElementById('pz-adv-css')) return;
    var s = document.createElement('style'); s.id = 'pz-adv-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  function button(o) {
    style(); o = o || {};
    return '<button type="button" class="pz-adv' + (o.compact ? ' compact' : '') + '" data-advanced-ide' + (o.from ? ' data-from="' + String(o.from).replace(/"/g, '') + '"' : '') +
      ' title="Open the Advanced Paisley IDE: Python, Java, C, C++, PHP and the web, with real code runs" aria-label="Open the Advanced Paisley IDE">' +
      '<span class="ic"><i class="fas fa-terminal" aria-hidden="true"></i></span><span class="tx">' + (o.label || 'Advanced Paisley IDE') + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span>' +
      '<i class="fas fa-arrow-right go" aria-hidden="true"></i></button>';
  }
  function card() {
    style();
    return '<section class="pz-adv-card" aria-label="Advanced Paisley IDE"><div class="t"><h3>Ready for more? Meet the <span>Advanced Paisley IDE</span></h3>' +
      '<p>A professional coding studio for Python, Java, C, C++, PHP and the web. Suggestions as you type, real runs, and your projects saved to your account.</p>' +
      '<div class="langs" aria-hidden="true"><i class="fab fa-python" style="color:#5A9FD4"></i><i class="fab fa-java" style="color:#F08A24"></i><b>C</b><b>C++</b><i class="fab fa-php" style="color:#A6A9E0"></i><i class="fab fa-js" style="color:#F2D24A"></i><i class="fab fa-html5" style="color:#F0653A"></i><i class="fab fa-css3-alt" style="color:#4AA3E8"></i></div></div>' +
      button({ sub: 'Unlock the next level' }) + '</section>';
  }

  var busy = false;
  function launch(o) {
    o = o || {};
    if (busy) return; busy = true;
    style();
    var url = '/tech/ide' + (o.project ? '?p=' + encodeURIComponent(o.project) : o.from ? '?from=' + encodeURIComponent(o.from) : '');
    var reduced = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cinematic = !o.project && !reduced;
    try { sessionStorage.setItem('pz-ide-welcome', cinematic ? '1' : '0'); } catch (e) { }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { });
    var veil = document.createElement('div'); veil.className = 'pz-adv-veil'; document.body.appendChild(veil);
    var go = function () { location.href = url; };
    if (!cinematic) {
      requestAnimationFrame(function () { veil.classList.add('on'); });
      setTimeout(go, reduced ? 120 : 380);
      return;
    }
    requestAnimationFrame(function () { veil.classList.add('soft'); });
    confetti(o.origin);
    setTimeout(function () { veil.classList.add('on'); }, 650);
    setTimeout(go, 1180);
  }

  /* A short, upward burst of Paisley-coloured pieces from the button. */
  function confetti(origin) {
    var c = document.createElement('canvas'); c.className = 'pz-adv-fx'; document.body.appendChild(c);
    var dpr = Math.min(2, g.devicePixelRatio || 1), W = innerWidth, H = innerHeight, ctx = c.getContext('2d');
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var r = origin && origin.getBoundingClientRect ? origin.getBoundingClientRect() : { left: W / 2 - 40, top: H / 2, width: 80, height: 10 };
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var COLORS = ['#55BFB3', '#7BCBC2', '#F5C842', '#245F5A', '#FFFFFF'], P = [];
    for (var i = 0; i < 110; i++) {
      var a = -Math.PI / 2 + (Math.random() - .5) * 1.9, s = 5 + Math.random() * 9;
      P.push({ x: ox + (Math.random() - .5) * r.width * .6, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 4 + Math.random() * 5, h: 2 + Math.random() * 3, rot: Math.random() * 6, vr: (Math.random() - .5) * .35, c: COLORS[i % COLORS.length], life: 1 });
    }
    var last = performance.now(), t0 = last;
    (function loop(now) {
      var dt = Math.min(2.5, (now - last) / 16.7); last = now;
      ctx.clearRect(0, 0, W, H);
      P.forEach(function (p) {
        p.vy += .32 * dt; p.vx *= Math.pow(.985, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life = Math.max(0, 1 - (now - t0) / 1150);
        ctx.save(); ctx.globalAlpha = p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (now - t0 < 1200) requestAnimationFrame(loop);
    })(last);
  }

  /* Any [data-advanced-ide] on the page launches; data-from / data-project say what to bring. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-advanced-ide]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    launch({ from: b.getAttribute('data-from') || '', project: b.getAttribute('data-project') || '', origin: b });
  }, true);
  /* Coming back with the browser's Back button must not leave the veil up. */
  g.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    busy = false;
    Array.prototype.forEach.call(document.querySelectorAll('.pz-adv-veil,.pz-adv-fx'), function (n) { n.remove(); });
  });

  g.PaisleyIDEEntry = { button: button, card: card, launch: launch, style: style };
})(window);
