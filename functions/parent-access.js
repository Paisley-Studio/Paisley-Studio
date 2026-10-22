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

   Splitting by student type keeps a parent of an online child from
   reading remote-only content (and vice-versa) without merging their
   access. A child with no studentType is an online student.
========================================================= */
const admin = require("firebase-admin");

async function rebuildParentAccess(parentUid) {
  const db = admin.firestore();
  const links = await db.collection("parentStudentLinks").where("parentUid", "==", parentUid).get();
  const all = new Set(), online = new Set(), remote = new Set(), tuition = new Set();
  for (const link of links.docs) {
    const studentUid = link.data().studentUid;
    if (!studentUid) continue;
    const stu = await db.collection("students").doc(studentUid).get();
    if (!stu.exists) continue;
    const s = stu.data() || {};
    if (!s.keyStage) continue;
    const bucket = s.studentType === "remote" ? remote : (s.studentType === "tuition" ? tuition : online);
    const subjects = Array.isArray(s.subjects) ? s.subjects.filter(Boolean) : [];
    const add = (slot) => { all.add(slot); bucket.add(slot); };
    if (!subjects.length) add(s.keyStage + "|*");
    else subjects.forEach((id) => add(s.keyStage + "|" + id));
  }
  const ref = db.collection("parentAccess").doc(parentUid);
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
