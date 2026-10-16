# Paisley Studio — Remote Students upgrade

Remote student portal, remote parent access, central publishing inside **Classroom**, tutor permission lock-down, homepage results section and production-domain emails.

> **Read §4 (deployment order) before deploying.** The rules change is only safe *after* the one-off migration in §4 step 3 has run.

---

## 1. What changed, in one page

| Area | Change |
|---|---|
| **Admin navigation** | One new item: **Remote Students**. Nothing else was added or renamed. |
| **Publishing** | Lives in the existing **Classroom** area: a **Publish** tab and a **Publish…** button inside each classroom. One **Publish** button → *Post to All / Post to Tutors / Post to Online Students / Post to Remote Students*, each through a review-and-confirm step. |
| **Remote Students (admin)** | Students (search/filter/sort/paginate, admit, edit, suspend/reactivate, profile + homework progress), Parents (link/unlink/move/send setup email), Classroom & Homework (posted content, homework and exam marking using the *existing* grading UI), Support. |
| **Remote student portal** | `/remote` (sign in / set-or-reset password; **no self-registration**) and `/remote/dashboard`: My Classroom, My Homework, My Exams, Support Tickets, My Profile. |
| **Parent portal** | New read-only **Classroom** tab; every tab follows the selected child's own type, so a parent with an online *and* a remote child sees each child's own content. |
| **Tutors** | Can no longer create/edit/delete assignments, exams, notes or curriculum files (UI **and** rules). They see what the desk posted to tutors, **release** it to their own students, mark and give feedback. |
| **Homepage** | "Student Results — See what our students achieve." copied verbatim (HTML, CSS, data, slider script) onto `index.html`; the original on `why-paisley.html` is untouched. |
| **Emails / domain** | One configurable `APP_URL` (default `https://paisleystudio.online`); remote students get `/remote` links; Firebase password links now carry a `continue` URL back to the right portal. |

## 2. Data model (smallest compatible change)

Curriculum is **not duplicated**. Each lesson / assignment / exam keeps one record and gains:

```
audiences:   { online: bool, remote: bool, tutors: bool }   // who may see it
publication: { <audience>: { publishedAt, publishedBy, publishedByName, requestId, keyStage, year, subjectId, topicId } }
releasedTo:  [studentUid]            // students a tutor delivered it to (assignments / exams)
```

* `publications/{sha1(path+audience)}` – one audit record per item+audience (deterministic id ⇒ a retry cannot duplicate it). Admin-read, function-write only.
* `students/{uid}.studentType` = `"remote"` (absent = online). **Only the Admin SDK / an admin can set it**; the rules refuse it from the student's own client.
* `parentAccess/{parent}` now also carries `online[]` and `remote[]` slot lists (alongside `slots[]`), so a parent's rights follow each child's type.
* A lesson/assignment/exam is visible to audience X only if `audiences.X == true` (lessons additionally `status == 'published'`, exams `status == 'Published'`). Posting to one audience never changes another.
* Lifecycle: a **lesson/exam draft is marked ready when posted** (the review step lists these). Scheduled lessons stay scheduled. Archived lessons / closed exams cannot be posted.
* **Post to All** = exactly the audiences each content type supports (`TYPES` in `functions/publishing.js`; today all three types support online, remote and tutors). Change that one table to restrict a type.
* **Post to Tutors** = tutors for that subject/Key Stage can see it and **release** homework/exams to *their own* students (`tutorReleaseWork`). They cannot edit it or widen who else gets it.
* Notifications fire when work **becomes visible** to an audience (before/after comparison) and use deterministic ids (`notifyOnce`), so retries/duplicate triggers never notify twice. The migration restates existing visibility and therefore notifies nobody.

## 3. Files

**New:** `remote/index.html`, `remote/dashboard.html`, `js/admin/remote-students.js`, `js/classroom/publish-helpers.js`, `functions/publishing.js`, `functions/remote.js`, `functions/parent-access.js`, `functions/test/publishing.test.js`, `tests/rules/firestore.rules.test.js`, `scripts/verify-project.js`, `scripts/check-rules.js`, this file.

**Modified (key):** `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`, `vercel.json`, `sw.js` (cache bumped to v2), `admin/index.html`, `index.html`, `student/dashboard.html`, `parent/dashboard.html`, `parent/index.html`, `tutor/dashboard.html`, `tutor/login.html`, `tutor/index.html`, `admin/tutors.html`, `js/classroom/classroom-helpers.js`, `js/classroom/work-helpers.js`, `js/classroom/work-learner.js`, `js/parent/parent-helpers.js`, `functions/index.js`, `functions/notifications.js`, `functions/work.js`, `functions/work-shared.js`, `functions/deadlines.js`, `functions/email-templates.js`, `functions/package.json` (test script only).

**Behaviour changes admins will notice**
* Lesson editor **Publish Now → Mark Ready**; assignment **Post Assignment → Prepare assignment**; exam **Publish → Mark ready**. These no longer reach anyone on their own — posting is done from **Classroom → Publish**.
* `createParentAccount` now honours the parent entered in the admin "Add parent" form (it was silently ignored before), uses a random initial password (it used the guardian's phone number), and only emails an *existing* parent when a link is newly created.
* Legacy key-stage-wide features (live classes, old homework/notices/timetables) are not shown to remote students.

## 4. Deployment — order matters

Deploying the new rules before existing records carry `audiences` would hide all existing lessons/homework from students. Do this in order:

1. **Functions + indexes first** (old rules/clients keep working because every change is additive):
   `firebase deploy --only functions,firestore:indexes` — then wait until the new indexes show **Enabled** in the console (Firestore → Indexes).
2. **Dry-run the migration** (signed in to the admin dashboard, in the browser console):
   `await firebase.functions().httpsCallable('backfillAudiences')({dryRun:true}).then(r=>console.log(r.data))`
3. **Run the migration** (idempotent; safe to repeat; never overwrites a record that already has `audiences`; touches only `classrooms/**`; sends no notifications; also rebuilds every `parentAccess` doc):
   `await firebase.functions().httpsCallable('backfillAudiences')({}).then(r=>console.log(r.data))`
   Existing content is stamped as: online = was live, remote = **false**, tutors = true.
4. **Rules + hosting together:** `firebase deploy --only firestore:rules,storage,hosting`.
5. Smoke-test (§6 "needs live environment"). Rollback = redeploy the previous rules/hosting; the new fields are ignored by old code.

No data is deleted or rewritten destructively at any step.

## 5. Manual steps (cannot be done from code — nothing below has been done)

1. **Firebase Console → Authentication → Settings → Authorized domains:** add `paisleystudio.online` (and `www.` if used). Without it password-reset `continue` URLs are rejected.
2. **Hosting → Custom domain:** confirm `paisleystudio.online` is connected, DNS verified and SSL issued.
3. **Email deliverability:** SPF/DKIM/DMARC for the sending domain (SMTP secrets already exist for the current mailer).
4. *(Optional)* Authentication → Templates → customise the action URL so Firebase's own reset page is also on your domain.
5. If staging needs different links, set `APP_URL` as a function environment variable.
6. **Rotate the Google service-account key in `vertex-key.json`** — it was inside the original zip (also noted in `CHANGELOG.md`). It is excluded from the delivered archive; revoke it in Google Cloud IAM and store its replacement as a secret.
7. Create the first remote student from **Admin → Remote Students → Admit**.

## 6. Testing — what was and was not done

**Actually run (all passing):**
* `cd functions && npm test` — 15 unit tests (in-memory Firestore fake): audience isolation (online ≠ remote ≠ tutors), publishing to a 2nd audience keeps the 1st, Post to All, **retry idempotency** (one publication record, no change on repeat), draft→ready, archived/closed refused, legacy records, invalid paths, notification-transition logic (migration notifies nobody), tutor-student authorisation, admission validation, emails (production domain, no localhost, remote vs online links).
* `node scripts/verify-project.js` — 39 structural checks: only one new admin nav item, no forbidden nav items, publishing inside Classroom, four publish options, tutor creation controls gone, rule patterns present, routes, remote pages, homepage section on both pages, no duplicate IDs, no localhost in function code, no key in the tree.
* `node scripts/check-rules.js` — brace balance / undefined-helper check of both rules files.
* `node --check` on every project JS file and every inline `<script>` on every HTML page (0 errors; `paisley-realtime-worker/worker.js` is an untouched Cloudflare Worker that only parses as an ES module); all JSON config files parse; all Cloud Functions load and export (39 exports).

**NOT run — needs your live Firebase project (do not treat as verified):**
* **Firestore/Storage rules were never evaluated by Firebase** (the emulator isn't downloadable here); only static checks ran. Run `tests/rules/firestore.rules.test.js` (instructions at the top) before deploying — it encodes the isolation, tutor-lockdown, ticket and parent cases. Pay particular attention to the audience-filtered **collection queries**: rules are not filters, so each query must carry the same `audiences.*` where-clause (the client code does; the test checks it).
* Real sign-in/sign-up, remote admission end-to-end, invitation and reset emails, parent link creation, Cloud Function deployment/triggers, notification emails, Storage uploads/downloads, grading in the Remote Students area, visual/responsive review in a browser. No browser console was inspected.
* The brief's 28 checks that depend on these (e.g. 2, 3, 4, 5, 6, 12–15, 17–24, 26) are implemented but **unverified against live services**.

## 7. Decisions and limitations to confirm

1. **No "Unit" and no per-resource publishing.** The app's hierarchy is Subject → Topic → Lesson, with resources embedded inside lessons. Selection is by Key Stage, Year, subject, topic, lesson, homework and exam. To publish one resource separately, put it in its own lesson.
2. **Tutors and Activities.** The tutor activity builder (`activities`, `activityAssignments`) was left as is — it is a teaching tool, not curriculum. If you want it admin-only too, change those two `create` rules.
3. **Tutor release** covers homework and exams (nested assignments/exams); flat exams and lessons are posted by the desk directly to students. A parent sees work for their child's *portal type*; work a tutor released to a student outside that audience is not shown to the parent.
4. **Storage cannot enforce audiences** (file paths don't include the topic id needed to look up `audiences`). Download URLs are only exposed in audience-gated Firestore documents; direct Storage reads stay "signed in + unguessable token" as before.
5. **Parents** can read an assignment record for their child's slot if it is posted to their child's audience, including the `recipients` id list of per-student assignments (client filters by child). Rules can't test "is my child a recipient" in a query.
6. **Remote tickets** reuse the existing single message + reply model (status Open → Replied/Closed), addressed to the Studio Desk (`targetAdmin`). Admins are alerted by bell + email; they reply from the existing Student Tickets screen (remote tickets carry a "Remote" tag).
7. **Topic titles** are readable by any signed-in user (unchanged); lessons/work inside them are not.
8. **Legacy items** keep working: no `audiences` ⇒ treated as online + tutors until the migration stamps them. Items that predate the migration will not trigger "posted" notifications if they change state later.
9. **Pre-existing, left as is:** online self-registration still lets a new student choose their own Key Stage/subjects, but the account is `Pending` until an admin activates it (now enforced by rules; remote status/type can't be self-assigned).
10. Admin "Student Management" now lists **normal students only** (filtered on `studentType`); remote students appear under Remote Students.
11. **Lesson location:** lessons are stored under topics (`classrooms/{cid}/topics/{tid}/lessons/{id}`) in both the rules and the client. An older CHANGELOG note mentions a flat `classrooms/{cid}/lessons` layout; if any production lessons still sit there they are not shown by the existing app either, and are outside this upgrade (the migration would stamp them, but they cannot be posted through Publish).
