# Paisley Tech Studio — its own architecture

TECH used to borrow the tutoring LMS: TECH builders were `students/{uid}` with `studentType: "tech"`, coaches were tutors (who also got a "TECH" key stage), and TECH alerts went into `personalNotifications`. It is now separate.

> **Read "Deployment order" before deploying.** The new rules hide TECH from anyone not yet moved to the new collections.

## What changed

| Area | Now |
|---|---|
| **Builders** | `techStudents/{uid}`. Any login can apply, including IGCSE, CBC, online and remote students, who sign in at `/tech` with their existing account and join from there. A brand-new person creates a login and applies in one step. Applications land `Pending`. |
| **Registration form** (`/tech`) | Full parent/guardian section: name, relationship, email (their sign-in) and phone (their first password). Required under 18, optional for adults. |
| **Coaches** | `techCoaches/{uid}`, created on the **Tutors page** (`/admin/tutors`: **Create TECH coach**, or switch the account type in the create window; you set the first password, as for tutors), or in **Admin → Tech Studio → Coaches** (`createTechCoach`, which emails a set-password link). Each coach has a personal link **`/tech/coach/{slug}`**, made from their name like a tutor's `/tutor/{slug}` (looked up in the public `techCoachSlugs/{slug}`). There they get their builders, review queue, builder messages, family messages, missions and content. The Tutors page first saves an invite (`techCoachInvites/{email}`), so if the coach record can't be saved, or the email already has a Paisley login, the coach's first sign-in creates it (`js/tech/coach-access.js`). An existing Paisley login (for example a tutor) can also be made a coach and keeps the same password. |
| **Tutors** | TECH is removed from the tutor side: no TECH key stage or subjects in the tutor picker or the tutor portal, and tutors have no TECH access in the rules. |
| **Guardians** | Linked automatically when the builder is approved (`techGuardianLinks`). New guardians get a login whose first password is their phone number (the Parent Portal's rule). Guardians who already use the Parent Portal keep their login. They sign in at **`/tech/parent`** to see projects (read-only, including coach feedback), progress by discipline, and to message the coach. Guardians come from the TECH form, the builder's student record and existing Parent Portal links. |
| **Parent Portal** | Parents with a TECH child get a **Paisley Tech Studio** link and an overview banner. A guardian with only TECH children goes straight to the TECH guardian portal. |
| **Notifications** | `techNotifications` only, with a TECH bell in every TECH portal and in Admin → Tech Studio. Events: application received, approval, coach assigned, project started, review / mastery / Tech Wall requests, feedback, mastery approved, Tech Wall, builder ↔ coach and guardian ↔ coach messages. Guardians and coaches also get emails for messages and mastery. |

## The learning experience (Oct 2026)

Every portal now follows the same journey: **LEARN → PRACTICE → BUILD → SUBMIT → COACH REVIEW → REVISE → MASTER → PUBLISH**, with one shared project workspace (`TechUI.mountWorkspace`).

| Area | How it works |
|---|---|
| **Missions** | `techContent` kind `mission` / `challenge`, written in **Missions** (coach portal, Admin → Tech Studio) with `TechManage.editMission`: objectives, instructions, the task, study materials (uploaded videos up to 500 MB, documents, images, links, YouTube / Vimeo, examples; each required or recommended; Storage `techContent/{id}/…`), practice activities, submission requirements, assessment criteria, AI tools and rules, level, discipline, project type, availability, deadline, prerequisite and audience. Coaches release to their own builders only. Releasing notifies the builders and their guardians once (`onTechContentWritten`). |
| **Unlocking** | A mission is locked until the builder's level in its discipline reaches the mission's level, its prerequisite is mastered and its availability date passes (`TechUI.missionLock`). Levels still come from mastered projects per discipline; a level-up sends "next level unlocked" to the builder, guardians and coach. |
| **Projects** | One `techBuilds` doc per project, assigned or **SELF-LED • STUDENT PROJECT** (no `missionId`). The project type picks the workspace it opens in (Code → Code IDE, Writing / Research → Writing Studio, Design / Media / Music → uploads); every tool stays available. States: Not started, In progress, Submitted, Under review, Revision required, Approved, Mastered. |
| **Submitting** | The Submit tab needs saved work plus the AI-use reflection (tools, what they were used for, the builder's own contribution). Each submission is an immutable snapshot in `techBuilds/{id}/submissions`. Revision returns the builder to the same project; earlier submissions stay in the Submissions tab. |
| **Review and grading** | Coaches (and admins) mark work under review, score each criterion, give a grade (Exceeding / Meeting / Approaching / Beginning, optional %), write feedback, and request a revision, approve, or approve with mastery. Grades and review notes are coach/admin-only fields. Builder and guardians get a bell and email. |
| **Practice** | `techPractice`: code, writing, research and AI exploration, saved, retried, marked done, with "ask my coach for help". Never graded; coaches and admins can read it and leave a note. |
| **Live classes** | `techLiveClasses`: topic, what builders will learn, coach, date and time, length, Google Meet link, audience (everyone / chosen builders; coaches pick from their own builders), status. Shown as a banner on the builder, guardian and coach home pages, with **Join class** opening the saved Meet link (from an hour before the start). `onTechLiveClassWritten` notifies builders, guardians, the coach and admins when a class is scheduled, changed or cancelled, once per change. |
| **Activity and last seen** | `techActivity`: real events with server timestamps (sessions, projects created, opened and saved, missions started, materials and videos, practice, help requests, submissions, feedback viewed, live classes joined; plus reviews, mastery, level-ups and publication from Cloud Functions). `techStudents.lastActiveAt` is "last seen". Coaches see their builders; admins see everyone; guardians see their own child. |
| **Guardians** | Read-only: the same workspace with nothing editable, so they see the work, submissions, grades, feedback and the AI reflection of missions and self-led projects. Live classes and the activity timeline have their own pages. **Studio Desk** is a private chat with the admin team on the Parent Portal's `parentConversations`, separate from coach messages (`onTechFamilyDeskMessage` raises the admin bell; Admin → Tech Studio → Family desk replies). |
| **Publishing** | Only approved work can be published, by a coach or admin, after confirming consent. Publishing writes a public copy to `techShowcase/{id}` (first name only, the work itself, the builder's contribution and AI use) and the page is `/tech/p/{id}` (`tech/project.html`): code runs in a sandboxed preview, writing renders as an article, images as a gallery, video and audio play. Unpublished projects have no showcase doc, so the page shows "not published". The page is `noindex`. |
| **Admin** | Tech Studio adds Projects & reviews (every project, submitted or not, filterable by self-led), Missions, Live classes, Activity, Practice, Performance and Family desk. |

## Classes and levels (Nov 2026)

New work is posted in **Classes**, not missions. The code is `js/tech/tech-classes.js` (`TechClasses`).

| Area | How it works |
|---|---|
| **Levels** | `techStudents.skillLevel`: `beginner`, `intermediate`, `expert`, chosen on the join form. Each level has its own classes (`track` is the same word; `TechUI.trackOf`, `tracksFor`). Old classes on the shared `advanced` track still show to intermediate and expert builders until an admin moves them to one level. A builder with no level is asked once in their studio and counts as intermediate until they answer. Only an admin changes it afterwards. This is separate from the DISCOVER to STUDIO ladder, which still comes from mastered projects. |
| **Building a class** | `techCourses` (a card, for one level) > `techTopics` > `techLessons`, in Admin > Tech Studio > Classes and the coach portal's Classes tab. A coach edits only what they made, but can add to any class and reorder anything. |
| **A lesson** | Video (AWS, YouTube, Vimeo or Google Drive link, or upload up to 500 MB), notes, instructions, files, an optional quiz, an optional task to code or write. A practice test is instructions, questions and an optional task. Videos play on the page through `FastVideo` with no download control. That hides the button; it does not stop a determined person finding the file link. |
| **Who gets it** | Everyone active on that level, not chosen builders. `onTechLessonWritten` sends the bell and email once to each builder and guardian; re-posting does not repeat it. |
| **Bubbles** | `tech_lesson` notifications have `section: 'classes'` and a `lessonId`. Unlike other notifications they are not cleared by opening the tab, only by opening that lesson, so the subject cards can count what is new. |
| **Marking** | `techLessons/{id}` holds the questions without answers; `private/key` holds the answers. `submitTechQuiz` marks, writes `techAttempts` (function only) and the score fields on `techLessonProgress`. Multiple choice, true or false, and short answer (exact match against a list, ignoring case and spacing) are marked. A written answer (`open`, also any short answer saved with no accepted answers) needs no options or key: it is left out of the score, kept in the attempt for the coach to read in Results, and raises the coach bell. An attempt of only written answers has `total` 0 and `percent` null. A practice test can be posted with instructions and no questions. |
| **Results** | Results tabs (admin: everyone; coach: their own builders), per lesson from the class page, and per builder from the coach's builder page. Guardians see their child's scores in Classes. A practice test result raises the coach and guardian bells; a lesson quiz does not. |
| **Class work** | A lesson's task is done in the lesson and handed in as `techLessonWork` (see Class work, groups and the Code IDE below). Older class projects (`techBuilds` with `lessonId`, labelled CLASS PROJECT) stay in My projects. |
| **Older missions** | `TechManage.editMission` remains only to edit existing missions. No new ones can be created. The builder's Missions tab appears only while they have one; otherwise links to it (including "Explore missions" on the banner) open Classes. |

To deploy this update: `firebase deploy --only functions,firestore:indexes` (new: `onTechLessonWritten`, `submitTechQuiz`; indexes: `techAttempts` studentId + at, `techLessons` track + status + publishedAt), wait for the indexes to be **Enabled**, then `firebase deploy --only firestore:rules,storage,hosting`.

## Class work, groups and the Code IDE (Nov 2026)

| Area | How it works |
|---|---|
| **Naming** | Class > topic > lesson. A lesson's own title is optional; without one it is "Lesson 2" or "Practice test 1" in its topic (`TechClasses.labelsFor`, `lessonTitle` in the functions). |
| **Lesson page** | Video (at most 60% of the screen height) and a side list of the topic's lessons; notes, instructions and files in tabs; the quiz below. When the lesson has a practice tool, a Practise card under the video opens it in a pop-up (`TechWork.mountLessonWork` with `layout: 'pop'`): requirements, status, feedback and hand-in on the left, the IDE or writing pad on the right. The IDE's full screen button uses the browser's full screen (Esc leaves it), or covers the page where that is not available. |
| **Class work** | `techLessons.task = { brief, kind }`. `techLessonWork/{uid}_{lessonId}`: the builder writes the work fields and hands in (Draft > Submitted); the coach or an admin marks (Graded or Corrections, with the InkGrader fields). The builder can edit only in Draft or Corrections. `coachId` is copied from the builder so coaches can list hand-ins, and follows coach changes. Uploads go to `techWork/{uid}/{lessonId}/`. |
| **Ink marking** | `TechWork.openMarking` turns the work into a PDF in the browser (pdf-lib) and opens `InkGrader` with `source` (the bytes) and `gradedPath` (`techGraded/{uid or group_gid}/{lessonId or taskId}/`). Characters the standard PDF fonts cannot show (emoji, non-Latin scripts) print as "?" on the marked copy only. |
| **Groups** | `techGroups/{gid}` (members up to 30) and `tasks/{tid}` holding the shared work. Members may change only the work fields and hand in; staff mark. Live editing: each save is a transaction that merges this browser's edits with the server copy per file (`CodeLab.merge3`); edits to the same stretch of the same file keep the last writer's. `presence/{uid}` holds each cursor. Uploads go to `techGroupWork/{gid}/{tid}/`. Parents are told when group work is marked but do not open group tasks. |
| **Lesson levels and padlocks** | The posted lessons of a class, in topic then lesson order, are Level 1, 2, 3… Level 1 is open; level N opens when level N-1 is passed (or an admin opened it). Passing is `techLessons.gate { watch, quiz, pass, work }`, default every step the lesson has at 50%, nothing to do = opened. The browser works it out from `techLessonProgress` and `techLessonWork` (`TechClasses.gateSteps`), so old progress counts; `onTechLessonProgressWritten` and the hand-in trigger record `passedAt` once and send the bells and the family email. The padlock is a guide, not a secret: a builder can still read a locked lesson's doc, as with any posted lesson. |
| **Class prerequisites** | `techCourses.afterCourseId`: the class stays locked (card with a padlock) until every posted lesson of that class is passed. The server's "finished" message names the class that opens next. |
| **Opened by an admin** | `techAccess/{uid}.open[courseId] = 'all' | lessonId` (admin writes only; the builder, their coach and guardians read). Opens a class at any level, all of it or up to one level. Managed from the class's Open for a builder. |
| **Hand-in snapshot** | `TechWork.takeSnapshot` at hand-in: html-to-image (cdnjs 1.11.11) draws the page inside a sandboxed srcdoc frame and posts a JPEG back (html2canvas cannot: it copies the page into a nested frame the opaque origin cannot read). Fallback: a card with the first lines. Stored at `techWork/{uid}/{lessonId}/snapshot_*.jpg`, saved as `snapshotUrl` / `snapshotPath` / `snapshotAt` with the hand-in. Families get it in the "See what … built today" email; coach and admin bells show it. |
| **Task questions** | `techLessons.task.questions = [{ id, text }]` (up to 10, set in the lesson editor under the practice tool). Answers are `techLessonWork.taskAnswers = { id: text }`, saved as the builder types and locked with the rest of the work at hand-in. The coach reads and marks them with the work (work viewer and the ink PDF); there is no answer key and no automatic score. |
| **Code IDE** | Shown to users as **Paisley VS Code**. CodeMirror 5.65.16 (cdnjs) and @emmetio/codemirror-plugin 1.2.4 (jsDelivr), loaded on first use. Files may sit in folders, and each folder has an Upload button that uploads into it (`accept` follows the folder name: images > pictures, videos > video, sounds > audio); `codeAssets` are uploads the preview swaps in for `src`, `href`, `url()` and quoted paths in JS. Preview iframe: `allow-scripts allow-modals`, never same-origin. |
| **Drive video** | Any `drive.google.com` / `docs.google.com` file link plays through `/preview`. Share it as "Anyone with the link"; Google's player has its own pop-out button, so it is not download-proof. |

To deploy: `firebase deploy --only functions` (new: `onTechLessonWorkWritten`, `onTechGroupWritten`, `onTechGroupTaskWritten`; changed: `onTechLessonWritten`, `submitTechQuiz`, `onTechEnrolmentUpdated`, the deadline reminders), then `firebase deploy --only firestore:rules,storage,hosting`. No new indexes.

## Deployment order

1. `cd functions && npm install`, then `firebase deploy --only functions,firestore:indexes`.
   The CLI asks to delete `onTechStudentCreated`, `onTechStudentActivated` and `onTechShowcaseApproved`. They are replaced by `onTechEnrolment*` and `onTechBuild*`, so answer yes. Wait for the `techNotifications` index to show **Enabled**.
2. **Admin → Tech Studio:** a banner lists builders still on the old records. Click **Preview**, then **Move to new TECH** (`migrateTechArchitecture`, safe to repeat). It:
   - moves each builder, with their status and coach;
   - makes each tutor who was coaching a TECH coach (same login);
   - points builds and chats at `coachId`;
   - links and emails the guardians of active builders.
3. `firebase deploy --only firestore:rules,storage,hosting`.
4. Run **Move to new TECH** once more to catch anyone who signed up on the old page between steps 1 and 3.
5. Add or check coaches in the **Coaches** tab, then pair builders with them.

For the learning-experience update alone (on top of the above): `firebase deploy --only functions,firestore:indexes` (new: `onTechContentWritten`, `onTechLiveClassWritten`, `onTechFamilyDeskMessage`; index: `techActivity` studentId + at), wait for the index to be **Enabled**, then `firebase deploy --only firestore:rules,storage,hosting`. Hosting adds `/tech/p/:id` and routes `/tech/b/**` (family links) to `techShare`. Existing published projects keep working but show only the old fields on `/tech/p/{id}` until a coach publishes them again.

## Tested

- `tests/rules/tech.rules.test.js`: emulator tests, all passing. They cover applying, builder and coach limits, tutors losing TECH access, paused coaches, guardian isolation, guardian ↔ coach chat, notifications, coach creation, Tech Wall approval and withdrawal, and family share links. Run with:
  `firebase emulators:exec --only firestore "node --test tests/rules/tech.rules.test.js"`
  (`node --test tests/rules/` with a directory argument fails on Windows; list the files.)
- `tests/rules/tech.storage.test.js`: 2 storage tests, both passing. Only active builders can upload, into their own builds. The builder, their active coach and linked guardians can read files. Run with:
  `firebase emulators:exec --project paisley-tech-storage --only firestore,storage "node --test tests/rules/tech.storage.test.js"`
- The same files cover submissions and grading, practice, activity, live classes and the family desk (26 Firestore and 3 Storage tests in total, all passing).
- Not run against a live project: the Cloud Functions, emails, the migration, and the portals in a browser.

## Hosting videos on AWS

Paste a video's link into a mission material or Admin > Paisley Tech Studio > Navigation video, then press **Test link**. The site does what it can on its side (`js/ui/fast-video.js`), but how fast a video starts depends mostly on these three things, in order:

1. **Serve through CloudFront, not the S3 link.** Files in `eu-north-1` (Stockholm) travel from Sweden to every viewer, and S3 sends no cache headers. CloudFront keeps copies closer to viewers. Use the CloudFront link.
2. **Export for fast start.** An MP4 with its index at the end cannot start until the browser has fetched the end of the file. Export at 720p with the index first:
   `ffmpeg -i input.mov -c:v libx264 -crf 23 -preset slow -vf scale=-2:720 -c:a aac -b:a 128k -movflags +faststart output.mp4`
   Set `Cache-Control: public, max-age=31536000` on the object, and give each new version a new file name.
3. **For long videos, use HLS (.m3u8).** The player then drops to a lower quality on a slow line instead of freezing. M3U8 links need CORS on the bucket or CloudFront, allowing `GET` and `HEAD` from `https://paisleystudio.online` and `https://www.paisleystudio.online`. Plain MP4 links do not need CORS.

Add a thumbnail link where the form offers one: it shows at once while the video loads. Objects must be public (or served through CloudFront); `s3://` addresses and AWS console links do not play, and the form says so. Anyone who can watch a linked video can copy its link, so do not post anything that must stay private this way.
