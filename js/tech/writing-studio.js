/* =========================================================
   Paisley TECH — Writing Studio
   ---------------------------------------------------------
   Rich-text editor for a single techBuild. Owns ONE field:
     build.writingHtml   (sanitized HTML string)
     build.writingAt     (last-saved timestamp, for the portfolio)

   Supports:
     - Headings (H2, H3), paragraph, bold, italic, underline
     - Bullet + numbered lists
     - Quotes
     - Links (https only)
     - Images: upload to Storage (techBuilds/{uid}/{buildId}/...)
              OR paste a URL
              OR pick from the build's existing files[]
     - Captions on inserted images (stored via figcaption)
     - Drafts (debounced autosave to writingHtml)
     - Preview (sanitized)

   Exports:
     WritingStudio.mount(hostEl, { build, me, canEdit, onSave, files })

   No external dependencies. No library. ContentEditable + execCommand,
   sanitized on the way in AND out (onSave gives the parent the
   cleaned HTML — the parent is responsible for persisting it).
========================================================= */
(function (g) {
  'use strict';

  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }

  /* ---------------------------------------------------------
     Sanitizer — allowlist only. Anything not in this list is
     stripped entirely (tag removed, text kept), so a student
     pasting from Word / Google Docs / an AI tool cannot smuggle
     <script>, <style>, event handlers, or javascript: URLs.
     --------------------------------------------------------- */
  var ALLOWED_TAGS = {
    P: 1, BR: 1, H2: 1, H3: 1, H4: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1,
    UL: 1, OL: 1, LI: 1, A: 1, BLOCKQUOTE: 1, IMG: 1, FIGURE: 1, FIGCAPTION: 1, HR: 1, SPAN: 1
  };
  var DROP_TAGS = {
    SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, FORM: 1, INPUT: 1, BUTTON: 1,
    TEXTAREA: 1, SELECT: 1, LINK: 1, META: 1, SVG: 1, MATH: 1, VIDEO: 1, AUDIO: 1,
    CANVAS: 1, NOSCRIPT: 1, TEMPLATE: 1
  };
  function sanitizeHtml(html) {
    var inert = document.implementation.createHTMLDocument('');
    var parsed = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html').body;
    var out = inert.createElement('div');
    (function walk(from, to) {
      for (var n = from.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { to.appendChild(inert.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        if (DROP_TAGS[tag]) continue;
        if (!ALLOWED_TAGS[tag]) { walk(n, to); continue; }
        var el = inert.createElement(tag.toLowerCase());
        if (tag === 'A') {
          var href = String(n.getAttribute('href') || '').trim();
          if (/^https?:\/\//i.test(href)) {
            el.setAttribute('href', href);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          }
        } else if (tag === 'IMG') {
          var src = String(n.getAttribute('src') || '').trim();
          if (!/^https:\/\//i.test(src)) continue; /* refuse non-HTTPS images */
          el.setAttribute('src', src);
          el.setAttribute('alt', n.getAttribute('alt') || '');
          el.setAttribute('loading', 'lazy');
        }
        walk(n, el);
        to.appendChild(el);
      }
    })(parsed, out);
    return out.innerHTML;
  }

  /* Public factory */
  function mount(hostEl, opts) {
    if (!hostEl) throw new Error('WritingStudio.mount: missing host element');
    var build = opts.build || {};
    var canEdit = !!opts.canEdit;
    var files = Array.isArray(opts.files) ? opts.files : [];
    var save = typeof opts.onSave === 'function' ? opts.onSave : function () { };

    /* ---------- Shell ---------- */
    hostEl.innerHTML =
      '<div class="ws-toolbar" role="toolbar" aria-label="Formatting">' +
        btn('h2', 'H2', 'Heading 2') +
        btn('h3', 'H3', 'Heading 3') +
        btn('p', '¶', 'Paragraph') +
        sep() +
        btn('bold', '<b>B</b>', 'Bold') +
        btn('italic', '<i>I</i>', 'Italic') +
        btn('underline', '<u>U</u>', 'Underline') +
        sep() +
        btn('ul', '•', 'Bullet list') +
        btn('ol', '1.', 'Numbered list') +
        btn('quote', '❝', 'Quote') +
        sep() +
        btn('link', '🔗', 'Link') +
        btn('image', '🖼️', 'Image') +
        sep() +
        btn('undo', '↺', 'Undo') +
        btn('redo', '↻', 'Redo') +
        btn('clear', '⌫', 'Clear formatting') +
        '<span class="ws-spacer"></span>' +
        '<button type="button" class="ws-btn ws-preview-btn" data-wscmd="preview"><i class="fas fa-eye"></i> Preview</button>' +
        '<button type="button" class="ws-btn ws-save-btn" data-wscmd="save"><i class="fas fa-floppy-disk"></i> Save</button>' +
      '</div>' +
      '<div class="ws-editor-wrap">' +
        '<div class="ws-editor" contenteditable="' + (canEdit ? 'true' : 'false') + '" role="textbox" aria-multiline="true" aria-label="Writing workspace" data-placeholder="Start writing…"></div>' +
      '</div>' +
      '<div class="ws-preview" hidden></div>' +
      '<div class="ws-status" aria-live="polite"><span class="ws-status-text"></span></div>' +
      '<input type="file" class="ws-file-in" accept="image/jpeg,image/png,image/gif,image/webp" hidden>' +
      '<input type="url" class="ws-url-in" placeholder="Image or link URL (https://…)" hidden>';

    var editor = hostEl.querySelector('.ws-editor');
    var previewEl = hostEl.querySelector('.ws-preview');
    var statusEl = hostEl.querySelector('.ws-status-text');
    var fileIn = hostEl.querySelector('.ws-file-in');
    var urlIn = hostEl.querySelector('.ws-url-in');

    /* ---------- Seed content ---------- */
    editor.innerHTML = sanitizeHtml(build.writingHtml || '');
    if (!editor.textContent.trim() && !editor.querySelector('img,figure')) {
      /* Leave empty so the placeholder shows */
    }

    /* ---------- Helper: set status text ---------- */
    var statusTimer = null;
    function setStatus(text, kind) {
      statusEl.textContent = text || '';
      statusEl.style.color = kind === 'err' ? '#b8362a' : kind === 'ok' ? '#1d8b57' : '';
      if (statusTimer) clearTimeout(statusTimer);
      if (text) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 3500);
    }

    /* ---------- execCommand wrappers ---------- */
    function exec(cmd, val) {
      if (!canEdit) return;
      editor.focus();
      try { document.execCommand(cmd, false, val || null); } catch (e) { /* noop */ }
      scheduleSave();
    }

    /* ---------- Saved state / autosave ---------- */
    var dirty = false, saving = false, saveTimer = null;
    function scheduleSave() {
      if (!canEdit) return;
      dirty = true;
      setStatus('Unsaved changes', '');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 1500);
    }
    function flushSave() {
      if (!canEdit || !dirty || saving) return;
      saving = true;
      var html = sanitizeHtml(editor.innerHTML);
      save({ writingHtml: html, writingAt: FV().serverTimestamp() }).then(function () {
        dirty = false; saving = false;
        setStatus('Saved', 'ok');
      }).catch(function (e) {
        saving = false;
        setStatus('Could not save: ' + (e && e.message || e), 'err');
      });
    }

    /* ---------- Toolbar wiring ---------- */
    hostEl.querySelectorAll('[data-wscmd]').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        if (!canEdit && b.dataset.wscmd !== 'preview') return;
        var cmd = b.dataset.wscmd;
        if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') exec('formatBlock', cmd);
        else if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') exec(cmd);
        else if (cmd === 'ul' || cmd === 'ol') exec('insert' + (cmd === 'ul' ? 'Unordered' : 'Ordered') + 'List');
        else if (cmd === 'quote') exec('formatBlock', 'blockquote');
        else if (cmd === 'undo') exec('undo');
        else if (cmd === 'redo') exec('redo');
        else if (cmd === 'clear') { exec('removeFormat'); exec('formatBlock', 'p'); }
        else if (cmd === 'link') openLinkDialog();
        else if (cmd === 'image') openImageDialog();
        else if (cmd === 'preview') togglePreview();
        else if (cmd === 'save') flushSave();
      });
    });

    /* ---------- Link dialog ---------- */
    function openLinkDialog() {
      if (!canEdit) return;
      var sel = window.getSelection();
      var hasSel = sel && sel.toString().length > 0;
      urlIn.hidden = false;
      urlIn.value = 'https://';
      urlIn.focus();
      urlIn.select();
      var onEnter = function (e) {
        if (e.key === 'Escape') { urlIn.hidden = true; urlIn.removeEventListener('keydown', onEnter); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var url = safeUrl(urlIn.value);
        if (!url) { setStatus('Link must start with https://', 'err'); return; }
        urlIn.hidden = true;
        urlIn.removeEventListener('keydown', onEnter);
        if (hasSel) exec('createLink', url);
        else exec('insertHTML', '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>');
      };
      urlIn.addEventListener('keydown', onEnter);
    }

    /* ---------- Image dialog ---------- */
    function openImageDialog() {
      if (!canEdit) return;
      /* Simple flow: choose file / paste URL / pick from build.files */
      var m = openModal('Insert image');
      var body = m.body;
      body.innerHTML =
        '<div class="ws-imgtabs">' +
          '<button type="button" class="ws-imgtab on" data-wsimg="upload">Upload</button>' +
          '<button type="button" class="ws-imgtab" data-wsimg="url">From URL</button>' +
          '<button type="button" class="ws-imgtab" data-wsimg="pick">From project</button>' +
        '</div>' +
        '<div data-wspane="upload" class="ws-imgpane on">' +
          '<p class="ws-sub">Pick a JPG, PNG, GIF or WebP file (max 25 MB). It uploads to this project.</p>' +
          '<input type="file" class="ws-pick-file" accept="image/jpeg,image/png,image/gif,image/webp">' +
        '</div>' +
        '<div data-wspane="url" class="ws-imgpane">' +
          '<p class="ws-sub">Paste a public image URL (https://…).</p>' +
          '<input type="url" class="ws-pick-url" placeholder="https://…">' +
        '</div>' +
        '<div data-wspane="pick" class="ws-imgpane">' +
          (files.length
            ? '<p class="ws-sub">Pick a file you already uploaded to this project.</p>' +
              '<div class="ws-picklist">' +
              files.filter(function (f) { return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(f.name || f.url || ''); }).map(function (f, i) {
                return '<label class="ws-pickrow"><input type="radio" name="wsPick" value="' + esc(f.url) + '"> <img src="' + esc(f.url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"> <span>' + esc(f.name || 'image') + '</span></label>';
              }).join('') +
              '</div>'
            : '<p class="ws-sub">No images uploaded to this project yet.</p>') +
        '</div>' +
        '<div class="ws-f"><label>Caption (optional)</label><input type="text" class="ws-caption" maxlength="200"></div>' +
        '<div class="ws-f"><label>Alt text (describe the image)</label><input type="text" class="ws-alt" maxlength="200" placeholder="Short description for accessibility"></div>' +
        '<div class="ws-status ws-modal-status"></div>';

      m.foot.innerHTML =
        '<button type="button" class="tk-btn" data-a="cancel">Cancel</button>' +
        '<button type="button" class="tk-btn primary" data-a="insert"><i class="fas fa-plus"></i> Insert</button>';

      var statusEl2 = body.querySelector('.ws-modal-status');
      function setStatus2(t, kind) { statusEl2.textContent = t || ''; statusEl2.style.color = kind === 'err' ? '#b8362a' : ''; }

      body.querySelectorAll('[data-wsimg]').forEach(function (b) {
        b.addEventListener('click', function () {
          body.querySelectorAll('[data-wsimg]').forEach(function (x) { x.classList.toggle('on', x === b); });
          body.querySelectorAll('[data-wspane]').forEach(function (p) { p.classList.toggle('on', p.dataset.wspane === b.dataset.wsimg); });
        });
      });

      /* Track the chosen image */
      var chosen = { kind: null, url: '', name: '' };
      var fileInM = body.querySelector('.ws-pick-file');
      var urlInM = body.querySelector('.ws-pick-url');
      fileInM.addEventListener('change', function () { setStatus2(''); chosen = { kind: null, url: '', name: '' }; });
      urlInM.addEventListener('input', function () { setStatus2(''); chosen = { kind: null, url: '', name: '' }; });

      m.foot.querySelector('[data-a="cancel"]').onclick = m.close;
      m.foot.querySelector('[data-a="insert"]').onclick = async function () {
        var btnEl = this;
        setStatus2('');
        var activePane = body.querySelector('.ws-imgpane.on').dataset.wspane;
        var caption = (body.querySelector('.ws-caption').value || '').slice(0, 200);
        var alt = (body.querySelector('.ws-alt').value || '').slice(0, 200);

        if (activePane === 'upload') {
          var f = fileInM.files[0];
          if (!f) { setStatus2('Choose a file first.', 'err'); return; }
          if (f.size > 25 * 1024 * 1024) { setStatus2('Image must be under 25 MB.', 'err'); return; }
          btnEl.disabled = true; btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
          try {
            var path = 'techBuilds/' + build.studentId + '/' + build.id + '/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
            var r = firebase.storage().ref(path);
            await r.put(f, { contentType: f.type });
            var url = await r.getDownloadURL();
            insertImage(url, alt || f.name, caption);
            m.close();
          } catch (e) {
            setStatus2('Upload failed: ' + (e && e.message || e), 'err');
            btnEl.disabled = false; btnEl.innerHTML = '<i class="fas fa-plus"></i> Insert';
          }
          return;
        }
        if (activePane === 'url') {
          var url = safeUrl(urlInM.value);
          if (!url) { setStatus2('Enter a valid https:// URL.', 'err'); return; }
          if (!/\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) && !/^https:\/\//i.test(url)) { setStatus2('Image URL must start with https://', 'err'); return; }
          insertImage(url, alt || 'image', caption);
          m.close();
          return;
        }
        if (activePane === 'pick') {
          var picked = body.querySelector('input[name="wsPick"]:checked');
          if (!picked) { setStatus2('Pick an image.', 'err'); return; }
          insertImage(picked.value, alt || 'image', caption);
          m.close();
          return;
        }
      };
      /* Focus the first meaningful control */
      setTimeout(function () { var f = body.querySelector('.ws-pick-file'); if (f) f.focus(); }, 40);
    }

    /* Insert a figure/figcaption into the editor at the caret */
    function insertImage(src, alt, caption) {
      if (!canEdit) return;
      var html = '<figure>' +
        '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy">' +
        (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
        '</figure><p><br></p>';
      exec('insertHTML', html);
    }

    /* ---------- Preview ---------- */
    var previewOn = false;
    function togglePreview() {
      previewOn = !previewOn;
      if (previewOn) {
        previewEl.innerHTML = sanitizeHtml(editor.innerHTML) || '<p class="ws-empty">Nothing written yet.</p>';
        previewEl.hidden = false;
        hostEl.querySelector('.ws-editor-wrap').hidden = true;
        hostEl.querySelector('.ws-preview-btn').innerHTML = '<i class="fas fa-pen"></i> Edit';
      } else {
        previewEl.hidden = true;
        hostEl.querySelector('.ws-editor-wrap').hidden = false;
        hostEl.querySelector('.ws-preview-btn').innerHTML = '<i class="fas fa-eye"></i> Preview';
      }
    }

    /* ---------- Editor events ---------- */
    editor.addEventListener('input', function () { if (canEdit) scheduleSave(); });
    editor.addEventListener('paste', function (e) {
      if (!canEdit) return;
      var cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      var html = cd.getData('text/html');
      if (html) {
        var clean = sanitizeHtml(html);
        document.execCommand('insertHTML', false, clean);
      } else {
        document.execCommand('insertText', false, cd.getData('text/plain') || '');
      }
      scheduleSave();
    });
    editor.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        flushSave();
      }
    });

    /* ---------- Keyboard shortcuts for toolbar ---------- */
    editor.addEventListener('keydown', function (e) {
      if (!canEdit) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); exec('bold'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); exec('italic'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); exec('underline'); }
    });

    /* ---------- Style injection (once) ---------- */
    injectStyle();

    /* ---------- Public API ---------- */
    return {
      destroy: function () {
        if (saveTimer) clearTimeout(saveTimer);
        if (statusTimer) clearTimeout(statusTimer);
        if (dirty) flushSave(); /* best-effort persist on close */
        hostEl.innerHTML = '';
      }
    };
  }

  /* ---------- Small toolbar helpers ---------- */
  function btn(cmd, label, title) {
    return '<button type="button" class="ws-btn" data-wscmd="' + cmd + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' + label + '</button>';
  }
  function sep() { return '<span class="ws-sep" aria-hidden="true"></span>'; }

  /* ---------- Modal (tiny, standalone so we don't depend on other modules) ---------- */
  function openModal(title) {
    var ov = document.createElement('div');
    ov.className = 'ws-modal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="ws-modal-inner">' +
      '<div class="ws-modal-head"><h3>' + esc(title) + '</h3><button type="button" class="ws-modal-x" aria-label="Close">✕</button></div>' +
      '<div class="ws-modal-body"></div>' +
      '<div class="ws-modal-foot"></div></div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    function close() { document.body.style.overflow = ''; if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('.ws-modal-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (!ov.parentNode) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    return { el: ov, body: ov.querySelector('.ws-modal-body'), foot: ov.querySelector('.ws-modal-foot'), close: close };
  }

  /* ---------- Style injection (once per page) ---------- */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent = [
      '.ws-toolbar{display:flex;flex-wrap:wrap;gap:.25rem;padding:.4rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-bottom:none;border-radius:12px 12px 0 0;background:var(--paper,#F1F9F7);align-items:center}',
      '.ws-btn{min-width:34px;height:34px;padding:0 .55rem;border:1.5px solid transparent;border-radius:8px;background:transparent;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.86rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.3rem}',
      '.ws-btn:hover{background:var(--sage,#E5F2EF);border-color:var(--line,rgba(38,51,49,.12))}',
      '.ws-btn:active{transform:scale(.96)}',
      '.ws-btn.ws-save-btn{background:var(--brand-deep,#245F5A);color:#fff;border-color:var(--brand-deep,#245F5A);padding:0 .9rem}',
      '.ws-btn.ws-save-btn:hover{background:var(--brand,#55BFB3);border-color:var(--brand,#55BFB3);color:#04231f}',
      '.ws-btn.ws-preview-btn{background:var(--surface,#fff);border-color:var(--line,rgba(38,51,49,.12));padding:0 .9rem}',
      '.ws-btn.ws-preview-btn:hover{border-color:var(--brand,#55BFB3)}',
      '.ws-sep{width:1px;height:22px;background:var(--line,rgba(38,51,49,.15));margin:0 .25rem}',
      '.ws-spacer{flex:1}',
      '.ws-editor-wrap{border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:0 0 12px 12px;background:#fff}',
      '.ws-editor{min-height:320px;max-height:60vh;overflow-y:auto;padding:1rem 1.1rem;outline:none;font-size:.94rem;line-height:1.7}',
      '.ws-editor[contenteditable="false"]{background:var(--paper,#F1F9F7)}',
      '.ws-editor:empty:before{content:attr(data-placeholder);color:var(--muted,#5A6E6A);opacity:.7;pointer-events:none}',
      '.ws-editor h2{font-size:1.35rem;margin:.6rem 0 .4rem;color:var(--brand-deep,#245F5A)}',
      '.ws-editor h3{font-size:1.1rem;margin:.6rem 0 .35rem;color:var(--brand-deep,#245F5A)}',
      '.ws-editor p{margin:.5rem 0}',
      '.ws-editor ul,.ws-editor ol{padding-left:1.4rem;margin:.4rem 0}',
      '.ws-editor blockquote{margin:.6rem 0;padding:.4rem .9rem;border-left:3px solid var(--brand,#55BFB3);background:var(--paper,#F1F9F7);border-radius:0 8px 8px 0}',
      '.ws-editor a{color:var(--brand-deep,#245F5A);text-decoration:underline}',
      '.ws-editor img{max-width:100%;height:auto;border-radius:8px;display:block;margin:.4rem 0}',
      '.ws-editor figure{margin:.8rem 0;padding:0}',
      '.ws-editor figcaption{font-size:.78rem;color:var(--muted,#5A6E6A);text-align:center;margin-top:.3rem}',
      '.ws-preview{border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;padding:1rem 1.1rem;background:#fff;min-height:320px;font-size:.94rem;line-height:1.7}',
      '.ws-preview h2{font-size:1.35rem;margin:.6rem 0 .4rem;color:var(--brand-deep,#245F5A)}',
      '.ws-preview h3{font-size:1.1rem;margin:.6rem 0 .35rem;color:var(--brand-deep,#245F5A)}',
      '.ws-preview p{margin:.5rem 0}',
      '.ws-preview ul,.ws-preview ol{padding-left:1.4rem;margin:.4rem 0}',
      '.ws-preview blockquote{margin:.6rem 0;padding:.4rem .9rem;border-left:3px solid var(--brand,#55BFB3);background:var(--paper,#F1F9F7);border-radius:0 8px 8px 0}',
      '.ws-preview img{max-width:100%;height:auto;border-radius:8px;display:block;margin:.4rem 0}',
      '.ws-preview figure{margin:.8rem 0}',
      '.ws-preview figcaption{font-size:.78rem;color:var(--muted,#5A6E6A);text-align:center;margin-top:.3rem}',
      '.ws-preview .ws-empty{color:var(--muted,#5A6E6A);font-style:italic}',
      '.ws-status{padding:.3rem .2rem;font-size:.76rem;color:var(--muted,#5A6E6A);min-height:1.3rem}',
      '.ws-file-in,.ws-url-in{display:none}',
      /* Modal */
      '.ws-modal{position:fixed;inset:0;background:rgba(15,26,20,.55);display:grid;place-items:center;z-index:9999;padding:1rem}',
      '.ws-modal-inner{background:#fff;border-radius:16px;width:min(520px,100%);max-height:90vh;overflow:hidden;display:flex;flex-direction:column}',
      '.ws-modal-head{display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem;border-bottom:1px solid var(--line,rgba(38,51,49,.12))}',
      '.ws-modal-head h3{margin:0;font-size:1rem;color:var(--brand-deep,#245F5A)}',
      '.ws-modal-x{border:0;background:transparent;font-size:1.1rem;cursor:pointer;color:var(--muted,#5A6E6A);width:32px;height:32px;border-radius:8px}',
      '.ws-modal-x:hover{background:var(--sage,#E5F2EF);color:var(--brand-deep,#245F5A)}',
      '.ws-modal-body{padding:1rem;overflow-y:auto}',
      '.ws-modal-foot{padding:.8rem 1rem;border-top:1px solid var(--line,rgba(38,51,49,.12));display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap}',
      '.ws-sub{font-size:.82rem;color:var(--muted,#5A6E6A);margin:.2rem 0 .55rem}',
      '.ws-imgtabs{display:flex;gap:.35rem;margin-bottom:.6rem}',
      '.ws-imgtab{padding:.4rem .8rem;border-radius:8px;border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;color:var(--brand-deep,#245F5A);font:inherit;font-weight:800;font-size:.78rem;cursor:pointer}',
      '.ws-imgtab.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}',
      '.ws-imgpane{display:none}.ws-imgpane.on{display:block}',
      '.ws-pick-file,.ws-pick-url{width:100%;padding:.55rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.88rem;background:var(--paper,#F1F9F7)}',
      '.ws-picklist{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.4rem;max-height:220px;overflow-y:auto;padding:.2rem;border:1px solid var(--line,rgba(38,51,49,.12));border-radius:8px}',
      '.ws-pickrow{display:flex;flex-direction:column;gap:.2rem;padding:.3rem;border-radius:6px;cursor:pointer;border:1.5px solid transparent;text-transform:none;letter-spacing:0;font-weight:600;font-size:.72rem;color:var(--ink,#263331);margin:0}',
      '.ws-pickrow:hover{background:var(--paper,#F1F9F7)}',
      '.ws-pickrow input{position:absolute;opacity:0}',
      '.ws-pickrow:has(input:checked){border-color:var(--brand,#55BFB3);background:var(--sage,#E5F2EF)}',
      '.ws-pickrow img{width:100%;height:70px;object-fit:cover;border-radius:4px}',
      '.ws-f{margin-top:.7rem}',
      '.ws-f label{display:block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-deep,#245F5A);margin-bottom:.25rem}',
      '.ws-f input{width:100%;padding:.5rem .7rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit;font-size:.86rem;background:var(--paper,#F1F9F7)}',
      '.ws-modal-status{font-size:.78rem;color:#b8362a;min-height:1.1rem;padding-top:.3rem}',
      '@media(prefers-reduced-motion:reduce){.ws-btn{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  g.WritingStudio = { mount: mount, sanitizeHtml: sanitizeHtml };
})(window);