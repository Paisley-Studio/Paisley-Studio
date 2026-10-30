# Exam boards, paper hand-ins, fresh starts, overdue reports (2026-10-30)

- **Timetable boards.** `timetableEntries.board` and `timetables.board` (missing = Cambridge). Students, parents and tutors are filtered in the browser (`lmzEntryForStudent`, `lmzTimetableForStudent`, `lmzTutorCovers`). Timetables are not sensitive, and a board where-clause would hide every older session, so the rules do not check it.
- **Tutor boards.** `tutorAccounts.teaching[].boards`, chosen per subject in the admin teaching picker, with `tutorAccounts.boardScope` (`"keyStage|subjectId|board"`) derived for the rules and functions. A tutor with no `boardScope` is Cambridge only, so anyone already teaching another board must be given it. CBC has no boards.
- **Boards are also enforced for students:** class-wide notifications, reminders, enrolled lists and the release list only include students on the classroom's board. `classStudentMay` and `classTutorMay` check it. **Known limit:** the collection-group rules at the top of `firestore.rules` let any signed-in user read assignment and lesson documents, so read separation for those two is done by the app, not the database. Exams, hand-ins and all writes are enforced. This is also why 7 of the older audience rules tests fail.
- **Released button.** Reads Released in green once this tutor has released an item (`releaseLog`, because `releasedTo` is shared between tutors) and stays clickable. Releasing again without touching the deadline keeps the deadline and its reminder flags. Tutors can now also release flat exams, which the callable used to refuse.
- **Fresh start.** `students.activatedAt` is stamped on Pending to Active (`onStudentActivated`) and on remote admission. Class-wide work published before it is hidden and never reminded about (`workPredatesStudent`, `lmzWorkPredatesStudent`), including lessons. Work a tutor releases by name still arrives. Accounts with no `activatedAt` are unchanged.
- **Overdue reports.** `overdueWorkDigest` runs daily at 07:00 Nairobi: each student and their parents get one PDF + email of everything over 24 hours overdue (homework, classwork, flat exams), repeating every 2 days for work up to 30 days late. `overdueWorkState/{uid}` holds the last send. Admin: Automation > Pending work report. New indexes: `lessons.dueAt`, `exams.submissionDeadline`.
- **Paper hand-ins** (`js/classroom/paper-handins.js`). `students.physicalStudent` is set by the admin or the student's tutor and stops upload reminders and overdue notices. Tutors and admins record received/graded per student on any work, as a `submissions/{uid}` doc with `handIn: 'physical'`. Admin screens use `publish-helpers.js`, tutor screens `work-helpers.js`; both render through the shared module.
- **TECH sign-up.** Fixed the crash (`existingNote` no longer existed). A student email is always on the form and required. Firebase allows one login per email, so an email that already exists joins with that account's password, whatever role it has. Coaches and guardians can join through `?tab=signup`.

# Remote Students upgrade (see REMOTE_UPGRADE.md)

- New admin nav item **Remote Students**; central publishing (Publish tab / Publish… button) inside **Classroom**.
- Remote student portal (`/remote`), remote-aware parent portal, audience model (`audiences`/`publication`/`releasedTo`) on lessons, assignments and exams.
- Tutors can no longer create or edit curriculum/assignments (UI + Firestore/Storage rules); they release posted work to their own students and grade.
- Student Results section copied to `index.html`. Emails use a single `APP_URL` (default https://paisleystudio.online); auth links carry a continue URL.
- **Deployment order matters — run the `backfillAudiences` migration before deploying the new rules.**
- Security reminder still open: rotate the service-account key that was in the original zip (`vertex-key.json`, now excluded).

# CHANGELOG - Homework and Exams moved into the Classroom tree

Date: 2026-10-07. Nothing has been run against a live Firebase project or an emulator. See "Not verified".

## Read this first: where the zip differed from the brief

| Brief said | The zip actually has | What I did |
|---|---|---|
| `studio-desk.html`, `tutor/dashboard.html` | `admin/index.html`, `tutor/index.html` | Edited the real files |
| Lessons at `classrooms/{cid}/topics/{tid}/lessons` | Lessons at `classrooms/{cid}/lessons` (with a `topicId` field) | Left lessons alone. Assignments and exams are nested under topics as specified |
| Font Awesome `<link>` "already present" in `render()` | It was not | Added it to the email shell |
| `PORTALS` links | Student and admin links pointed at pages that do not exist (`/student/login.html`, `/studio-desk.html`) | Corrected to `/student` and `/admin` |
| Existing Homework / Exams were top-level admin nav items | They were sub-tabs of Student Management | Removed those two sub-tabs |

## Deviations you should know about

1. **AI exam attempts stay in top-level `examAttempts`.** `student/exam.html` and the `recordViolation` callable are bound to `exams/{id}` and `examAttempts`. Re-nesting them means editing the integrity code you told me not to touch. Instead, a nested AI exam keeps a `legacyExamId` pointer and a mirror doc is written to `exams/{legacyExamId}`. `exam.html` is unchanged. Only PDF-mode attempts use `topics/{tid}/exams/{eid}/attempts/{uid}`.
2. **Recipient scoping for tutors is enforced after the fact.** Firestore rules cannot loop over a list and check each student. The client only offers enrolled students, and `onAssignmentPosted` removes anyone not enrolled (and deletes the assignment if nobody valid is left).
3. **Parents are blocked from homework PDFs in the UI only.** Parents can read the assignment document (needed for the status view), which contains `attachedPdfUrl`. Storage `get` has always been open to any signed-in user via unguessable tokens. Truly blocking it needs the PDF URL moved into a student-only subdocument.
4. **Graded file name** is `graded_{studentName}_{assignmentTitle}.pdf` (section 5). Section "STUDENT" asked for "graded + original PDF name"; the two conflict and I chose section 5.
5. **Tickets and Messages nav badges** keep their existing live counters. The new bell-driven badges are on Classroom, Homework, Exams and Notices.
6. **Tutors can still update legacy top-level homework/exams they own**; only creation is revoked.
7. **Ink storage limit.** Ink is stored on the submission document (1 MiB Firestore cap). Points are thinned and a 900 KB guard stops syncing with a visible warning. Marks are also mirrored to the browser's localStorage and restored on reopen.

## Required deployment steps

1. `cd functions && npm install` (adds `pdf-lib`, `@pdf-lib/fontkit`; `package-lock.json` is now stale).
2. `firebase deploy --only firestore:rules,firestore:indexes,storage,functions`
3. Storage CORS (pdf.js must fetch student files): `gsutil cors set cors.json gs://<your-bucket>`. Edit the origins first.
4. Admin: Homework Management > Legacy > "Preview", then "Run migration". Safe to repeat.
5. Security: `vertex-key.json` (a service-account key) is inside the zip. Rotate that key and keep it out of source control and hosting.

## Added

- `js/classroom/work-helpers.js` - WorkUI core: management screens, Post Assignment, Create Exam, grant dialog, Legacy view, job triggers
- `js/classroom/work-learner.js` - student work views and read-only parent views
- `js/classroom/ink-grader.js` - Ink Grading Workspace (pdf.js, pdf-lib, autosave, Save Draft, Grade)
- `functions/deadlines.js` - `homeworkDeadlineReminder`, `homeworkOverdueGraceNotice`, `generateUnattendedWorkReport`, `examReminderToParents`, `runDeadlineJob`
- `functions/work.js` - `onAssignmentPosted`, `onExamPostedOrPublished`, `onSubmissionWritten`, `onExamAttemptWritten`, `migrateLegacyHomeworkAndExams`
- `functions/work-shared.js` - recipient resolution, notification writes, storage helpers
- `functions/fonts/Quicksand-Regular.ttf`, `Quicksand-Bold.ttf` (OFL, for the report PDF)
- `cors.json`, `CHANGELOG.md`

## Modified

- `firestore.rules` - nested assignments/submissions/exams/attempts; `studentNotices`; parents may read classrooms/topics for their child's subjects; tutors can no longer create classrooms or top-level homework/exams
- `storage.rules` - student submission uploads, `graded-submissions/`, `unattended-reports/`
- `firestore.indexes.json` - `personalNotifications` index; collection-group overrides for `assignments.dueAt`, `exams.examDate`
- `functions/index.js`, `functions/notifications.js` (`sendEmail` accepts attachments), `functions/email-templates.js` (FA link, portal URLs, six new templates), `functions/package.json`
- `lms-helpers.js` - `mountNotificationBell`, `lmzNotifCategory`, `watchMyStudentNotices`
- `js/classroom/classroom-helpers.js` - Post Assignment button in the Lesson Editor, tutors can no longer add classrooms, assignments/exams shown inside student topics, `ClassroomUI.util` export
- `admin/index.html`, `tutor/index.html`, `student/dashboard.html`, `parent/dashboard.html` - new nav, views, bell, badges

## Removed

- Admin: Homework and Exams sub-tabs (panels left in the DOM, unreachable; old lists are in Legacy).
- Tutor: Homework and Exams nav items; "Post homework" and "Set exam" buttons (hidden and disabled).
- No file or collection was deleted.

## Not verified

- No browser run of the ink workspace, no emulator run of the rules, no deploy. I checked: JS syntax of every changed file, module loading in jsdom, the status logic, report PDF rendering (visually), and the pdf-lib burn-in mapping (rotation 0 and 90, highlighter opacity) by rendering test PDFs.
- Email icons use Font Awesome as asked; many mail clients ignore external CSS and will show nothing for them.
