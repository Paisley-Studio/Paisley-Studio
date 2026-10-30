# Paisley Studio: "Every Possibility. Connected."

The 60-second launch film for Paisley Studio, built as code with [Remotion](https://remotion.dev).
This folder is separate from the production website and changes nothing in it.

**Order:** IGCSE → CBC → AI & TECH → connected platform → parent experience → brand reveal.
1920×1080 · 30 fps · 1800 frames · H.264 + AAC.

## Deliverables (`out/final/`)

| File | What it is |
| --- | --- |
| `PaisleyStudio_Master_16x9.mp4` | The master, 16:9 |
| `PaisleyStudio_Captioned_16x9.mp4` | Master with burned-in narration captions |
| `PaisleyStudio_Vertical_9x16.mp4` | 1080×1920 social cut with large captions |
| `PaisleyStudio_Square_1x1.mp4` | 1080×1080 social cut with captions |
| `PaisleyStudio_Captions.srt` | Caption file for platforms that take sidecar captions |

Audio (`production/audio/`): `mix_raw.wav` (unmastered mix), `stems/music.wav`, `stems/sfx.wav`,
`stems/vo.wav`, `vo1–vo8.wav` (narration lines), `takes/` (three voices to compare).
The mastered soundtrack used by the film is `public/audio/soundtrack.wav` (-14 LUFS, -1.3 dBTP).

## Rebuild from scratch

```bash
npm install
python -m pip install numpy scipy edge-tts pillow

# 1. Voice-over (Microsoft neural TTS via edge-tts; needs internet)
python production/gen_vo.py        # en-US-AvaNeural, also writes word timings to words.json
for i in 1 2 3 4 5 6 7 8; do npx remotion ffmpeg -y -i production/audio/takes/en-US-AvaNeural/vo$i.mp3 -ar 48000 -ac 1 production/audio/vo$i.wav; done

# 2. Score, sound design, mix and master
python production/build_audio.py
python production/master_audio.py

# 3. Preview, then render
npx remotion studio
npx remotion render PaisleyAd          out/final/PaisleyStudio_Master_16x9.mp4   --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k --concurrency=4
npx remotion render PaisleyAdCaptioned out/final/PaisleyStudio_Captioned_16x9.mp4 --codec=h264 --crf=17 --audio-codec=aac --audio-bitrate=320k --concurrency=4
npx remotion render PaisleyAdVertical  out/final/PaisleyStudio_Vertical_9x16.mp4  --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=320k --concurrency=4
npx remotion render PaisleyAdSquare    out/final/PaisleyStudio_Square_1x1.mp4     --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=320k --concurrency=4

# Review stills from one bundle: node production/stills.mjs PaisleyAd out/stills 300 900 1500
```

The narrator is `en-US-AvaNeural`, a mature, lively American female voice. Comparison takes are in
`production/audio/takes/`: `en-US-AriaNeural` (confident) and `en-US-EmmaNeural` (brighter), plus the
earlier Kenyan and British takes. To switch, run `python production/gen_vo.py <voice>`, decode into
`production/audio/vo*.wav`, and rerun step 2. If a new voice changes a
line's length, adjust `vo[].at` in `src/timeline.json`.

## How it is built

- **`src/timeline.json` drives everything.** Scene bounds, VO placements, every UI event (release,
  notify, submit, grade, approve…) and the captions live here. The React scenes and
  `production/build_audio.py` both read it, so a sound effect cannot drift from its visual event.
  The workflow events in Scene 05 sit on the narrator's word timings ("Classes… assessments… feedback… projects… Connected").
- `src/scenes/*` holds one file per scene. `src/ui.tsx` is a rebuild of the real portals (sidebar, header,
  bell, cards, pills, parent overview) measured from the supplied screenshots, using the portal's own
  labels. `src/Robot.tsx` is PAISLEY AI, traced from the AI Literacy page so it can blink.
- **Audio is original.** The score (120 BPM, D major / B minor) and every SFX are synthesised in
  `build_audio.py`: no samples or library music, so there is nothing to license. The music ducks
  about 7–8 dB under the narration, and `master_audio.py` measures BS.1770 loudness itself, because
  Remotion's bundled ffmpeg has no `loudnorm` filter.

See `production/MANIFEST.md` for every asset used and its source.
