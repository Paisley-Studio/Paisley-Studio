"""Master Lesson 2's soundtrack: -14 LUFS integrated, -1 dBTP, with production/master_audio.py's meter and limiter.

The limiter oversamples 4x, which does not fit in memory for a 7-minute track in one go, so it runs on
30-second blocks with a second of context either side (far longer than its 3 ms look-ahead and 80 ms release).
Usage: python production/lesson2/master.py   (reads production/lesson2/audio/mix_raw.wav, writes public/audio/lesson2.wav)
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
from master_audio import CEILING_DBTP, TARGET_LUFS, limit, lufs, read, true_peak_db, write  # noqa: E402

BLOCK, PAD = 30.0, 1.0


def limit_blocks(x, sr, ceiling_db):
    out = np.empty_like(x)
    b, p = int(BLOCK * sr), int(PAD * sr)
    for i in range(0, len(x), b):
        lo, hi = max(0, i - p), min(len(x), i + b + p)
        y = limit(x[lo:hi], sr, ceiling_db)
        out[i:min(len(x), i + b)] = y[i - lo:i - lo + min(b, len(x) - i)]
    return out


x, sr = read(os.path.join(HERE, "audio", "mix_raw.wav"))
before = lufs(x, sr)
for _ in range(3):  # gain, limit, re-measure
    x = x * 10 ** ((TARGET_LUFS - lufs(x, sr)) / 20)
    x = limit_blocks(x, sr, CEILING_DBTP - 0.3)
out = os.path.join(ROOT, "public", "audio", "lesson2.wav")
write(out, x, sr)
y, _ = read(out)
print(f"raw {before:.1f} LUFS -> master {lufs(y, sr):.1f} LUFS, {true_peak_db(y):.2f} dBTP, {len(y) / sr:.3f}s")
