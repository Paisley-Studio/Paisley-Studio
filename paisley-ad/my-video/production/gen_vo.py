"""Generate the voice-over, one file per line, with Microsoft neural TTS (edge-tts).

Narrator: en-US-AvaNeural, a mature, expressive American female voice, at a lively pace
with a slightly lowered pitch for warmth. Alternatives: en-US-AriaNeural (confident),
en-US-EmmaNeural (brighter).

Usage: python production/gen_vo.py [voice] [rate] [outdir]
Writes vo1..vo8.mp3 plus words.json (word start times per line, used to time the picture).
"""
import asyncio, json, os, sys, edge_tts

VOICE = "en-US-AvaNeural"
RATE = "-4%"
PITCH = "-3Hz"

LINES = [
    "Every extraordinary future begins with a possibility.",
    "From IGCSE, where focused learning meets academic ambition.",
    "To CBC, where curiosity, understanding and growth come together.",
    "And into AI and technology, where young minds move beyond learning, to creating.",
    "Classes, assignments, assessments, feedback and projects. Connected, in one learning experience.",
    "And for parents, the journey becomes clearer, with progress, feedback and learning activity in view.",
    "Paisley Studio.",
    "Every possibility, connected.",
]

# The opening line and the brand name land more slowly; the last line stays brisk
# so it resolves before the final frame.
LINE_RATES = {1: "-10%", 7: "-12%", 8: "-6%"}


async def main(voice, rate, out):
    os.makedirs(out, exist_ok=True)
    words = {}
    for i, text in enumerate(LINES, 1):
        c = edge_tts.Communicate(text, voice, rate=LINE_RATES.get(i, rate), pitch=PITCH, boundary="WordBoundary")
        audio, marks = bytearray(), []
        async for chunk in c.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
            elif chunk["type"] == "WordBoundary":
                marks.append([round(chunk["offset"] / 1e7, 3), chunk["text"]])
        with open(os.path.join(out, f"vo{i}.mp3"), "wb") as f:
            f.write(audio)
        words[f"vo{i}"] = marks
    with open(os.path.join(out, "words.json"), "w", encoding="utf-8") as f:
        json.dump(words, f, indent=1)


args = sys.argv[1:] + [None] * 3
asyncio.run(main(args[0] or VOICE, args[1] or RATE, args[2] or os.path.join("production", "audio", "takes", args[0] or VOICE)))
