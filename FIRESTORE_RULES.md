# Firestore Security Rules — Paisley Studio LMS

This file documents `firestore.rules`, which is the file Firebase actually
deploys (`firebase.json` → `"firestore": { "rules": "firestore.rules" }`).
**Treat `firestore.rules` as the source of truth — this file explains it,
it doesn't replace it.** If they ever disagree, `firestore.rules` wins;
update this file to match.

> **2026 fix note:** `firestore.rules` previously contained a stray copy of
> `functions/index.js` (a packaging mistake), so nothing here was actually
> being enforced by that file. It has been restored to real rules and
> extended to cover every collection the app uses — several (`tutorAccounts`,
> `notes`, `notifications`, `timetables`, `liveClasses`, `gradingGrants`,
> `tickets`) had no rules at all before this fix, meaning tutor/admin
> features built after the original rules were written were running on
> whatever fallback rules were live in the Firebase console, not on anything
> version-controlled here. Please re-check the console's published rules
> against this file after your next `firebase deploy --only firestore:rules`.

## Roles

The app has **four** kinds of signed-in users, told apart by which
collection their UID appears in — not by a `role` field a client could fake:

1. **Admin** — UID exists in `admins/{uid}`. Full access to everything.
2. **Tutor** — UID exists in `tutorAccounts/{uid}`. Broad read access
   (dashboards and the integrity view intentionally show cross-student
   context so grading-grant workflows work), but write access is scoped to
   content they authored (`tutorId`/`hostId`/`postedById` == their UID) or
   an active grading grant (`gradingGrants/{taskType}_{taskId}_{tutorUid}`,
   `revoked != true`).
3. **Student** — has a `students/{uid}` doc. Can only touch their own
   profile, submissions, attempts, and tickets.
4. **Parent** — has a `parentStudentLinks/{parentUid}_{studentUid}` doc
   (created only by admin/Cloud Functions, never by the parent). Read-only,
   and only for the linked child's data.

## One-time setup: mark your admin account(s) as staff

1. Open the [Firebase console](https://console.firebase.google.com) → your
   `paisley-89c77` project → **Firestore Database**.
2. Create a collection called `admins`. Add one doc per staff member, with
   the **Document ID set to their Auth UID** (Authentication → Users →
   "User UID"). Fields don't matter — one is enough, e.g. `name: "Registrar Desk"`.
3. Tutor accounts are created automatically in `tutorAccounts/{uid}` by
   `admin/tutors.html` (`createTutorAccount()`), so no manual step is needed
   for tutors.

Without step 2, an admin account will be treated as a regular signed-in
user and denied access.

## Collection-by-collection summary

| Collection | Create | Read | Update/Delete |
|---|---|---|---|
| `enrolments`, `tutors`, `messages`, `newsletter` | anyone | admin | admin |
| `admins` | — | admin | never |
| `tutorAccounts` | admin | anyone (public tutor login page) | admin |
| `students` | the student (own uid) | owner, admin, any tutor, linked parent | owner (not `status`), admin |
| `examResults` | admin/tutor | owner student, admin, tutor, linked parent | admin/tutor |
| `homework` | admin, or authoring tutor | any signed-in user | admin, or authoring/granted tutor |
| `submissions` | owner student | owner, admin, tutor, linked parent | admin, or authoring/granted tutor |
| `exams` | admin, or authoring tutor | admin, tutor, or any signed-in user if `status == 'Published'` | admin, or authoring/granted tutor |
| `examAttempts` | owner student | owner, admin, tutor, linked parent | owner student (autosave/submit), admin, or granted tutor |
| `notes`, `notifications`, `timetables` | admin/tutor | any signed-in user | admin, or the posting tutor |
| `timetableEntries` (new) | admin, or assigned tutor | any signed-in user | admin, or assigned tutor |
| `liveClasses` | admin, or hosting tutor | any signed-in user | admin, or hosting tutor |
| `liveClassSessions`, `liveClassIntegrityEvents` (new) | owning student | owner, admin, hosting tutor | append-only — no client update/delete on events |
| `gradingGrants` | admin only | admin, the granted tutor | admin only |
| `tickets` | owner student | owner, admin, the student's tutor, linked parent | admin, the student's tutor |
| `activities`, `activityAttempts`, `activityAssignments` (new) | admin/tutor (activities), owner student (attempts) | admin, tutor, published-only for others; owner/linked-parent for attempts | admin, or owning tutor/student |
| `parentAccounts`, `parentStudentLinks` (new) | admin only | the parent (own), admin | admin only |
| `personalNotifications` (new) | admin/Cloud Functions only | the recipient, admin | recipient may only flip `read` |

## Why this matters

Without correct rules, any signed-in user — including a student who just
created an account — could read or write *any* document, including other
students' results, other tutors' classes, or the admin queue. Publishing
`firestore.rules` is what actually makes "student", "tutor", "admin", and
"parent" behave like separate roles.

After publishing (`firebase deploy --only firestore:rules`), test:
- Sign up as a brand-new student → dashboard shows the "pending" screen
  (proves a student can't self-activate).
- Sign in to `/admin/` with a UID in `admins` → Student Management loads.
- Sign in as a tutor → their dashboard loads assigned students, and grading
  a task they don't own and have no grant for is rejected.
- (Once the parent portal ships) sign in as a parent → only the linked
  child's data loads, and switching the URL/id to another student is denied.

## Subjects, Year, parents & private messages (upgrade)

- **students** — a student can no longer edit their own `status`, `keyStage`,
  `year`, `subjects` or `subjectNames`. Client-side delete is disabled
  (`allow delete: if false`); deletion goes through the `deleteStudentAccount`
  Cloud Function (Admin SDK: archives to `archivedStudents`, removes the Auth
  user and parent links). `archivedStudents` is admin read-only.
- **timetableEntries** — reads are subject-scoped. Admin: all. Tutor: only
  sessions whose `subjectId` is in their `tutorAccounts.subjects` (none
  assigned = nothing). Student: own `keyStage` + own `subjects` (no subjects
  recorded yet = own Key Stage, the pre-upgrade behaviour). Parent: pairs in
  `parentAccess/{uid}.slots` ("KeyStage|subjectId", or "KeyStage|*"). Because
  rules cannot filter a collection, clients query one `subjectId` at a time.
- **parentAccess/{uid}** — maintained only by Cloud Functions
  (`syncParentAccessOnLink`, `syncParentAccessOnStudent`, `refreshParentAccess`);
  clients can read their own, never write.
- **parentConversations/{parentUid_studentUid}/messages** — readable/writable
  only by admins and the linked parent. There is no rule matching students or
  tutors, so the database refuses them.
- **Multiple roles** — roles are separate docs (`admins`, `tutorAccounts`,
  `parentAccounts`) keyed by the same Auth UID, so one login can hold several.

Deploy order: `firebase deploy --only functions`, then `firestore:rules`,
then hosting. Open the Admin console once after deploying: it backfills
`subjectId` on existing timetable sessions and normalises existing tutors'
subjects to ids.

## Classroom (subject → topic → ordered lessons)

- **classrooms/{subjectId}_y{year}** — one per subject + Year (subject ids are the
  same ones used by students, tutors and the timetable). Admin: full. Tutor:
  classrooms of subjects in `tutorAccounts.subjects` (create/edit also respects
  the tutor's Key Stages when set). Student: only a subject in `students.subjects`
  in their own `year` (or own `keyStage` for profiles with no Year yet).
- **classrooms/{id}/topics/{topicId}** — same access as the classroom; only
  admin/assigned tutors can write.
- **classrooms/{id}/lessons/{lessonId}** — admin/assigned tutors read every status;
  a student reads **only `status == 'published'`**. Draft, scheduled-not-yet-released
  and archived lessons are refused by the database. Writes by tutors must carry a
  title and a valid status; `scheduled` needs a `publishAt` timestamp.
- **Scheduled release** — the `publishScheduledLessons` Cloud Function runs every
  minute and flips `scheduled` → `published` once `publishAt` has passed.
  Needs the collection-group index added in `firestore.indexes.json`.
- **Storage** — `classroom-files/{subjectId}/{classroomId}/{lessonId}/{file}`.
  Admin or a tutor assigned that subject may write/delete (100 MB, PDF / Office /
  CSV-TXT / images / audio / video). Listing is denied. `onClassroomLessonDeleted`
  removes a deleted lesson's files server-side.
- `lessons/{id}/assignments` is intentionally unmatched (default deny) — reserved
  for the future assignments feature.

Deploy: `firebase deploy --only functions,firestore:rules,firestore:indexes,storage`
then hosting. The index takes a few minutes to build; scheduled release starts
working once it is ready.


## Audience model (Remote Students upgrade)

Lessons, assignments and exams are readable per audience via `audiences.{online,remote,tutors}`; queries must filter on the same flag. `students.studentType` is writable only by admins/Cloud Functions. Tutors cannot create or modify curriculum, assignments, exams or notes. See `REMOTE_UPGRADE.md` for the data model, deployment order and the emulator tests in `tests/rules/`.
