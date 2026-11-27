/* =========================================================
   EXAM RESULTS ANALYTICS — Paisley Studio
   -----------------------------------------------------------
   Exams only (never homework or classwork).

   PaisleyExamResults.load(studentId) -> Promise<{ items, error }>
     Every released, graded exam of one student:
       • exam papers marked in the Classroom: any .../exams/{eid}/submissions/{studentId}
         with status 'Graded', released true and a grade (one collection-group query on
         submissions.studentId; needs the fieldOverride in firestore.indexes.json)
       • older released examResults (studentId, released)
     item: { id, subjectId, subject, title, type, score, max, pct, date, feedback }

   PaisleyExamResults.mount(host, { items, title, sub, who, loading, error, role })
     The dashboard: filters (subject, period), headline tiles, line chart (each subject
     over time), monthly averages, averages by subject, first vs latest per subject,
     what the numbers say, a per-subject table, every result, CSV and PDF (print) downloads.
     Returns { update(items, opts) }.

   PaisleyExamResults.summary(items) -> { count, avg, latest, trend, delta }  (tutor list)
   Needs Chart.js 4 (loaded on demand when the page has not).
========================================================= */
(function (global) {
  'use strict';

  var FS = function () { return global.db || firebase.firestore(); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toDate(ts) { if (!ts) return null; if (ts.toDate) return ts.toDate(); var d = new Date(ts); return isNaN(d.getTime()) ? null : d; }
  function fmtDate(d) { return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthLabel(k) { var p = k.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function r0(x) { return x == null ? null : Math.round(x); }
  function subjectNameOf(id) {
    var s = (global.LMZ_SUBJECTS || []).filter(function (x) { return x.id === id || (x.aliases || []).indexOf(id) !== -1; })[0];
    return s ? s.name : (id ? String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Subject');
  }
  function subjectIdOf(name) {
    var n = String(name || '').toLowerCase().trim();
    var s = (global.LMZ_SUBJECTS || []).filter(function (x) { return x.name.toLowerCase() === n || x.id === n || (x.aliases || []).indexOf(n) !== -1; })[0];
    return s ? s.id : n.replace(/\s+/g, '-');
  }

  /* Reference palette (dataviz skill, validated: adjacent CVD ΔE ≥ 11.8, normal ≥ 20.5).
     Slot order is fixed; a subject keeps its colour whatever the filter shows. */
  var SERIES = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'];
  var INK = '#191919', INK2 = '#666666', GRID = '#e7e7e7', AXIS = '#c2c2c2';
  var STATUS = { good: '#0aac23', warning: '#fbb315', critical: '#dc3c3d', goodText: '#006c10' };
  var SEQ = { light: '#84b9f3', mid: '#257de0', dark: '#1757ac' };

  /* ---------------------------------------------------------- data */
  async function load(studentId) {
    var items = [], error = null, db = FS();
    var examCache = {}, clsCache = {};
    function getOnce(cache, ref) {
      if (!cache[ref.path]) cache[ref.path] = ref.get().then(function (s) { return s.exists ? s.data() : null; }).catch(function () { return null; });
      return cache[ref.path];
    }
    try {
      var snap = await db.collectionGroup('submissions').where('studentId', '==', studentId).get();
      var rows = snap.docs.filter(function (d) {
        var p = d.ref.path.split('/');
        return p.length >= 4 && p[p.length - 4] === 'exams';
      });
      await Promise.all(rows.map(async function (d) {
        var x = d.data() || {};
        if (x.released !== true || x.status !== 'Graded' || x.grade == null || x.grade === '') return;
        var p = d.ref.path.split('/');
        var examRef = d.ref.parent.parent;
        var cid = p[0] === 'classrooms' ? p[1] : '';
        var res = await Promise.all([getOnce(examCache, examRef), cid ? getOnce(clsCache, db.collection('classrooms').doc(cid)) : Promise.resolve(null)]);
        var ex = res[0] || {}, cls = res[1] || {};
        var score = Number(x.grade), max = Number(x.maxScore);
        if (!isFinite(score)) return;
        if (!isFinite(max) || max <= 0) max = score <= 100 ? 100 : score;
        var sid = ex.subjectId || cls.subjectId || subjectIdOf(ex.subjectName || x.subject);
        items.push({
          id: d.ref.path, source: 'classroom', cid: cid,
          subjectId: sid, subject: ex.subjectName || cls.subjectName || subjectNameOf(sid),
          title: ex.title || x.examTitle || 'Exam', type: ex.examType || 'Exam',
          score: score, max: max, pct: Math.max(0, Math.min(100, score / max * 100)),
          date: toDate(ex.examDate) || toDate(x.gradedAt) || toDate(x.submittedAt) || toDate(x.updatedAt),
          feedback: x.feedback || '', gradedFileUrl: x.gradedFileUrl || ''
        });
      }));
    } catch (e) {
      error = e;
      console.warn('exam results (classroom):', e.message || e);
    }
    try {
      var old = await db.collection('examResults').where('studentId', '==', studentId).where('released', '==', true).get();
      old.docs.forEach(function (d) {
        var r = d.data() || {};
        var score = Number(r.score), max = Number(r.maxScore);
        if (!isFinite(score) || !isFinite(max) || max <= 0) return;
        var sid = r.subjectId || subjectIdOf(r.subject);
        items.push({
          id: 'examResults/' + d.id, source: 'examResults', subjectId: sid, subject: r.subject || subjectNameOf(sid),
          title: r.examTitle || r.title || 'Exam', type: r.examType || 'Exam',
          score: score, max: max, pct: Math.max(0, Math.min(100, score / max * 100)),
          date: toDate(r.date) || toDate(r.createdAt), feedback: r.feedback || ''
        });
      });
    } catch (e) { console.warn('exam results (examResults):', e.message || e); }
    items.sort(function (a, b) { return (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0); });
    return { items: items, error: items.length ? null : error };
  }

  /* ---------------------------------------------------------- analysis */
  /* Rising / falling / steady: the latest few exams against the few before them
     (up to 3 each); with 2-3 results, the latest against the first. ±3 points is steady. */
  function trendOf(list) {
    var p = list.map(function (x) { return x.pct; });
    if (p.length < 2) return { key: 'first', delta: null };
    var k = Math.min(3, Math.floor(p.length / 2));
    var delta = p.length >= 4 ? mean(p.slice(-k)) - mean(p.slice(-2 * k, -k)) : p[p.length - 1] - p[0];
    return { key: delta >= 3 ? 'up' : (delta <= -3 ? 'down' : 'flat'), delta: delta };
  }
  function band(pct) { return pct >= 70 ? 'good' : (pct >= 50 ? 'warning' : 'critical'); }
  function bandLabel(pct) { return pct >= 70 ? 'Strong' : (pct >= 50 ? 'Working towards' : 'Needs support'); }
  function byDate(a, b) { return (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0); }
  /* Overall direction = the mean of each subject's own direction, so a weak subject that
     happens to come last does not make every subject look like it is falling. */
  function summary(items) {
    var list = (items || []).filter(function (x) { return x.date; }).sort(byDate);
    var subs = bySubject(list).filter(function (s) { return s.count > 1; });
    var delta = subs.length ? mean(subs.map(function (s) { return s.delta; })) : null;
    var key = delta == null ? 'first' : (delta >= 3 ? 'up' : (delta <= -3 ? 'down' : 'flat'));
    return { count: list.length, avg: r0(mean(list.map(function (x) { return x.pct; }))), latest: list[list.length - 1] || null, trend: key, delta: delta };
  }
  function bySubject(list) {
    var m = {};
    list = list.slice().sort(function (a, b) { return (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0); });
    list.forEach(function (x) { (m[x.subjectId] = m[x.subjectId] || []).push(x); });
    return Object.keys(m).map(function (id) {
      var l = m[id], t = trendOf(l), p = l.map(function (x) { return x.pct; });
      return { id: id, name: l[0].subject, list: l, count: l.length, avg: mean(p), best: Math.max.apply(null, p), low: Math.min.apply(null, p),
        first: l[0], latest: l[l.length - 1], prev: l.length > 1 ? l[l.length - 2] : null, trend: t.key, delta: t.delta };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function byMonth(list) {
    var m = {};
    list.forEach(function (x) { if (x.date) (m[monthKey(x.date)] = m[monthKey(x.date)] || []).push(x.pct); });
    return Object.keys(m).sort().map(function (k) { return { key: k, label: monthLabel(k), avg: mean(m[k]), count: m[k].length }; });
  }
  function insights(list, subs, months) {
    var out = [];
    subs.forEach(function (s) {
      if (s.count < 2) return;
      var d = Math.round(s.delta);
      if (s.trend === 'up') out.push({ k: 'up', t: s.name + ' is rising: up ' + d + ' points (' + r0(s.first.pct) + '% at first, ' + r0(s.latest.pct) + '% in the latest exam).' });
      else if (s.trend === 'down') out.push({ k: 'down', t: s.name + ' is falling: down ' + Math.abs(d) + ' points (' + r0(s.prev.pct) + '% before, ' + r0(s.latest.pct) + '% in the latest exam). Worth a closer look.' });
      else out.push({ k: 'flat', t: s.name + ' is steady at about ' + r0(s.avg) + '%.' });
    });
    var low = subs.filter(function (s) { return s.avg < 50; });
    if (low.length) out.push({ k: 'down', t: 'Below 50% on average: ' + low.map(function (s) { return s.name + ' (' + r0(s.avg) + '%)'; }).join(', ') + '. Extra practice and tutor support will help most here.' });
    if (subs.length > 1) {
      var best = subs.slice().sort(function (a, b) { return b.avg - a.avg; })[0];
      out.push({ k: 'up', t: 'Strongest subject: ' + best.name + ' at ' + r0(best.avg) + '% on average.' });
    }
    if (months.length > 1) {
      var bm = months.slice().sort(function (a, b) { return b.avg - a.avg; })[0], wm = months.slice().sort(function (a, b) { return a.avg - b.avg; })[0];
      out.push({ k: 'flat', t: 'Best month: ' + bm.label + ' (' + r0(bm.avg) + '% over ' + bm.count + ' exam' + (bm.count === 1 ? '' : 's') + '). Weakest month: ' + wm.label + ' (' + r0(wm.avg) + '%).' });
    }
    return out;
  }

  /* ---------------------------------------------------------- Chart.js on demand */
  var chartJs = null;
  function needChart() {
    if (global.Chart) return Promise.resolve(global.Chart);
    if (!chartJs) chartJs = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.onload = function () { res(global.Chart); }; s.onerror = rej;
      document.head.appendChild(s);
    });
    return chartJs;
  }

  /* ---------------------------------------------------------- styles */
  function style() {
    if (document.getElementById('xa-style')) return;
    var st = document.createElement('style'); st.id = 'xa-style';
    st.textContent = [
      '.xa{--xa-deep:var(--brand-deep,#245F5A);--xa-teal:var(--brand,#55BFB3);--xa-line:var(--line,rgba(38,51,49,.1));--xa-paper:var(--paper,#F1F9F7);--xa-muted:#666666;display:grid;gap:1rem;min-width:0}',
      '.xa *{box-sizing:border-box}',
      '.xa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem;flex-wrap:wrap}',
      '.xa-head h3{margin:0;font-size:1.05rem;color:var(--xa-deep)}.xa-head .sub{font-size:.8rem;color:var(--xa-muted);margin-top:.15rem}',
      '.xa-tools{display:flex;gap:.45rem;flex-wrap:wrap;align-items:center}',
      '.xa-btn{display:inline-flex;align-items:center;gap:.4rem;font:inherit;font-size:.78rem;font-weight:700;padding:.45rem .8rem;border-radius:10px;border:1.5px solid var(--xa-line);background:#fff;color:#263331;cursor:pointer;white-space:nowrap}',
      '.xa-btn:hover{border-color:var(--xa-teal);color:var(--xa-deep)}',
      '.xa-filters{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem;background:var(--xa-paper);border:1px solid var(--xa-line);border-radius:12px}',
      '.xa-filters label{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--xa-muted)}',
      '.xa-filters select{font:inherit;font-size:.82rem;padding:.4rem .6rem;border:1.5px solid var(--xa-line);border-radius:9px;background:#fff;color:#263331}',
      '.xa-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;background:#fff;border:1px solid var(--xa-line);border-radius:10px}',
      '.xa-seg button{font:inherit;font-size:.76rem;font-weight:700;border:0;background:transparent;color:var(--xa-muted);padding:.32rem .7rem;border-radius:7px;cursor:pointer}',
      '.xa-seg button.on{background:var(--xa-deep);color:#fff}',
      '.xa-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6rem}',
      '.xa-tile{background:#fff;border:1px solid var(--xa-line);border-radius:12px;padding:.75rem .85rem;min-width:0}',
      '.xa-tile .l{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--xa-muted)}',
      '.xa-tile .v{font-size:1.5rem;font-weight:800;color:#191919;line-height:1.2;margin-top:.15rem;overflow-wrap:anywhere}',
      '.xa-tile .s{font-size:.76rem;color:var(--xa-muted);margin-top:.1rem}',
      '.xa-pill{display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;font-weight:800;padding:.18rem .55rem;border-radius:99px;white-space:nowrap}',
      '.xa-pill.up{background:rgba(10,172,35,.12);color:' + STATUS.goodText + '}',
      '.xa-pill.down{background:rgba(220,60,61,.12);color:#a82a2b}',
      '.xa-pill.flat,.xa-pill.first{background:rgba(102,102,102,.12);color:#4d4d4d}',
      '.xa-pill.good{background:rgba(10,172,35,.12);color:' + STATUS.goodText + '}.xa-pill.warning{background:rgba(251,179,21,.2);color:#7a5600}.xa-pill.critical{background:rgba(220,60,61,.12);color:#a82a2b}',
      '.xa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}',
      '.xa-card{background:#fff;border:1px solid var(--xa-line);border-radius:14px;padding:.85rem .9rem;min-width:0}',
      '.xa-card.wide{grid-column:1/-1}',
      '.xa-card h4{margin:0;font-size:.9rem;color:#191919}.xa-card .cs{font-size:.76rem;color:var(--xa-muted);margin:.1rem 0 .55rem}',
      '.xa-chart{position:relative;height:260px}.xa-card.wide .xa-chart{height:300px}',
      '.xa-ins{display:grid;gap:.4rem;margin:0;padding:0;list-style:none}',
      '.xa-ins li{display:flex;gap:.55rem;align-items:flex-start;font-size:.84rem;color:#263331;line-height:1.45}',
      '.xa-ins li i{margin-top:.2rem;width:1rem;text-align:center}',
      '.xa-ins li.up i{color:' + STATUS.good + '}.xa-ins li.down i{color:' + STATUS.critical + '}.xa-ins li.flat i{color:#666}',
      '.xa-table{width:100%;border-collapse:collapse;font-size:.82rem}',
      '.xa-table th{text-align:left;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--xa-muted);padding:.5rem .55rem;border-bottom:1px solid var(--xa-line);white-space:nowrap}',
      '.xa-table td{padding:.55rem;border-bottom:1px solid rgba(38,51,49,.06);vertical-align:top}',
      '.xa-table td.n{font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.xa-sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:.45rem;vertical-align:-1px}',
      '.xa-scroll{overflow-x:auto}',
      '.xa-empty{padding:1.4rem;text-align:center;color:var(--xa-muted);font-size:.88rem;background:var(--xa-paper);border:1px dashed var(--xa-line);border-radius:12px}',
      '.xa-empty i{display:block;font-size:1.4rem;color:var(--xa-teal);margin-bottom:.45rem}',
      '@media (max-width:820px){.xa-grid{grid-template-columns:1fr}.xa-chart,.xa-card.wide .xa-chart{height:240px}}',
      '@media (max-width:520px){.xa-tiles{grid-template-columns:1fr 1fr}.xa-tile .v{font-size:1.25rem}.xa-tools .xa-btn{flex:1 1 auto;justify-content:center}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function trendPill(key, delta) {
    if (key === 'up') return '<span class="xa-pill up"><i class="fas fa-arrow-trend-up"></i> Rising' + (delta != null ? ' +' + Math.round(delta) : '') + '</span>';
    if (key === 'down') return '<span class="xa-pill down"><i class="fas fa-arrow-trend-down"></i> Falling ' + (delta != null ? Math.round(delta) : '') + '</span>';
    if (key === 'flat') return '<span class="xa-pill flat"><i class="fas fa-minus"></i> Steady</span>';
    return '<span class="xa-pill first"><i class="fas fa-flag"></i> First result</span>';
  }
  function bandPill(pct) {
    var b = band(pct);
    return '<span class="xa-pill ' + b + '"><i class="fas fa-' + (b === 'good' ? 'circle-check' : (b === 'warning' ? 'circle-half-stroke' : 'circle-exclamation')) + '"></i> ' + bandLabel(pct) + '</span>';
  }

  /* ---------------------------------------------------------- dashboard */
  var PERIODS = [['all', 'All time'], ['year', 'This school year'], ['6m', 'Last 6 months'], ['3m', 'Last 3 months']];
  function periodStart(k) {
    var now = new Date();
    if (k === '3m') return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    if (k === '6m') return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    if (k === 'year') return new Date(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1, 8, 1);   // from 1 September
    return null;
  }

  function mount(host, opts) {
    style();
    opts = opts || {};
    function sorted(a) { return (a || []).slice().sort(function (x, y) { return (x.date ? x.date.getTime() : 0) - (y.date ? y.date.getTime() : 0); }); }
    var S = { items: sorted(opts.items), subject: opts.subject || '', period: 'all', loading: !!opts.loading, error: opts.error || null, charts: [] };
    host.innerHTML = '<div class="xa"></div>';
    var root = host.firstChild;
    var colorOf = {};
    function assignColours() {
      /* Fixed slot per subject, by name, over ALL of this student's exams: a filter never repaints a subject. */
      var names = []; S.items.forEach(function (x) { if (names.indexOf(x.subjectId) === -1) names.push(x.subjectId); });
      names.sort(function (a, b) { return subjectNameOf(a).localeCompare(subjectNameOf(b)); });
      colorOf = {}; names.forEach(function (id, i) { colorOf[id] = SERIES[i % SERIES.length]; });
    }
    function filtered() {
      var from = periodStart(S.period);
      return S.items.filter(function (x) { return x.date && (!S.subject || x.subjectId === S.subject) && (!from || x.date >= from); });
    }
    function destroyCharts() { S.charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); S.charts = []; }

    function render() {
      destroyCharts();
      assignColours();
      var subjectsAll = bySubject(S.items.filter(function (x) { return x.date; }));
      var list = filtered(), subs = bySubject(list), months = byMonth(list), sum = summary(list);
      var h = '<div class="xa-head"><div><h3><i class="fas fa-chart-line" style="color:var(--xa-teal);margin-right:.4rem"></i>' + esc(opts.title || 'Exam results') + '</h3><div class="sub">' + esc(opts.sub || 'Exams only: every released exam result, its trend and how each subject is going.') + '</div></div>' +
        '<div class="xa-tools"><button type="button" class="xa-btn" data-x="csv"' + (list.length ? '' : ' disabled') + '><i class="fas fa-file-csv"></i> Download CSV</button><button type="button" class="xa-btn" data-x="pdf"' + (list.length ? '' : ' disabled') + '><i class="fas fa-file-pdf"></i> PDF report</button></div></div>';
      if (S.loading) { root.innerHTML = h + '<div class="xa-empty"><i class="fas fa-spinner fa-spin"></i>Loading exam results…</div>'; return; }
      if (!S.items.length) {
        root.innerHTML = h + '<div class="xa-empty"><i class="fas fa-chart-column"></i>' + (S.error ? 'Exam results could not be loaded right now. Please refresh in a minute.' : 'No exam results yet. They appear here as soon as a marked exam is released.') + '</div>';
        return;
      }
      h += '<div class="xa-filters" role="group" aria-label="Filters"><label for="xaSubj">Subject</label><select id="xaSubj"><option value="">All subjects</option>' +
        subjectsAll.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === S.subject ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>' +
        '<label style="margin-left:.4rem">Period</label><div class="xa-seg">' + PERIODS.map(function (p) { return '<button type="button" data-p="' + p[0] + '" class="' + (S.period === p[0] ? 'on' : '') + '">' + p[1] + '</button>'; }).join('') + '</div></div>';
      if (!list.length) { root.innerHTML = h + '<div class="xa-empty"><i class="fas fa-filter"></i>No exams in this period. Choose a longer period or another subject.</div>'; bind(); return; }

      var best = subs.slice().sort(function (a, b) { return b.avg - a.avg; })[0], weak = subs.slice().sort(function (a, b) { return a.avg - b.avg; })[0];
      h += '<div class="xa-tiles">' +
        tile('Exams', list.length, subs.length + ' subject' + (subs.length === 1 ? '' : 's')) +
        tile('Average', r0(sum.avg) + '%', bandLabel(sum.avg)) +
        tile('Latest', r0(sum.latest.pct) + '%', sum.latest.subject + ', ' + fmtDate(sum.latest.date)) +
        '<div class="xa-tile"><div class="l">Trend</div><div class="v" style="font-size:1.05rem;margin-top:.45rem">' + trendPill(sum.trend, sum.delta) + '</div><div class="s">' + (sum.trend === 'first' ? 'More exams will show the direction' : 'Each subject: latest exams against the ones before') + '</div></div>' +
        (subs.length > 1 ? tile('Strongest', best.name, r0(best.avg) + '% average') + tile('Needs most work', weak.name, r0(weak.avg) + '% average') : '') +
        '</div>';

      var ins = insights(list, subs, months);
      if (ins.length) h += '<div class="xa-card"><h4>What the numbers say</h4><div class="cs">Worked out from the exams shown</div><ul class="xa-ins">' + ins.map(function (x) {
        return '<li class="' + x.k + '"><i class="fas fa-' + (x.k === 'up' ? 'arrow-trend-up' : (x.k === 'down' ? 'arrow-trend-down' : 'minus')) + '"></i><span>' + esc(x.t) + '</span></li>';
      }).join('') + '</ul></div>';

      h += '<div class="xa-grid">' +
        '<div class="xa-card wide"><h4>Exam scores over time</h4><div class="cs">Each exam as a percentage, one line per subject. Hover a point for the exam.</div><div class="xa-chart"><canvas id="xaLine" role="img" aria-label="Exam scores over time by subject"></canvas></div></div>' +
        '<div class="xa-card"><h4>Average by month</h4><div class="cs">Mean exam score in each month</div><div class="xa-chart"><canvas id="xaMonth" role="img" aria-label="Average exam score by month"></canvas></div></div>' +
        '<div class="xa-card"><h4>Average by subject</h4><div class="cs">Mean exam score per subject</div><div class="xa-chart"><canvas id="xaSubjBar" role="img" aria-label="Average exam score by subject"></canvas></div></div>' +
        (subs.some(function (s) { return s.count > 1; }) ? '<div class="xa-card wide"><h4>First exam against latest exam</h4><div class="cs">How far each subject has moved</div><div class="xa-chart"><canvas id="xaMove" role="img" aria-label="First and latest exam score per subject"></canvas></div></div>' : '') +
        '</div>';

      h += '<div class="xa-card"><h4>By subject</h4><div class="cs">Averages, best and lowest, and the direction of travel</div><div class="xa-scroll"><table class="xa-table"><thead><tr><th>Subject</th><th>Exams</th><th>Average</th><th>Best</th><th>Lowest</th><th>Latest</th><th>Trend</th><th>Level</th></tr></thead><tbody>' +
        subs.map(function (s) {
          return '<tr><td><span class="xa-sw" style="background:' + colorOf[s.id] + '"></span>' + esc(s.name) + '</td><td class="n">' + s.count + '</td><td class="n"><b>' + r0(s.avg) + '%</b></td><td class="n">' + r0(s.best) + '%</td><td class="n">' + r0(s.low) + '%</td><td class="n">' + r0(s.latest.pct) + '%</td><td>' + trendPill(s.trend, s.delta) + '</td><td>' + bandPill(s.avg) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';

      var rows = list.slice().reverse();
      h += '<div class="xa-card"><h4>Every exam result</h4><div class="cs">Most recent first. Change is against the previous exam in the same subject.</div><div class="xa-scroll"><table class="xa-table"><thead><tr><th>Date</th><th>Subject</th><th>Exam</th><th>Score</th><th>%</th><th>Change</th><th>Level</th></tr></thead><tbody>' +
        rows.map(function (x) {
          var same = list.filter(function (y) { return y.subjectId === x.subjectId; }), i = same.indexOf(x), prev = i > 0 ? same[i - 1] : null;
          var ch = prev ? Math.round(x.pct - prev.pct) : null;
          var chHtml = ch == null ? '<span class="xa-pill first">First</span>' : (ch > 0 ? '<span class="xa-pill up"><i class="fas fa-arrow-up"></i> +' + ch + '</span>' : (ch < 0 ? '<span class="xa-pill down"><i class="fas fa-arrow-down"></i> ' + ch + '</span>' : '<span class="xa-pill flat"><i class="fas fa-minus"></i> 0</span>'));
          return '<tr><td class="n">' + esc(fmtDate(x.date)) + '</td><td><span class="xa-sw" style="background:' + colorOf[x.subjectId] + '"></span>' + esc(x.subject) + '</td><td>' + esc(x.title) + (x.type && x.type !== 'Exam' ? '<div style="font-size:.72rem;color:#666">' + esc(x.type) + '</div>' : '') + '</td><td class="n">' + esc(x.score) + ' / ' + esc(x.max) + '</td><td class="n"><b>' + r0(x.pct) + '%</b></td><td>' + chHtml + '</td><td>' + bandPill(x.pct) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';

      root.innerHTML = h;
      bind();
      needChart().then(function () { drawCharts(list, subs, months); }).catch(function () {
        [].forEach.call(root.querySelectorAll('.xa-chart'), function (c) { c.innerHTML = '<div class="xa-empty" style="border:0">Charts could not load. The tables below have every number.</div>'; });
      });
    }
    function tile(l, v, s) { return '<div class="xa-tile"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }

    function baseOpts(extra) {
      var C = global.Chart;
      C.defaults.font.family = getComputedStyle(root).fontFamily || 'Quicksand, sans-serif';
      C.defaults.color = INK2;
      return Object.assign({
        responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: INK2, padding: 14 } },
          tooltip: { backgroundColor: '#ffffff', titleColor: INK, bodyColor: INK, borderColor: 'rgba(11,11,11,.12)', borderWidth: 1, padding: 10, displayColors: true, boxPadding: 4 }
        },
        scales: {
          x: { grid: { display: false }, border: { color: AXIS }, ticks: { color: INK2, maxRotation: 0, autoSkip: true } },
          y: { min: 0, max: 100, grid: { color: GRID }, border: { display: false }, ticks: { color: INK2, stepSize: 25, callback: function (v) { return v + '%'; } } }
        }
      }, extra || {});
    }

    function drawCharts(list, subs, months) {
      var C = global.Chart;
      /* 1. Line: one line per subject on a shared time axis (each exam at its date). */
      var dates = []; list.forEach(function (x) { var k = x.date.toISOString().slice(0, 10); if (dates.indexOf(k) === -1) dates.push(k); });
      dates.sort();
      var labels = dates.map(function (k) { return new Date(k + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); });
      var lineSets = subs.map(function (s) {
        var byDate = {}; s.list.forEach(function (x) { byDate[x.date.toISOString().slice(0, 10)] = x; });
        return {
          label: s.name, borderColor: colorOf[s.id], backgroundColor: colorOf[s.id], borderWidth: 2, tension: 0.25, spanGaps: true,
          pointRadius: 4, pointHoverRadius: 6, pointBorderColor: '#ffffff', pointBorderWidth: 2,
          data: dates.map(function (k) { return byDate[k] ? Math.round(byDate[k].pct) : null; }),
          _ex: dates.map(function (k) { return byDate[k] || null; })
        };
      });
      var lineEl = root.querySelector('#xaLine');
      if (lineEl) {
        var lo = baseOpts();
        lo.plugins.legend.display = lineSets.length > 1;
        lo.plugins.legend.position = 'bottom';
        lo.interaction = { mode: 'index', intersect: false };
        lo.plugins.tooltip.callbacks = {
          label: function (c) { var ex = c.dataset._ex[c.dataIndex]; return ex ? ' ' + c.dataset.label + ': ' + c.parsed.y + '% (' + ex.score + '/' + ex.max + ', ' + ex.title + ')' : null; }
        };
        lo.plugins.tooltip.filter = function (c) { return c.parsed.y != null; };
        S.charts.push(new C(lineEl, { type: 'line', data: { labels: labels, datasets: lineSets }, options: lo }));
      }
      /* 2. Bars: monthly average (one series, one hue). */
      var mEl = root.querySelector('#xaMonth');
      if (mEl) {
        var mo = baseOpts();
        mo.interaction = { mode: 'index', intersect: false };
        mo.plugins.tooltip.callbacks = { label: function (c) { var m = months[c.dataIndex]; return ' Average ' + Math.round(m.avg) + '% over ' + m.count + ' exam' + (m.count === 1 ? '' : 's'); } };
        S.charts.push(new C(mEl, { type: 'bar', data: { labels: months.map(function (m) { return m.label; }), datasets: [{ label: 'Average', data: months.map(function (m) { return Math.round(m.avg); }), backgroundColor: SEQ.mid, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 42 }] }, options: mo }));
      }
      /* 3. Bars: average by subject (each bar in its subject's colour, named on the axis). */
      var sEl = root.querySelector('#xaSubjBar');
      if (sEl) {
        var so = baseOpts({ indexAxis: 'y' });
        so.scales = { x: { min: 0, max: 100, grid: { color: GRID }, border: { display: false }, ticks: { color: INK2, stepSize: 25, callback: function (v) { return v + '%'; } } }, y: { grid: { display: false }, border: { color: AXIS }, ticks: { color: INK } } };
        so.interaction = { mode: 'index', intersect: false, axis: 'y' };
        so.plugins.tooltip.callbacks = { label: function (c) { var s = subs[c.dataIndex]; return ' Average ' + Math.round(s.avg) + '% over ' + s.count + ' exam' + (s.count === 1 ? '' : 's'); } };
        S.charts.push(new C(sEl, { type: 'bar', data: { labels: subs.map(function (s) { return s.name; }), datasets: [{ label: 'Average', data: subs.map(function (s) { return Math.round(s.avg); }), backgroundColor: subs.map(function (s) { return colorOf[s.id]; }), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 30 }] }, options: so }));
      }
      /* 4. Paired bars: first vs latest exam per subject (ordered light -> dark of one hue). */
      var vEl = root.querySelector('#xaMove');
      if (vEl) {
        var moved = subs.filter(function (s) { return s.count > 1; });
        var vo = baseOpts();
        vo.plugins.legend.display = true; vo.plugins.legend.position = 'bottom';
        vo.interaction = { mode: 'index', intersect: false };
        vo.plugins.tooltip.callbacks = {
          label: function (c) { var s = moved[c.dataIndex], x = c.datasetIndex ? s.latest : s.first; return ' ' + c.dataset.label + ': ' + Math.round(x.pct) + '% (' + x.title + ', ' + fmtDate(x.date) + ')'; },
          footer: function (cs) { var s = moved[cs[0].dataIndex], d = Math.round(s.latest.pct - s.first.pct); return d === 0 ? 'No change' : (d > 0 ? 'Up ' + d + ' points' : 'Down ' + Math.abs(d) + ' points'); }
        };
        S.charts.push(new C(vEl, { type: 'bar', data: { labels: moved.map(function (s) { return s.name; }), datasets: [
          { label: 'First exam', data: moved.map(function (s) { return Math.round(s.first.pct); }), backgroundColor: SEQ.light, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 34 },
          { label: 'Latest exam', data: moved.map(function (s) { return Math.round(s.latest.pct); }), backgroundColor: SEQ.dark, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 34 }
        ] }, options: vo }));
      }
    }

    function bind() {
      var sel = root.querySelector('#xaSubj');
      if (sel) sel.onchange = function () { S.subject = sel.value; render(); };
      [].forEach.call(root.querySelectorAll('[data-p]'), function (b) { b.onclick = function () { S.period = b.dataset.p; render(); }; });
      var csv = root.querySelector('[data-x="csv"]'); if (csv) csv.onclick = downloadCsv;
      var pdf = root.querySelector('[data-x="pdf"]'); if (pdf) pdf.onclick = printReport;
    }

    function fileBase() { return ((opts.who ? opts.who + ' - ' : '') + 'Exam results').replace(/[^\w\- ]+/g, '').trim(); }
    function downloadCsv() {
      var list = filtered();
      var rows = [['Date', 'Subject', 'Exam', 'Type', 'Score', 'Out of', 'Percent', 'Level']].concat(list.map(function (x) {
        return [x.date ? x.date.toISOString().slice(0, 10) : '', x.subject, x.title, x.type || 'Exam', x.score, x.max, Math.round(x.pct), bandLabel(x.pct)];
      }));
      var csv = '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = fileBase() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    /* PDF report: a print-ready page (Paisley header, tiles, charts as images, tables); the browser saves it as PDF. */
    function printReport() {
      var w = global.open('', '_blank');
      if (!w) { alert('Allow pop-ups for this site to download the PDF report.'); return; }
      var imgs = [].map.call(root.querySelectorAll('.xa-card'), function (card) {
        var cv = card.querySelector('canvas'); if (!cv) return '';
        try { return '<div class="c"><h4>' + esc(card.querySelector('h4').textContent) + '</h4><img src="' + cv.toDataURL('image/png') + '" alt=""></div>'; } catch (e) { return ''; }
      }).join('');
      var tables = [].map.call(root.querySelectorAll('.xa-card'), function (card) { var t = card.querySelector('table'); return t ? '<h4>' + esc(card.querySelector('h4').textContent) + '</h4>' + t.outerHTML : ''; }).join('');
      var ins = root.querySelector('.xa-ins'), tiles = root.querySelector('.xa-tiles');
      var sel = root.querySelector('#xaSubj'), per = PERIODS.filter(function (p) { return p[0] === S.period; })[0];
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(fileBase()) + '</title>' +
        '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">' +
        '<style>@page{size:A4;margin:14mm}body{font-family:Quicksand,Arial,sans-serif;color:#191919;margin:0}' +
        '.hd{background:#245F5A;color:#fff;padding:18px 22px;border-bottom:5px solid #55BFB3;border-radius:10px 10px 0 0}.hd small{color:#E5F2EF;letter-spacing:.12em;font-weight:700;font-size:11px}.hd h1{margin:4px 0 2px;font-size:22px}.hd p{margin:0;color:#E5F2EF;font-size:12px}' +
        '.xa-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.xa-tile{border:1px solid #ddd;border-radius:10px;padding:8px 10px}.xa-tile .l{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#666}.xa-tile .v{font-size:18px;font-weight:800}.xa-tile .s{font-size:11px;color:#666}' +
        '.cs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.c{border:1px solid #ddd;border-radius:10px;padding:8px;break-inside:avoid}.c img{width:100%}h4{margin:14px 0 6px;font-size:13px;color:#245F5A}' +
        'table{width:100%;border-collapse:collapse;font-size:11px;break-inside:auto}th{text-align:left;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#666;border-bottom:1px solid #ccc;padding:5px}td{padding:5px;border-bottom:1px solid #eee}tr{break-inside:avoid}' +
        '.xa-pill{font-weight:800;font-size:10.5px}.xa-sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}ul{padding-left:0;list-style:none;font-size:12px}li{margin:3px 0}li i{width:16px}.ft{margin-top:14px;font-size:10px;color:#666;border-top:1px solid #ddd;padding-top:6px}</style></head><body>' +
        '<div class="hd"><small>PAISLEY STUDIO</small><h1>Exam results report</h1><p>' + esc([opts.who, sel && sel.value ? sel.options[sel.selectedIndex].text : 'All subjects', per ? per[1] : ''].filter(Boolean).join('  |  ')) + '</p></div>' +
        (tiles ? tiles.outerHTML : '') + (ins ? '<h4>What the numbers say</h4>' + ins.outerHTML : '') +
        '<div class="cs">' + imgs + '</div>' + tables +
        '<div class="ft">Paisley Studio · paisleystudio.online · Generated ' + esc(new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })) + '. Exams only.</div>' +
        '<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script></body></html>');
      w.document.close();
    }

    render();
    return {
      update: function (items, o) { S.items = sorted(items); S.loading = false; S.error = (o && o.error) || null; if (o && o.who) opts.who = o.who; render(); },
      setLoading: function () { S.loading = true; render(); },
      destroy: destroyCharts
    };
  }

  global.PaisleyExamResults = { load: load, mount: mount, summary: summary, trendPill: trendPill, bandPill: bandPill, _a: { trendOf: trendOf, bySubject: bySubject, byMonth: byMonth } };
})(window);
