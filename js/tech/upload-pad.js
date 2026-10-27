/* =========================================================
   Paisley TECH — Upload Pad
   ---------------------------------------------------------
   The universal asset area for a single techBuild.

   Owns ONE field on the build:
     build.files = [
       { id, name, url, path, size, type, kind, caption, source, at }
       …
     ]
   A single array that both the Writing Studio (pick-an-asset)
   and the Code Lab (post-download references) can read.

   Features:
     - Drag-and-drop OR file picker (multiple files)
     - External URL add (with title)
     - List with type icons, size, thumbnails for images
     - Inline audio/video previews
     - Inline image preview
     - Remove / replace
     - Open in new tab
     - Type filter (images / docs / audio / video / links)
     - Soft limit 40 assets

   Storage:
     Same bucket path the workspace already uses —
       techBuilds/{uid}/{buildId}/{timestamp_name}
     Same 25 MB cap and same content-type allowlist enforced
     in storage.rules. No new path, no new rules.

   Exports:
     UploadPad.mount(hostEl, { build, me, canEdit, onSave })
========================================================= */
(function (g) {
  'use strict';

  var MAX_FILES = 40;
  var MAX_BYTES = 25 * 1024 * 1024;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function kindOf(file) {
    if (file.kind === 'link') return 'link';
    var t = String(file.type || '');
    var e = extOf(file.name);
    if (/^image\//i.test(t) || /^(png|jpe?g|gif|webp|svg)$/i.test(e)) return 'image';
    if (/^audio\//i.test(t) || /^(mp3|wav|m4a|ogg|aac)$/i.test(e)) return 'audio';
    if (/^video\//i.test(t) || /^(mp4|webm|mov)$/i.test(e)) return 'video';
    if (/^application\/pdf$/i.test(t) || e === 'pdf') return 'pdf';
    if (/word|document/i.test(t) || /^(docx?|odt)$/i.test(e)) return 'doc';
    if (/sheet|excel/i.test(t) || /^(xlsx?|csv|ods)$/i.test(e)) return 'sheet';
    if (/presentation|powerpoint/i.test(t) || /^(pptx?|odp)$/i.test(e)) return 'slides';
    if (/zip|archive/i.test(t) || /^(zip|rar|7z)$/i.test(e)) return 'archive';
    if (/^(html?|css|js|mjs|jsx|json|xml|txt|md)$/i.test(e)) return 'code';
    return 'file';
  }
  var KIND_ICON = {
    image: 'fa-image', audio: 'fa-music', video: 'fa-film', pdf: 'fa-file-pdf',
    doc: 'fa-file-word', sheet: 'fa-file-excel', slides: 'fa-file-powerpoint',
    archive: 'fa-file-zipper', code: 'fa-file-code', link: 'fa-link', file: 'fa-file'
  };
  var KIND_LABEL = {
    image: 'Image', audio: 'Audio', video: 'Video', pdf: 'PDF', doc: 'Document',
    sheet: 'Spreadsheet', slides: 'Slides', archive: 'Archive', code: 'Code',
    link: 'Link', file: 'File'
  };

  function mount(hostEl, opts) {
    if (!hostEl) throw new Error('UploadPad.mount: missing host element');
    var build = opts.build || {};
    var canEdit = !!opts.canEdit;
    var save = typeof opts.onSave === 'function' ? opts.onSave : function () { };

    var files = Array.isArray(build.files) ? build.files.map(function (f) { return Object.assign({}, f); }) : [];
    var filter = 'all';

    hostEl.innerHTML =
      '<div class="up-shell">' +
        '<div class="up-drop" tabindex="0" role="button" aria-label="Upload files">' +
          '<i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>' +
          '<b>Drop files here</b>' +
          '<span>or <u>click to pick</u> — images, PDFs, audio, video, docs, code. Max 25 MB each.</span>' +
          '<input type="file" class="up-file-in" multiple hidden>' +
        '</div>' +
        '<div class="up-bar">' +
          '<div class="up-filters" role="tablist">' +
            ['all', 'image', 'pdf', 'doc', 'sheet', 'audio', 'video', 'code', 'link'].map(function (k) {
              return '<button type="button" class="up-filter' + (filter === k ? ' on' : '') + '" data-upfilter="' + k + '">' +
                (k === 'all' ? 'All' : KIND_LABEL[k]) + '</button>';
            }).join('') +
          '</div>' +
          (canEdit ? '<button type="button" class="up-btn up-btn-primary" data-upcmd="addlink"><i class="fas fa-link"></i> Add link</button>' : '') +
        '</div>' +
        '<div class="up-list" aria-live="polite"></div>' +
        '<div class="up-status"></div>' +
        '<div class="up-count"></div>' +
      '</div>';

    var dropEl = hostEl.querySelector('.up-drop');
    var fileIn = hostEl.querySelector('.up-file-in');
    var listEl = hostEl.querySelector('.up-list');
    var statusEl = hostEl.querySelector('.up-status');
    var countEl = hostEl.querySelector('.up-count');

    /* ---------- Status ---------- */
    var statusTimer = null;
    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.style.color = kind === 'err' ? '#b8362a' : kind === 'ok' ? '#1d8b57' : '';
      if (statusTimer) clearTimeout(statusTimer);
      if (text) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 4000);
    }

    /* ---------- Render ---------- */
    function render() {
      var visible = files.filter(function (f) { return filter === 'all' || kindOf(f) === filter; });
      if (!visible.length) {
        listEl.innerHTML = '<div class="up-empty">' + (files.length ? 'No files of this type.' : 'No assets yet. Drop a file above to start.') + '</div>';
      } else {
        listEl.innerHTML = visible.map(function (f) { return renderRow(f); }).join('');
      }
      countEl.textContent = files.length ? (files.length + ' of ' + MAX_FILES + ' assets') : '';
      wireRowActions();
      wirePreviews();
    }
    function renderRow(f) {
      var kind = kindOf(f);
      var url = safeUrl(f.url);
      var icon = KIND_ICON[kind] || KIND_ICON.file;
      var meta = [];
      if (f.kind === 'link') meta.push('Link');
      else if (f.size) meta.push(fmtSize(f.size));
      if (f.type) meta.push(String(f.type).split(';')[0]);
      else if (!f.kind && f.name) meta.push(extOf(f.name).toUpperCase());
      var thumb = '';
      if (kind === 'image' && url) thumb = '<img class="up-thumb" src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
      else thumb = '<span class="up-thumb up-thumb-icon"><i class="fas ' + icon + '"></i></span>';
      return '<div class="up-row" data-uprow="' + esc(f.id || f.url || f.name) + '">' +
        thumb +
        '<div class="up-info">' +
          '<div class="up-name">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(f.name || 'asset') + '</a>' : esc(f.name || 'asset')) + '</div>' +
          '<div class="up-meta">' + esc(KIND_LABEL[kind] || 'File') + (meta.length ? ' · ' + esc(meta.join(' · ')) : '') + '</div>' +
          (f.caption ? '<div class="up-caption">' + esc(f.caption) + '</div>' : '') +
          (kind === 'audio' && url ? '<audio class="up-player" controls preload="none" src="' + esc(url) + '"></audio>' : '') +
          (kind === 'video' && url ? '<video class="up-player" controls preload="none" src="' + esc(url) + '"></video>' : '') +
        '</div>' +
        '<div class="up-actions">' +
          (url ? '<a class="up-icon-btn" href="' + esc(url) + '" target="_blank" rel="noopener" title="Open"><i class="fas fa-arrow-up-right-from-square"></i></a>' : '') +
          (canEdit ? '<button type="button" class="up-icon-btn" data-upaction="caption" title="' + (f.caption ? 'Edit caption' : 'Add caption') + '"><i class="fas fa-i-cursor"></i></button>' : '') +
          (canEdit ? '<button type="button" class="up-icon-btn up-danger" data-upaction="remove" title="Remove"><i class="fas fa-xmark"></i></button>' : '') +
        '</div>' +
      '</div>';
    }

    /* ---------- Row actions ---------- */
    function wireRowActions() {
      listEl.querySelectorAll('[data-upaction]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = b.closest('[data-uprow]');
          var key = row ? row.dataset.uprow : '';
          var idx = files.findIndex(function (f) { return String(f.id || f.url || f.name) === key; });
          if (idx === -1) return;
          var action = b.dataset.upaction;
          if (action === 'remove') {
            if (!confirm('Remove "' + (files[idx].name || 'asset') + '" from this project?')) return;
            files.splice(idx, 1);
            persist();
          } else if (action === 'caption') {
            var c = prompt('Caption (shown in the Writing Studio and the portfolio)', files[idx].caption || '');
            if (c === null) return;
            files[idx].caption = String(c).slice(0, 200);
            persist();
          }
        });
      });
    }
    function wirePreviews() {
      listEl.querySelectorAll('audio, video').forEach(function (m) {
        m.addEventListener('play', function () {
          listEl.querySelectorAll('audio, video').forEach(function (other) { if (other !== m) { try { other.pause(); } catch (e) { } } });
        });
      });
    }

    /* ---------- Persist ---------- */
    function persist() {
      render();
      save({ files: files.slice(0, MAX_FILES) }).catch(function (e) {
        setStatus('Save failed: ' + (e && e.message || e), 'err');
      });
    }

    /* ---------- Filters ---------- */
    hostEl.querySelectorAll('[data-upfilter]').forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.upfilter;
        hostEl.querySelectorAll('[data-upfilter]').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
      });
    });

    /* ---------- Add link ---------- */
    if (canEdit) {
      hostEl.querySelector('[data-upcmd="addlink"]').addEventListener('click', function () {
        var url = prompt('Link URL (https://…)');
        if (!url) return;
        var clean = safeUrl(url);
        if (!clean) { setStatus('Enter a link starting with https://', 'err'); return; }
        var title = prompt('Title shown to you and your coach', clean) || clean;
        files.push({
          id: 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: String(title).slice(0, 120),
          url: clean,
          kind: 'link',
          at: Date.now()
        });
        if (files.length > MAX_FILES) { files = files.slice(0, MAX_FILES); setStatus('Trimmed to ' + MAX_FILES + ' assets.', 'err'); }
        persist();
      });
    }

    /* ---------- Upload ---------- */
    var uploading = 0;
    function handleFiles(fileList) {
      if (!canEdit) return;
      if (!fileList || !fileList.length) return;
      var remaining = MAX_FILES - files.length;
      if (remaining <= 0) { setStatus('You already have ' + MAX_FILES + ' assets. Remove one first.', 'err'); return; }
      var list = Array.prototype.slice.call(fileList).slice(0, remaining);
      var tasks = list.map(uploadOne);
      Promise.allSettled(tasks);
    }
    async function uploadOne(f) {
      if (!f) return;
      if (f.size > MAX_BYTES) { setStatus(f.name + ' is over 25 MB.', 'err'); return; }
      uploading++;
      setStatus('Uploading ' + uploading + '…', '');
      var path = 'techBuilds/' + build.studentId + '/' + build.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
      try {
        var ref = firebase.storage().ref(path);
        var snap = await ref.put(f, { contentType: f.type || undefined });
        var url = await snap.ref.getDownloadURL();
        files.push({
          id: 'upl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: f.name.slice(0, 80),
          url: url,
          path: path,
          size: f.size,
          type: f.type || '',
          kind: 'file',
          at: Date.now()
        });
        persist();
      } catch (e) {
        setStatus('Upload failed: ' + (e && e.message || e), 'err');
      } finally {
        uploading--;
        if (uploading <= 0) { uploading = 0; if (!statusEl.textContent.includes('failed')) setStatus('', ''); }
      }
    }

    /* Drop zone events */
    dropEl.addEventListener('click', function () {
      if (!canEdit) return;
      fileIn.click();
    });
    dropEl.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && canEdit) { e.preventDefault(); fileIn.click(); }
    });
    fileIn.addEventListener('change', function () { handleFiles(fileIn.files); fileIn.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('over'); });
    });
    dropEl.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) handleFiles(dt.files);
    });
    /* Prevent the whole window from opening dropped files */
    ['dragover', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (dropEl.contains(e.target)) return;
        e.preventDefault();
      });
    });

    /* ---------- Boot ---------- */
    injectStyle();
    render();

    return {
      destroy: function () {
        if (statusTimer) clearTimeout(statusTimer);
        hostEl.innerHTML = '';
      }
    };
  }

  /* ---------- Style ---------- */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.up-shell{display:flex;flex-direction:column;gap:.7rem}',
      '.up-drop{border:2px dashed var(--line,rgba(38,51,49,.25));border-radius:14px;padding:1.2rem;text-align:center;background:var(--paper,#F1F9F7);color:var(--muted,#5A6E6A);cursor:pointer;transition:border-color .15s,background .15s}',
      '.up-drop:hover,.up-drop:focus-visible{border-color:var(--brand,#55BFB3);background:rgba(85,191,179,.05);outline:none}',
      '.up-drop.over{border-color:var(--brand,#55BFB3);background:rgba(85,191,179,.1)}',
      '.up-drop i{font-size:1.6rem;color:var(--brand-deep,#245F5A);display:block;margin-bottom:.3rem}',
      '.up-drop b{display:block;color:var(--brand-deep,#245F5A);font-size:.95rem;margin-bottom:.2rem}',
      '.up-drop span{font-size:.82rem;display:block}',
      '.up-bar{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}',
      '.up-filters{display:flex;gap:.25rem;flex-wrap:wrap}',
      '.up-filter{padding:.3rem .65rem;border-radius:99px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.7rem;cursor:pointer;text-transform:uppercase;letter-spacing:.03em}',
      '.up-filter:hover{background:var(--sage,#E5F2EF)}',
      '.up-filter.on{background:var(--brand-deep,#245F5A);color:#fff;border-color:var(--brand-deep,#245F5A)}',
      '.up-btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .8rem;border-radius:10px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.74rem;cursor:pointer}',
      '.up-btn.up-btn-primary{background:var(--brand-deep,#245F5A);color:#fff;border-color:var(--brand-deep,#245F5A)}',
      '.up-btn.up-btn-primary:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.up-list{display:flex;flex-direction:column;gap:.5rem}',
      '.up-empty{padding:1rem;text-align:center;color:var(--muted,#5A6E6A);font-size:.86rem;background:var(--paper,#F1F9F7);border-radius:10px}',
      '.up-row{display:flex;gap:.75rem;align-items:flex-start;padding:.6rem .7rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:12px;background:#fff}',
      '.up-thumb{width:56px;height:56px;flex-shrink:0;border-radius:10px;object-fit:cover;background:var(--sage,#E5F2EF)}',
      '.up-thumb-icon{display:grid;place-items:center;color:var(--brand-deep,#245F5A);font-size:1.1rem}',
      '.up-info{flex:1;min-width:0}',
      '.up-name{font-weight:800;font-size:.9rem;color:var(--brand-deep,#245F5A);word-break:break-all}',
      '.up-name a{color:inherit;text-decoration:none}',
      '.up-name a:hover{text-decoration:underline}',
      '.up-meta{font-size:.72rem;color:var(--muted,#5A6E6A);margin-top:.15rem}',
      '.up-caption{font-size:.8rem;color:var(--ink,#263331);margin-top:.3rem;font-style:italic;opacity:.9}',
      '.up-player{width:100%;margin-top:.4rem;border-radius:8px;background:#000}',
      '.up-actions{display:flex;gap:.25rem;flex-shrink:0}',
      '.up-icon-btn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:8px;background:#fff;color:var(--brand-deep,#245F5A);cursor:pointer;text-decoration:none}',
      '.up-icon-btn:hover{background:var(--sage,#E5F2EF);border-color:var(--brand,#55BFB3)}',
      '.up-icon-btn.up-danger:hover{background:#fde8e8;border-color:#f2c4c4;color:#b8362a}',
      '.up-status{font-size:.78rem;min-height:1.1rem;color:var(--muted,#5A6E6A)}',
      '.up-count{font-size:.7rem;color:var(--muted,#5A6E6A);text-transform:uppercase;letter-spacing:.04em;font-weight:800}',
      '@media(max-width:520px){.up-thumb{width:44px;height:44px}.up-name{font-size:.84rem}}',
      '@media(prefers-reduced-motion:reduce){.up-drop,.up-filter,.up-btn{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  g.UploadPad = { mount: mount };
})(window);