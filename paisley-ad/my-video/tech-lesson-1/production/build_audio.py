"""TECH Lesson 1, "What is AI?" Original score, sound design and mix.

Everything is synthesised here (no samples, no library music), so the soundtrack is fully owned.
Every cue is placed on a narration word from src/timeline.json, the same file that drives the
picture, so a sound cannot drift from what it accompanies. Synth helpers come from the Paisley
Studio launch film (../production/build_audio.py).

Usage:  python production/build_audio.py   then   python production/master_audio.py
Writes: production/audio/stems/{music,sfx,vo}.wav and production/audio/mix_raw.wav
"""
import json
import os
import wave

import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SR = 48000
DUR = TL["duration"]
BPM = 100
N = int(SR * DUR)
BEAT = 60.0 / BPM
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




# ---------------------------------------------------------------- lesson timing (same file as the picture)
LINE = {l["id"]: l for l in TL["vo"]}
SC = TL["scenes"]


def L(i):
    return LINE[i]["speech"][0]


def E(i):
    return LINE[i]["speech"][1]


def W(i, word, nth=0):
    hits = [w for w in LINE[i]["words"] if "".join(ch for ch in w[2].lower() if ch.isalnum() or ch == "'") == word.lower()]
    return hits[nth][0]


def ui_tick(at, gain=0.08, pan=0.0, f=3200):
    """A clean, tiny interface tick."""
    t = t_axis(0.05)
    v = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004)
    place(sfx, v, at, pan, gain)


def pop_snd(at, gain=0.10, pan=0.0, f0=420, f1=900):
    """A soft bubble pop for things appearing."""
    t = t_axis(0.12)
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 60))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)
    place(sfx, v, at, pan, gain)


def shutter(at, gain=0.14):
    for off, g in ((0, 1.0), (0.07, 0.7)):
        t = t_axis(0.06)
        v = bp(rng.standard_normal(len(t)), 1500, 8000) * np.exp(-t / 0.008)
        place(sfx, v, at + off, 0.1, gain * g)


def scan(at, dur, gain=0.03):
    """Recognition scan: a gentle filtered sweep with a fine shimmer, not a beep."""
    t = t_axis(dur)
    f = 900 + 1800 * (0.5 - 0.5 * np.cos(2 * np.pi * t / dur * 1.5))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + bp(rng.standard_normal(len(t)), 3000, 9000) * 0.5
    v *= np.sin(np.pi * t / dur) ** 0.6
    place(sfx, v, at, 0.0, gain)


def ping(at, gain=0.08, pan=0.2):
    """Location ping: a soft sonar-like bell with a little echo."""
    for k, g in enumerate((1.0, 0.35, 0.12)):
        bell("E6", at + k * 0.22, gain * g, pan * (1 - 2 * (k % 2)), decay=0.8, bus=sfx, ratio=1.0)


def error(at, gain=0.14):
    """Tasteful 'wrong': two low detuned tones, a dull thud, no buzzer."""
    t = t_axis(0.9)
    v = (np.sin(2 * np.pi * 155 * t) + np.sin(2 * np.pi * 164 * t)) * np.exp(-t / 0.35)
    place(sfx, lp(v, 1200), at, 0, gain)
    thock(at, 0.25, f=90)
    noise_sweep(at - 0.02, 0.35, 4000, 600, 0.03, 0.0, rising=False)


def stamp(at, notes, gain=0.10):
    """Emphasis for a key word: a tactile thock under a short bright chord."""
    thock(at, 0.22, f=150)
    for n in notes:
        bell(n, at + 0.005, gain / len(notes) * 1.6, 0.0, decay=1.4, bus=sfx, ratio=2.0)


def riser(at, dur, gain=0.05):
    noise_sweep(at, dur, 400, 7000, gain, 0.0, rising=True, bus=music)


# ================================================================ SCORE
# 100 BPM, A major / F# minor. The music climbs from curious (01) to warm (03) to driving (07),
# drops away for "AI can be wrong" (08), and resolves into the TECH sting (11).
B = BEAT
BAR = 4 * B
CH = {
    "F#m": (["F#3", "A3", "C#4", "E4"], "F#2", ["F#3", "C#4", "A4", "E4", "F#4", "C#4", "A4", "C#5"]),
    "D": (["D3", "F#3", "A3", "C#4"], "D2", ["D3", "A3", "F#4", "C#4", "D4", "A3", "F#4", "A4"]),
    "A": (["A3", "C#4", "E4", "B4"], "A2", ["A3", "E4", "C#5", "B4", "A4", "E4", "C#5", "E5"]),
    "E": (["E3", "G#3", "B3", "F#4"], "E2", ["E3", "B3", "G#4", "F#4", "E4", "B3", "G#4", "B4"]),
    "Bm": (["B3", "D4", "F#4", "A4"], "B2", ["B3", "F#4", "D5", "A4", "B4", "F#4", "D5", "F#5"]),
    "C#m": (["C#4", "E4", "G#4", "B4"], "C#3", ["C#4", "G#4", "E5", "B4", "C#5", "G#4", "E5", "G#5"]),
}
PROG = ["F#m", "D", "A", "E"]
BRIGHT = ["A", "E", "F#m", "D"]


def section(t0, t1, prog, *, pad_gain=0.07, cutoff=1200, arp=None, arp_gain=0.04, bass_style="whole",
            kick_on=False, hats=False, clap_on=False, shaker_on=False, bars_per_chord=1, pulse=False):
    """Lay a bed from t0 to t1, chords on the bar grid."""
    step = BAR * bars_per_chord
    n = int(np.ceil((t1 - t0) / step))
    for i in range(n):
        at = t0 + i * step
        dur = min(step, t1 - at)
        if dur <= 0.05:
            break
        ch = CH[prog[i % len(prog)]]
        pad(ch[0], at, dur, cutoff=cutoff, gain=pad_gain, attack=min(0.6, dur / 3), release=0.9)
        if bass_style == "whole":
            bass(ch[1], at, dur * 0.95, gain=0.09)
        elif bass_style == "eighths":
            for e in range(int(dur / (B / 2))):
                bass(ch[1], at + e * B / 2, B / 2 * 0.8, gain=0.11 if e % 2 == 0 else 0.08)
        elif bass_style == "pulse":
            for q in range(int(dur / B)):
                bass(ch[1], at + q * B, B * 0.6, gain=0.08)
        if arp:
            per = int(dur / (B / 2)) if arp != "sixteenth" else int(dur / (B / 4))
            for k in range(per):
                note = ch[2][k % 8]
                if arp == "pluck":
                    pluck(note, at + k * B / 2, gain=arp_gain, pan=(-0.35, 0.35)[k % 2], decay=0.6)
                elif arp == "marimba" and k % 3 != 2:
                    marimba(note, at + k * B / 2, gain=arp_gain, pan=(-0.4, 0.4)[k % 2])
                elif arp == "sixteenth":
                    synth_arp(note, at + k * B / 4, B / 4 * 0.9, gain=arp_gain + 0.01 * (k % 4 == 0), cutoff=cutoff, pan=0.3 * np.sin(k))
        for q in range(int(round(dur / B))):
            s = at + q * B
            if s >= t1 - 0.05:
                break
            if kick_on and (kick_on == "four" or q % 2 == 0):
                kick(s, 0.32)
            if pulse:
                sub_pulse(s, 0.12, f=46)
            if hats:
                hat(s + B / 2, 0.03)
            if clap_on and q % 2 == 1:
                clap(s, 0.06)
            if shaker_on:
                shaker(s + B / 4, 0.022)
                shaker(s + 3 * B / 4, 0.03)


def bar_after(t, origin):
    """The next bar line at or after t, on a grid that starts at origin."""
    return origin + np.ceil((t - origin) / BAR - 1e-6) * BAR


# ---- 01 the hook: curious, sparse, a heartbeat; each everyday thing gets its own sound
a, b = SC["s01"]
pad(["F#2", "C#3", "A3"], 0.0, b + 0.5, cutoff=500, gain=0.10, attack=2.0, release=1.0)
for s in np.arange(0.3, b, 2 * B):
    sub_pulse(s, 0.22)
bell("C#6", W("s01a", "AI"), 0.07, 0.15, decay=2.6)
bell("A5", W("s01a", "AI") + 0.03, 0.05, -0.15, decay=2.6)
noise_sweep(W("s01a", "AI") - 0.5, 0.5, 600, 6000, 0.03, 0.0, rising=True)
m0 = L("s01b") - 0.2
section(m0, b, ["F#m", "D"], pad_gain=0.04, cutoff=900, arp="pluck", arp_gain=0.03, bass_style="pulse")
for s in np.arange(m0, b, B / 2):
    hat(s, 0.012)
# everyday things
ui_tick(W("s01b", "phone"), 0.10); scan(W("s01b", "phone") + 0.05, 0.6, 0.02)
pop_snd(W("s01b", "videos"), 0.07); ui_tick(W("s01b", "recommended"), 0.07, 0.2)
ping(W("s01b", "map"), 0.06)
shutter(W("s01b", "camera"), 0.10)
chime(W("s01b", "voice"), ["E6", "A6"], 0.04, gap=0.06, decay=0.5)
pluck("C#5", W("s01b", "music"), 0.05, 0.2, decay=0.6); pluck("E5", W("s01b", "music") + 0.12, 0.04, -0.2, decay=0.6)
pop_snd(W("s01b", "email"), 0.07, f0=600, f1=1200)
for k in range(7):  # the lines connect to the AI core
    ui_tick(W("s01c", "used") + k * 0.09, 0.05, -0.6 + k * 0.2, f=2400 + k * 180)
bell("A5", W("s01c", "AI"), 0.06, 0.0, decay=2.0)
whoosh(b, 0.7, 0.07)

# ---- 02 definition: a light groove starts
a, b = SC["s02"]
section(a, b, PROG, pad_gain=0.06, cutoff=1300, arp="pluck", arp_gain=0.035, bass_style="whole", pulse=True)
for k, n in enumerate(["A4", "C#5", "E5"]):
    pluck(n, W("s02b", "Artificial") + k * 0.05, 0.04, -0.3 + k * 0.3, decay=0.8)
keys(W("s02b", "Artificial"), W("s02b", "Artificial") + 0.45, 0.03)
keys(W("s02b", "Intelligence"), W("s02b", "Intelligence") + 0.5, 0.03)
ui_tick(W("s02c", "technology"), 0.06)
stamp(W("s02d", "recognizing"), ["C#6"], 0.06)
scan(W("s02d", "recognizing") + 0.05, 0.85, 0.02)
ui_tick(W("s02d", "picture"), 0.08)
stamp(W("s02e", "Predicting"), ["E6"], 0.06)
keys(W("s02e", "Predicting") - 0.2, W("s02e", "Predicting") + 0.5, 0.04)
chime(W("s02e", "next"), ["B5"], 0.04, decay=0.6)
stamp(W("s02f", "creating"), ["A6"], 0.06)
noise_sweep(W("s02f", "creating"), 1.1, 800, 6000, 0.025, 0.2, rising=False)
whoosh(b, 0.7, 0.07)

# ---- 03 the robot and the dogs: warm, playful marimba; small processing sounds
a, b = SC["s03"]
j = L("s03j") - 0.3
section(a, j, ["A", "E", "F#m", "D"], pad_gain=0.055, cutoff=1500, arp="marimba", arp_gain=0.06, bass_style="pulse", shaker_on=True)
section(j, b, ["D", "A", "E", "F#m"], pad_gain=0.06, cutoff=2000, arp="pluck", arp_gain=0.04, bass_style="eighths", kick_on=True, hats=True)
pop_snd(W("s03b", "robot"), 0.07, f0=300, f1=700)
chime(W("s03b", "robot") + 0.2, ["A5", "E6"], 0.03, gap=0.07, decay=0.5)
ex = [(W("s03c", "picture") - 0.2, W("s03c", "dog")), (W("s03d", "another") - 0.1, W("s03d", "dog")),
      (W("s03e", "another") - 0.1, W("s03e", "dog")), (W("s03f", "cats") - 0.2, W("s03f", "cat", 0)),
      (W("s03f", "cat", 0) + 0.38, W("s03f", "cat", 1))]
for k, (ap, lb) in enumerate(ex):
    paper(ap, 0.05)
    ui_tick(lb, 0.07, 0.1, f=2600 + k * 120)
    whoosh(lb + 0.6, 0.35, 0.03, 0.4)
    marimba(["E5", "F#5", "A5", "C#5", "B4"][k], lb + 0.9, 0.05, 0.3)
pop_snd(W("s03g", "new") - 0.2, 0.08, f0=350, f1=800)
# the robot thinking: soft ticking, then the lines connect
for s in np.arange(E("s03g") - 0.3, W("s03h", "says"), 0.16):
    ui_tick(s, 0.025, 0.4, f=1800 + 400 * ((s * 6) % 2))
for k in range(3):
    ui_tick(E("s03g") + 0.4 + k * 0.25, 0.05, -0.3 + k * 0.3, f=2200 + k * 300)
chime(W("s03h", "dog"), ["A5", "C#6", "E6"], 0.08, gap=0.06, decay=1.0)
thock(W("s03i", "rule") + 0.2, 0.12, f=120)
noise_sweep(W("s03i", "rule") + 0.15, 0.3, 3000, 900, 0.025, 0.4, rising=False)
for k in range(3):
    pluck(["E5", "A5", "C#6"][k], W("s03i", "pattern") + k * 0.08, 0.03, 0, decay=0.5)
riser(L("s03j") - 0.2, 0.8, 0.04)
for k in range(14):  # many examples arriving
    ui_tick(W("s03j", "lots") + k * 0.06, 0.02 + 0.002 * k, (k % 5 - 2) * 0.25, f=2000 + (k % 7) * 260)
noise_sweep(W("s03j", "patterns") - 0.1, 1.2, 600, 4000, 0.03, 0.0, rising=False)
stamp(L("s03k") - 0.05, ["E6", "A6"], 0.05)
whoosh(b, 0.7, 0.07)

# ---- 04 patterns: minimal, then a huge flow of information
a, b = SC["s04"]
f0 = L("s04f") - 0.4
pad(["F#3", "C#4", "A4"], a, f0 - a + 0.5, cutoff=700, gain=0.06, attack=0.8, release=0.8)
for s in np.arange(a, f0, B):
    sub_pulse(s, 0.12, f=46)
cues = [W("s04b", n) for n in ("two", "four", "six", "eight")]
for k, c in enumerate(cues):
    marimba(["A4", "C#5", "E5", "F#5"][k], c, 0.10, -0.3 + k * 0.2)
    ui_tick(c, 0.05)
pop_snd(W("s04c", "what") - 0.2, 0.06)
for k, s in enumerate(np.arange(E("s04c"), W("s04d", "ten") - 0.15, 0.4)):  # thinking time: a soft clock
    ui_tick(s, 0.035, 0.0, f=1500 if k % 2 else 1900)
chime(W("s04d", "ten"), ["A5", "C#6", "E6", "A6"], 0.09, gap=0.05, decay=1.2)
thock(W("s04d", "ten"), 0.14, f=170)
for k in range(4):
    bell(["A5", "C#6", "E6", "A6"][k], W("s04e", "pattern") + k * 0.07, 0.025, (k - 1.5) * 0.3, decay=1.2, bus=sfx, ratio=2.0)
riser(f0 - 0.6, 1.2, 0.05)
section(f0 + 0.6, b, ["F#m", "D", "A", "E"], pad_gain=0.06, cutoff=1500, arp="sixteenth", arp_gain=0.022, bass_style="eighths", pulse=True)
# the information flow: an airy, evolving texture that thickens with "millions"
tt = t_axis(b - f0)
flow = bp(rng.standard_normal((len(tt), 2)), 2500, 9000) * (0.4 + 0.6 * np.sin(np.pi * np.clip(tt / (b - f0), 0, 1)))[:, None]
place(sfx, flow * 0.012, f0)
for k in range(28):
    ui_tick(W("s04f", "millions") + k * 0.045, 0.012 + 0.0015 * k, rng.uniform(-0.6, 0.6), f=rng.uniform(1800, 4200))
for w in ("photos", "words", "sounds", "numbers"):
    pop_snd(W("s04f", w), 0.06, pan=rng.uniform(-0.5, 0.5))
noise_sweep(W("s04g", "find") - 0.4, 1.8, 6000, 500, 0.04, 0.0, rising=False)  # chaos settling into order
for k in range(4):
    ui_tick(W("s04g", "find") + 1.2 + k * 0.12, 0.05, (k - 1.5) * 0.4, f=2400 + k * 200)
stamp(W("s04g", "patterns"), ["C#6", "E6"], 0.06)
whoosh(b, 0.7, 0.07)

# ---- 05 not magic: building, a shimmer of "magic", then the music stops dead
a, b = SC["s05"]
gm = L("s05g") - 0.2
section(a, gm, ["D", "A", "E", "F#m"], pad_gain=0.06, cutoff=1700, arp="pluck", arp_gain=0.035, bass_style="eighths", kick_on="four", hats=True)
makes = [W("s05b", "becomes"), W("s05c", "becomes"), W("s05d", "fills"), W("s05e", "becomes"), W("s05f", "becomes")]
for k, (bl, mk) in enumerate(zip([W("s05b", "blank"), W("s05c", "empty"), W("s05d", "empty"), W("s05e", "blank"), W("s05f", "silent")], makes)):
    whoosh(bl, 0.45, 0.05, 0.3)
    if k == 0:
        noise_sweep(mk, 1.1, 1200, 8000, 0.03, 0.0, rising=False)
        bell("E6", mk + 1.0, 0.04, 0.2, decay=1.0, bus=sfx, ratio=2.0)
    if k == 1:
        pencil(mk, mk + 1.3, 0.06)
    if k == 2:
        keys(mk - 0.1, mk + 1.4, 0.05)
    if k == 3:
        for d in (0, 0.25, 0.4, 0.55, 0.75):
            pop_snd(mk + d, 0.05, pan=rng.uniform(-0.4, 0.4), f0=350 + d * 600, f1=900 + d * 600)
    if k == 4:
        for i, n in enumerate(["A5", "C#6", "B5", "E5", "F#5", "C#6", "E6", "A5"]):
            pluck(n, mk + i * 0.2, 0.05, (-0.3, 0.3)[i % 2], decay=0.5, bright=1.3)
# "it can look like magic": a glittering run over a held chord
pad(["D4", "F#4", "A4", "C#5", "E5"], gm, W("s05h", "isn't") - gm, cutoff=2600, gain=0.06, attack=0.4, release=0.15)
for i in range(16):
    bell(["A5", "C#6", "E6", "F#6", "A6", "C#7"][i % 6], W("s05g", "magic") - 0.5 + i * 0.07, 0.022, np.sin(i) * 0.6, decay=1.4, bus=sfx, ratio=3.0)
# "but it isn't magic": a short tape-stop, then near silence
ni = W("s05h", "isn't")
tt = t_axis(0.5)
fd = 220 * np.exp(-tt * 6)
place(sfx, np.sin(2 * np.pi * np.cumsum(fd) / SR) * np.exp(-tt * 4), ni - 0.05, 0, 0.12)
thock(ni + 0.02, 0.18, f=80)
noise_sweep(ni, 0.9, 6000, 300, 0.035, 0.0, rising=False)
ts = L("s05i") - 0.1
section(ts, b, ["A", "E", "F#m", "D"], pad_gain=0.055, cutoff=1400, arp="pluck", arp_gain=0.03, bass_style="pulse", pulse=True)
stamp(W("s05i", "tool"), ["A5", "E6"], 0.07)
for k in range(3):
    pop_snd(W("s05i", "people") - 0.2 + k * 0.12, 0.05, (k - 1) * 0.5)
noise_sweep(W("s05i", "information") - 0.4, 1.6, 1500, 6000, 0.02, -0.5, rising=False)
for k in range(5):
    ui_tick(W("s05i", "generate") - 0.1 + k * 0.12, 0.05, 0.4, f=2400 + k * 250)
chime(W("s05i", "help"), ["C#6", "E6"], 0.05, gap=0.07, decay=0.8)
whoosh(b, 0.7, 0.07)

# ---- 06 AI around you: steady groove; each app gets its own honest sound
a, b = SC["s06"]
section(a, b, ["F#m", "D", "A", "E"], pad_gain=0.05, cutoff=1500, arp="pluck", arp_gain=0.028, bass_style="eighths", kick_on=True, hats=True, shaker_on=True)
noise_sweep(L("s06a") - 0.3, 0.6, 300, 1200, 0.03, 0.0, rising=False)  # film projector air
whoosh(W("s06a", "everyday") + 0.1, 0.6, 0.07)
scan(W("s06b", "phone") - 0.1, 1.2, 0.025)
click(W("s06b", "face") + 0.0, 0.10)
chime(W("s06b", "face") + 0.05, ["A5", "E6"], 0.06, gap=0.06, decay=0.7)
for k in range(3):
    ui_tick(L("s06c") + 0.2 + k * 0.15, 0.04, 0.2, f=2600)
pop_snd(W("s06c", "recommends"), 0.08, f0=500, f1=1100)
noise_sweep(W("s06d", "traffic") - 0.2, 0.9, 900, 3000, 0.02, -0.2, rising=False)
whoosh(W("s06d", "faster"), 0.8, 0.05, 0.3)
ping(W("s06d", "route"), 0.07)
for k in range(4):
    pluck(["E5", "A5", "C#6", "E6"][k], W("s06e", "pick") - 0.1 + k * 0.15, 0.035, (k - 1.5) * 0.3, decay=0.5)
thock(W("s06f", "spam") - 0.05, 0.10, f=130)
whoosh(W("s06f", "spam") + 0.45, 0.45, 0.07, 0.5)
ui_tick(W("s06f", "see"), 0.05, 0.4)
shutter(W("s06g", "camera"), 0.10)
ui_tick(W("s06g", "face") - 0.1, 0.06); ui_tick(W("s06g", "sunset") - 0.1, 0.06)
chime(W("s06h", "talk"), ["C#6", "A6"], 0.06, gap=0.08, decay=0.6)  # assistant listening
keys(W("s06h", "turning") - 0.2, W("s06h", "understand") + 0.2, 0.025)
whoosh(L("s06i") - 0.2, 0.7, 0.06)
for k in range(7):
    pop_snd(L("s06i") + 0.1 + k * 0.08, 0.035, -0.6 + k * 0.2, f0=400 + k * 60, f1=900 + k * 80)
stamp(W("s06i", "around"), ["A5", "C#6", "E6"], 0.06)
whoosh(b, 0.7, 0.07)

# ---- 07 AI can create: the energy lifts. Full groove, every verb lands on the beat it is spoken on
a, b = SC["s07"]
riser(a - 0.8, 1.0, 0.05)
section(a, b, ["A", "E", "F#m", "D"], pad_gain=0.06, cutoff=2400, arp="sixteenth", arp_gain=0.025, bass_style="eighths", kick_on="four", hats=True, clap_on=True)
noise_sweep(L("s07a") + 0.2, 1.2, 600, 7000, 0.03, 0.0, rising=False)
verbs = [W("s07b", "brainstorm"), W("s07c", "write"), W("s07c", "research"), W("s07d", "code"), W("s07d", "design"),
         W("s07e", "images"), W("s07e", "music"), W("s07f", "problems") - 0.15]
for k, v in enumerate(verbs):
    whoosh(v + 0.05, 0.3, 0.05, (-0.4, 0.4)[k % 2])
    pluck(["A4", "C#5", "E5", "F#5", "A5", "B5", "C#6", "E6"][k], v, 0.06, (-0.3, 0.3)[k % 2], decay=0.5, bright=1.4)
    pop_snd(v + 0.02, 0.05, f0=500 + k * 40, f1=1000 + k * 60)
keys(W("s07d", "code") + 0.05, W("s07d", "code") + 0.5, 0.03)
noise_sweep(W("s07g", "reach") - 0.6, 0.8, 4000, 800, 0.03, 0.0, rising=False)
riser(W("s07g", "within") - 1.0, 1.0, 0.05)
chime(W("s07g", "within"), ["A5", "C#6", "E6", "A6"], 0.07, gap=0.06, decay=1.4)
pop_snd(W("s07g", "within") + 0.4, 0.06, f0=600, f1=1300)
whoosh(b, 0.7, 0.06)

# ---- 08 AI can be wrong: the music falls away to a low pad; a clear, tasteful error moment
a, b = SC["s08"]
s8 = L("s08g") - 0.3
pad(["F#2", "C#3", "A3"], a, s8 - a, cutoff=450, gain=0.09, attack=1.2, release=0.8)
keys(L("s08c") - 0.05, E("s08c"), 0.05)
click(E("s08c") + 0.02, 0.08)  # send
for s in np.arange(E("s08c") + 0.15, E("s08c") + 0.85, 0.2):
    ui_tick(s, 0.025, -0.3, f=1700)
keys(E("s08c") + 0.85, E("s08c") + 1.6, 0.035)
chime(W("s08d", "sounds") - 0.1, ["E6"], 0.05, decay=0.6)  # the "100% sure" badge
wr = W("s08e", "wrong")
error(wr, 0.12)
eight = W("s08e", "eight")
for k in range(8):  # counting the legs
    ui_tick(eight - 0.5 + k * (1.1 / 8), 0.045, (-1) ** k * 0.3, f=1800 + k * 140)
chime(eight + 0.65, ["A5", "C#6"], 0.06, gap=0.06, decay=0.8)
impact_t = L("s08f") - 0.25
tt = t_axis(2.5)
place(sfx, np.tanh(np.sin(2 * np.pi * (40 + 40 * np.exp(-tt * 10)) * tt) * np.exp(-tt / 0.8) * 1.3), impact_t, 0, 0.22)
noise_sweep(impact_t - 0.5, 0.5, 300, 3000, 0.03, 0.0, rising=True)
thock(W("s08g", "copy") - 0.2, 0.10, f=110)
section(s8, b, ["D", "A", "E", "F#m"], pad_gain=0.055, cutoff=1300, arp="pluck", arp_gain=0.028, bass_style="pulse", pulse=True)
for k, (line, word) in enumerate([("s08h", "ask"), ("s08i", "check"), ("s08j", "think"), ("s08k", "decide")]):
    stamp(W(line, word) - 0.06, [["A5", "C#6"], ["C#6", "E6"], ["E6", "A6"], ["A6", "C#7"]][k], 0.08)
    kick(W(line, word) - 0.06, 0.25, bus=sfx, tail=0.4)
chime(W("s08l", "judgment") - 0.2, ["A5", "C#6", "E6", "A6"], 0.05, gap=0.07, decay=1.6)
whoosh(b, 0.7, 0.07)

# ---- 09 AI is not you: warm, call-and-response (digital blip for AI, warm pluck for YOU)
a, b = SC["s09"]
section(a, b - 1.0, ["F#m", "D", "A", "E"], pad_gain=0.06, cutoff=1300, bass_style="pulse", pulse=True)
whoosh(L("s09a") - 0.2, 0.7, 0.06)
for line, ai, you in (("s09b", "generates", "decide"), ("s09c", "suggests", "judge"), ("s09d", "helps", "create")):
    synth_arp("E5", W(line, ai), 0.18, gain=0.06, cutoff=3000, pan=-0.4)
    synth_arp("A5", W(line, ai) + 0.14, 0.2, gain=0.05, cutoff=3000, pan=-0.4)
    for d in (0, 0.08, 0.16):
        ui_tick(W(line, ai) + 0.3 + d, 0.035, -0.5, f=2500)
    pluck("C#5", W(line, you), 0.08, 0.4, decay=1.0, bright=0.8)
    pluck("A5", W(line, you) + 0.04, 0.06, 0.4, decay=1.2, bright=0.8)
whoosh(W("s09b", "decide") + 0.1, 0.5, 0.04, 0.4)
error(W("s09e", "replace") + 0.05, 0.06)
riser(W("s09f", "make") - 0.2, E("s09f") - W("s09f", "make") + 0.2, 0.04)
for i in range(8):
    bell(["A5", "C#6", "E6", "A6"][i % 4], W("s09f", "capable") - 0.3 + i * 0.06, 0.03, np.sin(i) * 0.5, decay=1.6, bus=sfx, ratio=2.0)
yp = W("s09g", "plus")
whoosh(L("s09g") + 0.2, 0.5, 0.06)
kick(yp - 0.08, 0.35, bus=sfx, tail=0.7)
pad(["A2", "E3", "A3", "C#4", "E4"], yp - 0.08, b - yp + 0.3, cutoff=2000, gain=0.07, attack=0.05, release=0.6)
bell("A5", yp - 0.06, 0.06, 0.0, decay=2.2)
bell("E6", yp, 0.04, 0.3, decay=2.2)

# ---- 10 what could you create: from one point of light to a constellation of ideas, then let it breathe
a, b = SC["s10"]
pad(["F#2", "C#3", "A3"], a, W("s10b", "website") - a, cutoff=500, gain=0.08, attack=1.5, release=1.0)
bell("C#6", W("s10a", "space") + 0.1, 0.04, 0.0, decay=3.0)
q = L("s10c")
section(W("s10b", "website") - 0.3, q - 0.2, ["D", "A", "E", "F#m"], pad_gain=0.06, cutoff=2000, arp="pluck", arp_gain=0.03, bass_style="eighths", kick_on=True, hats=True, shaker_on=True)
ideas = ["website", "game", "comic", "blog", "poster", "research", "music", "business", "invention", "assistant", "special"]
scale = ["A4", "B4", "C#5", "E5", "F#5", "A5", "B5", "C#6", "E6", "F#6", "A6"]
for k, w in enumerate(ideas):
    at = W("s10b", w) - 0.1
    pop_snd(at, 0.05, pan=np.cos(k) * 0.6, f0=420 + k * 30, f1=900 + k * 50)
    bell(scale[k], at + 0.02, 0.03, np.cos(k) * 0.6, decay=1.2, bus=sfx, ratio=2.0)
riser(q - 1.3, 1.3, 0.06)
noise_sweep(q - 0.1, 1.6, 6000, 300, 0.06, 0.0, rising=False)  # the reveal whoosh
kick(q - 0.05, 0.3, bus=sfx, tail=1.0)
pad(["D3", "A3", "D4", "F#4", "A4", "E5"], q - 0.05, b - q + 0.4, cutoff=1800, gain=0.07, attack=0.3, release=0.8)
bass("D2", q - 0.05, b - q, gain=0.06)
for i in range(6):
    bell(["E6", "F#6", "A6", "B6", "C#7", "E7"][i], q + 1.0 + i * 0.45, 0.018, np.sin(i * 1.7) * 0.6, decay=2.0, bus=sfx, ratio=2.0)

# ---- 11 welcome to TECH: the sting
a, b = SC["s11"]
impact(a + 0.02)
bell("A5", a + 0.05, 0.07, 0.2, decay=3.0)
bell("E6", a + 0.08, 0.05, -0.2, decay=3.0)
pad(["A2", "E3", "A3", "C#4", "E4", "B4"], a, b - a, cutoff=2400, gain=0.07, attack=0.1, release=0.0)
bass("A1", a, b - a - 0.5, gain=0.08)
stamp(W("s11a", "tech"), ["A5", "C#6", "E6"], 0.07)
for k, w in enumerate(("learn", "create", "build")):
    at = W("s11b", w) - 0.06
    kick(at, 0.20, bus=sfx, tail=0.5)
    stamp(at, [["C#6", "E6"], ["E6", "A6"], ["A6", "C#7", "E7"]][k], 0.06)
pencil(L("s11c") + 0.6, L("s11c") + 1.3, 0.05)  # the underline being drawn
bell("A6", E("s11c") + 0.3, 0.03, 0.0, decay=2.0)

# ---- scene transitions: a soft whoosh at every cut (one per scene above), nothing more

# ================================================================ VOICE-OVER
def line_lufs(x):
    from master_audio import lufs
    return lufs(np.stack([x, x], axis=1) / np.sqrt(2), SR)


for line in TL["vo"]:
    w = wave.open(os.path.join(ROOT, "production", "audio", "vo", line["file"]))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    x = hp(x, 80)
    x = x * 10 ** ((-19.0 - line_lufs(x)) / 20)  # every line at the same loudness
    place(vo, x, line["at"], 0.0, 1.0)

# ================================================================ MIX
room = make_ir(2.6, 0.9, 1)
small = make_ir(1.0, 0.25, 2)
music = reverb(music, room, 0.26)
sfx = reverb(sfx, small, 0.16)
vo = reverb(vo, small, 0.04)

# Duck the score under the voice (about -9 dB) with smooth attack and release; the narrator always wins
venv = np.abs(vo[:, 0])
venv = lp(venv, 8, order=1)
venv = np.clip(venv / (np.percentile(venv, 99.5) * 0.25), 0, 1)
duck = 1 - 0.7 * lp(venv, 3, order=1).clip(0, 1)
music *= duck[:, None]
sfx *= (1 - 0.25 * lp(venv, 3, order=1).clip(0, 1))[:, None]

tail = int(1.5 * SR)
end = (np.linspace(1, 0, tail) ** 1.4)[:, None]
music[-tail:] *= end
sfx[-tail:] *= end

# the driving "AI can create" section sits a little lower under the voice
busy = np.ones(N)
busy[int(SC["s07"][0] * SR):int(SC["s07"][1] * SR)] = 0.72
music *= lp(busy, 2, order=1)[:, None]

mix = music * 0.64 + sfx * 0.72 + vo * 0.62
fade = int(0.05 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


stems = os.path.join(ROOT, "production", "audio", "stems")
os.makedirs(stems, exist_ok=True)
write(os.path.join(stems, "music.wav"), music * 0.64)
write(os.path.join(stems, "sfx.wav"), sfx * 0.72)
write(os.path.join(stems, "vo.wav"), vo * 0.62)
peak = np.abs(mix).max()
write(os.path.join(ROOT, "production", "audio", "mix_raw.wav"), mix / max(1.0, peak / 0.95))
print(f"mix written, {DUR:.1f}s, peak {peak:.2f}")
