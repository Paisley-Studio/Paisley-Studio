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

   Levels and locks. The classes of one level track, in techCourses.order (then
   name), are Level 1, 2, 3… Level 1 is open; every other class shows a padlock
   until the class before it is passed. Inside an open class, lessons open in
   order: each opens once the one before it is finished (lockedBy). A class is passed when every lesson posted in it is finished;
   what finishing a lesson takes is lesson.gate { watch, quiz, pass (%), work }
   (gateSteps; functions/tech.js mirrors it, records techCourseProgress.passedAt
   and tells the builder, coach, admins and guardians). A new class goes to the
   end of its level, so it arrives locked.
   techAccess/{uid}.open[courseId] = 'all' is the admin opening a class for one
   builder, at any level.

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
      watch: !!gt.watch && l.type !== 'test' && videosOf(l).length > 0,
      quiz: !!gt.quiz && qs.length > 0,
      marked: qs.some(function (q) { return q.type !== 'open'; }),
      pass: isFinite(pass) && gt.pass !== '' && gt.pass != null ? Math.max(0, Math.min(100, Math.round(pass))) : DEFAULT_PASS,
      work: !!gt.work && !!l.task
    };
  }
  /* A lesson can hold several videos (videos[]); old lessons have one (video). video always mirrors the first. */
  function videosOf(l) {
    var v = l && l.videos && l.videos.length ? l.videos : (l && l.video ? [l.video] : []);
    return v.filter(function (x) { return x && T.safeUrl(x.url); });
  }
  function handedIn(w) { return !!w && ((w.submitCount || 0) > 0 || ['Submitted', 'Graded', 'Corrections'].indexOf(w.status) > -1); }
  /* The steps to pass one lesson, each done or not, for one builder. */
  function gateSteps(l, p, w) {
    var gt = gateOf(l), steps = [];
    p = p || {};
    if (gt.watch) {
      var nv = videosOf(l).length, seen = Object.keys(p.watchedVideos || {}).filter(function (k) { return p.watchedVideos[k] && Number(k) < nv; }).length;
      steps.push({ k: 'watch', icon: 'fa-circle-play', label: nv > 1 ? 'Watch all ' + nv + ' videos' + (p.watchedAt ? '' : ' (' + seen + '/' + nv + ')') : 'Watch the video', done: !!p.watchedAt });
    }
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
  /* Classes in learning order: Level 1, 2, 3… (order, then name). Must match functions/tech.js. */
  function byCourse(a, b) { return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)); }
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
      '.tc-card .lv{display:block;margin:0 0 .15rem;font-size:.66rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--brand,#55BFB3)}.tc-card.locked .lv{color:#B5C0BE}',
      '.tc-card.passed .ic{background:rgba(46,184,114,.14);color:#1f8557}.tc-card.passed .lv{color:#1f8557}',
      '.tc-card .opened{display:inline-block;margin-top:.45rem;font-size:.68rem;font-weight:800;color:#5b3a99}',
      '.tc-sitem.locked{cursor:not-allowed;color:#9AA8A5}.tc-sitem.locked:hover{background:none}.tc-sitem.locked .n{background:#F3F6F5;color:#9AA8A5}',
      '.tc-steps{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .9rem;padding:.6rem .85rem;margin:0 0 1rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;background:#fff;font-size:.8rem}',
      '.tc-steps>b{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.tc-step{display:inline-flex;align-items:center;gap:.35rem;font-weight:600;color:var(--muted,#5A6E6A)}.tc-step i{font-size:.9rem;color:#B5C0BE}',
      '.tc-step.done{color:var(--ink,#263331)}.tc-step.done i{color:#2EB872}',
      '.tc-steps.passed{border-color:rgba(46,184,114,.35);background:rgba(46,184,114,.06)}.tc-steps .ok{font-weight:800;color:#1f8557}',
      '.tc-shake{animation:tcShake .4s}@keyframes tcShake{25%{transform:translateX(-4px)}50%{transform:translateX(4px)}75%{transform:translateX(-2px)}}',
      '.tc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2100;max-width:min(92vw,420px);padding:.7rem 1rem;border-radius:12px;background:#263331;color:#fff;font-size:.86rem;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25)}',
      /* several videos: the strip under the player */
      '.tc-vbar{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;width:min(100%,calc(60vh * 16 / 9));margin:-.4rem auto 1rem;padding:.6rem .8rem;background:#fff;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px}',
      '.tc-vbar .t{min-width:0;flex:1}.tc-vbar .k{display:block;font-size:.66rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--brand,#55BFB3)}.tc-vbar .t b{display:block;font-size:.9rem;color:var(--brand-deep,#245F5A);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tc-vchips{display:flex;gap:.3rem;flex-wrap:wrap}.tc-vchip{width:28px;height:28px;border-radius:50%;border:1.5px solid var(--line,rgba(38,51,49,.18));background:#fff;font:inherit;font-size:.74rem;font-weight:800;color:var(--muted,#5A6E6A);cursor:pointer}',
      '.tc-vchip.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}.tc-vchip.done:not(.on){background:#2EB872;border-color:#2EB872;color:#fff}',
      '.tc-vbar .acts{display:flex;gap:.4rem;margin-left:auto}',
      '.tc-pulse{animation:tcPulse 1.4s ease-in-out infinite}@keyframes tcPulse{50%{box-shadow:0 0 0 6px rgba(85,191,179,.28)}}',
      '.tc-upnext{position:absolute;right:14px;bottom:14px;z-index:2;display:flex;align-items:center;gap:.7rem;max-width:calc(100% - 28px);padding:.7rem .8rem .7rem 1rem;border-radius:14px;background:rgba(15,26,20,.88);color:#fff;font-size:.84rem;box-shadow:0 10px 30px rgba(0,0,0,.35)}',
      '.tc-upnext small{display:block;opacity:.75;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em}',
      /* the lesson video floating over the practice tool: drag it, resize it, close it */
      '.tc-mini{position:fixed;z-index:700;width:340px;min-width:220px;max-width:calc(100vw - 16px);background:#0F1A14;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column}',
      '.tc-mini.big{width:min(720px,calc(100vw - 16px))}',
      '.tc-mini-bar{display:flex;align-items:center;gap:.35rem;padding:.35rem .4rem .35rem .7rem;background:#1C2B26;color:#E6F2EF;cursor:grab;touch-action:none;user-select:none}',
      '.tc-mini.dragging .tc-mini-bar{cursor:grabbing}',
      '.tc-mini-bar .t{flex:1;min-width:0;font-size:.74rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-mini-bar .t i{color:#55BFB3;margin-right:.3rem}',
      '.tc-mini-bar button{flex:none;width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:.78rem}.tc-mini-bar button:hover{background:rgba(255,255,255,.2)}.tc-mini-bar button:disabled{opacity:.35;cursor:default}',
      '.tc-mini-stage{position:relative;aspect-ratio:16/9;background:#000}.tc-mini-stage video,.tc-mini-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}',
      '.tc-mini-grip{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,rgba(255,255,255,.55) 50%,rgba(255,255,255,.55) 60%,transparent 60%,transparent 70%,rgba(255,255,255,.55) 70%,rgba(255,255,255,.55) 80%,transparent 80%);z-index:2}',
      '.tc-pop-vid{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .85rem;border-radius:11px;border:1.5px solid var(--line,rgba(38,51,49,.15));background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-size:.8rem;font-weight:800;cursor:pointer}',
      '@media(max-width:640px){.tc-mini{width:min(280px,calc(100vw - 16px))}}',
      /* the class is done: unlock the next one */
      '.tc-claim{display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;padding:.9rem 1.1rem;margin:0 0 1rem;border-radius:16px;background:linear-gradient(135deg,#FFF6D8,#E5F2EF);border:1px solid rgba(245,200,66,.55)}',
      '.tc-claim .big{font-size:1.8rem;line-height:1}.tc-claim .t{flex:1;min-width:200px}.tc-claim b{display:block;color:var(--brand-deep,#245F5A);font-size:.98rem}.tc-claim small{color:var(--muted,#5A6E6A);font-weight:600;font-size:.8rem}',
      '.tc-claim.float{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1500;width:min(560px,calc(100vw - 24px));margin:0;box-shadow:0 18px 50px rgba(0,0,0,.28)}',
      '.tc-vrow{border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.7rem;margin-bottom:.5rem;background:#fff}.tc-vrow-h{display:flex;gap:.6rem;align-items:center;margin-bottom:.45rem}.tc-vrow-h b{flex:none;font-size:.8rem;color:var(--brand-deep,#245F5A)}.tc-vrow-h input{flex:1;min-width:0}',
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
    /* and a cheer, in the browser's own voice */
    if (o.shout && g.speechSynthesis && g.SpeechSynthesisUtterance) {
      try { var u = new g.SpeechSynthesisUtterance(o.shout); u.pitch = 1.6; u.rate = 1.05; u.volume = 1; g.speechSynthesis.cancel(); setTimeout(function () { g.speechSynthesis.speak(u); }, 350); } catch (e) { /* no voice is fine */ }
    }
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
    var vids = ((item && item.videos && item.videos.length) ? item.videos : (item && item.video && item.video.url ? [item.video] : []))
      .map(function (v) { return { url: v.url || '', path: v.path || '', name: v.name || '', title: v.title || '' }; });
    if (!vids.length) vids.push({ url: '', path: '', name: '', title: '' });
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
    var starter0 = (item && item.task && item.task.starter) || '', startFrom0 = (item && item.task && item.task.startFrom) || 'previous';
    m.body.innerHTML =
      '<div class="cr-row2"><div class="cr-field"><label for="tcT">Title (optional)</label><input type="text" id="tcT" maxlength="160" placeholder="Leave empty to call it ' + (isTest ? 'Practice test' : 'Lesson') + ' 1, 2, 3…" value="' + esc(item ? item.title : '') + '"></div>' +
      '<div class="cr-field"><label for="tcTop">Topic</label><select id="tcTop">' + topics.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === topicId0 ? ' selected' : '') + '>' + esc(t.title) + '</option>'; }).join('') + '</select></div></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label>Videos</label><div id="tcVids"></div><button type="button" class="cr-btn sm" id="tcVidAdd"><i class="fas fa-plus"></i> Add another video</button>' +
          '<div class="cr-note" style="margin-top:.35rem">Paste an AWS, YouTube, Vimeo or Google Drive link, or upload. Builders watch them in this order, with a Next video button between them. For Google Drive, share the video as “Anyone with the link”.</div></div>' +
        '<div class="cr-field"><label>Notes</label><div id="tcNotes"></div></div>') +
      '<div class="cr-field"><label for="tcIns">Instructions (optional)</label><textarea id="tcIns" rows="2" maxlength="3000" placeholder="' + (isTest ? 'What builders should know before they start' : 'What to do after watching') + '">' + esc((item && item.instructions) || '') + '</textarea></div>' +
      (isTest ? '' :
        '<div class="cr-field"><label>PDFs and files (optional)</label><div id="tcFiles"></div><div class="cr-actions" style="margin-top:.4rem"><label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload file<input type="file" id="tcFileIn" multiple hidden accept="application/pdf,image/*,audio/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip"></label></div><div class="cr-note" id="tcFileNote" style="margin-top:.35rem">PDFs open on the page. Files up to 50 MB.</div></div>') +
      '<div class="tc-section"><i class="fas fa-circle-question"></i> ' + (isTest ? 'Questions' : 'Quiz to test understanding (optional)') + '</div><div class="cr-note" style="margin-bottom:.5rem">Options are up to you. A written answer needs no options or answer: builders type it and you read it in Results. Multiple choice, true or false, and short answers with accepted answers are marked automatically. Builders can try again.</div><div id="tcQs"></div>' +
      '<div class="tc-section"><i class="fas fa-laptop-code"></i> Practice for this lesson</div>' +
      '<div class="cr-note" style="margin-bottom:.5rem">Attach a practice tool to this ' + (isTest ? 'test' : 'lesson') + '. Under the videos, builders get a Practise button that opens it full size with your requirements beside it: Paisley VS Code (autocomplete, Emmet, folders, picture and video uploads, full screen) or the writing pad. The pop-up carries the class, topic and lesson name. Add questions for a short quiz or test beside the work: builders answer them there and hand them in with the work, and you mark both with ink in Results > Class work hand-ins. Their family sees your feedback.</div>' +
      '<div class="cr-row2"><div class="cr-field"><label for="tcTaskT">Practice tool</label><select id="tcTaskT">' + [['', 'None'], ['code', 'Paisley VS Code (HTML, CSS, JavaScript)'], ['writing', 'Writing pad']].map(function (p) { var cur = item && item.task && g.TechWork ? g.TechWork.kindOf(item.task) : ''; return '<option value="' + p[0] + '"' + (cur === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></div><div></div></div>' +
      '<div class="cr-field" id="tcTaskBox"><label for="tcTask">Requirements (what they should make)</label><textarea id="tcTask" rows="4" maxlength="3000" placeholder="e.g. Make a page with a heading, a picture of your favourite animal and a button that changes the colour.">' + esc((item && item.task && item.task.brief) || '') + '</textarea><div class="cr-note" style="margin-top:.3rem">Optional. Without it they practise what the lesson showed.</div></div>' +
      '<div class="cr-field" id="tcStartBox"><label>What Paisley VS Code opens with</label>' +
        '<div style="display:grid;gap:.4rem;margin:.1rem 0 .55rem">' +
          '<label style="display:flex;gap:.5rem;align-items:flex-start;text-transform:none;letter-spacing:0;font-weight:700;font-size:.86rem"><input type="radio" name="tcStartFrom" value="previous"' + (startFrom0 !== 'starter' ? ' checked' : '') + ' style="margin-top:.2rem"><span>Carry on from their code in the lesson before<small style="display:block;font-weight:500;font-size:.8rem;color:var(--muted,#5A6E6A)">Each builder continues their own code from the last practice in this class. Someone with nothing before gets the starting code below (or a blank index.html).</small></span></label>' +
          '<label style="display:flex;gap:.5rem;align-items:flex-start;text-transform:none;letter-spacing:0;font-weight:700;font-size:.86rem"><input type="radio" name="tcStartFrom" value="starter"' + (startFrom0 === 'starter' ? ' checked' : '') + ' style="margin-top:.2rem"><span>Start everyone with the code below<small style="display:block;font-weight:500;font-size:.8rem;color:var(--muted,#5A6E6A)">Use this when the lesson needs a fresh start.</small></span></label>' +
        '</div>' +
        '<label for="tcStarter" style="text-transform:none;letter-spacing:0">Starting code for index.html (optional)</label>' +
        '<textarea id="tcStarter" rows="9" maxlength="60000" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;white-space:pre;tab-size:2" placeholder="<!DOCTYPE html>&#10;<html>&#10;<body>&#10;  <h1>My page</h1>&#10;</body>&#10;</html>">' + esc(starter0) + '</textarea>' +
        '<div class="cr-note" style="margin-top:.3rem">Leave it empty for a plain index.html. Put CSS in a &lt;style&gt; tag and JavaScript in a &lt;script&gt; tag, or let builders add their own files.</div></div>' +
      '<div class="cr-field" id="tcTaskQBox"><label>Questions to answer with the work (optional)</label><div class="cr-note" style="margin-bottom:.45rem">A short quiz or test that goes with the work, for example “Which tag makes a link?” or “Explain what your code does”. Builders answer beside the work and hand everything in together; you read and mark the answers with the work (they are not marked automatically).</div><div id="tcTaskQs"></div>' +
      '<button type="button" class="cr-btn sm" id="tcTaskQAdd"><i class="fas fa-plus"></i> Add a question</button></div>' +
      '<div class="tc-section"><i class="fas fa-flag-checkered"></i> To finish this ' + word + '</div>' +
      '<div class="cr-note" style="margin-bottom:.5rem">Lessons open in order: a builder finishes each lesson before the next one opens, because each builds on the one before. A builder passes the class (and unlocks the next class, with a celebration and an email to their family) when every lesson in it is finished. Tick what finishing this ' + word + ' takes. A step the ' + word + ' does not have is skipped, and with nothing ticked, opening it is enough.</div>' +
      '<div class="cr-field" style="display:grid;gap:.45rem">' +
        '<label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGW"' + (gate0.watch ? ' checked' : '') + (isTest ? ' disabled' : '') + '> Watch the video' + (isTest ? ' (lessons only)' : '') + '</label>' +
        '<label style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGQ"' + (gate0.quiz ? ' checked' : '') + '> Pass the quiz with at least <input type="number" id="tcGP" min="0" max="100" step="5" value="' + esc(gate0.pass) + '" style="width:5rem" aria-label="Pass mark in percent">%</label>' +
        '<label style="display:flex;gap:.5rem;align-items:center;text-transform:none;letter-spacing:0;font-weight:700"><input type="checkbox" id="tcGK"' + (gate0.work ? ' checked' : '') + '> Hand in the practice work</label>' +
      '</div>';
    var $ = function (s) { return m.body.querySelector(s); };
    var notes = isTest ? null : notesEditor($('#tcNotes'), item && item.notes);
    var qs = questionBuilder($('#tcQs'), item && item.questions, key);
    var syncTask = function () { var on = $('#tcTaskT').value ? '' : 'none'; $('#tcTaskBox').style.display = on; $('#tcTaskQBox').style.display = on; $('#tcStartBox').style.display = $('#tcTaskT').value === 'code' ? '' : 'none'; };
    /* Tab in the starting code indents instead of leaving the box. */
    $('#tcStarter').addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.shiftKey) return;
      e.preventDefault(); var ta = e.target, s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; dirty = true;
    });
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
      var vNote = function (i, t) { var el = m.body.querySelector('[data-vnote="' + i + '"]'); if (el) el.textContent = t || ''; };
      var readVids = function () { [].forEach.call(m.body.querySelectorAll('[data-vi]'), function (row) { var i = Number(row.dataset.vi), v = vids[i]; if (!v) return; v.title = row.querySelector('[data-vf="title"]').value; var u = row.querySelector('[data-vf="url"]').value.trim(); if (v.path && u !== v.url) { dropStored(v.path); v.path = ''; v.name = ''; } v.url = u; }); };
      var paintVids = function () {
        $('#tcVids').innerHTML = vids.map(function (v, i) {
          return '<div class="tc-vrow" data-vi="' + i + '"><div class="tc-vrow-h"><b>Video ' + (i + 1) + '</b><input type="text" data-vf="title" maxlength="120" placeholder="Title (optional), e.g. Setting up" aria-label="Video ' + (i + 1) + ' title" value="' + esc(v.title) + '">' +
            (i > 0 ? '<button type="button" class="cr-btn sm" data-vmove="' + i + '" title="Move earlier" aria-label="Move video ' + (i + 1) + ' earlier"><i class="fas fa-arrow-up"></i></button>' : '') +
            (vids.length > 1 ? '<button type="button" class="cr-btn sm danger" data-vdel="' + i + '" title="Remove" aria-label="Remove video ' + (i + 1) + '"><i class="fas fa-xmark"></i></button>' : '') + '</div>' +
            '<div class="cr-actions" style="flex-wrap:wrap"><input type="url" data-vf="url" maxlength="1200" placeholder="https://…" aria-label="Video ' + (i + 1) + ' link" value="' + esc(v.url) + '" style="flex:1;min-width:220px">' +
            '<button type="button" class="cr-btn sm" data-vtest="' + i + '"><i class="fas fa-gauge-high"></i> Test link</button>' +
            '<label class="cr-btn sm" style="margin:0;cursor:pointer"><i class="fas fa-upload"></i> Upload<input type="file" data-vup="' + i + '" accept="video/*" hidden></label></div>' +
            '<div class="cr-note" data-vnote="' + i + '" style="margin-top:.3rem">' + (v.path ? 'Uploaded: ' + esc(v.name || 'video') : '') + '</div></div>';
        }).join('');
        $('#tcVidAdd').style.display = vids.length >= 10 ? 'none' : '';
      };
      paintVids();
      $('#tcVidAdd').onclick = function () { readVids(); vids.push({ url: '', path: '', name: '', title: '' }); dirty = true; paintVids(); var ins = m.body.querySelectorAll('[data-vf="url"]'); ins[ins.length - 1].focus(); };
      $('#tcVids').addEventListener('input', function (e) {
        if (e.target.dataset.vf !== 'url') return;
        var i = Number(e.target.closest('[data-vi]').dataset.vi), u = e.target.value.trim();
        vNote(i, u ? g.FastVideo.problem(u) : '');
      });
      $('#tcVids').addEventListener('click', function (e) {
        var b = e.target.closest('[data-vdel],[data-vmove],[data-vtest]'); if (!b) return;
        readVids();
        if (b.dataset.vdel) { var gone = vids.splice(Number(b.dataset.vdel), 1)[0]; if (gone && gone.path) dropStored(gone.path); dirty = true; paintVids(); }
        else if (b.dataset.vmove) { var k = Number(b.dataset.vmove), x = vids[k]; vids[k] = vids[k - 1]; vids[k - 1] = x; dirty = true; paintVids(); }
        else { var ti = Number(b.dataset.vtest); b.disabled = true; vNote(ti, 'Testing the link…'); g.FastVideo.test(vids[ti].url).then(function (r) { vNote(ti, g.FastVideo.testMessage(r)); b.disabled = false; }); }
      });
      $('#tcVids').addEventListener('change', function (e) {
        if (e.target.dataset.vup == null) return;
        var i = Number(e.target.dataset.vup), fl = e.target.files[0]; if (!fl) return;
        if (fl.size >= 500 * 1048576) { vNote(i, 'Too large: videos up to 500 MB. Use an AWS link for longer ones.'); return; }
        readVids(); busy++; vNote(i, 'Uploading 0%…');
        uploadFile(ref.id, fl, function (p) { vNote(i, 'Uploading ' + p + '%…'); }).then(function (r) {
          var v = vids[i]; if (!v) { dropStored(r.path); return; }
          if (v.path) dropStored(v.path);
          v.url = r.url; v.path = r.path; v.name = r.name; dirty = true;
          var inp = m.body.querySelector('[data-vi="' + i + '"] [data-vf="url"]'); if (inp) inp.value = r.url;
          vNote(i, 'Uploaded ✓ ' + r.name);
        }).catch(function (er) { vNote(i, 'Upload failed: ' + T.errMsg(er)); }).then(function () { busy--; });
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
      var videos = [];
      if (!isTest) {
        readVids();
        for (var vi = 0; vi < vids.length; vi++) {
          var vv = vids[vi]; if (!vv.url) continue;
          var safe = T.safeUrl(vv.url);
          if (!safe) return err('Video ' + (vi + 1) + ': the link must start with https://');
          if (!vv.path) { var bad = g.FastVideo.problem(safe); if (bad) return err('Video ' + (vi + 1) + ': ' + bad); }
          videos.push({ url: safe, path: vv.path || '', name: vv.name || '', title: String(vv.title || '').trim().slice(0, 120) });
        }
      }
      var built;
      try { built = qs.collect(); } catch (e) { return err(e.message); }
      var notesHtml = notes ? notes.html() : '';
      if (status === 'published') {
        if (isTest && !built.questions.length && !$('#tcIns').value.trim() && !$('#tcTaskT').value) return err('Add instructions, a practice tool or a question before posting.');
        var plainNotes = notesHtml.replace(/<[^>]+>/g, '').trim();
        if (!isTest && !videos.length && !plainNotes && !files.length && !built.questions.length && !$('#tcTaskT').value) return err('Add a video, notes, a file, a practice tool or a quiz before posting.');
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
        videos: videos, video: videos[0] || null,
        notes: notesHtml, instructions: $('#tcIns').value.trim().slice(0, 3000), files: files.slice(0, 20),
        questions: built.questions, questionCount: built.questions.length,
        task: taskKind ? Object.assign({ brief: brief.slice(0, 3000), kind: taskKind, category: taskKind === 'writing' ? 'WRITING' : 'CODE', questions: taskQuestions },
          taskKind === 'code' ? { starter: $('#tcStarter').value.replace(/\s+$/, '').slice(0, 60000), startFrom: (m.body.querySelector('input[name="tcStartFrom"]:checked') || {}).value === 'starter' ? 'starter' : 'previous' } : {}) : null,
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
      var list = ladderOf(S.track);
      host.innerHTML = '<div class="cr-bar"><div><h3>Classes</h3><div class="cr-sub">Each level has its own classes, taught in order: Level 1 is open, and every class after it shows builders a padlock until they finish every lesson of the class before. A new class goes to the end, so it arrives locked; change the order inside a class with Move earlier / Move later. Inside an open class, lessons open in order: each one opens when the builder finishes the one before. Whatever you post goes to every builder on that level and their parents, with a bell and an email.</div></div><button type="button" class="cr-btn primary" data-a="add-class"><i class="fas fa-plus"></i> Add class</button></div>' +
        trackTabs(S.track) +
        (list.length ? '<div class="cr-grid">' + list.map(function (c) {
          var n = list.indexOf(c) + 1;
          return '<button type="button" class="cr-card" data-a="open" data-id="' + esc(c.id) + '"><div class="ic"><i class="fas ' + (ICON[c.discipline] || 'fa-chalkboard') + '"></i></div>' +
            '<div class="meta" style="font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:.68rem;color:var(--brand,#55BFB3)">Level ' + n + (n > 1 ? ' <i class="fas fa-lock" title="Locked until Level ' + (n - 1) + ' is passed"></i>' : ' · open') + '</div>' +
            '<h4>' + esc(c.name) + '</h4><div class="meta">' + esc(T.disciplineLabel(c.discipline)) + '</div><div style="margin-top:.4rem">' + levelBadge(c.track) + '</div></button>';
        }).join('') + '</div>' : '<div class="cr-panel"><div class="cr-empty">No ' + esc(trackName(S.track)) + ' classes yet. Use “Add class” to start one, for example Coding.</div></div>') +
        '<div class="cr-note" id="tcNote" role="status" style="margin-top:.6rem"></div>';
    }
    /* The classes of one level tab in learning order: Level 1, 2, 3… */
    function ladderOf(track) { return S.courses.filter(function (c) { return onTrack(c, track); }).sort(byCourse); }
    function nextOrder(track) { return ladderOf(track).reduce(function (m, c) { return Math.max(m, c.order || 0); }, 0) + 1; }
    function statusBadge(l) { return '<span class="cr-badge ' + (l.status === 'published' ? 'published' : 'draft') + '">' + (l.status === 'published' ? 'Posted' : 'Draft') + '</span>'; }
    function itemMeta(l) {
      var bits = [];
      var nv = videosOf(l).length; if (nv) bits.push(nv === 1 ? 'Video' : nv + ' videos');
      if (l.notes) bits.push('Notes');
      if ((l.files || []).length) bits.push(l.files.length + ' file' + (l.files.length === 1 ? '' : 's'));
      if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's'));
      if (l.task) bits.push((g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'Writing pad' : 'Paisley VS Code') + (((l.task.questions || []).length) ? ' + ' + l.task.questions.length + ' question' + (l.task.questions.length === 1 ? '' : 's') : ''));
      bits.push(gateSummary(l));
      if (l.createdByName) bits.push(l.createdByName);
      return bits.join(' · ');
    }
    function paintCourse() {
      var c = S.course, canC = canEdit(c), lvList = ladderOf(S.track), lvIdx = lvList.findIndex(function (x) { return x.id === c.id; });
      var h = '<div class="cr-crumb"><a data-a="back">Classes</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(c.name) + '</span></div>' +
        '<div class="cr-bar"><div><h3>' + (lvIdx > -1 ? '<span style="color:var(--brand,#55BFB3)">Level ' + (lvIdx + 1) + ' · </span>' : '') + esc(c.name) + '</h3><div style="margin:.3rem 0">' + levelBadge(c.track) + '</div><div class="cr-sub">' + esc(T.disciplineLabel(c.discipline)) + '. Topics and lessons appear to builders in this order and are always open. ' + (lvIdx === 0 ? '<b>Level 1: open to every builder on this level.</b>' : '<b>Level ' + (lvIdx + 1) + ': locked for each builder until they finish every lesson of Level ' + lvIdx + ', ' + esc(lvList[lvIdx - 1].name) + '.</b>') + '</div></div><div class="cr-actions">' +
        '<button type="button" class="cr-btn" data-a="class-up" data-id="' + esc(c.id) + '"' + (lvIdx <= 0 ? ' disabled' : '') + ' title="Move earlier in the order"><i class="fas fa-arrow-left"></i> Move earlier</button>' +
        '<button type="button" class="cr-btn" data-a="class-down" data-id="' + esc(c.id) + '"' + (lvIdx < 0 || lvIdx >= lvList.length - 1 ? ' disabled' : '') + ' title="Move later in the order"><i class="fas fa-arrow-right"></i> Move later</button>' +
        (isAdmin ? '<button type="button" class="cr-btn" data-a="open-for"><i class="fas fa-lock-open"></i> Open for a builder</button>' : '') +
        (canC ? '<button type="button" class="cr-btn" data-a="rename"><i class="fas fa-gear"></i> Settings</button><button type="button" class="cr-btn danger" data-a="del-class" aria-label="Delete class" title="Delete class"><i class="fas fa-trash"></i></button>' : '') +
        (S.items.some(function (x) { return x.status !== 'published'; }) ? '<button type="button" class="cr-btn" data-a="post-class"><i class="fas fa-paper-plane"></i> Post the whole class</button>' : '') +
        '<button type="button" class="cr-btn primary" data-a="add-topic"><i class="fas fa-plus"></i> Add topic</button></div></div>';
      if (!S.topics.length) h += '<div class="cr-panel"><div class="cr-empty">No topics yet. Add a topic (for example “Flow”), then add lessons inside it.</div></div>';
      S.topics.forEach(function (t, ti) {
        var ls = S.items.filter(function (l) { return l.topicId === t.id; }).sort(byOrder), open = !S.collapsed[t.id];
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t" data-a="toggle" data-id="' + esc(t.id) + '"><i class="fas fa-chevron-' + (open ? 'down' : 'right') + '" style="font-size:.7rem;margin-right:.4rem"></i>' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</span><div class="cr-actions">' +
          '<button type="button" class="cr-btn sm primary" data-a="add-lesson" data-id="' + esc(t.id) + '"><i class="fas fa-plus"></i> Lesson</button>' +
          '<button type="button" class="cr-btn sm" title="Move topic up" aria-label="Move topic up" data-a="topic-up" data-id="' + esc(t.id) + '"' + (ti === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
          '<button type="button" class="cr-btn sm" title="Move topic down" aria-label="Move topic down" data-a="topic-down" data-id="' + esc(t.id) + '"' + (ti === S.topics.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
          (canEdit(t) ? '<button type="button" class="cr-btn sm" title="Edit topic" aria-label="Edit topic" data-a="edit-topic" data-id="' + esc(t.id) + '"><i class="fas fa-pen"></i></button><button type="button" class="cr-btn sm danger" title="Delete topic" aria-label="Delete topic" data-a="del-topic" data-id="' + esc(t.id) + '"><i class="fas fa-trash"></i></button>' : '') +
          '</div></div>';
        if (open) {
          if (!ls.length) h += '<div class="cr-empty">No lessons in this topic yet.</div>';
          var names = labelsFor(ls);
          ls.forEach(function (l, li) {
            h += '<div class="cr-lesson"><span class="n"><i class="fas ' + (l.type === 'test' ? 'fa-clipboard-question' : 'fa-circle-play') + '"></i></span><span class="tt">' + esc(names[l.id]) + '<small>' + esc((l.type === 'test' ? 'Practice test' : 'Lesson') + (itemMeta(l) ? ' · ' + itemMeta(l) : '')) + '</small></span>' + statusBadge(l) + '<div class="cr-actions">' +
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
        '<div class="cr-note">A class is for one level: beginners, intermediate or expert builders. It goes to the end of that level\u2019s classes, so builders see it with a padlock until they finish the class before it. Move it earlier inside the class if it should come sooner.</div>';
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
          var d = { name: name, discipline: ds.value, track: track, order: nextOrder(track), createdBy: me.uid, createdByName: me.name || '', createdAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() };
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
        '';
      m.foot.innerHTML = '<span class="cr-err" id="tcE"></span><button type="button" class="cr-btn" data-x2>Cancel</button><button type="button" class="cr-btn primary" data-go>Save</button>';
      m.foot.querySelector('[data-x2]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-go]').onclick = function () {
        var name = m.body.querySelector('#tcN').value.trim(), track = m.body.querySelector('#tcL').value, b = this;
        var err = m.foot.querySelector('#tcE');
        if (!name) { err.textContent = 'Give the class a name.'; return; }
        if (track !== c.track && !isAdmin && S.items.some(function (x) { return x.createdBy !== me.uid; })) { err.textContent = 'Another coach has lessons in this class, so only an admin can change its level.'; return; }
        if (track !== c.track && !confirm('Move “' + c.name + '” to ' + trackName(track) + '? Builders on the old level stop seeing it, and only ' + trackName(track) + ' builders get its new lessons.')) return;
        b.disabled = true;
        var bt = db.batch(), now = FV().serverTimestamp();
        var cu = { name: name, track: track, updatedAt: now };
        if (track !== c.track) cu.order = nextOrder(track); /* the end of its new level */
        bt.update(COURSES().doc(c.id), cu);
        if (track !== c.track) {
          S.topics.forEach(function (t) { bt.update(TOPICS().doc(t.id), { track: track, updatedAt: now }); });
          S.items.forEach(function (l) { bt.update(LESSONS().doc(l.id), { track: track, updatedAt: now }); });
        }
        bt.commit().then(function () { m.close(); if (track !== c.track) { S.track = track; note('Moved to ' + trackName(track) + '.'); } }).catch(function (e) { b.disabled = false; err.textContent = T.errMsg(e); });
      };
    }
    /* Every draft lesson of the class goes out at once. Builders and families get one bell and one email for the lot. */
    function postClass() {
      var drafts = inOrder(S.topics, S.items.filter(function (x) { return x.status !== 'published'; }));
      var mine = drafts.filter(canEdit), empty = mine.filter(function (x) { return !videosOf(x).length && !x.notes && !(x.files || []).length && !x.questionCount && !x.task && !x.instructions; });
      if (!drafts.length) { note('Everything in this class is already posted.'); return; }
      if (!mine.length) { note('These drafts were made by another coach, so only they or an admin can post them.', true); return; }
      if (empty.length) { note('Some drafts are still empty (no video, notes, file, quiz or practice). Fill them in or delete them first.', true); return; }
      var skipped = drafts.length - mine.length;
      if (!confirm('Post ' + mine.length + ' lesson' + (mine.length === 1 ? '' : 's') + ' in “' + S.course.name + '” to every ' + trackName(S.course.track) + ' builder and their parents? They get one bell and one email for the whole class.' + (skipped ? ' (' + skipped + ' made by another coach stay as drafts.)' : ''))) return;
      var bt = db.batch(), now = FV().serverTimestamp(), batchId = Date.now().toString(36) + shortId();
      mine.forEach(function (x) {
        var up = { status: 'published', updatedAt: now, classPost: batchId, classPostCount: mine.length };
        if (!x.publishedAt) up.publishedAt = now;
        bt.update(LESSONS().doc(x.id), up);
      });
      bt.commit().then(function () { note('Posted ' + mine.length + ' lesson' + (mine.length === 1 ? '' : 's') + '. Builders on this level and their parents are being told once.'); }).catch(fail);
    }
    /* Admin: open this class for one builder, at any level. */
    function openFor() {
      var c = S.course, m = CU.openModal({ title: 'Open “' + c.name + '” for a builder', wide: true });
      var builders = (o.students || []).filter(function (s) { return s.status !== 'Rejected'; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      function what() { return 'the whole class'; }
      function who(id) { var s = builders.filter(function (x) { return x.id === id; })[0]; return s ? s.name + ' · ' + (T.SKILL_LABEL[s.skillLevel] || 'No level') : 'A builder'; }
      m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.7rem">Opens this class for one builder, whatever their level and wherever they are in the order. They see it with the rest of their classes, marked “Opened for you”. Passing it still unlocks the class after it as usual.</div>' +
        '<div class="cr-row2"><div class="cr-field"><label for="tcOB">Builder</label><select id="tcOB"><option value="">Choose a builder…</option>' + builders.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name || s.email || s.id) + ' · ' + esc(T.SKILL_LABEL[s.skillLevel] || 'No level') + (onTrack(c, T.trackOf(s.skillLevel)) ? '' : ' (another level)') + '</option>'; }).join('') + '</select></div>' +
        '<div></div></div>' +
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
          var uid = m.body.querySelector('#tcOB').value, v = 'all';
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
        videosOf(l).concat(l.video ? [l.video] : []).forEach(function (v) { if (v.path) dropStored(v.path); });
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
      else if (a === 'post-class') postClass();
      else if (a === 'class-up' || a === 'class-down') swap(COURSES(), ladderOf(S.track), id, a === 'class-up' ? -1 : 1);
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
      works: {}, access: {}, extra: {}, lessons: null, passes: {}, unlocks: {}, progLoaded: false, workLoaded: false, seenLessons: null, ready: [], vi: 0, vw: {}, poked: {}, later: {} };
    var unsubs = [], courseUnsubs = [], dead = false, tracks = T.tracksFor(student.skillLevel);
    var fail = function (e) { console.warn('tech classes:', e); };
    var query = function (q, fn, onErr) { return q.onSnapshot(function (s) { if (!dead) fn(s); }, function (e) { fail(e); if (onErr && !dead) onErr(e); }); };
    function ready() { return S.courses !== null && S.lessons !== null && S.progLoaded && S.workLoaded; }
    /* Something changed that can open or close a padlock. */
    function changed() {
      if (S.screen !== 'lesson') paint(); else refreshLessonBits();
      claimFloat();
      if (ready()) { var q = S.ready; S.ready = []; q.forEach(function (fn) { fn(); }); }
      afterData();
    }
    function whenReady(fn) { if (ready()) fn(); else S.ready.push(fn); }

    /* The classes of my level, in the order they are learnt: Level 1, 2, 3… */
    unsubs.push(query(COURSES().where('track', 'in', tracks), function (s) { S.courses = docs(s).sort(byCourse); changed(); }, function () { S.courses = S.courses || []; changed(); }));
    /* Every posted lesson of those classes: a class is passed when all of its lessons are finished. */
    unsubs.push(query(LESSONS().where('track', 'in', tracks).where('status', '==', 'published'), function (s) { S.lessons = docs(s); changed(); }, function () { S.lessons = S.lessons || []; changed(); }));
    unsubs.push(query(db.collection('techLessonProgress').where('studentId', '==', student.id), function (s) {
      S.progress = {}; s.docs.forEach(function (d) { S.progress[d.data().lessonId] = d.data(); });
      S.progLoaded = true; changed();
    }, function () { S.progLoaded = true; changed(); }));
    /* Hand-ins count towards finishing a lesson. */
    unsubs.push(query(db.collection('techLessonWork').where('studentId', '==', student.id), function (s) {
      S.works = {}; s.docs.forEach(function (d) { S.works[d.data().lessonId] = d.data(); });
      S.workLoaded = true; changed();
    }, function () { S.workLoaded = true; changed(); }));
    /* Classes the server recorded as passed stay passed when new lessons are added to them. */
    unsubs.push(query(db.collection('techCourseProgress').where('studentId', '==', student.id), function (s) {
      S.passes = {}; s.docs.forEach(function (d) { if (d.data().passedAt) S.passes[d.data().courseId] = d.data(); });
      changed();
    }));
    /* Unlock presses: the next class opens when the builder presses Unlock on a passed class. */
    unsubs.push(query(db.collection('techUnlocks').where('studentId', '==', student.id), function (s) {
      S.unlocks = {}; s.docs.forEach(function (d) { S.unlocks[d.data().courseId] = d.data(); });
      changed();
    }));
    /* Classes an admin opened for this builder, at any level. */
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
    /* Opened by an admin from another level: always open, not one of my numbered levels. */
    function extraCourses() {
      return Object.keys(S.extra).map(function (id) { return S.extra[id]; }).filter(function (c) {
        return c && accessFor(c.id) && !(S.courses || []).some(function (x) { return x.id === c.id; });
      }).map(function (c) { return Object.assign({ opened: true }, c); });
    }
    function allCourses() { return (S.courses || []).concat(extraCourses()); }
    function lessonState(l) { return gateSteps(l, S.progress[l.id], S.works[l.id]); }
    function passedLesson(l) { return lessonState(l).passed; }
    function lessonsOf(cid) { return (S.lessons || []).filter(function (l) { return l.courseId === cid; }); }
    /* Lessons open in order: the first unfinished lesson before this one, which keeps it locked.
       Work already finished or handed in stays open (corrections, and builders who went ahead before locks). */
    function lockedBy(l) {
      if (!isBuilder || !l || passedLesson(l) || handedIn(S.works[l.id])) return null;
      var all = orderedItems(), i = all.findIndex(function (x) { return x.id === l.id; });
      for (var k = 0; k < i; k++) if (!passedLesson(all[k])) return all[k];
      return null;
    }
    function lockedToast(l) {
      var b = lockedBy(l); if (!b) return false;
      toast('Finish “' + nameOf(b) + '” first. Each lesson builds on the one before it.');
      return true;
    }
    function courseCount(c) { var ls = lessonsOf(c.id); return { done: ls.filter(passedLesson).length, all: ls.length }; }
    /* A class is passed when it has lessons and every one is finished (or the server already passed it). */
    function coursePassed(c) { if (S.passes[c.id]) return true; var ls = lessonsOf(c.id); return ls.length > 0 && ls.every(passedLesson); }
    /* Level 1 is open; each class after it opens when the builder unlocks it from the class before (passed,
       then Unlock pressed), or an admin opened it. */
    function ladder() {
      var list = S.courses || [], out = {};
      list.forEach(function (c, i) {
        out[c.id] = { n: i + 1, passed: coursePassed(c), open: i === 0 || !!accessFor(c.id) || !!S.unlocks[list[i - 1].id], prev: list[i - 1] || null, next: list[i + 1] || null };
      });
      extraCourses().forEach(function (c) { out[c.id] = { n: 0, passed: coursePassed(c), open: true, prev: null, next: null }; });
      return out;
    }
    function lockedNote(c) {
      var L = ladder()[c.id];
      toast(L && L.prev ? 'Level ' + L.n + ', ' + c.name + ', is locked. ' + (isBuilder ? 'Finish' : first + ' needs to finish') + ' every lesson in Level ' + (L.n - 1) + ', ' + L.prev.name + ', to unlock it.' : 'This class is locked for now.');
    }
    /* A class ready to unlock its next one: 'ready' (the server confirmed the pass), 'checking' or ''. */
    function claimState(c) {
      var L = ladder()[c.id];
      if (!isBuilder || !L || !L.passed || !L.next || S.unlocks[c.id]) return '';
      if (S.passes[c.id]) return 'ready';
      /* Finished here but not recorded yet (or finished before levels existed): ask the server to look. */
      if (!S.poked[c.id]) { S.poked[c.id] = 1; var any = lessonsOf(c.id)[0]; if (any) touch(any, {}); }
      return 'checking';
    }
    function claimable() { return (S.courses || []).filter(function (c) { return claimState(c); }); }
    function claimHtml(c, float) {
      var L = ladder()[c.id], st = claimState(c); if (!st) return '';
      return '<div class="tc-claim' + (float ? ' float' : '') + '" role="status"><span class="big" aria-hidden="true">🎉</span><div class="t"><b>You finished every lesson in ' + esc(c.name) + '!</b><small>Level ' + (L.n + 1) + ', ' + esc(L.next.name) + ', is waiting for you.</small></div>' +
        (st === 'ready' ? '<button type="button" class="tc-btn gold tc-pulse" data-tc="unlock" data-id="' + esc(c.id) + '"><i class="fas fa-lock-open"></i> Unlock Level ' + (L.n + 1) + '</button>' : '<span class="tc-pill"><i class="fas fa-spinner fa-spin"></i> Checking your work…</span>') +
        (float ? '<button type="button" class="tc-btn light sm" data-tc="later" data-id="' + esc(c.id) + '">Later</button>' : '') + '</div>';
    }
    /* Over the practice pop-up the banner floats, so the builder sees it the moment the work goes in. */
    var floatEl = null;
    function claimFloat() {
      var c = S.pop ? claimable().filter(function (x) { return !S.later[x.id]; })[0] : null;
      if (!c) { if (floatEl) { floatEl.remove(); floatEl = null; } return; }
      if (!floatEl) { floatEl = document.createElement('div'); document.body.appendChild(floatEl); floatEl.addEventListener('click', onClick); }
      floatEl.innerHTML = claimHtml(c, true);
    }
    function unlock(cid, btn) {
      var c = (S.courses || []).filter(function (x) { return x.id === cid; })[0], L = c && ladder()[cid];
      if (!c || !L || !L.next) return;
      if (btn) btn.disabled = true;
      db.collection('techUnlocks').doc(student.id + '_' + cid).set({ studentId: student.id, courseId: cid, nextCourseId: L.next.id, at: FV().serverTimestamp() }).then(function () {
        S.unlocks[cid] = { courseId: cid };
        var next = L.next;
        claimFloat(); if (S.screen !== 'lesson') paint(); else refreshLessonBits();
        T.logActivity(me, 'level_unlocked', 'Unlocked Level ' + (L.n + 1) + ': ' + next.name, { origin: 'class' });
        celebrate({ emoji: '🎉', badge: 'Level ' + (L.n + 1) + ' unlocked', title: 'Hooray! You passed Level ' + L.n + ': ' + c.name + '!',
          line: 'Level ' + (L.n + 1) + ', ' + next.name + ', is open now, and your family has been told. Keep going!',
          shout: 'Hooray! Well done ' + first + '! Level ' + (L.n + 1) + ' unlocked!',
          go: ['Start ' + next.name, function () { closePractice(); openCourse(next); }], stay: 'Stay here' });
      }).catch(function (e) { if (btn) btn.disabled = false; toast('Could not unlock it yet: ' + T.errMsg(e)); });
    }
    /* A finished lesson gets a small note while the builder works; nothing fires on its own when pages open. */
    function afterData() {
      if (!isBuilder || !ready()) return;
      if (!S.seenLessons) { S.seenLessons = {}; (S.lessons || []).forEach(function (l) { if (passedLesson(l)) S.seenLessons[l.id] = 1; }); return; }
      var fresh = (S.lessons || []).filter(function (l) { return passedLesson(l) && !S.seenLessons[l.id]; });
      fresh.forEach(function (l) { S.seenLessons[l.id] = 1; });
      if (!fresh.length || S.screen !== 'lesson') return;
      var l = fresh[fresh.length - 1], cc = (S.courses || []).filter(function (x) { return x.id === l.courseId; })[0];
      if (!cc) return;
      var k = courseCount(cc), left = k.all - k.done;
      if (left) toast('Lesson finished ✓ ' + k.done + ' of ' + k.all + ' done in ' + cc.name + '. ' + (left === 1 ? 'One more' : left + ' more') + ' to finish the class.');
    }
    unsubs.push(query(db.collection('techNotifications').where('recipientId', '==', me.uid).where('read', '==', false).limit(300), function (s) {
      S.unread = docs(s).filter(function (n) { return n.lessonId && (!n.studentId || n.studentId === student.id); });
      if (S.screen !== 'lesson') paint();
    }));
    db.collection('techAttempts').where('studentId', '==', student.id).orderBy('at', 'desc').limit(15).get().then(function (s) { S.attempts = docs(s); if (!dead && S.screen === 'home') paint(); }).catch(function (e) { S.attempts = []; fail(e); });

    function clearCourse() { courseUnsubs.forEach(function (u) { u(); }); courseUnsubs = []; S.topics = []; S.items = []; }
    function openCourse(c, thenLesson) {
      var L0 = ready() ? ladder()[c.id] : null;
      if (L0 && !L0.open) { lockedNote(c); if (S.screen !== 'home') goHome(); return; }
      clearCourse();
      S.course = c; S.screen = 'course'; S.lesson = null; S.loading = 2;
      paint();
      var done = function () {
        S.loading = Math.max(0, S.loading - 1);
        if (S.loading) return;
        if (thenLesson) {
          var want = thenLesson; thenLesson = null;
          var l = S.items.filter(function (x) { return x.id === want; })[0];
          if (l && lockedToast(l)) l = null;
          if (l) {
            openLesson(l);
            /* "Make corrections" from Results goes straight to the practice tool. */
            if (o.practise && isBuilder && l.task) openPractice(l);
            return;
          }
        }
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
    function progHtml(k, word) {
      if (!k.all) return '';
      return '<span class="tc-prog" title="' + k.done + ' of ' + k.all + ' ' + word + '"><span class="bar" aria-hidden="true"><i style="width:' + Math.round(k.done / k.all * 100) + '%"></i></span>' + k.done + '/' + k.all + ' ' + word + '</span>';
    }
    function paintHome() {
      if (!ready()) { host.innerHTML = '<div class="tc-empty">Loading classes…</div>'; return; }
      var lad = ladder();
      var intro = isBuilder ? 'Your classes at ' + trackName(track) + ' level, in order. Finish every lesson in a class to unlock the next one.' : first + '’s classes at ' + trackName(track) + ' level, in order. Each one unlocks when ' + first + ' finishes the one before. You can watch and read everything open; only ' + first + ' can take the quizzes.';
      var h = '<div class="tc-hbar"><h3>' + (isBuilder ? 'My classes' : esc(first) + '’s classes') + '</h3><div class="sub">' + levelBadge(track) + '<span>' + esc(intro) + '</span></div></div>';
      var list = allCourses();
      h += claimable().map(function (c) { return claimHtml(c); }).join('');
      h += list.length ? '<div class="tc-grid">' + list.map(function (c) {
        var L = lad[c.id], n = unreadFor('courseId', c.id), k = courseCount(c);
        var ic = '<span class="ic"><i class="fas ' + (L.open ? (ICON[c.discipline] || 'fa-chalkboard') : 'fa-lock') + '"></i></span>';
        var lv = L.n ? '<span class="lv">Level ' + L.n + (L.passed ? ' · Passed' : '') + '</span>' : '';
        if (!L.open) return '<button type="button" class="tc-card locked" data-tc="course-locked" data-id="' + esc(c.id) + '" aria-label="Level ' + L.n + ', ' + esc(c.name) + ', locked"><i class="fas fa-lock lockmark" aria-hidden="true"></i>' + ic + lv + '<b>' + esc(c.name) + '</b><small>Pass Level ' + (L.n - 1) + ' to unlock</small></button>';
        return '<button type="button" class="tc-card' + (L.passed ? ' passed' : '') + '" data-tc="course" data-id="' + esc(c.id) + '">' + (n ? '<span class="tc-bub" aria-label="' + n + ' new">' + n + '</span>' : '') +
          (L.passed ? '<i class="fas fa-circle-check lockmark" style="color:#2EB872" aria-label="Passed"></i>' : '') + ic + lv + '<b>' + esc(c.name) + '</b><small>' + esc(T.disciplineLabel(c.discipline)) + '</small>' +
          (k.all ? '<span style="display:block;margin-top:.45rem">' + progHtml(k, 'lessons') + '</span>' : '') +
          (c.opened ? '<span class="opened"><i class="fas fa-lock-open"></i> Opened for ' + (isBuilder ? 'you' : esc(first)) + ' · ' + esc(trackName(c.track)) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="tc-empty">No classes have been posted for this level yet. New lessons appear here, with a bell and an email.</div>';
      if ((S.attempts || []).length) {
        h += '<div class="tc-panel" style="margin-top:1.2rem"><h3>' + (isBuilder ? 'My latest results' : 'Latest results') + '</h3>' + S.attempts.map(function (a) {
          return '<div class="tc-file"><i class="fas ' + (a.kind === 'test' ? 'fa-clipboard-question' : 'fa-circle-question') + '"></i><span class="nm">' + esc(a.title) + ' <small style="color:var(--muted,#5A6E6A);font-weight:600">· ' + esc(a.courseName || '') + ' · ' + esc(fmtDay(a.at)) + '</small></span>' + scorePill(a) + '</div>';
        }).join('') + '</div>';
      }
      host.innerHTML = h;
    }
    function itemState(l) {
      var p = S.progress[l.id], st = lessonState(l), out = '';
      if (unreadFor('lessonId', l.id)) out += '<span class="tc-pill new">New</span>';
      if (p && p.bestPercent != null) out += '<span class="tc-pill ' + scoreClass(p.bestPercent) + '">Best ' + p.bestPercent + '%</span>';
      if (st.passed) out += '<span class="tc-pill good"><i class="fas fa-check"></i> Finished</span>';
      else { var d = st.steps.filter(function (s) { return s.done; }).length; if (d) out += '<span class="tc-pill">' + d + '/' + st.steps.length + ' steps</span>'; }
      return out;
    }
    function nameOf(l) { return labelsFor(S.items.filter(function (x) { return x.topicId === l.topicId; }))[l.id] || l.title || 'Lesson'; }
    function isDone(l) { return passedLesson(l); }
    /* "To finish this lesson: watch, quiz, hand in", ticked as they go, and what the class still needs. */
    function stepsHtml(l) {
      var st = lessonState(l), c = S.course, L = ladder()[c.id] || {}, k = courseCount(c), left = k.all - k.done;
      var after = L.next ? (S.unlocks[c.id] ? '<span class="tc-step done"><i class="fas fa-lock-open"></i> Level ' + (L.n + 1) + ', ' + esc(L.next.name) + ', is open</span>'
        : '<span class="tc-step"><i class="fas fa-lock" aria-hidden="true"></i> ' + left + ' lesson' + (left === 1 ? '' : 's') + ' left to unlock ' + esc(L.next.name) + '</span>') : '';
      if (st.passed && claimState(c)) return '<div id="tcSteps">' + claimHtml(c) + '</div>';
      if (st.passed) return '<div class="tc-steps passed" id="tcSteps"><span class="ok"><i class="fas fa-circle-check"></i> Lesson finished</span>' + after + '</div>';
      return '<div class="tc-steps" id="tcSteps"><b>To finish this lesson</b>' + st.steps.map(function (s) {
        return '<span class="tc-step' + (s.done ? ' done' : '') + '"><i class="fas ' + (s.done ? 'fa-circle-check' : 'fa-circle') + '" aria-hidden="true"></i>' + esc(s.label) + (s.done ? '<span class="tc-sr"> (done)</span>' : '') + '</span>';
      }).join('') + after + '</div>';
    }
    function navHtml(l) {
      var all = orderedItems(), i = all.findIndex(function (x) { return x.id === l.id; }), prev = all[i - 1], next = all[i + 1];
      return '<div class="tc-nav" id="tcNav">' + (prev ? '<button type="button" class="tc-btn light" data-tc="lesson" data-id="' + esc(prev.id) + '"><i class="fas fa-arrow-left"></i> Previous</button>' : '<span></span>') +
        (next && lockedBy(next) ? '<button type="button" class="tc-btn light" data-tc="lesson-locked" data-id="' + esc(next.id) + '" title="Finish this ' + wordOf(l) + ' to open the next one"><i class="fas fa-lock"></i> Next ' + (next.type === 'test' ? 'practice test' : 'lesson') + ' opens when you finish this one</button>'
          : next ? '<button type="button" class="tc-btn" data-tc="lesson" data-id="' + esc(next.id) + '">Next ' + (next.type === 'test' ? 'practice test' : 'lesson') + ' <i class="fas fa-arrow-right"></i></button>' : '<button type="button" class="tc-btn light" data-tc="back">Back to the class</button>') + '</div>';
    }
    function refreshLessonBits() {
      if (S.screen !== 'lesson' || !S.lesson) return;
      var l = S.lesson, el;
      if ((el = host.querySelector('#tcSteps'))) el.outerHTML = stepsHtml(l);
      if ((el = host.querySelector('.tc-lside'))) el.outerHTML = sideList(l);
      if ((el = host.querySelector('#tcNav'))) el.outerHTML = navHtml(l);
    }
    function crumb(extra) { return '<div class="tc-crumb"><button type="button" data-tc="home">Classes</button>' + extra + '</div>'; }
    function paintCourse() {
      var c = S.course;
      if (S.loading) { host.innerHTML = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') + '<div class="tc-empty">Loading…</div>'; return; }
      var all = orderedItems(), L = ladder()[c.id] || {}, k = courseCount(c), left = k.all - k.done;
      var nums = {}; all.forEach(function (x, n) { nums[x.id] = n < 9 ? '0' + (n + 1) : String(n + 1); });
      var h = crumb(' <i class="fas fa-chevron-right" style="font-size:.6rem"></i> <span>' + esc(c.name) + '</span>') +
        '<div class="tc-hbar"><h3>' + (L.n ? '<span style="color:var(--brand,#55BFB3)">Level ' + L.n + ' · </span>' : '') + esc(c.name) + '</h3><div class="sub">' + levelBadge(c.track) + '<span>' + esc(T.disciplineLabel(c.discipline)) + '</span>' +
        progHtml(k, 'lessons finished') + (L.passed ? '<span class="tc-pill good"><i class="fas fa-check"></i> Passed</span>' : '') + '</div></div>';
      if (L.next && ready() && claimState(c)) h += claimHtml(c);
      else if (L.next && ready()) h += S.unlocks[c.id]
        ? '<div class="tc-steps passed"><span class="ok"><i class="fas fa-lock-open"></i> Level ' + (L.n + 1) + ', ' + esc(L.next.name) + ', is open</span><button type="button" class="tc-btn sm" data-tc="course" data-id="' + esc(L.next.id) + '">Go to ' + esc(L.next.name) + ' <i class="fas fa-arrow-right"></i></button></div>'
        : '<div class="tc-steps"><span class="tc-step"><i class="fas fa-lock" aria-hidden="true"></i> ' + (isBuilder ? 'Finish' : esc(first) + ' needs to finish') + ' every lesson here to unlock Level ' + (L.n + 1) + ', ' + esc(L.next.name) + (k.all ? ' (' + left + ' to go)' : '') + '.</span></div>';
      var shown = 0;
      S.topics.forEach(function (t) {
        var ls = S.items.filter(function (l) { return l.topicId === t.id; });
        if (!ls.length) return;
        shown++;
        var names = labelsFor(ls);
        h += '<div class="tc-topic"><div class="tc-topic-head">' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</div>' + ls.map(function (l) {
          var bits = []; if (l.type === 'test') bits.push('Practice test'); var nv = videosOf(l).length; if (nv) bits.push(nv === 1 ? 'Video' : nv + ' videos'); if (l.notes) bits.push('Notes'); if (l.task) bits.push(g.TechWork && g.TechWork.kindOf(l.task) === 'writing' ? 'Write it' : 'Code it'); if (l.questionCount) bits.push(l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's'));
          var fin = passedLesson(l), lk = lockedBy(l);
          if (lk) return '<button type="button" class="tc-row locked" data-tc="lesson-locked" data-id="' + esc(l.id) + '" aria-label="' + esc(names[l.id]) + ', locked"><span class="n"><i class="fas fa-lock" aria-hidden="true"></i></span><span class="t"><b>' + esc(names[l.id]) + '</b><small>Finish “' + esc(nameOf(lk)) + '” to open it</small></span><i class="fas fa-lock" style="font-size:.7rem;opacity:.45" aria-hidden="true"></i></button>';
          return '<button type="button" class="tc-row' + (fin ? ' passed' : '') + '" data-tc="lesson" data-id="' + esc(l.id) + '"><span class="n">' + (fin ? '<i class="fas fa-circle-check" title="Finished"></i>' : (nums[l.id] || '')) + '</span><span class="t"><b>' + esc(names[l.id]) + '</b>' + (bits.length ? '<small>' + esc(bits.join(' · ')) + '</small>' : '') + '</span>' + itemState(l) + '<i class="fas fa-chevron-right" style="font-size:.7rem;opacity:.5"></i></button>';
        }).join('') + '</div>';
      });
      if (!shown) h += '<div class="tc-empty">Nothing has been posted in this class yet.</div>';
      host.innerHTML = h;
    }
    /* The player for the lesson's videos: one at a time, with a strip to move between them. */
    function stageHtml(l) { return videosOf(l).length ? '<section id="tcVids" aria-label="Videos">' + vidStage(l) + '</section><div id="tcVBar">' + vidBar(l) + '</div>' : ''; }
    function vidStage(l) {
      var vs = videosOf(l), i = Math.min(S.vi, vs.length - 1), url = T.safeUrl(vs[i].url), title = vs[i].title || l.title || 'Video';
      var inner = g.FastVideo.embed(url) ? g.FastVideo.embedHtml(url, { title: title }) :
        g.FastVideo.videoHtml(url, { attrs: 'controls playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture data-tc-video' });
      return '<div class="tc-stage" data-tc-stage>' + inner + '</div>';
    }
    function watchedSet(l) {
      var p = S.progress[l.id] || {}, out = Object.assign({}, p.watchedVideos || {}, S.vw[l.id] || {});
      if (p.watchedAt) videosOf(l).forEach(function (v, n) { out[n] = true; });
      return out;
    }
    function vidBar(l) {
      var vs = videosOf(l); if (vs.length < 2) return '';
      var i = Math.min(S.vi, vs.length - 1), seen = watchedSet(l), v = vs[i];
      return '<div class="tc-vbar"><div class="t"><span class="k">Video ' + (i + 1) + ' of ' + vs.length + '</span><b>' + esc(v.title || 'Video ' + (i + 1)) + '</b></div>' +
        '<div class="tc-vchips" role="group" aria-label="Videos">' + vs.map(function (x, n) {
          return '<button type="button" class="tc-vchip' + (n === i ? ' on' : '') + (seen[n] ? ' done' : '') + '" data-tc="vid" data-n="' + n + '" title="' + esc(x.title || 'Video ' + (n + 1)) + '" aria-label="Video ' + (n + 1) + (seen[n] ? ', watched' : '') + '"' + (n === i ? ' aria-current="true"' : '') + '>' + (seen[n] && n !== i ? '<i class="fas fa-check"></i>' : n + 1) + '</button>';
        }).join('') + '</div><div class="acts">' +
        (i > 0 ? '<button type="button" class="tc-btn light sm" data-tc="vid" data-n="' + (i - 1) + '"><i class="fas fa-arrow-left"></i> Previous</button>' : '') +
        (i < vs.length - 1 ? '<button type="button" class="tc-btn sm' + (seen[i] ? ' tc-pulse' : '') + '" data-tc="vid" data-n="' + (i + 1) + '">Next video <i class="fas fa-arrow-right"></i></button>' : '') +
        '</div></div>';
    }
    function showVideo(n) {
      var l = S.lesson; if (!l) return;
      var box = host.querySelector('#tcVids'); if (!box) return;
      box.querySelectorAll('video').forEach(function (v) { try { g.FastVideo.release(v); } catch (e) { } });
      S.vi = n; box.innerHTML = vidStage(l);
      var bar = host.querySelector('#tcVBar'); if (bar) bar.innerHTML = vidBar(l);
      var top = box.getBoundingClientRect().top; if (top < 0 || top > g.innerHeight * 0.6) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
      var vid = box.querySelector('video'); if (vid) { var pl = vid.play && vid.play(); if (pl && pl.catch) pl.catch(function () { }); }
    }
    /* One video watched: the lesson's watchedAt comes when every one of them is. */
    function markWatched(l, n) {
      if (!isBuilder) return;
      var vs = videosOf(l); if (!vs.length) return;
      (S.vw[l.id] = S.vw[l.id] || {})[n] = true;
      var seen = watchedSet(l), all = vs.every(function (v, k) { return seen[k]; }), p = S.progress[l.id] || {};
      var map = {}; map[n] = true;
      var up = { watchedVideos: map };
      if (all && !p.watchedAt) up.watchedAt = FV().serverTimestamp();
      touch(l, up);
      T.logActivity(me, 'video_watched', 'Watched ' + (vs.length > 1 ? 'video ' + (n + 1) + ' of ' : '') + '“' + nameOf(l) + '”', { origin: 'class' });
      var bar = host.querySelector('#tcVBar'); if (bar) bar.innerHTML = vidBar(l);
    }
    function upNext(l) {
      var vs = videosOf(l), i = S.vi, stage = host.querySelector('#tcVids .tc-stage');
      if (!stage || i >= vs.length - 1 || stage.querySelector('.tc-upnext')) return;
      var nx = vs[i + 1];
      var el = document.createElement('div'); el.className = 'tc-upnext';
      el.innerHTML = '<div><small>Up next</small><b>' + esc(nx.title || 'Video ' + (i + 2)) + '</b></div><button type="button" class="tc-btn gold sm" data-tc="vid" data-n="' + (i + 1) + '"><i class="fas fa-play"></i> Play next</button>';
      stage.appendChild(el);
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
      /* the floating player picks up where the page's video was */
      var from = host.querySelector('#tcVids video'), at = from && !from.ended ? from.currentTime || 0 : 0;
      host.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (e) { } });
      var pop = document.createElement('div');
      pop.className = 'tc-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', 'Practice');
      pop.innerHTML = '<div class="tc-pop-box"><header class="tc-pop-head"><span class="ic"><i class="fas ' + (w ? 'fa-pen-nib' : 'fa-laptop-code') + '"></i></span>' +
        '<div class="t"><b>' + esc(l.topicTitle || S.course.name) + ' · ' + esc(label) + (isBuilder ? '' : ' · ' + esc(first)) + '</b><small>' + esc(S.course.name) + ' · ' + (w ? 'Writing pad' : 'Paisley VS Code') + '</small></div>' +
        (videosOf(l).length ? '<button type="button" class="tc-pop-vid" data-pop="video" hidden><i class="fas fa-circle-play"></i> Show the video</button>' : '') +
        '<button type="button" class="tc-pop-x" data-pop="close" aria-label="Close" title="Close (your work is saved)"><i class="fas fa-xmark"></i></button></header><div class="tc-pop-body"></div></div>';
      document.body.appendChild(pop);
      document.documentElement.style.overflow = 'hidden';
      S.pop = pop; claimFloat();
      S.work = g.TechWork.mountLessonWork(pop.querySelector('.tc-pop-body'), { me: me, student: student, lesson: Object.assign({}, l, { courseName: l.courseName || S.course.name }), label: label, layout: 'pop',
        /* Earlier code practices in this class, nearest first: a new practice carries on from the latest one. */
        carryFrom: (function () { var all = orderedItems(), i = all.findIndex(function (x) { return x.id === l.id; }); return all.slice(0, Math.max(0, i)).filter(function (x) { return x.task && !isWriting(x); }).reverse().map(function (x) { return x.id; }); })() });
      pop.addEventListener('click', function (e) {
        if (e.target.closest('[data-pop="close"]')) closePractice();
        else if (e.target.closest('[data-pop="video"]')) openMini(l, S.vi, 0);
      });
      if (videosOf(l).length) openMini(l, S.vi, at);
      if (isBuilder) T.logActivity(me, 'project_opened', 'Opened the practice for ' + label, { origin: 'class' });
    }
    /* The lesson's video beside the work, like a picture-in-picture: drag it by its bar, pull its corner to
       resize, make it big or small, step through the lesson's videos, or close it (Show the video brings it back). */
    var mini = null, miniPos = null;
    function closeMini() {
      if (!mini) return;
      mini.querySelectorAll('video').forEach(function (v) { try { g.FastVideo.release(v); } catch (e) { } });
      mini.remove(); mini = null;
      var b = S.pop && S.pop.querySelector('[data-pop="video"]'); if (b) b.hidden = false;
    }
    function openMini(l, n, at) {
      closeMini();
      var vs = videosOf(l); if (!vs.length || !S.pop) return;
      n = Math.max(0, Math.min(n || 0, vs.length - 1));
      var v = vs[n], url = T.safeUrl(v.url), title = v.title || (vs.length > 1 ? 'Video ' + (n + 1) : nameOf(l));
      mini = document.createElement('div');
      mini.className = 'tc-mini'; mini.setAttribute('role', 'region'); mini.setAttribute('aria-label', 'Lesson video');
      mini.innerHTML = '<div class="tc-mini-bar" data-mini="drag"><span class="t"><i class="fas fa-grip-vertical" aria-hidden="true"></i>' + (vs.length > 1 ? (n + 1) + '/' + vs.length + ' · ' : '') + esc(title) + '</span>' +
        (vs.length > 1 ? '<button type="button" data-mini="prev" aria-label="Previous video" title="Previous video"' + (n ? '' : ' disabled') + '><i class="fas fa-backward-step"></i></button><button type="button" data-mini="next" aria-label="Next video" title="Next video"' + (n < vs.length - 1 ? '' : ' disabled') + '><i class="fas fa-forward-step"></i></button>' : '') +
        '<button type="button" data-mini="size" aria-label="Make bigger" title="Bigger / smaller"><i class="fas fa-up-right-and-down-left-from-center"></i></button>' +
        '<button type="button" data-mini="close" aria-label="Close the video" title="Close"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="tc-mini-stage">' + (g.FastVideo.embed(url) ? g.FastVideo.embedHtml(url, { title: title }) : g.FastVideo.videoHtml(url, { attrs: 'controls playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture' })) + '</div><span class="tc-mini-grip" data-mini="grip" aria-hidden="true"></span>';
      document.body.appendChild(mini);
      var b = S.pop.querySelector('[data-pop="video"]'); if (b) b.hidden = true;
      if (miniPos) { mini.style.left = miniPos.left + 'px'; mini.style.top = miniPos.top + 'px'; if (miniPos.width) mini.style.width = miniPos.width + 'px'; }
      else { mini.style.left = '22px'; mini.style.top = Math.max(70, g.innerHeight - mini.offsetHeight - 22) + 'px'; }
      keepIn();
      var vid = mini.querySelector('video');
      if (vid) {
        if (at) vid.addEventListener('loadedmetadata', function () { try { vid.currentTime = at; } catch (e) { } }, { once: true });
        var pl = vid.play && vid.play(); if (pl && pl.catch) pl.catch(function () { });
        vid.addEventListener('timeupdate', function () { var key = l.id + ':' + n; if (S.watched !== key && vid.duration && vid.currentTime / vid.duration >= 0.8) { S.watched = key; markWatched(l, n); } });
        vid.addEventListener('ended', function () { if (n < vs.length - 1) openMini(l, n + 1, 0); });
      }
      mini.addEventListener('click', function (e) {
        if (e.target.closest('[data-fv-embed]')) markWatched(l, n);
        var t = e.target.closest('button[data-mini]'); if (!t) return;
        var k = t.dataset.mini;
        if (k === 'close') closeMini();
        else if (k === 'prev') openMini(l, n - 1, 0);
        else if (k === 'next') openMini(l, n + 1, 0);
        else if (k === 'size') { mini.style.width = ''; mini.classList.toggle('big'); if (miniPos) miniPos.width = 0; keepIn(); }
      });
      /* drag by the bar, resize from the corner (pointer events: mouse, pen and touch) */
      mini.addEventListener('pointerdown', function (e) {
        var k = e.target.closest('[data-mini]'); if (!k || (k.dataset.mini !== 'drag' && k.dataset.mini !== 'grip') || e.target.closest('button')) return;
        e.preventDefault();
        var r = mini.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, grip = k.dataset.mini === 'grip';
        mini.classList.add('dragging');
        /* the frame under the pointer would swallow the moves */
        mini.querySelectorAll('iframe,video').forEach(function (x) { x.style.pointerEvents = 'none'; });
        function move(ev) {
          if (grip) { mini.classList.remove('big'); mini.style.width = Math.max(220, Math.min(g.innerWidth - r.left - 8, r.width + ev.clientX - sx)) + 'px'; }
          else { mini.style.left = (r.left + ev.clientX - sx) + 'px'; mini.style.top = (r.top + ev.clientY - sy) + 'px'; }
          keepIn();
        }
        function up() {
          g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
          mini.classList.remove('dragging');
          mini.querySelectorAll('iframe,video').forEach(function (x) { x.style.pointerEvents = ''; });
          var rr = mini.getBoundingClientRect(); miniPos = { left: rr.left, top: rr.top, width: grip ? rr.width : (miniPos && miniPos.width) || 0 };
        }
        g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      });
    }
    function keepIn() {
      if (!mini) return;
      var r = mini.getBoundingClientRect();
      mini.style.left = Math.max(8, Math.min(g.innerWidth - r.width - 8, r.left)) + 'px';
      mini.style.top = Math.max(8, Math.min(g.innerHeight - Math.min(r.height, g.innerHeight - 16) - 8, r.top)) + 'px';
    }
    g.addEventListener('resize', keepIn);
    function closePractice() {
      closeMini();
      if (S.work) { try { S.work.destroy(); } catch (e) { } S.work = null; }
      if (S.pop) { S.pop.remove(); S.pop = null; document.documentElement.style.overflow = ''; }
      if (typeof claimFloat === 'function') claimFloat();
    }
    function sideList(l) {
      var ls = S.items.filter(function (x) { return x.topicId === l.topicId; }), names = labelsFor(ls);
      return '<aside class="tc-lside" aria-label="Lessons in this topic"><h4>' + esc(l.topicTitle || 'This topic') + '</h4>' + ls.map(function (x, n) {
        var on = x.id === l.id, done = passedLesson(x);
        if (!on && lockedBy(x)) return '<button type="button" class="tc-sitem locked" data-tc="lesson-locked" data-id="' + esc(x.id) + '" aria-label="' + esc(names[x.id]) + ', locked"><span class="n"><i class="fas fa-lock"></i></span><span class="t">' + esc(names[x.id]) + '<small>Locked</small></span></button>';
        var bits = []; if (videosOf(x).length) bits.push(videosOf(x).length === 1 ? 'Video' : videosOf(x).length + ' videos'); if (x.task) bits.push(isWriting(x) ? 'Writing' : 'Code'); if (x.questionCount) bits.push('Quiz');
        return '<button type="button" class="tc-sitem' + (on ? ' on' : '') + (done ? ' done' : '') + '" data-tc="lesson" data-id="' + esc(x.id) + '"' + (on ? ' aria-current="true"' : '') + '><span class="n">' + (done ? '<i class="fas fa-check"></i>' : (x.type === 'test' ? '<i class="fas fa-clipboard-question"></i>' : n + 1)) + '</span>' +
          '<span class="t">' + esc(names[x.id]) + (bits.length ? '<small>' + esc(bits.join(' · ')) + '</small>' : '') + '</span></button>';
      }).join('') + '<div style="border-top:1px solid var(--line,rgba(38,51,49,.08));margin-top:.5rem;padding-top:.5rem"><button type="button" class="tc-sitem" data-tc="back"><span class="n"><i class="fas fa-arrow-left"></i></span><span class="t">All of ' + esc(S.course.name) + '</span></button></div></aside>';
    }
    function openLesson(l) {
      releaseVideos(); closePractice();
      S.screen = 'lesson'; S.lesson = l; S.vi = 0;
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
      var nvids = videosOf(l).length; if (nvids) meta.push('<span class="tc-pill"><i class="fas fa-circle-play"></i> ' + (nvids === 1 ? 'Video' : nvids + ' videos') + '</span>');
      if (l.task) meta.push('<span class="tc-pill"><i class="fas ' + (isWriting(l) ? 'fa-pen-nib' : 'fa-code') + '"></i> ' + (isWriting(l) ? 'Writing pad' : 'Paisley VS Code') + '</span>');
      if (l.questionCount) meta.push('<span class="tc-pill"><i class="fas fa-circle-question"></i> ' + l.questionCount + ' question' + (l.questionCount === 1 ? '' : 's') + '</span>');
      var nav = navHtml(l), lvN = (ladder()[S.course.id] || {}).n;
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
    function onClick(e) {
      if (e.target.closest('[data-fv-embed]') && S.lesson) markWatched(S.lesson, S.vi);
      var t = e.target.closest('[data-tc]'); if (!t) return;
      var a = t.dataset.tc, id = t.dataset.id;
      if (a === 'unlock') unlock(id, t);
      else if (a === 'later') { S.later[id] = 1; claimFloat(); }
      else if (a === 'vid') showVideo(Number(t.dataset.n));
      else if (a === 'home') goHome();
      else if (a === 'course') { var c = allCourses().filter(function (x) { return x.id === id; })[0]; if (c) openCourse(c); }
      else if (a === 'course-locked') {
        t.classList.remove('tc-shake'); void t.offsetWidth; t.classList.add('tc-shake');
        var lc = allCourses().filter(function (x) { return x.id === id; })[0]; if (lc) lockedNote(lc);
      }
      else if (a === 'back') { releaseVideos(); closePractice(); if (S.pUnsub) { S.pUnsub(); S.pUnsub = null; } S.screen = 'course'; S.lesson = null; paint(); window.scrollTo(0, 0); }
      else if (a === 'practice') openPractice(S.lesson);
      else if (a === 'tab') {
        host.querySelectorAll('[data-tc="tab"]').forEach(function (b) { var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        host.querySelectorAll('[data-tabpane]').forEach(function (p) { p.hidden = p.dataset.tabpane !== t.dataset.v; });
      }
      else if (a === 'lesson') { var l = S.items.filter(function (x) { return x.id === id; })[0]; if (l && !lockedToast(l)) openLesson(l); }
      else if (a === 'lesson-locked') { var ll = S.items.filter(function (x) { return x.id === id; })[0]; if (ll && !lockedToast(ll)) openLesson(ll); }
      else if (a === 'submit') submitQuiz(S.lesson, t);
      else if (a === 'retry') paintQuiz(S.lesson);
      else if (a === 'pdf') {
        var n = t.dataset.n, f = (S.lesson.files || []).filter(function (x) { return T.safeUrl(x.url); })[Number(n)], slot = host.querySelector('[data-pdf="' + n + '"]');
        if (!f || !slot) return;
        slot.innerHTML = slot.innerHTML ? '' : '<iframe class="tc-pdf" src="' + esc(T.safeUrl(f.url)) + '#toolbar=0" title="' + esc(f.name) + '"></iframe>';
      }
    }
    host.addEventListener('click', onClick);
    host.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-tc-stage]')) e.preventDefault(); });
    /* timeupdate does not bubble, so listen on the way down. Four fifths in counts as watched. */
    host.addEventListener('timeupdate', function (e) {
      if (!isBuilder || !S.lesson || !e.target.matches || !e.target.matches('video')) return;
      var v = e.target, key = S.lesson.id + ':' + S.vi;
      if (S.watched !== key && v.duration && v.currentTime / v.duration >= 0.8) { S.watched = key; markWatched(S.lesson, S.vi); }
    }, true);
    /* At the end of one video, offer the next. */
    host.addEventListener('ended', function (e) {
      if (!S.lesson || !e.target.matches || !e.target.matches('video')) return;
      if (S.watched !== S.lesson.id + ':' + S.vi) { S.watched = S.lesson.id + ':' + S.vi; markWatched(S.lesson, S.vi); }
      upNext(S.lesson);
    }, true);
    if (o.lessonId) {
      LESSONS().doc(o.lessonId).get().then(function (d) {
        if (dead || !d.exists) return;
        return COURSES().doc(d.data().courseId).get().then(function (c) { if (!dead && c.exists) whenReady(function () { if (!dead) openCourse(Object.assign({ id: c.id }, c.data()), o.lessonId); }); });
      }).catch(fail);
    }
    paint();
    return { destroy: function () { dead = true; g.removeEventListener('resize', keepIn); releaseVideos(); closePractice(); if (floatEl) { floatEl.remove(); floatEl = null; } if (S.pUnsub) S.pUnsub(); unsubs.forEach(function (u) { u(); }); clearCourse(); } };
  }

  g.TechClasses = { mountManager: mountManager, mountResults: mountResults, mountLearner: mountLearner, style: style, labelsFor: labelsFor, gateOf: gateOf, gateSteps: gateSteps, inOrder: inOrder, celebrate: celebrate };
})(window);
