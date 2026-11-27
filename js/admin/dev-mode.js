/* =========================================================
   Paisley Studio — Admin > Settings > Developer mode
   -----------------------------------------------------------
   Two tools for the Studio Desk while it builds and tests:

   1. Maintenance banner  -> siteStatus/maintenance
      A floating card on every page (js/ui/site-status.js): planned or under
      maintenance, a message, start and end. It never blocks anyone.

   2. Freeze              -> devMode/freeze   (functions/dev-freeze.js enforces it)
      Hold notifications and emails while testing: pick the areas (Tech Studio,
      classes, homework, exams...), who is frozen (students, parents, tutors,
      coaches) and the test accounts that still receive. Admins always receive.
      What was held is listed from devHeld.

   AdminDevMode.mount(host, { uid, name }) -> { destroy() }
========================================================= */
(function (g) {
  'use strict';
  var db = function () { return firebase.firestore(); };
  var FV = function () { return firebase.firestore.FieldValue; };
  var TS = function () { return firebase.firestore.Timestamp; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ms(t) { if (!t) return 0; if (t.toMillis) return t.toMillis(); if (t instanceof Date) return t.getTime(); if (typeof t === 'number') return t; var d = Date.parse(t); return isNaN(d) ? 0 : d; }
  function when(t) { var m = ms(t); if (!m) return ''; try { return new Date(m).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(m).toString(); } }
  function localInput(m) { if (!m) return ''; var d = new Date(m), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function ago(m) {
    var s = Math.round((Date.now() - m) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return when(m);
  }
  function left(m) {
    var mm = Math.max(1, Math.round((m - Date.now()) / 60000));
    if (mm < 60) return mm + ' min'; var h = Math.floor(mm / 60), r = mm % 60; return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  var AREAS = [
    ['tech', 'fa-wand-magic-sparkles', 'Tech Studio', 'Classes, practice, publishing, coach and guardian alerts'],
    ['classes', 'fa-chalkboard', 'Classes and lessons', 'New lessons and materials posted to students'],
    ['homework', 'fa-book-open', 'Homework and classwork', 'Set, due, overdue, marked, reminders and digests'],
    ['exams', 'fa-file-pen', 'Exams', 'New exams, reminders, results'],
    ['live', 'fa-video', 'Live classes and timetable', 'Scheduled classes and changes'],
    ['attendance', 'fa-clipboard-user', 'Attendance', 'Late, absent, strikes and registers'],
    ['tuition', 'fa-graduation-cap', 'Tuition', 'CBC tuition requests, timetables, tickets'],
    ['messages', 'fa-comments', 'Messages and tickets', 'Chats, replies and support tickets'],
    ['accounts', 'fa-user-check', 'Accounts and enrolments', 'Sign-ups, activations, invitations'],
    ['newsletter', 'fa-bullhorn', 'Newsletter', 'Parent newsletters (test sends to you still go)'],
    ['other', 'fa-ellipsis', 'Everything else', 'Anything not listed above']
  ];
  var AUD = [['students', 'fa-user-graduate', 'Students and builders'], ['parents', 'fa-people-roof', 'Parents and guardians'], ['tutors', 'fa-chalkboard-user', 'Tutors'], ['coaches', 'fa-user-tie', 'Tech coaches']];
  var AREA_NAME = {}; AREAS.forEach(function (a) { AREA_NAME[a[0]] = a[2]; });
  var ROLE_WORD = { student: 'Student', builder: 'Builder', parent: 'Parent', guardian: 'Guardian', tutor: 'Tutor', coach: 'Coach' };
  var PEOPLE = [['students', 'student'], ['techStudents', 'builder'], ['parentAccounts', 'parent'], ['tutorAccounts', 'tutor'], ['techCoaches', 'coach']];

  function nameOf(d) {
    return String(d.name || d.fullName || d.displayName || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.studentName || d.email || 'No name').trim();
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'dv-style';
    s.textContent = [
      '.dv{max-width:1080px;display:grid;gap:1.1rem}',
      '.dv-card{background:var(--surface,#fff);border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:16px;padding:1.4rem 1.5rem;animation:dvUp .5s ease both}',
      '.dv-card:nth-child(2){animation-delay:.06s}.dv-card:nth-child(3){animation-delay:.12s}.dv-card:nth-child(4){animation-delay:.18s}',
      '.dv-hd{display:flex;align-items:flex-start;gap:.9rem;margin-bottom:1rem}',
      '.dv-ic{flex:0 0 auto;width:44px;height:44px;border-radius:13px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:grid;place-items:center;font-size:1.05rem;position:relative}',
      '.dv-ic.on::after{content:"";position:absolute;inset:-4px;border-radius:16px;border:2px solid var(--brand,#55BFB3);animation:dvRing 2s ease-out infinite}',
      '.dv-ic.warm{background:#FDF1DF;color:#9A5B00}.dv-ic.warm.on::after{border-color:#F39C12}',
      '.dv-hd h3{font-size:1.05rem;font-weight:800;margin:0}',
      '.dv-hd p{margin:.2rem 0 0;color:var(--muted,#5A6E6A);font-size:.82rem;font-weight:600;line-height:1.5}',
      '.dv-hd .grow{flex:1;min-width:0}',
      '.dv-state{display:inline-flex;align-items:center;gap:.4rem;font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:.3rem .65rem;border-radius:20px;background:var(--sage,#E5F2EF);color:var(--muted,#5A6E6A);white-space:nowrap}',
      '.dv-state i{width:7px;height:7px;border-radius:50%;background:currentColor}',
      '.dv-state.on{background:#DDF4EF;color:var(--brand-deep,#245F5A)}.dv-state.on i{animation:dvBlink 1.3s ease-in-out infinite}',
      '.dv-state.warm{background:#FDF1DF;color:#9A5B00}',
      '.dv-sw{display:flex;align-items:center;gap:.8rem;padding:.85rem 1rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;cursor:pointer;background:var(--paper,#F1F9F7);margin-bottom:1rem}',
      '.dv-sw input{position:absolute;opacity:0;pointer-events:none}',
      '.dv-sw .tr{flex:0 0 auto;width:44px;height:24px;border-radius:20px;background:#C9D6D3;position:relative;transition:background .25s}',
      '.dv-sw .tr::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .25s cubic-bezier(.3,1.4,.5,1)}',
      '.dv-sw input:checked + .tr{background:var(--brand,#55BFB3)}.dv-sw input:checked + .tr::after{transform:translateX(20px)}',
      '.dv-sw.warm input:checked + .tr{background:#F39C12}',
      '.dv-sw input:focus-visible + .tr{outline:3px solid rgba(85,191,179,.4);outline-offset:2px}',
      '.dv-sw b{display:block;font-size:.9rem}.dv-sw span.s{display:block;font-size:.76rem;color:var(--muted,#5A6E6A);font-weight:600}',
      '.dv-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem 1rem}',
      '.dv-f{display:grid;gap:.3rem}.dv-f.full{grid-column:1/-1}',
      '.dv-f label,.dv-lb{font-size:.7rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.dv-f input[type=text],.dv-f input[type=datetime-local],.dv-f textarea,.dv-f select,.dv-search{width:100%;font:inherit;font-weight:600;font-size:.88rem;color:var(--ink,#263331);background:#fff;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:10px;padding:.6rem .75rem;transition:border-color .2s,box-shadow .2s}',
      '.dv-f textarea{min-height:76px;resize:vertical}',
      '.dv-f input:focus,.dv-f textarea:focus,.dv-f select:focus,.dv-search:focus{outline:none;border-color:var(--brand,#55BFB3);box-shadow:0 0 0 4px rgba(85,191,179,.15)}',
      '.dv-chips{display:flex;flex-wrap:wrap;gap:.4rem}',
      '.dv-chip{font:inherit;font-size:.76rem;font-weight:700;padding:.42rem .8rem;border-radius:20px;border:1.5px solid var(--line,rgba(38,51,49,.1));background:#fff;color:var(--ink,#263331);cursor:pointer;transition:all .2s}',
      '.dv-chip:hover{border-color:var(--brand,#55BFB3)}.dv-chip.on{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#fff}',
      /* Segmented switch (Starts: Now / Later, How long, Ends by itself): one slim track, the chosen option raised. */
      '.dv-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;width:max-content;max-width:100%;background:var(--paper,#F1F9F7);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:10px}',
      '.dv-seg .dv-chip{border:0;background:transparent;padding:.34rem .8rem;font-size:.76rem;font-weight:700;line-height:1.25;border-radius:7px;color:var(--muted,#5A6E6A);white-space:nowrap}',
      '.dv-seg .dv-chip:hover{color:var(--brand-deep,#245F5A);background:rgba(255,255,255,.6)}',
      '.dv-seg .dv-chip.on{background:#fff;color:var(--brand-deep,#245F5A);box-shadow:0 1px 4px rgba(36,95,90,.16)}',
      '.dv-seg .dv-chip:focus-visible{outline:2px solid var(--brand,#55BFB3);outline-offset:1px}',
      '.dv-when{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}',
      '.dv-f .dv-when input[type=datetime-local]{width:auto;max-width:240px;padding:.42rem .6rem;font-size:.82rem}',
      '.dv-sec{margin-top:1.2rem}.dv-sec>.dv-lb{display:flex;align-items:center;gap:.5rem;margin-bottom:.55rem}.dv-sec>.dv-lb .x{margin-left:auto;display:flex;gap:.35rem}',
      '.dv-mini{font:inherit;font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:none;background:none;color:var(--brand-deep,#245F5A);cursor:pointer;padding:.15rem .3rem;border-radius:6px}.dv-mini:hover{background:var(--sage,#E5F2EF)}',
      '.dv-areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.55rem}',
      '.dv-tile{position:relative;display:flex;gap:.65rem;align-items:flex-start;padding:.75rem .8rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:12px;cursor:pointer;background:#fff;transition:border-color .2s,background .2s,transform .2s}',
      '.dv-tile:hover{transform:translateY(-1px);border-color:var(--brand-soft,#7BCBC2)}',
      '.dv-tile input{position:absolute;opacity:0;pointer-events:none}',
      '.dv-tile .ti{flex:0 0 auto;width:32px;height:32px;border-radius:9px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:grid;place-items:center;font-size:.85rem;transition:background .2s,color .2s}',
      '.dv-tile b{display:block;font-size:.84rem}.dv-tile small{display:block;font-size:.72rem;color:var(--muted,#5A6E6A);font-weight:600;line-height:1.35;margin-top:.1rem}',
      '.dv-tile .ck{margin-left:auto;flex:0 0 auto;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line,rgba(38,51,49,.18));display:grid;place-items:center;color:#fff;font-size:.65rem;transition:all .2s}',
      '.dv-tile:has(input:checked){border-color:#F39C12;background:#FFFaf2}',
      '.dv-tile:has(input:checked) .ti{background:#FDF1DF;color:#9A5B00}',
      '.dv-tile:has(input:checked) .ck{background:#F39C12;border-color:#F39C12}',
      '.dv-tile:has(input:focus-visible){outline:3px solid rgba(85,191,179,.4);outline-offset:2px}',
      '.dv-people{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.6rem}',
      '.dv-person{display:inline-flex;align-items:center;gap:.45rem;padding:.35rem .4rem .35rem .65rem;border-radius:20px;background:#DDF4EF;color:var(--brand-deep,#245F5A);font-size:.78rem;font-weight:700;animation:dvPop .3s cubic-bezier(.3,1.4,.5,1) both}',
      '.dv-person small{font-weight:600;opacity:.75}.dv-person.via{background:var(--sage,#E5F2EF)}',
      '.dv-person button{border:none;background:rgba(36,95,90,.12);color:inherit;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:.65rem;display:grid;place-items:center}',
      '.dv-results{margin-top:.4rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;max-height:240px;overflow:auto;background:#fff}',
      '.dv-results:empty{display:none}',
      '.dv-res{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;font:inherit;padding:.55rem .75rem;border:none;border-bottom:1px solid var(--line-soft,rgba(38,51,49,.06));background:none;cursor:pointer}',
      '.dv-res:hover,.dv-res:focus-visible{background:var(--paper,#F1F9F7);outline:none}',
      '.dv-res b{font-size:.84rem}.dv-res span{font-size:.74rem;color:var(--muted,#5A6E6A);font-weight:600}',
      '.dv-res .r{margin-left:auto;font-size:.66rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--brand-deep,#245F5A);background:var(--sage,#E5F2EF);padding:.15rem .5rem;border-radius:10px}',
      '.dv-note{font-size:.78rem;color:var(--muted,#5A6E6A);font-weight:600;line-height:1.5;margin:.5rem 0 0}',
      '.dv-note i{color:var(--brand-deep,#245F5A);margin-right:.3rem}',
      '.dv-foot{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem;padding-top:1rem;border-top:1px solid var(--line-soft,rgba(38,51,49,.06))}',
      '.dv-foot .grow{flex:1}',
      '.dv-msg{font-size:.8rem;font-weight:700}.dv-msg.ok{color:var(--brand-deep,#245F5A)}.dv-msg.err{color:#b8362a}',
      '.dv-btn{display:inline-flex;align-items:center;gap:.45rem;font:inherit;font-weight:800;font-size:.76rem;letter-spacing:.05em;text-transform:uppercase;padding:.65rem 1.1rem;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;color:var(--ink,#263331);cursor:pointer;transition:all .25s}',
      '.dv-btn:hover{border-color:var(--brand,#55BFB3);color:var(--brand-deep,#245F5A)}',
      '.dv-btn.pri{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#fff}.dv-btn.pri:hover{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff;transform:translateY(-1px)}',
      '.dv-btn.warm{background:#F39C12;border-color:#F39C12;color:#fff}.dv-btn.warm:hover{background:#c97c06;border-color:#c97c06;color:#fff}',
      '.dv-btn[disabled]{opacity:.55;cursor:default;transform:none}',
      '.dv-held{display:grid;gap:.45rem}',
      '.dv-hrow{display:grid;grid-template-columns:auto 1fr auto;gap:.75rem;align-items:center;padding:.65rem .8rem;border:1px solid var(--line-soft,rgba(38,51,49,.06));border-radius:12px;background:var(--paper,#F1F9F7);animation:dvSlide .35s ease both}',
      '.dv-hrow .hi{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:#fff;color:#9A5B00;font-size:.8rem}',
      '.dv-hrow b{font-size:.84rem;display:block}.dv-hrow span{font-size:.74rem;color:var(--muted,#5A6E6A);font-weight:600}',
      '.dv-hrow .tag{font-size:.64rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:.15rem .5rem;border-radius:10px;background:#FDF1DF;color:#9A5B00;margin-right:.35rem}',
      '.dv-hrow time{font-size:.72rem;color:var(--muted,#5A6E6A);font-weight:700;white-space:nowrap}',
      '.dv-empty{text-align:center;padding:1.6rem 1rem;color:var(--muted,#5A6E6A);font-size:.84rem;font-weight:600}',
      '.dv-empty i{display:block;font-size:1.4rem;color:var(--brand-soft,#7BCBC2);margin-bottom:.5rem}',
      '.dv-summary{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1rem}',
      '.dv-tabs{display:inline-flex;gap:.3rem;padding:.25rem;border-radius:12px;background:var(--paper,#F1F9F7);margin:.2rem 0 .7rem}',
      '.dv-tab{font:inherit;font-size:.78rem;font-weight:800;border:none;background:none;padding:.45rem .85rem;border-radius:9px;cursor:pointer;color:var(--muted,#5A6E6A)}',
      '.dv-tab.on{background:#fff;color:var(--brand-deep,#245F5A);box-shadow:0 2px 8px rgba(36,95,90,.1)}',
      '.dv-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.5rem;margin-bottom:.6rem}',
      '.dv-filters select,.dv-filters input{width:100%;padding:.55rem .65rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.82rem;background:#fff;color:var(--ink,#263331)}',
      '.dv-filters select:focus,.dv-filters input:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.dv-blist{border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;max-height:300px;overflow:auto;background:#fff}',
      '.dv-brow{display:flex;align-items:center;gap:.65rem;padding:.5rem .75rem;border-bottom:1px solid var(--line-soft,rgba(38,51,49,.06));cursor:pointer;font-size:.83rem}',
      '.dv-brow:hover{background:var(--paper,#F1F9F7)}.dv-brow input{width:16px;height:16px;accent-color:#245F5A;flex:none}',
      '.dv-brow .n{flex:1;min-width:0}.dv-brow .n b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-brow .n span{font-size:.72rem;color:var(--muted,#5A6E6A);font-weight:600}',
      '.dv-brow .r{font-size:.64rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--brand-deep,#245F5A);background:var(--sage,#E5F2EF);padding:.15rem .5rem;border-radius:10px;white-space:nowrap}',
      '.dv-brow.in{opacity:.55}',
      '.dv-bbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.6rem 0 0}.dv-bbar .cnt{font-size:.78rem;font-weight:800;color:var(--brand-deep,#245F5A)}.dv-bbar .grow{flex:1}',
      '.dv-summary span{font-size:.74rem;font-weight:700;padding:.3rem .65rem;border-radius:20px;background:#FDF1DF;color:#9A5B00}',
      '@keyframes dvUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
      '@keyframes dvSlide{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}',
      '@keyframes dvPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}',
      '@keyframes dvRing{0%{opacity:.7;transform:scale(.9)}100%{opacity:0;transform:scale(1.25)}}',
      '@keyframes dvBlink{0%,100%{opacity:1}50%{opacity:.3}}',
      '@media (max-width:720px){.dv-grid{grid-template-columns:1fr}.dv-card{padding:1.1rem}.dv-hd{flex-wrap:wrap}}',
      '@media (max-width:520px){.dv-seg{width:100%}.dv-seg .dv-chip{flex:1 1 auto;text-align:center;padding:.4rem .5rem}.dv-f .dv-when input[type=datetime-local]{max-width:none;width:100%}.dv-foot .dv-btn{flex:1 1 100%;justify-content:center}.dv-foot .grow{display:none}}',
      '@media (prefers-reduced-motion:reduce){.dv *,.dv{animation:none!important;transition:none!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function mount(host, me) {
    style();
    me = me || {};
    var dead = false, unsubs = [];
    var maint = null, frz = null, held = [], people = null, peopleLoading = null;
    var picked = [];               /* freeze allow list being edited */
    var mEnd = 'h2', fEnd = 'h3';  /* chosen end presets */
    var mDirty = false, fDirty = false;   /* unsaved edits: live updates never repaint over them */

    host.innerHTML = '<div class="dv">' +
      '<div class="dv-card" id="dvM"></div>' +
      '<div class="dv-card" id="dvF"></div>' +
      '<div class="dv-card" id="dvH"></div>' +
    '</div>';
    var mEl = host.querySelector('#dvM'), fEl = host.querySelector('#dvF'), hEl = host.querySelector('#dvH');

    /* ================= Maintenance banner ================= */
    var M_ENDS = [['m30', '30 min', 30], ['h1', '1 hour', 60], ['h2', '2 hours', 120], ['h4', '4 hours', 240], ['day', 'Until tonight', -1], ['none', 'Until I switch it off', 0], ['custom', 'Pick an end', -2]];
    function mLive(d) { return !!d && d.on === true && (!ms(d.endsAt) || ms(d.endsAt) > Date.now()); }
    function paintM() {
      var d = maint || {}, live = mLive(d), soon = live && ms(d.startsAt) > Date.now();
      var state = live ? (soon ? '<span class="dv-state warm"><i></i>Planned · starts in ' + esc(left(ms(d.startsAt))) + '</span>' : '<span class="dv-state on"><i></i>Showing now' + (ms(d.endsAt) ? ' · ' + esc(left(ms(d.endsAt))) + ' left' : '') + '</span>') : '<span class="dv-state"><i></i>Off</span>';
      var startMode = ms(d.startsAt) > Date.now() ? 'later' : 'now';
      mEl.innerHTML = '<div class="dv-hd"><span class="dv-ic' + (live ? ' on' : '') + '"><i class="fas fa-screwdriver-wrench"></i></span><div class="grow"><h3>Maintenance banner</h3>' +
        '<p>A small floating card on every page of the site and every portal: planned, then under maintenance, with your message and how long. Nobody is blocked; they keep working.</p></div>' + state + '</div>' +
        '<label class="dv-sw"><input type="checkbox" id="dvMOn"' + (d.on ? ' checked' : '') + '><span class="tr"></span><span><b>Show the banner</b><span class="s">On every page, signed in or not, within about a minute.</span></span></label>' +
        '<div class="dv-grid">' +
          '<div class="dv-f"><label for="dvMTitle">Heading</label><input type="text" id="dvMTitle" maxlength="80" placeholder="We are improving Paisley Studio" value="' + esc(d.title || '') + '"></div>' +
          '<div class="dv-f"><label for="dvMTone">Look</label><select id="dvMTone"><option value="info"' + (d.tone !== 'warn' ? ' selected' : '') + '>Calm (teal)</option><option value="warn"' + (d.tone === 'warn' ? ' selected' : '') + '>Important (amber)</option></select></div>' +
          '<div class="dv-f full"><label for="dvMMsg">Message</label><textarea id="dvMMsg" maxlength="400" placeholder="Some pages may be slow or refresh while we work. Your work is saved.">' + esc(d.message || '') + '</textarea></div>' +
          '<div class="dv-f"><span class="dv-lb">Starts</span><div class="dv-when"><div class="dv-chips dv-seg" id="dvMStart" role="group" aria-label="Starts"><button type="button" class="dv-chip' + (startMode === 'now' ? ' on' : '') + '" data-s="now">Now</button><button type="button" class="dv-chip' + (startMode === 'later' ? ' on' : '') + '" data-s="later">Later</button></div>' +
            '<input type="datetime-local" id="dvMStartAt" value="' + esc(localInput(ms(d.startsAt) > Date.now() ? ms(d.startsAt) : Date.now() + 3600000)) + '"' + (startMode === 'later' ? '' : ' hidden') + ' aria-label="Start time"></div></div>' +
          '<div class="dv-f"><span class="dv-lb">How long</span><div class="dv-when"><div class="dv-chips dv-seg" id="dvMEnd" role="group" aria-label="How long">' + M_ENDS.map(function (e) { return '<button type="button" class="dv-chip' + (mEnd === e[0] ? ' on' : '') + '" data-e="' + e[0] + '">' + e[1] + '</button>'; }).join('') + '</div>' +
            '<input type="datetime-local" id="dvMEndAt" value="' + esc(localInput(ms(d.endsAt) || Date.now() + 2 * 3600000)) + '"' + (mEnd === 'custom' ? '' : ' hidden') + ' aria-label="End time"></div></div>' +
        '</div>' +
        '<div class="dv-foot"><button type="button" class="dv-btn" id="dvMPrev"><i class="fas fa-eye"></i> Preview here</button><span class="dv-msg" id="dvMMsgOut" role="status"></span><span class="grow"></span>' +
          '<button type="button" class="dv-btn pri" id="dvMSave"><i class="fas fa-floppy-disk"></i> Save banner</button></div>';
    }
    function mForm() {
      var q = function (s) { return mEl.querySelector(s); };
      var startLater = q('#dvMStart .on') && q('#dvMStart .on').dataset.s === 'later';
      var start = startLater ? Date.parse(q('#dvMStartAt').value) : Date.now();
      if (startLater && (!start || isNaN(start))) throw new Error('Pick when it starts.');
      var end = 0, pre = M_ENDS.filter(function (e) { return e[0] === mEnd; })[0];
      if (mEnd === 'custom') { end = Date.parse(q('#dvMEndAt').value); if (!end || isNaN(end)) throw new Error('Pick when it ends.'); }
      else if (mEnd === 'day') { var t = new Date(start); t.setHours(23, 59, 0, 0); end = t.getTime(); }
      else if (pre && pre[2] > 0) end = start + pre[2] * 60000;
      if (end && end <= start) throw new Error('The end must be after the start.');
      return { on: q('#dvMOn').checked, title: q('#dvMTitle').value.trim().slice(0, 80), message: q('#dvMMsg').value.trim().slice(0, 400), tone: q('#dvMTone').value === 'warn' ? 'warn' : 'info', startsAt: start, endsAt: end };
    }
    mEl.addEventListener('input', function () { mDirty = true; });
    mEl.addEventListener('change', function () { mDirty = true; });
    mEl.addEventListener('click', function (e) {
      var c = e.target.closest('.dv-chip');
      if (c) mDirty = true;
      if (c && c.dataset.s) { [].forEach.call(mEl.querySelectorAll('#dvMStart .dv-chip'), function (x) { x.classList.toggle('on', x === c); }); mEl.querySelector('#dvMStartAt').hidden = c.dataset.s !== 'later'; return; }
      if (c && c.dataset.e) { mEnd = c.dataset.e; [].forEach.call(mEl.querySelectorAll('#dvMEnd .dv-chip'), function (x) { x.classList.toggle('on', x === c); }); mEl.querySelector('#dvMEndAt').hidden = mEnd !== 'custom'; return; }
      var out = mEl.querySelector('#dvMMsgOut');
      if (e.target.closest('#dvMPrev')) {
        try {
          var f = mForm();
          if (!g.PaisleySiteStatus) { out.className = 'dv-msg err'; out.textContent = 'The banner script is not on this page.'; return; }
          g.PaisleySiteStatus.preview({ on: true, title: f.title, message: f.message, tone: f.tone, startsAt: f.startsAt, endsAt: f.endsAt, updatedAt: Date.now() });
          out.className = 'dv-msg ok'; out.textContent = 'Preview at the bottom right: a pill that opens into the card when pressed. It goes when you save or leave Settings.';
        } catch (er) { out.className = 'dv-msg err'; out.textContent = er.message; }
        return;
      }
      if (e.target.closest('#dvMSave')) {
        var btn = e.target.closest('#dvMSave'), f2;
        try { f2 = mForm(); } catch (er) { out.className = 'dv-msg err'; out.textContent = er.message; return; }
        btn.disabled = true; out.className = 'dv-msg'; out.textContent = 'Saving…';
        db().collection('siteStatus').doc('maintenance').set({
          on: f2.on, title: f2.title, message: f2.message, tone: f2.tone,
          startsAt: TS().fromMillis(f2.startsAt), endsAt: f2.endsAt ? TS().fromMillis(f2.endsAt) : null,
          updatedAt: FV().serverTimestamp(), updatedBy: me.uid || ''
        }).then(function () {
          btn.disabled = false; out.className = 'dv-msg ok'; mDirty = false;
          out.textContent = f2.on ? 'Saved. Every page shows it within about a minute.' : 'Saved. The banner is off.';
          try { sessionStorage.removeItem('pz-site-status'); } catch (er) { }
          if (g.PaisleySiteStatus) g.PaisleySiteStatus.preview(null);
        }).catch(function (er) { btn.disabled = false; out.className = 'dv-msg err'; out.textContent = 'Could not save: ' + (er.message || er); });
      }
    });

    /* ================= Freeze ================= */
    var F_ENDS = [['h1', '1 hour', 60], ['h3', '3 hours', 180], ['day', 'Until tonight', -1], ['none', 'Until I switch it off', 0]];
    function fLive(d) { return !!d && d.on === true && (!ms(d.until) || ms(d.until) > Date.now()); }
    function paintF() {
      var d = frz || {}, live = fLive(d), areas = d.areas || {}, aud = d.audiences || { students: true, parents: true };
      if (!frz) areas = { classes: true, homework: true, exams: true, tech: true, live: true };
      var nAreas = AREAS.filter(function (a) { return areas[a[0]]; }).length;
      fEl.innerHTML = '<div class="dv-hd"><span class="dv-ic warm' + (live ? ' on' : '') + '"><i class="fas fa-snowflake"></i></span><div class="grow"><h3>Freeze notifications and emails</h3>' +
        '<p>For testing on live accounts. While it is on, in the areas you tick, anything you post (lessons, homework, exams) reaches only your test accounts, and the people you freeze get no bells, notices or emails. Your test accounts below still get everything, and admins always do. Every held message is listed underneath, so you can see exactly what would have gone out.</p></div>' +
        (live ? '<span class="dv-state warm"><i></i>Frozen' + (ms(d.until) ? ' · ' + esc(left(ms(d.until))) + ' left' : '') + '</span>' : '<span class="dv-state"><i></i>Off</span>') + '</div>' +
        (live ? '<div class="dv-summary">' + AREAS.filter(function (a) { return areas[a[0]]; }).map(function (a) { return '<span><i class="fas ' + a[1] + '"></i> ' + esc(a[2]) + '</span>'; }).join('') + '</div>' : '') +
        '<label class="dv-sw warm"><input type="checkbox" id="dvFOn"' + (live ? ' checked' : '') + '><span class="tr"></span><span><b>Freeze</b><span class="s">Takes effect within about 20 seconds. Nothing held is sent later.</span></span></label>' +
        '<div class="dv-sec"><div class="dv-lb"><i class="fas fa-hourglass-half"></i> Ends by itself</div><div class="dv-chips dv-seg" id="dvFEnd" role="group" aria-label="Ends by itself">' + F_ENDS.map(function (e) { return '<button type="button" class="dv-chip' + (fEnd === e[0] ? ' on' : '') + '" data-e="' + e[0] + '">' + e[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="dv-sec"><div class="dv-lb"><i class="fas fa-layer-group"></i> What to hold <span class="x"><button type="button" class="dv-mini" data-all="1">All</button><button type="button" class="dv-mini" data-all="0">None</button></span></div><div class="dv-areas" id="dvFAreas">' +
          AREAS.map(function (a) { return '<label class="dv-tile"><input type="checkbox" data-area="' + a[0] + '"' + (areas[a[0]] ? ' checked' : '') + '><span class="ti"><i class="fas ' + a[1] + '"></i></span><span><b>' + esc(a[2]) + '</b><small>' + esc(a[3]) + '</small></span><span class="ck"><i class="fas fa-check"></i></span></label>'; }).join('') +
        '</div></div>' +
        '<div class="dv-sec"><div class="dv-lb"><i class="fas fa-user-lock"></i> Who is frozen</div><div class="dv-areas" id="dvFAud">' +
          AUD.map(function (a) { return '<label class="dv-tile"><input type="checkbox" data-aud="' + a[0] + '"' + (aud[a[0]] ? ' checked' : '') + '><span class="ti"><i class="fas ' + a[1] + '"></i></span><span><b>' + esc(a[2]) + '</b></span><span class="ck"><i class="fas fa-check"></i></span></label>'; }).join('') +
        '</div><p class="dv-note"><i class="fas fa-shield-halved"></i>Admins (the Studio Desk) always receive.</p></div>' +
        '<div class="dv-sec"><div class="dv-lb"><i class="fas fa-user-check"></i> Test accounts that still receive</div>' +
          '<p class="dv-note" style="margin:0 0 .5rem">While frozen, anything you post (lessons, homework, exams) reaches only these accounts, and only they get alerts and emails. Everyone else frozen sees and hears nothing.</p>' +
          '<div class="dv-tabs" role="tablist"><button type="button" class="dv-tab' + (pickTab === 'class' ? ' on' : '') + '" data-ptab="class"><i class="fas fa-filter"></i> Choose by class</button><button type="button" class="dv-tab' + (pickTab === 'name' ? ' on' : '') + '" data-ptab="name"><i class="fas fa-magnifying-glass"></i> Search by name</button></div>' +
          '<div id="dvFBrowse"' + (pickTab === 'class' ? '' : ' hidden') + '></div>' +
          '<div' + (pickTab === 'name' ? '' : ' hidden') + ' id="dvFByName"><input type="search" class="dv-search" id="dvFFind" placeholder="Search students, builders, parents, tutors, coaches by name or email" autocomplete="off" aria-label="Find an account">' +
          '<div class="dv-results" id="dvFRes" role="listbox"></div></div>' +
          '<label class="dv-note" style="display:flex;gap:.45rem;align-items:center;cursor:pointer"><input type="checkbox" id="dvFFam" checked> When I pick a student or builder, let their parents and guardians through too</label>' +
          '<div class="dv-lb" style="margin-top:.8rem"><i class="fas fa-users"></i> Picked <span class="x"><button type="button" class="dv-mini" data-clearpicked="1">Clear all</button></span></div>' +
          '<div class="dv-people" id="dvFPeople"></div></div>' +
        '<div class="dv-sec dv-f"><label for="dvFNote">Note for the desk (optional)</label><input type="text" id="dvFNote" maxlength="200" placeholder="Testing the Year 9 Physics class with a test account" value="' + esc(d.note || '') + '"></div>' +
        '<div class="dv-foot"><span class="dv-msg" id="dvFMsg" role="status"></span><span class="grow"></span><button type="button" class="dv-btn warm" id="dvFSave"><i class="fas fa-snowflake"></i> Save freeze</button></div>';
      paintPeople();
      paintBrowse();
      if (!nAreas && live) fEl.querySelector('#dvFMsg').textContent = 'No area is ticked, so nothing is held.';
    }

    /* ---- Choose by class: filter by who, portal, Key Stage, Year, subject and board, then tick ---- */
    var pickTab = 'class', bf = { who: 'student', portal: '', ks: '', year: '', subject: '', board: '', q: '' }, bTicks = {};
    var WHO = [['student', 'Students'], ['parent', 'Parents of students'], ['tutor', 'Tutors'], ['builder', 'Tech builders'], ['coach', 'Tech coaches']];
    var PORTAL = [['', 'Any portal'], ['online', 'Online'], ['remote', 'Remote'], ['tuition', 'Tuition (CBC)']];
    function subjName(id) { var l = g.LMZ_SUBJECTS || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name; return id; }
    function boardName(id) { var l = g.LMZ_BOARDS || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i].label; return id; }
    function portalOf(x) { return x.portal === 'remote' ? 'remote' : (x.portal === 'tuition' ? 'tuition' : (x.portal === 'tech' ? 'tech' : 'online')); }
    function boardFor(x, subj) { return (subj && x.subjectBoards && x.subjectBoards[subj]) || x.board || 'cambridge'; }
    function studentMatch(x) {
      if (x.role !== 'student' || /pending|suspended/i.test(x.status)) return false;
      if (bf.portal && portalOf(x) !== bf.portal) return false;
      if (bf.ks && x.ks !== bf.ks) return false;
      if (bf.year && x.year !== bf.year) return false;
      if (bf.subject && x.subjects.indexOf(bf.subject) === -1) return false;
      if (bf.board && boardFor(x, bf.subject) !== bf.board) return false;
      return true;
    }
    var parentKids = null;   /* parentUid -> [studentUid], from parentStudentLinks */
    function loadLinks() {
      if (parentKids) return Promise.resolve(parentKids);
      return db().collection('parentStudentLinks').get().then(function (s) {
        parentKids = {}; s.docs.forEach(function (d) { var x = d.data() || {}; if (x.parentUid && x.studentUid) (parentKids[x.parentUid] = parentKids[x.parentUid] || []).push(x.studentUid); });
        return parentKids;
      }, function () { parentKids = {}; return parentKids; });
    }
    function browseRows(all) {
      var q = bf.q.trim().toLowerCase();
      var byQ = function (x) { return !q || x.name.toLowerCase().indexOf(q) > -1 || x.email.indexOf(q) > -1; };
      if (bf.who === 'student') return all.filter(function (x) { return studentMatch(x) && byQ(x); });
      if (bf.who === 'parent') {
        var kids = {}; all.forEach(function (x) { if (studentMatch(x)) kids[x.uid] = x; });
        return all.filter(function (x) {
          if (x.role !== 'parent' || !byQ(x)) return false;
          var mine = (parentKids || {})[x.uid] || [];
          var hit = mine.filter(function (k) { return kids[k]; });
          if (!hit.length) return false;
          x._of = hit.map(function (k) { return kids[k].name; }).join(', ');
          return true;
        });
      }
      if (bf.who === 'tutor') return all.filter(function (x) {
        if (x.role !== 'tutor' || /suspended/i.test(x.status) || !byQ(x)) return false;
        if (bf.subject && x.subjects.indexOf(bf.subject) === -1) return false;
        if (bf.ks && x.keyStages.length && x.keyStages.indexOf(bf.ks) === -1) return false;
        return true;
      });
      return all.filter(function (x) { return x.role === bf.who && byQ(x) && (bf.who !== 'builder' || !bf.year || true); });
    }
    function opts(list, cur, all) { return '<option value="">' + esc(all) + '</option>' + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
    function paintBrowse() {
      var el = fEl.querySelector('#dvFBrowse'); if (!el || pickTab !== 'class') return;
      if (!people) { el.innerHTML = '<div class="dv-empty"><i class="fas fa-spinner fa-spin"></i>Loading accounts…</div>'; Promise.all([loadPeople(), loadLinks()]).then(function () { if (!dead) paintBrowse(); }); return; }
      if (bf.who === 'parent' && !parentKids) { loadLinks().then(function () { if (!dead) paintBrowse(); }); }
      var studs = people.filter(function (x) { return x.role === 'student'; });
      var uniq = function (f) { var o = {}; studs.forEach(function (x) { [].concat(f(x)).forEach(function (v) { if (v) o[v] = 1; }); }); return Object.keys(o); };
      var kss = uniq(function (x) { return x.ks; }).sort(), years = uniq(function (x) { return x.year; }).sort(function (a, b) { return Number(a) - Number(b); });
      var subs = uniq(function (x) { return x.subjects; }).sort(function (a, b) { return subjName(a).localeCompare(subjName(b)); });
      var boards = (g.LMZ_BOARDS || []).map(function (b) { return b.id; });
      if (!boards.length) boards = uniq(function (x) { return x.board; });
      var classy = bf.who === 'student' || bf.who === 'parent' || bf.who === 'tutor';
      var rows = browseRows(people), inList = function (x) { return picked.some(function (p) { return p.uid === x.uid && p.role === x.role; }); };
      var nT = Object.keys(bTicks).length;
      el.innerHTML = '<div class="dv-filters">' +
          '<select data-bf="who" aria-label="Who">' + WHO.map(function (o) { return '<option value="' + o[0] + '"' + (bf.who === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
          (bf.who === 'student' || bf.who === 'parent' ? '<select data-bf="portal" aria-label="Portal">' + PORTAL.map(function (o) { return '<option value="' + o[0] + '"' + (bf.portal === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' : '') +
          (classy ? '<select data-bf="ks" aria-label="Key Stage">' + opts(kss.map(function (k) { return [k, k]; }), bf.ks, 'Any Key Stage') + '</select>' : '') +
          (bf.who === 'student' || bf.who === 'parent' ? '<select data-bf="year" aria-label="Year">' + opts(years.map(function (y) { return [y, 'Year / Grade ' + y]; }), bf.year, 'Any Year') + '</select>' : '') +
          (classy ? '<select data-bf="subject" aria-label="Subject">' + opts(subs.map(function (x) { return [x, subjName(x)]; }), bf.subject, 'Any subject') + '</select>' : '') +
          (bf.who === 'student' || bf.who === 'parent' ? '<select data-bf="board" aria-label="Board">' + opts(boards.map(function (b) { return [b, boardName(b)]; }), bf.board, 'Any board') + '</select>' : '') +
          '<input type="search" data-bf="q" placeholder="Narrow by name or email" value="' + esc(bf.q) + '" aria-label="Narrow by name">' +
        '</div>' +
        '<div class="dv-blist">' + (rows.length ? rows.slice(0, 400).map(function (x) {
          var on = inList(x), detail = x.role === 'student' ? [x.ks, x.year ? 'Year ' + x.year : '', ({ remote: 'Remote', tuition: 'Tuition' })[portalOf(x)] || 'Online', boardName(boardFor(x, bf.subject))].filter(Boolean).join(' · ')
            : x.role === 'parent' ? 'Parent of ' + (x._of || '') : x.role === 'tutor' ? (x.subjects || []).map(subjName).slice(0, 4).join(', ') : (x.email || '');
          return '<label class="dv-brow' + (on ? ' in' : '') + '"><input type="checkbox" data-bt="' + esc(x.role + '|' + x.uid) + '"' + (on || bTicks[x.role + '|' + x.uid] ? ' checked' : '') + (on ? ' disabled' : '') + '><span class="n"><b>' + esc(x.name) + '</b><span>' + esc(detail) + '</span></span><span class="r">' + (on ? 'Picked' : esc(ROLE_WORD[x.role] || x.role)) + '</span></label>';
        }).join('') + (rows.length > 400 ? '<div class="dv-empty">Showing 400 of ' + rows.length + '. Narrow the filters.</div>' : '') : '<div class="dv-empty"><i class="fas fa-user-slash"></i>Nobody matches these filters.</div>') + '</div>' +
        '<div class="dv-bbar"><span class="cnt">' + rows.length + ' match' + (rows.length === 1 ? '' : 'es') + ' · ' + nT + ' ticked</span><span class="grow"></span>' +
          '<button type="button" class="dv-mini" data-btall="1">Tick all shown</button><button type="button" class="dv-mini" data-btnone="1">Untick</button>' +
          '<button type="button" class="dv-btn pri" data-btadd="1"' + (nT ? '' : ' disabled') + '><i class="fas fa-user-plus"></i> Add ' + (nT || '') + ' as test account' + (nT === 1 ? '' : 's') + '</button></div>';
    }
    function paintPeople() {
      var el = fEl.querySelector('#dvFPeople'); if (!el) return;
      el.innerHTML = picked.length ? picked.map(function (p, i) {
        return '<span class="dv-person' + (p.via ? ' via' : '') + '">' + esc(p.name || p.email || p.uid) + ' <small>' + esc(ROLE_WORD[p.role] || p.role || '') + (p.via ? ' of ' + esc(p.via) : '') + '</small><button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(p.name || '') + '"><i class="fas fa-xmark"></i></button></span>';
      }).join('') : '<span class="dv-note" style="margin:0">Nobody yet. With no test account, everyone you freeze gets nothing.</span>';
    }
    function loadPeople() {
      if (people) return Promise.resolve(people);
      if (peopleLoading) return peopleLoading;
      peopleLoading = Promise.all(PEOPLE.map(function (p) {
        return db().collection(p[0]).get().then(function (s) {
          return s.docs.map(function (d) {
            var x = d.data() || {};
            return { uid: d.id, email: String(x.email || '').trim().toLowerCase(), name: nameOf(x), role: p[1],
              ks: x.keyStage || '', year: x.year != null ? String(x.year) : '', subjects: Array.isArray(x.subjects) ? x.subjects : [],
              board: x.board || '', subjectBoards: x.subjectBoards || {}, portal: x.studentType || '', status: String(x.status || ''),
              keyStages: Array.isArray(x.keyStages) ? x.keyStages : [], level: x.skillLevel || '' };
          });
        }, function () { return []; });
      })).then(function (lists) { people = [].concat.apply([], lists); return people; });
      return peopleLoading;
    }
    function find(qs) {
      var res = fEl.querySelector('#dvFRes'); if (!res) return;
      qs = String(qs || '').trim().toLowerCase();
      if (qs.length < 2) { res.innerHTML = ''; return; }
      res.innerHTML = '<div class="dv-empty" style="padding:.8rem"><i class="fas fa-spinner fa-spin" style="font-size:1rem"></i></div>';
      loadPeople().then(function (all) {
        if (dead) return;
        var cur = String(fEl.querySelector('#dvFFind').value || '').trim().toLowerCase(); if (cur !== qs) return;
        var hits = all.filter(function (p) { return (p.name.toLowerCase().indexOf(qs) > -1 || p.email.indexOf(qs) > -1) && !picked.some(function (x) { return x.uid === p.uid && x.role === p.role; }); }).slice(0, 30);
        res.innerHTML = hits.length ? hits.map(function (p) {
          return '<button type="button" class="dv-res" data-pick="' + esc(p.role) + '|' + esc(p.uid) + '"><span><b>' + esc(p.name) + '</b><br><span>' + esc(p.email || 'no email') + '</span></span><span class="r">' + esc(ROLE_WORD[p.role] || p.role) + '</span></button>';
        }).join('') : '<div class="dv-empty" style="padding:.8rem">Nobody matches.</div>';
      });
    }
    /* A picked student or builder can bring their parents (parentStudentLinks) and guardians (techGuardianLinks). */
    function familyOf(p) {
      if (p.role !== 'student' && p.role !== 'builder') return Promise.resolve([]);
      return Promise.all(['parentStudentLinks', 'techGuardianLinks'].map(function (c) {
        return db().collection(c).where('studentUid', '==', p.uid).get().then(function (s) { return s.docs.map(function (d) { return d.data().parentUid; }); }, function () { return []; });
      })).then(function (l) {
        var ids = [].concat.apply([], l).filter(Boolean);
        return loadPeople().then(function (all) {
          return ids.filter(function (id, i) { return ids.indexOf(id) === i; }).map(function (id) {
            var hit = all.filter(function (x) { return x.uid === id && x.role === 'parent'; })[0];
            return hit ? { uid: hit.uid, email: hit.email, name: hit.name, role: 'parent', via: p.name } : { uid: id, email: '', name: 'Parent', role: 'parent', via: p.name };
          });
        });
      });
    }
    function addPicked(p) {
      if (picked.some(function (x) { return x.uid === p.uid && x.role === p.role; })) return;
      picked.push(p);
    }
    var findTimer = null;
    fEl.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.bf) { bf[t.dataset.bf] = t.value; if (t.dataset.bf === 'who') bTicks = {}; paintBrowse(); return; }
      if (t.dataset.bt) { if (t.checked) bTicks[t.dataset.bt] = 1; else delete bTicks[t.dataset.bt]; var c = fEl.querySelector('.dv-bbar .cnt'), a = fEl.querySelector('[data-btadd]'), n = Object.keys(bTicks).length;
        if (c) c.textContent = c.textContent.replace(/\d+ ticked/, n + ' ticked'); if (a) { a.disabled = !n; a.innerHTML = '<i class="fas fa-user-plus"></i> Add ' + (n || '') + ' as test account' + (n === 1 ? '' : 's'); } return; }
      if (t.id !== 'dvFFind' && t.id !== 'dvFFam') fDirty = true;
    });
    fEl.addEventListener('input', function (e) {
      if (e.target.id === 'dvFNote') fDirty = true;
      if (e.target.id === 'dvFFind') { clearTimeout(findTimer); var v = e.target.value; findTimer = setTimeout(function () { find(v); }, 180); }
      if (e.target.dataset.bf === 'q') { bf.q = e.target.value; var pos = e.target.selectionStart; paintBrowse(); var qi = fEl.querySelector('[data-bf="q"]'); if (qi) { qi.focus(); qi.setSelectionRange(pos, pos); } }
    });
    fEl.addEventListener('click', function (e) {
      if (e.target.closest('.dv-chip,[data-all],[data-pick],[data-rm],[data-btadd],[data-clearpicked]')) fDirty = true;
      var tb = e.target.closest('[data-ptab]');
      if (tb) {
        pickTab = tb.dataset.ptab;
        [].forEach.call(fEl.querySelectorAll('[data-ptab]'), function (x) { x.classList.toggle('on', x === tb); });
        fEl.querySelector('#dvFBrowse').hidden = pickTab !== 'class'; fEl.querySelector('#dvFByName').hidden = pickTab !== 'name';
        paintBrowse(); return;
      }
      if (e.target.closest('[data-btall]')) { [].forEach.call(fEl.querySelectorAll('[data-bt]:not([disabled])'), function (x) { bTicks[x.dataset.bt] = 1; }); paintBrowse(); return; }
      if (e.target.closest('[data-btnone]')) { bTicks = {}; paintBrowse(); return; }
      if (e.target.closest('[data-clearpicked]')) { picked = []; paintPeople(); paintBrowse(); return; }
      if (e.target.closest('[data-btadd]')) {
        var fam2 = fEl.querySelector('#dvFFam') && fEl.querySelector('#dvFFam').checked, added = [];
        Object.keys(bTicks).forEach(function (k) {
          var ps = k.split('|'), x = (people || []).filter(function (y) { return y.role === ps[0] && y.uid === ps[1]; })[0];
          if (x) { addPicked({ uid: x.uid, email: x.email, name: x.name, role: x.role }); added.push(x); }
        });
        bTicks = {}; paintPeople(); paintBrowse();
        if (fam2) Promise.all(added.map(familyOf)).then(function (ls) { if (dead) return; ls.forEach(function (l) { l.forEach(addPicked); }); paintPeople(); paintBrowse(); });
        return;
      }
      var c = e.target.closest('.dv-chip');
      if (c && c.dataset.e) { fEnd = c.dataset.e; [].forEach.call(fEl.querySelectorAll('#dvFEnd .dv-chip'), function (x) { x.classList.toggle('on', x === c); }); return; }
      var all = e.target.closest('[data-all]');
      if (all) { [].forEach.call(fEl.querySelectorAll('[data-area]'), function (x) { x.checked = all.dataset.all === '1'; }); return; }
      var pk = e.target.closest('[data-pick]');
      if (pk) {
        var parts = pk.dataset.pick.split('|'), p = (people || []).filter(function (x) { return x.role === parts[0] && x.uid === parts[1]; })[0];
        if (!p) return;
        addPicked({ uid: p.uid, email: p.email, name: p.name, role: p.role });
        var fam = fEl.querySelector('#dvFFam') && fEl.querySelector('#dvFFam').checked;
        fEl.querySelector('#dvFFind').value = ''; fEl.querySelector('#dvFRes').innerHTML = '';
        paintPeople();
        if (fam) familyOf(p).then(function (list) { if (dead) return; list.forEach(addPicked); paintPeople(); });
        return;
      }
      var rm = e.target.closest('[data-rm]');
      if (rm) { picked.splice(Number(rm.dataset.rm), 1); paintPeople(); return; }
      if (e.target.closest('#dvFSave')) saveF(e.target.closest('#dvFSave'));
    });
    function saveF(btn) {
      var out = fEl.querySelector('#dvFMsg'), on = fEl.querySelector('#dvFOn').checked;
      var areas = {}, aud = {};
      AREAS.forEach(function (a) { areas[a[0]] = !!(fEl.querySelector('[data-area="' + a[0] + '"]') || {}).checked; });
      AUD.forEach(function (a) { aud[a[0]] = !!(fEl.querySelector('[data-aud="' + a[0] + '"]') || {}).checked; });
      if (on && !AREAS.some(function (a) { return areas[a[0]]; })) { out.className = 'dv-msg err'; out.textContent = 'Tick at least one area to hold.'; return; }
      if (on && !AUD.some(function (a) { return aud[a[0]]; })) { out.className = 'dv-msg err'; out.textContent = 'Tick at least one group of people to freeze.'; return; }
      var until = null, pre = F_ENDS.filter(function (x) { return x[0] === fEnd; })[0];
      if (on && fEnd === 'day') { var t = new Date(); t.setHours(23, 59, 0, 0); until = t.getTime(); }
      else if (on && pre && pre[2] > 0) until = Date.now() + pre[2] * 60000;
      btn.disabled = true; out.className = 'dv-msg'; out.textContent = 'Saving…';
      db().collection('devMode').doc('freeze').set({
        on: on, until: until ? TS().fromMillis(until) : null, areas: areas, audiences: aud,
        allow: picked.map(function (p) { return { uid: p.uid || '', email: p.email || '', name: p.name || '', role: p.role || '', via: p.via || '' }; }),
        note: String(fEl.querySelector('#dvFNote').value || '').trim().slice(0, 200),
        updatedAt: FV().serverTimestamp(), updatedBy: me.uid || ''
      }).then(function () {
        btn.disabled = false; out.className = 'dv-msg ok'; fDirty = false;
        out.textContent = on ? 'Frozen. It takes effect within about 20 seconds.' : 'Freeze off. Notifications and emails go out as normal.';
      }).catch(function (er) { btn.disabled = false; out.className = 'dv-msg err'; out.textContent = 'Could not save: ' + (er.message || er); });
    }

    /* ================= Held log ================= */
    var hFilter = 'all';
    function paintH() {
      var areas = {}; held.forEach(function (h) { areas[h.area || 'other'] = (areas[h.area || 'other'] || 0) + 1; });
      var rows = held.filter(function (h) { return hFilter === 'all' || (h.area || 'other') === hFilter; });
      var who = function (h) {
        if (h.kind === 'email') return h.email || '';
        var p = (people || []).filter(function (x) { return x.uid === h.recipientId; })[0];
        return (p ? p.name : (h.recipientId || '')) + (h.role ? ' · ' + (ROLE_WORD[h.role] || h.role) : '');
      };
      hEl.innerHTML = '<div class="dv-hd"><span class="dv-ic"><i class="fas fa-inbox"></i></span><div class="grow"><h3>Held while frozen</h3><p>The latest 150 things the freeze stopped: who they were for and what they said.</p></div>' +
        (held.length ? '<button type="button" class="dv-btn" id="dvHClear"><i class="fas fa-broom"></i> Clear the list</button>' : '') + '</div>' +
        (held.length ? '<div class="dv-chips" style="margin-bottom:.8rem"><button type="button" class="dv-chip' + (hFilter === 'all' ? ' on' : '') + '" data-hf="all">All · ' + held.length + '</button>' +
          Object.keys(areas).map(function (a) { return '<button type="button" class="dv-chip' + (hFilter === a ? ' on' : '') + '" data-hf="' + esc(a) + '">' + esc(AREA_NAME[a] || a) + ' · ' + areas[a] + '</button>'; }).join('') + '</div>' : '') +
        (rows.length ? '<div class="dv-held">' + rows.map(function (h, i) {
          return '<div class="dv-hrow" style="animation-delay:' + Math.min(i, 12) * 0.03 + 's"><span class="hi"><i class="fas ' + (h.kind === 'email' ? 'fa-envelope' : (h.kind === 'content' ? 'fa-file-circle-xmark' : 'fa-bell')) + '"></i></span><div><b><span class="tag">' + esc(AREA_NAME[h.area] || h.area || 'Other') + '</span>' + esc(h.kind === 'email' ? (h.subject || 'Email') : (h.title || h.type || 'Notification')) + '</b>' +
            '<span>' + (h.kind === 'content' ? 'Post narrowed' : (h.kind === 'email' ? 'Email to ' : 'Bell for ') + esc(who(h))) + (h.message ? ' · ' + esc(String(h.message).slice(0, 140)) : '') + '</span></div><time>' + esc(ago(ms(h.at))) + '</time></div>';
        }).join('') + '</div>' : '<div class="dv-empty"><i class="fas fa-circle-check"></i>Nothing held' + (hFilter === 'all' ? '' : ' in this area') + '.</div>');
    }
    hEl.addEventListener('click', function (e) {
      var f = e.target.closest('[data-hf]'); if (f) { hFilter = f.dataset.hf; paintH(); return; }
      var c = e.target.closest('#dvHClear');
      if (c) {
        if (c.dataset.sure !== '1') { c.dataset.sure = '1'; c.innerHTML = '<i class="fas fa-broom"></i> Press again to clear'; setTimeout(function () { if (c.isConnected) { c.dataset.sure = ''; c.innerHTML = '<i class="fas fa-broom"></i> Clear the list'; } }, 3000); return; }
        c.disabled = true;
        db().collection('devHeld').limit(400).get().then(function (s) {
          var b = db().batch(); s.docs.forEach(function (d) { b.delete(d.ref); }); return b.commit();
        }).catch(function (er) { c.disabled = false; alert('Could not clear: ' + (er.message || er)); });
      }
    });

    /* ================= Live data ================= */
    paintM(); paintF(); paintH();
    var firstF = true;
    unsubs.push(db().collection('siteStatus').doc('maintenance').onSnapshot(function (s) {
      if (dead) return; maint = s.exists ? s.data() : null;
      var e = maint && ms(maint.endsAt), st = maint && ms(maint.startsAt);
      if (maint && !e) mEnd = 'none'; else if (maint && e && st) { var mins = Math.round((e - st) / 60000); mEnd = ({ 30: 'm30', 60: 'h1', 120: 'h2', 240: 'h4' })[mins] || 'custom'; }
      /* Never repaint under the admin's typing. */
      if (!mDirty) paintM();
    }, function (e) { mEl.querySelector('.dv-hd p').textContent = 'Could not read the banner setting: ' + e.message; }));
    unsubs.push(db().collection('devMode').doc('freeze').onSnapshot(function (s) {
      if (dead) return; frz = s.exists ? s.data() : null;
      if (firstF || !fDirty) { picked = ((frz && frz.allow) || []).map(function (p) { return Object.assign({}, p); }); firstF = false; }
      if (frz && frz.on && !ms(frz.until)) fEnd = 'none';
      if (!fDirty) paintF();
    }, function (e) { fEl.querySelector('.dv-hd p').textContent = 'Could not read the freeze setting: ' + e.message; }));
    unsubs.push(db().collection('devHeld').orderBy('at', 'desc').limit(150).onSnapshot(function (s) {
      if (dead) return; held = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (held.some(function (h) { return h.kind !== 'email'; })) loadPeople().then(function () { if (!dead) paintH(); });
      paintH();
    }, function () { held = []; paintH(); }));
    var clock = setInterval(function () { if (dead) return; if (!mDirty) paintM(); if (!fDirty) paintF(); }, 60000);

    return {
      destroy: function () {
        dead = true; clearInterval(clock);
        unsubs.forEach(function (u) { try { u(); } catch (e) { } });
        if (g.PaisleySiteStatus) g.PaisleySiteStatus.preview(null);
      }
    };
  }

  g.AdminDevMode = { mount: mount, AREAS: AREAS };
})(window);
