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
firebase emulators:exec --only firestore "node --test tests/rules/tech.rules.test.js tests/rules/firestore.rules.test.js"
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
- Notifications use deterministic IDs (`notifyOnce`, sha1-based publication IDs) so retries are idempotent. Keep that property when adding triggers. Emails are built in `functions/email-templates.js` (`render`, `PORTALS`, `APP_URL`). SMTP credentials are `defineSecret` secrets (`SMTP_SECRETS` in `work-shared.js`). Never hardcode localhost in function code; `verify-project.js` checks for this.

## Paisley TECH is a separate system

TECH does not use `students`, tutors or `personalNotifications`. Builders are `techStudents/{uid}`: any login can apply, so an IGCSE or CBC student joins with their existing account. Coaches are `techCoaches/{uid}` (portal `/tech/coach`), not tutors. Guardians are `parentAccounts` identities linked through `techGuardianLinks/{parentUid}_{studentUid}` (portal `/tech/parent`). Alerts go to `techNotifications` (`TechUI.mountBell`). Builds, chats and family chats carry `coachId`, and `onTechEnrolmentUpdated` keeps them in step when a coach changes. Shared UI lives in `js/tech/tech-helpers.js` (`TechUI`, including the one project workspace every role opens) and `js/tech/tech-portal.css`; coach and admin management (mission editor with Storage uploads, live classes, activity, practice) is `js/tech/tech-manage.js` (`TechManage`); the admin side is `js/admin/tech.js`; the backend is `functions/tech.js`. Do not reintroduce TECH bands or subjects into tutor teaching (`lmzTeachingKeyStages`). See `TECH_UPGRADE.md`.

A project is one `techBuilds` doc from idea to publication: a mission build has `missionId`, a self-led one has none (`TechUI.isSelfLed`, labelled "SELF-LED • STUDENT PROJECT"). Its state comes from `reviewState` / `mastery` (`TechUI.projectState`). Submitting writes an immutable snapshot to `techBuilds/{id}/submissions`; grade and review fields (`techReviewKeys()` in the rules) are coach/admin-only. Missions are `techContent` kind `mission`/`challenge` with `materials`, `practice`, `criteria`, `audience`. Other TECH collections: `techPractice` (never graded), `techActivity` (append-only timeline; builders write their own events with `at == request.time`), `techLiveClasses` (Google Meet; `parentUids` is filled by `onTechLiveClassWritten`). TECH guardians reach the Studio Desk through `parentConversations` (`isDeskParent` in the rules). Published projects are `techShowcase/{buildId}` and render at `/tech/p/{id}` (`tech/project.html`).

## Deployment order

Deploy functions and indexes first, wait until the indexes are Enabled, then run the idempotent `backfillAudiences` callable (dry run first), then deploy rules + storage + hosting. Deploying the rules before the migration hides existing content. Storage CORS: `gsutil cors set cors.json gs://<bucket>`.

## Notes

- Line endings are mixed (CRLF and LF) and `core.autocrlf=true`. Preserve a file's existing endings when editing. `git stash` rewrites modified files as CRLF, which breaks `verify-project.js` (it matches `\n`). Baseline before the TECH work: 8 `verify-project.js` failures, 5 of 15 functions tests and 7 of 12 audience rules tests already failing.
- `tuition/index.html` is the CBC tuition login (`/tuition/login`). Commit `eafbc1b` once overwrote it with a copy of the TECH studio; it was restored from `eafbc1b^`.
- `CHANGELOG.md`, `REMOTE_UPGRADE.md` and `TECH_UPGRADE.md` record design decisions and known limitations. Read them before changing publishing, grading, or parent access.
- Service-account keys (`vertex-key.json`, `*-key.json`) are gitignored and excluded from hosting. Don't add them back.
