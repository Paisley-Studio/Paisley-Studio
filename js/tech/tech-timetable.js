/* =========================================================
   Paisley Tech Studio: timetable  (window.TechTimetable)
   ---------------------------------------------------------
   Replaces the old one-off live classes. Like the school timetable:
   a week of sessions, each with a time, a coach, the class link and
   the level it is for.

     techTimetable/{id} { dayOfWeek: 'Monday'…'Sunday', startTime: '16:00', endTime: '17:00',
                          level: 'all' | 'beginner' | 'intermediate' | 'expert',
                          coachId, coachName, link, createdAt, updatedAt }

   Only the Studio Desk (admin) adds and edits sessions (firestore.rules).
   A builder sees the sessions for 'all' and for their own level
   (TechUI.trackOf); a guardian sees their child's; a coach sees the week.

     TechTimetable.mountManager(host, { coaches })            admin
     TechTimetable.mountView(host, { level, coachId, who })    builder / guardian / coach
     TechTimetable.todayHtml(entries, level)                   a "Today" strip for a home page
     TechTimetable.listen(cb) -> unsubscribe                   every session, sorted
     TechTimetable.forLevel(entries, level)

   Needs TechUI and the global db.
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var COL = function () { return db.collection('techTimetable'); };
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var LEVELS = [['all', 'All levels'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']];
  var LEVEL_LABEL = { all: 'All levels', beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

  function levelOf(e) { return LEVEL_LABEL[e && e.level] ? e.level : 'all'; }
  function dayIdx(d) { var i = DAYS.indexOf(d); return i === -1 ? 9 : i; }
  function sortEntries(list) {
    return list.slice().sort(function (a, b) { return dayIdx(a.dayOfWeek) - dayIdx(b.dayOfWeek) || String(a.startTime || '').localeCompare(String(b.startTime || '')); });
  }
  /* A builder at `level` sees sessions for everyone and for their own level. */
  function forLevel(list, level) {
    if (!level) return list;
    var t = T.trackOf(level);
    return list.filter(function (e) { var l = levelOf(e); return l === 'all' || l === t; });
  }
  function joinUrl(u) {
    u = String(u || '').trim(); if (!u) return '';
    if (!/^[a-z]+:\/\//i.test(u) && /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) u = 'https://' + u;
    return T.safeUrl(u);
  }
  function todayName() { return DAYS[(new Date().getDay() + 6) % 7]; }
  function mins(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  /* 'live' while it runs today, 'soon' in the half hour before, 'today' later today. */
  function stateOf(e) {
    if (e.dayOfWeek !== todayName()) return '';
    var d = new Date(), now = d.getHours() * 60 + d.getMinutes(), s = mins(e.startTime), en = mins(e.endTime);
    if (s == null) return 'today';
    if (en == null) en = s + 60;
    if (now >= s && now < en) return 'live';
    if (now < s && s - now <= 30) return 'soon';
    if (now < s) return 'today';
    return 'done';
  }
  function timeText(e) { return esc(e.startTime || '') + (e.endTime ? '–' + esc(e.endTime) : ''); }
  function levelPill(e) { var l = levelOf(e); return '<span class="tt-pill tt-' + l + '">' + esc(LEVEL_LABEL[l]) + '</span>'; }
  function joinBtn(e, big) {
    var u = joinUrl(e.link), st = stateOf(e);
    if (!u) return '<span class="tt-muted">Link coming soon</span>';
    return '<a class="tt-join' + (st === 'live' ? ' on' : '') + (big ? ' big' : '') + '" href="' + esc(u) + '" target="_blank" rel="noopener"><i class="fas fa-video" aria-hidden="true"></i> ' + (st === 'live' ? 'Join now' : 'Join') + '</a>';
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true; T.injectStyle();
    var s = document.createElement('style');
    s.textContent = [
      '.tt-wrap{display:grid;gap:.9rem}',
      '.tt-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between}',
      '.tt-bar h3{margin:0;color:var(--brand-deep,#245F5A);font-size:1.05rem}.tt-sub{color:var(--muted,#5A6E6A);font-size:.82rem;margin-top:.15rem}',
      '.tt-chips{display:flex;flex-wrap:wrap;gap:.35rem}',
      '.tt-chip{border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);border-radius:99px;padding:.3rem .75rem;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}',
      '.tt-chip.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.tt-day{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:14px;padding:.85rem 1rem}',
      '.tt-day.today{border-color:var(--brand,#55BFB3);box-shadow:0 0 0 2px rgba(85,191,179,.18)}',
      '.tt-dayhead{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.55rem}',
      '.tt-dayhead b{color:var(--brand-deep,#245F5A)}.tt-dayhead .tt-tag{font-size:.68rem;font-weight:800;color:#fff;background:var(--brand,#55BFB3);border-radius:99px;padding:.1rem .5rem;margin-left:.4rem}',
      '.tt-table{width:100%;border-collapse:collapse;font-size:.85rem}',
      '.tt-table th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#5A6E6A);padding:.35rem .5rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.tt-table td{padding:.5rem;border-bottom:1px solid var(--line,rgba(38,51,49,.07));vertical-align:middle}',
      '.tt-table tr:last-child td{border-bottom:0}.tt-table tr.live td{background:#EAF7F4}',
      '.tt-time{font-weight:800;white-space:nowrap}',
      '.tt-pill{display:inline-block;border-radius:99px;padding:.12rem .55rem;font-size:.7rem;font-weight:800;background:#EEF2F1;color:#3D4A48;white-space:nowrap}',
      '.tt-beginner{background:#E7F6EC;color:#1d6b3c}.tt-intermediate{background:#E8F0FB;color:#1f4f8f}.tt-expert{background:#F3E9FB;color:#5b2d86}',
      '.tt-join{display:inline-flex;align-items:center;gap:.35rem;border-radius:9px;padding:.35rem .7rem;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-weight:800;font-size:.76rem;text-decoration:none;white-space:nowrap}',
      '.tt-join.on{background:#1d8b57;color:#fff;animation:ttPulse 1.6s infinite}.tt-join.big{padding:.5rem .95rem;font-size:.85rem}',
      '@keyframes ttPulse{0%,100%{box-shadow:0 0 0 0 rgba(29,139,87,.45)}50%{box-shadow:0 0 0 6px rgba(29,139,87,0)}}',
      '.tt-muted{color:var(--muted,#5A6E6A);font-size:.78rem}',
      '.tt-btn{display:inline-flex;align-items:center;gap:.35rem;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);border-radius:9px;padding:.4rem .75rem;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}',
      '.tt-btn.primary{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.tt-btn.sm{padding:.25rem .55rem;font-size:.72rem}.tt-btn.danger{color:#b8362a}',
      '.tt-acts{display:flex;gap:.3rem;justify-content:flex-end}',
      '.tt-empty{color:var(--muted,#5A6E6A);font-size:.82rem}',
      '.tt-form{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.tt-form .full{grid-column:1 / -1}',
      '.tt-form label{display:grid;gap:.3rem;font-size:.76rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tt-form input,.tt-form select{border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:10px;padding:.55rem .65rem;font:inherit;font-size:.86rem;background:#fff;color:var(--ink,#263331)}',
      '.tt-form .hint{font-weight:600;color:var(--muted,#5A6E6A);font-size:.72rem}',
      '.tt-foot{display:flex;justify-content:flex-end;gap:.45rem;margin-top:1rem;flex-wrap:wrap}.tt-err{color:#b8362a;font-size:.8rem;font-weight:700;min-height:1rem;margin-top:.5rem}',
      '.tt-today{display:grid;gap:.5rem}',
      '.tt-card{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:14px;padding:.75rem .95rem}',
      '.tt-card.live{border-color:#1d8b57;background:#F1FBF6}.tt-card .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);flex:none}',
      '.tt-card .t{flex:1;min-width:160px}.tt-card .t b{display:block;color:var(--ink,#263331)}.tt-card .t span{font-size:.8rem;color:var(--muted,#5A6E6A)}',
      '@media(max-width:620px){.tt-form{grid-template-columns:1fr}.tt-table thead{display:none}.tt-table tr{display:grid;grid-template-columns:1fr auto;gap:.2rem .5rem;padding:.5rem 0;border-bottom:1px solid var(--line,rgba(38,51,49,.07))}.tt-table td{border:0;padding:.1rem .2rem}.tt-table td.tt-acts,.tt-table td.jn{grid-column:2;grid-row:1 / span 3;align-self:center}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function listen(cb) {
    return COL().onSnapshot(function (s) {
      cb(sortEntries(s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })), null);
    }, function (e) { cb([], e); });
  }

  /* The week, day by day, like the school timetable. */
  function weekHtml(list, o) {
    var manage = !!o.manage, today = todayName();
    var days = manage ? DAYS : DAYS.filter(function (d) { return list.some(function (e) { return e.dayOfWeek === d; }); });
    if (!days.length) return '<div class="tt-day"><div class="tt-empty">' + esc(o.empty || 'No sessions on the timetable yet.') + '</div></div>';
    return days.map(function (day) {
      var rows = list.filter(function (e) { return e.dayOfWeek === day; });
      return '<section class="tt-day' + (day === today ? ' today' : '') + '"><div class="tt-dayhead"><b>' + esc(day) + (day === today ? '<span class="tt-tag">Today</span>' : '') + '</b>' +
        (manage ? '<button type="button" class="tt-btn sm" data-tt="add" data-day="' + esc(day) + '"><i class="fas fa-plus"></i> Add session</button>' : '') + '</div>' +
        (rows.length ? '<table class="tt-table"><thead><tr><th>Time</th><th>Level</th><th>Coach</th><th>Class link</th>' + (manage ? '<th></th>' : '') + '</tr></thead><tbody>' +
          rows.map(function (e) {
            var mine = o.coachId && e.coachId === o.coachId;
            return '<tr class="' + (stateOf(e) === 'live' ? 'live' : '') + '"><td class="tt-time">' + timeText(e) + '</td><td>' + levelPill(e) + '</td>' +
              '<td>' + (e.coachName ? esc(e.coachName) + (mine ? ' <span class="tt-pill">You</span>' : '') : '<span class="tt-muted">Not set</span>') + '</td>' +
              '<td class="jn">' + joinBtn(e) + '</td>' +
              (manage ? '<td class="tt-acts"><button type="button" class="tt-btn sm" data-tt="edit" data-id="' + esc(e.id) + '" title="Edit" aria-label="Edit session"><i class="fas fa-pen"></i></button><button type="button" class="tt-btn sm danger" data-tt="del" data-id="' + esc(e.id) + '" title="Delete" aria-label="Delete session"><i class="fas fa-trash"></i></button></td>' : '') + '</tr>';
          }).join('') + '</tbody></table>' : '<div class="tt-empty">No sessions.</div>') + '</section>';
    }).join('');
  }

  function modal(title, bodyHtml, footHtml) {
    var m = document.createElement('div');
    m.className = 'tk-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div><h3>' + esc(title) + '</h3>' + bodyHtml + '<div class="tt-err" role="alert"></div><div class="tt-foot">' + footHtml + '</div></div>';
    document.body.appendChild(m);
    function close() { m.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    m.addEventListener('mousedown', function (e) { if (e.target === m) close(); });
    return { el: m, close: close, err: function (t) { m.querySelector('.tt-err').textContent = t || ''; } };
  }

  /* ---------- admin ---------- */
  function mountManager(host, o) {
    style(); o = o || {};
    var list = [], lf = 'all', dead = false;
    var coaches = function () { return (o.coaches || []).filter(function (c) { return c.status === 'Active' || !c.status; }); };
    function paint() {
      if (dead) return;
      var shown = lf === 'all' ? list : list.filter(function (e) { return levelOf(e) === lf || levelOf(e) === 'all'; });
      host.innerHTML = '<div class="tt-wrap"><div class="tt-bar"><div><h3>Timetable</h3><div class="tt-sub">The week of Tech Studio classes: time, level, coach and class link. Builders see the sessions for their level and for all levels.</div></div>' +
        '<button type="button" class="tt-btn primary" data-tt="add"><i class="fas fa-plus"></i> Add session</button></div>' +
        '<div class="tt-chips" role="group" aria-label="Show level">' + LEVELS.map(function (l) { var n = l[0] === 'all' ? list.length : list.filter(function (e) { return levelOf(e) === l[0]; }).length; return '<button type="button" class="tt-chip' + (lf === l[0] ? ' on' : '') + '" data-lf="' + l[0] + '" aria-pressed="' + (lf === l[0]) + '">' + esc(l[1]) + ' · ' + n + '</button>'; }).join('') + '</div>' +
        weekHtml(shown, { manage: true }) + '</div>';
    }
    function form(e, day) {
      e = e || {};
      var cs = coaches();
      var m = modal(e.id ? 'Edit session' : 'Add session',
        '<div class="tt-form">' +
          '<label>Day<select id="ttDay">' + DAYS.map(function (d) { return '<option' + ((e.dayOfWeek || day || 'Monday') === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></label>' +
          '<label>Level<select id="ttLevel">' + LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (levelOf(e) === l[0] ? ' selected' : '') + '>' + esc(l[1]) + '</option>'; }).join('') + '</select></label>' +
          '<label>Start time<input type="time" id="ttStart" value="' + esc(e.startTime || '') + '" required></label>' +
          '<label>End time<input type="time" id="ttEnd" value="' + esc(e.endTime || '') + '"></label>' +
          '<label class="full">Coach<select id="ttCoach"><option value="">Not set yet</option>' + cs.map(function (c) { return '<option value="' + esc(c.id) + '"' + (e.coachId === c.id ? ' selected' : '') + '>' + esc(c.name || c.email || 'Coach') + '</option>'; }).join('') +
            (e.coachId && !cs.some(function (c) { return c.id === e.coachId; }) ? '<option value="' + esc(e.coachId) + '" selected>' + esc(e.coachName || 'Coach') + '</option>' : '') + '</select></label>' +
          '<label class="full">Class link <span class="hint">Google Meet, Zoom or any link builders press to join</span><input type="url" id="ttLink" value="' + esc(e.link || '') + '" placeholder="https://meet.google.com/abc-defg-hij"></label>' +
        '</div>',
        (e.id ? '<button type="button" class="tt-btn danger" data-f="del"><i class="fas fa-trash"></i> Delete</button>' : '') +
        '<button type="button" class="tt-btn" data-f="cancel">Cancel</button><button type="button" class="tt-btn primary" data-f="save"><i class="fas fa-check"></i> Save</button>');
      var q = function (id) { return m.el.querySelector('#' + id); };
      m.el.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-f]'); if (!b) return;
        if (b.dataset.f === 'cancel') return m.close();
        if (b.dataset.f === 'del') { del(e.id).then(function (ok) { if (ok) m.close(); }); return; }
        var start = q('ttStart').value, end = q('ttEnd').value, link = q('ttLink').value.trim(), cid = q('ttCoach').value;
        if (!start) return m.err('Choose a start time.');
        if (end && end <= start) return m.err('The end time must be after the start time.');
        if (link && !joinUrl(link)) return m.err('The class link must start with https://');
        var coach = cs.filter(function (c) { return c.id === cid; })[0];
        var d = { dayOfWeek: q('ttDay').value, startTime: start, endTime: end, level: q('ttLevel').value, coachId: cid || '', coachName: cid ? ((coach && (coach.name || coach.email)) || e.coachName || '') : '', link: link ? joinUrl(link) : '', updatedAt: FV().serverTimestamp() };
        b.disabled = true;
        (e.id ? COL().doc(e.id).update(d) : COL().add(Object.assign(d, { createdAt: FV().serverTimestamp() })))
          .then(function () { m.close(); }).catch(function (er) { b.disabled = false; m.err('Could not save: ' + T.errMsg(er)); });
      });
      setTimeout(function () { q('ttStart').focus(); }, 30);
    }
    function del(id) {
      var e = list.filter(function (x) { return x.id === id; })[0]; if (!e) return Promise.resolve(false);
      return new Promise(function (done) {
        var m = modal('Delete this session?', '<p style="margin:0">' + esc(e.dayOfWeek + ' ' + (e.startTime || '') + (e.endTime ? '–' + e.endTime : '') + ' · ' + LEVEL_LABEL[levelOf(e)]) + '</p>',
          '<button type="button" class="tt-btn" data-f="no">Keep it</button><button type="button" class="tt-btn primary" data-f="yes" style="background:#b8362a;border-color:#b8362a">Delete</button>');
        m.el.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-f]'); if (!b) return;
          if (b.dataset.f === 'no') { m.close(); return done(false); }
          COL().doc(id).delete().then(function () { m.close(); done(true); }).catch(function (er) { m.err('Could not delete: ' + T.errMsg(er)); });
        });
      });
    }
    host.addEventListener('click', onClick);
    function onClick(ev) {
      var c = ev.target.closest('[data-lf]'); if (c) { lf = c.dataset.lf; paint(); return; }
      var b = ev.target.closest('[data-tt]'); if (!b) return;
      if (b.dataset.tt === 'add') form(null, b.dataset.day);
      else if (b.dataset.tt === 'edit') form(list.filter(function (x) { return x.id === b.dataset.id; })[0]);
      else if (b.dataset.tt === 'del') del(b.dataset.id);
    }
    host.innerHTML = '<div class="tt-empty">Loading the timetable…</div>';
    var un = listen(function (l, err) { if (err) { host.innerHTML = '<div class="tt-empty">Could not load the timetable: ' + esc(T.errMsg(err)) + '</div>'; return; } list = l; paint(); });
    var tick = setInterval(paint, 60000);
    return {
      destroy: function () { dead = true; un(); clearInterval(tick); host.removeEventListener('click', onClick); },
      setCoaches: function (cs) { o.coaches = cs; }
    };
  }

  /* ---------- builders, guardians, coaches ---------- */
  function mountView(host, o) {
    style(); o = o || {};
    var list = [], dead = false, mineOnly = false;
    function paint() {
      if (dead) return;
      var shown = forLevel(list, o.level);
      if (mineOnly && o.coachId) shown = shown.filter(function (e) { return e.coachId === o.coachId; });
      var lvl = o.level ? T.trackOf(o.level) : '';
      host.innerHTML = '<div class="tt-wrap">' +
        (o.level ? '<div class="tt-sub">' + esc(o.who ? o.who + '’s' : 'Your') + ' level: <b>' + esc(LEVEL_LABEL[lvl] || 'All') + '</b>. Showing sessions for ' + esc((LEVEL_LABEL[lvl] || 'this level').toLowerCase()) + ' builders and for everyone.</div>' : '') +
        (o.coachId ? '<div class="tt-chips"><button type="button" class="tt-chip' + (!mineOnly ? ' on' : '') + '" data-mine="0">The whole week</button><button type="button" class="tt-chip' + (mineOnly ? ' on' : '') + '" data-mine="1">My sessions</button></div>' : '') +
        todayHtml(shown) +
        weekHtml(shown, { coachId: o.coachId, empty: o.level ? 'No sessions for this level yet. The Studio Desk will add them soon.' : 'No sessions on the timetable yet.' }) + '</div>';
    }
    function onClick(ev) { var c = ev.target.closest('[data-mine]'); if (c) { mineOnly = c.dataset.mine === '1'; paint(); } }
    host.addEventListener('click', onClick);
    host.innerHTML = '<div class="tt-empty">Loading the timetable…</div>';
    var un = listen(function (l, err) { if (err) { host.innerHTML = '<div class="tt-empty">Could not load the timetable: ' + esc(T.errMsg(err)) + '</div>'; return; } list = l; paint(); });
    var tick = setInterval(paint, 60000);
    return { destroy: function () { dead = true; un(); clearInterval(tick); host.removeEventListener('click', onClick); }, setLevel: function (l) { o.level = l; paint(); } };
  }

  /* Today's sessions still to come (or running), for a home page. '' when there are none. */
  function todayHtml(list, level) {
    style();
    var today = forLevel(list || [], level).filter(function (e) { var s = stateOf(e); return s === 'live' || s === 'soon' || s === 'today'; });
    if (!today.length) return '';
    return '<section class="tt-today" aria-label="Today’s classes">' + today.map(function (e) {
      var st = stateOf(e);
      return '<div class="tt-card' + (st === 'live' ? ' live' : '') + '"><span class="ic"><i class="fas ' + (st === 'live' ? 'fa-tower-broadcast' : 'fa-calendar-day') + '" aria-hidden="true"></i></span>' +
        '<span class="t"><b>' + (st === 'live' ? 'Class is on now' : st === 'soon' ? 'Class starts soon' : 'Class today') + ' · ' + timeText(e) + '</b><span>' + esc(LEVEL_LABEL[levelOf(e)]) + (e.coachName ? ' · with ' + esc(e.coachName) : '') + '</span></span>' + joinBtn(e, true) + '</div>';
    }).join('') + '</section>';
  }

  g.TechTimetable = { mountManager: mountManager, mountView: mountView, todayHtml: todayHtml, listen: listen, forLevel: forLevel, stateOf: stateOf, DAYS: DAYS, LEVELS: LEVELS, LEVEL_LABEL: LEVEL_LABEL, style: style };
})(window);
