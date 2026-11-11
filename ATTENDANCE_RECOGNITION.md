# Attendance: optional facial recognition

Facial recognition is an optional way to register attendance, controlled by the Studio Desk in **Admin > Attendance > Facial recognition**. It is **disabled by default**. While it is disabled (or suspended), students and tutors see no face option, no camera is requested, and no biometric data is processed. The normal check-in (I'm Here, I'm teaching, tutor marking) always works, with or without recognition.

## How it fits together

| Piece | Where | What it holds |
|---|---|---|
| School-wide switch | `attendanceSettings/recognition` (admin read, functions write) | `status` (disabled / enabled / suspended), `threshold`, `margin`, `retentionDays`, `studentsApproved` + `dpia`, history |
| Engine credentials | `privateConfig/faceRecognition` (no client access), or `COMPREFACE_URL` / `COMPREFACE_API_KEY` in `functions/.env` | URL and Recognition API key |
| Profiles | `faceProfiles/{uid}` (admin read) | account id, type, consent (with history), enrollment status. **No image or template** |
| Attempt log | `faceAttempts` (admin read) | who, lesson, result, similarity, threshold, time. **No image.** Pruned after `retentionDays` |
| Audit | `attendanceAudit` (`area: 'recognition'`) | enable / disable / suspend, settings, consent, enroll, replace, remove |
| Engine | your own CompreFace server | the face examples and embeddings, under subject `s_<uid>` (students) or `t_<uid>` (tutors) |

Backend: `functions/face-recognition.js` (callables `faceAdmin`, `faceCheckIn`, `faceTutorVerify`, `faceConsent`, schedule `faceRetention`). The engine sits behind the interface in `functions/face-provider.js` (`health`, `enroll`, `remove`, `recognize`), so you can swap CompreFace for another engine by adding one provider there. Frontend: `js/attendance/face.js`.

**Server-side gates on every attempt:** the switch is enabled (read fresh on each call, and checked again before a match counts), students are approved, the caller has a consented and enrolled profile of the right type, at most 8 attempts in 10 minutes, exactly one face, the best match is the caller's **own** subject at or above the threshold, and no other subject comes within the margin. Anything else is refused and logged, and nobody is ever marked present on a guess. A matched student check-in goes through the same `checkIn` as I'm Here (server time, one record, at most one strike). A tutor match only verifies the tutor's own lesson (`tutorIds`).

## Recognition engine and licensing

* **Engine: CompreFace** (Exadel), self-hosted with Docker. The engine code is Apache-2.0.
* **Model: use the default "FaceNet" build only** (MTCNN detector, FaceNet 20180402-114759). The FaceNet code (davidsandberg/facenet) is MIT-licensed. **Those weights were trained on the VGGFace2 dataset, whose terms are research-oriented. Before commercial use, get legal advice on the weights.**
* **Do not use the "Mobilenet", "Mobilenet-gpu" or "SubCenter-ArcFace" builds** without a commercial licence from InsightFace. Their pretrained models are released for non-commercial research use only.
* Firebase Cloud Functions cannot host CompreFace: it needs a Docker host with about 4 GB of RAM and an AVX-capable CPU. Run it on a small VM you control (e.g. a cloud VM in a region acceptable under Kenyan data-protection law), behind HTTPS (Caddy or nginx with a certificate). Expose only the API, not the admin UI, and restrict access to Google Cloud Functions egress where possible.
* No pictures go to any third-party AI service. Cloud Functions send each picture straight to your own engine.

## Deployment

1. Install CompreFace (default build): `docker compose up -d` from the release bundle. Create an application and a **Recognition** service, then copy its API key. Enable PostgreSQL disk encryption (or put it on an encrypted volume), and back it up encrypted.
2. Deploy the functions (`firebase deploy --only functions`), then the rules and hosting (`firebase deploy --only firestore:rules,hosting`). No index or data migration is needed.
3. In **Admin > Attendance > Facial recognition**, use **Connect engine** (HTTPS URL + key) and **Test connection**. You can also set `COMPREFACE_URL` / `COMPREFACE_API_KEY` in `functions/.env`, which is gitignored. Environment values take precedence.
4. Set the threshold (default 0.90; FaceNet similarities are engine-calibrated, so check them against your own pilot data), the margin (default 0.05) and log retention (default 90 days).
5. **Tutors first:** record each tutor's consent (signed form), upload a clear front-facing photo, then **Enable**. Tutors see "Verify with my face" in the rollcall.
6. **Students only after the safeguards below:** Approve student processing (DPIA reference + confirmation), then record parent or guardian consent (form, or the parent gives it in the Parent Portal) and upload each child's photo.

## Privacy safeguards still requiring configuration (not done by code)

* **Data Protection Impact Assessment** under the Kenya Data Protection Act 2019 (biometric data is sensitive personal data, s.2 and s.44 onwards), plus the Data Protection (General) Regulations 2021. Check whether Paisley must register with the ODPC as a data controller or processor.
* **Consent wording** for parents and guardians (children) and for adult tutors: what is collected, why, where it is stored, retention, the right to withdraw, and the non-biometric alternative. The portal records who consented, when and how; the form itself is yours to write.
* **Published retention and deletion policy.** Enforced in code: attempt logs are deleted after `retentionDays`. Face data is deleted from the engine on consent withdrawal, on admin removal, and when the account is deleted. An account that becomes inactive is flagged to the Studio Desk, not auto-deleted, so decide how long to keep a leaver's enrollment.
* **Engine hardening:** HTTPS only (enforced in code), encrypted storage, firewalled, restricted admin access, a rotated API key, and engine logs that do not keep images.
* **Access control:** only admins can read `faceProfiles` / `faceAttempts`, and nobody can read `privateConfig`. Keep the admin list short.
* Pilot with tutors, measure false-reject rates, and only then consider students.

## What is not stored

* No classroom or group photos and no video. The camera opens only when one person taps the face option. One frame is captured, sent, compared and discarded, and the camera stops.
* Reference photos are passed to the engine and not kept in Firebase Storage or Firestore.
* For "different person" results the log does not record who the face matched.
