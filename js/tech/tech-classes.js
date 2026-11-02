/* =========================================================
   Paisley Tech Studio: classes  (window.TechClasses)
   ---------------------------------------------------------
   Built like the curriculum classrooms: a class card (CODING) holds
   topics (Flow), and a topic holds lessons and practice tests.

     techCourses/{id}   { name, discipline, track, createdBy... }
     techTopics/{id}    { courseId, title, description, order... }
     techLessons/{id}   { courseId, topicId, type: lesson | test, track, status,
                          video, notes, instructions, files[], questions[], task... }
     techLessons/{id}/private/key   the answers. Builders can never read them;
                                    submitTechQuiz marks on the server.
     techLessonProgress/{uid}_{lessonId}   opened / watched, plus best score (server)
     techAttempts/{id}  one marked quiz or test (written only by submitTechQuiz)

   A class belongs to one level track: beginner, or advanced (intermediate
   and expert see the same work). See TechUI.trackOf.

     TechClasses.mountManager(host, { me })         admin and coach: build and post
     TechClasses.mountResults(host, { me, students, studentId, lessonId })
     TechClasses.mountLearner(host, { me, student, onStartProject, lessonId })
         me.role 'student' takes the class; 'guardian' sees it read-only.

   Needs TechUI, FastVideo and the global db. The manager and results also
   need ClassroomUI (the .cr-* look and its modal).
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI, esc = T.esc;
  var FV = function () { return firebase.firestore.FieldValue; };
  var COURSES = function () { return db.collection('techCourses'); };
  var TOPICS = function () { return db.collection('techTopics'); };
  var LESSONS = function () { return db.collection('techLessons'); };
  var MAX_QUESTIONS = 100;
  var ICON = { Coding: 'fa-code', Writing: 'fa-pen-nib', Research: 'fa-microscope', Design: 'fa-palette', Media: 'fa-film', Music: 'fa-music', Entrepreneurship: 'fa-lightbulb' };
  var PROJECT_TYPES = [['CODE', 'Code'], ['WRITING', 'Writing'], ['RESEARCH', 'Research'], ['DESIGN', 'Design'], ['MEDIA', 'Media'], ['MUSIC', 'Music'], ['BUILD', 'Build']];
  var QTYPES = [['mcq', 'Multiple choice'], ['truefalse', 'True or false'], ['short', 'Short answer']];

  var byOrder = function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)); };
  var docs = function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };
  var shortId = function () { return Math.random().toString(36).slice(2, 10); };
  var trackName = function (t) { return T.TRACK_LABEL[t] || ''; };
  var wordOf = function (l) { return l.type === 'test' ? 'practice test' : 'lesson'; };
  function scoreClass(p) { return p >= 70 ? 'good' : p >= 40 ? 'mid' : 'low'; }
  function fmtDay(ts) { var d = T.toDate(ts); return d ? d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function isPdf(f) { return f.contentType === 'application/pdf' || /\.pdf(\?|$)/i.test(f.path || f.url || ''); }

  function style() {
    if (document.getElementById('tc-style')) return;
    var s = document.createElement('style'); s.id = 'tc-style';
    s.textContent = [
      '.tc-level{display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .65rem;border-radius:99px;font-size:.7rem;font-weight:800;background:#FFF4D6;color:#7a5c00}',
      '.tc-level.advanced{background:#E5F2EF;color:#245F5A}',
      '.tc-tabs{display:flex;gap:.45rem;flex-wrap:wrap;margin:0 0 1rem}',
      '.tc-tab{padding:.5rem 1rem;border-radius:99px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;font:inherit;font-size:.82rem;font-weight:800;color:var(--muted,#5A6E6A);cursor:pointer}',
      '.tc-tab.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.tc-q{border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.8rem;margin-bottom:.6rem;background:#fff}',
      '.tc-q-head{display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;font-weight:800;font-size:.8rem;color:var(--brand-deep,#245F5A)}',
      '.tc-q-head select{margin-left:auto;width:auto}',
      '.tc-opt{display:flex;gap:.45rem;align-items:center;margin-bottom:.35rem}.tc-opt input[type=text]{flex:1}',
      '.tc-q input[type=text],.tc-q select,.tc-q textarea{padding:.5rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:9px;font:inherit;font-size:.86rem;background:#fff;color:var(--ink,#263331)}.tc-q textarea,.tc-q [data-qf]{width:100%}',
      '.tc-file{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;border-top:1px solid var(--line,rgba(38,51,49,.08));font-size:.86rem;font-weight:700;color:var(--ink,#263331)}',
      '.tc-file:first-child{border-top:0}.tc-file .nm{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.tc-ed-tools{display:flex;gap:.25rem;flex-wrap:wrap;padding:.35rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-bottom:0;border-radius:10px 10px 0 0;background:var(--sage,#E5F2EF)}',
      '.tc-ed-tools button{border:0;background:#fff;border-radius:7px;width:32px;height:30px;cursor:pointer;color:var(--brand-deep,#245F5A)}',
      '.tc-ed-area{min-height:150px;max-height:340px;overflow:auto;padding:.7rem .85rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:0 0 10px 10px;background:#fff;font-size:.92rem;line-height:1.6}',
      '.tc-ed-area:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.tc-section{margin:1.1rem 0 .4rem;padding-top:.9rem;border-top:1px solid var(--line,rgba(38,51,49,.1));font-size:.95rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem}',
      '.tc-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:.3rem;width:100%;padding:1.2rem;text-align:left;font:inherit;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;cursor:pointer;box-shadow:0 4px 14px rgba(36,95,90,.04);transition:border-color .2s,transform .2s}',
      '.tc-card:hover{border-color:var(--brand,#55BFB3);transform:translateY(-2px)}',
      '.tc-card .ic{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:1.15rem;margin-bottom:.4rem}',
      '.tc-card b{font-size:1.05rem;font-weight:800;color:var(--brand-deep,#245F5A);line-height:1.25}.tc-card small{color:var(--muted,#5A6E6A);font-size:.8rem;font-weight:600}',
      '.tc-bub{position:absolute;top:.8rem;right:.8rem;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#E74C3C;color:#fff;font-size:.72rem;font-weight:800;line-height:22px;text-align:center}',
      '.tc-crumb{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.9rem;font-size:.84rem;font-weight:700;color:var(--muted,#5A6E6A)}',
      '.tc-crumb button{border:0;background:none;padding:0;font:inherit;font-weight:800;color:var(--brand-deep,#245F5A);cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
      '.tc-panel{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:1.2rem;margin-bottom:1rem;box-shadow:0 4px 14px rgba(36,95,90,.04)}',
      '.tc-panel h3{margin:0 0 .6rem;font-size:1rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tc-title{margin:0 0 .3rem;font-size:1.35rem;font-weight:800;color:var(--brand-deep,#245F5A);line-height:1.25}',
      '.tc-bar{height:8px;border-radius:99px;background:var(--sage,#E5F2EF);overflow:hidden;margin:.6rem 0 .2rem}.tc-bar i{display:block;height:100%;background:var(--brand,#55BFB3);border-radius:99px}',
      '.tc-topic{margin-bottom:.8rem;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;overflow:hidden}',
      '.tc-topic-head{padding:.8rem 1rem;background:var(--sage,#E5F2EF);font-weight:800;color:var(--brand-deep,#245F5A)}.tc-topic-head small{display:block;font-weight:600;color:var(--muted,#5A6E6A);font-size:.78rem;margin-top:.1rem}',
      '.tc-row{display:flex;align-items:center;gap:.8rem;width:100%;padding:.75rem 1rem;border:0;border-top:1px solid var(--line,rgba(38,51,49,.06));background:none;text-align:left;font:inherit;cursor:pointer}',
      '.tc-row:first-child{border-top:0}.tc-row:hover{background:var(--paper,#F1F9F7)}',
      '.tc-row .ic{width:36px;height:36px;flex:none;border-radius:10px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.tc-row .t{flex:1;min-width:0}.tc-row .t b{display:block;font-weight:800;font-size:.92rem;color:var(--ink,#263331)}.tc-row .t small{display:block;font-size:.76rem;color:var(--muted,#5A6E6A);font-weight:600;margin-top:.1rem}',
      '.tc-pill{display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .6rem;border-radius:99px;font-size:.7rem;font-weight:800;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);white-space:nowrap}',
      '.tc-pill.new{background:#E74C3C;color:#fff}.tc-pill.good{background:rgba(46,184,114,.14);color:#1f8557}.tc-pill.mid{background:rgba(243,156,18,.15);color:#9a6607}.tc-pill.low{background:rgba(231,76,60,.12);color:#b8362a}',
      '.tc-stage{background:#0F1A14;border-radius:16px;overflow:hidden;margin-bottom:1rem;aspect-ratio:16/9;position:relative}',
      '.tc-stage video,.tc-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}',
      '.tc-stage img{width:100%;height:100%;object-fit:cover}',
      '.tc-prose{font-size:.95rem;line-height:1.7;color:var(--ink,#263331);overflow-wrap:anywhere}.tc-prose img{max-width:100%;height:auto}.tc-prose h2,.tc-prose h3{color:var(--brand-deep,#245F5A);margin:1rem 0 .4rem}.tc-prose p{margin:.4rem 0}.tc-prose ul,.tc-prose ol,.tc-ed-area ul,.tc-ed-area ol{padding-left:1.4rem;margin:.4rem 0}',
      '.tc-plain{white-space:pre-wrap}',
      '.tc-pdf{width:100%;height:70vh;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;margin-top:.6rem;background:#fff}',
      '.tc-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.55rem 1.1rem;border-radius:99px;border:1.5px solid var(--brand-deep,#245F5A);background:var(--brand-deep,#245F5A);color:#fff;font:inherit;font-size:.84rem;font-weight:800;cursor:pointer;text-decoration:none}',
      '.tc-btn.light{background:#fff;color:var(--brand-deep,#245F5A);border-color:var(--line,rgba(38,51,49,.15))}.tc-btn.sm{padding:.3rem .8rem;font-size:.76rem}.tc-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.tc-nav{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;margin:1rem 0}',
      '.tc-ask{padding:.9rem 0;border-top:1px solid var(--line,rgba(38,51,49,.08))}.tc-ask:first-of-type{border-top:0}',
      '.tc-ask .q{font-weight:800;margin-bottom:.5rem;color:var(--ink,#263331);white-space:pre-wrap}',
      '.tc-ask label{display:flex;gap:.55rem;align-items:flex-start;padding:.45rem .65rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:10px;margin-bottom:.35rem;cursor:pointer;font-weight:600;font-size:.9rem}',
      '.tc-ask label:has(input:checked){border-color:var(--brand-deep,#245F5A);background:var(--sage,#E5F2EF)}',
      '.tc-ask input[type=text]{width:100%;padding:.6rem .8rem;border:1.5px solid var(--line,rgba(38,51,49,.15));border-radius:10px;font:inherit}',
      '.tc-review{padding:.65rem .8rem;border-radius:10px;margin-top:.45rem;font-size:.86rem;line-height:1.5;font-weight:600}.tc-review.ok{background:rgba(46,184,114,.12);color:#1f6b48}.tc-review.no{background:rgba(231,76,60,.09);color:#a63024}',
      '.tc-score{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;padding:1rem;border-radius:12px;background:var(--sage,#E5F2EF);margin-bottom:.8rem}.tc-score b{font-size:1.6rem;color:var(--brand-deep,#245F5A);font-weight:800}',
      '.tc-empty{padding:2rem 1rem;text-align:center;color:var(--muted,#5A6E6A);font-weight:600;background:#fff;border:2px dashed var(--line,rgba(38,51,49,.12));border-radius:16px}',
      '.tc-msg{font-size:.84rem;font-weight:700;color:#b8362a;min-height:1.1rem;margin-top:.5rem}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function levelBadge(track) { return '<span class="tc-level ' + (track === 'beginner' ? '' : 'advanced') + '"><i class="fas ' + (track === 'beginner' ? 'fa-seedling' : 'fa-rocket') + '"></i> ' + esc(trackName(track)) + '</span>'; }
  function trackTabs(cur, withAll) {
    var tabs = (withAll ? [['all', 'All levels']] : []).concat(T.TRACKS.map(function (t) { return [t, trackName(t)]; }));
    return '<div class="tc-tabs" role="group" aria-label="Level">' + tabs.map(function (t) { return '<button type="button" class="tc-tab' + (cur === t[0] ? ' on' : '') + '" aria-pressed="' + (cur === t[0]) + '" data-a="track" data-v="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>';
  }

  /* A small rich-text box for lesson notes. */
  function notesEditor(host, html) {
    host.innerHTML = '<div class="tc-ed-tools" role="toolbar" aria-label="Formatting">' +
      [['bold', 'fa-bold', 'Bold'], ['italic', 'fa-italic', 'Italic'], ['formatBlock', 'fa-heading', 'Heading'], ['insertUnorderedList', 'fa-list-ul', 'Bullets'], ['insertOrderedList', 'fa-list-ol', 'Numbered list'], ['createLink', 'fa-link', 'Link']]
        .map(function (b) { return '<button type="button" data-cmd="' + b[0] + '" title="' + b[2] + '" aria-label="' + b[2] + '"><i class="fas ' + b[1] + '"></i></button>'; }).join('') + '</div>' +
      '<div class="tc-ed-area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Notes"></div>';
    var area = host.querySelector('.tc-ed-area');
    area.innerHTML = T.cleanHtml(html || '');
    host.querySelector('.tc-ed-tools').addEventListener('mousedown', function (e) {
      var b = e.target.closest('[data-cmd]'); if (!b) return;
      e.preventDefault();
      var cmd = b.dataset.cmd, val = null;
      if (cmd === 'formatBlock') val = 'h3';
      if (cmd === 'createLink') { val = prompt('Link address (https://…)'); if (!T.safeUrl(val)) return; }
      document.execCommand(cmd, false, val);
    });
    return { html: function () { return T.cleanHtml(area.innerHTML).slice(0, 60000); } };
  }

  function uploadFile(lessonId, file, onPct) {
    var path = 'techLessons/' + lessonId + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
    var task = firebase.storage().ref(path).put(file, { contentType: file.type || undefined, cacheControl: 'public,max-age=31536000' });
    task.on('state_changed', function (s) { if (onPct) onPct(Math.round(s.bytesTransferred / s.totalBytes * 100)); });
    return task.then(function () { return task.snapshot.ref.getDownloadURL(); }).then(function (url) {
      return { url: url, path: path, name: file.name.slice(0, 140), contentType: file.type || '', size: file.size };
    });
  }
  function dropStored(path) { if (path) firebase.storage().ref(path).delete().catch(function (e) { console.warn('tech file:', e); }); }

  /* =========================================================
     Questions: one builder for a lesson's quiz and a practice test.
     What is on the lesson doc never includes the answer; that goes in the key.
     ========================================================= */
  function questionBuilder(host, questions, key) {
    var list = (questions || []).map(function (q) {
      var k = (key && key[q.id]) || {};
      return { id: q.id, type: q.type || 'mcq', text: q.text || '', options: (q.options || []).slice(), correct: k.correct == null ? 0 : k.correct, accepted: (k.accepted || []).join(', '), explanation: k.explanation || '' };
    });
    function read() {
      host.querySelectorAll('[data-q]').forEach(function (row, i) {
        var q = list[i];
        q.text = row.querySelector('[data-qf="text"]').value;
        q.explanation = row.querySelector('[data-qf="explanation"]').value;
        if (q.type === 'mcq') {
          q.options = [].map.call(row.querySelectorAll('[data-opt]'), function (x) { return x.value; });
          var pick = row.querySelector('input[type=radio]:checked');
          q.correct = pick ? Number(pick.value) : 0;
        } else if (q.type === 'truefalse') {
          var tf = row.querySelector('input[type=radio]:checked');
          q.correct = tf ? Number(tf.value) : 0;
        } else {
          q.accepted = row.querySelector('[data-qf="accepted"]').value;
        }
      });
    }
    function paint() {
      host.innerHTML = list.map(function (q, i) {
        var body = '';
        if (q.type === 'mcq') {
          body = q.options.map(function (o, n) {
            return '<div class="tc-opt"><input type="radio" name="tcc' + q.id + '" value="' + n + '"' + (Number(q.correct) === n ? ' checked' : '') + ' aria-label="Option ' + (n + 1) + ' is correct"><input type="text" data-opt maxlength="400" placeholder="Option ' + (n + 1) + '" value="' + esc(o) + '"><button type="button" class="cr-btn sm" data-qdel-opt="' + i + ':' + n + '" aria-label="Remove option"' + (q.options.length <= 2 ? ' disabled' : '') + '><i class="fas fa-xmark"></i></button></div>';
          }).join('') + '<div class="cr-note" style="margin:.2rem 0 .4rem">Tick the correct answer.</div><button type="button" class="cr-btn sm" data-qadd-opt="' + i + '"><i class="fas fa-plus"></i> Add option</button>';
        } else if (q.type === 'truefalse') {
          body = ['True', 'False'].map(function (w, n) { return '<label style="display:inline-flex;gap:.35rem;align-items:center;margin-right:1rem;font-weight:700;text-transform:none;letter-spacing:0"><input type="radio" name="tcc' + q.id + '" value="' + n + '"' + (Number(q.correct) === n ? ' checked' : '') + '> ' + w + ' is correct</label>'; }).join('');
        } else {
          body = '<input type="text" data-qf="accepted" maxlength="600" placeholder="Accepted answers, separated by commas" value="' + esc(q.accepted) + '">';
        }
        return '<div class="tc-q" data-q="' + i + '"><div class="tc-q-head">Question ' + (i + 1) +
          '<select data-qtype="' + i + '" aria-label="Question type">' + QTYPES.map(function (t) { return '<option value="' + t[0] + '"' + (q.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="cr-btn sm danger" data-qdel="' + i + '" aria-label="Remove question"><i class="fas fa-trash"></i></button></div>' +
          '<div class="cr-field"><textarea data-qf="text" rows="2" maxlength="1500" placeholder="Type the question" aria-label="Question">' + esc(q.text) + '</textarea></div>' + body +
          '<div class="cr-field" style="margin:.5rem 0 0"><input type="text" data-qf="explanation" maxlength="600" placeholder="Why this is the answer (shown after they submit, optional)" aria-label="Explanation" value="' + esc(q.explanation) + '"></div></div>';
      }).join('') + '<button type="button" class="cr-btn sm primary" data-qadd><i class="fas fa-plus"></i> Add question</button>';
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-qadd],[data-qdel],[data-qadd-opt],[data-qdel-opt]'); if (!t) return;
      read();
      if (t.hasAttribute('data-qadd')) {
        if (list.length >= MAX_QUESTIONS) { alert('A lesson or test can hold up to ' + MAX_QUESTIONS + ' questions.'); return; }
        list.push({ id: shortId(), type: 'mcq', text: '', options: ['', '', '', ''], correct: 0, accepted: '', explanation: '' });
      } else if (t.dataset.qdel) list.splice(Number(t.dataset.qdel), 1);
      else if (t.dataset.qaddOpt) { var q = list[Number(t.dataset.qaddOpt)]; if (q.options.length < 8) q.options.push(''); }
      else if (t.dataset.qdelOpt) {
        var p = t.dataset.qdelOpt.split(':'), qq = list[Number(p[0])], n = Number(p[1]);
        qq.options.splice(n, 1); if (Number(qq.correct) >= qq.options.length) qq.correct = 0;
      }
      paint();
    });
    host.addEventListener('change', function (e) {
      if (!e.target.dataset.qtype) return;
      read();
      var q = list[Number(e.target.dataset.qtype)];
      q.type = e.target.value; q.correct = 0;
      if (q.type === 'mcq' && q.options.length < 2) q.options = ['', '', '', ''];
      paint();
    });
    paint();
    return {
      count: function () { read(); return list.length; },
      /* Returns { questions, answers } or throws a message for the first bad question. */
      collect: function () {
        read();
        var questions = [], answers = {};
        list.forEach(function (q, i) {
          var where = 'Question ' + (i + 1) + ': ', text = q.text.trim();
          if (!text) throw new Error(where + 'type the question.');
          var row = { id: q.id, type: q.type, text: text.slice(0, 1500) }, ans = { explanation: q.explanation.trim().slice(0, 600) };
          if (q.type === 'mcq') {
            var kept = [], newCorrect = -1;
            q.options.forEach(function (o, n) { if (o.trim()) { if (n === Number(q.correct)) newCorrect = kept.length; kept.push(o.trim().slice(0, 400)); } });
            if (kept.length < 2) throw new Error(where + 'add at least two options.');
            if (newCorrect < 0) throw new Error(where + 'tick the correct option.');
            row.options = kept; ans.correct = newCorrect;
          } else if (q.type === 'truefalse') {
            row.options = ['True', 'False']; ans.correct = Number(q.correct) ? 1 : 0;
          } else {
            var acc = String(q.accepted).split(',').map(function (x) { return x.trim().slice(0, 200); }).filter(Boolean);
            if (!acc.length) throw new Error(where + 'add at least one accepted answer.');
            ans.accepted = acc.slice(0, 20);
          }
          questions.push(row); answers[q.id] = ans;
        });
        return { questions: questions, answers: answers };
      }
    };
  }

  /* =========================================================
     Lesson / practice test editor
     ========================================================= */
  async function openEditor(o) {
    var CU = g.ClassroomUI.util, me = o.me, cls = o.course, topics = o.topics, item = o.item, isTest = item ? item.type === 'test' : o.type === 'test';
    var word = isTest ? 'practice test' : 'lesson';
    var ref = item ? LESSONS().doc(item.id) : LESSONS().doc();
    var video = (item && item.video) ? Object.assign({}, item.video) : { url: '', path: '', name: '' };
    var files = ((item && item.files) || []).slice();
    var busy = 0, dirty = false;
    var key = {};
    if (item && (item.questions || []).length) {
      try { var ks = await ref.collection('private').doc('key').get(); key = ks.exists ? (ks.data().answers || {}) : {}; }
      catch (e) { console.warn('answer key:', e); }
    }
    var m = CU.openModal({ title: (item ? 'Edit ' : 'Add ') + word + ' · ' + cls.name, wide: true, beforeClose: function () {
      if (busy) { alert('An upload is still running. Please wait for it to finish.'); return false; }
      return !dirty || confirm('You have unsaved changes. Close without saving?');
    } });
    var topicId0 = item ? item.topicId : o.topicId;
    m.body.innerHTML =
      '<div class="cr-row2"><div class="cr-field"><label for="tcT">' + (isTest ? 'Test title' : 'Lesson title') + '</label><input type="text" id="tcT" maxlength="160" placeholder="' + (isTest ? 'e.g. Flow: practice test 1' : 'e.g. Lesson 1: What is flow?') + '" value="' + esc(item ? item.title : '') + '"></div>' +
      '<div class="cr-field"><label for="tcTop">Topic</label><select id="tcTop">' + topics.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === topicId0 ? ' selected' : '') + '>' + esc(t.title) + '</option>'; }).join('') + '</select></div></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label for="tcVid">Video</label><div class="cr-actions" style="flex-wrap:wrap"><input id="tcVid" type="url" maxlength="1200" placeholder="Paste an AWS, YouTube or Vimeo link" value="' + esc(video.url || '') + '" style="flex:1;min-width:220px">' +
          '<button type="button" class="cr-btn sm" id="tcVidTest"><i class="fas fa-gauge-high"></i> Test link</button>' +
          '<label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload<input type="file" id="tcVidFile" accept="video/*" hidden></label></div>' +
          '<div class="cr-note" id="tcVidNote" style="margin-top:.35rem">' + (video.path ? 'Uploaded: ' + esc(video.name || 'video') : 'Builders watch it here on the page, with no download button.') + '</div></div>' +
        '<div class="cr-field"><label>Notes</label><div id="tcNotes"></div></div>') +
      '<div class="cr-field"><label for="tcIns">Instructions (optional)</label><textarea id="tcIns" rows="2" maxlength="3000" placeholder="' + (isTest ? 'What builders should know before they start' : 'What to do after watching') + '">' + esc((item && item.instructions) || '') + '</textarea></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label>PDFs and files (optional)</label><div id="tcFiles"></div><div class="cr-actions" style="margin-top:.4rem"><label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload file<input type="file" id="tcFileIn" multiple hidden accept="application/pdf,image/*,audio/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip"></label></div><div class="cr-note" id="tcFileNote" style="margin-top:.35rem">PDFs open on the page. Files up to 50 MB.</div></div>') +
      '<div class="tc-section"><i class="fas fa-circle-question"></i> ' + (isTest ? 'Questions' : 'Quiz to test understanding (optional)') + '</div><div class="cr-note" style="margin-bottom:.5rem">Marked automatically. Builders see their score and the right answers after they submit, and can try again.</div><div id="tcQs"></div>' +
      (isTest ? '' :
        '<details style="margin-top:1rem"' + (item && item.task ? ' open' : '') + '><summary style="cursor:pointer;font-weight:800;color:var(--brand-deep)">Give a project to build (optional)</summary><div class="cr-field" style="margin-top:.6rem"><label for="tcTask">What should they build?</label><textarea id="tcTask" rows="2" maxlength="2000">' + esc((item && item.task && item.task.brief) || '') + '</textarea></div>' +
        '<div class="cr-field"><label for="tcTaskT">Opens in</label><select id="tcTaskT">' + PROJECT_TYPES.map(function (p) { return '<option value="' + p[0] + '"' + (item && item.task && item.task.category === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select><div class="cr-note" style="margin-top:.3rem">They submit it to their coach for review like any project.</div></div></details>');
    var $ = function (s) { return m.body.querySelector(s); };
    var notes = isTest ? null : notesEditor($('#tcNotes'), item && item.notes);
    var qs = questionBuilder($('#tcQs'), item && item.questions, key);
    m.body.addEventListener('input', function () { dirty = true; });
    function paintFiles() {
      $('#tcFiles').innerHTML = files.map(function (f, i) { return '<div class="tc-file"><i class="fas ' + (isPdf(f) ? 'fa-file-pdf' : 'fa-file') + '"></i><span class="nm">' + esc(f.name) + '</span><button type="button" class="cr-btn sm danger" data-fdel="' + i + '" aria-label="Remove ' + esc(f.name) + '"><i class="fas fa-xmark"></i></button></div>'; }).join('');
    }
    if (!isTest) {
      paintFiles();
      $('#tcFiles').addEventListener('click', function (e) { var b = e.target.closest('[data-fdel]'); if (!b) return; var f = files.splice(Number(b.dataset.fdel), 1)[0]; dirty = true; if (f) dropStored(f.path); paintFiles(); });
      $('#tcVid').addEventListener('input', function () {
        var v = $('#tcVid').value.trim();
        if (video.path && v !== video.url) { dropStored(video.path); video = { url: v, path: '', name: '' }; } else video.url = v;
        $('#tcVidNote').textContent = v ? g.FastVideo.problem(v) : '';
      });
      $('#tcVidTest').onclick = function () {
        var b = this; b.disabled = true; $('#tcVidNote').textContent = 'Testing the link…';
        g.FastVideo.test($('#tcVid').value).then(function (r) { $('#tcVidNote').textContent = g.FastVideo.testMessage(r); b.disabled = false; });
      };
      $('#tcVidFile').addEventListener('change', function (e) {
        var f = e.target.files[0], note = $('#tcVidNote'); if (!f) return;
        if (f.size >= 500 * 1048576) { note.textContent = 'Too large: videos up to 500 MB. Use an AWS link for longer ones.'; return; }
        busy++; note.textContent = 'Uploading 0%…';
        uploadFile(ref.id, f, function (p) { note.textContent = 'Uploading ' + p + '%…'; }).then(function (r) {
          if (video.path) dropStored(video.path);
          video = { url: r.url, path: r.path, name: r.name }; $('#tcVid').value = r.url; dirty = true;
          note.textContent = 'Uploaded ✓ ' + r.name;
        }).catch(function (er) { note.textContent = 'Upload failed: ' + T.errMsg(er); }).then(function () { busy--; });
      });
      $('#tcFileIn').addEventListener('change', function (e) {
        var note = $('#tcFileNote');
        [].forEach.call(e.target.files, function (f) {
          if (f.size >= 50 * 1048576) { note.textContent = f.name + ' is over 50 MB.'; return; }
          if (files.length >= 20) { note.textContent = 'A lesson can hold up to 20 files.'; return; }
          busy++; note.textContent = 'Uploading ' + f.name + '…';
          uploadFile(ref.id, f).then(function (r) { files.push(r); dirty = true; paintFiles(); note.textContent = 'Uploaded ✓ ' + f.name; })
            .catch(function (er) { note.textContent = 'Upload failed: ' + T.errMsg(er); }).then(function () { busy--; });
        });
        e.target.value = '';
      });
    }
    var live = item && item.status === 'published';
    m.foot.innerHTML = '<span class="cr-err" id="tcErr"></span><button type="button" class="cr-btn" data-e="x">Cancel</button><button type="button" class="cr-btn" data-e="draft"><i class="fas fa-floppy-disk"></i> ' + (live ? 'Take down, keep as draft' : 'Save draft') + '</button><button type="button" class="cr-btn primary" data-e="post"><i class="fas fa-paper-plane"></i> ' + (live ? 'Save changes' : 'Post to ' + esc(trackName(cls.track))) + '</button>';
    var err = function (t) { m.foot.querySelector('#tcErr').textContent = t || ''; };
    m.foot.querySelector('[data-e="x"]').onclick = function () { m.close(); };
    async function save(status) {
      err('');
      if (busy) return err('Please wait for the upload to finish.');
      var title = $('#tcT').value.trim();
      if (!title) return err('Give it a title.');
      var videoUrl = isTest ? '' : T.safeUrl($('#tcVid').value.trim());
      if (!isTest && $('#tcVid').value.trim() && !videoUrl) return err('The video link must start with https://');
      if (videoUrl && !video.path) { var bad = g.FastVideo.problem(videoUrl); if (bad) return err(bad); }
      var built;
      try { built = qs.collect(); } catch (e) { return err(e.message); }
      var notesHtml = notes ? notes.html() : '';
      if (status === 'published') {
        if (isTest && !built.questions.length) return err('A practice test needs at least one question.');
        var plainNotes = notesHtml.replace(/<[^>]+>/g, '').trim();
        if (!isTest && !videoUrl && !plainNotes && !files.length && !built.questions.length) return err('Add a video, notes, a file or a quiz before posting.');
      }
      var topicId = $('#tcTop').value, topic = topics.filter(function (t) { return t.id === topicId; })[0] || {};
      var brief = isTest ? '' : $('#tcTask').value.trim();
      var d = {
        type: isTest ? 'test' : 'lesson', title: title.slice(0, 160), courseId: cls.id, courseName: cls.name, topicId: topicId, topicTitle: topic.title || '',
        track: cls.track, discipline: cls.discipline, status: status,
        video: videoUrl ? { url: videoUrl, path: video.path || '', name: video.name || '' } : null,
        notes: notesHtml, instructions: $('#tcIns').value.trim().slice(0, 3000), files: files.slice(0, 20),
        questions: built.questions, questionCount: built.questions.length,
        task: brief ? { brief: brief.slice(0, 2000), category: $('#tcTaskT').value } : null,
        updatedAt: FV().serverTimestamp()
      };
      if (status === 'published' && !(item && item.publishedAt)) d.publishedAt = FV().serverTimestamp();
      if (!item) Object.assign(d, { order: o.nextOrder || 1, createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp() });
      m.foot.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      try {
        var bt = db.batch();
        bt.set(ref, d, { merge: true });
        bt.set(ref.collection('private').doc('key'), { answers: built.answers, updatedAt: FV().serverTimestamp() });
        await bt.commit();
        dirty = false; m.close(true);
        if (o.onSaved) o.onSaved(status);
      } catch (e) {
        m.foot.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        err('Could not save: ' + T.errMsg(e));
      }
    }
    m.foot.querySelector('[data-e="draft"]').onclick = function () { save('draft'); };
    m.foot.querySelector('[data-e="post"]').onclick = function () { save('published'); };
  }

  /* =========================================================
     Manager: the class cards, topics and lessons (admin and coach)
     ========================================================= */
  function mountManager(host, o) {
    var CU = g.ClassroomUI.util, me = o.me, isAdmin = me.role === 'admin';
    CU.injectStyle(); T.injectStyle(); style();
    host.classList.add('cr-root');
    var S = { screen: 'list', track: 'beginner', courses: [], loaded: false, course: null, topics: [], items: [], collapsed: {}, itemUnsubs: [], panel: null };
    var canEdit = function (x) { return isAdmin || (x && x.createdBy === me.uid); };
    function note(t, bad) { var el = host.querySelector('#tcNote'); if (el) { el.textContent = t || ''; el.style.color = bad ? '#b8362a' : 'var(--brand-deep,#245F5A)'; } }
    function fail(e) { note(T.errMsg(e), true); }
    var unsub = COURSES().onSnapshot(function (s) {
      S.courses = docs(s); S.loaded = true;
      if (S.course) { S.course = S.courses.filter(function (c) { return c.id === S.course.id; })[0] || null; if (!S.course) { closeCourse(); return; } }
      paint();
    }, function (e) { host.innerHTML = '<div class="cr-empty">Could not load classes: ' + esc(T.errMsg(e)) + '</div>'; });
    function closeCourse() { S.itemUnsubs.forEach(function (u) { u(); }); S.itemUnsubs = []; S.course = null; S.screen = 'list'; S.topics = []; S.items = []; paint(); }
    function openCourse(c) {
      closeCourse();
      S.course = c; S.track = c.track; S.screen = 'course';
      S.itemUnsubs.push(TOPICS().where('courseId', '==', c.id).onSnapshot(function (s) { S.topics = docs(s).sort(byOrder); paint(); }, fail));
      S.itemUnsubs.push(LESSONS().where('courseId', '==', c.id).onSnapshot(function (s) { S.items = docs(s).sort(byOrder); paint(); }, fail));
      paint();
    }
    function paint() {
      if (S.panel) return;
      if (S.screen === 'course' && S.course) return paintCourse();
      if (!S.loaded) { host.innerHTML = '<div class="cr-empty">Loading classes…</div>'; return; }
      var list = S.courses.filter(function (c) { return c.track === S.track; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      host.innerHTML = '<div class="cr-bar"><div><h3>Classes</h3><div class="cr-sub">Create a class, add topics, then add lessons and practice tests. Whatever you post goes to every builder on that level and their parents, with a bell and an email.</div></div><button type="button" class="cr-btn primary" data-a="add-class"><i class="fas fa-plus"></i> Add class</button></div>' +
        trackTabs(S.track) +
        (list.length ? '<div class="cr-grid">' + list.map(function (c) {
          return '<button type="button" class="cr-card" data-a="open" data-id="' + esc(c.id) + '"><div class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></div><h4>' + esc(c.name) + '</h4><div class="meta">' + esc(T.disciplineLabel(c.discipline)) + '</div><div style="margin-top:.4rem">' + levelBadge(c.track) + '</div></button>';
        }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No ' + esc(trackName(S.track)) + ' classes yet. Use “Add class” to start one, for example CODING.</div></div>') +
        '<div class="cr-note" id="tcNote" role="status" style="margin-top:.6rem"></div>';
    }
    function statusBadge(l) { return '<span class="cr-badge ' + (l.status === 'published' ? 'published' : 'draft') + '">' + (l.status === 'published' ? 'Posted' : 'Draft') + '</span>'; }
    function itemMeta(l) {
      var bits = [];
      if (l.video) bits.push('Video');
      if (l.notes) bits.push('Notes');
      if ((l.files || []).length) bits.push(l.files.length + ' file' + (l.files.length === 1 ? '' : 's'));
      if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's'));
      if (l.task) bits.push('Project');
      if (l.createdByName) bits.push(l.createdByName);
      return bits.join(' · ');
    }
    function paintCourse() {
      var c = S.course, canC = canEdit(c);
      var h = '<div class="cr-crumb"><a data-a="back">Classes</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(c.name) + '</span></div>' +
        '<div class="cr-bar"><div><h3>' + esc(c.name) + '</h3><div style="margin:.3rem 0">' + levelBadge(c.track) + '</div><div class="cr-sub">' + esc(T.disciplineLabel(c.discipline)) + '. Topics and lessons appear to builders in this order.</div></div><div class="cr-actions">' +
        (canC ? '<button type="button" class="cr-btn" data-a="rename"><i class="fas fa-pen"></i> Rename</button><button type="button" class="cr-btn danger" data-a="del-class"><i class="fas fa-trash"></i></button>' : '') +
        '<button type="button" class="cr-btn primary" data-a="add-topic"><i class="fas fa-plus"></i> Add topic</button></div></div>';
      if (!S.topics.length) h += '<div class="cr-panel"><div class="cr-empty">No topics yet. Add a topic (for example “Flow”), then add lessons inside it.</div></div>';
      S.topics.forEach(function (t, ti) {
        var ls = S.items.filter(function (l) { return l.topicId === t.id; }).sort(byOrder), open = !S.collapsed[t.id];
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t" data-a="toggle" data-id="' + esc(t.id) + '"><i class="fas fa-chevron-' + (open ? 'down' : 'right') + '" style="font-size:.7rem;margin-right:.4rem"></i>' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</span><div class="cr-actions">' +
          '<button type="button" class="cr-btn sm primary" data-a="add-lesson" data-id="' + esc(t.id) + '"><i class="fas fa-plus"></i> Lesson</button>' +
          '<button type="button" class="cr-btn sm primary" data-a="add-test" data-id="' + esc(t.id) + '"><i class="fas fa-plus"></i> Practice test</button>' +
          '<button type="button" class="cr-btn sm" title="Move topic up" aria-label="Move topic up" data-a="topic-up" data-id="' + esc(t.id) + '"' + (ti === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
          '<button type="button" class="cr-btn sm" title="Move topic down" aria-label="Move topic down" data-a="topic-down" data-id="' + esc(t.id) + '"' + (ti === S.topics.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
          (canEdit(t) ? '<button type="button" class="cr-btn sm" title="Edit topic" aria-label="Edit topic" data-a="edit-topic" data-id="' + esc(t.id) + '"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm danger" title="Delete topic" aria-label="Delete topic" data-a="del-topic" data-id="' + esc(t.id) + '"><i class="fas fa-trash"></i></button>' : '') +
          '</div></div>';
        if (open) {
          if (!ls.length) h += '<div class="cr-empty">No lessons in this topic yet.</div>';
          ls.forEach(function (l, li) {
            h += '<div class="cr-lesson"><span class="n"><i class="fas ' + (l.type === 'test' ? 'fa-clipboard-question' : 'fa-circle-play') + '"></i></span><span class="tt">' + esc(l.title) + '<small>' + esc((l.type === 'test' ? 'Practice test' : 'Lesson') + (itemMeta(l) ? ' · ' + itemMeta(l) : '')) + '</small></span>' + statusBadge(l) + '<div class="cr-actions">' +
              '<button type="button" class="cr-btn sm" aria-label="Move up" title="Move up" data-a="item-up" data-id="' + esc(l.id) + '"' + (li === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
              '<button type="button" class="cr-btn sm" aria-label="Move down" title="Move down" data-a="item-down" data-id="' + esc(l.id) + '"' + (li === ls.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
              (l.questionCount ? '<button type="button" class="cr-btn sm" data-a="item-results" data-id="' + esc(l.id) + '"><i class="fas fa-square-poll-vertical"></i> Results</button>' : '') +
              (canEdit(l) ? '<button type="button" class="cr-btn sm" data-a="edit-item" data-id="' + esc(l.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
                (l.status === 'published' ? '' : '<button type="button" class="cr-btn sm primary" data-a="post-item" data-id="' + esc(l.id) + '"><i class="fas fa-paper-plane"></i> Post</button>') +
                '<button type="button" class="cr-btn sm danger" aria-label="Delete" title="Delete" data-a="del-item" data-id="' + esc(l.id) + '"><i class="fas fa-trash"></i></button>' : '') +
              '</div></div>';
          });
        }
        h += '</div>';
      });
      host.innerHTML = h + '<div class="cr-note" id="tcNote" role="status" style="margin-top:.6rem"></div>';
    }
    function openAddClass() {
      var m = CU.openModal({ title: 'Add class' });
      m.body.innerHTML = '<div class="cr-field"><label for="tcN">Class name</label><input type="text" id="tcN" maxlength="120" placeholder="e.g. CODING"></div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="tcD">Subject</label><select id="tcD">' + T.DISCIPLINES.map(function (d) { return '<option value="' + esc(d) + '">' + esc(T.disciplineLabel(d)) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="tcL">Level</label><select id="tcL">' + T.TRACKS.map(function (t) { return '<option value="' + t + '"' + (t === S.track ? ' selected' : '') + '>' + esc(trackName(t)) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="cr-note">A class is for one level. Make a second one to teach the same subject at the other level.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Create class</button>';
      var nm = m.body.querySelector('#tcN'), ds = m.body.querySelector('#tcD');
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = async function () {
        var b = this, name = nm.value.trim(), track = m.body.querySelector('#tcL').value, err = m.foot.querySelector('#tcE');
        if (!name) { err.textContent = 'Give the class a name.'; return; }
        var dup = S.courses.filter(function (c) { return c.track === track && String(c.name).toLowerCase() === name.toLowerCase(); })[0];
        if (dup) { m.close(); openCourse(dup); return; }
        b.disabled = true;
        try {
          var d = { name: name, discipline: ds.value, track: track, createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
          var r = await COURSES().add(d);
          m.close(); openCourse(Object.assign({ id: r.id }, d));
        } catch (e) { b.disabled = false; err.textContent = T.errMsg(e); }
      };
      nm.focus();
    }
    function openRename() {
      var c = S.course, m = CU.openModal({ title: 'Rename class' });
      m.body.innerHTML = '<div class="cr-field"><label for="tcN">Class name</label><input type="text" id="tcN" maxlength="120" value="' + esc(c.name) + '"></div>';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Save</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = function () {
        var name = m.body.querySelector('#tcN').value.trim(), b = this; if (!name) return; b.disabled = true;
        COURSES().doc(c.id).update({ name: name, updatedAt: FV().serverTimestamp() }).then(function () { m.close(); }).catch(function (e) { b.disabled = false; m.foot.querySelector('#tcE').textContent = T.errMsg(e); });
      };
    }
    function openTopic(t) {
      var m = CU.openModal({ title: t ? 'Edit topic' : 'Add topic' });
      m.body.innerHTML = '<div class="cr-field"><label for="tcTT">Topic title</label><input type="text" id="tcTT" maxlength="160" placeholder="e.g. Flow" value="' + esc(t ? t.title : '') + '"></div><div class="cr-field"><label for="tcTD">Description (optional)</label><textarea id="tcTD" rows="2" maxlength="500">' + esc(t ? (t.description || '') : '') + '</textarea></div>';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Save topic</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = function () {
        var title = m.body.querySelector('#tcTT').value.trim(), desc = m.body.querySelector('#tcTD').value.trim(), b = this;
        if (!title) { m.foot.querySelector('#tcE').textContent = 'Please enter a topic title.'; return; }
        b.disabled = true;
        var max = S.topics.reduce(function (a, x) { return Math.max(a, x.order || 0); }, 0);
        var p = t ? TOPICS().doc(t.id).update({ title: title, description: desc, updatedAt: FV().serverTimestamp() })
          : TOPICS().add({ courseId: S.course.id, track: S.course.track, title: title, description: desc, order: max + 1, createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() });
        p.then(function () { m.close(); }).catch(function (e) { b.disabled = false; m.foot.querySelector('#tcE').textContent = T.errMsg(e); });
      };
      m.body.querySelector('#tcTT').focus();
    }
    function swap(coll, list, id, dir) {
      var i = list.findIndex(function (x) { return x.id === id; }), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      var a = list[i], b = list[j], bt = db.batch(), now = FV().serverTimestamp();
      /* Rewrite every position so items with equal or missing order still move. */
      var order = list.map(function (x) { return x.id; });
      order[i] = b.id; order[j] = a.id;
      order.forEach(function (x, n) { bt.update(coll.doc(x), { order: n + 1, updatedAt: now }); });
      bt.commit().catch(fail);
    }
    function deleteItem(l) {
      var bt = db.batch(), ref = LESSONS().doc(l.id);
      bt.delete(ref); bt.delete(ref.collection('private').doc('key'));
      return bt.commit().then(function () {
        if (l.video && l.video.path) dropStored(l.video.path);
        (l.files || []).forEach(function (f) { dropStored(f.path); });
      });
    }
    function openItemResults(l) {
      var m = CU.openModal({ title: 'Results · ' + l.title, wide: true, onClose: function () { if (S.res) { S.res.destroy(); S.res = null; } } });
      m.body.innerHTML = '<div id="tcRes"></div>';
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-x2>Close</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      S.res = mountResults(m.body.querySelector('#tcRes'), { me: me, students: o.students || [], lessonId: l.id });
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-a]'); if (!t) return;
      var a = t.dataset.a, id = t.dataset.id;
      var topic = function () { return S.topics.filter(function (x) { return x.id === id; })[0]; };
      var it = function () { return S.items.filter(function (x) { return x.id === id; })[0]; };
      var inTopic = function (l) { return S.items.filter(function (x) { return x.topicId === l.topicId; }).sort(byOrder); };
      if (a === 'track') { S.track = t.dataset.v; paint(); }
      else if (a === 'add-class') openAddClass();
      else if (a === 'open') { var c = S.courses.filter(function (x) { return x.id === id; })[0]; if (c) openCourse(c); }
      else if (a === 'back') closeCourse();
      else if (a === 'rename') openRename();
      else if (a === 'del-class') {
        if (S.topics.length) { note('Remove this class’s topics first.', true); return; }
        if (confirm('Delete the class “' + S.course.name + '”?')) COURSES().doc(S.course.id).delete().catch(fail);
      }
      else if (a === 'add-topic') openTopic(null);
      else if (a === 'edit-topic') openTopic(topic());
      else if (a === 'toggle') { S.collapsed[id] = !S.collapsed[id]; paint(); }
      else if (a === 'topic-up' || a === 'topic-down') swap(TOPICS(), S.topics, id, a === 'topic-up' ? -1 : 1);
      else if (a === 'item-up' || a === 'item-down') { var cur = it(); if (cur) swap(LESSONS(), inTopic(cur), id, a === 'item-up' ? -1 : 1); }
      else if (a === 'del-topic') {
        if (S.items.some(function (x) { return x.topicId === id; })) { note('Move or delete the lessons in this topic first.', true); return; }
        if (confirm('Delete this topic?')) TOPICS().doc(id).delete().catch(fail);
      }
      else if (a === 'add-lesson' || a === 'add-test') {
        var next = S.items.filter(function (x) { return x.topicId === id; }).reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
        openEditor({ me: me, course: S.course, topics: S.topics, topicId: id, type: a === 'add-test' ? 'test' : 'lesson', nextOrder: next, onSaved: function (st) { note(st === 'published' ? 'Posted. Builders on this level and their parents are being told.' : 'Saved as a draft.'); } });
      }
      else if (a === 'edit-item') { var ed = it(); if (ed) openEditor({ me: me, course: S.course, topics: S.topics, item: ed, onSaved: function () { note('Saved.'); } }); }
      else if (a === 'post-item') {
        var po = it(); if (!po) return;
        if (po.type === 'test' && !po.questionCount) { note('A practice test needs at least one question.', true); return; }
        if (!po.video && !po.notes && !(po.files || []).length && !po.questionCount) { note('Add a video, notes, a file or a quiz before posting.', true); return; }
        if (!confirm('Post “' + po.title + '” to every ' + trackName(po.track) + ' builder and their parents? They get a bell and an email.')) return;
        var up = { status: 'published', updatedAt: FV().serverTimestamp() };
        if (!po.publishedAt) up.publishedAt = FV().serverTimestamp();
        LESSONS().doc(id).update(up).then(function () { note('Posted.'); }).catch(fail);
      }
      else if (a === 'del-item') { var de = it(); if (de && confirm('Delete “' + de.title + '”? Results already recorded stay, but builders can no longer open it.')) deleteItem(de).catch(fail); }
      else if (a === 'item-results') { var ir = it(); if (ir) openItemResults(ir); }
    });
    paint();
    return { destroy: function () { unsub(); S.itemUnsubs.forEach(function (u) { u(); }); if (S.res) S.res.destroy(); } };
  }

  /* =========================================================
     Results: every marked quiz and practice test
     ========================================================= */
  function reviewHtml(rows) {
    return (rows || []).map(function (r, i) {
      return '<div class="tc-ask"><div class="q">' + (i + 1) + '. ' + esc(r.text) + '</div><div class="tc-review ' + (r.correct ? 'ok' : 'no') + '"><i class="fas ' + (r.correct ? 'fa-check' : 'fa-xmark') + '"></i> ' + (r.given === '' || r.given == null ? 'No answer' : esc(r.given)) +
        (r.correct ? '' : '<br><b>Correct answer:</b> ' + esc(r.answer)) + (r.explanation ? '<br>' + esc(r.explanation) : '') + '</div></div>';
    }).join('');
  }
  function mountResults(host, o) {
    var CU = g.ClassroomUI.util;
    CU.injectStyle(); style();
    host.classList.add('cr-root');
    var S = { rows: null, track: 'all', course: 'all', q: '' }, dead = false, me = o.me;
    var students = o.students || [];
    function student(id) { return students.filter(function (s) { return s.id === id; })[0]; }
    function load() {
      var col = db.collection('techAttempts'), jobs;
      if (o.studentId) jobs = [col.where('studentId', '==', o.studentId).get()];
      else if (me.role === 'admin') jobs = [o.lessonId ? col.where('lessonId', '==', o.lessonId).get() : col.orderBy('at', 'desc').limit(400).get()];
      else jobs = students.filter(function (s) { return s.status === 'Active'; }).slice(0, 80).map(function (s) { return col.where('studentId', '==', s.id).get(); });
      Promise.all(jobs).then(function (snaps) {
        if (dead) return;
        var all = []; snaps.forEach(function (s) { all = all.concat(docs(s)); });
        if (o.lessonId) all = all.filter(function (x) { return x.lessonId === o.lessonId; });
        S.rows = all; paint();
      }).catch(function (e) { if (!dead) host.innerHTML = '<div class="cr-empty">Could not load results: ' + esc(T.errMsg(e)) + '</div>'; });
    }
    /* One line per builder per quiz: latest and best, with how many tries. */
    function grouped(rows) {
      var map = {};
      rows.forEach(function (x) {
        var k = x.studentId + '|' + x.lessonId, g2 = map[k] || (map[k] = { studentId: x.studentId, studentName: x.studentName, lessonId: x.lessonId, title: x.title, kind: x.kind, courseName: x.courseName, courseId: x.courseId, topicTitle: x.topicTitle, track: x.track, tries: 0, best: 0, latest: null });
        g2.tries++; g2.best = Math.max(g2.best, x.percent || 0);
        if (!g2.latest || (T.toDate(x.at) || 0) > (T.toDate(g2.latest.at) || 0)) g2.latest = x;
      });
      return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (T.toDate(b.latest.at) || 0) - (T.toDate(a.latest.at) || 0); });
    }
    function paint() {
      if (S.rows === null) { host.innerHTML = '<div class="cr-empty">Loading results…</div>'; return; }
      var q = S.q.trim().toLowerCase();
      var all = grouped(S.rows), courses = {};
      all.forEach(function (r) { if (r.courseId) courses[r.courseId] = r.courseName; });
      var list = all.filter(function (r) {
        return (S.track === 'all' || r.track === S.track) && (S.course === 'all' || r.courseId === S.course) &&
          (!q || (String(r.studentName) + ' ' + String(r.title)).toLowerCase().indexOf(q) > -1);
      });
      var avg = list.length ? Math.round(list.reduce(function (s, r) { return s + (r.latest.percent || 0); }, 0) / list.length) : 0;
      var scoped = o.lessonId || o.studentId;
      host.innerHTML = (scoped ? '' : trackTabs(S.track, true)) +
        '<div class="cr-filters">' + (o.lessonId ? '' : '<select data-rf="course" aria-label="Class"><option value="all">All classes</option>' + Object.keys(courses).map(function (id) { return '<option value="' + esc(id) + '"' + (S.course === id ? ' selected' : '') + '>' + esc(courses[id]) + '</option>'; }).join('') + '</select>') +
        (o.studentId ? '' : '<input type="search" data-rf="q" placeholder="Search builder or test…" aria-label="Search" value="' + esc(S.q) + '">') + '<button type="button" class="cr-btn sm" data-ra="reload"><i class="fas fa-rotate"></i> Refresh</button></div>' +
        (list.length ? '<div class="cr-note" style="margin-bottom:.5rem">' + list.length + ' result' + (list.length === 1 ? '' : 's') + ' · average latest score ' + avg + '%</div><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Quiz or test</th><th>Class</th><th>Latest</th><th>Best</th><th>Tries</th><th>When</th><th></th></tr></thead><tbody>' + list.map(function (r) {
          var s = student(r.studentId), name = (s && s.name) || r.studentName || 'Builder', lp = r.latest.percent || 0;
          return '<tr><td><b>' + esc(name) + '</b></td><td>' + esc(r.title) + '<div class="cr-note">' + (r.kind === 'test' ? 'Practice test' : 'Lesson quiz') + '</div></td><td class="cr-note">' + esc(r.courseName || '') + (r.topicTitle ? ' · ' + esc(r.topicTitle) : '') + '</td><td><span class="tc-pill ' + scoreClass(lp) + '">' + r.latest.score + '/' + r.latest.total + ' · ' + lp + '%</span></td><td>' + r.best + '%</td><td>' + r.tries + '</td><td class="cr-note">' + esc(fmtDay(r.latest.at)) + '</td><td><button type="button" class="cr-btn sm" data-ra="open" data-id="' + esc(r.latest.id) + '"><i class="fas fa-eye"></i> Answers</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No results here yet. They appear when builders finish a quiz or practice test.</div></div>');
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-a="track"],[data-ra]'); if (!t) return;
      if (t.dataset.a === 'track') { S.track = t.dataset.v; paint(); return; }
      if (t.dataset.ra === 'reload') { S.rows = null; paint(); load(); return; }
      var x = (S.rows || []).filter(function (r) { return r.id === t.dataset.id; })[0]; if (!x) return;
      var m = CU.openModal({ title: (x.studentName || 'Builder') + ' · ' + x.title, wide: true });
      m.body.innerHTML = '<div class="tc-score"><b>' + x.percent + '%</b><span>' + x.score + ' of ' + x.total + ' correct · ' + esc(fmtDay(x.at)) + '</span></div>' + reviewHtml(x.review);
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-x2>Close</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
    });
    host.addEventListener('change', function (e) { if (e.target.dataset.rf === 'course') { S.course = e.target.value; paint(); } });
    host.addEventListener('input', function (e) {
      if (e.target.dataset.rf !== 'q') return;
      S.q = e.target.value; var pos = e.target.selectionStart; paint();
      var i = host.querySelector('[data-rf="q"]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { } }
    });
    paint(); load();
    return { destroy: function () { dead = true; } };
  }

  /* =========================================================
     Learner: class cards → topics → lesson on the page.
     A builder takes it; a guardian sees the same pages read-only.
     ========================================================= */
  function mountLearner(host, o) {
    T.injectStyle(); style();
    var me = o.me, student = o.student, isBuilder = me.role === 'student', track = T.trackOf(student.skillLevel), first = T.firstName(student.name);
    var S = { screen: 'home', courses: null, course: null, topics: [], items: [], progress: {}, unread: [], attempts: null, lesson: null };
    var unsubs = [], courseUnsubs = [], dead = false;
    var fail = function (e) { console.warn('tech classes:', e); };
    var query = function (q, fn) { return q.onSnapshot(function (s) { if (!dead) fn(s); }, fail); };

    unsubs.push(query(COURSES().where('track', '==', track), function (s) { S.courses = docs(s).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); if (S.screen === 'home') paint(); }));
    unsubs.push(query(db.collection('techLessonProgress').where('studentId', '==', student.id), function (s) {
      S.progress = {}; s.docs.forEach(function (d) { S.progress[d.data().lessonId] = d.data(); });
      if (S.screen !== 'lesson') paint();
    }));
    unsubs.push(query(db.collection('techNotifications').where('recipientId', '==', me.uid).where('read', '==', false).limit(300), function (s) {
      S.unread = docs(s).filter(function (n) { return n.lessonId && (!n.studentId || n.studentId === student.id); });
      if (S.screen !== 'lesson') paint();
    }));
    db.collection('techAttempts').where('studentId', '==', student.id).orderBy('at', 'desc').limit(15).get().then(function (s) { S.attempts = docs(s); if (!dead && S.screen === 'home') paint(); }).catch(function (e) { S.attempts = []; fail(e); });

    function clearCourse() { courseUnsubs.forEach(function (u) { u(); }); courseUnsubs = []; S.topics = []; S.items = []; }
    function openCourse(c, thenLesson) {
      clearCourse();
      S.course = c; S.screen = 'course'; S.lesson = null; S.loading = 2;
      paint();
      var done = function () {
        S.loading = Math.max(0, S.loading - 1);
        if (S.loading) return;
        if (thenLesson) { var l = S.items.filter(function (x) { return x.id === thenLesson; })[0]; thenLesson = null; if (l) return openLesson(l); }
        if (S.screen === 'course') paint();
      };
      courseUnsubs.push(query(TOPICS().where('courseId', '==', c.id), function (s) { S.topics = docs(s).sort(byOrder); done(); }));
      courseUnsubs.push(query(LESSONS().where('courseId', '==', c.id).where('status', '==', 'published'), function (s) { S.items = docs(s).sort(byOrder); done(); }));
    }
    function orderedItems() {
      var out = [];
      S.topics.forEach(function (t) { S.items.filter(function (l) { return l.topicId === t.id; }).forEach(function (l) { out.push(l); }); });
      return out;
    }
    function goHome() { clearCourse(); releaseVideos(); S.screen = 'home'; S.course = null; S.lesson = null; paint(); }
    function releaseVideos() { host.querySelectorAll('video').forEach(function (v) { try { g.FastVideo.release(v); } catch (e) { /* already gone */ } }); }

    function unreadFor(field, id) { return S.unread.filter(function (n) { return n[field] === id; }).length; }
    function markSeen(lessonId) {
      var seen = S.unread.filter(function (n) { return n.lessonId === lessonId; });
      if (!seen.length) return;
      var bt = db.batch();
      seen.forEach(function (n) { bt.update(db.collection('techNotifications').doc(n.id), { read: true, readAt: FV().serverTimestamp() }); });
      bt.commit().catch(fail);
    }
    function touch(l, extra) {
      if (!isBuilder) return;
      db.collection('techLessonProgress').doc(student.id + '_' + l.id).set(Object.assign({
        studentId: student.id, lessonId: l.id, courseId: l.courseId, topicId: l.topicId, track: l.track, title: l.title, updatedAt: FV().serverTimestamp()
      }, extra || {}), { merge: true }).catch(fail);
    }

    function paint() {
      if (dead) return;
      if (S.screen === 'lesson') return;
      if (S.screen === 'course') return paintCourse();
      paintHome();
    }
    function paintHome() {
      if (S.courses === null) { host.innerHTML = '<div class="tc-empty">Loading classes…</div>'; return; }
      var intro = isBuilder ? 'Your classes at ' + trackName(track) + ' level.' : first + '’s classes at ' + trackName(track) + ' level. You can watch and read everything; only ' + first + ' can take the quizzes.';
      var h = '<p style="margin:0 0 1rem;color:var(--muted,#5A6E6A);font-weight:600">' + levelBadge(track) + ' &nbsp;' + esc(intro) + '</p>';
      h += S.courses.length ? '<div class="tc-grid">' + S.courses.map(function (c) {
        var n = unreadFor('courseId', c.id);
        return '<button type="button" class="tc-card" data-tc="course" data-id="' + esc(c.id) + '">' + (n ? '<span class="tc-bub" aria-label="' + n + ' new">' + n + '</span>' : '') + '<span class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></span><b>' + esc(c.name) + '</b><small>' + esc(T.disciplineLabel(c.discipline)) + '</small></button>';
      }).join('') + '</div>' : '<div class="tc-empty">No classes have been posted for this level yet. New lessons appear here, with a bell and an email.</div>';
      if ((S.attempts || []).length) {
        h += '<div class="tc-panel" style="margin-top:1.2rem"><h3>' + (isBuilder ? 'My latest results' : 'Latest results') + '</h3>' + S.attempts.map(function (a) {
          return '<div class="tc-file"><i class="fas ' + (a.kind === 'test' ? 'fa-clipboard-question' : 'fa-circle-question') + '"></i><span class="nm">' + esc(a.title) + ' <small style="color:var(--muted,#5A6E6A);font-weight:600">· ' + esc(a.courseName || '') + ' · ' + esc(fmtDay(a.at)) + '</small></span><span class="tc-pill ' + scoreClass(a.percent) + '">' + a.score + '/' + a.total + ' · ' + a.percent + '%</span></div>';
        }).join('') + '</div>';
      }
      host.innerHTML = h;
    }
    function itemState(l) {
      var p = S.progress[l.id], out = '';
      if (unreadFor('lessonId', l.id)) out += '<span class="tc-pill new">New</span>';
      if (p && p.bestPercent != null) out += '<span class="tc-pill ' + scoreClass(p.bestPercent) + '">Best ' + p.bestPercent + '%</span>';
      else if (l.type === 'lesson' && p && p.watchedAt) out += '<span class="tc-pill good"><i class="fas fa-check"></i> Watched</span>';
      return out;
    }
    function isDone(l) { var p = S.progress[l.id]; return !!p && (p.bestPercent != null || (l.type === 'lesson' && !!p.watchedAt)); }
    function crumb(extra) { return '<div class="tc-crumb"><button type="button" data-tc="home">Classes</button>' + extra + '</div>'; }
    function paintCourse() {
      var c = S.course;
      if (S.loading) { host.innerHTML = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') + '<div class="tc-empty">Loading…</div>'; return; }
      var all = orderedItems(), done = all.filter(isDone).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
      var h = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') +
        '<div class="tc-panel"><h2 class="tc-title">' + esc(c.name) + '</h2>' + levelBadge(c.track) + ' <span class="tc-pill">' + esc(T.disciplineLabel(c.discipline)) + '</span>' +
        (all.length ? '<div class="tc-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><small style="color:var(--muted,#5A6E6A);font-weight:700">' + done + ' of ' + all.length + ' done</small>' : '') + '</div>';
      var shown = 0;
      S.topics.forEach(function (t) {
        var ls = S.items.filter(function (l) { return l.topicId === t.id; });
        if (!ls.length) return;
        shown++;
        h += '<div class="tc-topic"><div class="tc-topic-head">' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</div>' + ls.map(function (l) {
          var bits = []; if (l.video) bits.push('Video'); if (l.notes) bits.push('Notes'); if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's')); if (l.task) bits.push('Project');
          return '<button type="button" class="tc-row" data-tc="lesson" data-id="' + esc(l.id) + '"><span class="ic"><i class="fas ' + (l.type === 'test' ? 'fa-clipboard-question' : 'fa-circle-play') + '"></i></span><span class="t"><b>' + esc(l.title) + '</b><small>' + esc((l.type === 'test' ? 'Practice test' : 'Lesson') + (bits.length ? ' · ' + bits.join(' · ') : '')) + '</small></span>' + itemState(l) + '<i class="fas fa-chevron-right" style="font-size:.7rem;opacity:.5"></i></button>';
        }).join('') + '</div>';
      });
      if (!shown) h += '<div class="tc-empty">Nothing has been posted in this class yet.</div>';
      host.innerHTML = h;
    }
    function stageHtml(l) {
      var url = l.video && T.safeUrl(l.video.url); if (!url) return '';
      var inner = g.FastVideo.embed(url) ? g.FastVideo.embedHtml(url, { title: l.title }) :
        g.FastVideo.videoHtml(url, { attrs: 'controls playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture data-tc-video' });
      return '<div class="tc-stage" data-tc-stage>' + inner + '</div>';
    }
    function openLesson(l) {
      releaseVideos();
      S.screen = 'lesson'; S.lesson = l;
      var all = orderedItems(), i = all.findIndex(function (x) { return x.id === l.id; }), prev = all[i - 1], next = all[i + 1];
      var files = (l.files || []).filter(function (f) { return T.safeUrl(f.url); });
      var word = l.type === 'test' ? 'Practice test' : 'Lesson';
      host.innerHTML = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <button type="button" data-tc="back">' + esc(S.course.name) + '</button> <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(l.title) + '</span>') +
        '<h2 class="tc-title">' + esc(l.title) + '</h2><p style="margin:0 0 1rem;color:var(--muted,#5A6E6A);font-weight:600;font-size:.86rem">' + word + ' · ' + esc(l.topicTitle || '') + '</p>' +
        stageHtml(l) +
        (l.instructions ? '<div class="tc-panel"><h3><i class="fas fa-list-check"></i> Instructions</h3><div class="tc-prose tc-plain">' + esc(l.instructions) + '</div></div>' : '') +
        (l.notes ? '<div class="tc-panel"><h3><i class="fas fa-book-open"></i> Notes</h3><div class="tc-prose">' + T.cleanHtml(l.notes) + '</div></div>' : '') +
        (files.length ? '<div class="tc-panel"><h3><i class="fas fa-paperclip"></i> Files</h3>' + files.map(function (f, n) {
          return '<div class="tc-file"><i class="fas ' + (isPdf(f) ? 'fa-file-pdf' : 'fa-file') + '"></i><span class="nm">' + esc(f.name) + '</span>' + (isPdf(f) ? '<button type="button" class="tc-btn light sm" data-tc="pdf" data-n="' + n + '">Read here</button>' : '<a class="tc-btn light sm" href="' + esc(T.safeUrl(f.url)) + '" target="_blank" rel="noopener noreferrer">Open</a>') + '</div><div data-pdf="' + n + '"></div>';
        }).join('') + '</div>' : '') +
        ((l.questions || []).length ? '<div class="tc-panel" id="tcQuiz"></div>' : '') +
        (l.task ? '<div class="tc-panel"><h3><i class="fas fa-hammer"></i> Your project</h3><div class="tc-prose tc-plain" style="margin-bottom:.8rem">' + esc(l.task.brief) + '</div>' + (isBuilder && o.onStartProject ? '<button type="button" class="tc-btn" data-tc="project"><i class="fas fa-rocket"></i> Start this project</button>' : '') + '</div>' : '') +
        '<div class="tc-nav">' + (prev ? '<button type="button" class="tc-btn light" data-tc="lesson" data-id="' + esc(prev.id) + '"><i class="fas fa-arrow-left"></i> Previous</button>' : '<span></span>') + (next ? '<button type="button" class="tc-btn" data-tc="lesson" data-id="' + esc(next.id) + '">Next <i class="fas fa-arrow-right"></i></button>' : '<button type="button" class="tc-btn light" data-tc="back">Back to the class</button>') + '</div>';
      markSeen(l.id);
      touch(l, { openedAt: FV().serverTimestamp() });
      if (isBuilder) T.logActivity(me, 'material_opened', 'Opened the ' + word.toLowerCase() + ' “' + l.title + '”', { missionId: '', origin: 'class' });
      if ((l.questions || []).length) paintQuiz(l);
      window.scrollTo(0, 0);
    }
    /* The form, or the last result. Lives in its own box so the video keeps playing. */
    function paintQuiz(l, result) {
      var box = host.querySelector('#tcQuiz'); if (!box) return;
      var title = l.type === 'test' ? 'Practice test' : 'Test your understanding', p = S.progress[l.id];
      if (result) {
        box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3><div class="tc-score"><b>' + result.percent + '%</b><span>' + result.score + ' of ' + result.total + ' correct</span></div>' + reviewHtml(result.review) + '<button type="button" class="tc-btn light" data-tc="retry" style="margin-top:.8rem"><i class="fas fa-rotate"></i> Try again</button>';
        return;
      }
      if (!isBuilder) {
        box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3><p class="tc-prose" style="margin:0 0 .6rem">' + (l.questions || []).length + ' questions.</p><div id="tcKid">Loading ' + esc(first) + '’s results…</div>';
        db.collection('techAttempts').where('studentId', '==', student.id).where('lessonId', '==', l.id).get().then(function (s) {
          var el = box.querySelector('#tcKid'); if (!el) return;
          var rows = docs(s).sort(function (a, b) { return (T.toDate(b.at) || 0) - (T.toDate(a.at) || 0); });
          el.innerHTML = rows.length ? '<div class="tc-score"><b>' + rows[0].percent + '%</b><span>Latest: ' + rows[0].score + ' of ' + rows[0].total + ' · ' + esc(fmtDay(rows[0].at)) + ' · ' + rows.length + ' tr' + (rows.length === 1 ? 'y' : 'ies') + '</span></div>' + reviewHtml(rows[0].review) : esc(first) + ' has not taken this yet.';
        }).catch(function (e) { var el = box.querySelector('#tcKid'); if (el) el.textContent = T.errMsg(e); });
        return;
      }
      box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3>' + (p && p.bestPercent != null ? '<p style="margin:0 0 .5rem;font-weight:700;color:var(--muted,#5A6E6A)">Your best so far: ' + p.bestPercent + '%</p>' : '') +
        l.questions.map(function (q, i) {
          var input = q.type === 'short' ? '<input type="text" data-qa="' + esc(q.id) + '" maxlength="300" placeholder="Your answer" aria-label="Your answer">' :
            (q.options || []).map(function (op, n) { return '<label><input type="radio" name="tq' + esc(q.id) + '" data-qa="' + esc(q.id) + '" value="' + n + '"> <span>' + esc(op) + '</span></label>'; }).join('');
          return '<div class="tc-ask"><div class="q">' + (i + 1) + '. ' + esc(q.text) + '</div>' + input + '</div>';
        }).join('') + '<button type="button" class="tc-btn" data-tc="submit" style="margin-top:.8rem"><i class="fas fa-paper-plane"></i> Submit answers</button><div class="tc-msg" id="tcQMsg" role="status"></div>';
    }
    function submitQuiz(l, btn) {
      var answers = {}, missing = 0;
      l.questions.forEach(function (q) {
        if (q.type === 'short') { var v = (host.querySelector('[data-qa="' + q.id + '"]') || {}).value || ''; if (!v.trim()) missing++; answers[q.id] = v.trim().slice(0, 300); }
        else { var c = host.querySelector('input[name="tq' + q.id + '"]:checked'); if (!c) missing++; else answers[q.id] = Number(c.value); }
      });
      var msg = host.querySelector('#tcQMsg');
      if (missing) { msg.textContent = 'Answer every question first (' + missing + ' left).'; return; }
      btn.disabled = true; msg.textContent = 'Marking…';
      firebase.functions().httpsCallable('submitTechQuiz')({ lessonId: l.id, answers: answers, attemptKey: S.attemptKey || (S.attemptKey = shortId() + shortId()) }).then(function (r) {
        S.attemptKey = null;
        S.attempts = null;
        db.collection('techAttempts').where('studentId', '==', student.id).orderBy('at', 'desc').limit(15).get().then(function (s) { S.attempts = docs(s); }).catch(fail);
        if (!dead && S.lesson && S.lesson.id === l.id) { paintQuiz(l, r.data); var box = host.querySelector('#tcQuiz'); if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      }).catch(function (e) { btn.disabled = false; msg.textContent = 'Could not submit: ' + T.errMsg(e); });
    }
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-fv-embed]') && isBuilder && S.lesson) touch(S.lesson, { watchedAt: FV().serverTimestamp() });
      var t = e.target.closest('[data-tc]'); if (!t) return;
      var a = t.dataset.tc, id = t.dataset.id;
      if (a === 'home') goHome();
      else if (a === 'course') { var c = (S.courses || []).filter(function (x) { return x.id === id; })[0]; if (c) openCourse(c); }
      else if (a === 'back') { releaseVideos(); S.screen = 'course'; S.lesson = null; paint(); window.scrollTo(0, 0); }
      else if (a === 'lesson') { var l = S.items.filter(function (x) { return x.id === id; })[0]; if (l) openLesson(l); }
      else if (a === 'submit') submitQuiz(S.lesson, t);
      else if (a === 'retry') paintQuiz(S.lesson);
      else if (a === 'pdf') {
        var n = t.dataset.n, f = (S.lesson.files || []).filter(function (x) { return T.safeUrl(x.url); })[Number(n)], slot = host.querySelector('[data-pdf="' + n + '"]');
        if (!f || !slot) return;
        slot.innerHTML = slot.innerHTML ? '' : '<iframe class="tc-pdf" src="' + esc(T.safeUrl(f.url)) + '#toolbar=0" title="' + esc(f.name) + '"></iframe>';
      }
      else if (a === 'project') { t.disabled = true; Promise.resolve(o.onStartProject(S.lesson)).catch(function (er) { t.disabled = false; alert(T.errMsg(er)); }); }
    });
    host.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-tc-stage]')) e.preventDefault(); });
    /* timeupdate does not bubble, so listen on the way down. Four fifths in counts as watched. */
    host.addEventListener('timeupdate', function (e) {
      if (!isBuilder || !S.lesson || !e.target.matches || !e.target.matches('video')) return;
      var v = e.target;
      if (S.watched !== S.lesson.id && v.duration && v.currentTime / v.duration >= 0.8) {
        S.watched = S.lesson.id;
        touch(S.lesson, { watchedAt: FV().serverTimestamp() });
        T.logActivity(me, 'video_watched', 'Watched “' + S.lesson.title + '”', { origin: 'class' });
      }
    }, true);
    if (o.lessonId) {
      LESSONS().doc(o.lessonId).get().then(function (d) {
        if (dead || !d.exists) return;
        return COURSES().doc(d.data().courseId).get().then(function (c) { if (!dead && c.exists) openCourse(Object.assign({ id: c.id }, c.data()), o.lessonId); });
      }).catch(fail);
    }
    paint();
    return { destroy: function () { dead = true; releaseVideos(); unsubs.forEach(function (u) { u(); }); clearCourse(); } };
  }

  g.TechClasses = { mountManager: mountManager, mountResults: mountResults, mountLearner: mountLearner };
})(window);
