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
     techLessonWork/{uid}_{lessonId}   what a builder made for the lesson's task (TechWork)

   A lesson needs no title of its own: class > topic names it, and it shows
   as "Lesson 1", "Lesson 2" in its topic (labelsFor). A lesson with a task
   opens in steps: Learn (video, notes, files) > Make it (Paisley VS Code or writing
   pad, handed in and marked with ink) > Quiz.

   A class belongs to one level track: beginner, intermediate or expert (old
   classes tagged 'advanced' show to intermediate and expert). See TechUI.tracksFor.

   Levels and locks. The lessons of a class, in topic then lesson order, are its
   levels: Level 1 is open and every other one is locked (a padlock) until the
   one before is passed. What passing takes is set per lesson in lesson.gate
   { watch, quiz, pass (%), work } (gateSteps; functions/tech.js mirrors it and
   records passedAt, then tells the builder, coach, admins and guardians). A class
   with afterCourseId stays locked until every lesson of that class is passed.
   techAccess/{uid}.open[courseId] = 'all' | lessonId is the admin opening a class
   (or up to one lesson) for one builder, at any level.

     TechClasses.mountManager(host, { me })         admin and coach: build and post
     TechClasses.mountResults(host, { me, students, studentId, lessonId })
     TechClasses.mountLearner(host, { me, student, lessonId })
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
  /* 'open' has no options and no answer: the builder writes, a coach reads it in Results. */
  var QTYPES = [['open', 'Written answer (no options)'], ['mcq', 'Multiple choice'], ['truefalse', 'True or false'], ['short', 'Short answer (marked)']];

  var byOrder = function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)); };
  var docs = function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); };
  var shortId = function () { return Math.random().toString(36).slice(2, 10); };
  var trackName = function (t) { return T.TRACK_LABEL[t] || ''; };
  var wordOf = function (l) { return l.type === 'test' ? 'practice test' : 'lesson'; };
  /* What each lesson in one topic is called: its own title, or "Lesson 2" / "Practice test 1". */
  function labelsFor(items) {
    var n = { lesson: 0, test: 0 }, out = {};
    items.slice().sort(byOrder).forEach(function (l) {
      var k = l.type === 'test' ? 'test' : 'lesson'; n[k]++;
      out[l.id] = l.title || (k === 'test' ? 'Practice test ' : 'Lesson ') + n[k];
    });
    return out;
  }
  /* ---- Passing a level (must match lessonGate / gateMet in functions/tech.js) ----
     No gate saved means every step the lesson has counts, with a 50% pass mark. */
  var DEFAULT_PASS = 50;
  function gateOf(l) {
    var gt = (l && l.gate) || { watch: true, quiz: true, work: true, pass: DEFAULT_PASS };
    var qs = (l && l.questions) || [], pass = Number(gt.pass);
    return {
      watch: !!gt.watch && l.type !== 'test' && !!(l.video && l.video.url),
      quiz: !!gt.quiz && qs.length > 0,
      marked: qs.some(function (q) { return q.type !== 'open'; }),
      pass: isFinite(pass) && gt.pass !== '' && gt.pass != null ? Math.max(0, Math.min(100, Math.round(pass))) : DEFAULT_PASS,
      work: !!gt.work && !!l.task
    };
  }
  function handedIn(w) { return !!w && ((w.submitCount || 0) > 0 || ['Submitted', 'Graded', 'Corrections'].indexOf(w.status) > -1); }
  /* The steps to pass one lesson, each done or not, for one builder. */
  function gateSteps(l, p, w) {
    var gt = gateOf(l), steps = [];
    p = p || {};
    if (gt.watch) steps.push({ k: 'watch', icon: 'fa-circle-play', label: 'Watch the video', done: !!p.watchedAt });
    if (gt.quiz) steps.push(gt.marked
      ? { k: 'quiz', icon: 'fa-circle-question', label: 'Score ' + gt.pass + '% or more in the quiz', done: p.bestPercent != null && p.bestPercent >= gt.pass }
      : { k: 'quiz', icon: 'fa-circle-question', label: 'Answer the quiz', done: !!p.lastAttemptAt || (p.attempts || 0) > 0 });
    if (gt.work) steps.push({ k: 'work', icon: g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'fa-pen-nib' : 'fa-code', label: g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'Hand in your writing' : 'Hand in your code', done: handedIn(w) });
    if (!steps.length) steps.push({ k: 'open', icon: 'fa-door-open', label: 'Open this ' + wordOf(l), done: !!p.openedAt });
    return { steps: steps, passed: !!p.passedAt || steps.every(function (s) { return s.done; }) };
  }
  function gateSummary(l) {
    var gt = gateOf(l), bits = [];
    if (gt.watch) bits.push('watch');
    if (gt.quiz) bits.push(gt.marked ? 'quiz ' + gt.pass + '%' : 'answer quiz');
    if (gt.work) bits.push('hand in work');
    return bits.length ? 'To pass: ' + bits.join(', ') : 'Passes when opened';
  }
  /* Every lesson of a class in the order builders meet them (topic order, then lesson order). */
  function inOrder(topics, items) {
    var out = [];
    topics.slice().sort(byOrder).forEach(function (t) { items.filter(function (l) { return l.topicId === t.id; }).sort(byOrder).forEach(function (l) { out.push(l); }); });
    return out;
  }
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
      /* Class cards, topics and rows copy the IGCSE / CBC classroom (.cr-* in classroom-helpers.js). */
      '.tc-hbar{margin:0 0 1rem}.tc-hbar h3{margin:0 0 .15rem;font-size:1.05rem;font-weight:700;color:var(--brand-deep,#245F5A)}.tc-hbar .sub{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted,#5A6E6A)}',
      '.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:.9rem}',
      '.tc-card{position:relative;display:block;width:100%;padding:1.1rem 1.2rem;text-align:left;font:inherit;color:inherit;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;cursor:pointer;transition:border-color .15s,transform .15s}',
      '.tc-card:hover{border-color:var(--brand,#55BFB3);transform:translateY(-2px)}',
      '.tc-card .ic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(85,191,179,.14);color:var(--brand-deep,#245F5A);font-size:.95rem;margin-bottom:.7rem}',
      '.tc-card b{display:block;margin:0 0 .15rem;font-size:.95rem;font-weight:700;color:var(--brand-deep,#245F5A);line-height:1.3}.tc-card small{display:block;color:var(--muted,#5A6E6A);font-size:.76rem;font-weight:500}',
      '.tc-bub{position:absolute;top:-8px;right:-8px;min-width:24px;height:24px;padding:0 4px;border-radius:12px;border:2px solid #fff;background:#E74C3C;color:#fff;font-size:.72rem;font-weight:800;line-height:20px;text-align:center;box-shadow:0 2px 6px rgba(231,76,60,.35)}',
      '.tc-crumb{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem;font-size:.8rem;color:var(--muted,#5A6E6A)}',
      '.tc-crumb button{border:0;background:none;padding:0;font:inherit;font-weight:700;color:var(--brand-deep,#245F5A);cursor:pointer}.tc-crumb button:hover{text-decoration:underline}',
      '.tc-prog{display:inline-flex;align-items:center;gap:.4rem;font-size:.74rem;font-weight:700;color:var(--muted,#5A6E6A)}',
      '.tc-prog .bar{width:56px;height:4px;border-radius:99px;background:var(--sage,#E5F2EF);overflow:hidden}.tc-prog .bar i{display:block;height:100%;background:var(--brand,#55BFB3)}',
      '.tc-panel{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:1.2rem;margin-bottom:1rem;box-shadow:0 4px 14px rgba(36,95,90,.04)}',
      '.tc-panel h3{margin:0 0 .6rem;font-size:1rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tc-title{margin:0 0 .3rem;font-size:1.35rem;font-weight:800;color:var(--brand-deep,#245F5A);line-height:1.25}',
      '.tc-bar{height:8px;border-radius:99px;background:var(--sage,#E5F2EF);overflow:hidden;margin:.6rem 0 .2rem}.tc-bar i{display:block;height:100%;background:var(--brand,#55BFB3);border-radius:99px}',
      '.tc-topic{margin-bottom:.8rem;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;overflow:hidden}',
      '.tc-topic-head{padding:.8rem 1rem;background:var(--sage,#E5F2EF);font-weight:800;font-size:.9rem;color:var(--brand-deep,#245F5A)}.tc-topic-head small{display:block;font-weight:500;color:var(--muted,#5A6E6A);font-size:.74rem}',
      '.tc-row{display:flex;align-items:center;gap:.7rem;width:100%;padding:.65rem 1rem;border:0;border-top:1px solid var(--line-soft,rgba(38,51,49,.06));background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}',
      '.tc-row:hover{background:var(--paper,#F1F9F7)}',
      '.tc-row .n{width:2rem;flex:none;font-weight:800;font-size:.82rem;color:var(--brand-deep,#245F5A)}',
      '.tc-row .t{flex:1;min-width:0;font-size:.88rem;font-weight:600}.tc-row .t b{display:block;font-weight:600;font-size:.88rem;color:var(--ink,#263331)}.tc-row .t small{display:block;font-size:.72rem;color:var(--muted,#5A6E6A);font-weight:500}',
      '.tc-pill{display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .6rem;border-radius:99px;font-size:.7rem;font-weight:800;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);white-space:nowrap}',
      '.tc-pill.new{background:#E74C3C;color:#fff}.tc-pill.good{background:rgba(46,184,114,.14);color:#1f8557}.tc-pill.mid{background:rgba(243,156,18,.15);color:#9a6607}.tc-pill.low{background:rgba(231,76,60,.12);color:#b8362a}',
      '.tc-stage{background:#0F1A14;border-radius:16px;overflow:hidden;margin:0 auto 1rem;aspect-ratio:16/9;position:relative;width:min(100%,calc(60vh * 16 / 9));box-shadow:0 10px 30px rgba(36,95,90,.12)}',
      /* lesson page: video and work on the left, the topic's lessons on the right */
      '.tc-learn{max-width:1180px}',
      '.tc-lhead{margin:.1rem 0 1rem}.tc-eyebrow{font-size:.7rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--brand,#55BFB3)}',
      '.tc-lhead h2{margin:.1rem 0 .45rem;font-size:1.1rem;font-weight:700;color:var(--brand-deep,#245F5A);line-height:1.3}.tc-lhead h2 span{font-size:.85rem;font-weight:600;color:var(--muted,#5A6E6A)}',
      '.tc-meta{display:flex;gap:.35rem;flex-wrap:wrap}',
      '.tc-lgrid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:1.25rem;align-items:start}',
      '.tc-lside{position:sticky;top:1rem;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:.8rem;box-shadow:0 4px 14px rgba(36,95,90,.04)}',
      '.tc-lside h4{margin:.1rem .4rem .5rem;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.tc-sitem{display:flex;gap:.6rem;align-items:center;width:100%;padding:.5rem .55rem;border:0;background:none;border-radius:10px;text-align:left;font:inherit;font-size:.84rem;font-weight:700;color:var(--ink,#263331);cursor:pointer}',
      '.tc-sitem:hover{background:var(--paper,#F4F8F7)}.tc-sitem.on{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.tc-sitem .n{width:26px;height:26px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:.72rem;font-weight:800;background:#fff;border:1.5px solid var(--line,rgba(38,51,49,.15));color:var(--muted,#5A6E6A)}',
      '.tc-sitem.on .n{border-color:var(--brand,#55BFB3);color:var(--brand-deep,#245F5A)}.tc-sitem.done .n{background:#2EB872;border-color:#2EB872;color:#fff}',
      '.tc-sitem .t{min-width:0}.tc-sitem small{display:block;font-weight:600;color:var(--muted,#5A6E6A);font-size:.72rem;margin-top:.05rem}',
      '.tc-practice{display:flex;align-items:center;gap:1rem;padding:1rem 1.15rem;border-radius:16px;margin:0 0 1rem;background:linear-gradient(135deg,#245F5A,#2E7C74);color:#fff;box-shadow:0 10px 26px rgba(36,95,90,.18)}',
      '.tc-practice .ic{width:46px;height:46px;border-radius:13px;background:rgba(255,255,255,.14);display:grid;place-items:center;font-size:1.15rem;flex:none}',
      '.tc-practice .t{flex:1;min-width:0}.tc-practice b{display:block;font-size:1rem;font-weight:800}',
      '.tc-practice small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;opacity:.88;font-size:.82rem;font-weight:600;margin:.2rem 0 .35rem;line-height:1.45}',
      '.tc-practice .tc-pill{background:rgba(255,255,255,.18);color:#fff}',
      '.tc-btn.gold{background:#F5C842;border-color:#F5C842;color:#3b2f00}.tc-btn.gold:hover{background:#ffd75e}',
      '.tc-box{background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;margin-bottom:1rem;overflow:hidden;box-shadow:0 4px 14px rgba(36,95,90,.04)}',
      '.tc-boxtabs{display:flex;gap:.2rem;padding:.35rem .6rem 0;border-bottom:1px solid var(--line,rgba(38,51,49,.1));background:#FAFCFB;overflow-x:auto}',
      '.tc-boxtab{border:0;background:none;padding:.65rem .9rem;font:inherit;font-weight:800;font-size:.84rem;color:var(--muted,#5A6E6A);border-bottom:2.5px solid transparent;cursor:pointer;white-space:nowrap}',
      '.tc-boxtab.on{color:var(--brand-deep,#245F5A);border-bottom-color:var(--brand,#55BFB3)}',
      '.tc-boxpane{padding:1rem 1.2rem}',
      '.tc-pop{position:fixed;inset:0;z-index:600;background:rgba(15,26,20,.55);display:flex;padding:14px}',
      '.tc-pop-box{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--paper,#F4F8F7);border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.28)}',
      '.tc-pop-head{display:flex;align-items:center;gap:.8rem;padding:.65rem 1rem;background:#fff;border-bottom:1px solid var(--line,rgba(38,51,49,.1))}',
      '.tc-pop-head .ic{width:38px;height:38px;border-radius:11px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);display:grid;place-items:center;flex:none}',
      '.tc-pop-head .t{flex:1;min-width:0}.tc-pop-head b{display:block;color:var(--brand-deep,#245F5A);font-size:.98rem}.tc-pop-head small{color:var(--muted,#5A6E6A);font-weight:600;font-size:.78rem}',
      '.tc-pop-x{width:40px;height:40px;border-radius:11px;border:1.5px solid var(--line,rgba(38,51,49,.15));background:#fff;color:var(--brand-deep,#245F5A);cursor:pointer;font-size:1rem}',
      '.tc-pop-body{flex:1;min-height:0;overflow:auto;padding:1rem}',
      '@media(max-width:980px){.tc-lgrid{grid-template-columns:minmax(0,1fr)}.tc-lside{position:static}}',
      '@media(max-width:640px){.tc-pop{padding:0}.tc-pop-box{border-radius:0}.tc-practice{flex-wrap:wrap}.tc-practice .tc-btn{width:100%}.tc-stage{border-radius:12px}}',
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
      '.tc-review{padding:.65rem .8rem;border-radius:10px;margin-top:.45rem;font-size:.86rem;line-height:1.5;font-weight:600}.tc-review.ok{background:rgba(46,184,114,.12);color:#1f6b48}.tc-review.no{background:rgba(231,76,60,.09);color:#a63024}.tc-review.open{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}.tc-review.open .tc-plain{white-space:pre-wrap}.tc-ask textarea{width:100%;box-sizing:border-box;font:inherit;padding:.6rem .7rem;border:1.5px solid var(--line,#D5E3DF);border-radius:10px;resize:vertical}',
      '.tc-score{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;padding:1rem;border-radius:12px;background:var(--sage,#E5F2EF);margin-bottom:.8rem}.tc-score b{font-size:1.6rem;color:var(--brand-deep,#245F5A);font-weight:800}',
      '.tc-empty{padding:2rem 1rem;text-align:center;color:var(--muted,#5A6E6A);font-weight:600;background:#fff;border:2px dashed var(--line,rgba(38,51,49,.12));border-radius:16px}',
      '.tc-msg{font-size:.84rem;font-weight:700;color:#b8362a;min-height:1.1rem;margin-top:.5rem}',
      /* levels and padlocks */
      '.tc-level.intermediate{background:#E5F2EF;color:#245F5A}.tc-level.expert{background:#EDE7F8;color:#5b3a99}',
      '.tc-lock{color:#9AA8A5;font-size:.85rem;flex:none}',
      '.tc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
      '.tc-row.locked{cursor:not-allowed;background:#FAFBFB}.tc-row.locked:hover{background:#FAFBFB}.tc-row.locked .n,.tc-row.locked .t b{color:#9AA8A5}',
      '.tc-row.passed .n{color:#1f8557}',
      '.tc-row .lv{display:block;font-size:.66rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--brand,#55BFB3)}.tc-row.locked .lv{color:#B5C0BE}',
      '.tc-card.locked{cursor:not-allowed;background:#FAFBFB}.tc-card.locked .ic{background:#EEF2F1;color:#9AA8A5}.tc-card.locked b{color:#7d8c89}',
      '.tc-card .lockmark{position:absolute;top:.9rem;right:1rem;color:#9AA8A5;font-size:.9rem}',
      '.tc-card .opened{display:inline-block;margin-top:.45rem;font-size:.68rem;font-weight:800;color:#5b3a99}',
      '.tc-sitem.locked{cursor:not-allowed;color:#9AA8A5}.tc-sitem.locked:hover{background:none}.tc-sitem.locked .n{background:#F3F6F5;color:#9AA8A5}',
      '.tc-steps{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .9rem;padding:.6rem .85rem;margin:0 0 1rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;background:#fff;font-size:.8rem}',
      '.tc-steps>b{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.tc-step{display:inline-flex;align-items:center;gap:.35rem;font-weight:600;color:var(--muted,#5A6E6A)}.tc-step i{font-size:.9rem;color:#B5C0BE}',
      '.tc-step.done{color:var(--ink,#263331)}.tc-step.done i{color:#2EB872}',
      '.tc-steps.passed{border-color:rgba(46,184,114,.35);background:rgba(46,184,114,.06)}.tc-steps .ok{font-weight:800;color:#1f8557}',
      '.tc-shake{animation:tcShake .4s}@keyframes tcShake{25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}}',
      '.tc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2100;max-width:min(92vw,420px);padding:.7rem 1rem;border-radius:12px;background:#263331;color:#fff;font-size:.86rem;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25)}',
      /* the celebration */
      '.tc-cele{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:16px;background:rgba(15,26,20,.45);animation:tcFade .25s}',
      '.tc-cele canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}',
      '.tc-cele-card{position:relative;width:min(100%,400px);padding:1.6rem 1.4rem 1.3rem;border-radius:20px;background:#fff;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.3);animation:tcPop .45s cubic-bezier(.2,1.4,.4,1)}',
      '.tc-cele-card .big{font-size:2.6rem;line-height:1;margin-bottom:.4rem}',
      '.tc-cele-card .unl{display:inline-flex;align-items:center;gap:.4rem;padding:.25rem .7rem;border-radius:99px;background:rgba(46,184,114,.12);color:#1f8557;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}',
      '.tc-cele-card h3{margin:.6rem 0 .35rem;font-size:1.25rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.tc-cele-card p{margin:0 0 1.1rem;font-size:.9rem;line-height:1.5;color:var(--muted,#5A6E6A)}',
      '.tc-cele-card .acts{display:flex;flex-direction:column;gap:.5rem}',
      '@keyframes tcFade{from{opacity:0}}@keyframes tcPop{from{transform:scale(.7);opacity:0}}',
      '@media(prefers-reduced-motion:reduce){.tc-cele,.tc-cele-card,.tc-shake{animation:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  var TRACK_ICON = { beginner: 'fa-seedling', intermediate: 'fa-rocket', expert: 'fa-bolt', advanced: 'fa-rocket' };
  function levelBadge(track) { return '<span class="tc-level ' + esc(track === 'beginner' ? '' : track) + '"><i class="fas ' + (TRACK_ICON[track] || 'fa-rocket') + '"></i> ' + esc(trackName(track)) + '</span>'; }
  /* Old 'advanced' classes show under both the intermediate and the expert tab. */
  function onTrack(c, track) { return c.track === track || (c.track === 'advanced' && track !== 'beginner'); }

  /* ---- Celebration: confetti, fireworks and a round of applause ---- */
  function clap() {
    try {
      var AC = g.AudioContext || g.webkitAudioContext; if (!AC) return;
      var ac = new AC(), len = Math.floor(ac.sampleRate * 0.08), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      var out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
      var t0 = ac.currentTime + 0.05;
      /* a crowd: many hands, each clapping a little out of time */
      for (var h = 0; h < 7; h++) {
        var rate = 0.2 + Math.random() * 0.08, t = t0 + Math.random() * 0.15;
        while (t < t0 + 2.2) {
          var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain();
          src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1600; bp.Q.value = 0.8;
          gn.gain.value = (0.35 + Math.random() * 0.5) * (t > t0 + 1.6 ? (t0 + 2.2 - t) / 0.6 : 1);
          src.connect(bp); bp.connect(gn); gn.connect(out); src.start(t);
          t += rate + (Math.random() - 0.5) * 0.05;
        }
      }
      /* and a little fanfare */
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, n) {
        var o = ac.createOscillator(), gn = ac.createGain(), at = t0 + n * 0.11;
        o.type = 'triangle'; o.frequency.value = f; gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(0.16, at + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, at + (n === 3 ? 0.7 : 0.25));
        o.connect(gn); gn.connect(ac.destination); o.start(at); o.stop(at + 0.8);
      });
      setTimeout(function () { try { ac.close(); } catch (e) { } }, 3500);
    } catch (e) { /* no sound is fine */ }
  }
  function confetti(canvas) {
    var ctx = canvas.getContext('2d'), W, H, dpr = Math.min(2, g.devicePixelRatio || 1), parts = [], end = Date.now() + 4200, raf;
    var calm = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var COLORS = ['#55BFB3', '#245F5A', '#F5C842', '#EC1C72', '#2EB872', '#7c4dbd', '#FF8A3D', '#ffffff'];
    function size() { W = g.innerWidth; H = g.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    function piece(x, y, vx, vy, spark) {
      parts.push({ x: x, y: y, vx: vx, vy: vy, r: spark ? 2 + Math.random() * 2 : 4 + Math.random() * 5, c: COLORS[Math.floor(Math.random() * COLORS.length)], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, spark: spark, life: spark ? 60 + Math.random() * 30 : 1e9 });
    }
    var n = calm ? 40 : 160;
    for (var i = 0; i < n; i++) piece(Math.random() * W, -20 - Math.random() * H * 0.6, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, false);
    function burst() {
      var x = W * (0.15 + Math.random() * 0.7), y = H * (0.12 + Math.random() * 0.35), k = calm ? 20 : 60;
      for (var j = 0; j < k; j++) { var ang = (Math.PI * 2 * j) / k, sp = 2 + Math.random() * 4; piece(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, true); }
    }
    var bursts = calm ? 1 : 6, nextBurst = Date.now();
    function frame() {
      ctx.clearRect(0, 0, W, H);
      if (bursts > 0 && Date.now() >= nextBurst) { burst(); bursts--; nextBurst = Date.now() + 380 + Math.random() * 300; }
      parts = parts.filter(function (p) { return p.y < H + 30 && p.life > 0; });
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.spark) { p.vy += 0.05; p.vx *= 0.985; p.vy *= 0.985; p.life--; ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40)); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
        else { p.vy = Math.min(p.vy + 0.03, 4.5); p.vx += Math.sin(p.a) * 0.04; ctx.globalAlpha = 1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
      });
      ctx.globalAlpha = 1;
      if (Date.now() < end || parts.some(function (p) { return !p.spark; })) raf = g.requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    }
    raf = g.requestAnimationFrame(frame);
    g.addEventListener('resize', size);
    return function () { g.cancelAnimationFrame(raf); g.removeEventListener('resize', size); };
  }
  /* celebrate({ badge, title, line, go: [label, fn], stay: label }) */
  function celebrate(o) {
    style();
    var old = document.querySelector('.tc-cele'); if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'tc-cele'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', o.title);
    el.innerHTML = '<canvas aria-hidden="true"></canvas><div class="tc-cele-card"><div class="big" aria-hidden="true">' + (o.emoji || '🎉') + '</div>' +
      (o.badge ? '<span class="unl"><i class="fas fa-lock-open"></i> ' + esc(o.badge) + '</span>' : '') +
      '<h3>' + esc(o.title) + '</h3><p>' + esc(o.line) + '</p><div class="acts">' +
      (o.go ? '<button type="button" class="tc-btn" data-cele="go">' + esc(o.go[0]) + ' <i class="fas fa-arrow-right"></i></button>' : '') +
      '<button type="button" class="tc-btn light" data-cele="stay">' + esc(o.stay || 'Close') + '</button></div></div>';
    document.body.appendChild(el);
    var stop = confetti(el.querySelector('canvas'));
    clap();
    function close() { stop(); el.remove(); document.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cele]'); if (!b) return;
      close();
      if (b.dataset.cele === 'go' && o.go) o.go[1]();
    });
    var focus = el.querySelector('[data-cele="go"]') || el.querySelector('[data-cele]'); if (focus) focus.focus();
    return close;
  }
  function toast(text) {
    style();
    var t = document.createElement('div'); t.className = 'tc-toast'; t.setAttribute('role', 'status'); t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }
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
        } else if (q.type === 'short') {
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
        } else if (q.type === 'short') {
          body = '<input type="text" data-qf="accepted" maxlength="600" placeholder="Accepted answers, separated by commas (optional)" value="' + esc(q.accepted) + '"><div class="cr-note" style="margin-top:.3rem">Leave it empty and it becomes a written answer you read yourself.</div>';
        } else {
          body = '<div class="cr-note">Builders type their own answer. Nothing to set up here: it is not marked automatically, and you read the answers in Results.</div>';
        }
        return '<div class="tc-q" data-q="' + i + '"><div class="tc-q-head">Question ' + (i + 1) +
          '<select data-qtype="' + i + '" aria-label="Question type">' + QTYPES.map(function (t) { return '<option value="' + t[0] + '"' + (q.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>' +
          '<button type="button" class="cr-btn sm danger" data-qdel="' + i + '" aria-label="Remove question"><i class="fas fa-trash"></i></button></div>' +
          '<div class="cr-field"><textarea data-qf="text" rows="2" maxlength="1500" placeholder="Type the question" aria-label="Question">' + esc(q.text) + '</textarea></div>' + body +
          '<div class="cr-field" style="margin:.5rem 0 0"><input type="text" data-qf="explanation" maxlength="600" placeholder="' + (q.type === 'open' ? 'A model answer or tip (shown after they submit, optional)' : 'Why this is the answer (shown after they submit, optional)') + '" aria-label="Explanation" value="' + esc(q.explanation) + '"></div></div>';
      }).join('') + '<button type="button" class="cr-btn sm primary" data-qadd><i class="fas fa-plus"></i> Add question</button>';
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-qadd],[data-qdel],[data-qadd-opt],[data-qdel-opt]'); if (!t) return;
      read();
      if (t.hasAttribute('data-qadd')) {
        if (list.length >= MAX_QUESTIONS) { alert('A lesson or test can hold up to ' + MAX_QUESTIONS + ' questions.'); return; }
        list.push({ id: shortId(), type: 'open', text: '', options: [], correct: 0, accepted: '', explanation: '' });
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
          } else if (q.type === 'short') {
            var acc = String(q.accepted).split(',').map(function (x) { return x.trim().slice(0, 200); }).filter(Boolean);
            if (acc.length) ans.accepted = acc.slice(0, 20);
            else row.type = 'open'; /* no accepted answers: nothing to mark against */
          } else {
            row.type = 'open';
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
    var gate0 = (item && item.gate) || { watch: true, quiz: true, work: true, pass: DEFAULT_PASS };
    if (gate0.pass == null) gate0 = Object.assign({}, gate0, { pass: DEFAULT_PASS });
    m.body.innerHTML =
      '<div class="cr-row2"><div class="cr-field"><label for="tcT">Title (optional)</label><input type="text" id="tcT" maxlength="160" placeholder="Leave empty to call it ' + (isTest ? 'Practice test' : 'Lesson') + ' 1, 2, 3…" value="' + esc(item ? item.title : '') + '"></div>' +
      '<div class="cr-field"><label for="tcTop">Topic</label><select id="tcTop">' + topics.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === topicId0 ? ' selected' : '') + '>' + esc(t.title) + '</option>'; }).join('') + '</select></div></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label for="tcVid">Video</label><div class="cr-actions" style="flex-wrap:wrap"><input id="tcVid" type="url" maxlength="1200" placeholder="Paste an AWS, YouTube, Vimeo or Google Drive link" value="' + esc(video.url || '') + '" style="flex:1;min-width:220px">' +
          '<button type="button" class="cr-btn sm" id="tcVidTest"><i class="fas fa-gauge-high"></i> Test link</button>' +
          '<label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload<input type="file" id="tcVidFile" accept="video/*" hidden></label></div>' +
          '<div class="cr-note" id="tcVidNote" style="margin-top:.35rem">' + (video.path ? 'Uploaded: ' + esc(video.name || 'video') : 'Builders watch it here on the page. For Google Drive, share the video as “Anyone with the link”.') + '</div></div>' +
        '<div class="cr-field"><label>Notes</label><div id="tcNotes"></div></div>') +
      '<div class="cr-field"><label for="tcIns">Instructions (optional)</label><textarea id="tcIns" rows="2" maxlength="3000" placeholder="' + (isTest ? 'What builders should know before they start' : 'What to do after watching') + '">' + esc((item && item.instructions) || '') + '</textarea></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label>PDFs and files (optional)</label><div id="tcFiles"></div><div class="cr-actions" style="margin-top:.4rem"><label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload file<input type="file" id="tcFileIn" multiple hidden accept="application/pdf,image/*,audio/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip"></label></div><div class="cr-note" id="tcFileNote" style="margin-top:.35rem">PDFs open on the page. Files up to 50 MB.</div></div>') +
      '<div class="tc-section"><i class="fas fa-circle-question"></i> ' + (isTest ? 'Questions' : 'Quiz to test understanding (optional)') + '</div><div class="cr-note" style="margin-bottom:.5rem">Options are up to you. A written answer needs no options or answer: builders type it and you read it in Results. Multiple choice, true or false, and short answers with accepted answers are marked automatically. Builders can try again.</div><div id="tcQs"></div>' +
      '<div class="tc-section"><i class="fas fa-laptop-code"></i> Practice for this lesson</div>' +
      '<div class="cr-note" style="margin-bottom:.5rem">Attach a practice tool to this ' + (isTest ? 'test' : 'lesson') + '. Under the video, builders get a Practise button that opens it full size with your requirements beside it: Paisley VS Code (autocomplete, Emmet, folders, picture and video uploads, full screen) or the writing pad. The pop-up carries the class, topic and lesson name. Add questions for a short quiz or test beside the work: builders answer them there and hand them in with the work, and you mark both with ink in Results > Class work hand-ins. Their family sees your feedback.</div>' +
      '<div class="cr-row2"><div class="cr-field"><label for="tcTaskT">Practice tool</label><select id="tcTaskT">' + [['', 'None'], ['code', 'Paisley VS Code (HTML, CSS, JavaScript)'], ['writing', 'Writing pad']].map(function (p) { var cur = item && item.task && g.TechWork ? g.TechWork.kindOf(item.task) : ''; return '<option value="' + p[0] + '"' + (cur === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></div><div></div></div>' +
      '<div class="cr-field" id="tcTaskBox"><label for="tcTask">Requirements (what they should make)</label><textarea id="tcTask" rows="4" maxlength="3000" placeholder="e.g. Make a page with a heading, a picture of your favourite animal and a button that changes the colour.">' + esc((item && item.task && item.task.brief) || '') + '</textarea><div class="cr-note" style="margin-top:.3rem">Optional. Without it they practise what the lesson showed.</div></div>' +
      '<div class="cr-field" id="tcTaskQBox"><label>Questions to answer with the work (optional)</label><div class="cr-note" style="margin-bottom:.45rem">A short quiz or test that goes with the work, for example “Which tag makes a link?” or “Explain what your code does”. Builders answer beside the work and hand everything in together; you read and mark the answers with the work (they are not marked automatically).</div><div id="tcTaskQs"></div>' +
      '<button type="button" class="cr-btn sm" id="tcTaskQAdd"><i class="fas fa-plus"></i> Add a question</button></div>' +
      '<div class="tc-section"><i class="fas fa-lock"></i> To pass this level and unlock the next</div>' +
      '<div class="cr-note" style="margin-bottom:.5rem">Each lesson is a level. Level 1 of a class is always open; every other level shows a padlock until the builder passes the one before it. Tick what passing this ' + word + ' takes. A step the ' + word + ' does not have is skipped, and with nothing ticked, opening it is enough. Passing plays a celebration and emails their family.</div>' +
      '<div class="cr-field" style="display:grid;gap:.45rem">' +
        '<label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGW"' + (gate0.watch ? ' checked' : '') + (isTest ? ' disabled' : '') + '> Watch the video' + (isTest ? ' (lessons only)' : '') + '</label>' +
        '<label style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGQ"' + (gate0.quiz ? ' checked' : '') + '> Pass the quiz with at least <input type="number" id="tcGP" min="0" max="100" step="5" value="' + esc(gate0.pass) + '" style="width:5rem" aria-label="Pass mark in percent">%</label>' +
        '<label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGK"' + (gate0.work ? ' checked' : '') + '> Hand in the practice work</label>' +
      '</div>';
    var $ = function (s) { return m.body.querySelector(s); };
    var notes = isTest ? null : notesEditor($('#tcNotes'), item && item.notes);
    var qs = questionBuilder($('#tcQs'), item && item.questions, key);
    var syncTask = function () { var on = $('#tcTaskT').value ? '' : 'none'; $('#tcTaskBox').style.display = on; $('#tcTaskQBox').style.display = on; };
    /* The task's own questions: just wording; the coach marks the answers with the work. */
    var tq = (((item && item.task) || {}).questions || []).filter(function (x) { return x && x.id; }).map(function (x) { return { id: x.id, text: x.text || '' }; });
    var newQid = function () { return 'tq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
    function readTq() { [].forEach.call(m.body.querySelectorAll('[data-tqid]'), function (inp) { tq.forEach(function (x) { if (x.id === inp.dataset.tqid) x.text = inp.value; }); }); }
    function paintTq() {
      $('#tcTaskQs').innerHTML = tq.map(function (x, i) {
        return '<div style="display:flex;gap:.45rem;align-items:center;margin-bottom:.4rem"><b class="cr-note" style="min-width:1.3rem">' + (i + 1) + '.</b><input type="text" maxlength="500" data-tqid="' + esc(x.id) + '" value="' + esc(x.text) + '" placeholder="Type the question" aria-label="Question ' + (i + 1) + '" style="flex:1;min-width:0">' +
          '<button type="button" class="cr-btn sm danger" data-tqdel="' + i + '" aria-label="Remove question ' + (i + 1) + '"><i class="fas fa-xmark"></i></button></div>';
      }).join('');
      $('#tcTaskQAdd').style.display = tq.length >= 10 ? 'none' : '';
    }
    paintTq();
    $('#tcTaskQAdd').onclick = function () { readTq(); tq.push({ id: newQid(), text: '' }); dirty = true; paintTq(); var ins = m.body.querySelectorAll('[data-tqid]'); if (ins.length) ins[ins.length - 1].focus(); };
    $('#tcTaskQs').addEventListener('click', function (e) { var b = e.target.closest('[data-tqdel]'); if (!b) return; readTq(); tq.splice(Number(b.dataset.tqdel), 1); dirty = true; paintTq(); });
    $('#tcTaskT').addEventListener('change', syncTask); syncTask();
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
      var videoUrl = isTest ? '' : T.safeUrl($('#tcVid').value.trim());
      if (!isTest && $('#tcVid').value.trim() && !videoUrl) return err('The video link must start with https://');
      if (videoUrl && !video.path) { var bad = g.FastVideo.problem(videoUrl); if (bad) return err(bad); }
      var built;
      try { built = qs.collect(); } catch (e) { return err(e.message); }
      var notesHtml = notes ? notes.html() : '';
      if (status === 'published') {
        if (isTest && !built.questions.length && !$('#tcIns').value.trim() && !$('#tcTaskT').value) return err('Add instructions, a practice tool or a question before posting.');
        var plainNotes = notesHtml.replace(/<[^>]+>/g, '').trim();
        if (!isTest && !videoUrl && !plainNotes && !files.length && !built.questions.length && !$('#tcTaskT').value) return err('Add a video, notes, a file, a practice tool or a quiz before posting.');
      }
      var topicId = $('#tcTop').value, topic = topics.filter(function (t) { return t.id === topicId; })[0] || {};
      var brief = $('#tcTask').value.trim(), taskKind = $('#tcTaskT').value;
      readTq();
      var passMark = Math.round(Number($('#tcGP').value));
      if (!isFinite(passMark) || passMark < 0 || passMark > 100) return err('The pass mark must be between 0 and 100.');
      var taskQuestions = tq.map(function (x) { return { id: x.id, text: String(x.text || '').trim().slice(0, 500) }; }).filter(function (x) { return x.text; }).slice(0, 10);
      var d = {
        type: isTest ? 'test' : 'lesson', title: title.slice(0, 160), courseId: cls.id, courseName: cls.name, topicId: topicId, topicTitle: topic.title || '',
        track: cls.track, discipline: cls.discipline, status: status,
        video: videoUrl ? { url: videoUrl, path: video.path || '', name: video.name || '' } : null,
        notes: notesHtml, instructions: $('#tcIns').value.trim().slice(0, 3000), files: files.slice(0, 20),
        questions: built.questions, questionCount: built.questions.length,
        task: taskKind ? { brief: brief.slice(0, 3000), kind: taskKind, category: taskKind === 'writing' ? 'WRITING' : 'CODE', questions: taskQuestions } : null,
        gate: { watch: !isTest && $('#tcGW').checked, quiz: $('#tcGQ').checked, pass: passMark, work: $('#tcGK').checked },
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
      S.course = c; S.track = c.track === 'advanced' ? 'intermediate' : c.track; S.screen = 'course';
      S.itemUnsubs.push(TOPICS().where('courseId', '==', c.id).onSnapshot(function (s) { S.topics = docs(s).sort(byOrder); paint(); }, fail));
      S.itemUnsubs.push(LESSONS().where('courseId', '==', c.id).onSnapshot(function (s) { S.items = docs(s).sort(byOrder); paint(); }, fail));
      paint();
    }
    function paint() {
      if (S.panel) return;
      if (S.screen === 'course' && S.course) return paintCourse();
      if (!S.loaded) { host.innerHTML = '<div class="cr-empty">Loading classes…</div>'; return; }
      var list = S.courses.filter(function (c) { return onTrack(c, S.track); }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      host.innerHTML = '<div class="cr-bar"><div><h3>Classes</h3><div class="cr-sub">Each level has its own classes. Create a class, add topics, then add lessons and practice tests. Lessons are levels: Level 1 is open and the rest stay locked until the one before is passed. Whatever you post goes to every builder on that level and their parents, with a bell and an email.</div></div><button type="button" class="cr-btn primary" data-a="add-class"><i class="fas fa-plus"></i> Add class</button></div>' +
        trackTabs(S.track) +
        (list.length ? '<div class="cr-grid">' + list.map(function (c) {
          var after = c.afterCourseId && courseName(c.afterCourseId);
          return '<button type="button" class="cr-card" data-a="open" data-id="' + esc(c.id) + '"><div class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></div><h4>' + esc(c.name) + '</h4><div class="meta">' + esc(T.disciplineLabel(c.discipline)) + '</div><div style="margin-top:.4rem">' + levelBadge(c.track) + '</div>' +
            (after ? '<div class="meta" style="margin-top:.35rem"><i class="fas fa-lock"></i> Unlocks after ' + esc(after) + '</div>' : '') + '</button>';
        }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No ' + esc(trackName(S.track)) + ' classes yet. Use “Add class” to start one, for example Coding.</div></div>') +
        '<div class="cr-note" id="tcNote" role="status" style="margin-top:.6rem"></div>';
    }
    function courseName(id) { var c = S.courses.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; }
    /* The classes another class can wait for: same level, not itself, and not one that waits for it. */
    function afterOptions(track, selfId, cur) {
      var opts = S.courses.filter(function (c) { return c.id !== selfId && c.afterCourseId !== selfId && (c.track === track || c.track === 'advanced' || track === 'advanced'); })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      return '<option value="">Nothing: open from the start</option>' + opts.map(function (c) { return '<option value="' + esc(c.id) + '"' + (cur === c.id ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(trackName(c.track)) + ')</option>'; }).join('');
    }
    function statusBadge(l) { return '<span class="cr-badge ' + (l.status === 'published' ? 'published' : 'draft') + '">' + (l.status === 'published' ? 'Posted' : 'Draft') + '</span>'; }
    function itemMeta(l) {
      var bits = [];
      if (l.video) bits.push('Video');
      if (l.notes) bits.push('Notes');
      if ((l.files || []).length) bits.push(l.files.length + ' file' + (l.files.length === 1 ? '' : 's'));
      if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's'));
      if (l.task) bits.push((g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'Writing pad' : 'Paisley VS Code') + (((l.task.questions || []).length) ? ' + ' + l.task.questions.length + ' question' + (l.task.questions.length === 1 ? '' : 's') : ''));
      bits.push(gateSummary(l));
      if (l.createdByName) bits.push(l.createdByName);
      return bits.join(' · ');
    }
    function paintCourse() {
      var c = S.course, canC = canEdit(c);
      var h = '<div class="cr-crumb"><a data-a="back">Classes</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(c.name) + '</span></div>' +
        '<div class="cr-bar"><div><h3>' + esc(c.name) + '</h3><div style="margin:.3rem 0">' + levelBadge(c.track) + '</div><div class="cr-sub">' + esc(T.disciplineLabel(c.discipline)) + '. Topics and lessons appear to builders in this order, as Level 1, 2, 3… Each level unlocks when the one before is passed.' +
          (c.afterCourseId && courseName(c.afterCourseId) ? ' <b>The whole class unlocks after ' + esc(courseName(c.afterCourseId)) + '.</b>' : '') + '</div></div><div class="cr-actions">' +
        (isAdmin ? '<button type="button" class="cr-btn" data-a="open-for"><i class="fas fa-lock-open"></i> Open for a builder</button>' : '') +
        (canC ? '<button type="button" class="cr-btn" data-a="rename"><i class="fas fa-gear"></i> Settings</button><button type="button" class="cr-btn danger" data-a="del-class" aria-label="Delete class" title="Delete class"><i class="fas fa-trash"></i></button>' : '') +
        '<button type="button" class="cr-btn primary" data-a="add-topic"><i class="fas fa-plus"></i> Add topic</button></div></div>';
      if (!S.topics.length) h += '<div class="cr-panel"><div class="cr-empty">No topics yet. Add a topic (for example “Flow”), then add lessons inside it.</div></div>';
      /* Builders meet posted lessons as levels, counted across the whole class. */
      var levels = {};
      inOrder(S.topics, S.items.filter(function (x) { return x.status === 'published'; })).forEach(function (x, n) { levels[x.id] = n + 1; });
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
          var names = labelsFor(ls);
          ls.forEach(function (l, li) {
            h += '<div class="cr-lesson"><span class="n"><i class="fas ' + (l.type === 'test' ? 'fa-clipboard-question' : 'fa-circle-play') + '"></i></span><span class="tt">' + esc(names[l.id]) + '<small>' + esc((levels[l.id] ? 'Level ' + levels[l.id] + ' · ' : '') + (l.type === 'test' ? 'Practice test' : 'Lesson') + (itemMeta(l) ? ' · ' + itemMeta(l) : '')) + '</small></span>' + statusBadge(l) + '<div class="cr-actions">' +
              '<button type="button" class="cr-btn sm" aria-label="Move up" title="Move up" data-a="item-up" data-id="' + esc(l.id) + '"' + (li === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
              '<button type="button" class="cr-btn sm" aria-label="Move down" title="Move down" data-a="item-down" data-id="' + esc(l.id) + '"' + (li === ls.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
              (l.questionCount ? '<button type="button" class="cr-btn sm" data-a="item-results" data-id="' + esc(l.id) + '"><i class="fas fa-square-poll-vertical"></i> Results</button>' : '') +
              (l.task && g.TechWork ? '<button type="button" class="cr-btn sm" data-a="item-work" data-id="' + esc(l.id) + '"><i class="fas fa-inbox"></i> Hand-ins</button>' : '') +
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
        '<div class="cr-field"><label for="tcAf">Locked until this class is finished</label><select id="tcAf">' + afterOptions(S.track, '', '') + '</select></div>' +
        '<div class="cr-note">A class is for one level: beginners, intermediate or expert builders. Make another one to teach the same subject at a different level. Pick a class above to keep this one locked (with a padlock) until a builder has passed every lesson of it.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Create class</button>';
      var nm = m.body.querySelector('#tcN'), ds = m.body.querySelector('#tcD');
      m.body.querySelector('#tcL').addEventListener('change', function () { m.body.querySelector('#tcAf').innerHTML = afterOptions(this.value, '', ''); });
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = async function () {
        var b = this, name = nm.value.trim(), track = m.body.querySelector('#tcL').value, err = m.foot.querySelector('#tcE');
        if (!name) { err.textContent = 'Give the class a name.'; return; }
        var dup = S.courses.filter(function (c) { return c.track === track && String(c.name).toLowerCase() === name.toLowerCase(); })[0];
        if (dup) { m.close(); openCourse(dup); return; }
        b.disabled = true;
        try {
          var d = { name: name, discipline: ds.value, track: track, afterCourseId: m.body.querySelector('#tcAf').value || '', createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
          var r = await COURSES().add(d);
          m.close(); openCourse(Object.assign({ id: r.id }, d));
        } catch (e) { b.disabled = false; err.textContent = T.errMsg(e); }
      };
      nm.focus();
    }
    /* Name, level and what the class waits for. A new level moves its topics and lessons too. */
    function openRename() {
      var c = S.course, m = CU.openModal({ title: 'Class settings' });
      var levelOpts = T.TRACKS.concat(c.track === 'advanced' ? ['advanced'] : []);
      m.body.innerHTML = '<div class="cr-field"><label for="tcN">Class name</label><input type="text" id="tcN" maxlength="120" value="' + esc(c.name) + '"></div>' +
        '<div class="cr-field"><label for="tcL">Level</label><select id="tcL">' + levelOpts.map(function (t) { return '<option value="' + t + '"' + (t === c.track ? ' selected' : '') + '>' + esc(trackName(t)) + '</option>'; }).join('') + '</select>' +
          (c.track === 'advanced' ? '<div class="cr-note" style="margin-top:.3rem">This class is from before each level had its own classes, so intermediate and expert builders both see it. Choose one level to separate them.</div>' : '') + '</div>' +
        '<div class="cr-field"><label for="tcAf">Locked until this class is finished</label><select id="tcAf">' + afterOptions(c.track, c.id, c.afterCourseId || '') + '</select></div>';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Save</button>';
      m.body.querySelector('#tcL').addEventListener('change', function () { var cur = m.body.querySelector('#tcAf').value; m.body.querySelector('#tcAf').innerHTML = afterOptions(this.value, c.id, cur); });
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = function () {
        var name = m.body.querySelector('#tcN').value.trim(), track = m.body.querySelector('#tcL').value, after = m.body.querySelector('#tcAf').value || '', b = this;
        var err = m.foot.querySelector('#tcE');
        if (!name) { err.textContent = 'Give the class a name.'; return; }
        if (track !== c.track && !isAdmin && S.items.some(function (x) { return x.createdBy !== me.uid; })) { err.textContent = 'Another coach has lessons in this class, so only an admin can change its level.'; return; }
        if (track !== c.track && !confirm('Move “' + c.name + '” to ' + trackName(track) + '? Builders on the old level stop seeing it, and only ' + trackName(track) + ' builders get its new lessons.')) return;
        b.disabled = true;
        var bt = db.batch(), now = FV().serverTimestamp();
        bt.update(COURSES().doc(c.id), { name: name, track: track, afterCourseId: after, updatedAt: now });
        if (track !== c.track) {
          S.topics.forEach(function (t) { bt.update(TOPICS().doc(t.id), { track: track, updatedAt: now }); });
          S.items.forEach(function (l) { bt.update(LESSONS().doc(l.id), { track: track, updatedAt: now }); });
        }
        bt.commit().then(function () { m.close(); if (track !== c.track) { S.track = track; note('Moved to ' + trackName(track) + '.'); } }).catch(function (e) { b.disabled = false; err.textContent = T.errMsg(e); });
      };
    }
    /* Admin: open this class (all of it, or up to one level) for one builder, at any level. */
    function openFor() {
      var c = S.course, m = CU.openModal({ title: 'Open “' + c.name + '” for a builder', wide: true });
      var builders = (o.students || []).filter(function (s) { return s.status !== 'Rejected'; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var posted = inOrder(S.topics, S.items.filter(function (x) { return x.status === 'published'; }));
      var names = {}; S.topics.forEach(function (t) { var ln = labelsFor(S.items.filter(function (x) { return x.topicId === t.id; })); Object.keys(ln).forEach(function (k) { names[k] = (t.title ? t.title + ' · ' : '') + ln[k]; }); });
      function what(v) { if (v === 'all') return 'Every level'; var n = posted.findIndex(function (x) { return x.id === v; }); return n < 0 ? 'A lesson no longer posted' : 'Up to Level ' + (n + 1) + ' · ' + (names[v] || ''); }
      function who(id) { var s = builders.filter(function (x) { return x.id === id; })[0]; return s ? s.name + ' · ' + (T.SKILL_LABEL[s.skillLevel] || 'No level') : 'A builder'; }
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.7rem">Opens the padlocks for one builder, whatever their level. They see the class with the rest of theirs, and every level you open is theirs to take straight away. Passing still unlocks the levels after it as usual.</div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="tcOB">Builder</label><select id="tcOB"><option value="">Choose a builder…</option>' + builders.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name || s.email || s.id) + ' · ' + esc(T.SKILL_LABEL[s.skillLevel] || 'No level') + (onTrack(c, T.trackOf(s.skillLevel)) ? '' : ' (another level)') + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-field"><label for="tcOW">What to open</label><select id="tcOW"><option value="all">Every level of the class</option>' + posted.map(function (x, n) { return '<option value="' + esc(x.id) + '">Up to Level ' + (n + 1) + ' · ' + esc(names[x.id] || '') + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="cr-actions" style="margin-bottom:1rem"><button type="button" class="cr-btn primary" data-of="save"><i class="fas fa-lock-open"></i> Open it</button><span class="cr-note" id="tcOMsg" role="status"></span></div>' +
        '<div class="tc-section" style="margin-top:0">Opened by an admin</div><div id="tcOList" class="cr-note">Loading…</div>';
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-x2>Close</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      var msg = m.body.querySelector('#tcOMsg');
      function list() {
        db.collection('techAccess').get().then(function (s) {
          var rows = docs(s).filter(function (a) { return a.open && a.open[c.id]; });
          m.body.querySelector('#tcOList').innerHTML = rows.length ? rows.map(function (a) {
            return '<div class="tc-file"><i class="fas fa-lock-open"></i><span class="nm">' + esc(who(a.id)) + ' <small style="color:var(--muted,#5A6E6A);font-weight:600">· ' + esc(what(a.open[c.id])) + '</small></span><button type="button" class="cr-btn sm danger" data-of="lock" data-id="' + esc(a.id) + '"><i class="fas fa-lock"></i> Lock again</button></div>';
          }).join('') : 'Nobody yet. Builders open levels by passing them.';
        }).catch(function (e) { m.body.querySelector('#tcOList').textContent = T.errMsg(e); });
      }
      m.body.addEventListener('click', function (e) {
        var b = e.target.closest('[data-of]'); if (!b) return;
        if (b.dataset.of === 'save') {
          var uid = m.body.querySelector('#tcOB').value, v = m.body.querySelector('#tcOW').value;
          if (!uid) { msg.textContent = 'Choose a builder first.'; return; }
          b.disabled = true; msg.textContent = 'Opening…';
          var open = {}; open[c.id] = v;
          db.collection('techAccess').doc(uid).set({ studentId: uid, open: open, updatedAt: FV().serverTimestamp(), updatedBy: me.uid }, { merge: true })
            .then(function () { msg.textContent = 'Opened for ' + who(uid) + ': ' + what(v) + '.'; list(); })
            .catch(function (er) { msg.textContent = T.errMsg(er); }).then(function () { b.disabled = false; });
        } else if (b.dataset.of === 'lock') {
          var up = { updatedAt: FV().serverTimestamp(), updatedBy: me.uid }; up['open.' + c.id] = FV().delete();
          b.disabled = true;
          db.collection('techAccess').doc(b.dataset.id).update(up).then(list).catch(function (er) { b.disabled = false; msg.textContent = T.errMsg(er); });
        }
      });
      list();
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
      else if (a === 'open-for') openFor();
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
        if (po.type === 'test' && !po.questionCount && !po.instructions && !po.task) { note('A practice test needs instructions, a task or a question.', true); return; }
        if (!po.video && !po.notes && !(po.files || []).length && !po.questionCount && !po.task) { note('Add a video, notes, a file, a task or a quiz before posting.', true); return; }
        if (!confirm('Post “' + (labelsFor(inTopic(po))[po.id] || po.title) + '” to every ' + trackName(po.track) + ' builder and their parents? They get a bell and an email.')) return;
        var up = { status: 'published', updatedAt: FV().serverTimestamp() };
        if (!po.publishedAt) up.publishedAt = FV().serverTimestamp();
        LESSONS().doc(id).update(up).then(function () { note('Posted.'); }).catch(fail);
      }
      else if (a === 'del-item') { var de = it(); if (de && confirm('Delete “' + (labelsFor(inTopic(de))[de.id] || de.title) + '”? Results already recorded stay, but builders can no longer open it.')) deleteItem(de).catch(fail); }
      else if (a === 'item-results') { var ir = it(); if (ir) openItemResults(ir); }
      else if (a === 'item-work') {
        var iw = it(); if (!iw) return;
        var wm = CU.openModal({ title: 'Hand-ins · ' + (labelsFor(inTopic(iw))[iw.id] || iw.title), wide: true, onClose: function () { if (S.work) { S.work.destroy(); S.work = null; } } });
        wm.body.innerHTML = '<div id="tcWork"></div>';
        wm.foot.innerHTML = '<button type="button" class="cr-btn" data-x2>Close</button>';
        wm.foot.querySelector('[data-x2]').onclick = function () { wm.close(); };
        S.work = g.TechWork.mountHandIns(wm.body.querySelector('#tcWork'), { me: me, students: o.students || [], lessonId: iw.id });
      }
    });
    paint();
    return { destroy: function () { unsub(); S.itemUnsubs.forEach(function (u) { u(); }); if (S.res) S.res.destroy(); } };
  }

  /* =========================================================
     Results: every marked quiz and practice test
     ========================================================= */
  function reviewHtml(rows) {
    return (rows || []).map(function (r, i) {
      var given = r.given === '' || r.given == null ? 'No answer' : esc(r.given);
      if (r.open) return '<div class="tc-ask"><div class="q">' + (i + 1) + '. ' + esc(r.text) + '</div><div class="tc-review open"><i class="fas fa-pen"></i> <span class="tc-plain">' + given + '</span>' + (r.explanation ? '<br><b>Tip:</b> ' + esc(r.explanation) : '') + '<br><small>Written answer, read by the coach.</small></div></div>';
      return '<div class="tc-ask"><div class="q">' + (i + 1) + '. ' + esc(r.text) + '</div><div class="tc-review ' + (r.correct ? 'ok' : 'no') + '"><i class="fas ' + (r.correct ? 'fa-check' : 'fa-xmark') + '"></i> ' + given +
        (r.correct ? '' : '<br><b>Correct answer:</b> ' + esc(r.answer)) + (r.explanation ? '<br>' + esc(r.explanation) : '') + '</div></div>';
    }).join('');
  }
  /* An attempt made only of written answers has no score (total 0, percent null). */
  function isMarked(x) { return !!x && x.total > 0 && x.percent != null; }
  function openNote(x) { var n = (x && x.openCount) || 0; return n ? ' · ' + n + ' written answer' + (n === 1 ? '' : 's') : ''; }
  function scorePill(x) { return isMarked(x) ? '<span class="tc-pill ' + scoreClass(x.percent) + '">' + x.score + '/' + x.total + ' · ' + x.percent + '%</span>' : '<span class="tc-pill good"><i class="fas fa-check"></i> Handed in</span>'; }
  function scoreBox(x, extra) {
    return isMarked(x) ? '<div class="tc-score"><b>' + x.percent + '%</b><span>' + x.score + ' of ' + x.total + ' correct' + openNote(x) + (extra || '') + '</span></div>'
      : '<div class="tc-score"><b><i class="fas fa-check"></i></b><span>Answers handed in' + (extra || '') + '</span></div>';
  }
  function mountResults(host, o) {
    var CU = g.ClassroomUI.util;
    CU.injectStyle(); style();
    host.classList.add('cr-root');
    var S = { rows: null, track: 'all', course: 'all', q: '', view: o.view || 'quiz' }, dead = false, me = o.me, work = null;
    /* Results has two views: marked quizzes and tests, and class work hand-ins (TechWork). */
    var showViews = !o.lessonId && !o.studentId && !!g.TechWork;
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
        var k = x.studentId + '|' + x.lessonId, g2 = map[k] || (map[k] = { studentId: x.studentId, studentName: x.studentName, lessonId: x.lessonId, title: x.title, kind: x.kind, courseName: x.courseName, courseId: x.courseId, topicTitle: x.topicTitle, track: x.track, tries: 0, best: null, latest: null });
        g2.tries++; if (isMarked(x)) g2.best = Math.max(g2.best == null ? 0 : g2.best, x.percent);
        if (!g2.latest || (T.toDate(x.at) || 0) > (T.toDate(g2.latest.at) || 0)) g2.latest = x;
      });
      return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (T.toDate(b.latest.at) || 0) - (T.toDate(a.latest.at) || 0); });
    }
    function viewTabs() {
      return showViews ? '<div class="tc-tabs" role="group" aria-label="Results">' + [['quiz', 'Quizzes and tests'], ['work', 'Class work hand-ins']].map(function (v) {
        return '<button type="button" class="tc-tab' + (S.view === v[0] ? ' on' : '') + '" aria-pressed="' + (S.view === v[0]) + '" data-ra="view" data-v="' + v[0] + '">' + v[1] + '</button>';
      }).join('') + '</div>' : '';
    }
    function paint() {
      if (S.view === 'work' && showViews) {
        if (work) return;
        host.innerHTML = viewTabs() + '<div id="tcWorkHost"></div>';
        work = g.TechWork.mountHandIns(host.querySelector('#tcWorkHost'), { me: me, students: students });
        return;
      }
      if (work) { work.destroy(); work = null; }
      if (S.rows === null) { host.innerHTML = viewTabs() + '<div class="cr-empty">Loading results…</div>'; return; }
      var q = S.q.trim().toLowerCase();
      var all = grouped(S.rows), courses = {};
      all.forEach(function (r) { if (r.courseId) courses[r.courseId] = r.courseName; });
      var list = all.filter(function (r) {
        return (S.track === 'all' || onTrack(r, S.track)) && (S.course === 'all' || r.courseId === S.course) &&
          (!q || (String(r.studentName) + ' ' + String(r.title)).toLowerCase().indexOf(q) > -1);
      });
      var scored = list.filter(function (r) { return isMarked(r.latest); });
      var avg = scored.length ? Math.round(scored.reduce(function (s, r) { return s + r.latest.percent; }, 0) / scored.length) : null;
      var scoped = o.lessonId || o.studentId;
      host.innerHTML = viewTabs() + (scoped ? '' : trackTabs(S.track, true)) +
        '<div class="cr-filters">' + (o.lessonId ? '' : '<select data-rf="course" aria-label="Class"><option value="all">All classes</option>' + Object.keys(courses).map(function (id) { return '<option value="' + esc(id) + '"' + (S.course === id ? ' selected' : '') + '>' + esc(courses[id]) + '</option>'; }).join('') + '</select>') +
        (o.studentId ? '' : '<input type="search" data-rf="q" placeholder="Search builder or test…" aria-label="Search" value="' + esc(S.q) + '">') + '<button type="button" class="cr-btn sm" data-ra="reload"><i class="fas fa-rotate"></i> Refresh</button></div>' +
        (list.length ? '<div class="cr-note" style="margin-bottom:.5rem">' + list.length + ' result' + (list.length === 1 ? '' : 's') + (avg == null ? '' : ' · average latest score ' + avg + '%') + '</div><div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Builder</th><th>Quiz or test</th><th>Class</th><th>Latest</th><th>Best</th><th>Tries</th><th>When</th><th></th></tr></thead><tbody>' + list.map(function (r) {
          var s = student(r.studentId), name = (s && s.name) || r.studentName || 'Builder';
          return '<tr><td><b>' + esc(name) + '</b></td><td>' + esc(r.title) + '<div class="cr-note">' + (r.kind === 'test' ? 'Practice test' : 'Lesson quiz') + '</div></td><td class="cr-note">' + esc(r.courseName || '') + (r.topicTitle ? ' · ' + esc(r.topicTitle) : '') + '</td><td>' + scorePill(r.latest) + (r.latest.openCount ? '<div class="cr-note">' + r.latest.openCount + ' written to read</div>' : '') + '</td><td>' + (r.best == null ? '–' : r.best + '%') + '</td><td>' + r.tries + '</td><td class="cr-note">' + esc(fmtDay(r.latest.at)) + '</td><td><button type="button" class="cr-btn sm" data-ra="open" data-id="' + esc(r.latest.id) + '"><i class="fas fa-eye"></i> Answers</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="cr-panel"><div class="cr-empty">No results here yet. They appear when builders finish a quiz or practice test.</div></div>');
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-a="track"],[data-ra]'); if (!t) return;
      if (t.dataset.ra === 'view') { if (S.view !== t.dataset.v) { S.view = t.dataset.v; if (work) { work.destroy(); work = null; } paint(); } return; }
      if (S.view === 'work') return;
      if (t.dataset.a === 'track') { S.track = t.dataset.v; paint(); return; }
      if (t.dataset.ra === 'reload') { S.rows = null; paint(); load(); return; }
      var x = (S.rows || []).filter(function (r) { return r.id === t.dataset.id; })[0]; if (!x) return;
      var m = CU.openModal({ title: (x.studentName || 'Builder') + ' · ' + x.title, wide: true });
      m.body.innerHTML = scoreBox(x, ' · ' + esc(fmtDay(x.at))) + reviewHtml(x.review);
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
    return { destroy: function () { dead = true; if (work) work.destroy(); } };
  }

  /* =========================================================
     Learner: class cards → topics → lesson on the page.
     A builder takes it; a guardian sees the same pages read-only.
     ========================================================= */
  function mountLearner(host, o) {
    T.injectStyle(); style();
    host.classList.add('tc-learn');
    var me = o.me, student = o.student, isBuilder = me.role === 'student', track = T.trackOf(student.skillLevel), first = T.firstName(student.name);
    var S = { screen: 'home', courses: null, course: null, topics: [], items: [], progress: {}, unread: [], attempts: null, lesson: null,
      works: {}, access: {}, extra: {}, prereq: {}, progLoaded: false, workLoaded: false, seen: null, ready: [] };
    var unsubs = [], courseUnsubs = [], dead = false;
    var fail = function (e) { console.warn('tech classes:', e); };
    var query = function (q, fn, onErr) { return q.onSnapshot(function (s) { if (!dead) fn(s); }, function (e) { fail(e); if (onErr && !dead) onErr(e); }); };
    /* Something changed that can open or close a padlock. */
    function changed() {
      if (S.screen !== 'lesson') paint(); else refreshLessonBits();
      if (S.progLoaded && S.workLoaded) { var q = S.ready; S.ready = []; q.forEach(function (fn) { fn(); }); }
      afterData();
    }
    function whenReady(fn) { if (S.progLoaded && S.workLoaded) fn(); else S.ready.push(fn); }

    unsubs.push(query(COURSES().where('track', 'in', T.tracksFor(student.skillLevel)), function (s) { S.courses = docs(s).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }); if (S.screen === 'home') paint(); }, function () { S.courses = S.courses || []; paint(); }));
    unsubs.push(query(db.collection('techLessonProgress').where('studentId', '==', student.id), function (s) {
      S.progress = {}; s.docs.forEach(function (d) { S.progress[d.data().lessonId] = d.data(); });
      S.progLoaded = true; changed();
    }, function () { S.progLoaded = true; changed(); }));
    /* Hand-ins count towards passing a level. */
    unsubs.push(query(db.collection('techLessonWork').where('studentId', '==', student.id), function (s) {
      S.works = {}; s.docs.forEach(function (d) { S.works[d.data().lessonId] = d.data(); });
      S.workLoaded = true; changed();
    }, function () { S.workLoaded = true; changed(); }));
    /* Classes (or levels) an admin opened for this builder, at any level. */
    unsubs.push(query(db.collection('techAccess').doc(student.id), function (d) {
      S.access = d.exists ? (d.data() || {}) : {};
      Object.keys(S.access.open || {}).forEach(function (cid) {
        if (S.extra[cid] !== undefined) return;
        S.extra[cid] = null;
        COURSES().doc(cid).get().then(function (c) { if (dead) return; S.extra[cid] = c.exists ? Object.assign({ id: c.id }, c.data()) : false; if (S.screen === 'home') paint(); }).catch(fail);
      });
      changed();
    }));
    function accessFor(cid) { return ((S.access && S.access.open) || {})[cid] || ''; }
    function allCourses() {
      var list = (S.courses || []).slice();
      Object.keys(S.extra).forEach(function (id) {
        var c = S.extra[id];
        if (c && accessFor(id) && !list.some(function (x) { return x.id === id; })) list.push(Object.assign({ opened: true }, c));
      });
      return list;
    }
    function passedLesson(l) { return gateSteps(l, S.progress[l.id], S.works[l.id]).passed; }
    /* '' when a class is open, else the name of the class to finish first. */
    function courseLock(c) {
      if (!c.afterCourseId || accessFor(c.id)) return '';
      var pre = S.prereq[c.afterCourseId];
      if (pre === undefined) { loadPrereq(c.afterCourseId); return '…'; }
      if (pre === 'loading') return '…';
      if (!pre || !pre.lessons.length) return '';
      return pre.lessons.every(passedLesson) ? '' : pre.name;
    }
    function loadPrereq(cid) {
      S.prereq[cid] = 'loading';
      Promise.all([COURSES().doc(cid).get(), LESSONS().where('courseId', '==', cid).where('status', '==', 'published').get()]).then(function (r) {
        if (dead) return;
        S.prereq[cid] = r[0].exists ? { name: r[0].data().name || 'the class before', lessons: docs(r[1]) } : null;
        if (S.screen === 'home') paint();
      }).catch(function (e) { S.prereq[cid] = null; fail(e); });
    }
    /* Each lesson of the open class as a level: its number, steps, and whether it is open or passed. */
    function levelMap() {
      var all = orderedItems(), out = {}, acc = S.course ? accessFor(S.course.id) : '';
      var upto = acc === 'all' ? all.length - 1 : all.findIndex(function (x) { return x.id === acc; });
      all.forEach(function (l, i) {
        var st = gateSteps(l, S.progress[l.id], S.works[l.id]);
        out[l.id] = { n: i + 1, steps: st.steps, passed: st.passed, open: i === 0 || i <= upto || out[all[i - 1].id].passed };
      });
      return out;
    }
    /* A level passed while the builder watches: confetti, applause, and the way on. */
    function afterData() {
      if (!isBuilder || !S.course || S.loading || S.screen === 'home' || !S.progLoaded || !S.workLoaded) return;
      var all = orderedItems(), lv = levelMap();
      if (!S.seen) { S.seen = {}; all.forEach(function (l) { if (lv[l.id].passed) S.seen[l.id] = 1; }); return; }
      var fresh = all.filter(function (l) { return lv[l.id].passed && !S.seen[l.id]; });
      fresh.forEach(function (l) { S.seen[l.id] = 1; });
      if (!fresh.length) return;
      var l = fresh[fresh.length - 1], i = all.indexOf(l), next = all[i + 1], c = S.course;
      if (next) {
        celebrate({ emoji: '🎉', badge: 'Level ' + (i + 2) + ' unlocked', title: 'You passed Level ' + (i + 1) + '!',
          line: 'Brilliant work! Level ' + (i + 2) + ' (' + nameOf(next) + ') is open now, and your family has been told. Keep going!',
          go: ['Continue to Level ' + (i + 2), function () { closePractice(); openLesson(next); }], stay: 'Stay here' });
      } else {
        var then = allCourses().filter(function (x) { return x.afterCourseId === c.id; })[0];
        celebrate({ emoji: '🏆', badge: then ? then.name + ' unlocked' : 'Class complete', title: 'You finished ' + c.name + '!',
          line: 'You passed every level of ' + c.name + '. ' + (then ? then.name + ' is open for you now.' : 'Your family has been told. Amazing work!'),
          go: then ? ['Open ' + then.name, function () { closePractice(); openCourse(then); }] : ['Back to my classes', goHome], stay: 'Stay here' });
      }
    }
    unsubs.push(query(db.collection('techNotifications').where('recipientId', '==', me.uid).where('read', '==', false).limit(300), function (s) {
      S.unread = docs(s).filter(function (n) { return n.lessonId && (!n.studentId || n.studentId === student.id); });
      if (S.screen !== 'lesson') paint();
    }));
    db.collection('techAttempts').where('studentId', '==', student.id).orderBy('at', 'desc').limit(15).get().then(function (s) { S.attempts = docs(s); if (!dead && S.screen === 'home') paint(); }).catch(function (e) { S.attempts = []; fail(e); });

    function clearCourse() { courseUnsubs.forEach(function (u) { u(); }); courseUnsubs = []; S.topics = []; S.items = []; }
    function openCourse(c, thenLesson) {
      clearCourse();
      S.course = c; S.screen = 'course'; S.lesson = null; S.loading = 2; S.seen = null;
      paint();
      var done = function () {
        S.loading = Math.max(0, S.loading - 1);
        if (S.loading) return;
        if (thenLesson) {
          var want = thenLesson; thenLesson = null;
          /* A link to a lesson waits for progress, so its padlock is right. */
          whenReady(function () {
            if (dead || S.course !== c) return;
            var l = S.items.filter(function (x) { return x.id === want; })[0];
            if (l) openLesson(l); else paint();
            afterData();
          });
          return;
        }
        if (S.screen === 'course') paint();
        afterData();
      };
      courseUnsubs.push(query(TOPICS().where('courseId', '==', c.id), function (s) { S.topics = docs(s).sort(byOrder); done(); }));
      courseUnsubs.push(query(LESSONS().where('courseId', '==', c.id).where('status', '==', 'published'), function (s) { S.items = docs(s).sort(byOrder); done(); }));
    }
    function orderedItems() {
      var out = [];
      S.topics.forEach(function (t) { S.items.filter(function (l) { return l.topicId === t.id; }).forEach(function (l) { out.push(l); }); });
      return out;
    }
    function goHome() { clearCourse(); releaseVideos(); closePractice(); if (S.pUnsub) { S.pUnsub(); S.pUnsub = null; } S.screen = 'home'; S.course = null; S.lesson = null; paint(); }
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
      var h = '<div class="tc-hbar"><h3>' + (isBuilder ? 'My classes' : esc(first) + '\u2019s classes') + '</h3><div class="sub">' + levelBadge(track) + '<span>' + esc(intro) + '</span></div></div>';
      var list = allCourses();
      h += list.length ? '<div class="tc-grid">' + list.map(function (c) {
        var n = unreadFor('courseId', c.id), lock = courseLock(c);
        if (lock) return '<button type="button" class="tc-card locked" data-tc="course-locked" data-id="' + esc(c.id) + '" aria-label="' + esc(c.name) + ', locked"><i class="fas fa-lock lockmark" aria-hidden="true"></i><span class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></span><b>' + esc(c.name) + '</b><small>' + (lock === '…' ? 'Checking…' : 'Finish ' + esc(lock) + ' to unlock') + '</small></button>';
        return '<button type="button" class="tc-card" data-tc="course" data-id="' + esc(c.id) + '">' + (n ? '<span class="tc-bub" aria-label="' + n + ' new">' + n + '</span>' : '') + '<span class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></span><b>' + esc(c.name) + '</b><small>' + esc(T.disciplineLabel(c.discipline)) + '</small>' +
          (c.opened ? '<span class="opened"><i class="fas fa-lock-open"></i> Opened for ' + (isBuilder ? 'you' : esc(first)) + ' · ' + esc(trackName(c.track)) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="tc-empty">No classes have been posted for this level yet. New lessons appear here, with a bell and an email.</div>';
      if ((S.attempts || []).length) {
        h += '<div class="tc-panel" style="margin-top:1.2rem"><h3>' + (isBuilder ? 'My latest results' : 'Latest results') + '</h3>' + S.attempts.map(function (a) {
          return '<div class="tc-file"><i class="fas ' + (a.kind === 'test' ? 'fa-clipboard-question' : 'fa-circle-question') + '"></i><span class="nm">' + esc(a.title) + ' <small style="color:var(--muted,#5A6E6A);font-weight:600">· ' + esc(a.courseName || '') + ' · ' + esc(fmtDay(a.at)) + '</small></span>' + scorePill(a) + '</div>';
        }).join('') + '</div>';
      }
      host.innerHTML = h;
    }
    function itemState(l, L) {
      var p = S.progress[l.id], out = '';
      if (unreadFor('lessonId', l.id)) out += '<span class="tc-pill new">New</span>';
      if (p && p.bestPercent != null) out += '<span class="tc-pill ' + scoreClass(p.bestPercent) + '">Best ' + p.bestPercent + '%</span>';
      if (L && L.passed) out += '<span class="tc-pill good"><i class="fas fa-check"></i> Passed</span>';
      else if (L) { var d = L.steps.filter(function (s) { return s.done; }).length; out += '<span class="tc-pill">' + (d ? d + '/' + L.steps.length + ' steps' : 'Open') + '</span>'; }
      return out;
    }
    function nameOf(l) { return labelsFor(S.items.filter(function (x) { return x.topicId === l.topicId; }))[l.id] || l.title || 'Lesson'; }
    function isDone(l) { var L = levelMap()[l.id]; return !!(L && L.passed); }
    /* "To pass Level 2: watch, quiz, hand in", ticked as they go. */
    function stepsHtml(l) {
      var lv = levelMap(), L = lv[l.id]; if (!L) return '';
      var all = orderedItems(), next = all[L.n];
      if (L.passed) return '<div class="tc-steps passed" id="tcSteps"><span class="ok"><i class="fas fa-circle-check"></i> Level ' + L.n + ' passed</span><span class="tc-step done">' +
        (next ? '<i class="fas fa-lock-open"></i> Level ' + (L.n + 1) + ' is open' : '<i class="fas fa-trophy"></i> ' + (isBuilder ? 'You finished this class' : esc(first) + ' finished this class')) + '</span></div>';
      return '<div class="tc-steps" id="tcSteps"><b>To pass Level ' + L.n + '</b>' + L.steps.map(function (s) {
        return '<span class="tc-step' + (s.done ? ' done' : '') + '"><i class="fas ' + (s.done ? 'fa-circle-check' : 'fa-circle') + '" aria-hidden="true"></i>' + esc(s.label) + (s.done ? '<span class="tc-sr"> (done)</span>' : '') + '</span>';
      }).join('') + (next ? '<span class="tc-step"><i class="fas fa-lock" aria-hidden="true"></i> then Level ' + (L.n + 1) + ' opens</span>' : '') + '</div>';
    }
    function navHtml(l) {
      var all = orderedItems(), lv = levelMap(), i = all.findIndex(function (x) { return x.id === l.id; }), prev = all[i - 1], next = all[i + 1];
      var nextBtn = !next ? '<button type="button" class="tc-btn light" data-tc="back">Back to the class</button>'
        : lv[next.id].open ? '<button type="button" class="tc-btn" data-tc="lesson" data-id="' + esc(next.id) + '">Level ' + (i + 2) + ' <i class="fas fa-arrow-right"></i></button>'
        : '<button type="button" class="tc-btn" data-tc="locked" data-id="' + esc(next.id) + '" aria-disabled="true" style="opacity:.6"><i class="fas fa-lock"></i> Level ' + (i + 2) + ' is locked</button>';
      return '<div class="tc-nav" id="tcNav">' + (prev ? '<button type="button" class="tc-btn light" data-tc="lesson" data-id="' + esc(prev.id) + '"><i class="fas fa-arrow-left"></i> Level ' + i + '</button>' : '<span></span>') + nextBtn + '</div>';
    }
    function refreshLessonBits() {
      if (S.screen !== 'lesson' || !S.lesson) return;
      var l = S.lesson, el;
      if ((el = host.querySelector('#tcSteps'))) el.outerHTML = stepsHtml(l);
      if ((el = host.querySelector('#tcNav'))) el.outerHTML = navHtml(l);
      if ((el = host.querySelector('.tc-lside'))) el.outerHTML = sideList(l);
    }
    function lockedNote(id) {
      var lv = levelMap(), L = lv[id];
      toast(L ? 'Level ' + L.n + ' is locked. ' + (isBuilder ? 'Pass' : first + ' needs to pass') + ' Level ' + (L.n - 1) + ' first.' : 'This level is locked.');
    }
    function crumb(extra) { return '<div class="tc-crumb"><button type="button" data-tc="home">Classes</button>' + extra + '</div>'; }
    function paintCourse() {
      var c = S.course;
      if (S.loading) { host.innerHTML = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') + '<div class="tc-empty">Loading…</div>'; return; }
      var all = orderedItems(), lv = levelMap(), done = all.filter(function (x) { return lv[x.id].passed; }).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
      var h = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') +
        '<div class="tc-hbar"><h3>' + esc(c.name) + '</h3><div class="sub">' + levelBadge(c.track) + '<span>' + esc(T.disciplineLabel(c.discipline)) + '</span>' +
        (all.length ? '<span class="tc-prog" title="' + done + ' of ' + all.length + ' levels passed"><span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' + done + '/' + all.length + ' levels passed</span>' : '') + '</div></div>';
      var shown = 0;
      S.topics.forEach(function (t) {
        var ls = S.items.filter(function (l) { return l.topicId === t.id; });
        if (!ls.length) return;
        shown++;
        var names = labelsFor(ls);
        h += '<div class="tc-topic"><div class="tc-topic-head">' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</div>' + ls.map(function (l) {
          var L = lv[l.id]; if (!L) return '';
          var bits = []; if (l.type === 'test') bits.push('Practice test'); if (l.video) bits.push('Video'); if (l.notes) bits.push('Notes'); if (l.task) bits.push(g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'Write it' : 'Code it'); if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's'));
          var num = L.n < 10 ? '0' + L.n : String(L.n);
          if (!L.open) return '<button type="button" class="tc-row locked" data-tc="locked" data-id="' + esc(l.id) + '" aria-label="Level ' + L.n + ', locked"><span class="n"><i class="fas fa-lock" aria-hidden="true"></i></span><span class="t"><span class="lv">Level ' + L.n + '</span><b>' + esc(names[l.id]) + '</b><small>Pass Level ' + (L.n - 1) + ' to unlock</small></span><i class="fas fa-lock tc-lock" aria-hidden="true"></i></button>';
          return '<button type="button" class="tc-row' + (L.passed ? ' passed' : '') + '" data-tc="lesson" data-id="' + esc(l.id) + '"><span class="n">' + (L.passed ? '<i class="fas fa-circle-check" title="Passed"></i>' : num) + '</span><span class="t"><span class="lv">Level ' + L.n + '</span><b>' + esc(names[l.id]) + '</b>' + (bits.length ? '<small>' + esc(bits.join(' · ')) + '</small>' : '') + '</span>' + itemState(l, L) + '<i class="fas fa-chevron-right" style="font-size:.7rem;opacity:.5"></i></button>';
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
    var isWriting = function (l) { return !!(g.TechWork && g.TechWork.kindOf(l.task) === 'writing'); };
    /* The lesson's practice tool, one press away under the video. */
    function practiceCard(l) {
      if (!l.task || !g.TechWork) return '';
      var w = isWriting(l);
      var line = l.task.brief || (w ? 'Write about what you learnt in this lesson.' : 'Try out what you learnt in this lesson in Paisley VS Code.');
      return '<section class="tc-practice"><span class="ic"><i class="fas ' + (w ? 'fa-pen-nib' : 'fa-laptop-code') + '"></i></span>' +
        '<div class="t"><b>' + (isBuilder ? (w ? 'Write it' : 'Practise it') : esc(first) + '\u2019s practice') + '</b><small>' + esc(line) + '</small>' +
          ((l.task.questions || []).length ? '<span class="tc-pill"><i class="fas fa-circle-question"></i> ' + l.task.questions.length + ' question' + (l.task.questions.length === 1 ? '' : 's') + ' to answer</span> ' : '') + '<span id="tcPState"></span></div>' +
        '<button type="button" class="tc-btn gold" data-tc="practice"><i class="fas ' + (w ? 'fa-pen-nib' : 'fa-code') + '"></i> ' +
        (isBuilder ? (w ? 'Open the writing pad' : 'Open Paisley VS Code') : 'See ' + esc(first) + '\u2019s work') + '</button></section>';
    }
    function watchPractice(l) {
      if (S.pUnsub) { S.pUnsub(); S.pUnsub = null; }
      if (!l.task || !g.TechWork) return;
      S.pUnsub = db.collection('techLessonWork').doc(student.id + '_' + l.id).onSnapshot(function (s) {
        var el = host.querySelector('#tcPState'); if (!el) return;
        var d = s.exists ? s.data() : null;
        el.innerHTML = d ? g.TechWork.statePill(d.status) + (g.TechWork.scoreText(d) ? ' <span class="tc-pill">' + esc(g.TechWork.scoreText(d)) + '</span>' : '') : '';
      }, function () { });
    }
    function openPractice(l) {
      closePractice();
      var w = isWriting(l), label = nameOf(l);
      host.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (e) { } });
      var pop = document.createElement('div');
      pop.className = 'tc-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', 'Practice');
      pop.innerHTML = '<div class="tc-pop-box"><header class="tc-pop-head"><span class="ic"><i class="fas ' + (w ? 'fa-pen-nib' : 'fa-laptop-code') + '"></i></span>' +
        '<div class="t"><b>' + esc(l.topicTitle || S.course.name) + ' · ' + esc(label) + (isBuilder ? '' : ' · ' + esc(first)) + '</b><small>' + esc(S.course.name) + ' · ' + (w ? 'Writing pad' : 'Paisley VS Code') + '</small></div>' +
        '<button type="button" class="tc-pop-x" data-pop="close" aria-label="Close" title="Close (your work is saved)"><i class="fas fa-xmark"></i></button></header><div class="tc-pop-body"></div></div>';
      document.body.appendChild(pop);
      document.documentElement.style.overflow = 'hidden';
      S.pop = pop;
      S.work = g.TechWork.mountLessonWork(pop.querySelector('.tc-pop-body'), { me: me, student: student, lesson: Object.assign({}, l, { courseName: l.courseName || S.course.name }), label: label, layout: 'pop' });
      pop.addEventListener('click', function (e) { if (e.target.closest('[data-pop="close"]')) closePractice(); });
      if (isBuilder) T.logActivity(me, 'project_opened', 'Opened the practice for ' + label, { origin: 'class' });
    }
    function closePractice() {
      if (S.work) { try { S.work.destroy(); } catch (e) { } S.work = null; }
      if (S.pop) { S.pop.remove(); S.pop = null; document.documentElement.style.overflow = ''; }
    }
    function sideList(l) {
      var ls = S.items.filter(function (x) { return x.topicId === l.topicId; }), names = labelsFor(ls), lv = levelMap();
      return '<aside class="tc-lside" aria-label="Lessons in this topic"><h4>' + esc(l.topicTitle || 'This topic') + '</h4>' + ls.map(function (x) {
        var on = x.id === l.id, L = lv[x.id] || { n: '', open: true, passed: false }, done = L.passed;
        var bits = ['Level ' + L.n]; if (x.video) bits.push('Video'); if (x.task) bits.push(isWriting(x) ? 'Writing' : 'Code'); if (x.questionCount) bits.push('Quiz');
        if (!L.open) return '<button type="button" class="tc-sitem locked" data-tc="locked" data-id="' + esc(x.id) + '" aria-label="Level ' + L.n + ', locked"><span class="n"><i class="fas fa-lock"></i></span><span class="t">' + esc(names[x.id]) + '<small>Level ' + L.n + ' · locked</small></span></button>';
        return '<button type="button" class="tc-sitem' + (on ? ' on' : '') + (done ? ' done' : '') + '" data-tc="lesson" data-id="' + esc(x.id) + '"' + (on ? ' aria-current="true"' : '') + '><span class="n">' + (done ? '<i class="fas fa-check"></i>' : L.n) + '</span>' +
          '<span class="t">' + esc(names[x.id]) + '<small>' + esc(bits.join(' · ')) + '</small></span></button>';
      }).join('') + '<div style="border-top:1px solid var(--line,rgba(38,51,49,.08));margin-top:.5rem;padding-top:.5rem"><button type="button" class="tc-sitem" data-tc="back"><span class="n"><i class="fas fa-arrow-left"></i></span><span class="t">All of ' + esc(S.course.name) + '</span></button></div></aside>';
    }
    function openLesson(l) {
      var L0 = levelMap()[l.id];
      if (L0 && !L0.open) { lockedNote(l.id); if (S.screen !== 'course') { S.screen = 'course'; S.lesson = null; paint(); } return; }
      releaseVideos(); closePractice();
      S.screen = 'lesson'; S.lesson = l;
      var files = (l.files || []).filter(function (f) { return T.safeUrl(f.url); });
      var word = l.type === 'test' ? 'Practice test' : 'Lesson', label = nameOf(l);
      var tabs = [];
      if (l.notes) tabs.push(['notes', '<i class="fas fa-book-open"></i> Notes', '<div class="tc-prose">' + T.cleanHtml(l.notes) + '</div>']);
      if (l.instructions) tabs.push(['ins', '<i class="fas fa-list-check"></i> Instructions', '<div class="tc-prose tc-plain">' + esc(l.instructions) + '</div>']);
      if (files.length) tabs.push(['files', '<i class="fas fa-paperclip"></i> Files (' + files.length + ')', files.map(function (f, n) {
        return '<div class="tc-file"><i class="fas ' + (isPdf(f) ? 'fa-file-pdf' : 'fa-file') + '"></i><span class="nm">' + esc(f.name) + '</span>' + (isPdf(f) ? '<button type="button" class="tc-btn light sm" data-tc="pdf" data-n="' + n + '">Read here</button>' : '<a class="tc-btn light sm" href="' + esc(T.safeUrl(f.url)) + '" target="_blank" rel="noopener noreferrer">Open</a>') + '</div><div data-pdf="' + n + '"></div>';
      }).join('')]);
      var box = tabs.length ? '<section class="tc-box"><div class="tc-boxtabs" role="tablist">' + tabs.map(function (t, n) {
        return '<button type="button" class="tc-boxtab' + (n ? '' : ' on') + '" role="tab" aria-selected="' + !n + '" data-tc="tab" data-v="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' + tabs.map(function (t, n) { return '<div class="tc-boxpane" data-tabpane="' + t[0] + '"' + (n ? ' hidden' : '') + '>' + t[2] + '</div>'; }).join('') + '</section>' : '';
      var quiz = (l.questions || []).length ? '<div class="tc-panel" id="tcQuiz"></div>' : '';
      var meta = [];
      if (l.video) meta.push('<span class="tc-pill"><i class="fas fa-circle-play"></i> Video</span>');
      if (l.task) meta.push('<span class="tc-pill"><i class="fas ' + (isWriting(l) ? 'fa-pen-nib' : 'fa-code') + '"></i> ' + (isWriting(l) ? 'Writing pad' : 'Paisley VS Code') + '</span>');
      if (l.questionCount) meta.push('<span class="tc-pill"><i class="fas fa-circle-question"></i> ' + l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's') + '</span>');
      var nav = navHtml(l), lvN = (levelMap()[l.id] || {}).n;
      /* Class > topic names it; the lesson only adds its number or its own title. */
      host.innerHTML = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <button type="button" data-tc="back">' + esc(S.course.name) + '</button> <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(l.topicTitle || '') + '</span>') +
        '<div class="tc-lhead"><div class="tc-eyebrow">' + esc(S.course.name) + (lvN ? ' · Level ' + lvN : '') + '</div><h2>' + esc(l.topicTitle || S.course.name) + ' <span>· ' + esc(label) + '</span></h2><div class="tc-meta">' + meta.join('') + '</div></div>' +
        stepsHtml(l) +
        '<div class="tc-lgrid"><div class="tc-lmain">' + stageHtml(l) + practiceCard(l) + box + quiz + nav + '</div>' + sideList(l) + '</div>';
      if (g.TechWork) g.TechWork.style();
      markSeen(l.id);
      touch(l, { openedAt: FV().serverTimestamp() });
      if (isBuilder) T.logActivity(me, 'material_opened', 'Opened the ' + word.toLowerCase() + ' “' + label + '”', { missionId: '', origin: 'class' });
      if ((l.questions || []).length) paintQuiz(l);
      watchPractice(l);
      if (o.practice) { o.practice = false; openPractice(l); }
      window.scrollTo(0, 0);
    }
    /* The form, or the last result. Lives in its own box so the video keeps playing. */
    function paintQuiz(l, result) {
      var box = host.querySelector('#tcQuiz'); if (!box) return;
      var title = l.type === 'test' ? 'Questions' : 'Test your understanding', p = S.progress[l.id];
      if (result) {
        box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3>' + scoreBox(result) + reviewHtml(result.review) + '<button type="button" class="tc-btn light" data-tc="retry" style="margin-top:.8rem"><i class="fas fa-rotate"></i> Try again</button>';
        return;
      }
      if (!isBuilder) {
        box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3><p class="tc-prose" style="margin:0 0 .6rem">' + (l.questions || []).length + ' questions.</p><div id="tcKid">Loading ' + esc(first) + '’s results…</div>';
        db.collection('techAttempts').where('studentId', '==', student.id).where('lessonId', '==', l.id).get().then(function (s) {
          var el = box.querySelector('#tcKid'); if (!el) return;
          var rows = docs(s).sort(function (a, b) { return (T.toDate(b.at) || 0) - (T.toDate(a.at) || 0); });
          el.innerHTML = rows.length ? scoreBox(rows[0], ' · ' + esc(fmtDay(rows[0].at)) + ' · ' + rows.length + ' tr' + (rows.length === 1 ? 'y' : 'ies')) + reviewHtml(rows[0].review) : esc(first) + ' has not taken this yet.';
        }).catch(function (e) { var el = box.querySelector('#tcKid'); if (el) el.textContent = T.errMsg(e); });
        return;
      }
      box.innerHTML = '<h3><i class="fas fa-circle-question"></i> ' + title + '</h3>' + (p && p.bestPercent != null ? '<p style="margin:0 0 .5rem;font-weight:700;color:var(--muted,#5A6E6A)">Your best so far: ' + p.bestPercent + '%</p>' : '') +
        l.questions.map(function (q, i) {
          var input = q.type === 'open' ? '<textarea data-qa="' + esc(q.id) + '" rows="4" maxlength="3000" placeholder="Write your answer" aria-label="Your answer"></textarea>' :
            q.type === 'short' ? '<input type="text" data-qa="' + esc(q.id) + '" maxlength="300" placeholder="Your answer" aria-label="Your answer">' :
            (q.options || []).map(function (op, n) { return '<label><input type="radio" name="tq' + esc(q.id) + '" data-qa="' + esc(q.id) + '" value="' + n + '"> <span>' + esc(op) + '</span></label>'; }).join('');
          return '<div class="tc-ask"><div class="q">' + (i + 1) + '. ' + esc(q.text) + '</div>' + input + '</div>';
        }).join('') + '<button type="button" class="tc-btn" data-tc="submit" style="margin-top:.8rem"><i class="fas fa-paper-plane"></i> Submit answers</button><div class="tc-msg" id="tcQMsg" role="status"></div>';
    }
    function submitQuiz(l, btn) {
      var answers = {}, missing = 0;
      l.questions.forEach(function (q) {
        if (q.type === 'short' || q.type === 'open') { var v = (host.querySelector('[data-qa="' + q.id + '"]') || {}).value || ''; if (!v.trim()) missing++; answers[q.id] = v.trim().slice(0, q.type === 'open' ? 3000 : 300); }
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
      else if (a === 'course') { var c = allCourses().filter(function (x) { return x.id === id; })[0]; if (c) openCourse(c); }
      else if (a === 'locked' || a === 'course-locked') {
        t.classList.remove('tc-shake'); void t.offsetWidth; t.classList.add('tc-shake');
        if (a === 'locked') lockedNote(id);
        else { var lc = allCourses().filter(function (x) { return x.id === id; })[0], nm = lc ? courseLock(lc) : ''; toast(nm && nm !== '…' ? 'This class unlocks when ' + (isBuilder ? 'you pass' : first + ' passes') + ' every level of ' + nm + '.' : 'This class is locked for now.'); }
      }
      else if (a === 'back') { releaseVideos(); closePractice(); if (S.pUnsub) { S.pUnsub(); S.pUnsub = null; } S.screen = 'course'; S.lesson = null; paint(); window.scrollTo(0, 0); }
      else if (a === 'practice') openPractice(S.lesson);
      else if (a === 'tab') {
        host.querySelectorAll('[data-tc="tab"]').forEach(function (b) { var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        host.querySelectorAll('[data-tabpane]').forEach(function (p) { p.hidden = p.dataset.tabpane !== t.dataset.v; });
      }
      else if (a === 'lesson') { var l = S.items.filter(function (x) { return x.id === id; })[0]; if (l) openLesson(l); }
      else if (a === 'submit') submitQuiz(S.lesson, t);
      else if (a === 'retry') paintQuiz(S.lesson);
      else if (a === 'pdf') {
        var n = t.dataset.n, f = (S.lesson.files || []).filter(function (x) { return T.safeUrl(x.url); })[Number(n)], slot = host.querySelector('[data-pdf="' + n + '"]');
        if (!f || !slot) return;
        slot.innerHTML = slot.innerHTML ? '' : '<iframe class="tc-pdf" src="' + esc(T.safeUrl(f.url)) + '#toolbar=0" title="' + esc(f.name) + '"></iframe>';
      }
    });
    host.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-tc-stage]')) e.preventDefault(); });
    /* timeupdate does not bubble, so listen on the way down. Four fifths in counts as watched. */
    host.addEventListener('timeupdate', function (e) {
      if (!isBuilder || !S.lesson || !e.target.matches || !e.target.matches('video')) return;
      var v = e.target;
      if (S.watched !== S.lesson.id && v.duration && v.currentTime / v.duration >= 0.8) {
        S.watched = S.lesson.id;
        touch(S.lesson, { watchedAt: FV().serverTimestamp() });
        T.logActivity(me, 'video_watched', 'Watched “' + nameOf(S.lesson) + '”', { origin: 'class' });
      }
    }, true);
    if (o.lessonId) {
      LESSONS().doc(o.lessonId).get().then(function (d) {
        if (dead || !d.exists) return;
        return COURSES().doc(d.data().courseId).get().then(function (c) { if (!dead && c.exists) openCourse(Object.assign({ id: c.id }, c.data()), o.lessonId); });
      }).catch(fail);
    }
    paint();
    return { destroy: function () { dead = true; releaseVideos(); closePractice(); if (S.pUnsub) S.pUnsub(); unsubs.forEach(function (u) { u(); }); clearCourse(); } };
  }

  g.TechClasses = { mountManager: mountManager, mountResults: mountResults, mountLearner: mountLearner, style: style, labelsFor: labelsFor, gateOf: gateOf, gateSteps: gateSteps, inOrder: inOrder, celebrate: celebrate };
})(window);
