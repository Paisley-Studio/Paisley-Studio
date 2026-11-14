/* =========================================================
   Paisley Studio — attendance screens (global `Attendance`)
   -----------------------------------------------------------
   Student:  get-ready banner 15 minutes before, registration pop-up at the
             start (minimisable, never dismissed until registered), history.
   Two timestamps per student: the student's own check-in (checkIn.at) and the
   tutor's confirmation that they are really in the live class (tutorConfirm.at),
   pressed when the tutor calls their name in Google Meet: Confirm / Not in class.
   Tutor:    live rollcall pop-up at the start, persistent Rollcall pill,
             Attendance tab with today's registers, overdue ones, history,
             explanations after an auto-submit, subject-lock banner.
   Parent:   Attendance section per child (history, strikes, warnings,
             referrals, notices and their delivery).
   Admin:    Attendance command centre.
   Everything that changes data calls functions/attendance.js; reads use
   the rules in firestore.rules (ATTENDANCE). Times are Africa/Nairobi.
========================================================= */
var Attendance = (function () {
  'use strict';
  var TZ = 'Africa/Nairobi';
  var STATUS = {
    expected: ['Not registered yet', 'wait'], unaccounted: ['Unaccounted for', 'warn'], present: ['Present', 'ok'], late: ['Late', 'late'],
    present_verified: ['Present (tutor verified)', 'ok'], connectivity: ['Connectivity issue', 'info'], absent: ['Absent', 'bad'],
    no_show: ['Registered, not in class', 'bad'],
    excused: ['Excused', 'info'], other: ['Other reason', 'info'], cancelled: ['Lesson cancelled', 'wait']
  };
  var OUTCOMES = [
    ['absent', 'Absent'], ['present_unable', 'Present but unable to check in'], ['connectivity', 'Connectivity / device issue'],
    ['excused_admin', 'Excused by administration'], ['other', 'Other reason (explain)']
  ];
  var ATTENDED = ['present', 'late', 'present_verified', 'connectivity'];

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function msOf(t) { if (!t) return 0; if (typeof t === 'number') return t; if (t.toMillis) return t.toMillis(); if (t.seconds != null) return t.seconds * 1000; var d = new Date(t); return isNaN(d) ? 0 : d.getTime(); }
  function hm(t) { var m = msOf(t); return m ? new Date(m).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'; }
  function dayLabel(t) { var m = msOf(t); return m ? new Date(m).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }) : '—'; }
  function ymd(msv) { return new Date(msv + 3 * 3600000).toISOString().slice(0, 10); }
  function call(name, data) { return firebase.functions().httpsCallable(name)(data || {}).then(function (r) { return r.data; }); }
  function errMsg(e) { return (e && (e.message || e.code)) || 'Something went wrong.'; }
  function pill(status) { var s = STATUS[status] || [status, 'wait']; return '<span class="att-pill ' + s[1] + '">' + esc(s[0]) + '</span>'; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function icon(n) { return '<i class="fas ' + n + '" aria-hidden="true"></i>'; }
  /* Strike counts reset as the Studio Desk chose (attendanceSettings/policy, Admin > Attendance > Settings).
     Mirrors strikePeriod() in functions/attendance.js. */
  var POLICY = { strikeReset: 'academic_year', yearStartMonth: 9, manualEpoch: 0 }, policyP = null;
  function loadPolicy(fresh) {
    if (!policyP || fresh) policyP = db.collection('attendanceSettings').doc('policy').get().then(function (d) { if (d.exists) POLICY = Object.assign({}, POLICY, d.data()); return POLICY; }).catch(function () { return POLICY; });
    return policyP;
  }
  function period(msv) {
    var d = new Date(msv + 3 * 3600000), y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1;
    if (POLICY.strikeReset === 'calendar_year') return { key: 'c' + y, label: String(y), phrase: 'this calendar year' };
    if (POLICY.strikeReset === 'never') return { key: 'all', label: 'all time', phrase: 'in total' };
    if (POLICY.strikeReset === 'manual') { var since = POLICY.manualResetAt ? 'since ' + dayLabel(POLICY.manualResetAt) : 'so far'; return { key: 'm' + (POLICY.manualEpoch || 0), label: since, phrase: since }; }
    var sm = Number(POLICY.yearStartMonth) || 9, st = mo >= sm ? y : y - 1;
    return { key: 'y' + st, label: st + '/' + String((st + 1) % 100).padStart(2, '0'), phrase: 'this academic year' };
  }
  function toast(t) { var d = document.createElement('div'); d.className = 'att-dock att'; d.innerHTML = '<span class="att-chip">' + icon('fa-circle-check') + ' ' + esc(t) + '</span>'; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
  function errDetails(e) { return (e && e.details) || {}; }
  function methodPill(r) {
    if (r.checkIn) return r.checkIn.method === 'face' ? '<span class="att-pill info">' + icon('fa-face-smile') + ' Face</span>' : '<span class="att-pill wait">' + icon('fa-hand') + ' Online</span>';
    if (r.resolution) return '<span class="att-pill wait">' + icon('fa-chalkboard-user') + ' Tutor</span>';
    return '—';
  }

  /* The tutor's confirmation (second timestamp). Mirrors confirmStateOf in functions/attendance.js:
     records from before confirmation existed read as "awaiting the tutor" when registered. */
  function confirmOf(r) {
    if (!r || !r.checkIn) return null;
    if (r.confirmState) return r.confirmState;
    if (r.tutorConfirm) return r.tutorConfirm.outcome === 'not_in_class' ? 'not_in_class' : 'confirmed';
    return 'pending';
  }
  function awaitingConfirm(r) { var c = confirmOf(r); return c === 'pending' || c === 'unconfirmed'; }
  function confirmCell(r) {
    var c = confirmOf(r), tc = r.tutorConfirm || null;
    if (!c) return r.resolution ? '<span class="att-muted">' + hm(r.resolution.at) + ' (marked by tutor)</span>' : '—';
    var who = tc ? '<div class="att-muted">' + esc(tc.byName || '') + (tc.minutesAfterCheckIn != null ? ' · ' + tc.minutesAfterCheckIn + ' min after check-in' : '') + (tc.afterSubmission ? ' · after submission' : '') + '</div>' : '';
    if (c === 'confirmed') return '<span class="att-pill ok">' + icon('fa-user-check') + ' ' + hm(tc && tc.at) + '</span>' + who;
    if (c === 'not_in_class') return '<span class="att-pill bad">' + icon('fa-user-xmark') + ' Not in class ' + hm(tc && tc.at) + '</span>' + who;
    if (c === 'unconfirmed') return '<span class="att-pill bad">' + icon('fa-circle-exclamation') + ' Never confirmed</span>';
    return '<span class="att-pill wait">' + icon('fa-hourglass-half') + ' Awaiting tutor</span>';
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var css = [
      '.att{font-family:var(--font,"Quicksand",sans-serif);color:var(--ink,#263331)}',
      '.att-pill{display:inline-flex;align-items:center;gap:.3rem;padding:.16rem .55rem;border-radius:20px;font-size:.7rem;font-weight:800;white-space:nowrap}',
      '.att-pill.ok{background:rgba(46,184,114,.13);color:#1d8b57}.att-pill.late{background:rgba(243,156,18,.15);color:#a86500}',
      '.att-pill.bad{background:rgba(231,76,60,.12);color:#b8362a}.att-pill.warn{background:rgba(231,76,60,.08);color:#b8362a;border:1px dashed rgba(231,76,60,.5)}',
      '.att-pill.info{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}.att-pill.wait{background:#eef2f1;color:var(--muted,#5A6E6A)}',
      '.att-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;border-radius:10px;border:1.5px solid var(--line,#dfe7e5);background:var(--surface,#fff);color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:800;font-size:.8rem;cursor:pointer;text-decoration:none}',
      '.att-btn:hover{border-color:var(--brand,#55BFB3)}.att-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.att-btn.primary{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.att-btn.primary:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3)}',
      '.att-btn.big{padding:.85rem 1.4rem;font-size:.95rem;border-radius:12px}.att-btn.sm{padding:.35rem .7rem;font-size:.72rem;border-radius:8px}',
      '.att-btn.danger{color:#b8362a}',
      '.att-banner{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;padding:.85rem 1rem;border-radius:14px;margin:0 0 1rem;background:var(--sage,#E5F2EF);border:1.5px solid var(--brand-soft,#7BCBC2);font-weight:600}',
      '.att-banner.urgent{background:#fff7e6;border-color:#f5c26b}.att-banner.lock{background:#fdecea;border-color:#f1b0a8}',
      '.att-banner .ic{width:40px;height:40px;border-radius:12px;background:var(--brand-deep,#245F5A);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.att-banner.urgent .ic{background:#d98a00}.att-banner.lock .ic{background:#b8362a}',
      '.att-banner .t{flex:1;min-width:200px}.att-banner b{color:var(--brand-deep,#245F5A);display:block;font-size:.95rem}.att-banner small{color:var(--muted,#5A6E6A);font-size:.8rem}',
      '.att-ov{position:fixed;inset:0;background:rgba(15,30,28,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.att-card{background:#fff;border-radius:18px;max-width:560px;width:100%;min-width:0;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:var(--font,"Quicksand",sans-serif)}',
      '.att-card.wide{max-width:980px}',
      '.att-card .hd{display:flex;align-items:flex-start;gap:.8rem;padding:1.1rem 1.2rem;border-bottom:1px solid var(--line,#e3ecea)}',
      '.att-card .hd h3{margin:0;font-size:1.08rem;color:var(--brand-deep,#245F5A)}.att-card .hd .sub{font-size:.78rem;color:var(--muted,#5A6E6A);font-weight:600;margin-top:.2rem}',
      '.att-card .bd{padding:1.1rem 1.2rem}.att-card .ft{display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap;padding:.9rem 1.2rem;border-top:1px solid var(--line,#e3ecea)}',
      '.att-x{margin-left:auto;background:none;border:0;font-size:1rem;color:var(--muted,#5A6E6A);cursor:pointer;padding:.3rem .45rem;border-radius:8px}.att-x:hover{background:var(--sage,#E5F2EF)}',
      '.att-big-ic{width:64px;height:64px;border-radius:20px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:flex;align-items:center;justify-content:center;font-size:1.7rem;margin:0 auto .8rem}',
      '.att-big-ic.ok{background:rgba(46,184,114,.13);color:#1d8b57}.att-big-ic.late{background:rgba(243,156,18,.15);color:#a86500}',
      '.att-center{text-align:center}.att-center p{margin:.35rem 0;color:var(--muted,#5A6E6A);font-weight:600;font-size:.86rem}',
      '.att-kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem .9rem;font-size:.84rem;margin:.6rem 0 1rem}.att-kv span{color:var(--muted,#5A6E6A);font-weight:700}.att-kv b{color:var(--ink,#263331)}',
      '.att-dock{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147482000;display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}',
      '.att-chip{display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-radius:30px;background:var(--brand-deep,#245F5A);color:#fff;font-family:var(--font,"Quicksand",sans-serif);font-weight:800;font-size:.8rem;border:0;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2)}',
      '.att-chip.urgent{background:#c0392b}.att-chip .n{background:rgba(255,255,255,.22);border-radius:12px;padding:.05rem .45rem}',
      '.att-dot{width:8px;height:8px;border-radius:50%;background:#7CFFB2;box-shadow:0 0 0 0 rgba(124,255,178,.7);animation:attPulse 1.6s infinite}',
      '@keyframes attPulse{70%{box-shadow:0 0 0 8px rgba(124,255,178,0)}100%{box-shadow:0 0 0 0 rgba(124,255,178,0)}}',
      '@media (prefers-reduced-motion:reduce){.att-dot{animation:none}}',
      '.att-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:.6rem;margin:0 0 1rem}',
      '.att-stat{background:var(--surface,#fff);border:1px solid var(--line,#e3ecea);border-radius:12px;padding:.7rem .8rem}.att-stat b{display:block;font-size:1.35rem;color:var(--brand-deep,#245F5A);line-height:1.1}.att-stat span{font-size:.72rem;color:var(--muted,#5A6E6A);font-weight:700}',
      '.att-stat.warn b{color:#b8362a}.att-stat.late b{color:#a86500}',
      '.att-table{width:100%;border-collapse:collapse;font-size:.8rem}.att-table th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#5A6E6A);padding:.5rem .55rem;border-bottom:1px solid var(--line,#e3ecea);white-space:nowrap}',
      '.att-table td{padding:.55rem;border-bottom:1px solid #eef3f2;vertical-align:top}.att-table tr.flag td{background:#fff8f7}',
      '.att-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}',
      '.att-panel{background:var(--surface,#fff);border:1px solid var(--line,#e3ecea);border-radius:14px;padding:1rem;margin:0 0 1rem}',
      '.att-panel h4{margin:0 0 .7rem;font-size:.95rem;color:var(--brand-deep,#245F5A);display:flex;align-items:center;gap:.45rem;flex-wrap:wrap}',
      '.att-muted{color:var(--muted,#5A6E6A);font-size:.8rem;font-weight:600}',
      '.att-tabs{display:flex;gap:.35rem;flex-wrap:wrap;margin:0 0 1rem}.att-tabs button{border:1.5px solid var(--line,#e3ecea);background:var(--surface,#fff);border-radius:30px;padding:.4rem .85rem;font-family:inherit;font-weight:800;font-size:.76rem;color:var(--muted,#5A6E6A);cursor:pointer}',
      '.att-tabs button.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.att-tabs .n{margin-left:.3rem;background:#e74c3c;color:#fff;border-radius:10px;padding:0 .4rem;font-size:.66rem}',
      '.att-filters{display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end;margin:0 0 1rem}.att-filters label{display:flex;flex-direction:column;font-size:.68rem;font-weight:800;color:var(--muted,#5A6E6A);gap:.2rem}',
      '.att-filters input,.att-filters select,.att-field select,.att-field input,.att-field textarea{font-family:inherit;font-size:.8rem;padding:.45rem .55rem;border:1.5px solid var(--line,#dfe7e5);border-radius:9px;background:#fff;color:var(--ink,#263331);box-sizing:border-box;max-width:100%}',
      '.att-field{display:flex;flex-direction:column;gap:.25rem;margin:0 0 .7rem;font-size:.74rem;font-weight:800;color:var(--brand-deep,#245F5A)}.att-field textarea{min-height:76px;width:100%;resize:vertical}',
      '.att-resolve{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-top:.35rem;min-width:220px}.att-resolve select{min-width:0;flex:1 1 180px}.att-resolve input{flex:2 1 180px;min-width:0}',
      '.att-resolve select,.att-resolve input{font-family:inherit;font-size:.78rem;padding:.4rem .5rem;border:1.5px solid var(--line,#dfe7e5);border-radius:8px;background:#fff;color:var(--ink,#263331);box-sizing:border-box}',
      '.att-resolve select:focus,.att-resolve input:focus,.att-field textarea:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.att-wrap{max-width:100%}',
      '.att-quick{display:inline-flex;gap:.3rem;flex-wrap:nowrap;align-items:center}',
      '.att-q{display:inline-flex;align-items:center;gap:.35rem;padding:.38rem .7rem;border-radius:8px;border:1.5px solid var(--line,#dfe7e5);background:#fff;color:var(--ink,#263331);font-family:inherit;font-weight:800;font-size:.74rem;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,color .12s}',
      '.att-q:hover{border-color:var(--brand,#55BFB3)}.att-q:disabled{cursor:progress}',
      '.att-q.ok.on{background:#1d8b57;border-color:#1d8b57;color:#fff}.att-q.bad.on{background:#b8362a;border-color:#b8362a;color:#fff}.att-q.more.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.att-q.ok:not(.on){color:#1d8b57}.att-q.bad:not(.on){color:#b8362a}',
      'tr.att-busy td{opacity:.75}',
      '.att-row-actions{display:flex;gap:.3rem;flex-wrap:wrap}',
      '.att-reg-tabs{display:flex;gap:.35rem;flex-wrap:wrap;padding:.6rem 1.2rem 0}',
      '.att-msg{font-size:.8rem;font-weight:700;margin-top:.5rem}.att-msg.bad{color:#b8362a}.att-msg.ok{color:#1d8b57}',
      '.att-cam{position:relative;max-width:360px;margin:0 auto;border-radius:16px;overflow:hidden;background:#0f1d1b;aspect-ratio:4/3}',
      '.att-cam video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);display:block}',
      '.att-cam-guide{position:absolute;left:50%;top:50%;width:46%;height:68%;transform:translate(-50%,-50%);border:3px dashed rgba(255,255,255,.8);border-radius:50%;pointer-events:none}',
      '.att-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:1rem}.att-grid2>.att-panel{margin:0}',
      '.att-or{display:flex;align-items:center;gap:.6rem;color:var(--muted,#5A6E6A);font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:.9rem 0 .2rem}.att-or:before,.att-or:after{content:"";flex:1;height:1px;background:var(--line,#dfe7e5)}',
      '.att-me{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.65rem .8rem;border:1.5px solid var(--line,#dfe7e5);border-radius:12px;margin:0 0 .8rem;font-size:.82rem}.att-me b{margin-right:auto}',
      '.att-set{display:grid;gap:.8rem;max-width:560px}.att-set select{font-family:inherit;font-size:.85rem;padding:.5rem .6rem;border:1.5px solid var(--line,#dfe7e5);border-radius:10px;background:#fff;color:inherit}',
      '.att-empty{padding:1rem;text-align:center;color:var(--muted,#5A6E6A);font-weight:600;font-size:.84rem}',
      '@media (max-width:640px){.att-card .hd,.att-card .bd,.att-card .ft{padding-left:16px;padding-right:16px}.att-table{font-size:.76rem}.att-banner{padding:.75rem}}'
    ].join('');
    var el = document.createElement('style'); el.id = 'attStyle'; el.textContent = css; document.head.appendChild(el);
  }

  /* ---------- pop-up shell ---------- */
  function modal(o) {
    style();
    var ov = document.createElement('div');
    ov.className = 'att-ov att'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="att-card' + (o.wide ? ' wide' : '') + '"><div class="hd"><div><h3></h3><div class="sub"></div></div>' +
      (o.closeLabel ? '<button type="button" class="att-x" data-x title="' + esc(o.closeLabel) + '" aria-label="' + esc(o.closeLabel) + '">' + icon(o.closeIcon || 'fa-xmark') + '</button>' : '') +
      '</div><div class="bd"></div><div class="ft"></div></div>';
    ov.querySelector('h3').textContent = o.title || '';
    ov.querySelector('.sub').textContent = o.sub || '';
    document.body.appendChild(ov);
    var m = { el: ov, body: ov.querySelector('.bd'), foot: ov.querySelector('.ft'), head: ov.querySelector('.hd'), close: function () { ov.remove(); if (o.onClose) o.onClose(); } };
    var x = ov.querySelector('[data-x]'); if (x) x.addEventListener('click', function () { if (o.onX) o.onX(); else m.close(); });
    ov.setAttribute('aria-label', o.title || 'Attendance');
    return m;
  }
  /* Ask for a reason (every admin decision needs one). Resolves to the text, or null when cancelled. */
  function askReason(title, label, extraHtml) {
    return new Promise(function (resolve) {
      var m = modal({ title: title, closeLabel: 'Cancel', onX: function () { m.close(); resolve(null); } });
      m.body.innerHTML = (extraHtml || '') + '<label class="att-field">' + esc(label || 'Reason (recorded with the decision)') + '<textarea data-r maxlength="1000"></textarea></label><div class="att-msg bad" data-m></div>';
      m.foot.innerHTML = '<button type="button" class="att-btn" data-c>Cancel</button><button type="button" class="att-btn primary" data-ok>' + icon('fa-check') + ' Save</button>';
      m.foot.querySelector('[data-c]').onclick = function () { m.close(); resolve(null); };
      m.foot.querySelector('[data-ok]').onclick = function () {
        var t = m.body.querySelector('[data-r]').value.trim();
        if (t.length < 3) { m.body.querySelector('[data-m]').textContent = 'Write a reason first.'; return; }
        var extra = {}; m.body.querySelectorAll('[data-extra]').forEach(function (x) { extra[x.dataset.extra] = x.value; });
        m.close(); resolve({ reason: t, extra: extra });
      };
      setTimeout(function () { var t = m.body.querySelector('[data-r]'); if (t) t.focus(); }, 30);
    });
  }

  /* =========================================================
     STUDENT
  ========================================================= */
  function mountStudent(o) {
    style();
    var S = { lessons: [], skew: 0, open: null, minimised: {}, busy: false, recUnsub: {}, records: {}, policy: { noticeMin: 15, earlyMin: 10, graceMin: 15 }, recognition: { available: false }, cam: null };
    function stopCam() { if (S.cam) { S.cam.stop(); S.cam = null; } }
    try { S.minimised = JSON.parse(sessionStorage.getItem('attMin') || '{}'); } catch (e) { }
    var bannerHost = o.bannerEl || null;
    var dock = document.createElement('div'); dock.className = 'att-dock att'; document.body.appendChild(dock);
    function now() { return Date.now() + S.skew; }
    function pendingLessons() {
      var t = now();
      return S.lessons.filter(function (l) {
        var rec = S.records[l.sessionId] || l.record;
        return l.status !== 'cancelled' && t >= l.startAt - S.policy.earlyMin * 60000 && t < l.endAt && !(rec && rec.checkIn) &&
          !(rec && ['present_verified', 'connectivity', 'excused', 'other'].indexOf(rec.status) !== -1) &&
          !(rec && rec.status === 'absent' && l.status !== 'open');
      });
    }
    function refresh() {
      return call('attendanceToday').then(function (d) {
        S.skew = (d.now || Date.now()) - Date.now();
        S.policy = d.policy || S.policy;
        // The face option exists only while the server says so (Studio Desk switch + enrollment + consent).
        S.recognition = (d.recognition && d.recognition.available && typeof AttendanceFace !== 'undefined') ? d.recognition : { available: false };
        if (!S.recognition.available && S.cam) { stopCam(); if (S.open && S.open.lesson) openRegister(S.open.lesson); }
        S.lessons = d.lessons || [];
        S.lessons.forEach(function (l) { if (l.record) S.records[l.sessionId] = Object.assign({}, S.records[l.sessionId] || {}, l.record); watchRecord(l); });
        paint();
      }).catch(function (e) { console.warn('attendanceToday', e); });
    }
    function watchRecord(l) {
      if (S.recUnsub[l.sessionId] || !l.record) return;
      S.recUnsub[l.sessionId] = db.collection('attendanceRecords').doc(l.sessionId + '_' + o.uid).onSnapshot(function (s) {
        if (!s.exists) return;
        var r = s.data();
        S.records[l.sessionId] = { status: r.status, checkIn: r.checkIn ? { at: msOf(r.checkIn.at), minutesLate: r.checkIn.minutesLate, classification: r.checkIn.classification } : null, needsVerification: !!r.needsVerification, strikeId: r.strikeId || null,
          confirmState: confirmOf(r), tutorConfirm: r.tutorConfirm ? { outcome: r.tutorConfirm.outcome, at: msOf(r.tutorConfirm.at), byName: r.tutorConfirm.byName } : null };
        paint();
      }, function () { });
    }
    function paint() {
      var t = now();
      // Get-ready banner, 15 minutes before.
      if (bannerHost) {
        var soon = S.lessons.filter(function (l) { return l.status !== 'cancelled' && t >= l.startAt - S.policy.noticeMin * 60000 && t < l.startAt - S.policy.earlyMin * 60000; });
        var mins = function (l) { return Math.max(1, Math.ceil((l.startAt - t) / 60000)); };
        bannerHost.innerHTML = soon.map(function (l) {
          return '<div class="att-banner att" role="status"><div class="ic">' + icon('fa-bell') + '</div><div class="t"><b>' + esc(l.subjectName) + ' starts in ' + mins(l) + ' minute' + (mins(l) === 1 ? '' : 's') + '</b>' +
            '<small>' + hm(l.startAt) + (l.tutorName ? ' with ' + esc(l.tutorName) : '') + '. Get your books, charger and headphones ready and be online on time. Registration opens ' + S.policy.earlyMin + ' minutes before the start.</small></div></div>';
        }).join('') + pendingLessons().map(function (l) {
          return '<div class="att-banner urgent att" role="alert"><div class="ic">' + icon('fa-user-check') + '</div><div class="t"><b>Register for ' + esc(l.subjectName) + ' now</b><small>' + (t >= l.startAt + S.policy.graceMin * 60000 ? 'You are late. Register now so your tutor knows you are here.' : 'Started at ' + hm(l.startAt) + '. Register within ' + S.policy.graceMin + ' minutes of the start to be on time.') + '</small></div>' +
            '<button type="button" class="att-btn primary" data-att-open="' + esc(l.sessionId) + '">' + icon('fa-hand') + ' Register</button></div>';
        }).join('');
      }
      var pend = pendingLessons();
      dock.innerHTML = pend.filter(function (l) { return S.minimised[l.sessionId] && (!S.open || S.open.sessionId !== l.sessionId); }).map(function (l) {
        return '<button type="button" class="att-chip urgent" data-att-open="' + esc(l.sessionId) + '"><span class="att-dot"></span>Register for ' + esc(l.subjectName) + '</button>';
      }).join('');
      // The registration pop-up opens by itself at the start and comes back until the student registers.
      if (!S.open) {
        var next = pend.filter(function (l) { return !S.minimised[l.sessionId]; })[0];
        if (next) openRegister(next);
      } else if (S.open.sessionId && pend.every(function (l) { return l.sessionId !== S.open.sessionId; }) && !S.open.done) {
        S.open.modal.close();
      }
    }
    function openRegister(l) {
      if (S.open) S.open.modal.close();
      var m = modal({ title: 'Register your attendance', sub: l.subjectName + ' · ' + hm(l.startAt) + ' to ' + hm(l.endAt), closeLabel: 'Minimise', closeIcon: 'fa-window-minimize',
        onX: function () { minimise(l); }, onClose: function () { stopCam(); if (S.open && S.open.modal === m) S.open = null; } });
      S.open = { modal: m, sessionId: l.sessionId, lesson: l };
      registerBody(l, m);
    }
    function registerBody(l, m) {
      stopCam();
      m.el.querySelector('h3').textContent = 'Register your attendance';
      var late = now() >= l.startAt + S.policy.graceMin * 60000;
      m.body.innerHTML = '<div class="att-center"><div class="att-big-ic' + (late ? ' late' : '') + '">' + icon('fa-user-check') + '</div>' +
        '<p>Your lesson has started. Tell your tutor you are here.</p></div>' +
        '<div class="att-kv"><span>Subject</span><b>' + esc(l.subjectName) + '</b><span>Tutor</span><b>' + esc(l.tutorName || '—') + '</b><span>Starts</span><b>' + hm(l.startAt) + '</b>' +
        (l.room ? '<span>Where</span><b>' + esc(/^https?:/i.test(l.room) ? 'Online link in your timetable' : l.room) + '</b>' : '') + '</div>' +
        '<p class="att-muted">' + (late ? 'It is now ' + S.policy.graceMin + ' minutes or more after the start, so this registration will count as late.' : 'Register within ' + S.policy.graceMin + ' minutes of the start to be on time.') + ' The time is taken from Paisley\'s server, not your device.</p><div class="att-msg" data-m></div>';
      var face = S.recognition.available;
      m.foot.innerHTML = '<button type="button" class="att-btn" data-min>' + icon('fa-window-minimize') + ' Minimise</button>' +
        (face ? '<button type="button" class="att-btn" data-face>' + icon('fa-face-smile') + ' Check in with my face</button>' : '') +
        '<button type="button" class="att-btn primary big" data-go>' + icon('fa-hand') + ' I\'m Here: Register Attendance</button>';
      m.foot.querySelector('[data-min]').onclick = function () { minimise(l); };
      m.foot.querySelector('[data-go]').onclick = function () { register(l, m); };
      if (face) m.foot.querySelector('[data-face]').onclick = function () { faceStart(l, m); };
    }
    /* Face check-in: the camera and the face model start only now. The face is read on this device;
       only its 128-number descriptor is sent, never a picture. */
    function faceStart(l, m) {
      if (!S.recognition.available) { registerBody(l, m); return; }
      m.el.querySelector('h3').textContent = 'Check in with your face';
      m.body.innerHTML = '<div data-cam></div><div class="att-msg" data-m style="text-align:center"></div>';
      m.foot.innerHTML = '<button type="button" class="att-btn" data-back>' + icon('fa-arrow-left') + ' Use the normal check-in</button><button type="button" class="att-btn primary big" data-shot disabled>' + icon('fa-camera') + ' Check me in</button>';
      var msg = m.body.querySelector('[data-m]'), shot = m.foot.querySelector('[data-shot]');
      m.foot.querySelector('[data-back]').onclick = function () { registerBody(l, m); };
      S.cam = AttendanceFace.camera(m.body.querySelector('[data-cam]'));
      msg.className = 'att-msg'; msg.textContent = 'Starting the camera and the face model…';
      S.cam.ready.then(function () { shot.disabled = false; msg.className = 'att-msg'; msg.textContent = 'Position your face inside the oval, then press Check me in.'; })
        .catch(function (e) { stopCam(); msg.className = 'att-msg bad'; msg.textContent = errMsg(e); });
      shot.onclick = function () {
        if (S.busy || !S.cam) return;
        S.busy = true; shot.disabled = true; shot.innerHTML = icon('fa-spinner fa-spin') + ' Checking…';
        msg.className = 'att-msg'; msg.textContent = 'Hold still…';
        S.cam.scan().then(function (descs) {
          msg.textContent = 'Checking…';
          return call('faceCheckIn', { entryId: l.entryId, descriptors: descs });
        }).then(function (r) {
          S.busy = false; stopCam();
          showRegistered(l, m, r, 'Face recognised. ');
        }).catch(function (e) {
          S.busy = false; shot.disabled = false; shot.innerHTML = icon('fa-camera') + ' Try again';
          var d = errDetails(e);
          msg.className = 'att-msg bad'; msg.textContent = errMsg(e);
          // Switched off, model would not load, not enrolled or too many tries: go back to the normal check-in.
          if (d.fallback && /disabled|model_unavailable|not_enrolled|rate_limited|replay|error/.test(d.reason || '')) {
            if (/disabled|not_enrolled/.test(d.reason)) S.recognition = { available: false };
            stopCam();
            setTimeout(function () { if (S.open && S.open.modal === m) { registerBody(l, m); var mm = m.body.querySelector('[data-m]'); if (mm) { mm.className = 'att-msg bad'; mm.textContent = errMsg(e) + ' Manual check-in required.'; } } }, 50);
          } else if (/already|ended|cancelled/i.test(errMsg(e))) { stopCam(); refresh(); }
        });
      };
    }
    function minimise(l) { stopCam(); S.minimised[l.sessionId] = 1; try { sessionStorage.setItem('attMin', JSON.stringify(S.minimised)); } catch (e) { } if (S.open) { var mm = S.open.modal; S.open = null; mm.close(); } paint(); }
    function register(l, m) {
      if (S.busy) return; S.busy = true;
      var b = m.foot.querySelector('[data-go]'); b.disabled = true; b.innerHTML = icon('fa-spinner fa-spin') + ' Registering…';
      call('attendanceCheckIn', { entryId: l.entryId }).then(function (r) {
        S.busy = false;
        showRegistered(l, m, r, '');
      }).catch(function (e) {
        S.busy = false; b.disabled = false; b.innerHTML = icon('fa-hand') + ' I\'m Here: Register Attendance';
        m.body.querySelector('[data-m]').className = 'att-msg bad';
        m.body.querySelector('[data-m]').textContent = errMsg(e);
        if (e && /ended|cancelled|already/i.test(errMsg(e))) refresh();
      });
    }
    function showRegistered(l, m, r, lead) {
        var rec = r.record || {};
        S.records[l.sessionId] = rec; l.record = rec; watchRecord(l);
        var late = rec.checkIn && rec.checkIn.classification === 'late';
        S.open.done = true;
        m.el.querySelector('h3').textContent = late ? 'Registered, but late' : 'You are registered';
        m.body.innerHTML = '<div class="att-center"><div class="att-big-ic ' + (late ? 'late' : 'ok') + '">' + icon(late ? 'fa-user-clock' : 'fa-circle-check') + '</div>' +
          '<p>' + esc(lead || '') + '<b>' + esc(l.subjectName) + '</b>: registered at ' + hm(rec.checkIn && rec.checkIn.at) + '.</p>' +
          (late ? '<p>You arrived ' + rec.checkIn.minutesLate + ' minutes after the start. This counts as a late-arrival strike' + (r.strikeNumber ? ' (' + r.strikeNumber + ' this academic year)' : '') + ' and your parent has been told.' + (r.strikeNumber === 4 ? ' This is your formal warning: the next late arrival goes to the Studio Desk.' : '') + (r.strikeNumber >= 5 ? ' Your case has been referred to the Studio Desk.' : '') + '</p>' : '<p>You are on time. Enjoy the lesson!</p>') +
          (rec.needsVerification ? '<p><span class="att-pill wait">Awaiting tutor verification</span> Your tutor had already sent the register, so they will check this registration.</p>' : '') +
          '<div class="att-panel" style="text-align:left"><h4>' + icon('fa-video') + ' Now join the live class</h4><p class="att-muted" style="margin:0">Registering is step one. Your tutor calls the register in the live class and confirms you are there. If you are not in the class when your name is called, you are recorded as <b>registered but not in class</b>, which counts as an absence, and your parent is told.</p></div></div>';
        m.foot.innerHTML = '<button type="button" class="att-btn primary" data-ok>' + icon('fa-check') + ' Done</button>';
        m.foot.querySelector('[data-ok]').onclick = function () { m.close(); paint(); };
        delete S.minimised[l.sessionId];
        paint();
    }
    // Reopen (and refresh) when the student comes back to the page.
    function onBack() { if (document.visibilityState === 'visible') { S.minimised = {}; try { sessionStorage.removeItem('attMin'); } catch (e) { } refresh(); } }
    document.addEventListener('visibilitychange', onBack);
    document.addEventListener('click', function (e) {
      var opener = e.target.closest && e.target.closest('[data-att-open]');
      if (opener) { var l = S.lessons.filter(function (x) { return x.sessionId === opener.dataset.attOpen; })[0]; if (l) { delete S.minimised[l.sessionId]; openRegister(l); } return; }
      // Lesson workspace (live lesson links and the Classroom) waits for registration; account, results and help stay open.
      if (!pendingLessons().length) return;
      var a = e.target.closest && e.target.closest('a[href],[data-view="classroom"],[data-att-gate]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var gated = a.hasAttribute('data-att-gate') || a.dataset.view === 'classroom' || /meet\.google|zoom\.us|teams\.microsoft|jitsi|live-class|workers\.dev|whereby|meet\.jit/i.test(href);
      if (!gated) return;
      e.preventDefault(); e.stopPropagation();
      var p = pendingLessons()[0]; delete S.minimised[p.sessionId]; openRegister(p);
    }, true);
    var tick = setInterval(paint, 15000), poll = setInterval(refresh, 60000);
    refresh();
    return { refresh: refresh, destroy: function () { stopCam(); clearInterval(tick); clearInterval(poll); document.removeEventListener('visibilitychange', onBack); dock.remove(); Object.keys(S.recUnsub).forEach(function (k) { S.recUnsub[k](); }); } };
  }

  /* A student's (or a parent's view of a child's) history. */
  function historyHtml(records, summary, opts) {
    opts = opts || {};
    var per = period(Date.now()), ay = per.key;
    var y = (summary && summary.years && summary.years[ay]) || {};
    var rows = records.filter(function (r) { return r.status !== 'expected' || msOf(r.startAt) <= Date.now(); }).sort(function (a, b) { return msOf(b.startAt) - msOf(a.startAt); });
    var done = rows.filter(function (r) { return ['expected', 'cancelled', 'excused'].indexOf(r.status) === -1; });
    var att = done.filter(function (r) { return ATTENDED.indexOf(r.status) !== -1; }).length;
    var pct = done.length ? Math.round(att * 100 / done.length) : null;
    var count = function (s) { return rows.filter(function (r) { return r.status === s; }).length; };
    var upcoming = records.filter(function (r) { return r.status === 'expected' && msOf(r.startAt) > Date.now(); });
    return '<div class="att-stats">' +
      '<div class="att-stat"><b>' + (pct == null ? '—' : pct + '%') + '</b><span>Attendance</span></div>' +
      '<div class="att-stat"><b>' + (count('present') + count('present_verified') + count('connectivity')) + '</b><span>Present</span></div>' +
      '<div class="att-stat late"><b>' + count('late') + '</b><span>Late</span></div>' +
      '<div class="att-stat warn"><b>' + (count('absent') + count('no_show')) + '</b><span>Absent' + (count('no_show') ? ' (' + count('no_show') + ' not in class)' : '') + '</span></div>' +
      '<div class="att-stat ' + ((y.active || 0) >= 4 ? 'warn' : '') + '"><b>' + (y.active || 0) + '</b><span>Active strikes (' + esc(per.label) + ')</span></div></div>' +
      ((y.active || 0) >= 5 ? '<div class="att-banner lock"><div class="ic">' + icon('fa-scale-balanced') + '</div><div class="t"><b>Referred to the Studio Desk</b><small>' + (y.active) + ' late arrivals ' + esc(per.phrase) + '. The Studio Desk reviews the case and decides what happens.</small></div></div>' :
        (y.active || 0) === 4 ? '<div class="att-banner urgent"><div class="ic">' + icon('fa-triangle-exclamation') + '</div><div class="t"><b>Formal warning</b><small>4 late arrivals ' + esc(per.phrase) + '. The next one is referred to the Studio Desk.</small></div></div>' : '') +
      (upcoming.length ? '<div class="att-panel"><h4>' + icon('fa-calendar-day') + ' Scheduled</h4>' + upcoming.map(function (r) { return '<div class="att-muted">' + dayLabel(r.startAt) + ' ' + hm(r.startAt) + ' · ' + esc(r.subjectName) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="att-panel"><h4>' + icon('fa-list-check') + ' Attendance history</h4>' + (rows.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Subject</th><th>Start</th><th>Student check-in</th><th>Tutor confirmed</th><th>Status</th>' + (opts.requests ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + dayLabel(r.startAt) + '</td><td>' + esc(r.subjectName) + '</td><td>' + hm(r.startAt) + '</td><td>' + (r.checkIn ? hm(r.checkIn.at) + (r.checkIn.minutesLate ? ' <span class="att-muted">(' + r.checkIn.minutesLate + ' min)</span>' : '') + (r.checkIn.method === 'face' ? ' <span class="att-muted">' + icon('fa-face-smile') + '</span>' : '') : '—') + '</td>' +
            '<td>' + confirmCell(r) + '</td>' +
            '<td>' + pill(r.status) + (r.strikeId ? ' <span class="att-pill ' + (r.strikeReversed ? 'wait' : 'late') + '">' + (r.strikeReversed ? 'Strike reversed' : 'Strike') + '</span>' : '') + (r.lateExcused ? ' <span class="att-pill info">Lateness excused</span>' : '') + '</td>' +
            (opts.requests ? '<td>' + (r.strikeId && !r.strikeReversed ? '<button type="button" class="att-btn sm" data-att-excuse="' + esc(r.id) + '">' + icon('fa-envelope-open-text') + ' Ask to excuse</button>' : '') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No lessons recorded yet.</div>') + '</div>';
  }
  function bindExcuse(host) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-att-excuse]'); if (!b) return;
      askReason('Ask the Studio Desk to excuse this late arrival', 'Why was the arrival late? The Studio Desk decides.').then(function (r) {
        if (!r) return;
        call('attendanceRequest', { recordId: b.dataset.attExcuse, kind: 'excuse_lateness', reason: r.reason }).then(function () { b.outerHTML = '<span class="att-pill info">Request sent</span>'; }).catch(function (er) { alert(errMsg(er)); });
      });
    });
  }
  function mountStudentHistory(el, o) {
    style(); el.classList.add('att');
    el.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + ' Loading attendance…</div>';
    var recs = [], sum = null;
    var u1 = db.collection('attendanceRecords').where('studentId', '==', o.uid).onSnapshot(function (s) { recs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, function (e) { el.innerHTML = '<div class="att-empty">Attendance could not be loaded.</div>'; console.warn(e); });
    var u2 = db.collection('attendanceStudents').doc(o.uid).onSnapshot(function (s) { sum = s.exists ? s.data() : null; paint(); }, function () { });
    function paint() { el.innerHTML = historyHtml(recs, sum, { requests: true }); }
    loadPolicy().then(paint);
    bindExcuse(el);
    return { destroy: function () { u1(); u2(); } };
  }

  /* =========================================================
     TUTOR
  ========================================================= */
  function mountTutor(o) {
    style();
    var S = { lessons: [], pending: [], skew: 0, sessions: {}, records: {}, unsubs: {}, dismissed: {}, modal: null, active: null, locks: [], policy: { graceMin: 15, autoSubmitAfterEndMin: 15 }, opt: {}, more: {}, recognition: { available: false }, cam: null };
    function stopCam() { if (S.cam) { S.cam.stop(); S.cam = null; } }
    /* Optimistic marks: S.opt[sessionId_studentId] = { status, resolution, busy }. The row shows the
       tutor's choice the moment it is tapped; the live snapshot replaces it once the server has it. */
    function recsOf(sid) {
      return (S.records[sid] || []).map(function (r) {
        var o2 = S.opt[sid + '_' + r.studentId];
        if (!o2) return r;
        if (o2.kind === 'confirm') return Object.assign({}, r, { status: o2.status || r.status, confirmState: o2.confirmState, tutorConfirm: o2.tutorConfirm, _busy: o2.busy });
        return Object.assign({}, r, { status: o2.status, resolution: o2.resolution, _busy: o2.busy });
      });
    }
    // Wake the attendance functions so the first tap is not a cold start.
    var warmed = 0;
    function warm() {
      if (Date.now() - warmed < 4 * 60000) return; warmed = Date.now();
      ['attendanceResolve', 'attendanceSubmit'].forEach(function (n) { call(n, { warm: true }).catch(function () { }); });
    }
    try { S.dismissed = JSON.parse(store('attDismissed') || '{}'); } catch (e) { }
    var dock = document.createElement('div'); dock.className = 'att-dock att'; document.body.appendChild(dock);
    function now() { return Date.now() + S.skew; }
    function live() {
      var t = now();
      return Object.keys(S.sessions).map(function (k) { return S.sessions[k]; }).filter(function (s) {
        return s.status === 'open' && t >= msOf(s.startAt) - 10 * 60000 && t < msOf(s.endAt) + S.policy.autoSubmitAfterEndMin * 60000;
      }).sort(function (a, b) { return msOf(a.startAt) - msOf(b.startAt); });
    }
    function refresh() {
      return call('attendanceToday').then(function (d) {
        S.skew = (d.now || Date.now()) - Date.now(); S.policy = d.policy || S.policy;
        S.lessons = d.lessons || []; S.pending = d.pending || [];
        S.recognition = (d.recognition && d.recognition.available && typeof AttendanceFace !== 'undefined') ? d.recognition : { available: false };
        S.lessons.concat(S.pending).forEach(function (l) { if (l.sessionId && l.status !== 'upcoming') watch(l.sessionId); });
        paint();
      }).catch(function (e) { console.warn('attendanceToday', e); });
    }
    function watch(sid) {
      if (S.unsubs[sid]) return;
      var a = db.collection('attendanceSessions').doc(sid).onSnapshot(function (s) {
        if (!s.exists) return;
        S.sessions[sid] = Object.assign({ id: sid }, s.data()); paint();
      }, function () { });
      var b = db.collection('attendanceRecords').where('sessionId', '==', sid).where('tutorIds', 'array-contains', o.uid).onSnapshot(function (s) {
        S.records[sid] = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (x, y) { return String(x.studentName).localeCompare(String(y.studentName)); });
        // Drop optimistic marks the server now confirms (or that a student's own check-in overtook).
        S.records[sid].forEach(function (r) {
          var k = sid + '_' + r.studentId, o2 = S.opt[k];
          if (o2 && !o2.busy && (o2.kind === 'confirm' ? confirmOf(r) === o2.confirmState : (r.status === o2.status || r.checkIn))) delete S.opt[k];
        });
        paint();
      }, function (e) { console.warn('register', e); });
      S.unsubs[sid] = function () { a(); b(); };
    }
    function paint() {
      var lv = live();
      // Persistent Rollcall pill: collection continues while the pop-up is closed.
      dock.innerHTML = lv.length ? '<button type="button" class="att-chip" data-att-roll><span class="att-dot"></span>Rollcall <span class="n">' + lv.length + ' live</span></button>' : '';
      if (o.indicatorEl) { o.indicatorEl.style.display = lv.length ? '' : 'none'; o.indicatorEl.textContent = lv.length; }
      // Opens by itself when a lesson starts, unless the tutor closed it for that lesson.
      if (!S.modal) {
        var fresh = lv.filter(function (s) { return now() >= msOf(s.startAt) && !S.dismissed[s.id]; })[0];
        if (fresh) openRoll(fresh.id);
      } else paintRoll();
      if (o.viewEl && o.viewEl.isConnected !== false) paintView();
    }
    function counts(recs) {
      var c = { total: recs.length, checked: 0, present: 0, late: 0, unresolved: 0, absent: 0, other: 0, confirmed: 0, awaiting: 0, noShow: 0 };
      recs.forEach(function (r) {
        if (r.checkIn) c.checked++;
        var cf = confirmOf(r);
        if (cf === 'confirmed') c.confirmed++; else if (cf === 'pending' || cf === 'unconfirmed') c.awaiting++;
        if (r.status === 'present' || r.status === 'present_verified' || r.status === 'connectivity') c.present++;
        else if (r.status === 'late') c.late++;
        else if (r.status === 'absent') c.absent++;
        else if (r.status === 'no_show') c.noShow++;
        else if (r.status === 'expected' || r.status === 'unaccounted') c.unresolved++;
        else c.other++;
      });
      return c;
    }
    /* One tap marks a student: Present / Absent, or More for the other outcomes with a note. */
    function quickHtml(s, r) {
      var k = s.id + '_' + r.studentId, cur = r.resolution && r.resolution.outcome, busy = r._busy;
      var data = ' data-sid="' + esc(s.id) + '" data-st="' + esc(r.studentId) + '"' + (busy ? ' disabled' : '');
      function q(out, cls, ic, label) {
        return '<button type="button" class="att-q ' + cls + (cur === out ? ' on' : '') + '" data-quick="' + out + '"' + data + ' aria-pressed="' + (cur === out) + '">' + icon(busy === out ? 'fa-spinner fa-spin' : ic) + ' ' + label + '</button>';
      }
      var other = cur && cur !== 'absent' && cur !== 'present_unable';
      var h = '<div class="att-quick">' + q('present_unable', 'ok', 'fa-check', 'Present') + q('absent', 'bad', 'fa-xmark', 'Absent') +
        '<button type="button" class="att-q more' + (other ? ' on' : '') + '" data-more="' + esc(k) + '"' + data + ' title="Other outcomes">' + icon(busy && busy !== 'absent' && busy !== 'present_unable' ? 'fa-spinner fa-spin' : 'fa-ellipsis') + (other ? ' ' + esc(r.resolution.label || 'Other') : ' More') + '</button></div>';
      if (S.more[k]) {
        h += '<div class="att-resolve"><select data-out="' + esc(r.studentId) + '" aria-label="Outcome for ' + esc(r.studentName) + '">' + OUTCOMES.filter(function (x) { return x[0] !== 'absent' && x[0] !== 'present_unable'; }).map(function (x) { return '<option value="' + x[0] + '"' + (cur === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
          '<input data-note="' + esc(r.studentId) + '" placeholder="Explanation" maxlength="1000" value="' + esc(r.resolution ? r.resolution.note || '' : '') + '"><button type="button" class="att-btn sm primary" data-resolve="' + esc(r.studentId) + '" data-sid="' + esc(s.id) + '"' + (busy ? ' disabled' : '') + '>Save</button></div>';
      }
      return h;
    }
    /* Second timestamp: the tutor calls the name in the live class and confirms (or not). */
    function confirmBtnsHtml(s, r) {
      var c = confirmOf(r), busy = r._busy;
      var data = ' data-sid="' + esc(s.id) + '" data-st="' + esc(r.studentId) + '"' + (busy ? ' disabled' : '');
      function b(out, cls, ic, label, on) {
        return '<button type="button" class="att-q ' + cls + (on ? ' on' : '') + '" data-confirm="' + out + '"' + data + ' aria-pressed="' + on + '">' + icon(busy === out ? 'fa-spinner fa-spin' : ic) + ' ' + label + '</button>';
      }
      return '<div class="att-quick">' + b('confirm', 'ok', 'fa-user-check', 'Confirm', c === 'confirmed') + b('not_in_class', 'bad', 'fa-user-xmark', 'Not in class', c === 'not_in_class') + '</div>';
    }
    /* The tutor's own attendance for this lesson (attendanceTutorCheckIn / faceTutorVerify). */
    function meHtml(s) {
      var t = now(), me = (s.tutorPresence || {})[o.uid];
      if (s.status === 'cancelled') return '';
      var face = S.recognition.available;
      if (me) {
        return '<div class="att-me">' + icon('fa-chalkboard-user') + '<b>You confirmed you are teaching at ' + hm(me.at) + '</b>' +
          (me.classification === 'late' ? '<span class="att-pill late">' + me.minutesLate + ' min after the start</span>' : '<span class="att-pill ok">On time</span>') +
          (me.faceVerifiedAt ? '<span class="att-pill info">' + icon('fa-face-smile') + ' Face verified</span>' : face && t < msOf(s.endAt) ? '<button type="button" class="att-btn sm" data-tface="' + esc(s.id) + '">' + icon('fa-face-smile') + ' Verify with my face</button>' : '') + '</div>';
      }
      if (t < msOf(s.startAt) - 10 * 60000 || t >= msOf(s.endAt)) return '';
      return '<div class="att-me">' + icon('fa-chalkboard-user') + '<b>Confirm you are teaching this lesson</b>' +
        (face ? '<button type="button" class="att-btn sm" data-tface="' + esc(s.id) + '">' + icon('fa-face-smile') + ' Verify with my face</button>' : '') +
        '<button type="button" class="att-btn sm primary" data-tpres="' + esc(s.id) + '">' + icon('fa-hand') + ' I\'m teaching</button></div>';
    }
    function tutorFace(sid) {
      if (!S.recognition.available || typeof AttendanceFace === 'undefined') return;
      var m = modal({ title: 'Verify it is you', sub: 'Only you, facing the camera. Your picture never leaves this device.', closeLabel: 'Cancel', onClose: stopCam });
      m.body.innerHTML = '<div data-cam></div><div class="att-msg" data-m style="text-align:center"></div>';
      m.foot.innerHTML = '<button type="button" class="att-btn" data-c>Cancel</button><button type="button" class="att-btn primary" data-shot disabled>' + icon('fa-camera') + ' Verify</button>';
      var msg = m.body.querySelector('[data-m]'), shot = m.foot.querySelector('[data-shot]');
      m.foot.querySelector('[data-c]').onclick = function () { m.close(); };
      stopCam(); S.cam = AttendanceFace.camera(m.body.querySelector('[data-cam]'));
      msg.textContent = 'Starting the camera and the face model…';
      S.cam.ready.then(function () { shot.disabled = false; msg.textContent = ''; }).catch(function (e) { msg.className = 'att-msg bad'; msg.textContent = errMsg(e); });
      shot.onclick = function () {
        if (!S.cam) return;
        shot.disabled = true; shot.innerHTML = icon('fa-spinner fa-spin') + ' Checking…';
        S.cam.scan().then(function (descs) { return call('faceTutorVerify', { sessionId: sid, descriptors: descs }); })
          .then(function () { m.close(); toast('Face recognised. You are verified for this lesson.'); })
          .catch(function (e) {
            shot.disabled = false; shot.innerHTML = icon('fa-camera') + ' Try again';
            var d = errDetails(e); msg.className = 'att-msg bad'; msg.textContent = errMsg(e);
            if (d.fallback && /disabled|not_enrolled|rate_limited/.test(d.reason || '')) { S.recognition = { available: false }; stopCam(); shot.remove(); paint(); }
          });
      };
    }
    function registerHtml(s, compact) {
      var recs = recsOf(s.id), c = counts(recs), t = now();
      var started = t >= msOf(s.startAt), afterGrace = t >= msOf(s.graceAt), submitted = s.status !== 'open';
      var rows = recs.map(function (r) {
        var unresolved = r.status === 'expected' || r.status === 'unaccounted';
        var waiting = awaitingConfirm(r);
        var flag = (unresolved && afterGrace) || r.needsVerification || r.reviewState === 'pending' || (waiting && started) || r.status === 'no_show';
        var canConfirm = !!r.checkIn && s.status !== 'cancelled' && t >= msOf(s.startAt) - 10 * 60000 && (!submitted || waiting);
        var tutorMarked = !r.checkIn && ['absent', 'present_verified', 'connectivity', 'excused', 'other'].indexOf(r.status) !== -1;
        var canResolve = started && !r.checkIn && (unresolved || (tutorMarked && !submitted)) && s.status !== 'cancelled';
        return '<tr class="' + (flag ? 'flag' : '') + (r._busy ? ' att-busy' : '') + '"><td><b>' + esc(r.studentName) + '</b>' + (r.resolution ? '<div class="att-muted">' + esc(r.resolution.label || r.resolution.outcome) + (r.resolution.note ? ': ' + esc(r.resolution.note) : '') + ' · ' + esc(r.resolution.byName || '') + ' ' + hm(r.resolution.at) + '</div>' : '') + '</td>' +
          '<td>' + pill(unresolved && !afterGrace ? 'expected' : r.status) + (unresolved && afterGrace ? ' <span class="att-pill bad">Account for</span>' : '') + (r.needsVerification ? ' <span class="att-pill wait">Registered after submission</span>' : '') + (r.reviewState === 'pending' ? ' <span class="att-pill wait">Studio Desk review</span>' : '') + '</td>' +
          '<td>' + (r.checkIn ? hm(r.checkIn.at) : '—') + '</td><td>' + methodPill(r) + '</td>' +
          '<td>' + (r.checkIn ? (r.checkIn.classification === 'late' ? '<span class="att-pill late">' + r.checkIn.minutesLate + ' min late</span>' : '<span class="att-pill ok">On time</span>') : '—') + '</td>' +
          '<td>' + confirmCell(r) + '</td>' +
          '<td>' + (r.strikeId ? '<span class="att-pill ' + (r.strikeReversed ? 'wait' : 'late') + '">' + icon('fa-triangle-exclamation') + ' ' + (r.strikeReversed ? 'Reversed' : 'Strike') + '</span>' : '—') + '</td>' +
          '<td>' + (canResolve ? quickHtml(s, r) : '') + (canConfirm ? confirmBtnsHtml(s, r) : '') + '</td></tr>';
      }).join('');
      var head = '<div class="att-stats"><div class="att-stat"><b>' + c.total + '</b><span>Enrolled</span></div><div class="att-stat"><b>' + c.checked + '</b><span>Checked in</span></div>' +
        '<div class="att-stat"><b>' + c.confirmed + '</b><span>Confirmed in class</span></div><div class="att-stat warn"><b>' + c.awaiting + '</b><span>Awaiting your confirmation</span></div>' +
        '<div class="att-stat late"><b>' + c.late + '</b><span>Late</span></div>' +
        '<div class="att-stat warn"><b>' + c.unresolved + '</b><span>' + (afterGrace ? 'Unaccounted for' : 'Not registered yet') + '</span></div><div class="att-stat"><b>' + (c.absent + c.noShow) + '</b><span>Absent' + (c.noShow ? ' (' + c.noShow + ' not in class)' : '') + '</span></div></div>';
      var how = s.status === 'open' && started ? '<div class="att-banner"><div class="ic">' + icon('fa-video') + '</div><div class="t"><b>Call the register in the live class</b><small>Students who register appear here. When you call a name in Google Meet and the student answers, press <b>Confirm</b>. If they are not there, press <b>Not in class</b>: it is recorded as an absence and the family is told. Both times are kept, when they registered and when you confirmed.</small></div></div>' : '';
      var state = s.status === 'cancelled' ? '<div class="att-banner"><div class="ic">' + icon('fa-ban') + '</div><div class="t"><b>Lesson cancelled</b><small>' + esc((s.cancelled && s.cancelled.reason) || '') + '</small></div></div>' :
        submitted ? '<div class="att-banner"><div class="ic">' + icon('fa-circle-check') + '</div><div class="t"><b>' + (s.status === 'auto_submitted' ? 'AUTO-SUBMITTED' : 'Submitted') + ' ' + hm(s.submission && s.submission.at) + '</b><small>' + (s.status === 'auto_submitted' ? 'You did not submit this register, so the system did. Account for anyone still unresolved and add your explanation below.' : 'Submitted by ' + esc((s.submission && s.submission.byName) || '')) + '</small></div></div>' :
        !started ? '<p class="att-muted">The register opens at ' + hm(s.startAt) + '. Students appear here as they register.</p>' :
        !afterGrace ? '<p class="att-muted">Students are registering. Anyone not registered by ' + hm(s.graceAt) + ' is flagged for you to account for. Nobody is marked absent automatically.</p>' :
        t >= msOf(s.endAt) ? '<p class="att-muted">The lesson has ended, so you can submit now. Anyone you have not marked stays unaccounted for (never absent) and you can still mark them after submitting. If the register is not submitted it is auto-submitted at ' + hm(msOf(s.endAt) + S.policy.autoSubmitAfterEndMin * 60000) + '.</p>' :
        '<p class="att-muted">Mark every flagged student, then submit. Submit opens for everyone the moment the lesson ends at ' + hm(s.endAt) + '. If the register is not submitted it is auto-submitted at ' + hm(msOf(s.endAt) + S.policy.autoSubmitAfterEndMin * 60000) + ' and the Studio Desk is told.</p>';
      var explain = s.status === 'auto_submitted' ? '<div class="att-panel"><h4>' + icon('fa-comment-dots') + ' Your explanation</h4>' + (s.tutorExplanation ? '<p class="att-muted">"' + esc(s.tutorExplanation.text) + '" (' + dayLabel(s.tutorExplanation.at) + ')' + (s.explanationReview ? ' · Studio Desk: ' + esc(s.explanationReview.decision) : '') + '</p>' : '') +
        '<label class="att-field">Why was the register not submitted?<textarea data-explain="' + esc(s.id) + '" maxlength="2000"></textarea></label><button type="button" class="att-btn sm primary" data-explain-go="' + esc(s.id) + '">' + icon('fa-paper-plane') + ' Send explanation</button></div>' : '';
      return meHtml(s) + state + how + head + (recs.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Student</th><th>Status</th><th>Student check-in</th><th>Method</th><th>On time</th><th>Tutor confirmed</th><th>Strike</th><th>Mark</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="att-empty">No students are enrolled in this session.</div>') +
        '<div class="att-msg" data-msg="' + esc(s.id) + '"></div>' + explain;
    }
    function openRoll(sid) {
      if (S.modal) S.modal.m.close();
      var m = modal({ title: 'Rollcall', wide: true, closeLabel: 'Close (attendance keeps collecting)', onX: function () { closeRoll(); } });
      S.modal = { m: m, sid: sid };
      paintRoll();
    }
    function closeRoll() {
      if (!S.modal) return;
      S.dismissed[S.modal.sid] = 1; store('attDismissed', JSON.stringify(S.dismissed));
      var m = S.modal.m; S.modal = null; m.close(); paint();
    }
    function submitState(s) {
      var t = now(), c = counts(recsOf(s.id)), ended = t >= msOf(s.endAt), afterGrace = t >= msOf(s.graceAt);
      if (ended) return { ok: true, note: [c.unresolved ? c.unresolved + ' not marked: they stay unaccounted for' : '', c.awaiting ? c.awaiting + ' not confirmed: they stay "never confirmed"' : ''].filter(Boolean).join('. ') };
      if (!afterGrace) return { ok: false, why: 'Opens at ' + hm(s.graceAt) + ', after the grace period' };
      if (c.unresolved) return { ok: false, why: 'Mark every flagged student, or wait until the lesson ends at ' + hm(s.endAt) };
      if (c.awaiting) return { ok: false, why: 'Confirm (or mark Not in class) every student who registered, or wait until the lesson ends at ' + hm(s.endAt) };
      return { ok: true };
    }
    function footHtml(s) {
      if (s.status !== 'open') return '<span class="att-muted" style="margin-right:auto">' + icon('fa-circle-info') + ' Closing this keeps collecting registrations. Reopen it from the Rollcall button.</span>';
      var st = submitState(s);
      return '<span class="att-muted" style="margin-right:auto">' + icon('fa-circle-info') + ' ' + esc(st.ok ? (st.note || 'Ready to submit.') : st.why) + '</span>' +
        '<button type="button" class="att-btn primary" data-submit="' + esc(s.id) + '"' + (st.ok ? '' : ' disabled title="' + esc(st.why) + '"') + '>' + icon('fa-paper-plane') + ' Submit register</button>';
    }
    function paintRoll() {
      if (!S.modal) return;
      var lv = live(), s = S.sessions[S.modal.sid];
      if (!s) return;
      var m = S.modal.m;
      // The Submit button always follows the clock, even while the tutor is typing.
      if (!m.foot.querySelector('[data-submit] .fa-spinner')) m.foot.innerHTML = footHtml(s);
      // Keep the tutor's typing: only repaint the parts that are not being edited.
      var active = document.activeElement, editing = active && m.el.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
      if (editing) return;
      m.el.querySelector('h3').textContent = 'Rollcall: ' + s.subjectName;
      m.el.querySelector('.sub').textContent = (s.keyStage || '').replace(/\s*\(.*/, '') + ' · ' + hm(s.startAt) + ' to ' + hm(s.endAt) + ' · ' + (s.tutorName || '') + (s.room && !/^https?:/i.test(s.room) ? ' · ' + s.room : '');
      var tabs = lv.length > 1 ? '<div class="att-reg-tabs">' + lv.map(function (x) { return '<button type="button" class="att-btn sm' + (x.id === s.id ? ' primary' : '') + '" data-roll-tab="' + esc(x.id) + '">' + esc(x.subjectName) + ' ' + hm(x.startAt) + '</button>'; }).join('') + '</div>' : '';
      var old = m.el.querySelector('.att-reg-tabs'); if (old) old.remove();
      if (tabs) m.head.insertAdjacentHTML('afterend', tabs);
      var msgEl = m.body.querySelector('[data-msg]'), keep = msgEl ? [msgEl.className, msgEl.textContent] : null;
      m.body.innerHTML = registerHtml(s);
      var nm = m.body.querySelector('[data-msg]'); if (nm && keep) { nm.className = keep[0]; nm.textContent = keep[1]; }
    }
    /* Confirm / Not in class: shown at once, saved in the background, undone if it fails. */
    function confirmStudent(sid, st, outcome, host) {
      var k = sid + '_' + st, prev = S.opt[k];
      var rec0 = (S.records[sid] || []).filter(function (x) { return x.studentId === st; })[0] || {};
      var state = outcome === 'confirm' ? 'confirmed' : 'not_in_class';
      var late = rec0.checkIn && rec0.checkIn.classification === 'late';
      S.opt[k] = { kind: 'confirm', confirmState: state, status: state === 'not_in_class' ? 'no_show' : (rec0.status === 'no_show' ? (late ? 'late' : 'present') : rec0.status),
        tutorConfirm: { outcome: state, at: now(), byName: 'You', minutesAfterCheckIn: rec0.checkIn ? Math.max(0, Math.floor((now() - msOf(rec0.checkIn.at)) / 60000)) : null }, busy: outcome };
      paint();
      var msg = function () { return (S.modal && S.modal.m.el.querySelector('[data-msg="' + sid + '"]')) || (host && host.querySelector('[data-msg="' + sid + '"]')); };
      call('attendanceResolve', { sessionId: sid, studentId: st, outcome: outcome }).then(function () {
        if (S.opt[k]) S.opt[k].busy = null;
        var rec = (S.records[sid] || []).filter(function (x) { return x.studentId === st; })[0];
        if (rec && S.opt[k] && confirmOf(rec) === S.opt[k].confirmState) delete S.opt[k];
        var m2 = msg(); if (m2) { m2.className = 'att-msg'; m2.textContent = ''; }
        paint();
      }).catch(function (er) {
        if (prev) S.opt[k] = prev; else delete S.opt[k];
        paint();
        var m2 = msg(); if (m2) { m2.className = 'att-msg bad'; m2.textContent = errMsg(er); }
      });
    }
    /* Mark a student: shown at once, saved in the background, undone with a message if it fails. */
    function mark(sid, st, outcome, note, host) {
      var k = sid + '_' + st, label = (OUTCOMES.filter(function (x) { return x[0] === outcome; })[0] || [])[1] || outcome;
      var statusOf = { absent: 'absent', present_unable: 'present_verified', connectivity: 'connectivity', excused_admin: 'excused', other: 'other' };
      var prev = S.opt[k];
      S.opt[k] = { status: statusOf[outcome] || 'other', resolution: { outcome: outcome, label: label, note: note || '', byName: 'You', at: now() }, busy: outcome };
      delete S.more[k];
      paint();
      var msg = function () { return (S.modal && S.modal.m.el.querySelector('[data-msg="' + sid + '"]')) || (host && host.querySelector('[data-msg="' + sid + '"]')); };
      call('attendanceResolve', { sessionId: sid, studentId: st, outcome: outcome, note: note || '' }).then(function (r) {
        if (S.opt[k]) S.opt[k].busy = null;
        // Already confirmed by the live snapshot? Then the optimistic mark can go.
        var rec = (S.records[sid] || []).filter(function (x) { return x.studentId === st; })[0];
        if (rec && S.opt[k] && rec.status === S.opt[k].status) delete S.opt[k];
        var m2 = msg(); if (m2) { m2.className = 'att-msg ok'; m2.textContent = r && r.reviewPending ? 'Saved. The Studio Desk reviews this explanation.' : ''; }
        paint();
      }).catch(function (er) {
        if (prev) S.opt[k] = prev; else delete S.opt[k];
        paint();
        var m2 = msg(); if (m2) { m2.className = 'att-msg bad'; m2.textContent = errMsg(er); }
      });
    }
    function act(e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var roll = t.closest('[data-att-roll]'); if (roll) { var lv = live(); if (lv.length) { delete S.dismissed[lv[0].id]; openRoll(lv[0].id); } return; }
      var tab = t.closest('[data-roll-tab]'); if (tab) { openRoll(tab.dataset.rollTab); return; }
      var open = t.closest('[data-open-reg]'); if (open) { watch(open.dataset.openReg); delete S.dismissed[open.dataset.openReg]; openRoll(open.dataset.openReg); return; }
      var host = t.closest('.att-card') || t.closest('.att');
      var tp = t.closest('[data-tpres]');
      if (tp) {
        tp.disabled = true; tp.innerHTML = icon('fa-spinner fa-spin') + ' Saving…';
        call('attendanceTutorCheckIn', { sessionId: tp.dataset.tpres }).then(function (r) { toast(r && r.classification === 'late' ? 'Recorded: ' + r.minutesLate + ' min after the start' : 'Recorded. Thank you.'); })
          .catch(function (er) { tp.disabled = false; tp.innerHTML = icon('fa-hand') + ' I\'m teaching'; alert(errMsg(er)); });
        return;
      }
      var tf = t.closest('[data-tface]'); if (tf) { tutorFace(tf.dataset.tface); return; }
      var wd = t.closest('[data-face-withdraw]');
      if (wd) {
        if (!confirm('Withdraw your consent for face verification? Your face data is deleted and you use the normal confirmation.')) return;
        call('faceConsent', { action: 'withdraw' }).then(function () { S.recognition = { available: false }; toast('Consent withdrawn. Your face data is deleted.'); paint(); }).catch(function (er) { alert(errMsg(er)); });
        return;
      }
      var cf = t.closest('[data-confirm]');
      if (cf) { if (!cf.disabled) confirmStudent(cf.dataset.sid, cf.dataset.st, cf.dataset.confirm, host); return; }
      var qk = t.closest('[data-quick]');
      if (qk) { if (!qk.disabled) mark(qk.dataset.sid, qk.dataset.st, qk.dataset.quick, '', host); return; }
      var mo = t.closest('[data-more]');
      if (mo) { if (S.more[mo.dataset.more]) delete S.more[mo.dataset.more]; else S.more[mo.dataset.more] = 1; paint(); return; }
      var res = t.closest('[data-resolve]');
      if (res) {
        var sid = res.dataset.sid, st = res.dataset.resolve, scope = res.closest('tr');
        var out = scope.querySelector('[data-out]').value, note = scope.querySelector('[data-note]').value.trim();
        var msg = host && host.querySelector('[data-msg="' + sid + '"]');
        if (!out) { if (msg) { msg.className = 'att-msg bad'; msg.textContent = 'Choose how the student is accounted for.'; } return; }
        if (out === 'other' && note.length < 3) { if (msg) { msg.className = 'att-msg bad'; msg.textContent = 'Write the reason for "Other".'; } return; }
        if (document.activeElement) document.activeElement.blur();
        mark(sid, st, out, note, host);
        return;
      }
      var ver = t.closest('[data-verify]');
      if (ver) { ver.disabled = true; call('attendanceResolve', { sessionId: ver.dataset.sid, studentId: ver.dataset.verify, outcome: 'verify' }).catch(function (er) { ver.disabled = false; alert(errMsg(er)); }); return; }
      var sub = t.closest('[data-submit]');
      if (sub) {
        sub.disabled = true; sub.innerHTML = icon('fa-spinner fa-spin') + ' Submitting…';
        call('attendanceSubmit', { sessionId: sub.dataset.submit }).then(function () {
          // Show it as submitted straight away; the live snapshot follows.
          var ss = S.sessions[sub.dataset.submit]; if (ss && ss.status === 'open') S.sessions[sub.dataset.submit] = Object.assign({}, ss, { status: 'submitted', submission: { at: now(), byName: 'You' } });
          refreshLocks(); paint();
        }).catch(function (er) {
          sub.disabled = false; sub.innerHTML = icon('fa-paper-plane') + ' Submit register';
          var msg = host && host.querySelector('[data-msg="' + sub.dataset.submit + '"]'); if (msg) { msg.className = 'att-msg bad'; msg.textContent = errMsg(er); }
        });
        return;
      }
      var ex = t.closest('[data-explain-go]');
      if (ex) {
        var ta = host.querySelector('[data-explain="' + ex.dataset.explainGo + '"]'), text = ta ? ta.value.trim() : '';
        if (text.length < 5) { alert('Write your explanation first.'); return; }
        ex.disabled = true;
        call('attendanceExplain', { sessionId: ex.dataset.explainGo, text: text }).then(function () { ta.value = ''; ex.disabled = false; ex.blur(); paint(); }).catch(function (er) { ex.disabled = false; alert(errMsg(er)); });
      }
    }
    document.addEventListener('click', act);

    /* Attendance tab: today's registers, overdue ones, history. */
    var hist = [];
    function loadHistory() {
      db.collection('attendanceSessions').where('tutorIds', 'array-contains', o.uid).orderBy('date', 'desc').limit(60).get().then(function (s) {
        hist = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paintView();
      }).catch(function (e) { console.warn('attendance history', e); });
    }
    function paintView() {
      var el = o.viewEl; if (!el) return;
      if (el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      var t = now();
      var lockHtml = S.locks.map(function (l) { return '<div class="att-banner lock"><div class="ic">' + icon('fa-lock') + '</div><div class="t"><b>' + esc(l.subjectName) + ': attendance register overdue</b><small>Marking and recording work in ' + esc(l.subjectName) + ' is paused until you submit it (it is auto-submitted at ' + hm(l.autoSubmitAt) + '). Your other subjects and all teaching materials stay open.</small></div>' + (l.sessionIds || []).map(function (sid) { return '<button type="button" class="att-btn primary" data-open-reg="' + esc(sid) + '">' + icon('fa-clipboard-list') + ' Open register</button>'; }).join('') + '</div>'; }).join('');
      var today = S.lessons.map(function (l) {
        var s = S.sessions[l.sessionId], st = s ? s.status : 'upcoming';
        return '<tr><td><b>' + esc(l.subjectName) + '</b><div class="att-muted">' + esc((l.keyStage || '').replace(/\s*\(.*/, '')) + '</div></td><td>' + hm(l.startAt) + ' to ' + hm(l.endAt) + '</td>' +
          '<td>' + (st === 'upcoming' ? '<span class="att-pill wait">Opens ' + hm(l.startAt - 20 * 60000) + '</span>' : st === 'open' ? (t < l.startAt ? '<span class="att-pill info">Ready</span>' : t < l.endAt ? '<span class="att-pill ok">Live</span>' : '<span class="att-pill bad">Submit now</span>') : st === 'auto_submitted' ? '<span class="att-pill bad">AUTO-SUBMITTED</span>' : st === 'cancelled' ? pill('cancelled') : '<span class="att-pill ok">Submitted</span>') + '</td>' +
          '<td>' + (s ? (function (c) { return c.checked + ' / ' + c.total + '<div class="att-muted">' + c.confirmed + ' confirmed' + (c.awaiting ? ', ' + c.awaiting + ' waiting' : '') + '</div>'; })(counts(recsOf(l.sessionId))) : '—') + '</td>' +
          '<td>' + (s ? '<button type="button" class="att-btn sm" data-open-reg="' + esc(l.sessionId) + '">' + icon('fa-clipboard-list') + ' Open register</button>' : '') + '</td></tr>';
      }).join('');
      var follow = hist.filter(function (s) { return s.status === 'auto_submitted' && (!s.tutorExplanation || (s.unresolvedCount || 0) > 0); });
      el.innerHTML = '<div class="att">' + lockHtml +
        '<div class="att-panel"><h4>' + icon('fa-calendar-day') + ' Today\'s registers</h4>' + (S.lessons.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Lesson</th><th>Time</th><th>Register</th><th>Checked in</th><th></th></tr></thead><tbody>' + today + '</tbody></table></div>' : '<div class="att-empty">No timetabled lessons for you today.</div>') + '</div>' +
        (follow.length ? '<div class="att-panel"><h4>' + icon('fa-triangle-exclamation') + ' Follow-up needed</h4>' + follow.map(function (s) { return '<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin:.3rem 0"><span class="att-pill bad">AUTO-SUBMITTED</span><b>' + esc(s.subjectName) + '</b><span class="att-muted">' + dayLabel(s.startAt) + ' ' + hm(s.startAt) + (s.unresolvedCount ? ' · ' + s.unresolvedCount + ' unresolved' : '') + (s.tutorExplanation ? '' : ' · explanation needed') + '</span><button type="button" class="att-btn sm" data-open-reg="' + esc(s.id) + '">Open</button></div>'; }).join('') + '</div>' : '') +
        (S.recognition.available ? '<div class="att-panel"><h4>' + icon('fa-face-smile') + ' Face verification</h4><p class="att-muted">The Studio Desk has enrolled you, with your consent, so you can verify yourself with your face when a lesson opens. It is optional: I\'m teaching always works.</p><button type="button" class="att-btn sm danger" data-face-withdraw>' + icon('fa-user-xmark') + ' Withdraw consent and delete my face data</button></div>' : '') +
        '<div class="att-panel"><h4>' + icon('fa-clock-rotate-left') + ' Submission history</h4>' + (hist.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Lesson</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>' + hist.map(function (s) {
          return '<tr><td>' + dayLabel(s.startAt) + '</td><td>' + esc(s.subjectName) + ' ' + hm(s.startAt) + '</td><td>' + (s.status === 'auto_submitted' ? '<span class="att-pill bad">AUTO-SUBMITTED</span>' : s.status === 'submitted' ? '<span class="att-pill ok">Submitted</span>' : s.status === 'cancelled' ? pill('cancelled') : '<span class="att-pill info">Open</span>') + '</td><td>' + (s.submission ? hm(s.submission.at) : '—') + '</td><td><button type="button" class="att-btn sm" data-open-reg="' + esc(s.id) + '">View</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No registers yet.</div>') + '</div></div>';
    }
    var lockUnsub = null;
    function refreshLocks() { }
    lockUnsub = db.collection('attendanceLocks').where('tutorId', '==', o.uid).onSnapshot(function (s) {
      S.locks = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (o.onLocks) o.onLocks(S.locks);
      paintView();
    }, function () { });
    var tick = setInterval(paint, 15000), poll = setInterval(refresh, 60000), edge = null;
    // Repaint the moment a lesson starts, its grace ends or it ends, so Submit comes alive on time.
    function scheduleEdge() {
      clearTimeout(edge);
      var t = now(), next = Infinity;
      Object.keys(S.sessions).forEach(function (k) {
        var s = S.sessions[k]; if (s.status !== 'open') return;
        [msOf(s.startAt), msOf(s.graceAt), msOf(s.endAt)].forEach(function (x) { if (x > t && x < next) next = x; });
      });
      if (next !== Infinity) edge = setTimeout(function () { paint(); }, Math.min(next - t + 250, 2147483000));
    }
    var paint0 = paint; paint = function () { paint0(); scheduleEdge(); if (S.modal) warm(); };
    refresh(); loadHistory();
    return {
      refresh: function () { refresh(); loadHistory(); },
      locks: function () { return S.locks.slice(); },
      destroy: function () { clearInterval(tick); clearInterval(poll); clearTimeout(edge); document.removeEventListener('click', act); dock.remove(); Object.keys(S.unsubs).forEach(function (k) { S.unsubs[k](); }); if (lockUnsub) lockUnsub(); }
    };
  }

  /* =========================================================
     PARENT
  ========================================================= */
  function mountParent(el, o) {
    style(); el.classList.add('att');
    if (!o.childId) { el.innerHTML = '<div class="att-empty">Choose a child first.</div>'; return { destroy: function () { } }; }
    el.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + ' Loading attendance…</div>';
    var recs = [], sum = null, refs = [], notes = [], unsubs = [];
    var fail = function (e) { console.warn('attendance', e); };
    unsubs.push(db.collection('attendanceRecords').where('studentId', '==', o.childId).onSnapshot(function (s) { recs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, function (e) { fail(e); el.innerHTML = '<div class="att-empty">Attendance could not be loaded.</div>'; }));
    unsubs.push(db.collection('attendanceStudents').doc(o.childId).onSnapshot(function (s) { sum = s.exists ? s.data() : null; paint(); }, fail));
    unsubs.push(db.collection('attendanceReferrals').where('studentId', '==', o.childId).onSnapshot(function (s) { refs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, fail));
    unsubs.push(db.collection('attendanceNotifications').where('studentId', '==', o.childId).where('audience', '==', 'family').onSnapshot(function (s) { notes = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return msOf(b.createdAt) - msOf(a.createdAt); }); paint(); }, fail));
    var DEL = { pending: ['Email sending', 'wait'], sending: ['Email sending', 'wait'], sent: ['Emailed', 'ok'], failed: ['Email failed (retrying)', 'bad'], skipped: ['In portal only', 'info'] };
    function paint() {
      var warn = notes.filter(function (n) { return n.kind === 'strike4_parent' || n.kind === 'strike4_student'; });
      el.innerHTML = '<h2 style="margin:0 0 .3rem">' + icon('fa-user-check') + ' Attendance' + (o.childName ? ': ' + esc(o.childName) : '') + '</h2><p class="att-muted" style="margin:0 0 1rem">Registrations, late arrivals and absences for every lesson. Times are Kenya time.</p>' +
        historyHtml(recs, sum, { requests: true }) +
        (warn.length ? '<div class="att-panel"><h4>' + icon('fa-triangle-exclamation') + ' Formal warnings</h4>' + warn.map(function (n) { return '<div class="att-muted">' + dayLabel(n.createdAt) + ': ' + esc(n.message) + '</div>'; }).join('') + '</div>' : '') +
        (refs.length ? '<div class="att-panel"><h4>' + icon('fa-scale-balanced') + ' Disciplinary referrals</h4>' + refs.map(function (r) { var last = (r.decisions || []).slice(-1)[0]; return '<div style="margin:.35rem 0"><b>' + esc(r.strikeNumber) + ' strikes</b> <span class="att-muted">' + dayLabel(r.createdAt) + ' · ' + esc(r.academicYearLabel || '') + '</span> <span class="att-pill ' + (r.status === 'closed' ? 'ok' : 'wait') + '">' + esc(String(r.status || 'open').replace('_', ' ')) + '</span>' + (last ? '<div class="att-muted">Studio Desk: ' + esc(last.decision || last.reason) + '</div>' : '') + '</div>'; }).join('') + '</div>' : '') +
        '<div data-face-consent></div>' +
        '<div class="att-panel"><h4>' + icon('fa-bell') + ' Notices and delivery</h4>' + (notes.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Notice</th><th>Delivery</th></tr></thead><tbody>' + notes.map(function (n) {
          var d = DEL[n.emailStatus] || [n.emailStatus, 'wait'];
          return '<tr><td>' + dayLabel(n.createdAt) + ' ' + hm(n.createdAt) + '</td><td><b>' + esc(n.title) + '</b><div class="att-muted">' + esc(n.message) + '</div></td><td><span class="att-pill ' + d[1] + '">' + esc(d[0]) + '</span>' + (n.email ? '<div class="att-muted">' + esc(n.email) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No attendance notices yet.</div>') + '</div>';
    }
    bindExcuse(el);
    loadPolicy().then(function () { paint(); });
    // Face check-in consent (only shown when the Studio Desk offers it, or to withdraw an existing consent).
    var faceCard = document.createElement('div');
    if (typeof AttendanceFace !== 'undefined') AttendanceFace.mountConsent(faceCard, { childId: o.childId, childName: o.childName });
    var _paint = paint;
    paint = function () { _paint(); var slot = el.querySelector('[data-face-consent]'); if (slot) slot.appendChild(faceCard); };
    return { destroy: function () { unsubs.forEach(function (u) { u(); }); } };
  }

  /* =========================================================
     ADMIN — command centre
  ========================================================= */
  function mountAdmin(el, o) {
    style(); el.classList.add('att');
    o = o || {};
    var today = ymd(Date.now());
    var F = { from: today, to: today, subject: '', tutor: '', student: '', status: '', keyStage: '' };
    var D = { sessions: [], records: [], strikes: [], referrals: [], requests: [], locks: [], notes: [], summaries: {} };
    var tab = 'overview', unsubs = [], sub = null;
    try { var savedTab = localStorage.getItem('attAdminTab'); if (savedTab) tab = savedTab; } catch (e) { }
    el.innerHTML = '<div class="att-filters">' +
      '<label>From<input type="date" data-f="from" value="' + today + '"></label><label>To<input type="date" data-f="to" value="' + today + '"></label>' +
      '<label>Subject<select data-f="subject"><option value="">All subjects</option></select></label>' +
      '<label>Class<select data-f="keyStage"><option value="">All classes</option></select></label>' +
      '<label>Tutor<select data-f="tutor"><option value="">All tutors</option></select></label>' +
      '<label>Student<input data-f="student" placeholder="Name"></label>' +
      '<label>Status<select data-f="status"><option value="">Any status</option>' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k][0] + '</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="att-btn" data-load>' + icon('fa-rotate') + ' Load</button></div><div class="att-tabs" data-tabs></div><div data-body></div>';
    var body = el.querySelector('[data-body]');
    function load() {
      unsubs.forEach(function (u) { u(); }); unsubs = [];
      body.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + ' Loading…</div>';
      unsubs.push(db.collection('attendanceSessions').where('date', '>=', F.from).where('date', '<=', F.to).onSnapshot(function (s) { D.sessions = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); options(); paint(); }, err));
      unsubs.push(db.collection('attendanceRecords').where('date', '>=', F.from).where('date', '<=', F.to).onSnapshot(function (s) { D.records = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceReferrals').onSnapshot(function (s) { D.referrals = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceRequests').where('status', '==', 'pending').onSnapshot(function (s) { D.requests = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceLocks').onSnapshot(function (s) { D.locks = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceSessions').where('needsFollowUp', '==', true).onSnapshot(function (s) { D.follow = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceRecords').where('reviewState', '==', 'pending').onSnapshot(function (s) { D.reviews = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceNotifications').where('emailStatus', '==', 'failed').onSnapshot(function (s) { D.failed = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceStudents').onSnapshot(function (s) { D.summaries = {}; s.forEach(function (d) { D.summaries[d.id] = d.data(); }); paint(); }, err));
      var fromTs = firebase.firestore.Timestamp.fromMillis(Date.parse(F.from + 'T00:00:00+03:00')), toTs = firebase.firestore.Timestamp.fromMillis(Date.parse(F.to + 'T23:59:59+03:00'));
      unsubs.push(db.collection('attendanceStrikes').where('startAt', '>=', fromTs).where('startAt', '<=', toTs).onSnapshot(function (s) { D.strikes = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); }, err));
      unsubs.push(db.collection('attendanceAudit').orderBy('at', 'desc').limit(150).onSnapshot(function (s) { D.audit = s.docs.map(function (d) { return d.data(); }); paint(); }, err));
      unsubs.push(db.collection('attendanceSettings').doc('policy').onSnapshot(function (s) { if (s.exists) POLICY = Object.assign({}, POLICY, s.data()); paint(); }, err));
    }
    function err(e) { console.warn('attendance admin', e); }
    function options() {
      var fill = function (sel, vals) { var cur = sel.value; sel.innerHTML = sel.options[0].outerHTML + vals.map(function (v) { return '<option value="' + esc(v[0]) + '"' + (v[0] === cur ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join(''); };
      var subs = {}, tut = {}, ks = {};
      D.sessions.forEach(function (s) { subs[s.subjectId] = s.subjectName; ks[s.keyStage] = (s.keyStage || '').replace(/\s*\(.*/, ''); (s.tutorIds || []).forEach(function (t, i) { tut[t] = String(s.tutorName || '').split(', ')[i] || s.tutorName || t; }); });
      fill(el.querySelector('[data-f="subject"]'), Object.keys(subs).map(function (k) { return [k, subs[k]]; }));
      fill(el.querySelector('[data-f="keyStage"]'), Object.keys(ks).filter(Boolean).map(function (k) { return [k, ks[k]]; }));
      fill(el.querySelector('[data-f="tutor"]'), Object.keys(tut).map(function (k) { return [k, tut[k]]; }));
    }
    function sessOk(s) { return (!F.subject || s.subjectId === F.subject) && (!F.tutor || (s.tutorIds || []).indexOf(F.tutor) !== -1) && (!F.keyStage || s.keyStage === F.keyStage); }
    function recOk(r) {
      var s = sessById[r.sessionId];
      return (!s || sessOk(s)) && (!F.subject || r.subjectId === F.subject) && (!F.status || r.status === F.status) && (!F.keyStage || r.keyStage === F.keyStage) &&
        (!F.student || String(r.studentName || '').toLowerCase().indexOf(F.student.toLowerCase()) !== -1);
    }
    var sessById = {};
    function paint() {
      if (el.contains(document.activeElement) && /TEXTAREA/.test(document.activeElement.tagName)) return;
      sessById = {}; D.sessions.forEach(function (s) { sessById[s.id] = s; });
      var sessions = D.sessions.filter(sessOk), records = D.records.filter(recOk);
      var reviews = (D.reviews || []), follow = (D.follow || []), openRefs = D.referrals.filter(function (r) { return r.status !== 'closed'; });
      var nReview = reviews.length + D.requests.length + follow.length + openRefs.length;
      // Attendance subsections (one Attendance item in the admin navigation).
      var TABS = [['overview', 'Overview', 'fa-gauge'], ['students', 'Student attendance', 'fa-user-check'], ['tutors', 'Tutor attendance', 'fa-chalkboard-user'],
        ['records', 'Records and history', 'fa-clock-rotate-left', reviews.length + D.requests.length + follow.length + (D.failed || []).length], ['strikes', 'Strikes and disciplinary', 'fa-scale-balanced', openRefs.length],
        ['face', 'Facial recognition', 'fa-face-smile'], ['settings', 'Settings', 'fa-sliders']];
      if (!TABS.some(function (x) { return x[0] === tab; })) tab = 'overview';
      el.querySelector('[data-tabs]').innerHTML = TABS.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + icon(t[2]) + ' ' + t[1] + (t[3] ? '<span class="n">' + t[3] + '</span>' : '') + '</button>';
      }).join('');
      el.querySelector('.att-filters').style.display = tab === 'face' || tab === 'settings' ? 'none' : '';
      // Facial recognition and Settings keep their own live screens; mount them once.
      if (tab === 'face' || tab === 'settings') {
        if (body.dataset.mounted === tab) { if (tab === 'settings') settingsPaint(); return; }
        if (sub) { sub.destroy(); sub = null; }
        body.dataset.mounted = tab; body.innerHTML = '<div></div>';
        if (tab === 'face') sub = typeof AttendanceFace !== 'undefined' ? AttendanceFace.mountAdmin(body.firstChild) : (body.innerHTML = '<div class="att-empty">js/attendance/face.js did not load.</div>', null);
        else settingsPaint();
        return;
      }
      if (sub) { sub.destroy(); sub = null; }
      body.dataset.mounted = '';
      body.innerHTML = tab === 'overview' ? overviewHtml(sessions, records) : tab === 'tutors' ? tutorsHtml(sessions) : tab === 'students' ? studentsHtml(records) :
        tab === 'records' ? reviewHtml(reviews, follow, null) + noticesHtml() + auditHtml() : strikesHtml(openRefs);
    }
    /* Overview: today at a glance, then every lesson in the range. */
    function overviewHtml(sessions, records) {
      var t = Date.now(), per = period(t), live = sessions.filter(function (s) { return s.status !== 'cancelled' && msOf(s.startAt) <= t; });
      var verified = live.filter(function (s) { return (s.tutorsPresent || []).length; }).length;
      var awaiting = sessions.filter(function (s) { return s.status === 'open' && msOf(s.endAt) < t; });
      var auto = sessions.filter(function (s) { return s.status === 'auto_submitted'; }).length;
      var near = Object.keys(D.summaries).map(function (id) { var y = (D.summaries[id].years || {})[per.key] || {}; return { id: id, name: D.summaries[id].studentName, n: y.active || 0 }; })
        .filter(function (x) { return x.n >= 3; }).sort(function (a, b) { return b.n - a.n; });
      return dailyHtml(sessions, records) +
        '<div class="att-stats"><div class="att-stat"><b>' + verified + ' / ' + live.length + '</b><span>Tutors confirmed (lessons started)</span></div>' +
        '<div class="att-stat ' + (awaiting.length ? 'warn' : '') + '"><b>' + awaiting.length + '</b><span>Reports awaiting submission</span></div>' +
        '<div class="att-stat ' + (auto ? 'warn' : '') + '"><b>' + auto + '</b><span>Auto-submitted reports</span></div>' +
        '<div class="att-stat ' + (near.length ? 'late' : '') + '"><b>' + near.length + '</b><span>Students at 3+ strikes (' + esc(per.label) + ')</span></div></div>' +
        (near.length ? '<div class="att-panel"><h4>' + icon('fa-triangle-exclamation') + ' Approaching disciplinary thresholds</h4>' + near.map(function (x) {
          return '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.3rem 0"><b>' + esc(x.name) + '</b>' + (x.n >= 5 ? '<span class="att-pill bad">' + x.n + ' strikes: referral</span>' : x.n === 4 ? '<span class="att-pill late">4 strikes: final warning</span>' : '<span class="att-pill wait">3 strikes: next is the final warning</span>') +
            '<button type="button" class="att-btn sm" data-a-student="' + esc(x.id) + '">' + icon('fa-folder-open') + ' Record</button></div>';
        }).join('') + '</div>' : '');
    }
    function presencePill(s) {
      var ids = s.tutorIds || [], pres = s.tutorPresence || {};
      if (!ids.length) return '<span class="att-pill bad">No tutor</span>';
      var any = ids.filter(function (id) { return pres[id]; }).map(function (id) { return pres[id]; });
      if (!any.length) return msOf(s.startAt) > Date.now() || s.status === 'cancelled' ? '' : '<span class="att-pill warn">Not confirmed</span>';
      return any.map(function (p) { return '<span class="att-pill ' + (p.classification === 'late' ? 'late' : 'ok') + '">' + (p.faceVerifiedAt ? icon('fa-face-smile') + ' ' : '') + hm(p.at) + (p.classification === 'late' ? ' (' + p.minutesLate + ' min)' : '') + '</span>'; }).join(' ');
    }
    /* Strikes in the chosen dates, and every disciplinary referral. */
    function strikesHtml(openRefs) {
      var per = period(Date.now()), list = (D.strikes || []).filter(function (k) { return (!F.subject || k.subjectId === F.subject) && (!F.student || String(k.studentName || '').toLowerCase().indexOf(F.student.toLowerCase()) !== -1); })
        .sort(function (a, b) { return msOf(b.startAt) - msOf(a.startAt); });
      var warnings = list.filter(function (k) { return k.number === 4; }).length;
      return '<div class="att-stats"><div class="att-stat late"><b>' + list.filter(function (k) { return k.status === 'active'; }).length + '</b><span>Strikes in these dates</span></div>' +
        '<div class="att-stat"><b>' + list.filter(function (k) { return k.status !== 'active'; }).length + '</b><span>Reversed</span></div>' +
        '<div class="att-stat warn"><b>' + warnings + '</b><span>Final warnings issued</span></div>' +
        '<div class="att-stat warn"><b>' + openRefs.length + '</b><span>Open referrals</span></div></div>' +
        '<p class="att-muted">Strike counts reset: <b>' + esc(({ academic_year: 'every academic year', calendar_year: 'every calendar year', never: 'never', manual: 'only when the Studio Desk resets them' })[POLICY.strikeReset] || 'every academic year') + '</b> (current period: ' + esc(per.label) + '). Strike 4 is a formal final warning to the student and parent; strike 5 and later are referred here. Nothing happens automatically: the Studio Desk decides. Change the reset policy in Settings.</p>' +
        '<div class="att-panel"><h4>' + icon('fa-triangle-exclamation') + ' Strikes</h4>' + (list.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Student</th><th>Lesson</th><th>Arrived</th><th>Strike</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (k) {
          return '<tr><td>' + dayLabel(k.startAt) + '</td><td><b>' + esc(k.studentName) + '</b></td><td>' + esc(k.subjectName) + ' ' + hm(k.startAt) + '</td><td>' + hm(k.checkInAt) + ' (' + k.minutesLate + ' min)</td>' +
            '<td>' + k.number + ' <span class="att-muted">(' + esc(k.academicYearLabel || '') + ')</span>' + (k.number === 4 ? ' <span class="att-pill late">Final warning</span>' : k.number >= 5 ? ' <span class="att-pill bad">Referral</span>' : '') + '</td>' +
            '<td>' + (k.status === 'active' ? '<span class="att-pill late">Active</span>' : '<span class="att-pill wait">Reversed</span><div class="att-muted">' + esc(k.reversal && k.reversal.reason) + '</div>') + '</td>' +
            '<td><div class="att-row-actions"><button type="button" class="att-btn sm" data-a-student="' + esc(k.studentId) + '">' + icon('fa-folder-open') + ' Record</button></div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No strikes in these dates.</div>') + '</div>' +
        referralsHtml(openRefs);
    }
    var AUDIT = { check_in: 'Student registered', tutor_resolve: 'Tutor accounted for a student', tutor_follow_up: 'Tutor follow-up after submission', verify_late_registration: 'Tutor verified a late registration',
      submit: 'Register submitted', auto_submit: 'Register AUTO-SUBMITTED', review_resolution: 'Explanation reviewed', correct_record: 'Record corrected', strike_reversed: 'Strike reversed', referral_created: 'Referral opened',
      referral_decision: 'Referral decision', lock_override: 'Subject lock overridden', session_cancelled: 'Lesson cancelled', explanation_review: 'Tutor explanation reviewed', follow_up_closed: 'Follow-up closed',
      request_made: 'Request made', request_decision: 'Request decided', tutor_explanation: 'Tutor explanation', tutor_present: 'Tutor confirmed teaching', tutor_face_verified: 'Tutor face-verified',
      policy_changed: 'Strike policy changed', strikes_reset: 'Strike counts reset' };
    function auditHtml() {
      var a = (D.audit || []).filter(function (x) { return x.area !== 'recognition'; });
      return '<div class="att-panel"><h4>' + icon('fa-list-ul') + ' Audit trail (latest ' + a.length + ')</h4><p class="att-muted">Append-only. Original registrations, submitted snapshots and earlier decisions are never overwritten; recognition changes are in Facial recognition > Change log.</p>' +
        (a.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Detail</th></tr></thead><tbody>' + a.map(function (x) {
          var det = [x.before && x.before.status ? (STATUS[x.before.status] || [x.before.status])[0] + ' → ' + ((x.after && STATUS[x.after.status]) || [x.after && x.after.status || ''])[0] : '', x.reason ? '"' + x.reason + '"' : '', x.after && x.after.method === 'face' ? 'by face' : ''].filter(Boolean).join(' · ');
          return '<tr><td>' + dayLabel(x.at) + ' ' + hm(x.at) + '</td><td><b>' + esc(AUDIT[x.action] || x.action) + '</b><div class="att-muted">' + esc(x.sessionId || x.studentId || '') + '</div></td><td>' + esc(x.actorName || '') + ' <span class="att-muted">(' + esc(x.actorRole || '') + ')</span></td><td class="att-muted">' + esc(det) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">Nothing recorded yet.</div>') + '</div>';
    }
    /* Settings: the strike reset policy (the rest of the rules are fixed and listed for reference). */
    function settingsPaint() {
      var host = body.firstChild; if (!host || (host.contains(document.activeElement) && /SELECT|INPUT/.test(document.activeElement.tagName))) return;
      var per = period(Date.now()), hist = (POLICY.history || []).slice().reverse().slice(0, 20);
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      host.innerHTML = '<div class="att-grid2"><div class="att-panel"><h4>' + icon('fa-rotate') + ' Strike reset policy</h4><div class="att-set">' +
        '<label class="att-field">When do strike counts start again?<select data-pol="strikeReset">' + [['academic_year', 'Every academic year'], ['calendar_year', 'Every calendar year (January)'], ['never', 'Never (one running count)'], ['manual', 'Only when the Studio Desk resets them']].map(function (o2) { return '<option value="' + o2[0] + '"' + (POLICY.strikeReset === o2[0] ? ' selected' : '') + '>' + o2[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="att-field">The academic year starts in<select data-pol="yearStartMonth">' + MONTHS.map(function (m2, i) { return '<option value="' + (i + 1) + '"' + (Number(POLICY.yearStartMonth || 9) === i + 1 ? ' selected' : '') + '>' + m2 + '</option>'; }).join('') + '</select></label>' +
        '<div class="att-row-actions"><button type="button" class="att-btn primary" data-pol-save>' + icon('fa-floppy-disk') + ' Save policy</button>' + (POLICY.strikeReset === 'manual' ? '<button type="button" class="att-btn danger" data-pol-reset>' + icon('fa-rotate-left') + ' Reset all strike counts now</button>' : '') + '</div>' +
        '<p class="att-muted">Current period: <b>' + esc(per.label) + '</b>. Changing the policy recounts every student\'s active strikes under the new periods. No strike is deleted: the history and audit trail stay complete. Strikes already issued keep their number, and warnings or referrals already sent are not repeated.</p></div></div>' +
        '<div class="att-panel"><h4>' + icon('fa-scale-balanced') + ' Fixed attendance rules</h4><div class="att-kv">' +
        '<span>On time</span><b>Registered less than 15 minutes after the start (server time, Africa/Nairobi)</b><span>Late</span><b>15:00 or more after the start: one strike, at most one per lesson</b>' +
        '<span>Strikes 1 to 3</span><b>Normal monitoring; the parent is told of each late arrival</b><span>Strike 4</span><b>Formal final warning to the student and parent</b><span>Strike 5+</span><b>Referred to the Studio Desk for review; nothing automatic</b>' +
        '<span>No registration</span><b>Flagged as unaccounted after the grace period, never absent until the tutor or the Studio Desk says so</b><span>Auto-submit</span><b>15 minutes after the lesson ends, marked AUTO-SUBMITTED; the tutor must explain</b></div></div></div>' +
        '<div class="att-panel"><h4>' + icon('fa-clock-rotate-left') + ' Policy history</h4>' + (hist.length ? hist.map(function (h) { return '<div class="att-muted">' + dayLabel(h.at) + ' ' + hm(h.at) + ': ' + (h.reset ? 'Strike counts reset' : 'Reset policy set to ' + esc(h.strikeReset) + (h.strikeReset === 'academic_year' ? ' (starts ' + MONTHS[(h.yearStartMonth || 9) - 1] + ')' : '')) + ' · "' + esc(h.reason) + '"</div>'; }).join('') : '<div class="att-empty">Default policy: counts reset every academic year in September.</div>') + '</div>';
    }
    function n(list, f) { return list.filter(f).length; }
    function dailyHtml(sessions, records) {
      var t = Date.now();
      var st = function (s) { return s === 'present' || s === 'present_verified' || s === 'connectivity'; };
      return '<div class="att-stats">' +
        '<div class="att-stat"><b>' + n(sessions, function (s) { return s.status !== 'cancelled'; }) + '</b><span>Scheduled lessons</span></div>' +
        '<div class="att-stat"><b>' + records.length + '</b><span>Enrolled (student lessons)</span></div>' +
        '<div class="att-stat"><b>' + n(records, function (r) { return !!r.checkIn; }) + '</b><span>Checked in</span></div>' +
        '<div class="att-stat"><b>' + n(records, function (r) { return confirmOf(r) === 'confirmed'; }) + '</b><span>Confirmed in class by tutor</span></div>' +
        '<div class="att-stat warn"><b>' + n(records, awaitingConfirm) + '</b><span>Registered, not yet confirmed</span></div>' +
        '<div class="att-stat warn"><b>' + n(records, function (r) { return r.status === 'no_show'; }) + '</b><span>Registered, not in class</span></div>' +
        '<div class="att-stat"><b>' + n(records, function (r) { return st(r.status); }) + '</b><span>Present</span></div>' +
        '<div class="att-stat late"><b>' + n(records, function (r) { return r.status === 'late'; }) + '</b><span>Late</span></div>' +
        '<div class="att-stat warn"><b>' + n(records, function (r) { return r.status === 'absent'; }) + '</b><span>Absent</span></div>' +
        '<div class="att-stat warn"><b>' + n(records, function (r) { return r.status === 'unaccounted' || (r.status === 'expected' && msOf(r.graceAt) <= t); }) + '</b><span>Unresolved</span></div></div>' +
        '<div class="att-panel"><h4>' + icon('fa-calendar-day') + ' Lessons</h4>' + (sessions.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Lesson</th><th>Tutor</th><th>Register</th><th>In / enrolled</th><th>Late</th><th>Unresolved</th><th></th></tr></thead><tbody>' +
          sessions.slice().sort(function (a, b) { return msOf(a.startAt) - msOf(b.startAt); }).map(function (s) {
            var rs = D.records.filter(function (r) { return r.sessionId === s.id; });
            return '<tr class="' + (s.status === 'auto_submitted' || (s.unresolvedCount || 0) ? 'flag' : '') + '"><td>' + dayLabel(s.startAt) + '</td><td><b>' + esc(s.subjectName) + '</b> ' + hm(s.startAt) + '<div class="att-muted">' + esc((s.keyStage || '').replace(/\s*\(.*/, '')) + '</div></td><td>' + esc(s.tutorName) + '<div>' + presencePill(s) + '</div></td><td>' + sessPill(s) + '</td>' +
              '<td>' + n(rs, function (r) { return !!r.checkIn; }) + ' / ' + rs.length + '</td><td>' + n(rs, function (r) { return r.status === 'late'; }) + '</td><td>' + n(rs, function (r) { return r.status === 'unaccounted' || (r.status === 'expected' && msOf(r.graceAt) <= t); }) + '</td>' +
              '<td><div class="att-row-actions"><button type="button" class="att-btn sm" data-a-sess="' + esc(s.id) + '">' + icon('fa-eye') + ' Register</button>' + (s.status !== 'cancelled' ? '<button type="button" class="att-btn sm danger" data-a-cancel="' + esc(s.id) + '">' + icon('fa-ban') + ' Cancel lesson</button>' : '') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="att-empty">No registers in this range. Registers are prepared 20 minutes before each timetabled lesson.</div>') + '</div>';
    }
    function sessPill(s) { return s.status === 'auto_submitted' ? '<span class="att-pill bad">AUTO-SUBMITTED</span>' : s.status === 'submitted' ? '<span class="att-pill ok">Submitted</span>' : s.status === 'cancelled' ? pill('cancelled') : (msOf(s.endAt) < Date.now() ? '<span class="att-pill bad">Outstanding</span>' : '<span class="att-pill info">Open</span>'); }
    function tutorsHtml(sessions) {
      var by = {};
      sessions.forEach(function (s) {
        (s.tutorIds || []).forEach(function (tid, i) {
          var b = by[tid] = by[tid] || { name: String(s.tutorName || '').split(', ')[i] || tid, conducted: 0, manual: 0, auto: 0, outstanding: 0, explain: 0, list: [] };
          if (s.status === 'cancelled') return;
          b.conducted++; b.list.push(s);
          if (s.status === 'submitted') b.manual++;
          else if (s.status === 'auto_submitted') { b.auto++; if (s.explanationRequired !== false && !(s.explanationReview && s.explanationReview.decision === 'accepted')) b.explain++; }
          else if (msOf(s.endAt) < Date.now()) b.outstanding++;
        });
      });
      var ids = Object.keys(by);
      var started = sessions.filter(function (s) { return s.status !== 'cancelled' && msOf(s.startAt) <= Date.now(); }).sort(function (a, b) { return msOf(b.startAt) - msOf(a.startAt); });
      var presence = '<div class="att-panel"><h4>' + icon('fa-user-check') + ' Tutor attendance and verification</h4><p class="att-muted">Tutors confirm they are teaching when the register opens (I\'m teaching, or face verification where enabled). Late is 15 minutes or more after the start.</p>' +
        (started.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Lesson</th><th>Tutor</th><th>Confirmed</th><th>Method</th></tr></thead><tbody>' + started.map(function (s) {
          var pres = s.tutorPresence || {}, any = (s.tutorIds || []).some(function (id) { return pres[id]; });
          return '<tr class="' + (any ? '' : 'flag') + '"><td>' + dayLabel(s.startAt) + '</td><td><b>' + esc(s.subjectName) + '</b> ' + hm(s.startAt) + '</td><td>' + esc(s.tutorName) + '</td><td>' + (presencePill(s) || '—') + '</td>' +
            '<td>' + ((s.tutorIds || []).map(function (id) { var p = pres[id]; return p ? (p.faceVerifiedAt ? '<span class="att-pill info">' + icon('fa-face-smile') + ' Face</span>' : '<span class="att-pill wait">Online</span>') : ''; }).join(' ') || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No lessons have started in these dates.</div>') + '</div>';
      return presence + '<div class="att-panel"><h4>' + icon('fa-chalkboard-user') + ' Tutor compliance</h4>' + (ids.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Tutor</th><th>Lessons conducted</th><th>Submitted manually</th><th>Auto-submitted</th><th>Outstanding</th><th>Explanations required</th></tr></thead><tbody>' +
        ids.map(function (id) { var b = by[id]; return '<tr class="' + (b.auto || b.outstanding ? 'flag' : '') + '"><td><b>' + esc(b.name) + '</b></td><td>' + b.conducted + '</td><td>' + b.manual + '</td><td>' + b.auto + '</td><td>' + b.outstanding + '</td><td>' + b.explain + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="att-empty">No registers in this range.</div>') + '</div>' +
        '<div class="att-panel"><h4>' + icon('fa-lock') + ' Subject locks now</h4>' + (D.locks.length ? D.locks.map(function (l) { return '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.3rem 0"><b>' + esc(l.subjectName) + '</b><span class="att-muted">' + esc(l.tutorName || l.tutorId) + ' · since ' + hm(l.since) + '</span><button type="button" class="att-btn sm" data-a-lock="' + esc(l.id) + '">' + icon('fa-lock-open') + ' Override</button></div>'; }).join('') : '<div class="att-empty">No tutor is locked out of a subject.</div>') + '</div>' +
        '<div class="att-panel"><h4>' + icon('fa-clock-rotate-left') + ' Submission history</h4>' + (sessions.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Lesson</th><th>Tutor</th><th>Method</th><th>When</th><th>By</th></tr></thead><tbody>' +
          sessions.filter(function (s) { return s.submission; }).sort(function (a, b) { return msOf(b.startAt) - msOf(a.startAt); }).map(function (s) { return '<tr><td>' + dayLabel(s.startAt) + '</td><td>' + esc(s.subjectName) + ' ' + hm(s.startAt) + '</td><td>' + esc(s.tutorName) + '</td><td>' + sessPill(s) + '</td><td>' + hm(s.submission.at) + '</td><td>' + esc(s.submission.byName || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="att-empty">None yet.</div>') + '</div>';
    }
    function studentsHtml(records) {
      var by = {};
      records.forEach(function (r) {
        var b = by[r.studentId] = by[r.studentId] || { name: r.studentName, total: 0, att: 0, late: 0, absent: 0, unresolved: 0 };
        if (['expected', 'cancelled', 'excused'].indexOf(r.status) === -1) b.total++;
        if (ATTENDED.indexOf(r.status) !== -1) b.att++;
        if (r.status === 'late') b.late++;
        if (r.status === 'absent') b.absent++;
        if (r.status === 'unaccounted') b.unresolved++;
      });
      var per = period(Date.now()), ay = per.key;
      Object.keys(D.summaries).forEach(function (id) { if (!by[id] && (!F.student || String(D.summaries[id].studentName || '').toLowerCase().indexOf(F.student.toLowerCase()) !== -1)) by[id] = { name: D.summaries[id].studentName, total: 0, att: 0, late: 0, absent: 0, unresolved: 0 }; });
      var ids = Object.keys(by).sort(function (a, b) { var ya = ((D.summaries[a] || {}).years || {})[ay] || {}, yb = ((D.summaries[b] || {}).years || {})[ay] || {}; return (yb.active || 0) - (ya.active || 0) || String(by[a].name).localeCompare(String(by[b].name)); });
      return '<div class="att-panel"><h4>' + icon('fa-user-clock') + ' Student punctuality <span class="att-muted">(active strikes are for ' + esc(per.label) + '; the rest for the dates chosen)</span></h4>' + (ids.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Student</th><th>Attendance</th><th>Late</th><th>Absent</th><th>Unresolved</th><th>Active strikes</th><th>Warning / referral</th><th></th></tr></thead><tbody>' +
        ids.map(function (id) {
          var b = by[id], y = ((D.summaries[id] || {}).years || {})[ay] || {};
          return '<tr class="' + ((y.active || 0) >= 4 ? 'flag' : '') + '"><td><b>' + esc(b.name) + '</b></td><td>' + (b.total ? Math.round(b.att * 100 / b.total) + '%' : '—') + '</td><td>' + b.late + '</td><td>' + b.absent + '</td><td>' + b.unresolved + '</td><td><b>' + (y.active || 0) + '</b>' + (y.reversed ? ' <span class="att-muted">(' + y.reversed + ' reversed)</span>' : '') + '</td>' +
            '<td>' + ((y.active || 0) >= 5 ? '<span class="att-pill bad">Referral</span>' : (y.active || 0) === 4 ? '<span class="att-pill late">Final warning</span>' : '—') + '</td><td><button type="button" class="att-btn sm" data-a-student="' + esc(id) + '">' + icon('fa-folder-open') + ' Record</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="att-empty">No students in this range.</div>') + '</div>';
    }
    function reviewHtml(reviews, follow, refs) {
      return '<div class="att-panel"><h4>' + icon('fa-comment-dots') + ' Tutor explanations to review (' + reviews.length + ')</h4>' + (reviews.length ? reviews.map(function (r) {
        return '<div style="border-bottom:1px solid #eef3f2;padding:.5rem 0"><b>' + esc(r.studentName) + '</b> · ' + esc(r.subjectName) + ' ' + dayLabel(r.startAt) + ' ' + hm(r.startAt) + ' ' + pill(r.status) +
          '<div class="att-muted">' + esc((r.resolution && (r.resolution.label + (r.resolution.note ? ': ' + r.resolution.note : ''))) || '') + ' · ' + esc((r.resolution && r.resolution.byName) || '') + '</div>' +
          '<div class="att-row-actions" style="margin-top:.35rem"><button type="button" class="att-btn sm primary" data-a-rev="' + esc(r.id) + '" data-d="approve">' + icon('fa-check') + ' Approve</button><button type="button" class="att-btn sm danger" data-a-rev="' + esc(r.id) + '" data-d="reject">' + icon('fa-xmark') + ' Reject</button></div></div>';
      }).join('') : '<div class="att-empty">Nothing to review.</div>') + '</div>' +
        '<div class="att-panel"><h4>' + icon('fa-envelope-open-text') + ' Correction and excused-lateness requests (' + D.requests.length + ')</h4>' + (D.requests.length ? D.requests.map(function (q) {
          return '<div style="border-bottom:1px solid #eef3f2;padding:.5rem 0"><b>' + esc(q.studentName) + '</b> · ' + esc(q.subjectName) + ' ' + esc(q.date) + ' <span class="att-pill info">' + (q.kind === 'excuse_lateness' ? 'Excuse lateness' : 'Correction' + (q.proposedStatus ? ' to ' + esc((STATUS[q.proposedStatus] || [q.proposedStatus])[0]) : '')) + '</span>' +
            '<div class="att-muted">"' + esc(q.reason) + '" · ' + esc(q.requestedByName) + ' (' + esc(q.requestedByRole) + ')</div><div class="att-row-actions" style="margin-top:.35rem"><button type="button" class="att-btn sm primary" data-a-req="' + esc(q.id) + '" data-d="approve">' + icon('fa-check') + ' Approve</button><button type="button" class="att-btn sm danger" data-a-req="' + esc(q.id) + '" data-d="reject">' + icon('fa-xmark') + ' Reject</button></div></div>';
        }).join('') : '<div class="att-empty">No requests waiting.</div>') + '</div>' +
        '<div class="att-panel"><h4>' + icon('fa-clipboard-list') + ' Auto-submitted and unresolved registers (' + follow.length + ')</h4>' + (follow.length ? follow.sort(function (a, b) { return msOf(b.startAt) - msOf(a.startAt); }).map(function (s) {
          return '<div style="border-bottom:1px solid #eef3f2;padding:.5rem 0">' + sessPill(s) + ' <b>' + esc(s.subjectName) + '</b> ' + dayLabel(s.startAt) + ' ' + hm(s.startAt) + ' · ' + esc(s.tutorName) + (s.unresolvedCount ? ' · <b>' + s.unresolvedCount + ' unresolved</b>' : '') +
            '<div class="att-muted">' + (s.tutorExplanation ? 'Tutor: "' + esc(s.tutorExplanation.text) + '"' : 'No tutor explanation yet.') + (s.explanationReview ? ' · Reviewed: ' + esc(s.explanationReview.decision) : '') + '</div>' +
            '<div class="att-row-actions" style="margin-top:.35rem"><button type="button" class="att-btn sm" data-a-sess="' + esc(s.id) + '">' + icon('fa-eye') + ' Inspect</button>' +
            (s.tutorExplanation ? '<button type="button" class="att-btn sm primary" data-a-exp="' + esc(s.id) + '" data-d="accept">' + icon('fa-check') + ' Accept explanation</button><button type="button" class="att-btn sm danger" data-a-exp="' + esc(s.id) + '" data-d="reject">Reject explanation</button>' : '') +
            '<button type="button" class="att-btn sm" data-a-close="' + esc(s.id) + '">' + icon('fa-flag-checkered') + ' Close follow-up</button></div></div>';
        }).join('') : '<div class="att-empty">Every register is accounted for.</div>') + '</div>' +
        (refs ? referralsHtml(refs) : '');
    }
    function referralsHtml(refs) {
      return '<div class="att-panel"><h4>' + icon('fa-scale-balanced') + ' Disciplinary referrals (' + refs.length + ' open)</h4>' + (D.referrals.length ? D.referrals.slice().sort(function (a, b) { return msOf(b.createdAt) - msOf(a.createdAt); }).map(function (r) {
          return '<div style="border-bottom:1px solid #eef3f2;padding:.5rem 0"><b>' + esc(r.studentName) + '</b> · ' + r.strikeNumber + ' strikes (' + esc(r.academicYearLabel || '') + ') · ' + dayLabel(r.createdAt) + ' <span class="att-pill ' + (r.status === 'closed' ? 'ok' : 'bad') + '">' + esc(String(r.status).replace('_', ' ')) + '</span>' +
            ((r.decisions || []).map(function (d) { return '<div class="att-muted">' + dayLabel(d.at) + ': ' + esc(d.decision || '') + ' (' + esc(d.reason) + ')</div>'; }).join('')) +
            '<div class="att-row-actions" style="margin-top:.35rem"><button type="button" class="att-btn sm primary" data-a-ref="' + esc(r.id) + '">' + icon('fa-gavel') + ' Record decision</button><button type="button" class="att-btn sm" data-a-student="' + esc(r.studentId) + '">Student record</button></div></div>';
        }).join('') : '<div class="att-empty">No referrals.</div>') + '</div>';
    }
    function noticesHtml() {
      var f = D.failed || [];
      return '<div class="att-panel"><h4>' + icon('fa-envelope') + ' Emails that failed (' + f.length + ')</h4><p class="att-muted">Failed emails are retried automatically, up to 5 times. Every notice also stays in the parent portal.</p>' + (f.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>When</th><th>To</th><th>Notice</th><th>Attempts</th><th>Error</th></tr></thead><tbody>' + f.map(function (x) {
        return '<tr><td>' + dayLabel(x.createdAt) + ' ' + hm(x.createdAt) + '</td><td>' + esc(x.recipientName) + '<div class="att-muted">' + esc(x.email) + '</div></td><td>' + esc(x.title) + '</td><td>' + (x.attempts || 0) + '</td><td class="att-muted">' + esc(x.lastError) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="att-empty">No failed emails.</div>') + '</div>';
    }
    function sessionModal(sid) {
      var s = sessById[sid] || (D.follow || []).filter(function (x) { return x.id === sid; })[0];
      var m = modal({ title: s ? 'Register: ' + s.subjectName : 'Register', sub: s ? dayLabel(s.startAt) + ' ' + hm(s.startAt) + ' to ' + hm(s.endAt) + ' · ' + s.tutorName : '', wide: true, closeLabel: 'Close' });
      m.body.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + '</div>';
      Promise.all([
        db.collection('attendanceRecords').where('sessionId', '==', sid).get(),
        db.collection('attendanceSubmissions').doc(sid).get(),
        db.collection('attendanceAmendments').where('sessionId', '==', sid).get()
      ]).then(function (res) {
        var recs = res[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return String(a.studentName).localeCompare(String(b.studentName)); });
        var sub = res[1].exists ? res[1].data() : null, am = res[2].docs.map(function (d) { return d.data(); });
        m.body.innerHTML = (sub ? '<div class="att-banner' + (sub.method === 'auto' ? ' lock' : '') + '"><div class="ic">' + icon('fa-clipboard-check') + '</div><div class="t"><b>' + (sub.method === 'auto' ? 'AUTO-SUBMITTED' : 'Submitted by ' + esc(sub.submittedByName)) + ' at ' + hm(sub.submittedAt) + '</b><small>' + (sub.manualSubmission ? 'Manual submission.' : 'No manual submission was made. Snapshot kept as submitted: ' + sub.rows.length + ' students, ' + (sub.unresolvedCount || 0) + ' unresolved.') + '</small></div></div>' : '') +
          '<div class="att-wrap"><table class="att-table"><thead><tr><th>Student</th><th>Status now</th><th>As submitted</th><th>Student check-in</th><th>Tutor confirmed</th><th>Tutor record</th><th>Corrections</th><th></th></tr></thead><tbody>' + recs.map(function (r) {
            var snap = sub && sub.rows.filter(function (x) { return x.studentId === r.studentId; })[0];
            return '<tr><td><b>' + esc(r.studentName) + '</b></td><td>' + pill(r.status) + (r.strikeId ? ' <span class="att-pill ' + (r.strikeReversed ? 'wait' : 'late') + '">' + (r.strikeReversed ? 'Strike reversed' : 'Strike') + '</span>' : '') + '</td><td>' + (snap ? pill(snap.status) : '—') + '</td>' +
              '<td>' + (r.checkIn ? hm(r.checkIn.at) + ' (' + (r.checkIn.classification === 'late' ? r.checkIn.minutesLate + ' min late' : 'on time') + ')' : '—') + '</td>' +
              '<td>' + confirmCell(r) + '</td>' +
              '<td class="att-muted">' + (r.resolution ? esc(r.resolution.label) + (r.resolution.note ? ': ' + esc(r.resolution.note) : '') + ' · ' + esc(r.resolution.byName) + ' ' + hm(r.resolution.at) + (r.resolution.afterSubmission ? ' (after submission)' : '') : '') + '</td>' +
              '<td class="att-muted">' + (r.corrections || []).map(function (c) { return esc((STATUS[c.from] || [c.from])[0]) + ' → ' + esc((STATUS[c.to] || [c.to])[0]) + ': ' + esc(c.reason); }).join('<br>') + '</td>' +
              '<td><button type="button" class="att-btn sm" data-a-correct="' + esc(r.id) + '">' + icon('fa-pen') + ' Correct</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          (am.length ? '<div class="att-panel" style="margin-top:1rem"><h4>' + icon('fa-clock-rotate-left') + ' Amendments after submission</h4>' + am.map(function (a) { return '<div class="att-muted">' + dayLabel(a.at) + ' ' + hm(a.at) + ' · ' + esc(a.studentName) + ': ' + esc((STATUS[a.before.status] || [a.before.status])[0]) + ' → ' + esc((STATUS[a.after.status] || [a.after.status])[0]) + ' by ' + esc(a.byName) + (a.reason || (a.after && a.after.note) ? ' ("' + esc(a.reason || a.after.note) + '")' : '') + '</div>'; }).join('') + '</div>' : '');
      }).catch(function (e) { m.body.innerHTML = '<div class="att-empty">' + esc(errMsg(e)) + '</div>'; });
    }
    function studentModal(uid) {
      var m = modal({ title: 'Attendance record', wide: true, closeLabel: 'Close' });
      m.body.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + '</div>';
      Promise.all([db.collection('attendanceRecords').where('studentId', '==', uid).get(), db.collection('attendanceStrikes').where('studentId', '==', uid).get(), db.collection('attendanceStudents').doc(uid).get()]).then(function (res) {
        var recs = res[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        var strikes = res[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return msOf(b.createdAt) - msOf(a.createdAt); });
        m.el.querySelector('h3').textContent = 'Attendance record: ' + ((recs[0] && recs[0].studentName) || (res[2].exists && res[2].data().studentName) || '');
        m.body.innerHTML = historyHtml(recs, res[2].exists ? res[2].data() : null) +
          '<div class="att-panel"><h4>' + icon('fa-triangle-exclamation') + ' Strikes (all years)</h4>' + (strikes.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>Date</th><th>Lesson</th><th>Minutes late</th><th>Number</th><th>Status</th><th></th></tr></thead><tbody>' + strikes.map(function (k) {
            return '<tr><td>' + dayLabel(k.startAt) + '</td><td>' + esc(k.subjectName) + '</td><td>' + k.minutesLate + '</td><td>' + k.number + ' (' + esc(k.academicYearLabel) + ')</td><td>' + (k.status === 'active' ? '<span class="att-pill late">Active</span>' : '<span class="att-pill wait">Reversed</span><div class="att-muted">' + esc(k.reversal && k.reversal.reason) + '</div>') + '</td><td>' + (k.status === 'active' ? '<button type="button" class="att-btn sm" data-a-strike="' + esc(k.id) + '">' + icon('fa-rotate-left') + ' Reverse</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="att-empty">No strikes.</div>') + '</div>';
      }).catch(function (e) { m.body.innerHTML = '<div class="att-empty">' + esc(errMsg(e)) + '</div>'; });
    }
    function adminCall(data, okMsg) {
      return call('attendanceAdmin', data).then(function () { if (okMsg) toast(okMsg); }).catch(function (e) { alert(errMsg(e)); });
    }
    var statusSelect = '<label class="att-field">New status<select data-extra="status">' + ['present', 'late', 'present_verified', 'connectivity', 'absent', 'no_show', 'excused', 'other', 'unaccounted'].map(function (k) { return '<option value="' + k + '">' + STATUS[k][0] + '</option>'; }).join('') + '</select></label>';
    el.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return;
      var b;
      if ((b = t.closest('[data-tab]'))) { tab = b.dataset.tab; try { localStorage.setItem('attAdminTab', tab); } catch (e2) { } paint(); return; }
      if ((b = t.closest('[data-pol-save]'))) {
        var mode = el.querySelector('[data-pol="strikeReset"]').value, month = Number(el.querySelector('[data-pol="yearStartMonth"]').value);
        askReason('Change the strike reset policy', 'Why? Active strike counts are recounted under the new policy; no strike is deleted.').then(function (r) { if (r) adminCall({ action: 'setPolicy', strikeReset: mode, yearStartMonth: month, reason: r.reason }, 'Policy saved and counts recounted').then(function () { loadPolicy(true); }); });
        return;
      }
      if ((b = t.closest('[data-pol-reset]'))) {
        askReason('Reset every student\'s strike count', 'Why now? Counts start again from zero; the strike history stays.').then(function (r) { if (r) adminCall({ action: 'resetStrikes', reason: r.reason }, 'Strike counts reset'); });
        return;
      }
      if ((b = t.closest('[data-load]'))) { el.querySelectorAll('[data-f]').forEach(function (x) { F[x.dataset.f] = x.value; }); load(); return; }
      if ((b = t.closest('[data-a-sess]'))) { sessionModal(b.dataset.aSess); return; }
      if ((b = t.closest('[data-a-student]'))) { studentModal(b.dataset.aStudent); return; }
      if ((b = t.closest('[data-a-cancel]'))) { var cid = b.dataset.aCancel; askReason('Cancel this lesson?', 'Why was it cancelled? Strikes from this lesson are reversed and the register closes.').then(function (r) { if (r) adminCall({ action: 'cancelSession', sessionId: cid, reason: r.reason }, 'Lesson cancelled'); }); return; }
      if ((b = t.closest('[data-a-lock]'))) { var lid = b.dataset.aLock; askReason('Override the subject lock', 'Why may this tutor continue before the register is in?').then(function (r) { if (r) adminCall({ action: 'overrideLock', lockId: lid, reason: r.reason }, 'Lock lifted'); }); return; }
      if ((b = t.closest('[data-a-rev]'))) { var rid = b.dataset.aRev, d = b.dataset.d; askReason(d === 'approve' ? 'Approve this explanation' : 'Reject this explanation', 'Reason for your decision', d === 'reject' ? statusSelect.replace('New status', 'Record the student as') : '').then(function (r) { if (r) adminCall({ action: 'reviewResolution', recordId: rid, decision: d, reason: r.reason, finalStatus: r.extra.status }, 'Decision recorded'); }); return; }
      if ((b = t.closest('[data-a-req]'))) { var qid = b.dataset.aReq, d2 = b.dataset.d; askReason(d2 === 'approve' ? 'Approve the request' : 'Reject the request', 'Reason for your decision').then(function (r) { if (r) adminCall({ action: 'decideRequest', requestId: qid, decision: d2, reason: r.reason }, 'Decision recorded'); }); return; }
      if ((b = t.closest('[data-a-exp]'))) { var sid = b.dataset.aExp, d3 = b.dataset.d; askReason(d3 === 'accept' ? 'Accept the tutor\'s explanation' : 'Reject the tutor\'s explanation', 'Reason for your decision').then(function (r) { if (r) adminCall({ action: 'reviewExplanation', sessionId: sid, decision: d3, reason: r.reason }, 'Decision recorded'); }); return; }
      if ((b = t.closest('[data-a-close]'))) { var sid2 = b.dataset.aClose; askReason('Close the follow-up', 'What was done? Unresolved students stay unresolved unless you correct them.').then(function (r) { if (r) adminCall({ action: 'closeFollowUp', sessionId: sid2, reason: r.reason }, 'Follow-up closed'); }); return; }
      if ((b = t.closest('[data-a-ref]'))) {
        var fid = b.dataset.aRef;
        askReason('Disciplinary referral decision', 'Reason (recorded with the decision)', '<label class="att-field">Status<select data-extra="status"><option value="under_review">Under review</option><option value="action_taken">Action taken</option><option value="closed">Closed</option></select></label><label class="att-field">Decision<input data-extra="decision" maxlength="500" placeholder="e.g. Meeting with parents on Friday"></label>')
          .then(function (r) { if (r) adminCall({ action: 'decideReferral', referralId: fid, status: r.extra.status, decision: r.extra.decision, reason: r.reason }, 'Decision recorded'); });
        return;
      }
    });
    document.addEventListener('click', onDocClick);
    function onDocClick(e) {
      var t = e.target; if (!t.closest) return;
      var b;
      if ((b = t.closest('.att-ov [data-a-correct]'))) { var rid = b.dataset.aCorrect; askReason('Correct this record', 'Reason for the correction (the original stays in the history)', statusSelect).then(function (r) { if (r) adminCall({ action: 'correctRecord', recordId: rid, status: r.extra.status, reason: r.reason }, 'Record corrected').then(function () { var ov = b.closest('.att-ov'); if (ov) ov.remove(); }); }); return; }
      if ((b = t.closest('.att-ov [data-a-strike]'))) { var kid = b.dataset.aStrike; askReason('Reverse this strike', 'Why is this strike reversed? The strike stays in the history as reversed.').then(function (r) { if (r) adminCall({ action: 'reverseStrike', strikeId: kid, reason: r.reason }, 'Strike reversed').then(function () { var ov = b.closest('.att-ov'); if (ov) ov.remove(); }); }); return; }
      if ((b = t.closest('.att-ov [data-a-student]'))) { studentModal(b.dataset.aStudent); }
    }
    load();
    return { destroy: function () { if (sub) sub.destroy(); unsubs.forEach(function (u) { u(); }); document.removeEventListener('click', onDocClick); } };
  }

  return {
    mountStudent: mountStudent, mountStudentHistory: mountStudentHistory, mountTutor: mountTutor, mountParent: mountParent, mountAdmin: mountAdmin, STATUS: STATUS,
    // Shared with js/attendance/face.js
    _ui: { esc: esc, hm: hm, dayLabel: dayLabel, icon: icon, call: call, errMsg: errMsg, modal: modal, askReason: askReason, msOf: msOf, toast: toast, style: style }
  };
})();
