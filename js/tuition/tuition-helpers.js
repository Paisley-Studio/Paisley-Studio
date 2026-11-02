/* =========================================================
   Paisley Studio — CBC Tuition shared UI  (window.TuitionUI)
   ---------------------------------------------------------
   Used by the tuition student dashboard, the tutor dashboard,
   the parent dashboard and the admin Tuition panel.

     TuitionUI.mountChat(host, opts)          student <-> tutor chat
     TuitionUI.mountTimetable(host, opts)     read / manage the timetable
     TuitionUI.mountRequestTutor(host, opts)  "Request a tutor" (self-study students)

   Needs the global Firestore `db` (from lms-helpers.js).
   Collections: tuitionChats (+ messages), tuitionTimetable, tuitionRequests.
========================================================= */
(function (global) {
  'use strict';

  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var FV = function () { return firebase.firestore.FieldValue; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    var d = new Date(ts); return isNaN(d) ? null : d;
  }
  function fmtTime(d) {
    if (!d) return '';
    var now = new Date();
    var same = d.toDateString() === now.toDateString();
    var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return same ? t : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + t;
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function chatIdFor(studentId, tutorId) { return studentId + '_' + tutorId; }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.tu-box{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.12));border-radius:16px;padding:1.2rem}',
      '.tu-box h3{font-size:1rem;color:var(--brand-deep,#245F5A);margin:0 0 .2rem}',
      '.tu-sub{font-size:.78rem;color:var(--muted,#5A6E6A);margin-bottom:.9rem}',
      '.tu-empty{padding:1.6rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.88rem}',
      /* chat */
      '.tu-chat{display:flex;flex-direction:column;height:min(70vh,560px);min-height:360px}',
      '.tu-chat-head{display:flex;align-items:center;gap:.7rem;padding-bottom:.8rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.tu-chat-av{width:38px;height:38px;border-radius:50%;background:var(--brand,#55BFB3);color:#04231f;display:grid;place-items:center;font-weight:800;font-size:.8rem}',
      '.tu-chat-list{flex:1;overflow:auto;padding:.9rem .2rem;display:flex;flex-direction:column;gap:.5rem}',
      '.tu-msg{max-width:78%;padding:.55rem .8rem;border-radius:14px;font-size:.88rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--sage,#E5F2EF);align-self:flex-start;border-bottom-left-radius:4px}',
      '.tu-msg.me{align-self:flex-end;background:var(--brand,#55BFB3);color:#04231f;border-bottom-left-radius:14px;border-bottom-right-radius:4px}',
      '.tu-msg .who{display:block;font-size:.66rem;font-weight:800;opacity:.7;margin-bottom:.15rem}',
      '.tu-msg .at{display:block;font-size:.62rem;opacity:.6;margin-top:.2rem;text-align:right}',
      '.tu-chat-form{display:flex;gap:.5rem;padding-top:.7rem;border-top:1px solid var(--line,rgba(38,51,49,.12))}',
      '.tu-chat-form textarea{flex:1;resize:none;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:.6rem .75rem;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7);color:inherit;min-height:44px;max-height:120px}',
      '.tu-chat-form textarea:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      /* buttons + fields */
      '.tu-btn{display:inline-flex;align-items:center;gap:.4rem;border:1.5px solid var(--line,rgba(38,51,49,.12));background:var(--surface,#fff);color:inherit;border-radius:10px;padding:.5rem .9rem;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}',
      '.tu-btn.primary{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.tu-btn.danger{color:#b8362a}',
      '.tu-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.tu-f{margin-bottom:.8rem}.tu-f label{display:block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--brand-deep,#245F5A);margin-bottom:.3rem}',
      '.tu-f input,.tu-f select,.tu-f textarea{width:100%;padding:.6rem .75rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7);color:inherit}',
      '.tu-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem}',
      '.tu-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.35rem;max-height:200px;overflow:auto;padding:.5rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;background:var(--paper,#F1F9F7)}',
      '.tu-checks label{display:flex;gap:.45rem;align-items:center;font-size:.84rem;font-weight:600;text-transform:none;letter-spacing:0;color:inherit;margin:0}',
      '.tu-checks input{width:auto}',
      '.tu-msgline{font-size:.8rem;min-height:1.1rem;margin-top:.4rem}',
      /* timetable */
      '.tu-day{margin-bottom:1rem}.tu-day h4{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--brand-deep,#245F5A);margin:0 0 .4rem}',
      '.tu-slot{display:flex;gap:.8rem;align-items:flex-start;padding:.7rem .8rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;background:var(--surface,#fff);margin-bottom:.45rem}',
      '.tu-slot .t{min-width:92px;font-weight:800;font-size:.82rem;color:var(--brand-deep,#245F5A)}',
      '.tu-slot .b{flex:1;min-width:0}.tu-slot .b b{font-size:.9rem}.tu-slot .b div{font-size:.78rem;color:var(--muted,#5A6E6A);margin-top:.1rem}',
      '.tu-pill{display:inline-block;padding:.18rem .55rem;border-radius:99px;font-size:.68rem;font-weight:800}',
      '.tu-pill.pending{background:rgba(232,163,61,.16);color:#96690f}.tu-pill.ok{background:rgba(46,184,114,.14);color:#1d8b57}.tu-pill.no{background:rgba(231,76,60,.1);color:#b8362a}',
      '@media(max-width:560px){.tu-slot{flex-direction:column;gap:.3rem}.tu-msg{max-width:92%}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------
     CHAT
     opts: { chatId?, studentId, studentName, tutorId, tutorName,
             me: { uid, role: 'student'|'tutor'|'admin', name },
             readOnly?: boolean }
  --------------------------------------------------------- */
  function mountChat(host, o) {
    injectStyle();
    var chatId = o.chatId || chatIdFor(o.studentId, o.tutorId);
    var ref = db.collection('tuitionChats').doc(chatId);
    var other = o.me.role === 'student' ? (o.tutorName || 'Your tutor') : (o.studentName || 'Student');
    host.innerHTML =
      '<div class="tu-box tu-chat">' +
        '<div class="tu-chat-head"><div class="tu-chat-av">' + esc((other || '?').trim().slice(0, 2).toUpperCase()) + '</div>' +
        '<div><b style="font-size:.95rem">' + esc(other) + '</b><div class="tu-sub" style="margin:0">' +
        (o.me.role === 'student' ? 'Your tutor' : 'CBC tuition student') + (o.readOnly ? ' · read-only' : '') + '</div></div></div>' +
        '<div class="tu-chat-list" id="tuList"><div class="tu-empty">Loading messages…</div></div>' +
        (o.readOnly ? '' :
          '<div class="tu-chat-form"><textarea id="tuText" rows="1" maxlength="3000" placeholder="Write a message…"></textarea>' +
          '<button class="tu-btn primary" id="tuSend" type="button"><i class="fas fa-paper-plane"></i></button></div>') +
      '</div>';
    var list = host.querySelector('#tuList');
    var unsub = null, destroyed = false;

    function render(docs) {
      if (!docs.length) { list.innerHTML = '<div class="tu-empty">No messages yet. Say hello 👋</div>'; return; }
      list.innerHTML = docs.map(function (m) {
        var mine = m.senderId === o.me.uid;
        return '<div class="tu-msg' + (mine ? ' me' : '') + '"><span class="who">' + esc(mine ? 'You' : (m.senderName || m.senderRole || '')) + '</span>' +
          esc(m.text) + '<span class="at">' + esc(fmtTime(toDate(m.createdAt))) + '</span></div>';
      }).join('');
      list.scrollTop = list.scrollHeight;
    }

    async function ensureChat() {
      try {
        var snap = await ref.get();
        if (snap.exists) return true;
      } catch (e) { /* a missing doc can be denied for read-only viewers; fall through */ }
      if (o.readOnly) return false;
      try {
        await ref.set({
          studentId: o.studentId, studentName: o.studentName || '',
          tutorId: o.tutorId, tutorName: o.tutorName || '',
          lastMessage: '', lastAt: FV().serverTimestamp(), createdAt: FV().serverTimestamp()
        });
        return true;
      } catch (e) { list.innerHTML = '<div class="tu-empty">Chat is not available yet: ' + esc(e.message || e) + '</div>'; return false; }
    }

    ensureChat().then(function (ok) {
      if (!ok || destroyed) { if (!ok && o.readOnly) list.innerHTML = '<div class="tu-empty">No conversation yet.</div>'; return; }
      unsub = ref.collection('messages').orderBy('createdAt').limitToLast(300).onSnapshot(function (snap) {
        render(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      }, function (err) { list.innerHTML = '<div class="tu-empty">Could not load messages: ' + esc(err.message || err) + '</div>'; });
    });

    if (!o.readOnly) {
      var ta = host.querySelector('#tuText'), btn = host.querySelector('#tuSend'), busy = false;
      var send = async function () {
        var text = ta.value.trim();
        if (!text || busy) return;
        busy = true; btn.disabled = true;
        try {
          await ref.collection('messages').add({
            senderId: o.me.uid, senderRole: o.me.role, senderName: o.me.name || '',
            text: text.slice(0, 3000), createdAt: FV().serverTimestamp()
          });
          ta.value = '';
          ref.update({ lastMessage: text.slice(0, 120), lastAt: FV().serverTimestamp() }).catch(function () {});
        } catch (e) { alert('Could not send: ' + (e.message || e)); }
        busy = false; btn.disabled = false; ta.focus();
      };
      btn.addEventListener('click', send);
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    }
    return { destroy: function () { destroyed = true; if (unsub) unsub(); } };
  }

  /* ---------------------------------------------------------
     TIMETABLE
     opts: { mode: 'student'|'parent'|'tutor'|'admin',
             uid?, childId?,                       // student / parent
             tutor?: {id,name},                    // tutor mode
             students?: [{id,name,subjects:[ids],tutorIds?}],   // tutor / admin
             tutors?: [{id,name}],                 // admin: who delivers
             subjectName?: fn(id) -> label,
             user?: {uid, role, name} }
  --------------------------------------------------------- */
  function mountTimetable(host, o) {
    injectStyle();
    var manage = o.mode === 'tutor' || o.mode === 'admin';
    var state = { rows: [] };
    host.innerHTML = '<div class="tu-box"><h3>Timetable</h3><div class="tu-sub">' +
      (manage ? 'Weekly lessons for your CBC tuition students. Each lesson repeats every week.' : 'Your weekly lessons, set by your tutor and the Studio Desk.') +
      '</div><div id="ttForm"></div><div id="ttList"><div class="tu-empty">Loading…</div></div></div>';
    var listEl = host.querySelector('#ttList'), formEl = host.querySelector('#ttForm');

    async function load() {
      var q = db.collection('tuitionTimetable');
      try {
        if (o.mode === 'student') q = q.where('studentId', '==', o.uid);
        else if (o.mode === 'parent') q = q.where('studentId', '==', o.childId);
        else if (o.mode === 'tutor') q = q.where('tutorId', '==', o.tutor.id);
        var snap = await q.get();
        state.rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      } catch (e) { listEl.innerHTML = '<div class="tu-empty">Could not load the timetable: ' + esc(e.message || e) + '</div>'; return; }
      renderList();
    }

    function renderList() {
      if (!state.rows.length) { listEl.innerHTML = '<div class="tu-empty">Nothing scheduled yet.</div>'; return; }
      var html = '';
      DAYS.forEach(function (day) {
        var rows = state.rows.filter(function (r) { return r.day === day; })
          .sort(function (a, b) { return String(a.startTime || '').localeCompare(String(b.startTime || '')); });
        if (!rows.length) return;
        html += '<div class="tu-day"><h4>' + day + '</h4>' + rows.map(function (r) {
          var link = safeUrl(r.link);
          return '<div class="tu-slot"><div class="t">' + esc(r.startTime || '') + (r.endTime ? ' – ' + esc(r.endTime) : '') + '</div>' +
            '<div class="b"><b>' + esc(r.title || r.subjectName || 'Lesson') + '</b>' +
            '<div>' + esc([r.subjectName, r.tutorName ? 'with ' + r.tutorName : '', manage ? r.studentName : ''].filter(Boolean).join(' · ')) + '</div>' +
            (r.note ? '<div>' + esc(r.note) + '</div>' : '') + '</div>' +
            (link ? '<a class="tu-btn primary" target="_blank" rel="noopener noreferrer" href="' + esc(link) + '"><i class="fas fa-video"></i> Join</a>' : '') +
            (manage ? '<button class="tu-btn danger" data-del="' + esc(r.id) + '" type="button" title="Remove"><i class="fas fa-trash"></i></button>' : '') +
            '</div>';
        }).join('') + '</div>';
      });
      listEl.innerHTML = html;
      listEl.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('Remove this lesson from the timetable?')) return;
          try { await db.collection('tuitionTimetable').doc(b.dataset.del).delete(); state.rows = state.rows.filter(function (r) { return r.id !== b.dataset.del; }); renderList(); }
          catch (e) { alert('Could not remove: ' + (e.message || e)); }
        });
      });
    }

    function renderForm() {
      if (!manage) return;
      var students = (o.students || []);
      if (!students.length) { formEl.innerHTML = '<div class="tu-empty" style="padding:.6rem 0;text-align:left">No CBC students to schedule yet.</div>'; return; }
      formEl.innerHTML =
        '<details style="margin-bottom:1rem"><summary class="tu-btn primary" style="display:inline-flex;list-style:none"><i class="fas fa-plus"></i> Schedule a lesson</summary>' +
        '<div style="margin-top:.9rem">' +
        '<div class="tu-f"><label>Students</label><div class="tu-checks" id="ttStudents">' +
          students.map(function (s) { return '<label><input type="checkbox" value="' + esc(s.id) + '" /> ' + esc(s.name) + '</label>'; }).join('') + '</div></div>' +
        '<div class="tu-row">' +
          '<div class="tu-f"><label>Day</label><select id="ttDay">' + DAYS.map(function (d) { return '<option>' + d + '</option>'; }).join('') + '</select></div>' +
          '<div class="tu-f"><label>Start</label><input type="time" id="ttStart" /></div>' +
          '<div class="tu-f"><label>End</label><input type="time" id="ttEnd" /></div>' +
        '</div>' +
        '<div class="tu-row">' +
          '<div class="tu-f"><label>Subject</label><select id="ttSubject"><option value="">—</option>' + subjectOptions(students) + '</select></div>' +
          (o.mode === 'admin' ? '<div class="tu-f"><label>Tutor</label><select id="ttTutor"><option value="">— none —</option>' +
            (o.tutors || []).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') + '</select></div>' : '') +
        '</div>' +
        '<div class="tu-f"><label>Title (optional)</label><input id="ttTitle" maxlength="120" placeholder="e.g. Algebra revision" /></div>' +
        '<div class="tu-f"><label>Meeting link (optional)</label><input id="ttLink" maxlength="500" placeholder="https://meet.google.com/…" /></div>' +
        '<div class="tu-f"><label>Note (optional)</label><input id="ttNote" maxlength="300" /></div>' +
        '<button class="tu-btn primary" id="ttSave" type="button"><i class="fas fa-calendar-plus"></i> Add to timetable</button>' +
        '<div class="tu-msgline" id="ttMsg" role="status"></div></div></details>';
      formEl.querySelector('#ttSave').addEventListener('click', save);
    }

    function subjectOptions(students) {
      var seen = {}, out = '';
      students.forEach(function (s) { (s.subjects || []).forEach(function (k) {
        if (seen[k]) return; seen[k] = true;
        out += '<option value="' + esc(k) + '">' + esc(o.subjectName ? o.subjectName(k) : k) + '</option>';
      }); });
      return out;
    }

    async function save() {
      var msg = formEl.querySelector('#ttMsg'); msg.style.color = ''; msg.textContent = '';
      var ids = Array.prototype.map.call(formEl.querySelectorAll('#ttStudents input:checked'), function (c) { return c.value; });
      var day = formEl.querySelector('#ttDay').value, start = formEl.querySelector('#ttStart').value, end = formEl.querySelector('#ttEnd').value;
      if (!ids.length || !start) { msg.style.color = '#b8362a'; msg.textContent = 'Choose at least one student and a start time.'; return; }
      var link = formEl.querySelector('#ttLink').value.trim();
      if (link && !safeUrl(link)) { msg.style.color = '#b8362a'; msg.textContent = 'The meeting link must start with http:// or https://'; return; }
      var subjectId = formEl.querySelector('#ttSubject').value;
      var tutor = o.mode === 'tutor' ? o.tutor : (function () {
        var id = formEl.querySelector('#ttTutor') ? formEl.querySelector('#ttTutor').value : '';
        var t = (o.tutors || []).filter(function (x) { return x.id === id; })[0];
        return t || null;
      })();
      var btn = formEl.querySelector('#ttSave'); btn.disabled = true;
      try {
        var batch = db.batch();
        ids.forEach(function (sid) {
          var st = (o.students || []).filter(function (s) { return s.id === sid; })[0] || {};
          var data = {
            studentId: sid, studentName: st.name || '',
            day: day, startTime: start, endTime: end || '',
            subjectId: subjectId || '', subjectName: subjectId && o.subjectName ? o.subjectName(subjectId) : '',
            title: formEl.querySelector('#ttTitle').value.trim(), link: link,
            note: formEl.querySelector('#ttNote').value.trim(),
            tutorId: tutor ? tutor.id : '', tutorName: tutor ? tutor.name : '',
            createdBy: o.mode === 'tutor' ? o.tutor.id : ((o.user && o.user.uid) || ''), createdByRole: o.mode,
            createdAt: FV().serverTimestamp()
          };
          batch.set(db.collection('tuitionTimetable').doc(), data);
        });
        await batch.commit();
        msg.style.color = '#1d8b57'; msg.textContent = 'Added for ' + ids.length + ' student' + (ids.length > 1 ? 's' : '') + '.';
        await load();
      } catch (e) { msg.style.color = '#b8362a'; msg.textContent = 'Could not save: ' + (e.message || e); }
      btn.disabled = false;
    }

    renderForm();
    load();
    return { reload: load };
  }

  /* ---------------------------------------------------------
     REQUEST A TUTOR (self-study students)
     opts: { uid, profile, subjectName: fn }
  --------------------------------------------------------- */
  function mountRequestTutor(host, o) {
    injectStyle();
    var subjects = (o.profile.subjects || []);
    host.innerHTML = '<div class="tu-box"><h3>Request a tutor</h3><div class="tu-sub">You are learning with materials and assessment. Want a tutor to guide, mark and chat with you? Send a request and the Studio Desk will pair you.</div>' +
      '<div id="rqForm"></div><h3 style="margin-top:1.2rem">Your requests</h3><div id="rqList"><div class="tu-empty">Loading…</div></div></div>';
    var formEl = host.querySelector('#rqForm'), listEl = host.querySelector('#rqList');

    async function load() {
      var rows = [];
      try {
        var snap = await db.collection('tuitionRequests').where('studentId', '==', o.uid).get();
        rows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .sort(function (a, b) { return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0); });
      } catch (e) { listEl.innerHTML = '<div class="tu-empty">Could not load requests: ' + esc(e.message || e) + '</div>'; return; }
      var pending = rows.some(function (r) { return r.status === 'Pending'; });
      renderForm(pending);
      listEl.innerHTML = rows.length ? rows.map(function (r) {
        var cls = r.status === 'Approved' ? 'ok' : (r.status === 'Declined' ? 'no' : 'pending');
        return '<div class="tu-slot"><div class="t">' + esc(fmtTime(toDate(r.createdAt))) + '</div><div class="b"><b>' + esc((r.subjectNames || []).join(', ') || 'All my subjects') + '</b>' +
          (r.note ? '<div>' + esc(r.note) + '</div>' : '') + (r.adminNote ? '<div><b>Studio Desk:</b> ' + esc(r.adminNote) + '</div>' : '') + '</div>' +
          '<span class="tu-pill ' + cls + '">' + esc(r.status || 'Pending') + '</span></div>';
      }).join('') : '<div class="tu-empty">No requests yet.</div>';
    }

    function renderForm(pending) {
      if (pending) { formEl.innerHTML = '<div class="tu-empty" style="text-align:left;padding:.4rem 0">Your request is with the Studio Desk. We will notify you once a tutor is assigned.</div>'; return; }
      formEl.innerHTML =
        '<div class="tu-f"><label>Which subjects do you want help with?</label><div class="tu-checks" id="rqSubj">' +
        (subjects.length ? subjects.map(function (k) { return '<label><input type="checkbox" value="' + esc(k) + '" /> ' + esc(o.subjectName ? o.subjectName(k) : k) + '</label>'; }).join('') : '<span class="tu-sub">Add your subjects first.</span>') + '</div></div>' +
        '<div class="tu-f"><label>Anything the tutor should know? (optional)</label><textarea id="rqNote" rows="3" maxlength="1000" placeholder="e.g. I struggle with fractions and need help before my exam."></textarea></div>' +
        '<button class="tu-btn primary" id="rqSend" type="button"><i class="fas fa-user-plus"></i> Request a tutor</button><div class="tu-msgline" id="rqMsg" role="status"></div>';
      formEl.querySelector('#rqSend').addEventListener('click', send);
    }

    async function send() {
      var msg = formEl.querySelector('#rqMsg'), btn = formEl.querySelector('#rqSend');
      var ids = Array.prototype.map.call(formEl.querySelectorAll('#rqSubj input:checked'), function (c) { return c.value; });
      btn.disabled = true; msg.style.color = ''; msg.textContent = 'Sending…';
      try {
        await db.collection('tuitionRequests').add({
          studentId: o.uid, studentName: o.profile.name || '',
          grade: (o.profile.year ? 'Grade ' + o.profile.year : ''),
          subjects: ids, subjectNames: ids.map(function (k) { return o.subjectName ? o.subjectName(k) : k; }),
          note: formEl.querySelector('#rqNote').value.trim().slice(0, 1000),
          status: 'Pending', createdAt: FV().serverTimestamp()
        });
        load();
      } catch (e) { msg.style.color = '#b8362a'; msg.textContent = 'Could not send: ' + (e.message || e); btn.disabled = false; }
    }
    load();
    return { reload: load };
  }

  global.TuitionUI = { DAYS: DAYS, chatIdFor: chatIdFor, mountChat: mountChat, mountTimetable: mountTimetable, mountRequestTutor: mountRequestTutor, esc: esc, toDate: toDate, fmtTime: fmtTime };
})(window);
