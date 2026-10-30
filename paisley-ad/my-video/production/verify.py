"""Inspect a rendered film: streams, exact duration, audio sync, loudness, sampled frames.

Usage: python production/verify.py out/final/PaisleyStudio_Master_16x9.mp4 [frames_out_dir]
"""
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from master_audio import lufs, true_peak_db, read  # noqa: E402

NPX = "npx.cmd" if os.name == "nt" else "npx"


def run(*args):
    return subprocess.run([NPX, "remotion", *args], cwd=ROOT, capture_output=True, text=True)


src = sys.argv[1]
frames_dir = sys.argv[2] if len(sys.argv) > 2 else None
probe = run("ffprobe", "-v", "error", "-show_entries",
            "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels,duration:format=duration",
            "-of", "default=nw=1", src)
print(probe.stdout.strip())

tmp = os.path.join(ROOT, "out", "_verify.wav")
run("ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", tmp)
x, sr = read(tmp)
ref, _ = read(os.path.join(ROOT, "public", "audio", "soundtrack.wav"))
print(f"audio: {len(x) / sr:.3f}s  {lufs(x, sr):.1f} LUFS  {true_peak_db(x):.2f} dBTP")

# sync: cross-correlate a 10 s window of the encoded audio against the master soundtrack
a, b = int(36 * sr), int(46 * sr)
seg_x = x[a:b, 0] - x[a:b, 0].mean()
seg_r = ref[a - 2400:b + 2400, 0] - ref[a - 2400:b + 2400, 0].mean()
corr = np.correlate(seg_r, seg_x, mode="valid")
lag = (np.argmax(corr) - 2400) / sr * 1000
print(f"A/V sync vs soundtrack.wav: offset {lag:+.1f} ms (AAC priming included)")
head = np.abs(x[: int(0.05 * sr)]).max()
tail = np.abs(x[-int(0.05 * sr):]).max()
print(f"head peak {head:.4f}, last 50 ms peak {tail:.4f}")
os.remove(tmp)

if frames_dir:
    os.makedirs(frames_dir, exist_ok=True)
    for s in [0.5, 3.6, 5.6, 9.2, 13.8, 17.6, 22.6, 28.9, 33.9, 38.6, 39.7, 40.6, 41.6, 42.6, 44.2, 46.0, 48.8, 50.6, 52.6, 55.4, 56.2, 59.9]:
        run("ffmpeg", "-y", "-loglevel", "error", "-ss", f"{s}", "-i", src, "-frames:v", "1", "-q:v", "4",
            os.path.join(frames_dir, f"t{s:05.1f}.jpg"))
    print("frames ->", frames_dir)
