/* =========================================================
   PAPER HAND-INS — Paisley Studio (tutor + admin work screens)
   -----------------------------------------------------------
   Some students attend at school and hand in on paper. They have no
   upload, so without this they look overdue forever and get reminders.

     students/{uid}.physicalStudent = true
       set here or in the admin student window. Stops upload reminders and
       overdue notices (functions/deadlines.js) and replaces "Overdue" with
       "Paper hand-in at school".

     submissions/{uid} with handIn: 'physical'
       written by staff when the paper arrives or is marked, so every count,
       report and parent view treats it like any other hand-in. A Graded one
       sends the usual results email (functions/work.js).

   Works for any student on any item, flagged or not. The work screens in
   work-helpers.js and publish-helpers.js (admin) both render through here.
========================================================= */
(function (global) {
  'use strict';

  function util() { return global.ClassroomUI.util; }
  function esc(s) { return util().esc(s); }
  function FV() { return firebase.firestore.FieldValue; }

  function isFlagged(s) { return !!(s && s.physicalStudent === true); }
  function isPaperSub(sub) { return !!(sub && sub.handIn === 'physical'); }
  // Staff can record against a student with no hand-in, or adjust an earlier paper record.
  function canRecord(sub) { return !sub || isPaperSub(sub); }

  function injectStyle() {
    if (document.getElementById('pp-style')) return;
    var st = document.createElement('style');
    st.id = 'pp-style';
    st.textContent = [
      '.pp-bar{background:#F4F8FF;border:1.5px solid #C9DBF5;border-radius:12px;padding:.7rem .85rem;margin:0 0 .8rem}',
      '.pp-bar h4{margin:0 0 .2rem;font-size:.8rem;color:#2F5FA8}',
      '.pp-bar .cr-note{margin-bottom:.5rem}',
      '.pp-chip{display:inline-flex;align-items:center;gap:.25rem;margin-left:.4rem;padding:.08rem .45rem;border-radius:99px;background:#E6ECFF;color:#243b73;font-size:.65rem;font-weight:800;white-space:nowrap}',
      '.pp-score{display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.35rem 0;border-bottom:1px solid var(--line,rgba(38,51,49,.1))}',
      '.pp-score input{width:6rem}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function panelHtml() {
    injectStyle();
    return '<div class="pp-bar"><h4><i class="fas fa-school"></i> Paper hand-ins</h4>' +
      '<div class="cr-note">For students who hand in on paper at school. Tick them, then record what happened. A student set as paper stops getting upload reminders and overdue notices.</div>' +
      '<div class="cr-actions" style="flex-wrap:wrap">' +
        '<label class="cr-note" style="margin:0;display:inline-flex;gap:.35rem;align-items:center;cursor:pointer"><input type="checkbox" data-pp="all"> All</label>' +
        '<button type="button" class="cr-btn sm" data-pp="received"><i class="fas fa-inbox"></i> Mark received</button>' +
        '<button type="button" class="cr-btn sm" data-pp="graded"><i class="fas fa-circle-check"></i> Mark graded</button>' +
        '<button type="button" class="cr-btn sm" data-pp="flag"><i class="fas fa-school"></i> Set as paper student</button>' +
        '<button type="button" class="cr-btn sm" data-pp="unflag"><i class="fas fa-laptop"></i> Set as uploading student</button>' +
      '</div><div class="cr-err" data-pp-err style="margin-top:.4rem"></div></div>';
  }
  function checkCell(s) {
    return '<td style="width:1.6rem"><input type="checkbox" data-pp-s="' + esc(s.id) + '" aria-label="Select ' + esc(s.name || 'student') + '"></td>';
  }
  function chip(s) {
    return isFlagged(s) ? '<span class="pp-chip"><i class="fas fa-school"></i> Paper</span>' : '';
  }
  function rowButtons(s, sub) {
    var id = esc(s.id), h = '';
    if (isPaperSub(sub)) {
      h += '<button type="button" class="cr-btn sm primary" data-pp-one="graded" data-s="' + id + '"><i class="fas fa-pen-nib"></i> ' + (sub.status === 'Graded' ? 'Edit grade' : 'Grade') + '</button>';
      h += '<button type="button" class="cr-btn sm" data-pp-one="undo" data-s="' + id + '"><i class="fas fa-rotate-left"></i> Undo</button>';
    } else if (!sub && isFlagged(s)) {
      h += '<button type="button" class="cr-btn sm" data-pp-one="received" data-s="' + id + '"><i class="fas fa-inbox"></i> Received</button>';
      h += '<button type="button" class="cr-btn sm primary" data-pp-one="graded" data-s="' + id + '"><i class="fas fa-circle-check"></i> Graded</button>';
    }
    return h;
  }

  /* The first paper write for a student creates the record; later ones only change the result. */
  function baseRecord(s, sub, user) {
    var d = { handIn: 'physical', studentId: s.id, updatedAt: FV().serverTimestamp() };
    if (!sub) {
      d.studentName = s.name || ''; d.studentEmail = s.email || '';
      d.status = 'Submitted'; d.released = false; d.fileUrl = ''; d.fileName = ''; d.textAnswer = '';
      d.receivedBy = user.uid; d.receivedByName = user.name || ''; d.receivedAt = FV().serverTimestamp();
      d.createdAt = FV().serverTimestamp(); d.submittedAt = FV().serverTimestamp();
    }
    return d;
  }

  async function commit(writes) {
    for (var i = 0; i < writes.length; i += 400) {
      var b = db.batch();
      writes.slice(i, i + 400).forEach(function (w) { w(b); });
      await b.commit();
    }
  }

  function openGradeModal(list, ctx, onSaved) {
    var U = util(), first = list[0], one = list.length === 1;
    var m = U.openModal({ title: one ? 'Mark graded — ' + (first.s.name || 'student') : 'Mark graded — ' + list.length + ' students' });
    var firstSub = first.sub || {};
    m.body.innerHTML = '<div class="cr-note" style="margin-bottom:.6rem">Enter what you marked on paper. The student and parents get the result, just as for uploaded work.</div>' +
      '<div class="cr-field"><label>Out of (optional)</label><input type="number" id="ppMax" min="0" step="any" value="' + (firstSub.maxScore != null ? esc(firstSub.maxScore) : '') + '"></div>' +
      '<div class="cr-field"><label>Score</label>' + list.map(function (r) {
        var cur = r.sub && r.sub.grade != null ? esc(r.sub.grade) : '';
        return '<div class="pp-score"><span>' + esc(r.s.name || r.s.email || r.s.id) + '</span><input type="number" min="0" step="any" data-score="' + esc(r.s.id) + '" value="' + cur + '" aria-label="Score for ' + esc(r.s.name || 'student') + '"></div>';
      }).join('') + '</div>' +
      '<div class="cr-field"><label>Feedback (optional)' + (one ? '' : ' — sent to all of them') + '</label><textarea id="ppFb" rows="3" style="width:100%">' + esc(firstSub.feedback || '') + '</textarea></div>';
    m.foot.innerHTML = '<span class="cr-err" id="ppErr"></span><button type="button" class="cr-btn" data-a="x">Cancel</button><button type="button" class="cr-btn primary" data-a="go"><i class="fas fa-check"></i> Save grades</button>';
    m.foot.querySelector('[data-a="x"]').onclick = function () { m.close(); };
    m.foot.querySelector('[data-a="go"]').onclick = async function () {
      var btn = this, err = m.foot.querySelector('#ppErr');
      var maxRaw = m.body.querySelector('#ppMax').value.trim(), max = maxRaw === '' ? null : Number(maxRaw);
      var feedback = m.body.querySelector('#ppFb').value.trim();
      var writes = [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i], raw = m.body.querySelector('[data-score="' + r.s.id + '"]').value.trim();
        var score = raw === '' ? null : Number(raw);
        if (score == null && !feedback) { err.textContent = 'Enter a score or feedback for ' + (r.s.name || 'each student') + '.'; return; }
        if (score != null && (isNaN(score) || score < 0)) { err.textContent = 'Scores must be numbers.'; return; }
        if (score != null && max != null && score > max) { err.textContent = (r.s.name || 'A student') + ': the score is higher than the maximum.'; return; }
        writes.push((function (row, sc) {
          return function (b) {
            b.set(ctx.col.doc(row.s.id), Object.assign(baseRecord(row.s, row.sub, ctx.user), {
              status: 'Graded', grade: sc, maxScore: max, feedback: feedback, released: true,
              gradedBy: ctx.user.uid, gradedByName: ctx.user.name || '',
              gradedAt: FV().serverTimestamp(), releasedAt: FV().serverTimestamp()
            }), { merge: true });
          };
        })(r, score));
      }
      btn.disabled = true;
      try { await commit(writes); m.close(true); await onSaved(); }
      catch (e) { btn.disabled = false; err.textContent = 'Could not save: ' + (e.code === 'permission-denied' ? 'you do not have permission for this classroom.' : (e.message || e)); }
    };
  }

  /* ctx: { col (submissions collection), students, subs, user, onDone } */
  function wire(root, ctx) {
    var byId = {};
    (ctx.students || []).forEach(function (s) { byId[s.id] = s; });
    var boxes = root.querySelectorAll('[data-pp-s]');
    var errEl = root.querySelector('[data-pp-err]');
    function fail(e) { if (errEl) errEl.textContent = (e.code === 'permission-denied' ? 'You do not have permission to change one of these students.' : (e.message || String(e))); }
    function row(sid) { return { s: byId[sid] || { id: sid }, sub: ctx.subs[sid] || null }; }
    function ticked() { return Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return row(b.dataset.ppS); }); }
    function needTicks() { if (errEl) errEl.textContent = 'Tick at least one student first.'; }

    async function markReceived(list) {
      var todo = list.filter(function (r) { return !r.sub; });
      await commit(todo.map(function (r) { return function (b) { b.set(ctx.col.doc(r.s.id), baseRecord(r.s, null, ctx.user), { merge: true }); }; }));
      await ctx.onDone();
    }
    function markGraded(list) {
      var ok = list.filter(function (r) { return canRecord(r.sub); });
      if (ok.length < list.length) { if (errEl) errEl.textContent = 'Students who uploaded their work are graded from their upload, so they were left out.'; }
      if (ok.length) openGradeModal(ok, ctx, ctx.onDone);
    }
    async function setFlag(list, on) {
      await commit(list.map(function (r) { return function (b) {
        b.update(db.collection('students').doc(r.s.id), { physicalStudent: on, physicalSetBy: ctx.user.uid, physicalSetAt: FV().serverTimestamp() });
      }; }));
      await ctx.onDone();
    }

    var all = root.querySelector('[data-pp="all"]');
    if (all) all.onchange = function () { Array.prototype.forEach.call(boxes, function (b) { b.checked = all.checked; }); };
    Array.prototype.forEach.call(root.querySelectorAll('[data-pp]'), function (btn) {
      if (btn.dataset.pp === 'all') return;
      btn.onclick = function () {
        var list = ticked();
        if (!list.length) return needTicks();
        if (errEl) errEl.textContent = '';
        var a = btn.dataset.pp;
        if (a === 'graded') return markGraded(list);
        btn.disabled = true;
        (a === 'received' ? markReceived(list) : setFlag(list, a === 'flag')).catch(function (e) { btn.disabled = false; fail(e); });
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-pp-one]'), function (btn) {
      btn.onclick = async function () {
        var r = row(btn.dataset.s), a = btn.dataset.ppOne;
        if (a === 'graded') return markGraded([r]);
        btn.disabled = true;
        try {
          if (a === 'received') await markReceived([r]);
          else if (await PaisleyUI.confirm('Remove the paper record for ' + (r.s.name || 'this student') + '? They will show as not handed in again.', { title: 'Undo paper hand-in?', confirmLabel: 'Yes, undo', danger: true })) {
            await ctx.col.doc(r.s.id).delete();
            await ctx.onDone();
          } else btn.disabled = false;
        } catch (e) { btn.disabled = false; fail(e); }
      };
    });
  }

  global.PaperHandIns = {
    isFlagged: isFlagged, isPaperSub: isPaperSub, canRecord: canRecord,
    panelHtml: panelHtml, checkCell: checkCell, chip: chip, rowButtons: rowButtons, wire: wire
  };
})(window);
