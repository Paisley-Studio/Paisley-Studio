# Paisley TECH — its own architecture

TECH used to borrow the tutoring LMS: TECH builders were `students/{uid}` with `studentType: "tech"`, coaches were tutors (who also got a "TECH" key stage), and TECH alerts went into `personalNotifications`. It is now separate.

> **Read "Deployment order" before deploying.** The new rules hide TECH from anyone not yet moved to the new collections.

## What changed

| Area | Now |
|---|---|
| **Builders** | `techStudents/{uid}`. Any login can apply, including IGCSE, CBC, online and remote students, who sign in at `/tech` with their existing account and join from there. A brand-new person creates a login and applies in one step. Applications land `Pending`. |
| **Registration form** (`/tech`) | Full parent/guardian section: name, relationship, email (their sign-in) and phone (their first password). Required under 18, optional for adults. |
| **Coaches** | `techCoaches/{uid}`, created on the **Tutors page** (`/admin/tutors`: **Create TECH coach**, or switch the account type in the create window; you set the first password, as for tutors), or in **Admin → Tech Studio → Coaches** (`createTechCoach`, which emails a set-password link). They sign in at **`/tech/coach`**: builders, review queue, builder messages, family messages, missions and content. An existing Paisley login (for example a tutor) can also be made a coach and keeps the same password. |
| **Tutors** | TECH is removed from the tutor side: no TECH key stage or subjects in the tutor picker or the tutor portal, and tutors have no TECH access in the rules. |
| **Guardians** | Linked automatically when the builder is approved (`techGuardianLinks`). New guardians get a login whose first password is their phone number (the Parent Portal's rule). Guardians who already use the Parent Portal keep their login. They sign in at **`/tech/parent`** to see projects (read-only, including coach feedback), progress by discipline, and to message the coach. Guardians come from the TECH form, the builder's student record and existing Parent Portal links. |
| **Parent Portal** | Parents with a TECH child get a **Paisley TECH** link and an overview banner. A guardian with only TECH children goes straight to the TECH guardian portal. |
| **Notifications** | `techNotifications` only, with a TECH bell in every TECH portal and in Admin → Tech Studio. Events: application received, approval, coach assigned, project started, review / mastery / Tech Wall requests, feedback, mastery approved, Tech Wall, builder ↔ coach and guardian ↔ coach messages. Guardians and coaches also get emails for messages and mastery. |

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

## Tested

- `tests/rules/tech.rules.test.js`: 16 emulator tests, all passing. They cover applying, builder and coach limits, tutors losing TECH access, paused coaches, guardian isolation, guardian ↔ coach chat, notifications, coach creation, Tech Wall approval and withdrawal, and family share links. Run with:
  `firebase emulators:exec --only firestore "node --test tests/rules/tech.rules.test.js"`
  (`node --test tests/rules/` with a directory argument fails on Windows; list the files.)
- `tests/rules/tech.storage.test.js`: 2 storage tests, both passing. Only active builders can upload, into their own builds. The builder, their active coach and linked guardians can read files. Run with:
  `firebase emulators:exec --project paisley-tech-storage --only firestore,storage "node --test tests/rules/tech.storage.test.js"`
- Not run against a live project: the Cloud Functions, emails, the migration, and the portals in a browser.
