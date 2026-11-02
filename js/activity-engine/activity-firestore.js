/* =========================================================
   ACTIVITY ENGINE — activity-firestore.js
   -----------------------------------------------------------
   All Firestore reads/writes for the activity engine, thin
   wrappers around the functions added to lms-helpers.js so the
   engine/templates never call `db.collection(...)` directly.

   CANONICAL QUESTION SHAPE (section 39 — no duplicate question
   data across templates; each template just reads the fields it
   needs and ignores the rest):

     {
       id:               string (4-char id, unique within the activity)
       text:             string   — prompt / left-side item / word to unscramble
       imageUrl:         string|null
       diagramUrl:       string|null
       audioUrl:         string|null
       options: [ { id, text } ]  — answer choices (quiz/true-false/open-box/
                                     match-up "right side" candidates)
       correctOptionIds: [id,...] — which option id(s) are correct
       groupId:          string|null — which activity.groups[] entry this
                                        item belongs to (group-sort only)
       explanation:      string   — shown after answering; also doubles as
                                     the "back" of a flashcard
       hint:             string
       marks:            number
     }

   CANONICAL ACTIVITY SHAPE:

     {
       title, description, subject, topic, keyStage, difficulty,
       type: 'quiz' | 'true-false' | 'match-up' | 'matching-pairs' |
             'flashcards' | 'random-wheel' | 'group-sort' | 'anagram' |
             'unjumble' | 'open-box',
       ownerId, ownerRole ('admin'|'tutor'), ownerName,
       status: 'Draft' | 'Published',
       groups: [ { id, name } ]           — group-sort only
       config: {
         shuffleQuestions, shuffleAnswers, timeLimitSeconds,
         attemptsAllowed, passingScore, showExplanations
       },
       questions: [ ...canonical question shape above ]
     }

   ATTEMPT SHAPE (activityAttempts):

     {
       activityId, studentId, activityType, activityTitle,
       status: 'In progress' | 'Completed',
       answers: { [questionId]: answerValue },
       score, maxScore, correctCount, incorrectCount,
       streak, elapsedSeconds, startedAt, completedAt
     }
========================================================= */

const ActivityFirestore = (function () {
  function loadActivity(activityId) {
    return getActivity(activityId).then(doc => {
      if (!doc.exists) throw new Error('This activity no longer exists.');
      return { id: doc.id, ...doc.data() };
    });
  }

  function startAttempt(activity, studentId) {
    return startActivityAttempt({
      activityId: activity.id,
      activityType: activity.type,
      activityTitle: activity.title,
      studentId: studentId,
      answers: {}
    }).then(ref => ref.id);
  }

  function finishAttempt(attemptId, result) {
    return finishActivityAttempt(attemptId, {
      answers: result.answers || {},
      score: result.score,
      maxScore: result.maxScore,
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      streak: result.streak || 0,
      elapsedSeconds: result.elapsedSeconds || 0
    });
  }

  function loadAnalytics(activityId) {
    return getAttemptsForActivity(activityId).then(snap =>
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
    );
  }

  return { loadActivity, startAttempt, finishAttempt, loadAnalytics };
})();
