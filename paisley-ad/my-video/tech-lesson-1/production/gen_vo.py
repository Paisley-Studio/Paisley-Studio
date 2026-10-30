"""Generate the narration with Microsoft neural TTS (edge-tts), one file per script line.

Narrator: en-US-AndrewNeural, a warm, confident American male voice. Comparison voices for
the same lines: en-US-BrianNeural (more casual), en-US-ChristopherNeural (deeper, more formal).

Usage: python production/gen_vo.py [voice] [only_ids,comma,separated]
Writes production/audio/takes/<voice>/<id>.mp3 and words.json (word start/end per line, seconds),
then decodes each line to production/audio/vo/<id>.wav (48 kHz mono) for the default voice.
"""
import asyncio
import json
import os
import subprocess
import sys

import edge_tts

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from script import LINES, LINE_RATE  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = "en-US-AndrewNeural"
BASE_RATE = -6  # percent; LINE_RATE in script.py is added on top
PITCH = "-1Hz"
# Remotion's bundled ffmpeg (calling it directly is much faster than `npx remotion ffmpeg`)
FFMPEG = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
if not os.path.exists(FFMPEG):
    FFMPEG = "ffmpeg"


async def synth(voice, lid, text, out):
    c = edge_tts.Communicate(text, voice, rate=f"{BASE_RATE + LINE_RATE.get(lid, 0):+d}%", pitch=PITCH, boundary="WordBoundary")
    audio, marks = bytearray(), []
    async for chunk in c.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            s = chunk["offset"] / 1e7
            marks.append([round(s, 3), round(s + chunk["duration"] / 1e7, 3), chunk["text"]])
    with open(os.path.join(out, f"{lid}.mp3"), "wb") as f:
        f.write(audio)
    return marks


async def main(voice, only):
    out = os.path.join(ROOT, "production", "audio", "takes", voice)
    os.makedirs(out, exist_ok=True)
    wpath = os.path.join(out, "words.json")
    words = json.load(open(wpath, encoding="utf-8")) if os.path.exists(wpath) else {}
    for lid, text, _ in LINES:
        if only and lid not in only:
            continue
        for attempt in range(4):
            try:
                words[lid] = await synth(voice, lid, text, out)
                break
            except Exception as e:  # the service drops connections now and then
                print(f"{lid}: retry after {e!r}")
                await asyncio.sleep(2 + attempt * 3)
        print(lid, end=" ", flush=True)
    with open(wpath, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=1)
    print()
    if voice == VOICE:
        dst = os.path.join(ROOT, "production", "audio", "vo")
        os.makedirs(dst, exist_ok=True)
        for lid, _, _ in LINES:
            if only and lid not in only:
                continue
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", os.path.join(out, f"{lid}.mp3"),
                            "-ar", "48000", "-ac", "1", os.path.join(dst, f"{lid}.wav")], check=True)


if __name__ == "__main__":
    args = sys.argv[1:] + [None, None]
    asyncio.run(main(args[0] or VOICE, set(args[1].split(",")) if args[1] else None))
