"""Paisley TECH Festive Creator Bootcamp advertisement. Original score, sound design and mix.

Everything here is synthesised from scratch (no samples, no third-party music), so the soundtrack
is fully owned and cleared for commercial use. Event times come from src/timeline.json, the same
file that drives the picture, so every sound effect lands on its visual event.

Usage:  python production/build_audio.py
Writes: production/audio/stems/{music,sfx,vo}.wav and production/audio/mix_raw.wav
        (production/master_audio.py then loudness-normalises it into public/audio/soundtrack.wav)
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


def impact(at, gain=1.0, tail=1.1):
    t = t_axis(tail * 3.2)
    boom = np.sin(2 * np.pi * (36 + 50 * np.exp(-t * 9)) * t) * np.exp(-t / tail)
    place(sfx, np.tanh(boom * 1.4), at, 0, 0.40 * gain)
    crack = bp(rng.standard_normal(len(t)), 200, 9000) * np.exp(-t / (tail * 0.32))
    place(sfx, crack, at, 0, 0.10 * gain)



def W(line_id, k):
    """Start of word k in a narration line."""
    return next(l for l in TL["vo"] if l["id"] == line_id)["words"][k][0]


# ================================================================ SCORE
# 104 BPM in G major. The grid is anchored to the impact on "created", so the beat drops exactly there.
B = BEAT
BAR = 4 * B
G0 = EV["impact"]
E8 = B / 2
PROG = ["G", "D", "Em", "C"]
BASS = {"G": "G2", "D": "D3", "Em": "E3", "C": "C3"}
CHORD = {"G": ["G3", "B3", "D4", "A4"], "D": ["F#3", "A3", "D4", "E4"], "Em": ["G3", "B3", "E4", "F#4"], "C": ["G3", "C4", "E4", "A4"]}
ARP = {"G": ["G4", "D5", "B4", "D5", "A4", "D5", "B4", "G5"], "D": ["F#4", "D5", "A4", "D5", "E4", "D5", "A4", "F#5"],
       "Em": ["E4", "B4", "G4", "B4", "F#4", "B4", "G4", "E5"], "C": ["E4", "C5", "G4", "C5", "A4", "C5", "G4", "E5"]}
HOOK = {"G": ["G5", "B5", "D6", "B5"], "D": ["A5", "F#5", "D6", "A5"], "Em": ["B5", "G5", "E5", "G5"], "C": ["C6", "A5", "E5", "G5"]}


def section(s):
    """Energy of the score at time s: 0 = silent, 1 = warm and quiet ... 4 = full."""
    if s < EV["stop"]:
        return 1
    if s < G0:
        return 0
    if s < EV["game"]:
        return 3
    if s < EV["collapse"]:
        return 4
    if s < EV["logo"]:
        return 1
    if s < EV["aiOptions"]:
        return 3
    if s < EV["doors"]:
        return 2
    if s < SCENE["s10"][0]:
        return 3
    if s < EV["tools2"]:
        return 1
    if s < EV["offer"]:
        return 2
    if s < EV["endCard"]:
        return 4
    if s < EV["letThem"]:
        return 3
    return 4


SCENE = TL["scenes"]
n0 = int(np.floor((0 - G0) / BAR)) - 1
n1 = int(np.ceil((DUR - G0) / BAR))
for n in range(n0, n1):
    at = G0 + n * BAR
    ch = PROG[n % 4]
    for k in range(8):  # eighth notes
        s = at + k * E8
        if s < 0 or s >= DUR - 0.05:
            continue
        en = section(s)
        beat = k % 2 == 0
        if en == 0:
            continue
        if k == 0:
            pad(CHORD[ch], max(s, 0), BAR, cutoff={1: 800, 2: 1100, 3: 1700, 4: 2400}[en], gain={1: 0.085, 2: 0.08, 3: 0.075, 4: 0.075}[en], attack=0.5 if en < 3 else 0.2, release=0.9)
        if en == 1:  # felt piano and a bell line
            if k in (0, 3, 6):
                pluck(ARP[ch][k], s, 0.055, (-0.25, 0.25)[k % 2], decay=1.5, bright=0.65)
            if k == 0:
                pluck(BASS[ch][0] + "3" if ch != "D" else "D3", s, 0.06, 0, decay=2.0, bright=0.5)
                bell(HOOK[ch][0], s + E8 * 2, 0.022, 0.2, decay=2.2)
        if en >= 2:
            pluck(ARP[ch][k], s, 0.04 + 0.012 * en, (-0.35, 0.35)[k % 2], decay=0.55, bright=1.2)
            bass(BASS[ch], s, E8 * 0.85, gain=(0.10 if beat else 0.075) * (0.7 + 0.15 * en))
        if en >= 3:
            if beat:
                kick(s, 0.30 + 0.05 * (en - 3), tail=0.3)
            hat(s + E8 / 2, 0.022 + 0.01 * (en - 3))
            for q in (0, 0.5):  # sleigh-bell shaker, felt rather than heard
                shaker(s + q * E8 + 0.008, 0.03 + 0.012 * (en - 3))
            if k in (2, 6):
                clap(s, 0.05 + 0.03 * (en - 3))
        if en == 4:
            bell(HOOK[ch][k % 4], s, 0.034, (-0.3, 0.3)[(k // 2) % 2], decay=1.1)
            synth_arp(ARP[ch][(k + 3) % 8], s + E8 / 2, E8 * 0.45, gain=0.022, cutoff=1500 + 2200 * min(1, max(0, (s - EV["game"]) / 7)), pan=0.3 * np.sin(k))

# ---- the opening: music box over the room, thinning as the feed speeds up
for i, (n, s) in enumerate(zip(["D6", "B5", "G5", "A5", "B5", "D6", "E6", "D6"], np.arange(0.3, 3.0, 0.42))):
    bell(n, s, 0.04 - i * 0.002, (-0.25, 0.25)[i % 2], decay=2.0)

# ---- the riser into the impact
noise_sweep(G0 - 0.62, 0.62, 300, 9000, 0.12, 0.0, rising=True, bus=music)
for k in range(5):
    pluck(["D4", "G4", "B4", "D5", "G5"][k], G0 - 0.45 + k * 0.08, 0.05, (-0.3, 0.3)[k % 2], 0.5)

# ---- "It needs someone to say..."; rise into "Let's see what you can make."
for s in np.arange(EV["someone"], EV["letsSee"], B):
    sub_pulse(s, 0.13, f=49)
noise_sweep(EV["letsSee"] - 0.8, 0.85, 400, 6500, 0.04, 0.0, rising=True, bus=music)
pad(["G3", "D4", "G4", "B4", "D5"], EV["letsSee"], 1.5, cutoff=1800, gain=0.09, attack=0.3, release=0.8)
for k, n in enumerate(["G4", "B4", "D5", "G5", "B5", "D6"]):
    bell(n, W("s06e", k), 0.035, (-0.3, 0.3)[k % 2], decay=1.5)

# ---- "I made that": the emotional top of the film
pad(["G3", "D4", "G4", "B4", "D5", "A5"], EV["madeThat"], 1.0, cutoff=2600, gain=0.11, attack=0.05, release=0.7)
for k, n in enumerate(["G5", "B5", "D6", "G6"]):
    bell(n, EV["madeThat"] + k * 0.07, 0.06, (-0.3, 0.3)[k % 2], decay=2.4)
kick(EV["madeThat"], 0.36, tail=0.7)


# ---- creation time, and the final chord
kick(EV["creationTime"], 0.28, tail=0.4)
for k, n in enumerate(["D6", "G6", "B6"]):
    bell(n, EV["creationTime"] + k * 0.05, 0.05, (-0.3, 0.3)[k % 2], decay=2)
pad(["G2", "D3", "G3", "B3", "D4", "G4", "B4"], EV["letThem"], DUR - EV["letThem"], cutoff=2800, gain=0.12, attack=0.08, release=0.0)
bass("G2", EV["letThem"], DUR - EV["letThem"] - 0.1, gain=0.11)
kick(EV["letThem"], 0.2, tail=0.5)
for k, n in enumerate(["G5", "B5", "D6", "G6", "B6"]):
    bell(n, EV["letThem"] + k * 0.09, 0.05, (-0.3, 0.3)[k % 2], decay=2.6)


# ================================================================ SOUND DESIGN
def tap(at, gain=0.09, pan=0.15):
    click(at, gain, pan, f=1500)
    t = t_axis(0.09)
    place(sfx, np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.018), at, pan, gain * 1.1)


def swoosh(at, dur=0.18, gain=0.04, pan=0.0):
    noise_sweep(at, dur, 900, 5200, gain, pan, rising=False)


def blip(at, f0, f1, gain=0.05, dur=0.14, pan=0.0):
    """A soft pitched chirp for the game: warm, not cartoonish."""
    t = t_axis(dur)
    ph = 2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (t / dur)) / SR
    v = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.sin(np.pi * t / dur) ** 0.6
    place(sfx, v, at, pan, gain)


def shutter(at, gain=0.09):
    for off, f in ((0, 3200), (0.055, 2400)):
        t = t_axis(0.04)
        place(sfx, bp(rng.standard_normal(len(t)), f * 0.6, f * 1.5) * np.exp(-t / 0.009), at + off, 0.1, gain)


def shimmer(at, dur=0.5, gain=0.03, pan=0.0):
    """AI generating: soft high partials blooming and fading. No beeps."""
    for i in range(7):
        f = hz("D6") * [1, 1.25, 1.5, 2, 2.5, 3, 3.75][i]
        t = t_axis(dur)
        v = np.sin(2 * np.pi * f * t) * np.sin(np.pi * t / dur) ** 2
        place(sfx, v, at + i * 0.035, pan + (-0.3, 0.3)[i % 2], gain / (1 + i * 0.25))


def cheer(at, dur, gain=0.05):
    """Family reaction: a small room of hands clapping, voices left to the imagination."""
    t = at
    while t < at + dur:
        x = t_axis(0.05)
        v = bp(rng.standard_normal(len(x)), rng.uniform(900, 1500), rng.uniform(2600, 4800)) * np.exp(-x / 0.011)
        fade = np.sin(np.pi * (t - at) / dur) ** 0.6
        place(sfx, v, t, rng.uniform(-0.5, 0.5), gain * rng.uniform(0.5, 1.0) * fade)
        t += rng.uniform(0.012, 0.045)


# room tone: lamp-lit quiet under the home scenes
for a, b, g in ((0.0, EV["stop"], 0.012), (SCENE["s10"][0], EV["turnLaptop"], 0.01)):
    x = lp(rng.standard_normal(int((b - a) * SR)), 420)
    env = np.minimum(1, np.minimum(np.arange(len(x)) / (0.2 * SR), (len(x) - np.arange(len(x))) / (0.02 * SR)))
    place(sfx, x * env, a, 0, g * 3)

# 01: the feed
for i, s in enumerate(EV["swipes"]):
    tap(s, 0.07 + i * 0.006)
    swoosh(s, 0.16, 0.022 + i * 0.002, 0.1)
    blip(s + 0.11, *[(520, 780), (330, 495), (660, 990), (392, 588)][i % 4], gain=0.026, pan=-0.1)
# 02: nothing, then one bulb coming on, then the hit
for k in (0, 0.07, 0.15, 0.32):
    click(EV["flicker"] + k, 0.035, 0.05, f=4200)
impact(G0)
for k, n in enumerate(["G5", "D6", "G6"]):
    bell(n, G0 + k * 0.04, 0.05, (-0.3, 0.3)[k % 2], decay=2, bus=sfx)
# 03: website
pencil(EV["sketch"], EV["siteBuild"], 0.11)
for k in range(8):
    tap(EV["siteBuild"] + 0.1 + k * 0.09, 0.05, -0.3 + k * 0.08)
    if k % 2 == 0:
        swoosh(EV["siteBuild"] + 0.1 + k * 0.09, 0.12, 0.018)
keys(EV["siteBuild"], EV["family"] - 0.1, 0.03)
cheer(EV["family"], 1.35, 0.05)
thock(EV["whyNot"], 0.2)
chime(EV["whyNot"] + 0.02, ["B5", "D6", "G6"], 0.05, gap=0.05, decay=0.9)
# 04: blog
whoosh(SCENE["s04"][0] + 0.1, 0.34, 0.07)
keys(EV["blogBuild"] - 0.3, EV["aiChips"] - 0.05, 0.03)
paper(EV["blogBuild"], 0.07)
for k in range(3):
    shutter(EV["blogBuild"] + 0.14 + k * 0.1, 0.07)
shimmer(EV["aiChips"] - 0.08, 0.5, 0.022, 0.2)
thock(EV["aiChips"] + 0.12, 0.08, f=120)
noise_sweep(EV["keeping"] - 0.1, 0.3, 500, 4200, 0.06, 0.0, rising=False)
chime(EV["keeping"] + 0.3, ["D6", "G6"], 0.05, gap=0.08, decay=1.3)
# 05: one idea into another
ws = [EV["game"], EV["design"], EV["invent"], EV["burst"]]
for s in ws:
    noise_sweep(s - 0.14, 0.28, 500, 6000, 0.07, 0.0, rising=False)
for k in range(3):
    s = EV["game"] + k * 0.62
    blip(s, 280, 620, 0.05, 0.16, -0.15)
    blip(s + 0.34, 880, 1320, 0.028, 0.09, 0.2)
whoosh(EV["design"] - 0.05, 0.42, 0.09)
for k in range(4):
    click(EV["design"] + 0.14 + k * 0.17, 0.08, 0.2, f=2100)
shutter(EV["design"] + 1.0, 0.05)
pencil(EV["invent"], EV["invent"] + 0.62, 0.09)
bell("E6", EV["invent"] + 0.66, 0.05, 0.1, decay=1.2, bus=sfx)
for k in range(6):
    noise_sweep(EV["burst"] + 0.02 + k * 0.06, 0.26, 700, 6200, 0.05, (-0.6, 0.6)[k % 2], rising=False)
    bell(ARP["G"][k], EV["burst"] + 0.04 + k * 0.06, 0.03, (-0.5, 0.5)[k % 2], decay=0.6, bus=sfx)
noise_sweep(EV["collapse"], SCENE["s05"][1] - EV["collapse"], 6000, 400, 0.08, 0.0, rising=False)
# 06: tools
noise_sweep(EV["ceiling"], 0.6, 600, 5000, 0.045, 0.0, rising=False)
chime(EV["ceiling"] + 0.12, ["G6", "D6"], 0.03, gap=0.09, decay=1.4)
for k in range(6):
    click(EV["tools"] + 0.08 + k * 0.07, 0.07, -0.4 + k * 0.16, f=1900 + k * 180)
bell("G5", EV["place"], 0.04, 0, decay=1.6, bus=sfx)
# 07: reveal and journey
impact(EV["logo"], 0.75, 0.35)
for k, n in enumerate(["G5", "B5", "D6", "G6"]):
    bell(n, EV["logo"] + k * 0.06, 0.05, (-0.3, 0.3)[k % 2], decay=1.8, bus=sfx)
for k, n in enumerate(["G4", "A4", "B4", "D5", "E5", "G5", "B5"]):  # one note per step of the road
    marimba(n, EV["steps"][k], 0.13, -0.5 + k * 0.16)
for k in range(3):
    tap(EV["coachIn"] + 0.1 + k * 0.09, 0.05, -0.3 + k * 0.1)
chime(EV["steps"][1], ["B5", "F#6"], 0.04, gap=0.07, decay=0.7)  # the coach's note arrives
keys(EV["steps"][3], EV["steps"][4], 0.03)                        # the child changes the code
for k in range(2):
    blip(EV["steps"][4] + 0.05 + k * 0.28, 280, 820, 0.04, 0.2, 0.2)  # and the jump is higher
thock(EV["mastery"], 0.2)
for k, n in enumerate(["G5", "B5", "D6", "G6"]):
    bell(n, EV["mastery"] + k * 0.05, 0.05, (-0.3, 0.3)[k % 2], decay=1.5, bus=sfx)
# 08: you + AI, doors
shimmer(EV["aiOptions"], 0.5, 0.03)
thock(EV["aiOptions"] + 0.3, 0.13, f=110)
noise_sweep(EV["aiOptions"] + 0.34, 0.3, 3000, 500, 0.05, -0.2, rising=False)
keys(EV["aiOptions"] + 0.5, EV["aiOptions"] + 0.86, 0.04)
chime(EV["aiOptions"] + 0.86, ["D6", "G6"], 0.05, gap=0.06, decay=0.8)
thock(EV["youAi"], 0.18)
bell("G5", EV["youAi"] + 0.12, 0.05, 0, decay=1.6, bus=sfx)
for k, n in enumerate(["G4", "A4", "B4", "D5", "E5", "G5", "A5", "B5", "D6"]):
    s = EV["doors"] + k * 0.2
    noise_sweep(s - 0.03, 0.17, 700, 4600, 0.05, (-0.3, 0.3)[k % 2], rising=False)
    pluck(n, s, 0.07, (-0.3, 0.3)[k % 2], 0.6, 1.3)
    if k % 2 == 0:
        kick(s, 0.2, tail=0.2)
# 09: publish and share
tap(EV["publish"] + 0.1, 0.14)
chime(EV["publish"] + 0.13, ["G5", "D6", "G6"], 0.06, gap=0.05, decay=1.0)
noise_sweep(EV["share"] - 0.1, 0.3, 700, 5200, 0.07, 0.0, rising=False)
for s_, pan in ((EV["share"] + 0.05, 0.5), (EV["friends"], -0.5), (EV["family2"], 0.0)):
    chime(s_, ["B5", "F#6"], 0.05, gap=0.08, pan=pan, decay=0.8)  # a notification on each phone
cheer(EV["friends"], 0.9, 0.035)
# 10: the gift
paper(EV["giftOpen"] - 0.06, 0.1)
chime(EV["giftOpen"] + 0.04, ["G5", "B5", "D6"], 0.05, gap=0.06, decay=1.0)
thock(EV["forgotten"] + 0.5, 0.06, f=90)
noise_sweep(EV["turnLaptop"] - 0.05, 0.62, 500, 3400, 0.05, 0.0, rising=False)
bell("D6", EV["turnLaptop"] + 0.58, 0.05, 0, decay=1.6, bus=sfx)
cheer(EV["turnLaptop"] + 0.6, 1.2, 0.04)
for k in range(5):
    noise_sweep(EV["strips"] + k * 0.04, 0.16, 800, 5000, 0.035, -0.6 + k * 0.3, rising=False)
cheer(EV["madeThat"], 1.0, 0.05)
# 11: offer
thock(EV["offer"] + 0.62, 0.22, f=130)
chime(EV["offer"] + 0.66, ["G5", "D6", "G6"], 0.06, gap=0.05, decay=1.0)
for k in range(6):
    tap(EV["offer"] + 1.3 + k * 0.2, 0.05, -0.4 + k * 0.16)
# 13: reserve
bell("G5", EV["endCard"], 0.04, 0, decay=1.2, bus=sfx)
tap(EV["reserve"] + 0.62, 0.13)
chime(EV["reserve"] + 0.66, ["B5", "D6"], 0.05, gap=0.06, decay=0.8)
thock(EV["fifty"], 0.1, f=130)
bell("G6", next(l for l in TL["vo"] if l["id"] == "s13c")["speech"][1] + 0.02, 0.05, 0, decay=1.4, bus=sfx)

# ================================================================ VOICE-OVER
def line_lufs(x):
    from master_audio import lufs
    return lufs(np.stack([x, x], axis=1) / np.sqrt(2), SR)


for line in TL["vo"]:
    w = wave.open(os.path.join(ROOT, "production", "audio", "vo", line["file"]))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    x = hp(x, 90)
    # every line at the same loudness, whatever the TTS engine delivered
    x = x * 10 ** ((-20.0 - line_lufs(x)) / 20)
    place(vo, x, line["at"], 0.0, 1.0)

# ================================================================ MIX
room = make_ir(2.6, 0.9, 1)
small = make_ir(1.0, 0.25, 2)
music = reverb(music, room, 0.26)
sfx = reverb(sfx, small, 0.16)
vo = reverb(vo, small, 0.04)

# The stop: music and effects vanish at once, reverb tails included. True silence until the riser.
gate = np.ones(N)
gate[int(EV["stop"] * SR):int((G0 - 0.62) * SR)] = 0
music *= gate[:, None]
sfx_gate = np.ones(N)
sfx_gate[int(EV["stop"] * SR):int(EV["flicker"] * SR)] = 0
sfx *= sfx_gate[:, None]

# Duck the score under the voice, with smooth attack and release
venv = np.abs(vo[:, 0])
venv = lp(venv, 8, order=1)
venv = np.clip(venv / (venv.max() * 0.25), 0, 1)
duck = 1 - 0.72 * lp(venv, 3, order=1).clip(0, 1)
music *= duck[:, None]
sfx *= (1 - 0.45 * lp(venv, 3, order=1).clip(0, 1))[:, None]

# settle the score and effects over the last 0.6 s; the voice is never faded
tail = int(0.6 * SR)
end = (np.linspace(1, 0, tail) ** 1.6)[:, None]
music[-tail:] *= end
sfx[-tail:] *= end

M_G, S_G, V_G = 0.62, 0.62, 1.0
mix = music * M_G + sfx * S_G + vo * V_G

fade_in = int(0.05 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
last = int(0.05 * SR)
mix[-last:] *= np.linspace(1, 0, last)[:, None]


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        for i in range(0, len(x), SR):  # one second at a time: this runs on small machines
            w.writeframes((x[i:i + SR] * 32767).astype(np.int16).tobytes())


del venv, duck, gate, sfx_gate, room, small, end  # free what the mix no longer needs before writing
stems = os.path.join(ROOT, "production", "audio", "stems")
os.makedirs(stems, exist_ok=True)
peak = np.abs(mix).max()
g = 0.89 / peak  # leave headroom; loudness is set in master_audio.py
write(os.path.join(stems, "music.wav"), music * M_G * g)
write(os.path.join(stems, "sfx.wav"), sfx * S_G * g)
write(os.path.join(stems, "vo.wav"), vo * V_G * g)
write(os.path.join(ROOT, "production", "audio", "mix_raw.wav"), mix * g)
print(f"mix written: {DUR}s, pre-gain peak {peak:.2f}")
