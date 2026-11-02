# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Paisley Studio: a tutoring-school website and LMS on Firebase (project `paisley-89c77`, production domain `https://paisleystudio.online`). It has three parts:

- **Static frontend** (repo root): plain HTML pages with inline `<script>` blocks and vanilla JS. There is **no build step and no bundler**. Firebase is loaded through the v10.13.0 **compat** SDK from gstatic (`firebase.firestore()`, `firebase.functions().httpsCallable(...)`), not the modular API. Firebase Hosting serves the repo root (`firebase.json` → `"public": "."`). `vercel.json` has the same routes for Vercel.
- **Cloud Functions** (`functions/`): Node 22, firebase-functions v2, CommonJS. `functions/index.js` defines some functions directly and re-exports every function from the domain modules (`publishing.js`, `remote.js`, `work.js`, `deadlines.js`, `tuition.js`, `tech.js`, `notifications.js`, `classroom.js`, `parent-access.js`). A new function must be exported from `index.js` or it won't deploy.
- **Cloudflare Worker** (`paisley-realtime-worker/`): creates Cloudflare RealtimeKit meetings for live classes. The frontend calls it at `*.workers.dev` (`lms-helpers.js`, `live-class.html`). It is an ES module deployed with wrangler; `CLOUDFLARE_API_TOKEN` is a wrangler secret.

## Commands

```bash
# Functions unit tests (node:test, in-memory Firestore fake; no Firebase needed)
cd functions && npm test
cd functions && node --test test/publishing.test.js --test-name-pattern "<name>"   # single test

# Static structural checks (run from repo root)
node scripts/verify-project.js                       # nav/rules/routes/email invariants
node scripts/check-rules.js firestore.rules storage.rules   # brace balance + undefined helpers

# Firestore rules tests (Firestore emulator; firebase CLI + Java are available locally)
npm i --no-save @firebase/rules-unit-testing firebase
firebase emulators:exec --only firestore "node --test tests/rules/tech.rules.test.js tests/rules/tech-classes.rules.test.js tests/rules/tech-work.rules.test.js tests/rules/firestore.rules.test.js"
# (list files: `node --test tests/rules/` with a directory argument fails on Windows)
firebase emulators:exec --project paisley-tech-storage --only firestore,storage "node --test tests/rules/tech.storage.test.js"
# (storage rules read Firestore under the emulator's --project, so it must match the test's projectId)

# Local preview: serve the repo root statically (VS Code Live Server is set to port 5502), or
firebase emulators:start

# Deploy (see "Deployment order" below)
firebase deploy --only functions,firestore:indexes
firebase deploy --only firestore:rules,storage,hosting
```

There is no linter. To syntax-check JS, use `node --check <file>`.

## Frontend architecture

- **Portals** are directories, each with a login `index.html` and a `dashboard.html`: `admin/`, `tutor/`, `student/`, `parent/`, `remote/`, `tuition/`, `tech/`. The public marketing pages are at the root. Clean URLs come from rewrites in **both** `firebase.json` and `vercel.json`, so a new route goes in both.
- **Shared globals** come from plain `<script>` tags, and load order matters: Firebase compat SDKs → `firebase-config.js` (defines global `db`) → `lms-helpers.js` (LMS data-access functions for every collection) → feature modules in `js/` (`js/classroom/*` ClassroomUI/WorkUI/publishing/ink grading, `js/activity-engine/*`, `js/tuition`, `js/tech`, `js/parent`, `js/admin`, `js/ui/paisley-ui.js`).
- Top-level shared declarations deliberately use `var`, not `const`, so a double-loaded script doesn't abort (see the comment in `firebase-config.js`). Keep that pattern. `admin/firebase-config.js` and `admin/firestore-helpers.js` are older, divergent copies of the root files.
- **Cache busting:** pages load scripts with `?v=...` query strings (e.g. `work-helpers.js?v=live7`). When you change a shared JS file, bump its `?v=` on every page that includes it. `sw.js` caches the site shell. Bump `CACHE_NAME` when cached behaviour must change, and keep Firebase/Google hosts in `BYPASS_HOSTS`.
- `admin/index.html` (~4.6k lines) is a single-page dashboard with views switched by `data-view` nav buttons. `scripts/verify-project.js` asserts the exact set of admin nav items, so adding or renaming one means updating that script.

## Data model and security (the cross-cutting part)

- Roles come from **which collection holds the user's UID**, never from a role field: `admins/{uid}`, `tutorAccounts/{uid}`, `students/{uid}`, parents via `parentStudentLinks/{parent}_{student}` and `parentAccess/{parent}`. See `FIRESTORE_RULES.md` for the per-collection table. `firestore.rules` is the source of truth, so update the .md to match it.
- `students/{uid}.studentType` divides students into portals: absent = online, `"remote"`, `"tuition"`, `"tech"`. Only admins or the Admin SDK may set `studentType` or `status`. Accounts begin as `Pending` and become `Active` when an admin activates them, and several functions trigger on that transition.
- Curriculum lives under `classrooms/{cid}/topics/{tid}/` (`lessons`, `assignments` with `submissions`, `exams` with `attempts`). Legacy top-level `homework`/`exams`/`examAttempts` still exist. AI exams keep a mirrored `exams/{legacyExamId}` doc so `student/exam.html` and `recordViolation` keep working.
- **Audience model** (see `REMOTE_UPGRADE.md`): each lesson/assignment/exam carries `audiences: {online, remote, tutors}`, `publication`, and `releasedTo[]`. Content reaches an audience only through the `publishClassroomContent` callable (`functions/publishing.js`, `TYPES` table). Tutors cannot create curriculum. They release posted work to their own students through `tutorReleaseWork`. **Rules are not filters:** every client query on audience-gated collections must include the matching `audiences.<x> == true` where-clause, or the whole query is denied.
- **Exam boards:** a classroom has `board` (missing = Cambridge; ids in `LMZ_BOARDS`). Students follow `subjectBoards[subject]`, else `board`. Tutors teach `teaching[].boards`, with `boardScope` derived by `lmzTeachingWriteFields` for the rules and functions; no `boardScope` means Cambridge only. Timetable entries carry `board` too. Tutors get one card per subject + Year with a switcher for their boards (`tutorBoardRows` in `classroom-helpers.js`); bubbles and notification chips are coloured by board. Keep `functions/work-shared.js`, `lms-helpers.js` and `firestore.rules` in step.
- **New students start fresh:** class-wide work published before `students.activatedAt` is neither shown nor reminded about; a tutor release by name still delivers it.
- **Physical hand-in, per subject:** `students.handInBySubject[subjectKey]` is `physical` or `online` (default online); the older all-subjects `physicalStudent` counts only where a subject has no entry. Always check it through `lmzHandInStyle` / `lmzHandsInOnPaper(student, subjectId)` (lms-helpers) or `isPaperStudent(student, subjectId)` (work-shared), never the raw flag. A physical subject stops upload reminders and overdue notices for that subject. Staff record hand-ins as `submissions/{uid}` with `handIn: 'physical'` through `js/classroom/paper-handins.js`.
- **Admin uses a different copy of the work screens:** `publish-helpers.js` overrides `WorkUI.mountManagement` from `work-helpers.js` on the admin page, so staff-screen changes go in both.
- Notifications use deterministic IDs (`notifyOnce`, sha1-based publication IDs) so retries are idempotent. Keep that property when adding triggers. Emails are built in `functions/email-templates.js` (`render`, `PORTALS`, `APP_URL`). SMTP credentials are `defineSecret` secrets (`SMTP_SECRETS` in `work-shared.js`). Never hardcode localhost in function code; `verify-project.js` checks for this.

## Paisley Tech Studio is a separate system

TECH does not use `students`, tutors or `personalNotifications`. Builders are `techStudents/{uid}`: any login can apply, so an IGCSE or CBC student joins with their existing account. Coaches are `techCoaches/{uid}` (portal `/tech/coach`), not tutors. Guardians are `parentAccounts` identities linked through `techGuardianLinks/{parentUid}_{studentUid}` (portal `/tech/parent`). Alerts go to `techNotifications` (`TechUI.mountBell`). Builds, chats and family chats carry `coachId`, and `onTechEnrolmentUpdated` keeps them in step when a coach changes. Shared UI lives in `js/tech/tech-helpers.js` (`TechUI`, including the one project workspace every role opens) and `js/tech/tech-portal.css`; coach and admin management (mission editor with Storage uploads, live classes, activity, practice) is `js/tech/tech-manage.js` (`TechManage`); the admin side is `js/admin/tech.js`; the backend is `functions/tech.js`. Do not reintroduce TECH bands or subjects into tutor teaching (`lmzTeachingKeyStages`). See `TECH_UPGRADE.md`.

A project is one `techBuilds` doc from idea to publication: a mission build has `missionId`, a self-led one has none (`TechUI.isSelfLed`, labelled "SELF-LED • STUDENT PROJECT"). Its state comes from `reviewState` / `mastery` (`TechUI.projectState`). Submitting writes an immutable snapshot to `techBuilds/{id}/submissions`; grade and review fields (`techReviewKeys()` in the rules) are coach/admin-only. Missions are `techContent` kind `mission`/`challenge` with `materials`, `practice`, `criteria`, `audience`. Other TECH collections: `techPractice` (never graded), `techActivity` (append-only timeline; builders write their own events with `at == request.time`), `techLiveClasses` (Google Meet; `parentUids` is filled by `onTechLiveClassWritten`). TECH guardians reach the Studio Desk through `parentConversations` (`isDeskParent` in the rules). Published projects are `techShowcase/{buildId}` and render at `/tech/p/{id}` (`tech/project.html`).

Tab bubbles count unread `techNotifications` per tab (`TechUI.mountBubbles`, `BUBBLE_SECTIONS`); a notification's `section` field overrides its type's tab, and opening a tab marks its notifications read. The admin sets the navigation video in Tech Studio > Navigation video: `techSettings/portal.navVideo` holds a posted `url` (AWS, YouTube, Vimeo) or the Storage `path` of an upload, whose link `TechUI.openVideoModal` fetches at play time. All posted video goes through `js/ui/fast-video.js` (`FastVideo`). Storage rules may touch only 2 Firestore docs per request, so builders are checked first. `render({ programme })` in `email-templates.js` sets each email's branding (`tech`, `tuition`, `remote`, `online`, `staff`), so never add curriculum wording to the shared shell.

**Classes and levels** (new work goes here, not in missions; see `TECH_UPGRADE.md`). `techStudents.skillLevel` is `beginner` / `intermediate` / `expert`, chosen at sign-up; content has a `track`, `beginner` or `advanced`, and intermediate and expert share `advanced` (`TechUI.trackOf`, mirrored in `functions/tech.js`). `js/tech/tech-classes.js` (`TechClasses`) holds the manager (admin and coach), results and learner screens over `techCourses` > `techTopics` > `techLessons`. Answers live only in `techLessons/{id}/private/key`, and `submitTechQuiz` marks on the server, so never put an answer on the lesson doc or mark in the browser. Posted-lesson notifications carry `lessonId` and stay unread until that lesson is opened, unlike other tab bubbles. The manager and results need `classroom-helpers.js` loaded for the `.cr-*` look. `tech/parent/dashboard.html` copies the main Parent Portal's design, so keep the two in step. Do not add a way to create missions; `TechManage.editMission` exists only to edit old ones.

**Class work, groups, the IDE.** A lesson's practice tool, `task` (`{ brief, kind: code | writing }`, brief optional), opens from the Practise button under its video in a pop-up and is handed in as `techLessonWork/{uid}_{lessonId}`; staff mark it with `InkGrader` through `TechWork.openMarking` (the work becomes a PDF in the browser). Groups are `techGroups` with `tasks` coded together live through `CodeLab`'s `collab` option (transaction + `CodeLab.merge3`, cursors in `presence/`). `js/tech/code-lab.js` is the one IDE (projects, class work, groups): CodeMirror + Emmet from CDNs, folders and uploads (`codeFolders`, `codeAssets`). Lessons may be untitled; show `TechClasses.labelsFor` names, not `title`. See `TECH_UPGRADE.md`.

## Parent ads and newsletters

Admin only, in Admin > Ads & Newsletter (`js/admin/parent-ads.js`); tutors and coaches can never run them. `parentAds` show on the Overview of the main Parent Portal only and `parentNewsletters` in its Newsletter tab (`js/parent/parent-ads.js`); the Tech Studio guardian portal has neither. An ad is a banner image, a video or just writing, with running words. They use only the Paisley colours and cards, like the rest of the site. Sending is the `sendParentNewsletter` callable (`functions/parent-newsletter.js`), idempotent through `deliveries/{uid}`; opt-outs live in `parentNewsletterPrefs`.

TECH disciplines: stored ids are `Coding`, `Music` etc.; always display `TechUI.disciplineLabel()` ("Coding with AI"). AI is not a discipline of its own, and old records tagged `AI` count as Coding.

One login can hold many accounts (`js/ui/account-roles.js`, `PaisleyRoles`). `/tech` asks which one when there are several. Never route by age: age only stops an under-18 builder becoming a coach. Coach applications are `techCoaches/{uid}` with status `Pending`, which grants nothing until an admin approves.

## Deployment order

Deploy functions and indexes first, wait until the indexes are Enabled, then run the idempotent `backfillAudiences` callable (dry run first), then deploy rules + storage + hosting. Deploying the rules before the migration hides existing content. Storage CORS: `gsutil cors set cors.json gs://<bucket>`.

## Notes

- Line endings are mixed (CRLF and LF) and `core.autocrlf=true`. Preserve a file's existing endings when editing. `git stash` rewrites modified files as CRLF, which breaks `verify-project.js` (it matches `\n`). Baseline before the TECH work: 8 `verify-project.js` failures, 5 of 15 functions tests and 7 of 12 audience rules tests already failing.
- `tuition/index.html` is the CBC tuition login (`/tuition/login`). Commit `eafbc1b` once overwrote it with a copy of the TECH studio; it was restored from `eafbc1b^`.
- `CHANGELOG.md`, `REMOTE_UPGRADE.md` and `TECH_UPGRADE.md` record design decisions and known limitations. Read them before changing publishing, grading, or parent access.
- Service-account keys (`vertex-key.json`, `*-key.json`) are gitignored and excluded from hosting. Don't add them back.
