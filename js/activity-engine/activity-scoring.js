/* =========================================================
   ACTIVITY ENGINE — activity-scoring.js
   -----------------------------------------------------------
   isCorrect(question, answer) decides whether the student's
   answer scores. It supports five shapes:

     1. Group Sort         → compare answer to question.groupId
     2. Match Up / Pairs   → question.options has exactly one entry;
                             the correct pair is that option's id
     3. Anagram / Unjumble → free text, compare to question.text
     4. Multi-answer arrays → sorted-set comparison
     5. Standard MCQ / TF  → membership in correctOptionIds

   The console logging is intentional and temporary: it prints
   what is being compared so you can see, in the browser, exactly
   why a question scored wrong. Remove the [scoring] logs once
   everything works.
========================================================= */

const ActivityScoring = (function () {

  function isCorrect(question, answer) {
    const correct = question.correctOptionIds || [];

    /* ---- 1. Group Sort ---- */
    if (question.groupId) {
      const ok = String(answer) === String(question.groupId);
      log(question, answer, ok, 'group-sort');
      return ok;
    }

    /* ---- 2. Match Up / Matching Pairs ---- */
    // A Match Up question has exactly one entry in `options`, and that
    // entry IS the correct pair. The template sends the id of the
    // right-column item the student clicked.
    if (
      Array.isArray(question.options) &&
      question.options.length === 1 &&
      question.options[0] &&
      question.options[0].id
    ) {
      const expected = String(question.options[0].id);
      const given    = String(answer);
      const ok = given === expected;
      log(question, answer, ok, 'match-up', {
        expectedId: expected,
        givenId: given
      });
      return ok;
    }

    /* ---- 3. Free-text (anagram / unjumble) ---- */
    if (question.type === 'text' || (!question.options || !question.options.length)) {
      const target = String(question.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const given  = String(answer || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ok = target.length > 0 && target === given;
      log(question, answer, ok, 'free-text', {
        target,
        given
      });
      return ok;
    }

    /* ---- 4. Multi-answer arrays ---- */
    if (Array.isArray(answer)) {
      if (answer.length !== correct.length) {
        log(question, answer, false, 'multi-array-length', {
          expectedLen: correct.length,
          givenLen: answer.length
        });
        return false;
      }
      const a = [...answer].sort();
      const b = [...correct].sort();
      const ok = a.every((v, i) => v === b[i]);
      log(question, answer, ok, 'multi-array');
      return ok;
    }

    /* ---- 5. Standard MCQ / true-false / open-box ---- */
    const ok = correct.includes(answer);
    log(question, answer, ok, 'mcq', {
      expectedIds: correct,
      givenId: String(answer)
    });
    return ok;
  }

  function log(question, answer, result, kind, extra) {
    try {
      console.log('[scoring]', {
        kind,
        questionId: question && question.id,
        questionText: (question && question.text || '').slice(0, 60),
        answerReceived: answer,
        result,
        correctOptionIds: question && question.correctOptionIds,
        optionsLen: (question && question.options && question.options.length) || 0,
        extra: extra || null
      });
    } catch (e) { /* never let logging break scoring */ }
  }

  function marksFor(question) {
    return (typeof question.marks === 'number' && question.marks > 0) ? question.marks : 1;
  }

  function maxScore(questions) {
    return (questions || []).reduce((sum, q) => sum + marksFor(q), 0);
  }

  function scoreFor(question, answer) {
    return isCorrect(question, answer) ? marksFor(question) : 0;
  }

  function percent(score, max) {
    if (!max) return 0;
    return Math.round((score / max) * 100);
  }

  return { isCorrect, marksFor, maxScore, scoreFor, percent };
})();