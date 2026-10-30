"""Master the soundtrack: ITU-R BS.1770-4 loudness to -14 LUFS integrated, -1 dBTP ceiling.

Remotion's bundled ffmpeg has no ebur128/loudnorm filter, so loudness is measured here.
Usage: python production/master_audio.py            (reads production/audio/mix_raw.wav)
       python production/master_audio.py --measure FILE...
Writes public/audio/lesson1.wav
"""
import os
import sys
import wave

import numpy as np
from scipy.signal import lfilter, resample_poly, butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET_LUFS = -14.0
CEILING_DBTP = -1.0


def read(path):
    with wave.open(path) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    return x.reshape(-1, ch), sr


def k_weight(x, sr):
    # BS.1770 pre-filter (high shelf) + RLB high-pass, coefficients for 48 kHz
    assert sr == 48000
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x, sr):
    y = k_weight(x, sr)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    ms = np.array([(y[i:i + blk] ** 2).mean(axis=0).sum() for i in range(0, len(y) - blk, hop)])
    lk = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak_db(x):
    up = resample_poly(x, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-12)


def limit(x, sr, ceiling_db):
    """Look-ahead peak limiter on a 4x oversampled detector."""
    ceil = 10 ** (ceiling_db / 20)
    det = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1).reshape(-1, 4).max(axis=1)[: len(x)]
    det = np.pad(det, (0, len(x) - len(det)))
    need = np.minimum(1.0, ceil / np.maximum(det, 1e-9))
    look = int(0.003 * sr)
    # gain must already be down when the peak arrives: running min over the look-ahead window
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * look + 1, origin=0)
    rel = np.exp(-1 / (0.08 * sr))
    out = np.empty_like(g)
    cur = 1.0
    for i, v in enumerate(g):  # instant attack (already look-ahead), smooth release
        cur = v if v < cur else v + (cur - v) * rel
        out[i] = cur
    out = sosfilt(butter(1, 200, "low", fs=sr, output="sos"), out)
    out = np.minimum(out, g * 1.0 + (1 - g) * 0)  # never exceed the required gain
    return x * out[:, None]


def write(path, x, sr):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--measure":
        for f in sys.argv[2:]:
            x, sr = read(f)
            print(f"{f}: {lufs(x, sr):6.1f} LUFS  {true_peak_db(x):5.1f} dBTP  {len(x) / sr:.3f}s")
        sys.exit()
    x, sr = read(os.path.join(ROOT, "production", "audio", "mix_raw.wav"))
    before = lufs(x, sr)
    for _ in range(3):  # gain, limit, re-measure
        x = x * 10 ** ((TARGET_LUFS - lufs(x, sr)) / 20)
        x = limit(x, sr, CEILING_DBTP - 0.3)
    os.makedirs(os.path.join(ROOT, "public", "audio"), exist_ok=True)
    out = os.path.join(ROOT, "public", "audio", "lesson1.wav")
    write(out, x, sr)
    y, _ = read(out)
    print(f"raw {before:.1f} LUFS -> master {lufs(y, sr):.1f} LUFS, {true_peak_db(y):.2f} dBTP, {len(y) / sr:.3f}s")
