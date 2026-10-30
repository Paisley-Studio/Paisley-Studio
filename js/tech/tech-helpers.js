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
     TechUI.mountMission(host, opts)    the step-by-step mission player (brief → learn → practise →
                                        build) with the lesson video stage; used in the Mission tab
                                        and on the builder's mission page before they start
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
      '.tk-tabbar{display:flex;gap:.3rem;overflow-x:auto;scrollbar-width:none;padding:.35rem;margin:0 0 1rem;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:16px}',
      '.tk-tabbar::-webkit-scrollbar{display:none}',
      '.tk-tab{flex:none;padding:.55rem .95rem;border-radius:12px;border:0;background:transparent;color:var(--muted,#5A6E6A);font:inherit;font-weight:800;font-size:.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:.45rem;white-space:nowrap}',
      '.tk-tab:hover{color:var(--brand-deep,#245F5A);background:var(--sage,#E5F2EF)}',
      '.tk-tab.on{background:var(--brand-deep,#245F5A);color:#fff}',
      '.tk-tab .tk-pill{margin-left:.2rem}.tk-tab.on .tk-pill{background:rgba(255,255,255,.2);color:#fff}',
      '.tk-lbl{display:block;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A);margin-bottom:.35rem}',
      '.tk-btn.gold{background:#F5C842;border-color:#F5C842;color:#3b2f00}',
      /* Project header */
      '.ws-hero{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:22px;padding:1.3rem 1.5rem 1rem;margin-bottom:1rem;box-shadow:0 4px 18px rgba(36,95,90,.05)}',
      '.ws-top{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}',
      '.ws-title{display:block;width:calc(100% + .9rem);border:2px solid transparent;border-radius:12px;background:none;font:inherit;font-size:clamp(1.25rem,2.4vw,1.7rem);font-weight:800;letter-spacing:-.01em;color:var(--brand-deep,#245F5A);padding:.15rem .4rem;margin:.5rem 0 0 -.45rem}',
      '.ws-title:hover{border-color:var(--line,rgba(38,51,49,.12))}.ws-title:focus{outline:none;border-color:var(--brand,#55BFB3);background:var(--paper,#F1F9F7)}.ws-title[readonly]{border-color:transparent;background:none}',
      '.ws-meta{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;align-items:center;font-size:.82rem;color:var(--muted,#5A6E6A);font-weight:600;margin-top:.3rem}.ws-meta i{color:var(--brand-deep,#245F5A);margin-right:.3rem}',
      '.ws-prog{display:flex;align-items:center;gap:.6rem;flex:1;min-width:150px;max-width:260px}.ws-prog .tk-bar{flex:1}.ws-prog b{font-size:.8rem;color:var(--brand-deep,#245F5A)}',
      '.ws-settings{margin-top:.6rem;border-top:1px solid var(--line,rgba(38,51,49,.08));padding-top:.7rem}',
      '.ws-settings>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:.45rem;font-size:.78rem;font-weight:800;color:var(--brand-deep,#245F5A);padding:.4rem .75rem;border-radius:10px;background:var(--sage,#E5F2EF)}',
      '.ws-settings>summary::-webkit-details-marker{display:none}.ws-settings[open]>summary{margin-bottom:.9rem}',
      '.ws-set-grid{display:grid;gap:1rem}.ws-set-grid .tk-steps{margin:0}',
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
      '.tk-journey{list-style:none;display:grid;grid-template-columns:repeat(8,1fr);margin:1.1rem 0 .5rem;padding:0}',
      '.tk-journey li{position:relative;text-align:center;min-width:0}',
      '.tk-journey li::before{content:"";position:absolute;top:13px;left:-50%;width:100%;height:3px;background:var(--sage,#E5F2EF)}.tk-journey li:first-child::before{display:none}',
      '.tk-journey li.done::before,.tk-journey li.now::before{background:var(--brand-soft,#7BCBC2)}',
      '.tk-journey li span{position:relative;z-index:1;width:29px;height:29px;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--muted,#5A6E6A);font-size:.72rem;font-weight:800;border:3px solid var(--surface,#fff)}',
      '.tk-journey li.done span{background:var(--brand-soft,#7BCBC2);color:#04231f}.tk-journey li.now span{background:var(--brand-deep,#245F5A);color:#fff;box-shadow:0 0 0 4px rgba(36,95,90,.15)}',
      '.tk-journey li b{display:block;margin-top:.4rem;font-size:.62rem;font-weight:800;letter-spacing:.03em;color:var(--muted,#5A6E6A);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tk-journey li.now b{color:var(--brand-deep,#245F5A)}',
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
      /* Mission player */
      '.mp{display:flex;flex-direction:column;gap:1.1rem}',
      '.mp-hero{position:relative;overflow:hidden;border-radius:24px;padding:1.7rem 1.9rem;background:linear-gradient(135deg,#1c4f4a 0%,#245F5A 50%,#2f7d74 100%);color:#fff;display:flex;gap:1.5rem;align-items:center;box-shadow:0 16px 36px rgba(36,95,90,.2)}',
      '.mp-hero::before{content:"";position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(85,191,179,.22);top:-130px;right:-70px}',
      '.mp-hero::after{content:"";position:absolute;width:150px;height:150px;border-radius:50%;background:rgba(245,200,66,.16);bottom:-70px;right:150px}',
      '.mp-hero-in{position:relative;z-index:1;flex:1;min-width:0}',
      '.mp-hero-art{position:relative;z-index:1;flex:none;width:92px;height:92px;border-radius:26px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:2.3rem;color:#F5C842;transform:rotate(-6deg)}',
      '.mp-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem}',
      '.mp-chip{display:inline-flex;align-items:center;gap:.35rem;padding:.28rem .7rem;border-radius:99px;background:rgba(255,255,255,.14);color:#fff;font-size:.7rem;font-weight:800;letter-spacing:.04em}.mp-chip.gold{background:#F5C842;color:#3b2f00}',
      '.mp-title{font-size:clamp(1.4rem,2.6vw,2rem);line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:0;color:#fff}',
      '.mp-lede{margin:.55rem 0 0;color:#cdeee9;font-weight:600;font-size:1rem;max-width:62ch;line-height:1.5}',
      '.mp-hero-act{margin-top:1.1rem;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}.mp-hero-act .tk-btn{padding:.7rem 1.2rem;font-size:.9rem;border-radius:14px}',
      '.mp-lock{display:inline-flex;align-items:center;gap:.5rem;margin:0;padding:.55rem .9rem;border-radius:12px;background:rgba(255,255,255,.12);font-weight:700;font-size:.88rem}',
      '.mp-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.6rem}',
      '.mp-step{display:flex;align-items:center;gap:.7rem;padding:.7rem .85rem;border-radius:16px;border:2px solid var(--line,rgba(38,51,49,.1));background:var(--surface,#fff);font:inherit;text-align:left;cursor:pointer;color:var(--ink,#263331);transition:border-color .15s,background .15s}',
      '.mp-step:hover{border-color:var(--brand,#55BFB3)}',
      '.mp-step .n{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:.92rem;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.mp-step .l{min-width:0}.mp-step .l small{display:block;font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#5A6E6A)}.mp-step .l b{display:block;font-size:.92rem;font-weight:800;color:var(--brand-deep,#245F5A);line-height:1.2}',
      '.mp-step.done .n{background:#2EB872;color:#fff}',
      '.mp-step.on{border-color:var(--brand-deep,#245F5A);background:var(--brand-deep,#245F5A)}.mp-step.on .n{background:#F5C842;color:#3b2f00}.mp-step.on .l small{color:#9fd9d1}.mp-step.on .l b{color:#fff}',
      '.mp-body{min-width:0}',
      '.mp-cols{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:1rem;align-items:start}',
      '.mp-main,.mp-side{display:flex;flex-direction:column;gap:1rem;min-width:0}',
      '.mp-card{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:20px;padding:1.25rem 1.4rem;box-shadow:0 4px 18px rgba(36,95,90,.05)}',
      '.mp-card h3{display:flex;align-items:center;gap:.65rem;margin:0 0 .8rem;font-size:1.02rem;font-weight:800;color:var(--brand-deep,#245F5A)}',
      '.mp-card h3 i{width:36px;height:36px;flex:none;border-radius:12px;display:grid;place-items:center;background:var(--sage,#E5F2EF);font-size:.95rem}',
      '.mp-card.accent{background:linear-gradient(180deg,#F0FAF8,#fff);border-color:rgba(85,191,179,.5)}.mp-card.accent h3 i{background:var(--brand,#55BFB3);color:#04231f}',
      '.mp-card.sun{background:#FFFBEA;border-color:rgba(245,200,66,.55)}.mp-card.sun h3 i{background:#F5C842;color:#3b2f00}',
      '.mp-prose{white-space:pre-wrap;line-height:1.7;font-size:.95rem;color:var(--ink,#263331);max-width:68ch;font-weight:500;margin:0}',
      '.mp-big{white-space:pre-wrap;font-size:1.05rem;line-height:1.6;font-weight:700;color:var(--ink,#263331);margin:0}',
      '.mp-route{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.6rem}',
      '.mp-route li{display:flex;gap:.65rem;align-items:center;font-size:.9rem;font-weight:800;color:var(--ink,#263331)}.mp-route li span{color:var(--muted,#5A6E6A);font-weight:600}',
      '.mp-route li>i{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:.8rem;flex:none}',
      '.mp-learn{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:1rem;align-items:start}',
      '.mp-stage-col{display:flex;flex-direction:column;gap:.9rem;min-width:0}',
      '.mp-stage{background:#0d1a18;border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(13,26,24,.22)}',
      '.mp-stage-bar{display:flex;align-items:center;gap:.5rem;padding:.6rem .7rem .6rem 1rem;color:#e6f5f2}',
      '.mp-stage-bar>b{flex:1;min-width:0;font-size:.86rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-stage-bar>b i{color:#F5C842;margin-right:.4rem}',
      '.mp-sbtn{display:inline-flex;align-items:center;gap:.4rem;border:0;border-radius:10px;padding:.45rem .75rem;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer;white-space:nowrap}',
      '.mp-sbtn:hover{background:rgba(255,255,255,.2)}.mp-sbtn.mp-close{background:#F5C842;color:#3b2f00}',
      '.mp-stage:not(.theatre) .mp-close{display:none}.mp-stage.theatre .mp-sbtn[data-mp-theatre]{display:none}',
      '.mp-frame{position:relative;aspect-ratio:16/9;background:#000;display:grid;place-items:center;overflow:hidden}',
      '.mp-frame video,.mp-frame iframe,.mp-frame img{position:absolute;inset:0;width:100%;height:100%;border:0}.mp-frame video,.mp-frame img{object-fit:contain}',
      '.mp-frame.img{background:#0d1a18;cursor:zoom-in}.mp-stage.theatre .mp-frame.img{cursor:default}',
      '.mp-frame.doc{aspect-ratio:auto;height:min(70vh,640px);background:#fff}.mp-frame.doc iframe{background:#fff}',
      '.mp-frame.card{aspect-ratio:auto;min-height:240px;background:linear-gradient(135deg,#245F5A,#2f7d74);padding:2rem 1.2rem;text-align:center;color:#fff}',
      '.mp-doc{display:flex;flex-direction:column;align-items:center;gap:.7rem;max-width:420px}.mp-doc>i{font-size:2.8rem;color:#F5C842}.mp-doc b{font-size:1.1rem}.mp-doc p{margin:0;color:#cdeee9;font-size:.9rem;font-weight:600}',
      '.mp-stage.theatre{position:fixed;inset:0;z-index:10000;border-radius:0;background:rgba(6,14,13,.95);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:1rem 1.5rem 1.5rem;box-shadow:none}',
      '.mp-stage.theatre .mp-stage-bar{width:min(1200px,100%);padding-left:.2rem;padding-right:0}',
      '.mp-stage.theatre .mp-frame{width:min(1200px,100%,calc((100vh - 120px) * 16 / 9));border-radius:14px}',
      '.mp-stage.theatre .mp-frame.doc,.mp-stage.theatre .mp-frame.card{width:min(1200px,100%);height:calc(100vh - 110px)}',
      '.mp-stage:fullscreen{background:#000;display:flex;flex-direction:column;border-radius:0}.mp-stage:fullscreen .mp-frame{flex:1;width:100%;aspect-ratio:auto;height:auto}',
      '.mp-stage:-webkit-full-screen{background:#000;display:flex;flex-direction:column;border-radius:0;width:100%;height:100%}.mp-stage:-webkit-full-screen .mp-frame{flex:1;width:100%;aspect-ratio:auto;height:auto}',
      '.mp-info{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:20px;padding:1.15rem 1.35rem}',
      '.mp-info-top{display:flex;gap:1rem;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
      '.mp-info h3{margin:.4rem 0 0;font-size:1.18rem;font-weight:800;color:var(--brand-deep,#245F5A);line-height:1.25}',
      '.mp-info-desc{margin:.6rem 0 0;color:var(--muted,#5A6E6A);font-size:.93rem;line-height:1.6;white-space:pre-wrap;font-weight:500}',
      '.mp-tip{display:flex;gap:.6rem;margin-top:.85rem;padding:.75rem .9rem;border-radius:14px;background:#FFFBEA;border:1px solid rgba(245,200,66,.5);font-size:.88rem;line-height:1.5;white-space:pre-wrap;color:#5c4500;font-weight:600}.mp-tip i{margin-top:.2rem}',
      '.mp-done-tag{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem .85rem;border-radius:99px;background:rgba(46,184,114,.14);color:#1d8b57;font-weight:800;font-size:.82rem}',
      '.mp-matnav{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:1rem;padding-top:.9rem;border-top:1px solid var(--line,rgba(38,51,49,.08))}.mp-matnav span{font-size:.78rem;font-weight:800;color:var(--muted,#5A6E6A)}',
      '.mp-playlist{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:20px;padding:1rem;position:sticky;top:90px;max-height:calc(100vh - 110px);overflow:auto}',
      '.mp-pl-head{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;margin-bottom:.55rem}.mp-pl-head b{color:var(--brand-deep,#245F5A);font-size:.95rem}.mp-pl-head span{font-size:.74rem;font-weight:800;color:var(--muted,#5A6E6A)}',
      '.mp-pl{list-style:none;margin:.8rem 0 0;padding:0;display:flex;flex-direction:column;gap:.3rem}',
      '.mp-pl-item{display:flex;gap:.65rem;align-items:center;width:100%;text-align:left;padding:.5rem .55rem;border-radius:14px;border:2px solid transparent;background:none;font:inherit;cursor:pointer;color:var(--ink,#263331)}',
      '.mp-pl-item:hover{background:var(--paper,#F1F9F7)}.mp-pl-item.on{border-color:var(--brand,#55BFB3);background:rgba(85,191,179,.08)}',
      '.mp-pl-ico{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);font-size:.95rem}',
      '.mp-pl-item.done .mp-pl-ico{background:rgba(46,184,114,.15);color:#1d8b57}.mp-pl-item.on .mp-pl-ico{background:var(--brand-deep,#245F5A);color:#fff}',
      '.mp-pl-t{min-width:0}.mp-pl-t b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.86rem;font-weight:800;line-height:1.25}.mp-pl-t small{display:block;font-size:.7rem;color:var(--muted,#5A6E6A);font-weight:700;margin-top:2px}',
      '.mp-res{margin-top:1rem;padding-top:.9rem;border-top:1px solid var(--line,rgba(38,51,49,.08))}.mp-res a{display:flex;gap:.55rem;align-items:center;padding:.45rem .3rem;font-size:.85rem;font-weight:700;color:var(--brand-deep,#245F5A);word-break:break-word;text-decoration:none;border-radius:10px}.mp-res a:hover{background:var(--paper,#F1F9F7)}',
      '.mp-prac{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}',
      '.mp-pcard{display:flex;flex-direction:column;gap:.7rem;background:var(--surface,#fff);border:2px solid var(--line,rgba(38,51,49,.1));border-radius:20px;padding:1.25rem}.mp-pcard.done{border-color:rgba(46,184,114,.45)}',
      '.mp-pnum{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:#F5C842;color:#3b2f00;font-weight:800;font-size:1.05rem}.mp-pcard.done .mp-pnum{background:#2EB872;color:#fff}',
      '.mp-ptype{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#5A6E6A)}',
      '.mp-pcard h3{margin:.15rem 0 0;font-size:1.05rem;font-weight:800;color:var(--brand-deep,#245F5A)}.mp-pcard p{margin:.35rem 0 0;font-size:.9rem;line-height:1.55;color:var(--ink,#263331);white-space:pre-wrap;font-weight:500}',
      '.mp-pact{margin-top:auto}',
      '.mp-hint{display:flex;gap:.5rem;align-items:center;margin:.9rem 0 0;font-size:.88rem;font-weight:700;color:var(--muted,#5A6E6A)}',
      '.mp-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.55rem}',
      '.mp-checks li{display:flex;gap:.7rem;align-items:flex-start;padding:.75rem .9rem;border-radius:14px;background:var(--paper,#F1F9F7);font-size:.92rem;line-height:1.45}.mp-checks li>i{color:#E8A33D;margin-top:.2rem}.mp-checks li b{color:var(--brand-deep,#245F5A)}',
      '.mp-foot{position:sticky;bottom:.6rem;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.7rem .8rem;border-radius:18px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--line,rgba(38,51,49,.1));box-shadow:0 8px 28px rgba(36,95,90,.12)}',
      '.mp-foot-n{font-size:.8rem;font-weight:800;color:var(--muted,#5A6E6A)}',
      '.mp-foot .tk-btn{padding:.72rem 1.2rem;font-size:.9rem;border-radius:14px}.mp-foot .mp-lock{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '@media(max-width:1000px){.mp-learn{grid-template-columns:1fr}.mp-playlist{position:static;max-height:none}}',
      '@media(max-width:760px){.mp-cols{grid-template-columns:1fr}.mp-hero{padding:1.3rem}.mp-hero-art{display:none}.mp-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.mp-sbtn span{display:none}.mp-foot-n{display:none}.mp-foot .tk-btn{padding:.65rem .9rem;font-size:.84rem}.mp-card,.mp-info{padding:1rem 1.05rem}.ws-hero{padding:1.1rem 1.1rem .9rem}}',
      '@media(max-width:420px){.mp-step .l small{display:none}.mp-step{padding:.6rem}.mp-step .n{width:30px;height:30px}}',
      '@media(max-width:560px){.tk-msg{max-width:92%}.tk-step{min-width:60px;font-size:.62rem}.tk-tab{font-size:.72rem;padding:.45rem .7rem}.tk-journey li b{display:none}.tk-journey li.now b{display:block;white-space:nowrap;overflow:visible}.tk-live{flex-wrap:wrap}.tk-live-act{align-items:flex-start}}',
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
      return '<li class="' + cls + '"' + (i === j.step ? ' aria-current="step"' : '') + '><span>' + (cls === 'done' ? '<i class="fas fa-check"></i>' : (i + 1)) + '</span><b>' + (k === 'REVIEW' ? 'Coach review' : k.charAt(0) + k.slice(1).toLowerCase()) + '</b></li>';
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

  /* =========================================================
     Mission player — one mission, one step at a time:
       Mission brief → Learn → Practise → Build & submit
     Learn is a lesson player: the current material sits in a 16:9
     stage (Enlarge, Full screen, Close) with the playlist beside it,
     in the order the coach set. Uploaded videos play without a
     download option (that only hides the button; the file URL is
     still reachable by a determined user).

     TechUI.mountMission(host, {
       mission, track (count materials towards LEARN),
       isSeen(id), isPracticed(i), onSeen(id, video), onPlay(id),
       onPractice(i) (omit to show practice read-only), practiceNote,
       heroAction: html, cta: { html } | { label, icon, onClick },
       compact (inside a project: no hero), state: {} kept across mounts })
     → { update(), destroy() }
     ========================================================= */
  var MAT_ICON = { video: 'fa-circle-play', document: 'fa-file-lines', image: 'fa-image', link: 'fa-link', example: 'fa-lightbulb' };
  var PRACTICE_LABEL = { code: 'Coding experiment', writing: 'Writing practice', research: 'Research activity', ai: 'AI exploration' };
  function isPdf(x) { return x.contentType === 'application/pdf' || /\.pdf(\?|$)/i.test(x.path || x.url || ''); }
  function mountMission(host, o) {
    injectStyle();
    var m = o.mission || {}, state = o.state || {}, dead = false;
    var mats = (m.materials || []).filter(function (x) { return x && (safeUrl(x.url) || x.title || x.notes); });
    var res = (m.resources || []).filter(function (r) { return safeUrl(r.url); });
    var prac = m.practice || [];
    var isSeen = function (id) { return !!(o.isSeen && id && o.isSeen(id)); };
    var isPracticed = function (i) { return !!(o.isPracticed && o.isPracticed(i)); };
    var steps = [{ k: 'brief', icon: 'fa-flag', label: 'Mission brief' }];
    if (mats.length || res.length) steps.push({ k: 'learn', icon: 'fa-play', label: 'Learn' });
    if (prac.length) steps.push({ k: 'practice', icon: 'fa-flask', label: 'Practise' });
    steps.push({ k: 'build', icon: 'fa-hammer', label: 'Build & submit' });
    var keys = steps.map(function (s) { return s.k; });
    if (keys.indexOf(state.step) === -1) state.step = 'brief';
    if (!(state.mat >= 0 && state.mat < mats.length)) state.mat = 0;
    var discs = Array.isArray(m.disciplines) ? m.disciplines : (m.discipline ? [m.discipline] : []);
    var ws = WORKSPACE_NAME[workspaceFor(m.creationType)];

    function card(icon, title, html, tone) { return '<section class="mp-card ' + (tone || '') + '"><h3><i class="fas ' + icon + '"></i> ' + esc(title) + '</h3>' + html + '</section>'; }
    function seenCount() { return mats.filter(function (x) { return isSeen(x.id); }).length; }
    function stepDone(k) {
      if (!o.track) return false;
      if (k === 'learn') { var req = mats.filter(function (x) { return x.required; }); return mats.length > 0 && (req.length ? req : mats).every(function (x) { return isSeen(x.id); }); }
      if (k === 'practice') return prac.some(function (p, i) { return isPracticed(i); });
      return false;
    }
    function stepsHtml() {
      return steps.map(function (s, i) {
        var on = s.k === state.step, done = !on && stepDone(s.k);
        return '<button type="button" class="mp-step' + (on ? ' on' : '') + (done ? ' done' : '') + '" data-mp-step="' + s.k + '"' + (on ? ' aria-current="step"' : '') + '>' +
          '<span class="n">' + (done ? '<i class="fas fa-check"></i>' : (i + 1)) + '</span><span class="l"><small>Step ' + (i + 1) + '</small><b>' + esc(s.label) + '</b></span></button>';
      }).join('');
    }
    function hero() {
      if (o.compact) return '';
      var chips = [m.kind === 'challenge' ? 'Challenge' : 'Mission'];
      if (m.level) chips.push(cap1(LEVELS[Math.max(1, Math.min(7, m.level)) - 1]));
      chips = chips.concat(discs);
      return '<header class="mp-hero"><div class="mp-hero-in"><div class="mp-chips">' + chips.map(function (c) { return '<span class="mp-chip">' + esc(c) + '</span>'; }).join('') +
          (m.deadline ? '<span class="mp-chip gold"><i class="fas fa-calendar"></i> Due ' + esc(m.deadline) + '</span>' : '') + '</div>' +
          '<h2 class="mp-title">' + esc(m.title || 'Mission') + '</h2>' + (m.summary ? '<p class="mp-lede">' + esc(m.summary) + '</p>' : '') +
          (o.heroAction ? '<div class="mp-hero-act">' + o.heroAction + '</div>' : '') +
        '</div><div class="mp-hero-art" aria-hidden="true"><i class="fas ' + (m.kind === 'challenge' ? 'fa-trophy' : 'fa-rocket') + '"></i></div></header>';
    }

    /* ---- steps ---- */
    function briefStep() {
      var route = steps.slice(1).map(function (s) {
        var extra = s.k === 'learn' ? (mats.length + ' lesson material' + (mats.length === 1 ? '' : 's')) : s.k === 'practice' ? (prac.length + ' activit' + (prac.length === 1 ? 'y' : 'ies') + ', never graded') : ('in the ' + ws);
        return '<li><i class="fas ' + s.icon + '"></i><div>' + esc(s.label) + ' <span>· ' + esc(extra) + '</span></div></li>';
      }).join('');
      var task = m.brief || (o.compact ? m.summary : '');
      return '<div class="mp-cols"><div class="mp-main">' +
          (task ? card('fa-bullseye', 'Your task', '<p class="mp-big">' + esc(task) + '</p>', 'accent') : '') +
          (m.body ? card('fa-list-check', 'Instructions', '<p class="mp-prose">' + esc(m.body) + '</p>') : '') +
          (!task && !m.body ? card('fa-bullseye', 'Your task', '<p class="mp-prose">Your coach will add the details soon. Start with the lesson materials.</p>', 'accent') : '') +
        '</div><div class="mp-side">' +
          (m.objectives ? card('fa-lightbulb', 'What you will learn', '<p class="mp-prose">' + esc(m.objectives) + '</p>', 'sun') : '') +
          card('fa-route', 'Your route', '<ol class="mp-route">' + route + '</ol>') +
        '</div></div>';
    }
    function frameHtml(x) {
      var url = safeUrl(x.url), type = x.type || 'link', id = esc(x.id || ''), title = esc(x.title || 'Material');
      if (type === 'video' && url) {
        var emb = videoEmbed(url);
        if (emb) return '<div class="mp-frame"><iframe src="' + esc(emb) + '" title="' + title + '" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
        return '<div class="mp-frame"><video src="' + esc(url) + '" controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsinline preload="metadata" data-mp-video="' + id + '"></video></div>';
      }
      if (type === 'image' && url) return '<div class="mp-frame img" data-mp-theatre><img src="' + esc(url) + '" alt="' + title + '"></div>';
      if (url && isPdf(x)) return '<div class="mp-frame doc"><iframe src="' + esc(url) + '#toolbar=0" title="' + title + '"></iframe></div>';
      var icon = type === 'document' ? 'fa-file-lines' : type === 'example' ? 'fa-lightbulb' : 'fa-link';
      return '<div class="mp-frame card"><div class="mp-doc"><i class="fas ' + icon + '"></i><b>' + title + '</b>' +
        (url ? '<p>Opens in a new tab.</p><a class="tk-btn gold" href="' + esc(url) + '" target="_blank" rel="noopener" data-mp-open="' + id + '"><i class="fas fa-arrow-up-right-from-square"></i> Open ' + esc((MATERIAL_TYPES[type] || 'resource').toLowerCase()) + '</a>' : '<p>Read your coach’s notes below.</p>') +
        '</div></div>';
    }
    function stageHtml() {
      var x = mats[state.mat], type = x.type || 'link', media = safeUrl(x.url) && (type === 'video' || type === 'image' || isPdf(x));
      return '<div class="mp-stage" data-mp-stage><div class="mp-stage-bar"><b><i class="fas ' + (MAT_ICON[type] || 'fa-book') + '"></i>' + esc(x.title || 'Material') + '</b>' +
          (media ? '<button type="button" class="mp-sbtn" data-mp-theatre title="Enlarge"><i class="fas fa-expand"></i><span>Enlarge</span></button>' +
            '<button type="button" class="mp-sbtn" data-mp-full title="Full screen"><i class="fas fa-maximize"></i><span>Full screen</span></button>' : '') +
          '<button type="button" class="mp-sbtn mp-close" data-mp-close title="Close"><i class="fas fa-xmark"></i><span>Close</span></button></div>' +
        frameHtml(x) + '</div>';
    }
    function infoHtml() {
      var x = mats[state.mat], seen = isSeen(x.id);
      return '<div class="mp-info"><div class="mp-info-top"><div><span class="tk-pill ' + (x.required ? 'warn' : '') + '">' + (x.required ? 'Required' : 'Optional') + '</span> <span class="tk-pill">' + esc(MATERIAL_TYPES[x.type] || 'Resource') + '</span>' +
          '<h3>' + esc(x.title || 'Material') + '</h3></div>' +
          (o.track ? (seen ? '<span class="mp-done-tag"><i class="fas fa-circle-check"></i> Done</span>' : '<button type="button" class="tk-btn primary" data-mp-done><i class="fas fa-check"></i> Mark as done</button>') : '') + '</div>' +
        (x.description ? '<p class="mp-info-desc">' + esc(x.description) + '</p>' : '') +
        (x.notes ? '<div class="mp-tip"><i class="fas fa-comment-dots"></i><div>' + esc(x.notes) + '</div></div>' : '') +
        '<div class="mp-matnav"><button type="button" class="tk-btn" data-mp-mat="-1"' + (state.mat === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-left"></i> Previous</button>' +
          '<span>' + (state.mat + 1) + ' of ' + mats.length + '</span>' +
          '<button type="button" class="tk-btn dark" data-mp-mat="1"' + (state.mat === mats.length - 1 ? ' disabled' : '') + '>Next <i class="fas fa-arrow-right"></i></button></div></div>';
    }
    function listHtml() {
      var n = seenCount();
      return '<div class="mp-pl-head"><b>Lesson materials</b><span>' + (o.track ? n + ' / ' + mats.length + ' done' : mats.length + ' item' + (mats.length === 1 ? '' : 's')) + '</span></div>' +
        (o.track ? '<div class="tk-bar"><i style="width:' + Math.round(n / Math.max(1, mats.length) * 100) + '%"></i></div>' : '') +
        '<ol class="mp-pl">' + mats.map(function (x, i) {
          var done = o.track && isSeen(x.id);
          return '<li><button type="button" class="mp-pl-item' + (i === state.mat ? ' on' : '') + (done ? ' done' : '') + '" data-mp-goto="' + i + '"' + (i === state.mat ? ' aria-current="true"' : '') + '>' +
            '<span class="mp-pl-ico"><i class="fas ' + (done ? 'fa-circle-check' : (MAT_ICON[x.type] || 'fa-book')) + '"></i></span>' +
            '<span class="mp-pl-t"><b>' + (i + 1) + '. ' + esc(x.title || 'Material') + '</b><small>' + esc(MATERIAL_TYPES[x.type] || 'Resource') + (x.required ? ' · Required' : '') + '</small></span></button></li>';
        }).join('') + '</ol>';
    }
    function learnStep() {
      var more = res.length ? '<div class="mp-res"><div class="mp-pl-head"><b>More resources</b></div>' + res.map(function (r) { return '<a href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener"><i class="fas fa-link"></i> ' + esc(r.title || r.url) + '</a>'; }).join('') + '</div>' : '';
      if (!mats.length) return '<div class="mp-card">' + more + '</div>';
      return '<div class="mp-learn"><div class="mp-stage-col"><div data-mp-stagehost>' + stageHtml() + '</div><div data-mp-info>' + infoHtml() + '</div></div>' +
        '<aside class="mp-playlist"><div data-mp-list>' + listHtml() + '</div>' + more + '</aside></div>';
    }
    function practiceStep() {
      return '<div class="mp-prac">' + prac.map(function (p, i) {
        var done = o.track && isPracticed(i);
        return '<article class="mp-pcard' + (done ? ' done' : '') + '"><div class="mp-pnum">' + (done ? '<i class="fas fa-check"></i>' : (i + 1)) + '</div>' +
          '<div><span class="mp-ptype">' + esc(PRACTICE_LABEL[p.type] || 'Practice') + '</span><h3>' + esc(p.title || ('Practice ' + (i + 1))) + '</h3>' + (p.instructions ? '<p>' + esc(p.instructions) + '</p>' : '') + '</div>' +
          (o.onPractice ? '<div class="mp-pact"><button type="button" class="tk-btn ' + (done ? '' : 'primary') + '" data-mp-prac="' + i + '"><i class="fas fa-flask"></i> ' + (done ? 'Practise again' : 'Start practice') + '</button></div>' : '') + '</article>';
      }).join('') + '</div>' + (o.practiceNote ? '<p class="mp-hint"><i class="fas fa-circle-info"></i> ' + esc(o.practiceNote) + '</p>' : '<p class="mp-hint"><i class="fas fa-circle-info"></i> Practice is never graded. Try things out and have fun.</p>');
    }
    function buildStep() {
      var crit = (m.criteria || []).filter(function (c) { return c && c.name; }).map(function (c) { return '<li><i class="fas fa-star"></i><div><b>' + esc(c.name) + '</b>' + (c.description ? ' — ' + esc(c.description) : '') + '</div></li>'; }).join('');
      var tools = (m.aiTools || []).map(function (t) { var u = safeUrl(t.url); return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ' + esc(t.name || 'Tool') + '</a>' : '<span>' + esc(t.name || 'Tool') + '</span>'; }).join('');
      return '<div class="mp-cols"><div class="mp-main">' +
          card('fa-box-open', 'What to submit', '<p class="mp-big">' + esc(m.submissionReq || ('Build it in the ' + ws + ', then submit it with your AI reflection.')) + '</p>', 'accent') +
          (crit ? card('fa-star', 'How it will be assessed', '<ul class="mp-checks">' + crit + '</ul>') : '') +
        '</div><div class="mp-side">' +
          card('fa-robot', 'AI tools', (tools ? '<div class="tk-ai-tools">' + tools + '</div>' : '<p class="mp-prose">Ask your coach before using AI on this mission.</p>') + (m.aiRules ? '<div class="mp-tip"><i class="fas fa-shield-halved"></i><div>' + esc(m.aiRules) + '</div></div>' : ''), 'sun') +
        '</div></div>';
    }
    function bodyHtml() { return ({ brief: briefStep, learn: learnStep, practice: practiceStep, build: buildStep })[state.step](); }
    function footHtml() {
      var i = keys.indexOf(state.step), prev = steps[i - 1], next = steps[i + 1], cta = '';
      if (!next && o.cta) cta = o.cta.html || '<button type="button" class="tk-btn primary" data-mp-cta><i class="fas ' + (o.cta.icon || 'fa-arrow-right') + '"></i> ' + esc(o.cta.label) + '</button>';
      return '<footer class="mp-foot">' + (prev ? '<button type="button" class="tk-btn" data-mp-nav="-1"><i class="fas fa-arrow-left"></i> ' + esc(prev.label) + '</button>' : '<span></span>') +
        '<span class="mp-foot-n">Step ' + (i + 1) + ' of ' + steps.length + '</span>' +
        (next ? '<button type="button" class="tk-btn primary" data-mp-nav="1">Next: ' + esc(next.label) + ' <i class="fas fa-arrow-right"></i></button>' : (cta || '<span></span>')) + '</footer>';
    }

    /* ---- painting ---- */
    function render() {
      leaveTheatre();
      host.innerHTML = '<div class="mp' + (o.compact ? ' compact' : '') + '">' + hero() + '<nav class="mp-steps" data-mp-steps aria-label="Mission steps">' + stepsHtml() + '</nav>' +
        '<div class="mp-body">' + bodyHtml() + '</div>' + footHtml() + '</div>';
      wireMedia();
    }
    function part(sel, html) { var el = host.querySelector(sel); if (el) el.innerHTML = html; }
    function refresh() {
      if (dead) return;
      part('[data-mp-steps]', stepsHtml());
      if (state.step === 'learn' && mats.length) { part('[data-mp-list]', listHtml()); part('[data-mp-info]', infoHtml()); }
      if (state.step === 'practice') { var b = host.querySelector('.mp-body'); if (b) b.innerHTML = practiceStep(); }
    }
    function showMat(i) {
      if (i < 0 || i >= mats.length || i === state.mat) return;
      leaveTheatre(); state.mat = i;
      part('[data-mp-stagehost]', stageHtml()); part('[data-mp-info]', infoHtml()); part('[data-mp-list]', listHtml());
      wireMedia();
      var stg = host.querySelector('[data-mp-stage]');
      if (stg && stg.getBoundingClientRect().top < 70) window.scrollTo({ top: stg.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    }
    function go(k) {
      if (keys.indexOf(k) === -1) return;
      state.step = k; render();
      var top = host.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    function markSeen(id, video) {
      if (!o.track || !id || isSeen(id)) return;
      if (o.onSeen) o.onSeen(id, video);
      refresh();
    }
    function wireMedia() {
      var v = host.querySelector('video[data-mp-video]'); if (!v) return;
      var id = v.dataset.mpVideo;
      v.addEventListener('play', function () { if (o.onPlay) o.onPlay(id); }, { once: true });
      v.addEventListener('timeupdate', function () { if (v.duration && v.currentTime / v.duration > 0.8 && !v._done) { v._done = true; markSeen(id, true); } });
    }

    /* ---- enlarge / full screen ---- */
    function stage() { return host.querySelector('[data-mp-stage]'); }
    function enterTheatre() { var s = stage(); if (!s) return; s.classList.add('theatre'); document.documentElement.style.overflow = 'hidden'; var c = s.querySelector('[data-mp-close]'); if (c) c.focus(); }
    function leaveTheatre() {
      var s = stage(); if (s) s.classList.remove('theatre');
      document.documentElement.style.overflow = '';
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs && host.contains(fs)) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    function fullScreen() {
      var s = stage(); if (!s) return;
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      var v = s.querySelector('video');
      if (s.requestFullscreen) s.requestFullscreen().catch(function () { enterTheatre(); });
      else if (s.webkitRequestFullscreen) s.webkitRequestFullscreen();
      else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();   // iPhone
      else enterTheatre();
    }
    function onKey(e) { if (e.key === 'Escape') { var s = stage(); if (s && s.classList.contains('theatre')) leaveTheatre(); } }
    function onClick(e) {
      var t = e.target.closest('[data-mp-step],[data-mp-nav],[data-mp-goto],[data-mp-mat],[data-mp-done],[data-mp-open],[data-mp-theatre],[data-mp-full],[data-mp-close],[data-mp-prac],[data-mp-cta]');
      if (!t || !host.contains(t)) return;
      var d = t.dataset;
      if (d.mpStep) go(d.mpStep);
      else if (d.mpNav) go(keys[keys.indexOf(state.step) + Number(d.mpNav)]);
      else if (d.mpGoto) showMat(Number(d.mpGoto));
      else if (d.mpMat) showMat(state.mat + Number(d.mpMat));
      else if (d.mpDone !== undefined) { var x = mats[state.mat]; markSeen(x && x.id, x && x.type === 'video'); }
      else if (d.mpOpen !== undefined) markSeen(d.mpOpen, false);
      else if (d.mpTheatre !== undefined) { if (!stage().classList.contains('theatre')) enterTheatre(); }
      else if (d.mpFull !== undefined) fullScreen();
      else if (d.mpClose !== undefined) leaveTheatre();
      else if (d.mpPrac) { if (o.onPractice) o.onPractice(Number(d.mpPrac)); }
      else if (d.mpCta !== undefined) { if (o.cta && o.cta.onClick) o.cta.onClick(); }
    }
    /* No "Save video as…" on the lesson stage. */
    function onMenu(e) { if (e.target.closest('[data-mp-stage]')) e.preventDefault(); }
    host.addEventListener('click', onClick);
    host.addEventListener('contextmenu', onMenu);
    document.addEventListener('keydown', onKey);
    render();
    return {
      update: refresh,
      destroy: function () {
        if (dead) return; dead = true; leaveTheatre();
        host.removeEventListener('click', onClick); host.removeEventListener('contextmenu', onMenu); document.removeEventListener('keydown', onKey);
        var v = host.querySelector('video'); if (v) { try { v.pause(); } catch (e) { } }
      }
    };
  }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

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
    function canRepaint() { return !editing() && MODULE_TABS.indexOf(activeTab) === -1 && !(activeTab === 'mission' && mounted.mission); }
    function repaint() { if (!rendered || canRepaint()) { stale = false; render(); } else { stale = true; renderFb(); if (mounted.mission) mounted.mission.update(); } }
    var mounted = { writing: null, code: null, upload: null, mission: null };
    var missionState = {}, settingsOpen = false;

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
    function practiced(i) { return (b.practiceIds || []).some(function (x) { return String(x).indexOf('m' + i + '_') === 0 || x === ('m' + i); }); }
    /* Study materials: opening or finishing one counts towards LEARN. */
    function seenMat(id, video) {
      if (!isStu || !id) return;
      var mat = ((mission && mission.materials) || []).filter(function (x) { return x.id === id; })[0];
      act(video ? 'video_watched' : 'material_opened', (video ? 'Watched ' : 'Opened ') + ((mat && mat.title) || 'study material'), { materialId: id, missionId: mission && mission.id });
      if ((b.materialsSeen || []).indexOf(id) === -1) {
        b.materialsSeen = (b.materialsSeen || []).concat([id]);
        ref.update({ materialsSeen: FV().arrayUnion(id), updatedAt: FV().serverTimestamp() }).catch(function () { });
      }
    }
    function mountMissionTab() {
      var el = host.querySelector('#wsMissionHost'); if (!el || !mission) return;
      var pt = primaryTab();
      mounted.mission = mountMission(el, {
        mission: mission, compact: true, track: isStu, state: missionState,
        isSeen: function (id) { return (b.materialsSeen || []).indexOf(id) !== -1; },
        isPracticed: practiced,
        onSeen: seenMat,
        onPlay: function (id) { act('material_opened', 'Started a video', { materialId: id }); },
        onPractice: isStu && o.onPractice ? function (i) { o.onPractice((mission.practice || [])[i], mission, b, i); } : null,
        practiceNote: isStu ? '' : 'Builders open these from their own project. Practice is never graded.',
        cta: isStu ? { label: 'Start building in the ' + WORKSPACE_NAME[pt], icon: 'fa-hammer', onClick: function () { switchTab(pt); window.scrollTo(0, host.getBoundingClientRect().top + window.scrollY - 80); } } : null
      });
    }
    function unmountTabModules() {
      if (mounted.mission) { mounted.mission.destroy(); mounted.mission = null; }
      ['writing', 'code', 'upload'].forEach(function (k) { if (mounted[k]) { try { mounted[k].destroy(); } catch (e) { } mounted[k] = null; } });
    }

    /* ---------- panes ---------- */
    function missionPane() { return mission ? '<div id="wsMissionHost"></div>' : ''; }

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

      var prog = Math.max(0, Math.min(100, Number(b.progress) || 0));
      host.innerHTML = banner +
        '<div class="ws-hero">' +
          '<div class="ws-top">' + originTag(b) + statePill(b) + gradeLine(b) +
            (b.showcase === 'approved' ? '<span class="tk-pill gold"><i class="fas fa-globe"></i> Published</span>' : '') + '</div>' +
          '<input id="wsTitle" class="ws-title" maxlength="120" aria-label="Project title" value="' + esc(b.title) + '"' + (canEdit ? '' : ' readonly') + '>' +
          '<div class="ws-meta"><span><i class="fas fa-user"></i>' + esc(b.displayName || b.studentName || '') + '</span>' +
            (b.coachName ? '<span><i class="fas fa-chalkboard-user"></i>Coach ' + esc(b.coachName) + '</span>' : '') +
            '<span><i class="fas fa-toolbox"></i>' + esc(WORKSPACE_NAME[pt]) + '</span>' +
            '<span class="ws-prog"><span class="tk-bar"><i style="width:' + prog + '%"></i></span><b>' + prog + '%</b></span></div>' +
          journeyHtml(b, mission) +
          '<details class="ws-settings"' + (settingsOpen ? ' open' : '') + '><summary><i class="fas fa-sliders"></i> Project settings</summary><div class="ws-set-grid">' +
            '<div class="tk-f" style="margin:0;max-width:280px"><label for="wsCat">Type</label><select id="wsCat"' + (canEdit ? '' : ' disabled') + '>' +
              CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (c === b.category ? ' selected' : '') + '>' + esc(CREATION_LABEL[c] || c) + '</option>'; }).join('') +
              (LEGACY_CATEGORIES.indexOf(b.category) !== -1 && CATEGORIES.indexOf(b.category) === -1 ? '<option selected>' + esc(b.category) + '</option>' : '') +
            '</select></div>' +
            '<div><span class="tk-lbl">Stage</span><div class="tk-steps">' + steps + '</div></div>' +
            (canEdit ? '<div><label class="tk-lbl" for="wsProg">Progress</label><input type="range" id="wsProg" min="0" max="100" step="5" value="' + prog + '" style="width:100%;max-width:420px"></div>' : '') +
            '<div><span class="tk-lbl">Disciplines</span><div style="display:flex;gap:.35rem;flex-wrap:wrap">' +
              DISCIPLINES.map(function (d) { var on = disciplinesOf(b).indexOf(d) !== -1; return '<button type="button" class="tk-pill' + (on ? ' ok' : '') + '" data-disc="' + esc(d) + '" style="border:0;cursor:' + (canEdit ? 'pointer' : 'default') + ';opacity:' + (on ? '1' : '.55') + '"' + (canEdit ? '' : ' disabled') + '>' + esc(d) + '</button>'; }).join('') + '</div></div>' +
          '</div></details>' +
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
      if (tab === 'mission' && !mounted.mission) mountMissionTab();
      if (tab === 'writing' && !mounted.writing) mountModule('writing', host.querySelector('#wsWritingHost'));
      if (tab === 'code' && !mounted.code) mountModule('code', host.querySelector('#wsCodeHost'));
      if (tab === 'upload' && !mounted.upload) mountModule('upload', host.querySelector('#wsUploadHost'));
      if (isStu && (tab === 'submit' || tab === 'comments') && latestCoachFb()) act('feedback_viewed', 'Read coach feedback on ' + (b.title || 'a project'));
    }
    function switchTab(tab) {
      if (!host.querySelector('[data-pane="' + tab + '"]')) return;
      activeTab = tab;
      if (tab !== 'mission' && mounted.mission) { mounted.mission.destroy(); mounted.mission = null; }   // stops a playing lesson video
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

      var set = host.querySelector('.ws-settings'); if (set) set.addEventListener('toggle', function () { settingsOpen = set.open; });

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
    missionLock: missionLock, missionFor: missionFor, materialsHtml: materialsHtml, videoEmbed: videoEmbed, mountMission: mountMission,
    liveState: liveState, liveCardHtml: liveCardHtml, sortLive: sortLive, LIVE_LABEL: LIVE_LABEL,
    logActivity: logActivity, touchActive: touchActive, activityRows: activityRows, ago: ago, lastSeen: lastSeen
  };
})(window);