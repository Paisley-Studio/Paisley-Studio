/* =========================================================
   Tech Studio (admin) > Controls
   ---------------------------------------------------------
   Who can use the Advanced Paisley IDE. Saved as techSettings/advancedIde:
     { enabled, levels: ['beginner' | 'intermediate' | 'expert'], students: [uid], updatedAt, updatedBy, updatedByName }
   A builder has it when it is enabled AND (their level is ticked OR they are picked by name).
   A builder with no level counts as intermediate (TechUI.trackOf), like everywhere else.
   Coaches and admins can always open builders' projects to review them.
   The same test is applied in the builder portal, on /tech/ide, in firestore.rules
   (advancedIdeAllowed) and in runCode, so hiding the button is never the only lock.

   TechControls.mount(el, { students, me }) -> { setStudents(list), destroy() }
========================================================= */
(function (g) {
  'use strict';
  var T = g.TechUI;
  var FV = function () { return firebase.firestore.FieldValue; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LEVELS = ['beginner', 'intermediate', 'expert'];
  var LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
  function levelOf(s) { return LEVELS.indexOf(s.skillLevel) > -1 ? s.skillLevel : 'intermediate'; }
  function hasAccess(cfg, s) { return !!cfg.enabled && (cfg.students.indexOf(s.id) > -1 || cfg.levels.indexOf(levelOf(s)) > -1); }

  var CSS = '' +
    '.tcx{display:flex;flex-direction:column;gap:1rem}' +
    '.tcx-card{border:1px solid var(--line,rgba(38,51,49,.1));border-radius:16px;padding:1.1rem 1.2rem;background:#fff}' +
    '.tcx-card h4{margin:0 0 .25rem;font-size:1rem;color:var(--brand-deep,#245F5A);display:flex;align-items:center;gap:.5rem}' +
    '.tcx-card>p{margin:0 0 .9rem;color:var(--muted,#5A6E6A);font-size:.86rem;line-height:1.5}' +
    '.tcx-head{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;background:#0F1A18;color:#D9E7E3;border-color:rgba(123,203,194,.2)}' +
    '.tcx-head .ic{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:rgba(245,200,66,.14);color:#F5C842;font-size:1.15rem;flex:none}' +
    '.tcx-head .t{flex:1;min-width:220px}.tcx-head b{display:block;font-size:1.05rem;color:#fff}.tcx-head span{font-size:.84rem;color:#A9C2BC}' +
    '.tcx-switch{display:inline-flex;align-items:center;gap:.6rem;font-weight:700;cursor:pointer;color:#fff}' +
    '.tcx-switch input{appearance:none;width:48px;height:26px;border-radius:999px;background:#3a4a47;position:relative;cursor:pointer;transition:background .2s;margin:0}' +
    '.tcx-switch input::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}' +
    '.tcx-switch input:checked{background:#55BFB3}.tcx-switch input:checked::after{transform:translateX(22px)}' +
    '.tcx-switch input:focus-visible{outline:3px solid #F5C842;outline-offset:2px}' +
    '.tcx-levels{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.6rem}' +
    '.tcx-level{display:flex;align-items:center;gap:.7rem;padding:.75rem .85rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:12px;cursor:pointer;font-weight:700;transition:border-color .15s,background .15s}' +
    '.tcx-level:has(input:checked){border-color:var(--brand,#55BFB3);background:rgba(85,191,179,.08)}' +
    '.tcx-level input{width:18px;height:18px;accent-color:#245F5A}.tcx-level small{display:block;font-weight:600;color:var(--muted,#5A6E6A);font-size:.75rem}' +
    '.tcx-tools{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.7rem}' +
    '.tcx-tools input[type=search]{flex:1;min-width:200px;padding:.55rem .75rem;border:1.5px solid var(--line,rgba(38,51,49,.12));border-radius:10px;font:inherit}' +
    '.tcx-chip{border:1.5px solid var(--line,rgba(38,51,49,.12));background:#fff;border-radius:999px;padding:.35rem .75rem;font:inherit;font-size:.78rem;font-weight:700;color:var(--ink,#263331);cursor:pointer}' +
    '.tcx-chip.on{background:var(--brand-deep,#245F5A);border-color:var(--brand-deep,#245F5A);color:#fff}' +
    '.tcx-list{max-height:460px;overflow:auto;border:1px solid var(--line,rgba(38,51,49,.08));border-radius:12px}' +
    '.tcx-row{display:flex;align-items:center;gap:.75rem;padding:.6rem .8rem;border-bottom:1px solid var(--line,rgba(38,51,49,.06));cursor:pointer}' +
    '.tcx-row:last-child{border-bottom:0}.tcx-row:hover{background:var(--paper,#F4F8F7)}' +
    '.tcx-row input{width:18px;height:18px;accent-color:#245F5A;flex:none}' +
    '.tcx-row .n{flex:1;min-width:0}.tcx-row .n b{display:block;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tcx-row .n span{font-size:.75rem;color:var(--muted,#5A6E6A)}' +
    '.tcx-tag{font-size:.68rem;font-weight:800;padding:.15rem .5rem;border-radius:999px;background:var(--paper,#F4F8F7);color:var(--muted,#5A6E6A);white-space:nowrap}' +
    '.tcx-tag.ok{background:rgba(46,184,114,.12);color:#1d8b57}.tcx-tag.pz{background:rgba(85,191,179,.14);color:#245F5A}' +
    '.tcx-save{position:sticky;bottom:0;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;padding:.85rem 1rem;border-radius:14px;background:#fff;border:1px solid var(--line,rgba(38,51,49,.12));box-shadow:0 -6px 20px rgba(36,95,90,.06)}' +
    '.tcx-save .sum{flex:1;min-width:200px;font-size:.86rem;font-weight:600;color:var(--muted,#5A6E6A)}.tcx-save .sum b{color:var(--ink,#263331)}' +
    '.tcx-dirty{color:#b06d00;font-weight:800}';

  function mount(el, o) {
    if (!document.getElementById('tcx-css')) { var st = document.createElement('style'); st.id = 'tcx-css'; st.textContent = CSS; document.head.appendChild(st); }
    var students = o.students || [], saved = null, draft = null, dead = false, q = '', filter = 'all', busy = false;
    var ref = db.collection('techSettings').doc('advancedIde');
    var unsub = ref.onSnapshot(function (s) {
      var d = s.exists ? s.data() : {};
      saved = { enabled: d.enabled === true, levels: (d.levels || []).filter(function (l) { return LEVELS.indexOf(l) > -1; }), students: (d.students || []).slice(), updatedAt: d.updatedAt, updatedByName: d.updatedByName || '' };
      if (!draft || !dirty()) draft = { enabled: saved.enabled, levels: saved.levels.slice(), students: saved.students.slice() };
      paint();
    }, function (e) { el.innerHTML = '<div class="cr-empty">Could not load the controls: ' + esc(T.errMsg(e)) + '</div>'; });

    function active() { return students.filter(function (s) { return s.status === 'Active'; }); }
    function dirty() {
      if (!saved || !draft) return false;
      var a = JSON.stringify([draft.enabled, draft.levels.slice().sort(), draft.students.slice().sort()]);
      var b = JSON.stringify([saved.enabled, saved.levels.slice().sort(), saved.students.slice().sort()]);
      return a !== b;
    }
    function rowsHtml() {
      var list = active().filter(function (s) {
        if (q && (String(s.name || '') + ' ' + String(s.email || '')).toLowerCase().indexOf(q) === -1) return false;
        if (filter === 'admitted') return !!s.admittedFrom;
        if (filter === 'applied') return !s.admittedFrom;
        if (filter === 'picked') return draft.students.indexOf(s.id) > -1;
        if (filter === 'access') return hasAccess(draft, s);
        return true;
      }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (!list.length) return '<div class="cr-empty" style="margin:.8rem">No builders match.</div>';
      return list.map(function (s) {
        var picked = draft.students.indexOf(s.id) > -1, byLevel = draft.levels.indexOf(levelOf(s)) > -1;
        return '<label class="tcx-row"><input type="checkbox" data-pick="' + esc(s.id) + '"' + (picked ? ' checked' : '') + ' aria-label="Give ' + esc(s.name) + ' the Advanced IDE">' +
          '<span class="n"><b>' + esc(s.name || 'Builder') + '</b><span>' + esc(s.email || '') + '</span></span>' +
          '<span class="tcx-tag">' + esc(s.skillLevel ? LABEL[s.skillLevel] : 'No level (Intermediate)') + '</span>' +
          (s.admittedFrom ? '<span class="tcx-tag pz" title="Admitted from the Paisley school portals">Admitted from Paisley</span>' : '<span class="tcx-tag">Applied</span>') +
          (draft.enabled && (picked || byLevel) ? '<span class="tcx-tag ok"><i class="fas fa-check"></i> ' + (picked ? 'Picked' : 'By level') + '</span>' : '') +
          '</label>';
      }).join('');
    }
    function paint() {
      if (dead || !draft) return;
      var keepScroll = (el.querySelector('.tcx-list') || {}).scrollTop || 0, focusSearch = document.activeElement && document.activeElement.id === 'tcxQ';
      var all = active(), count = all.filter(function (s) { return hasAccess(draft, s); }).length;
      var per = {}; LEVELS.forEach(function (l) { per[l] = all.filter(function (s) { return levelOf(s) === l; }).length; });
      var admitted = all.filter(function (s) { return s.admittedFrom; }).length;
      el.innerHTML = '<div class="tcx">' +
        '<div class="cr-bar"><div><h3>Controls</h3><div class="cr-sub">Decide which builders see the Advanced Paisley IDE. It stays hidden from everyone until you switch it on.</div></div></div>' +
        '<div class="tcx-card tcx-head"><span class="ic"><i class="fas fa-terminal"></i></span><div class="t"><b>Advanced Paisley IDE</b><span>Python, Java, C, C++, PHP and the web, with real code runs. Builders find it in Practice, on Home and in Code Lab practice.</span></div>' +
          '<label class="tcx-switch"><input type="checkbox" id="tcxOn"' + (draft.enabled ? ' checked' : '') + ' aria-label="Switch the Advanced IDE on"> <span>' + (draft.enabled ? 'On' : 'Off') + '</span></label></div>' +
        '<div class="tcx-card"><h4><i class="fas fa-layer-group"></i> By level</h4><p>Every active builder on a ticked level gets it, including builders who join that level later. Builders with no level count as Intermediate.</p>' +
          '<div class="tcx-levels">' + LEVELS.map(function (l) {
            return '<label class="tcx-level"><input type="checkbox" data-level="' + l + '"' + (draft.levels.indexOf(l) > -1 ? ' checked' : '') + '><span>' + LABEL[l] + '<small>' + per[l] + ' builder' + (per[l] === 1 ? '' : 's') + '</small></span></label>';
          }).join('') + '</div></div>' +
        '<div class="tcx-card"><h4><i class="fas fa-user-check"></i> Particular builders</h4><p>Pick builders by name to give them the IDE whatever their level, such as the ' + admitted + ' Paisley student' + (admitted === 1 ? '' : 's') + ' admitted to Tech Studio.</p>' +
          '<div class="tcx-tools"><input type="search" id="tcxQ" placeholder="Search by name or email" value="' + esc(q) + '" aria-label="Search builders">' +
            [['all', 'All'], ['admitted', 'Admitted from Paisley'], ['applied', 'Applied'], ['picked', 'Picked'], ['access', 'Has access']].map(function (f) { return '<button type="button" class="tcx-chip' + (filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') +
            '<button type="button" class="cr-btn" data-act="pickshown">Pick all shown</button><button type="button" class="cr-btn" data-act="clearpicks">Clear picks</button></div>' +
          '<div class="tcx-list">' + rowsHtml() + '</div></div>' +
        '<div class="tcx-save"><div class="sum">' + (draft.enabled ? '<b>' + count + '</b> of ' + all.length + ' active builders will see the Advanced IDE.' : 'The Advanced IDE is <b>off</b>: no builder sees it.') +
          (dirty() ? ' <span class="tcx-dirty">Unsaved changes.</span>' : saved && saved.updatedByName ? ' Last changed by ' + esc(saved.updatedByName) + '.' : '') + '</div>' +
          '<button type="button" class="cr-btn" data-act="reset"' + (dirty() ? '' : ' disabled') + '>Undo changes</button>' +
          '<button type="button" class="cr-btn primary" data-act="save"' + (dirty() && !busy ? '' : ' disabled') + '><i class="fas fa-floppy-disk"></i> Save</button></div>' +
      '</div>';
      var l = el.querySelector('.tcx-list'); if (l) l.scrollTop = keepScroll;
      if (focusSearch) { var qi = el.querySelector('#tcxQ'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    }
    function shown() { return Array.prototype.map.call(el.querySelectorAll('[data-pick]'), function (i) { return i.dataset.pick; }); }
    function onChange(e) {
      var t = e.target;
      if (t.id === 'tcxOn') draft.enabled = t.checked;
      else if (t.dataset.level) { var l = t.dataset.level; draft.levels = draft.levels.filter(function (x) { return x !== l; }); if (t.checked) draft.levels.push(l); }
      else if (t.dataset.pick) { var id = t.dataset.pick; draft.students = draft.students.filter(function (x) { return x !== id; }); if (t.checked) draft.students.push(id); }
      else return;
      paint();
    }
    function onInput(e) { if (e.target.id === 'tcxQ') { q = e.target.value.trim().toLowerCase(); var l = el.querySelector('.tcx-list'); if (l) l.innerHTML = rowsHtml(); } }
    function onClick(e) {
      var b = e.target.closest('[data-filter],[data-act]'); if (!b) return;
      if (b.dataset.filter) { filter = b.dataset.filter; paint(); return; }
      var a = b.dataset.act;
      if (a === 'pickshown') { shown().forEach(function (id) { if (draft.students.indexOf(id) === -1) draft.students.push(id); }); paint(); }
      else if (a === 'clearpicks') { draft.students = []; paint(); }
      else if (a === 'reset') { draft = { enabled: saved.enabled, levels: saved.levels.slice(), students: saved.students.slice() }; paint(); }
      else if (a === 'save') {
        busy = true; paint();
        var known = {}; students.forEach(function (s) { known[s.id] = 1; });
        ref.set({ enabled: draft.enabled, levels: draft.levels.slice(), students: draft.students.filter(function (id) { return known[id]; }).slice(0, 2000),
          updatedAt: FV().serverTimestamp(), updatedBy: o.me.uid, updatedByName: o.me.name || 'Studio Desk' })
          .then(function () { busy = false; flash('Saved. Builders see the change straight away.'); }, function (er) { busy = false; paint(); flash('Could not save: ' + T.errMsg(er), true); });
      }
    }
    function flash(text, bad) {
      var s = el.querySelector('.tcx-save .sum'); if (!s) return;
      s.innerHTML = '<span style="color:' + (bad ? '#b8362a' : '#1d8b57') + ';font-weight:800">' + esc(text) + '</span>';
    }
    el.addEventListener('change', onChange); el.addEventListener('input', onInput); el.addEventListener('click', onClick);
    el.innerHTML = '<div class="cr-empty">Loading controls…</div>';
    return {
      setStudents: function (list) { students = list || []; if (!busy) paint(); },
      destroy: function () { dead = true; unsub(); el.removeEventListener('change', onChange); el.removeEventListener('input', onInput); el.removeEventListener('click', onClick); }
    };
  }

  g.TechControls = { mount: mount, levelOf: levelOf, hasAccess: hasAccess };
})(window);
