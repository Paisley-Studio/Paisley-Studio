/* =========================================================
   ACTIVITY ENGINE — activity-engine.js (orchestrator)
   -----------------------------------------------------------
   See earlier comment blocks for the template contract.
   This version wires the Results-screen buttons with a single
   delegated click listener attached to the container, so the
   buttons keep working across re-renders (Review → Back, Try
   Again → Finish, etc.).
========================================================= */

/* ---------------------------------------------------------
   SOUND — synthesised via Web Audio API. No external files.
   --------------------------------------------------------- */
const ActivitySounds = (function () {
  let ctx = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) { return null; }
    return ctx;
  }
  function tone(freq, dur, type, gain) {
    const c = ensure();
    if (!c) return;
    try {
      if (c.state === 'suspended') c.resume();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      g.gain.value = (gain == null ? 0.14 : gain);
      osc.connect(g); g.connect(c.destination);
      const now = c.currentTime;
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.start(now);
      osc.stop(now + dur);
    } catch (e) {}
  }
  return {
    correct() { tone(523.25, 0.14, 'sine', 0.15); setTimeout(() => tone(659.25, 0.20, 'sine', 0.15), 110); },
    wrong()   { tone(220, 0.28, 'sawtooth', 0.10); setTimeout(() => tone(196, 0.20, 'sawtooth', 0.08), 120); },
    finish()  {
      tone(523.25, 0.16, 'sine', 0.15);
      setTimeout(() => tone(659.25, 0.16, 'sine', 0.15), 140);
      setTimeout(() => tone(783.99, 0.16, 'sine', 0.15), 280);
      setTimeout(() => tone(1046.50, 0.35, 'sine', 0.18), 420);
    }
  };
})();

/* ---------------------------------------------------------
   CONFETTI
   --------------------------------------------------------- */
function activityConfetti(count) {
  try {
    const host = document.createElement('div');
    host.className = 'act-confetti-host';
    document.body.appendChild(host);
    const colors = ['#55BFB3','#F5C842','#245F5A','#7BCBC2','#2EB872','#E74C3C','#9B59B6'];
    const n = count || 80;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'act-confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      p.style.animationDelay = (Math.random() * 0.4) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      if (Math.random() < 0.4) p.style.borderRadius = '50%';
      host.appendChild(p);
    }
    setTimeout(() => host.remove(), 3400);
  } catch (e) { console.warn('Confetti failed:', e); }
}

/* ---------------------------------------------------------
   ENGINE
   --------------------------------------------------------- */
function ActivityEngine(container, activity, studentId) {
  const state = createActivityState(activity);
  const template = window.ActivityTemplates && window.ActivityTemplates[activity.type];
  let attemptId = null;
  let timer = null;
  let ended = false;
  let lastSummary = null;

  if (!template) {
    container.innerHTML = `<div class="activity-error">This activity type ("${escapeActivityHtml(activity.type)}") isn't supported yet.</div>`;
    return { start: () => {} };
  }

  /* ---------- one delegated listener for the whole container ---------- */
  function handleContainerClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'retry') {
      e.preventDefault();
      ended = false;
      lastSummary = null;
      container.removeEventListener('click', handleContainerClick);
      ActivityEngine(container, activity, studentId).start();
      return;
    }
    if (act === 'back') {
      e.preventDefault();
      if (window.history.length > 1) window.history.back();
      else window.location.href = '../student/dashboard.html';
      return;
    }
    if (act === 'review') {
      e.preventDefault();
      if (lastSummary) renderReview(lastSummary);
      return;
    }
    if (act === 'review-back') {
      e.preventDefault();
      if (lastSummary) renderResults(lastSummary);
      return;
    }
  }
  container.addEventListener('click', handleContainerClick);

  function renderChrome() {
    const p = state.progress();
    return `
      <div class="activity-chrome">
        <div class="activity-header">
          <h2>${escapeActivityHtml(activity.title)}</h2>
          <div class="activity-progress">Question ${p.current} / ${p.total}</div>
        </div>
        <div class="activity-meta">
          <span class="activity-score" id="actScoreEl">Score: ${state.correctCount}</span>
          <span class="activity-streak">Streak: ${state.streak}</span>
          ${activity.config && activity.config.timeLimitSeconds ? '<span class="activity-timer" id="actTimer">--:--</span>' : ''}
        </div>
        <div class="activity-question-slot" id="actQuestionSlot"></div>
      </div>`;
  }

  function updateChromeScore() {
    const el = container.querySelector('#actScoreEl');
    if (!el) return;
    el.textContent = 'Score: ' + state.correctCount;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function renderCurrentQuestion() {
    if (ended) return;
    container.innerHTML = renderChrome();
    const slot = container.querySelector('#actQuestionSlot');
    const q = state.current();
    if (!q) { finish(); return; }
    template.renderQuestion(slot, q, activity, (value) => handleAnswer(q, value));
  }

  function renderBoard() {
    if (ended) return;
    container.innerHTML = `
      <div class="activity-chrome">
        <div class="activity-header">
          <h2>${escapeActivityHtml(activity.title)}</h2>
          <div class="activity-progress">${state.questions.length} item${state.questions.length === 1 ? '' : 's'}</div>
        </div>
        <div class="activity-meta">
          <span class="activity-score" id="actScoreEl">Score: ${state.correctCount}</span>
        </div>
        <div class="activity-question-slot" id="actBoardSlot"></div>
      </div>`;
    const slot = container.querySelector('#actBoardSlot');
    template.renderBoard(slot, state.questions, activity, (answerMap) => {
      state.questions.forEach(q => {
        const given = answerMap[q.id];
        const correct = ActivityScoring.isCorrect(q, given);
        state.recordAnswer(q.id, given, correct);
      });
      updateChromeScore();
      finish();
    });
  }

  function handleAnswer(question, value) {
    const correct = ActivityScoring.isCorrect(question, value);
    state.recordAnswer(question.id, value, correct);
    updateChromeScore();
    if (state.advance()) {
      renderCurrentQuestion();
    } else {
      finish();
    }
  }

  function finish() {
    if (ended) return;
    ended = true;
    if (timer) timer.stop();
    const summary = ActivityResults.summarize(state);
    lastSummary = summary;

    if (summary.percent >= 50) {
      try { ActivitySounds.finish(); } catch (e) {}
      try { activityConfetti(summary.percent >= 80 ? 120 : 60); } catch (e) {}
    }

    ActivityFirestore.finishAttempt(attemptId, summary).catch(err => {
      console.error('Could not save activity attempt:', err);
    });

    renderResults(summary);
  }

  function renderResults(summary) {
    container.innerHTML = ActivityResults.renderHtml(summary);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderReview(summary) {
    const rows = state.questions.map(q => {
      const given = summary.answers[q.id];
      const correct = given !== undefined && ActivityScoring.isCorrect(q, given);
      return `<div class="activity-review-row ${correct ? 'correct' : 'incorrect'}">
        <div class="activity-review-q">${escapeActivityHtml(q.text || '')}</div>
        <div class="activity-review-verdict">${correct ? '✓ Correct' : '✗ Incorrect'}</div>
        ${q.explanation ? `<div class="activity-review-explanation">${escapeActivityHtml(q.explanation)}</div>` : ''}
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="activity-review">
        <h2>Review</h2>
        ${rows}
        <button type="button" data-act="review-back" class="btn-primary">Back to Results</button>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function start() {
    ActivityFirestore.startAttempt(activity, studentId).then(id => {
      attemptId = id;
      if (template.mode === 'board') {
        renderBoard();
      } else {
        renderCurrentQuestion();
      }
      if (activity.config && activity.config.timeLimitSeconds) {
        timer = createActivityTimer(
          activity.config.timeLimitSeconds,
          (remaining) => {
            const el = container.querySelector('#actTimer');
            if (el) el.textContent = timer.formatMMSS(remaining);
          },
          () => finish()
        );
        timer.start();
      }
    }).catch(err => {
      container.innerHTML = `<div class="activity-error">Couldn't start this activity: ${escapeActivityHtml(err.message)}</div>`;
    });
  }

  return { start };
}

function escapeActivityHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}