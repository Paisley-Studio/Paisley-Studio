/* =========================================================
   Paisley Studio — parent access slots
   -----------------------------------------------------------
   parentAccess/{parentUid} is written ONLY by Cloud Functions (rules
   forbid client writes). It is derived from verified parentStudentLinks
   and tells Firestore rules which classroom "slots"
   (keyStage|subjectId) a parent may read.

     slots   : every slot of every linked child        (timetable etc.)
     online  : slots of linked children who are normal online students
     remote  : slots of linked children who are remote students
     tuition : slots of linked children who are CBC tuition students

   FIX (parents could not see work their children could see):
   1. A student is allowed into a classroom when the SUBJECT matches and
      either the YEAR or the KEY STAGE matches. The old code only built
      "<student keyStage>|<subject>" from the student's own keyStage text,
      so whenever the classroom's keyStage text differed from the
      student's, or the student matched by year, the parent got NO slot.
      Slots are now built from the real classrooms each child can enter.
   2. Subject names are normalized. If a student profile says "maths"
      but the classroom uses "mathematics", the slot is now built as
      "Key Stage X|mathematics" so the rules match.
========================================================= */
const admin = require("firebase-admin");

const norm = (v) => String(v == null ? "" : v).trim();

// Map display names / aliases to the standard subject keys used by classrooms
const SUBJECT_ALIASES = {
  'maths': 'mathematics',
  'math': 'mathematics',
  'english language': 'english',
  'english literature': 'english',
  'science': 'science',
  'biology': 'biology',
  'chemistry': 'chemistry',
  'physics': 'physics',
  'history': 'history',
  'geography': 'geography',
  'computer science': 'computing',
  'computing': 'computing',
  'ict': 'computing',
  'business studies': 'business',
  'business': 'business',
  'economics': 'economics',
  'art': 'art',
  'art & design': 'art',
  'music': 'music',
  'physical education': 'pe',
  'pe': 'pe'
};

function normalizeSubject(subject) {
  if (!subject) return 'unknown';
  const s = String(subject).trim().toLowerCase();
  return SUBJECT_ALIASES[s] || s;
}

async function rebuildParentAccess(parentUid) {
  const db = admin.firestore();
  const links = await db.collection("parentStudentLinks").where("parentUid", "==", parentUid).get();
  const studentIds = Array.from(new Set(links.docs.map((l) => l.data().studentUid).filter(Boolean)));

  const ref = db.collection("parentAccess").doc(parentUid);
  if (!studentIds.length) { await ref.delete().catch(() => {}); return 0; }

  // Students and classrooms are read once, in parallel
  const [stuSnaps, clsSnap] = await Promise.all([
    Promise.all(studentIds.map((id) => db.collection("students").doc(id).get())),
    db.collection("classrooms").get()
  ]);
  const classrooms = clsSnap.docs.map((d) => d.data() || {}).filter((c) => c.subjectId && c.keyStage);

  const all = new Set(), online = new Set(), remote = new Set(), tuition = new Set();
  for (const stu of stuSnaps) {
    if (!stu.exists) continue;
    const s = stu.data() || {};
    const bucket = s.studentType === "remote" ? remote : (s.studentType === "tuition" ? tuition : online);
    const add = (slot) => { all.add(slot); bucket.add(slot); };
    
    // Normalize the student's subjects
    const rawSubjects = Array.isArray(s.subjects) ? s.subjects.filter(Boolean) : [];
    const subjects = rawSubjects.map(normalizeSubject);
    
    const sKs = norm(s.keyStage);
    const sYear = s.year == null || s.year === "" ? null : Number(s.year);

    // Old behaviour (kept as fallback): the child's own keyStage text.
    if (sKs) {
      if (!subjects.length) add(sKs + "|*");
      else subjects.forEach((id) => add(sKs + "|" + id));
    }

    // New: every real classroom this child may enter (same test as classStudentMay in the rules).
    if (subjects.length) {
      for (const c of classrooms) {
        // Normalize the classroom subject to match
        const cSubject = normalizeSubject(c.subjectId);
        if (subjects.indexOf(cSubject) === -1) continue;
        
        const yearMatch = sYear != null && c.year != null && Number(c.year) === sYear;
        const ksMatch = sKs && norm(c.keyStage) === sKs;
        if (yearMatch || ksMatch) add(c.keyStage + "|" + cSubject);
      }
    }
  }

  if (!all.size) { await ref.delete().catch(() => {}); return 0; }
  await ref.set({
    slots: Array.from(all).sort(),
    online: Array.from(online).sort(),
    remote: Array.from(remote).sort(),
    tuition: Array.from(tuition).sort(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return all.size;
}

module.exports = { rebuildParentAccess };