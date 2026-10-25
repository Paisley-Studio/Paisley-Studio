/* =========================================================
   PAISLEY STUDIO — RESOURCES FOLDER
   ---------------------------------------------------------
   Admin  : "Upload resources" pad — marking schemes, further resources,
            past papers… for a subject / unit, with many files + links.
   Tutor  : huge brown folder per subject -> inside, every resource
            labelled by unit, filterable, downloadable, with a discussion
            thread that the Studio Desk sees on the same resource.
   Every message is MARKED with who said it, the subject, the unit and
   the resource so the admin always knows which tutor is talking about what.

   Firestore  classroomResources/{rid}
              classroomResources/{rid}/messages/{mid}
   Storage    resource-files/{subjectId}/{rid}/{file}

   Mount:  ResourcesUI.mount(el, { role:'admin'|'tutor', uid, name, subjects, keyStages })
========================================================= */
(function (global) {
  'use strict';

  var db = function () { return firebase.firestore(); };
  var FV = function () { return firebase.firestore.FieldValue; };
  var CATEGORIES = ['Classwork', 'Homework', 'Marking scheme', 'Further resources', 'Past paper', 'Worked solutions', 'Revision notes', 'Other'];
  var MAX_BYTES = 100 * 1024 * 1024;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* real-computer yellow folder: back #EDB000, paper, slanted front #FECE00 */
  var FOLDER_SVG = '<svg viewBox="0 0 290 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M4 20Q4 5 19 5H104Q113 5 119 11L141 31Q147 36 156 36H238Q252 36 252 50V212Q252 231 233 231H23Q4 231 4 212Z" fill="#EDB000"/>' +
    '<rect x="26" y="48" width="212" height="130" rx="4" fill="#E9E9E9"/><rect x="29" y="52" width="206" height="126" rx="3" fill="#fff"/>' +
    '<path d="M44 86H160L192 65Q198 61 206 61H280Q294 62 290 78L254 213Q250 231 234 231H22Q2 231 7 212L36 98Q39 86 52 86Z" fill="#FECE00"/>' +
    '</svg>';
  function toDate(ts) { return ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null); }
  function fmtDT(ts) { var d = toDate(ts); return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
  function fmtSize(n) { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function normUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return safeUrl(u); }
  function subjName(c) { return c.subjectName || (typeof lmzSubjectLabel === 'function' && c.subjectId ? lmzSubjectLabel(c.subjectId) : c.subjectId) || 'Subject'; }
  function fileIcon(n) {
    var e = (/\.([a-z0-9]+)$/i.exec(n || '') || [])[1] || ''; e = e.toLowerCase();
    return e === 'pdf' ? 'fa-file-pdf' : /docx?$/.test(e) ? 'fa-file-word' : /xlsx?|csv/.test(e) ? 'fa-file-excel' : /pptx?/.test(e) ? 'fa-file-powerpoint'
      : /png|jpe?g|gif|webp/.test(e) ? 'fa-file-image' : /mp4|webm|mov/.test(e) ? 'fa-file-video' : /mp3|wav|m4a|ogg/.test(e) ? 'fa-file-audio' : 'fa-file';
  }
  function contentType(f) {
    if (f.type) return f.type;
    var m = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain' };
    return m[((/\.([a-z0-9]+)$/i.exec(f.name) || [])[1] || '').toLowerCase()] || 'application/octet-stream';
  }

  function injectStyle() {
    if (document.getElementById('rs-style')) return;
    var s = document.createElement('style'); s.id = 'rs-style';
    s.textContent = [
      '.rs{font-family:inherit;color:var(--ink,#1f2a2a)}',
      '.rs-top{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-bottom:1.2rem}',
      '.rs-top h2{margin:0;font-size:1.25rem;font-weight:800;flex:1;min-width:200px}',
      '.rs-crumb{background:none;border:none;color:var(--brand-deep,#245f5a);font-weight:800;cursor:pointer;font-size:.85rem;padding:.3rem 0}',
      '.rs-btn{border:1.5px solid var(--line,#d9e3e0);background:#fff;border-radius:10px;padding:.55rem .95rem;font-weight:800;font-size:.82rem;cursor:pointer;font-family:inherit;color:var(--brand-deep,#245f5a);display:inline-flex;align-items:center;gap:.45rem;text-decoration:none}',
      '.rs-btn:hover{border-color:var(--brand,#2f8f86)}',
      '.rs-btn.primary{background:var(--brand-deep,#245f5a);border-color:var(--brand-deep,#245f5a);color:#fff}',
      '.rs-btn.sm{padding:.35rem .65rem;font-size:.75rem}.rs-btn.danger{color:#b8362a}',
      '.rs-btn:disabled{opacity:.55;cursor:not-allowed}',
      /* folders */
      '.rs-folders{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1.6rem 1.2rem}',
      '.rs-folder{background:none;border:none;cursor:pointer;text-align:center;font-family:inherit;padding:.5rem;border-radius:16px;transition:transform .15s}',
      '.rs-folder:hover{transform:translateY(-4px)}.rs-folder:hover .rs-fi svg{filter:drop-shadow(0 10px 12px rgba(120,90,0,.3)) brightness(1.04)}',
      '.rs-fi{position:relative;width:200px;height:158px;margin:0 auto .7rem}',
      '.rs-fi svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 6px 8px rgba(120,90,0,.22));transition:filter .15s}',
      '.rs-fi-badge{position:absolute;right:22px;top:80px;background:#fff;color:#6b5200;font-weight:900;font-size:.8rem;min-width:30px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;padding:0 .5rem;box-shadow:0 2px 6px rgba(0,0,0,.22)}',
      '.rs-fi-badge.unread{background:#d93d2f;color:#fff}',
      '.rs-fname{font-weight:800;font-size:1rem;line-height:1.25}',
      '.rs-fsub{font-size:.76rem;color:var(--muted,#6b7b78);margin-top:.15rem}',
      /* filters */
      '.rs-filters{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem;background:var(--sage,#eef4f2);padding:.7rem;border-radius:12px}',
      '.rs-filters select,.rs-filters input{padding:.5rem .7rem;border:1.5px solid var(--line,#d9e3e0);border-radius:9px;font-family:inherit;font-size:.82rem;background:#fff;min-width:150px}',
      /* cards */
      '.rs-list{display:grid;gap:.9rem}',
      '.rs-card{background:#fff;border:1.5px solid var(--line,#d9e3e0);border-left:6px solid #EDB000;border-radius:14px;padding:1rem 1.1rem}',
      '.rs-card h3{margin:0 0 .35rem;font-size:1rem;font-weight:800}',
      '.rs-chips{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem}',
      '.rs-chip{background:#fff4cc;color:#6b5200;border-radius:20px;padding:.18rem .65rem;font-size:.72rem;font-weight:800}',
      '.rs-chip.cat{background:#e3f1ee;color:#245f5a}.rs-chip.tutor{background:#e8e4f7;color:#4a3c8f}.rs-chip.cw{background:#e1effc;color:#1d5a9a}.rs-chip.hw{background:#ffe6d2;color:#9a4a10}.rs-chip.src{background:#f1f4f3;color:#4b5c59}',
      '.rs-note{font-size:.84rem;color:var(--muted,#6b7b78);margin:.2rem 0 .6rem;white-space:pre-wrap}',
      '.rs-file{display:flex;align-items:center;gap:.6rem;padding:.5rem .65rem;border:1px solid var(--line,#d9e3e0);border-radius:10px;margin-top:.4rem;font-size:.84rem}',
      '.rs-file .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}',
      '.rs-file small{color:var(--muted,#6b7b78);font-weight:600;margin-left:.4rem}',
      '.rs-file i.ic{color:#EDB000;font-size:1.1rem}',
      '.rs-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem}',
      '.rs-empty{text-align:center;padding:2.5rem 1rem;color:var(--muted,#6b7b78)}',
      /* modal */
      '.rs-ov{position:fixed;inset:0;background:rgba(20,30,30,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem}',
      '.rs-md{background:#fff;border-radius:16px;width:min(720px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3)}',
      '.rs-md-h{display:flex;align-items:center;padding:1rem 1.2rem;border-bottom:1px solid var(--line,#d9e3e0);font-weight:800}',
      '.rs-md-h span{flex:1}.rs-md-x{background:none;border:none;font-size:1.3rem;cursor:pointer}',
      '.rs-md-b{padding:1.1rem 1.2rem;overflow:auto;flex:1}',
      '.rs-md-f{padding:.8rem 1.2rem;border-top:1px solid var(--line,#d9e3e0);display:flex;gap:.6rem;align-items:center;justify-content:flex-end}',
      '.rs-err{color:#b8362a;font-size:.8rem;font-weight:700;margin-right:auto}',
      '.rs-fld{margin-bottom:.9rem}.rs-fld label{display:block;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--brand-deep,#245f5a);margin-bottom:.35rem}',
      '.rs-fld input,.rs-fld select,.rs-fld textarea{width:100%;padding:.6rem .75rem;border:1.5px solid var(--line,#d9e3e0);border-radius:10px;font-family:inherit;font-size:.9rem;box-sizing:border-box}',
      '.rs-r2{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}@media(max-width:560px){.rs-r2{grid-template-columns:1fr}}',
      '.rs-drop{border:2px dashed #e6c24d;background:#fffaf0;border-radius:12px;padding:1.2rem;text-align:center;cursor:pointer;font-weight:700;color:#6b5200}',
      '.rs-drop.over{background:#fff0bf}',
      '.rs-prog{height:6px;background:#eee;border-radius:3px;overflow:hidden;margin-top:.3rem}.rs-prog div{height:100%;width:0;background:#EDB000}',
      /* thread */
      '.rs-thread{display:flex;flex-direction:column;gap:.7rem}',
      '.rs-msg{max-width:88%;padding:.65rem .85rem;border-radius:14px;font-size:.86rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
      '.rs-msg.them{background:#f1f4f3;align-self:flex-start}.rs-msg.me{background:#e3f1ee;align-self:flex-end}',
      '.rs-msg.admin{background:#fdf0dc}',
      '.rs-mk{display:flex;flex-wrap:wrap;gap:.3rem;margin-bottom:.35rem;font-size:.68rem;font-weight:800}',
      '.rs-mk b{background:#fff;border-radius:6px;padding:.1rem .45rem;border:1px solid rgba(0,0,0,.08)}',
      '.rs-time{font-size:.66rem;color:var(--muted,#6b7b78);margin-top:.25rem}',
      '.rs-compose{display:flex;gap:.5rem;align-items:flex-end}.rs-compose textarea{flex:1;padding:.6rem .75rem;border:1.5px solid var(--line,#d9e3e0);border-radius:10px;font-family:inherit;font-size:.9rem;resize:vertical;min-height:44px}',
      '.rs-inbox{background:#fff6e6;border:1.5px solid #e8c88d;border-radius:12px;padding:.8rem 1rem;margin-bottom:1.2rem}',
      '.rs-inbox h4{margin:0 0 .5rem;font-size:.9rem}',
      '.rs-inrow{display:flex;gap:.6rem;align-items:center;padding:.45rem 0;border-top:1px solid #f0dcb8;cursor:pointer;font-size:.82rem}',
      '.rs-inrow:first-of-type{border-top:none}.rs-inrow .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rs-dot{width:9px;height:9px;border-radius:50%;background:#d93d2f;flex:none}'
    ].join('');
    document.head.appendChild(s);
  }

  function modal(title, wide) {
    var ov = document.createElement('div'); ov.className = 'rs-ov';
    ov.innerHTML = '<div class="rs-md"' + (wide ? ' style="width:min(860px,100%)"' : '') + '><div class="rs-md-h"><span>' + esc(title) + '</span><button class="rs-md-x" type="button" aria-label="Close">&times;</button></div><div class="rs-md-b"></div><div class="rs-md-f"></div></div>';
    document.body.appendChild(ov);
    var api = { body: ov.querySelector('.rs-md-b'), foot: ov.querySelector('.rs-md-f'), busy: false, onClose: null,
      close: function () { if (api.busy && !confirm('An upload is still running. Close anyway?')) return; ov.remove(); if (api.onClose) api.onClose(); } };
    ov.querySelector('.rs-md-x').onclick = api.close;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) api.close(); });
    return api;
  }

  /* ---------- data ---------- */
  var cacheCls = null;
  async function loadClassrooms(o) {
    if (!cacheCls) {
      var snap = await db().collection('classrooms').get();
      cacheCls = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    }
    var subs = o.subjects || [], ks = o.keyStages || [];
    return cacheCls.filter(function (c) {
      if (o.role === 'admin') return true;
      if (subs.indexOf(c.subjectId) === -1) return false;
      return !ks.length || /^CBC/i.test(c.keyStage || '') || ks.indexOf(c.keyStage) !== -1;
    });
  }
  async function loadTopics(cid) {
    var s = await db().collection('classrooms').doc(cid).collection('topics').get();
    return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.title).localeCompare(String(b.title)); });
  }
  async function loadResources(o) {
    var out = [];
    if (o.role === 'admin') {
      var s = await db().collection('classroomResources').get();
      out = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    } else {
      var qs = await Promise.all((o.subjects || []).map(function (sid) {
        return db().collection('classroomResources').where('subjectId', '==', sid).get().catch(function (e) { console.warn('resources ' + sid, e); return { docs: [] }; });
      }));
      qs.forEach(function (q) { q.docs.forEach(function (d) { out.push(Object.assign({ id: d.id }, d.data())); }); });
      var ks = o.keyStages || [];
      if (ks.length) out = out.filter(function (r) { return /^CBC/i.test(r.keyStage || '') || ks.indexOf(r.keyStage) !== -1; });
    }
    // Work the Studio Desk has withdrawn is hidden from tutors (the admin still sees it, marked Withdrawn).
    if (o.role !== 'admin') out = out.filter(function (r) { return r.withdrawn !== true; });
    return out.sort(function (a, b) { var x = toDate(b.createdAt), y = toDate(a.createdAt); return (x ? x.getTime() : 0) - (y ? y.getTime() : 0); });
  }

  function uploadFile(path, file, onProg) {
    var ref = firebase.storage().ref(path);
    var task = ref.put(file, { contentType: contentType(file) });
    return new Promise(function (res, rej) {
      task.on('state_changed', function (s) { onProg && onProg(Math.round(s.bytesTransferred / s.totalBytes * 100)); },
        function (e) { rej(new Error(e.code === 'storage/unauthorized' ? 'You do not have permission to upload here.' : 'Upload failed. Check your connection.')); },
        function () { ref.getDownloadURL().then(function (url) { res({ name: file.name, url: url, storagePath: path, size: file.size, type: contentType(file) }); }).catch(rej); });
    });
  }
  function download(url, name) {
    fetch(url).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name || 'resource'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    }).catch(function () { window.open(url, '_blank', 'noopener'); });
  }

  /* ---------- UI ---------- */
  function mount(root, o) {
    injectStyle();
    o = o || {};
    var isAdmin = o.role === 'admin';
    var S = { classrooms: [], resources: [], subject: null, fUnit: '', fCat: '', fQ: '', fYear: '' };
    root.innerHTML = '<div class="rs"><div class="rs-top"><h2>Loading resources…</h2></div></div>';
    var host = root.firstChild;

    async function boot() {
      try {
        var r = await Promise.all([loadClassrooms(o), loadResources(o)]);
        S.classrooms = r[0]; S.resources = r[1];
        render();
      } catch (e) {
        console.error('resources:', e);
        host.innerHTML = '<div class="rs-empty">Could not load resources (' + esc(e.code || e.message || e) + ').</div>';
      }
    }

    function subjects() {
      var m = {};
      S.classrooms.forEach(function (c) { m[c.subjectId] = m[c.subjectId] || { id: c.subjectId, name: subjName(c) }; });
      S.resources.forEach(function (r) { m[r.subjectId] = m[r.subjectId] || { id: r.subjectId, name: r.subjectName || r.subjectId }; });
      (o.subjects || []).forEach(function (id) { m[id] = m[id] || { id: id, name: (typeof lmzSubjectLabel === 'function' ? lmzSubjectLabel(id) : id) }; });
      return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    }

    function render() { S.subject ? renderInside() : renderFolders(); }

    function renderFolders() {
      var subs = subjects();
      var unreadFor = function (sid) { return S.resources.filter(function (r) { return r.subjectId === sid && (isAdmin ? r.unreadAdmin : r.unreadTutor); }).length; };
      var html = '<div class="rs-top"><h2><i class="fas fa-folder-open" style="color:#EDB000"></i> Resources</h2>' +
        (isAdmin ? '<button class="rs-btn primary" data-a="upload"><i class="fas fa-cloud-arrow-up"></i> Upload marking schemes / further resources</button>' : '') + '</div>';
      if (isAdmin) html += inboxHtml();
      if (!subs.length) html += '<div class="rs-empty">No subjects yet.</div>';
      html += '<div class="rs-folders">' + subs.map(function (s) {
        var n = S.resources.filter(function (r) { return r.subjectId === s.id; }).length, u = unreadFor(s.id);
        return '<button class="rs-folder" data-a="open" data-s="' + esc(s.id) + '"><div class="rs-fi">' + FOLDER_SVG +
          '<div class="rs-fi-badge' + (u ? ' unread' : '') + '">' + (u ? u + ' new' : n) + '</div></div>' +
          '<div class="rs-fname">' + esc(s.name) + '</div><div class="rs-fsub">Resources · ' + n + ' item' + (n === 1 ? '' : 's') + '</div></button>';
      }).join('') + '</div>';
      host.innerHTML = html; wire();
    }

    function inboxHtml() {
      var rows = S.resources.filter(function (r) { return r.lastMsgAt; }).sort(function (a, b) { return toDate(b.lastMsgAt) - toDate(a.lastMsgAt); }).slice(0, 8);
      if (!rows.length) return '';
      return '<div class="rs-inbox"><h4><i class="fas fa-comments"></i> Latest tutor conversations</h4>' + rows.map(function (r) {
        return '<div class="rs-inrow" data-a="thread" data-r="' + esc(r.id) + '">' + (r.unreadAdmin ? '<span class="dot rs-dot"></span>' : '') +
          '<div class="tx"><b>' + esc(r.lastMsgByName || 'Tutor') + '</b> · ' + esc(subjName(r)) + ' · ' + esc(r.topicTitle || 'Whole subject') + ' · <i>' + esc(r.title) + '</i> — ' + esc(r.lastMsgText || '') + '</div>' +
          '<span style="color:var(--muted)">' + esc(fmtDT(r.lastMsgAt)) + '</span></div>';
      }).join('') + '</div>';
    }

    function filtered() {
      var q = S.fQ.toLowerCase();
      return S.resources.filter(function (r) {
        if (r.subjectId !== S.subject) return false;
        if (S.fUnit === '__all') { if (r.topicId) return false; }
        else if (S.fUnit && r.topicTitle !== S.fUnit) return false;
        if (S.fCat && r.category !== S.fCat) return false;
        if (S.fYear && String(r.year) !== S.fYear) return false;
        if (q && (r.title + ' ' + (r.note || '') + ' ' + (r.topicTitle || '') + ' ' + (r.files || []).map(function (f) { return f.name; }).join(' ')).toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
    }

    function renderInside() {
      var all = S.resources.filter(function (r) { return r.subjectId === S.subject; });
      var sName = (subjects().filter(function (s) { return s.id === S.subject; })[0] || {}).name || 'Subject';
      var units = {}, years = {}, cats = {};
      all.forEach(function (r) { if (r.topicTitle) units[r.topicTitle] = 1; if (r.year) years[r.year] = 1; if (r.category) cats[r.category] = 1; });
      var list = filtered();
      var html = '<div class="rs-top"><button class="rs-crumb" data-a="back"><i class="fas fa-arrow-left"></i> All folders</button><h2><i class="fas fa-folder-open" style="color:#EDB000"></i> ' + esc(sName) + ' — Resources</h2>' +
        (isAdmin ? '<button class="rs-btn primary" data-a="upload"><i class="fas fa-cloud-arrow-up"></i> Upload resources</button>' : '') + '</div>' +
        '<div class="rs-filters"><select data-f="fUnit"><option value="">All units</option><option value="__all"' + (S.fUnit === '__all' ? ' selected' : '') + '>Whole subject (no unit)</option>' +
        Object.keys(units).sort().map(function (u) { return '<option' + (S.fUnit === u ? ' selected' : '') + '>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<select data-f="fCat"><option value="">All types</option>' + Object.keys(cats).sort().map(function (c) { return '<option' + (S.fCat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<select data-f="fYear"><option value="">All years</option>' + Object.keys(years).sort(function (a, b) { return a - b; }).map(function (y) { return '<option value="' + y + '"' + (S.fYear === String(y) ? ' selected' : '') + '>Year ' + y + '</option>'; }).join('') + '</select>' +
        '<input data-f="fQ" type="search" placeholder="Search resources…" value="' + esc(S.fQ) + '"></div>';
      if (!list.length) html += '<div class="rs-empty"><i class="fas fa-folder-open" style="font-size:2.4rem;color:#e6c24d"></i><p>' + (all.length ? 'Nothing matches those filters.' : 'No resources in this folder yet.') + '</p></div>';
      html += '<div class="rs-list">' + list.map(card).join('') + '</div>';
      host.innerHTML = html; wire();
      var q = host.querySelector('[data-f="fQ"]');
      if (q && S.fQ) { q.focus(); q.setSelectionRange(S.fQ.length, S.fQ.length); }
    }

    function card(r) {
      var unread = isAdmin ? r.unreadAdmin : r.unreadTutor;
      return '<div class="rs-card" data-r="' + esc(r.id) + '"><h3>' + esc(r.title) + '</h3>' +
        '<div class="rs-chips"><span class="rs-chip"><i class="fas fa-folder"></i> ' + esc(r.topicTitle || 'Whole subject') + '</span>' +
        '<span class="rs-chip cat' + (r.workType === 'classwork' ? ' cw' : r.workType === 'homework' ? ' hw' : '') + '">' + esc(r.category || 'Resource') + '</span>' +
        (r.withdrawn === true ? '<span class="rs-chip" style="background:#FFF8E6;color:#9A6200;border-color:#D98A00"><i class="fas fa-eye-slash"></i> Withdrawn \u2013 hidden from tutors</span>' : '') +
        (r.sourceTitle ? '<span class="rs-chip src"><i class="fas fa-link"></i> ' + (r.workType === 'homework' ? 'Assignment' : 'Lesson') + ': ' + esc(r.sourceTitle) + '</span>' : '') +
        '<span class="rs-chip">' + esc(r.year ? 'Year ' + r.year : '') + (r.board ? ' · ' + esc(String(r.board).toUpperCase()) : '') + '</span></div>' +
        (r.note ? '<div class="rs-note">' + esc(r.note) + '</div>' : '') +
        (r.files || []).map(function (f, i) {
          return '<div class="rs-file"><i class="fas ' + fileIcon(f.name) + ' ic"></i><span class="nm">' + esc(f.name) + '<small>' + fmtSize(f.size) + '</small></span>' +
            '<a class="rs-btn sm" target="_blank" rel="noopener noreferrer" href="' + esc(safeUrl(f.url)) + '">Open</a>' +
            '<button class="rs-btn sm primary" data-a="dl" data-r="' + esc(r.id) + '" data-i="' + i + '"><i class="fas fa-download"></i> Download</button></div>';
        }).join('') +
        (r.links || []).map(function (l) {
          return '<div class="rs-file"><i class="fas fa-link ic"></i><span class="nm">' + esc(l.label || l.url) + '<small>' + esc(l.url) + '</small></span>' +
            '<a class="rs-btn sm primary" target="_blank" rel="noopener noreferrer" href="' + esc(safeUrl(l.url)) + '">Open link</a></div>';
        }).join('') +
        '<div class="rs-actions"><button class="rs-btn" data-a="thread" data-r="' + esc(r.id) + '"><i class="fas fa-comments"></i> ' + (isAdmin ? 'Discussion' : 'Talk to the Studio Desk') +
        (r.msgCount ? ' (' + r.msgCount + ')' : '') + (unread ? ' <span class="rs-dot"></span>' : '') + '</button>' +
        (isAdmin ? '<button class="rs-btn" data-a="edit" data-r="' + esc(r.id) + '"><i class="fas fa-pen"></i> Edit</button><button class="rs-btn danger" data-a="del" data-r="' + esc(r.id) + '"><i class="fas fa-trash"></i> Delete</button>' : '') +
        '<span style="margin-left:auto;font-size:.7rem;color:var(--muted)">Posted ' + esc(fmtDT(r.createdAt)) + '</span></div></div>';
    }

    function byId(id) { return S.resources.filter(function (r) { return r.id === id; })[0]; }

    function wire() {
      host.querySelectorAll('[data-f]').forEach(function (el) {
        el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () { S[el.dataset.f] = el.value; renderInside(); });
      });
      host.querySelectorAll('[data-a]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          var a = el.dataset.a, r = byId(el.dataset.r);
          if (a === 'open') { S.subject = el.dataset.s; S.fUnit = S.fCat = S.fQ = S.fYear = ''; render(); }
          else if (a === 'back') { S.subject = null; render(); }
          else if (a === 'upload') openUpload(null);
          else if (a === 'edit' && r) openUpload(r);
          else if (a === 'del' && r) removeResource(r);
          else if (a === 'dl' && r) { var f = r.files[Number(el.dataset.i)]; if (f) download(f.url, f.name); }
          else if (a === 'thread' && r) openThread(r);
        });
      });
    }

    /* ----- admin upload pad ----- */
    function openUpload(ex) {
      var m = modal(ex ? 'Edit resource' : 'Upload resources — marking schemes, further resources…', true);
      var files = ex ? (ex.files || []).map(function (f) { return Object.assign({}, f); }) : [];
      var links = ex ? (ex.links || []).map(function (l) { return Object.assign({}, l); }) : [];
      var newlyUploaded = [], rid = ex ? ex.id : db().collection('classroomResources').doc().id;
      var cls = S.classrooms.slice().sort(function (a, b) { return subjName(a).localeCompare(subjName(b)) || (a.year - b.year); });
      var preCid = ex ? ex.cid : (S.subject ? (cls.filter(function (c) { return c.subjectId === S.subject; })[0] || {}).id : (cls[0] || {}).id);
      m.body.innerHTML =
        '<div class="rs-r2"><div class="rs-fld"><label>Classroom (subject · year)</label><select id="rsCls">' + cls.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === preCid ? ' selected' : '') + '>' + esc(subjName(c) + ' · Year ' + c.year + (c.board ? ' · ' + String(c.board).toUpperCase() : '')) + '</option>'; }).join('') + '</select></div>' +
        '<div class="rs-fld"><label>Unit / topic</label><select id="rsTopic"><option value="">Whole subject (no specific unit)</option></select></div></div>' +
        '<div class="rs-r2"><div class="rs-fld"><label>What is this?</label><select id="rsCat">' + CATEGORIES.map(function (c) { return '<option' + (ex && ex.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>' +
        '<input id="rsCatOther" style="margin-top:.4rem;display:none" maxlength="60" placeholder="Describe it, e.g. Examiner report"></div>' +
        '<div class="rs-fld"><label>Title</label><input id="rsTitle" maxlength="160" placeholder="e.g. Paper 2 marking scheme, June 2024" value="' + esc(ex ? ex.title : '') + '"></div></div>' +
        '<div class="rs-fld"><label>Note for tutors <span style="font-weight:600;text-transform:none">(optional)</span></label><textarea id="rsNote" rows="3" maxlength="2000">' + esc(ex ? ex.note || '' : '') + '</textarea></div>' +
        '<div class="rs-fld"><label>Files — add as many as you like</label><div class="rs-drop" id="rsDrop"><i class="fas fa-cloud-arrow-up"></i> Click or drop files here</div>' +
        '<input type="file" id="rsFiles" multiple style="display:none"><div id="rsFileList"></div></div>' +
        '<div class="rs-fld"><label>Links — add as many as you like</label><div id="rsLinkList"></div><button class="rs-btn sm" type="button" id="rsAddLink"><i class="fas fa-plus"></i> Add link</button></div>';
      m.foot.innerHTML = '<span class="rs-err" id="rsErr"></span><button class="rs-btn" data-a="c">Cancel</button><button class="rs-btn primary" data-a="s"><i class="fas fa-paper-plane"></i> ' + (ex ? 'Save changes' : 'Post to tutors') + '</button>';
      var $ = function (s) { return m.body.querySelector(s); }, err = m.foot.querySelector('#rsErr');
      var topicsCache = {};
      async function fillTopics(sel) {
        var cid = $('#rsCls').value, t = topicsCache[cid] || (topicsCache[cid] = await loadTopics(cid).catch(function () { return []; }));
        $('#rsTopic').innerHTML = '<option value="">Whole subject (no specific unit)</option>' + t.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('');
      }
      $('#rsCls').onchange = function () { fillTopics(''); }; fillTopics(ex ? ex.topicId : '');
      function catChange() { var other = $('#rsCat').value === 'Other'; $('#rsCatOther').style.display = other ? '' : 'none'; }
      $('#rsCat').onchange = catChange;
      if (ex && CATEGORIES.indexOf(ex.category) === -1 && ex.category) { $('#rsCat').value = 'Other'; $('#rsCatOther').value = ex.category; }
      catChange();

      function drawFiles() {
        $('#rsFileList').innerHTML = files.map(function (f, i) {
          return '<div class="rs-file"><i class="fas ' + fileIcon(f.name) + ' ic"></i><span class="nm">' + esc(f.name) + '<small>' + fmtSize(f.size) + '</small></span><button class="rs-btn sm danger" data-rm="' + i + '">Remove</button></div>';
        }).join('') + '<div id="rsPend"></div>';
        $('#rsFileList').querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { files.splice(Number(b.dataset.rm), 1); drawFiles(); }; });
      }
      function drawLinks() {
        $('#rsLinkList').innerHTML = links.map(function (l, i) {
          return '<div class="rs-r2" style="margin-bottom:.4rem;grid-template-columns:1fr 1.4fr auto"><input data-l="label" data-i="' + i + '" placeholder="Label" value="' + esc(l.label || '') + '"><input data-l="url" data-i="' + i + '" placeholder="https://…" value="' + esc(l.url || '') + '"><button class="rs-btn sm danger" data-rl="' + i + '">&times;</button></div>';
        }).join('');
        $('#rsLinkList').querySelectorAll('input').forEach(function (inp) { inp.oninput = function () { links[Number(inp.dataset.i)][inp.dataset.l] = inp.value; }; });
        $('#rsLinkList').querySelectorAll('[data-rl]').forEach(function (b) { b.onclick = function () { links.splice(Number(b.dataset.rl), 1); drawLinks(); }; });
      }
      drawFiles(); drawLinks();
      $('#rsAddLink').onclick = function () { links.push({ label: '', url: '' }); drawLinks(); };

      async function addFiles(list) {
        var arr = Array.prototype.slice.call(list); err.textContent = '';
        for (var i = 0; i < arr.length; i++) {
          var f = arr[i];
          if (f.size > MAX_BYTES) { err.textContent = f.name + ' is larger than 100 MB.'; continue; }
          var cid = $('#rsCls').value, c = S.classrooms.filter(function (x) { return x.id === cid; })[0];
          if (!c) { err.textContent = 'Choose a classroom first.'; return; }
          var row = document.createElement('div'); row.className = 'rs-file';
          row.innerHTML = '<i class="fas fa-spinner fa-spin ic"></i><span class="nm">' + esc(f.name) + '</span><div class="rs-prog" style="width:120px"><div></div></div>';
          $('#rsPend').appendChild(row); m.busy = true;
          try {
            var path = 'resource-files/' + c.subjectId + '/' + rid + '/' + Date.now() + '_' + f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            var up = await uploadFile(path, f, function (p) { row.querySelector('.rs-prog div').style.width = p + '%'; });
            files.push(up); newlyUploaded.push(up);
          } catch (e) { err.textContent = e.message; }
          m.busy = false; drawFiles();
        }
      }
      $('#rsDrop').onclick = function () { $('#rsFiles').click(); };
      $('#rsFiles').onchange = function () { var l = this.files; addFiles(l); this.value = ''; };
      var dz = $('#rsDrop');
      dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = function () { dz.classList.remove('over'); };
      dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); };
      m.onClose = function () { if (!m.saved) newlyUploaded.forEach(function (f) { firebase.storage().ref(f.storagePath).delete().catch(function () {}); }); };
      m.foot.querySelector('[data-a="c"]').onclick = m.close;
      m.foot.querySelector('[data-a="s"]').onclick = async function () {
        var btn = this; err.textContent = '';
        if (m.busy) { err.textContent = 'Please wait for uploads to finish.'; return; }
        var cid = $('#rsCls').value, c = S.classrooms.filter(function (x) { return x.id === cid; })[0];
        var title = $('#rsTitle').value.trim(), cat = $('#rsCat').value === 'Other' ? ($('#rsCatOther').value.trim() || 'Other') : $('#rsCat').value;
        var cleanLinks = [];
        for (var i = 0; i < links.length; i++) {
          if (!String(links[i].url || '').trim()) continue;
          var u = normUrl(links[i].url); if (!u) { err.textContent = 'One of the links is not a valid web address.'; return; }
          cleanLinks.push({ label: String(links[i].label || '').trim().slice(0, 120), url: u });
        }
        if (!c) { err.textContent = 'Choose a classroom.'; return; }
        if (!title) { err.textContent = 'Please give this a title.'; return; }
        if (!files.length && !cleanLinks.length) { err.textContent = 'Add at least one file or link.'; return; }
        var tid = $('#rsTopic').value, tObj = (topicsCache[cid] || []).filter(function (t) { return t.id === tid; })[0];
        var data = { title: title, category: cat, note: $('#rsNote').value.trim(), cid: c.id, subjectId: c.subjectId, subjectName: subjName(c),
          keyStage: c.keyStage || '', year: c.year == null ? null : c.year, board: c.board || '', topicId: tid, topicTitle: tObj ? tObj.title : '',
          files: files, links: cleanLinks, updatedAt: FV().serverTimestamp() };
        if (!ex) Object.assign(data, { createdBy: o.uid, createdByName: o.name || 'Studio Desk', createdAt: FV().serverTimestamp(), msgCount: 0, unreadAdmin: false, unreadTutor: true });
        btn.disabled = true;
        try {
          await db().collection('classroomResources').doc(rid).set(data, { merge: true });
          if (ex) (ex.files || []).forEach(function (f) { if (!files.some(function (x) { return x.storagePath === f.storagePath; }) && f.storagePath) firebase.storage().ref(f.storagePath).delete().catch(function () {}); });
          m.saved = true; m.close(); S.subject = c.subjectId; await boot(); S.subject = c.subjectId; render();
        } catch (e) { console.error(e); err.textContent = 'Could not save: ' + (e.code === 'permission-denied' ? 'permission denied (deploy the new rules).' : (e.message || e)); btn.disabled = false; }
      };
    }

    async function removeResource(r) {
      if (!confirm('Delete "' + r.title + '" and its files? Tutors will lose access.')) return;
      try {
        var msgs = await db().collection('classroomResources').doc(r.id).collection('messages').get();
        for (var i = 0; i < msgs.docs.length; i++) await msgs.docs[i].ref.delete();
        await db().collection('classroomResources').doc(r.id).delete();
        (r.files || []).forEach(function (f) { if (f.storagePath) firebase.storage().ref(f.storagePath).delete().catch(function () {}); });
        S.resources = S.resources.filter(function (x) { return x.id !== r.id; }); render();
      } catch (e) { alert('Could not delete: ' + (e.message || e)); }
    }

    /* ----- discussion thread (shared by tutor + admin, every message marked) ----- */
    function openThread(r) {
      var m = modal('Discussion — ' + r.title, true), unsub = null;
      m.body.innerHTML = '<div class="rs-chips"><span class="rs-chip"><i class="fas fa-book"></i> ' + esc(subjName(r)) + '</span><span class="rs-chip"><i class="fas fa-folder"></i> ' + esc(r.topicTitle || 'Whole subject') +
        '</span><span class="rs-chip cat">' + esc(r.category || 'Resource') + '</span></div><div class="rs-thread" id="rsTh"><div class="rs-empty">Loading…</div></div>';
      m.foot.innerHTML = '<div class="rs-compose" style="flex:1"><textarea id="rsMsg" rows="2" maxlength="2000" placeholder="' + (isAdmin ? 'Reply to the tutors…' : 'Ask the Studio Desk about this resource…') + '"></textarea><button class="rs-btn primary" id="rsSend"><i class="fas fa-paper-plane"></i> Send</button></div>';
      m.onClose = function () { if (unsub) unsub(); };
      var ref = db().collection('classroomResources').doc(r.id);
      ref.update(isAdmin ? { unreadAdmin: false } : { unreadTutor: false }).then(function () { r[isAdmin ? 'unreadAdmin' : 'unreadTutor'] = false; }).catch(function () {});
      unsub = ref.collection('messages').orderBy('createdAt', 'asc').onSnapshot(function (snap) {
        var th = m.body.querySelector('#rsTh');
        if (!snap.docs.length) { th.innerHTML = '<div class="rs-empty">No messages yet. ' + (isAdmin ? 'Tutors can raise questions here.' : 'Ask anything about this resource.') + '</div>'; return; }
        th.innerHTML = snap.docs.map(function (d) {
          var x = d.data(), mine = x.authorUid === o.uid, fromAdmin = x.authorRole === 'admin';
          return '<div class="rs-msg ' + (mine ? 'me' : 'them') + (fromAdmin ? ' admin' : '') + '"><div class="rs-mk">' +
            '<b>' + (fromAdmin ? 'Studio Desk' : 'Tutor: ' + esc(x.authorName || 'Tutor')) + '</b><b>' + esc(x.subjectName || subjName(r)) + '</b><b>Unit: ' + esc(x.topicTitle || 'Whole subject') + '</b><b>' + esc(x.resourceTitle || r.title) + '</b></div>' +
            esc(x.text) + '<div class="rs-time">' + esc(fmtDT(x.createdAt)) + '</div></div>';
        }).join('');
        m.body.scrollTop = m.body.scrollHeight;
      }, function (e) { m.body.querySelector('#rsTh').innerHTML = '<div class="rs-empty">Could not load messages (' + esc(e.code || e.message) + ').</div>'; });
      var send = m.foot.querySelector('#rsSend'), ta = m.foot.querySelector('#rsMsg');
      async function go() {
        var text = ta.value.trim(); if (!text) return; send.disabled = true;
        try {
          await ref.collection('messages').add({ text: text, authorUid: o.uid, authorName: o.name || (isAdmin ? 'Studio Desk' : 'Tutor'), authorRole: isAdmin ? 'admin' : 'tutor',
            subjectId: r.subjectId, subjectName: subjName(r), cid: r.cid || '', topicId: r.topicId || '', topicTitle: r.topicTitle || '', resourceTitle: r.title, createdAt: FV().serverTimestamp() });
          var sum = { msgCount: FV().increment(1), lastMsgAt: FV().serverTimestamp(), lastMsgText: text.slice(0, 120), lastMsgBy: o.uid, lastMsgByName: o.name || (isAdmin ? 'Studio Desk' : 'Tutor') };
          sum[isAdmin ? 'unreadTutor' : 'unreadAdmin'] = true;
          await ref.update(sum);
          r.msgCount = (r.msgCount || 0) + 1; r.lastMsgText = text.slice(0, 120); r.lastMsgByName = sum.lastMsgByName; r.lastMsgAt = new Date();
          ta.value = '';
        } catch (e) { alert('Could not send: ' + (e.code === 'permission-denied' ? 'permission denied.' : (e.message || e))); }
        send.disabled = false; ta.focus();
      }
      send.onclick = go;
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); });
    }

    boot();
  }

  /* Lesson / assignment files go straight into the Resources folder, tagged with the
     unit and Classwork (lesson) or Homework (assignment). One resource per lesson or
     assignment (id wk_<type>_<sourceId>) so re-saving updates it instead of duplicating. */
  async function syncFromWork(o) {
    if (!o || !o.sourceId || !o.cls) return;
    var type = o.workType === 'homework' ? 'homework' : 'classwork';
    var ref = db().collection('classroomResources').doc('wk_' + type + '_' + o.sourceId);
    var files = [], links = [];
    (o.items || []).forEach(function (a) {
      if (!a) return;
      if (a.kind === 'link') { var u = safeUrl(a.url); if (u) links.push({ label: String(a.name || a.label || '').slice(0, 120), url: u }); }
      else if (a.url) files.push({ name: a.name || 'File', url: a.url, storagePath: a.storagePath || '', size: a.size || 0, type: a.type || '' });
    });
    (o.links || []).forEach(function (l) { var u = safeUrl(l && l.url); if (u) links.push({ label: String(l.label || '').slice(0, 120), url: u }); });
    if (!files.length && !links.length) { await ref.delete().catch(function () {}); return; }
    var c = o.cls, label = type === 'homework' ? 'Homework' : 'Classwork';
    var data = { title: (o.title || label) + ' \u2014 ' + label.toLowerCase(), category: label, workType: type, workSourceId: o.sourceId, sourceTitle: o.title || '',
      note: '', cid: c.id, subjectId: c.subjectId, subjectName: subjName(c), keyStage: c.keyStage || '', year: c.year == null ? null : c.year, board: c.board || '',
      topicId: o.topicId || '', topicTitle: o.topicTitle || '', files: files, links: links, withdrawn: false, updatedAt: FV().serverTimestamp() };
    var snap = await ref.get();
    if (!snap.exists) Object.assign(data, { createdBy: o.uid || '', createdByName: o.name || 'Studio Desk', createdAt: FV().serverTimestamp(), msgCount: 0, unreadAdmin: false, unreadTutor: true });
    await ref.set(data, { merge: true });
  }
  async function removeWork(type, sourceId) {
    try {
      var ref = db().collection('classroomResources').doc('wk_' + (type === 'homework' ? 'homework' : 'classwork') + '_' + sourceId);
      var snap = await ref.get();
      if (!snap.exists) return;
      ((snap.data().files) || []).forEach(function (f) { if (f.storagePath) firebase.storage().ref(f.storagePath).delete().catch(function () {}); });
      await ref.delete();
    } catch (e) { /* not an admin, or nothing to remove */ }
  }

  /* Only the Studio Desk (admin page) can post tutor resources. */
  function canPad() { return /\/admin(\/|$)/.test(location.pathname); }

  /* "Tutor resources" pad shown inside the lesson editor and the Prepare assignment window.
     Separate from the lesson/assignment attachments that students see: everything added here is
     TUTORS ONLY and is filed in Resources under the unit, as Classwork (lesson) or Homework (assignment). */
  function tutorPad(host, o) {
    if (!host) return null;
    var type = o.workType === 'homework' ? 'homework' : 'classwork', label = type === 'homework' ? 'Homework' : 'Classwork';
    var rid = 'wk_' + type + '_' + o.sourceId, c = o.cls;
    var files = [], links = [], fresh = [], gone = [], busy = 0, loaded = false;
    host.innerHTML = '<label>Tutor resources <span class="cr-note" style="font-weight:600">(tutors only \u2014 marking schemes, extra teaching materials)</span></label>' +
      '<div data-p="list"></div><div data-p="pend"></div>' +
      '<div class="cr-actions" style="margin-top:.4rem"><button type="button" class="cr-btn sm" data-p="up"><i class="fas fa-upload"></i> Upload tutor resource</button>' +
      '<button type="button" class="cr-btn sm" data-p="lnk"><i class="fas fa-link"></i> Add tutor link</button></div>' +
      '<input type="file" multiple data-p="in" style="display:none">' +
      '<div class="cr-note" data-p="err" style="color:#b8362a;font-weight:700"></div>' +
      '<div class="cr-note" data-p="tag" style="margin-top:.4rem;background:#fff8dc;border:1px solid #f0dc8a;padding:.5rem .7rem;border-radius:8px"></div>';
    var $ = function (k) { return host.querySelector('[data-p="' + k + '"]'); };
    function tag() {
      $('tag').innerHTML = '<i class="fas fa-folder-open" style="color:#EDB000"></i> Goes to the tutors\u2019 <b>Resources</b> folder \u2014 <b>Unit: ' + esc((o.getTopic && o.getTopic()) || '') + '</b> \u00b7 <b>' + label + '</b>. Students never see these.';
    }
    function draw() {
      $('list').innerHTML = files.map(function (f, i) {
        return '<div class="cr-res"><i class="fas ' + fileIcon(f.name) + '"></i><span class="nm">' + esc(f.name) + '<small>' + fmtSize(f.size) + '</small></span><button type="button" class="cr-btn sm danger" data-rf="' + i + '">Remove</button></div>';
      }).join('') + links.map(function (l, i) {
        return '<div class="cr-res"><i class="fas fa-link"></i><span class="nm">' + esc(l.label || l.url) + '<small>' + esc(l.url) + '</small></span><button type="button" class="cr-btn sm danger" data-rl="' + i + '">Remove</button></div>';
      }).join('') || '<div class="cr-note">No tutor resources added.</div>';
      $('list').querySelectorAll('[data-rf]').forEach(function (b) { b.onclick = function () {
        var f = files.splice(Number(b.dataset.rf), 1)[0], k = fresh.indexOf(f);
        if (f && f.storagePath) { if (k !== -1) { fresh.splice(k, 1); firebase.storage().ref(f.storagePath).delete().catch(function () {}); } else gone.push(f); }
        draw();
      }; });
      $('list').querySelectorAll('[data-rl]').forEach(function (b) { b.onclick = function () { links.splice(Number(b.dataset.rl), 1); draw(); }; });
    }
    draw(); tag();
    db().collection('classroomResources').doc(rid).get().then(function (s) {
      if (s.exists) { files = (s.data().files || []).map(function (f) { return Object.assign({}, f); }); links = (s.data().links || []).map(function (l) { return Object.assign({}, l); }); }
      loaded = true; draw();
    }).catch(function (e) { $('err').textContent = 'Could not load existing tutor resources (' + (e.code || e.message) + ').'; });

    $('up').onclick = function () { $('in').click(); };
    $('in').onchange = async function () {
      var picked = Array.prototype.slice.call(this.files); this.value = ''; $('err').textContent = '';
      for (var i = 0; i < picked.length; i++) {
        var f = picked[i];
        if (f.size > MAX_BYTES) { $('err').textContent = f.name + ' is larger than 100 MB.'; continue; }
        var row = document.createElement('div'); row.className = 'cr-res';
        row.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="nm">' + esc(f.name) + '<small>Uploading\u2026</small></span>';
        $('pend').appendChild(row); busy++;
        try {
          var up = await uploadFile('resource-files/' + c.subjectId + '/' + rid + '/' + Date.now() + '_' + f.name.replace(/[^a-zA-Z0-9._-]/g, '_'), f);
          files.push(up); fresh.push(up);
        } catch (e) { $('err').textContent = e.message; }
        busy--; row.remove(); draw();
      }
    };
    $('lnk').onclick = function () {
      var u = normUrl(prompt('Link address (https://\u2026) \u2014 for tutors only') || ''); if (!u) return;
      links.push({ label: (prompt('Link title (shown to tutors)', 'Teaching resource') || 'Link').trim().slice(0, 120), url: u }); draw();
    };
    return {
      busy: function () { return busy > 0; },
      canSync: function () { return loaded; },
      retag: tag,
      items: function () {
        return files.map(function (f) { return Object.assign({ kind: 'file' }, f); }).concat(links.map(function (l) { return { kind: 'link', name: l.label, url: l.url }; }));
      },
      commit: function () { gone.forEach(function (f) { if (f.storagePath) firebase.storage().ref(f.storagePath).delete().catch(function () {}); }); gone = []; fresh = []; }
    };
  }

  global.ResourcesUI = { mount: mount, syncFromWork: syncFromWork, removeWork: removeWork, tutorPad: tutorPad, canPad: canPad };
})(window);