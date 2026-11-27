/* =========================================================
   EXAM TIMETABLES — Paisley Studio
   -----------------------------------------------------------
   ExamTimetable.mountAdmin(host, { uid, name })
     Admin > Timetable & Notices > Exam timetable: write a timetable (Key Stage, Year,
     board, the exams with date, times, subject, paper, where, notes), choose who gets it
     (everyone matching, or picked students; tutors or not), then Publish & send.
   ExamTimetable.mountViewer(host, { role: 'student' | 'parent' | 'tutor', uid, childId })
     The timetables sent to that person (parents: for the child chosen at the top,
     childId() or a string). Each card shows the next exam and the exams day by day,
     with a Download PDF button (examTimetablePdf, the same PDF as the email).
   ExamTimetable.refreshAll()  re-renders every viewer (the parent portal calls it when the
     child changes).

   Data: examTimetables/{id}; see functions/exam-timetable.js. Rules let a person read
   only timetables that list their uid, so viewers query with array-contains.
   Needs: firebase compat (firestore, auth; functions for publishing and PDFs),
   lms-helpers.js (KEY_STAGES, LMZ_SUBJECTS, LMZ_BOARDS, LMZ_KEY_STAGE_YEARS).
========================================================= */
(function (global) {
  'use strict';

  var FS = function () { return global.db || firebase.firestore(); };
  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ksNum(ks) { var m = /Key Stage\s*(\d)/i.exec(String(ks || '')); return m ? Number(m[1]) : null; }
  function ksShort(ks) { var n = ksNum(ks); return n ? 'KS' + n : String(ks || ''); }
  function keyStages() { return (global.KEY_STAGES || ['Key Stage 2 (Years 3-6)', 'Key Stage 3 (Years 7-9)', 'Key Stage 4 (Years 10-11) — IGCSE', 'Key Stage 5 (Years 12-13) — A-Level']); }
  function yearsOf(ks) { var n = ksNum(ks), Y = global.LMZ_KEY_STAGE_YEARS || {}; return (n && Y[n]) || []; }
  function subjectsOf(ks) {
    var n = ksNum(ks);
    return (global.LMZ_SUBJECTS || []).filter(function (s) { return !n || !s.keyStages || s.keyStages.indexOf(n) !== -1; });
  }
  function subjectName(id) { var s = (global.LMZ_SUBJECTS || []).filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; }
  function boards() { return global.LMZ_BOARDS || [{ id: 'cambridge', label: 'Cambridge' }, { id: 'edexcel', label: 'Pearson Edexcel' }, { id: 'oxford_aqa', label: 'Oxford AQA' }]; }
  function boardLabel(id) { var b = boards().filter(function (x) { return x.id === id; })[0]; return b ? b.label : ''; }
  function toDate(ts) { return ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null); }
  function dayLabel(d, long) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined }); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function startMs(s) { return new Date(s.date + 'T' + (s.start || '00:00') + ':00').getTime(); }
  function endMs(s) { return new Date(s.date + 'T' + (s.end || s.start || '23:59') + ':00').getTime(); }
  function mins(t) { var m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function duration(s) {
    var a = mins(s.start), b = mins(s.end); if (a == null || b == null || b <= a) return '';
    var d = b - a, h = Math.floor(d / 60), m = d % 60; return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  }
  function sortSessions(list) { return (list || []).slice().sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }); }
  function uid6() { return Math.random().toString(36).slice(2, 8); }
  function untilWords(ms) {
    var d = ms - Date.now(); if (d <= 0) return 'now';
    var h = Math.round(d / 3600000); if (h < 1) return 'in ' + Math.max(1, Math.round(d / 60000)) + ' min';
    if (h < 36) return 'in ' + h + ' hour' + (h === 1 ? '' : 's');
    var days = Math.round(d / 86400000); return 'in ' + days + ' day' + (days === 1 ? '' : 's');
  }
  function call(name, data) { return firebase.functions().httpsCallable(name)(data); }
  function downloadBase64(b64, fileName) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = document.createElement('a'); a.href = url; a.download = fileName || 'Exam timetable.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function errText(e) { return (e && (e.message || e.code)) || 'Something went wrong. Please try again.'; }

  /* ---------------------------------------------------------- styles */
  function style() {
    if (document.getElementById('et-style')) return;
    var st = document.createElement('style'); st.id = 'et-style';
    st.textContent = [
      '.et{--et-deep:var(--brand-deep,#245F5A);--et-teal:var(--brand,#55BFB3);--et-sage:var(--sage,#E5F2EF);--et-paper:var(--paper,#F1F9F7);--et-line:var(--line,rgba(38,51,49,.1));--et-muted:var(--muted,#5A6E6A);--et-ink:var(--ink,#263331);display:grid;gap:.9rem;min-width:0}',
      '.et *{box-sizing:border-box}',
      '.et-bar{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap}',
      '.et-bar h3{margin:0;font-size:1.05rem;color:var(--et-deep)}.et-bar .sub{font-size:.8rem;color:var(--et-muted);margin-top:.15rem}',
      '.et-btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;font:inherit;font-size:.8rem;font-weight:700;padding:.5rem .9rem;border-radius:10px;border:1.5px solid var(--et-line);background:#fff;color:var(--et-ink);cursor:pointer;white-space:nowrap;transition:border-color .2s,background .2s,color .2s}',
      '.et-btn:hover{border-color:var(--et-teal);color:var(--et-deep)}',
      '.et-btn.pri{background:var(--et-deep);border-color:var(--et-deep);color:#fff}.et-btn.pri:hover{background:#1b4a46;color:#fff}',
      '.et-btn.sm{padding:.38rem .7rem;font-size:.76rem}',
      '.et-btn.ghost{border-color:transparent;background:transparent}.et-btn.ghost:hover{background:var(--et-sage)}',
      '.et-btn.danger{color:#C0392B}.et-btn.danger:hover{border-color:#E74C3C;color:#C0392B}',
      '.et-btn[disabled]{opacity:.55;cursor:default}',
      '.et-list{display:grid;gap:.75rem}',
      '.et-card{background:var(--surface,#fff);border:1px solid var(--et-line);border-radius:14px;padding:.95rem 1rem;display:grid;gap:.6rem;min-width:0}',
      '.et-card.live{border-left:4px solid var(--et-teal)}',
      '.et-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;flex-wrap:wrap}',
      '.et-title{min-width:0;flex:1 1 240px}.et-title b{display:block;font-size:1rem;color:var(--et-deep);overflow-wrap:anywhere}.et-title small{display:block;font-size:.76rem;color:var(--et-muted);margin-top:.1rem}',
      '.et-chips{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}',
      '.et-chip{display:inline-flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:800;padding:.2rem .55rem;border-radius:99px;background:var(--et-sage);color:var(--et-deep)}',
      '.et-chip.draft{background:#FFF1D6;color:#8a5a00}.et-chip.pub{background:rgba(46,184,114,.14);color:#1d8b57}.et-chip.past{background:rgba(90,110,106,.12);color:var(--et-muted)}',
      '.et-meta{display:flex;flex-wrap:wrap;gap:.35rem 1rem;font-size:.8rem;color:var(--et-muted)}.et-meta i{color:var(--et-teal);margin-right:.3rem}.et-meta b{color:var(--et-ink)}',
      '.et-actions{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;border-top:1px solid rgba(38,51,49,.07);padding-top:.65rem}',
      '.et-actions .grow{flex:1}',
      '.et-next{display:flex;align-items:center;gap:.75rem;background:var(--et-paper);border:1px solid var(--et-line);border-radius:12px;padding:.65rem .8rem}',
      '.et-next .ic{flex:0 0 auto;width:38px;height:38px;border-radius:10px;background:var(--et-deep);color:#fff;display:grid;place-items:center}',
      '.et-next b{display:block;color:var(--et-deep);font-size:.9rem}.et-next span{font-size:.78rem;color:var(--et-muted)}',
      '.et-next .when{margin-left:auto;font-size:.74rem;font-weight:800;color:#fff;background:var(--et-teal);padding:.25rem .6rem;border-radius:99px;white-space:nowrap}',
      '.et-days{display:grid;gap:.55rem}',
      '.et-day{border:1px solid var(--et-line);border-radius:12px;overflow:hidden}',
      '.et-day>h5{margin:0;padding:.45rem .75rem;background:var(--et-sage);color:var(--et-deep);font-size:.8rem;display:flex;align-items:center;gap:.45rem;border-left:4px solid var(--et-teal)}',
      '.et-day>h5 .today{margin-left:auto;font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;background:var(--et-deep);color:#fff;padding:.12rem .45rem;border-radius:99px}',
      '.et-row{display:grid;grid-template-columns:120px minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr);gap:.4rem .8rem;padding:.6rem .75rem;border-top:1px solid rgba(38,51,49,.06);font-size:.83rem;align-items:start}',
      '.et-row:first-of-type{border-top:0}',
      '.et-row .t{font-weight:800;color:var(--et-ink);white-space:nowrap}.et-row .t small{display:block;font-weight:600;color:var(--et-muted);font-size:.72rem}',
      '.et-row .s b{color:var(--et-deep)}.et-row .s small{display:block;color:var(--et-muted);font-size:.75rem}',
      '.et-row .w,.et-row .n{color:var(--et-muted);font-size:.78rem}',
      '.et-row.done{opacity:.55}',
      '.et-empty{padding:1.2rem;text-align:center;color:var(--et-muted);font-size:.86rem;background:var(--et-paper);border:1px dashed var(--et-line);border-radius:12px}',
      '.et-empty i{display:block;font-size:1.3rem;color:var(--et-teal);margin-bottom:.4rem}',
      '.et-past>summary{cursor:pointer;font-size:.8rem;font-weight:700;color:var(--et-muted);padding:.3rem 0}',
      /* modal */
      '.et-ov{position:fixed;inset:0;z-index:2000;background:rgba(20,40,38,.45);display:flex;align-items:flex-start;justify-content:center;padding:3vh 1rem;overflow:auto}',
      '.et-modal{background:#fff;border-radius:16px;width:min(980px,100%);box-shadow:0 30px 70px rgba(0,0,0,.25);display:flex;flex-direction:column;max-height:94vh}',
      '.et-modal.narrow{width:min(560px,100%)}',
      '.et-mh{display:flex;align-items:center;gap:.6rem;padding:.9rem 1.1rem;border-bottom:1px solid var(--et-line)}.et-mh h4{margin:0;font-size:1rem;color:var(--et-deep);flex:1}',
      '.et-mb{padding:1rem 1.1rem;overflow:auto;display:grid;gap:1rem}',
      '.et-mf{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.8rem 1.1rem;border-top:1px solid var(--et-line)}.et-mf .grow{flex:1}.et-mf .err{color:#C0392B;font-size:.8rem;font-weight:700}',
      '.et-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}',
      '.et-f{display:grid;gap:.25rem;min-width:0}.et-f.wide{grid-column:1/-1}',
      '.et-f>label,.et-lb{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--et-muted)}',
      '.et-f input,.et-f select,.et-f textarea,.et-sess input,.et-sess select{width:100%;font:inherit;font-size:.85rem;color:var(--et-ink);background:#fff;border:1.5px solid var(--et-line);border-radius:9px;padding:.48rem .6rem;min-width:0}',
      '.et-f textarea{min-height:70px;resize:vertical}',
      '.et-f input:focus,.et-f select:focus,.et-f textarea:focus,.et-sess input:focus,.et-sess select:focus{outline:none;border-color:var(--et-teal);box-shadow:0 0 0 3px rgba(85,191,179,.15)}',
      '.et-sec{border:1px solid var(--et-line);border-radius:12px;padding:.8rem;display:grid;gap:.6rem}',
      '.et-sec>.et-lb{display:flex;align-items:center;gap:.45rem}.et-sec>.et-lb .x{margin-left:auto;display:flex;gap:.35rem}',
      '.et-sess-head{display:grid;grid-template-columns:150px 124px 124px minmax(130px,1fr) minmax(150px,1.2fr) 34px;gap:.45rem;padding:0 .55rem;font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--et-muted)}',
      '.et-sess{display:grid;grid-template-columns:150px 124px 124px minmax(130px,1fr) minmax(150px,1.2fr) 34px;gap:.45rem;align-items:center;padding:.55rem;border:1px solid rgba(38,51,49,.08);border-radius:10px;background:var(--et-paper)}',
      '.et-sess .more{grid-column:1/-1;display:grid;grid-template-columns:150px minmax(120px,1fr) minmax(160px,2fr);gap:.45rem}',
      '.et-sess input[type=time],.et-sess input[type=date]{padding:.45rem .5rem}',
      '.et-sess .rm{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--et-line);background:#fff;color:#C0392B;cursor:pointer}',
      '.et-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;background:var(--et-paper);border:1px solid var(--et-line);border-radius:10px;width:max-content;max-width:100%}',
      '.et-seg label{display:inline-flex;align-items:center;gap:.35rem;padding:.36rem .75rem;border-radius:7px;font-size:.78rem;font-weight:700;color:var(--et-muted);cursor:pointer}',
      '.et-seg input{position:absolute;opacity:0;pointer-events:none}',
      '.et-seg label:has(input:checked){background:#fff;color:var(--et-deep);box-shadow:0 1px 4px rgba(36,95,90,.16)}',
      '.et-pick{border:1px solid var(--et-line);border-radius:10px;overflow:hidden}',
      '.et-pick-tools{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;padding:.45rem;background:var(--et-paper);border-bottom:1px solid var(--et-line)}',
      '.et-pick-tools input{flex:1;min-width:150px;padding:.4rem .55rem;border:1px solid var(--et-line);border-radius:8px;font:inherit;font-size:.82rem}',
      '.et-pick-tools .cnt{margin-left:auto;font-size:.76rem;font-weight:800;color:var(--et-deep)}',
      '.et-pick-list{max-height:230px;overflow:auto}',
      '.et-pick-list label{display:flex;align-items:center;gap:.55rem;padding:.42rem .65rem;border-top:1px solid rgba(38,51,49,.05);font-size:.83rem;cursor:pointer}',
      '.et-pick-list small{margin-left:auto;color:var(--et-muted);font-size:.72rem}',
      '.et-note{font-size:.78rem;color:var(--et-muted);line-height:1.45}.et-note i{color:var(--et-teal);margin-right:.3rem}',
      '.et-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}.et-sum div{background:var(--et-paper);border:1px solid var(--et-line);border-radius:12px;padding:.7rem;text-align:center}.et-sum b{display:block;font-size:1.4rem;color:var(--et-deep)}.et-sum span{font-size:.74rem;color:var(--et-muted);font-weight:700}',
      '@media (max-width:760px){',
      '.et-sess-head{display:none}',
      '.et-sess{grid-template-columns:1fr 1fr;}.et-sess [data-k=date],.et-sess .subj,.et-sess .paper{grid-column:1/-1}.et-sess .rm{grid-column:1/-1;width:100%}',
      '.et-sess .more{grid-template-columns:1fr}',
      '.et-row{grid-template-columns:1fr;gap:.2rem}.et-row .t small{display:inline;margin-left:.4rem}',
      '.et-actions .et-btn{flex:1 1 auto}.et-actions .grow{display:none}',
      '.et-sum{grid-template-columns:1fr 1fr 1fr}',
      '.et-ov{padding:0}.et-modal{border-radius:0;max-height:100vh;min-height:100vh}',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function modal(title, narrow) {
    style();
    var ov = document.createElement('div'); ov.className = 'et-ov et';
    ov.innerHTML = '<div class="et-modal' + (narrow ? ' narrow' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="et-mh"><h4>' + esc(title) + '</h4><button type="button" class="et-btn ghost sm" data-x aria-label="Close"><i class="fas fa-xmark"></i></button></div><div class="et-mb"></div><div class="et-mf"></div></div>';
    document.body.appendChild(ov);
    var api = {
      el: ov, body: ov.querySelector('.et-mb'), foot: ov.querySelector('.et-mf'),
      close: function () { ov.remove(); document.removeEventListener('keydown', onKey); }
    };
    function onKey(e) { if (e.key === 'Escape') api.close(); }
    document.addEventListener('keydown', onKey);
    ov.querySelector('[data-x]').onclick = api.close;
    return api;
  }
  function toast(msg, bad) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2100;background:' + (bad ? '#C0392B' : '#245F5A') + ';color:#fff;padding:.65rem 1rem;border-radius:12px;font-size:.85rem;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.2);max-width:90vw';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }

  /* ---------------------------------------------------------- the day-by-day list (viewer + admin preview) */
  function daysHtml(sessions) {
    var list = sortSessions(sessions), out = '', cur = '', today = todayStr(), now = Date.now();
    list.forEach(function (s, i) {
      if (s.date !== cur) {
        if (cur) out += '</div>';
        cur = s.date;
        out += '<div class="et-day"><h5><i class="fas fa-calendar-day"></i>' + esc(dayLabel(s.date, true)) + (s.date === today ? '<span class="today">Today</span>' : '') + '</h5>';
      }
      var done = endMs(s) < now;
      out += '<div class="et-row' + (done ? ' done' : '') + '">' +
        '<div class="t">' + esc(s.start) + (s.end ? ' - ' + esc(s.end) : '') + '<small>' + esc(duration(s)) + '</small></div>' +
        '<div class="s"><b>' + esc(s.subjectName || subjectName(s.subjectId)) + '</b>' + (s.paper ? '<small>' + esc(s.paper) + '</small>' : '') + '</div>' +
        '<div class="w"><i class="fas fa-location-dot" style="color:var(--et-teal);margin-right:.3rem"></i>' + esc([s.mode, s.room].filter(Boolean).join(', ') || '-') + '</div>' +
        '<div class="n">' + esc(s.notes || '') + '</div></div>';
      if (i === list.length - 1) out += '</div>';
    });
    return out || '<div class="et-empty">No exams on this timetable.</div>';
  }
  function scopeChips(tt) {
    return '<span class="et-chip"><i class="fas fa-layer-group"></i>' + esc(ksShort(tt.keyStage)) + '</span>' +
      (tt.year ? '<span class="et-chip">Year ' + esc(tt.year) + '</span>' : '<span class="et-chip">All years</span>') +
      (tt.board ? '<span class="et-chip">' + esc(boardLabel(tt.board)) + '</span>' : '');
  }
  function spanText(list) {
    if (!list.length) return '';
    var a = list[0].date, b = list[list.length - 1].date;
    return a === b ? dayLabel(a, false) : dayLabel(a, false) + ' to ' + dayLabel(b, false);
  }

  /* ========================================================== ADMIN */
  function mountAdmin(host, opts) {
    style();
    opts = opts || {};
    host.innerHTML = '<div class="et"><div class="et-empty"><i class="fas fa-spinner fa-spin"></i>Loading exam timetables…</div></div>';
    var root = host.firstChild, items = [], unsub = null;

    function render() {
      var h = '<div class="et-bar"><div><h3><i class="fas fa-calendar-check" style="color:var(--et-teal);margin-right:.4rem"></i>Exam timetables</h3><div class="sub">Set exams by Key Stage, Year and subject, choose who gets them, then publish. Students, parents and tutors see it in their portal and get an email with their own PDF.</div></div>' +
        '<button type="button" class="et-btn pri" data-a="new"><i class="fas fa-plus"></i> New exam timetable</button></div>';
      if (!items.length) h += '<div class="et-empty"><i class="fas fa-calendar-plus"></i>No exam timetables yet. Press “New exam timetable” to make the first one.</div>';
      else h += '<div class="et-list">' + items.map(cardHtml).join('') + '</div>';
      root.innerHTML = h;
    }
    function cardHtml(tt) {
      var list = sortSessions(tt.sessions), pub = tt.status === 'published', ls = tt.lastSend || {};
      var allDone = list.length && endMs(list[list.length - 1]) < Date.now();
      var state = pub ? '<span class="et-chip ' + (allDone ? 'past' : 'pub') + '"><i class="fas fa-' + (allDone ? 'flag-checkered' : 'circle-check') + '"></i>' + (allDone ? 'Finished' : 'Published') + (tt.version > 1 ? ' · v' + tt.version : '') + '</span>' : '<span class="et-chip draft"><i class="fas fa-pen"></i>Draft</span>';
      var who = tt.audience === 'students' ? (tt.pickedStudents || []).length + ' picked student' + ((tt.pickedStudents || []).length === 1 ? '' : 's') : 'Everyone who takes these subjects';
      var sentLine = pub ? '<span><i class="fas fa-paper-plane"></i>Sent to <b>' + (tt.studentIds || []).length + '</b> student' + ((tt.studentIds || []).length === 1 ? '' : 's') + ', <b>' + (tt.parentIds || []).length + '</b> parent' + ((tt.parentIds || []).length === 1 ? '' : 's') + ', <b>' + (tt.tutorIds || []).length + '</b> tutor' + ((tt.tutorIds || []).length === 1 ? '' : 's') + (tt.publishedAt ? ' · ' + esc(toDate(tt.publishedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) : '') + '</span>' : '';
      return '<article class="et-card' + (pub && !allDone ? ' live' : '') + '">' +
        '<div class="et-head"><div class="et-title"><b>' + esc(tt.title || 'Exam timetable') + '</b><small>' + esc(tt.series || '') + '</small></div><div class="et-chips">' + state + scopeChips(tt) + '</div></div>' +
        '<div class="et-meta"><span><i class="fas fa-file-pen"></i><b>' + list.length + '</b> exam' + (list.length === 1 ? '' : 's') + '</span>' + (list.length ? '<span><i class="fas fa-calendar-days"></i>' + esc(spanText(list)) + '</span>' : '') +
          '<span><i class="fas fa-users"></i>' + esc(who) + (tt.tutorsMode === 'none' ? ', no tutors' : ', and their tutors') + '</span>' + sentLine + '</div>' +
        '<div class="et-actions">' +
          '<button type="button" class="et-btn sm ' + (pub ? '' : 'pri') + '" data-a="edit" data-id="' + esc(tt.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
          '<button type="button" class="et-btn sm ' + (pub ? 'pri' : '') + '" data-a="publish" data-id="' + esc(tt.id) + '"' + (list.length ? '' : ' disabled title="Add exams first"') + '><i class="fas fa-paper-plane"></i> ' + (pub ? 'Send update' : 'Publish &amp; send') + '</button>' +
          '<button type="button" class="et-btn sm" data-a="pdf" data-id="' + esc(tt.id) + '"' + (list.length ? '' : ' disabled') + '><i class="fas fa-file-pdf"></i> PDF</button>' +
          '<span class="grow"></span>' +
          '<button type="button" class="et-btn sm ghost" data-a="dup" data-id="' + esc(tt.id) + '" title="Make a copy to edit"><i class="fas fa-copy"></i> Copy</button>' +
          (pub ? '<button type="button" class="et-btn sm ghost" data-a="unpub" data-id="' + esc(tt.id) + '" title="Hide it from every portal. Nobody is told."><i class="fas fa-eye-slash"></i> Unpublish</button>' : '') +
          '<button type="button" class="et-btn sm ghost danger" data-a="del" data-id="' + esc(tt.id) + '"><i class="fas fa-trash"></i> Delete</button>' +
        '</div></article>';
    }
    function find(id) { return items.filter(function (x) { return x.id === id; })[0]; }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      var a = b.dataset.a, tt = find(b.dataset.id);
      if (a === 'new') editor(null);
      else if (a === 'edit' && tt) editor(tt);
      else if (a === 'publish' && tt) publish(tt);
      else if (a === 'pdf' && tt) pdf(tt, b);
      else if (a === 'dup' && tt) {
        var copy = JSON.parse(JSON.stringify({ title: (tt.title || 'Exam timetable') + ' (copy)', series: tt.series || '', keyStage: tt.keyStage, year: tt.year || null, board: tt.board || '', instructions: tt.instructions || '', sessions: tt.sessions || [], audience: tt.audience || 'class', pickedStudents: tt.pickedStudents || [], tutorsMode: tt.tutorsMode || 'all' }));
        editor(copy, true);
      }
      else if (a === 'unpub' && tt) confirmBox('Unpublish this exam timetable?', 'It disappears from every student, parent and tutor portal. Nobody is told. You can publish it again later.', 'Unpublish', function () {
        return FS().collection('examTimetables').doc(tt.id).update({ status: 'draft', studentIds: [], parentIds: [], tutorIds: [], studentSessions: {}, tutorSessions: {}, contentHash: '', updatedAt: FV().serverTimestamp() }).then(function () { toast('Unpublished.'); });
      });
      else if (a === 'del' && tt) confirmBox('Delete this exam timetable?', 'It is removed from every portal and cannot be brought back.', 'Delete', function () {
        return FS().collection('examTimetables').doc(tt.id).delete().then(function () { toast('Deleted.'); });
      }, true);
    });

    function confirmBox(title, text, okLabel, fn, danger) {
      var m = modal(title, true);
      m.body.innerHTML = '<p class="et-note" style="font-size:.88rem;margin:0">' + esc(text) + '</p>';
      m.foot.innerHTML = '<span class="err"></span><span class="grow"></span><button type="button" class="et-btn" data-c>Cancel</button><button type="button" class="et-btn pri' + (danger ? ' danger' : '') + '" data-ok' + (danger ? ' style="background:#C0392B;border-color:#C0392B;color:#fff"' : '') + '>' + esc(okLabel) + '</button>';
      m.foot.querySelector('[data-c]').onclick = m.close;
      var ok = m.foot.querySelector('[data-ok]');
      ok.onclick = function () { ok.disabled = true; Promise.resolve(fn()).then(m.close).catch(function (e) { ok.disabled = false; m.foot.querySelector('.err').textContent = errText(e); }); };
    }

    function pdf(tt, btn) {
      var was = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PDF';
      call('examTimetablePdf', { id: tt.id }).then(function (r) { downloadBase64(r.data.base64, r.data.fileName); })
        .catch(function (e) { toast(errText(e), true); })
        .then(function () { btn.disabled = false; btn.innerHTML = was; });
    }

    function publish(tt) {
      var m = modal((tt.status === 'published' ? 'Send update: ' : 'Publish: ') + (tt.title || 'Exam timetable'), true);
      m.body.innerHTML = '<div class="et-empty"><i class="fas fa-spinner fa-spin"></i>Working out who gets it…</div>';
      m.foot.innerHTML = '<span class="err"></span><span class="grow"></span><button type="button" class="et-btn" data-c>Cancel</button>';
      m.foot.querySelector('[data-c]').onclick = m.close;
      call('publishExamTimetable', { id: tt.id, dryRun: true }).then(function (r) {
        var d = r.data || {};
        m.body.innerHTML = '<div class="et-sum"><div><b>' + d.students + '</b><span>Students</span></div><div><b>' + d.parents + '</b><span>Parents</span></div><div><b>' + d.tutors + '</b><span>Tutors</span></div></div>' +
          (d.sample && d.sample.length ? '<div class="et-note"><i class="fas fa-user-graduate"></i>' + esc(d.sample.join(', ')) + (d.students > d.sample.length ? ' and ' + (d.students - d.sample.length) + ' more' : '') + '</div>' : '') +
          (!d.students ? '<div class="et-note" style="color:#9A5B00"><i class="fas fa-triangle-exclamation"></i>No student matches. Check the Key Stage, Year, board and subjects, or pick students by name.</div>' : '') +
          '<div class="et-note"><i class="fas fa-envelope"></i>Each gets a bell and an email telling them to prepare, with their own Paisley exam timetable PDF: students their exams, parents one per child, tutors the exams in the subjects they teach.' +
          (tt.status === 'published' ? ' If you changed the timetable, everyone is told it was updated; if not, only people added since the last send hear about it.' : '') + '</div>';
        var go = document.createElement('button'); go.type = 'button'; go.className = 'et-btn pri'; go.innerHTML = '<i class="fas fa-paper-plane"></i> ' + (tt.status === 'published' ? 'Send update' : 'Publish and send');
        go.disabled = !d.students && !d.tutors;
        m.foot.appendChild(go);
        go.onclick = function () {
          go.disabled = true; go.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
          call('publishExamTimetable', { id: tt.id }).then(function (r2) {
            var o = r2.data || {};
            m.body.innerHTML = '<div class="et-empty" style="border-style:solid"><i class="fas fa-circle-check" style="color:#1d8b57"></i><b style="color:var(--et-deep)">Published</b><br>' +
              o.students + ' students, ' + o.parents + ' parents and ' + o.tutors + ' tutors can see it now. ' + (o.told || 0) + ' told by bell, ' + (o.emailed || 0) + ' emails sent' + (o.held ? ', ' + o.held + ' held by the developer mode freeze' : '') + '.</div>';
            m.foot.innerHTML = '<span class="grow"></span><button type="button" class="et-btn pri" data-c>Close</button>';
            m.foot.querySelector('[data-c]').onclick = m.close;
          }).catch(function (e) { go.disabled = false; go.innerHTML = '<i class="fas fa-paper-plane"></i> Try again'; m.foot.querySelector('.err').textContent = errText(e); });
        };
      }).catch(function (e) { m.body.innerHTML = '<div class="et-empty">' + esc(errText(e)) + '</div>'; });
    }

    /* ---------------- editor ---------------- */
    function editor(tt, isCopy) {
      var isNew = !tt || isCopy;
      var E = {
        id: isNew ? null : tt.id,
        title: (tt && tt.title) || '', series: (tt && tt.series) || '',
        keyStage: (tt && tt.keyStage) || keyStages()[2] || keyStages()[0],
        year: tt && tt.year ? String(tt.year) : '', board: (tt && tt.board) || '',
        instructions: (tt && tt.instructions) || '',
        sessions: sortSessions((tt && tt.sessions) || []).map(function (s) { return Object.assign({}, s); }),
        audience: (tt && tt.audience) || 'class', picked: {}, tutorsMode: (tt && tt.tutorsMode) || 'all',
        status: (tt && !isCopy && tt.status) || 'draft', students: null, q: ''
      };
      ((tt && tt.pickedStudents) || []).forEach(function (id) { E.picked[id] = 1; });
      if (!E.sessions.length) E.sessions.push(blankSession());
      var m = modal(isNew ? 'New exam timetable' : 'Edit exam timetable');

      function blankSession(prev) {
        return { id: 's' + uid6(), subjectId: '', subjectName: '', paper: '', date: prev ? prev.date : '', start: prev ? prev.start : '09:00', end: prev ? prev.end : '10:30', mode: prev ? prev.mode : 'Online', room: '', notes: '' };
      }
      function subjOpts(cur) {
        return '<option value="">Subject…</option>' + subjectsOf(E.keyStage).map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
      }
      var MODES = ['Online', 'At home (paper)', 'In person', 'Other'];
      function sessHtml(s, i) {
        return '<div class="et-sess" data-i="' + i + '">' +
          '<input type="date" data-k="date" value="' + esc(s.date) + '" aria-label="Date">' +
          '<input type="time" data-k="start" value="' + esc(s.start) + '" aria-label="Starts">' +
          '<input type="time" data-k="end" value="' + esc(s.end) + '" aria-label="Ends">' +
          '<select class="subj" data-k="subjectId" aria-label="Subject">' + subjOpts(s.subjectId) + '</select>' +
          '<input class="paper" type="text" data-k="paper" maxlength="120" value="' + esc(s.paper) + '" placeholder="Paper, e.g. Paper 1: Non-calculator" aria-label="Paper">' +
          '<button type="button" class="rm" data-rm="' + i + '" title="Remove this exam" aria-label="Remove this exam"><i class="fas fa-trash"></i></button>' +
          '<div class="more"><select data-k="mode" aria-label="Where">' + MODES.map(function (x) { return '<option' + (x === s.mode ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
          '<input type="text" data-k="room" maxlength="80" value="' + esc(s.room) + '" placeholder="Room or link (optional)" aria-label="Room or link">' +
          '<input type="text" data-k="notes" maxlength="300" value="' + esc(s.notes) + '" placeholder="Notes, e.g. calculator allowed (optional)" aria-label="Notes"></div></div>';
      }
      function studentsHtml() {
        if (E.audience !== 'students') return '';
        if (!E.students) return '<div class="et-empty"><i class="fas fa-spinner fa-spin"></i>Loading students…</div>';
        var q = E.q.toLowerCase();
        var rows = E.students.filter(function (s) { return (!E.year || String(s.year) === E.year) && (!q || (String(s.name || '') + ' ' + String(s.email || '')).toLowerCase().indexOf(q) !== -1); });
        return '<div class="et-pick"><div class="et-pick-tools"><input type="search" data-q placeholder="Search by name or email" value="' + esc(E.q) + '"><button type="button" class="et-btn sm" data-all>Tick all shown</button><button type="button" class="et-btn sm" data-none>Clear</button><span class="cnt">' + Object.keys(E.picked).length + ' ticked</span></div>' +
          '<div class="et-pick-list">' + (rows.length ? rows.map(function (s) {
            return '<label><input type="checkbox" data-pick value="' + esc(s.id) + '"' + (E.picked[s.id] ? ' checked' : '') + '><span>' + esc(s.name || 'No name') + '</span><small>Year ' + esc(s.year || '?') + ' · ' + (s.studentType === 'remote' ? 'Remote' : 'Online') + '</small></label>';
          }).join('') : '<div class="et-empty" style="border:0">No students in ' + esc(ksShort(E.keyStage)) + (E.year ? ' Year ' + esc(E.year) : '') + '.</div>') + '</div></div>';
      }
      function paint() {
        m.body.innerHTML =
          '<div class="et-grid">' +
            '<div class="et-f"><label for="etTitle">Title</label><input id="etTitle" maxlength="120" value="' + esc(E.title) + '" placeholder="End of Term 1 Exams"></div>' +
            '<div class="et-f"><label for="etSeries">Series or term</label><input id="etSeries" maxlength="80" value="' + esc(E.series) + '" placeholder="December 2026"></div>' +
            '<div class="et-f"><label for="etKs">Key Stage</label><select id="etKs">' + keyStages().map(function (k) { return '<option value="' + esc(k) + '"' + (k === E.keyStage ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
            '<div class="et-f"><label for="etYear">Year</label><select id="etYear"><option value="">All years in the Key Stage</option>' + yearsOf(E.keyStage).map(function (y) { return '<option value="' + y + '"' + (String(y) === E.year ? ' selected' : '') + '>Year ' + y + '</option>'; }).join('') + '</select></div>' +
            '<div class="et-f"><label for="etBoard">Exam board</label><select id="etBoard"><option value="">Every board</option>' + boards().map(function (b) { return '<option value="' + esc(b.id) + '"' + (b.id === E.board ? ' selected' : '') + '>' + esc(b.label) + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="et-sec"><div class="et-lb"><i class="fas fa-file-pen"></i> Exams (' + E.sessions.length + ')<span class="x"><button type="button" class="et-btn sm" data-add><i class="fas fa-plus"></i> Add exam</button></span></div>' +
            '<div style="display:grid;gap:.45rem"><div class="et-sess-head" aria-hidden="true"><span>Date</span><span>Starts</span><span>Ends</span><span>Subject</span><span>Paper</span><span></span></div>' + E.sessions.map(sessHtml).join('') + '</div>' +
            '<div class="et-note"><i class="fas fa-circle-info"></i>Times are East Africa Time. Each student only gets the exams in subjects they take.</div></div>' +
          '<div class="et-f wide"><label for="etInstr">Instructions for everyone (optional)</label><textarea id="etInstr" maxlength="1500" placeholder="For example: exams are on East Africa Time. If you are unwell on an exam day, ask your parent to message the Studio Desk before it starts.">' + esc(E.instructions) + '</textarea></div>' +
          '<div class="et-sec"><div class="et-lb"><i class="fas fa-user-graduate"></i> Who gets it</div>' +
            '<div class="et-seg" role="radiogroup"><label><input type="radio" name="etAud" value="class"' + (E.audience === 'class' ? ' checked' : '') + '> Everyone who matches</label><label><input type="radio" name="etAud" value="students"' + (E.audience === 'students' ? ' checked' : '') + '> Only students I pick</label></div>' +
            (E.audience === 'class' ? '<div class="et-note"><i class="fas fa-users"></i>Every active online and remote student in ' + esc(ksShort(E.keyStage)) + (E.year ? ' Year ' + esc(E.year) : '') + (E.board ? ' on ' + esc(boardLabel(E.board)) : '') + ' who takes at least one of these subjects, and their parents.</div>' : studentsHtml()) +
            '<div class="et-lb" style="margin-top:.3rem">Tutors</div>' +
            '<div class="et-seg" role="radiogroup"><label><input type="radio" name="etTut" value="all"' + (E.tutorsMode !== 'none' ? ' checked' : '') + '> Tutors who teach these subjects</label><label><input type="radio" name="etTut" value="none"' + (E.tutorsMode === 'none' ? ' checked' : '') + '> No tutors</label></div></div>' +
          (E.status === 'published' ? '<div class="et-note"><i class="fas fa-circle-info"></i>This timetable is published. Saved changes show in the portals straight away; press <b>Send update</b> to tell everyone and email the new PDF.</div>' : '');
        m.foot.innerHTML = '<span class="err"></span><span class="grow"></span><button type="button" class="et-btn" data-c>Cancel</button><button type="button" class="et-btn" data-save><i class="fas fa-floppy-disk"></i> Save' + (E.status === 'published' ? '' : ' draft') + '</button><button type="button" class="et-btn pri" data-savepub><i class="fas fa-paper-plane"></i> Save and ' + (E.status === 'published' ? 'send update' : 'publish') + '</button>';
        m.foot.querySelector('[data-c]').onclick = m.close;
        m.foot.querySelector('[data-save]').onclick = function () { save(false); };
        m.foot.querySelector('[data-savepub]').onclick = function () { save(true); };
      }
      function loadStudents() {
        E.students = null; paint();
        FS().collection('students').where('keyStage', '==', E.keyStage).get().then(function (snap) {
          E.students = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) {
            var st = String(s.status || '').toLowerCase(); return st !== 'suspended' && s.studentType !== 'tuition';
          }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
          paint();
        }).catch(function (e) { E.students = []; paint(); toast(errText(e), true); });
      }
      /* Keep typed values without repainting on every key. */
      m.body.addEventListener('input', function (e) {
        var t = e.target, row = t.closest('.et-sess');
        if (row && t.dataset.k) { var s = E.sessions[Number(row.dataset.i)]; s[t.dataset.k] = t.value; if (t.dataset.k === 'subjectId') s.subjectName = subjectName(t.value); return; }
        if (t.id === 'etTitle') E.title = t.value; else if (t.id === 'etSeries') E.series = t.value; else if (t.id === 'etInstr') E.instructions = t.value;
        else if (t.dataset.q !== undefined && t.matches('[data-q]')) { E.q = t.value; var pos = t.selectionStart; paint(); var i = m.body.querySelector('[data-q]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
      });
      m.body.addEventListener('change', function (e) {
        var t = e.target, row = t.closest('.et-sess');
        if (row && t.dataset.k) { var s = E.sessions[Number(row.dataset.i)]; s[t.dataset.k] = t.value; if (t.dataset.k === 'subjectId') s.subjectName = subjectName(t.value); return; }
        if (t.id === 'etKs') { E.keyStage = t.value; E.year = ''; E.picked = {}; if (E.audience === 'students') loadStudents(); else paint(); }
        else if (t.id === 'etYear') { E.year = t.value; paint(); }
        else if (t.id === 'etBoard') { E.board = t.value; paint(); }
        else if (t.name === 'etAud') { E.audience = t.value; if (t.value === 'students' && !E.students) loadStudents(); else paint(); }
        else if (t.name === 'etTut') { E.tutorsMode = t.value; }
        else if (t.matches('[data-pick]')) { if (t.checked) E.picked[t.value] = 1; else delete E.picked[t.value]; var c = m.body.querySelector('.et-pick .cnt'); if (c) c.textContent = Object.keys(E.picked).length + ' ticked'; }
      });
      m.body.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.matches('[data-add]')) { E.sessions.push(blankSession(E.sessions[E.sessions.length - 1])); paint(); var rows = m.body.querySelectorAll('.et-sess'); var last = rows[rows.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); var f = last.querySelector('[data-k="subjectId"]'); if (f) f.focus(); } }
        else if (b.dataset.rm !== undefined) { E.sessions.splice(Number(b.dataset.rm), 1); if (!E.sessions.length) E.sessions.push(blankSession()); paint(); }
        else if (b.matches('[data-all]')) { [].forEach.call(m.body.querySelectorAll('[data-pick]'), function (x) { E.picked[x.value] = 1; }); paint(); }
        else if (b.matches('[data-none]')) { E.picked = {}; paint(); }
      });

      function save(andPublish) {
        var err = m.foot.querySelector('.err'); err.textContent = '';
        var sessions = E.sessions.filter(function (s) { return s.subjectId || s.date || s.paper; });
        var bad = sessions.filter(function (s) { return !s.subjectId || !s.date || !s.start; });
        if (!E.title.trim()) { err.textContent = 'Give the timetable a title.'; return; }
        if (!sessions.length) { err.textContent = 'Add at least one exam.'; return; }
        if (bad.length) { err.textContent = 'Every exam needs a subject, a date and a start time.'; return; }
        if (sessions.some(function (s) { return s.end && mins(s.end) <= mins(s.start); })) { err.textContent = 'An exam ends before it starts. Check the times.'; return; }
        if (E.audience === 'students' && !Object.keys(E.picked).length) { err.textContent = 'Tick at least one student, or choose Everyone who matches.'; return; }
        var data = {
          title: E.title.trim().slice(0, 120), series: E.series.trim().slice(0, 80), keyStage: E.keyStage,
          year: E.year ? Number(E.year) : null, board: E.board || '', instructions: E.instructions.trim().slice(0, 1500),
          sessions: sortSessions(sessions).map(function (s) { return { id: s.id || ('s' + uid6()), subjectId: s.subjectId, subjectName: s.subjectName || subjectName(s.subjectId), paper: (s.paper || '').trim(), date: s.date, start: s.start, end: s.end || '', mode: s.mode || '', room: (s.room || '').trim(), notes: (s.notes || '').trim() }; }),
          audience: E.audience, pickedStudents: E.audience === 'students' ? Object.keys(E.picked) : [], tutorsMode: E.tutorsMode,
          updatedAt: FV().serverTimestamp()
        };
        var btns = m.foot.querySelectorAll('button'); [].forEach.call(btns, function (x) { x.disabled = true; });
        var p = E.id ? FS().collection('examTimetables').doc(E.id).update(data).then(function () { return E.id; })
          : FS().collection('examTimetables').add(Object.assign(data, { status: 'draft', createdAt: FV().serverTimestamp(), createdBy: opts.uid || (firebase.auth().currentUser || {}).uid || '' })).then(function (ref) { return ref.id; });
        p.then(function (id) {
          m.close();
          if (andPublish) publish(Object.assign({ id: id, status: E.status }, data));
          else toast('Saved.');
        }).catch(function (e) { [].forEach.call(btns, function (x) { x.disabled = false; }); err.textContent = errText(e); });
      }
      if (E.audience === 'students') loadStudents(); else paint();
    }

    unsub = FS().collection('examTimetables').orderBy('updatedAt', 'desc').limit(100).onSnapshot(function (snap) {
      items = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      render();
    }, function (e) { root.innerHTML = '<div class="et-empty">Could not load exam timetables: ' + esc(errText(e)) + '</div>'; });
    return { destroy: function () { if (unsub) unsub(); } };
  }

  /* ========================================================== VIEWER */
  var viewers = [];
  function mountViewer(host, opts) {
    style();
    opts = opts || {};
    var field = opts.role === 'parent' ? 'parentIds' : (opts.role === 'tutor' ? 'tutorIds' : 'studentIds');
    var items = [], ready = false;
    host.innerHTML = '<div class="et"></div>';
    var root = host.firstChild;
    function childId() { return typeof opts.childId === 'function' ? opts.childId() : opts.childId; }
    function mine(tt) {
      var all = sortSessions(tt.sessions);
      var ids = opts.role === 'tutor' ? (tt.tutorSessions || {})[opts.uid] : (tt.studentSessions || {})[opts.role === 'parent' ? childId() : opts.uid];
      if (!ids) return opts.role === 'parent' ? null : all;
      return all.filter(function (s) { return ids.indexOf(s.id) !== -1; });
    }
    function render() {
      var rows = items.map(function (tt) { return { tt: tt, list: mine(tt) }; }).filter(function (r) { return r.list && r.list.length; });
      var now = Date.now();
      var live = rows.filter(function (r) { return endMs(r.list[r.list.length - 1]) >= now; }).sort(function (a, b) { return startMs(a.list[0]) - startMs(b.list[0]); });
      var past = rows.filter(function (r) { return endMs(r.list[r.list.length - 1]) < now; });
      var sub = opts.role === 'tutor' ? 'Exams in the subjects you teach. Help your students prepare.' : (opts.role === 'parent' ? 'Exams set by the Studio Desk for your child. The PDF is also in your email.' : 'Your exams, day by day. Download your own PDF any time.');
      var h = '<div class="et-bar"><div><h3><i class="fas fa-calendar-check" style="color:var(--et-teal);margin-right:.4rem"></i>Exam timetable</h3><div class="sub">' + esc(sub) + '</div></div></div>';
      if (!ready) h += '<div class="et-empty"><i class="fas fa-spinner fa-spin"></i>Loading…</div>';
      else if (!live.length && !past.length) h += '<div class="et-empty"><i class="fas fa-calendar"></i>No exam timetable yet. When the Studio Desk publishes one it appears here' + (opts.role === 'tutor' ? '.' : ' and is emailed to you.') + '</div>';
      else {
        h += live.map(cardHtml).join('');
        if (past.length) h += '<details class="et-past"><summary><i class="fas fa-box-archive"></i> Past exam timetables (' + past.length + ')</summary><div class="et-list" style="margin-top:.5rem">' + past.map(cardHtml).join('') + '</div></details>';
      }
      root.innerHTML = h;
    }
    function cardHtml(r) {
      var tt = r.tt, list = r.list, now = Date.now();
      var next = list.filter(function (s) { return endMs(s) >= now; })[0];
      var running = next && startMs(next) <= now;
      return '<article class="et-card' + (next ? ' live' : '') + '">' +
        '<div class="et-head"><div class="et-title"><b>' + esc(tt.title || 'Exam timetable') + '</b><small>' + esc([tt.series, list.length + ' exam' + (list.length === 1 ? '' : 's'), spanText(list)].filter(Boolean).join(' · ')) + '</small></div><div class="et-chips">' + scopeChips(tt) + (next ? '' : '<span class="et-chip past">Finished</span>') + '</div></div>' +
        (next ? '<div class="et-next"><span class="ic"><i class="fas fa-' + (running ? 'pen-nib' : 'hourglass-half') + '"></i></span><div><b>' + (running ? 'Now: ' : 'Next: ') + esc(next.subjectName || subjectName(next.subjectId)) + (next.paper ? ', ' + esc(next.paper) : '') + '</b><span>' + esc(dayLabel(next.date, true)) + ' · ' + esc(next.start) + (next.end ? ' - ' + esc(next.end) : '') + (next.mode ? ' · ' + esc(next.mode) : '') + '</span></div><span class="when">' + (running ? 'In progress' : esc(untilWords(startMs(next)))) + '</span></div>' : '') +
        '<div class="et-days">' + daysHtml(list) + '</div>' +
        (tt.instructions ? '<div class="et-note"><i class="fas fa-circle-info"></i>' + esc(tt.instructions) + '</div>' : '') +
        '<div class="et-actions"><span class="grow"></span><button type="button" class="et-btn sm pri" data-pdf="' + esc(tt.id) + '"><i class="fas fa-file-pdf"></i> Download PDF</button></div></article>';
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pdf]'); if (!b || b.disabled) return;
      if (!firebase.functions) { toast('PDF download is not available on this page.', true); return; }
      var was = b.innerHTML; b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';
      call('examTimetablePdf', { id: b.dataset.pdf, childId: opts.role === 'parent' ? childId() : undefined })
        .then(function (r) { downloadBase64(r.data.base64, r.data.fileName); })
        .catch(function (err) { toast(errText(err), true); })
        .then(function () { b.disabled = false; b.innerHTML = was; });
    });
    var unsub = FS().collection('examTimetables').where(field, 'array-contains', opts.uid).onSnapshot(function (snap) {
      items = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); ready = true; render();
    }, function (e) { ready = true; console.warn('exam timetables:', e.message || e); render(); });
    var api = { refresh: render, destroy: function () { unsub(); viewers = viewers.filter(function (v) { return v !== api; }); } };
    viewers.push(api);
    /* Countdowns and "finished" states move on by themselves. */
    var tick = setInterval(function () { if (!host.isConnected) { clearInterval(tick); return; } render(); }, 60000);
    render();
    return api;
  }

  global.ExamTimetable = {
    mountAdmin: mountAdmin, mountViewer: mountViewer,
    refreshAll: function () { viewers.forEach(function (v) { v.refresh(); }); },
    _h: { daysHtml: daysHtml, duration: duration, sortSessions: sortSessions }
  };
})(window);
