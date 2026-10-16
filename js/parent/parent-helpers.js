/* =========================================================
   PARENT HELPERS — js/parent/parent-helpers.js
   -----------------------------------------------------------
   Deliberately separate from lms-helpers.js: a parent session should
   never have access to any write-capable student/tutor/admin function.
   Everything here is read-only, and every read is additionally enforced
   by firestore.rules' isParentOf() check — this file is a convenience
   wrapper, not the security boundary.

   Fields returned by loadChildBundle(child):
     results            — examResults (released only)
     homework           — legacy top-level homework
     submissions        — submissions under the legacy top-level homework
     exams              — legacy top-level exams collection
     attempts           — legacy top-level examAttempts
     activities         — activities published for the child's Key Stage
     activityAttempts   — the child's own activityAttempts
     allResults         — normalised merge of examResults + activityAttempts
     timetableEntries   — timetable sessions for the child's subjects
     liveClasses        — live classes for the child's Key Stage
     notices            — notices for the child's Key Stage
     tickets            — the child's support tickets

   NEW in this version:
     flatExams          — array of { exam, submission } for every Published
                          flat exam at classrooms/{cid}/exams/{eid} where the
                          child takes the subject at the right year.
                          The parent portal shows these with a Download paper
                          button (the paper is the examPdfUrl on the exam doc).
                          Submission is the child's own submission or null.
========================================================= */

const ParentHelpers = (function () {
  function getMyProfile(uid) {
    return getParentAccount(uid).then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null);
  }

  function getMyChildren(uid) {
    return getChildrenForParent(uid);
  }

  /* ---------------------------------------------------------
     Normalise an activityAttempt so it looks like an examResult
     for the purposes of charts and averages.
     --------------------------------------------------------- */
  function normaliseActivityAttempt(a) {
    return {
      id: a.id,
      kind: 'activity',
      date: toDateSafe(a.completedAt) || toDateSafe(a.startedAt) || null,
      subject: a.subject || a.activitySubject || 'Activity',
      examTitle: a.activityTitle || 'Activity',
      score: (typeof a.score === 'number') ? a.score : 0,
      maxScore: (typeof a.maxScore === 'number' && a.maxScore > 0) ? a.maxScore : null,
      keyStage: a.keyStage || '',
      released: true,
      status: a.status || 'Completed'
    };
  }

  /* ---------------------------------------------------------
     Build a single "results" stream used by every dashboard chart.
     --------------------------------------------------------- */
  function buildAllResults(results, activityAttempts) {
    const fromExams = (results || []).map(r => ({
      ...r,
      kind: r.kind || 'exam',
      date: toDateSafe(r.date) || toDateSafe(r.createdAt) || null
    }));
    const fromActivities = (activityAttempts || [])
      .filter(a => a.status === 'Completed')
      .map(normaliseActivityAttempt);
    return fromExams.concat(fromActivities);
  }

  /* ---------------------------------------------------------
     Flat exams for a child.
     ---------------------------------------------------------
     Walks the child's subjects (subject ids), finds the classroom
     (subject + Year), then reads every Published exam in
     classrooms/{cid}/exams/{eid}. For each exam we also fetch the
     child's own submission from the exam's `submissions` subcollection.

     Returns an array of:
       {
         exam:       { id, cid, ...examData },
         submission: { id, ...submissionData } | null
       }

     If the child has no subjects recorded yet, we fall back to walking
     every classroom in their Key Stage that matches by keyStage only.
     --------------------------------------------------------- */
  async function loadFlatExamsForChild(child) {
    const out = [];
    const year = child.year != null && child.year !== '' ? Number(child.year) : null;
    const subjects = lmzSubjectKeys(child.subjects);

    // Resolve the classrooms to inspect.
    let classrooms = [];
    try {
      if (subjects.length) {
        const queries = subjects.map(sid => {
          let q = db.collection('classrooms').where('subjectId', '==', sid);
          if (year != null) q = q.where('year', '==', year);
          return q.get();
        });
        const snaps = await Promise.all(queries.map(p => p.catch(() => ({ docs: [] }))));
        snaps.forEach(snap => snap.docs.forEach(d => classrooms.push({ id: d.id, ...d.data() })));
      } else if (child.keyStage) {
        const snap = await db.collection('classrooms').where('keyStage', '==', child.keyStage).get().catch(() => ({ docs: [] }));
        snap.docs.forEach(d => classrooms.push({ id: d.id, ...d.data() }));
      }
    } catch (e) {
      console.warn('loadFlatExamsForChild: classroom lookup failed', e);
      return out;
    }

    // Deduplicate classrooms by id.
    const seenC = {};
    classrooms = classrooms.filter(c => (seenC[c.id] ? false : (seenC[c.id] = true, true)));

    // For each classroom, read the flat exams collection.
    for (const cls of classrooms) {
      try {
        const examsSnap = await db.collection('classrooms').doc(cls.id).collection('exams')
          .where('audiences.' + (child.studentType === 'remote' ? 'remote' : 'online'), '==', true)
          .where('status', '==', 'Published').get();
        for (const examDoc of examsSnap.docs) {
          const exam = Object.assign({ id: examDoc.id, cid: cls.id }, examDoc.data());
          // Parents see Published exams. Drafts/Closed aren't visible.
          if (String(exam.status || '') !== 'Published') continue;

          let submission = null;
          try {
            const subSnap = await examDoc.ref.collection('submissions').doc(child.id).get();
            if (subSnap.exists) submission = Object.assign({ id: subSnap.id }, subSnap.data());
          } catch (e) {
            submission = null;
          }
          out.push({ exam, submission });
        }
      } catch (e) {
        // A single classroom failing shouldn't kill the whole bundle.
        console.warn('loadFlatExamsForChild: exam read failed for', cls.id, e);
      }
    }

    // Newest first by examDate (fallback to createdAt).
    out.sort((a, b) => {
      const da = toDateSafe(a.exam.examDate) || toDateSafe(a.exam.createdAt) || 0;
      const db2 = toDateSafe(b.exam.examDate) || toDateSafe(b.exam.createdAt) || 0;
      return db2 - da;
    });

    return out;
  }

  // Everything a child's dashboard tab needs, fetched in parallel.
  function loadChildBundle(child) {
    // Legacy key-stage-wide lists (homework, exams, activities, live classes,
    // announcements) belong to the online programme. A remote child's parent
    // sees only that child's own classroom work, results and tickets.
    const isRemote = child.studentType === 'remote';
    const none = () => Promise.resolve({ docs: [] });
    return Promise.all([
      getResultsForStudent(child.id).catch(() => ({ docs: [] })),
      (isRemote ? none() : getHomeworkForKeyStage(child.keyStage)).catch(() => ({ docs: [] })),
      getSubmissionsForStudent(child.id).catch(() => ({ docs: [] })),
      (isRemote ? none() : getExamsForKeyStage(child.keyStage)).catch(() => ({ docs: [] })),
      getAttemptsForStudent(child.id).catch(() => ({ docs: [] })),
      (isRemote ? none() : getActivitiesForKeyStage(child.keyStage)).catch(() => ({ docs: [] })),
      getActivityAttemptsForStudent(child.id).catch(() => ({ docs: [] })),
      (isRemote ? Promise.resolve([]) : getTimetableEntriesForStudent(child)).catch(() => []),
      (isRemote ? none() : getLiveClassesForKeyStage(child.keyStage)).catch(() => ({ docs: [] })),
      (isRemote ? none() : getNotificationsForKeyStage(child.keyStage)).catch(() => ({ docs: [] })),
      getTicketsForStudent(child.id).catch(() => ({ docs: [] })),
      // New: flat exams + the child's submission per exam
      loadFlatExamsForChild(child).catch(() => [])
    ]).then(([
      resultsSnap, homeworkSnap, submissionsSnap, examsSnap, attemptsSnap,
      activitiesSnap, activityAttemptsSnap, timetableList, liveClassesSnap,
      noticesSnap, ticketsSnap, flatExams
    ]) => {
      const results = resultsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const activityAttempts = activityAttemptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return {
        results,
        homework: homeworkSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        submissions: submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        exams: examsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        attempts: attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        activities: activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        activityAttempts,
        allResults: buildAllResults(results, activityAttempts),
        timetableEntries: timetableList,
        liveClasses: liveClassesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        notices: noticesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        tickets: ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        // NEW:
        flatExams
      };
    });
  }

  function toDateSafe(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v.seconds) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  function filterByDateRange(list, dateField, from, to) {
    return list.filter(item => {
      const d = toDateSafe(item[dateField]);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  function presetRange(preset) {
    const now = new Date();
    const to = now;
    let from = new Date(now);
    if (preset === '7d') from.setDate(from.getDate() - 7);
    else if (preset === '30d') from.setDate(from.getDate() - 30);
    else if (preset === '3m') from.setMonth(from.getMonth() - 3);
    else if (preset === 'year') from.setFullYear(from.getFullYear() - 1);
    else from = null;
    return { from, to };
  }

  return {
    getMyProfile,
    getMyChildren,
    loadChildBundle,
    loadFlatExamsForChild,
    buildAllResults,
    normaliseActivityAttempt,
    toDateSafe,
    filterByDateRange,
    presetRange
  };
})();