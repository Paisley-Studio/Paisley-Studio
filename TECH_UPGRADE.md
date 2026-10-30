# Paisley TECH — its own architecture

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
| **Parent Portal** | Parents with a TECH child get a **Paisley TECH** link and an overview banner. A guardian with only TECH children goes straight to the TECH guardian portal. |
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
