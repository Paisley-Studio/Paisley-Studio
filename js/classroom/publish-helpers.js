/* =========================================================
   PUBLISH UI — Paisley Studio (admin Classroom area)
   -----------------------------------------------------------
   The central place where the Studio Desk SELECTS prepared content and
   POSTS it to an audience. It is mounted inside the existing admin
   Classroom (a "Publish" tab and a per-classroom "Publish…" button) —
   it is NOT a separate navigation item and it never authors content.

   One Publish button → four explicit choices:
     Post to All · Post to Tutors · Post to Online Students ·
     Post to Remote Students
   Every choice goes through a review step that lists the selected
   items, the audiences that will receive them and the recipient counts,
   and requires explicit confirmation. The write itself is done by the
   publishClassroomContent Cloud Function (admin-only, idempotent).

   IMPORTANT — audiences are ADDITIVE, never destructive.
   The Cloud Function sets audiences[aud] = true on each posted item.
   It never clears other flags. So a lesson already posted to Remote
   stays posted to Remote even after you later post it to Online.
   The review panel makes this explicit so admins aren't surprised.

   SCOPE
   When mounted with { scope:'remote' }, CHOICES is narrowed to
   "Post to Remote Students" and the item list is filtered to remote-
   posted content only. Not used by the main Classroom Publish tab.
   Used by anything that wants a remote-only publisher.

   Data written per item (see functions/publishing.js):
     audiences:   { online, remote, tutors }
     publication: { <audience>: { publishedAt, publishedBy, ... } }

   Requires: classroom-helpers.js, work-helpers.js, firebase functions SDK.
========================================================= */
(function (global) {
  'use strict';
  var CU = global.ClassroomUI && global.ClassroomUI.util;
  var WH = global.WorkUI && global.WorkUI._h;
  if (!CU || !WH) { console.error('publish-helpers.js needs classroom-helpers.js and work-helpers.js loaded first.'); return; }
  var esc = CU.esc;

  var AUD = {
    online: { label: 'Online Students', icon: 'fa-laptop', desc: 'Normal online students in the matching Key Stage, Year and subject.' },
    remote: { label: 'Remote Students', icon: 'fa-house-laptop', desc: 'Admitted remote students in the matching Key Stage, Year and subject.' },
    tuition: { label: 'CBC Tuition Students', icon: 'fa-graduation-cap', desc: 'Admitted CBC tuition students in the matching band, Grade and subject.' },
    tutors: { label: 'Tutors', icon: 'fa-chalkboard-user', desc: 'Authorised tutors for the subject; they deliver it to their own students.' }
  };
  var ALL_CHOICES = [
    { id: 'all', label: 'Post to All', icon: 'fa-bullhorn', desc: 'Online students, remote students and tutors.', auds: ['online', 'remote', 'tutors'] },
    { id: 'tutors', label: 'Post to Tutors', icon: 'fa-chalkboard-user', desc: 'Tutors only. They can then release it to their own students.', auds: ['tutors'] },
    { id: 'online', label: 'Post to Online Students', icon: 'fa-laptop', desc: 'Normal online students only. Not shown to remote students.', auds: ['online'] },
    { id: 'remote', label: 'Post to Remote Students', icon: 'fa-house-laptop', desc: 'Remote students (and their parents) only. Not shown to online students.', auds: ['remote'] },
    { id: 'tuition', label: 'Post to CBC Tuition Students', icon: 'fa-graduation-cap', desc: 'CBC tuition students (and their parents) only. Not shown to online or remote students.', auds: ['tuition', 'tutors'] }
  ];
  var TYPE_LABEL = { lesson: 'Lesson', assignment: 'Homework', exam: 'Exam', flatExam: 'Exam' };
  var TYPE_ICON = { lesson: 'fa-book-open', assignment: 'fa-clipboard-check', exam: 'fa-file-pen', flatExam: 'fa-file-pen' };
  var MAX_CLASSROOMS = 24;

  function injectStyle() {
    if (document.getElementById('pb-style')) return;
    var st = document.createElement('style'); st.id = 'pb-style';
    st.textContent = [
      '.pb-bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;padding:.7rem .9rem;margin:.8rem 0;box-shadow:0 6px 18px rgba(36,95,90,.08)}',
      '.pb-bar .n{font-weight:800;color:var(--brand-deep,#245F5A);font-size:.86rem}',
      '.pb-menu-wrap{position:relative;margin-left:auto}',
      '.pb-menu{position:absolute;right:0;top:calc(100% + 6px);width:min(340px,86vw);background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:14px;box-shadow:0 18px 40px rgba(36,95,90,.2);padding:.4rem;z-index:40}',
      '.pb-menu button{display:flex;gap:.7rem;align-items:flex-start;width:100%;text-align:left;border:0;background:transparent;border-radius:10px;padding:.65rem .7rem;cursor:pointer;font-family:inherit;color:inherit}',
      '.pb-menu button:hover,.pb-menu button:focus{background:var(--sage,#E5F2EF);outline:none}',
      '.pb-menu .ic{width:34px;height:34px;border-radius:10px;background:rgba(85,191,179,.16);color:var(--brand-deep,#245F5A);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.pb-menu b{display:block;font-size:.86rem;color:var(--brand-deep,#245F5A)}',
      '.pb-menu small{display:block;font-size:.72rem;color:var(--muted,#5A6E6A);line-height:1.35}',
      '.pb-chip{display:inline-flex;align-items:center;gap:.25rem;padding:.14rem .5rem;border-radius:99px;font-size:.66rem;font-weight:800;margin:0 .15rem .15rem 0}',
      '.pb-chip.on{background:rgba(46,184,114,.14);color:#1d8b57}',
      '.pb-chip.off{background:rgba(90,110,106,.1);color:var(--muted,#5A6E6A);opacity:.75}',
      '.pb-row{display:flex;align-items:flex-start;gap:.7rem;padding:.65rem .9rem;border-top:1px solid var(--line-soft,rgba(38,51,49,.06))}',
      '.pb-row:hover{background:var(--paper,#F1F9F7)}',
      '.pb-row input[type=checkbox]{margin-top:.25rem;width:17px;height:17px;accent-color:var(--brand-deep,#245F5A)}',
      '.pb-row .main{flex:1;min-width:0}',
      '.pb-row .t{font-weight:700;font-size:.88rem}',
      '.pb-row .s{font-size:.74rem;color:var(--muted,#5A6E6A)}',
      '.pb-group{border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;background:var(--surface,#fff);overflow:hidden;margin-bottom:.9rem}',
      '.pb-group-head{display:flex;align-items:center;gap:.6rem;background:var(--sage,#E5F2EF);padding:.6rem .9rem;font-weight:800;color:var(--brand-deep,#245F5A);font-size:.86rem;flex-wrap:wrap}',
      '.pb-review ul{margin:.3rem 0 .8rem;padding-left:1.1rem;font-size:.84rem}',
      '.pb-review .box{background:var(--paper,#F1F9F7);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;padding:.7rem .9rem;margin-bottom:.8rem;font-size:.84rem}',
      '.pb-review h4{margin:.2rem 0 .3rem;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A)}',
      '.pb-warn{background:rgba(232,163,61,.13);border:1px solid rgba(232,163,61,.4);border-radius:12px;padding:.6rem .8rem;font-size:.82rem;margin-bottom:.8rem}',
      '.pb-info{background:rgba(74,144,217,.1);border:1px solid rgba(74,144,217,.35);color:#2b6cad;border-radius:12px;padding:.6rem .8rem;font-size:.82rem;margin-bottom:.8rem}',
      '.pb-list{max-height:220px;overflow:auto}',
      '.cr-filters{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem; align-items:center;}',
      '.cr-filters select, .cr-filters input { min-width: 150px; }'
    ].join('\n');
    document.head.appendChild(st);
  }

  function ksNum(ks) { var m = /Key Stage\s*(\d)/i.exec(String(ks || '')); return m ? m[1] : ''; }
  function legacyAud(type, d) {
    var live = type === 'lesson' ? (d.status === 'published' || d.status === 'scheduled') : (type === 'assignment' ? true : d.status === 'Published');
    return { online: live, remote: false, tuition: false, tutors: true };
  }
  function effAud(type, d) { return d.audiences && typeof d.audiences === 'object' ? d.audiences : legacyAud(type, d); }
  function chips(a) {
    return Object.keys(AUD).map(function (k) {
      return '<span class="pb-chip ' + (a[k] ? 'on' : 'off') + '" title="' + (a[k] ? 'Posted to ' : 'Not posted to ') + esc(AUD[k].label) + '"><i class="fas ' + AUD[k].icon + '"></i> ' + esc(AUD[k].label.replace(' Students', '')) + '</span>';
    }).join('');
  }
  function stateText(it) {
    if (it.type === 'lesson') return it.status === 'published' ? 'Ready' : (it.status === 'scheduled' ? 'Scheduled ' + (it.publishAt ? CU.fmtDateTime(it.publishAt) : '') : (it.status === 'archived' ? 'Archived' : 'Draft'));
    if (it.type === 'assignment') return it.dueAt ? 'Due ' + CU.fmtDateTime(it.dueAt) : 'No deadline';
    return (it.status || 'Draft') + (it.examDate ? ' · ' + CU.fmtDateTime(it.examDate) : '');
  }
  function blocked(it) { return it.status === 'archived' || it.status === 'Closed'; }

  /* ---------------------------------------------------------
     Load every item of one classroom
  --------------------------------------------------------- */
  async function loadClassroomItems(cls) {
    var cid = cls.id, items = [];
    // Flat exams are fetched at the same time as the topics (they don't depend on them).
    var flatP = WH.flatExamsRef(cid).get().catch(function () { return { docs: [] }; });
    var topics = await CU.loadTopics(cid);
    var base = { cid: cid, ks: cls.keyStage, year: cls.year, subjectId: cls.subjectId, clsLabel: CU.displayName(cls) + ' · Year ' + cls.year };
    await Promise.all(topics.map(async function (t) {
      var res = await Promise.all([
        CU.clsRef(cid).collection('topics').doc(t.id).collection('lessons').get().catch(function () { return { docs: [] }; }),
        WH.coll(cid, t.id, 'assignment').get().catch(function () { return { docs: [] }; }),
        WH.coll(cid, t.id, 'exam').get().catch(function () { return { docs: [] }; })
      ]);
      [['lesson', 'lessons', res[0]], ['assignment', 'assignments', res[1]], ['exam', 'exams', res[2]]].forEach(function (g) {
        g[2].docs.forEach(function (d) {
          var data = d.data();
          items.push(Object.assign({}, base, data, { id: d.id, type: g[0], path: 'classrooms/' + cid + '/topics/' + t.id + '/' + g[1] + '/' + d.id, tid: t.id, topicTitle: t.title, audiencesEff: effAud(g[0], data) }));
        });
      });
    }));
    var flat = await flatP;
    flat.docs.forEach(function (d) {
      var data = d.data();
      items.push(Object.assign({}, base, data, { id: d.id, type: 'flatExam', path: 'classrooms/' + cid + '/exams/' + d.id, tid: '', topicTitle: 'Midterm / End of Term exams', audiencesEff: effAud('flatExam', data) }));
    });
    return items;
  }

  /* ---------------------------------------------------------
     Workspace
     opts: { user, classrooms?, lockClassroom?, scope?, onChange? }
       scope: 'remote'  → only "Post to Remote Students" is offered, and only
                          remote-posted items are loaded. Optional.
  --------------------------------------------------------- */
  function mount(root, opts) {
    injectStyle(); CU.injectStyle(); WH.injectStyle && WH.injectStyle();
    root.classList.add('cr-root');
    var scope = opts.scope || null;
    var CHOICES = (scope === 'remote' || scope === 'tuition')
      ? ALL_CHOICES.filter(function (c) { return c.id === scope; })
      : ALL_CHOICES.filter(function (c) { return c.id !== 'tuition'; });
    function isCbc(ks) { return /^CBC\b/i.test(String(ks || '')); }
    var STAGES = scope === 'tuition' && typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : CU.KEY_STAGES;
    var YEARS = scope === 'tuition' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    var YWORD = scope === 'tuition' ? 'Grade ' : 'Year ';
    var S = { classrooms: opts.classrooms || null, items: [], selected: {}, loaded: false,
      f: { ks: '', year: '', subject: '', topic: '', type: '', state: '', aud: '', q: '' }, menuOpen: false };
    if (opts.lockClassroom) S.lock = opts.lockClassroom;

    function sel(id, all, pairs, cur) {
      return '<select data-f="' + id + '" aria-label="' + esc(all) + '"><option value="">' + esc(all) + '</option>' +
        pairs.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (String(cur) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>';
    }

    async function ensureClassrooms() {
      if (S.classrooms) return;
      S.classrooms = CU.snapDocs(await db.collection('classrooms').get());
    }
    function inScope(c) { return (scope === 'tuition') === isCbc(c.keyStage); }
    function matchingClassrooms() {
      return (S.classrooms || []).filter(function (c) {
        if (S.lock) return c.id === S.lock;
        if (!inScope(c)) return false;
        return (!S.f.ks || c.keyStage === S.f.ks) && (!S.f.year || String(c.year) === S.f.year) && (!S.f.subject || c.subjectId === S.f.subject);
      });
    }

    async function loadItems() {
      var list = matchingClassrooms();
      if (!S.lock && !S.f.ks && !S.f.subject && !S.f.year) { S.items = []; S.loaded = false; S.hint = 'Choose a Key Stage, Year or subject to load its content.'; return render(); }
      if (list.length > MAX_CLASSROOMS) { S.items = []; S.loaded = false; S.hint = 'That matches ' + list.length + ' classrooms. Narrow the filters to ' + MAX_CLASSROOMS + ' or fewer.'; return render(); }
      if (!list.length) { S.items = []; S.loaded = true; S.hint = 'No classroom matches these filters.'; return render(); }
      S.hint = ''; S.loading = true; render();
      try {
        var parts = await Promise.all(list.map(loadClassroomItems));
        S.items = [].concat.apply([], parts);
        // scope:'remote' → only items already posted to remote, or authored in
        // the Classwork tab (which forces remote). Everything else is hidden so
        // a remote-only publisher cannot accidentally widen the audience.
        // scope:'tuition' → every item in a CBC classroom is, by definition, tuition content,
        // so nothing is hidden: the admin chooses what to post.
        if (scope === 'remote') S.items = S.items.filter(function (it) { return it.audiencesEff.remote === true; });
        S.loaded = true;
      } catch (e) { S.hint = 'Could not load content: ' + (e.message || e); S.items = []; }
      S.loading = false; S.selected = {}; render();
    }

    function visible() {
      var f = S.f;
      return S.items.filter(function (it) {
        if (f.topic && it.topicTitle !== f.topic) return false;
        if (f.type && (f.type === 'exam' ? (it.type !== 'exam' && it.type !== 'flatExam') : it.type !== f.type)) return false;
        if (f.aud) {
          var parts = f.aud.split(':'); var on = !!it.audiencesEff[parts[1]];
          if (parts[0] === 'posted' && !on) return false;
          if (parts[0] === 'not' && on) return false;
        }
        if (f.state === 'draft' && !(it.status === 'draft' || it.status === 'Draft')) return false;
        if (f.state === 'ready' && !(it.status === 'published' || it.status === 'Published' || it.type === 'assignment')) return false;
        if (f.state === 'scheduled' && it.status !== 'scheduled') return false;
        if (f.q && (String(it.title) + ' ' + String(it.topicTitle || '')).toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
        return true;
      }).sort(function (a, b) { return String(a.clsLabel).localeCompare(String(b.clsLabel)) || String(a.topicTitle).localeCompare(String(b.topicTitle)) || CU.byOrder(a, b); });
    }

    function render() {
      var f = S.f, rows = visible(), nSel = Object.keys(S.selected).length;
      var topics = {}; S.items.forEach(function (i) { topics[i.topicTitle] = 1; });
      var h = '<div class="cr-bar"><div><h3>Publish content</h3><div class="cr-sub">Select prepared lessons, homework and exams, then post them to the right audience. Content is prepared once (in the classroom) — posting never duplicates it.</div></div></div>';
      if (scope === 'tuition') {
        h += '<div class="pb-info"><i class="fas fa-graduation-cap"></i> <b>CBC tuition only.</b> Prepared CBC lessons, homework and exams are posted to CBC tuition students from here. Nothing here reaches online or remote students.</div>';
      }
      if (scope === 'remote') {
        h += '<div class="pb-info"><i class="fas fa-house-laptop"></i> <b>Remote only.</b> This publisher posts content to remote students. Adding a Remote audience does not remove other audiences already set on an item.</div>';
      }
      if (!S.lock) {
        h += '<div class="cr-filters">' +
          sel('ks', scope === 'tuition' ? 'Band' : 'Key Stage', STAGES.map(function (k) { return [k, CU.ksShort(k)]; }), f.ks) +
          sel('year', scope === 'tuition' ? 'Grade' : 'Year', YEARS.map(function (y) { return [String(y), YWORD + y]; }), f.year) +
          sel('subject', 'Subject', LMZ_SUBJECTS.map(function (s) { return [s.id, s.name]; }), f.subject) +
          '<button type="button" class="cr-btn primary" data-a="load"><i class="fas fa-magnifying-glass"></i> Load content</button></div>';
      }
      h += '<div class="cr-filters">' +
        sel('topic', 'All topics', Object.keys(topics).sort().map(function (t) { return [t, t]; }), f.topic) +
        sel('type', 'All content types', [['lesson', 'Lessons'], ['assignment', 'Homework'], ['exam', 'Exams']], f.type) +
        sel('state', 'Any state', [['draft', 'Draft'], ['ready', 'Ready'], ['scheduled', 'Scheduled']], f.state) +
        sel('aud', 'Any publication status', [['posted:online', 'Posted to Online'], ['not:online', 'Not posted to Online'], ['posted:remote', 'Posted to Remote'], ['not:remote', 'Not posted to Remote'], ['posted:tuition', 'Posted to Tuition'], ['not:tuition', 'Not posted to Tuition'], ['posted:tutors', 'Posted to Tutors'], ['not:tutors', 'Not posted to Tutors']], f.aud) +
        '<input type="search" data-f="q" placeholder="Search title or topic…" value="' + esc(f.q) + '" aria-label="Search"></div>';

      h += '<div class="pb-bar" role="region" aria-label="Publishing actions"><span class="n">' + nSel + ' selected</span>' +
        '<button type="button" class="cr-btn sm" data-a="select-all">Select all shown</button>' +
        '<button type="button" class="cr-btn sm" data-a="clear"' + (nSel ? '' : ' disabled') + '>Clear</button>' +
        '<div class="pb-menu-wrap"><button type="button" class="cr-btn primary" data-a="menu" aria-haspopup="true" aria-expanded="' + S.menuOpen + '"' + (nSel ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> Publish <i class="fas fa-chevron-down" style="font-size:.65rem"></i></button>' +
        (S.menuOpen ? '<div class="pb-menu" role="menu">' + CHOICES.map(function (c) {
          return '<button type="button" role="menuitem" data-a="choose" data-c="' + c.id + '"><span class="ic"><i class="fas ' + c.icon + '"></i></span><span><b>' + esc(c.label) + '</b><small>' + esc(c.desc) + '</small></span></button>';
        }).join('') + '</div>' : '') + '</div></div>';

      if (S.loading) h += (CU.loaderHtml ? CU.loaderHtml('Loading content\u2026') : '<div class="cr-empty">Loading content…</div>');
      else if (S.hint) h += '<div class="cr-panel"><div class="cr-empty">' + esc(S.hint) + '</div></div>';
      else if (!S.loaded) h += '<div class="cr-panel"><div class="cr-empty">Choose a Key Stage, Year or subject, then “Load content”.</div></div>';
      else if (!rows.length) h += '<div class="cr-panel"><div class="cr-empty">Nothing matches these filters. Prepare lessons and homework in the classroom first, then come back to post them.</div></div>';
      else {
        var groups = {}, order = [];
        rows.forEach(function (it) { var k = it.clsLabel + ' — ' + it.topicTitle; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(it); });
        order.forEach(function (k) {
          h += '<div class="pb-group"><div class="pb-group-head">' + esc(k) + '</div>' + groups[k].map(function (it) {
            var dis = blocked(it);
            return '<label class="pb-row"><input type="checkbox" data-p="' + esc(it.path) + '"' + (S.selected[it.path] ? ' checked' : '') + (dis ? ' disabled' : '') + ' aria-label="Select ' + esc(it.title) + '">' +
              '<span class="main"><span class="t"><i class="fas ' + TYPE_ICON[it.type] + '" style="color:var(--brand-deep);margin-right:.35rem"></i>' + esc(it.title) + '</span>' +
              '<span class="s">' + esc(TYPE_LABEL[it.type]) + ' · ' + esc(stateText(it)) + (it.type === 'lesson' && it.attachments && it.attachments.length ? ' · ' + it.attachments.length + ' resource' + (it.attachments.length === 1 ? '' : 's') : '') + '</span></span>' +
              '<span>' + chips(it.audiencesEff) + '</span></label>';
          }).join('') + '</div>';
        });
      }
      root.innerHTML = h;
    }

    /* -------------------- review + confirm -------------------- */
    async function countRecipients(clsIds) {
      var out = { online: 0, remote: 0, tuition: 0 };
      var seen = {};
      // All classrooms' enrolment lists are read together (was one after another).
      var lists = await Promise.all(clsIds.map(function (id) {
        var cls = (S.classrooms || []).filter(function (c) { return c.id === id; })[0];
        if (!cls) return Promise.resolve(null);
        return WH.loadEnrolled(cls).then(function (students) { return { cls: cls, students: students }; })
          .catch(function () { out.error = true; return null; });
      }));
      lists.forEach(function (r) {
        if (!r) return;
        r.students.forEach(function (s) {
          if (String(s.status || '').toLowerCase() === 'suspended' || seen[s.id + r.cls.id]) return; seen[s.id + r.cls.id] = 1;
          if (s.studentType === 'remote') out.remote++; else if (s.studentType === 'tuition') out.tuition++; else out.online++;
        });
      });
      return out;
    }

    async function review(choiceId) {
      var choice = CHOICES.filter(function (c) { return c.id === choiceId; })[0];
      var picked = S.items.filter(function (it) { return S.selected[it.path]; });
      if (!picked.length) return;
      S.menuOpen = false; render();
      var requestId = 'pub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var m = CU.openModal({ title: choice.label + ' — review', wide: true });
      m.body.innerHTML = '<div class="cr-empty">Preparing review…</div>';
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Cancel</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(true); };
      var counts = await countRecipients(Array.from(new Set(picked.map(function (i) { return i.cid; }))));

      var already = [], fresh = [], drafts = [], skipped = [], scheduled = [];
      var alreadyRemoteWidening = [];   // items that already had remote=true and now get a different audience added
      picked.forEach(function (it) {
        var need = choice.auds.filter(function (a) { return !it.audiencesEff[a]; });
        if (blocked(it)) skipped.push(it);
        else if (!need.length) already.push(it);
        else {
          fresh.push(it);
          if (it.status === 'draft' || it.status === 'Draft') drafts.push(it);
          if (it.status === 'scheduled') scheduled.push(it);
          // If this item already carries remote=true and the current choice would
          // add some other audience, flag it — the CF is additive, so Remote stays.
          var addsOther = choice.auds.some(function (a) { return a !== 'remote'; });
          if (it.audiencesEff.remote === true && addsOther) alreadyRemoteWidening.push(it);
        }
      });
      var ksList = Array.from(new Set(picked.map(function (i) { return CU.ksShort(i.ks); }))).join(', ');
      var subjList = Array.from(new Set(picked.map(function (i) { return i.clsLabel; }))).join('; ');
      var topicList = Array.from(new Set(picked.map(function (i) { return i.topicTitle; })));
      var recipients = choice.auds.map(function (a) {
        if (a === 'tutors') return '<li><b>Tutors</b> — authorised tutors for the subject (they deliver it to their own students).</li>';
        return '<li><b>' + esc(AUD[a].label) + '</b> — ' + (counts.error ? 'recipient count unavailable' : counts[a] + ' enrolled student' + (counts[a] === 1 ? '' : 's')) + ' (plus their linked parents).</li>';
      }).join('');
      var needsTick = fresh.length >= 5 || choice.id === 'all';

      m.body.className = 'cr-modal-body pb-review';
      m.body.innerHTML =
        '<div class="box"><h4>Audience</h4><ul style="margin:.2rem 0 0">' + recipients + '</ul>' +
        (choice.id === 'online' ? '<div class="cr-note">Remote students will <b>not</b> see this. Items already posted to Remote stay posted to Remote.</div>' : '') +
        (choice.id === 'remote' ? '<div class="cr-note">Online students will <b>not</b> see this.</div>' : '') +
        (choice.id === 'tutors' ? '<div class="cr-note">Students will not see this until a tutor releases it.</div>' : '') +
        (choice.id === 'all' ? '<div class="cr-note">Every item in the list will be visible to Online, Remote and Tutors.</div>' : '') +
        '</div>' +
        (alreadyRemoteWidening.length ? '<div class="pb-info"><i class="fas fa-circle-info"></i> <b>Audiences are additive.</b> ' + alreadyRemoteWidening.length + ' item' + (alreadyRemoteWidening.length === 1 ? '' : 's') + ' in this selection ' + (alreadyRemoteWidening.length === 1 ? 'is' : 'are') + ' already posted to Remote. Adding another audience does not remove Remote — the item stays visible to remote students unless it is explicitly retracted elsewhere.</div>' : '') +
        '<div class="box"><h4>Content</h4>Key Stage: <b>' + esc(ksList) + '</b><br>Subject / Year: <b>' + esc(subjList) + '</b><br>Topics: ' + esc(topicList.join(', ')) + '</div>' +
        '<h4>Will be posted (' + fresh.length + ')</h4><div class="pb-list"><ul>' + (fresh.length ? fresh.map(function (it) {
          return '<li>' + esc(it.title) + ' <span class="cr-note">— ' + esc(TYPE_LABEL[it.type]) + ', ' + esc(stateText(it)) + '</span></li>';
        }).join('') : '<li class="cr-note">Nothing new — everything selected is already posted to this audience.</li>') + '</ul></div>' +
        (already.length ? '<div class="cr-note">Already posted to this audience (left unchanged): ' + already.length + '.</div>' : '') +
        (skipped.length ? '<div class="pb-warn">Skipped (archived or closed): ' + skipped.map(function (i) { return esc(i.title); }).join(', ') + '.</div>' : '') +
        (drafts.length ? '<div class="pb-warn"><b>' + drafts.length + ' draft item' + (drafts.length === 1 ? '' : 's') + '</b> will be marked ready/published as part of posting: ' + drafts.map(function (i) { return esc(i.title); }).join(', ') + '.</div>' : '') +
        (scheduled.length ? '<div class="cr-note">Scheduled lessons stay scheduled: they appear at their release time.</div>' : '') +
        (fresh.length ? '<div class="cr-note">Homework and exam notifications (and emails) are sent to the audience as soon as you confirm.</div>' : '') +
        (needsTick ? '<label style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.8rem;font-size:.84rem"><input type="checkbox" id="pbAck" style="margin-top:.2rem"> <span>I have checked the audience and the ' + fresh.length + ' item' + (fresh.length === 1 ? '' : 's') + ' above and want to post them now.</span></label>' : '');
      m.foot.innerHTML = '<span class="cr-err" id="pbErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button>' +
        '<button type="button" class="cr-btn primary" data-a="go"' + (fresh.length ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> ' + esc(choice.label) + '</button>';
      m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(true); };
      var go = m.foot.querySelector('[data-a="go"]'), err = m.foot.querySelector('#pbErr');
      function sync() { var t = m.body.querySelector('#pbAck'); go.disabled = !fresh.length || (t && !t.checked); }
      sync(); var tick = m.body.querySelector('#pbAck'); if (tick) tick.onchange = sync;
      go.onclick = async function () {
        go.disabled = true; err.textContent = ''; go.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting…';
        try {
          var res = await firebase.functions().httpsCallable('publishClassroomContent')({ audience: choice.id, paths: fresh.map(function (i) { return i.path; }), requestId: requestId });
          var d = res.data || {};
          m.body.innerHTML = '<div class="cr-panel" style="margin:0"><h4 style="margin:0 0 .4rem;color:var(--brand-deep)"><i class="fas fa-circle-check" style="color:#1d8b57"></i> Done</h4>' +
            '<div style="font-size:.88rem">Posted: <b>' + (d.published || 0) + '</b> · Already posted: ' + (d.already || 0) + ' · Skipped: ' + (d.skipped || 0) + (d.failed ? ' · <span style="color:var(--error)">Failed: ' + d.failed + '</span>' : '') + '</div>' +
            ((d.results || []).filter(function (r) { return r.status === 'error' || r.status === 'skipped'; }).map(function (r) { return '<div class="cr-note">' + esc(r.path.split('/').pop()) + ': ' + esc(r.reason || r.status) + '</div>'; }).join('')) + '</div>';
          m.foot.innerHTML = '<button type="button" class="cr-btn primary" data-a="x">Close</button>';
          m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(true); };
          if (opts.onChange) opts.onChange();
          S.selected = {}; await loadItems();
        } catch (e) {
          console.error('publish:', e);
          err.textContent = (e && e.message) || 'Could not publish. Nothing was lost — you can safely try again.';
          go.disabled = false; go.innerHTML = '<i class="fas fa-paper-plane"></i> ' + esc(choice.label);
        }
      };
    }

    /* -------------------- events -------------------- */
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]');
      if (!el) { if (S.menuOpen && !e.target.closest('.pb-menu-wrap')) { S.menuOpen = false; render(); } return; }
      var a = el.dataset.a;
      if (a === 'load') loadItems();
      else if (a === 'select-all') { visible().forEach(function (it) { if (!blocked(it)) S.selected[it.path] = true; }); render(); }
      else if (a === 'clear') { S.selected = {}; render(); }
      else if (a === 'menu') { S.menuOpen = !S.menuOpen; render(); }
      else if (a === 'choose') review(el.dataset.c);
    });
    root.addEventListener('change', function (e) {
      if (e.target.dataset.p) { 
        if (e.target.checked) S.selected[e.target.dataset.p] = true; 
        else delete S.selected[e.target.dataset.p]; 
        var n = root.querySelector('.pb-bar .n'); 
        if (n) n.textContent = Object.keys(S.selected).length + ' selected'; 
        var any = Object.keys(S.selected).length; 
        ['menu', 'clear'].forEach(function (k) { 
          var b = root.querySelector('[data-a="' + k + '"]'); 
          if (b) b.disabled = !any; 
        }); 
        return; 
      }
      
      var f = e.target.dataset.f; 
      if (!f) return;
      
      S.f[f] = e.target.value;
      
      // If changing the main filters, we need to reload the items from Firestore
      if (f === 'ks' || f === 'year' || f === 'subject') { 
        if (f === 'ks') S.f.year = ''; 
        render(); 
        loadItems(); 
      } else {
        // Topic, Type, State, and Aud filters just re-render the existing items
        render(); 
      }
    });
    root.addEventListener('input', function (e) {
      if (e.target.dataset.f === 'q') { S.f.q = e.target.value; var pos = e.target.selectionStart; render(); var i = root.querySelector('[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.menuOpen) { S.menuOpen = false; render(); } });

    (async function init() {
      root.innerHTML = '<div class="cr-empty">Loading…</div>';
      try { await ensureClassrooms(); } catch (e) { root.innerHTML = '<div class="cr-empty">Could not load classrooms: ' + esc(e.message || e) + '</div>'; return; }
      if (S.lock) loadItems(); else render();
    })();
    return { reload: loadItems };
  }

  /* Modal wrapper used by the per-classroom "Publish…" button. */
  function openForClassroom(cls, user, onChange) {
    var m = CU.openModal({ title: 'Publish — ' + CU.displayName(cls) + ' Year ' + cls.year, wide: true });
    m.body.style.minHeight = '60vh';
    mount(m.body, { user: user, classrooms: [cls], lockClassroom: cls.id, onChange: onChange });
    m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="x">Close</button>';
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(true); if (onChange) onChange(); };
  }

  global.PublishUI = { mount: mount, openForClassroom: openForClassroom, CHOICES: ALL_CHOICES, _internal: { effAud: effAud, legacyAud: legacyAud } };
})(window);