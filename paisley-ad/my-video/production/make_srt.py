"""Write out/final/PaisleyStudio_Captions.srt from src/timeline.json captions."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
caps = json.load(open(os.path.join(ROOT, "src", "timeline.json"), encoding="utf-8"))["captions"]
ts = lambda s: f"{int(s // 3600):02}:{int(s % 3600 // 60):02}:{int(s % 60):02},{int(round(s % 1 * 1000)):03}"
os.makedirs(os.path.join(ROOT, "out", "final"), exist_ok=True)
with open(os.path.join(ROOT, "out", "final", "PaisleyStudio_Captions.srt"), "w", encoding="utf-8") as f:
    for i, (a, b, text) in enumerate(caps, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{text}\n\n")
