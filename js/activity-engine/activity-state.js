/* =========================================================
   ACTIVITY ENGINE — activity-state.js
   Plain-object state container shared by every template.
   No Firestore, no DOM — just the play-through state machine.
========================================================= */

function createActivityState(activity) {
  let questions = (activity.questions || []).slice();
  if (activity.config && activity.config.shuffleQuestions) {
    questions = shuffleArray(questions);
  }

  return {
    activity,
    questions,
    index: 0,
    answers: {},           // questionId -> answer value
    correctCount: 0,
    incorrectCount: 0,
    streak: 0,
    bestStreak: 0,
    startedAt: Date.now(),

    current() {
      return this.questions[this.index] || null;
    },
    isLast() {
      return this.index >= this.questions.length - 1;
    },
    progress() {
      return { current: this.index + 1, total: this.questions.length };
    },
    recordAnswer(questionId, value, isCorrect) {
      this.answers[questionId] = value;
      if (isCorrect) {
        this.correctCount++;
        this.streak++;
        if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      } else {
        this.incorrectCount++;
        this.streak = 0;
      }
    },
    advance() {
      if (!this.isLast()) { this.index++; return true; }
      return false;
    },
    elapsedSeconds() {
      return Math.round((Date.now() - this.startedAt) / 1000);
    }
  };
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
