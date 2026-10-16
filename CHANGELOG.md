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
