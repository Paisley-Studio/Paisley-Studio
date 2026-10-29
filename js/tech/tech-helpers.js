/* =========================================================
   Paisley TECH — shared UI + data helpers  (window.TechUI)
   ---------------------------------------------------------
   Used by the TECH builder studio (/tech/dashboard), the TECH coach
   portal (/tech/coach), the TECH guardian portal (/tech/parent) and
   the admin TECH module.

     TechUI.mountWorkspace(host, opts)  one project: status, brief, files, versions, feedback, share,
                                        Writing Studio, Code Lab, Upload Pad, AI reflection, mastery, visibility
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
      '@media(max-width:560px){.tk-msg{max-width:92%}.tk-step{min-width:60px;font-size:.62rem}.tk-tab{font-size:.72rem;padding:.45rem .7rem}}',
      '@media(prefers-reduced-motion:reduce){.tk-bar>i,.tk-btn,.tk-step{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* =========================================================
     Showcase (public Tech Wall) — unchanged API
     ========================================================= */
  async function approveShowcase(b, user) {
    var imgs = (b.files || []).filter(function (f) { return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(f.name || f.url || ''); });
    await db.collection('techShowcase').doc(b.id).set({
      buildId: b.id, title: b.title || 'Untitled build',
      description: String(b.brief || b.writingHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 600),
      displayName: b.displayName || 'A Paisley student', category: b.category || 'Other',
      disciplines: disciplinesOf(b),
      skills: (b.skills || []).slice(0, 8),
      toolsUsed: (b.aiReflection && b.aiReflection.tools) ? b.aiReflection.tools.slice(0, 12) : [],
      reflection: b.aiReflection ? {
        purpose: String(b.aiReflection.purpose || '').slice(0, 400),
        learned: String(b.aiReflection.learned || '').slice(0, 400)
      } : null,
      coverUrl: imgs[0] ? imgs[0].url : '',
      previewUrl: safeUrl(b.workUrl),
      featured: false, approvedBy: user.uid, approvedAt: FV().serverTimestamp()
    });
    await db.collection('techBuilds').doc(b.id).update({ showcase: 'approved', reviewState: 'approved', updatedAt: FV().serverTimestamp() });
  }
  async function removeShowcase(b) {
    await db.collection('techShowcase').doc(b.id).delete();
    await db.collection('techBuilds').doc(b.id).update({ showcase: 'none', updatedAt: FV().serverTimestamp() });
  }
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
     Workspace — one build, now with tabs:
       Brief · Writing · Code Lab · Upload · AI reflection
     Existing fields, status flow, files/resources/versions, feedback,
     share and showcase behave exactly as before.

     Tab modules are loaded from js/tech/writing-studio.js,
     js/tech/code-lab.js, js/tech/upload-pad.js if present. If any
     module is missing, its tab still renders but shows a small
     inline message inside the tab (no global breakage).
     ========================================================= */
  function mountWorkspace(host, o) {
    injectStyle();
    var ref = db.collection('techBuilds').doc(o.id), me = o.me, role = me.role;
    var isStu = role === 'student', canEdit = isStu || role === 'admin', canReview = role === 'coach' || role === 'admin';
    var b = null, fbList = [], unsubs = [], rendered = false, dead = false;
    var activeTab = 'brief';
    var mounted = { writing: null, code: null, upload: null };

    function editing() { var a = document.activeElement; return a && host.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
    function say(t, bad) { var m = host.querySelector('#wsMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#b8362a' : 'var(--brand-deep,#245F5A)'; } }
    async function patch(p, okMsg) {
      try {
        p.updatedAt = FV().serverTimestamp();
        await ref.update(p);
        Object.keys(p).forEach(function (k) { if (k !== 'updatedAt') b[k] = p[k]; });
        render();
        if (okMsg) say(okMsg);
      } catch (e) { say('Could not save: ' + errMsg(e), true); }
    }

    /* ---------- AI reflection helpers ---------- */
    function reflectionOf(x) { return Object.assign({}, EMPTY_REFLECTION, (x && x.aiReflection) || {}); }
    function hasReflection(x) {
      var r = reflectionOf(x);
      return (r.tools && r.tools.length > 0) && String(r.purpose || '').trim().length > 0;
    }
    function hasArtifact(x) {
      return (x.writingHtml && String(x.writingHtml).trim().length > 0) ||
        (Array.isArray(x.codeFiles) && x.codeFiles.some(function (f) { return f && String(f.content || '').trim().length > 0; })) ||
        (Array.isArray(x.files) && x.files.length > 0);
    }

    /* ---------- tab mounters ---------- */
    function mountWriting(hostEl) {
      var missing = '<div class="tk-empty">Writing Studio is not loaded on this page. Add <code>&lt;script src="…/js/tech/writing-studio.js"&gt;&lt;/script&gt;</code> before tech-helpers.js.</div>';
      if (!g.WritingStudio || !g.WritingStudio.mount) { hostEl.innerHTML = missing; return; }
      if (mounted.writing) { try { mounted.writing.destroy(); } catch (e) { } mounted.writing = null; }
      try {
        mounted.writing = g.WritingStudio.mount(hostEl, {
          build: b, me: me, canEdit: canEdit,
          onSave: function (patchObj) { return patch(patchObj, 'Saved ✓'); },
          files: b.files || []
        });
      } catch (e) { hostEl.innerHTML = '<div class="tk-empty">Writing Studio could not start: ' + esc(errMsg(e)) + '</div>'; }
    }
    function mountCode(hostEl) {
      var missing = '<div class="tk-empty">Code Lab is not loaded on this page. Add <code>&lt;script src="…/js/tech/code-lab.js"&gt;&lt;/script&gt;</code>.</div>';
      if (!g.CodeLab || !g.CodeLab.mount) { hostEl.innerHTML = missing; return; }
      if (mounted.code) { try { mounted.code.destroy(); } catch (e) { } mounted.code = null; }
      try {
        mounted.code = g.CodeLab.mount(hostEl, {
          build: b, me: me, canEdit: canEdit,
          onSave: function (patchObj) { return patch(patchObj, 'Code saved ✓'); }
        });
      } catch (e) { hostEl.innerHTML = '<div class="tk-empty">Code Lab could not start: ' + esc(errMsg(e)) + '</div>'; }
    }
    function mountUpload(hostEl) {
      var missing = '<div class="tk-empty">Upload Pad is not loaded on this page. Add <code>&lt;script src="…/js/tech/upload-pad.js"&gt;&lt;/script&gt;</code>.</div>';
      if (!g.UploadPad || !g.UploadPad.mount) { hostEl.innerHTML = missing; return; }
      if (mounted.upload) { try { mounted.upload.destroy(); } catch (e) { } mounted.upload = null; }
      try {
        mounted.upload = g.UploadPad.mount(hostEl, {
          build: b, me: me, canEdit: canEdit,
          onSave: function (patchObj) { return patch(patchObj, 'Saved ✓'); }
        });
      } catch (e) { hostEl.innerHTML = '<div class="tk-empty">Upload Pad could not start: ' + esc(errMsg(e)) + '</div>'; }
    }
    function unmountTabModules() {
      ['writing', 'code', 'upload'].forEach(function (k) {
        if (mounted[k]) { try { mounted[k].destroy(); } catch (e) { } mounted[k] = null; }
      });
    }

    /* ---------- render ---------- */
    function render() {
      if (dead || !b) return; rendered = true;
      unmountTabModules();
      var si = Math.max(0, STATUSES.indexOf(b.status));
      var steps = STATUSES.map(function (s, i) {
        var cls = i < si ? 'done' : (i === si ? 'now' : '');
        return '<button type="button" class="tk-step ' + cls + (canEdit || canReview ? ' click' : '') + '" data-st="' + s + '"' + (canEdit || canReview ? '' : ' disabled') + '>' + esc(s) + '</button>';
      }).join('');
      var files = (b.files || []).map(function (f, i) { return '<div class="tk-item"><div><a href="' + esc(safeUrl(f.url)) + '" target="_blank" rel="noopener"><i class="fas fa-file"></i> ' + esc(f.name) + '</a><div class="meta">' + (f.size ? Math.round(f.size / 1024) + ' KB' : 'Link') + '</div></div>' + (canEdit ? '<button class="tk-btn sm danger" data-rmfile="' + i + '" type="button" aria-label="Remove file"><i class="fas fa-xmark"></i></button>' : '') + '</div>'; }).join('') || '<div class="tk-empty">No files yet.</div>';
      var res = (b.resources || []).map(function (r, i) { return '<div class="tk-item"><a href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener"><i class="fas fa-link"></i> ' + esc(r.title || r.url) + '</a>' + (canEdit ? '<button class="tk-btn sm danger" data-rmres="' + i + '" type="button" aria-label="Remove"><i class="fas fa-xmark"></i></button>' : '') + '</div>'; }).join('') || '<div class="tk-empty">Nothing saved yet. Add what you need to build this.</div>';
      var vers = (b.versions || []).map(function (v, i) { return '<div class="tk-item"><div><b>v' + (i + 1) + '</b> · ' + esc(v.note || '') + (v.url ? ' · <a href="' + esc(safeUrl(v.url)) + '" target="_blank" rel="noopener">open</a>' : '') + '<div class="meta">' + esc(v.at ? new Date(v.at).toLocaleDateString() : '') + '</div></div></div>'; }).reverse().join('') || '<div class="tk-empty">No versions saved yet. Save v1 when you have something to show.</div>';

      /* Share (public showcase) — unchanged behavior */
      var ss = b.showcase || 'none';
      var share;
      if (ss === 'approved') share = '<span class="tk-pill ok">On the Tech Wall</span><p class="tk-sub" style="margin:.5rem 0">Share your build:</p><input class="tk-in" readonly value="' + esc(location.origin + '/tech?build=' + b.id) + '" onclick="this.select()">' + (isStu ? '<button class="tk-btn sm danger" id="wsUnshow" type="button" style="margin-top:.5rem">Remove from Tech Wall</button>' : '');
      else if (ss === 'requested') share = '<span class="tk-pill warn">Showcase requested — waiting for your coach</span>';
      else share = '<p class="tk-sub">When your build is READY you can ask your coach to put it on the Tech Wall.</p>' + (isStu ? '<button class="tk-btn primary" id="wsAsk" type="button"' + (b.status === 'READY' ? '' : ' disabled title="Set the status to READY first"') + '><i class="fas fa-bullhorn"></i> Show your build</button>' : '');
      if (canReview && ss === 'requested') share += '<div style="margin-top:.6rem"><button class="tk-btn primary" id="wsApprove" type="button"><i class="fas fa-check"></i> Approve for Tech Wall</button> <button class="tk-btn" id="wsDecline" type="button">Decline</button></div>';
      if (canReview && ss === 'approved') share += '<div style="margin-top:.6rem"><button class="tk-btn danger sm" id="wsRemove" type="button">Remove from Tech Wall</button></div>';

      /* Visibility controls */
      var vis = b.visibility || 'private';
      var visHtml = '<div class="tk-sub" style="margin-bottom:.35rem">Who can see this project?</div><div class="tk-vis">' +
        VISIBILITIES.map(function (v) {
          var disabled = false;
          if (v === 'public' && !canReview) disabled = true;                    // student cannot self-publish
          if (v === 'public' && !b.showcase === 'approved') disabled = disabled; // no-op guard
          if (v === 'public' && b.showcase !== 'approved') disabled = true;      // must be coach-approved first
          var on = vis === v;
          return '<button type="button" class="tk-vis-pill' + (on ? ' on' : '') + '" data-vis="' + v + '"' + (disabled ? ' disabled title="Coach approval required"' : '') + '>' + esc(VISIBILITY_LABEL[v]) + '</button>';
        }).join('') + '</div>';
      if (vis === 'family' && b.shareToken) {
        visHtml += '<p class="tk-sub" style="margin:.5rem 0 .2rem">Family link (share only with people you trust):</p><input class="tk-in" readonly value="' + esc(location.origin + '/tech/b/' + b.id + '?t=' + b.shareToken) + '" onclick="this.select()">' +
          '<button class="tk-btn sm" id="wsMintToken" type="button" style="margin-top:.4rem"><i class="fas fa-rotate"></i> Rotate link</button>' +
          '<button class="tk-btn sm danger" id="wsRevokeToken" type="button" style="margin-top:.4rem;margin-left:.35rem">Revoke link</button>';
      } else if (vis === 'family') {
        visHtml += '<p class="tk-sub" style="margin:.5rem 0">No family link yet. ' + (canReview || canEdit ? 'Generate one now?' : '') + '</p>' + (canReview || canEdit ? '<button class="tk-btn primary" id="wsMintToken" type="button"><i class="fas fa-key"></i> Generate family link</button>' : '');
      }

      /* Mastery block */
      var mastery = b.mastery || 'none';
      var masteryHtml;
      if (canReview) {
        masteryHtml = '<div class="tk-mastery"><span class="tk-pill ' + (mastery === 'approved' ? 'ok' : mastery === 'changes' ? 'bad' : '') + '">Mastery: ' + esc(mastery) + '</span>' +
          (mastery !== 'approved' ? '<button class="tk-btn primary" id="wsMasteryApprove" type="button"><i class="fas fa-award"></i> Approve mastery</button>' : '<button class="tk-btn" id="wsMasteryRevoke" type="button">Revoke mastery</button>') +
          '<button class="tk-btn" id="wsMasteryChanges" type="button"><i class="fas fa-rotate-left"></i> Request changes</button></div>';
      } else if (mastery === 'approved') {
        masteryHtml = '<span class="tk-pill ok">Mastered ✓</span>';
      } else if (mastery === 'changes') {
        masteryHtml = '<span class="tk-pill bad">Changes requested — revise and resubmit</span>';
      } else {
        masteryHtml = '<span class="tk-sub">Submit for review when you\'re ready. Your coach will approve mastery when the work meets the brief.</span>';
      }

      /* Reflection view + editor */
      var refl = reflectionOf(b);
      var attachTools = (b.aiTools && b.aiTools.length) ? b.aiTools : [];
      var aiStrip = attachTools.length
        ? '<div class="tk-ai-tools">' + attachTools.map(function (t) {
            var url = safeUrl(t.url);
            return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ' + esc(t.name || 'Tool') + '</a>' : '<span>' + esc(t.name || 'Tool') + '</span>';
          }).join('') + '</div>' + (b.aiRules ? '<div class="tk-sub" style="margin-bottom:.4rem">' + esc(b.aiRules) + '</div>' : '')
        : '<div class="tk-sub">No AI tools attached to this mission.</div>';

      var reflectionEditor = canEdit ? (
        '<div class="tk-ai-box"><h4><i class="fas fa-wand-magic-sparkles"></i> AI reflection</h4>' +
        '<div class="tk-sub">Tell your coach honestly what the AI did and what you did. This is required before you can submit for review.</div>' +
        '<div class="tk-ai-field"><label>Which AI tools did you use?</label><div id="aiToolPick">' +
          attachTools.map(function (t) {
            var on = (refl.tools || []).indexOf(t.name) !== -1;
            return '<label class="tk-ai-check"><input type="checkbox" data-aitool="' + esc(t.name) + '"' + (on ? ' checked' : '') + '> ' + esc(t.name) + '</label>';
          }).join('') + '</div></div>' +
        '<div class="tk-ai-field"><label>What did you ask them to do?</label><textarea id="aiPurpose" maxlength="600">' + esc(refl.purpose) + '</textarea></div>' +
        '<div class="tk-ai-field"><label>What did you change or ignore?</label><textarea id="aiChanges" maxlength="600">' + esc(refl.changes) + '</textarea></div>' +
        '<div class="tk-ai-field"><label>What did you keep?</label><textarea id="aiKept" maxlength="600">' + esc(refl.kept) + '</textarea></div>' +
        '<div class="tk-ai-field"><label>What did you learn?</label><textarea id="aiLearned" maxlength="600">' + esc(refl.learned) + '</textarea></div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">' +
          '<button class="tk-btn dark" id="aiSave" type="button"><i class="fas fa-floppy-disk"></i> Save reflection</button>' +
          '<span class="tk-msgline" id="aiMsg"></span>' +
        '</div></div>'
      ) : (
        '<div class="tk-ai-box"><h4><i class="fas fa-wand-magic-sparkles"></i> AI reflection</h4>' +
          (refl.tools && refl.tools.length
            ? '<div class="tk-sub">Tools used: ' + esc(refl.tools.join(', ')) + '</div>' +
              (refl.purpose ? '<p style="margin:.3rem 0"><b>Purpose:</b> ' + esc(refl.purpose) + '</p>' : '') +
              (refl.changes ? '<p style="margin:.3rem 0"><b>Changes:</b> ' + esc(refl.changes) + '</p>' : '') +
              (refl.kept ? '<p style="margin:.3rem 0"><b>Kept:</b> ' + esc(refl.kept) + '</p>' : '') +
              (refl.learned ? '<p style="margin:.3rem 0"><b>Learned:</b> ' + esc(refl.learned) + '</p>' : '')
            : '<div class="tk-sub">No AI reflection recorded yet.</div>') +
        '</div>'
      );

      /* Tab bar */
      var tabs = [['brief', 'fa-clipboard-list', 'Brief'], ['writing', 'fa-pen-nib', 'Writing'], ['code', 'fa-code', 'Code Lab'], ['upload', 'fa-paperclip', 'Upload']];
      var tabbar = '<div class="tk-tabbar" role="tablist">' + tabs.map(function (t) {
        var on = activeTab === t[0];
        return '<button type="button" class="tk-tab' + (on ? ' on' : '') + '" data-tab="' + t[0] + '" role="tab" aria-selected="' + on + '"><i class="fas ' + t[1] + '"></i> ' + t[2] + '</button>';
      }).join('') + '</div>';

      host.innerHTML =
        '<div class="tk-box" style="margin-bottom:.9rem"><div class="tk-row" style="align-items:end">' +
          '<div class="tk-f" style="margin:0;grid-column:span 2"><label>Project</label><input id="wsTitle" maxlength="120" value="' + esc(b.title) + '"' + (canEdit ? '' : ' readonly') + '></div>' +
          '<div class="tk-f" style="margin:0"><label>Type</label><select id="wsCat"' + (canEdit ? '' : ' disabled') + '>' +
            CATEGORIES.map(function (c) { return '<option' + (c === b.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
            (LEGACY_CATEGORIES.indexOf(b.category) !== -1 && CATEGORIES.indexOf(b.category) === -1 ? '<option selected>' + esc(b.category) + '</option>' : '') +
          '</select></div></div>' +
          '<div style="margin-top:.8rem" class="tk-sub">By ' + esc(b.displayName || b.studentName || '') + (b.reviewState === 'requested' ? ' · <span class="tk-pill warn">Review requested</span>' : '') + (b.reviewState === 'changes' ? ' · <span class="tk-pill bad">Changes requested</span>' : '') + (b.mastery === 'approved' ? ' · <span class="tk-pill ok">Mastery approved</span>' : '') + '</div>' +
          '<div class="tk-steps">' + steps + '</div>' +
          '<div style="display:flex;gap:.7rem;align-items:center"><div class="tk-bar" style="flex:1"><i style="width:' + (Number(b.progress) || 0) + '%"></i></div><b style="font-size:.85rem">' + (Number(b.progress) || 0) + '%</b></div>' +
          (canEdit ? '<input type="range" id="wsProg" min="0" max="100" step="5" value="' + (Number(b.progress) || 0) + '" style="width:100%;margin-top:.4rem" aria-label="Progress">' : '') + '</div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.2rem 0 .7rem">' +
          '<span class="tk-sub" style="margin:0">Disciplines:</span>' +
          DISCIPLINES.map(function (d) {
            var on = disciplinesOf(b).indexOf(d) !== -1;
            return '<span class="tk-pill' + (on ? ' ok' : '') + '" style="opacity:' + (on ? '1' : '.55') + '">' + esc(d) + '</span>';
          }).join('') +
        '</div>' +
        tabbar +
        '<div class="tk-pane' + (activeTab === 'brief' ? ' on' : '') + '" data-pane="brief">' +
          '<div class="tk-grid2">' +
            '<div class="tk-box"><h3>Project brief</h3><div class="tk-sub">What am I building?</div><div class="tk-f"><textarea id="wsBrief" maxlength="2000"' + (canEdit ? '' : ' readonly') + '>' + esc(b.brief) + '</textarea></div>' +
              '<div class="tk-f"><label>Skills used (comma separated)</label><input id="wsSkills" maxlength="200" value="' + esc((b.skills || []).join(', ')) + '"' + (canEdit ? '' : ' readonly') + '></div></div>' +
            '<div class="tk-box"><h3>My work</h3><div class="tk-sub">What it does and where to see it.</div><div class="tk-f"><textarea id="wsWork" maxlength="3000" placeholder="Describe the current state of your build…"' + (canEdit ? '' : ' readonly') + '>' + esc(b.workText) + '</textarea></div>' +
              '<div class="tk-f"><label>Link to preview (optional)</label><input id="wsUrl" maxlength="400" placeholder="https://" value="' + esc(b.workUrl) + '"' + (canEdit ? '' : ' readonly') + '></div></div>' +
            '<div class="tk-box"><h3>Resources</h3><div class="tk-sub">What do I need?</div><div class="tk-list">' + res + '</div>' +
              (canEdit ? '<div class="tk-row" style="margin-top:.7rem"><input class="tk-in" id="rsT" placeholder="Title" maxlength="80"><input class="tk-in" id="rsU" placeholder="https://" maxlength="400"><button class="tk-btn sm" id="rsAdd" type="button">Add</button></div>' : '') + '</div>' +
            '<div class="tk-box"><h3>My files</h3><div class="tk-sub">Quick links. For full asset management use the Upload tab.</div><div class="tk-list">' + files + '</div>' +
              (canEdit ? '<div style="margin-top:.7rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">' + (firebase.storage ? '<label class="tk-btn sm" style="margin:0"><i class="fas fa-upload"></i> Upload<input type="file" id="flUp" hidden></label>' : '') + '<input class="tk-in" id="flU" placeholder="…or paste a link" style="flex:1;min-width:140px"><button class="tk-btn sm" id="flAdd" type="button">Add link</button></div><div class="tk-sub" id="flSt" style="margin-top:.4rem"></div>' : '') + '</div>' +
            '<div class="tk-box"><h3>Versions</h3><div class="tk-sub">v1, v2, v3 — how it has improved.</div><div class="tk-list">' + vers + '</div>' +
              (canEdit ? '<div class="tk-row" style="margin-top:.7rem"><input class="tk-in" id="vN" placeholder="What changed?" maxlength="200"><input class="tk-in" id="vU" placeholder="Link (optional)" maxlength="400"><button class="tk-btn sm" id="vAdd" type="button">Save version</button></div>' : '') + '</div>' +
            '<div class="tk-box"><h3>Show</h3>' + share + '</div>' +
            '<div class="tk-box"><h3>Visibility</h3>' + visHtml + '</div>' +
            '<div class="tk-box"><h3>Mastery</h3>' + masteryHtml + '</div>' +
          '</div>' +
          '<div class="tk-box" style="margin-top:.9rem"><h3>AI tools & rules</h3>' + aiStrip + '</div>' +
          reflectionEditor +
          (canEdit ? '<div style="margin:.9rem 0;display:flex;gap:.6rem;flex-wrap:wrap;align-items:center">' +
            '<button class="tk-btn dark" id="wsSave" type="button"><i class="fas fa-floppy-disk"></i> Save changes</button>' +
            (isStu ? '<button class="tk-btn" id="wsReview" type="button"><i class="fas fa-comments"></i> Submit for review</button>' : '') +
            '<button class="tk-btn danger sm" id="wsDel" type="button"><i class="fas fa-trash"></i> Delete project</button></div>' : '') +
          '<div class="tk-msgline" id="wsMsg"></div>' +
          '<div class="tk-box" style="margin-top:.5rem"><h3>Coach feedback</h3><div class="tk-sub">Comments, requested changes and approval.</div><div class="tk-list" id="wsFb"></div>' +
            '<div style="margin-top:.8rem"><div class="tk-f"><textarea id="fbText" maxlength="2000" placeholder="' + (canReview ? 'Write feedback…' : 'Reply to your coach…') + '"></textarea></div>' +
            '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' + (canReview ? '<select class="tk-in" id="fbKind" style="width:auto"><option value="comment">Comment</option><option value="changes">Request changes</option><option value="approved">Approve</option></select>' : '') + '<button class="tk-btn primary" id="fbSend" type="button">Post</button></div></div></div>' +
        '</div>' +
        '<div class="tk-pane' + (activeTab === 'writing' ? ' on' : '') + '" data-pane="writing"><div class="tk-ws-host" id="wsWritingHost"></div></div>' +
        '<div class="tk-pane' + (activeTab === 'code' ? ' on' : '') + '" data-pane="code"><div class="tk-cl-host" id="wsCodeHost"></div></div>' +
        '<div class="tk-pane' + (activeTab === 'upload' ? ' on' : '') + '" data-pane="upload"><div class="tk-up-host" id="wsUploadHost"></div></div>';

      /* Mount the active tab's module. Other tabs mount lazily when first opened. */
      if (activeTab === 'writing') mountWriting(host.querySelector('#wsWritingHost'));
      else if (activeTab === 'code') mountCode(host.querySelector('#wsCodeHost'));
      else if (activeTab === 'upload') mountUpload(host.querySelector('#wsUploadHost'));

      renderFb();
      wire();
    }

    function renderFb() {
      var el = host.querySelector('#wsFb'); if (!el) return;
      el.innerHTML = fbList.map(function (f) {
        var tag = f.kind === 'changes' ? '<span class="tk-pill bad">Changes requested</span>' : (f.kind === 'approved' ? '<span class="tk-pill ok">Approved</span>' : '');
        return '<div class="tk-fb ' + (f.role === 'student' ? '' : 'coach') + '"><div class="who">' + esc(f.authorName || f.role) + ' ' + tag + ' <span style="font-weight:600;opacity:.7">' + esc(fmt(f.createdAt)) + '</span></div>' + esc(f.text) + '</div>';
      }).join('') || '<div class="tk-empty">No feedback yet.</div>';
    }

    function q(id) { return host.querySelector(id); }
    function collect() {
      return {
        title: q('#wsTitle').value.trim().slice(0, 120) || b.title, category: q('#wsCat').value,
        brief: q('#wsBrief').value.slice(0, 2000),
        workText: q('#wsWork').value.slice(0, 3000), workUrl: safeUrl(q('#wsUrl').value) || '',
        skills: q('#wsSkills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8),
        progress: q('#wsProg') ? Number(q('#wsProg').value) : (b.progress || 0)
      };
    }
    function collectReflection() {
      var tools = [];
      host.querySelectorAll('[data-aitool]').forEach(function (c) { if (c.checked) tools.push(c.dataset.aitool); });
      return {
        tools: tools,
        purpose: (q('#aiPurpose') ? q('#aiPurpose').value : '').slice(0, 600),
        changes: (q('#aiChanges') ? q('#aiChanges').value : '').slice(0, 600),
        kept: (q('#aiKept') ? q('#aiKept').value : '').slice(0, 600),
        learned: (q('#aiLearned') ? q('#aiLearned').value : '').slice(0, 600)
      };
    }

    function wire() {
      /* Tab switching — mount lazily on first open */
      host.querySelectorAll('[data-tab]').forEach(function (t) {
        t.addEventListener('click', function () {
          var tab = t.dataset.tab;
          if (tab === activeTab) return;
          activeTab = tab;
          host.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === tab); x.setAttribute('aria-selected', x.dataset.tab === tab); });
          host.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('on', p.dataset.pane === tab); });
          if (tab === 'writing' && !mounted.writing) mountWriting(host.querySelector('#wsWritingHost'));
          if (tab === 'code' && !mounted.code) mountCode(host.querySelector('#wsCodeHost'));
          if (tab === 'upload' && !mounted.upload) mountUpload(host.querySelector('#wsUploadHost'));
        });
      });

      host.querySelectorAll('[data-st]').forEach(function (btn) { btn.addEventListener('click', function () {
        if (!(canEdit || canReview)) return; var st = btn.dataset.st;
        var p = { status: st }; if (st === 'READY') p.progress = 100;
        patch(p, 'Status: ' + STATUS_LABEL[st]);
      }); });
      host.querySelectorAll('[data-rmfile]').forEach(function (x) { x.addEventListener('click', function () { var a = (b.files || []).slice(); a.splice(Number(x.dataset.rmfile), 1); patch({ files: a }); }); });
      host.querySelectorAll('[data-rmres]').forEach(function (x) { x.addEventListener('click', function () { var a = (b.resources || []).slice(); a.splice(Number(x.dataset.rmres), 1); patch({ resources: a }); }); });

      if (q('#wsSave')) q('#wsSave').addEventListener('click', function () { patch(collect(), 'Saved ✓'); });
      if (q('#rsAdd')) q('#rsAdd').addEventListener('click', function () { var u = safeUrl(q('#rsU').value); if (!u) return say('Enter a link starting with https://', true); var a = (b.resources || []).concat([{ title: q('#rsT').value.trim().slice(0, 80) || u, url: u }]); patch(Object.assign(collect(), { resources: a.slice(0, 30) })); });
      if (q('#flAdd')) q('#flAdd').addEventListener('click', function () { var u = safeUrl(q('#flU').value); if (!u) return say('Enter a link starting with https://', true); var a = (b.files || []).concat([{ name: u.replace(/^https?:\/\//, '').slice(0, 60), url: u, at: Date.now() }]); patch(Object.assign(collect(), { files: a.slice(0, 40) })); });
      if (q('#flUp')) q('#flUp').addEventListener('change', async function (e) {
        var f = e.target.files[0]; if (!f) return; var st = q('#flSt');
        if (f.size > 25 * 1024 * 1024) { st.textContent = 'Files must be under 25 MB.'; return; }
        st.textContent = 'Uploading…';
        try {
          var path = 'techBuilds/' + b.studentId + '/' + b.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
          var r = firebase.storage().ref(path); await r.put(f); var url = await r.getDownloadURL();
          var a = (b.files || []).concat([{ name: f.name.slice(0, 80), url: url, path: path, size: f.size, at: Date.now() }]);
          await patch(Object.assign(collect(), { files: a.slice(0, 40) }), 'File added ✓');
        } catch (er) { st.textContent = 'Upload failed: ' + errMsg(er); }
      });
      if (q('#vAdd')) q('#vAdd').addEventListener('click', function () { var n = q('#vN').value.trim(); if (!n) return say('Say what changed in this version.', true); var u = safeUrl(q('#vU').value); var a = (b.versions || []).concat([{ note: n.slice(0, 200), url: u, at: Date.now() }]); patch(Object.assign(collect(), { versions: a.slice(0, 50) }), 'Version v' + a.length + ' saved ✓'); });

      /* AI reflection save */
      if (q('#aiSave')) q('#aiSave').addEventListener('click', function () {
        var r = collectReflection();
        if (!r.tools.length) { var m = q('#aiMsg'); if (m) m.textContent = 'Tick at least one tool you used.'; return; }
        if (!r.purpose.trim()) { var m2 = q('#aiMsg'); if (m2) m2.textContent = 'Say what you asked the AI to do.'; return; }
        patch({ aiReflection: r }, 'Reflection saved ✓');
      });

      /* Submit for review — requires reflection and an artifact */
      if (q('#wsReview')) q('#wsReview').addEventListener('click', function () {
        var r = collectReflection();
        var art = hasArtifact(Object.assign({}, b, { writingHtml: b.writingHtml, codeFiles: b.codeFiles, files: b.files }));
        if (!r.tools.length || !r.purpose.trim()) {
          activeTab = 'brief';
          patch(Object.assign(collect(), { aiReflection: r }), 'Fill in your AI reflection first.');
          return;
        }
        if (!art) { say('Add some writing, code or a file before submitting.', true); return; }
        patch(Object.assign(collect(), { aiReflection: r, reviewState: 'requested' }), 'Submitted for review ✓');
      });

      /* Visibility */
      host.querySelectorAll('[data-vis]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (btn.disabled) return;
          var v = btn.dataset.vis;
          if (v === b.visibility) return;
          if (v === 'family') {
            try {
              var token = await mintShareToken(b.id);
              await patch({ visibility: 'family', shareToken: token }, 'Family link ready ✓');
            } catch (e) { say('Could not create family link: ' + errMsg(e), true); }
          } else if (v === 'public') {
            if (b.showcase !== 'approved') { say('A coach must approve this build for the Tech Wall first.', true); return; }
            await patch({ visibility: 'public' }, 'Now public ✓');
          } else {
            await patch({ visibility: 'private' }, 'Now private ✓');
          }
        });
      });
      if (q('#wsMintToken')) q('#wsMintToken').addEventListener('click', async function () {
        try { var token = await mintShareToken(b.id); await patch({ visibility: 'family', shareToken: token }, 'Family link ready ✓'); }
        catch (e) { say('Could not create family link: ' + errMsg(e), true); }
      });
      if (q('#wsRevokeToken')) q('#wsRevokeToken').addEventListener('click', async function () {
        if (!confirm('Revoke this family link? Anyone with it loses access.')) return;
        try { await db.collection('shareTokens').doc(b.id).set({ revoked: true }, { merge: true }); await patch({ shareToken: '' }, 'Family link revoked.'); }
        catch (e) { say('Could not revoke: ' + errMsg(e), true); }
      });

      /* Mastery */
      if (q('#wsMasteryApprove')) q('#wsMasteryApprove').addEventListener('click', function () {
        if (!canReview) return;
        patch({ mastery: 'approved', masteryAt: FV().serverTimestamp(), masteryBy: me.uid }, 'Mastery approved ✓');
      });
      if (q('#wsMasteryRevoke')) q('#wsMasteryRevoke').addEventListener('click', function () {
        if (!canReview) return;
        if (!confirm('Revoke this mastery approval?')) return;
        patch({ mastery: 'none' }, 'Mastery revoked.');
      });
      if (q('#wsMasteryChanges')) q('#wsMasteryChanges').addEventListener('click', function () {
        if (!canReview) return;
        patch({ mastery: 'changes', reviewState: 'changes' }, 'Changes requested.');
      });

      /* Showcase (public Wall) — unchanged */
      if (q('#wsAsk')) q('#wsAsk').addEventListener('click', function () { patch(Object.assign(collect(), { showcase: 'requested', reviewState: 'requested' }), 'Showcase requested ✓'); });
      if (q('#wsUnshow')) q('#wsUnshow').addEventListener('click', async function () { if (!confirm('Remove this build from the public Tech Wall?')) return; try { await removeShowcase(b); } catch (e) { say(errMsg(e), true); } });
      if (q('#wsApprove')) q('#wsApprove').addEventListener('click', async function () { try { await approveShowcase(b, me); say('Approved — it is now on the Tech Wall ✓'); } catch (e) { say(errMsg(e), true); } });
      if (q('#wsDecline')) q('#wsDecline').addEventListener('click', function () { patch({ showcase: 'none', reviewState: 'changes' }, 'Showcase request declined.'); });
      if (q('#wsRemove')) q('#wsRemove').addEventListener('click', async function () { try { await removeShowcase(b); say('Removed from the Tech Wall.'); } catch (e) { say(errMsg(e), true); } });
      if (q('#wsDel')) q('#wsDel').addEventListener('click', async function () {
        if (!confirm('Delete this project permanently?')) return;
        try { if (b.showcase === 'approved') await removeShowcase(b); await ref.delete(); if (o.onDeleted) o.onDeleted(); } catch (e) { say('Could not delete: ' + errMsg(e), true); }
      });
      q('#fbSend').addEventListener('click', async function () {
        var t = q('#fbText').value.trim(); if (!t) return; var kind = q('#fbKind') ? q('#fbKind').value : 'comment', btn = q('#fbSend'); btn.disabled = true;
        try {
          await ref.collection('feedback').add({ authorId: me.uid, authorName: me.name || '', role: role, kind: kind, text: t.slice(0, 2000), createdAt: FV().serverTimestamp() });
          if (canReview && (kind === 'changes' || kind === 'approved')) await ref.update({ reviewState: kind, updatedAt: FV().serverTimestamp() });
          q('#fbText').value = ''; say('Posted ✓');
        } catch (e) { say('Could not post: ' + errMsg(e), true); }
        btn.disabled = false;
      });
    }

    host.innerHTML = '<div class="tk-empty">Opening project…</div>';
    unsubs.push(ref.onSnapshot(function (s) {
      if (!s.exists) { host.innerHTML = '<div class="tk-empty">This project no longer exists.</div>'; return; }
      var previous = b; b = Object.assign({ id: s.id }, s.data());
      /* If a tab module (writing/code/upload) is currently mounted and the user
         is typing, don't wipe it on every snapshot. The three tab modules each
         own their save flow and only re-read on mount. */
      if (!rendered || !editing()) render();
    }, function (e) { host.innerHTML = '<div class="tk-empty">Could not open this project: ' + esc(errMsg(e)) + '</div>'; }));
    unsubs.push(ref.collection('feedback').orderBy('createdAt').onSnapshot(function (s) { fbList = s.docs.map(function (d) { return d.data(); }); renderFb(); }, function () { }));
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
    approveShowcase: approveShowcase, removeShowcase: removeShowcase, mintShareToken: mintShareToken
  };
})(window);