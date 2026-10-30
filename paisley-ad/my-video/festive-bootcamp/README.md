# Paisley TECH: Festive Creator Bootcamp advertisement

The 60-second campaign film, built as code with [Remotion](https://remotion.dev).
1920×1080 · 30 fps · 59.99 s. Brand lock: Quicksand only, colours from `tech.html` and `js/tech/tech-portal.css`.
This folder is separate from the production website and changes nothing in it.

| Composition | What it is |
| --- | --- |
| `FestiveCreatorBootcamp` | The master, 16:9 |

## The film

01 Screen time · 02 What if they created? · 03 The family Christmas website · 04 The holiday blog ·
05 One idea becomes another, then they escape the screen · 06 It needs tools / "Let's see what you can make." ·
07 Paisley TECH, then coaches walking the road to mastery · 08 YOU + AI, then the discipline doors · 09 Publish and share · 10 The gift / "I MADE THAT." ·
11 The offer · 12 Creation time · 13 Reserve their place / LET THEM CREATE.

## Preview, render

```bash
npm install
npx remotion studio
npx remotion render FestiveCreatorBootcamp out/PaisleyTECH_FestiveCreatorBootcamp_16x9.mp4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k --concurrency=4
```

## Rebuild the sound

```bash
python -m pip install numpy scipy edge-tts pillow

python production/cut_assets.py    # recolours the supplied screens, cuts the game into sprites (public/img/real)
python production/gen_vo.py        # narration, one file per line (+ word timings); needs internet
python production/layout.py        # places the lines, writes src/timeline.json
python production/build_audio.py   # original score + sound design + mix
python production/master_audio.py  # -14 LUFS, -1 dBTP -> public/audio/soundtrack.wav
```

Review stills: `node production/stills.mjs FestiveCreatorBootcamp out/stills <frame>...` then `python production/sheet.py out/stills out/sheet.jpg`.

## How it is built

- **`production/script.py` is the source of truth.** Each narration line has its text and the pause after it, plus
  per-line delivery speed, and `events()` names every moment shared by picture and sound. To change a word, edit the line,
  rerun `gen_vo.py <voice> <line ids>`, then `layout.py`, `build_audio.py`, `master_audio.py`. Picture and sound follow.
- **Narrator:** `en-US-AndrewNeural`, a synthetic voice (Microsoft neural TTS via edge-tts). To use a real voice artist,
  replace the files in `production/audio/vo/` with the same names, then rerun from `layout.py`.
- **Audio is original.** The score (104 BPM, G major) and every effect are synthesised in `build_audio.py`, so there are
  no samples or library music to license. The score's grid is anchored to the impact after "they created it?".
- **The three project screens are supplied.** `public/img/` holds the originals, untouched. `cut_assets.py` makes the copies the
  film uses: purple recoloured to Paisley teal, placeholder logo removed and the real lockup drawn on top, the game cut into
  sprites. Set `RECOLOUR = False` there to keep the purple. In `src/creations.tsx`, `RealSite` and `RealBlog` assemble the
  screens region by region with live details (countdown, playlist, RSVP, typing), and `GameScreen` actually plays the game.
- **Everything else is original.** The cast and home are vector illustrations in `src/art.tsx`, scenes are in `src/scenes/`.
  The cut-outs in `/img` at the repo root were not used: they show young adults, not 9-17s, and the laptops carry a third-party logo.
