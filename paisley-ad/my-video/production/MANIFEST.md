# Production manifest

## Source assets used

| Asset in film | File | Source | Where it appears |
| --- | --- | --- | --- |
| Website hero | `public/shots/s4.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 183604 | 02 IGCSE, browser opening |
| "Three ways to learn" programme cards | `public/shots/s5.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 183709 | 02 IGCSE card (lifted), 03 CBC card |
| Paisley AI page | `public/shots/s6.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 183747 | Reference for `src/Robot.tsx` (geometry and colours sampled) |
| Student classroom | `public/shots/s1.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 182449 | Reference for the rebuilt student portal (02, 05) |
| Tutor timetable | `public/shots/s2.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 182908 | Reference for the rebuilt tutor portal (05) |
| Parent overview | `public/shots/s3.png` | PAISLEY-PHOTOS, Screenshot 2026-10-29 183220 | Reference for the rebuilt parent portal (06) |
| Logo | `public/img/logo.png`, `logo@3x.png` | `cropped-Paisely-logo-Resized.png`, the logo the site serves (199×119; `@3x` is a Lanczos upscale) | Sidebars, social band, end card |
| IGCSE learner | `public/img/guy.png` | project `img/guy.png` | 01, 02 |
| CBC learner | `public/img/girl.png` | project `img/girl.png` | 03 |
| TECH learner | `public/img/hero.png` | project `img/hero.png` | 04 |
| Parent | `public/img/African.png` | project `img/African.png` | 06 |
| Fonts | Quicksand (site font), Caveat (handwriting), JetBrains Mono (code) | Google Fonts via `@remotion/google-fonts` (OFL) | throughout |
| Icons | Font Awesome 6 Free Solid | same icon set and icon names as the portals | portal rebuilds |
| Colour tokens | `--brand #55BFB3`, `--brand-deep #245F5A`, `--gold #F5C842`, `--paper #F1F9F7`, … | `index.html` `:root`, `js/tech/tech-portal.css` | throughout |

Not used: `img/SkillHub Educational.png`, `phone1.png`, `phone2.png` (another brand), `team.png` (duplicate of `friends.png`).

## Wording taken from the product

| Film | Source |
| --- | --- |
| Student nav, "My Classes", "Lessons, notes and resources for the subjects you take." | `student/dashboard.html`, screenshot s1 |
| Tutor nav, "Release to my students", "— already released", "Grade & Release" | `tutor/dashboard.html`, `js/classroom/work-helpers.js` |
| Grade form: Score / Max score / Feedback for the student | grading modal (`admin/index.html`) |
| "Submitted — awaiting grading", "Graded — see My Results" | `student/dashboard.html` |
| Notification "New homework posted" | `functions/work.js`, `functions/notifications.js` |
| "Homework graded" + "… has been graded: 18/20. Open it to see your feedback and download your marked copy." | `functions/work.js` student message |
| Parent: "… 's homework "…" (Mathematics) has been graded: 18/20. The marked copy is in the Parent Portal." | `functions/work.js` parent message |
| CBC Tuition Portal nav, "My Classroom", "Revision lessons and resources for your subjects" | `tuition/dashboard.html` |
| CBC stages: Lower Primary (1–3), Upper Primary (4–6), Junior School (7–9), Senior School (10–12) | `tuition.html` |
| Junior School learning areas | `lms-helpers.js` CBC subject catalogue |
| "SELF-LED • STUDENT PROJECT", Idea → Learning → Building → Testing → Ready, "Submitted for review ✓", "Approved ✓", "Under review" | `js/tech/tech-helpers.js` |
| Code IDE, index.html / style.css / script.js, Live preview, Run | `js/tech/code-lab.js`, `tech-helpers.js` |
| Parent overview: VIEWING, SWITCH, Paisley TECH card, the four tiles, Recent activity | `parent/dashboard.html`, screenshot s3 |

## Demo data and privacy

The supplied screenshots of the student, tutor and parent portals contain real-looking names. None of
those pixels are shown. Those screens are rebuilt with fictional demo people (Amani Njoroge, Zawadi
Achieng, Ms Wanjiru, Baraka Otieno, Nia Mutua) and illustrative values (18/20, 78%, 12/12, …). Every rebuilt
interface carries the on-screen label **INTERFACE SHOWN WITH DEMO DATA**. The film makes no
performance or outcome claims.

## Generated material

| Item | How | Licence notes |
| --- | --- | --- |
| Narration | Microsoft Edge neural TTS (`edge-tts`), voice `en-US-AvaNeural` (American English, female; rate -4%, pitch -3 Hz) | The edge-tts endpoint is a consumer read-aloud service. For paid broadcast, re-voice the same script with a commercially licensed voice (Azure Speech, the same voice under an Azure licence, or ElevenLabs) or a human narrator, then rerun `build_audio.py`. |
| Music | Synthesised in `production/build_audio.py` | Original, owned outright |
| Sound effects | Synthesised in `production/build_audio.py` | Original, owned outright |
