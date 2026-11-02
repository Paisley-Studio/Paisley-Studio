/* =========================================================
   ACTIVITY ENGINE — activity-results.js
   -----------------------------------------------------------
   Builds the results-screen data and the HTML fragment. This
   file only produces HTML; the *wiring* of the three buttons
   lives in activity-engine.js, and is now bound via event
   delegation so it survives being rendered, re-rendered, or
   re-bound after a Review round-trip.
========================================================= */

const ActivityResults = (function () {
  function summarize(state) {
    const maxScore = ActivityScoring.maxScore(state.questions);
    const score = state.questions.reduce((sum, q) => {
      const given = state.answers[q.id];
      return sum + (given === undefined ? 0 : ActivityScoring.scoreFor(q, given));
    }, 0);
    return {
      score,
      maxScore,
      percent: ActivityScoring.percent(score, maxScore),
      correctCount: state.correctCount,
      incorrectCount: state.incorrectCount,
      bestStreak: state.bestStreak,
      elapsedSeconds: state.elapsedSeconds(),
      answers: state.answers
    };
  }

  function fmtTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Buttons are now identified by data attributes, not element IDs,
  // so the engine can wire them with a single delegated listener that
  // keeps working no matter how many times the results screen is
  // re-rendered (Review → Back, Try Again → Finish, etc).
  function renderHtml(summary) {
    return `
      <div class="activity-results">
        <h2>Completed! 🎉</h2>
        <div class="activity-results-score">${summary.score}/${summary.maxScore}</div>
        <div class="activity-results-percent">${summary.percent}%</div>
        <div class="activity-results-stats">
          <div><strong>${fmtTime(summary.elapsedSeconds)}</strong><span>Time</span></div>
          <div><strong>${summary.correctCount}</strong><span>Correct</span></div>
          <div><strong>${summary.incorrectCount}</strong><span>Incorrect</span></div>
          <div><strong>${summary.bestStreak}</strong><span>Best streak</span></div>
        </div>
        <div class="activity-results-actions">
          <button type="button" data-act="review" class="btn-secondary">Review</button>
          <button type="button" data-act="retry"  class="btn-secondary">Try Again</button>
          <button type="button" data-act="back"   class="btn-primary">Back to Course</button>
        </div>
      </div>`;
  }

  return { summarize, renderHtml, fmtTime };
})();