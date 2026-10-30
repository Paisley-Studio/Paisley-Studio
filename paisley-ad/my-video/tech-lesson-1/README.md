# Paisley Studio TECH, Lesson 1: "What is AI?"

The first lesson of the Digital AI Literacy programme, built as code with [Remotion](https://remotion.dev).
1920×1080 · 30 fps · 4:27 · narrated by `en-US-AndrewNeural` (warm, confident American male voice).

| Composition | What it is |
| --- | --- |
| `TechLesson1` | The lesson |
| `TechLesson1Captioned` | The same lesson with burned-in captions (taken from the script, timed to each word) |

## The eleven scenes

01 Wait... what is AI? (everyday tech carousel → ring around an AI core) · 02 So... what is AI?
(ARTIFICIAL INTELLIGENCE → RECOGNIZE / PREDICT / CREATE) · 03 A kid teaching PAISLEY AI with dog and cat
cards; a never-seen dog; EXAMPLES → PATTERNS · 04 2 → 4 → 6 → 8 → ? with thinking time, then
millions of examples sorted into patterns · 05 Canvas, page, editor, poster and timeline fill up;
"magic?" gets struck out; AI = A TOOL · 06 One phone, seven everyday AIs · 07 A workspace that fills
verb by verb, then "wait... I could make that?" · 08 The spider question, a confident wrong answer, AI CAN BE
WRONG, ASK → CHECK → THINK → DECIDE · 09 AI | YOU split, then YOU + AI · 10 What could you create? ·
11 WELCOME TO TECH. LEARN. CREATE. BUILD. Let's make something.

## Rebuild

```bash
npm install
python -m pip install numpy scipy edge-tts pillow

python production/gen_vo.py        # narration, one file per line (+ word timings); needs internet, ~8 min
python production/layout.py        # places the lines and writes src/timeline.json
python production/build_audio.py   # original score + sound design + mix (~5 min)
python production/master_audio.py  # -14 LUFS, -1 dBTP -> public/audio/lesson1.wav

npx remotion studio                # preview
npx remotion render TechLesson1          out/TechLesson1.mp4          --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
npx remotion render TechLesson1Captioned out/TechLesson1_Captioned.mp4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k
```

Review stills: `node production/stills.mjs TechLesson1 out/stills <frame>...` then `python production/sheet.py out/stills out/sheet.jpg`.

## How it is built

- **`production/script.py` is the source of truth.** Each line has its text and the pause after it,
  plus per-line delivery speed. To change a word, edit the line, rerun `gen_vo.py <voice> <line ids>`, then
  `layout.py` and `build_audio.py`. Picture and sound follow automatically.
- **Everything is timed to spoken words.** `src/lib.tsx` exposes `L(id)` / `E(id)` (line start / end) and
  `W(id, "word")` (that word's start). `build_audio.py` has the same helpers, so a sound effect cannot drift
  from its visual.
- **Audio is original.** Score (100 BPM, A major / F# minor) and every effect are synthesised in
  `build_audio.py`, so there is nothing to license. The music ducks under the narration. The section mood follows
  the brief: curious → warm → driving → drops away for "AI can be wrong" → resolves into the TECH sting.
- Visuals: `src/scenes/S01…S11`, illustrations in `src/art.tsx` (dogs, cats, the kid, the spider, the
  landscape), PAISLEY AI in `src/Robot.tsx` (from the launch film), brand colours from `js/tech/tech-portal.css`.
- Alternative narrators: `python production/gen_vo.py en-US-BrianNeural` (more casual) writes a take to
  `production/audio/takes/` for comparison. Only the default voice is decoded into the lesson.
