/* =========================================================
   Paisley Studio — central publishing
   -----------------------------------------------------------
   The Studio Desk prepares content ONCE (inside the admin Classroom
   area) and then posts it to audiences. Nothing is duplicated: each
   lesson / assignment / exam keeps a single record that carries

     audiences   { online, remote, tutors }   who may see it
     publication { <audience>: {...} }        who posted it, when, why
     releasedTo  [studentUid]                 tutor-delivered students

   plus one deterministic record per item+audience in `publications/`
   (an audit trail that can never be duplicated by a retry).

   Exports
     publishClassroomContent  admin callable   Post to All / Tutors /
                                               Online / Remote Students
     tutorReleaseWork         tutor callable   deliver admin-prepared work
                                               to the tutor's own students
     backfillAudiences        admin callable   safe, repeatable migration
     onAssignmentAudienceChanged, onNestedExamAudienceChanged,
     onLessonAudienceChanged                   notifications when work
                                               BECOMES visible to someone

   Notifications are idempotent: every in-app notice uses a
   deterministic id (notifyOnce) so a retried trigger cannot notify
   the same person twice.
========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

const { templates } = require("./email-templates");
const W = require("./work-shared");
const { rebuildParentAccess } = require("./parent-access");

/* ---------------------------------------------------------
   Content types + the explicit audience matrix.
   `audiences` lists who each content type can be posted to.
   Post to All = every audience listed for that type, nothing more.
--------------------------------------------------------- */
const TYPES = {
  lesson:     { re: /^classrooms\/([^/]+)\/topics\/([^/]+)\/lessons\/([^/]+)$/,     live: "published", audiences: ["online", "remote", "tuition", "tutors"] },
  assignment: { re: /^classrooms\/([^/]+)\/topics\/([^/]+)\/assignments\/([^/]+)$/, live: null,        audiences: ["online", "remote", "tuition", "tutors"] },
  exam:       { re: /^classrooms\/([^/]+)\/topics\/([^/]+)\/exams\/([^/]+)$/,       live: "Published", audiences: ["online", "remote", "tuition", "tutors"] },
  flatExam:   { re: /^classrooms\/([^/]+)\/exams\/([^/]+)$/,                        live: "Published", audiences: ["online", "remote", "tuition", "tutors"] }
};
const CHOICES = ["all", "tutors", "online", "remote", "tuition"];

function parsePath(path) {
  const p = String(path || "");
  for (const type of Object.keys(TYPES)) {
    const m = TYPES[type].re.exec(p);
    if (m) return { type, path: p, cid: m[1], tid: type === "flatExam" ? null : m[2], id: m[m.length - 1] };
  }
  return null;
}

function audiencesFor(choice, type) {
  const allowed = TYPES[type].audiences;
  // "Post to All" never includes tuition — CBC tuition content is posted to tuition students explicitly.
  if (choice === "all") return allowed.filter((a) => a !== "tuition");
  // Posting to tuition also lets the tutors who teach that CBC subject see the item and mark the submissions.
  if (choice === "tuition") return allowed.filter((a) => a === "tuition" || a === "tutors");
  return allowed.indexOf(choice) !== -1 ? [choice] : [];
}

/* What a record that predates the audience model means: it was live to
   online students (if its own status says so) and visible to tutors. It
   was never visible to remote students. The migration writes exactly this. */
function legacyAudiences(type, d) {
  const live = TYPES[type].live;
  return { online: live ? String(d.status || "") === live || (type === "lesson" && d.status === "scheduled") : true, remote: false, tutors: true };
}

/* ---------------------------------------------------------
   Core: post one item to a set of audiences, inside a transaction.
   Pure Firestore-interface logic so it can be unit-tested with an
   in-memory fake. Returns a plain result object.
--------------------------------------------------------- */
async function publishOne(db, ctx, ref, parsed, audiences) {
  const { uid, name, requestId, ts } = ctx;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { path: parsed.path, type: parsed.type, status: "missing", reason: "Item no longer exists." };
    const d = snap.data() || {};
    const title = d.title || "(untitled)";
    const live = TYPES[parsed.type].live;

    if (parsed.type === "lesson" && d.status === "archived") return { path: parsed.path, type: parsed.type, title, status: "skipped", reason: "Archived lessons cannot be posted." };
    if ((parsed.type === "exam" || parsed.type === "flatExam") && d.status === "Closed") return { path: parsed.path, type: parsed.type, title, status: "skipped", reason: "Closed exams cannot be posted." };

    const current = d.audiences && typeof d.audiences === "object" ? d.audiences : legacyAudiences(parsed.type, d);
    const want = audiences.filter((a) => current[a] !== true);
    if (!want.length) return { path: parsed.path, type: parsed.type, title, status: "already", audiences: [] };

    const next = { online: current.online === true, remote: current.remote === true, tuition: current.tuition === true, tutors: current.tutors === true };
    const publication = Object.assign({}, d.publication || {});
    want.forEach((a) => {
      next[a] = true;
      publication[a] = {
        publishedAt: ts, publishedBy: uid, publishedByName: name || "Studio Desk", requestId: requestId || null,
        keyStage: d.keyStage || null, year: d.year != null ? d.year : null, subjectId: d.subjectId || null, topicId: parsed.tid
      };
    });

    const patch = { audiences: next, publication, updatedAt: ts };
    let markedReady = false;
    if (parsed.type === "lesson" && d.status === "draft") { patch.status = "published"; patch.publishAt = null; patch.publishedAt = ts; markedReady = true; }
    if ((parsed.type === "exam" || parsed.type === "flatExam") && d.status !== "Published") { patch.status = "Published"; markedReady = true; }
    tx.update(ref, patch);

    want.forEach((a) => {
      tx.set(ctx.db.doc("publications/" + W.stableId(parsed.path, a)), {
        path: parsed.path, type: parsed.type, title, audience: a, classroomId: parsed.cid, topicId: parsed.tid || null,
        keyStage: d.keyStage || null, year: d.year != null ? d.year : null, subjectId: d.subjectId || null,
        publishedBy: uid, publishedByName: name || "Studio Desk", publishedAt: ts, requestId: requestId || null, status: "active"
      });
    });
    return { path: parsed.path, type: parsed.type, title, status: "published", audiences: want, markedReady, live };
  });
}

async function publishItems(db, ctx, choice, paths) {
  if (CHOICES.indexOf(choice) === -1) throw new HttpsError("invalid-argument", "Unknown audience.");
  const list = Array.from(new Set((paths || []).map(String)));
  if (!list.length) throw new HttpsError("invalid-argument", "Select at least one item.");
  if (list.length > 150) throw new HttpsError("invalid-argument", "Please publish at most 150 items at a time.");
  const results = [];
  for (const path of list) {
    const parsed = parsePath(path);
    if (!parsed) { results.push({ path, status: "skipped", reason: "Not a publishable item." }); continue; }
    const audiences = audiencesFor(choice, parsed.type);
    if (!audiences.length) { results.push({ path, type: parsed.type, status: "skipped", reason: "This content type cannot be posted to that audience." }); continue; }
    try { results.push(await publishOne(db, ctx, db.doc(path), parsed, audiences)); }
    catch (e) { console.error("publishOne failed", path, e); results.push({ path, type: parsed.type, status: "error", reason: e.message || "Could not publish." }); }
  }
  return results;
}

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await admin.firestore().collection("admins").doc(request.auth.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "Admins only.");
  const data = snap.data() || {};
  return { uid: request.auth.uid, name: data.name || (request.auth.token && request.auth.token.name) || "Studio Desk" };
}

exports.publishClassroomContent = onCall(
  { cors: true, region: W.LOCATION, timeoutSeconds: 120 },
  async (request) => {
    const who = await requireAdmin(request);
    const d = request.data || {};
    const db = admin.firestore();
    const ctx = { db, uid: who.uid, name: who.name, requestId: String(d.requestId || "").slice(0, 80) || null, ts: admin.firestore.Timestamp.now() };
    const results = await publishItems(db, ctx, String(d.audience || ""), d.paths);
    const count = (s) => results.filter((r) => r.status === s).length;
    return { results, published: count("published"), already: count("already"), skipped: count("skipped") + count("missing"), failed: count("error") };
  }
);

/* =========================================================
   Tutor delivery — tutors DELIVER admin-prepared work to their own
   students; they never create it and cannot widen its audience.
========================================================= */
function tutorTeaches(student, subjectId, tutorUid) {
  const direct = (Array.isArray(student.tutorIds) && student.tutorIds.indexOf(tutorUid) !== -1) || student.tutorId === tutorUid;
  const bySubject = student.subjectTutors && student.subjectTutors[subjectId] && student.subjectTutors[subjectId].tutorId === tutorUid;
  return !!(direct || bySubject);
}

/* The page tells us where it thinks an item lives, but a stored `topicId` can be stale
   (work moved between topics) or the type can be guessed wrong. If nothing is at the
   given path, look for the same id in every topic of that classroom, in every work
   collection, and use where it really is. */
const COL_TYPE = { assignments: "assignment", lessons: "lesson", exams: "exam" };
async function locateItem(db, parsed) {
  const ref = db.doc(parsed.path);
  const snap = await ref.get();
  if (snap.exists || parsed.type === "flatExam") return { parsed, ref, snap };
  const topics = await db.collection(`classrooms/${parsed.cid}/topics`).get();
  for (const t of topics.docs) {
    for (const col of Object.keys(COL_TYPE)) {
      const alt = db.doc(`classrooms/${parsed.cid}/topics/${t.id}/${col}/${parsed.id}`);
      if (alt.path === ref.path) continue;
      const s = await alt.get();
      if (s.exists) return { parsed: { type: COL_TYPE[col], path: alt.path, cid: parsed.cid, tid: t.id, id: parsed.id }, ref: alt, snap: s };
    }
  }
  return { parsed, ref, snap };
}

async function releaseWork(db, tutorUid, tutor, parsed0, studentIds, dueAtIso) {
  const found = await locateItem(db, parsed0);
  const parsed = found.parsed, ref = found.ref, itemSnap = found.snap;
  const clsSnap = await db.doc("classrooms/" + parsed.cid).get();
  if (!itemSnap.exists || !clsSnap.exists) throw new HttpsError("not-found", "That item no longer exists. (" + (itemSnap.exists ? "classroom " + parsed.cid : parsed0.path) + " was not found)");
  const item = itemSnap.data() || {}, cls = clsSnap.data() || {};
  if (!(item.audiences && item.audiences.tutors === true)) throw new HttpsError("failed-precondition", "The Studio Desk has not posted this to tutors.");
  const subjects = Array.isArray(tutor.subjects) ? tutor.subjects : [];
  const stages = Array.isArray(tutor.keyStages) ? tutor.keyStages : [];
  if (subjects.indexOf(cls.subjectId) === -1 || (stages.length && stages.indexOf(cls.keyStage) === -1)) throw new HttpsError("permission-denied", "This subject is not assigned to you.");
  if (parsed.type === "exam" && item.status !== "Published") throw new HttpsError("failed-precondition", "Exam is not published.");

  const ok = [], rejected = [];
  for (const sid of studentIds) {
    const s = await db.collection("students").doc(sid).get();
    const row = s.exists ? s.data() : null;
    const enrolled = row && Array.isArray(row.subjects) && row.subjects.indexOf(cls.subjectId) !== -1 &&
      (row.year == null || cls.year == null || Number(row.year) === Number(cls.year));
    const active = row && ["pending", "suspended"].indexOf(String(row.status || "").toLowerCase()) === -1;
    if (row && enrolled && active && tutorTeaches(row, cls.subjectId, tutorUid)) ok.push(sid); else rejected.push(sid);
  }
  if (!ok.length) throw new HttpsError("failed-precondition", "None of the selected students are yours for this subject.");
  
  // Deadline: the tutor sets it when releasing homework / classwork (exams keep
  // their own exam date + submission deadline). It becomes the date we track.
  let dueUpdate = {};
  if (parsed.type === "assignment" || parsed.type === "lesson") {
    const when = dueAtIso ? new Date(dueAtIso) : null;
    const valid = when && !isNaN(when.getTime());
    if (!valid && !item.dueAt) throw new HttpsError("invalid-argument", "Please set a deadline before releasing this work.");
    if (valid) {
      if (when.getTime() <= Date.now()) throw new HttpsError("invalid-argument", "The deadline must be in the future.");
      dueUpdate = {
        dueAt: admin.firestore.Timestamp.fromDate(when),
        dueSetBy: tutorUid,
        reminderSent: false, graceNoticeSent: false, reportSent: false
      };
    }
  }

  // Release reaches ONLY the ticked students. We deliberately do NOT touch `audiences`:
  // flipping audiences.online/remote/tuition to true made the work visible to (and notify)
  // every student in the class. Students see it through `releasedTo`; their parents through
  // `releasedParents` (firestore.rules allows both).
  const parentIds = new Set();
  for (const sid of ok) { for (const p of await W.parentsOfStudent(sid)) parentIds.add(p.id); }
  const releasePatch = {
    ...dueUpdate,
    releasedTo: admin.firestore.FieldValue.arrayUnion(...ok),
    releaseLog: admin.firestore.FieldValue.arrayUnion({ by: tutorUid, byName: tutor.name || "", at: admin.firestore.Timestamp.now(), count: ok.length })
  };
  if (parentIds.size) releasePatch.releasedParents = admin.firestore.FieldValue.arrayUnion(...Array.from(parentIds));
  await ref.update(releasePatch);

  return { released: ok, rejected };
}

exports.tutorReleaseWork = onCall(
  { cors: true, region: W.LOCATION },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const db = admin.firestore();
    const t = await db.collection("tutorAccounts").doc(request.auth.uid).get();
    if (!t.exists) throw new HttpsError("permission-denied", "Tutors only.");
    const parsed = parsePath((request.data || {}).path);
    if (!parsed || ["assignment", "exam", "lesson"].indexOf(parsed.type) === -1) throw new HttpsError("invalid-argument", "Only lessons, homework and exams can be released to students.");
    const ids = Array.from(new Set(((request.data || {}).studentIds || []).map(String))).slice(0, 200);
    if (!ids.length) throw new HttpsError("invalid-argument", "Choose at least one student.");
    return releaseWork(db, request.auth.uid, t.data() || {}, parsed, ids, (request.data || {}).dueAt);
  }
);

/* =========================================================
   repairReleasedAudiences — admin callable, idempotent.
   Earlier versions of tutorReleaseWork switched audiences.online / remote /
   tuition to true, which exposed released work to every student. This puts
   those flags back to false when the Studio Desk never actually posted to
   that audience (no `publication.<audience>` record), so released work is
   visible only to the students it was released to.
   Run { dryRun: true } first.
========================================================= */
exports.repairReleasedAudiences = onCall(
  { cors: true, region: W.LOCATION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    await requireAdmin(request);
    const dryRun = !!(request.data && request.data.dryRun);
    const db = admin.firestore();
    const out = { dryRun, scanned: 0, repaired: 0, paths: [] };
    for (const group of ["assignments", "lessons", "exams"]) {
      const snap = await db.collectionGroup(group).get();
      for (const doc of snap.docs) {
        if (!doc.ref.path.startsWith("classrooms/")) continue;
        const d = doc.data() || {};
        if (!Array.isArray(d.releasedTo) || !d.releasedTo.length) continue;
        out.scanned++;
        const aud = d.audiences || {}, pub = d.publication || {};
        const patch = {};
        ["online", "remote", "tuition"].forEach((a) => { if (aud[a] === true && !pub[a]) patch["audiences." + a] = false; });
        if (!Object.keys(patch).length) continue;
        out.repaired++; out.paths.push(doc.ref.path);
        if (!dryRun) await doc.ref.update(patch);
      }
    }
    return out;
  }
);

/* =========================================================
   Notifications — fire when work BECOMES visible to an audience
========================================================= */
function fmt(d) { return d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: W.TIME_ZONE }) : ""; }

async function notifyStudentsOfWork({ kind, item, cid, entity, only, ids }) {
  const classroom = await W.classroomOf(cid);
  const probe = Object.assign({}, item, { audiences: { online: true, remote: true, tuition: true, tutors: false } });
  let students = await W.resolveStudents(classroom, item.recipients, probe);
  if (only) students = students.filter((s) => W.studentAudience(s) === only);
  if (ids) students = students.filter((s) => ids.indexOf(s.id) !== -1);
  const when = W.toDate(kind === "assignment" ? item.dueAt : item.examDate);
  const key = W.stableId(entity);

  // Notification title/type varies by kind. Lessons don't have a
  // due date, so we omit the date phrase and say "has been posted".
  const isHomework = kind === "assignment";
  const isLesson   = kind === "lesson";
  const nType  = isHomework ? "homework_assigned" : (isLesson ? "lesson_posted" : "exam_posted");
  const nTitle = isHomework ? "New homework posted"   : (isLesson ? "New lesson posted"   : "New exam available");
  const rEnt   = isHomework ? "assignment"            : (isLesson ? "lesson"              : "exam");
  const datePhrase = when
    ? (isHomework ? " is due " : " on ") + fmt(when)
    : " has been posted";

  for (const s of students) {
    const created = await W.notifyOnce(`work_${key}_${s.id}`, s.id, "student", {
      type: nType,
      title: nTitle,
      message: `${item.title} (${item.subjectName || ""}${item.topicTitle ? ", " + item.topicTitle : ""})${datePhrase}.`,
      relatedEntity: rEnt, relatedEntityId: entity, emailSent: !!s.email
    });
    if (!created) continue; // already told — a retry must not email twice
    if (s.email) {
      const t = templates.workPosted({ student: s, kind, item, dueAt: when });
      await W.sendEmail(s.email, t.subject, t.html);
    }
    for (const p of await W.parentsOfStudent(s.id)) {
      const pTitle = isHomework ? `New homework for ${s.name || "your child"}`
                   : isLesson   ? `New lesson for ${s.name || "your child"}`
                   :              `New exam for ${s.name || "your child"}`;
      await W.notifyOnce(`work_${key}_${p.id}_${s.id}`, p.id, "parent", {
        type: nType,
        title: pTitle,
        message: `${item.title} (${item.subjectName || ""})${when ? (isHomework ? " is due " : " on ") + fmt(when) : ""}.`,
        relatedEntity: rEnt, relatedEntityId: entity, extra: { studentId: s.id }
      });
    }
  }
}

async function notifyTutorsOfPost({ item, cid, entity, what }) {
  const classroom = await W.classroomOf(cid);
  if (!classroom) return;
  const snap = await W.db().collection("tutorAccounts").get();
  const key = W.stableId(entity, "tutors");
  for (const d of snap.docs) {
    const t = d.data() || {};
    if (String(t.status || "Active").toLowerCase() === "suspended") continue;
    if ((t.subjects || []).indexOf(classroom.subjectId) === -1) continue;
    if ((t.keyStages || []).length && t.keyStages.indexOf(classroom.keyStage) === -1) continue;
    await W.notifyOnce(`work_${key}_${d.id}`, d.id, "tutor", {
      type: "material_posted", title: "New material from the Studio Desk",
      message: `${item.title || what} (${item.subjectName || classroom.subjectName || ""}) is ready for you in the Classroom.`,
      relatedEntity: what, relatedEntityId: entity
    });
  }
}

function becameVisible(before, after, audience, live) {
  return W.isVisibleTo(after, audience, live) && !W.isVisibleTo(before, audience, live);
}

async function handleWorkAudienceChange(event, kind, live) {
  const before = event.data.before.data() || {}, after = event.data.after.data() || {};
  if (after.migrated === true) return;
  const { cid, tid } = event.params;
  const id = event.params.aid || event.params.eid || event.params.lid;
  const entity = `${cid}/${tid}/${id}`;
  for (const aud of ["online", "remote", "tuition"]) {
    if (becameVisible(before, after, aud, live)) await notifyStudentsOfWork({ kind, item: after, cid, entity, only: aud });
  }
  // students a tutor has just released the work to
  const newly = (after.releasedTo || []).filter((x) => (before.releasedTo || []).indexOf(x) === -1);
  if (newly.length) await notifyStudentsOfWork({ kind, item: after, cid, entity, ids: newly });
  if (becameVisible(before, after, "tutors", live)) await notifyTutorsOfPost({ item: after, cid, entity, what: kind });
}

const TRIGGER = { region: W.LOCATION, secrets: W.SMTP_SECRETS };
exports.onAssignmentAudienceChanged = onDocumentUpdated(
  Object.assign({ document: "classrooms/{cid}/topics/{tid}/assignments/{aid}" }, TRIGGER),
  (event) => handleWorkAudienceChange(event, "assignment", null)
);
exports.onNestedExamAudienceChanged = onDocumentUpdated(
  Object.assign({ document: "classrooms/{cid}/topics/{tid}/exams/{eid}" }, TRIGGER),
  (event) => handleWorkAudienceChange(event, "exam", "Published")
);
exports.onLessonAudienceChanged = onDocumentUpdated(
  Object.assign({ document: "classrooms/{cid}/topics/{tid}/lessons/{lid}" }, TRIGGER),
  (event) => handleWorkAudienceChange(event, "lesson", "published")
);


/* =========================================================
   Resources folder — notifications
   New resource  -> every active tutor of that subject
   Admin message -> tutors of that subject
========================================================= */
async function tutorsOfSubject(subjectId, keyStage) {
  const snap = await W.db().collection("tutorAccounts").get();
  return snap.docs.filter((d) => {
    const t = d.data() || {};
    if (String(t.status || "Active").toLowerCase() === "suspended") return false;
    if ((t.subjects || []).indexOf(subjectId) === -1) return false;
    if ((t.keyStages || []).length && !/^CBC/i.test(keyStage || "") && t.keyStages.indexOf(keyStage) === -1) return false;
    return true;
  });
}
exports.onResourcePosted = onDocumentCreated(
  { document: "classroomResources/{rid}", region: W.LOCATION },
  async (event) => {
    const r = (event.data && event.data.data()) || {};
    for (const d of await tutorsOfSubject(r.subjectId, r.keyStage)) {
      await W.notifyOnce(`res_${event.params.rid}_${d.id}`, d.id, "tutor", {
        type: "material_posted", title: "New resource from the Studio Desk",
        message: `${r.category || "Resource"}: ${r.title || ""} (${r.subjectName || ""}${r.topicTitle ? ", " + r.topicTitle : ""}) is in your Resources folder.`,
        relatedEntity: "resource", relatedEntityId: event.params.rid
      });
    }
  }
);
exports.onResourceMessage = onDocumentCreated(
  { document: "classroomResources/{rid}/messages/{mid}", region: W.LOCATION },
  async (event) => {
    const m = (event.data && event.data.data()) || {};
    if (m.authorRole !== "admin") return;
    const res = await W.db().doc(`classroomResources/${event.params.rid}`).get();
    const r = res.data() || {};
    for (const d of await tutorsOfSubject(r.subjectId, r.keyStage)) {
      await W.notifyOnce(`resmsg_${event.params.mid}_${d.id}`, d.id, "tutor", {
        type: "material_posted", title: "Studio Desk replied about a resource",
        message: `${r.title || "Resource"} (${r.subjectName || ""}${r.topicTitle ? ", " + r.topicTitle : ""}): ${String(m.text || "").slice(0, 100)}`,
        relatedEntity: "resource", relatedEntityId: event.params.rid
      });
    }
  }
);

/* =========================================================
   backfillAudiences — admin callable, idempotent, non-destructive.
   Stamps `audiences` on every record that lacks it, restating what was
   already true (live to online students, visible to tutors, never to
   remote). It does NOT notify anyone (visibility does not change) and
   never overwrites a record that already has audiences.
   Run with { dryRun: true } first. Safe to run any number of times.
========================================================= */
exports.backfillAudiences = onCall(
  { cors: true, region: W.LOCATION, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    await requireAdmin(request);
    const dryRun = !!(request.data && request.data.dryRun);
    const db = admin.firestore();
    const counts = { lesson: 0, assignment: 0, exam: 0, flatExam: 0, alreadyDone: 0 };
    const groups = [["lessons", "lesson"], ["assignments", "assignment"], ["exams", null]];
    for (const [group, fixed] of groups) {
      const snap = await db.collectionGroup(group).get();
      let batch = db.batch(), n = 0;
      for (const doc of snap.docs) {
        const type = fixed || (doc.ref.path.split("/").length === 4 ? "flatExam" : "exam");
        if (!doc.ref.path.startsWith("classrooms/")) { continue; }   // never touch top-level legacy collections
        const d = doc.data() || {};
        if (d.audiences && typeof d.audiences === "object") { counts.alreadyDone++; continue; }
        counts[type]++;
        if (dryRun) continue;
        batch.update(doc.ref, { audiences: legacyAudiences(type, d), audiencesBackfilledAt: admin.firestore.FieldValue.serverTimestamp() });
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
      if (!dryRun && n % 400 !== 0) await batch.commit();
    }
    let parentsRebuilt = 0;
    if (!dryRun) {
      const parents = await db.collection("parentAccounts").get();
      for (const p of parents.docs) { await rebuildParentAccess(p.id); parentsRebuilt++; }
    }
    return Object.assign({ dryRun, parentsRebuilt }, counts);
  }
);

exports._internals = { parsePath, audiencesFor, legacyAudiences, publishOne, publishItems, releaseWork, tutorTeaches, becameVisible, TYPES };