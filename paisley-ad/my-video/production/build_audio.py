"""Paisley Studio, "Every Possibility. Connected." Original score, sound design and mix.

Everything here is synthesised from scratch (no samples, no third-party music), so the
soundtrack is fully owned and cleared for commercial use. Event times come from
src/timeline.json, the same file that drives the picture, so every sound effect lands on
its visual event.

Usage:  python production/build_audio.py
Writes: production/audio/stems/{music,sfx,vo}.wav and production/audio/mix_raw.wav
        (production/master_audio.sh then loudness-normalises it into public/audio/soundtrack.wav)
"""
import json
import os
import wave

import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
EV = TL["events"]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SR = 48000
DUR = TL["duration"]
N = int(SR * DUR)
BEAT = 60.0 / TL["bpm"]
rng = np.random.default_rng(7)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
vo = np.zeros((N, 2))


# ---------------------------------------------------------------- helpers
def hz(note):
    """'A4' / 'F#3' / 'Bb2' -> frequency."""
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    n = names[note[0]]
    rest = note[1:]
    if rest[0] == "#":
        n += 1; rest = rest[1:]
    elif rest[0] == "b":
        n -= 1; rest = rest[1:]
    midi = 12 * (int(rest) + 1) + n
    return 440.0 * 2 ** ((midi - 69) / 12)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def place(bus, sig, at, pan=0.0, gain=1.0):
    """Mix a mono or stereo signal into a bus at time `at` (s), equal-power pan."""
    i0 = int(round(at * SR))
    if i0 >= N:
        return
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1) * np.sqrt(2)
    i1 = min(N, i0 + len(sig))
    s0 = max(0, -i0)
    bus[max(i0, 0):i1] += sig[s0:i1 - i0] * gain


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    hold = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)),
                        np.full(hold, s), np.linspace(s, 0, max(r, 1))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def make_ir(seconds, decay, seed):
    r = np.random.default_rng(seed)
    t = t_axis(seconds)
    ir = r.standard_normal((len(t), 2)) * np.exp(-t / decay)[:, None]
    ir = lp(ir, 6500)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]  # predelay softening
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def reverb(x, ir, wet):
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - wet) + out * wet


# ---------------------------------------------------------------- instruments
def saw(f, t, detune_cents=0.0, max_h=None):
    f = f * 2 ** (detune_cents / 1200)
    max_h = max_h or int(min(9000, SR * 0.45) // f)
    out = np.zeros_like(t)
    ph = rng.uniform(0, 2 * np.pi)
    for k in range(1, max(2, max_h)):
        out += np.sin(2 * np.pi * f * k * t + ph * k) / k
    return out * 0.6


def pad(notes, at, dur, cutoff=1400, gain=0.10, attack=1.2, release=1.6):
    t = t_axis(dur + release)
    sig = np.zeros((len(t), 2))
    for i, n in enumerate(notes):
        f = hz(n)
        for j, dc in enumerate((-7, 0, 7)):
            v = saw(f, t, dc, max_h=int(4000 // f) + 1)
            pan = (-0.6, 0.0, 0.6)[j]
            a = (pan + 1) * np.pi / 4
            sig[:, 0] += v * np.cos(a)
            sig[:, 1] += v * np.sin(a)
    sig = lp(sig, cutoff)
    e = env_adsr(len(t), attack, 0.5, 0.85, release)
    place(music, sig * e[:, None] / len(notes), at, gain=gain)


def pluck(note, at, gain=0.12, pan=0.0, decay=0.9, bright=1.0):
    f = hz(note)
    t = t_axis(decay * 3)
    sig = np.zeros_like(t)
    for k in range(1, 9):
        sig += np.sin(2 * np.pi * f * k * t) * (1 / k ** 1.4) * np.exp(-t * (1.6 + k * 1.1 / bright) / decay)
    sig *= np.minimum(1, t / 0.004)
    place(music, sig, at, pan, gain)


def marimba(note, at, gain=0.16, pan=0.0):
    f = hz(note)
    t = t_axis(1.2)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5)
           + 0.35 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t * 18)
           + 0.12 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t * 45))
    sig *= np.minimum(1, t / 0.002)
    place(music, sig, at, pan, gain)


def bell(note, at, gain=0.10, pan=0.0, decay=2.4, bus=None, ratio=3.5):
    f = hz(note) if isinstance(note, str) else note
    t = t_axis(decay * 2.2)
    idx = 2.2 * np.exp(-t * 3.0)
    sig = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * ratio * t)) * np.exp(-t / decay * 2.2)
    sig *= np.minimum(1, t / 0.003)
    place(music if bus is None else bus, sig, at, pan, gain)


def synth_arp(note, at, length, gain=0.07, cutoff=2500, pan=0.0):
    f = hz(note)
    t = t_axis(length + 0.15)
    v = saw(f, t, 0) + saw(f, t, 9)
    fenv_mix = np.exp(-t * 14)
    bright = lp(v, cutoff * 2.2)
    dark = lp(v, cutoff * 0.35)
    v = dark + (bright - dark) * fenv_mix
    v *= env_adsr(len(t), 0.003, 0.08, 0.55, 0.12)
    place(music, v, at, pan, gain)


def bass(note, at, length, gain=0.20):
    f = hz(note)
    t = t_axis(length + 0.08)
    v = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    v = np.tanh(v * 1.6) * env_adsr(len(t), 0.006, 0.1, 0.8, 0.08)
    place(music, v, at, 0, gain)


def kick(at, gain=0.5, bus=None, tail=0.38):
    t = t_axis(tail + 0.05)
    f = 45 + 85 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-t / tail * 3.2)
    v[: int(0.003 * SR)] += rng.standard_normal(int(0.003 * SR)) * 0.25
    place(music if bus is None else bus, v, at, 0, gain)


def hat(at, gain=0.05, pan=0.25, dec=0.035):
    t = t_axis(0.12)
    v = hp(rng.standard_normal(len(t)), 7500) * np.exp(-t / dec)
    place(music, v, at, pan, gain)


def shaker(at, gain=0.05, pan=-0.3):
    t = t_axis(0.12)
    v = bp(rng.standard_normal(len(t)), 4500, 10000) * np.exp(-t / 0.045) * np.minimum(1, t / 0.012)
    place(music, v, at, pan, gain)


def clap(at, gain=0.12):
    t = t_axis(0.25)
    burst = np.zeros_like(t)
    for off in (0, 0.009, 0.018):
        i = int(off * SR)
        burst[i:] += np.exp(-(t[: len(t) - i]) / 0.012)
    v = bp(rng.standard_normal(len(t)), 900, 3500) * (burst + 0.4 * np.exp(-t / 0.09))
    place(music, v, at, 0.05, gain)


def sub_pulse(at, gain=0.35, f=48):
    t = t_axis(0.7)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) * np.minimum(1, t / 0.01)
    place(music, v, at, 0, gain)


# ---------------------------------------------------------------- sound effects
def noise_sweep(at, dur, f0, f1, gain, pan=0.0, rising=True, bus=None):
    t = t_axis(dur)
    x = rng.standard_normal(len(t))
    out = np.zeros_like(x)
    seg = int(0.02 * SR)
    for s in range(0, len(x), seg):
        p = s / len(x)
        fc = f0 * (f1 / f0) ** p
        out[s:s + seg] = bp(x[max(0, s - 2048):s + seg], fc * 0.6, fc * 1.6)[-len(x[s:s + seg]):]
    shape = np.sin(np.pi * np.linspace(0, 1, len(t))) ** (1.5 if rising else 0.8)
    if rising:
        shape = np.linspace(0, 1, len(t)) ** 2.2
    place(sfx if bus is None else bus, out * shape, at, pan, gain)


def whoosh(at, dur=0.55, gain=0.10, pan=0.0):
    noise_sweep(at - dur * 0.6, dur, 300, 4200, gain, pan, rising=False)


def click(at, gain=0.16, pan=0.0, f=2400):
    t = t_axis(0.06)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) + bp(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.004) * 0.6
    place(sfx, v, at, pan, gain)


def thock(at, gain=0.22, f=180):
    t = t_axis(0.18)
    v = np.sin(2 * np.pi * (f + 90 * np.exp(-t * 60)) * t) * np.exp(-t / 0.035)
    place(sfx, v, at, 0, gain)


def chime(at, notes, gain=0.11, gap=0.085, pan=0.1, decay=1.0):
    for i, n in enumerate(notes):
        bell(n, at + i * gap, gain, pan, decay=decay, bus=sfx, ratio=2.0)


def keys(t0, t1, gain=0.07):
    t = t0
    while t < t1:
        click(t, gain * rng.uniform(0.6, 1.0), rng.uniform(-0.2, 0.2), f=rng.uniform(1800, 3200))
        t += rng.uniform(0.06, 0.13)


def pencil(t0, t1, gain=0.11):
    """Graphite on paper: bandpassed noise shaped into short strokes."""
    t = t_axis(t1 - t0)
    x = bp(rng.standard_normal(len(t)), 1800, 7000) + 0.4 * bp(rng.standard_normal(len(t)), 300, 900)
    strokes = np.zeros_like(t)
    s = 0.0
    while s < t1 - t0 - 0.1:
        ln = rng.uniform(0.09, 0.32)
        i0, i1 = int(s * SR), int(min(t1 - t0, s + ln) * SR)
        seg = np.sin(np.pi * np.linspace(0, 1, i1 - i0)) ** 0.7 * rng.uniform(0.5, 1.0)
        strokes[i0:i1] = np.maximum(strokes[i0:i1], seg)
        s += ln + rng.uniform(0.03, 0.16)
    grain = 0.75 + 0.25 * np.abs(lp(rng.standard_normal(len(t)), 40) * 8).clip(0, 1)
    place(sfx, x * strokes * grain, t0, -0.15, gain)


def paper(at, gain=0.08):
    t = t_axis(0.35)
    v = bp(rng.standard_normal(len(t)), 900, 6000) * np.sin(np.pi * np.linspace(0, 1, len(t))) ** 2
    place(sfx, v, at, 0.2, gain)


def impact(at):
    t = t_axis(3.5)
    boom = np.sin(2 * np.pi * (36 + 50 * np.exp(-t * 9)) * t) * np.exp(-t / 1.1)
    place(sfx, np.tanh(boom * 1.4), at, 0, 0.40)
    crack = bp(rng.standard_normal(len(t)), 200, 9000) * np.exp(-t / 0.35)
    place(sfx, crack, at, 0, 0.10)


# ================================================================ SCORE
B = BEAT
BAR = 4 * B
PROG_A = [("Bm", "B2"), ("G", "G2"), ("D", "D3"), ("A", "A2")]
CHORDS = {
    "Bm": ["B3", "D4", "F#4", "A4"],
    "G": ["G3", "B3", "D4", "F#4"],
    "D": ["D4", "F#4", "A4", "E5"],
    "A": ["A3", "C#4", "E4", "B4"],
    "A/C#": ["C#4", "E4", "A4", "B4"],
}
ARP = {
    "Bm": ["B3", "F#4", "D5", "A4", "B4", "F#4", "D5", "F#5"],
    "G": ["G3", "D4", "B4", "F#4", "G4", "D4", "B4", "D5"],
    "D": ["D4", "A4", "F#5", "E5", "D5", "A4", "F#4", "A4"],
    "A": ["A3", "E4", "C#5", "B4", "A4", "E4", "C#5", "E5"],
    "A/C#": ["C#4", "E4", "A4", "B4", "C#5", "A4", "E4", "B4"],
}

# ---- 01 SPARK (0-5): darkness, a heartbeat, the first note
pad(["B2", "F#3", "D4"], 0.0, 5.2, cutoff=520, gain=0.11, attack=2.5, release=1.2)
for s in np.arange(0.5, 5.0, 1.0):
    sub_pulse(s, 0.30)
bell("D6", EV["lineIgnite"], 0.085, 0.2, decay=3.0)
bell("A5", EV["titlePossibility"], 0.07, -0.2, decay=3.0)
bell("F#6", EV["titlePossibility"] + 0.5, 0.045, 0.3, decay=2.5)
noise_sweep(3.8, 1.25, 400, 6000, 0.05, 0.0, rising=True, bus=music)

# ---- 02 IGCSE (5-16): focus and ambition. Piano-like plucks over a steady pulse
t0 = 5.0
for i, (ch, root) in enumerate(PROG_A + PROG_A[:2]):
    at = t0 + i * 2 * B * 2  # 2 s per chord
    pad(CHORDS[ch], at, 2.0, cutoff=900 + i * 120, gain=0.085, attack=0.6, release=0.9)
    bass(root, at, 1.9, gain=0.10)
    if at >= 6.0:
        for k, n in enumerate(ARP[ch]):
            pluck(n, at + k * B / 2, gain=0.065 + 0.01 * (k % 2 == 0), pan=(-0.35, 0.35)[k % 2], decay=0.7)
for s in np.arange(5.0, 16.0, B):
    sub_pulse(s, 0.17 if s < 9 else 0.22, f=52)
for s in np.arange(9.0 + B / 2, 16.0, B):
    hat(s, 0.025)

# ---- 03 CBC (16-27): warmer. Marimba, shaker, soft kick on 1 and 3
t0 = 16.0
prog_b = [("D", "D3"), ("A", "A2"), ("Bm", "B2"), ("G", "G2"), ("D", "D3"), ("A", "A2")]
for k, n in enumerate(["D4", "F#4", "A4", "D5", "F#5"]):  # CBC tonal cue
    marimba(n, t0 + k * 0.07, 0.15, -0.4 + k * 0.2)
for i, (ch, root) in enumerate(prog_b):
    at = t0 + i * 2.0
    pad(CHORDS[ch], at, 2.0, cutoff=1500, gain=0.08, attack=0.4, release=0.9)
    bass(root, at, 0.9, gain=0.12)
    bass(root, at + 1.5, 0.45, gain=0.09)
    pattern = [0, 1.5, 3, 4, 5.5, 7]  # syncopated eighths
    for j, step in enumerate(pattern):
        n = ARP[ch][j % 8]
        marimba(n, at + step * B / 2, 0.11, (-0.4, 0.4)[j % 2])
    for q in range(4):
        kick(at + q * B, 0.30 if q % 2 == 0 else 0.0, tail=0.3)
for s in np.arange(16.0, 27.0, B / 4):
    accent = 1.0 if abs((s / (B / 2)) - round(s / (B / 2))) < 1e-6 else 0.6
    shaker(s + 0.012 * (int(s / (B / 4)) % 2), 0.035 * accent)

# ---- 04 AI & TECH (27-38): contemporary electronic, filter opening across the scene
t0 = 27.0
prog_c = [("Bm", "B2"), ("G", "G2"), ("D", "D3"), ("A", "A2"), ("Bm", "B2"), ("A", "A2")]
noise_sweep(26.3, 0.9, 500, 8000, 0.05, 0.0, rising=True, bus=music)
for i, (ch, root) in enumerate(prog_c):
    at = t0 + i * 2.0
    pad(CHORDS[ch], at, 2.0, cutoff=700 + i * 250, gain=0.075, attack=0.3, release=0.7)
    for k in range(16):  # sixteenth arp
        n = ARP[ch][k % 8]
        synth_arp(n, at + k * B / 4, B / 4 * 0.9, gain=0.035 + 0.012 * (k % 4 == 0),
                  cutoff=900 + 260 * i + 40 * k, pan=0.3 * np.sin(k))
    for e in range(8):
        bass(root, at + e * B / 2, B / 2 * 0.8, gain=0.13 if e % 2 == 0 else 0.09)
    if at >= 29.0:
        for q in range(4):
            kick(at + q * B, 0.40)
            hat(at + q * B + B / 2, 0.04)
            hat(at + q * B + B / 4 * 3, 0.018, -0.25)
for s in (EV["previewRender"],):
    bell("A5", s, 0.06, 0.25, decay=1.6)
    bell("D6", s + 0.12, 0.05, -0.25, decay=1.6)

# ---- 05 CONNECTED (38-47): full rhythm, tightly tied to the product events
t0 = 38.0
prog_d = [("G", "G2"), ("D", "D3"), ("A", "A2"), ("Bm", "B2")]
for i, (ch, root) in enumerate(prog_d + [("G", "G2")]):
    at = t0 + i * 2.0
    dur = 2.0 if i < 4 else 1.0
    pad(CHORDS[ch], at, dur, cutoff=2200, gain=0.07, attack=0.15, release=0.6)
    for e in range(int(dur / (B / 2))):
        bass(root, at + e * B / 2, B / 2 * 0.8, gain=0.13 if e % 2 == 0 else 0.10)
    for k in range(int(dur / (B / 2))):
        pluck(ARP[ch][k % 8], at + k * B / 2, gain=0.045, pan=(-0.4, 0.4)[k % 2], decay=0.45, bright=1.4)
for s in np.arange(38.0, 46.9, B):
    kick(s, 0.40)
    hat(s + B / 2, 0.035)
for s in np.arange(38.0 + B, 46.9, 2 * B):
    clap(s, 0.07)
noise_sweep(46.2, 0.8, 600, 9000, 0.05, 0.0, rising=True, bus=music)

# ---- 06 PARENT (47-55): the music breathes. No percussion, warm piano and pad
t0 = 47.0
prog_e = [("D", "D3"), ("A/C#", "C#3"), ("Bm", "B2"), ("G", "G2")]
for i, (ch, root) in enumerate(prog_e):
    at = t0 + i * 2.0
    pad(CHORDS[ch], at, 2.0, cutoff=1100, gain=0.09, attack=0.8, release=1.3)
    bass(root, at, 1.9, gain=0.07)
    for k, step in enumerate((0, 1, 2, 3)):
        pluck(ARP[ch][(k * 2) % 8], at + step * B, gain=0.055, pan=(-0.25, 0.25)[k % 2], decay=1.3, bright=0.7)
for s in np.arange(47.0, 54.0, 1.0):
    sub_pulse(s, 0.12, f=50)

# ---- 07 REVEAL (55-60): rise, controlled impact, sustained final chord
noise_sweep(EV["riser"], EV["impact"] - EV["riser"], 300, 9000, 0.09, 0.0, rising=True, bus=music)
for k in range(8):  # rising pluck run into the impact
    pluck(["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5"][k], EV["riser"] + 0.55 + k * 0.11, 0.045, (-0.3, 0.3)[k % 2], 0.5)
pad(["D3", "A3", "D4", "F#4", "A4", "E5"], EV["impact"], 4.3, cutoff=2200, gain=0.075, attack=0.12, release=0.0)
bass("D2", EV["impact"], 4.0, gain=0.09)
kick(EV["impact"], 0.42, tail=0.9)
bell("D6", EV["impact"], 0.08, 0.2, decay=3.5)
bell("A5", EV["impact"] + 0.04, 0.06, -0.2, decay=3.5)
bell("F#6", 57.2 + 1.9, 0.04, 0.0, decay=2.0)  # a last glint after the final word

# ================================================================ SOUND DESIGN
pencil(EV["pencilStart"], 3.3, 0.13)
noise_sweep(EV["lineIgnite"] - 0.05, 0.6, 2000, 9000, 0.025, 0.3, rising=False)
whoosh(EV["toWebsite"], 0.8, 0.10)
paper(EV["igcseTitle"] - 0.05, 0.05)
whoosh(EV["igcseCardPick"] + 0.1, 0.4, 0.06, 0.2)
click(EV["igcseCardPick"], 0.12)
whoosh(EV["toClassroom"], 0.7, 0.09)
click(EV["openMaths"], 0.14)
whoosh(EV["openMaths"] + 0.25, 0.5, 0.06, -0.2)
whoosh(EV["toCbc"], 0.8, 0.09)
whoosh(EV["cbcPortal"], 0.6, 0.07, 0.2)
for k in range(4):
    click(EV["cbcGrades"] + k * 0.25, 0.07, -0.3 + k * 0.2, f=2000 + k * 300)
whoosh(EV["toTech"], 0.9, 0.10)
keys(EV["codeTypeStart"], EV["codeTypeEnd"], 0.07)
noise_sweep(EV["previewRender"] - 0.3, 0.5, 1500, 8000, 0.04, 0.0, rising=False)
click(EV["projectSubmit"], 0.14)
chime(EV["projectSubmit"] + 0.05, ["A5", "E6"], 0.06, decay=0.7)
whoosh(EV["toConnected"], 0.6, 0.09)

# The connected workflow: each event has its own voice
click(EV["release"] - 0.02, 0.16)                                  # tutor presses "Release to my students"
noise_sweep(EV["release"], 0.45, 700, 5000, 0.05, 0.3, rising=False)  # work travels out
chime(EV["notify"], ["B5", "F#6"], 0.12, gap=0.09, decay=1.1)      # the notification chime
click(EV["openWork"] - 0.02, 0.12, -0.1)                           # student opens the work
whoosh(EV["openWork"] + 0.15, 0.45, 0.05, -0.2)
paper(EV["attach"], 0.07)                                          # file attached
click(EV["submit"] - 0.02, 0.15)
thock(EV["submit"], 0.24)                                          # tactile submission confirm
chime(EV["submit"] + 0.05, ["D6", "F#6"], 0.06, gap=0.06, decay=0.6)
keys(EV["gradeTypeStart"], EV["gradeTypeEnd"], 0.06)               # tutor types score + feedback
click(EV["gradeRelease"] - 0.02, 0.15)
thock(EV["gradeRelease"], 0.20, f=140)                             # grade stamped
chime(EV["gradeRelease"] + 0.06, ["A5", "D6", "A6"], 0.06, gap=0.05, decay=0.9)
chime(EV["studentGraded"], ["B5", "F#6"], 0.06, gap=0.08, decay=0.8)     # "Homework graded" reaches the student
chime(EV["projectApproved"], ["E6", "A6"], 0.055, gap=0.07, decay=0.7)   # project approved
noise_sweep(EV["toWide"] - 0.1, 0.6, 500, 6000, 0.045, 0.0, rising=False)
noise_sweep(EV["flowToParent"], 1.2, 1200, 7000, 0.03, 0.2, rising=False)
chime(EV["connectedWord"], ["D6"], 0.05, decay=1.2)
whoosh(EV["toParent"], 0.9, 0.08)

chime(EV["parentNotify"], ["B5", "F#6"], 0.085, gap=0.09, decay=1.2)    # same chime family, softer
click(EV["parentOpen"], 0.09)
click(EV["parentProgress"], 0.05, -0.2, f=2600)
click(EV["parentActivity"], 0.06, 0.3, f=2800)
bell("A5", EV["parentActivity"] + 0.05, 0.035, 0.3, decay=1.2, bus=sfx, ratio=2.0)
impact(EV["impact"])

# ================================================================ VOICE-OVER
def line_lufs(x):
    from master_audio import lufs
    return lufs(np.stack([x, x], axis=1) / np.sqrt(2), SR)


for line in TL["vo"]:
    w = wave.open(os.path.join(ROOT, "production", "audio", line["file"]))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    x = hp(x, 90)
    # every line at the same loudness, whatever the TTS engine delivered
    x = x * 10 ** ((-20.0 - line_lufs(x)) / 20)
    place(vo, x, line["at"], 0.0, 1.0)

# ================================================================ MIX
room = make_ir(2.6, 0.9, 1)
small = make_ir(1.0, 0.25, 2)
music = reverb(music, room, 0.28)
sfx = reverb(sfx, small, 0.18)
vo = reverb(vo, small, 0.05)

# Duck the score under the voice (about -7 dB), with smooth attack and release
venv = np.abs(vo[:, 0])
venv = lp(venv, 8, order=1)
venv = np.clip(venv / (venv.max() * 0.25), 0, 1)
duck = 1 - 0.68 * lp(venv, 3, order=1).clip(0, 1)
music *= duck[:, None]

# the busier TECH and workflow sections sit a little lower under the voice
busy = np.ones(N)
busy[int(27 * SR):int(38 * SR)] = 0.72
busy[int(38 * SR):int(47 * SR)] = 0.56
busy = lp(busy, 2, order=1)
music *= busy[:, None]

# settle the score and effects over the last 1.2 s; the voice is never faded
tail = int(1.2 * SR)
end = (np.linspace(1, 0, tail) ** 1.6)[:, None]
music[-tail:] *= end
sfx[-tail:] *= end

mix = music * 0.95 + sfx * 0.8 + vo * 0.62

# Clean head and tail: start from silence, settle to digital silence at 60 s
fade_in = int(0.05 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
last = int(0.05 * SR)
mix[-last:] *= np.linspace(1, 0, last)[:, None]


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


stems = os.path.join(ROOT, "production", "audio", "stems")
os.makedirs(stems, exist_ok=True)
peak = np.abs(mix).max()
g = 0.89 / peak  # leave headroom; loudness is set in master_audio.sh
write(os.path.join(stems, "music.wav"), music * 0.95 * g)
write(os.path.join(stems, "sfx.wav"), sfx * 0.8 * g)
write(os.path.join(stems, "vo.wav"), vo * 0.62 * g)
write(os.path.join(ROOT, "production", "audio", "mix_raw.wav"), mix * g)
print(f"mix written: {DUR}s, pre-gain peak {peak:.2f}")
