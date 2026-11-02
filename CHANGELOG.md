# Tech Studio class work, groups, the new IDE; physical hand-in per subject (2026-11-02)

- **Lesson names.** A lesson needs no title: class > topic names it, and it shows as "Lesson 1", "Lesson 2" (or "Practice test 1") inside its topic (`TechClasses.labelsFor`; `lessonTitle` in `functions/tech.js` for emails). The lesson page heading is the topic, with the lesson number beside it.
- **Lesson page.** A sensibly sized video with the topic's lessons in a side list, notes / instructions / files in tabs, then the quiz. A lesson's practice tool (Code IDE or writing pad, chosen in the editor as "Practice tool", requirements optional) sits under the video as a Practise button that opens it in a pop-up with the requirements and hand-in beside it. The IDE has a full screen button.
- **Class work.** A lesson or practice test can carry `task: { brief, kind: 'code' | 'writing' }`. The builder does it in the lesson, in the Code IDE or the writing pad, and hands it in (`techLessonWork/{uid}_{lessonId}`, `js/tech/tech-work.js`). Coaches and admins see hand-ins in Results > Class work hand-ins and per lesson ("Hand-ins"), run the code, and mark it with the classroom ink grader: the work becomes a PDF on the page (each file line-numbered, or the writing) and the marked copy is saved under `techGraded/`. Feedback, score and marked copy show to the builder and in the Tech parent portal. `onTechLessonWorkWritten` sends the bells and emails. Lessons no longer start a separate project.
- **Groups.** `techGroups` (coach or admin picks the builders) with `tasks` that members do together in one live IDE: edits merge through a transaction and a three-way merge per file, and each member's cursor shows to the others (`presence/{uid}`). Any member hands it in; staff mark it with ink like class work. Builder tab "My group"; coach and admin tab "Groups" (`js/tech/tech-groups.js`). `onTechGroupWritten` / `onTechGroupTaskWritten` notify members, the coach and families.
- **Code IDE** (`js/tech/code-lab.js`, used by projects, class work and groups) is now CodeMirror 5 with autocomplete as you type (Ctrl+Space any time), Emmet (type `ul>li*3` then Tab), auto-closing tags and brackets, folders, picture / video / sound uploads that the preview resolves (`codeFolders`, `codeAssets`), links between the project's own pages, and a console. It loads from cdnjs and jsDelivr on first use and falls back to a plain text box if they are unreachable.
- **Paisley VS Code.** The code IDE is called Paisley VS Code everywhere builders see it (badge in its toolbar, the lesson's button, project tabs).
- **Practice pop-up carries the lesson.** It shows the class, topic and lesson name above the requirements. A lesson's task can hold up to 10 questions (`task.questions: [{ id, text }]`), a short quiz or test that goes with the work: builders answer them beside the work (saved as `techLessonWork.taskAnswers`, which the rules allow the builder to change only before hand-in) and hand everything in together. Staff see the answers in the work viewer, and they are printed at the top of the PDF marked with ink. They are not marked automatically.
- **Folder uploads in the IDE.** Every folder has an Upload button that opens the computer's file picker and puts the pictures, videos or sounds in that folder; the picker shows only pictures for an images folder and only videos for a videos folder. Making a folder named images, videos, media, sounds (and similar) opens the picker straight away where the browser allows it.
- **Google Drive videos.** `FastVideo` plays a Drive link (file/d/ID, open?id=, uc?id=) in Google's player (`/preview`). The file must be shared as "Anyone with the link".
- **Physical hand-in per subject.** `students.handInBySubject[subjectKey]` is `physical` or `online` (the default). Admin sets it per subject in the student window; a tutor can set it for the work's subject from its student list. The old all-subjects `physicalStudent` still applies where a subject has no choice, and is cleared when an admin saves (`lmzHandInStyle`, `isPaperStudent(student, subjectId)`). Labels say "Physical hand-in" and "Online hand-in".

# Tech Studio classes and levels (2026-11-02)

- **Levels.** `techStudents.skillLevel` is `beginner`, `intermediate` or `expert`, chosen on the join form. Beginners get their own work; intermediate and expert see the same (`TechUI.trackOf`, tracks `beginner` / `advanced`). Older builders are asked once when they next open their studio, and count as advanced until then. After that only an admin changes it (Admin > Tech Studio > Builders). A new beginner raises the admin bell and an email.
- **Classes replace missions for new work.** Built like the curriculum classrooms: `techCourses` (the CODING card) > `techTopics` (Flow) > `techLessons` (a lesson or a practice test), in `js/tech/tech-classes.js`, shared by Admin and the coach portal. A lesson is a video, notes, instructions, files, an optional quiz and an optional project. New missions can no longer be created; existing ones stay so builders can finish them, under Older missions.
- **Posting.** Admins and coaches both post, to a level rather than to chosen builders. `onTechLessonWritten` tells every active builder on that level and their guardians once, by bell and email. Notifications carry `lessonId` and `courseId`; they stay unread until the lesson is opened, which drives the bubbles on the Classes tab and each subject card.
- **Quizzes and practice tests** are marked on the server by `submitTechQuiz`. Answers live in `techLessons/{id}/private/key`, which builders and parents cannot read; attempts go to `techAttempts`, written only by the function. Results tabs for admins and coaches.
- **Options are optional.** A question can be a written answer with no options and no answer key; coaches read those in Results, and they do not count towards the score.
- **Tech parent portal** now has the same design as the main Parent Portal, and a Classes tab showing posted work and scores (read-only).

# One login, many accounts; coach applications (2026-11-01)

- **Which account?** `js/ui/account-roles.js` (`PaisleyRoles`) lists every account on a login. `/tech` asks when there is more than one, instead of guessing. The dedicated logins (`/tutor`, `/parent`, `/tech/coach`, `/tech/parent`) go straight to their own portal, and link to the others when the login has no account there. Roles still come from which collection holds the uid, never from age.
- **Coach applications.** Any login can create `techCoaches/{uid}` with status `Pending` (`/tech/coach?apply=1`). It grants nothing: only an admin approves it, through Admin > Tech Studio > Coaches, which runs `createTechCoach`. `onTechCoachApplied` tells the desk. Under-18 builders cannot apply or be made coaches; adult builders now can.

# Parent ads, parent newsletters, video links, "with AI" disciplines (2026-11-01)

- **Parent ads.** `parentAds`, admin only (Admin > Ads & Newsletter). A banner image, a video (link or upload) or just writing, with optional heading, button and running words, shown on the Overview of `parent/dashboard.html` only, never the Tech Studio guardian portal (`js/parent/parent-ads.js`). Paisley colours and cards only. They sit below the child's figures, video is muted and plays only on screen, parents can close an ad until their next login, and nothing downloads on Data Saver or 2G until pressed.
- **Parent newsletters.** `parentNewsletters`, sent by the admin-only `sendParentNewsletter` callable to every parent with a `parentStudentLinks` entry; Tech Studio-only guardians are left out. `deliveries/{uid}` makes retries safe. Newsletter tab on the main Parent Portal. Opt-out is `parentNewsletterPrefs/{uid}.emailOptOut`, from the tab or the email link (`parentNewsletterUnsubscribe`). Website footer subscribers (`newsletter`) are not emailed.
- **Video links.** `js/ui/fast-video.js` plays AWS links (MP4, M3U8), YouTube and Vimeo. Mission materials and the navigation video take a link first; uploading from a computer still works. `techSettings/portal.navVideo` now holds `url` or `path`. See "Hosting videos on AWS" in `TECH_UPGRADE.md`.
- **Disciplines.** AI is no longer a discipline or a new project type. Stored ids stay `Coding`, `Music` etc.; everyone sees `TechUI.disciplineLabel()`, "Coding with AI". Old records tagged `AI` count as Coding with AI, and their old `levels.AI` is folded in the next time the builder's progress is recomputed.

# Paisley Tech Studio: rename, notifications, bubbles, navigation video, email redesign (2026-11-01)

- **Lost notifications fixed.** `techNotify` cleaned ids with `/[^w-]/` instead of `/[^w-]/`, so different events collapsed into one document and were dropped as duplicates, along with the emails that depend on them. Notifications lost before this fix are not re-sent.
- **Approval.** `templates.techStudentApproved` sends sign-in page, email and a password reminder. Passwords cannot be read back from Firebase Auth, so they are never in an email for self-registered students.
- **Back and forth.** Coach and Studio Desk comments now email the builder; builder replies email the coach; `techChats` messages email both ways, at most once per 15 minutes per direction (`emailedCoachAt`, `emailedStudentAt`). Guardians are emailed about new missions.
- **Posted content.** Every published `techContent` kind raises a bell and bubble (`section` on the notification); missions and challenges also email. Widening a published item's audience tells the new people.
- **Bubbles.** `TechUI.mountBubbles` on the builder, coach, guardian and admin tabs.
- **Navigation video.** Admin upload to `techSettings/navVideo/`, `techSettings/portal.navVideo` holds the path, `TechUI.openVideoModal` plays it. Blocks the download control, right-click, picture-in-picture and casting; it cannot stop screen recording or someone capturing the link with developer tools.
- **Emails.** New shell with `render({ programme })`; no curriculum wording in the shared shell or report PDF. Tech Studio family desk replies now use the guardian portal and the builder's record.

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
