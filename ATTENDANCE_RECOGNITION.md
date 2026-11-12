# Attendance: optional facial recognition

Facial recognition is an optional way to register attendance, controlled by the Studio Desk in **Admin > Attendance > Facial recognition**. It is **disabled by default**. While it is disabled (or suspended), students and tutors see no face option, no camera is requested, the face model is not even downloaded, and no biometric data is processed. The normal check-in (I'm Here, I'm teaching, tutor marking) always works, with or without recognition.

It runs entirely on Firebase and in the browser. There is no other server.

## How it works

1. **On the device.** When a student or tutor taps the face option, `js/attendance/face.js` loads face-api.js (TensorFlow.js) and its models from jsDelivr, and only then. It opens the camera and reads 3 frames about half a second apart. For each frame it finds exactly one face and computes its **descriptor**: 128 numbers. The picture never leaves the device and is not saved.
2. **In Cloud Functions.** `faceCheckIn` (students) or `faceTutorVerify` (tutors) receives only those numbers. `functions/face-recognition.js` compares them with the descriptors enrolled for the **signed-in account** (Euclidean distance: 0 is identical, about 0.6 is a different person). Every frame must be within `maxDistance` (default 0.50) of one of that person's reference photos.
3. **Enrollment.** The Studio Desk picks 1 to 5 reference photos on its own computer. Each photo is read there, and only its descriptor is sent (`faceAdmin` enroll). The photos must all look like the same person, and they are not uploaded.

| Piece | Where | What it holds |
|---|---|---|
| School-wide switch | `attendanceSettings/recognition` (admin read, functions write) | `status` (disabled / enabled / suspended), `maxDistance`, `retentionDays`, `studentsApproved` + `dpia`, history |
| Profiles | `faceProfiles/{uid}` (admin read) | account id, type, consent (with history), enrollment status, photo count. **No descriptor, no image** |
| Templates | `faceTemplates/{uid}` (**no client can read it, not even admins**) | the enrolled descriptors, AES-256-GCM encrypted when `FACE_TEMPLATE_KEY` is set |
| Attempt log | `faceAttempts` (admin read) | who, lesson, result, distance, time. **No image, no descriptor.** Pruned after `retentionDays` |
| Audit | `attendanceAudit` (`area: 'recognition'`) | enable / disable / suspend, settings, consent, enroll, replace, remove |

**Server-side gates on every attempt:**
- The switch is enabled. It is read fresh on each call, and read again before a match counts.
- Students only after student processing is approved.
- The caller has a consented, enrolled profile of the right type and a template.
- At most 8 attempts in 10 minutes.
- Exactly 3 frames, each 128 finite numbers of a plausible size.
- The frames are close to each other but not identical (a copied vector is refused).
- None has been seen before (replayed numbers are refused).
- Every frame matches the caller's **own** template.

A face can only ever be compared with the account that is signed in, so one person cannot register as another. A matched student check-in goes through the same `checkIn` as I'm Here: server time, one record, at most one strike. A tutor match only verifies the tutor's own lesson (`tutorIds`).

**Limitation:** a descriptor computed in a browser cannot prove a live person was in front of the camera. A determined user could, for example, hold up a photo of themselves. Recognition confirms identity conveniently; it is not anti-fraud. The tutor's register remains the record of who was in class.

## Library, model and licensing

* **face-api.js**, maintained fork `@vladmandic/face-api@1.7.15`, MIT licence. It bundles TensorFlow.js (Apache-2.0).
* **Models used:** the Tiny Face Detector, the 68-point landmark model, and the face recognition model. The recognition model is a port of **dlib's ResNet face recognition network** (`dlib_face_recognition_resnet_model_v1`), which its author released into the public domain. (It is a ResNet, not FaceNet.) It was trained partly on the VGG and FaceScrub datasets, so get legal advice before commercial use.
* Download size on first use: about 1.3 MB of library plus 7 MB of models, cached by the browser afterwards.

## Why there is no in-function model

Every screen that needs a descriptor (the student check-in, the tutor verification, the admin enrollment) runs in a browser with a camera or file picker, so the browser path covers all of them. Running TensorFlow.js inside a Cloud Function would mean shipping the native `tfjs-node` binaries, or accepting the pure-JS backend, which takes seconds per image. It would also mean sending pictures to the server, which this design avoids. So it is not used.

## Deployment

1. *(Recommended)* Generate a key and put it in `functions/.env`, which is gitignored:
   `FACE_TEMPLATE_KEY=<64 hex characters>` (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Keep a copy somewhere safe: without it, enrolled faces cannot be read and must be enrolled again.
2. Deploy the functions (`firebase deploy --only functions`), then the rules and hosting (`firebase deploy --only firestore:rules,hosting`). No index or data migration is needed.
3. In **Admin > Attendance > Facial recognition**, set the match distance (0.50 recommended; lower is stricter) and the log retention (default 90 days), then **Enable**.
4. **Tutors first:** record each tutor's consent (signed form), then use **Add photos** (1 to 5 clear, front-facing photos). Tutors then see "Verify with my face" in the rollcall.
5. **Students only after the safeguards below:** approve student processing (DPIA reference and safeguards confirmation). Then record parent or guardian consent (a form, or the parent gives it in the Parent Portal) and add each child's photos.

## Privacy safeguards still requiring configuration (not done by code)

* **Data Protection Impact Assessment** under the Kenya Data Protection Act 2019 (biometric data is sensitive personal data) and the Data Protection (General) Regulations 2021. Check whether Paisley must register with the ODPC.
* **Consent wording** for parents and guardians (children) and for adult tutors: what is collected (face descriptors, not photos), why, where, retention, the right to withdraw, and the non-biometric alternative. The portal records who consented, when and how.
* **Published retention and deletion policy.** Enforced in code:
  - attempt logs are deleted after `retentionDays`;
  - enrolled descriptors are deleted at once on consent withdrawal or admin removal, and by the daily job when the account is deleted;
  - an inactive account is flagged to the Studio Desk, not deleted automatically.
* **Set `FACE_TEMPLATE_KEY`** so templates are encrypted in addition to Firestore's own encryption at rest.
* **Keep the admin list short.** Admins see consent and status, never descriptors.
* Pilot with tutors, check how often genuine people are refused, and adjust the match distance before considering students.

## What is not stored

* No picture of anyone, ever: not from check-ins, not from enrollment, not classroom or group photos, no video. The camera opens only when one person taps the face option, and it stops when they finish, cancel or minimise.
* No descriptor goes back to any browser.
