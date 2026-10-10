/* =========================================================
   Paisley Studio — Classroom Cloud Functions
   -----------------------------------------------------------
   1. publishScheduledLessons — every minute, flips lessons whose
      status is "scheduled" and whose publishAt has passed to
      "published". Students can only read published lessons (see
      firestore.rules), so release does not depend on any browser
      being open.
   2. onClassroomLessonDeleted — when a lesson is deleted (directly,
      or as part of deleting a topic) its uploaded files are removed
      from Storage so nothing is left orphaned.
========================================================= */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const LOCATION = "us-central1";

exports.publishScheduledLessons = onSchedule(
  { schedule: "every 1 minutes", region: LOCATION, timeZone: "Africa/Nairobi" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    let released = 0;
    // Loop in pages of 400 so a large backlog still clears; each batch stays
    // well inside Firestore's 500-write limit.
    for (let page = 0; page < 10; page++) {
      const snap = await db.collectionGroup("lessons")
        .where("status", "==", "scheduled")
        .where("publishAt", "<=", now)
        .limit(400)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.update(d.ref, {
        status: "published",
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
        releasedBy: "schedule"
      }));
      await batch.commit();
      released += snap.size;
      if (snap.size < 400) break;
    }
    if (released) console.log("publishScheduledLessons released", released, "lesson(s)");
  }
);

exports.onClassroomLessonDeleted = onDocumentDeleted(
  { document: "classrooms/{classroomId}/lessons/{lessonId}", region: LOCATION },
  async (event) => {
    const { classroomId, lessonId } = event.params;
    const data = (event.data && event.data.data()) || {};
    // classroom ids are "{subjectId}_y{year}"
    const subjectId = data.subjectId || classroomId.split("_y")[0];
    const prefix = `classroom-files/${subjectId}/${classroomId}/${lessonId}/`;
    try {
      await admin.storage().bucket().deleteFiles({ prefix });
    } catch (e) {
      console.error("Could not remove files under", prefix, e);
    }
  }
);
