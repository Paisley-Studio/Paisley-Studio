/* =========================================================
   LMZ CLASSROOM — shared data layer + UI
========================================================= */
(function (global) {
  'use strict';

  var KEY_STAGES = [
    'Key Stage 2 (Years 3-6)',
    'Key Stage 3 (Years 7-9)',
    'Key Stage 4 (Years 10-11) — IGCSE',
    'Key Stage 5 (Years 12-13) — A-Level'
  ];
  var STATUS_LABEL = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', archived: 'Archived' };
  var MAX_FILE_BYTES = 100 * 1024 * 1024;
  var EXT_TYPES = {
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv', txt: 'text/plain',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toDate(ts) {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts instanceof Date) return ts;
    var d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(ts) {
    var d = toDate(ts);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }
  function fmtDateTime(ts) {
    var d = toDate(ts);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function classroomId(subjectId, year) { return subjectId + '_y' + year; }
  function ksShort(ks) { return String(ks || '').replace(/\s*\(.*/, ''); }
  function byOrder(a, b) {
    return ((a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)) ||
      String(a.title || '').localeCompare(String(b.title || ''));
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function fileIcon(att) {
    if (att.kind === 'link') return /youtu|vimeo/i.test(att.url || '') ? 'fa-circle-play' : 'fa-link';
    var e = ext(att.name), t = att.fileType || '';
    if (e === 'pdf') return 'fa-file-pdf';
    if (/^doc/.test(e)) return 'fa-file-word';
    if (/^ppt/.test(e)) return 'fa-file-powerpoint';
    if (/^xls|^csv/.test(e)) return 'fa-file-excel';
    if (/^image\//.test(t)) return 'fa-image';
    if (/^video\//.test(t)) return 'fa-film';
    if (/^audio\//.test(t)) return 'fa-music';
    return 'fa-file';
  }
  function fmtSize(n) {
    if (!n) return '';
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\/\S+$/i.test(u) ? u : '';
  }
  function displayName(c) {
    if (!c) return 'Untitled classroom';
    return c.subjectName || (c.subjectId ? lmzSubjectLabel(c.subjectId) : '') || 'Untitled classroom';
  }

  var ALLOWED_TAGS = { P: 1, BR: 1, H2: 1, H3: 1, H4: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, UL: 1, OL: 1, LI: 1,
    A: 1, BLOCKQUOTE: 1, TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1, IMG: 1, DIV: 1, SPAN: 1, HR: 1,
    CODE: 1, PRE: 1, SUB: 1, SUP: 1 };
  var DROP_TAGS = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1,
    SELECT: 1, LINK: 1, META: 1, SVG: 1, MATH: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, NOSCRIPT: 1, TEMPLATE: 1 };

  function sanitizeHtml(html) {
    var inert = document.implementation.createHTMLDocument('');
    var src = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html').body;
    var out = inert.createElement('div');
    (function build(from, to) {
      for (var n = from.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { to.appendChild(inert.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        if (DROP_TAGS[tag]) continue;
        if (!ALLOWED_TAGS[tag]) { build(n, to); continue; }
        var el = inert.createElement(tag.toLowerCase());
        if (tag === 'A') {
          var h = (n.getAttribute('href') || '').trim();
          if (/^(https?:|mailto:)/i.test(h)) {
            el.setAttribute('href', h);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        } else if (tag === 'IMG') {
          var s = (n.getAttribute('src') || '').trim();
          if (!/^https:\/\//i.test(s)) continue;
          el.setAttribute('src', s);
          el.setAttribute('alt', n.getAttribute('alt') || '');
          el.setAttribute('loading', 'lazy');
        } else if (tag === 'TD' || tag === 'TH') {
          ['colspan', 'rowspan'].forEach(function (a) {
            var v = parseInt(n.getAttribute(a), 10);
            if (v > 1 && v < 20) el.setAttribute(a, v);
          });
        } else if (tag === 'DIV' && n.classList.contains('cr-callout')) {
          el.setAttribute('class', 'cr-callout');
        }
        build(n, el);
        to.appendChild(el);
      }
    })(src, out);
    return out.innerHTML;
  }

  var AUD_NAMES = { online: 'Online', remote: 'Remote', tuition: 'Tuition', tutors: 'Tutors' };
  // Which audience a student record belongs to: online (default), remote, or tuition (CBC).
  function audFor(p) { var t = p && p.studentType; return t === 'remote' ? 'remote' : (t === 'tuition' ? 'tuition' : 'online'); }
  function isCbcStage(ks) { return /^CBC\b/i.test(String(ks || '')); }
  function effAud(l) {
    if (l && l.audiences && typeof l.audiences === 'object') return l.audiences;
    return { online: !!l && (l.status === 'published' || l.status === 'scheduled'), remote: false, tuition: false, tutors: true };
  }
  function audBadges(l) {
    var a = effAud(l);
    return '<span class="cr-auds" title="Where this lesson has been posted">' + Object.keys(AUD_NAMES).map(function (k) {
      return '<span class="cr-aud ' + (a[k] ? 'on' : 'off') + '">' + AUD_NAMES[k] + '</span>';
    }).join('') + '</span>';
  }

  function injectStyle() {
    if (document.getElementById('cr-style')) return;
    var st = document.createElement('style');
    st.id = 'cr-style';
    st.textContent = [
      '.cr-root{font-family:var(--font,inherit);color:var(--ink,#263331)}',
      '.cr-bar{display:flex;align-items:center;justify-content:space-between;gap:.7rem;flex-wrap:wrap;margin-bottom:1rem}',
      '.cr-bar h3{margin:0;font-size:1.05rem;color:var(--brand-deep,#245F5A)}',
      '.cr-sub{font-size:.8rem;color:var(--muted,#5A6E6A)}',
      '.cr-crumb{font-size:.8rem;color:var(--muted,#5A6E6A);margin-bottom:.8rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}',
      '.cr-crumb a{color:var(--brand-deep,#245F5A);font-weight:700;cursor:pointer;text-decoration:none}',
      '.cr-crumb a:hover{text-decoration:underline}',
      '.cr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.9rem}',
      '.cr-card{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:1.1rem 1.2rem;cursor:pointer;text-align:left;font-family:inherit;color:inherit;transition:border-color .15s,transform .15s;position:relative}',
      '.cr-card:hover{border-color:var(--brand,#55BFB3);transform:translateY(-2px)}',
      '.cr-card .ic{width:40px;height:40px;border-radius:12px;background:rgba(85,191,179,.14);color:var(--brand-deep,#245F5A);display:flex;align-items:center;justify-content:center;margin-bottom:.7rem}',
      '.cr-card h4{margin:0 0 .15rem;font-size:.95rem;color:var(--brand-deep,#245F5A)}',
      '.cr-card .meta{font-size:.76rem;color:var(--muted,#5A6E6A)}',
      '.cr-badge-red{position:absolute;top:-8px;right:-8px;background:#E74C3C;color:#fff;border-radius:50%;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;box-shadow:0 2px 6px rgba(231,76,60,.4);border:2px solid #fff;padding:0 4px}',
      '.cr-panel{background:var(--surface,#fff);border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:1.1rem 1.2rem;margin-bottom:.9rem}',
      '.cr-empty{padding:1.6rem 1rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.86rem}',
      '.cr-filters{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:1rem}',
      '.cr-filters select,.cr-filters input,.cr-field input,.cr-field select,.cr-field textarea{padding:.55rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:10px;font-family:inherit;font-size:.84rem;background:var(--surface,#fff);color:inherit;max-width:100%}',
      '.cr-filters select:focus,.cr-filters input:focus,.cr-field input:focus,.cr-field select:focus,.cr-field textarea:focus{outline:none;border-color:var(--brand,#55BFB3)}',
      '.cr-tabs{display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap}',
      '.cr-btn{padding:.5rem .95rem;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.1));background:var(--surface,#fff);color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:700;font-size:.78rem;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem}',
      '.cr-btn:hover{border-color:var(--brand,#55BFB3)}',
      '.cr-btn.primary{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.cr-btn.primary:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3)}',
      '.cr-btn.on{background:var(--sage,#E5F2EF);border-color:var(--brand,#55BFB3)}',
      '.cr-btn.danger{color:var(--error,#E74C3C)}',
      '.cr-btn.danger.primary{background:var(--error,#E74C3C);border-color:var(--error,#E74C3C);color:#fff}',
      '.cr-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.cr-btn.sm{padding:.3rem .55rem;font-size:.72rem}',
      '.cr-btn i,.cr-btn .fas,.cr-btn .far,.cr-btn .fab,.cr-btn .fa-solid,.cr-btn .fa-regular{color:inherit !important}',
      '.cr-btn.primary i,.cr-btn.primary .fas,.cr-btn.primary .far,.cr-btn.primary .fab,.cr-btn.primary .fa-solid,.cr-btn.primary .fa-regular{color:#fff !important}',
      '.cr-btn.primary:hover i,.cr-btn.primary:hover .fas,.cr-btn.primary:hover .far,.cr-btn.primary:hover .fab{color:#fff !important}',
      '.cr-btn.danger.primary i{color:#fff !important}',
      '.cr-topic{border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;margin-bottom:.8rem;background:var(--surface,#fff);overflow:hidden}',
      '.cr-topic-head{display:flex;align-items:center;gap:.6rem;padding:.8rem 1rem;background:var(--sage,#E5F2EF);flex-wrap:wrap}',
      '.cr-topic-head .t{flex:1;min-width:160px;font-weight:800;color:var(--brand-deep,#245F5A);font-size:.9rem;cursor:pointer}',
      '.cr-topic-head .t small{display:block;font-weight:500;color:var(--muted,#5A6E6A);font-size:.74rem}',
      '.cr-actions{display:flex;gap:.3rem;flex-wrap:wrap;align-items:center}',
      '.cr-lesson{display:flex;align-items:center;gap:.7rem;padding:.65rem 1rem;border-top:1px solid var(--line-soft,rgba(38,51,49,.06));flex-wrap:wrap}',
      '.cr-lesson .n{width:2rem;font-weight:800;color:var(--brand-deep,#245F5A);font-size:.82rem}',
      '.cr-lesson .tt{flex:1;min-width:150px;font-size:.88rem;font-weight:600}',
      '.cr-lesson .tt small{display:block;font-weight:500;color:var(--muted,#5A6E6A);font-size:.72rem}',
      '.cr-lesson.student{cursor:pointer}',
      '.cr-lesson.student:hover{background:var(--paper,#F1F9F7)}',
      '.cr-badge{display:inline-flex;align-items:center;padding:.18rem .55rem;border-radius:99px;font-size:.68rem;font-weight:800}',
      '.cr-badge.draft{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.cr-badge.scheduled{background:rgba(232,163,61,.14);color:#96690f}',
      '.cr-badge.published{background:rgba(46,184,114,.12);color:#1d8b57}',
      '.cr-badge.archived{background:rgba(90,110,106,.14);color:var(--muted,#5A6E6A)}',
      '.cr-auds{display:inline-flex;gap:.2rem;flex-wrap:wrap}',
      '.cr-aud{padding:.1rem .45rem;border-radius:99px;font-size:.62rem;font-weight:800}',
      '.cr-aud.on{background:rgba(46,184,114,.14);color:#1d8b57}',
      '.cr-aud.off{background:rgba(90,110,106,.1);color:var(--muted,#5A6E6A);opacity:.7}',
      '.cr-table-wrap{overflow-x:auto;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:14px;background:var(--surface,#fff)}',
      '.cr-table{width:100%;border-collapse:collapse;font-size:.82rem;min-width:720px}',
      '.cr-table th{text-align:left;padding:.65rem .8rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#5A6E6A);background:var(--paper,#F1F9F7)}',
      '.cr-table td{padding:.65rem .8rem;border-top:1px solid var(--line-soft,rgba(38,51,49,.06));vertical-align:middle}',
      '.cr-overlay{position:fixed;inset:0;background:rgba(15,26,20,.5);display:flex;align-items:center;justify-content:center;z-index:300;padding:1rem}',
      '.cr-modal{background:var(--surface,#fff);border-radius:18px;max-width:640px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}',
      '.cr-modal.wide{max-width:900px}',
      '.cr-modal-head{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.3rem;border-bottom:1px solid var(--line,rgba(38,51,49,.1))}',
      '.cr-modal-head h3{margin:0;font-size:1rem;color:var(--brand-deep,#245F5A)}',
      '.cr-modal-body{padding:1.1rem 1.3rem;overflow-y:auto;flex:1}',
      '.cr-modal-foot{padding:.9rem 1.3rem;border-top:1px solid var(--line,rgba(38,51,49,.1));display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end;align-items:center}',
      '.cr-field{margin-bottom:.95rem}',
      '.cr-field>label{display:block;font-size:.74rem;font-weight:800;color:var(--brand-deep,#245F5A);margin-bottom:.35rem;text-transform:uppercase;letter-spacing:.03em}',
      '.cr-field input[type=text],.cr-field input[type=url],.cr-field select,.cr-field textarea{width:100%}',
      '.cr-row2{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}',
      '.cr-err{color:var(--error,#E74C3C);font-size:.8rem;margin-right:auto}',
      '.cr-tools{display:flex;gap:.25rem;flex-wrap:wrap;padding:.4rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-bottom:none;border-radius:10px 10px 0 0;background:var(--paper,#F1F9F7)}',
      '.cr-tools button{min-width:32px;height:32px;border:1px solid transparent;background:transparent;border-radius:8px;cursor:pointer;color:var(--brand-deep,#245F5A);font-family:inherit;font-weight:800;font-size:.8rem}',
      '.cr-tools button:hover{background:var(--sage,#E5F2EF);border-color:var(--line,rgba(38,51,49,.1))}',
      '.cr-edit{min-height:240px;max-height:48vh;overflow-y:auto;padding:.8rem .9rem;border:1.5px solid var(--line,rgba(38,51,49,.1));border-radius:0 0 10px 10px;background:var(--surface,#fff);outline:none;font-size:.92rem;line-height:1.65}',
      '.cr-edit:focus{border-color:var(--brand,#55BFB3)}',
      '.cr-edit:empty:before{content:attr(data-placeholder);color:var(--muted,#5A6E6A);opacity:.7}',
      '.cr-prose{font-size:.95rem;line-height:1.7;word-wrap:break-word;overflow-wrap:anywhere}',
      '.cr-prose h2,.cr-edit h2{font-size:1.2rem;margin:1.1rem 0 .4rem;color:var(--brand-deep,#245F5A)}',
      '.cr-prose h3,.cr-edit h3{font-size:1.02rem;margin:1rem 0 .35rem;color:var(--brand-deep,#245F5A)}',
      '.cr-prose h4,.cr-edit h4{font-size:.95rem;margin:.9rem 0 .3rem}',
      '.cr-prose p,.cr-edit p{margin:.5rem 0}',
      '.cr-prose ul,.cr-prose ol,.cr-edit ul,.cr-edit ol{margin:.5rem 0;padding-left:1.5rem}',
      '.cr-prose blockquote,.cr-edit blockquote{margin:.8rem 0;padding:.5rem 1rem;border-left:4px solid var(--brand,#55BFB3);background:var(--paper,#F1F9F7);border-radius:0 8px 8px 0}',
      '.cr-prose .cr-callout,.cr-edit .cr-callout{margin:.8rem 0;padding:.7rem 1rem;border-radius:10px;background:rgba(232,163,61,.12);border:1px solid rgba(232,163,61,.35)}',
      '.cr-prose img,.cr-edit img{max-width:100%;height:auto;border-radius:8px}',
      '.cr-prose table,.cr-edit table{border-collapse:collapse;margin:.8rem 0;display:block;overflow-x:auto;max-width:100%}',
      '.cr-prose th,.cr-prose td,.cr-edit th,.cr-edit td{border:1px solid var(--line,rgba(38,51,49,.18));padding:.4rem .65rem;min-width:60px}',
      '.cr-prose th,.cr-edit th{background:var(--sage,#E5F2EF)}',
      '.cr-prose a,.cr-edit a{color:var(--brand-deep,#245F5A);text-decoration:underline}',
      '.cr-prose pre,.cr-prose code{background:var(--paper,#F1F9F7);border-radius:6px;padding:.1rem .35rem}',
      '.cr-res{display:flex;align-items:center;gap:.7rem;padding:.6rem .8rem;border:1px solid var(--line,rgba(38,51,49,.1));border-radius:12px;margin-bottom:.5rem;background:var(--surface,#fff);flex-wrap:wrap}',
      '.cr-res i.fa-solid,.cr-res i.fas,.cr-res>i{font-size:1.1rem;color:var(--brand-deep,#245F5A);width:1.4rem;text-align:center}',
      '.cr-res .nm{flex:1;min-width:140px;font-size:.86rem;font-weight:700;word-break:break-word}',
      '.cr-res .nm small{display:block;font-weight:500;color:var(--muted,#5A6E6A);font-size:.72rem}',
      '.cr-res video,.cr-res audio{width:100%;margin-top:.4rem}',
      '.cr-prog{height:6px;background:var(--sage,#E5F2EF);border-radius:99px;overflow:hidden;flex-basis:100%}',
      '.cr-prog>div{height:100%;background:var(--brand,#55BFB3);width:0;transition:width .2s}',
      '.cr-nav{display:flex;justify-content:space-between;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap}',
      '.cr-note{font-size:.76rem;color:var(--muted,#5A6E6A)}',
      '.cr-lesson-title{font-size:1.35rem;margin:.2rem 0 .3rem;color:var(--brand-deep,#245F5A)}',
      '.cr-title-edit{cursor:text;outline:none;display:inline-flex;align-items:center;gap:.3rem;max-width:100%;flex-wrap:wrap}',
      '.cr-title-edit:hover{background:var(--sage,#E5F2EF);border-radius:8px;padding:2px 6px}',
      '.cr-title-edit.editing{background:var(--sage,#E5F2EF);border-radius:8px;padding:2px 6px}',
      '.cr-title-edit .cr-pen{font-size:.7rem;color:var(--muted,#5A6E6A);flex-shrink:0}',
      '.cr-title-edit .cr-name{outline:none}',
      '.cr-scope-banner{background:rgba(74,144,217,.1);border:1px solid rgba(74,144,217,.35);color:#2b6cad;border-radius:12px;padding:.65rem 1rem;font-size:.82rem;margin-bottom:1rem;display:flex;align-items:center;gap:.55rem}',
      '@media (max-width:640px){.cr-row2{grid-template-columns:1fr}.cr-overlay{padding:0}.cr-modal,.cr-modal.wide{max-width:100%;max-height:100vh;height:100vh;border-radius:0}.cr-lesson .n{width:auto}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function clsRef(cid) { return db.collection('classrooms').doc(cid); }
  function topicsRef(cid) { return clsRef(cid).collection('topics'); }
  function topicRef(cid, tid) { return topicsRef(cid).doc(tid); }
  function lessonsRef(cid, tid) { return topicRef(cid, tid).collection('lessons'); }
  function lessonRef(cid, tid, lid) { return lessonsRef(cid, tid).doc(lid); }

  function snapDocs(snap) { return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }

  async function findClassroom(subjectId, year, keyStage) {
    var q = db.collection('classrooms').where('subjectId', '==', subjectId);
    q = year != null ? q.where('year', '==', Number(year)) : q.where('keyStage', '==', keyStage);
    var snap = await q.limit(1).get();
    return snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  }

  async function ensureClassroom(subjectId, keyStage, year, user) {
    var found = await findClassroom(subjectId, year);
    if (found) return found;
    var data = {
      subjectId: subjectId,
      subjectName: lmzSubjectLabel(subjectId) || subjectId,
      keyStage: keyStage,
      year: Number(year),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid
    };
    var id = classroomId(subjectId, year);
    await clsRef(id).set(data);
    return Object.assign({ id: id }, data);
  }

  async function loadTopics(cid) {
    var snap = await clsRef(cid).collection('topics').get();
    return snapDocs(snap).sort(byOrder);
  }

  // Fetch every topic's lessons CONCURRENTLY (was one awaited query per topic,
  // one after another). Result order is still topic order.
  async function loadLessonsForTopics(cid, topics, publishedOnly, aud) {
    var parts = await Promise.all(topics.map(async function (t) {
      var q = lessonsRef(cid, t.id);
      if (publishedOnly) q = q.where('status', '==', 'published');
      if (aud) q = q.where('audiences.' + aud, '==', true);
      var snap = await q.get();
      return snap.docs.map(function (d) {
        return Object.assign({ id: d.id, topicId: t.id }, d.data());
      });
    }));
    var out = [];
    parts.forEach(function (p) { out = out.concat(p); });
    return out;
  }

  async function loadLessons(cid, publishedOnly, aud) {
    var topics = await loadTopics(cid);
    return loadLessonsForTopics(cid, topics, publishedOnly, aud);
  }

  /* ---------------------------------------------------------
     Short-lived in-memory cache (student/parent read paths only).
     Identical requests made close together (login badge count,
     Classroom, Homework, Exams) share ONE Firestore round trip.
     In-flight requests are de-duplicated; failures are not cached.
     Manager/tutor screens keep using the uncached loaders above.
  --------------------------------------------------------- */
  var MEMO_TTL = 60000;
  var _memo = {};
  function memo(key, fn, ttl) {
    var now = Date.now(), hit = _memo[key];
    if (hit && now - hit.t < (ttl || MEMO_TTL)) return hit.p;
    var entry = { t: now, p: Promise.resolve().then(fn) };
    _memo[key] = entry;
    entry.p.catch(function () { if (_memo[key] === entry) delete _memo[key]; });
    return entry.p;
  }
  function clearMemo(prefix) {
    Object.keys(_memo).forEach(function (k) { if (!prefix || k.indexOf(prefix) === 0) delete _memo[k]; });
  }
  function copyArr(a) { return Array.isArray(a) ? a.slice() : a; }
  function topicSig(topics) { return topics.map(function (t) { return t.id; }).join(','); }

  function findClassroomCached(subjectId, year, keyStage) {
    return memo('cls|' + subjectId + '|' + (year != null ? 'y' + Number(year) : 'k' + keyStage), function () {
      return findClassroom(subjectId, year, keyStage);
    });
  }
  function loadTopicsCached(cid) {
    return memo('top|' + cid, function () { return loadTopics(cid); }).then(copyArr);
  }
  function loadLessonsCached(cid, topics, aud) {
    return memo('les|' + cid + '|' + (aud || '') + '|' + topicSig(topics), function () {
      return loadLessonsForTopics(cid, topics, true, aud);
    }).then(copyArr);
  }

  // Same spinner look as the rest of the portal, usable inside any cr-root.
  function loaderHtml(msg) {
    if (!document.getElementById('cr-spin-keyframe')) {
      var k = document.createElement('style');
      k.id = 'cr-spin-keyframe';
      k.textContent = '@keyframes cr-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(k);
    }
    return '<div class="cr-loader" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:3rem 1rem;">' +
      '<div style="width:42px;height:42px;border:4px solid rgba(38,51,49,.1);border-top-color:#55BFB3;border-radius:50%;animation:cr-spin .8s linear infinite"></div>' +
      '<div style="color:#245F5A;font-weight:700;font-size:.9rem">' + esc(msg || 'Loading\u2026') + '</div></div>';
  }

  function orderedLessons(topics, lessons) {
    var out = [];
    var known = {};
    topics.forEach(function (t) {
      known[t.id] = true;
      lessons.filter(function (l) { return l.topicId === t.id; }).sort(byOrder).forEach(function (l) { out.push(l); });
    });
    lessons.filter(function (l) { return !known[l.topicId]; }).sort(byOrder).forEach(function (l) { out.push(l); });
    return out;
  }

  async function moveInList(items, id, dir, collRef) {
    var list = items.slice().sort(byOrder);
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    var batch = db.batch(), changed = 0;
    list.forEach(function (x, idx) {
      if (x.order !== idx + 1) { batch.update(collRef.doc(x.id), { order: idx + 1 }); changed++; }
    });
    if (changed) await batch.commit();
  }

  function validateFile(file) {
    if (!file) return 'No file selected.';
    if (file.size > MAX_FILE_BYTES) return '“' + file.name + '” is larger than 100 MB.';
    if (!EXT_TYPES[ext(file.name)]) return '“' + file.name + '” is not a supported type (PDF, Word, PowerPoint, Excel, CSV/TXT, images, video, audio).';
    return null;
  }

  function uploadClassFile(file, subjectId, cid, lid, onProgress) {
    var bad = validateFile(file);
    if (bad) return Promise.reject(new Error(bad));
    if (!firebase.storage) return Promise.reject(new Error('File storage is not available on this page.'));
    var type = EXT_TYPES[ext(file.name)];
    var path = 'classroom-files/' + subjectId + '/' + cid + '/' + lid + '/' + Date.now() + '_' +
      file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var ref = firebase.storage().ref(path);
    var task = ref.put(file, { contentType: type });
    return new Promise(function (resolve, reject) {
      task.on('state_changed', function (s) {
        if (onProgress) onProgress(Math.round(s.bytesTransferred / s.totalBytes * 100));
      }, function (err) {
        reject(new Error(err.code === 'storage/unauthorized'
          ? 'You do not have permission to upload to this subject.'
          : 'Upload failed — please check your connection and try again.'));
      }, function () {
        ref.getDownloadURL().then(function (url) {
          resolve({ url: url, name: file.name, fileType: type, size: file.size, storagePath: path });
        }).catch(reject);
      });
    });
  }

  function deleteStored(path) {
    if (!path || !firebase.storage) return Promise.resolve();
    return firebase.storage().ref(path).delete().catch(function (e) {
      if (e && e.code === 'storage/object-not-found') return;
      console.warn('Could not delete stored file', path, e);
    });
  }

  function openModal(opts) {
    var ov = document.createElement('div');
    ov.className = 'cr-overlay cr-root';
    ov.innerHTML = '<div class="cr-modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="cr-modal-head"><h3>' + esc(opts.title) + '</h3>' +
      '<button type="button" class="cr-btn sm" data-x="close" aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
      '<div class="cr-modal-body"></div><div class="cr-modal-foot"></div></div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    var api = {
      el: ov,
      body: ov.querySelector('.cr-modal-body'),
      foot: ov.querySelector('.cr-modal-foot'),
      close: function (force) {
        if (!force && opts.beforeClose && opts.beforeClose() === false) return;
        document.body.style.overflow = '';
        ov.remove();
        if (opts.onClose) opts.onClose();
      }
    };
    ov.querySelector('[data-x="close"]').addEventListener('click', function () { api.close(); });
    return api;
  }

  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var m = openModal({ title: opts.title });
      m.body.innerHTML = '<p style="margin:0;font-size:.9rem;line-height:1.6;">' + opts.message + '</p>';
      m.foot.innerHTML = '<button type="button" class="cr-btn" data-a="no">Cancel</button>' +
        '<button type="button" class="cr-btn primary ' + (opts.danger ? 'danger' : '') + '" data-a="yes">' + esc(opts.confirmLabel || 'Confirm') + '</button>';
      m.foot.querySelector('[data-a="no"]').onclick = function () { m.close(true); resolve(false); };
      m.el.querySelector('[data-x="close"]').onclick = function () { m.close(true); resolve(false); };
      m.foot.querySelector('[data-a="yes"]').onclick = function () { m.close(true); resolve(true); };
    });
  }

  function createEditor(host, initialHtml, hooks) {
    host.innerHTML =
      '<div class="cr-tools" role="toolbar" aria-label="Formatting">' +
      btn('h2', 'H2', 'Heading') + btn('h3', 'H3', 'Subheading') + btn('p', '¶', 'Paragraph') +
      btn('bold', '<i class="fas fa-bold"></i>', 'Bold') + btn('italic', '<i class="fas fa-italic"></i>', 'Italic') +
      btn('underline', '<i class="fas fa-underline"></i>', 'Underline') +
      btn('ul', '<i class="fas fa-list-ul"></i>', 'Bullet list') + btn('ol', '<i class="fas fa-list-ol"></i>', 'Numbered list') +
      btn('quote', '<i class="fas fa-quote-left"></i>', 'Quote') + btn('callout', '<i class="fas fa-lightbulb"></i>', 'Callout') +
      btn('link', '<i class="fas fa-link"></i>', 'Link') + btn('table', '<i class="fas fa-table"></i>', 'Insert table') +
      btn('image', '<i class="fas fa-image"></i>', 'Insert image') + btn('clear', '<i class="fas fa-eraser"></i>', 'Clear formatting') +
      '</div><div class="cr-edit" contenteditable="true" data-placeholder="Write the lesson notes here…"></div>';
    var area = host.querySelector('.cr-edit');
    area.innerHTML = sanitizeHtml(initialHtml || '');
    function btn(cmd, label, title) {
      return '<button type="button" data-cmd="' + cmd + '" title="' + title + '" aria-label="' + title + '">' + label + '</button>';
    }
    function exec(c, v) { area.focus(); document.execCommand(c, false, v || null); area.dispatchEvent(new Event('input')); }
    host.querySelector('.cr-tools').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    host.querySelector('.cr-tools').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var cmd = b.dataset.cmd;
      if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') exec('formatBlock', cmd);
      else if (cmd === 'quote') exec('formatBlock', 'blockquote');
      else if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') exec(cmd);
      else if (cmd === 'ul') exec('insertUnorderedList');
      else if (cmd === 'ol') exec('insertOrderedList');
      else if (cmd === 'clear') { exec('removeFormat'); exec('formatBlock', 'p'); }
      else if (cmd === 'callout') {
        var sel = window.getSelection().toString();
        exec('insertHTML', '<div class="cr-callout">' + (esc(sel) || 'Key point') + '</div><p><br></p>');
      } else if (cmd === 'link') {
        var url = prompt('Link address (https://…)');
        if (url && safeUrl(url)) exec('createLink', safeUrl(url));
        else if (url) alert('Please enter a full web address starting with http:// or https://');
      } else if (cmd === 'table') {
        var cell = '<td><br></td>';
        exec('insertHTML', '<table><thead><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr></thead><tbody>' +
          '<tr>' + cell + cell + cell + '</tr><tr>' + cell + cell + cell + '</tr></tbody></table><p><br></p>');
      } else if (cmd === 'image') {
        if (hooks && hooks.pickImage) hooks.pickImage(function (url, alt) {
          exec('insertHTML', '<img src="' + esc(url) + '" alt="' + esc(alt || '') + '"><p><br></p>');
        });
      }
    });
    area.addEventListener('paste', function (e) {
      var cd = e.clipboardData; if (!cd) return;
      e.preventDefault();
      var html = cd.getData('text/html');
      if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
      else document.execCommand('insertText', false, cd.getData('text/plain'));
    });
    area.addEventListener('input', function () { if (hooks && hooks.onChange) hooks.onChange(); });
    return {
      getHtml: function () { return sanitizeHtml(area.innerHTML).trim(); },
      isEmpty: function () { return !area.textContent.trim() && !area.querySelector('img,table'); }
    };
  }

  function mountManager(root, opts) {
    injectStyle();
    var isAdmin = opts.role === 'admin';
    var scope = opts.scope || null;
    var isScoped = scope === 'remote' || scope === 'tuition';
    var scopeName = scope === 'tuition' ? 'Tuition' : 'Remote';
    var scopeWho = scope === 'tuition' ? 'CBC tuition students' : 'remote students';
    function stageList() { return scope === 'tuition' ? (typeof CBC_BANDS !== 'undefined' ? CBC_BANDS : []) : KEY_STAGES; }
    var scopeBanner = isScoped
      ? '<div class="cr-scope-banner"><i class="fas ' + (scope === 'tuition' ? 'fa-graduation-cap' : 'fa-house-laptop') + '"></i> <b>Classwork — ' + scopeName + ' ' + (scope === 'tuition' ? 'students' : 'students') + ' only.</b> Everything saved here is posted to ' + scopeWho + '. ' + (scope === 'tuition' ? 'Online and remote students' : 'Online students') + ' and tutors will not see it.</div>'
      : '';
    var tutorSubjects = lmzSubjectKeys(opts.subjects || []);
    var tutorKS = opts.keyStages || [];
    var user = { uid: opts.uid, name: opts.name || (isAdmin ? 'Studio Desk' : 'Tutor') };

    var S = { screen: 'list', tab: 'classrooms', classrooms: null, allLessons: null, cls: null, topics: [], lessons: [], collapsed: {},
      filters: { subject: '', ks: '', year: '' }, lf: { subject: '', year: '', tutor: '', status: '', q: '' } };

    root.classList.add('cr-root');

    async function renameSubject(cls, newName) {
      newName = String(newName || '').trim().slice(0, 120);
      if (!newName) throw new Error('Please enter a name.');
      var cRef = clsRef(cls.id);
      var now = firebase.firestore.FieldValue.serverTimestamp();
      await cRef.update({ subjectName: newName, updatedAt: now, updatedBy: user.uid });
      try {
        var topicsSnap = await cRef.collection('topics').get();
        var docs = [];
        for (var ti = 0; ti < topicsSnap.docs.length; ti++) {
          var lsSnap = await topicsSnap.docs[ti].ref.collection('lessons').get();
          lsSnap.docs.forEach(function (d) { docs.push(d); });
        }
        for (var i = 0; i < docs.length; i += 400) {
          var bt = db.batch();
          docs.slice(i, i + 400).forEach(function (d) {
            bt.update(d.ref, { subjectName: newName });
          });
          await bt.commit();
        }
      } catch (e) {
        console.warn('renameSubject: lesson name propagation failed:', e);
      }
      cls.subjectName = newName;
      if (S.cls && S.cls.id === cls.id) S.cls.subjectName = newName;
      S.allLessons = null;
    }

    function openRenameSubject() {
      if (!isAdmin) return;
      var heading = document.getElementById('crTitleHeading');
      if (!heading || heading.classList.contains('editing')) return;

      var current = displayName(S.cls);
      var yearSuffix = S.cls.year != null ? ' — Year ' + S.cls.year : '';

      heading.classList.add('editing');
      heading.setAttribute('contenteditable', 'true');
      heading.setAttribute('spellcheck', 'false');
      heading.innerHTML = '<span class="cr-name">' + esc(current) + '</span>' +
        '<span class="cr-year-suffix">' + esc(yearSuffix) + '</span>';

      var span = heading.querySelector('.cr-name');
      var range = document.createRange();
      range.selectNodeContents(span);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      heading.focus();

      var saved = false;

      async function commit() {
        if (saved) return;
        saved = true;
        var txt = (span.textContent || '').trim();
        heading.removeAttribute('contenteditable');
        heading.classList.remove('editing');
        try {
          await renameSubject(S.cls, txt);
        } catch (e) {
          alert('Could not rename: ' + (e && e.message ? e.message : e));
        }
        renderClassroom();
      }

      function cancel() {
        if (saved) return;
        saved = true;
        heading.removeAttribute('contenteditable');
        heading.classList.remove('editing');
        renderClassroom();
      }

      heading.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      heading.addEventListener('blur', function () { commit(); }, { once: true });
    }

    function allowedSubjectKeys() {
      return isAdmin ? LMZ_SUBJECTS.map(function (s) { return s.id; }) : tutorSubjects;
    }
    function allowedKeyStages() {
      return isAdmin || !tutorKS.length ? stageList() : tutorKS;
    }

    async function loadClassrooms() {
      root.innerHTML = '<div class="cr-empty">Loading classrooms…</div>';
      try {
        if (isAdmin) {
          // CBC classrooms live only in the Tuition panel; British ones never show there.
          S.classrooms = snapDocs(await db.collection('classrooms').get()).filter(function (c) {
            return scope === 'tuition' ? isCbcStage(c.keyStage) : !isCbcStage(c.keyStage);
          });
        } else {
          var parts = await Promise.all(tutorSubjects.map(function (k) {
            return db.collection('classrooms').where('subjectId', '==', k).get().then(snapDocs);
          }));
          S.classrooms = [].concat.apply([], parts).filter(function (c) {
            return !tutorKS.length || tutorKS.indexOf(c.keyStage) !== -1;
          });
        }
      } catch (e) {
        console.error('classrooms:', e);
        root.innerHTML = '<div class="cr-empty">Could not load classrooms: ' + esc(e.message || e) + '</div>';
        return;
      }
      renderList();
    }

    function renderList() {
      S.screen = 'list';
      var h = '';
      if (!isAdmin && !tutorSubjects.length) {
        root.innerHTML = '<div class="cr-panel"><div class="cr-empty">No subjects have been assigned to your account yet.</div></div>';
        return;
      }
      h += scopeBanner;
      h += '<div class="cr-bar"><div><h3>' + (isAdmin ? (isScoped ? 'Classwork (' + scopeName + ')' : 'Classroom Management') : 'My Classrooms') + '</h3>' +
        '<div class="cr-sub">' + (isAdmin
          ? (isScoped
              ? 'Build lessons and materials for ' + scopeWho + '. Every lesson you save is posted to ' + scopeName + ' only.'
              : 'Every subject and Year — prepare lessons and homework, then post them to the right audience from the Publish tab.')
          : 'The subjects you teach. Open one to view the material the Studio Desk has posted to you.') + '</div></div>' +
        (isAdmin ? '<button type="button" class="cr-btn primary" data-a="add-class"><i class="fas fa-plus"></i> Add classroom</button>' : '') + '</div>';
      if (isAdmin && !isScoped) {
        h += '<div class="cr-tabs"><button type="button" class="cr-btn ' + (S.tab === 'classrooms' ? 'on' : '') + '" data-a="tab" data-v="classrooms"><i class="fas fa-chalkboard"></i> Classrooms</button>' +
          '<button type="button" class="cr-btn ' + (S.tab === 'lessons' ? 'on' : '') + '" data-a="tab" data-v="lessons"><i class="fas fa-list"></i> All lessons</button>' +
          '<button type="button" class="cr-btn ' + (S.tab === 'publish' ? 'on' : '') + '" data-a="tab" data-v="publish"><i class="fas fa-paper-plane"></i> Publish</button></div>';
      }
      if (isAdmin && !isScoped && S.tab === 'lessons') { root.innerHTML = h + '<div id="crLessonsHost"></div>'; renderAllLessons(); return; }
      if (isAdmin && !isScoped && S.tab === 'publish') {
        root.innerHTML = h + '<div id="crPublishHost"></div>';
        if (global.PublishUI) global.PublishUI.mount(document.getElementById('crPublishHost'), { user: user, classrooms: S.classrooms });
        else document.getElementById('crPublishHost').innerHTML = '<div class="cr-empty">Publishing is unavailable on this page.</div>';
        return;
      }

      var list = (S.classrooms || []).filter(function (c) {
        var f = S.filters;
        return (!f.subject || c.subjectId === f.subject) && (!f.ks || c.keyStage === f.ks) && (!f.year || String(c.year) === f.year);
      });
      if (isAdmin) {
        h += '<div class="cr-filters">' +
          selectHtml('f-subject', 'All subjects', LMZ_SUBJECTS.map(function (s) { return [s.id, s.name]; }), S.filters.subject) +
          selectHtml('f-ks', 'All Key Stages', stageList().map(function (k) { return [k, ksShort(k)]; }), S.filters.ks) +
          selectHtml('f-year', 'All Years', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(function (y) { return [String(y), 'Year ' + y]; }), S.filters.year) + '</div>';
      }
      if (!list.length) {
        h += '<div class="cr-panel"><div class="cr-empty">' + ((S.classrooms || []).length
          ? 'No classrooms match these filters.'
          : (isAdmin ? 'No classrooms yet. Use “Add classroom” to start one for a subject and Year.' : 'No classroom exists yet for your subjects. The Studio Desk creates classrooms.')) + '</div></div>';
      } else {
        list.sort(function (a, b) { return displayName(a).localeCompare(displayName(b)) || (a.year || 0) - (b.year || 0); });
        h += '<div class="cr-grid">' + list.map(function (c) {
          return '<button type="button" class="cr-card" data-a="open" data-id="' + esc(c.id) + '"><div class="ic"><i class="fas fa-chalkboard"></i></div>' +
            '<h4>' + esc(displayName(c)) + '</h4><div class="meta">Year ' + esc(c.year) + ' · ' + esc(ksShort(c.keyStage)) + '</div></button>';
        }).join('') + '</div>';
      }
      root.innerHTML = h;
    }

    function selectHtml(id, allLabel, pairs, cur) {
      return '<select data-f="' + id + '" aria-label="' + esc(allLabel) + '"><option value="">' + esc(allLabel) + '</option>' +
        pairs.map(function (p) { return '<option value="' + esc(p[0]) + '"' + (String(cur) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>';
    }

    async function renderAllLessons() {
      var host = document.getElementById('crLessonsHost');
      if (!host) return;
      if (!S.allLessons) {
        host.innerHTML = '<div class="cr-empty">Loading lessons…</div>';
        try {
          var snap = await db.collectionGroup('lessons').limit(600).get();
          S.allLessons = snap.docs.map(function (d) {
            return Object.assign({ id: d.id, classroomId: d.ref.parent.parent.id }, d.data());
          });
        } catch (e) {
          host.innerHTML = '<div class="cr-empty">Could not load lessons: ' + esc(e.message || e) + '</div>'; return;
        }
      }
      var f = S.lf;
      var tutors = {};
      S.allLessons.forEach(function (l) { if (l.authorId) tutors[l.authorId] = l.authorName || l.authorId; });
      var rows = S.allLessons.filter(function (l) {
        return (!f.subject || l.subjectId === f.subject) && (!f.year || String(l.year) === f.year) &&
          (!f.tutor || l.authorId === f.tutor) && (!f.status || l.status === f.status) &&
          (!f.q || (String(l.title) + ' ' + String(l.topicTitle || '')).toLowerCase().indexOf(f.q.toLowerCase()) !== -1);
      }).sort(function (a, b) {
        return ((toDate(b.updatedAt) || 0) - (toDate(a.updatedAt) || 0));
      });
      var h = '<div class="cr-filters">' +
        selectHtml('l-subject', 'All subjects', LMZ_SUBJECTS.map(function (s) { return [s.id, s.name]; }), f.subject) +
        selectHtml('l-year', 'All Years', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(function (y) { return [String(y), 'Year ' + y]; }), f.year) +
        selectHtml('l-tutor', 'All tutors', Object.keys(tutors).map(function (k) { return [k, tutors[k]]; }), f.tutor) +
        selectHtml('l-status', 'All statuses', Object.keys(STATUS_LABEL).map(function (k) { return [k, STATUS_LABEL[k]]; }), f.status) +
        '<input type="search" data-f="l-q" placeholder="Search title or topic…" value="' + esc(f.q) + '" /></div>';
      if (!rows.length) {
        h += '<div class="cr-panel"><div class="cr-empty">No lessons match.</div></div>';
      } else {
        h += '<div class="cr-table-wrap"><table class="cr-table"><thead><tr><th>Lesson</th><th>Subject</th><th>Year</th><th>Author</th><th>Status</th><th>Posted to</th><th></th></tr></thead><tbody>' +
          rows.map(function (l) {
            return '<tr><td><strong>' + esc(l.title) + '</strong><div class="cr-note">' + esc(l.topicTitle || '') + '</div></td>' +
              '<td>' + esc(l.subjectName || lmzSubjectLabel(l.subjectId)) + '</td><td>Year ' + esc(l.year) + '</td>' +
              '<td>' + esc(l.authorName || '—') + '</td><td>' + statusBadge(l) + '</td><td>' + audBadges(l) + '</td>' +
              '<td><div class="cr-actions"><button type="button" class="cr-btn sm" data-a="edit-any" data-c="' + esc(l.classroomId) + '" data-id="' + esc(l.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
              '<button type="button" class="cr-btn sm danger" data-a="del-any" data-c="' + esc(l.classroomId) + '" data-id="' + esc(l.id) + '"><i class="fas fa-trash"></i></button></div></td></tr>';
          }).join('') + '</tbody></table></div>' +
          (S.allLessons.length >= 600 ? '<div class="cr-note" style="margin-top:.5rem;">Showing the first 600 lessons — use the Classrooms tab to browse the rest.</div>' : '');
      }
      host.innerHTML = h;
    }

    function statusBadge(l) {
      var extra = l.status === 'scheduled' && l.publishAt ? ' · ' + esc(fmtDateTime(l.publishAt)) : '';
      return '<span class="cr-badge ' + esc(l.status) + '">' + esc(STATUS_LABEL[l.status] || l.status) + extra + '</span>';
    }

    async function openClassroom(cid) {
      root.innerHTML = '<div class="cr-empty">Loading classroom…</div>';
      try {
        var doc = await clsRef(cid).get();
        if (!doc.exists) throw new Error('Classroom not found.');
        S.cls = Object.assign({ id: doc.id }, doc.data());
        var audForLoad = isAdmin ? null : 'tutors';
        var topicsOpen = await loadTopics(cid);
        S.topics = topicsOpen; S.lessons = await loadLessonsForTopics(cid, topicsOpen, false, audForLoad); // topics fetched once, not twice
      } catch (e) {
        console.error('openClassroom:', e);
        root.innerHTML = '<div class="cr-empty">Could not open this classroom: ' + esc(e.message || e) + '</div>';
        return;
      }
      renderClassroom();
    }

    async function refreshClassroom() {
      var audForLoad = isAdmin ? null : 'tutors';
      var topicsRef2 = await loadTopics(S.cls.id);
      S.topics = topicsRef2; S.lessons = await loadLessonsForTopics(S.cls.id, topicsRef2, false, audForLoad);
      S.allLessons = null;
      renderClassroom();
    }

    function renderClassroom() {
      S.screen = 'classroom';
      var c = S.cls;
      var name = displayName(c);
      var yearTxt = (c.year != null) ? ' — Year ' + c.year : '';
      var headingAttr = isAdmin
        ? ' class="cr-title-edit" data-a="rename-subject" role="button" tabindex="0" title="Click to rename this classroom"'
        : ' class="cr-title-edit" style="cursor:default"';
      var pen = isAdmin ? '<i class="fas fa-pen cr-pen" aria-hidden="true"></i>' : '';
      var addTopicBtn = isAdmin
        ? '<div class="cr-actions">' +
          (isScoped
            ? ''
            : '<button type="button" class="cr-btn" data-a="publish-class"><i class="fas fa-paper-plane"></i> Publish…</button>') +
          '<button type="button" class="cr-btn primary" data-a="add-topic"><i class="fas fa-plus"></i> Add Topic</button></div>'
        : '';
      var tutorHint = isAdmin
        ? (isScoped
            ? 'Everything you add here is posted to ' + scopeWho + ' only. ' + (scope === 'tuition' ? 'Online and remote students' : 'Online students') + ' and tutors never see it.'
            : 'Topics and lessons appear to students in this order. Scheduled lessons are released automatically within a minute of their time.')
        : 'Material posted to you by the Studio Desk. Open a lesson to release it to your students.';
      var h = scopeBanner +
        '<div class="cr-crumb"><a data-a="back">' + (isAdmin ? (isScoped ? 'Classwork (' + scopeName + ')' : 'Classroom Management') : 'My Classrooms') + '</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' +
        esc(name) + esc(yearTxt) + '</span></div>' +
        '<div class="cr-bar"><div>' +
        '<h3 id="crTitleHeading"' + headingAttr + '>' +
        '<span class="cr-name">' + esc(name) + '</span>' +
        (yearTxt ? '<span class="cr-year-suffix">' + esc(yearTxt) + '</span>' : '') +
        pen +
        '</h3>' +
        '<div class="cr-sub">' + esc(ksShort(c.keyStage)) + ' · ' + esc(tutorHint) + '</div></div>' +
        addTopicBtn + '</div>';

      var ordered = orderedLessons(S.topics, S.lessons);
      var numOf = {}; ordered.forEach(function (l, i) { numOf[l.id] = i + 1; });

      if (!S.topics.length) {
        h += '<div class="cr-panel"><div class="cr-empty">' + (isAdmin
          ? 'No topics yet. Add a topic (for example “Algebra”), then add lessons inside it.'
          : 'No topics have been added to this classroom yet. The Studio Desk manages topics and lessons — check back soon.') + '</div></div>';
      }
      S.topics.forEach(function (t, ti) {
        var ls = S.lessons.filter(function (l) { return l.topicId === t.id; }).sort(byOrder);
        var open = !S.collapsed[t.id];
        var topicActions = isAdmin
          ? '<button type="button" class="cr-btn sm primary" data-a="add-lesson" data-id="' + esc(t.id) + '"><i class="fas fa-plus"></i> Add Lesson</button>' +
            '<button type="button" class="cr-btn sm" title="Move topic up" data-a="topic-up" data-id="' + esc(t.id) + '"' + (ti === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
            '<button type="button" class="cr-btn sm" title="Move topic down" data-a="topic-down" data-id="' + esc(t.id) + '"' + (ti === S.topics.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
            '<button type="button" class="cr-btn sm" data-a="edit-topic" data-id="' + esc(t.id) + '"><i class="fas fa-pen"></i></button>' +
            '<button type="button" class="cr-btn sm danger" data-a="del-topic" data-id="' + esc(t.id) + '"><i class="fas fa-trash"></i></button>'
          : '';
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t" data-a="toggle" data-id="' + esc(t.id) + '"><i class="fas fa-chevron-' + (open ? 'down' : 'right') + '" style="font-size:.7rem;margin-right:.4rem"></i>' +
          esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</span>' +
          (topicActions ? '<div class="cr-actions">' + topicActions + '</div>' : '') + '</div>';
        if (open) {
          if (!ls.length) h += '<div class="cr-empty">' + (isAdmin ? 'No lessons have been added to this topic yet.' : 'No lessons in this topic yet.') + '</div>';
          ls.forEach(function (l, li) {
            var lessonActions = isAdmin
              ? '<div class="cr-actions"><button type="button" class="cr-btn sm" title="Move up" data-a="lesson-up" data-id="' + esc(l.id) + '"' + (li === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" class="cr-btn sm" title="Move down" data-a="lesson-down" data-id="' + esc(l.id) + '"' + (li === ls.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                '<button type="button" class="cr-btn sm" data-a="edit-lesson" data-id="' + esc(l.id) + '"><i class="fas fa-pen"></i> Edit</button>' +
                '<button type="button" class="cr-btn sm" data-a="archive" data-id="' + esc(l.id) + '">' + (l.status === 'archived' ? '<i class="fas fa-box-open"></i> Restore' : '<i class="fas fa-box-archive"></i> Archive') + '</button>' +
                '<button type="button" class="cr-btn sm danger" data-a="del-lesson" data-id="' + esc(l.id) + '"><i class="fas fa-trash"></i></button></div>'
              : '<div class="cr-actions"><button type="button" class="cr-btn sm primary" data-a="release" data-id="' + esc(l.id) + '"><i class="fas fa-share-from-square"></i> Release to my students</button></div>';
            h += '<div class="cr-lesson" ' + (!isAdmin ? 'data-a="open-lesson" data-id="' + esc(l.id) + '" style="cursor:pointer"' : '') + '>' +
              '<span class="n">' + pad2(numOf[l.id]) + '</span>' +
              '<span class="tt">' + esc(l.title) + '<small>' + esc(l.authorName || '') + (l.attachments && l.attachments.length ? ' · ' + l.attachments.length + ' resource' + (l.attachments.length === 1 ? '' : 's') : '') + '</small></span>' +
              statusBadge(l) + audBadges(l) +
              lessonActions + '</div>';
          });
        }
        h += '</div>';
      });
      var orphan = S.lessons.filter(function (l) { return !S.topics.some(function (t) { return t.id === l.topicId; }); });
      if (orphan.length) {
        var orphanActions = isAdmin
          ? '<div class="cr-actions"><button type="button" class="cr-btn sm" data-a="edit-lesson" data-id="' + esc(orphan[0].id) + '"><i class="fas fa-pen"></i> Edit</button>' +
            '<button type="button" class="cr-btn sm danger" data-a="del-lesson" data-id="' + esc(orphan[0].id) + '"><i class="fas fa-trash"></i></button></div>'
          : '';
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">Unassigned lessons<small>' +
          (isAdmin ? 'Their topic was removed — open each and choose a topic.' : 'Lessons not attached to any topic.') + '</small></span></div>' +
          orphan.map(function (l) {
            return '<div class="cr-lesson"><span class="tt">' + esc(l.title) + '</span>' + statusBadge(l) + orphanActions + '</div>';
          }).join('') + '</div>';
      }
      root.innerHTML = h;
    }

    function openAddClassroom() {
      var m = openModal({ title: 'Add classroom' });
      var allowedKS = allowedKeyStages();
      m.body.innerHTML = '<div class="cr-field"><label>Key Stage</label><select id="crNewKs">' +
        allowedKS.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="cr-row2"><div class="cr-field"><label>Year</label><select id="crNewYear"></select></div>' +
        '<div class="cr-field"><label>Subject</label><select id="crNewSubject"></select></div></div>' +
        '<div class="cr-note">A classroom is one subject for one Year. If it already exists you will simply be taken to it.</div>';
      m.foot.innerHTML = '<span class="cr-err" id="crNewErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="create">Open classroom</button>';
      var ksSel = m.body.querySelector('#crNewKs'), yearSel = m.body.querySelector('#crNewYear'), subSel = m.body.querySelector('#crNewSubject');
      function fill() {
        yearSel.innerHTML = lmzYearsForKeyStage(ksSel.value).map(function (y) { return '<option value="' + y + '">' + (isCbcStage(ksSel.value) ? 'Grade ' : 'Year ') + y + '</option>'; }).join('');
        var inKs = lmzSubjectsForKeyStage(ksSel.value).map(function (s) { return s.id; });
        var keys = allowedSubjectKeys().filter(function (k) { return !lmzIsCatalogueSubject(k) || inKs.indexOf(k) !== -1; });
        subSel.innerHTML = keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(lmzSubjectLabel(k)) + '</option>'; }).join('');
      }
      ksSel.addEventListener('change', fill); fill();
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="create"]').onclick = async function () {
        var b = this; b.disabled = true;
        try {
          var c = await ensureClassroom(subSel.value, ksSel.value, yearSel.value, user);
          m.close(true);
          S.classrooms = null;
          await openClassroom(c.id);
        } catch (e) {
          m.foot.querySelector('#crNewErr').textContent = 'Could not create: ' + (e.message || e);
          b.disabled = false;
        }
      };
    }

    function openTopicModal(topic) {
      var m = openModal({ title: topic ? 'Edit topic' : 'Add topic' });
      m.body.innerHTML = '<div class="cr-field"><label>Topic title</label><input type="text" id="crTopTitle" maxlength="200" placeholder="e.g. Algebra" value="' + esc(topic ? topic.title : '') + '"></div>' +
        '<div class="cr-field"><label>Description (optional)</label><textarea id="crTopDesc" rows="3" maxlength="500">' + esc(topic ? topic.description : '') + '</textarea></div>';
      m.foot.innerHTML = '<span class="cr-err" id="crTopErr"></span><button type="button" class="cr-btn" data-a="cancel">Cancel</button><button type="button" class="cr-btn primary" data-a="save">Save topic</button>';
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      m.foot.querySelector('[data-a="save"]').onclick = async function () {
        var title = m.body.querySelector('#crTopTitle').value.trim();
        var desc = m.body.querySelector('#crTopDesc').value.trim();
        if (!title) { m.foot.querySelector('#crTopErr').textContent = 'Please enter a topic title.'; return; }
        var b = this; b.disabled = true;
        try {
          var coll = clsRef(S.cls.id).collection('topics');
          var now = firebase.firestore.FieldValue.serverTimestamp();
          if (topic) {
            await coll.doc(topic.id).update({ title: title, description: desc, updatedAt: now });
            if (topic.title !== title) {
              var ls = S.lessons.filter(function (l) { return l.topicId === topic.id; });
              if (ls.length) { var bt = db.batch(); ls.forEach(function (l) { bt.update(lessonRef(S.cls.id, topic.id, l.id), { topicTitle: title }); }); await bt.commit(); }
            }
          } else {
            var max = S.topics.reduce(function (a, t) { return Math.max(a, t.order || 0); }, 0);
            await coll.add({ title: title, description: desc, order: max + 1, createdBy: user.uid, createdAt: now, updatedAt: now });
          }
          m.close(true); await refreshClassroom();
        } catch (e) { m.foot.querySelector('#crTopErr').textContent = 'Could not save: ' + (e.message || e); b.disabled = false; }
      };
    }

    async function openLessonEditor(cls, topics, lesson, presetTopicId, afterSave) {
      var isNew = !lesson;
      var presetTopic = presetTopicId || (lesson && lesson.topicId) || (topics[0] && topics[0].id);
      var lid = lesson ? lesson.id : (presetTopic ? lessonsRef(cls.id, presetTopic).doc().id : clsRef(cls.id).collection('topics').doc().collection('lessons').doc().id);
      var atts = (lesson && lesson.attachments ? lesson.attachments : []).map(function (a) { return Object.assign({}, a); });
      var uploadedNow = [];
      var removedExisting = [];
      var dirty = false, busy = 0, editor;

      var readOnly = !isAdmin;

      var m = openModal({
        title: readOnly
          ? (lesson ? 'Lesson — ' + (lesson.title || '') : 'Lesson')
          : (isNew ? 'Add lesson — ' + displayName(cls) + ' Year ' + cls.year : 'Edit lesson'),
        wide: true,
        beforeClose: function () {
          if (busy) { alert('An upload is still in progress — please wait for it to finish.'); return false; }
          if (dirty && !confirm('You have unsaved changes. Close without saving?')) return false;
          uploadedNow.forEach(function (a) { deleteStored(a.storagePath); });
          return true;
        },
        onClose: function () { window.removeEventListener('beforeunload', warn); }
      });
      function warn(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
      window.addEventListener('beforeunload', warn);
      function markDirty() { dirty = true; }

      var pub = lesson && lesson.publishAt ? toDate(lesson.publishAt) : null;
      var defDate = pub ? pub.getFullYear() + '-' + pad2(pub.getMonth() + 1) + '-' + pad2(pub.getDate()) : '';
      var defTime = pub ? pad2(pub.getHours()) + ':' + pad2(pub.getMinutes()) : '08:00';
      var topicId0 = lesson ? lesson.topicId : (presetTopicId || (topics[0] && topics[0].id) || '');

      if (readOnly) {
        var topic0 = topics.filter(function (t) { return t.id === topicId0; })[0];
        m.body.innerHTML =
          '<div class="cr-note" style="margin-bottom:.7rem;"><strong>Topic:</strong> ' + esc(topic0 ? topic0.title : '—') + '</div>' +
          '<div class="cr-note" style="margin-bottom:.7rem;"><strong>Status:</strong> ' + statusBadge(lesson || {}) + '</div>' +
          '<div class="cr-field"><label>Lesson notes</label><div class="cr-prose" id="crReadNotes">' +
            (lesson && lesson.content ? sanitizeHtml(lesson.content) : '<em style="color:var(--muted);">No notes.</em>') +
          '</div></div>' +
          ((lesson && lesson.attachments && lesson.attachments.length) ? (
            '<div class="cr-field"><label>Resources</label>' +
            lesson.attachments.map(function (a) {
              var url = safeUrl(a.url);
              return '<div class="cr-res"><i class="fas ' + fileIcon(a) + '"></i><span class="nm">' + esc(a.name) + '</span>' +
                (url ? '<a class="cr-btn sm primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Open</a>' : '') +
                '</div>';
            }).join('') + '</div>'
          ) : '');
        m.foot.innerHTML = '<span class="cr-err" id="crLErr"></span>' +
          '<button type="button" class="cr-btn" data-a="cancel">Close</button>' +
          (lesson ? '<button type="button" class="cr-btn primary" data-a="release"><i class="fas fa-share-from-square"></i> Release to my students</button>' : '');
        m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(true); };

        var relBtn = m.foot.querySelector('[data-a="release"]');
        if (relBtn) relBtn.onclick = function() {
          if (window.WorkUI && window.WorkUI.openRelease) {
            var item = Object.assign({}, lesson, { cid: cls.id, tid: lesson.topicId });
            window.WorkUI.openRelease(item, user);
          } else {
            alert('Publishing mechanism not loaded.');
          }
        };
        return;
      }

      m.body.innerHTML =
        '<div class="cr-row2"><div class="cr-field"><label>Lesson title</label><input type="text" id="crLTitle" maxlength="200" placeholder="e.g. Linear Equations" value="' + esc(lesson ? lesson.title : '') + '"></div>' +
        '<div class="cr-field"><label>Topic</label><select id="crLTopic">' + topics.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === topicId0 ? ' selected' : '') + '>' + esc(t.title) + '</option>';
        }).join('') + '</select></div></div>' +
        '<div class="cr-field"><label>Lesson notes</label><div id="crEditorHost"></div>' +
        '<div class="cr-note" style="margin-top:.35rem;">Write the lesson directly — students read it in their portal. Files are optional.</div></div>' +
        '<div class="cr-field"><label>Resources</label><div id="crAtts"></div>' +
        '<div class="cr-actions" style="margin-top:.4rem;"><button type="button" class="cr-btn sm" data-a="add-file"><i class="fas fa-upload"></i> Upload file</button>' +
        '<button type="button" class="cr-btn sm" data-a="add-link"><i class="fas fa-link"></i> Add link</button></div>' +
        '<input type="file" id="crFileIn" multiple style="display:none" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg">' +
        '<input type="file" id="crImgIn" style="display:none" accept="image/jpeg,image/png,image/gif,image/webp">' +
        '<div class="cr-note" style="margin-top:.35rem;">PDF, Word, PowerPoint, Excel, images, video and audio up to 100 MB each.</div></div>' +
        '<div class="cr-field"><label>Release</label><div class="cr-actions"><span class="cr-note">Schedule for</span>' +
        '<input type="date" id="crSchDate" value="' + defDate + '"><input type="time" id="crSchTime" value="' + defTime + '"></div>' +
        (lesson ? '<div class="cr-note" style="margin-top:.35rem;">Current status: ' + statusBadge(lesson) + '</div>' : '') + '</div>';

      var audienceButton = isScoped
        ? ''
        : '<button type="button" class="cr-btn" data-a="set-audience"><i class="fas fa-users-viewfinder"></i> Set Audience</button>';

      m.foot.innerHTML = '<span class="cr-err" id="crLErr"></span>' +
        '<button type="button" class="cr-btn" data-a="cancel">Cancel</button>' +
        audienceButton +
        '<button type="button" class="cr-btn" data-s="draft"><i class="fas fa-floppy-disk"></i> Save Draft</button>' +
        '<button type="button" class="cr-btn" data-s="scheduled"><i class="fas fa-clock"></i> Schedule</button>' +
        (global.WorkUI ? '<button type="button" class="cr-btn" data-a="post-assignment"><i class="fas fa-clipboard-check"></i> Prepare Assignment</button>' : '') +
        '<button type="button" class="cr-btn primary" data-s="published" title="Marks the lesson ready."><i class="fas fa-circle-check"></i> Mark Ready</button>';

      var pendingAudiences = isScoped
        ? { online: false, remote: scope === 'remote', tuition: scope === 'tuition', tutors: scope === 'tuition' }
        : ((lesson && lesson.audiences && typeof lesson.audiences === 'object')
            ? { online: !!lesson.audiences.online, remote: !!lesson.audiences.remote, tuition: !!lesson.audiences.tuition, tutors: !!lesson.audiences.tutors }
            : { online: false, remote: false, tuition: false, tutors: false });

      var errEl = m.foot.querySelector('#crLErr');
      var attsEl = m.body.querySelector('#crAtts');

      var audBtn = m.foot.querySelector('[data-a="set-audience"]');
      if (audBtn) audBtn.onclick = function () {
        var am = openModal({ title: 'Set audience — where this lesson is posted' });
        am.body.innerHTML =
          '<div class="cr-note" style="margin-bottom:.8rem;">Choose who receives this lesson. You can tick any combination, or tick All.</div>' +
          '<div class="cr-field"><label style="display:flex; align-items:center; gap:.5rem; text-transform:none; letter-spacing:0; font-weight:700; font-size:.9rem; cursor:pointer;">' +
            '<input type="checkbox" id="audAll"' + (pendingAudiences.online && pendingAudiences.remote && pendingAudiences.tutors ? ' checked' : '') + '> All — Online, Remote and Tutors</label></div>' +
          '<hr style="border:none; border-top:1px solid var(--line); margin:.6rem 0;">' +
          '<div class="cr-field"><label style="display:flex; align-items:center; gap:.5rem; text-transform:none; letter-spacing:0; font-weight:700; font-size:.9rem; cursor:pointer;">' +
            '<input type="checkbox" id="audOnline"' + (pendingAudiences.online ? ' checked' : '') + '> Online students</label></div>' +
          '<div class="cr-field"><label style="display:flex; align-items:center; gap:.5rem; text-transform:none; letter-spacing:0; font-weight:700; font-size:.9rem; cursor:pointer;">' +
            '<input type="checkbox" id="audRemote"' + (pendingAudiences.remote ? ' checked' : '') + '> Remote students</label></div>' +
          '<div class="cr-field"><label style="display:flex; align-items:center; gap:.5rem; text-transform:none; letter-spacing:0; font-weight:700; font-size:.9rem; cursor:pointer;">' +
            '<input type="checkbox" id="audTutors"' + (pendingAudiences.tutors ? ' checked' : '') + '> Tutors</label></div>';
        am.foot.innerHTML =
          '<button type="button" class="cr-btn" data-a="cancel">Cancel</button>' +
          '<button type="button" class="cr-btn primary" data-a="ok"><i class="fas fa-check"></i> Set audience</button>';

        var allBox    = am.body.querySelector('#audAll');
        var onlineBox = am.body.querySelector('#audOnline');
        var remoteBox = am.body.querySelector('#audRemote');
        var tutorsBox = am.body.querySelector('#audTutors');

        function syncFromAll() {
          var v = allBox.checked;
          onlineBox.checked = v;
          remoteBox.checked = v;
          tutorsBox.checked = v;
        }
        function syncToAll() {
          allBox.checked = onlineBox.checked && remoteBox.checked && tutorsBox.checked;
        }
        allBox.addEventListener('change', syncFromAll);
        [onlineBox, remoteBox, tutorsBox].forEach(function (b) { b.addEventListener('change', syncToAll); });

        am.foot.querySelector('[data-a="cancel"]').onclick = function () { am.close(true); };
        am.foot.querySelector('[data-a="ok"]').onclick = function () {
          pendingAudiences = {
            online: !!onlineBox.checked,
            remote: !!remoteBox.checked,
            tuition: !!pendingAudiences.tuition,
            tutors: !!tutorsBox.checked
          };
          markDirty();
          am.close(true);
        };
      };

      function renderAtts() {
        attsEl.innerHTML = atts.length ? atts.map(function (a, i) {
          return '<div class="cr-res"><i class="fas ' + fileIcon(a) + '"></i><span class="nm">' + esc(a.name) + '<small>' +
            (a.kind === 'link' ? esc(a.url) : esc(fmtSize(a.size))) + '</small></span>' +
            '<button type="button" class="cr-btn sm danger" data-rm="' + i + '"><i class="fas fa-xmark"></i> Remove</button></div>';
        }).join('') : '<div class="cr-note">No resources attached.</div>';
      }
      renderAtts();
      attsEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-rm]'); if (!b) return;
        var a = atts.splice(Number(b.dataset.rm), 1)[0];
        if (a && a.storagePath) {
          var k = uploadedNow.indexOf(a);
          if (k !== -1) { uploadedNow.splice(k, 1); deleteStored(a.storagePath); } else removedExisting.push(a);
        }
        markDirty(); renderAtts();
      });

      function uploadWithBar(file, onDone) {
        var bar = document.createElement('div');
        bar.className = 'cr-res';
        bar.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="nm">' + esc(file.name) + '</span><div class="cr-prog"><div></div></div>';
        attsEl.appendChild(bar);
        busy++;
        uploadClassFile(file, cls.subjectId, cls.id, lid, function (p) { bar.querySelector('.cr-prog>div').style.width = p + '%'; })
          .then(function (meta) { onDone(meta); })
          .catch(function (e) { errEl.textContent = e.message || String(e); })
          .then(function () { busy--; bar.remove(); renderAtts(); });
      }
      var fileIn = m.body.querySelector('#crFileIn'), imgIn = m.body.querySelector('#crImgIn');
      m.body.querySelector('[data-a="add-file"]').onclick = function () { fileIn.click(); };
      fileIn.onchange = function () {
        errEl.textContent = '';
        Array.prototype.forEach.call(fileIn.files, function (f) {
          var bad = validateFile(f); if (bad) { errEl.textContent = bad; return; }
          uploadWithBar(f, function (meta) {
            var a = Object.assign({ id: 'a' + Date.now() + Math.random().toString(36).slice(2, 6), kind: 'file', uploadedBy: user.uid, uploadedAt: new Date().toISOString() }, meta);
            atts.push(a); uploadedNow.push(a); markDirty();
          });
        });
        fileIn.value = '';
      };
      m.body.querySelector('[data-a="add-link"]').onclick = function () {
        var url = prompt('Link address (https://…) — website, YouTube, Google Drive, etc.');
        if (!url) return;
        if (!safeUrl(url)) { errEl.textContent = 'Please enter a full web address starting with http:// or https://'; return; }
        var name = prompt('Link title (shown to students)', 'Additional resource') || 'Link';
        atts.push({ id: 'a' + Date.now(), kind: 'link', name: name.trim().slice(0, 120) || 'Link', url: safeUrl(url), uploadedBy: user.uid, uploadedAt: new Date().toISOString() });
        markDirty(); renderAtts();
      };

      var pendingImageCb = null;
      imgIn.onchange = function () {
        var f = imgIn.files[0]; imgIn.value = '';
        if (!f || !pendingImageCb) return;
        if (!/^image\//.test(EXT_TYPES[ext(f.name)] || '')) { errEl.textContent = 'Please choose a JPG, PNG, GIF or WebP image.'; return; }
        var cb = pendingImageCb; pendingImageCb = null;
        errEl.textContent = '';
        var stub = document.createElement('div'); stub.className = 'cr-note'; stub.textContent = 'Uploading image…';
        errEl.parentNode.insertBefore(stub, errEl);
        busy++;
        uploadClassFile(f, cls.subjectId, cls.id, lid)
          .then(function (meta) {
            uploadedNow.push({ storagePath: meta.storagePath, name: f.name, inlineImage: true });
            cb(meta.url, f.name.replace(/\.[^.]+$/, ''));
          })
          .catch(function (e) { errEl.textContent = e.message || String(e); })
          .then(function () { busy--; stub.remove(); });
      };
      editor = createEditor(m.body.querySelector('#crEditorHost'), lesson ? lesson.content : '', {
        onChange: markDirty,
        pickImage: function (cb) { pendingImageCb = cb; imgIn.click(); }
      });
      ['crLTitle', 'crLTopic', 'crSchDate', 'crSchTime'].forEach(function (id) {
        m.body.querySelector('#' + id).addEventListener('input', markDirty);
      });
      m.foot.querySelector('[data-a="cancel"]').onclick = function () { m.close(); };
      var postBtn = m.foot.querySelector('[data-a="post-assignment"]');
      if (postBtn) postBtn.onclick = function () {
        var tid = m.body.querySelector('#crLTopic').value;
        if (!tid) { errEl.textContent = 'Choose a topic first (the assignment is posted inside it).'; return; }
        errEl.textContent = '';
        global.WorkUI.openPostAssignment({ cls: cls, topics: topics, topicId: tid, user: user, lessonTitle: m.body.querySelector('#crLTitle').value.trim(), scope: scope });
      };

      async function save(status, btn) {
        errEl.textContent = '';
        if (busy) { errEl.textContent = 'Please wait for uploads to finish.'; return; }
        var title = m.body.querySelector('#crLTitle').value.trim();
        var topicId = m.body.querySelector('#crLTopic').value;
        if (!title) { errEl.textContent = 'Please enter a lesson title.'; return; }
        if (!topicId) { errEl.textContent = 'Please choose a topic (add one first if there are none).'; return; }
        var topic = topics.filter(function (t) { return t.id === topicId; })[0];
        var content = editor.getHtml();
        if (editor.isEmpty() && !atts.length && status !== 'draft') {
          errEl.textContent = 'Add some notes or at least one resource before publishing or scheduling.'; return;
        }
        var publishAt = null;
        if (status === 'scheduled') {
          var d = m.body.querySelector('#crSchDate').value, t = m.body.querySelector('#crSchTime').value;
          if (!d || !t) { errEl.textContent = 'Choose the release date and time to schedule this lesson.'; return; }
          var when = new Date(d + 'T' + t);
          if (isNaN(when.getTime()) || when.getTime() <= Date.now()) { errEl.textContent = 'The release time must be in the future.'; return; }
          publishAt = firebase.firestore.Timestamp.fromDate(when);
        }
        var siblings = [];
        try {
          var sn = await lessonsRef(cls.id, topicId).get();
          siblings = snapDocs(sn);
        } catch (e) { siblings = []; }
        var FV = firebase.firestore.FieldValue;
        var data = {
          title: title, topicId: topicId, topicTitle: topic ? topic.title : '',
          content: content,
          attachments: atts.map(function (a) { return Object.assign({}, a); }),
          status: status, publishAt: publishAt,
          audiences: pendingAudiences,
          subjectId: cls.subjectId, subjectName: displayName(cls), keyStage: cls.keyStage, year: cls.year,
          updatedAt: FV.serverTimestamp(), updatedBy: user.uid
        };
        if (status === 'published' && !(lesson && lesson.publishedAt)) data.publishedAt = FV.serverTimestamp();
        if (isNew || (lesson && lesson.topicId !== topicId)) {
          data.order = siblings.reduce(function (a, l) { return Math.max(a, l.order || 0); }, 0) + 1;
        }
        if (isNew) {
          data.authorId = user.uid; data.authorName = user.name; data.createdAt = FV.serverTimestamp();
        }
        btn.disabled = true;
        try {
          var writeRef = lessonRef(cls.id, topicId, lid);
          await writeRef.set(data, { merge: true });
          removedExisting.forEach(function (a) { deleteStored(a.storagePath); });
          dirty = false; uploadedNow.length = 0;
          m.close(true);
          if (afterSave) await afterSave();
        } catch (e) {
          console.error('save lesson:', e);
          errEl.textContent = 'Could not save: ' + (e.code === 'permission-denied' ? 'you do not have permission to manage this subject.' : (e.message || e));
          btn.disabled = false;
        }
      }
      Array.prototype.forEach.call(m.foot.querySelectorAll('[data-s]'), function (b) {
        b.onclick = function () { save(b.dataset.s, b); };
      });
    }

    async function editLesson(lessonId, cid) {
      var cls, topics, lesson;
      if (cid && (!S.cls || S.cls.id !== cid)) {
        var doc = await clsRef(cid).get();
        cls = Object.assign({ id: doc.id }, doc.data());
        topics = await loadTopics(cid);
        var ld = null;
        for (var ti = 0; ti < topics.length; ti++) {
          var d = await lessonRef(cid, topics[ti].id, lessonId).get();
          if (d.exists) { ld = d; break; }
        }
        if (!ld || !ld.exists) throw new Error('Lesson not found.');
        lesson = Object.assign({ id: ld.id }, ld.data());
        return openLessonEditor(cls, topics, lesson, null, async function () { S.allLessons = null; if (S.screen === 'list') renderList(); });
      }
      lesson = S.lessons.filter(function (l) { return l.id === lessonId; })[0];
      if (!lesson) return;
      openLessonEditor(S.cls, S.topics, lesson, null, refreshClassroom);
    }

    async function deleteLesson(lessonId, cid, title, attachments) {
      var ok = await confirmModal({
        title: 'Delete lesson', danger: true, confirmLabel: 'Delete lesson',
        message: 'Delete “' + esc(title) + '”?<br><br>This will remove the lesson, its notes and its uploaded files. This action may not be reversible.'
      });
      if (!ok) return;
      try {
        (attachments || []).forEach(function (a) { if (a.storagePath) deleteStored(a.storagePath); });
        var ts = await loadTopics(cid);
        var removed = false;
        for (var i = 0; i < ts.length; i++) {
          var ref = lessonRef(cid, ts[i].id, lessonId);
          var d = await ref.get();
          if (d.exists) { await ref.delete(); removed = true; break; }
        }
        if (!removed) throw new Error('Lesson not found in any topic.');
        S.allLessons = null;
        if (S.screen === 'classroom') await refreshClassroom(); else renderList();
      } catch (e) { alert('Could not delete: ' + (e.message || e)); }
    }

    async function deleteTopic(topicId) {
      var t = S.topics.filter(function (x) { return x.id === topicId; })[0]; if (!t) return;
      var ls = S.lessons.filter(function (l) { return l.topicId === topicId; });
      var ok = await confirmModal({
        title: 'Delete topic', danger: true, confirmLabel: 'Delete topic',
        message: 'Delete the topic “' + esc(t.title) + '”?<br><br>' + (ls.length
          ? 'This will also delete its ' + ls.length + ' lesson' + (ls.length === 1 ? '' : 's') + ' and their files. This action may not be reversible.'
          : 'It has no lessons. This action may not be reversible.')
      });
      if (!ok) return;
      try {
        ls.forEach(function (l) { (l.attachments || []).forEach(function (a) { if (a.storagePath) deleteStored(a.storagePath); }); });
        var batch = db.batch();
        ls.forEach(function (l) { batch.delete(lessonRef(S.cls.id, topicId, l.id)); });
        batch.delete(topicRef(S.cls.id, topicId));
        await batch.commit();
        await refreshClassroom();
      } catch (e) { alert('Could not delete: ' + (e.message || e)); }
    }

    root.addEventListener('click', async function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      var a = el.dataset.a, id = el.dataset.id;
      try {
        if (a === 'rename-subject') { if (isAdmin) openRenameSubject(); }
        else if (a === 'open') openClassroom(id);
        else if (a === 'back') { S.classrooms = null; loadClassrooms(); }
        else if (a === 'add-class') { if (isAdmin) openAddClassroom(); }
        else if (a === 'publish-class') { if (isAdmin && !isScoped && global.PublishUI) global.PublishUI.openForClassroom(S.cls, user, refreshClassroom); }
        else if (a === 'tab') { S.tab = el.dataset.v; renderList(); }
        else if (a === 'add-topic') { if (isAdmin) openTopicModal(null); }
        else if (a === 'edit-topic') { if (isAdmin) openTopicModal(S.topics.filter(function (t) { return t.id === id; })[0]); }
        else if (a === 'del-topic') { if (isAdmin) deleteTopic(id); }
        else if (a === 'toggle') { S.collapsed[id] = !S.collapsed[id]; renderClassroom(); }
        else if (a === 'topic-up' || a === 'topic-down') { if (isAdmin) { await moveInList(S.topics, id, a === 'topic-up' ? -1 : 1, clsRef(S.cls.id).collection('topics')); await refreshClassroom(); } }
        else if (a === 'lesson-up' || a === 'lesson-down') {
          if (!isAdmin) return;
          var l = S.lessons.filter(function (x) { return x.id === id; })[0];
          var sibs = S.lessons.filter(function (x) { return x.topicId === l.topicId; });
          await moveInList(sibs, id, a === 'lesson-up' ? -1 : 1, lessonsRef(S.cls.id, l.topicId));
          await refreshClassroom();
        }
        else if (a === 'add-lesson') {
          if (!isAdmin) return;
          if (!S.topics.length) { alert('Add a topic first.'); return; }
          openLessonEditor(S.cls, S.topics, null, id, refreshClassroom);
        }
        else if (a === 'edit-lesson') editLesson(id);
        else if (a === 'edit-any') editLesson(id, el.dataset.c);
        else if (a === 'open-lesson') { if (!isAdmin) { var lesson = S.lessons.filter(function (x) { return x.id === id; })[0]; if (lesson) openLessonEditor(S.cls, S.topics, lesson, null, refreshClassroom); } }
        else if (a === 'release') {
          if (!isAdmin) {
            var lessonRel = S.lessons.filter(function (x) { return x.id === id; })[0];
            if (lessonRel && window.WorkUI && window.WorkUI.openRelease) {
              var item = Object.assign({}, lessonRel, { cid: S.cls.id, tid: lessonRel.topicId });
              window.WorkUI.openRelease(item, user);
            }
          }
        }
        else if (a === 'archive') {
          if (!isAdmin) return;
          var ls = S.lessons.filter(function (x) { return x.id === id; })[0];
          await lessonRef(S.cls.id, ls.topicId, id).update({
            status: ls.status === 'archived' ? 'draft' : 'archived', publishAt: null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid
          });
          await refreshClassroom();
        }
        else if (a === 'del-lesson') {
          if (!isAdmin) return;
          var dl = S.lessons.filter(function (x) { return x.id === id; })[0];
          deleteLesson(id, S.cls.id, dl.title, dl.attachments);
        }
        else if (a === 'del-any') {
          if (!isAdmin) return;
          var al = S.allLessons.filter(function (x) { return x.id === id && x.classroomId === el.dataset.c; })[0];
          deleteLesson(id, el.dataset.c, al.title, al.attachments);
        }
      } catch (err) { console.error(err); alert('Something went wrong: ' + (err.message || err)); }
    });
    root.addEventListener('change', function (e) {
      var f = e.target.dataset && e.target.dataset.f; if (!f) return;
      // Only this manager's own filters (f-*, l-*) belong here. Other controls inside this root —
      // e.g. the Publish tab's Key Stage / Year / Subject / Topic filters — manage themselves.
      // Falling through to renderList() re-mounted the Publish tab on every change and wiped the filters.
      if (f.indexOf('f-') !== 0 && f.indexOf('l-') !== 0) return;
      if (f === 'f-subject') S.filters.subject = e.target.value;
      else if (f === 'f-ks') S.filters.ks = e.target.value;
      else if (f === 'f-year') S.filters.year = e.target.value;
      else if (f.indexOf('l-') === 0) { S.lf[f.slice(2)] = e.target.value; renderAllLessons(); return; }
      renderList();
    });
    root.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.f === 'l-q') {
        S.lf.q = e.target.value;
        var pos = e.target.selectionStart;
        renderAllLessons().then(function () { var i = root.querySelector('[data-f="l-q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } });
      }
    });

    loadClassrooms();
    return { reload: loadClassrooms };
  }

  function mountStudent(root, opts) {
    injectStyle();
    root.classList.add('cr-root');
    var profile = opts.profile || {};
    var subjects = lmzSubjectKeys(profile.subjects);
    var year = profile.year != null && profile.year !== '' ? Number(profile.year) : null;
    var S = { cls: null, topics: [], lessons: [], work: { assignments: [], exams: [], lessons: [] } };
    var AUD = audFor(profile);

    var homeToken = 0;

    async function renderHome() {
      var token = ++homeToken;
      if (!subjects.length) {
        root.innerHTML = '<div class="cr-panel"><div class="cr-empty">No classroom content is available yet.</div></div>';
        return;
      }

      // The class cards need nothing from Firestore, so they paint immediately
      // (no blank tab) instead of waiting for the red pending-count badges.
      root.innerHTML = '<div class="cr-bar"><div><h3>My Classes</h3><div class="cr-sub">Lessons, notes and resources for the subjects you take.</div></div></div>' +
        '<div class="cr-grid">' + subjects.map(function (k) {
          return '<button type="button" class="cr-card" data-a="open" data-s="' + esc(k) + '">' +
            '<div class="ic"><i class="fas fa-chalkboard"></i></div><h4>' +
            esc(lmzSubjectLabel(k)) + '</h4><div class="meta">' + (year ? 'Year ' + esc(year) : esc(ksShort(profile.keyStage))) + '</div></button>';
        }).join('') + '</div>';

      // Badges are filled in per subject as each one resolves, using the shared
      // cache so the login badge count and the Homework/Exams tabs reuse the data.
      subjects.forEach(function (k) {
        (async function () {
          try {
            var cls = await findClassroomCached(k, year, profile.keyStage);
            if (!cls || !window.WorkUI || !window.WorkUI.loadStudentWork) return;
            var topics = await loadTopicsCached(cls.id);
            var work = await window.WorkUI.loadStudentWork(cls, topics, opts.uid, profile);
            var pLessons = work.lessons ? work.lessons.filter(function (l) { return !l.sub || l.sub.status === 'Corrections'; }).length : 0;
            var pHomework = work.assignments ? work.assignments.filter(function (a) { return !a.sub || a.sub.status === 'Corrections'; }).length : 0;
            var pExams = work.exams ? work.exams.filter(function (e) {
              if (e.sub && e.sub.status === 'Submitted') return false;
              if (e.sub && e.sub.status === 'Graded') return false;
              if (e.flat && window.WorkUI && window.WorkUI._h && !window.WorkUI._h.isWindowOpen(e)) return false;
              return true;
            }).length : 0;
            var count = pLessons + pHomework + pExams;
            if (token !== homeToken || !count) return; // user already navigated away / nothing pending
            var card = null;
            root.querySelectorAll('.cr-card[data-a="open"]').forEach(function (c) { if (c.dataset.s === k) card = c; });
            if (card && !card.querySelector('.cr-badge-red')) card.insertAdjacentHTML('afterbegin', '<div class="cr-badge-red">' + count + '</div>');
          } catch (e) { console.warn('Could not load badges for', k, e); }
        })();
      });
    }

    async function openSubject(subjectId) {
      homeToken++; // cancel any badge fills still running for the home screen
      root.innerHTML = loaderHtml('Loading\u2026');
      try {
        var cls = await findClassroomCached(subjectId, year, profile.keyStage);
        if (!cls) { S.cls = { subjectName: lmzSubjectLabel(subjectId), year: year }; S.topics = []; S.lessons = []; return renderClass(); }
        var topics = await loadTopicsCached(cls.id);
        var emptyWork = { assignments: [], exams: [], lessons: [] };
        // Lessons and the student's work are fetched together (both need only the topic list).
        var res = await Promise.all([
          loadLessonsCached(cls.id, topics, AUD),
          global.WorkUI ? global.WorkUI.loadStudentWork(cls, topics, opts.uid, profile).catch(function () { return emptyWork; }) : emptyWork
        ]);
        S.cls = cls; S.topics = topics; S.lessons = res[0]; S.work = res[1];
      } catch (e) {
        console.error('student classroom:', e);
        root.innerHTML = '<div class="cr-crumb"><a data-a="home">My Classes</a></div><div class="cr-panel"><div class="cr-empty">Could not load this class right now.</div></div>';
        return;
      }
      renderClass();
    }

    function visibleOrdered() { return orderedLessons(S.topics, S.lessons); }

    function renderClass() {
      var c = S.cls;
      var name = displayName(c);
      var h = '<div class="cr-crumb"><a data-a="home">My Classes</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(name) + '</span></div>' +
        '<div class="cr-bar"><div><h3>' + esc(name) + (c.year ? ' — Year ' + esc(c.year) : '') + '</h3></div></div>';
      var ordered = visibleOrdered();
      var hasWork = S.work && (S.work.assignments.length || S.work.exams.length);
      if (!ordered.length && !hasWork) {
        root.innerHTML = h + '<div class="cr-panel"><div class="cr-empty">No classroom content is available yet.</div></div>';
        return;
      }
      var num = {}; ordered.forEach(function (l, i) { num[l.id] = i + 1; });
      S.topics.forEach(function (t) {
        var ls = S.lessons.filter(function (l) { return l.topicId === t.id; }).sort(byOrder);
        var workRows = global.WorkUI && hasWork ? global.WorkUI.studentTopicRows(S.work, t.id, S.cls) : '';
        if (!ls.length && !workRows) return;
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">' + esc(t.title) + (t.description ? '<small>' + esc(t.description) + '</small>' : '') + '</span></div>' +
          ls.map(function (l) {
            var lWork = S.work.lessons ? S.work.lessons.find(function(x){ return x.id === l.id; }) : null;
            var badge = '';
            if (lWork && lWork.sub) {
              if (lWork.sub.status === 'Graded') badge = '<span class="cr-badge published" style="margin-left:.5rem">Graded</span>';
              else if (lWork.sub.status === 'Corrections') badge = '<span class="cr-badge scheduled" style="margin-left:.5rem">Corrections</span>';
              else badge = '<span class="cr-badge draft" style="margin-left:.5rem">Submitted</span>';
            }

            return '<div class="cr-lesson student" data-a="lesson" data-id="' + esc(l.id) + '" tabindex="0" role="button"><span class="n">' + pad2(num[l.id]) + '</span>' +
              '<span class="tt">' + esc(l.title) + '<small>' + esc(fmtDate(l.publishedAt || l.createdAt)) + '</small></span>' +
              badge +
              (l.attachments && l.attachments.length ? '<span class="cr-note"><i class="fas fa-paperclip"></i> ' + l.attachments.length + '</span>' : '') +
              '<i class="fas fa-chevron-right" style="font-size:.7rem;color:var(--muted,#5A6E6A)"></i></div>';
          }).join('') + workRows + '</div>';
      });
      var loose = S.lessons.filter(function (l) { return !S.topics.some(function (t) { return t.id === l.topicId; }); });
      if (loose.length) {
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">Other lessons</span></div>' + loose.sort(byOrder).map(function (l) {
          return '<div class="cr-lesson student" data-a="lesson" data-id="' + esc(l.id) + '" tabindex="0" role="button"><span class="n">' + pad2(num[l.id]) + '</span><span class="tt">' + esc(l.title) + '</span></div>';
        }).join('') + '</div>';
      }
      root.innerHTML = h;
    }

    function renderLesson(lessonId) {
      var ordered = visibleOrdered();
      var i = ordered.findIndex(function (l) { return l.id === lessonId; });
      if (i < 0) return renderClass();
      var l = ordered[i];
      var topic = S.topics.filter(function (t) { return t.id === l.topicId; })[0];
      var h = '<div class="cr-crumb"><a data-a="home">My Classes</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i>' +
        '<a data-a="class">' + esc(displayName(S.cls)) + '</a>' +
        (topic ? '<i class="fas fa-chevron-right" style="font-size:.6rem"></i><a data-a="class">' + esc(topic.title) + '</a>' : '') +
        '<i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(l.title) + '</span></div>' +
        '<div class="cr-panel"><h2 class="cr-lesson-title">' + esc(l.title) + '</h2>' +
        '<div class="cr-note">Posted: ' + esc(fmtDate(l.publishedAt || l.createdAt)) + '</div>';
      if (l.content && String(l.content).trim()) h += '<div class="cr-prose" style="margin-top:.9rem;">' + sanitizeHtml(l.content) + '</div>';
      var atts = l.attachments || [];
      if (atts.length) {
        h += '<h4 style="margin:1.3rem 0 .6rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A)">Resources</h4>' +
          atts.map(function (a, k) {
            var url = safeUrl(a.url);
            var playable = a.kind !== 'link' && /^(video|audio)\//.test(a.fileType || '');
            return '<div class="cr-res"><i class="fas ' + fileIcon(a) + '"></i><span class="nm">' + esc(a.name) + (a.kind !== 'link' && a.size ? '<small>' + esc(fmtSize(a.size)) + '</small>' : '') + '</span>' +
              (playable ? '<button type="button" class="cr-btn sm" data-a="play" data-k="' + k + '"><i class="fas fa-play"></i> Play</button>' : '') +
              (url ? '<a class="cr-btn sm primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Open</a>' : '') +
              '<div class="cr-player" data-p="' + k + '" style="flex-basis:100%"></div></div>';
          }).join('');
      }

      var lWork = S.work.lessons ? S.work.lessons.find(function(x){ return x.id === l.id; }) : null;
      h += '<div class="cr-classwork-upload" style="margin-top:1.5rem; padding:1rem; border:1px solid var(--line); border-radius:12px; background:var(--paper);">';
      if (lWork && lWork.sub && lWork.sub.status === 'Graded') {
        h += '<div class="cr-note" style="color:var(--brand-deep); font-weight:700;">Graded: ' + (lWork.sub.grade || 'View Feedback') + '</div>';
        if (lWork.sub.gradedFileUrl) {
          h += '<div style="margin-top:.5rem"><a href="' + esc(lWork.sub.gradedFileUrl) + '" target="_blank" class="cr-btn sm primary"><i class="fas fa-download"></i> Download Marked Work</a></div>';
        }
      } else {
        h += '<button type="button" class="cr-btn primary" data-a="upload-classwork"><i class="fas fa-upload"></i> Submit Classwork Response</button>';
      }
      h += '</div>';

      h += '<div class="cr-nav">' +
        (i > 0 ? '<button type="button" class="cr-btn" data-a="lesson" data-id="' + esc(ordered[i - 1].id) + '"><i class="fas fa-arrow-left"></i> Previous Lesson</button>' : '<span></span>') +
        (i < ordered.length - 1 ? '<button type="button" class="cr-btn primary" data-a="lesson" data-id="' + esc(ordered[i + 1].id) + '">Next Lesson <i class="fas fa-arrow-right"></i></button>' : '<span></span>') +
        '</div></div>';
      root.innerHTML = h;
      S.current = l;
      window.scrollTo({ top: 0 });
    }

    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      var a = el.dataset.a;
      if (a === 'work-open') { global.WorkUI.openStudentItem({ kind: el.dataset.k, cid: S.cls.id, tid: el.dataset.t, id: el.dataset.id, uid: opts.uid, profile: profile, onChange: function () { openSubject(S.cls.subjectId); } }); return; }
      if (a === 'upload-classwork') {
        if (window.WorkUI && window.WorkUI.openStudentLesson) {
          window.WorkUI.openStudentLesson(S.cls, S.current, opts.uid, profile, function(){ openSubject(S.cls.subjectId); });
        } else {
          alert('Upload mechanism not loaded.');
        }
        return;
      }
      if (a === 'home') renderHome();
      else if (a === 'open') openSubject(el.dataset.s);
      else if (a === 'class') renderClass();
      else if (a === 'lesson') renderLesson(el.dataset.id);
      else if (a === 'play') {
        var att = (S.current.attachments || [])[Number(el.dataset.k)];
        var host = root.querySelector('[data-p="' + el.dataset.k + '"]');
        var url = att && safeUrl(att.url);
        if (!url || !host || host.firstChild) return;
        var isVideo = /^video\//.test(att.fileType || '');
        var media = document.createElement(isVideo ? 'video' : 'audio');
        media.controls = true; media.preload = 'metadata'; media.src = url; media.setAttribute('controlsList', 'nodownload');
        host.appendChild(media); media.play().catch(function () {});
      }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest('[data-a="lesson"]'); if (!el || el.tagName === 'BUTTON') return;
      e.preventDefault(); renderLesson(el.dataset.id);
    });

    renderHome();
    return { reload: renderHome };
  }

  function mountParent(root, opts) {
    injectStyle();
    root.classList.add('cr-root');
    var child = opts.child || {};
    var AUD = audFor(child);
    var subjects = lmzSubjectKeys(child.subjects);
    var year = child.year != null && child.year !== '' ? Number(child.year) : null;
    var S = { subject: null, cls: null, topics: [], lessons: [], open: null };

    function home() {
      S.open = null; S.subject = null;
      if (!subjects.length) { root.innerHTML = '<div class="cr-panel"><div class="cr-empty">No subjects are recorded for ' + esc(child.name || 'your child') + ' yet.</div></div>'; return; }
      root.innerHTML = '<div class="cr-bar"><div><h3>' + esc(child.name || 'Your child') + '\u2019s classroom</h3><div class="cr-sub">Lessons and resources released to ' + esc(child.name || 'your child') + '. View only.</div></div></div>' +
        '<div class="cr-grid">' + subjects.map(function (k) {
          return '<button type="button" class="cr-card" data-a="open" data-s="' + esc(k) + '"><div class="ic"><i class="fas fa-chalkboard"></i></div><h4>' + esc(lmzSubjectLabel(k)) + '</h4><div class="meta">' + (year ? 'Year ' + esc(year) : esc(ksShort(child.keyStage))) + '</div></button>';
        }).join('') + '</div>';
    }
    async function openSubject(k) {
      root.innerHTML = loaderHtml('Loading\u2026');
      try {
        var cls = await findClassroomCached(k, year, child.keyStage);
        if (!cls) { S.cls = { subjectName: lmzSubjectLabel(k), year: year }; S.topics = []; S.lessons = []; }
        else { var pTopics = await loadTopicsCached(cls.id); var pLessons = await loadLessonsCached(cls.id, pTopics, AUD); S.cls = cls; S.topics = pTopics; S.lessons = pLessons; }
      } catch (e) { console.error('parent classroom:', e); root.innerHTML = '<div class="cr-crumb"><a data-a="home">Subjects</a></div><div class="cr-panel"><div class="cr-empty">Could not load this subject.</div></div>'; return; }
      list();
    }
    function list() {
      S.open = null;
      var h = '<div class="cr-crumb"><a data-a="home">Subjects</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(displayName(S.cls)) + '</span></div>';
      var any = false;
      S.topics.forEach(function (t) {
        var ls = S.lessons.filter(function (l) { return l.topicId === t.id; }).sort(byOrder);
        if (!ls.length) return; any = true;
        h += '<div class="cr-topic"><div class="cr-topic-head"><span class="t">' + esc(t.title) + '</span></div>' + ls.map(function (l) {
          return '<div class="cr-lesson student" data-a="lesson" data-id="' + esc(l.id) + '" tabindex="0" role="button"><span class="tt">' + esc(l.title) + '<small>' + esc(fmtDate(l.publishedAt || l.createdAt)) + '</small></span>' +
            (l.attachments && l.attachments.length ? '<span class="cr-note"><i class="fas fa-paperclip"></i> ' + l.attachments.length + '</span>' : '') + '</div>';
        }).join('') + '</div>';
      });
      root.innerHTML = h + (any ? '' : '<div class="cr-panel"><div class="cr-empty">Nothing has been released to ' + esc(child.name || 'your child') + ' in this subject yet.</div></div>');
    }
    function lesson(id) {
      var l = S.lessons.filter(function (x) { return x.id === id; })[0]; if (!l) return list();
      var h = '<div class="cr-crumb"><a data-a="home">Subjects</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><a data-a="list">' + esc(displayName(S.cls)) + '</a><i class="fas fa-chevron-right" style="font-size:.6rem"></i><span>' + esc(l.title) + '</span></div>' +
        '<div class="cr-panel"><h2 class="cr-lesson-title">' + esc(l.title) + '</h2>' + (l.content ? '<div class="cr-prose">' + sanitizeHtml(l.content) + '</div>' : '');
      var atts = l.attachments || [];
      if (atts.length) h += '<h4 style="margin:1.2rem 0 .5rem;font-size:.8rem;text-transform:uppercase;color:var(--brand-deep,#245F5A)">Resources</h4>' + atts.map(function (a) {
        var url = safeUrl(a.url);
        return '<div class="cr-res"><i class="fas ' + fileIcon(a) + '"></i><span class="nm">' + esc(a.name) + '</span>' + (url ? '<a class="cr-btn sm primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Open</a>' : '') + '</div>';
      }).join('');
      root.innerHTML = h + '</div>';
    }
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return; var a = el.dataset.a;
      if (a === 'home') home(); else if (a === 'open') openSubject(el.dataset.s); else if (a === 'list') list(); else if (a === 'lesson') lesson(el.dataset.id);
    });
    home();
    return { reload: home };
  }

  global.ClassroomUI = {
    mountManager: mountManager, mountStudent: mountStudent, mountParent: mountParent, sanitizeHtml: sanitizeHtml,
    util: {
      esc: esc, toDate: toDate, fmtDate: fmtDate, fmtDateTime: fmtDateTime, pad2: pad2, ksShort: ksShort, byOrder: byOrder,
      displayName: displayName, snapDocs: snapDocs, clsRef: clsRef, injectStyle: injectStyle, openModal: openModal, confirmModal: confirmModal,
      loadTopics: loadTopics, loadLessons: loadLessons, loadLessonsForTopics: loadLessonsForTopics,
      findClassroomCached: findClassroomCached, loadTopicsCached: loadTopicsCached, loadLessonsCached: loadLessonsCached, memo: memo, clearMemo: clearMemo, loaderHtml: loaderHtml, effAud: effAud, findClassroom: findClassroom, ensureClassroom: ensureClassroom, fileIcon: fileIcon, fmtSize: fmtSize, safeUrl: safeUrl,
      KEY_STAGES: KEY_STAGES, audFor: audFor, isCbcStage: isCbcStage
    }
  };
})(window);