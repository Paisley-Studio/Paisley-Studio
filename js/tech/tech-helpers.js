/* =========================================================
   Paisley TECH — shared UI + data helpers  (window.TechUI)
   ---------------------------------------------------------
   Used by the TECH builder studio (/tech/dashboard), the TECH coach
   portal (/tech/coach), the TECH guardian portal (/tech/parent) and
   the admin TECH module.

     TechUI.mountWorkspace(host, opts)  one project (assigned mission or SELF-LED student project) from
                                        idea to publication: Mission tab (materials, video, practice,
                                        criteria), Writing Studio / Code IDE / uploads (the project type
                                        picks the one it opens on), Submit with the AI-use reflection
                                        (snapshots in techBuilds/{id}/submissions), coach Review with
                                        grade and criteria, Submissions history, Comments, Publish.
                                        Roles: student, coach, admin, guardian (read-only).
     TechUI.projectState / journeyHtml / missionLock / liveCardHtml / logActivity / activityRows
                                        shared states, the LEARN → … → PUBLISH journey, mission
                                        unlocking, live-class cards and the activity timeline
     TechUI.mountChat(host, opts)       builder <-> coach (techChats) or, with kind:'guardian',
                                        guardian <-> coach (techGuardianChats)
     TechUI.mountBell(host, opts)       TECH-only notification bell (techNotifications)
     TechUI.approveShowcase / removeShowcase(build, user)
     TechUI.mintShareToken(buildId)     create a family-share token

   Needs the global Firestore `db` (firebase-config.js).
   TECH is its own architecture (see functions/tech.js):
     techStudents/{uid}   builder enrolment; coachId / coachName point at the coach
     techCoaches/{uid}    coaches — NOT tutors
     techGuardianLinks    guardian (parentAccounts identity) -> builder
   plus techBuilds (+ /feedback), techContent, techShowcase, techChats, techGuardianChats,
   techProgress, techNotifications, shareTokens.
========================================================= */
(function (g) {
  'use strict';
  var FV = function () { return firebase.firestore.FieldValue; };

  /* ---- Creator levels (must stay in sync with functions/tech.js TECH_LEVELS) ---- */
  var LEVELS = ['DISCOVER', 'MAKE', 'BUILD', 'SOLVE', 'CREATE', 'INVENT', 'STUDIO'];
  var LEVEL_BLURB = {
    DISCOVER: 'Explore concepts and understand the basics.',
    MAKE: 'Create things with guidance.',
    BUILD: 'Independently produce functional creations.',
    SOLVE: 'Apply skills to real-world problems.',
    CREATE: 'Develop original ideas and products.',
    INVENT: 'Combine disciplines to develop new solutions.',
    STUDIO: 'Lead substantial creative projects and publish polished work.'
  };
  /* Legacy labels for old content that still uses "AI Aware..AI Guru". Read-only. */
  var LEGACY_LEVELS = ['AI Aware', 'AI User', 'AI Thinker', 'AI Creator', 'AI Problem Solver', 'AI Builder', 'AI Guru'];

  /* ---- Disciplines (must stay in sync with functions/tech.js TECH_DISCIPLINES) ---- */
  var DISCIPLINES = ['Coding', 'AI', 'Writing', 'Research', 'Design', 'Media', 'Music', 'Entrepreneurship'];

  /* ---- Creation types ---- */
  var CREATION_TYPES = ['CODE', 'DESIGN', 'WRITING', 'RESEARCH', 'MEDIA', 'MUSIC', 'AI', 'BUILD'];
  var CREATION_LABEL = {
    CODE: 'Code', DESIGN: 'Design', WRITING: 'Writing', RESEARCH: 'Research',
    MEDIA: 'Media', MUSIC: 'Music', AI: 'AI', BUILD: 'Build'
  };

  /* ---- Build status flow (unchanged) ---- */
  var STATUSES = ['IDEA', 'LEARNING', 'BUILDING', 'TESTING', 'READY'];
  var STATUS_LABEL = { IDEA: 'Idea', LEARNING: 'Learning', BUILDING: 'Building', TESTING: 'Testing', READY: 'Ready' };

  /* Legacy category labels (kept for backwards compat on old builds). */
  var LEGACY_CATEGORIES = ['AI Assistant', 'Website', 'Game', 'Creative', 'Research', 'Business', 'App', 'Study', 'Other'];
  /* New CATEGORIES is CREATION_TYPES + 'Other' for any old build with a non-matching category. */
  var CATEGORIES = CREATION_TYPES.concat(['Other']);

  /* ---- Visibility states ---- */
  var VISIBILITIES = ['private', 'family', 'public'];
  var VISIBILITY_LABEL = { private: 'Private', family: 'Family share', public: 'Public showcase' };

  /* ---- AI reflection default shape ---- */
  var EMPTY_REFLECTION = { tools: [], purpose: '', changes: '', kept: '', learned: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toDate(ts) { if (!ts) return null; if (typeof ts.toDate === 'function') return ts.toDate(); if (ts.seconds) return new Date(ts.seconds * 1000); var d = new Date(ts); return isNaN(d) ? null : d; }
  function fmt(d) { d = toDate(d); if (!d) return ''; return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function firstName(n) { return String(n || 'A Paisley student').trim().split(/\s+/)[0]; }
  function builderId(uid) { var h = 0; uid = String(uid || ''); for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return 'PS-' + String(10000 + (h % 90000)); }
  function errMsg(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }

  /* Normalize a build's disciplines — accept legacy single 'discipline' too. */
  function disciplinesOf(b) {
    if (!b) return [];
    if (Array.isArray(b.disciplines) && b.disciplines.length) return b.disciplines.filter(function (d) { return DISCIPLINES.indexOf(d) !== -1; });
    if (b.discipline && DISCIPLINES.indexOf(b.discipline) !== -1) return [b.discipline];
    return [];
  }

  /* Resolve level name for a build's level number (1..7). */
  function levelName(n) {
    var i = Math.max(1, Math.min(7, Number(n) || 1)) - 1;
    return LEVELS[i];
  }
  /* Show both new + legacy when an old content item uses AI Aware..AI Guru. */
  function levelLabel(n, legacyHint) {
    var i = Math.max(1, Math.min(7, Number(n) || 1)) - 1;
    return LEVELS[i] + (legacyHint ? ' (was: ' + LEGACY_LEVELS[i] + ')' : '');
  }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.tk-box{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:16px;padding:1.1rem}',
      '.tk-box h3{font-size:1rem;color:var(--brand-deep,#245F5A);margin:0 0 .25rem;font-weight:800}',
      '.tk-sub{font-size:.78rem;color:var(--muted,#5A6E6A);margin-bottom:.8rem}',
      '.tk-empty{padding:1.4rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.88rem}',
      '.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.9rem}',
      '.tk-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:.9rem}',
      '.tk-btn{display:inline-flex;align-items:center;gap:.4rem;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--ink,#263331);border-radius:10px;padding:.5rem .9rem;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer;text-decoration:none;transition:transform .15s,box-shadow .15s}',
      '.tk-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(36,95,90,.12)}',
      '.tk-btn.primary{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.tk-btn.dark{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.tk-btn.danger{color:#b8362a}.tk-btn.sm{padding:.3rem .65rem;font-size:.74rem}',
      '.tk-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}',
      '.tk-f{margin-bottom:.75rem}.tk-f label{display:block;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A);margin-bottom:.3rem}',
      '.tk-f input,.tk-f select,.tk-f textarea,.tk-in{width:100%;padding:.55rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7);color:var(--ink,#263331)}',
      '.tk-f textarea{min-height:90px;resize:vertical}',
      '.tk-f input:focus,.tk-f select:focus,.tk-f textarea:focus,.tk-in:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.tk-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}',
      '.tk-msgline{font-size:.8rem;min-height:1.1rem;margin-top:.4rem;font-weight:700}',
      '.tk-pill{display:inline-block;padding:.18rem .55rem;border-radius:99px;font-size:.66rem;font-weight:800;letter-spacing:.02em;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.tk-pill.ok{background:rgba(46,184,114,.14);color:#1d8b57}.tk-pill.warn{background:rgba(232,163,61,.18);color:#96690f}.tk-pill.bad{background:rgba(231,76,60,.1);color:#b8362a}.tk-pill.gold{background:rgba(245,200,66,.25);color:#7a5c00}',
      '.tk-bar{height:8px;border-radius:99px;background:var(--sage,#E5F2EF);overflow:hidden}.tk-bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand,#55BFB3),var(--brand-deep,#245F5A));transition:width .8s cubic-bezier(.16,1,.3,1)}',
      '.tk-steps{display:flex;gap:.35rem;flex-wrap:wrap;margin:.2rem 0 .8rem}',
      '.tk-step{flex:1;min-width:84px;text-align:center;padding:.5rem .3rem;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.12));font-size:.7rem;font-weight:800;letter-spacing:.04em;color:var(--muted,#5A6E6A);background:var(--surface,#fff);cursor:default;font-family:inherit}',
      '.tk-step.done{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);border-color:transparent}',
      '.tk-step.now{background:var(--brand,#55BFB3);color:#04231f;border-color:var(--brand,#55BFB3);transform:translateY(-2px);box-shadow:0 6px 14px rgba(85,191,179,.35)}',
      '.tk-step.click{cursor:pointer}.tk-step.click:hover{border-color:var(--brand,#55BFB3)}',
      '.tk-list{display:flex;flex-direction:column;gap:.45rem}',
      '.tk-item{display:flex;gap:.7rem;align-items:center;justify-content:space-between;padding:.6rem .75rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;background:var(--surface,#fff);font-size:.86rem}',
      '.tk-item a{color:var(--brand-deep,#245F5A);font-weight:700;word-break:break-word}',
      '.tk-item .meta{font-size:.72rem;color:var(--muted,#5A6E6A)}',
      '.tk-fb{padding:.65rem .8rem;border-radius:12px;background:var(--sage,#E5F2EF);font-size:.86rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
      '.tk-fb.coach{background:rgba(245,200,66,.18)}.tk-fb .who{display:flex;gap:.4rem;align-items:center;font-size:.7rem;font-weight:800;opacity:.8;margin-bottom:.15rem}',
      '.tk-chat{display:flex;flex-direction:column;height:min(70vh,560px);min-height:340px}',
      '.tk-chat-list{flex:1;overflow:auto;padding:.8rem .2rem;display:flex;flex-direction:column;gap:.5rem}',
      '.tk-msg{max-width:78%;padding:.55rem .8rem;border-radius:14px;font-size:.88rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--sage,#E5F2EF);align-self:flex-start;border-bottom-left-radius:4px}',
      '.tk-msg.me{align-self:flex-end;background:var(--brand,#55BFB3);color:#04231f;border-radius:14px;border-bottom-right-radius:4px}',
      '.tk-msg .who{display:block;font-size:.66rem;font-weight:800;opacity:.7;margin-bottom:.15rem}.tk-msg .at{display:block;font-size:.62rem;opacity:.6;margin-top:.2rem;text-align:right}',
      '.tk-chat-form{display:flex;gap:.5rem;padding-top:.7rem;border-top:1px solid var(--line,rgba(38,51,49,.12))}',
      '.tk-chat-form textarea{flex:1;resize:none;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.6rem .75rem;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7)}',
      '.tk-modal{position:fixed;inset:0;background:rgba(15,26,20,.55);display:grid;place-items:center;z-index:9999;padding:1rem}',
      '.tk-modal>div{background:var(--surface,#fff);border-radius:18px;padding:1.3rem;width:min(560px,100%);max-height:90vh;overflow:auto}',
      '.tk-modal h3{margin:0 0 .8rem;color:var(--brand-deep,#245F5A)}',
      '.tk-table{width:100%;border-collapse:collapse;font-size:.84rem}.tk-table th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand-deep,#245F5A);padding:.5rem .6rem;border-bottom:2px solid var(--line,rgba(38,51,49,.12))}',
      '.tk-table td{padding:.6rem;border-bottom:1px solid var(--line,rgba(38,51,49,.08));vertical-align:middle}',
      '.tk-scroll{overflow-x:auto}',
      /* New: workspace tabs (Brief / Writing / Code / Upload / AI reflection) */
      '.tk-tabbar{display:flex;gap:.35rem;flex-wrap:wrap;border-bottom:1.5px solid var(--line,rgba(38,51,49,.12));margin:.8rem 0 .9rem}',
      '.tk-tab{padding:.5rem .9rem;border-radius:10px 10px 0 0;border:1.5px solid transparent;border-bottom:none;background:transparent;color:var(--muted,#5A6E6A);font:inherit;font-weight:800;font-size:.8rem;letter-spacing:.02em;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem}',
      '.tk-tab:hover{color:var(--brand-deep,#245F5A);background:var(--sage,#E5F2EF)}',
      '.tk-tab.on{background:var(--surface,#fff);color:var(--brand-deep,#245F5A);border-color:var(--line,rgba(38,51,49,.12));border-bottom-color:var(--surface,#fff);margin-bottom:-1.5px}',
      '.tk-tab .tk-pill{margin-left:.3rem}',
      '.tk-pane{display:none}.tk-pane.on{display:block}',
      /* New: AI reflection */
      '.tk-ai-box{border:1.5px dashed var(--brand,#55BFB3);border-radius:14px;padding:.9rem 1rem;background:rgba(85,191,179,.04);margin:.8rem 0}',
      '.tk-ai-box h4{margin:0 0 .4rem;color:var(--brand-deep,#245F5A);font-size:.92rem}',
      '.tk-ai-tools{display:flex;flex-wrap:wrap;gap:.35rem;margin:.3rem 0 .6rem}',
      '.tk-ai-tools a,.tk-ai-tools span{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .7rem;border-radius:99px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:.74rem;font-weight:800;text-decoration:none;border:1px solid transparent}',
      '.tk-ai-tools a:hover{border-color:var(--brand,#55BFB3)}',
      '.tk-ai-check{display:flex;gap:.5rem;align-items:flex-start;padding:.35rem .5rem;border-radius:8px;font-size:.82rem;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:600;color:var(--ink,#263331);margin:0}',
      '.tk-ai-check:hover{background:var(--paper,#F1F9F7)}',
      '.tk-ai-check input{margin-top:.2rem}',
      '.tk-ai-field{margin-bottom:.6rem}.tk-ai-field label{display:block;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A);margin-bottom:.25rem}',
      '.tk-ai-field textarea,.tk-ai-field input{width:100%;padding:.5rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.85rem;background:var(--paper,#F1F9F7);color:var(--ink,#263331)}',
      '.tk-ai-field textarea{min-height:56px;resize:vertical}',
      /* New: Writing Studio (lightweight; the WritingStudio module owns the editor) */
      '.tk-ws-host{border-radius:14px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);min-height:320px;padding:.8rem}',
      /* New: Code Lab host */
      '.tk-cl-host{display:flex;flex-direction:column;gap:.6rem}',
      /* New: Upload Pad host */
      '.tk-up-host{border-radius:14px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);padding:.8rem;min-height:200px}',
      /* Mastery / visibility controls */
      '.tk-mastery{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}',
      '.tk-vis{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}',
      '.tk-vis-pill{padding:.3rem .7rem;border-radius:99px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--ink,#263331);font:inherit;font-weight:800;font-size:.74rem;cursor:pointer}',
      '.tk-vis-pill.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.tk-vis-pill:disabled{opacity:.5;cursor:not-allowed}',
      /* Journey, origin labels, banners */
      '.tk-origin{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border-radius:6px;font-size:.64rem;font-weight:800;letter-spacing:.08em;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.tk-origin.self{background:#FFF4D6;color:#7a5c00;border:1px solid rgba(245,200,66,.6)}.tk-origin.sm{font-size:.56rem;padding:.1rem .4rem}',
      '.tk-journey{list-style:none;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:.9rem 0 .6rem;padding:0}',
      '.tk-journey li span{display:block;height:6px;border-radius:99px;background:var(--sage,#E5F2EF)}.tk-journey li.done span{background:var(--brand-soft,#7BCBC2)}.tk-journey li.now span{background:var(--brand-deep,#245F5A)}',
      '.tk-journey li b{display:block;margin-top:.35rem;font-size:.62rem;font-weight:800;letter-spacing:.03em;color:var(--muted,#5A6E6A);text-transform:uppercase}.tk-journey li.now b{color:var(--brand-deep,#245F5A)}',
      '.tk-banner{display:flex;gap:.8rem;align-items:center;padding:.85rem 1rem;border-radius:14px;margin-bottom:.9rem;font-size:.88rem}.tk-banner>i{font-size:1.1rem}.tk-banner>div{flex:1;min-width:0}',
      '.tk-banner.bad{background:rgba(231,76,60,.08);border:1px solid rgba(231,76,60,.25);color:#7d241b}.tk-banner.warn{background:rgba(245,200,66,.16);border:1px solid rgba(245,200,66,.45);color:#5c4500}',
      '.tk-h4{margin:.8rem 0 .35rem;font-size:.74rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--brand-deep,#245F5A)}',
      '.tk-prose{white-space:pre-wrap;line-height:1.6;font-size:.9rem}.tk-crit{margin:.3rem 0 0 1.1rem;font-size:.86rem;line-height:1.6}.tk-crit li{margin-bottom:.2rem}',
      /* Study materials */
      '.tk-mats{display:flex;flex-direction:column;gap:.6rem}.tk-mat{border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.7rem .8rem;background:var(--surface,#fff)}',
      '.tk-mat-h{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}.tk-mat-h b{flex-basis:100%;margin-top:.25rem;color:var(--brand-deep,#245F5A)}',
      '.tk-video{position:relative;padding-top:56.25%;border-radius:10px;overflow:hidden;background:#0d1a18;margin-top:.5rem}.tk-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}',
      '.tk-video-el{width:100%;max-height:420px;border-radius:10px;background:#0d1a18;margin-top:.5rem}.tk-mat-img{max-width:100%;max-height:280px;border-radius:10px;margin-top:.5rem;display:block}',
      /* Live classes */
      '.tk-live{display:flex;gap:1rem;align-items:center;padding:.9rem 1rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:14px;background:var(--surface,#fff)}',
      '.tk-live.live{border-color:#E74C3C;box-shadow:0 0 0 3px rgba(231,76,60,.12)}.tk-live.cancelled,.tk-live.completed{opacity:.7}',
      '.tk-live.banner{background:linear-gradient(120deg,#FFF8E1,#E5F2EF);border-color:rgba(245,200,66,.6)}',
      '.tk-live-when{flex:none;width:74px;text-align:center;padding:.5rem .3rem;border-radius:12px;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}.tk-live-when b{display:block;font-size:.78rem}.tk-live-when span{display:block;font-size:1.05rem;font-weight:800}',
      '.tk-live-body{flex:1;min-width:0}.tk-live-body h4{margin:.25rem 0 .1rem;font-size:1rem;color:var(--brand-deep,#245F5A)}.tk-live-act{display:flex;flex-direction:column;gap:.4rem;align-items:flex-end}',
      /* Activity timeline */
      '.tk-act{list-style:none;margin:0;padding:0}.tk-act li{display:flex;gap:.7rem;padding:.55rem 0;border-bottom:1px solid var(--line,rgba(38,51,49,.06))}',
      '.tk-act li>i{width:30px;height:30px;flex:none;border-radius:9px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:.8rem}',
      '.tk-act b{font-size:.86rem;color:var(--ink,#263331)}.tk-act span{display:block;font-size:.74rem;color:var(--muted,#5A6E6A)}',
      /* Submissions */
      '.tk-snap{border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.7rem .9rem;margin-bottom:.6rem;background:var(--surface,#fff)}.tk-snap>summary{cursor:pointer;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;font-size:.88rem}',
      '.tk-article{border:1px solid var(--line,rgba(38,51,49,.08));border-radius:10px;padding:.8rem 1rem;line-height:1.65;max-height:520px;overflow:auto}.tk-article img{max-width:100%}',
      '.tk-code{background:#0f1f1d;color:#d9f2ee;border-radius:10px;padding:.7rem;font-size:.78rem;overflow:auto;max-height:360px}',
      '.tk-run{width:100%;height:380px;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:10px;margin:.5rem 0;background:#fff}',
      '@media(max-width:560px){.tk-msg{max-width:92%}.tk-step{min-width:60px;font-size:.62rem}.tk-tab{font-size:.72rem;padding:.45rem .7rem}.tk-journey li b{display:none}.tk-journey li.now b{display:block;white-space:nowrap}.tk-live{flex-wrap:wrap}.tk-live-act{align-items:flex-start}}',
      '@media(prefers-reduced-motion:reduce){.tk-bar>i,.tk-btn,.tk-step{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* =========================================================
     Journey, states and labels shared by every TECH portal
     LEARN → PRACTICE → BUILD → SUBMIT → COACH REVIEW → REVISE → MASTER → PUBLISH
     ========================================================= */
  var JOURNEY = ['LEARN', 'PRACTICE', 'BUILD', 'SUBMIT', 'REVIEW', 'REVISE', 'MASTER', 'PUBLISH'];
  var STATE_LABEL = {
    not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', under_review: 'Under review',
    revision: 'Revision required', approved: 'Approved', mastered: 'Mastered'
  };
  var STATE_CLASS = { not_started: '', in_progress: '', submitted: 'warn', under_review: 'warn', revision: 'bad', approved: 'ok', mastered: 'ok' };
  var GRADES = ['Exceeding', 'Meeting', 'Approaching', 'Beginning'];
  var SELF_LED_LABEL = 'SELF-LED • STUDENT PROJECT';
  var MISSION_LABEL = 'ASSIGNED MISSION';
  var MATERIAL_TYPES = { video: 'Video', document: 'Document', image: 'Image', link: 'Link', example: 'Example' };

  /* One state per project, used by the builder, coach, admin and guardian views alike. */
  function projectState(b) {
    if (!b) return 'not_started';
    if (b.mastery === 'approved') return 'mastered';
    if (b.reviewState === 'approved') return 'approved';
    if (b.reviewState === 'changes' || b.mastery === 'changes') return 'revision';
    if (b.reviewState === 'reviewing') return 'under_review';
    if (b.reviewState === 'requested') return 'submitted';
    return 'in_progress';
  }
  function statePill(b, cls) {
    var st = typeof b === 'string' ? b : projectState(b);
    return '<span class="' + (cls || 'tk-pill') + ' ' + (STATE_CLASS[st] || '') + '">' + esc(STATE_LABEL[st] || st) + '</span>';
  }
  function isSelfLed(b) { return !!b && !b.missionId && !b.challengeId; }
  function originLabel(b) { return isSelfLed(b) ? SELF_LED_LABEL : (b && b.challengeId ? 'ASSIGNED CHALLENGE' : MISSION_LABEL); }
  function originTag(b) {
    return '<span class="tk-origin' + (isSelfLed(b) ? ' self' : '') + '"><i class="fas ' + (isSelfLed(b) ? 'fa-lightbulb' : 'fa-bullseye') + '"></i> ' + esc(originLabel(b)) + '</span>';
  }
  /* The workspace a project type opens in. Every tool stays available for mixed projects. */
  var WORKSPACE_FOR = { CODE: 'code', WRITING: 'writing', RESEARCH: 'writing', DESIGN: 'upload', MEDIA: 'upload', MUSIC: 'upload', AI: 'writing', BUILD: 'code' };
  var WORKSPACE_NAME = { code: 'Code IDE', writing: 'Writing Studio', upload: 'Media & uploads', brief: 'Project notes' };
  function workspaceFor(category) { return WORKSPACE_FOR[category] || 'brief'; }

  function hasArtifact(x) {
    return !!x && ((x.writingHtml && String(x.writingHtml).replace(/<[^>]+>/g, '').trim().length > 0) ||
      (Array.isArray(x.codeFiles) && x.codeFiles.some(function (f) { return f && String(f.content || '').trim().length > 0; })) ||
      (Array.isArray(x.files) && x.files.length > 0) || !!safeUrl(x.workUrl) || String(x.workText || '').trim().length > 20);
  }
  function requiredMaterials(m) { return ((m && m.materials) || []).filter(function (x) { return x && x.required; }); }
  /* Where a project is on the journey: { step: index of the current step, done: { STEP: bool } } */
  function journeyOf(b, mission) {
    var req = requiredMaterials(mission), seen = (b && b.materialsSeen) || [];
    var done = {
      LEARN: !!b && (!req.length || req.every(function (x) { return seen.indexOf(x.id) !== -1; })),
      PRACTICE: !!b && (!(mission && (mission.practice || []).length) || ((b.practiceIds || []).length > 0)),
      BUILD: hasArtifact(b),
      SUBMIT: !!b && (Number(b.submissionCount) || 0) > 0,
      REVIEW: !!b && !!b.reviewedAt,
      REVISE: !!b && (b.reviewState === 'approved' || b.mastery === 'approved' || ((Number(b.submissionCount) || 0) > 1 && b.reviewState !== 'changes')),
      MASTER: !!b && b.mastery === 'approved',
      PUBLISH: !!b && b.showcase === 'approved'
    };
    if (b && b.reviewState === 'changes') done.REVISE = false;
    var step = JOURNEY.length - 1;
    for (var i = 0; i < JOURNEY.length; i++) {
      var k = JOURNEY[i];
      if (k === 'REVISE' && !(b && (b.reviewState === 'changes' || (Number(b.submissionCount) || 0) > 1))) { done.REVISE = done.REVIEW; continue; }
      if (!done[k]) { step = i; break; }
    }
    if (b && b.reviewState === 'requested') step = JOURNEY.indexOf('REVIEW');
    if (b && b.reviewState === 'changes') step = JOURNEY.indexOf('REVISE');
    return { step: step, done: done };
  }
  function journeyHtml(b, mission) {
    var j = journeyOf(b, mission);
    return '<ol class="tk-journey" aria-label="Learning journey">' + JOURNEY.map(function (k, i) {
      var cls = i === j.step ? 'now' : (j.done[k] || i < j.step ? 'done' : '');
      return '<li class="' + cls + '"' + (i === j.step ? ' aria-current="step"' : '') + '><span></span><b>' + (k === 'REVIEW' ? 'Coach review' : k.charAt(0) + k.slice(1).toLowerCase()) + '</b></li>';
    }).join('') + '</ol>';
  }
  /* Missions unlock by level in their discipline, and optionally after another mission is mastered. */
  function missionLock(m, levels, builds) {
    if (!m) return '';
    var discs = Array.isArray(m.disciplines) && m.disciplines.length ? m.disciplines : (m.discipline ? [m.discipline] : []);
    var need = Number(m.level) || 0;
    if (need > 1 && discs.length) {
      var best = Math.max.apply(null, discs.map(function (d) { return (levels && levels[d]) || 1; }));
      if (best < need) return 'Unlocks at ' + LEVELS[need - 1] + ' in ' + discs.join(' or ') + '.';
    }
    if (m.prereqId && !(builds || []).some(function (x) { return x.missionId === m.prereqId && x.mastery === 'approved'; })) return 'Master the earlier mission first.';
    var from = toDate(m.availableFrom);
    if (from && from > new Date()) return 'Opens ' + fmt(from) + '.';
    return '';
  }
  function missionFor(m, uid) { return !!m && (m.audience !== 'selected' || (m.studentIds || []).indexOf(uid) !== -1); }

  /* Study materials: uploaded videos play inline, YouTube / Vimeo links embed, documents open. */
  function videoEmbed(url) {
    var y = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(url || '');
    if (y) return 'https://www.youtube-nocookie.com/embed/' + y[1];
    var v = /vimeo\.com\/(\d+)/i.exec(url || '');
    if (v) return 'https://player.vimeo.com/video/' + v[1];
    return '';
  }
  function materialHtml(x, opts) {
    opts = opts || {};
    var url = safeUrl(x.url), type = x.type || 'link', id = esc(x.id || '');
    var head = '<div class="tk-mat-h"><span class="tk-pill ' + (x.required ? 'warn' : '') + '">' + (x.required ? 'Required' : 'Recommended') + '</span> <span class="tk-pill">' + esc(MATERIAL_TYPES[type] || 'Resource') + '</span>' +
      (opts.seen ? ' <span class="tk-pill ok">Done</span>' : '') + '<b>' + esc(x.title || 'Material') + '</b></div>' +
      (x.description ? '<p class="tk-sub" style="margin:.3rem 0">' + esc(x.description) + '</p>' : '');
    var body = '';
    if (type === 'video' && url) {
      var emb = videoEmbed(url);
      body = emb
        ? '<div class="tk-video"><iframe src="' + esc(emb) + '" title="' + esc(x.title || 'Video') + '" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" data-mat="' + id + '"></iframe></div>' +
          '<button type="button" class="tk-btn sm" data-matdone="' + id + '" style="margin-top:.4rem"><i class="fas fa-check"></i> I watched this</button>'
        : '<video class="tk-video-el" controls preload="metadata" src="' + esc(url) + '" data-mat="' + id + '"></video>';
    } else if (type === 'image' && url) {
      body = '<a href="' + esc(url) + '" target="_blank" rel="noopener" data-mat="' + id + '"><img class="tk-mat-img" src="' + esc(url) + '" alt="' + esc(x.title || '') + '" loading="lazy"></a>';
    } else if (url) {
      body = '<a class="tk-btn sm" href="' + esc(url) + '" target="_blank" rel="noopener" data-mat="' + id + '"><i class="fas ' + (type === 'document' ? 'fa-file-lines' : 'fa-arrow-up-right-from-square') + '"></i> Open</a>';
    }
    return '<div class="tk-mat">' + head + body + (x.notes ? '<div class="tk-fb" style="margin-top:.5rem">' + esc(x.notes) + '</div>' : '') + '</div>';
  }
  function materialsHtml(m, seen) {
    var list = ((m && m.materials) || []).slice().sort(function (a, b) { return (b.required ? 1 : 0) - (a.required ? 1 : 0); });
    if (!list.length) return '';
    return '<div class="tk-mats">' + list.map(function (x) { return materialHtml(x, { seen: (seen || []).indexOf(x.id) !== -1 }); }).join('') + '</div>';
  }

  /* Live classes */
  function liveState(c) {
    if (!c) return '';
    if (c.status === 'cancelled') return 'cancelled';
    if (c.status === 'completed') return 'completed';
    var s = toDate(c.startAt); if (!s) return 'upcoming';
    var end = s.getTime() + (Number(c.durationMins) || 60) * 60000, now = Date.now();
    if (now >= s.getTime() - 10 * 60000 && now <= end) return 'live';
    return now > end ? 'completed' : 'upcoming';
  }
  var LIVE_LABEL = { upcoming: 'Upcoming', live: 'Live now', completed: 'Completed', cancelled: 'Cancelled' };
  function liveCardHtml(c, opts) {
    opts = opts || {};
    var st = liveState(c), url = safeUrl(c.meetUrl), s = toDate(c.startAt);
    var canJoin = url && (st === 'live' || (st === 'upcoming' && s && s.getTime() - Date.now() < 60 * 60000));
    return '<div class="tk-live ' + st + (opts.banner ? ' banner' : '') + '">' +
      '<div class="tk-live-when"><b>' + (s ? esc(s.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })) : '') + '</b><span>' + (s ? esc(s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '') + '</span></div>' +
      '<div class="tk-live-body"><div><span class="tk-pill ' + (st === 'live' ? 'bad' : st === 'cancelled' ? 'bad' : st === 'completed' ? '' : 'ok') + '">' + esc(LIVE_LABEL[st] || st) + '</span>' + (c.durationMins ? ' <span class="tk-sub" style="margin:0">' + esc(c.durationMins) + ' min</span>' : '') + '</div>' +
        '<h4>' + esc(c.topic || 'Live class') + '</h4>' +
        (c.learn ? '<p class="tk-sub" style="margin:.1rem 0">You will learn: ' + esc(c.learn) + '</p>' : '') +
        (c.description && !opts.banner ? '<p class="tk-sub" style="margin:.1rem 0">' + esc(c.description) + '</p>' : '') +
        '<p class="tk-sub" style="margin:.1rem 0"><i class="fas fa-chalkboard-user"></i> ' + esc(c.coachName || 'Paisley TECH') + '</p></div>' +
      '<div class="tk-live-act">' + (st === 'cancelled' || st === 'completed' ? '' :
        (canJoin ? '<a class="tk-btn primary" href="' + esc(url) + '" target="_blank" rel="noopener" data-joinlive="' + esc(c.id || '') + '"><i class="fas fa-video"></i> Join class</a>'
          : (url ? '<span class="tk-sub" style="margin:0">Join opens an hour before</span>' : '<span class="tk-sub" style="margin:0">Link coming soon</span>'))) +
        (opts.manage ? '<button type="button" class="tk-btn sm" data-editlive="' + esc(c.id || '') + '"><i class="fas fa-pen"></i> Edit</button>' : '') + '</div></div>';
  }
  /* Upcoming / live classes first, soonest first; recent past ones after. */
  function sortLive(list) {
    return (list || []).slice().sort(function (a, b) {
      var ra = /live|upcoming/.test(liveState(a)) ? 0 : 1, rb = /live|upcoming/.test(liveState(b)) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      var ta = (toDate(a.startAt) || 0) - 0, tb = (toDate(b.startAt) || 0) - 0;
      return ra === 0 ? ta - tb : tb - ta;
    });
  }

  /* Activity timeline. Builders record their own events; techStudents.lastActiveAt is
     their "last seen". Writes are throttled so a busy session is a handful of events. */
  var actSeen = {}, lastTouch = 0;
  function logActivity(me, type, label, extra) {
    if (!me || me.role !== 'student' || !me.uid) return Promise.resolve();
    var x = extra || {}, key = type + '|' + (x.buildId || x.practiceId || x.materialId || x.missionId || '');
    var throttle = { project_opened: 30, project_saved: 10, practice_saved: 10, session: 60, material_opened: 60, feedback_viewed: 120 }[type];
    if (throttle && actSeen[key] && Date.now() - actSeen[key] < throttle * 60000) return Promise.resolve();
    actSeen[key] = Date.now();
    var doc = { studentId: me.uid, studentName: me.name || '', type: type, label: String(label || '').slice(0, 200), at: FV().serverTimestamp() };
    ['buildId', 'missionId', 'practiceId', 'materialId', 'origin'].forEach(function (k) { if (x[k]) doc[k] = String(x[k]); });
    touchActive(me);
    return db.collection('techActivity').add(doc).catch(function (e) { console.warn('activity:', e && e.message); });
  }
  function touchActive(me) {
    if (!me || me.role !== 'student' || Date.now() - lastTouch < 2 * 60000) return;
    lastTouch = Date.now();
    db.collection('techStudents').doc(me.uid).update({ lastActiveAt: FV().serverTimestamp() }).catch(function () { });
  }
  var ACT_ICON = {
    session: 'fa-right-to-bracket', project_created: 'fa-plus', project_opened: 'fa-folder-open', project_saved: 'fa-floppy-disk',
    mission_started: 'fa-bullseye', material_opened: 'fa-book-open', video_watched: 'fa-circle-play', practice_saved: 'fa-flask',
    practice_done: 'fa-flask-vial', help_requested: 'fa-hand', submitted: 'fa-paper-plane', resubmitted: 'fa-rotate',
    feedback_viewed: 'fa-eye', live_joined: 'fa-video', under_review: 'fa-magnifying-glass', approved: 'fa-check',
    revision_requested: 'fa-pen-to-square', mastered: 'fa-award', level_unlocked: 'fa-unlock', published: 'fa-globe', unpublished: 'fa-eye-slash'
  };
  function activityRows(list) {
    if (!list.length) return '<div class="tk-empty">No activity recorded yet.</div>';
    return '<ol class="tk-act">' + list.map(function (a) {
      return '<li><i class="fas ' + (ACT_ICON[a.type] || 'fa-circle') + '"></i><div><b>' + esc(a.label || a.type) + '</b>' +
        (a.origin === 'self' ? ' <span class="tk-origin self sm">SELF-LED</span>' : '') +
        '<span>' + esc(a.studentName ? a.studentName + ' · ' : '') + esc(fmt(a.at)) + '</span></div></li>';
    }).join('') + '</ol>';
  }
  function ago(ts) {
    var d = toDate(ts); if (!d) return 'Never';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 2) return 'Just now'; if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    var dd = Math.round(h / 24); return dd < 14 ? dd + ' day' + (dd === 1 ? '' : 's') + ' ago' : d.toLocaleDateString();
  }
  function lastSeen(s) {
    var a = toDate(s && s.lastActiveAt), l = toDate(s && s.lastLoginAt);
    return (a && l) ? (a > l ? s.lastActiveAt : s.lastLoginAt) : (s && (s.lastActiveAt || s.lastLoginAt));
  }

  /* HTML a builder wrote, made safe to show (Writing Studio's allowlist sanitizer). */
  function cleanHtml(html) {
    if (g.WritingStudio && g.WritingStudio.sanitizeHtml) return g.WritingStudio.sanitizeHtml(html);
    return esc(String(html || '').replace(/<[^>]+>/g, ' '));
  }

  /* =========================================================
     Publishing (public showcase, /tech/p/{buildId})
     Only a coach or admin publishes, and only approved work. The
     showcase doc carries what the public page needs (first name only,
     the work itself), never the builder's email, surname or files list.
     ========================================================= */
  function showcaseSnapshot(b) {
    var files = (b.files || []).filter(function (f) { return safeUrl(f.url); });
    var isType = function (re) { return function (f) { return re.test(f.type || '') || re.test(f.name || f.url || ''); }; };
    var images = files.filter(isType(/image\/|\.(png|jpe?g|gif|webp)(\?|$)/i)).slice(0, 12).map(function (f) { return { url: f.url, name: f.name || '' }; });
    var media = files.filter(isType(/video\/|audio\/|\.(mp4|webm|mov|mp3|wav|m4a|ogg)(\?|$)/i)).slice(0, 6).map(function (f) { return { url: f.url, name: f.name || '', type: f.type || '' }; });
    var code = (b.codeFiles || []).filter(function (f) { return f && String(f.content || '').trim(); });
    var codeSize = 0;
    code = code.filter(function (f) { codeSize += String(f.content).length; return codeSize < 400000; }).map(function (f) { return { name: f.name, lang: f.lang || '', content: String(f.content) }; });
    var r = b.aiReflection || {};
    return {
      buildId: b.id, title: b.title || 'Untitled project',
      description: String(b.brief || '').slice(0, 1200),
      displayName: firstName(b.displayName || b.studentName),
      category: b.category || 'Other', disciplines: disciplinesOf(b), skills: (b.skills || []).slice(0, 8),
      origin: isSelfLed(b) ? 'self' : 'mission',
      writingHtml: cleanHtml(b.writingHtml || '').slice(0, 300000),
      workText: String(b.workText || '').slice(0, 4000),
      codeFiles: code, codeActive: b.codeActive || '',
      images: images, media: media,
      toolsUsed: (r.tools || []).slice(0, 12),
      contribution: String(r.contribution || r.kept || '').slice(0, 800),
      reflection: { purpose: String(r.purpose || '').slice(0, 600), learned: String(r.learned || '').slice(0, 600) },
      coverUrl: images[0] ? images[0].url : '',
      previewUrl: safeUrl(b.workUrl)
    };
  }
  async function approveShowcase(b, user, consent) {
    var snap = showcaseSnapshot(b);
    await db.collection('techShowcase').doc(b.id).set(Object.assign(snap, {
      featured: false, approvedBy: user.uid, approvedByName: user.name || '', publishConsent: !!consent, approvedAt: FV().serverTimestamp()
    }));
    await db.collection('techBuilds').doc(b.id).update({
      showcase: 'approved', visibility: 'public', publishedAt: FV().serverTimestamp(), publishedBy: user.uid,
      publishConsent: !!consent, updatedAt: FV().serverTimestamp()
    });
  }
  async function removeShowcase(b) {
    await db.collection('techShowcase').doc(b.id).delete();
    await db.collection('techBuilds').doc(b.id).update({ showcase: 'none', visibility: 'private', updatedAt: FV().serverTimestamp() });
  }
  function shareUrl(id) { return location.origin + '/tech/p/' + encodeURIComponent(id); }
  /* Family-share token minting — used by the visibility UI. Coaches + admin only (rules enforced). */
  async function mintShareToken(buildId) {
    var bytes = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var token = btoa(String.fromCharCode.apply(null, Array.from(bytes)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await db.collection('shareTokens').doc(buildId).set({
      token: token, createdBy: (firebase.auth().currentUser || {}).uid || 'unknown',
      revoked: false, createdAt: FV().serverTimestamp()
    }, { merge: true });
    return token;
  }

  /* =========================================================
     Chat
       builder <-> coach   techChats/{studentId}_{coachId}
       guardian <-> coach  techGuardianChats/{parentUid}_{studentId}  (o.kind === 'guardian')
     o: { kind, studentId, studentName, coachId, coachName, parentUid, parentName,
          me: { uid, role: 'student'|'coach'|'guardian'|'admin', name }, readOnly }
     ========================================================= */
  function mountChat(host, o) {
    injectStyle();
    var guardian = o.kind === 'guardian', role = o.me.role;
    var chatId = guardian ? o.parentUid + '_' + o.studentId : o.studentId + '_' + o.coachId;
    var ref = db.collection(guardian ? 'techGuardianChats' : 'techChats').doc(chatId);
    var base = guardian
      ? { parentUid: o.parentUid, parentName: o.parentName || '', studentId: o.studentId, studentName: o.studentName || '', coachId: o.coachId || '', coachName: o.coachName || '' }
      : { studentId: o.studentId, studentName: o.studentName || '', coachId: o.coachId, coachName: o.coachName || '' };
    var other, sub;
    if (guardian) {
      other = role === 'guardian' ? (o.coachName || 'Paisley TECH') : (o.parentName || 'Guardian');
      sub = role === 'guardian' ? (o.coachId ? (o.studentName ? o.studentName.split(' ')[0] + '’s TECH coach' : 'TECH coach') : 'The Studio Desk will answer until a coach is assigned') : ('Family of ' + (o.studentName || 'a builder'));
    } else {
      other = role === 'student' ? (o.coachName || 'Your coach') : (o.studentName || 'Builder');
      sub = role === 'student' ? 'Your TECH coach' : 'TECH builder';
    }
    host.innerHTML = '<div class="tk-box tk-chat"><div style="padding-bottom:.7rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))"><b>' + esc(other) + '</b><div class="tk-sub" style="margin:0">' + esc(sub) + (o.readOnly ? ' · read-only' : '') + '</div></div>' +
      '<div class="tk-chat-list" id="tkList"><div class="tk-empty">Loading messages…</div></div>' +
      (o.readOnly ? '' : '<div class="tk-chat-form"><textarea id="tkText" rows="1" maxlength="3000" placeholder="Write a message…"></textarea><button class="tk-btn primary" id="tkSend" type="button" aria-label="Send"><i class="fas fa-paper-plane"></i></button></div>') + '</div>';
    var list = host.querySelector('#tkList'), unsub = null, dead = false;
    function render(docs) {
      if (!docs.length) { list.innerHTML = '<div class="tk-empty">No messages yet. Say hello 👋</div>'; return; }
      list.innerHTML = docs.map(function (m) { var mine = m.senderId === o.me.uid; return '<div class="tk-msg' + (mine ? ' me' : '') + '"><span class="who">' + esc(mine ? 'You' : (m.senderName || m.senderRole || '')) + '</span>' + esc(m.text) + '<span class="at">' + esc(fmt(m.createdAt)) + '</span></div>'; }).join('');
      list.scrollTop = list.scrollHeight;
    }
    async function ensure() {
      try { var s = await ref.get(); if (s.exists) return true; } catch (e) { }
      if (o.readOnly) return false;
      try { await ref.set(Object.assign({}, base, { lastMessage: '', lastSenderRole: '', lastAt: FV().serverTimestamp(), createdAt: FV().serverTimestamp() })); return true; }
      catch (e) { list.innerHTML = '<div class="tk-empty">Chat is not available yet: ' + esc(errMsg(e)) + '</div>'; return false; }
    }
    ensure().then(function (ok) {
      if (!ok || dead) { if (!ok && o.readOnly) list.innerHTML = '<div class="tk-empty">No conversation yet.</div>'; return; }
      unsub = ref.collection('messages').orderBy('createdAt').limitToLast(300).onSnapshot(function (s) { render(s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })); },
        function (e) { list.innerHTML = '<div class="tk-empty">Could not load messages: ' + esc(errMsg(e)) + '</div>'; });
    });
    if (!o.readOnly) {
      var ta = host.querySelector('#tkText'), btn = host.querySelector('#tkSend'), busy = false;
      var send = async function () {
        var text = ta.value.trim(); if (!text || busy) return; busy = true; btn.disabled = true;
        try {
          await ref.collection('messages').add({ senderId: o.me.uid, senderRole: role, senderName: o.me.name || '', text: text.slice(0, 3000), createdAt: FV().serverTimestamp() });
          ta.value = ''; ref.update({ lastMessage: text.slice(0, 120), lastSenderRole: role, lastAt: FV().serverTimestamp() }).catch(function () { });
        } catch (e) { alert('Could not send: ' + errMsg(e)); }
        busy = false; btn.disabled = false; ta.focus();
      };
      btn.addEventListener('click', send);
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    }
    return { destroy: function () { dead = true; if (unsub) unsub(); } };
  }

  /* =========================================================
     Workspace — one project (an assigned mission or a SELF-LED
     student project), the same doc from first idea to publication.

     Tabs:  Mission (learn + practise first, when it came from a mission)
            Overview · Writing Studio · Code IDE · Media & uploads
            Submit (builder) / Review (coach, admin) / Status (guardian)
            Submissions (every submitted version, with its outcome)
            Comments
     The project type picks the tab it opens on (CODE → Code IDE,
     WRITING / RESEARCH → Writing Studio, DESIGN / MEDIA / MUSIC →
     uploads); every tool stays available for mixed projects.

     o: { id, me: { uid, role: student|coach|admin|guardian, name },
          mission, tab, onDeleted(), onPractice(activity, mission, build) }
     Writing Studio, Code Lab and Upload Pad come from js/tech/*.js.
     ========================================================= */
  function mountWorkspace(host, o) {
    injectStyle();
    var ref = db.collection('techBuilds').doc(o.id), me = o.me, role = me.role;
    var isStu = role === 'student', canEdit = isStu || role === 'admin', canReview = role === 'coach' || role === 'admin';
    var mission = o.mission || null;
    var b = null, fbList = [], subs = [], unsubs = [], rendered = false, dead = false, opened = false;
    var activeTab = null, stale = false;
    var MODULE_TABS = ['writing', 'code', 'upload'];
    /* While a builder is typing in a tool, live updates wait until they leave it. */
    function canRepaint() { return !editing() && MODULE_TABS.indexOf(activeTab) === -1; }
    function repaint() { if (!rendered || canRepaint()) { stale = false; render(); } else { stale = true; renderFb(); } }
    var mounted = { writing: null, code: null, upload: null };

    function editing() { var a = document.activeElement; return a && host.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); }
    function say(t, bad) { var m = host.querySelector('#wsMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#b8362a' : 'var(--brand-deep,#245F5A)'; } }
    function act(type, label, extra) { return logActivity(me, type, label, Object.assign({ buildId: b && b.id, missionId: b && b.missionId, origin: isSelfLed(b) ? 'self' : 'mission' }, extra || {})); }
    /* quiet: the tab modules (Writing / Code / Upload) save without a full re-render, so typing never loses the cursor. */
    async function patch(p, okMsg, quiet) {
      try {
        p.updatedAt = FV().serverTimestamp();
        await ref.update(p);
        Object.keys(p).forEach(function (k) { if (k !== 'updatedAt') b[k] = p[k]; });
        if (!quiet) render();
        if (okMsg) say(okMsg);
        if (isStu) act('project_saved', 'Saved ' + (b.title || 'a project'));
      } catch (e) { say('Could not save: ' + errMsg(e), true); throw e; }
    }
    function moduleSave(okMsg) { return function (p) { return patch(p, okMsg, true); }; }

    function reflectionOf(x) { return Object.assign({ contribution: '' }, EMPTY_REFLECTION, (x && x.aiReflection) || {}); }
    function latestCoachFb() { for (var i = fbList.length - 1; i >= 0; i--) if (fbList[i].role !== 'student') return fbList[i]; return null; }
    function primaryTab() { return workspaceFor(b.category || b.creationType); }

    /* ---------- tab modules ---------- */
    function mountModule(kind, hostEl) {
      var lib = { writing: g.WritingStudio, code: g.CodeLab, upload: g.UploadPad }[kind];
      var label = { writing: 'Writing Studio', code: 'Code IDE', upload: 'Upload Pad' }[kind];
      if (!hostEl) return;
      if (!lib || !lib.mount) { hostEl.innerHTML = '<div class="tk-empty">' + label + ' is not loaded on this page.</div>'; return; }
      if (mounted[kind]) { try { mounted[kind].destroy(); } catch (e) { } mounted[kind] = null; }
      try {
        mounted[kind] = lib.mount(hostEl, { build: b, me: me, canEdit: canEdit, files: b.files || [], onSave: moduleSave(kind === 'code' ? 'Code saved ✓' : 'Saved ✓') });
      } catch (e) { hostEl.innerHTML = '<div class="tk-empty">' + label + ' could not start: ' + esc(errMsg(e)) + '</div>'; }
    }
    function unmountTabModules() {
      ['writing', 'code', 'upload'].forEach(function (k) { if (mounted[k]) { try { mounted[k].destroy(); } catch (e) { } mounted[k] = null; } });
    }

    /* ---------- panes ---------- */
    function missionPane() {
      var m = mission; if (!m) return '';
      var seen = b.materialsSeen || [];
      var prac = (m.practice || []).map(function (p, i) {
        var done = (b.practiceIds || []).some(function (x) { return String(x).indexOf('m' + i + '_') === 0 || x === ('m' + i); });
        return '<div class="tk-item"><div><b>' + esc(p.title || ('Practice ' + (i + 1))) + '</b>' + (done ? ' <span class="tk-pill ok">Practised</span>' : '') + '<div class="meta">' + esc(p.instructions || '') + '</div></div>' +
          (isStu && o.onPractice ? '<button type="button" class="tk-btn sm" data-practice="' + i + '"><i class="fas fa-flask"></i> Practise</button>' : '') + '</div>';
      }).join('');
      var crit = (m.criteria || []).map(function (c) { return '<li><b>' + esc(c.name || '') + '</b>' + (c.description ? ' — ' + esc(c.description) : '') + '</li>'; }).join('');
      var tools = (m.aiTools || []).map(function (t) { var u = safeUrl(t.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ' + esc(t.name || 'Tool') + '</a>' : '<span>' + esc(t.name || 'Tool') + '</span>'; }).join('');
      var discs = Array.isArray(m.disciplines) ? m.disciplines : [];
      return '<div class="tk-grid2">' +
        '<div class="tk-box"><h3>' + esc(m.title || 'Mission') + '</h3><div class="tk-sub">' +
          [m.level ? LEVELS[Math.max(1, Math.min(7, m.level)) - 1] : '', discs.join(', '), m.deadline ? 'Due ' + m.deadline : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
          (m.summary ? '<p style="margin:.2rem 0 .6rem">' + esc(m.summary) + '</p>' : '') +
          (m.objectives ? '<h4 class="tk-h4">What you will learn</h4><div class="tk-fb">' + esc(m.objectives) + '</div>' : '') +
          (m.body ? '<h4 class="tk-h4">Instructions</h4><div class="tk-prose">' + esc(m.body) + '</div>' : '') +
          (m.brief ? '<h4 class="tk-h4">The task</h4><div class="tk-fb">' + esc(m.brief) + '</div>' : '') +
        '</div>' +
        '<div class="tk-box"><h3>1 · Learn</h3><div class="tk-sub">Study these before you start the main task.' + (requiredMaterials(m).length ? ' Required ones count towards your journey.' : '') + '</div>' +
          (materialsHtml(m, seen) || '<div class="tk-empty">No study materials for this mission.</div>') +
          ((m.resources || []).filter(function (r) { return safeUrl(r.url); }).length ? '<h4 class="tk-h4">More resources</h4><div class="tk-list">' + m.resources.filter(function (r) { return safeUrl(r.url); }).map(function (r) { return '<div class="tk-item"><a href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener"><i class="fas fa-link"></i> ' + esc(r.title || r.url) + '</a></div>'; }).join('') + '</div>' : '') +
        '</div>' +
        '<div class="tk-box"><h3>2 · Practise</h3><div class="tk-sub">Try the skills first. Practice is never graded.</div>' + (prac ? '<div class="tk-list">' + prac + '</div>' : '<div class="tk-empty">No practice activities. Go straight to building.</div>') + '</div>' +
        '<div class="tk-box"><h3>3 · Build and submit</h3>' +
          (m.submissionReq ? '<h4 class="tk-h4">What to submit</h4><div class="tk-fb">' + esc(m.submissionReq) + '</div>' : '<div class="tk-sub">Build it in the ' + esc(WORKSPACE_NAME[primaryTab()]) + ', then submit it with your AI reflection.</div>') +
          (crit ? '<h4 class="tk-h4">How it will be assessed</h4><ul class="tk-crit">' + crit + '</ul>' : '') +
          (tools ? '<h4 class="tk-h4">Approved AI tools</h4><div class="tk-ai-tools">' + tools + '</div>' : '') +
          (m.aiRules ? '<div class="tk-sub">' + esc(m.aiRules) + '</div>' : '') +
          (isStu ? '<button type="button" class="tk-btn primary" data-tabgo="' + primaryTab() + '" style="margin-top:.6rem"><i class="fas fa-hammer"></i> Start building in the ' + esc(WORKSPACE_NAME[primaryTab()]) + '</button>' : '') +
        '</div></div>';
    }

    function overviewPane() {
      var ro = canEdit ? '' : ' readonly';
      var files = (b.files || []).map(function (f, i) { return '<div class="tk-item"><div><a href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener"><i class="fas fa-file"></i> ' + esc(f.name) + '</a><div class="meta">' + (f.size ? Math.round(f.size / 1024) + ' KB' : 'Link') + '</div></div>' + (canEdit ? '<button class="tk-btn sm danger" data-rmfile="' + i + '" type="button" aria-label="Remove file"><i class="fas fa-xmark"></i></button>' : '') + '</div>'; }).join('') || '<div class="tk-empty">No files yet.</div>';
      var res = (b.resources || []).map(function (r, i) { return '<div class="tk-item"><a href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener"><i class="fas fa-link"></i> ' + esc(r.title || r.url) + '</a>' + (canEdit ? '<button class="tk-btn sm danger" data-rmres="' + i + '" type="button" aria-label="Remove"><i class="fas fa-xmark"></i></button>' : '') + '</div>'; }).join('') || '<div class="tk-empty">Nothing saved yet.</div>';
      var vers = (b.versions || []).map(function (v, i) { return '<div class="tk-item"><div><b>v' + (i + 1) + '</b> · ' + esc(v.note || '') + (v.url ? ' · <a href="' + esc(safeUrl(v.url)) + '" target="_blank" rel="noopener">open</a>' : '') + '<div class="meta">' + esc(v.at ? new Date(v.at).toLocaleDateString() : '') + '</div></div></div>'; }).reverse().join('') || '<div class="tk-empty">No versions saved yet.</div>';
      var vis = b.visibility || 'private', fam = '';
      if (b.showcase === 'approved') fam = '<span class="tk-pill gold">Published publicly</span>';
      else {
        fam = '<div class="tk-vis">' + ['private', 'family'].map(function (v) {
          return '<button type="button" class="tk-vis-pill' + (vis === v ? ' on' : '') + '" data-vis="' + v + '"' + (canEdit || canReview ? '' : ' disabled') + '>' + esc(VISIBILITY_LABEL[v]) + '</button>';
        }).join('') + '</div>';
        if (vis === 'family' && b.shareToken) fam += '<p class="tk-sub" style="margin:.5rem 0 .2rem">Family link (share only with people you trust):</p><input class="tk-in" readonly value="' + esc(location.origin + '/tech/b/' + b.id + '?t=' + b.shareToken) + '" onclick="this.select()">' +
          (canEdit || canReview ? '<button class="tk-btn sm danger" id="wsRevokeToken" type="button" style="margin-top:.4rem">Revoke link</button>' : '');
      }
      return '<div class="tk-grid2">' +
        '<div class="tk-box"><h3>Project brief</h3><div class="tk-sub">What am I making, and why?</div><div class="tk-f"><textarea id="wsBrief" maxlength="2000"' + ro + '>' + esc(b.brief) + '</textarea></div>' +
          '<div class="tk-f"><label>Skills used (comma separated)</label><input id="wsSkills" maxlength="200" value="' + esc((b.skills || []).join(', ')) + '"' + ro + '></div></div>' +
        '<div class="tk-box"><h3>My work</h3><div class="tk-sub">What it does and where to see it.</div><div class="tk-f"><textarea id="wsWork" maxlength="3000" placeholder="Describe the current state of your project…"' + ro + '>' + esc(b.workText) + '</textarea></div>' +
          '<div class="tk-f"><label>Link to a live version (optional)</label><input id="wsUrl" maxlength="400" placeholder="https://" value="' + esc(b.workUrl) + '"' + ro + '></div></div>' +
        '<div class="tk-box"><h3>Resources</h3><div class="tk-list">' + res + '</div>' +
          (canEdit ? '<div class="tk-row" style="margin-top:.7rem"><input class="tk-in" id="rsT" placeholder="Title" maxlength="80"><input class="tk-in" id="rsU" placeholder="https://" maxlength="400"><button class="tk-btn sm" id="rsAdd" type="button">Add</button></div>' : '') + '</div>' +
        '<div class="tk-box"><h3>Files</h3><div class="tk-sub">Full media tools are in the Media &amp; uploads tab.</div><div class="tk-list">' + files + '</div>' +
          (canEdit ? '<div style="margin-top:.7rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">' + (firebase.storage ? '<label class="tk-btn sm" style="margin:0"><i class="fas fa-upload"></i> Upload<input type="file" id="flUp" hidden></label>' : '') + '<input class="tk-in" id="flU" placeholder="…or paste a link" style="flex:1;min-width:140px"><button class="tk-btn sm" id="flAdd" type="button">Add link</button></div><div class="tk-sub" id="flSt" style="margin-top:.4rem"></div>' : '') + '</div>' +
        '<div class="tk-box"><h3>Versions</h3><div class="tk-sub">v1, v2, v3: how it has improved.</div><div class="tk-list">' + vers + '</div>' +
          (canEdit ? '<div class="tk-row" style="margin-top:.7rem"><input class="tk-in" id="vN" placeholder="What changed?" maxlength="200"><input class="tk-in" id="vU" placeholder="Link (optional)" maxlength="400"><button class="tk-btn sm" id="vAdd" type="button">Save version</button></div>' : '') + '</div>' +
        '<div class="tk-box"><h3>Who can see it</h3>' + fam + '</div>' +
        '</div>' +
        (canEdit ? '<div style="margin:.9rem 0;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center"><button class="tk-btn dark" id="wsSave" type="button"><i class="fas fa-floppy-disk"></i> Save changes</button>' +
          (b.showcase !== 'approved' ? '<button class="tk-btn danger sm" id="wsDel" type="button"><i class="fas fa-trash"></i> Delete project</button>' : '') + '</div>' : '');
    }

    function reflectionView(r) {
      return (r.tools && r.tools.length ? '<p style="margin:.2rem 0"><b>AI tools:</b> ' + esc(r.tools.join(', ')) + '</p>' : '<p class="tk-sub">No AI tools listed.</p>') +
        (r.purpose ? '<p style="margin:.2rem 0"><b>Used them for:</b> ' + esc(r.purpose) + '</p>' : '') +
        (r.contribution ? '<p style="margin:.2rem 0"><b>Own contribution:</b> ' + esc(r.contribution) + '</p>' : '') +
        (r.changes ? '<p style="margin:.2rem 0"><b>Changed or ignored:</b> ' + esc(r.changes) + '</p>' : '') +
        (r.learned ? '<p style="margin:.2rem 0"><b>Learned:</b> ' + esc(r.learned) + '</p>' : '');
    }
    function gradeLine(x) {
      if (!x || !x.gradeLabel) return '';
      return '<span class="tk-pill gold"><i class="fas fa-star"></i> ' + esc(x.gradeLabel) + (x.gradeScore != null && x.gradeScore !== '' ? ' · ' + esc(x.gradeScore) + '%' : '') + '</span>';
    }
    function publishBlock() {
      var url = shareUrl(b.id), approved = b.reviewState === 'approved' || b.mastery === 'approved';
      if (b.showcase === 'approved') {
        return '<div class="tk-box"><h3>Published</h3><div class="tk-sub">Public at this Paisley Studio link (first name only):</div>' +
          '<div style="display:flex;gap:.4rem"><input class="tk-in" readonly value="' + esc(url) + '" onclick="this.select()"><button type="button" class="tk-btn sm" data-copy="' + esc(url) + '"><i class="fas fa-copy"></i> Copy</button><a class="tk-btn sm" href="' + esc(url) + '" target="_blank" rel="noopener">Open</a></div>' +
          (isStu || canReview ? '<button class="tk-btn sm danger" id="wsUnpublish" type="button" style="margin-top:.5rem">Take it down</button>' : '') + '</div>';
      }
      if (canReview) {
        if (!approved) return '<div class="tk-box"><h3>Publish</h3><div class="tk-sub">Approve the work first. Only approved projects can be published.</div></div>';
        return '<div class="tk-box"><h3>Publish' + (b.showcase === 'requested' ? ' <span class="tk-pill warn">Requested by the builder</span>' : '') + '</h3>' +
          '<div class="tk-sub">Creates a public page at ' + esc(url) + ' with the work and the builder’s first name.</div>' +
          '<label class="tk-ai-check"><input type="checkbox" id="wsConsent"> The builder agreed, and a parent or guardian consented if the builder is under 18.</label>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem"><button class="tk-btn primary" id="wsPublish" type="button"><i class="fas fa-globe"></i> Publish</button>' +
          (b.showcase === 'requested' ? '<button class="tk-btn" id="wsDecline" type="button">Not now</button>' : '') + '</div></div>';
      }
      if (isStu) {
        if (!approved) return '<div class="tk-box"><h3>Publish</h3><div class="tk-sub">Once your coach approves this project you can ask for it to be published.</div></div>';
        return '<div class="tk-box"><h3>Publish</h3>' + (b.showcase === 'requested' ? '<span class="tk-pill warn">Waiting for your coach</span>' :
          '<div class="tk-sub">Ask your coach to publish it with a shareable Paisley Studio link.</div><button class="tk-btn primary" id="wsAsk" type="button"><i class="fas fa-bullhorn"></i> Ask to publish</button>') + '</div>';
      }
      return '';
    }
    function submitPane() {
      var st = projectState(b), r = reflectionOf(b), last = latestCoachFb(), n = Number(b.submissionCount) || 0;
      var latest = subs[0] || null;
      var status = '<div class="tk-box"><h3>Status</h3><div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">' + statePill(b) + gradeLine(b) +
        (n ? '<span class="tk-sub" style="margin:0">' + n + ' submission' + (n === 1 ? '' : 's') + (b.submittedAt ? ' · last ' + esc(fmt(b.submittedAt)) : '') + '</span>' : '') + '</div>' +
        (b.reviewNote || (last && (last.kind === 'changes' || last.kind === 'approved')) ? '<div class="tk-fb coach" style="margin-top:.6rem"><div class="who">' + esc((last && last.authorName) || b.reviewerName || 'Coach') + ' ' + (last ? esc(fmt(last.createdAt)) : '') + '</div>' + esc((last && last.text) || b.reviewNote || '') + '</div>' : '') +
        (b.criteriaScores && b.criteriaScores.length ? '<ul class="tk-crit">' + b.criteriaScores.map(function (c) { return '<li><span class="tk-pill ' + (c.met ? 'ok' : 'warn') + '">' + (c.met ? 'Met' : 'Not yet') + '</span> ' + esc(c.name) + '</li>'; }).join('') + '</ul>' : '') + '</div>';

      if (role === 'guardian') return '<div class="tk-grid2">' + status + '<div class="tk-box"><h3>AI reflection</h3>' + reflectionView(r) + '</div>' + publishBlock() + '</div>';

      if (isStu) {
        var waiting = st === 'submitted' || st === 'under_review';
        var tools = (b.aiTools || []).map(function (t) { return '<label class="tk-ai-check"><input type="checkbox" data-aitool="' + esc(t.name) + '"' + ((r.tools || []).indexOf(t.name) !== -1 ? ' checked' : '') + '> ' + esc(t.name) + '</label>'; }).join('');
        var other = (r.tools || []).filter(function (t) { return !(b.aiTools || []).some(function (x) { return x.name === t; }); }).join(', ');
        var form = '<div class="tk-ai-box"><h4><i class="fas fa-wand-magic-sparkles"></i> AI-use reflection (required)</h4>' +
          '<div class="tk-sub">Be honest. Your coach reads this with your work.</div>' +
          '<div class="tk-ai-field"><label>Which AI tools did you use?</label>' + tools + '<input id="aiOther" maxlength="200" placeholder="Other tools, separated by commas (or “None”)" value="' + esc(other) + '"></div>' +
          '<div class="tk-ai-field"><label>What did you use them for?</label><textarea id="aiPurpose" maxlength="600">' + esc(r.purpose) + '</textarea></div>' +
          '<div class="tk-ai-field"><label>What did you personally contribute?</label><textarea id="aiContribution" maxlength="800">' + esc(r.contribution) + '</textarea></div>' +
          '<div class="tk-ai-field"><label>What did you learn? (optional)</label><textarea id="aiLearned" maxlength="600">' + esc(r.learned) + '</textarea></div>' +
          '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center"><button class="tk-btn" id="aiSave" type="button"><i class="fas fa-floppy-disk"></i> Save reflection</button>' +
          (waiting ? '<span class="tk-pill warn">With your coach</span>' : '<button class="tk-btn primary" id="wsSubmit" type="button"><i class="fas fa-paper-plane"></i> ' + (n ? 'Resubmit revision' : 'Submit for review') + '</button>') +
          '</div></div>';
        var checks = '<ul class="tk-crit">' +
          '<li><span class="tk-pill ' + (hasArtifact(b) ? 'ok' : 'warn') + '">' + (hasArtifact(b) ? 'Done' : 'To do') + '</span> Your actual work is saved (writing, code, files or a live link)</li>' +
          (mission && requiredMaterials(mission).length ? '<li><span class="tk-pill ' + (journeyOf(b, mission).done.LEARN ? 'ok' : 'warn') + '">' + (journeyOf(b, mission).done.LEARN ? 'Done' : 'To do') + '</span> Required study materials</li>' : '') +
          '<li><span class="tk-pill ' + ((r.purpose && r.contribution) ? 'ok' : 'warn') + '">' + ((r.purpose && r.contribution) ? 'Done' : 'To do') + '</span> AI-use reflection</li></ul>';
        return (st === 'revision' ? '' : '') + '<div class="tk-grid2">' + status +
          '<div class="tk-box"><h3>Before you submit</h3>' + (mission && mission.submissionReq ? '<div class="tk-fb" style="margin-bottom:.5rem">' + esc(mission.submissionReq) + '</div>' : '') + checks + '</div></div>' +
          form + '<div class="tk-grid2" style="margin-top:.9rem">' + publishBlock() + '</div>';
      }

      /* coach / admin review */
      var crit = (mission && mission.criteria) || [];
      var prev = b.criteriaScores || [];
      var critHtml = crit.length ? '<div class="tk-ai-field"><label>Assessment criteria</label>' + crit.map(function (c, i) {
        var was = prev.filter(function (p) { return p.name === c.name; })[0];
        return '<div class="tk-item"><div><b>' + esc(c.name || '') + '</b><div class="meta">' + esc(c.description || '') + '</div></div><select class="tk-in" data-crit="' + i + '" style="width:auto"><option value="">—</option><option value="1"' + (was && was.met ? ' selected' : '') + '>Met</option><option value="0"' + (was && was.met === false ? ' selected' : '') + '>Not yet</option></select></div>';
      }).join('') + '</div>' : '';
      var form2 = '<div class="tk-ai-box"><h4><i class="fas fa-clipboard-check"></i> Assess this ' + (isSelfLed(b) ? 'self-led project' : 'mission') + '</h4>' +
        (st === 'submitted' ? '<button class="tk-btn sm" id="wsStartReview" type="button" style="margin-bottom:.6rem"><i class="fas fa-magnifying-glass"></i> Mark as under review</button>' : '') +
        critHtml +
        '<div class="tk-row"><div class="tk-ai-field"><label>Grade</label><select id="rvGrade" class="tk-in"><option value="">No grade</option>' + GRADES.map(function (gr) { return '<option' + (b.gradeLabel === gr ? ' selected' : '') + '>' + gr + '</option>'; }).join('') + '</select></div>' +
        '<div class="tk-ai-field"><label>Score % (optional)</label><input id="rvScore" type="number" min="0" max="100" class="tk-in" value="' + esc(b.gradeScore != null ? b.gradeScore : '') + '"></div></div>' +
        '<div class="tk-ai-field"><label>Feedback for the builder (their family sees it too)</label><textarea id="rvText" maxlength="2000"></textarea></div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="tk-btn" data-review="changes" type="button"><i class="fas fa-rotate-left"></i> Request revision</button>' +
        '<button class="tk-btn primary" data-review="approved" type="button"><i class="fas fa-check"></i> Approve</button>' +
        (b.mastery !== 'approved' ? '<button class="tk-btn dark" data-review="mastered" type="button"><i class="fas fa-award"></i> Approve and award mastery</button>' : '<button class="tk-btn sm" id="wsMasteryRevoke" type="button">Revoke mastery</button>') + '</div></div>';
      var subView = latest ? '<div class="tk-box"><h3>Submission v' + esc(latest.version || n) + '</h3><div class="tk-sub">' + esc(fmt(latest.submittedAt)) + '</div>' + reflectionView(latest.reflection || {}) +
        '<button type="button" class="tk-btn sm" data-tabgo="history">See the submitted work</button></div>'
        : '<div class="tk-box"><h3>Not submitted yet</h3><div class="tk-sub">You can still look at the work in progress and comment. Grades and approval normally follow a submission.</div>' + reflectionView(r) + '</div>';
      return '<div class="tk-grid2">' + status + subView + '</div>' + form2 + '<div class="tk-grid2" style="margin-top:.9rem">' + publishBlock() + '</div>';
    }

    function snapshotHtml(s, i) {
      var code = (s.codeFiles || []).filter(function (f) { return String(f.content || '').trim(); });
      return '<details class="tk-snap"' + (i === 0 ? ' open' : '') + '><summary><b>v' + esc(s.version || '') + '</b> · ' + esc(fmt(s.submittedAt)) + ' ' + statePill(s.status === 'changes' ? 'revision' : s.status === 'approved' ? 'approved' : 'submitted') + ' ' + gradeLine(s) + '</summary>' +
        (s.reviewNote ? '<div class="tk-fb coach"><div class="who">' + esc(s.reviewerName || 'Coach') + '</div>' + esc(s.reviewNote) + '</div>' : '') +
        '<div class="tk-ai-box">' + reflectionView(s.reflection || {}) + '</div>' +
        (s.writingHtml ? '<h4 class="tk-h4">Writing</h4><div class="tk-article">' + cleanHtml(s.writingHtml) + '</div>' : '') +
        (code.length ? '<h4 class="tk-h4">Code (' + code.length + ' file' + (code.length === 1 ? '' : 's') + ')</h4>' + (g.CodeLab && g.CodeLab.buildPreview ? '<button type="button" class="tk-btn sm" data-preview="' + i + '"><i class="fas fa-play"></i> Run preview</button><div data-prevhost="' + i + '"></div>' : '') +
          code.map(function (f) { return '<details><summary>' + esc(f.name) + '</summary><pre class="tk-code">' + esc(f.content) + '</pre></details>'; }).join('') : '') +
        ((s.files || []).length ? '<h4 class="tk-h4">Files</h4><div class="tk-list">' + s.files.map(function (f) { return '<div class="tk-item"><a href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener"><i class="fas fa-file"></i> ' + esc(f.name || f.url) + '</a></div>'; }).join('') + '</div>' : '') +
        (s.workText ? '<h4 class="tk-h4">Notes</h4><div class="tk-prose">' + esc(s.workText) + '</div>' : '') +
        (safeUrl(s.workUrl) ? '<p><a href="' + esc(safeUrl(s.workUrl)) + '" target="_blank" rel="noopener">Open the live version</a></p>' : '') +
        '</details>';
    }
    function historyPane() {
      if (!subs.length) return '<div class="tk-empty">Nothing submitted yet. Each submission is kept here with its review.</div>';
      return subs.map(snapshotHtml).join('');
    }
    function commentsPane() {
      return '<div class="tk-box"><h3>Comments</h3><div class="tk-sub">Questions and replies about this project.</div><div class="tk-list" id="wsFb"></div>' +
        (role === 'guardian' ? '' : '<div style="margin-top:.8rem"><div class="tk-f"><textarea id="fbText" maxlength="2000" placeholder="' + (canReview ? 'Write a comment…' : 'Reply to your coach…') + '"></textarea></div><button class="tk-btn primary" id="fbSend" type="button">Post</button></div>') + '</div>';
    }

    /* ---------- render ---------- */
    function render() {
      if (dead || !b) return; rendered = true;
      unmountTabModules();
      if (!activeTab) activeTab = o.tab || (mission && isStu && !(Number(b.submissionCount) > 0) && !hasArtifact(b) ? 'mission' : (canReview && b.reviewState === 'requested' ? 'submit' : primaryTab()));
      if (activeTab === 'mission' && !mission) activeTab = primaryTab();
      var st = projectState(b), pt = primaryTab(), last = latestCoachFb();
      var si = Math.max(0, STATUSES.indexOf(b.status));
      var steps = STATUSES.map(function (s, i) {
        var cls = i < si ? 'done' : (i === si ? 'now' : '');
        return '<button type="button" class="tk-step ' + cls + (canEdit ? ' click' : '') + '" data-st="' + s + '"' + (canEdit ? '' : ' disabled') + '>' + esc(STATUS_LABEL[s]) + '</button>';
      }).join('');
      var tabs = [];
      if (mission) tabs.push(['mission', 'fa-bullseye', 'Mission']);
      tabs.push(['brief', 'fa-clipboard-list', 'Overview']);
      var tools = [['writing', 'fa-pen-nib', 'Writing Studio'], ['code', 'fa-code', 'Code IDE'], ['upload', 'fa-photo-film', 'Media & uploads']];
      tools.sort(function (x, y) { return (x[0] === pt ? -1 : 0) - (y[0] === pt ? -1 : 0); });
      tabs = tabs.concat(tools);
      tabs.push(['submit', canReview ? 'fa-clipboard-check' : 'fa-paper-plane', canReview ? 'Review' : (role === 'guardian' ? 'Status' : 'Submit')]);
      tabs.push(['history', 'fa-clock-rotate-left', 'Submissions' + (subs.length ? ' (' + subs.length + ')' : '')]);
      tabs.push(['comments', 'fa-comments', 'Comments']);
      var tabbar = '<div class="tk-tabbar" role="tablist">' + tabs.map(function (t) {
        var on = activeTab === t[0];
        return '<button type="button" class="tk-tab' + (on ? ' on' : '') + '" data-tab="' + t[0] + '" role="tab" aria-selected="' + on + '"><i class="fas ' + t[1] + '"></i> ' + esc(t[2]) + (t[0] === pt ? ' <span class="tk-pill">Main</span>' : '') + '</button>';
      }).join('') + '</div>';
      var banner = '';
      if (st === 'revision' && role !== 'coach' && role !== 'admin') {
        banner = '<div class="tk-banner bad"><i class="fas fa-pen-to-square"></i><div><b>Revision required.</b> ' + esc((last && last.text) || b.reviewNote || 'Your coach asked for changes.') +
          (isStu ? '<div class="tk-sub" style="margin:.3rem 0 0">Change the same project, then resubmit it from the Submit tab. Your earlier submission is kept.</div>' : '') + '</div>' +
          (isStu ? '<button type="button" class="tk-btn primary" data-tabgo="' + pt + '">Revise now</button>' : '') + '</div>';
      } else if (canReview && st === 'submitted') {
        banner = '<div class="tk-banner warn"><i class="fas fa-inbox"></i><div><b>' + ((Number(b.submissionCount) || 0) > 1 ? 'Resubmitted' : 'Submitted') + ' for review.</b> ' + esc(fmt(b.submittedAt)) + '</div><button type="button" class="tk-btn primary" data-tabgo="submit">Assess it</button></div>';
      }
      var pane = function (k, html) { return '<div class="tk-pane' + (activeTab === k ? ' on' : '') + '" data-pane="' + k + '">' + html + '</div>'; };

      host.innerHTML = banner +
        '<div class="tk-box" style="margin-bottom:.9rem">' +
          '<div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin-bottom:.6rem">' + originTag(b) + statePill(b) + gradeLine(b) +
            (b.showcase === 'approved' ? '<span class="tk-pill gold"><i class="fas fa-globe"></i> Published</span>' : '') + '</div>' +
          '<div class="tk-row" style="align-items:end">' +
            '<div class="tk-f" style="margin:0;grid-column:span 2"><label>Project</label><input id="wsTitle" maxlength="120" value="' + esc(b.title) + '"' + (canEdit ? '' : ' readonly') + '></div>' +
            '<div class="tk-f" style="margin:0"><label>Type</label><select id="wsCat"' + (canEdit ? '' : ' disabled') + '>' +
              CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (c === b.category ? ' selected' : '') + '>' + esc(CREATION_LABEL[c] || c) + '</option>'; }).join('') +
              (LEGACY_CATEGORIES.indexOf(b.category) !== -1 && CATEGORIES.indexOf(b.category) === -1 ? '<option selected>' + esc(b.category) + '</option>' : '') +
            '</select></div></div>' +
          '<div class="tk-sub" style="margin:.6rem 0 0">By ' + esc(b.displayName || b.studentName || '') + (b.coachName ? ' · coach ' + esc(b.coachName) : '') + ' · opens in the ' + esc(WORKSPACE_NAME[pt]) + '</div>' +
          journeyHtml(b, mission) +
          '<div class="tk-steps">' + steps + '</div>' +
          '<div style="display:flex;gap:.7rem;align-items:center"><div class="tk-bar" style="flex:1"><i style="width:' + (Number(b.progress) || 0) + '%"></i></div><b style="font-size:.85rem">' + (Number(b.progress) || 0) + '%</b></div>' +
          (canEdit ? '<input type="range" id="wsProg" min="0" max="100" step="5" value="' + (Number(b.progress) || 0) + '" style="width:100%;margin-top:.4rem" aria-label="Progress">' : '') +
          '<div style="display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-top:.6rem"><span class="tk-sub" style="margin:0">Disciplines:</span>' +
            DISCIPLINES.map(function (d) { var on = disciplinesOf(b).indexOf(d) !== -1; return '<button type="button" class="tk-pill' + (on ? ' ok' : '') + '" data-disc="' + esc(d) + '" style="border:0;cursor:' + (canEdit ? 'pointer' : 'default') + ';opacity:' + (on ? '1' : '.55') + '"' + (canEdit ? '' : ' disabled') + '>' + esc(d) + '</button>'; }).join('') + '</div>' +
        '</div>' +
        tabbar +
        (mission ? pane('mission', missionPane()) : '') +
        pane('brief', overviewPane()) +
        pane('writing', '<div class="tk-ws-host" id="wsWritingHost"></div>') +
        pane('code', '<div class="tk-cl-host" id="wsCodeHost"></div>') +
        pane('upload', '<div class="tk-up-host" id="wsUploadHost"></div>') +
        pane('submit', submitPane()) +
        pane('history', historyPane()) +
        pane('comments', commentsPane()) +
        '<div class="tk-msgline" id="wsMsg" role="status"></div>';

      openModuleFor(activeTab);
      renderFb();
      wire();
    }
    function openModuleFor(tab) {
      if (tab === 'writing' && !mounted.writing) mountModule('writing', host.querySelector('#wsWritingHost'));
      if (tab === 'code' && !mounted.code) mountModule('code', host.querySelector('#wsCodeHost'));
      if (tab === 'upload' && !mounted.upload) mountModule('upload', host.querySelector('#wsUploadHost'));
      if (isStu && (tab === 'submit' || tab === 'comments') && latestCoachFb()) act('feedback_viewed', 'Read coach feedback on ' + (b.title || 'a project'));
    }
    function switchTab(tab) {
      if (!host.querySelector('[data-pane="' + tab + '"]')) return;
      activeTab = tab;
      if (stale && MODULE_TABS.indexOf(tab) === -1) { stale = false; render(); return; }
      host.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === tab); x.setAttribute('aria-selected', x.dataset.tab === tab); });
      host.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('on', p.dataset.pane === tab); });
      openModuleFor(tab);
    }

    function renderFb() {
      var el = host.querySelector('#wsFb'); if (!el) return;
      el.innerHTML = fbList.map(function (f) {
        var tag = f.kind === 'changes' ? '<span class="tk-pill bad">Revision requested</span>' : (f.kind === 'approved' ? '<span class="tk-pill ok">Approved</span>' : '');
        return '<div class="tk-fb ' + (f.role === 'student' ? '' : 'coach') + '"><div class="who">' + esc(f.authorName || f.role) + ' ' + tag + ' ' + gradeLine(f) + ' <span style="font-weight:600;opacity:.7">' + esc(fmt(f.createdAt)) + '</span></div>' + esc(f.text) + '</div>';
      }).join('') || '<div class="tk-empty">No comments yet.</div>';
    }

    function q(id) { return host.querySelector(id); }
    function collect() {
      var p = { title: q('#wsTitle').value.trim().slice(0, 120) || b.title, category: q('#wsCat').value, progress: q('#wsProg') ? Number(q('#wsProg').value) : (b.progress || 0) };
      if (q('#wsBrief')) {
        p.brief = q('#wsBrief').value.slice(0, 2000);
        p.workText = q('#wsWork').value.slice(0, 3000); p.workUrl = safeUrl(q('#wsUrl').value) || '';
        p.skills = q('#wsSkills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
      }
      return p;
    }
    function collectReflection() {
      var tools = [];
      host.querySelectorAll('[data-aitool]').forEach(function (c) { if (c.checked) tools.push(c.dataset.aitool); });
      (q('#aiOther') ? q('#aiOther').value : '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (t) { if (tools.indexOf(t) === -1) tools.push(t.slice(0, 60)); });
      var r = reflectionOf(b);
      return {
        tools: tools.slice(0, 12),
        purpose: (q('#aiPurpose') ? q('#aiPurpose').value : '').trim().slice(0, 600),
        contribution: (q('#aiContribution') ? q('#aiContribution').value : '').trim().slice(0, 800),
        learned: (q('#aiLearned') ? q('#aiLearned').value : '').trim().slice(0, 600),
        changes: r.changes || '', kept: r.kept || ''
      };
    }
    function snapshot(n, r) {
      var codeSize = 0;
      return {
        studentId: b.studentId, studentName: b.studentName || '', title: b.title || '', version: n, status: 'submitted',
        writingHtml: String(b.writingHtml || '').slice(0, 200000),
        codeFiles: (b.codeFiles || []).filter(function (f) { codeSize += String(f.content || '').length; return codeSize < 300000; }).map(function (f) { return { name: f.name, lang: f.lang || '', content: String(f.content || '') }; }),
        files: (b.files || []).slice(0, 40).map(function (f) { return { name: f.name || '', url: f.url || '', type: f.type || '' }; }),
        workText: String(b.workText || '').slice(0, 3000), workUrl: safeUrl(b.workUrl) || '',
        reflection: r, submittedAt: FV().serverTimestamp()
      };
    }

    async function submitWork() {
      var r = collectReflection();
      if (!r.tools.length) return say('List the AI tools you used, or write “None”.', true);
      if (!r.purpose) return say('Say what you used AI for (or “I did not use AI”).', true);
      if (!r.contribution) return say('Say what you personally contributed.', true);
      Object.assign(b, collect());
      if (!hasArtifact(b)) return say('Save your actual work first: writing, code, files or a live link.', true);
      var btn = q('#wsSubmit'); if (btn) btn.disabled = true;
      var n = (Number(b.submissionCount) || 0) + 1;
      try {
        var sref = ref.collection('submissions').doc();
        await sref.set(snapshot(n, r));
        var p = Object.assign(collect(), {
          aiReflection: r, reviewState: 'requested', submissionCount: n, submittedAt: FV().serverTimestamp(), lastSubmissionId: sref.id,
          progress: Math.max(Number(b.progress) || 0, 80)
        });
        if (['IDEA', 'LEARNING', 'BUILDING'].indexOf(b.status) !== -1) p.status = 'TESTING';
        await patch(p, n > 1 ? 'Revision submitted ✓' : 'Submitted for review ✓');
        act(n > 1 ? 'resubmitted' : 'submitted', (n > 1 ? 'Resubmitted ' : 'Submitted ') + (b.title || 'a project') + ' (v' + n + ')');
      } catch (e) { if (btn) btn.disabled = false; say('Could not submit: ' + errMsg(e), true); }
    }
    async function review(kind) {
      var text = (q('#rvText').value || '').trim();
      if (!text) return say('Write feedback for the builder first.', true);
      var crit = ((mission && mission.criteria) || []).map(function (c, i) { var v = (host.querySelector('[data-crit="' + i + '"]') || {}).value; return v === '' || v == null ? null : { name: c.name || '', met: v === '1' }; }).filter(Boolean);
      var gl = q('#rvGrade').value, sc = q('#rvScore').value === '' ? null : Math.max(0, Math.min(100, Number(q('#rvScore').value)));
      var decision = kind === 'mastered' ? 'approved' : kind;
      var who = { reviewedAt: FV().serverTimestamp(), reviewedBy: me.uid, reviewerName: me.name || '' };
      var grade = { gradeLabel: gl || '', gradeScore: sc, criteriaScores: crit, reviewNote: text.slice(0, 2000) };
      host.querySelectorAll('[data-review]').forEach(function (x) { x.disabled = true; });
      try {
        var batch = db.batch();
        batch.set(ref.collection('feedback').doc(), Object.assign({ authorId: me.uid, authorName: me.name || '', role: role === 'admin' ? 'admin' : 'coach', kind: decision, text: text.slice(0, 2000), submissionId: b.lastSubmissionId || '', createdAt: FV().serverTimestamp() }, { gradeLabel: grade.gradeLabel, gradeScore: grade.gradeScore, criteriaScores: crit }));
        if (b.lastSubmissionId && subs.some(function (s) { return s.id === b.lastSubmissionId; })) batch.update(ref.collection('submissions').doc(b.lastSubmissionId), Object.assign({ status: decision === 'changes' ? 'changes' : 'approved' }, grade, who));
        var bp = Object.assign({ reviewState: decision, updatedAt: FV().serverTimestamp() }, grade, who);
        if (kind === 'mastered') Object.assign(bp, { mastery: 'approved', masteryAt: FV().serverTimestamp(), masteryBy: me.uid, status: 'READY', progress: 100 });
        if (decision === 'changes' && b.mastery === 'requested') bp.mastery = 'changes';
        batch.update(ref, bp);
        await batch.commit();
        say(kind === 'changes' ? 'Revision requested. The builder and their family are told.' : kind === 'mastered' ? 'Approved and mastered ✓' : 'Approved ✓');
      } catch (e) { say('Could not save the review: ' + errMsg(e), true); host.querySelectorAll('[data-review]').forEach(function (x) { x.disabled = false; }); }
    }

    function wire() {
      host.querySelectorAll('[data-tab]').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.dataset.tab); }); });
      host.querySelectorAll('[data-tabgo]').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.dataset.tabgo); window.scrollTo(0, host.getBoundingClientRect().top + window.scrollY - 80); }); });
      host.querySelectorAll('[data-copy]').forEach(function (t) { t.addEventListener('click', function () { var v = t.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { say('Link copied ✓'); }, function () { say(v); }); }); });
      host.querySelectorAll('[data-st]').forEach(function (btn) { btn.addEventListener('click', function () {
        if (!canEdit) return; var st = btn.dataset.st; var p = { status: st }; if (st === 'READY') p.progress = 100;
        patch(p, 'Stage: ' + STATUS_LABEL[st]).catch(function () { });
      }); });
      host.querySelectorAll('[data-disc]').forEach(function (btn) { btn.addEventListener('click', function () {
        if (!canEdit) return; var d = disciplinesOf(b).slice(), i = d.indexOf(btn.dataset.disc); if (i === -1) d.push(btn.dataset.disc); else d.splice(i, 1);
        patch({ disciplines: d }).catch(function () { });
      }); });
      host.querySelectorAll('[data-rmfile]').forEach(function (x) { x.addEventListener('click', function () { var a = (b.files || []).slice(); a.splice(Number(x.dataset.rmfile), 1); patch({ files: a }).catch(function () { }); }); });
      host.querySelectorAll('[data-rmres]').forEach(function (x) { x.addEventListener('click', function () { var a = (b.resources || []).slice(); a.splice(Number(x.dataset.rmres), 1); patch({ resources: a }).catch(function () { }); }); });
      host.querySelectorAll('[data-practice]').forEach(function (x) { x.addEventListener('click', function () { var i = Number(x.dataset.practice); o.onPractice((mission.practice || [])[i], mission, b, i); }); });
      host.querySelectorAll('[data-preview]').forEach(function (x) { x.addEventListener('click', function () {
        var s = subs[Number(x.dataset.preview)]; var h = host.querySelector('[data-prevhost="' + x.dataset.preview + '"]'); if (!s || !h) return;
        var fr = document.createElement('iframe'); fr.className = 'tk-run'; fr.setAttribute('sandbox', 'allow-scripts'); fr.setAttribute('referrerpolicy', 'no-referrer'); fr.title = 'Preview';
        fr.srcdoc = g.CodeLab.buildPreview(s.codeFiles || []); h.innerHTML = ''; h.appendChild(fr);
      }); });

      /* study materials: opening one counts towards LEARN */
      function seenMat(id, video) {
        if (!isStu || !id) return;
        var mat = ((mission && mission.materials) || []).filter(function (x) { return x.id === id; })[0];
        act(video ? 'video_watched' : 'material_opened', (video ? 'Watched ' : 'Opened ') + ((mat && mat.title) || 'study material'), { materialId: id, missionId: mission && mission.id });
        if ((b.materialsSeen || []).indexOf(id) === -1) {
          b.materialsSeen = (b.materialsSeen || []).concat([id]);
          ref.update({ materialsSeen: FV().arrayUnion(id), updatedAt: FV().serverTimestamp() }).catch(function () { });
        }
      }
      host.querySelectorAll('a[data-mat]').forEach(function (x) { x.addEventListener('click', function () { seenMat(x.dataset.mat); }); });
      host.querySelectorAll('video[data-mat]').forEach(function (v) {
        v.addEventListener('play', function () { act('material_opened', 'Started a video', { materialId: v.dataset.mat }); }, { once: true });
        v.addEventListener('timeupdate', function () { if (v.duration && v.currentTime / v.duration > 0.8 && !v._done) { v._done = true; seenMat(v.dataset.mat, true); } });
      });
      host.querySelectorAll('[data-matdone]').forEach(function (x) { x.addEventListener('click', function () { seenMat(x.dataset.matdone, true); render(); }); });

      if (q('#wsSave')) q('#wsSave').addEventListener('click', function () { patch(collect(), 'Saved ✓').catch(function () { }); });
      if (q('#rsAdd')) q('#rsAdd').addEventListener('click', function () { var u = safeUrl(q('#rsU').value); if (!u) return say('Enter a link starting with https://', true); var a = (b.resources || []).concat([{ title: q('#rsT').value.trim().slice(0, 80) || u, url: u }]); patch(Object.assign(collect(), { resources: a.slice(0, 30) })).catch(function () { }); });
      if (q('#flAdd')) q('#flAdd').addEventListener('click', function () { var u = safeUrl(q('#flU').value); if (!u) return say('Enter a link starting with https://', true); var a = (b.files || []).concat([{ name: u.replace(/^https?:\/\//, '').slice(0, 60), url: u, at: Date.now() }]); patch(Object.assign(collect(), { files: a.slice(0, 40) })).catch(function () { }); });
      if (q('#flUp')) q('#flUp').addEventListener('change', async function (e) {
        var f = e.target.files[0]; if (!f) return; var st = q('#flSt');
        if (f.size > 25 * 1024 * 1024) { st.textContent = 'Files must be under 25 MB.'; return; }
        st.textContent = 'Uploading…';
        try {
          var path = 'techBuilds/' + b.studentId + '/' + b.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
          var r = firebase.storage().ref(path); await r.put(f, { contentType: f.type || undefined }); var url = await r.getDownloadURL();
          var a = (b.files || []).concat([{ name: f.name.slice(0, 80), url: url, path: path, size: f.size, type: f.type || '', at: Date.now() }]);
          await patch(Object.assign(collect(), { files: a.slice(0, 40) }), 'File added ✓');
        } catch (er) { st.textContent = 'Upload failed: ' + errMsg(er); }
      });
      if (q('#vAdd')) q('#vAdd').addEventListener('click', function () { var n = q('#vN').value.trim(); if (!n) return say('Say what changed in this version.', true); var u = safeUrl(q('#vU').value); var a = (b.versions || []).concat([{ note: n.slice(0, 200), url: u, at: Date.now() }]); patch(Object.assign(collect(), { versions: a.slice(0, 50) }), 'Version v' + a.length + ' saved ✓').catch(function () { }); });

      if (q('#aiSave')) q('#aiSave').addEventListener('click', function () { patch({ aiReflection: collectReflection() }, 'Reflection saved ✓').catch(function () { }); });
      if (q('#wsSubmit')) q('#wsSubmit').addEventListener('click', submitWork);
      host.querySelectorAll('[data-review]').forEach(function (x) { x.addEventListener('click', function () { review(x.dataset.review); }); });
      if (q('#wsStartReview')) q('#wsStartReview').addEventListener('click', function () { patch({ reviewState: 'reviewing' }, 'Marked as under review.').catch(function () { }); });
      if (q('#wsMasteryRevoke')) q('#wsMasteryRevoke').addEventListener('click', function () { if (confirm('Revoke this mastery approval?')) patch({ mastery: 'none' }, 'Mastery revoked.').catch(function () { }); });

      host.querySelectorAll('[data-vis]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var v = btn.dataset.vis; if (btn.disabled || v === b.visibility) return;
          if (v === 'family') {
            try { var token = await mintShareToken(b.id); await patch({ visibility: 'family', shareToken: token }, 'Family link ready ✓'); }
            catch (e) { say('Could not create family link: ' + errMsg(e), true); }
          } else patch({ visibility: 'private' }, 'Now private ✓').catch(function () { });
        });
      });
      if (q('#wsRevokeToken')) q('#wsRevokeToken').addEventListener('click', async function () {
        if (!confirm('Revoke this family link? Anyone with it loses access.')) return;
        try { await db.collection('shareTokens').doc(b.id).set({ revoked: true }, { merge: true }); await patch({ shareToken: '', visibility: 'private' }, 'Family link revoked.'); }
        catch (e) { say('Could not revoke: ' + errMsg(e), true); }
      });

      if (q('#wsAsk')) q('#wsAsk').addEventListener('click', function () { patch({ showcase: 'requested' }, 'Publication requested ✓').catch(function () { }); });
      if (q('#wsDecline')) q('#wsDecline').addEventListener('click', function () { patch({ showcase: 'none' }, 'Publication request declined.').catch(function () { }); });
      if (q('#wsPublish')) q('#wsPublish').addEventListener('click', async function () {
        if (!q('#wsConsent').checked) return say('Confirm consent before publishing.', true);
        try { await approveShowcase(b, me, true); say('Published ✓ ' + shareUrl(b.id)); } catch (e) { say('Could not publish: ' + errMsg(e), true); }
      });
      if (q('#wsUnpublish')) q('#wsUnpublish').addEventListener('click', async function () { if (!confirm('Take this project off the public showcase? The link will stop working.')) return; try { await removeShowcase(b); say('Taken down.'); } catch (e) { say(errMsg(e), true); } });
      if (q('#wsDel')) q('#wsDel').addEventListener('click', async function () {
        if (!confirm('Delete this project permanently?')) return;
        try { await ref.delete(); if (o.onDeleted) o.onDeleted(); } catch (e) { say('Could not delete: ' + errMsg(e), true); }
      });
      if (q('#fbSend')) q('#fbSend').addEventListener('click', async function () {
        var t = q('#fbText').value.trim(); if (!t) return; var btn = q('#fbSend'); btn.disabled = true;
        try {
          await ref.collection('feedback').add({ authorId: me.uid, authorName: me.name || '', role: role === 'student' ? 'student' : (role === 'admin' ? 'admin' : 'coach'), kind: 'comment', text: t.slice(0, 2000), createdAt: FV().serverTimestamp() });
          q('#fbText').value = ''; say('Posted ✓');
        } catch (e) { say('Could not post: ' + errMsg(e), true); }
        btn.disabled = false;
      });
    }

    host.innerHTML = '<div class="tk-empty">Opening project…</div>';
    unsubs.push(ref.onSnapshot(function (s) {
      if (!s.exists) { host.innerHTML = '<div class="tk-empty">This project no longer exists.</div>'; return; }
      b = Object.assign({ id: s.id }, s.data());
      if (!opened && isStu) { opened = true; act('project_opened', 'Opened ' + (b.title || 'a project')); }
      if (!mission && b.missionId && o.findMission) mission = o.findMission(b.missionId);
      repaint();
    }, function (e) { host.innerHTML = '<div class="tk-empty">Could not open this project: ' + esc(errMsg(e)) + '</div>'; }));
    unsubs.push(ref.collection('feedback').orderBy('createdAt').onSnapshot(function (s) { fbList = s.docs.map(function (d) { return d.data(); }); if (b) repaint(); }, function () { }));
    unsubs.push(ref.collection('submissions').orderBy('version', 'desc').onSnapshot(function (s) { subs = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); if (b) repaint(); }, function () { }));
    return { destroy: function () { dead = true; unmountTabModules(); unsubs.forEach(function (u) { u(); }); } };
  }

  /* =========================================================
     TECH notification bell — techNotifications only.
     TechUI.mountBell(host, { uid, onOpen(n) })
       onOpen may handle a notification itself (return true);
       otherwise the bell follows n.link.
     ========================================================= */
  var bellStyled = false;
  function bellStyle() {
    if (bellStyled) return; bellStyled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.tk-bell{position:relative;display:inline-block}',
      '.tk-bell>button{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);font-size:1rem;cursor:pointer;display:grid;place-items:center}',
      '.tk-bell>button:hover{border-color:var(--brand,#55BFB3)}',
      '.tk-bell .n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#E74C3C;color:#fff;font-size:.66rem;font-weight:800;line-height:18px;text-align:center}',
      '.tk-bell-pop{position:absolute;right:0;top:calc(100% + 8px);width:min(360px,calc(100vw - 32px));max-height:min(70vh,480px);overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:16px;box-shadow:0 18px 50px rgba(15,26,20,.18);z-index:60;text-align:left}',
      '.tk-bell-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.8rem 1rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12));font-weight:800;color:var(--brand-deep,#245F5A);font-size:.9rem}',
      '.tk-bell-head button{background:none;border:0;color:var(--brand-deep,#245F5A);font:inherit;font-size:.74rem;font-weight:800;cursor:pointer;text-decoration:underline}',
      '.tk-bell-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line,rgba(38,51,49,.06));background:none;padding:.7rem 1rem;font:inherit;color:var(--ink,#263331);cursor:pointer}',
      '.tk-bell-item:hover{background:var(--paper,#F1F9F7)}',
      '.tk-bell-item.unread{background:rgba(85,191,179,.08)}',
      '.tk-bell-item b{display:block;font-size:.84rem;color:var(--brand-deep,#245F5A)}',
      '.tk-bell-item span{display:block;font-size:.8rem;color:var(--muted,#5A6E6A);margin-top:2px;line-height:1.35}',
      '.tk-bell-item small{display:block;font-size:.68rem;color:var(--muted,#5A6E6A);margin-top:3px;opacity:.8}'
    ].join('');
    document.head.appendChild(st);
  }
  function mountBell(host, o) {
    bellStyle();
    var list = [], open = false, unsub = null;
    host.innerHTML = '<div class="tk-bell"><button type="button" aria-label="Notifications" aria-expanded="false"><i class="fas fa-bell"></i><span class="n" hidden>0</span></button><div class="tk-bell-pop" hidden role="dialog" aria-label="Notifications"></div></div>';
    var btn = host.querySelector('.tk-bell>button'), pop = host.querySelector('.tk-bell-pop'), badge = host.querySelector('.tk-bell .n');
    function unread() { return list.filter(function (n) { return !n.read; }); }
    function paint() {
      var u = unread().length;
      badge.hidden = !u; badge.textContent = u > 99 ? '99+' : u;
      if (!open) return;
      pop.innerHTML = '<div class="tk-bell-head"><span>Notifications</span>' + (u ? '<button type="button" data-all>Mark all read</button>' : '') + '</div>' +
        (list.length ? list.map(function (n) {
          return '<button type="button" class="tk-bell-item' + (n.read ? '' : ' unread') + '" data-n="' + esc(n.id) + '"><b>' + esc(n.title) + '</b><span>' + esc(n.message) + '</span><small>' + esc(fmt(n.createdAt)) + '</small></button>';
        }).join('') : '<div class="tk-empty">You’re all caught up.</div>');
    }
    function markRead(ids) {
      if (!ids.length) return Promise.resolve();
      var b = db.batch();
      ids.forEach(function (id) { b.update(db.collection('techNotifications').doc(id), { read: true, readAt: FV().serverTimestamp() }); });
      return b.commit().catch(function (e) { console.warn('tech bell:', e); });
    }
    function toggle(on) { open = on; pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); paint(); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(!open); });
    document.addEventListener('click', function (e) { if (open && !host.contains(e.target)) toggle(false); });
    document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') toggle(false); });
    pop.addEventListener('click', function (e) {
      if (e.target.closest('[data-all]')) { markRead(unread().map(function (n) { return n.id; })); return; }
      var it = e.target.closest('[data-n]'); if (!it) return;
      var n = list.filter(function (x) { return x.id === it.dataset.n; })[0]; if (!n) return;
      markRead(n.read ? [] : [n.id]); toggle(false);
      if (o.onOpen && o.onOpen(n) === true) return;
      if (n.link && n.link.charAt(0) === '/' && location.pathname.replace(/\.html$/, '') !== n.link.split('#')[0]) location.href = n.link;
    });
    unsub = db.collection('techNotifications').where('recipientId', '==', o.uid).orderBy('createdAt', 'desc').limit(40)
      .onSnapshot(function (s) { list = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); paint(); },
        function (e) { console.warn('tech notifications:', e); });
    return { destroy: function () { if (unsub) unsub(); host.innerHTML = ''; } };
  }

  g.TechUI = {
    STATUSES: STATUSES, STATUS_LABEL: STATUS_LABEL,
    CATEGORIES: CATEGORIES, LEGACY_CATEGORIES: LEGACY_CATEGORIES,
    LEVELS: LEVELS, LEVEL_BLURB: LEVEL_BLURB, LEGACY_LEVELS: LEGACY_LEVELS,
    DISCIPLINES: DISCIPLINES, CREATION_TYPES: CREATION_TYPES, CREATION_LABEL: CREATION_LABEL,
    VISIBILITIES: VISIBILITIES, VISIBILITY_LABEL: VISIBILITY_LABEL,
    EMPTY_REFLECTION: EMPTY_REFLECTION,
    esc: esc, toDate: toDate, fmt: fmt, safeUrl: safeUrl, firstName: firstName, builderId: builderId, errMsg: errMsg,
    disciplinesOf: disciplinesOf, levelName: levelName, levelLabel: levelLabel,
    injectStyle: injectStyle, mountWorkspace: mountWorkspace, mountChat: mountChat, mountBell: mountBell,
    approveShowcase: approveShowcase, removeShowcase: removeShowcase, mintShareToken: mintShareToken,
    showcaseSnapshot: showcaseSnapshot, shareUrl: shareUrl, cleanHtml: cleanHtml,
    JOURNEY: JOURNEY, STATE_LABEL: STATE_LABEL, GRADES: GRADES, SELF_LED_LABEL: SELF_LED_LABEL, MISSION_LABEL: MISSION_LABEL,
    MATERIAL_TYPES: MATERIAL_TYPES, WORKSPACE_NAME: WORKSPACE_NAME,
    projectState: projectState, statePill: statePill, isSelfLed: isSelfLed, originLabel: originLabel, originTag: originTag,
    workspaceFor: workspaceFor, hasArtifact: hasArtifact, journeyOf: journeyOf, journeyHtml: journeyHtml,
    missionLock: missionLock, missionFor: missionFor, materialsHtml: materialsHtml, videoEmbed: videoEmbed,
    liveState: liveState, liveCardHtml: liveCardHtml, sortLive: sortLive, LIVE_LABEL: LIVE_LABEL,
    logActivity: logActivity, touchActive: touchActive, activityRows: activityRows, ago: ago, lastSeen: lastSeen
  };
})(window);