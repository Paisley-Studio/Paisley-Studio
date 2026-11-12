/* =========================================================
   Paisley Studio — facial recognition screens (global `AttendanceFace`)
   -----------------------------------------------------------
   Loaded after js/attendance/attendance.js and drawn with its styles.
   Everything about a face is worked out on this device with face-api.js
   (TensorFlow.js, MIT). Its library and models are fetched from the CDN only
   when someone opens a face option, never while the feature is unused. A camera
   frame or reference photo becomes a 128-number face descriptor here, and
   only those numbers are sent to Paisley (functions/face-recognition.js),
   which compares them with the person's enrolled descriptors. No picture
   leaves the device and none is saved.

     camera(host)            one person's camera; scan() reads 3 frames about half
                             a second apart and resolves to their descriptors.
     photoDescriptors(files) admin enrollment: one descriptor per reference photo.
     mountAdmin(el)          Admin > Attendance > Facial recognition.
     mountConsent(el, o)     the parent's consent card for one child.
   Students and tutors only ever see a face option when attendanceToday says
   recognition.available (the server decides).
========================================================= */
var AttendanceFace = (function () {
  'use strict';
  function U() { return Attendance._ui; }
  var LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
  var MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
  var FRAMES = 3, FRAME_GAP_MS = 450;

  /* ---------- the face model, loaded once, on demand ---------- */
  var modelP = null;
  function loadModels() {
    if (modelP) return modelP;
    modelP = new Promise(function (resolve, reject) {
      if (window.faceapi) { resolve(); return; }
      var s = document.createElement('script'); s.src = LIB; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('The face model could not load. Check the connection, or use the normal check-in.')); };
      document.head.appendChild(s);
    }).then(function () {
      var f = window.faceapi;
      return Promise.all([f.nets.tinyFaceDetector.loadFromUri(MODELS), f.nets.faceLandmark68Net.loadFromUri(MODELS), f.nets.faceRecognitionNet.loadFromUri(MODELS)]);
    }).catch(function (e) { modelP = null; throw e instanceof Error ? e : new Error('The face model could not load. Use the normal check-in.'); });
    return modelP;
  }
  /* One face in this image or video frame -> its descriptor (plain array of 128 numbers).
     The detector is tried at a few input sizes: a face that fills the picture is found at a
     small size, a smaller face at a larger one. */
  function describe(input, sizes) {
    var f = window.faceapi;
    function at(i) {
      if (i >= sizes.length) return Promise.reject(new Error('No face found. Please reposition your face: look straight at the camera in good light.'));
      return f.detectAllFaces(input, new f.TinyFaceDetectorOptions({ inputSize: sizes[i], scoreThreshold: 0.45 })).withFaceLandmarks().withFaceDescriptors().then(function (found) {
        if (found.length > 1) throw new Error('More than one face is in view. Only you should be in front of the camera.');
        return found.length ? Array.prototype.slice.call(found[0].descriptor) : at(i + 1);
      });
    }
    return at(0);
  }

  /* ---------- camera: frames are read in memory and never kept ---------- */
  function camera(host) {
    var u = U();
    host.innerHTML = '<div class="att-cam"><video playsinline muted autoplay></video><div class="att-cam-guide"></div></div>' +
      '<p class="att-muted" style="text-align:center;margin:.4rem 0 0">' + u.icon('fa-circle-info') + ' Only you, facing the camera, in good light. Your face is read on this device; no picture is sent or saved.</p>';
    var video = host.querySelector('video'), stream = null, stopped = false;
    var cam = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia ?
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }) :
      Promise.reject(new Error('This browser cannot use the camera.'))).then(function (s) {
        if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); throw new Error('Camera closed.'); }
        stream = s; video.srcObject = s;
        return new Promise(function (res) { if (video.readyState >= 2) res(); else video.onloadeddata = function () { res(); }; });
      }).catch(function (e) {
        var msg = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Camera permission was not given. Use the normal check-in, or allow the camera and try again.' :
          e && e.name === 'NotFoundError' ? 'No camera was found on this device. Use the normal check-in.' : (e && e.message) || 'The camera could not start.';
        throw new Error(msg);
      });
    var ready = Promise.all([cam, loadModels()]);
    function scan() {
      if (!stream || !video.videoWidth) return Promise.reject(new Error('The camera is not ready yet.'));
      var out = [];
      function one(i) {
        if (i >= FRAMES) return Promise.resolve(out);
        return new Promise(function (r) { setTimeout(r, i ? FRAME_GAP_MS : 0); }).then(function () {
          if (stopped) throw new Error('Camera closed.');
          return describe(video, [320, 224, 160]);
        }).then(function (d) { out.push(d); return one(i + 1); });
      }
      return one(0);
    }
    function stop() {
      stopped = true;
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null; try { video.srcObject = null; } catch (e) { }
    }
    return { ready: ready, scan: scan, stop: stop };
  }

  /* Admin enrollment: each chosen photo is read on this computer and only its descriptor is kept. */
  function photoDescriptors(files) {
    return loadModels().then(function () {
      var list = Array.prototype.slice.call(files || []), out = [];
      if (!list.length) throw new Error('Choose at least one photo.');
      if (list.length > 5) throw new Error('Choose up to 5 photos.');
      function one(i) {
        if (i >= list.length) return Promise.resolve(out);
        var file = list[i];
        if (!/^image\//.test(file.type)) return Promise.reject(new Error(file.name + ' is not a photo.'));
        return new Promise(function (resolve, reject) {
          var url = URL.createObjectURL(file), img = new Image();
          img.onload = function () {
            describe(img, [416, 224, 160, 608]).then(function (d) { URL.revokeObjectURL(url); resolve(d); })
              .catch(function (e) { URL.revokeObjectURL(url); reject(new Error(file.name + ': ' + (/More than one/.test(e.message) ? 'more than one face.' : 'no clear face found.') + ' Use a clear, front-facing photo of one person.')); });
          };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name + ' could not be opened.')); };
          img.src = url;
        }).then(function (d) { out.push(d); return one(i + 1); });
      }
      return one(0);
    });
  }
  function pickFiles() {
    return new Promise(function (resolve) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp'; i.multiple = true;
      i.onchange = function () { resolve(i.files); }; i.click();
    });
  }

  /* =========================================================
     ADMIN — Attendance > Facial recognition
  ========================================================= */
  var CONSENT = { granted: ['Consent given', 'ok'], withdrawn: ['Consent withdrawn', 'bad'], none: ['No consent', 'wait'] };
  var ENROL = { enrolled: ['Enrolled', 'ok'], awaiting_photo: ['Awaiting photos', 'info'], not_enrolled: ['Not enrolled', 'wait'] };
  var RESULT = { matched: ['Recognised', 'ok'], no_match: ['Not recognised', 'bad'], bad_frames: ['Unreadable', 'wait'], inconsistent: ['Unsteady', 'late'], replay: ['Copied or replayed', 'bad'],
    disabled_during_attempt: ['Switched off', 'wait'] };
  var ACTION = { recognition_enabled: 'Enabled', recognition_disabled: 'Disabled', recognition_suspended: 'Suspended', recognition_config: 'Settings changed', recognition_students_approved: 'Student processing approved',
    recognition_students_withdrawn: 'Student processing withdrawn', face_consent_granted: 'Consent given', face_consent_withdrawn: 'Consent withdrawn',
    face_enrolled: 'Enrolled', face_photo_replaced: 'Photo replaced', face_enrollment_removed: 'Enrollment removed' };
  function tag(map, k) { var u = U(), v = map[k] || [k || '—', 'wait']; return '<span class="att-pill ' + v[1] + '">' + u.esc(v[0]) + '</span>'; }

  function mountAdmin(el) {
    var u = U(), esc = u.esc, icon = u.icon;
    var D = { cfg: {}, profiles: {}, attempts: [], log: [], students: [], tutors: [] };
    var sub = 'students', q = '', unsubs = [];
    el.innerHTML = '<div class="att-empty">' + icon('fa-spinner fa-spin') + ' Loading…</div>';
    var err = function (e) { console.warn('face admin', e); };
    unsubs.push(db.collection('attendanceSettings').doc('recognition').onSnapshot(function (s) { D.cfg = s.exists ? s.data() : {}; paint(); }, err));
    unsubs.push(db.collection('faceProfiles').onSnapshot(function (s) { D.profiles = {}; s.forEach(function (d) { D.profiles[d.id] = d.data(); }); paint(); }, err));
    unsubs.push(db.collection('faceAttempts').orderBy('at', 'desc').limit(200).onSnapshot(function (s) { D.attempts = s.docs.map(function (d) { return d.data(); }); paint(); }, err));
    unsubs.push(db.collection('attendanceAudit').where('area', '==', 'recognition').onSnapshot(function (s) { D.log = s.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return u.msOf(b.at) - u.msOf(a.at); }).slice(0, 150); paint(); }, err));
    db.collection('students').get().then(function (s) {
      D.students = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (x) { return !x.studentType || x.studentType === 'online'; })
        .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }); paint();
    }).catch(err);
    db.collection('tutorAccounts').get().then(function (s) {
      D.tutors = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }); paint();
    }).catch(err);

    function cfg() { return Object.assign({ status: 'disabled', maxDistance: 0.5, retentionDays: 90, studentsApproved: false }, D.cfg); }
    function paint() {
      if (el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.dataset.fq == null) return;
      var c = cfg(), P = D.profiles, ids = Object.keys(P);
      var nEnrolled = function (t) { return ids.filter(function (k) { return P[k].personType === t && P[k].status === 'enrolled'; }).length; };
      var attention = ids.filter(function (k) { return P[k].attention || (P[k].status === 'enrolled' && (!P[k].consent || P[k].consent.status !== 'granted')); });
      var awaiting = ids.filter(function (k) { return P[k].status === 'awaiting_photo'; }).length;
      var wk = Date.now() - 7 * 86400000, recent = D.attempts.filter(function (a) { return u.msOf(a.at) >= wk; });
      var st = c.status;
      var statusCard = '<div class="att-banner' + (st === 'enabled' ? '' : st === 'suspended' ? ' urgent' : ' lock') + '"><div class="ic">' + icon(st === 'enabled' ? 'fa-face-smile' : st === 'suspended' ? 'fa-circle-pause' : 'fa-power-off') + '</div><div class="t">' +
        '<b>Facial recognition is ' + (st === 'enabled' ? 'ENABLED' : st === 'suspended' ? 'SUSPENDED' : 'DISABLED') + '</b><small>' +
        (st === 'enabled' ? 'Enrolled tutors' + (c.studentsApproved ? ' and students' : ' (students not yet approved)') + ' see a face option next to the normal check-in. The normal check-in always stays.' :
          st === 'suspended' ? 'No recognition attempts are accepted. Enrollment records are kept; students and tutors see only the normal check-in.' :
          'Nobody sees any face option, no camera is requested, and no biometric data is processed. Everyone uses the normal check-in.') + '</small></div>' +
        '<div class="att-row-actions">' + (st !== 'enabled' ? '<button type="button" class="att-btn primary" data-fs="enabled">' + icon('fa-play') + ' Enable</button>' : '') +
        (st === 'enabled' ? '<button type="button" class="att-btn" data-fs="suspended">' + icon('fa-pause') + ' Suspend</button>' : '') +
        (st !== 'disabled' ? '<button type="button" class="att-btn danger" data-fs="disabled">' + icon('fa-power-off') + ' Disable</button>' : '') + '</div></div>';
      var stats = '<div class="att-stats">' +
        '<div class="att-stat"><b>' + nEnrolled('student') + '</b><span>Students enrolled</span></div>' +
        '<div class="att-stat"><b>' + nEnrolled('tutor') + '</b><span>Tutors enrolled</span></div>' +
        '<div class="att-stat"><b>' + awaiting + '</b><span>Consent given, awaiting photo</span></div>' +
        '<div class="att-stat ' + (attention.length ? 'warn' : '') + '"><b>' + attention.length + '</b><span>Need attention</span></div>' +
        '<div class="att-stat"><b>' + recent.filter(function (a) { return a.result === 'matched'; }).length + ' / ' + recent.length + '</b><span>Recognised / attempts (7 days)</span></div></div>';
      var how = '<div class="att-panel"><h4>' + icon('fa-microchip') + ' How recognition works</h4>' +
        '<div class="att-kv"><span>Where</span><b>On each person\'s own device (face-api.js, TensorFlow.js)</b><span>Sent to Paisley</span><b>128 numbers describing the face; never a picture</b>' +
        '<span>Matching</span><b>Cloud Functions compare those numbers with the person\'s own enrolled ones</b><span>Stored</span><b>Enrolled numbers only, readable by no browser (not even the Studio Desk)</b></div>' +
        '<p class="att-muted">The face model is downloaded to a device only when someone opens a face option. Reference photos are read on the admin\'s computer and are not uploaded.</p></div>';
      var safeguards = '<div class="att-panel"><h4>' + icon('fa-shield-halved') + ' Safeguards and settings</h4>' +
        '<div class="att-kv"><span>Student processing</span><b>' + (c.studentsApproved ? '<span class="att-pill ok">Approved</span> DPIA ' + esc((c.dpia && c.dpia.reference) || '') + ' · ' + u.dayLabel(c.dpia && c.dpia.at) : '<span class="att-pill wait">Not approved: students cannot be enrolled or recognised</span>') + '</b>' +
        '<span>Match distance</span><b>' + Number(c.maxDistance).toFixed(2) + ' <span class="att-muted">(0 = identical; a larger distance is refused)</span></b>' +
        '<span>Attempt logs kept</span><b>' + c.retentionDays + ' days</b></div>' +
        '<div class="att-row-actions" style="margin-top:.6rem">' + (c.studentsApproved ? '<button type="button" class="att-btn sm danger" data-fstud="0">' + icon('fa-ban') + ' Withdraw student approval</button>' : '<button type="button" class="att-btn sm" data-fstud="1">' + icon('fa-clipboard-check') + ' Approve student processing</button>') +
        '<button type="button" class="att-btn sm" data-fcfg>' + icon('fa-sliders') + ' Change match distance and retention</button></div>' +
        '<p class="att-muted">Before students are approved: a completed Data Protection Impact Assessment (Kenya Data Protection Act 2019; biometric data is sensitive personal data), parent or guardian consent for each child, the normal check-in kept for anyone who does not consent, and FACE_TEMPLATE_KEY set so enrolled face data is encrypted.</p></div>';
      var list = sub === 'students' ? D.students : D.tutors, type = sub === 'students' ? 'student' : 'tutor';
      var rows = list.filter(function (p) { return !q || (String(p.name || '') + ' ' + p.id + ' ' + (p.email || '')).toLowerCase().indexOf(q.toLowerCase()) !== -1; }).slice(0, 300);
      var people = '<div class="att-wrap"><table class="att-table"><thead><tr><th>' + (type === 'student' ? 'Student' : 'Tutor') + '</th><th>Account ID</th><th>Consent</th><th>Enrollment</th><th>Last recognised</th><th></th></tr></thead><tbody>' +
        rows.map(function (p) {
          var f = P[p.id] || {}, con = f.consent ? f.consent.status : 'none', en = f.status || 'not_enrolled';
          return '<tr class="' + (f.attention ? 'flag' : '') + '"><td><b>' + esc(p.name || '—') + '</b>' + (type === 'student' ? '<div class="att-muted">' + esc((p.keyStage || '').replace(/\s*\(.*/, '')) + (p.status && p.status !== 'Active' ? ' · ' + esc(p.status) : '') + '</div>' : '') +
            (f.attention ? '<div class="att-muted" style="color:#b8362a">' + icon('fa-triangle-exclamation') + ' ' + esc(f.attention.reason) + '</div>' : '') + '</td>' +
            '<td class="att-muted"><code>' + esc(p.id) + '</code></td><td>' + tag(CONSENT, con) + (f.consent ? '<div class="att-muted">' + esc(f.consent.givenBy || '') + (f.consent.relationship ? ' (' + esc(f.consent.relationship) + ')' : '') + ' · ' + u.dayLabel(f.consent.at) + '</div>' : '') + '</td>' +
            '<td>' + tag(ENROL, en) + (f.enrolledAt ? '<div class="att-muted">' + u.dayLabel(f.enrolledAt) + '</div>' : '') + '</td><td>' + (f.lastMatchedAt ? u.dayLabel(f.lastMatchedAt) + ' ' + u.hm(f.lastMatchedAt) : '—') + '</td>' +
            '<td><div class="att-row-actions">' +
            '<button type="button" class="att-btn sm" data-fcon="' + esc(p.id) + '" data-t="' + type + '" data-d="' + (con === 'granted' ? 'withdrawn' : 'granted') + '">' + icon(con === 'granted' ? 'fa-user-xmark' : 'fa-file-signature') + (con === 'granted' ? ' Withdraw consent' : ' Record consent') + '</button>' +
            (con === 'granted' ? '<button type="button" class="att-btn sm primary" data-fup="' + esc(p.id) + '" data-t="' + type + '">' + icon('fa-upload') + (en === 'enrolled' ? ' Replace photos' : ' Add photos') + '</button>' : '') +
            (en === 'enrolled' ? '<button type="button" class="att-btn sm danger" data-frm="' + esc(p.id) + '" data-t="' + type + '">' + icon('fa-trash') + ' Remove</button>' : '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' + (rows.length ? '' : '<div class="att-empty">Nobody matches.</div>');
      var activity = D.attempts.length ? '<div class="att-wrap"><table class="att-table"><thead><tr><th>When</th><th>Person</th><th>Purpose</th><th>Result</th><th>Distance / limit</th></tr></thead><tbody>' + D.attempts.map(function (a) {
        return '<tr><td>' + u.dayLabel(a.at) + ' ' + u.hm(a.at) + '</td><td><b>' + esc(a.personName || a.personId) + '</b><div class="att-muted">' + esc(a.personType) + ' · <code>' + esc(a.personId) + '</code></div></td><td>' + (a.purpose === 'tutor_verification' ? 'Tutor verification' : 'Student check-in') + '</td>' +
          '<td>' + tag(RESULT, a.result) + '</td><td>' + (a.distance == null ? '—' : Number(a.distance).toFixed(3) + ' / ' + Number(a.maxDistance || 0).toFixed(2)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="att-empty">No recognition attempts yet.</div>';
      var changes = D.log.length ? D.log.map(function (l) {
        return '<div style="border-bottom:1px solid #eef3f2;padding:.4rem 0"><b>' + esc(ACTION[l.action] || l.action) + '</b> <span class="att-muted">' + u.dayLabel(l.at) + ' ' + u.hm(l.at) + ' · ' + esc(l.actorName || '') + ' (' + esc(l.actorRole || '') + ')' + (l.personId ? ' · ' + esc(l.personType || '') + ' <code>' + esc(l.personId) + '</code>' : '') + '</span>' + (l.reason ? '<div class="att-muted">"' + esc(l.reason) + '"</div>' : '') + '</div>';
      }).join('') : '<div class="att-empty">No changes recorded yet.</div>';
      var tabs = [['students', 'Student profiles'], ['tutors', 'Tutor profiles'], ['attention', 'Need attention', attention.length], ['activity', 'Recognition activity'], ['log', 'Change log']];
      el.innerHTML = statusCard + stats + '<div class="att-grid2">' + how + safeguards + '</div>' +
        '<div class="att-tabs" style="margin-top:1rem">' + tabs.map(function (t) { return '<button type="button" data-fsub="' + t[0] + '" class="' + (sub === t[0] ? 'on' : '') + '">' + t[1] + (t[2] ? '<span class="n">' + t[2] + '</span>' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="att-panel">' + (sub === 'students' || sub === 'tutors' ? '<div class="att-filters" style="margin-bottom:.6rem"><label>Search ' + (sub === 'students' ? 'students' : 'tutors') + '<input data-fq value="' + esc(q) + '" placeholder="Name, email or account ID"></label></div>' + people :
          sub === 'attention' ? (attention.length ? attention.map(function (k) { var f = P[k]; return '<div style="border-bottom:1px solid #eef3f2;padding:.45rem 0"><b>' + esc(f.name) + '</b> <span class="att-muted">' + esc(f.personType) + ' · <code>' + esc(k) + '</code></span> ' + tag(ENROL, f.status) + '<div class="att-muted">' + esc((f.attention && f.attention.reason) || 'Enrolled without valid consent: remove the enrollment.') + '</div></div>'; }).join('') : '<div class="att-empty">Nothing needs attention.</div>') :
          sub === 'activity' ? activity : changes) + '</div>' +
        '<p class="att-muted">' + icon('fa-lock') + ' No picture is ever stored or sent: faces are read on the device. Paisley keeps consent, enrollment status, the enrolled face numbers (no browser can read them) and attempt results (who, when, result, distance).</p>';
      var fq = el.querySelector('[data-fq]');
      if (fq && document.activeElement !== fq && el.dataset.fqFocus === '1') { fq.focus(); fq.setSelectionRange(fq.value.length, fq.value.length); }
    }
    function fa(data, ok) { return u.call('faceAdmin', data).then(function (r) { if (ok) u.toast(ok); return r; }).catch(function (e) { alert(u.errMsg(e)); return null; }); }
    el.addEventListener('input', function (e) { if (e.target.dataset && e.target.dataset.fq != null) { q = e.target.value; el.dataset.fqFocus = '1'; paint(); } });
    el.addEventListener('focusout', function (e) { if (e.target.dataset && e.target.dataset.fq != null) el.dataset.fqFocus = '0'; });
    el.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return; var b;
      if ((b = t.closest('[data-fsub]'))) { sub = b.dataset.fsub; paint(); return; }
      if ((b = t.closest('[data-fs]'))) {
        var st = b.dataset.fs;
        u.askReason(st === 'enabled' ? 'Enable facial recognition' : st === 'suspended' ? 'Suspend facial recognition' : 'Disable facial recognition',
          st === 'enabled' ? 'Why is it being enabled? (recorded in the change log)' : 'Why? New recognition attempts stop at once and everyone falls back to the normal check-in.')
          .then(function (r) { if (r) fa({ action: 'status', status: st, reason: r.reason }, 'Facial recognition ' + st); });
        return;
      }
      if ((b = t.closest('[data-fcfg]'))) {
        var c = cfg();
        u.askReason('Recognition settings', 'Why are these changing?', '<label class="att-field">Match distance (0.35 strict to 0.60 lenient; 0.50 recommended)<input data-extra="maxDistance" type="number" step="0.01" min="0.35" max="0.6" value="' + c.maxDistance + '"></label>' +
          '<label class="att-field">Keep recognition attempt logs for (days)<input data-extra="retentionDays" type="number" min="7" max="730" value="' + c.retentionDays + '"></label>')
          .then(function (r) { if (r) fa({ action: 'config', maxDistance: Number(r.extra.maxDistance), retentionDays: Number(r.extra.retentionDays), reason: r.reason }, 'Settings saved'); });
        return;
      }
      if ((b = t.closest('[data-fstud]'))) {
        if (b.dataset.fstud === '1') {
          u.askReason('Approve student biometric processing', 'Who approved it and on what basis?', '<label class="att-field">Data Protection Impact Assessment reference<input data-extra="dpia" maxlength="200" placeholder="e.g. DPIA-2026-03, approved by the Board"></label>' +
            '<label class="att-field">I confirm: parent or guardian consent is collected for each child before enrollment; the normal check-in stays for everyone; FACE_TEMPLATE_KEY is set so enrolled face data is encrypted; the retention and deletion policy is published.<select data-extra="confirm"><option value="">Choose…</option><option value="yes">Yes, all of these are in place</option></select></label>')
            .then(function (r) { if (!r) return; if (r.extra.confirm !== 'yes') { alert('Confirm the safeguards first.'); return; } fa({ action: 'students', approve: true, confirm: true, dpiaReference: r.extra.dpia, reason: r.reason }, 'Student processing approved'); });
        } else {
          u.askReason('Withdraw student approval', 'Why? Students stop seeing the face option at once. Enrollments are kept until you remove them.').then(function (r) { if (r) fa({ action: 'students', approve: false, reason: r.reason }, 'Student approval withdrawn'); });
        }
        return;
      }
      if ((b = t.closest('[data-fcon]'))) {
        var pid = b.dataset.fcon, type = b.dataset.t, dec = b.dataset.d;
        if (dec === 'withdrawn') {
          u.askReason('Withdraw consent', 'Who withdrew consent, and how? The enrollment and every stored face example are deleted.').then(function (r) { if (r) fa({ action: 'consent', personId: pid, personType: type, decision: 'withdrawn', givenBy: r.reason, reason: r.reason }, 'Consent withdrawn and face data deleted'); });
        } else {
          u.askReason('Record consent', 'Notes (recorded with the consent)', '<label class="att-field">Consent given by (full name)<input data-extra="givenBy" maxlength="120"></label>' +
            '<label class="att-field">Relationship<select data-extra="relationship">' + (type === 'student' ? '<option value="parent">Parent</option><option value="guardian">Guardian</option><option value="adult student (18 or over)">Student, 18 or over</option>' : '<option value="self (adult tutor)">The tutor (adult)</option>') + '</select></label>' +
            '<label class="att-field">How<select data-extra="method"><option value="signed_form">Signed consent form</option><option value="email">Email</option><option value="in_person">In person</option></select></label>' +
            '<label class="att-field">Document reference<input data-extra="reference" maxlength="200" placeholder="e.g. form number or file name"></label>')
            .then(function (r) { if (!r) return; if ((r.extra.givenBy || '').trim().length < 3) { alert('Write who gave consent.'); return; } fa({ action: 'consent', personId: pid, personType: type, decision: 'granted', givenBy: r.extra.givenBy, relationship: r.extra.relationship, method: r.extra.method, reference: r.extra.reference, reason: r.reason }, 'Consent recorded'); });
        }
        return;
      }
      if ((b = t.closest('[data-fup]'))) {
        var id2 = b.dataset.fup, ty2 = b.dataset.t, btn = b;
        pickFiles().then(function (files) {
          if (!files || !files.length) return null;
          btn.disabled = true; btn.innerHTML = icon('fa-spinner fa-spin') + ' Reading faces…';
          return photoDescriptors(files);
        }).then(function (descs) {
          if (!descs) return;
          btn.innerHTML = icon('fa-spinner fa-spin') + ' Enrolling…';
          return fa({ action: 'enroll', personId: id2, personType: ty2, descriptors: descs }).then(function (r) { if (r) u.toast((r.replaced ? 'Photos replaced' : 'Enrolled') + ' (' + r.photos + ' photo' + (r.photos > 1 ? 's' : '') + ')'); paint(); });
        }).catch(function (e) { btn.disabled = false; alert(u.errMsg(e)); paint(); });
        return;
      }
      if ((b = t.closest('[data-frm]'))) {
        var id3 = b.dataset.frm, ty3 = b.dataset.t;
        u.askReason('Remove recognition enrollment', 'Why? The enrolled face data is deleted; consent records stay.').then(function (r) { if (r) fa({ action: 'remove', personId: id3, personType: ty3, reason: r.reason }, 'Enrollment removed'); });
      }
    });
    return { destroy: function () { unsubs.forEach(function (x) { x(); }); } };
  }

  /* =========================================================
     PARENT — consent card for one child (only when offered,
     or when consent was given and can be withdrawn)
  ========================================================= */
  function mountConsent(el, o) {
    var u = U(), icon = u.icon, esc = u.esc;
    if (!el || !o.childId) return;
    u.call('faceConsent', { action: 'status', studentId: o.childId }).then(function (s) {
      if (!s || (!s.enabled && s.consent !== 'granted')) { el.innerHTML = ''; return; }
      var granted = s.consent === 'granted';
      el.innerHTML = '<div class="att-panel"><h4>' + icon('fa-face-smile') + ' Face check-in (optional)</h4>' +
        '<p class="att-muted">Paisley can let ' + esc(o.childName || 'your child') + ' register attendance by showing their face to the camera, instead of pressing I\'m Here. It is optional: the normal check-in always works. Their face is read on their own device: no picture is ever sent or stored. Paisley keeps only numbers describing the face, which no browser can read, and deletes them when you withdraw consent.</p>' +
        '<div class="att-kv"><span>Your consent</span><b>' + tag(CONSENT, s.consent || 'none') + '</b><span>Enrollment</span><b>' + (s.enrolled ? '<span class="att-pill ok">Enrolled</span>' : granted ? '<span class="att-pill info">The Studio Desk adds reference photos</span>' : '—') + '</b></div>' +
        '<div class="att-row-actions" style="margin-top:.6rem">' + (granted ? '<button type="button" class="att-btn danger" data-fc="withdraw">' + icon('fa-user-xmark') + ' Withdraw consent and delete face data</button>' :
          s.enabled ? '<button type="button" class="att-btn primary" data-fc="grant">' + icon('fa-file-signature') + ' I give consent</button>' : '') + '</div><div class="att-msg" data-fm></div></div>';
      el.querySelectorAll('[data-fc]').forEach(function (b) {
        b.onclick = function () {
          var act = b.dataset.fc;
          if (!confirm(act === 'grant' ? 'Give consent for face check-in for ' + (o.childName || 'your child') + '? You can withdraw it at any time.' : 'Withdraw consent? Face data is deleted and the normal check-in is used.')) return;
          b.disabled = true;
          u.call('faceConsent', { action: act, studentId: o.childId }).then(function () { mountConsent(el, o); }).catch(function (e) { b.disabled = false; var m = el.querySelector('[data-fm]'); m.className = 'att-msg bad'; m.textContent = u.errMsg(e); });
        };
      });
    }).catch(function () { el.innerHTML = ''; });
  }

  return { camera: camera, photoDescriptors: photoDescriptors, loadModels: loadModels, mountAdmin: mountAdmin, mountConsent: mountConsent };
})();
