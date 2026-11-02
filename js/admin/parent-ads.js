/* =========================================================
   Admin > Ads & Newsletter. Admins only: firestore.rules and the
   sendParentNewsletter callable refuse everyone else, tutors included.
   ParentAdsAdmin.mount(rootEl, { uid, name, subscribersEl }) -> { destroy() }
   Needs js/ui/fast-video.js and js/parent/parent-ads.js.
   ========================================================= */
(function (g) {
  'use strict';
  var PA = g.ParentAds, FVid = g.FastVideo, esc = FVid.esc;
  var KINDS = [['image', 'Banner image'], ['video', 'Video'], ['text', 'Just writing']];
  var MAX_VIDEO = 500, MAX_IMAGE = 25;

  function fbdb() { return (typeof db !== 'undefined' && db) || firebase.firestore(); }
  function FV() { return firebase.firestore.FieldValue; }
  function fmt(t) { var d = PA.toDate(t); return d ? d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function errMsg(e) { return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^.*?:\s*/, '') : 'Something went wrong.'; }

  function modal(title) {
    var bg = document.createElement('div');
    bg.className = 'pad-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', title);
    bg.innerHTML = '<div class="pad-modal"><div class="pad-mhead"><h3>' + esc(title) + '</h3><button type="button" data-x aria-label="Close">&times;</button></div>' +
      '<div class="pad-mbody"><div class="pad-form"></div><div class="pad-prev"><small>What parents will see</small><div data-prev></div></div></div>' +
      '<div class="pad-mfoot"><span class="pad-err" role="status"></span></div></div>';
    var before = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(bg);
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() { document.removeEventListener('keydown', onKey); bg.remove(); document.body.style.overflow = overflow; if (before && before.focus) before.focus(); }
    document.addEventListener('keydown', onKey);
    bg.querySelector('[data-x]').onclick = close;
    return {
      form: bg.querySelector('.pad-form'), prev: bg.querySelector('[data-prev]'), foot: bg.querySelector('.pad-mfoot'), close: close,
      say: function (t, ok) { var el = bg.querySelector('.pad-err'); el.textContent = t || ''; el.classList.toggle('ok', !!ok); },
      busy: function (on) { bg.querySelectorAll('.pad-mfoot button').forEach(function (b) { b.disabled = on; }); }
    };
  }
  function field(id, label, value, o) {
    o = o || {};
    var tag = o.area
      ? '<textarea id="' + id + '" maxlength="' + (o.max || 2000) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + esc(value || '') + '</textarea>'
      : '<input type="text" id="' + id + '" maxlength="' + (o.max || 200) + '" value="' + esc(value || '') + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>';
    return '<div class="pad-f"><label for="' + id + '">' + esc(label) + '</label>' + tag + (o.hint ? '<div class="pad-hint">' + esc(o.hint) + '</div>' : '') + '</div>';
  }
  /* Link or upload. Either way the page just gets a URL. */
  function mediaField(id, label, value, accept, hint) {
    return '<div class="pad-f"><label for="' + id + '">' + esc(label) + '</label>' +
      '<div class="pad-media-row"><input type="url" id="' + id + '" maxlength="1200" placeholder="Paste a link" value="' + esc(value || '') + '">' +
      '<label class="pad-btn" style="margin:0"><i class="fas fa-upload" aria-hidden="true"></i> Upload<input type="file" hidden data-up="' + id + '" accept="' + accept + '"></label>' +
      (/video/.test(accept) ? '<button type="button" class="pad-btn" data-test="' + id + '">Test link</button>' : '') + '</div>' +
      '<div class="pad-hint" data-note="' + id + '">' + esc(hint || '') + '</div></div>';
  }
  function wireMedia(m, onChange) {
    m.form.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-up]'); if (!inp || !inp.files[0]) return;
      var f = inp.files[0], id = inp.dataset.up, note = m.form.querySelector('[data-note="' + id + '"]');
      var isVid = /^video\//.test(f.type), isImg = /^image\//.test(f.type);
      if (!isVid && !isImg) { note.textContent = 'Please choose a video or image file.'; return; }
      var max = isVid ? MAX_VIDEO : MAX_IMAGE;
      if (f.size >= max * 1048576) { note.textContent = 'That file is over the ' + max + ' MB limit.' + (isVid ? ' Host it on AWS and paste the link instead.' : ''); return; }
      var path = 'parentMedia/' + Date.now() + '_' + f.name.replace(/[^\w.\-]/g, '_');
      var task = firebase.storage().ref(path).put(f, { contentType: f.type, cacheControl: 'public,max-age=31536000' });
      task.on('state_changed', function (s) { note.textContent = 'Uploading ' + Math.round(s.bytesTransferred / s.totalBytes * 100) + '%…'; });
      task.then(function () { return task.snapshot.ref.getDownloadURL(); }).then(function (url) {
        m.form.querySelector('#' + id).value = url;
        note.textContent = 'Uploaded: ' + f.name;
        inp.value = '';
        onChange();
      }).catch(function (er) { note.textContent = 'Upload failed: ' + errMsg(er); });
    });
    m.form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-test]'); if (!b) return;
      var id = b.dataset.test, note = m.form.querySelector('[data-note="' + id + '"]');
      note.textContent = 'Testing the link…'; b.disabled = true;
      FVid.test(m.form.querySelector('#' + id).value).then(function (r) { note.textContent = FVid.testMessage(r); b.disabled = false; });
    });
  }
  function val(m, id) { var el = m.form.querySelector('#' + id); return el ? el.value.trim() : ''; }

  function mount(root, o) {
    var S = { tab: 'ads', ads: [], letters: [], unsubs: [] }, sendFn = firebase.functions().httpsCallable('sendParentNewsletter', { timeout: 545000 });
    var AD_LABEL = { draft: 'Draft', live: 'Live', paused: 'Paused' };
    var KIND_LABEL = { image: 'Banner image', video: 'Video', text: 'Writing' };
    var LETTER_LABEL = { draft: 'Draft', sending: 'Sending', sent: 'Sent', partial: 'Part sent', failed: 'Not sent' };

    function render() {
      if (o.subscribersEl) o.subscribersEl.style.display = S.tab === 'subs' ? '' : 'none';
      var tabs = '<div class="pad-tabs" role="tablist">' + [['ads', 'Parent ads'], ['letters', 'Newsletters'], ['subs', 'Website subscribers']].map(function (t) {
        return '<button type="button" role="tab" aria-selected="' + (S.tab === t[0]) + '" data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      root.innerHTML = tabs + (S.tab === 'ads' ? adsView() : S.tab === 'letters' ? lettersView() : '');
    }
    function adsView() {
      var head = '<div class="pad-top"><div class="pad-meta">Shown on the Overview of the main Parent Portal.</div><button type="button" class="pad-btn go" data-new-ad><i class="fas fa-plus" aria-hidden="true"></i> New ad</button></div>';
      if (!S.ads.length) return head + '<div class="pad-empty">No ads yet. Upload a banner or a video, or just write something.</div>';
      return head + S.ads.map(function (a) {
        var st = a.status || 'draft';
        return '<div class="pad-row"><div><h4>' + esc(a.headline || a.ticker || KIND_LABEL[a.kind] || 'Ad') + '</h4>' +
          '<div class="pad-meta"><span class="pad-st ' + st + '">' + esc(AD_LABEL[st] || st) + '</span>' + esc(KIND_LABEL[a.kind] || 'Writing') + '</div></div>' +
          '<div class="pad-acts"><button type="button" class="pad-btn" data-edit-ad="' + esc(a.id) + '">Edit</button>' +
          (st === 'live' ? '<button type="button" class="pad-btn" data-pause-ad="' + esc(a.id) + '">Take down</button>' : '<button type="button" class="pad-btn go" data-pub-ad="' + esc(a.id) + '">Publish</button>') +
          '<button type="button" class="pad-btn" data-ad-letter="' + esc(a.id) + '">Send as newsletter</button>' +
          '<button type="button" class="pad-btn del" data-del-ad="' + esc(a.id) + '">Delete</button></div></div>';
      }).join('');
    }
    function lettersView() {
      var head = '<div class="pad-top"><div class="pad-meta">Emailed to every Parent Portal parent who has not turned newsletters off, and shown in their Newsletter tab.</div><button type="button" class="pad-btn go" data-new-letter><i class="fas fa-plus" aria-hidden="true"></i> New newsletter</button></div>';
      if (!S.letters.length) return head + '<div class="pad-empty">No newsletters yet.</div>';
      return head + S.letters.map(function (n) {
        var st = n.status || 'draft', started = PA.toDate(n.sendStartedAt), stuck = st === 'sending' && started && Date.now() - started.getTime() > 660000;
        return '<div class="pad-row"><div><h4>' + esc(n.subject || 'Untitled newsletter') + '</h4>' +
          '<div class="pad-meta"><span class="pad-st ' + st + '">' + esc(LETTER_LABEL[st] || st) + '</span>' + (n.sentAt ? esc(fmt(n.sentAt)) + ' · ' : '') + (n.sentCount != null ? esc(n.sentCount) + ' delivered' + (n.failedCount ? ', ' + esc(n.failedCount) + ' failed' : '') : '') + '</div></div>' +
          '<div class="pad-acts"><button type="button" class="pad-btn" data-edit-letter="' + esc(n.id) + '">' + (st === 'sent' ? 'View' : 'Edit') + '</button>' +
          (st === 'partial' || st === 'failed' || stuck ? '<button type="button" class="pad-btn go" data-resend="' + esc(n.id) + '">Send to the rest</button>' : '') +
          (st === 'draft' ? '<button type="button" class="pad-btn del" data-del-letter="' + esc(n.id) + '">Delete</button>' : '') + '</div></div>';
      }).join('');
    }
    function find(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

    /* ---------- ad composer ---------- */
    function editAd(item) {
      var a = Object.assign({ kind: 'image', status: 'draft' }, item || {}), id = a.id || null;
      var m = modal(id ? 'Edit ad' : 'New ad');
      m.form.innerHTML =
        '<div class="pad-f"><div class="pad-seg" role="group" aria-label="What are you posting?">' + KINDS.map(function (k) { return '<button type="button" data-kind="' + k[0] + '" aria-pressed="' + (a.kind === k[0]) + '" class="' + (a.kind === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div></div>' +
        '<div data-kindwrap="image">' + mediaField('adImage', 'Banner image', a.kind === 'image' ? a.mediaUrl : '', 'image/*', 'Best size with no writing: about 1000 x 240 pixels. With writing beside it: about 800 x 450.') + '</div>' +
        '<div data-kindwrap="video">' + mediaField('adVideo', 'Video', a.kind === 'video' ? a.mediaUrl : '', 'video/*', 'AWS, YouTube or Vimeo link, or upload up to 500 MB.') + '</div>' +
        field('adTicker', 'Running words', a.ticker, { max: 100, ph: 'Enrolment for next term is open' }) +
        field('adHead', 'Heading (optional)', a.headline, { max: 90 }) +
        field('adBody', 'Writing (optional)', a.body, { area: 1, max: 600 }) +
        '<div class="pad-2">' + field('adCtaL', 'Button words (optional)', a.ctaLabel, { max: 30, ph: 'Enrol now' }) + field('adCtaU', 'Button link', a.ctaUrl, { max: 800, ph: 'https:// or /tech' }) + '</div>';
      m.foot.insertAdjacentHTML('beforeend', '<button type="button" class="pad-btn" data-save>Save draft</button>' +
        '<button type="button" class="pad-btn" data-save-letter>Save and make a newsletter</button>' +
        '<button type="button" class="pad-btn go" data-publish>' + (a.status === 'live' ? 'Save' : 'Publish to parents') + '</button>');
      function read() {
        return {
          kind: a.kind, ticker: val(m, 'adTicker'), headline: val(m, 'adHead'), body: val(m, 'adBody'), ctaLabel: val(m, 'adCtaL'), ctaUrl: val(m, 'adCtaU'),
          mediaUrl: a.kind === 'video' ? val(m, 'adVideo') : a.kind === 'image' ? val(m, 'adImage') : ''
        };
      }
      function paintKind() { m.form.querySelectorAll('[data-kindwrap]').forEach(function (w) { w.hidden = w.dataset.kindwrap !== a.kind; }); }
      var prevT = null;
      function preview() {
        clearTimeout(prevT);
        prevT = setTimeout(function () { m.prev.innerHTML = '<div class="pa-root">' + PA.adHtml(read(), { preview: true }) + '</div>'; }, 150);
      }
      m.form.addEventListener('input', preview);
      m.form.addEventListener('click', function (e) {
        var k = e.target.closest('[data-kind]'); if (!k) return;
        a.kind = k.dataset.kind;
        m.form.querySelectorAll('[data-kind]').forEach(function (b) { var on = b === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        paintKind(); preview();
      });
      wireMedia(m, preview);
      paintKind(); preview();

      function problems(d, publishing) {
        if (d.kind === 'video' && FVid.problem(d.mediaUrl)) return FVid.problem(d.mediaUrl);
        if (d.kind === 'image' && d.mediaUrl && !PA.httpsUrl(d.mediaUrl)) return 'The image link must start with https://.';
        if (d.ctaUrl && !PA.linkUrl(d.ctaUrl)) return 'The button link must start with https:// or with / for a page on our site.';
        if (d.ctaLabel && !d.ctaUrl) return 'Add the link for the button.';
        if (publishing) {
          if (d.kind === 'image' && !d.mediaUrl) return 'Add the banner image.';
          if (d.kind === 'video' && !d.mediaUrl) return 'Add the video.';
          if (d.kind === 'text' && !d.headline && !d.body) return 'Write something first.';
        }
        return '';
      }
      function save(status) {
        var d = read(), why = problems(d, status === 'live');
        if (why) { m.say(why); return Promise.reject(null); }
        d.status = status; d.updatedAt = FV().serverTimestamp();
        if (status === 'live' && a.status !== 'live') d.publishedAt = FV().serverTimestamp();
        var col = fbdb().collection('parentAds');
        if (id) return col.doc(id).update(d).then(function () { a.status = status; return Object.assign({ id: id }, a, d); });
        d.createdAt = FV().serverTimestamp(); d.createdBy = o.uid; d.createdByName = o.name || 'Studio Desk';
        return col.add(d).then(function (r) { id = r.id; a.status = status; return Object.assign({ id: r.id }, d); });
      }
      function act(status, after) {
        m.busy(true); m.say('');
        save(status).then(function (saved) { if (after) after(saved); else m.close(); })
          .catch(function (e) { if (e) m.say(errMsg(e)); })
          .then(function () { m.busy(false); });
      }
      var keep = function () { return a.status === 'live' ? 'live' : 'draft'; };
      m.foot.querySelector('[data-save]').onclick = function () { act(keep()); };
      m.foot.querySelector('[data-publish]').onclick = function () { act('live'); };
      m.foot.querySelector('[data-save-letter]').onclick = function () {
        act(keep(), function (saved) { m.close(); S.tab = 'letters'; render(); editLetter(letterFromAd(saved)); });
      };
    }
    function letterFromAd(a) {
      return {
        subject: a.headline || a.ticker || 'News from Paisley Studio', body: a.body || '',
        imageUrl: a.kind === 'image' ? a.mediaUrl : '', videoUrl: a.kind === 'video' ? a.mediaUrl : '',
        ctaLabel: a.ctaLabel || '', ctaUrl: a.ctaUrl || '', adId: a.id || ''
      };
    }

    /* ---------- newsletter composer ---------- */
    function editLetter(item) {
      var n = Object.assign({ status: 'draft' }, item || {}), id = n.id || null;
      var locked = n.status === 'sent' || n.status === 'partial' || n.status === 'sending';
      var m = modal(locked ? 'Newsletter' : (id ? 'Edit newsletter' : 'New newsletter'));
      m.form.innerHTML =
        field('nlSubject', 'Subject', n.subject, { max: 120 }) +
        field('nlBody', 'Message', n.body, { area: 1, max: 8000 }) +
        mediaField('nlImage', 'Picture (optional)', n.imageUrl, 'image/*', '') +
        mediaField('nlVideo', 'Video (optional)', n.videoUrl, 'video/*', 'Emails show a “Watch the video” button. It plays in the Newsletter tab.') +
        '<div class="pad-2">' + field('nlCtaL', 'Button words (optional)', n.ctaLabel, { max: 30 }) + field('nlCtaU', 'Button link', n.ctaUrl, { max: 800, ph: 'https:// or /tech' }) + '</div>';
      if (locked) m.form.querySelectorAll('input,textarea,button').forEach(function (x) { x.disabled = true; });
      function read() {
        return { subject: val(m, 'nlSubject'), body: val(m, 'nlBody'), imageUrl: val(m, 'nlImage'), videoUrl: val(m, 'nlVideo'), ctaLabel: val(m, 'nlCtaL'), ctaUrl: val(m, 'nlCtaU'), adId: n.adId || '' };
      }
      var prevT = null;
      function preview() { clearTimeout(prevT); prevT = setTimeout(function () { m.prev.innerHTML = PA.letterHtml(Object.assign(read(), { sentAt: n.sentAt })); }, 150); }
      m.form.addEventListener('input', preview);
      wireMedia(m, preview);
      preview();
      if (locked) return;
      m.foot.insertAdjacentHTML('beforeend', '<button type="button" class="pad-btn" data-save>Save draft</button><button type="button" class="pad-btn" data-test-send>Send me a test</button><button type="button" class="pad-btn go" data-send>Send to all parents</button>');
      function problems(d) {
        if (!d.subject) return 'Add a subject.';
        if (!d.body && !d.imageUrl && !d.videoUrl) return 'Add a message, a picture or a video.';
        if (d.imageUrl && !PA.httpsUrl(d.imageUrl)) return 'The picture link must start with https://.';
        if (FVid.problem(d.videoUrl)) return FVid.problem(d.videoUrl);
        if (d.ctaUrl && !PA.linkUrl(d.ctaUrl)) return 'The button link must start with https:// or with / for a page on our site.';
        if (d.ctaLabel && !d.ctaUrl) return 'Add the link for the button.';
        return '';
      }
      function save() {
        var d = read(), why = problems(d);
        if (why) { m.say(why); return Promise.reject(null); }
        d.updatedAt = FV().serverTimestamp();
        var col = fbdb().collection('parentNewsletters');
        if (id) return col.doc(id).update(d).then(function () { return id; });
        Object.assign(d, { status: 'draft', published: false, createdAt: FV().serverTimestamp(), createdBy: o.uid, createdByName: o.name || 'Studio Desk' });
        return col.add(d).then(function (r) { id = r.id; n.id = r.id; return id; });
      }
      m.foot.querySelector('[data-save]').onclick = function () {
        m.busy(true); m.say('');
        save().then(function () { m.close(); }).catch(function (e) { if (e) m.say(errMsg(e)); }).then(function () { m.busy(false); });
      };
      m.foot.querySelector('[data-test-send]').onclick = function () {
        m.busy(true); m.say('Sending a test to you…');
        save().then(function (nid) { return sendFn({ newsletterId: nid, test: true }); })
          .then(function (r) { m.say('Test sent to ' + r.data.to + '.', true); })
          .catch(function (e) { if (e) m.say(errMsg(e)); })
          .then(function () { m.busy(false); });
      };
      m.foot.querySelector('[data-send]').onclick = function () {
        m.busy(true); m.say('Counting recipients…');
        save().then(function (nid) {
          return confirmAndSend(nid, function (t, ok) { m.say(t, ok); }).then(function (done) { if (done) m.close(); });
        }).catch(function (e) { if (e) m.say(errMsg(e)); }).then(function () { m.busy(false); });
      };
    }
    /* Resolves true once sending has finished, false if the admin backed out. */
    function confirmAndSend(id, say) {
      return sendFn({ newsletterId: id, dryRun: true }).then(function (r) {
        var count = r.data.remaining;
        if (!count) { say('Nobody left to send this to.'); return false; }
        if (!confirm('Send this newsletter to ' + count + ' parent' + (count === 1 ? '' : 's') + '? This cannot be undone.')) { say(''); return false; }
        say('Sending to ' + count + ' parent' + (count === 1 ? '' : 's') + '… keep this page open.');
        return sendFn({ newsletterId: id }).then(function (res) {
          var d = res.data;
          alert('Newsletter sent to ' + d.sentCount + ' parent' + (d.sentCount === 1 ? '' : 's') + (d.failedCount ? '. ' + d.failedCount + ' failed: use “Send to the rest” to try them again.' : '.'));
          return true;
        });
      });
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var ds = t.dataset, col = fbdb().collection('parentAds');
      var fail = function (er) { alert(errMsg(er)); };
      if (ds.tab) { S.tab = ds.tab; render(); }
      else if (ds.newAd !== undefined) editAd();
      else if (ds.editAd) editAd(find(S.ads, ds.editAd));
      else if (ds.pubAd) {
        var ad = find(S.ads, ds.pubAd);
        if (ad.kind === 'text' ? !(ad.headline || ad.body) : !ad.mediaUrl) { editAd(ad); return; }
        col.doc(ds.pubAd).update({ status: 'live', publishedAt: FV().serverTimestamp(), updatedAt: FV().serverTimestamp() }).catch(fail);
      }
      else if (ds.pauseAd) col.doc(ds.pauseAd).update({ status: 'paused', updatedAt: FV().serverTimestamp() }).catch(fail);
      else if (ds.delAd) { if (confirm('Delete this ad? It disappears from the Parent Portal.')) col.doc(ds.delAd).delete().catch(fail); }
      else if (ds.adLetter) { S.tab = 'letters'; render(); editLetter(letterFromAd(find(S.ads, ds.adLetter))); }
      else if (ds.newLetter !== undefined) editLetter();
      else if (ds.editLetter) editLetter(find(S.letters, ds.editLetter));
      else if (ds.delLetter) { if (confirm('Delete this draft?')) fbdb().collection('parentNewsletters').doc(ds.delLetter).delete().catch(fail); }
      else if (ds.resend) {
        t.disabled = true;
        confirmAndSend(ds.resend, function () { }).catch(fail).then(function () { t.disabled = false; });
      }
    });

    S.unsubs.push(fbdb().collection('parentAds').orderBy('updatedAt', 'desc').limit(100).onSnapshot(function (s) {
      S.ads = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); render();
    }, function (e) { console.warn('ads:', e); }));
    S.unsubs.push(fbdb().collection('parentNewsletters').orderBy('updatedAt', 'desc').limit(100).onSnapshot(function (s) {
      S.letters = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); render();
    }, function (e) { console.warn('letters:', e); }));
    render();
    return { destroy: function () { S.unsubs.forEach(function (u) { u(); }); if (o.subscribersEl) o.subscribersEl.style.display = ''; root.innerHTML = ''; } };
  }

  g.ParentAdsAdmin = { mount: mount };
})(window);
