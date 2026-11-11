/* =========================================================
   Paisley Tech Studio: homework  (window.TechHomework)
   ---------------------------------------------------------
   Homework belongs to one class (techCourses), nothing narrower, and goes
   to every builder on that class's level. A piece of homework can have:
     notes, any number of files to download, video links to watch,
     a written answer, files the builder uploads (requireUpload), and a
     Paisley VS Code practice with or without opening code (ide).
   Builders hand it in; their coach or the Studio Desk marks it with a
   grade and feedback, or asks for corrections.

     techHomework/{id}  { courseId, courseName, track, title, notes,
                          files: [{ name, url, path, type, size }], videos: [url],
                          requireUpload, ide: { enabled, starter }, dueAt,
                          status: 'draft' | 'published', createdBy, createdByName,
                          createdAt, updatedAt, publishedAt }
     techHomeworkWork/{uid}_{homeworkId}
                        { homeworkId, studentId, studentName, coachId, courseId, track,
                          text, files[], codeFiles, codeFolders, codeAssets, codeActive, codeAt,
                          status: 'Draft' | 'Submitted' | 'Graded' | 'Corrections',
                          submittedAt, grade, feedback, markedBy, markedByName, markedAt }

   Posting (status -> published) rings every builder on the level and emails
   them (onTechHomeworkWritten); a hand-in rings the coach; marking rings the
   builder and their family (onTechHomeworkWorkWritten).

     TechHomework.mountManager(host, { me, students })    admin and coach
     TechHomework.mountLearner(host, { me, student, homeworkId })   builder
     TechHomework.mountFamily(host, { me, student })      guardian, read-only

   Needs TechUI, the global db, Firebase Storage, and CodeLab for the IDE.
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var HW = function () { return db.collection('techHomework'); };
  var WORK = function () { return db.collection('techHomeworkWork'); };
  var MAX_FILE = 50 * 1024 * 1024, MAX_FILES = 12;
  var BLOCKED = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)$|javascript/i;
  var STATUS = { Draft: ['To do', ''], Submitted: ['Handed in', 'warn'], Graded: ['Marked', 'ok'], Corrections: ['Corrections', 'bad'] };

  function ms(ts) { var d = T.toDate(ts); return d ? d.getTime() : 0; }
  function day(ts) { var d = T.toDate(ts); return d ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
  function docs(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function size(n) { return !n ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function safeName(n) { return String(n || 'file').replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file'; }
  function fileIcon(t, n) {
    t = String(t || ''); n = String(n || '').toLowerCase();
    if (/^image\//.test(t)) return 'fa-file-image'; if (/^video\//.test(t)) return 'fa-file-video'; if (/^audio\//.test(t)) return 'fa-file-audio';
    if (/pdf/.test(t) || /\.pdf$/.test(n)) return 'fa-file-pdf'; if (/zip/.test(t) || /\.(zip|rar|7z)$/.test(n)) return 'fa-file-zipper';
    if (/word|\.docx?$/.test(t + n)) return 'fa-file-word'; if (/sheet|excel|csv|\.xlsx?$/.test(t + n)) return 'fa-file-excel';
    if (/presentation|powerpoint|\.pptx?$/.test(t + n)) return 'fa-file-powerpoint';
    if (/\.(py|js|ts|html|css|json|java|c|cpp|cs|ino|sh)$/.test(n)) return 'fa-file-code';
    return 'fa-file';
  }
  function fileList(files, rm) {
    if (!files || !files.length) return '';
    return '<div class="hw-files">' + files.map(function (f, i) {
      var u = T.safeUrl(f.url);
      return '<span class="hw-file"><i class="fas ' + fileIcon(f.type, f.name) + '" aria-hidden="true"></i>' +
        (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener" download>' + esc(f.name || 'File') + '</a>' : esc(f.name || 'File')) +
        (f.size ? '<small>' + esc(size(f.size)) + '</small>' : '') +
        (rm ? '<button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(f.name) + '"><i class="fas fa-xmark"></i></button>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function videoLinks(list) {
    list = (list || []).map(function (u) { return T.safeUrl(u); }).filter(Boolean);
    if (!list.length) return '';
    return '<div class="hw-videos">' + list.map(function (u, i) {
      return '<button type="button" class="hw-video" data-video="' + esc(u) + '" data-vt="Video ' + (i + 1) + '"><i class="fas fa-circle-play" aria-hidden="true"></i> Watch video ' + (list.length > 1 ? i + 1 : '') + '</button>';
    }).join('') + '</div>';
  }
  function notesHtml(t) {
    t = String(t || '').trim(); if (!t) return '';
    return '<div class="hw-notes">' + esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>') + '</div>';
  }
  function needs(h) {
    var out = [];
    if (h.ide && h.ide.enabled) out.push('<span class="hw-pill"><i class="fas fa-code"></i> Paisley VS Code</span>');
    if (h.requireUpload) out.push('<span class="hw-pill"><i class="fas fa-upload"></i> Upload files</span>');
    if ((h.videos || []).length) out.push('<span class="hw-pill"><i class="fas fa-circle-play"></i> ' + h.videos.length + ' video' + (h.videos.length === 1 ? '' : 's') + '</span>');
    if ((h.files || []).length) out.push('<span class="hw-pill"><i class="fas fa-paperclip"></i> ' + h.files.length + ' file' + (h.files.length === 1 ? '' : 's') + '</span>');
    return out.join('');
  }
  function dueText(h) {
    if (!h.dueAt) return '';
    var d = ms(h.dueAt), late = d && d < Date.now();
    return '<span class="hw-due' + (late ? ' late' : '') + '"><i class="fas fa-calendar-day" aria-hidden="true"></i> Due ' + esc(day(h.dueAt)) + '</span>';
  }
  function statusPill(w) {
    var s = (w && STATUS[w.status]) || STATUS.Draft;
    return '<span class="hw-st ' + s[1] + '">' + esc(w && w.status === 'Graded' && w.grade ? 'Marked · ' + w.grade : s[0]) + '</span>';
  }
  function upload(path, f) {
    var r = firebase.storage().ref(path);
    return r.put(f, { contentType: f.type || 'application/octet-stream' }).then(function () { return r.getDownloadURL(); })
      .then(function (url) { return { name: String(f.name || 'file').slice(0, 160), url: url, path: path, type: f.type || '', size: f.size || 0 }; });
  }
  function checkFiles(list, have) {
    var ok = [], bad = [];
    Array.prototype.forEach.call(list || [], function (f) {
      if (have + ok.length >= MAX_FILES) bad.push(f.name + ' (at most ' + MAX_FILES + ' files)');
      else if (f.size > MAX_FILE) bad.push(f.name + ' (larger than 50 MB)');
      else if (BLOCKED.test(f.type || '')) bad.push(f.name + ' (web pages, scripts and SVG cannot be sent; zip them first)');
      else ok.push(f);
    });
    return { ok: ok, bad: bad };
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true; T.injectStyle();
    var s = document.createElement('style');
    s.textContent = [
      '.hw{display:grid;gap:.9rem}',
      '.hw-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between}',
      '.hw-bar h3{margin:0;color:var(--brand-deep,#245F5A);font-size:1.05rem}.hw-sub{color:var(--muted,#5A6E6A);font-size:.82rem;margin-top:.15rem}',
      '.hw-btn{display:inline-flex;align-items:center;gap:.35rem;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);border-radius:10px;padding:.45rem .8rem;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;text-decoration:none}',
      '.hw-btn:hover{border-color:var(--brand,#55BFB3)}.hw-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.hw-btn.primary{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.hw-btn.go{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.hw-btn.sm{padding:.28rem .6rem;font-size:.72rem}.hw-btn.danger{color:#b8362a}',
      '.hw-filters{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}',
      '.hw-filters select{border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:10px;padding:.4rem .6rem;font:inherit;font-size:.8rem;background:#fff}',
      '.hw-list{display:grid;gap:.6rem}',
      '.hw-item{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:14px;padding:.8rem .95rem;text-align:left;font:inherit;color:inherit;width:100%}',
      'button.hw-item{cursor:pointer}button.hw-item:hover{border-color:var(--brand,#55BFB3)}',
      '.hw-item .ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);flex:none;font-size:1.05rem}',
      '.hw-item .t{flex:1;min-width:180px}.hw-item .t b{display:block;color:var(--ink,#263331);font-size:.95rem}.hw-item .t span{font-size:.78rem;color:var(--muted,#5A6E6A)}',
      '.hw-item .tags{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;justify-content:flex-end}',
      '.hw-pill{display:inline-flex;align-items:center;gap:.25rem;border-radius:99px;padding:.12rem .5rem;font-size:.68rem;font-weight:800;background:#EEF2F1;color:#3D4A48;white-space:nowrap}',
      '.hw-st{display:inline-block;border-radius:99px;padding:.15rem .6rem;font-size:.72rem;font-weight:800;background:#EEF2F1;color:#3D4A48;white-space:nowrap}',
      '.hw-st.warn{background:#FFF4D6;color:#7a5600}.hw-st.ok{background:#E3F5EA;color:#1d6b3c}.hw-st.bad{background:#FDE8E6;color:#a12d22}.hw-st.draft{background:#EEF2F1;color:#5A6E6A}.hw-st.live{background:#E5F2EF;color:var(--brand-deep,#245F5A)}',
      '.hw-due{font-size:.74rem;font-weight:800;color:var(--brand-deep,#245F5A);white-space:nowrap}.hw-due.late{color:#b8362a}',
      '.hw-group{margin:.4rem 0 0;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#5A6E6A)}',
      '.hw-card{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:16px;padding:1rem 1.1rem;display:grid;gap:.7rem}',
      '.hw-card h3{margin:0;color:var(--brand-deep,#245F5A)}.hw-card h4{margin:0;font-size:.85rem;color:var(--brand-deep,#245F5A)}',
      '.hw-meta{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;font-size:.8rem;color:var(--muted,#5A6E6A)}',
      '.hw-notes{white-space:pre-wrap;line-height:1.6;font-size:.9rem;color:var(--ink,#263331)}.hw-notes a{color:var(--brand-deep,#245F5A);font-weight:700}',
      '.hw-files{display:flex;flex-wrap:wrap;gap:.4rem}',
      '.hw-file{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--line,rgba(38,51,49,.14));border-radius:10px;padding:.35rem .6rem;background:var(--paper,#F4F8F7);font-size:.8rem;font-weight:700;max-width:100%}',
      '.hw-file a{color:var(--brand-deep,#245F5A);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}.hw-file small{color:var(--muted,#5A6E6A);font-weight:600}',
      '.hw-file button{border:0;background:none;color:#b8362a;cursor:pointer;padding:0 .1rem}',
      '.hw-videos{display:flex;flex-wrap:wrap;gap:.4rem}',
      '.hw-video{display:inline-flex;align-items:center;gap:.4rem;border:0;border-radius:10px;padding:.5rem .85rem;background:var(--brand-deep,#245F5A);color:#fff;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}',
      '.hw-back{display:inline-flex;align-items:center;gap:.4rem;border:0;background:none;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.85rem;cursor:pointer;padding:.2rem 0}',
      '.hw textarea,.hw-form textarea,.hw-form input,.hw-form select{width:100%;box-sizing:border-box;border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:10px;padding:.6rem .7rem;font:inherit;font-size:.88rem;background:#fff;color:var(--ink,#263331)}',
      '.hw textarea{min-height:110px;resize:vertical}',
      '.hw-form{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.hw-form .full{grid-column:1 / -1}',
      '.hw-form label.f{display:grid;gap:.3rem;font-size:.76rem;font-weight:800;color:var(--brand-deep,#245F5A)}.hw-form .hint{font-weight:600;color:var(--muted,#5A6E6A);font-size:.72rem}',
      '.hw-form textarea{min-height:90px;resize:vertical}.hw-form textarea.code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem;min-height:140px}',
      '.hw-check{display:flex;gap:.55rem;align-items:flex-start;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.6rem .75rem;cursor:pointer;font-size:.84rem}',
      '.hw-check input{width:auto;margin-top:.2rem}.hw-check b{display:block;color:var(--ink,#263331)}.hw-check span{color:var(--muted,#5A6E6A);font-size:.76rem}',
      '.hw-drop{border:2px dashed var(--line,rgba(38,51,49,.2));border-radius:12px;padding:.8rem;text-align:center;font-size:.82rem;color:var(--muted,#5A6E6A);cursor:pointer}',
      '.hw-drop.on{border-color:var(--brand,#55BFB3);background:#F1FBF8}',
      '.hw-msg{font-size:.8rem;font-weight:700;min-height:1rem}.hw-msg.bad{color:#b8362a}.hw-msg.ok{color:#1d8b57}',
      '.hw-mark{border-left:4px solid var(--brand,#55BFB3);background:#F4FBF9;border-radius:10px;padding:.7rem .85rem}.hw-mark.bad{border-color:#e07a6f;background:#FDF3F2}',
      '.hw-mark b{color:var(--brand-deep,#245F5A)}.hw-mark p{margin:.3rem 0 0;white-space:pre-wrap;font-size:.86rem}',
      '.hw-table{width:100%;border-collapse:collapse;font-size:.84rem}',
      '.hw-table th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#5A6E6A);padding:.4rem .5rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.hw-table td{padding:.5rem;border-bottom:1px solid var(--line,rgba(38,51,49,.07))}',
      '.hw-ide{min-height:420px}',
      '.hw-preview{width:100%;height:340px;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;background:#fff}',
      '.hw-modal>div{width:min(760px,100%)!important}',
      '.hw-empty{background:var(--surface,#fff);border:1px dashed var(--line,rgba(38,51,49,.2));border-radius:14px;padding:1.4rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.88rem}',
      '.hw-empty b{display:block;color:var(--brand-deep,#245F5A);font-size:1rem;margin-bottom:.25rem}',
      '@media(max-width:640px){.hw-form{grid-template-columns:1fr}.hw-table thead{display:none}.hw-table tr{display:grid;grid-template-columns:1fr auto;padding:.4rem 0;border-bottom:1px solid var(--line,rgba(38,51,49,.07))}.hw-table td{border:0;padding:.15rem .3rem}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function empty(title, text) { return '<div class="hw-empty"><b>' + esc(title) + '</b>' + esc(text || '') + '</div>'; }
  function modal(title, bodyHtml, footHtml, wide) {
    var m = document.createElement('div');
    m.className = 'tk-modal' + (wide ? ' hw-modal' : ''); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="hw"><h3>' + esc(title) + '</h3>' + bodyHtml + '<div class="hw-msg bad" role="alert"></div><div style="display:flex;justify-content:flex-end;gap:.45rem;flex-wrap:wrap;margin-top:.4rem">' + footHtml + '</div></div>';
    document.body.appendChild(m);
    var closed = false;
    function close() { if (closed) return; closed = true; m.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape' && !m.querySelector('.tk-modal')) close(); }
    document.addEventListener('keydown', onKey);
    return { el: m, close: close, err: function (t) { m.querySelector(':scope > div > .hw-msg').textContent = t || ''; } };
  }
  function confirmBox(text, yes) {
    return new Promise(function (done) {
      var m = modal(text, '', '<button type="button" class="hw-btn" data-c="no">Cancel</button><button type="button" class="hw-btn primary" data-c="yes">' + esc(yes || 'Yes') + '</button>');
      m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) { m.close(); done(b.dataset.c === 'yes'); } });
    });
  }
  /* Watching a video: the shared Tech Studio player (FastVideo inside). */
  function onVideoClick(e) {
    var v = e.target.closest('[data-video]'); if (!v) return false;
    if (T.openVideoModal && g.FastVideo) T.openVideoModal({ title: v.dataset.vt || 'Video', url: v.dataset.video });
    else window.open(v.dataset.video, '_blank', 'noopener');
    return true;
  }
  /* A builder's code, as a page to look at (marking, guardians). */
  function codePreview(work) {
    if (!work || !(work.codeFiles || []).length || !g.CodeLab || !g.CodeLab.buildPreview) return '';
    return '<iframe class="hw-preview" sandbox="allow-scripts allow-modals" referrerpolicy="no-referrer" title="Their page" data-srcdoc="1"></iframe>';
  }
  function fillPreview(root, work) {
    var fr = root.querySelector('iframe[data-srcdoc]'); if (!fr || !work) return;
    try { fr.srcdoc = g.CodeLab.buildPreview(work.codeFiles || [], work.codeActive || 'index.html', work.codeAssets || []); } catch (e) { }
  }

  /* =========================================================
     Staff: set, post and mark homework (admin and coach)
     ========================================================= */
  function mountManager(host, o) {
    style();
    var me = o.me, isAdmin = me.role === 'admin';
    var S = { hw: [], courses: [], course: 'all', open: null, work: [], unsubWork: null, dead: false };
    var unsubs = [];
    unsubs.push(HW().onSnapshot(function (s) { S.hw = docs(s).sort(function (a, b) { return ms(b.publishedAt || b.createdAt) - ms(a.publishedAt || a.createdAt); }); paint(); }, function (e) { host.innerHTML = empty('Could not load homework', T.errMsg(e)); }));
    unsubs.push(db.collection('techCourses').onSnapshot(function (s) { S.courses = docs(s).sort(function (a, b) { return String(a.track).localeCompare(String(b.track)) || (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)); }); paint(); }, function () { }));
    function courseOf(id) { return S.courses.filter(function (c) { return c.id === id; })[0]; }
    function courseLabel(c) { return (c.name || 'Class') + ' · ' + (T.TRACK_LABEL[c.track] || ''); }
    function audience(h) { return (o.students || []).filter(function (s) { return s.status === 'Active' && T.tracksFor(s.skillLevel).indexOf(h.track) !== -1; }); }
    function canEdit(h) { return isAdmin || h.createdBy === me.uid; }

    function paint() {
      if (S.dead || S.open) return;
      var list = S.course === 'all' ? S.hw : S.hw.filter(function (h) { return h.courseId === S.course; });
      host.innerHTML = '<div class="hw"><div class="hw-bar"><div><h3>Homework</h3><div class="hw-sub">Set homework for a class. Every builder on that class’s level gets it, with a bell and an email.</div></div>' +
        '<button type="button" class="hw-btn primary" data-a="new"><i class="fas fa-plus"></i> Set homework</button></div>' +
        '<div class="hw-filters"><label class="hw-sub" for="hwCourseF">Class</label><select id="hwCourseF"><option value="all">All classes</option>' + S.courses.map(function (c) { return '<option value="' + esc(c.id) + '"' + (S.course === c.id ? ' selected' : '') + '>' + esc(courseLabel(c)) + '</option>'; }).join('') + '</select></div>' +
        (list.length ? '<div class="hw-list">' + list.map(function (h) {
          return '<div class="hw-item"><span class="ic"><i class="fas fa-book-open" aria-hidden="true"></i></span><span class="t"><b>' + esc(h.title || 'Homework') + '</b><span>' + esc((h.courseName || 'Class') + ' · ' + (T.TRACK_LABEL[h.track] || '')) + (h.createdByName ? ' · set by ' + esc(h.createdByName) : '') + '</span></span>' +
            '<span class="tags">' + dueText(h) + needs(h) + '<span class="hw-st ' + (h.status === 'published' ? 'live' : 'draft') + '">' + (h.status === 'published' ? 'Posted' : 'Draft') + '</span>' +
            '<button type="button" class="hw-btn sm go" data-a="open" data-id="' + esc(h.id) + '"><i class="fas fa-list-check"></i> Hand-ins</button>' +
            (canEdit(h) ? '<button type="button" class="hw-btn sm" data-a="edit" data-id="' + esc(h.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
              (h.status === 'published' ? '' : '<button type="button" class="hw-btn sm primary" data-a="post" data-id="' + esc(h.id) + '"><i class="fas fa-paper-plane"></i> Post</button>') +
              '<button type="button" class="hw-btn sm danger" data-a="del" data-id="' + esc(h.id) + '" aria-label="Delete"><i class="fas fa-trash"></i></button>' : '') + '</span></div>';
        }).join('') + '</div>' : empty('No homework yet', S.courses.length ? 'Press Set homework, pick the class and add notes, files, videos or a coding practice.' : 'Make a class in Classes first; homework is set for a class.')) + '</div>';
    }

    /* ---------- the form ---------- */
    function editor(h) {
      h = h || {};
      if (!S.courses.length) { alert('Make a class in Classes first: homework is set for a class.'); return; }
      var id = h.id || HW().doc().id, files = (h.files || []).slice(), busy = 0;
      var due = h.dueAt ? T.toDate(h.dueAt) : null, dueVal = due ? new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';
      var m = modal(h.id ? 'Edit homework' : 'Set homework',
        '<div class="hw-form">' +
          '<label class="f full">Class<select id="hwCourse">' + S.courses.map(function (c) { return '<option value="' + esc(c.id) + '"' + ((h.courseId || (S.course !== 'all' ? S.course : '')) === c.id ? ' selected' : '') + '>' + esc(courseLabel(c)) + '</option>'; }).join('') + '</select></label>' +
          '<label class="f full">Title<input id="hwTitle" maxlength="140" value="' + esc(h.title || '') + '" placeholder="e.g. Homework 3: build a landing page"></label>' +
          '<label class="f full">Notes <span class="hint">What to do. Links work.</span><textarea id="hwNotes" maxlength="8000" placeholder="Instructions and notes for the builders">' + esc(h.notes || '') + '</textarea></label>' +
          '<div class="f full"><label class="f">Files for builders to download <span class="hint">As many as you need, up to ' + MAX_FILES + ', 50 MB each</span></label><div id="hwFiles"></div>' +
            '<div class="hw-drop" id="hwDrop" tabindex="0" role="button"><i class="fas fa-cloud-arrow-up"></i> Drop files here or press to choose</div><input type="file" id="hwFileIn" multiple hidden></div>' +
          '<label class="f full">Video links <span class="hint">Optional. One per line: AWS, YouTube, Vimeo or Google Drive</span><textarea id="hwVideos" placeholder="https://youtu.be/…">' + esc((h.videos || []).join('\n')) + '</textarea></label>' +
          '<label class="f">Due date <span class="hint">Optional</span><input type="date" id="hwDue" value="' + esc(dueVal) + '"></label><div></div>' +
          '<label class="hw-check full"><input type="checkbox" id="hwUpload"' + (h.requireUpload ? ' checked' : '') + '><span><b>Builders upload files</b><span>They must attach at least one file (a document, pictures, a zip) to hand in.</span></span></label>' +
          '<label class="hw-check full"><input type="checkbox" id="hwIde"' + (h.ide && h.ide.enabled ? ' checked' : '') + '><span><b>Paisley VS Code practice</b><span>Builders write code in the IDE and hand it in; you see their page when you mark it.</span></span></label>' +
          '<label class="f full" id="hwStarterRow"' + (h.ide && h.ide.enabled ? '' : ' hidden') + '>Opening code <span class="hint">Optional. What index.html starts with; leave empty for a blank page</span><textarea id="hwStarter" class="code" spellcheck="false" placeholder="&lt;!DOCTYPE html&gt;…">' + esc((h.ide && h.ide.starter) || '') + '</textarea></label>' +
        '</div>',
        '<button type="button" class="hw-btn" data-f="cancel">Cancel</button>' +
        '<button type="button" class="hw-btn" data-f="draft"><i class="fas fa-floppy-disk"></i> ' + (h.status === 'published' ? 'Save' : 'Save draft') + '</button>' +
        (h.status === 'published' ? '' : '<button type="button" class="hw-btn primary" data-f="post"><i class="fas fa-paper-plane"></i> Post to builders</button>'), true);
      var q = function (s) { return m.el.querySelector(s); };
      function paintFiles() { q('#hwFiles').innerHTML = fileList(files, true) || '<div class="hw-sub">No files.</div>'; }
      paintFiles();
      function addFiles(list) {
        var c = checkFiles(list, files.length);
        if (c.bad.length) m.err('Not added: ' + c.bad.join('; '));
        c.ok.forEach(function (f) {
          busy++; q('#hwDrop').textContent = 'Uploading ' + f.name + '…';
          upload('techHomework/' + id + '/' + Date.now() + '_' + safeName(f.name), f).then(function (x) { files.push(x); paintFiles(); })
            .catch(function (e) { m.err('Upload failed: ' + T.errMsg(e)); })
            .then(function () { busy--; if (!busy) q('#hwDrop').innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Drop files here or press to choose'; });
        });
      }
      q('#hwIde').addEventListener('change', function () { q('#hwStarterRow').hidden = !q('#hwIde').checked; });
      q('#hwDrop').addEventListener('click', function () { q('#hwFileIn').click(); });
      q('#hwDrop').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q('#hwFileIn').click(); } });
      q('#hwFileIn').addEventListener('change', function () { addFiles(q('#hwFileIn').files); q('#hwFileIn').value = ''; });
      ['dragover', 'dragenter'].forEach(function (t) { q('#hwDrop').addEventListener(t, function (e) { e.preventDefault(); q('#hwDrop').classList.add('on'); }); });
      q('#hwDrop').addEventListener('dragleave', function () { q('#hwDrop').classList.remove('on'); });
      q('#hwDrop').addEventListener('drop', function (e) { e.preventDefault(); q('#hwDrop').classList.remove('on'); addFiles(e.dataTransfer.files); });
      m.el.addEventListener('click', function (e) {
        var rm = e.target.closest('[data-rm]'); if (rm) { files.splice(+rm.dataset.rm, 1); paintFiles(); return; }
        var b = e.target.closest('[data-f]'); if (!b) return;
        if (b.dataset.f === 'cancel') { m.close(); return; }
        if (busy) { m.err('Wait for the files to finish uploading.'); return; }
        var c = courseOf(q('#hwCourse').value), title = q('#hwTitle').value.trim();
        if (!c) return m.err('Choose the class.');
        if (!title) return m.err('Give the homework a title.');
        var vids = q('#hwVideos').value.split(/\s*\n\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
        var badV = vids.filter(function (v) { return !T.safeUrl(v); });
        if (badV.length) return m.err('Video links must start with https:// (' + badV[0] + ')');
        var dv = q('#hwDue').value, dueAt = dv ? firebase.firestore.Timestamp.fromDate(new Date(dv + 'T23:59:00')) : null;
        var post = b.dataset.f === 'post';
        var d = {
          courseId: c.id, courseName: c.name || '', track: c.track || 'intermediate', title: title.slice(0, 140),
          notes: q('#hwNotes').value.slice(0, 8000), files: files.slice(0, MAX_FILES), videos: vids.slice(0, 12),
          requireUpload: q('#hwUpload').checked, ide: { enabled: q('#hwIde').checked, starter: q('#hwIde').checked ? q('#hwStarter').value.slice(0, 60000) : '' },
          dueAt: dueAt, updatedAt: FV().serverTimestamp()
        };
        if (post) { d.status = 'published'; d.publishedAt = FV().serverTimestamp(); }
        b.disabled = true;
        var p = h.id ? HW().doc(id).update(d)
          : HW().doc(id).set(Object.assign(d, { status: post ? 'published' : 'draft', createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp() }));
        p.then(function () { m.close(); }).catch(function (er) { b.disabled = false; m.err('Could not save: ' + T.errMsg(er)); });
      });
      setTimeout(function () { q('#hwTitle').focus(); }, 30);
    }

    function post(h) {
      confirmBox('Post “' + (h.title || 'this homework') + '” to every ' + (T.TRACK_LABEL[h.track] || '') + ' builder in ' + (h.courseName || 'the class') + '?', 'Post it').then(function (ok) {
        if (ok) HW().doc(h.id).update({ status: 'published', publishedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() }).catch(function (e) { alert('Could not post: ' + T.errMsg(e)); });
      });
    }
    function del(h) {
      confirmBox('Delete “' + (h.title || 'this homework') + '”? Builders will no longer see it.', 'Delete').then(function (ok) {
        if (ok) HW().doc(h.id).delete().catch(function (e) { alert('Could not delete: ' + T.errMsg(e)); });
      });
    }

    /* ---------- hand-ins for one piece of homework ---------- */
    function openHw(h) {
      S.open = h.id; S.work = [];
      if (S.unsubWork) S.unsubWork();
      var qy = WORK().where('homeworkId', '==', h.id);
      if (!isAdmin) qy = qy.where('coachId', '==', me.uid);
      S.unsubWork = qy.onSnapshot(function (s) { S.work = docs(s); paintHw(); }, function (e) { host.querySelector('#hwRows') && (host.querySelector('#hwRows').innerHTML = empty('Could not load the hand-ins', T.errMsg(e))); });
      paintHw();
    }
    function paintHw() {
      if (S.dead || !S.open) return;
      var h = S.hw.filter(function (x) { return x.id === S.open; })[0];
      if (!h) { S.open = null; paint(); return; }
      var byStu = {}; S.work.forEach(function (w) { byStu[w.studentId] = w; });
      var aud = audience(h), seen = {};
      var rows = aud.map(function (s) { seen[s.id] = 1; return { s: s, w: byStu[s.id] }; });
      S.work.forEach(function (w) { if (!seen[w.studentId]) rows.push({ s: { id: w.studentId, name: w.studentName }, w: w }); });
      var order = { Submitted: 0, Corrections: 1, Graded: 2, Draft: 3 };
      rows.sort(function (a, b) { return (order[a.w ? a.w.status : 'Draft'] + (a.w ? 0 : 1)) - (order[b.w ? b.w.status : 'Draft'] + (b.w ? 0 : 1)) || String(a.s.name).localeCompare(String(b.s.name)); });
      var toMark = S.work.filter(function (w) { return w.status === 'Submitted'; }).length;
      host.innerHTML = '<div class="hw"><button type="button" class="hw-back" data-a="back"><i class="fas fa-arrow-left"></i> All homework</button>' +
        '<div class="hw-card"><div class="hw-bar"><div><h3>' + esc(h.title) + '</h3><div class="hw-meta">' + esc((h.courseName || '') + ' · ' + (T.TRACK_LABEL[h.track] || '')) + dueText(h) + '</div></div>' +
        '<div class="hw-meta"><span class="hw-st warn">' + toMark + ' to mark</span><span class="hw-st">' + S.work.filter(function (w) { return w.status !== 'Draft'; }).length + ' handed in</span></div></div>' +
        '<div class="hw-meta">' + needs(h) + '</div></div>' +
        '<div class="hw-card" id="hwRows">' + (rows.length ? '<table class="hw-table"><thead><tr><th>Builder</th><th>Status</th><th>Handed in</th><th>Grade</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
          var w = r.w;
          return '<tr><td><b>' + esc(r.s.name || 'Builder') + '</b></td><td>' + (w ? statusPill(w) : '<span class="hw-st draft">Not started</span>') + '</td><td>' + esc(w && w.submittedAt ? day(w.submittedAt) : '—') + '</td><td>' + esc((w && w.grade) || '—') + '</td>' +
            '<td style="text-align:right">' + (w && w.status !== 'Draft' ? '<button type="button" class="hw-btn sm ' + (w.status === 'Submitted' ? 'primary' : '') + '" data-a="mark" data-id="' + esc(w.id) + '">' + (w.status === 'Submitted' ? '<i class="fas fa-pen-to-square"></i> Mark' : 'Open') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' : empty('No builders on this level yet', isAdmin ? '' : 'Only your own builders are listed.')) + '</div></div>';
    }
    function mark(w) {
      var h = S.hw.filter(function (x) { return x.id === w.homeworkId; })[0] || {};
      var m = modal((w.studentName || 'Builder') + ' · ' + (h.title || 'Homework'),
        '<div class="hw-meta">' + statusPill(w) + (w.submittedAt ? ' Handed in ' + esc(T.fmt(w.submittedAt)) : '') + '</div>' +
        (w.text ? '<div><h4>Their answer</h4><div class="hw-notes">' + esc(w.text) + '</div></div>' : '') +
        ((w.files || []).length ? '<div><h4>Their files</h4>' + fileList(w.files) + '</div>' : (h.requireUpload ? '<div class="hw-sub">No files uploaded.</div>' : '')) +
        ((w.codeFiles || []).length ? '<div><h4>Their code (Paisley VS Code)</h4><p class="hw-sub" style="margin:.2rem 0 .4rem">Their page runs below. Open the code to read every file.</p>' + codePreview(w) + '<div style="margin-top:.4rem"><button type="button" class="hw-btn sm" data-f="code"><i class="fas fa-code"></i> Open the code</button></div><div id="hwCodeHost"></div></div>' : '') +
        '<div class="hw-form"><label class="f">Grade <span class="hint">e.g. A, 18/20 or 85%</span><input id="hwGrade" maxlength="40" value="' + esc(w.grade || '') + '"></label><div></div>' +
        '<label class="f full">Feedback<textarea id="hwFb" maxlength="4000" placeholder="What went well and what to improve">' + esc(w.feedback || '') + '</textarea></label></div>',
        '<button type="button" class="hw-btn" data-f="cancel">Close</button>' +
        '<button type="button" class="hw-btn danger" data-f="fix"><i class="fas fa-rotate-left"></i> Ask for corrections</button>' +
        '<button type="button" class="hw-btn primary" data-f="ok"><i class="fas fa-check"></i> Return marked</button>', true);
      fillPreview(m.el, w);
      var lab = null;
      m.el.addEventListener('click', function (e) {
        if (onVideoClick(e)) return;
        var b = e.target.closest('[data-f]'); if (!b) return;
        if (b.dataset.f === 'cancel') { if (lab) lab.destroy(); m.close(); return; }
        if (b.dataset.f === 'code') {
          if (lab || !g.CodeLab) return;
          lab = g.CodeLab.mount(m.el.querySelector('#hwCodeHost'), { build: { id: 'hwv_' + w.id, codeFiles: w.codeFiles, codeFolders: w.codeFolders, codeAssets: w.codeAssets, codeActive: w.codeActive }, canEdit: false, title: w.studentName || 'Their code' });
          b.hidden = true; return;
        }
        var grade = m.el.querySelector('#hwGrade').value.trim(), fb = m.el.querySelector('#hwFb').value.trim();
        if (b.dataset.f === 'ok' && !grade && !fb) return m.err('Write a grade or some feedback.');
        if (b.dataset.f === 'fix' && !fb) return m.err('Say what to correct in the feedback.');
        b.disabled = true;
        WORK().doc(w.id).update({ status: b.dataset.f === 'ok' ? 'Graded' : 'Corrections', grade: grade, feedback: fb, markedBy: me.uid, markedByName: me.name || '', markedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() })
          .then(function () { if (lab) lab.destroy(); m.close(); }).catch(function (er) { b.disabled = false; m.err('Could not save: ' + T.errMsg(er)); });
      });
    }

    function onClick(e) {
      if (e.target.id === 'hwCourseF') return;
      var b = e.target.closest('[data-a]'); if (!b || !host.contains(b)) return;
      var h = S.hw.filter(function (x) { return x.id === b.dataset.id; })[0];
      var a = b.dataset.a;
      if (a === 'new') editor(null);
      else if (a === 'edit' && h) editor(h);
      else if (a === 'post' && h) post(h);
      else if (a === 'del' && h) del(h);
      else if (a === 'open' && h) openHw(h);
      else if (a === 'back') { S.open = null; if (S.unsubWork) { S.unsubWork(); S.unsubWork = null; } paint(); }
      else if (a === 'mark') { var w = S.work.filter(function (x) { return x.id === b.dataset.id; })[0]; if (w) mark(w); }
    }
    function onChange(e) { if (e.target.id === 'hwCourseF') { S.course = e.target.value; paint(); } }
    host.addEventListener('click', onClick); host.addEventListener('change', onChange);
    host.innerHTML = empty('Loading homework…', '');
    return {
      destroy: function () { S.dead = true; unsubs.forEach(function (u) { u(); }); if (S.unsubWork) S.unsubWork(); host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); },
      setStudents: function (st) { o.students = st; if (S.open) paintHw(); }
    };
  }

  /* =========================================================
     Builder: see homework, do it, hand it in
     ========================================================= */
  function mountLearner(host, o) {
    style();
    var me = o.me, stu = o.student, uid = me.uid;
    var S = { hw: [], work: {}, open: o.homeworkId || null, lab: null, dead: false, saving: null };
    var unsubs = [];
    unsubs.push(HW().where('track', 'in', T.tracksFor(stu.skillLevel)).where('status', '==', 'published').onSnapshot(function (s) {
      S.hw = docs(s).sort(function (a, b) { return (ms(a.dueAt) || 9e15) - (ms(b.dueAt) || 9e15) || ms(b.publishedAt) - ms(a.publishedAt); });
      repaint();
    }, function (e) { host.innerHTML = empty('Could not load your homework', T.errMsg(e)); }));
    unsubs.push(WORK().where('studentId', '==', uid).onSnapshot(function (s) {
      S.work = {}; docs(s).forEach(function (w) { S.work[w.homeworkId] = w; });
      repaint(true);
    }, function () { }));
    function editing() { var a = document.activeElement; return a && host.contains(a) && /^(TEXTAREA|INPUT)$/.test(a.tagName); }
    /* While the builder types or codes, live updates wait. */
    function repaint() { if (S.dead) return; if (!S.open) return list(); if (S.lab || editing() || S.uploading) return; detail(); }

    function list() {
      if (!S.hw.length) { host.innerHTML = '<div class="hw">' + empty('No homework yet', 'When your coach sets homework for one of your classes it appears here, and you get a bell and an email.') + '</div>'; return; }
      var todo = S.hw.filter(function (h) { var w = S.work[h.id]; return !w || w.status === 'Draft' || w.status === 'Corrections'; });
      var done = S.hw.filter(function (h) { return todo.indexOf(h) === -1; });
      function row(h) {
        var w = S.work[h.id];
        return '<button type="button" class="hw-item" data-a="open" data-id="' + esc(h.id) + '"><span class="ic"><i class="fas ' + (w && w.status === 'Graded' ? 'fa-award' : 'fa-book-open') + '" aria-hidden="true"></i></span><span class="t"><b>' + esc(h.title) + '</b><span>' + esc(h.courseName || '') + (h.createdByName ? ' · from ' + esc(h.createdByName) : '') + '</span></span>' +
          '<span class="tags">' + dueText(h) + needs(h) + statusPill(w) + '</span></button>';
      }
      host.innerHTML = '<div class="hw">' + (todo.length ? '<h3 class="hw-group">To do</h3><div class="hw-list">' + todo.map(row).join('') + '</div>' : empty('All done', 'You have handed in all your homework.')) +
        (done.length ? '<h3 class="hw-group">Handed in and marked</h3><div class="hw-list">' + done.map(row).join('') + '</div>' : '') + '</div>';
    }

    function ref(h) { return WORK().doc(uid + '_' + h.id); }
    function canWork(w) { return !w || w.status === 'Draft' || w.status === 'Corrections'; }
    /* The hand-in doc is made the first time the builder saves anything. */
    function ensure(h) {
      if (S.work[h.id]) return Promise.resolve(S.work[h.id]);
      if (S.making && S.making[h.id]) return S.making[h.id];
      var d = { homeworkId: h.id, studentId: uid, studentName: stu.name || me.name || '', coachId: stu.coachId || '', courseId: h.courseId || '', track: h.track || '',
        text: '', files: [], status: 'Draft', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
      S.making = S.making || {};
      /* Never write over work that exists but has not arrived in this browser yet. */
      S.making[h.id] = ref(h).get().then(function (snap) {
        if (snap.exists) { S.work[h.id] = Object.assign({ id: snap.id }, snap.data()); return S.work[h.id]; }
        return ref(h).set(d).then(function () { S.work[h.id] = Object.assign({ id: uid + '_' + h.id }, d); return S.work[h.id]; });
      }).then(function (w) { delete S.making[h.id]; return w; }, function (e) { delete S.making[h.id]; throw e; });
      return S.making[h.id];
    }
    function save(h, patch) {
      patch.updatedAt = FV().serverTimestamp();
      return ensure(h).then(function () { return ref(h).update(patch); }).then(function () { Object.keys(patch).forEach(function (k) { if (k !== 'updatedAt' && S.work[h.id]) S.work[h.id][k] = patch[k]; }); });
    }
    function say(t, bad) { var el = host.querySelector('#hwSay'); if (el) { el.textContent = t || ''; el.className = 'hw-msg ' + (bad ? 'bad' : 'ok'); } }

    function detail() {
      var h = S.hw.filter(function (x) { return x.id === S.open; })[0];
      if (!h) { host.innerHTML = '<div class="hw"><button type="button" class="hw-back" data-a="back"><i class="fas fa-arrow-left"></i> All homework</button>' + empty('Homework not found', 'It may have been taken down by your coach.') + '</div>'; return; }
      var w = S.work[h.id], open = canWork(w);
      var files = (w && w.files) || [];
      host.innerHTML = '<div class="hw"><button type="button" class="hw-back" data-a="back"><i class="fas fa-arrow-left"></i> All homework</button>' +
        '<div class="hw-card"><div class="hw-bar"><div><h3>' + esc(h.title) + '</h3><div class="hw-meta">' + esc(h.courseName || '') + (h.createdByName ? ' · from ' + esc(h.createdByName) : '') + dueText(h) + '</div></div>' + statusPill(w) + '</div>' +
          notesHtml(h.notes) + ((h.files || []).length ? '<div><h4>Files to download</h4>' + fileList(h.files) + '</div>' : '') +
          ((h.videos || []).length ? '<div><h4>Watch</h4>' + videoLinks(h.videos) + '</div>' : '') + '</div>' +
        (w && (w.status === 'Graded' || w.status === 'Corrections') ? '<div class="hw-mark' + (w.status === 'Corrections' ? ' bad' : '') + '"><b>' + (w.status === 'Graded' ? 'Marked' + (w.grade ? ': ' + esc(w.grade) : '') : 'Your coach asked for corrections') + '</b>' + (w.feedback ? '<p>' + esc(w.feedback) + '</p>' : '') + '</div>' : '') +
        '<div class="hw-card"><h4>Your work</h4>' +
          (open ? '<textarea id="hwText" maxlength="8000" placeholder="Write your answer or a note for your coach (optional)">' + esc((w && w.text) || '') + '</textarea>'
            : (w && w.text ? '<div class="hw-notes">' + esc(w.text) + '</div>' : '')) +
          (h.requireUpload || files.length ? '<div><h4>' + (h.requireUpload ? 'Upload your files' + (open ? ' (needed to hand in)' : '') : 'Your files') + '</h4><div id="hwMine">' + (fileList(files, open) || '<div class="hw-sub">No files yet.</div>') + '</div>' +
            (open ? '<div class="hw-drop" id="hwDrop" tabindex="0" role="button" style="margin-top:.45rem"><i class="fas fa-cloud-arrow-up"></i> Drop files here or press to choose</div><input type="file" id="hwFileIn" multiple hidden>' : '') + '</div>' : '') +
          (h.ide && h.ide.enabled ? '<div><h4>Paisley VS Code</h4><p class="hw-sub" style="margin:.2rem 0 .5rem">' + (open ? 'Your code saves as you type. Press Hand in when it is ready.' : 'What you handed in.') + '</p><div id="hwIde" class="hw-ide"></div></div>' : '') +
          '<div class="hw-msg" id="hwSay" role="status"></div>' +
          (open ? '<div style="display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="hw-btn primary" data-a="handin"><i class="fas fa-paper-plane"></i> ' + (w && w.status === 'Corrections' ? 'Hand in again' : 'Hand in') + '</button></div>'
            : (w && w.status === 'Submitted' ? '<div class="hw-sub"><i class="fas fa-hourglass-half"></i> Handed in ' + esc(T.fmt(w.submittedAt)) + '. Your coach will mark it.</div>' : '')) +
        '</div></div>';
      if (h.ide && h.ide.enabled) mountIde(h, w, open);
      var ta = host.querySelector('#hwText'), timer = null;
      if (ta) ta.addEventListener('input', function () {
        clearTimeout(timer); say('Saving…');
        timer = setTimeout(function () { S.saving = save(h, { text: ta.value.slice(0, 8000) }).then(function () { say('Saved'); }, function (e) { say('Not saved: ' + T.errMsg(e), true); }); }, 900);
      });
      var drop = host.querySelector('#hwDrop'), fin = host.querySelector('#hwFileIn');
      if (drop) {
        drop.addEventListener('click', function () { fin.click(); });
        drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fin.click(); } });
        fin.addEventListener('change', function () { addFiles(h, fin.files); fin.value = ''; });
        ['dragover', 'dragenter'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('on'); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('on'); addFiles(h, e.dataTransfer.files); });
      }
    }
    function paintMine(h) { var el = host.querySelector('#hwMine'), w = S.work[h.id]; if (el) el.innerHTML = fileList((w && w.files) || [], true) || '<div class="hw-sub">No files yet.</div>'; }
    function addFiles(h, list) {
      var have = ((S.work[h.id] || {}).files || []).length, c = checkFiles(list, have);
      if (c.bad.length) say('Not added: ' + c.bad.join('; '), true);
      if (!c.ok.length) return;
      S.uploading = true;
      c.ok.reduce(function (p, f) {
        return p.then(function () {
          say('Uploading ' + f.name + '…');
          return upload('techHomeworkWork/' + uid + '/' + h.id + '/' + Date.now() + '_' + safeName(f.name), f).then(function (x) {
            var cur = ((S.work[h.id] || {}).files || []).concat([x]);
            return save(h, { files: cur }).then(function () { paintMine(h); say('Uploaded ' + f.name); });
          });
        }).catch(function (e) { say('Upload failed: ' + T.errMsg(e), true); });
      }, Promise.resolve()).then(function () { S.uploading = false; });
    }
    function mountIde(h, w, open) {
      var el = host.querySelector('#hwIde'); if (!el || !g.CodeLab) { if (el) el.innerHTML = '<div class="hw-sub">The IDE could not load. Refresh the page.</div>'; return; }
      var hasCode = w && (w.codeFiles || []).length;
      var starter = String((h.ide && h.ide.starter) || '').trim();
      var build = hasCode ? { id: 'hw_' + h.id, codeFiles: w.codeFiles, codeFolders: w.codeFolders, codeAssets: w.codeAssets, codeActive: w.codeActive }
        : { id: 'hw_' + h.id, codeFiles: starter ? [{ name: 'index.html', lang: 'html', content: starter + '\n' }] : null, codeActive: 'index.html' };
      S.lab = g.CodeLab.mount(el, {
        build: build, canEdit: open, me: me, title: h.title,
        onSave: function (p) { return save(h, p); },
        uploadAsset: open ? function (f, name) {
          var path = 'techHomeworkWork/' + uid + '/' + h.id + '/code_' + Date.now() + '_' + safeName(name.split('/').pop());
          return upload(path, f).then(function (x) { return { url: x.url, storagePath: path }; });
        } : null
      });
    }
    function handIn() {
      var h = S.hw.filter(function (x) { return x.id === S.open; })[0]; if (!h) return;
      var flush = S.lab && S.lab.flush ? S.lab.flush() : Promise.resolve();
      var ta = host.querySelector('#hwText');
      Promise.all([flush, S.saving || Promise.resolve()]).then(function () {
        var w = S.work[h.id] || {}, text = ta ? ta.value.slice(0, 8000) : (w.text || '');
        var hasCode = (S.lab && S.lab.state ? (S.lab.state().codeFiles || []) : (w.codeFiles || [])).length;
        if (h.requireUpload && !(w.files || []).length) { say('Upload at least one file first.', true); return; }
        if (!text.trim() && !(w.files || []).length && !hasCode) { say('Write an answer, upload a file or write some code first.', true); return; }
        return confirmBox('Hand in “' + h.title + '”? You can’t change it after that unless your coach asks for corrections.', 'Hand in').then(function (ok) {
          if (!ok) return;
          var patch = { text: text, status: 'Submitted', submittedAt: FV().serverTimestamp() };
          if (S.lab && S.lab.state) { var st = S.lab.state(); patch.codeFiles = st.codeFiles; patch.codeFolders = st.codeFolders; patch.codeAssets = st.codeAssets; patch.codeActive = st.codeActive; }
          return save(h, patch).then(function () {
            if (S.lab) { S.lab.destroy(); S.lab = null; }
            S.work[h.id].status = 'Submitted'; detail();
            if (T.logActivity) T.logActivity(me, 'submitted', ('Handed in homework: ' + h.title).slice(0, 200));
          });
        });
      }).catch(function (e) { say('Could not hand in: ' + T.errMsg(e), true); });
    }
    function onClick(e) {
      if (onVideoClick(e)) return;
      var rm = e.target.closest('[data-rm]');
      if (rm && host.contains(rm)) {
        var h0 = S.hw.filter(function (x) { return x.id === S.open; })[0], w0 = h0 && S.work[h0.id];
        if (w0 && canWork(w0)) { var fl = (w0.files || []).slice(); fl.splice(+rm.dataset.rm, 1); save(h0, { files: fl }).then(function () { paintMine(h0); }); }
        return;
      }
      var b = e.target.closest('[data-a]'); if (!b || !host.contains(b)) return;
      if (b.dataset.a === 'open') { S.open = b.dataset.id; detail(); window.scrollTo(0, 0); }
      else if (b.dataset.a === 'back') { if (S.lab) { S.lab.destroy(); S.lab = null; } S.open = null; list(); }
      else if (b.dataset.a === 'handin') handIn();
    }
    host.addEventListener('click', onClick);
    host.innerHTML = empty('Loading your homework…', '');
    return {
      destroy: function () { S.dead = true; unsubs.forEach(function (u) { u(); }); if (S.lab) S.lab.destroy(); host.removeEventListener('click', onClick); },
      open: function (id) { if (S.lab) { S.lab.destroy(); S.lab = null; } S.open = id; repaint(); }
    };
  }

  /* =========================================================
     Guardian: what was set and how it went (read-only)
     ========================================================= */
  function mountFamily(host, o) {
    style();
    var stu = o.student, S = { hw: [], work: {}, open: null, dead: false };
    var unsubs = [];
    unsubs.push(HW().where('track', 'in', T.tracksFor(stu.skillLevel)).where('status', '==', 'published').onSnapshot(function (s) {
      S.hw = docs(s).sort(function (a, b) { return ms(b.publishedAt) - ms(a.publishedAt); }); paint();
    }, function (e) { host.innerHTML = empty('Could not load homework', T.errMsg(e)); }));
    unsubs.push(WORK().where('studentId', '==', stu.id).onSnapshot(function (s) { S.work = {}; docs(s).forEach(function (w) { S.work[w.homeworkId] = w; }); paint(); }, function () { }));
    var who = T.firstName(stu.name);
    function paint() {
      if (S.dead) return;
      if (S.open) {
        var h = S.hw.filter(function (x) { return x.id === S.open; })[0], w = h && S.work[h.id];
        if (!h) { S.open = null; return paint(); }
        host.innerHTML = '<div class="hw"><button type="button" class="hw-back" data-a="back"><i class="fas fa-arrow-left"></i> All homework</button>' +
          '<div class="hw-card"><div class="hw-bar"><div><h3>' + esc(h.title) + '</h3><div class="hw-meta">' + esc(h.courseName || '') + dueText(h) + '</div></div>' + statusPill(w) + '</div>' + notesHtml(h.notes) +
          ((h.files || []).length ? '<div><h4>Files</h4>' + fileList(h.files) + '</div>' : '') + ((h.videos || []).length ? '<div><h4>Videos</h4>' + videoLinks(h.videos) + '</div>' : '') + '</div>' +
          (w && (w.status === 'Graded' || w.status === 'Corrections') ? '<div class="hw-mark' + (w.status === 'Corrections' ? ' bad' : '') + '"><b>' + (w.status === 'Graded' ? 'Marked' + (w.grade ? ': ' + esc(w.grade) : '') : 'Their coach asked for corrections') + '</b>' + (w.feedback ? '<p>' + esc(w.feedback) + '</p>' : '') + '</div>' : '') +
          (w && w.status !== 'Draft' ? '<div class="hw-card"><h4>What ' + esc(who) + ' handed in</h4>' + (w.text ? '<div class="hw-notes">' + esc(w.text) + '</div>' : '') + fileList(w.files) + codePreview(w) + '</div>' : '<div class="hw-sub">' + esc(who) + ' has not handed this in yet.</div>') + '</div>';
        fillPreview(host, w);
        return;
      }
      if (!S.hw.length) { host.innerHTML = '<div class="hw">' + empty('No homework yet', 'Homework ' + who + '’s coach sets will appear here with its marks.') + '</div>'; return; }
      host.innerHTML = '<div class="hw"><div class="hw-list">' + S.hw.map(function (h) {
        var w = S.work[h.id];
        return '<button type="button" class="hw-item" data-a="open" data-id="' + esc(h.id) + '"><span class="ic"><i class="fas ' + (w && w.status === 'Graded' ? 'fa-award' : 'fa-book-open') + '" aria-hidden="true"></i></span><span class="t"><b>' + esc(h.title) + '</b><span>' + esc(h.courseName || '') + '</span></span><span class="tags">' + dueText(h) + statusPill(w) + '</span></button>';
      }).join('') + '</div></div>';
    }
    function onClick(e) {
      if (onVideoClick(e)) return;
      var b = e.target.closest('[data-a]'); if (!b || !host.contains(b)) return;
      if (b.dataset.a === 'open') { S.open = b.dataset.id; paint(); } else if (b.dataset.a === 'back') { S.open = null; paint(); }
    }
    host.addEventListener('click', onClick);
    host.innerHTML = empty('Loading homework…', '');
    return { destroy: function () { S.dead = true; unsubs.forEach(function (u) { u(); }); host.removeEventListener('click', onClick); } };
  }

  g.TechHomework = { mountManager: mountManager, mountLearner: mountLearner, mountFamily: mountFamily, style: style };
})(window);
