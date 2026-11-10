/* =========================================================
   TUTOR <-> STUDENT MESSAGES — Paisley Studio   (window.TutorChat)
   ---------------------------------------------------------
   One private conversation per student and tutor, for follow-ups on
   missed work, corrections and topics a student finds hard.

     tutorChats/{studentId}_{tutorId}
       studentId, studentName, tutorId, tutorName,
       lastMessage, lastAt, lastBy, lastRole, studentReadAt, tutorReadAt, createdAt
     tutorChats/{chatId}/messages/{mid}
       senderId, senderRole ('student' | 'tutor' | 'admin'), senderName, text, topic?, createdAt

   A tutor may message only their own students (students.tutorIds /
   tutorId), and a student only their own tutors; see firestore.rules.
   functions/tutor-chat.js rings the other side's bell.
   CBC tuition students keep their own chat (tuitionChats, CBC Tuition tab).

     TutorChat.mountTutor(host, { me: { uid, name }, students: [...], subjectsFor(student) -> [labels], onUnread(n) })
       -> { setStudents(list), open(studentId), destroy() }
     TutorChat.mountStudent(host, { me: { uid, name }, profile, onUnread(n) }) -> { destroy() }
     TutorChat.watchUnread(role, uid, cb(n)) -> unsubscribe   (nav bubble before the tab is opened)
========================================================= */
(function (global) {
  'use strict';

  var COL = 'tutorChats';
  var MAX = 3000;
  var TUTOR_TEMPLATES = [
    { k: 'Missed work', icon: 'fa-clipboard-question', text: 'Hi {first}, I noticed you have not handed in your latest homework yet. Is everything okay? Please hand it in as soon as you can, and tell me here if you are stuck.' },
    { k: 'Corrections', icon: 'fa-rotate-left', text: 'Hi {first}, I have sent your work back for corrections. Read my notes, fix it and hand it in again. Ask me here if anything is not clear.' },
    { k: 'Struggling', icon: 'fa-life-ring', text: 'Hi {first}, I can see this topic has been tricky. Which part is the hardest for you? We can go through it together.' },
    { k: 'Well done', icon: 'fa-star', text: 'Well done, {first}! Your recent work was really good. Keep it up.' },
    { k: 'Check-in', icon: 'fa-hand', text: 'Hi {first}, just checking in. How are you getting on with your work this week?' }
  ];
  var STUDENT_TEMPLATES = [
    { k: 'Need help', icon: 'fa-life-ring', text: 'Hi, I need some help with ' },
    { k: 'Handed in', icon: 'fa-circle-check', text: 'Hi, I have handed in my work now.' },
    { k: 'Thank you', icon: 'fa-heart', text: 'Thank you!' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function FV() { return firebase.firestore.FieldValue; }
  function ms(t) { if (!t) return 0; if (t.toMillis) return t.toMillis(); if (t.seconds) return t.seconds * 1000; var d = new Date(t); return isNaN(d) ? 0 : d.getTime(); }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase() || '?'; }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || 'there'; }
  function when(t) {
    var x = ms(t); if (!x) return '';
    var d = new Date(x), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function stamp(t) { var x = ms(t); return x ? new Date(x).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sending…'; }
  function chatIdOf(studentId, tutorId) { return studentId + '_' + tutorId; }
  function unreadFor(chat, role, uid) {
    if (!chat || !chat.lastBy || chat.lastBy === uid) return false;
    var mine = role === 'tutor' ? chat.tutorReadAt : chat.studentReadAt;
    return !mine || ms(chat.lastAt) > ms(mine);
  }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.tch{display:grid;grid-template-columns:minmax(250px,320px) 1fr;height:min(76vh,720px);min-height:460px;background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:18px;overflow:hidden;font-family:inherit;color:var(--ink,#263331)}',
      '.tch-side{display:flex;flex-direction:column;border-right:1px solid var(--line,rgba(38,51,49,.12));min-height:0;background:var(--paper,#F1F9F7)}',
      '.tch-side-head{display:flex;align-items:center;justify-content:space-between;padding:.85rem .9rem .5rem}',
      '.tch-side-head b{font-size:.95rem;color:var(--brand-deep,#245F5A)}',
      '.tch-side-head span{font-size:.7rem;font-weight:800;color:var(--muted,#5A6E6A);background:var(--surface,#fff);border-radius:99px;padding:.15rem .55rem}',
      '.tch-search{margin:0 .9rem .5rem;padding:.55rem .75rem .55rem 2rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.84rem;background:var(--surface,#fff) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%235A6E6A%27 stroke-width=%272.5%27%3E%3Ccircle cx=%2711%27 cy=%2711%27 r=%277%27/%3E%3Cpath d=%27m20 20-3.5-3.5%27/%3E%3C/svg%3E") no-repeat .7rem center;color:inherit}',
      '.tch-search:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.tch-filters{display:flex;gap:.3rem;padding:0 .9rem .5rem;flex-wrap:wrap}',
      '.tch-filters button{border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);border-radius:99px;padding:.22rem .65rem;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer}',
      '.tch-filters button.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.tch-selbar{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.35rem .9rem;border-top:1px solid var(--line,rgba(38,51,49,.08));border-bottom:1px solid var(--line,rgba(38,51,49,.08));font-size:.74rem;color:var(--muted,#5A6E6A)}',
      '.tch-selbar label{display:inline-flex;align-items:center;gap:.35rem;cursor:pointer;font-weight:700}',
      '.tch-selbar input{accent-color:var(--brand-deep,#245F5A)}',
      '.tch-selbar button{border:0;background:var(--brand-deep,#245F5A);color:#fff;border-radius:99px;padding:.3rem .7rem;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem}',
      '.tch-selbar button[hidden]{display:none}',
      '.tch-list{flex:1;overflow:auto;padding:.3rem .45rem .6rem}',
      '.tch-row{display:flex;align-items:center;gap:.6rem;padding:.55rem .5rem;border-radius:12px;cursor:pointer;position:relative}',
      '.tch-row:hover{background:var(--surface,#fff)}',
      '.tch-row.on{background:var(--surface,#fff);box-shadow:inset 3px 0 0 var(--brand-deep,#245F5A)}',
      '.tch-row input{flex:none;accent-color:var(--brand-deep,#245F5A);width:16px;height:16px}',
      '.tch-av{width:36px;height:36px;border-radius:50%;background:var(--brand,#55BFB3);color:#04231f;display:grid;place-items:center;font-weight:800;font-size:.76rem;flex:none}',
      '.tch-av.t{background:var(--brand-deep,#245F5A);color:#fff}',
      '.tch-row .bd{flex:1;min-width:0}',
      '.tch-row .bd b{display:block;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tch-row .bd small{display:block;font-size:.72rem;color:var(--muted,#5A6E6A);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tch-row .rt{display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;font-size:.66rem;color:var(--muted,#5A6E6A);flex:none}',
      '.tch-dot{width:10px;height:10px;border-radius:50%;background:var(--error,#E74C3C)}',
      '.tch-row.unread .bd b{font-weight:800}.tch-row.unread .bd small{color:var(--ink,#263331);font-weight:700}',
      '.tch-main{display:flex;flex-direction:column;min-height:0;min-width:0}',
      '.tch-head{display:flex;align-items:center;gap:.7rem;padding:.75rem 1rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.tch-head b{display:block;font-size:.95rem;color:var(--brand-deep,#245F5A)}',
      '.tch-head small{display:block;font-size:.74rem;color:var(--muted,#5A6E6A)}',
      '.tch-back{display:none;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);border-radius:10px;width:34px;height:34px;cursor:pointer;color:var(--brand-deep,#245F5A)}',
      '.tch-msgs{flex:1;overflow:auto;padding:1rem;display:flex;flex-direction:column;gap:.45rem;background:linear-gradient(180deg,var(--surface,#fff),var(--paper,#F1F9F7))}',
      '.tch-day{align-self:center;font-size:.66rem;font-weight:800;color:var(--muted,#5A6E6A);background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:99px;padding:.15rem .6rem;margin:.4rem 0}',
      '.tch-msg{max-width:76%;padding:.55rem .8rem;border-radius:16px;font-size:.88rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--sage,#E5F2EF);align-self:flex-start;border-bottom-left-radius:5px}',
      '.tch-msg.me{align-self:flex-end;background:var(--brand-deep,#245F5A);color:#fff;border-bottom-left-radius:16px;border-bottom-right-radius:5px}',
      '.tch-msg .tag{display:inline-flex;align-items:center;gap:.25rem;font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:.08rem .45rem;border-radius:99px;background:rgba(245,200,66,.3);color:#6b4f00;margin-bottom:.25rem}',
      '.tch-msg.me .tag{background:rgba(245,200,66,.9);color:#3d2c00}',
      '.tch-msg .at{display:block;font-size:.62rem;opacity:.7;margin-top:.2rem;text-align:right}',
      '.tch-quick{display:flex;gap:.35rem;flex-wrap:wrap;padding:.55rem 1rem 0}',
      '.tch-quick button{border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--paper,#F1F9F7);color:var(--brand-deep,#245F5A);border-radius:99px;padding:.25rem .65rem;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem}',
      '.tch-quick button:hover,.tch-quick button.on{border-color:var(--brand-deep,#245F5A)}',
      '.tch-quick button.on{background:var(--brand-deep,#245F5A);color:#fff}',
      '.tch-form{display:flex;gap:.5rem;align-items:flex-end;padding:.6rem 1rem .9rem}',
      '.tch-form textarea{flex:1;resize:none;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:14px;padding:.65rem .8rem;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7);color:inherit;min-height:46px;max-height:160px}',
      '.tch-form textarea:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.tch-send{width:46px;height:46px;border-radius:14px;border:0;background:var(--brand-deep,#245F5A);color:#fff;cursor:pointer;font-size:1rem;flex:none}',
      '.tch-send:hover{background:var(--brand,#55BFB3)}',
      '.tch-send:disabled{opacity:.5;cursor:not-allowed}',
      '.tch-empty{margin:auto;text-align:center;color:var(--muted,#5A6E6A);font-size:.88rem;line-height:1.6;padding:2rem 1.2rem;max-width:380px}',
      '.tch-empty i{font-size:2rem;color:var(--brand,#55BFB3);display:block;margin-bottom:.6rem}',
      '.tch-err{font-size:.76rem;color:var(--error,#E74C3C);padding:0 1rem}',
      '.tch-to{display:flex;flex-wrap:wrap;gap:.3rem;padding:.6rem 1rem 0;max-height:110px;overflow:auto}',
      '.tch-to span{font-size:.72rem;font-weight:700;background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A);border-radius:99px;padding:.18rem .6rem}',
      '@media(max-width:760px){.tch{grid-template-columns:1fr;height:calc(100vh - 170px);min-height:420px}.tch-main{display:none}.tch.open .tch-side{display:none}.tch.open .tch-main{display:flex}.tch-back{display:inline-grid;place-items:center}.tch-msg{max-width:88%}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- writing ---------- */
  async function ensureChat(ref, base) {
    var snap = await ref.get().catch(function () { return null; });
    if (snap && snap.exists) return;
    await ref.set(Object.assign({ lastMessage: '', lastAt: null, lastBy: '', lastRole: '', createdAt: FV().serverTimestamp() }, base));
  }
  async function sendTo(ref, base, me, role, text, topic) {
    await ensureChat(ref, base);
    var msg = { senderId: me.uid, senderRole: role, senderName: me.name || '', text: text.slice(0, MAX), createdAt: FV().serverTimestamp() };
    if (topic) msg.topic = String(topic).slice(0, 60);
    await ref.collection('messages').add(msg);
    var up = { lastMessage: text.slice(0, 140), lastAt: FV().serverTimestamp(), lastBy: me.uid, lastRole: role };
    up[role === 'tutor' ? 'tutorReadAt' : 'studentReadAt'] = FV().serverTimestamp();
    await ref.update(up).catch(function (e) { console.warn('chat summary:', e && e.code); });
  }

  /* ---------- the conversation pane (shared) ---------- */
  function conversation(pane, o) {
    // o: { ref, exists(), base, me, role, other: { name, sub }, templates, onBack }
    var unsub = null, dead = false, topic = '';
    pane.innerHTML =
      '<div class="tch-head"><button type="button" class="tch-back" data-c="back" aria-label="Back to the list"><i class="fas fa-arrow-left"></i></button>' +
        '<div class="tch-av' + (o.role === 'student' ? ' t' : '') + '">' + esc(initials(o.other.name)) + '</div>' +
        '<div style="min-width:0"><b>' + esc(o.other.name) + '</b><small>' + esc(o.other.sub || '') + '</small></div></div>' +
      '<div class="tch-msgs" aria-live="polite"><div class="tch-empty"><i class="fas fa-spinner fa-spin"></i>Loading…</div></div>' +
      (o.templates && o.templates.length ? '<div class="tch-quick" role="group" aria-label="Quick messages">' + o.templates.map(function (t, i) {
        return '<button type="button" data-q="' + i + '" title="' + esc(t.text.replace('{first}', first(o.other.name))) + '"><i class="fas ' + t.icon + '"></i> ' + esc(t.k) + '</button>';
      }).join('') + '</div>' : '') +
      '<div class="tch-err" data-c="err"></div>' +
      '<div class="tch-form"><textarea rows="1" maxlength="' + MAX + '" placeholder="Write a message to ' + esc(first(o.other.name)) + '…" aria-label="Message"></textarea>' +
        '<button type="button" class="tch-send" data-c="send" title="Send (Enter)" aria-label="Send"><i class="fas fa-paper-plane"></i></button></div>';
    var list = pane.querySelector('.tch-msgs'), ta = pane.querySelector('textarea'), btn = pane.querySelector('[data-c="send"]'), errEl = pane.querySelector('[data-c="err"]');
    function paint(docs) {
      if (!docs.length) { list.innerHTML = '<div class="tch-empty"><i class="fas fa-comments"></i>No messages yet. ' + (o.role === 'tutor' ? 'Start the conversation: pick a quick message below or write your own.' : 'Say hello, or ask your tutor anything about your work.') + '</div>'; return; }
      var lastDay = '';
      list.innerHTML = docs.map(function (m) {
        var mine = m.senderId === o.me.uid, x = ms(m.createdAt), day = x ? new Date(x).toDateString() : lastDay;
        var sep = day && day !== lastDay ? '<div class="tch-day">' + esc(x ? new Date(x).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '') + '</div>' : '';
        lastDay = day;
        return sep + '<div class="tch-msg' + (mine ? ' me' : '') + '">' + (m.topic ? '<span class="tag"><i class="fas fa-tag"></i> ' + esc(m.topic) + '</span><br>' : '') +
          esc(m.text) + '<span class="at">' + (mine ? '' : esc(m.senderRole === 'admin' ? (m.senderName || 'Studio Desk') + ' · ' : '')) + esc(stamp(m.createdAt)) + '</span></div>';
      }).join('');
      list.scrollTop = list.scrollHeight;
    }
    function listen() {
      if (unsub || dead) return;
      unsub = o.ref.collection('messages').orderBy('createdAt').limitToLast(300).onSnapshot({ includeMetadataChanges: false }, function (snap) {
        paint(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })); }));
        if (o.onSeen) o.onSeen();
      }, function (e) { list.innerHTML = '<div class="tch-empty"><i class="fas fa-triangle-exclamation"></i>Could not load the messages: ' + esc(e.message || e) + '</div>'; });
    }
    if (o.exists()) listen(); else paint([]);
    function fit() { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; }
    ta.addEventListener('input', fit);
    async function send() {
      var text = ta.value.trim();
      if (!text || btn.disabled) return;
      btn.disabled = true; errEl.textContent = '';
      try {
        await sendTo(o.ref, o.base, o.me, o.role, text, topic);
        ta.value = ''; topic = ''; fit();
        Array.prototype.forEach.call(pane.querySelectorAll('[data-q]'), function (b) { b.classList.remove('on'); });
        listen();
      } catch (e) {
        console.error('send message:', e);
        errEl.textContent = e && e.code === 'permission-denied' ? 'This message could not be sent: you can only message your own ' + (o.role === 'tutor' ? 'students' : 'tutors') + '.' : 'Could not send: ' + ((e && e.message) || e);
      }
      btn.disabled = false; ta.focus();
    }
    btn.addEventListener('click', send);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    pane.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]');
      if (q) {
        var t = o.templates[Number(q.dataset.q)];
        var was = q.classList.contains('on');
        Array.prototype.forEach.call(pane.querySelectorAll('[data-q]'), function (b) { b.classList.remove('on'); });
        if (was) { topic = ''; return; }
        q.classList.add('on'); topic = t.k;
        ta.value = t.text.replace(/\{first\}/g, first(o.other.name)); fit(); ta.focus();
        return;
      }
      if (e.target.closest('[data-c="back"]') && o.onBack) o.onBack();
    });
    return { listen: listen, destroy: function () { dead = true; if (unsub) unsub(); unsub = null; } };
  }

  /* ---------------------------------------------------------
     Tutor: every student, pick one (or several) and message them
     --------------------------------------------------------- */
  function mountTutor(host, opts) {
    injectStyle();
    var me = opts.me, students = [], chats = {}, filter = 'all', query = '', current = null, conv = null, picked = {}, unsub = null;
    host.innerHTML =
      '<div class="tch">' +
        '<aside class="tch-side"><div class="tch-side-head"><b>My students</b><span data-t="count">0</span></div>' +
          '<input type="search" class="tch-search" placeholder="Search students" aria-label="Search students">' +
          '<div class="tch-filters" role="group" aria-label="Filter"><button type="button" class="on" data-f="all">All</button><button type="button" data-f="unread">Unread</button><button type="button" data-f="chats">Conversations</button></div>' +
          '<div class="tch-selbar"><label><input type="checkbox" data-t="all"> Select shown</label><button type="button" data-t="group" hidden><i class="fas fa-users"></i> Message <span>0</span></button></div>' +
          '<div class="tch-list" role="list"></div></aside>' +
        '<section class="tch-main"><div class="tch-empty"><i class="fas fa-comments"></i><b>Messages</b><br>Pick a student to follow up on missed work, corrections or a topic they find hard. Tick several to send everyone the same message.</div></section>' +
      '</div>';
    var root = host.querySelector('.tch'), listEl = host.querySelector('.tch-list'), main = host.querySelector('.tch-main');

    function subOf(s) {
      var bits = [];
      if (s.year) bits.push('Year ' + s.year); else if (s.keyStage) bits.push(String(s.keyStage).replace(/\s*\(.*/, ''));
      var subj = opts.subjectsFor ? opts.subjectsFor(s) : [];
      if (subj && subj.length) bits.push(subj.join(', '));
      if (s.studentType === 'remote') bits.push('Remote');
      return bits.join(' · ');
    }
    function shown() {
      var q = query.toLowerCase();
      return students.filter(function (s) {
        var c = chats[s.id];
        if (q && String(s.name || '').toLowerCase().indexOf(q) === -1) return false;
        if (filter === 'unread') return unreadFor(c, 'tutor', me.uid);
        if (filter === 'chats') return !!(c && c.lastAt);
        return true;
      }).sort(function (a, b) {
        var ua = unreadFor(chats[a.id], 'tutor', me.uid), ub = unreadFor(chats[b.id], 'tutor', me.uid);
        if (ua !== ub) return ua ? -1 : 1;
        var la = ms(chats[a.id] && chats[a.id].lastAt), lb = ms(chats[b.id] && chats[b.id].lastAt);
        if (la !== lb) return lb - la;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    }
    function paintList() {
      var rows = shown();
      host.querySelector('[data-t="count"]').textContent = String(students.length);
      listEl.innerHTML = rows.length ? rows.map(function (s) {
        var c = chats[s.id], un = unreadFor(c, 'tutor', me.uid);
        var line = c && c.lastMessage ? (c.lastBy === me.uid ? 'You: ' : '') + c.lastMessage : subOf(s);
        return '<div class="tch-row' + (current === s.id ? ' on' : '') + (un ? ' unread' : '') + '" role="listitem" data-s="' + esc(s.id) + '">' +
          '<input type="checkbox" data-pick="' + esc(s.id) + '"' + (picked[s.id] ? ' checked' : '') + ' aria-label="Select ' + esc(s.name || 'student') + '">' +
          '<div class="tch-av">' + esc(initials(s.name)) + '</div>' +
          '<div class="bd"><b>' + esc(s.name || s.email || 'Student') + '</b><small>' + esc(line) + '</small></div>' +
          '<div class="rt">' + (c && c.lastAt ? esc(when(c.lastAt)) : '') + (un ? '<span class="tch-dot" title="Unread"></span>' : '') + '</div></div>';
      }).join('') : '<div class="tch-empty" style="padding:1.4rem .6rem">' + (students.length ? 'No students match.' : 'No students are assigned to you yet.') + '</div>';
      var n = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
      var gb = host.querySelector('[data-t="group"]'); gb.hidden = n < 1; gb.querySelector('span').textContent = n > 1 ? n + ' students' : (n === 1 ? '1 student' : '0');
      var allBox = host.querySelector('[data-t="all"]');
      allBox.checked = rows.length > 0 && rows.every(function (s) { return picked[s.id]; });
      if (opts.onUnread) opts.onUnread(students.filter(function (s) { return unreadFor(chats[s.id], 'tutor', me.uid); }).length);
    }
    function markRead(sid) {
      var c = chats[sid];
      if (!unreadFor(c, 'tutor', me.uid)) return;
      db.collection(COL).doc(chatIdOf(sid, me.uid)).update({ tutorReadAt: FV().serverTimestamp() }).catch(function () { });
    }
    function open(sid) {
      var s = students.filter(function (x) { return x.id === sid; })[0]; if (!s) return;
      current = sid;
      if (conv) conv.destroy();
      root.classList.add('open');
      var ref = db.collection(COL).doc(chatIdOf(sid, me.uid));
      conv = conversation(main, {
        ref: ref, exists: function () { return !!chats[sid]; },
        base: { studentId: sid, studentName: s.name || '', tutorId: me.uid, tutorName: me.name || '' },
        me: me, role: 'tutor', other: { name: s.name || 'Student', sub: subOf(s) }, templates: TUTOR_TEMPLATES,
        onSeen: function () { markRead(sid); },
        onBack: function () { root.classList.remove('open'); current = null; paintList(); }
      });
      markRead(sid);
      paintList();
    }
    function openGroup() {
      var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
      var list = students.filter(function (s) { return ids.indexOf(s.id) > -1; });
      if (!list.length) return;
      if (list.length === 1) { open(list[0].id); return; }
      if (conv) conv.destroy(); conv = null; current = null;
      root.classList.add('open');
      var topic = '';
      main.innerHTML =
        '<div class="tch-head"><button type="button" class="tch-back" data-g="back" aria-label="Back to the list"><i class="fas fa-arrow-left"></i></button><div class="tch-av t"><i class="fas fa-users"></i></div>' +
          '<div><b>Message ' + list.length + ' students</b><small>Each student gets it in their own private conversation. {first} becomes each student’s first name.</small></div></div>' +
        '<div class="tch-to">' + list.map(function (s) { return '<span>' + esc(s.name || 'Student') + '</span>'; }).join('') + '</div>' +
        '<div class="tch-msgs" style="justify-content:center"><div class="tch-empty"><i class="fas fa-paper-plane"></i>Pick a quick message or write your own. Replies come back to each student’s own conversation.</div></div>' +
        '<div class="tch-quick">' + TUTOR_TEMPLATES.map(function (t, i) { return '<button type="button" data-q="' + i + '"><i class="fas ' + t.icon + '"></i> ' + esc(t.k) + '</button>'; }).join('') + '</div>' +
        '<div class="tch-err" data-g="err"></div>' +
        '<div class="tch-form"><textarea rows="2" maxlength="' + MAX + '" placeholder="Write one message for all of them…" aria-label="Message"></textarea><button type="button" class="tch-send" data-g="send" aria-label="Send to all"><i class="fas fa-paper-plane"></i></button></div>';
      var ta = main.querySelector('textarea'), btn = main.querySelector('[data-g="send"]'), errEl = main.querySelector('[data-g="err"]'), body = main.querySelector('.tch-msgs');
      main.onclick = function (e) {
        var q = e.target.closest('[data-q]');
        if (q) {
          var t = TUTOR_TEMPLATES[Number(q.dataset.q)], was = q.classList.contains('on');
          Array.prototype.forEach.call(main.querySelectorAll('[data-q]'), function (b) { b.classList.remove('on'); });
          if (was) { topic = ''; return; }
          q.classList.add('on'); topic = t.k; ta.value = t.text; ta.focus(); return;
        }
        if (e.target.closest('[data-g="back"]')) { root.classList.remove('open'); resetMain(); }
      };
      btn.onclick = async function () {
        var text = ta.value.trim(); if (!text) return;
        btn.disabled = true; errEl.textContent = '';
        var ok = 0, bad = [];
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          body.innerHTML = '<div class="tch-empty"><i class="fas fa-spinner fa-spin"></i>Sending ' + (i + 1) + ' of ' + list.length + '…</div>';
          try {
            await sendTo(db.collection(COL).doc(chatIdOf(s.id, me.uid)), { studentId: s.id, studentName: s.name || '', tutorId: me.uid, tutorName: me.name || '' }, me, 'tutor', text.replace(/\{first\}/g, first(s.name)), topic);
            ok++;
          } catch (e) { console.error('group send', s.id, e); bad.push(s.name || s.id); }
        }
        body.innerHTML = '<div class="tch-empty"><i class="fas fa-circle-check"></i>Sent to ' + ok + ' student' + (ok === 1 ? '' : 's') + '.' + (bad.length ? '<br><span style="color:var(--error,#E74C3C)">Not sent to: ' + esc(bad.join(', ')) + '</span>' : '') + '</div>';
        if (!bad.length) { ta.value = ''; picked = {}; paintList(); }
        btn.disabled = false;
      };
    }
    function resetMain() {
      if (conv) conv.destroy(); conv = null; current = null;
      main.onclick = null;
      main.innerHTML = '<div class="tch-empty"><i class="fas fa-comments"></i><b>Messages</b><br>Pick a student to follow up on missed work, corrections or a topic they find hard. Tick several to send everyone the same message.</div>';
      paintList();
    }

    host.querySelector('.tch-search').addEventListener('input', function () { query = this.value.trim(); paintList(); });
    host.querySelector('.tch-filters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      filter = b.dataset.f;
      Array.prototype.forEach.call(this.querySelectorAll('[data-f]'), function (x) { x.classList.toggle('on', x === b); });
      paintList();
    });
    host.querySelector('[data-t="all"]').addEventListener('change', function () {
      var on = this.checked; shown().forEach(function (s) { picked[s.id] = on; }); paintList();
    });
    host.querySelector('[data-t="group"]').addEventListener('click', openGroup);
    listEl.addEventListener('click', function (e) {
      var pk = e.target.closest('[data-pick]');
      if (pk) { picked[pk.dataset.pick] = pk.checked; paintList(); return; }
      var row = e.target.closest('[data-s]'); if (row) open(row.dataset.s);
    });

    unsub = db.collection(COL).where('tutorId', '==', me.uid).onSnapshot(function (snap) {
      chats = {};
      snap.docs.forEach(function (d) { var c = d.data({ serverTimestamps: 'estimate' }); if (c.studentId) chats[c.studentId] = c; });
      paintList();
      if (current && conv) conv.listen();
    }, function (e) { console.warn('tutor chats:', e && e.code); });

    function setStudents(list) {
      students = (list || []).filter(function (s) { return s && s.id && s.studentType !== 'tuition' && s.studentType !== 'tech'; });
      paintList();
    }
    setStudents(opts.students);
    return {
      setStudents: setStudents, open: open,
      destroy: function () { if (unsub) unsub(); if (conv) conv.destroy(); }
    };
  }

  /* ---------------------------------------------------------
     Student: their tutors, and the conversation with each
     --------------------------------------------------------- */
  function mountStudent(host, opts) {
    injectStyle();
    var me = opts.me, p = opts.profile || {}, tutors = [], chats = {}, current = null, conv = null, unsub = null;
    host.innerHTML =
      '<div class="tch">' +
        '<aside class="tch-side"><div class="tch-side-head"><b>My tutors</b><span data-t="count">0</span></div><div class="tch-list" role="list"><div class="tch-empty"><i class="fas fa-spinner fa-spin"></i>Loading…</div></div></aside>' +
        '<section class="tch-main"><div class="tch-empty"><i class="fas fa-comments"></i><b>Messages</b><br>Pick a tutor to ask about your work, or to reply to them.</div></section>' +
      '</div>';
    var root = host.querySelector('.tch'), listEl = host.querySelector('.tch-list'), main = host.querySelector('.tch-main');

    function paintList() {
      host.querySelector('[data-t="count"]').textContent = String(tutors.length);
      var rows = tutors.slice().sort(function (a, b) {
        var la = ms(chats[a.id] && chats[a.id].lastAt), lb = ms(chats[b.id] && chats[b.id].lastAt);
        return lb - la || String(a.name).localeCompare(String(b.name));
      });
      listEl.innerHTML = rows.length ? rows.map(function (t) {
        var c = chats[t.id], un = unreadFor(c, 'student', me.uid);
        var line = c && c.lastMessage ? (c.lastBy === me.uid ? 'You: ' : '') + c.lastMessage : (t.subjects.join(', ') || 'Your tutor');
        return '<div class="tch-row' + (current === t.id ? ' on' : '') + (un ? ' unread' : '') + '" role="listitem" data-t="' + esc(t.id) + '"><div class="tch-av t">' + esc(initials(t.name)) + '</div>' +
          '<div class="bd"><b>' + esc(t.name) + '</b><small>' + esc(line) + '</small></div>' +
          '<div class="rt">' + (c && c.lastAt ? esc(when(c.lastAt)) : '') + (un ? '<span class="tch-dot" title="Unread"></span>' : '') + '</div></div>';
      }).join('') : '<div class="tch-empty" style="padding:1.4rem .6rem">You have no tutor assigned yet. The Studio Desk will pair you with one.</div>';
      if (opts.onUnread) opts.onUnread(Object.keys(chats).filter(function (k) { return unreadFor(chats[k], 'student', me.uid); }).length);
    }
    function markRead(tid) {
      if (!unreadFor(chats[tid], 'student', me.uid)) return;
      db.collection(COL).doc(chatIdOf(me.uid, tid)).update({ studentReadAt: FV().serverTimestamp() }).catch(function () { });
    }
    function open(tid) {
      var t = tutors.filter(function (x) { return x.id === tid; })[0]; if (!t) return;
      current = tid;
      if (conv) conv.destroy();
      root.classList.add('open');
      conv = conversation(main, {
        ref: db.collection(COL).doc(chatIdOf(me.uid, tid)), exists: function () { return !!chats[tid]; },
        base: { studentId: me.uid, studentName: me.name || p.name || '', tutorId: tid, tutorName: t.name },
        me: me, role: 'student', other: { name: t.name, sub: t.subjects.length ? 'Your tutor for ' + t.subjects.join(', ') : 'Your tutor' }, templates: STUDENT_TEMPLATES,
        onSeen: function () { markRead(tid); },
        onBack: function () { root.classList.remove('open'); current = null; paintList(); }
      });
      markRead(tid);
      paintList();
    }
    listEl.addEventListener('click', function (e) { var row = e.target.closest('[data-t]'); if (row) open(row.dataset.t); });

    /* Tutors: the ones on the student record, plus anyone who already wrote to them. */
    var ids = [];
    (Array.isArray(p.tutorIds) ? p.tutorIds : []).forEach(function (x) { if (x && ids.indexOf(x) === -1) ids.push(x); });
    if (p.tutorId && ids.indexOf(p.tutorId) === -1) ids.push(p.tutorId);
    var subjBy = {};
    Object.keys(p.subjectTutors || {}).forEach(function (k) {
      var e = p.subjectTutors[k] || {}; if (!e.tutorId) return;
      var label = typeof lmzSubjectLabel === 'function' ? lmzSubjectLabel(k) : k;
      (subjBy[e.tutorId] = subjBy[e.tutorId] || []).push(label);
    });
    Promise.all(ids.map(function (id) {
      return db.collection('tutorAccounts').doc(id).get().then(function (d) {
        var t = d.exists ? d.data() : {};
        return { id: id, name: t.name || 'Tutor', subjects: subjBy[id] || [] };
      }).catch(function () { return { id: id, name: 'Tutor', subjects: subjBy[id] || [] }; });
    })).then(function (list) { tutors = list; paintList(); });

    unsub = db.collection(COL).where('studentId', '==', me.uid).onSnapshot(function (snap) {
      chats = {};
      snap.docs.forEach(function (d) {
        var c = d.data({ serverTimestamps: 'estimate' }); if (!c.tutorId) return;
        chats[c.tutorId] = c;
        if (!tutors.some(function (t) { return t.id === c.tutorId; })) tutors.push({ id: c.tutorId, name: c.tutorName || 'Tutor', subjects: subjBy[c.tutorId] || [] });
      });
      paintList();
      if (current && conv) conv.listen();
    }, function (e) { console.warn('student chats:', e && e.code); });

    return { destroy: function () { if (unsub) unsub(); if (conv) conv.destroy(); } };
  }

  function watchUnread(role, uid, cb) {
    if (!uid || typeof db === 'undefined') return function () { };
    return db.collection(COL).where(role === 'tutor' ? 'tutorId' : 'studentId', '==', uid).onSnapshot(function (snap) {
      cb(snap.docs.filter(function (d) { return unreadFor(d.data({ serverTimestamps: 'estimate' }), role, uid); }).length);
    }, function () { });
  }

  global.TutorChat = { mountTutor: mountTutor, mountStudent: mountStudent, watchUnread: watchUnread };
})(window);
