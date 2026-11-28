/* =========================================================
   Paisley Tech Studio: group chatpad  (window.TechGroupChat)
   ---------------------------------------------------------
   A WhatsApp-style chat inside every Tech Studio group, so the builders
   can agree who does what and talk while they build. Their coach and the
   Studio Desk can read it and write in it.

     techGroups/{gid}/chat/{mid}
        { senderId, senderRole: student|coach|admin, senderName, text,
          attachments: [{ name, url, type, size, path }],
          voice: { url, path, type, duration, size },        a voice note
          replyTo: { id, name, text },                         quoting a message
          reactions: { uid: emoji },                           one per person
          emailTo: ['students', 'parents'],                    staff only: email it too
          mailed: { students, parents, count, at, byName },    written by functions
          deleted, deletedAt, createdAt }
     techGroups/{gid}/chatPresence/{uid}
        { uid, role, name, online, seenAt, typingAt, recordingAt, readAt }
     Storage: techGroupChat/{gid}/m/{uid}/...      (members)
              techGroupChat/{gid}/staff/{uid}/...  (coaches, Studio Desk)

   Teammates who are not in the chat get a push notification on their
   devices (onTechGroupChatMessage). Staff can email any message to the
   builders and/or their families (emailTechGroupMessage).

     TechGroupChat.mount(host, { group, me: { uid, role, name }, height })
     TechGroupChat.openDrawer({ group, me })            a side panel (inside a task)
     TechGroupChat.watchUnread(groups, uid, cb)          cb({ gid: n }, total)
========================================================= */
(function (g) {
  'use strict';
  if (g.TechGroupChat) return;
  var FV = function () { return firebase.firestore.FieldValue; };
  var MAX_FILE = 25 * 1024 * 1024, MAX_FILES = 8, MAX_VOICE_S = 5 * 60, TYPING_MS = 6500, ONLINE_MS = 75 * 1000;
  var QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  var BLOCKED = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)$|javascript/i;
  /* Name colours for other people's bubbles: fixed per person (hash of the uid), dark enough for white. */
  var NAME_INK = ['#1d6bc4', '#c4561d', '#00806a', '#9a6a00', '#b83f72', '#1f7a1f', '#5a3fcf', '#c0392b'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toDate(ts) { if (!ts) return null; if (typeof ts.toDate === 'function') return ts.toDate(); if (ts.seconds) return new Date(ts.seconds * 1000); var d = new Date(ts); return isNaN(d) ? null : d; }
  function ms(ts) { var d = toDate(ts); return d ? d.getTime() : 0; }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || 'Someone'; }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (x) { return x.charAt(0); }).join('').toUpperCase() || '?'; }
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function ink(uid) { return NAME_INK[hash(uid) % NAME_INK.length]; }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function errMsg(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }
  function clock(d) { return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; }
  function dayWord(d) {
    if (!d) return '';
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var x = new Date(d); x.setHours(0, 0, 0, 0);
    var diff = Math.round((t - x) / 86400000);
    if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
  }
  function ago(t) {
    if (!t) return 'not seen here yet';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'last seen just now';
    if (s < 3600) return 'last seen ' + Math.round(s / 60) + ' min ago';
    var d = new Date(t);
    if (s < 86400) return 'last seen today at ' + clock(d);
    return 'last seen ' + dayWord(d).toLowerCase() + ' at ' + clock(d);
  }
  function mmss(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function sizeWord(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function fileIcon(t, n) {
    t = String(t || ''); n = String(n || '').toLowerCase();
    if (/^image\//.test(t)) return 'fa-image'; if (/^video\//.test(t)) return 'fa-file-video'; if (/^audio\//.test(t)) return 'fa-file-audio';
    if (/pdf/.test(t) || /\.pdf$/.test(n)) return 'fa-file-pdf'; if (/zip/.test(t) || /\.(zip|rar|7z)$/.test(n)) return 'fa-file-zipper';
    if (/word|\.docx?$/.test(t + n)) return 'fa-file-word'; if (/sheet|excel|csv|\.xlsx?$/.test(t + n)) return 'fa-file-excel';
    if (/presentation|powerpoint|\.pptx?$/.test(t + n)) return 'fa-file-powerpoint';
    if (/\.(py|js|ts|html|css|json|java|c|cpp|cs|rb|go|php|sql|ino|sh)$/.test(n)) return 'fa-file-code';
    return 'fa-file';
  }
  /* Links in what people type become clickable; everything else is escaped. */
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; });
  }
  function onlyEmoji(t) { t = String(t || '').trim(); return !!t && t.length <= 12 && !/[\w\s.,!?'"()\-]/.test(t.replace(/️/g, '')); }
  function preview(m) {
    if (!m) return '';
    if (m.deleted) return 'This message was deleted';
    if (m.voice) return 'Voice note (' + mmss(m.voice.duration) + ')';
    if (m.text) return String(m.text).slice(0, 140);
    var a = m.attachments || [];
    if (!a.length) return '';
    var pics = a.filter(function (x) { return /^image\//.test(x.type || ''); }).length;
    return pics === a.length ? (pics === 1 ? 'Photo' : pics + ' photos') : (a.length === 1 ? (a[0].name || 'File') : a.length + ' files');
  }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.id = 'tgc-style';
    s.textContent = [
      '.tgc{--tgc-me:#D8F3EE;--tgc-them:#fff;--tgc-ink:#1D2A28;--tgc-mut:#5A6E6A;--tgc-line:rgba(38,51,49,.1);--tgc-deep:#245F5A;--tgc-brand:#55BFB3;position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--tgc-line);border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(36,95,90,.08);font-family:inherit;color:var(--tgc-ink);min-height:420px}',
      '.tgc *{box-sizing:border-box}',
      /* header */
      '.tgc-head{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:linear-gradient(135deg,#1c4f4a,#245F5A 60%,#2c7068);color:#fff;flex:none}',
      '.tgc-av{width:42px;height:42px;border-radius:50%;flex:none;display:grid;place-items:center;background:rgba(255,255,255,.14);color:#fff;font-size:1.05rem;border:1.5px solid rgba(255,255,255,.25)}',
      '.tgc-ht{flex:1;min-width:0;background:none;border:0;color:inherit;text-align:left;font:inherit;cursor:pointer;padding:0}',
      '.tgc-ht b{display:block;font-size:1rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tgc-ht small{display:block;font-size:.76rem;font-weight:600;opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tgc-ht small.live{color:#9CF0E2;opacity:1}',
      '.tgc-hbtn{width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;transition:background .15s}',
      '.tgc-hbtn:hover{background:rgba(255,255,255,.2)}',
      '.tgc-hbtn:focus-visible,.tgc-ibtn:focus-visible,.tgc-send:focus-visible{outline:3px solid #F5C842;outline-offset:2px}',
      /* push hint */
      '.tgc-hint{display:flex;align-items:center;gap:.6rem;padding:.55rem 1rem;background:#FFF8E1;border-bottom:1px solid rgba(245,200,66,.45);font-size:.78rem;font-weight:700;color:#6b5200;flex:none}',
      '.tgc-hint i{color:#b88a00}.tgc-hint span{flex:1}',
      '.tgc-hint button{border:0;border-radius:99px;padding:.3rem .75rem;font:inherit;font-weight:800;font-size:.74rem;cursor:pointer;background:#245F5A;color:#fff}',
      '.tgc-hint button.x{background:none;color:#6b5200;padding:.3rem .4rem}',
      /* messages */
      '.tgc-list{flex:1;min-height:0;overflow-y:auto;padding:1rem clamp(.6rem,2.5vw,1.4rem) .6rem;display:flex;flex-direction:column;gap:.18rem;background-color:#EEF5F3;background-image:radial-gradient(rgba(36,95,90,.07) 1px,transparent 1.2px);background-size:18px 18px;scroll-behavior:auto}',
      '.tgc-day{align-self:center;margin:.7rem 0 .45rem;padding:.25rem .8rem;border-radius:9px;background:rgba(255,255,255,.92);font-size:.7rem;font-weight:800;color:var(--tgc-mut);box-shadow:0 1px 2px rgba(0,0,0,.06);letter-spacing:.02em}',
      '.tgc-sys{align-self:center;max-width:85%;text-align:center;margin:.4rem 0;padding:.4rem .8rem;border-radius:10px;background:#FFF5CF;font-size:.74rem;font-weight:700;color:#6b5200}',
      '.tgc-row{display:flex;align-items:flex-end;gap:.4rem;max-width:100%}',
      '.tgc-row.me{justify-content:flex-end}',
      '.tgc-row.cont{margin-top:-.02rem}.tgc-row.gap{margin-top:.45rem}',
      '.tgc-pav{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:.66rem;font-weight:800;color:#fff}',
      '.tgc-pav.ghost{visibility:hidden}',
      '.tgc-b{position:relative;max-width:min(78%,520px);padding:.42rem .65rem .3rem;border-radius:14px;background:var(--tgc-them);box-shadow:0 1px 1.5px rgba(0,0,0,.08);font-size:.9rem;line-height:1.42;word-wrap:break-word;overflow-wrap:anywhere}',
      '.tgc-row.me .tgc-b{background:var(--tgc-me)}',
      '.tgc-row.gap:not(.me) .tgc-b{border-top-left-radius:4px}.tgc-row.gap.me .tgc-b{border-top-right-radius:4px}',
      '.tgc-b.staff{background:#FFF6DA}',
      '.tgc-who{display:flex;align-items:center;gap:.35rem;font-size:.74rem;font-weight:800;margin-bottom:.1rem}',
      '.tgc-who em{font-style:normal;font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:.05rem .4rem;border-radius:99px;background:rgba(245,200,66,.35);color:#6b5200}',
      '.tgc-txt{white-space:pre-wrap}.tgc-txt a{color:#1d6bc4;font-weight:700;text-decoration:underline}',
      '.tgc-txt.big{font-size:2rem;line-height:1.2}',
      '.tgc-del{font-style:italic;color:var(--tgc-mut);display:flex;gap:.35rem;align-items:center;font-size:.84rem}',
      '.tgc-meta{float:right;display:inline-flex;align-items:center;gap:.25rem;margin:.35rem 0 -.1rem .7rem;font-size:.64rem;font-weight:700;color:var(--tgc-mut);white-space:nowrap;position:relative;top:.2rem}',
      '.tgc-meta .tk{font-size:.7rem;color:#8a9a97}.tgc-meta .tk.read{color:#1aa6e8}',
      '.tgc-meta .mail{color:#9a6a00}',
      '.tgc-quote{display:block;width:100%;text-align:left;font:inherit;cursor:pointer;margin:.1rem 0 .3rem;padding:.35rem .55rem;border:0;border-left:4px solid var(--q,#55BFB3);border-radius:8px;background:rgba(36,95,90,.07);font-size:.78rem;color:var(--tgc-ink)}',
      '.tgc-quote b{display:block;font-size:.72rem;color:var(--q,#245F5A)}.tgc-quote span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}',
      '.tgc-pics{display:grid;gap:3px;margin:.1rem 0 .25rem;border-radius:10px;overflow:hidden;max-width:300px}',
      '.tgc-pics.n2,.tgc-pics.n3,.tgc-pics.n4{grid-template-columns:1fr 1fr}',
      '.tgc-pics a{display:block;background:#dfe9e7;line-height:0}.tgc-pics img{width:100%;height:100%;max-height:260px;object-fit:cover;display:block}',
      '.tgc-pics.n2 img,.tgc-pics.n3 img,.tgc-pics.n4 img{height:140px}',
      '.tgc-file{display:flex;align-items:center;gap:.6rem;margin:.15rem 0 .25rem;padding:.5rem .65rem;border-radius:10px;background:rgba(36,95,90,.07);color:inherit;text-decoration:none;max-width:300px}',
      '.tgc-file i{font-size:1.5rem;color:var(--tgc-deep)}.tgc-file span{min-width:0;flex:1}.tgc-file b{display:block;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tgc-file small{font-size:.68rem;color:var(--tgc-mut);font-weight:700}',
      '.tgc-file:hover{background:rgba(36,95,90,.12)}',
      /* voice note */
      '.tgc-voice{display:flex;align-items:center;gap:.6rem;min-width:min(240px,60vw);padding:.15rem 0 .1rem}',
      '.tgc-play{width:38px;height:38px;border-radius:50%;border:0;flex:none;display:grid;place-items:center;background:var(--tgc-deep);color:#fff;cursor:pointer;font-size:.85rem}',
      '.tgc-play:hover{background:#1c4f4a}',
      '.tgc-wave{flex:1;height:26px;display:flex;align-items:center;gap:2px;cursor:pointer;position:relative}',
      '.tgc-wave i{flex:1;border-radius:2px;background:rgba(36,95,90,.28);min-height:3px}',
      '.tgc-wave i.on{background:var(--tgc-deep)}',
      '.tgc-vt{font-size:.68rem;font-weight:800;color:var(--tgc-mut);min-width:2.4rem;text-align:right}',
      '.tgc-vav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;font-weight:800;color:#fff;flex:none;position:relative}',
      '.tgc-vav::after{content:"\\f130";font-family:"Font Awesome 6 Free";font-weight:900;position:absolute;right:-3px;bottom:-3px;font-size:.6rem;width:16px;height:16px;border-radius:50%;background:#1aa6e8;color:#fff;display:grid;place-items:center}',
      /* reactions + menu */
      '.tgc-reacts{display:flex;gap:.2rem;flex-wrap:wrap;margin:-.35rem .5rem .25rem;position:relative;z-index:1}',
      '.tgc-row.me+.tgc-reacts,.tgc-reacts.me{justify-content:flex-end}',
      '.tgc-react{border:1px solid var(--tgc-line);background:#fff;border-radius:99px;padding:.05rem .45rem;font-size:.82rem;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08);display:inline-flex;gap:.25rem;align-items:center}',
      '.tgc-react small{font-size:.66rem;font-weight:800;color:var(--tgc-mut)}.tgc-react.mine{border-color:var(--tgc-brand);background:#E8F7F4}',
      '.tgc-more{position:absolute;top:2px;right:2px;width:24px;height:24px;border-radius:50%;border:0;background:inherit;color:var(--tgc-mut);display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .12s;font-size:.7rem}',
      '.tgc-b:hover .tgc-more,.tgc-more:focus-visible{opacity:1}',
      '@media (hover:none){.tgc-more{opacity:.55}}',
      '.tgc-pop{position:absolute;z-index:30;min-width:210px;background:#fff;border:1px solid var(--tgc-line);border-radius:14px;box-shadow:0 14px 40px rgba(15,26,20,.22);padding:.35rem;animation:tgcIn .12s ease-out}',
      '.tgc-pop .q{display:flex;justify-content:space-between;gap:.15rem;padding:.25rem .25rem .45rem;border-bottom:1px solid var(--tgc-line);margin-bottom:.25rem}',
      '.tgc-pop .q button{border:0;background:none;font-size:1.35rem;cursor:pointer;border-radius:50%;width:36px;height:36px;line-height:1;transition:transform .12s}',
      '.tgc-pop .q button:hover{background:#EEF5F3;transform:scale(1.15)}',
      '.tgc-pop .it{display:flex;align-items:center;gap:.6rem;width:100%;border:0;background:none;font:inherit;font-size:.84rem;font-weight:700;text-align:left;padding:.5rem .6rem;border-radius:9px;cursor:pointer;color:var(--tgc-ink)}',
      '.tgc-pop .it:hover{background:#EEF5F3}.tgc-pop .it i{width:16px;text-align:center;color:var(--tgc-deep)}.tgc-pop .it.bad,.tgc-pop .it.bad i{color:#b8362a}',
      '.tgc-pop .seen{padding:.4rem .6rem .2rem;font-size:.72rem;font-weight:700;color:var(--tgc-mut);border-top:1px solid var(--tgc-line);margin-top:.25rem}',
      '@keyframes tgcIn{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}',
      '.tgc-row.flash .tgc-b{animation:tgcFlash 1.4s ease}',
      '@keyframes tgcFlash{0%,60%{box-shadow:0 0 0 4px rgba(245,200,66,.7)}100%{box-shadow:0 1px 1.5px rgba(0,0,0,.08)}}',
      /* typing bubble + jump */
      '.tgc-typing{display:flex;align-items:center;gap:.45rem;align-self:flex-start;margin:.35rem 0 .1rem;padding:.45rem .75rem;background:#fff;border-radius:14px;border-top-left-radius:4px;box-shadow:0 1px 1.5px rgba(0,0,0,.08);font-size:.74rem;font-weight:700;color:var(--tgc-deep)}',
      '.tgc-typing[hidden]{display:none}',
      '.tgc-dots{display:inline-flex;gap:3px}.tgc-dots i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:tgcDot 1.2s infinite}.tgc-dots i:nth-child(2){animation-delay:.2s}.tgc-dots i:nth-child(3){animation-delay:.4s}',
      '@keyframes tgcDot{0%,80%,100%{opacity:.25;transform:none}40%{opacity:1;transform:translateY(-2px)}}',
      '.tgc-jump{position:absolute;right:1rem;bottom:5.4rem;width:42px;height:42px;border-radius:50%;border:0;background:#fff;color:var(--tgc-deep);box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;display:grid;place-items:center;z-index:5}',
      '.tgc-jump[hidden]{display:none}.tgc-jump b{position:absolute;top:-6px;right:-4px;min-width:20px;height:20px;border-radius:99px;background:#1aa6e8;color:#fff;font-size:.66rem;display:grid;place-items:center;padding:0 5px}',
      '.tgc-empty{margin:auto;text-align:center;max-width:340px;padding:1.4rem;background:rgba(255,255,255,.9);border-radius:16px;font-size:.86rem;color:var(--tgc-mut);font-weight:600}',
      '.tgc-empty i{display:block;font-size:1.8rem;color:var(--tgc-brand);margin-bottom:.5rem}',
      /* composer */
      '.tgc-foot{flex:none;background:#F4F8F7;border-top:1px solid var(--tgc-line);padding:.5rem .6rem calc(.5rem + env(safe-area-inset-bottom,0px))}',
      '.tgc-reply{display:flex;align-items:center;gap:.5rem;margin:0 .2rem .45rem;padding:.45rem .6rem;border-radius:10px;background:#fff;border-left:4px solid var(--q,#55BFB3);font-size:.78rem}',
      '.tgc-reply div{flex:1;min-width:0}.tgc-reply b{display:block;font-size:.72rem;color:var(--q,#245F5A)}.tgc-reply span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tgc-mut)}',
      '.tgc-reply[hidden],.tgc-mailbar[hidden]{display:none}',
      '.tgc-x{border:0;background:none;color:var(--tgc-mut);cursor:pointer;width:28px;height:28px;border-radius:50%;flex:none}.tgc-x:hover{background:#EEF5F3}',
      '.tgc-tray{display:flex;gap:.45rem;flex-wrap:wrap;margin:0 .2rem .45rem}.tgc-tray:empty{display:none}',
      '.tgc-tray .it{position:relative;display:flex;align-items:center;gap:.4rem;border:1px solid var(--tgc-line);border-radius:10px;padding:.25rem .45rem .25rem .25rem;font-size:.74rem;font-weight:700;background:#fff;max-width:210px}',
      '.tgc-tray .it img{width:44px;height:44px;object-fit:cover;border-radius:7px}.tgc-tray .it span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tgc-tray .it button{border:0;background:none;cursor:pointer;color:#b8362a;padding:0 .15rem}',
      '.tgc-mailbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:0 .2rem .45rem;padding:.45rem .65rem;border-radius:10px;background:#FFF6DA;font-size:.76rem;font-weight:700;color:#6b5200}',
      '.tgc-mailbar label{display:inline-flex;align-items:center;gap:.3rem;cursor:pointer;padding:.15rem .5rem;border-radius:99px;background:#fff;border:1px solid rgba(245,200,66,.6)}',
      '.tgc-bar{display:flex;align-items:flex-end;gap:.4rem}',
      '.tgc-box{flex:1;min-width:0;display:flex;align-items:flex-end;gap:.15rem;background:#fff;border:1.5px solid var(--tgc-line);border-radius:24px;padding:.2rem .3rem .2rem .2rem;transition:border-color .15s}',
      '.tgc-box:focus-within{border-color:var(--tgc-brand)}',
      '.tgc-box .pz-emo-row{flex:1;min-width:0;gap:.1rem}',
      '.tgc-box .pz-emo-btn{width:38px;height:38px;color:#5A6E6A}',
      '.tgc-ta{flex:1;min-width:0;border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:.92rem;line-height:1.4;padding:.55rem .35rem;max-height:140px;color:var(--tgc-ink)}',
      '.tgc-ibtn{width:38px;height:38px;border-radius:50%;border:0;background:transparent;color:#5A6E6A;display:grid;place-items:center;cursor:pointer;flex:none;font-size:1.02rem;transition:background .15s,color .15s}',
      '.tgc-ibtn:hover{background:#EEF5F3;color:var(--tgc-deep)}.tgc-ibtn.on{color:#9a6a00;background:#FFF2C2}',
      '.tgc-send{width:46px;height:46px;border-radius:50%;border:0;flex:none;display:grid;place-items:center;cursor:pointer;background:var(--tgc-deep);color:#fff;font-size:1rem;box-shadow:0 4px 12px rgba(36,95,90,.3);transition:transform .12s,background .15s}',
      '.tgc-send:hover{background:#1c4f4a;transform:scale(1.05)}.tgc-send:disabled{opacity:.6;cursor:wait;transform:none}',
      '.tgc-send.rec{background:#E74C3C}',
      '.tgc-recbar{flex:1;display:flex;align-items:center;gap:.7rem;background:#fff;border:1.5px solid rgba(231,76,60,.35);border-radius:24px;padding:.35rem .5rem .35rem .9rem;min-height:46px}',
      '.tgc-recbar[hidden]{display:none}',
      '.tgc-recdot{width:10px;height:10px;border-radius:50%;background:#E74C3C;animation:tgcRec 1s infinite}',
      '@keyframes tgcRec{50%{opacity:.25}}',
      '.tgc-recbar b{font-variant-numeric:tabular-nums;font-size:.9rem}.tgc-recbar span{flex:1;font-size:.78rem;font-weight:700;color:var(--tgc-mut)}',
      '.tgc-note{font-size:.72rem;font-weight:700;color:#b8362a;margin:.35rem .4rem 0;min-height:0}.tgc-note:empty{display:none}',
      '.tgc.drop .tgc-list{outline:3px dashed var(--tgc-brand);outline-offset:-8px}',
      '.tgc-ro{padding:.8rem 1rem;text-align:center;font-size:.8rem;font-weight:700;color:var(--tgc-mut);background:#F4F8F7;border-top:1px solid var(--tgc-line)}',
      /* people sheet + dialogs */
      '.tgc-sheet{position:absolute;inset:0;z-index:40;background:rgba(15,26,20,.35);display:flex;justify-content:flex-end;animation:tgcFade .15s}',
      '@keyframes tgcFade{from{opacity:0}}',
      '.tgc-sheet>div{width:min(340px,100%);height:100%;background:#fff;overflow:auto;padding:1rem;box-shadow:-10px 0 30px rgba(0,0,0,.15)}',
      '.tgc-sheet h4{margin:0 0 .2rem;font-size:1rem;color:var(--tgc-deep);display:flex;align-items:center;justify-content:space-between}',
      '.tgc-sheet .sub{font-size:.76rem;color:var(--tgc-mut);font-weight:600;margin-bottom:.8rem}',
      '.tgc-person{display:flex;align-items:center;gap:.65rem;padding:.55rem .3rem;border-top:1px solid var(--tgc-line)}',
      '.tgc-person .pav{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.78rem;position:relative;flex:none}',
      '.tgc-person .pav.on::after{content:"";position:absolute;right:0;bottom:0;width:11px;height:11px;border-radius:50%;background:#2EB872;border:2px solid #fff}',
      '.tgc-person b{display:block;font-size:.86rem}.tgc-person small{display:block;font-size:.72rem;color:var(--tgc-mut);font-weight:600}',
      '.tgc-dlg{position:absolute;inset:0;z-index:45;background:rgba(15,26,20,.45);display:grid;place-items:center;padding:1rem}',
      '.tgc-dlg>div{width:min(440px,100%);max-height:100%;overflow:auto;background:#fff;border-radius:18px;padding:1.2rem;box-shadow:0 20px 50px rgba(0,0,0,.25)}',
      '.tgc-dlg h4{margin:0 0 .3rem;color:var(--tgc-deep);font-size:1.05rem}.tgc-dlg p{margin:0 0 .8rem;font-size:.82rem;color:var(--tgc-mut);font-weight:600}',
      '.tgc-dlg blockquote{margin:0 0 .8rem;padding:.55rem .75rem;border-left:4px solid var(--tgc-brand);background:#EEF5F3;border-radius:8px;font-size:.84rem;white-space:pre-wrap;max-height:140px;overflow:auto}',
      '.tgc-dlg label.ck{display:flex;align-items:center;gap:.55rem;padding:.55rem .7rem;border:1.5px solid var(--tgc-line);border-radius:12px;margin-bottom:.45rem;font-size:.86rem;font-weight:700;cursor:pointer}',
      '.tgc-dlg label.ck small{margin-left:auto;color:var(--tgc-mut);font-weight:700;font-size:.72rem}',
      '.tgc-dlg textarea{width:100%;border:1.5px solid var(--tgc-line);border-radius:12px;padding:.55rem .7rem;font:inherit;font-size:.86rem;resize:vertical;min-height:70px;margin:.2rem 0 .8rem}',
      '.tgc-dlg .acts{display:flex;justify-content:flex-end;gap:.5rem;flex-wrap:wrap}',
      '.tgc-btn{border:1.5px solid var(--tgc-line);background:#fff;color:var(--tgc-deep);border-radius:12px;padding:.55rem 1rem;font:inherit;font-weight:800;font-size:.82rem;cursor:pointer;display:inline-flex;gap:.45rem;align-items:center}',
      '.tgc-btn.primary{background:var(--tgc-deep);border-color:var(--tgc-deep);color:#fff}.tgc-btn:disabled{opacity:.6;cursor:wait}',
      '.tgc-dlg .err{color:#b8362a;font-size:.78rem;font-weight:700;margin:-.3rem 0 .6rem;min-height:1em}',
      /* drawer and floating button (inside a task) */
      '.tgc-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:900;height:54px;border-radius:99px;border:0;padding:0 1.15rem 0 1rem;display:inline-flex;align-items:center;gap:.55rem;background:#245F5A;color:#fff;font:inherit;font-weight:800;font-size:.9rem;box-shadow:0 10px 28px rgba(36,95,90,.4);cursor:pointer}',
      '.tgc-fab:hover{background:#1c4f4a}.tgc-fab i{font-size:1.15rem}',
      '.tgc-fab b{min-width:22px;height:22px;border-radius:99px;background:#1aa6e8;color:#fff;font-size:.72rem;display:grid;place-items:center;padding:0 6px}.tgc-fab b[hidden]{display:none}',
      '.tgc-drawer{position:fixed;inset:0;z-index:1000;display:flex;justify-content:flex-end;background:rgba(15,26,20,.3);animation:tgcFade .15s}',
      '.tgc-drawer>div{width:min(440px,100vw);height:100%;padding:.6rem;display:flex}',
      '.tgc-drawer .tgc{flex:1;min-height:0;height:100%;border-radius:18px}',
      '@media (max-width:560px){.tgc-drawer>div{padding:0}.tgc-drawer .tgc{border-radius:0}.tgc-b{max-width:86%}.tgc-fab span{display:none}.tgc-fab{padding:0 1rem}}',
      '.tgc-nav{flex:none;margin-left:.35rem;display:inline-flex;align-items:center;gap:.25rem;min-width:20px;height:20px;padding:0 7px;border-radius:10px;background:#1aa6e8;color:#fff;font-size:.68rem;font-weight:800;line-height:20px}',
      '.tgc-nav i{font-size:.6rem}.tk-bub+.tgc-nav,.badge+.tgc-nav{margin-left:.3rem}',
      '.nav .tgc-nav:first-of-type{margin-left:auto}',
      '@media (prefers-reduced-motion:reduce){.tgc *{animation:none!important;transition:none!important}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function groupRef(gid) { return db.collection('techGroups').doc(gid); }
  function isStaff(role) { return role === 'coach' || role === 'admin'; }

  /* ---------------------------------------------------------
     The chat itself
     --------------------------------------------------------- */
  function mount(host, o) {
    style();
    var me = o.me || {}, role = me.role || 'student', staff = isStaff(role), gr = o.group || {};
    var ref = groupRef(gr.id), chatCol = ref.collection('chat'), presCol = ref.collection('chatPresence');
    var canWrite = o.readOnly !== true;
    var dead = false, unsub = null, presUnsub = null, timers = [];
    var msgs = [], people = {}, firstPaint = true, replyTo = null, pending = [], busy = false, newBelow = 0, lastCount = 0;
    var memberIds = function () { return (gr.memberIds || []).slice(); };
    var nameOf = function (uid) {
      var m = (gr.members || []).filter(function (x) { return x.id === uid; })[0];
      if (m) return m.name; var p = people[uid]; return p && p.name ? p.name : '';
    };

    host.innerHTML = '<div class="tgc" style="height:' + esc(o.height || 'min(78vh,720px)') + '">' +
      '<div class="tgc-head"><span class="tgc-av" aria-hidden="true"><i class="fas fa-people-group"></i></span>' +
        '<button type="button" class="tgc-ht" data-c="people" title="See who is in the group"><b>' + esc(gr.name || 'Group chat') + '</b><small data-c-sub>…</small></button>' +
        '<button type="button" class="tgc-hbtn" data-c="people" aria-label="People in the group"><i class="fas fa-users"></i></button>' +
        (o.onClose ? '<button type="button" class="tgc-hbtn" data-c="close" aria-label="Close the chat"><i class="fas fa-xmark"></i></button>' : '') +
      '</div>' +
      '<div data-c-hint></div>' +
      '<div class="tgc-list" data-c-list role="log" aria-live="polite" aria-label="Messages"><div class="tgc-empty"><i class="fas fa-spinner fa-spin"></i>Loading the chat…</div></div>' +
      '<button type="button" class="tgc-jump" data-c="jump" hidden aria-label="Go to the newest message"><i class="fas fa-chevron-down"></i><b hidden></b></button>' +
      (canWrite ? '<div class="tgc-foot">' +
        '<div class="tgc-reply" data-c-reply hidden></div>' +
        '<div class="tgc-tray" data-c-tray></div>' +
        (staff ? '<div class="tgc-mailbar" data-c-mailbar hidden><i class="fas fa-envelope"></i> Also email this message to' +
          '<label><input type="checkbox" data-c-mail="students" checked> the builders</label><label><input type="checkbox" data-c-mail="parents"> their parents</label></div>' : '') +
        '<div class="tgc-bar">' +
          '<div class="tgc-box" data-c-box>' +
            '<button type="button" class="tgc-ibtn" data-c="attach" aria-label="Send photos or files" title="Photos and files (you can also paste or drop them here)"><i class="fas fa-paperclip"></i></button>' +
            '<textarea class="tgc-ta" data-c-ta rows="1" maxlength="4000" placeholder="Type a message" aria-label="Type a message"></textarea>' +
            (staff ? '<button type="button" class="tgc-ibtn" data-c="mail" aria-pressed="false" aria-label="Also email this message" title="Also email this message to the builders or their parents"><i class="fas fa-envelope"></i></button>' : '') +
          '</div>' +
          '<div class="tgc-recbar" data-c-rec hidden><span class="tgc-recdot"></span><b data-c-rect>0:00</b><span>Recording… tap send when you are done</span>' +
            '<button type="button" class="tgc-ibtn" data-c="reccancel" aria-label="Delete the recording"><i class="fas fa-trash"></i></button></div>' +
          '<button type="button" class="tgc-send" data-c="send" aria-label="Record a voice note" title="Hold a chat: tap to record a voice note"><i class="fas fa-microphone"></i></button>' +
        '</div>' +
        '<input type="file" data-c-file multiple hidden>' +
        '<div class="tgc-note" data-c-note role="status"></div>' +
      '</div>' : '<div class="tgc-ro"><i class="fas fa-eye"></i> You can read this chat.</div>') +
    '</div>';

    var root = host.querySelector('.tgc'), list = root.querySelector('[data-c-list]'), sub = root.querySelector('[data-c-sub]');
    var ta = root.querySelector('[data-c-ta]'), sendBtn = root.querySelector('[data-c="send"]'), tray = root.querySelector('[data-c-tray]');
    var replyEl = root.querySelector('[data-c-reply]'), noteEl = root.querySelector('[data-c-note]'), jumpBtn = root.querySelector('[data-c="jump"]');
    var fileIn = root.querySelector('[data-c-file]'), mailBar = root.querySelector('[data-c-mailbar]'), mailBtn = root.querySelector('[data-c="mail"]');
    var boxEl = root.querySelector('[data-c-box]'), recBar = root.querySelector('[data-c-rec]'), recT = root.querySelector('[data-c-rect]');
    function note(t) { if (noteEl) { noteEl.textContent = t || ''; if (t) setTimeout(function () { if (noteEl.textContent === t) noteEl.textContent = ''; }, 6000); } }
    if (ta && g.PaisleyEmoji) g.PaisleyEmoji.attach(ta);

    /* ---- push hint: ask once per device to turn notifications on ---- */
    function paintHint() {
      var el = root.querySelector('[data-c-hint]'); if (!el) return;
      var P = g.PaisleyPush, st = P ? P.state() : 'unsupported';
      var hidden = false; try { hidden = localStorage.getItem('pz-tgc-hint') === '1'; } catch (e) { }
      if (!P || hidden || st === 'on' || st === 'unsupported' || st === 'blocked') { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="tgc-hint"><i class="fas fa-bell"></i><span>' + (st === 'ios-install'
        ? 'On iPhone or iPad, add Paisley to your Home Screen (Share, then Add to Home Screen) to get chat notifications.'
        : 'Turn on notifications so you hear from your group on your laptop or phone when you are away.') + '</span>' +
        (st === 'ios-install' ? '' : '<button type="button" data-c="push">Turn on</button>') + '<button type="button" class="x" data-c="nohint" aria-label="Hide this"><i class="fas fa-xmark"></i></button></div>';
    }
    paintHint();
    var offPush = g.PaisleyPush && g.PaisleyPush.onChange ? g.PaisleyPush.onChange(paintHint) : null;

    /* ---- presence: online, typing, recording, read ---- */
    var presRef = presCol.doc(me.uid), lastTyping = 0, lastRead = 0;
    function presence(p) {
      if (!canWrite || (dead && !p.final)) return Promise.resolve();
      var x = Object.assign({ uid: me.uid, role: role, name: me.name || '' }, p); delete x.final;
      return presRef.set(x, { merge: true }).catch(function () { });
    }
    function visible() { return document.visibilityState === 'visible' && root.isConnected; }
    function here() { if (!dead && visible()) presence({ online: true, seenAt: FV().serverTimestamp() }); }
    function away() { presence({ online: false, typingAt: null, recordingAt: null, seenAt: FV().serverTimestamp(), final: true }); }
    function markRead(force) {
      if (!canWrite || !visible() || !msgs.length) return;
      var newest = ms(msgs[msgs.length - 1].createdAt) || Date.now();
      var mine = people[me.uid] && ms(people[me.uid].readAt);
      if (!force && mine && mine >= newest) return;
      if (Date.now() - lastRead < 1500 && !force) { setTimeout(function () { markRead(); }, 1600); return; }
      lastRead = Date.now();
      presence({ readAt: FV().serverTimestamp(), online: true, seenAt: FV().serverTimestamp() });
    }
    function onVis() { if (document.visibilityState === 'visible') { here(); markRead(); } else away(); }

    function typers() {
      var now = Date.now(), out = [];
      Object.keys(people).forEach(function (k) {
        var p = people[k]; if (k === me.uid) return;
        if (p.recordingAt && now - ms(p.recordingAt) < TYPING_MS * 2) out.push({ name: first(p.name || nameOf(k)), rec: true });
        else if (p.typingAt && now - ms(p.typingAt) < TYPING_MS) out.push({ name: first(p.name || nameOf(k)), rec: false });
      });
      return out;
    }
    function onlineIds() {
      var now = Date.now();
      return Object.keys(people).filter(function (k) { var p = people[k]; return k !== me.uid && p.online !== false && now - ms(p.seenAt) < ONLINE_MS; });
    }
    function paintHead() {
      var ty = typers();
      if (ty.length) {
        var rec = ty.filter(function (t) { return t.rec; }), typ = ty.filter(function (t) { return !t.rec; });
        var bits = [];
        if (typ.length) bits.push(typ.map(function (t) { return t.name; }).join(', ') + (typ.length > 1 ? ' are' : ' is') + ' typing…');
        if (rec.length) bits.push(rec.map(function (t) { return t.name; }).join(', ') + ' recording a voice note…');
        sub.textContent = bits.join(' · '); sub.className = 'live';
      } else {
        var on = onlineIds();
        var names = (gr.members || []).map(function (m) { return m.id === me.uid ? 'You' : first(m.name); });
        if (!staff && names.indexOf('You') === -1) names.push('You');
        sub.className = '';
        sub.textContent = (on.length ? on.length + ' online · ' : '') + names.join(', ');
      }
      var tyEl = list.querySelector('.tgc-typing');
      var who = ty.filter(function (t) { return !t.rec; });
      if (who.length) {
        if (!tyEl) { tyEl = document.createElement('div'); tyEl.className = 'tgc-typing'; list.appendChild(tyEl); }
        tyEl.innerHTML = esc(who.map(function (t) { return t.name; }).join(', ')) + ' <span class="tgc-dots"><i></i><i></i><i></i></span>';
        if (nearBottom()) list.scrollTop = list.scrollHeight;
      } else if (tyEl) tyEl.remove();
    }

    /* ---- painting messages ---- */
    function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 120; }
    function readers(m) {
      var t = ms(m.createdAt); if (!t) return [];
      return Object.keys(people).filter(function (k) { return k !== me.uid && ms(people[k].readAt) >= t; });
    }
    function ticks(m) {
      if (m._pending) return '<i class="far fa-clock tk" aria-label="Sending"></i>';
      var others = memberIds().filter(function (id) { return id !== me.uid; });
      var r = readers(m);
      var all = others.length > 0 && others.every(function (id) { return r.indexOf(id) !== -1; });
      if (all) return '<i class="fas fa-check-double tk read" aria-label="Read by everyone"></i>';
      if (r.length) return '<i class="fas fa-check-double tk" aria-label="Read by some"></i>';
      return '<i class="fas fa-check tk" aria-label="Sent"></i>';
    }
    function voiceHtml(m) {
      var v = m.voice, u = safeUrl(v && v.url); if (!u) return '';
      var bars = '', seed = hash(m.id);
      for (var i = 0; i < 34; i++) { seed = (seed * 1103515245 + 12345) >>> 0; bars += '<i style="height:' + (18 + (seed % 82)) + '%"></i>'; }
      var who = m.senderName || nameOf(m.senderId);
      return '<div class="tgc-voice" data-voice="' + esc(m.id) + '"><span class="tgc-vav" style="background:' + ink(m.senderId) + '">' + esc(initials(who)) + '</span>' +
        '<button type="button" class="tgc-play" data-c="play" data-id="' + esc(m.id) + '" aria-label="Play the voice note"><i class="fas fa-play"></i></button>' +
        '<div class="tgc-wave" data-c="seek" data-id="' + esc(m.id) + '" aria-hidden="true">' + bars + '</div><span class="tgc-vt" data-vt>' + mmss(v.duration) + '</span></div>';
    }
    function attHtml(arr) {
      if (!Array.isArray(arr) || !arr.length) return '';
      var pics = arr.filter(function (a) { return /^image\//.test(a.type || '') && safeUrl(a.url); });
      var files = arr.filter(function (a) { return !/^image\//.test(a.type || '') && safeUrl(a.url); });
      var out = '';
      if (pics.length) out += '<div class="tgc-pics n' + Math.min(pics.length, 4) + '">' + pics.map(function (a) {
        return '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" title="Open full size"><img src="' + esc(a.url) + '" alt="' + esc(a.name || 'Photo') + '" loading="lazy"></a>';
      }).join('') + '</div>';
      out += files.map(function (a) {
        if (/^audio\//.test(a.type || '')) return '<a class="tgc-file" href="' + esc(a.url) + '" target="_blank" rel="noopener"><i class="fas fa-file-audio"></i><span><b>' + esc(a.name || 'Audio') + '</b><small>' + (a.size ? esc(sizeWord(a.size)) : 'Audio') + '</small></span><i class="fas fa-download" style="font-size:.85rem"></i></a>';
        return '<a class="tgc-file" href="' + esc(a.url) + '" target="_blank" rel="noopener" download><i class="fas ' + fileIcon(a.type, a.name) + '"></i><span><b>' + esc(a.name || 'File') + '</b><small>' + (a.size ? esc(sizeWord(a.size)) : 'File') + '</small></span><i class="fas fa-download" style="font-size:.85rem"></i></a>';
      }).join('');
      return out;
    }
    function reactsHtml(m, mine) {
      var r = m.reactions || {}, by = {};
      Object.keys(r).forEach(function (uid) { var e = r[uid]; if (!e) return; (by[e] = by[e] || []).push(uid); });
      var keys = Object.keys(by); if (!keys.length) return '';
      return '<div class="tgc-reacts' + (mine ? ' me' : '') + '"' + (mine ? '' : ' style="margin-left:2.6rem"') + '>' + keys.map(function (e) {
        var who = by[e].map(function (u) { return u === me.uid ? 'You' : first(nameOf(u)); }).join(', ');
        return '<button type="button" class="tgc-react' + (by[e].indexOf(me.uid) !== -1 ? ' mine' : '') + '" data-c="react" data-id="' + esc(m.id) + '" data-e="' + esc(e) + '" title="' + esc(who) + '">' + esc(e) + (by[e].length > 1 ? '<small>' + by[e].length + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }
    function bubble(m, prev) {
      var mine = m.senderId === me.uid, d = toDate(m.createdAt) || new Date();
      var gap = !prev || prev.senderId !== m.senderId || (ms(m.createdAt) - ms(prev.createdAt)) > 5 * 60 * 1000 || prev._day !== m._day;
      var who = m.senderName || nameOf(m.senderId) || 'Someone';
      var isStaffMsg = m.senderRole === 'coach' || m.senderRole === 'admin';
      var body;
      if (m.deleted) body = '<div class="tgc-del"><i class="fas fa-ban"></i> This message was deleted</div>';
      else {
        var q = m.replyTo && m.replyTo.id ? '<button type="button" class="tgc-quote" data-c="goto" data-id="' + esc(m.replyTo.id) + '" style="--q:' + ink(m.replyTo.uid || m.replyTo.id) + '"><b>' + esc(m.replyTo.uid === me.uid ? 'You' : (m.replyTo.name || 'Message')) + '</b><span>' + esc(m.replyTo.text || '') + '</span></button>' : '';
        body = q + (m.voice ? voiceHtml(m) : '') + attHtml(m.attachments) +
          (m.text ? '<span class="tgc-txt' + (onlyEmoji(m.text) && !q && !(m.attachments || []).length ? ' big' : '') + '">' + linkify(m.text) + '</span>' : '');
      }
      var mailed = m.mailed && (m.mailed.students || m.mailed.parents) ? '<i class="fas fa-envelope mail" title="Emailed to ' + esc([m.mailed.students ? 'the builders' : '', m.mailed.parents ? 'their parents' : ''].filter(Boolean).join(' and ')) + '"></i>' : '';
      var meta = '<span class="tgc-meta">' + mailed + esc(clock(d)) + (mine && !m.deleted ? ticks(m) : '') + '</span>';
      var head = !mine && gap ? '<div class="tgc-who" style="color:' + ink(m.senderId) + '">' + esc(who) + (isStaffMsg ? '<em>' + (m.senderRole === 'admin' ? 'Studio Desk' : 'Coach') + '</em>' : '') + '</div>' : '';
      var av = mine ? '' : '<span class="tgc-pav' + (gap ? '' : ' ghost') + '" style="background:' + ink(m.senderId) + '" aria-hidden="true">' + esc(initials(who)) + '</span>';
      return '<div class="tgc-row' + (mine ? ' me' : '') + (gap ? ' gap' : ' cont') + '" data-mid="' + esc(m.id) + '">' + av +
        '<div class="tgc-b' + (isStaffMsg && !mine ? ' staff' : '') + '">' + head + body + meta +
        (m.deleted ? '' : '<button type="button" class="tgc-more" data-c="menu" data-id="' + esc(m.id) + '" aria-label="Message options"><i class="fas fa-chevron-down"></i></button>') +
        '</div></div>' + (m.deleted ? '' : reactsHtml(m, mine));
    }
    function render() {
      var stick = firstPaint || nearBottom();
      var oldTop = list.scrollTop;
      if (!msgs.length) {
        list.innerHTML = '<div class="tgc-empty"><i class="fas fa-comments"></i>No messages yet. Say hello and agree who is working on what.</div>';
        paintHead(); return;
      }
      var html = '', prev = null, lastDay = '';
      msgs.forEach(function (m) {
        var d = toDate(m.createdAt) || new Date();
        m._day = d.toDateString();
        if (m._day !== lastDay) { html += '<div class="tgc-day">' + esc(dayWord(d)) + '</div>'; lastDay = m._day; prev = null; }
        html += bubble(m, prev); prev = m;
      });
      list.innerHTML = html;
      paintHead();
      if (stick) { list.scrollTop = list.scrollHeight; newBelow = 0; }
      else { list.scrollTop = oldTop; var added = Math.max(0, msgs.length - lastCount); newBelow += added; }
      lastCount = msgs.length;
      paintJump();
      if (firstPaint) {
        firstPaint = false;
        list.querySelectorAll('img').forEach(function (im) { im.addEventListener('load', function () { if (nearBottom() || !lastCount) list.scrollTop = list.scrollHeight; }, { once: true }); });
      }
      markRead();
    }
    function paintJump() {
      if (!jumpBtn) return;
      var show = !nearBottom();
      jumpBtn.hidden = !show;
      var b = jumpBtn.querySelector('b'); b.hidden = !(show && newBelow > 0); b.textContent = newBelow > 99 ? '99+' : newBelow;
      if (!show) newBelow = 0;
    }
    list.addEventListener('scroll', function () { paintJump(); if (nearBottom()) markRead(); closePop(); }, { passive: true });

    /* ---- listening ---- */
    unsub = chatCol.orderBy('createdAt').limitToLast(250).onSnapshot({ includeMetadataChanges: true }, function (s) {
      if (dead) return;
      msgs = s.docs.map(function (d) { var x = Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })); x._pending = d.metadata.hasPendingWrites; return x; });
      render();
    }, function (e) { list.innerHTML = '<div class="tgc-empty"><i class="fas fa-triangle-exclamation"></i>Could not open the chat: ' + esc(errMsg(e)) + '</div>'; });
    presUnsub = presCol.onSnapshot(function (s) {
      if (dead) return;
      people = {}; s.docs.forEach(function (d) { people[d.id] = d.data({ serverTimestamps: 'estimate' }); });
      paintHead();
      list.querySelectorAll('.tgc-row.me[data-mid]').forEach(function (row) {
        var m = msgs.filter(function (x) { return x.id === row.dataset.mid; })[0]; if (!m || m.deleted) return;
        var tk = row.querySelector('.tk'); if (tk) tk.outerHTML = ticks(m);
      });
    }, function () { /* presence is a nicety */ });
    here();
    timers.push(setInterval(here, 30 * 1000), setInterval(paintHead, 2500));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', away);

    /* ---- popover menu on a message ---- */
    var pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; } }
    function openMenu(id, anchor) {
      closePop();
      var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m || m.deleted) return;
      var mine = m.senderId === me.uid, r = readers(m);
      pop = document.createElement('div'); pop.className = 'tgc-pop'; pop.setAttribute('role', 'menu');
      pop.innerHTML = (canWrite ? '<div class="q">' + QUICK.map(function (e) { return '<button type="button" data-c="react" data-id="' + esc(id) + '" data-e="' + e + '" aria-label="React ' + e + '">' + e + '</button>'; }).join('') + '</div>' : '') +
        (canWrite ? '<button type="button" class="it" data-c="reply" data-id="' + esc(id) + '"><i class="fas fa-reply"></i> Reply</button>' : '') +
        (m.text ? '<button type="button" class="it" data-c="copy" data-id="' + esc(id) + '"><i class="far fa-copy"></i> Copy text</button>' : '') +
        (staff ? '<button type="button" class="it" data-c="email" data-id="' + esc(id) + '"><i class="fas fa-envelope"></i> Email this to builders or parents…</button>' : '') +
        (mine || role === 'admin' ? '<button type="button" class="it bad" data-c="delete" data-id="' + esc(id) + '"><i class="fas fa-trash"></i> Delete for everyone</button>' : '') +
        (mine ? '<div class="seen"><i class="fas fa-check-double"></i> ' + (r.length ? 'Seen by ' + esc(r.map(function (u) { return first(nameOf(u) || (people[u] || {}).name); }).join(', ')) : 'Not seen yet') + '</div>' : '');
      root.appendChild(pop);
      var rb = root.getBoundingClientRect(), ab = anchor.getBoundingClientRect();
      var w = pop.offsetWidth, h = pop.offsetHeight;
      var left = Math.min(Math.max(8, ab.right - rb.left - w), rb.width - w - 8);
      var top = ab.bottom - rb.top + 4; if (top + h > rb.height - 8) top = Math.max(8, ab.top - rb.top - h - 4);
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
      var firstBtn = pop.querySelector('button'); if (firstBtn) firstBtn.focus();
    }
    function setReply(m) {
      if (!replyEl) return;
      if (!m) { replyTo = null; replyEl.hidden = true; replyEl.innerHTML = ''; return; }
      replyTo = { id: m.id, uid: m.senderId, name: m.senderId === me.uid ? (me.name || 'You') : (m.senderName || nameOf(m.senderId)), text: preview(m).slice(0, 140) };
      replyEl.style.setProperty('--q', ink(m.senderId));
      replyEl.hidden = false;
      replyEl.innerHTML = '<i class="fas fa-reply" style="color:var(--q)"></i><div><b>' + esc(m.senderId === me.uid ? 'You' : replyTo.name) + '</b><span>' + esc(replyTo.text) + '</span></div><button type="button" class="tgc-x" data-c="noreply" aria-label="Cancel the reply"><i class="fas fa-xmark"></i></button>';
      if (ta) ta.focus();
    }
    function react(id, e) {
      var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m || !canWrite) return;
      var cur = (m.reactions || {})[me.uid], patch = {};
      patch['reactions.' + me.uid] = cur === e ? FV().delete() : e;
      chatCol.doc(id).update(patch).catch(function (er) { note('Could not react: ' + errMsg(er)); });
    }
    function del(id) {
      var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m) return;
      dialog('<h4>Delete this message?</h4><p>It is removed for everyone in the group.</p><blockquote>' + esc(preview(m)) + '</blockquote>', 'Delete for everyone', function (box, done) {
        chatCol.doc(id).update({ deleted: true, text: '', attachments: [], voice: FV().delete(), replyTo: FV().delete(), deletedAt: FV().serverTimestamp() })
          .then(function () { done(); }, function (er) { done(errMsg(er)); });
      }, true);
    }
    function goto(id) {
      var row = list.querySelector('[data-mid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!row) { note('That message is too old to show here.'); return; }
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    }
    /* A small dialog inside the chat (never window.confirm: it can drop the page out of full screen). */
    function dialog(html, okLabel, onOk, danger) {
      var d = document.createElement('div'); d.className = 'tgc-dlg';
      d.innerHTML = '<div role="dialog" aria-modal="true">' + html + '<div class="err" data-err></div><div class="acts"><button type="button" class="tgc-btn" data-x>Cancel</button><button type="button" class="tgc-btn primary" data-ok' + (danger ? ' style="background:#c0392b;border-color:#c0392b"' : '') + '>' + esc(okLabel) + '</button></div></div>';
      root.appendChild(d);
      var close = function () { d.remove(); };
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-x]')) close(); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      var ok = d.querySelector('[data-ok]');
      ok.addEventListener('click', function () {
        ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + esc(okLabel);
        onOk(d, function (err) { if (err) { ok.disabled = false; ok.textContent = okLabel; d.querySelector('[data-err]').textContent = err; } else close(); });
      });
      setTimeout(function () { ok.focus(); }, 30);
      return d;
    }
    function emailDialog(id) {
      var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m) return;
      var n = memberIds().length;
      dialog('<h4><i class="fas fa-envelope"></i> Email this message</h4><p>For people who are not on their dashboard. They also get a notification on their devices.</p>' +
        '<blockquote>' + esc(preview(m)) + '</blockquote>' +
        '<label class="ck"><input type="checkbox" data-to="students" checked> The builders in ' + esc(gr.name || 'the group') + '<small>' + n + '</small></label>' +
        '<label class="ck"><input type="checkbox" data-to="parents"> Their parents and guardians</label>' +
        '<textarea data-note maxlength="600" placeholder="Add a short note (optional)"></textarea>' +
        (m.mailed && m.mailed.count ? '<p style="margin-top:-.4rem"><i class="fas fa-circle-info"></i> Already emailed ' + m.mailed.count + ' time' + (m.mailed.count === 1 ? '' : 's') + '.</p>' : ''),
      'Send email', function (box, done) {
        var st = box.querySelector('[data-to="students"]').checked, pa = box.querySelector('[data-to="parents"]').checked;
        if (!st && !pa) { done('Choose the builders, their parents, or both.'); return; }
        if (typeof firebase.functions !== 'function') { done('Email is not available on this page.'); return; }
        firebase.functions().httpsCallable('emailTechGroupMessage')({ groupId: gr.id, messageId: id, students: st, parents: pa, note: box.querySelector('[data-note]').value.trim().slice(0, 600) })
          .then(function (r) { var x = (r && r.data) || {}; done(); note(''); flash('Emailed ' + (x.emailed || 0) + ' ' + ((x.emailed || 0) === 1 ? 'person' : 'people') + '.'); }, function (er) { done(errMsg(er)); });
      });
    }
    function flash(t) { if (noteEl) { noteEl.style.color = '#1d8b57'; noteEl.textContent = t; setTimeout(function () { if (noteEl.textContent === t) { noteEl.textContent = ''; noteEl.style.color = ''; } }, 5000); } }
    function peopleSheet() {
      var d = document.createElement('div'); d.className = 'tgc-sheet';
      var now = Date.now();
      var rows = (gr.members || []).map(function (m) {
        var p = people[m.id] || {}, on = m.id !== me.uid && p.online !== false && now - ms(p.seenAt) < ONLINE_MS;
        return '<div class="tgc-person"><span class="pav' + (on || m.id === me.uid ? ' on' : '') + '" style="background:' + ink(m.id) + '">' + esc(initials(m.name)) + '</span><div><b>' + esc(m.id === me.uid ? (m.name || 'You') + ' (you)' : m.name) + '</b><small>' + (m.id === me.uid ? 'online' : on ? 'online' : esc(ago(ms(p.seenAt)))) + '</small></div></div>';
      });
      Object.keys(people).forEach(function (k) {
        var p = people[k]; if ((gr.memberIds || []).indexOf(k) !== -1 || !isStaff(p.role)) return;
        var on = k !== me.uid && p.online !== false && now - ms(p.seenAt) < ONLINE_MS;
        rows.push('<div class="tgc-person"><span class="pav' + (on || k === me.uid ? ' on' : '') + '" style="background:#9a6a00">' + esc(initials(p.name)) + '</span><div><b>' + esc((p.name || (p.role === 'admin' ? 'Studio Desk' : 'Coach')) + (k === me.uid ? ' (you)' : '')) + '</b><small>' + (p.role === 'admin' ? 'Studio Desk' : 'Coach') + ' · ' + (k === me.uid || on ? 'online' : esc(ago(ms(p.seenAt)))) + '</small></div></div>');
      });
      d.innerHTML = '<div role="dialog" aria-label="People in the group"><h4>' + esc(gr.name || 'Group') + '<button type="button" class="tgc-x" data-x aria-label="Close"><i class="fas fa-xmark"></i></button></h4><div class="sub">' + (gr.members || []).length + ' builders. Your coach can read and write here too.</div>' + rows.join('') + '</div>';
      root.appendChild(d);
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-x]')) d.remove(); });
    }

    /* ---- voice notes: playing ---- */
    var player = null, playingId = '';
    function stopPlayer() {
      if (player) { player.pause(); player = null; }
      var b = playingId && list.querySelector('[data-c="play"][data-id="' + playingId + '"]'); if (b) b.innerHTML = '<i class="fas fa-play"></i>';
      playingId = '';
    }
    function paintProgress(id, frac, t) {
      var w = list.querySelector('[data-voice="' + id + '"]'); if (!w) return;
      var bars = w.querySelectorAll('.tgc-wave i'), n = Math.round(frac * bars.length);
      bars.forEach(function (b, i) { b.classList.toggle('on', i < n); });
      var vt = w.querySelector('[data-vt]'); if (vt && t != null) vt.textContent = mmss(t);
    }
    function play(id, at) {
      var m = msgs.filter(function (x) { return x.id === id; })[0]; if (!m || !m.voice) return;
      if (playingId === id && player && at == null) { if (player.paused) { player.play(); setPlayIcon(id, true); } else { player.pause(); setPlayIcon(id, false); } return; }
      if (playingId !== id) stopPlayer();
      if (!player) {
        player = new Audio(m.voice.url); playingId = id;
        var dur = Number(m.voice.duration) || 0;
        player.addEventListener('timeupdate', function () {
          var d = isFinite(player.duration) && player.duration > 0 ? player.duration : dur;
          paintProgress(id, d ? player.currentTime / d : 0, player.currentTime);
        });
        player.addEventListener('ended', function () { paintProgress(id, 0, dur); stopPlayer(); });
        player.addEventListener('error', function () { note('Could not play this voice note.'); stopPlayer(); });
      }
      if (at != null) {
        var d0 = isFinite(player.duration) && player.duration > 0 ? player.duration : (Number(m.voice.duration) || 0);
        try { player.currentTime = at * d0; } catch (e) { }
      }
      player.play().then(function () { setPlayIcon(id, true); }, function () { note('Could not play this voice note.'); });
    }
    function setPlayIcon(id, on) { var b = list.querySelector('[data-c="play"][data-id="' + id + '"]'); if (b) b.innerHTML = '<i class="fas ' + (on ? 'fa-pause' : 'fa-play') + '"></i>'; }

    /* ---- clicks ---- */
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b || !root.contains(b)) { if (pop && !e.target.closest('.tgc-pop')) closePop(); return; }
      var a = b.dataset.c, id = b.dataset.id;
      if (a !== 'menu' && pop && !b.closest('.tgc-pop') && a !== 'react') closePop();
      if (a === 'menu') { if (pop && pop.dataset.for === id) { closePop(); return; } openMenu(id, b); if (pop) pop.dataset.for = id; }
      else if (a === 'react') { closePop(); react(id, b.dataset.e); }
      else if (a === 'reply') { closePop(); setReply(msgs.filter(function (x) { return x.id === id; })[0]); }
      else if (a === 'noreply') setReply(null);
      else if (a === 'copy') { closePop(); var mc = msgs.filter(function (x) { return x.id === id; })[0]; if (mc && navigator.clipboard) navigator.clipboard.writeText(mc.text || '').then(function () { flash('Copied.'); }, function () { }); }
      else if (a === 'delete') { closePop(); del(id); }
      else if (a === 'email') { closePop(); emailDialog(id); }
      else if (a === 'goto') goto(id);
      else if (a === 'jump') { list.scrollTop = list.scrollHeight; newBelow = 0; paintJump(); markRead(true); }
      else if (a === 'people') peopleSheet();
      else if (a === 'close' && o.onClose) o.onClose();
      else if (a === 'play') play(id);
      else if (a === 'seek') { var r = b.getBoundingClientRect(); play(id, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }
      else if (a === 'attach') fileIn.click();
      else if (a === 'mail') { var on = mailBar.hidden; mailBar.hidden = !on; mailBtn.classList.toggle('on', on); mailBtn.setAttribute('aria-pressed', String(on)); }
      else if (a === 'send') { if (rec) stopRec(true); else if (hasDraft()) send(); else startRec(); }
      else if (a === 'reccancel') stopRec(false);
      else if (a === 'push') { if (g.PaisleyPush) g.PaisleyPush.enable().then(paintHint, function (er) { note(errMsg(er)); paintHint(); }); }
      else if (a === 'nohint') { try { localStorage.setItem('pz-tgc-hint', '1'); } catch (x) { } paintHint(); }
    });
    root.addEventListener('contextmenu', function (e) {
      var row = e.target.closest('.tgc-row[data-mid]'); if (!row || e.target.closest('a,img')) return;
      e.preventDefault(); var mb = row.querySelector('.tgc-more'); if (mb) { openMenu(row.dataset.mid, mb); if (pop) pop.dataset.for = row.dataset.mid; }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (pop) { closePop(); e.stopPropagation(); } else if (replyTo) setReply(null); } });
    function onDocDown(e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-c="menu"]')) closePop(); }
    document.addEventListener('mousedown', onDocDown);

    /* ---- composing ---- */
    function hasDraft() { return !!(ta && ta.value.trim()) || pending.length > 0; }
    function paintSend() {
      if (!sendBtn) return;
      if (rec) { sendBtn.className = 'tgc-send rec'; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; sendBtn.setAttribute('aria-label', 'Send the voice note'); sendBtn.title = 'Send the voice note'; return; }
      var t = hasDraft();
      sendBtn.className = 'tgc-send';
      sendBtn.innerHTML = '<i class="fas ' + (t ? 'fa-paper-plane' : 'fa-microphone') + '"></i>';
      sendBtn.setAttribute('aria-label', t ? 'Send' : 'Record a voice note');
      sendBtn.title = t ? 'Send (Enter)' : 'Tap to record a voice note';
    }
    function autosize() { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }
    function paintTray() {
      tray.innerHTML = pending.map(function (p, i) {
        return '<div class="it">' + (p.preview ? '<img src="' + esc(p.preview) + '" alt="">' : '<i class="fas ' + fileIcon(p.file.type, p.file.name) + '" style="font-size:1.3rem;padding:0 .35rem;color:#245F5A"></i>') +
          '<span title="' + esc(p.file.name) + '">' + esc(p.file.name) + '</span><button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(p.file.name) + '"><i class="fas fa-xmark"></i></button></div>';
      }).join('');
      paintSend();
    }
    function addFiles(files) {
      var skipped = [];
      Array.prototype.forEach.call(files || [], function (f) {
        if (!f) return;
        if (pending.length >= MAX_FILES) { skipped.push(f.name + ': at most ' + MAX_FILES + ' at a time'); return; }
        if (f.size > MAX_FILE) { skipped.push(f.name + ': larger than 25 MB'); return; }
        if (BLOCKED.test(f.type || '') || /\.(html?|svg|js|mjs|xml)$/i.test(f.name || '')) { skipped.push(f.name + ': web pages, scripts and SVG cannot be sent (zip them first)'); return; }
        pending.push({ file: f, preview: /^image\//.test(f.type || '') ? URL.createObjectURL(f) : '' });
      });
      paintTray();
      if (skipped.length) note('Not added: ' + skipped.join('; '));
      if (ta) ta.focus();
    }
    function storagePath(name) {
      return 'techGroupChat/' + gr.id + '/' + (staff ? 'staff' : 'm') + '/' + me.uid + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(-80);
    }
    async function upload(blob, name, type) {
      if (typeof firebase.storage !== 'function') throw new Error('Sending files is not available on this page.');
      var path = storagePath(name), r = firebase.storage().ref(path);
      await r.put(blob, { contentType: type || 'application/octet-stream' });
      return { url: await r.getDownloadURL(), path: path };
    }
    async function post(extra) {
      var msg = Object.assign({ senderId: me.uid, senderRole: role, senderName: me.name || '', text: '', createdAt: FV().serverTimestamp() }, extra);
      if (replyTo) msg.replyTo = replyTo;
      if (staff && mailBar && !mailBar.hidden) {
        var to = Array.prototype.filter.call(mailBar.querySelectorAll('[data-c-mail]'), function (c) { return c.checked; }).map(function (c) { return c.dataset.cMail; });
        if (to.length) msg.emailTo = to;
      }
      await chatCol.add(msg);
      setReply(null);
      if (mailBar && !mailBar.hidden) { mailBar.hidden = true; mailBtn.classList.remove('on'); mailBtn.setAttribute('aria-pressed', 'false'); if (msg.emailTo) flash('Sent. It is being emailed too.'); }
      lastTyping = 0; presence({ typingAt: null, recordingAt: null, online: true, seenAt: FV().serverTimestamp(), readAt: FV().serverTimestamp() });
      list.scrollTop = list.scrollHeight;
    }
    async function send() {
      if (busy || !hasDraft()) return;
      var text = ta.value.trim().slice(0, 4000);
      busy = true; sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        var atts = [];
        for (var i = 0; i < pending.length; i++) {
          var p = pending[i];
          if (!p.done) { var up = await upload(p.file, p.file.name, p.file.type); p.done = { name: String(p.file.name || 'file').slice(0, 160), url: up.url, path: up.path, type: p.file.type || 'application/octet-stream', size: p.file.size || 0 }; }
          atts.push(p.done);
        }
        var extra = { text: text }; if (atts.length) extra.attachments = atts;
        await post(extra);
        ta.value = ''; autosize();
        pending.forEach(function (x) { if (x.preview) URL.revokeObjectURL(x.preview); }); pending = []; paintTray();
      } catch (er) { note('Could not send: ' + errMsg(er)); }
      busy = false; sendBtn.disabled = false; paintSend(); ta.focus();
    }

    /* ---- voice notes: recording ---- */
    var rec = null;
    function recType() {
      var c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
      for (var i = 0; i < c.length; i++) if (g.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i];
      return '';
    }
    async function startRec() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !g.MediaRecorder) { note('This browser cannot record voice notes.'); return; }
      var stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { note(e && e.name === 'NotAllowedError' ? 'Allow the microphone for this site to record a voice note.' : 'No microphone found.'); return; }
      var type = recType(), mr;
      try { mr = type ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 48000 }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); note('This browser cannot record voice notes.'); return; }
      rec = { mr: mr, stream: stream, chunks: [], start: Date.now(), send: false, tick: null };
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) rec && rec.chunks.push(ev.data); };
      mr.onstop = function () { finishRec(); };
      mr.start(250);
      boxEl.hidden = true; recBar.hidden = false; recT.textContent = '0:00'; paintSend();
      presence({ recordingAt: FV().serverTimestamp(), online: true, seenAt: FV().serverTimestamp() });
      rec.tick = setInterval(function () {
        if (!rec) return;
        var s = (Date.now() - rec.start) / 1000; recT.textContent = mmss(s);
        if (Math.round(s) % 5 === 0) presence({ recordingAt: FV().serverTimestamp() });
        if (s >= MAX_VOICE_S) { note('Voice notes can be up to 5 minutes. Sending it now.'); stopRec(true); }
      }, 500);
    }
    function stopRec(sendIt) {
      if (!rec) return;
      rec.send = !!sendIt; rec.dur = (Date.now() - rec.start) / 1000;
      clearInterval(rec.tick);
      try { if (rec.mr.state !== 'inactive') rec.mr.stop(); else finishRec(); } catch (e) { finishRec(); }
    }
    async function finishRec() {
      var r = rec; if (!r || r.finished) return; r.finished = true; rec = null;
      r.stream.getTracks().forEach(function (t) { t.stop(); });
      boxEl.hidden = false; recBar.hidden = true; paintSend();
      presence({ recordingAt: null });
      if (!r.send) return;
      if (r.dur < 1) { note('Too short. Tap the microphone and talk, then tap send.'); return; }
      var type = (r.mr.mimeType || r.chunks[0] && r.chunks[0].type || 'audio/webm').split(';')[0];
      var blob = new Blob(r.chunks, { type: type });
      busy = true; sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        var ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
        var up = await upload(blob, 'voice-note.' + ext, type);
        await post({ voice: { url: up.url, path: up.path, type: type, duration: Math.round(r.dur * 10) / 10, size: blob.size } });
      } catch (er) { note('Could not send the voice note: ' + errMsg(er)); }
      busy = false; sendBtn.disabled = false; paintSend();
    }

    if (canWrite) {
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !(window.matchMedia && matchMedia('(pointer:coarse)').matches)) { e.preventDefault(); send(); } });
      ta.addEventListener('input', function () {
        autosize(); paintSend();
        var now = Date.now();
        if (!ta.value.trim()) { if (lastTyping) { lastTyping = 0; presence({ typingAt: null }); } return; }
        if (now - lastTyping > 3000) { lastTyping = now; presence({ typingAt: FV().serverTimestamp(), online: true, seenAt: FV().serverTimestamp() }); }
      });
      ta.addEventListener('paste', function (e) {
        var cd = e.clipboardData; if (!cd) return;
        var files = [], hasText = false;
        Array.prototype.forEach.call(cd.items || [], function (it) { if (it.kind === 'file') { var f = it.getAsFile(); if (f) files.push(f); } else if (it.type === 'text/plain') hasText = true; });
        if (!files.length) return;
        if (!hasText) e.preventDefault();
        var stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        addFiles(files.map(function (f, i) {
          if (!/^image\//.test(f.type || '') || (f.name && !/^image\.\w+$/i.test(f.name))) return f;
          try { return new File([f], 'screenshot-' + stamp + (i ? '-' + (i + 1) : '') + '.' + (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: f.type }); } catch (x) { return f; }
        }));
      });
      fileIn.addEventListener('change', function () { addFiles(fileIn.files); fileIn.value = ''; });
      tray.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var p = pending.splice(+b.dataset.rm, 1)[0]; if (p && p.preview) URL.revokeObjectURL(p.preview); paintTray(); });
      var depth = 0, hasFiles = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; };
      root.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; root.classList.add('drop'); } });
      root.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; root.classList.remove('drop'); } });
      root.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
      root.addEventListener('drop', function (e) { depth = 0; root.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
      paintSend();
    }

    return {
      focus: function () { if (ta) ta.focus(); },
      setGroup: function (ng) { if (ng && ng.id === gr.id) { gr = ng; paintHead(); } },
      destroy: function () {
        if (dead) return;
        if (rec) stopRec(false);
        stopPlayer(); closePop();
        away(); dead = true;
        if (unsub) unsub(); if (presUnsub) presUnsub(); if (offPush) offPush();
        timers.forEach(clearInterval);
        document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', away);
        document.removeEventListener('mousedown', onDocDown);
        pending.forEach(function (p) { if (p.preview) URL.revokeObjectURL(p.preview); });
      }
    };
  }

  /* ---------------------------------------------------------
     A side drawer, for chatting while working on a task
     --------------------------------------------------------- */
  function openDrawer(o) {
    style();
    var wrap = document.createElement('div'); wrap.className = 'tgc-drawer';
    wrap.innerHTML = '<div><div data-host style="flex:1;display:flex;min-width:0"></div></div>';
    document.body.appendChild(wrap);
    var chat = null;
    function close() { if (chat) chat.destroy(); chat = null; wrap.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape' && !wrap.querySelector('.tgc-dlg,.tgc-pop,.tgc-sheet,.pz-emo-pop')) close(); }
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    var h = wrap.querySelector('[data-host]');
    chat = mount(h, { group: o.group, me: o.me, height: '100%', onClose: close });
    h.firstChild.style.flex = '1';
    setTimeout(function () { if (chat) chat.focus(); }, 60);
    return { close: close };
  }
  /* A floating "Group chat" button with the unread count; opens the drawer. */
  function mountFab(o) {
    style();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tgc-fab';
    b.innerHTML = '<i class="fas fa-comments"></i><span>Group chat</span><b hidden></b>';
    b.setAttribute('aria-label', 'Open the group chat');
    document.body.appendChild(b);
    var drawer = null;
    var stop = watchUnread([o.group], o.me.uid, function (map, total) { var x = b.querySelector('b'); x.hidden = !total; x.textContent = total > 99 ? '99+' : total; });
    b.addEventListener('click', function () { if (drawer) return; b.hidden = true; drawer = openDrawer({ group: o.group, me: o.me, onClose: function () { drawer = null; b.hidden = false; } }); });
    return { destroy: function () { stop(); if (drawer) drawer.close(); b.remove(); } };
  }

  /* ---------------------------------------------------------
     Unread counts: messages from others after my readAt.
     --------------------------------------------------------- */
  function watchUnread(groups, uid, cb) {
    var counts = {}, unsubs = [], state = {};
    function emit() { var t = 0; Object.keys(counts).forEach(function (k) { t += counts[k]; }); cb(Object.assign({}, counts), t); }
    function calc(gid) {
      var st = state[gid]; if (!st || !st.msgs) return;
      var read = st.readAt || 0;
      counts[gid] = st.msgs.filter(function (m) { return m.senderId !== uid && !m.deleted && ms(m.createdAt) > read; }).length;
      emit();
    }
    (groups || []).forEach(function (gr) {
      if (!gr || !gr.id) return;
      var gid = gr.id, r = groupRef(gid); state[gid] = { readAt: 0, msgs: null };
      unsubs.push(r.collection('chatPresence').doc(uid).onSnapshot(function (d) { state[gid].readAt = d.exists ? ms((d.data({ serverTimestamps: 'estimate' }) || {}).readAt) : 0; calc(gid); }, function () { }));
      unsubs.push(r.collection('chat').orderBy('createdAt').limitToLast(60).onSnapshot(function (s) {
        state[gid].msgs = s.docs.map(function (d) { var x = d.data({ serverTimestamps: 'estimate' }); return { senderId: x.senderId, deleted: x.deleted, createdAt: x.createdAt }; }); calc(gid);
      }, function () { }));
    });
    return function () { unsubs.forEach(function (u) { u(); }); unsubs = []; };
  }

  /* A blue unread-chat count on a navigation button, for the groups a query finds
     (builders: memberIds array-contains me; coaches: coachId == me). */
  function navBubble(btn, uid, query) {
    if (!btn) return function () { };
    style();
    var stopUnread = null, key = '';
    var off = query.onSnapshot(function (s) {
      var groups = s.docs.map(function (d) { return { id: d.id }; });
      var k = groups.map(function (x) { return x.id; }).join(',');
      if (k === key) return; key = k;
      if (stopUnread) stopUnread();
      stopUnread = watchUnread(groups, uid, function (map, total) {
        var el = btn.querySelector('.tgc-nav');
        if (!total) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement('span'); el.className = 'tgc-nav'; el.title = 'New group chat messages'; btn.appendChild(el); }
        el.innerHTML = '<i class="fas fa-comment" aria-hidden="true"></i>' + (total > 99 ? '99+' : total);
        el.setAttribute('aria-label', total + ' new group chat messages');
      });
    }, function () { });
    return function () { off(); if (stopUnread) stopUnread(); };
  }

  g.TechGroupChat = { mount: mount, openDrawer: openDrawer, mountFab: mountFab, watchUnread: watchUnread, navBubble: navBubble, preview: preview, style: style };
})(window);
