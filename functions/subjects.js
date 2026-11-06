/* =========================================================
   Subject names (admin rename)
   -----------------------------------------------------------
   Subject ids (mathematics, cbc-english, ...) never change: the rules,
   timetables, classrooms and profiles key on them. A rename changes the
   display name:

     lmsSettings/subjects   { names: { <subjectId>: "<name>" }, updatedAt }
                            read by every page (lms-helpers.js lmzApplySubjectNames)
     subjectRenames/{auto}  history: subjectId, from, to, by, at, updated counts

   and rewrites the stored copies of the name (subjectName / subjectNames)
   on timetable sessions, classrooms and everything inside them, resources,
   student and tutor profiles and open attendance registers.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const W = require("./work-shared");

if (!admin.apps.length) admin.initializeApp();
const db = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;

async function commitAll(updates) {
  for (let i = 0; i < updates.length; i += 400) {
    const b = db().batch();
    updates.slice(i, i + 400).forEach(([ref, patch]) => b.update(ref, patch));
    await b.commit();
  }
  return updates.length;
}

async function renameSubject(uid, data) {
  const a = await db().collection("admins").doc(uid).get();
  if (!a.exists) throw new HttpsError("permission-denied", "Studio Desk only.");
  const id = String((data && data.subjectId) || "").trim();
  const name = String((data && data.name) || "").replace(/\s+/g, " ").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)) throw new HttpsError("invalid-argument", "Unknown subject.");
  if (name.length < 2 || name.length > 60) throw new HttpsError("invalid-argument", "A subject name is 2 to 60 characters.");
  const from = String((data && data.currentName) || "");
  const counts = {};
  const keyOf = (v) => W.subjectKey(v);

  // Timetable sessions (new and legacy), resources, open attendance registers.
  for (const col of ["timetableEntries", "timetables", "classroomResources"]) {
    const snap = await db().collection(col).where("subjectId", "==", id).get();
    counts[col] = await commitAll(snap.docs.filter((d) => d.data().subjectName !== name).map((d) => [d.ref, { subjectName: name }]));
  }
  const open = await db().collection("attendanceSessions").where("subjectId", "==", id).where("status", "==", "open").get();
  counts.attendanceSessions = await commitAll(open.docs.map((d) => [d.ref, { subjectName: name }]));

  // Classrooms and what they hold.
  const rooms = await db().collection("classrooms").where("subjectId", "==", id).get();
  const inner = [];
  for (const c of rooms.docs) {
    if ("subjectName" in c.data() && c.data().subjectName !== name) inner.push([c.ref, { subjectName: name }]);
    const flat = await c.ref.collection("exams").get();
    flat.forEach((d) => { if ("subjectName" in d.data() && d.data().subjectName !== name) inner.push([d.ref, { subjectName: name }]); });
    const topics = await c.ref.collection("topics").listDocuments();   // includes topics whose own doc is missing
    for (const t of topics) {
      for (const sub of ["lessons", "assignments", "exams"]) {
        const items = await t.collection(sub).get();
        items.forEach((d) => { if ("subjectName" in d.data() && d.data().subjectName !== name) inner.push([d.ref, { subjectName: name }]); });
      }
    }
  }
  counts.classroomItems = await commitAll(inner);

  // Profiles keep subjectNames[] beside subjects[] (same order).
  for (const col of ["students", "tutorAccounts"]) {
    const snap = await db().collection(col).where("subjects", "array-contains", id).get();
    const ups = [];
    snap.forEach((d) => {
      const x = d.data();
      if (!Array.isArray(x.subjectNames) || !Array.isArray(x.subjects)) return;
      const names = x.subjects.map((s, i) => (keyOf(s) === id ? name : (x.subjectNames[i] || "")));
      if (JSON.stringify(names) !== JSON.stringify(x.subjectNames)) ups.push([d.ref, { subjectNames: names }]);
    });
    counts[col] = await commitAll(ups);
  }

  await db().collection("lmsSettings").doc("subjects").set({ names: { [id]: name }, updatedAt: FV().serverTimestamp(), updatedBy: uid }, { merge: true });
  await db().collection("subjectRenames").add({ subjectId: id, from, to: name, by: uid, at: FV().serverTimestamp(), updated: counts });
  return { ok: true, subjectId: id, name, updated: counts };
}

exports.renameSubject = onCall({ cors: true, region: W.LOCATION, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in again.");
  try { return await renameSubject(request.auth.uid, request.data || {}); }
  catch (e) { if (e instanceof HttpsError) throw e; console.error("renameSubject", e); throw new HttpsError("internal", "The subject could not be renamed. Please try again."); }
});
exports._internals = { renameSubject };
