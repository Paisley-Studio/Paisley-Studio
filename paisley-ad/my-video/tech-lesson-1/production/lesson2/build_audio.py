"""TECH Lesson 2, "Make something with AI." Original score, sound design and mix.

Everything is synthesised (no samples, no library music). The instruments and effects are Lesson 1's
(production/build_audio.py), copied here so Lesson 2 builds on its own; the score is new. Every cue is
placed on a narration word from src/lesson2/timeline.json, the file that drives the picture.

Usage:  python production/lesson2/build_audio.py   then   python production/lesson2/master.py
Writes: production/lesson2/audio/stems/{music,sfx,vo}.wav and production/lesson2/audio/mix_raw.wav
"""
import json
import os
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))  # production/, for master_audio
TL = json.load(open(os.path.join(ROOT, "src", "lesson2", "timeline.json"), encoding="utf-8"))
SR = 48000
DUR = TL["duration"]
BPM = 100
N = int(SR * DUR)
BEAT = 60.0 / BPM
rng = np.random.default_rng(11)

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
vo = np.zeros((N, 2))

# ---------------------------------------------------------------- lesson timing (same file as the picture)
LINE = {l["id"]: l for l in TL["vo"]}
SC = TL["scenes"]


def L(i):
    return LINE[i]["speech"][0]


def E(i):
    return LINE[i]["speech"][1]


def W(i, word, nth=0):
    hits = [w for w in LINE[i]["words"] if "".join(ch for ch in w[2].lower() if ch.isalnum() or ch == "'") == word.lower()]
    if len(hits) <= nth:
        raise KeyError(f'No word "{word}" (#{nth}) in {i}')
    return hits[nth][0]


# ---------------------------------------------------------------- helpers and instruments (from Lesson 1)
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
# 100 BPM, A major / F# minor, the same palette as Lesson 1 so the two lessons sound like one series.
# Curious (01-03) -> exciting at the first generation (05) -> restrained when the mistakes appear (06-07)
# -> energy rises with each improvement (07-08) -> warm and steady (09-13) -> triumphant but tasteful (14).
B = BEAT
BAR = 4 * B
CH = {
    "F#m": (["F#3", "A3", "C#4", "E4"], "F#2", ["F#3", "C#4", "A4", "E4", "F#4", "C#4", "A4", "C#5"]),
    "D": (["D3", "F#3", "A3", "C#4"], "D2", ["D3", "A3", "F#4", "C#4", "D4", "A3", "F#4", "A4"]),
    "A": (["A3", "C#4", "E4", "B4"], "A2", ["A3", "E4", "C#5", "B4", "A4", "E4", "C#5", "E5"]),
    "E": (["E3", "G#3", "B3", "F#4"], "E2", ["E3", "B3", "G#4", "F#4", "E4", "B3", "G#4", "B4"]),
    "Bm": (["B3", "D4", "F#4", "A4"], "B2", ["B3", "F#4", "D5", "A4", "B4", "F#4", "D5", "F#5"]),
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



def generate(at, dur, gain=0.03):
    """The AI at work: a soft processing build (scan, ticks, rising air) that resolves on the reveal."""
    scan(at, dur, gain)
    noise_sweep(at, dur, 500, 5000, gain * 0.9, 0.0, rising=True)
    for k, s in enumerate(np.arange(at + 0.1, at + dur - 0.1, 0.11)):
        ui_tick(s, 0.012 + 0.012 * (s - at) / dur, (k % 5 - 2) * 0.2, f=2000 + (k % 6) * 220)


def reveal(at, big=False, notes=("A5", "C#6", "E6")):
    """The picture appears. Bigger for the moments that matter."""
    noise_sweep(at - 0.05, 1.2, 7000, 600, 0.04 if big else 0.025, 0.0, rising=False)
    chime(at, list(notes) + (["A6"] if big else []), 0.08 if big else 0.06, gap=0.05, decay=1.4 if big else 1.0)
    if big:
        kick(at, 0.30, bus=sfx, tail=0.9)
        for i in range(10):
            bell(["E6", "F#6", "A6", "B6", "C#7"][i % 5], at + 0.3 + i * 0.09, 0.016, np.sin(i * 1.7) * 0.6, decay=1.4, bus=sfx, ratio=2.0)


def miss(at, gain=0.09):
    """A mistake noticed: a small tension tone, not a buzzer."""
    t = t_axis(0.6)
    v = (np.sin(2 * np.pi * 233 * t) + np.sin(2 * np.pi * 247 * t)) * np.exp(-t / 0.22)
    place(sfx, lp(v, 1400), at, 0.15, gain)
    thock(at, 0.12, f=110)


def meh(at, gain=0.06):
    """The lazy result: a deflating two-note slide (light humour)."""
    t = t_axis(0.7)
    f = np.where(t < 0.28, 330.0, 330 * 2 ** (-(t - 0.28) * 4 / 12 / 0.42))
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-np.maximum(0, t - 0.28) * 3) * np.minimum(1, t / 0.01)
    place(sfx, lp(v, 1800), at, -0.1, gain)


def type_text(t0, t1, gain=0.05):
    keys(t0, t1, gain)


def clock(t0, t1, gain=0.03):
    """Think time: a soft wooden clock, so a silence reads as the student's turn."""
    for k, s in enumerate(np.arange(t0, t1, 0.5)):
        ui_tick(s, gain, 0.0, f=1500 if k % 2 else 1900)


# ---- 01 a blank canvas: a soft ambient tone, curious. The idea is a small, satisfying reveal.
a, b = SC["s01"]
idea = W("s01e", "idea")
pad(["F#2", "C#3", "A3"], 0.0, idea + 0.5, cutoff=480, gain=0.10, attack=2.4, release=1.2)
noise_sweep(0.2, 2.4, 300, 1200, 0.02, 0.0, rising=True)  # the room opening up
for s in np.arange(1.2, idea, 2 * B):
    sub_pulse(s, 0.16)
for k in range(4):  # lesson 1 recap chips
    pop_snd(L("s01a") + 0.5 + k * 0.25, 0.04, (k - 1.5) * 0.3, f0=420 + k * 60, f1=900 + k * 80)
whoosh(W("s01b", "use") + 0.05, 0.5, 0.05)
bell("C#6", W("s01b", "use"), 0.05, 0.1, decay=2.0)
pencil(W("s01d", "everything"), W("s01d", "everything") + 0.45, 0.07)  # the strike-through
riser(idea - 1.0, 1.0, 0.04)
chime(idea, ["A5", "C#6", "E6"], 0.08, gap=0.07, decay=1.6)
noise_sweep(idea, 1.8, 1200, 7000, 0.03, 0.0, rising=False)  # the bloom
pad(["A2", "E3", "A3", "C#4", "E4"], idea, b - idea + 0.5, cutoff=1600, gain=0.07, attack=0.6, release=0.8)
stamp(W("s01f", "idea") - 0.05, ["A5", "E6"], 0.08)
whoosh(b, 0.7, 0.07)

# ---- 02 the mission: a light groove starts; each kind of creature gets a pop; the twist stops it
a, b = SC["s02"]
tw_ = L("s02e") - 0.25
section(a, tw_, PROG, pad_gain=0.06, cutoff=1500, arp="pluck", arp_gain=0.035, bass_style="whole", pulse=True)
impact_l = L("s02a") - 0.3
kick(impact_l, 0.25, bus=sfx, tail=0.8)
bell("A5", impact_l + 0.02, 0.05, -0.2, decay=2.0); bell("E6", impact_l + 0.05, 0.04, 0.2, decay=2.0)
stamp(W("s02c", "dream") - 0.1, ["C#6", "E6"], 0.07)
for k, w in enumerate(("fly", "swim", "robot", "jungle", "nobody")):
    pop_snd(W("s02d", w) - 0.1, 0.07, (k - 2) * 0.3, f0=380 + k * 60, f1=880 + k * 90)
    pluck(["A4", "C#5", "E5", "F#5", "A5"][k], W("s02d", w) - 0.08, 0.04, (k - 2) * 0.3, decay=0.6)
# the twist: a tape-stop, then a held, questioning chord
tt = t_axis(0.5)
fd = 220 * np.exp(-tt * 6)
place(sfx, np.sin(2 * np.pi * np.cumsum(fd) / SR) * np.exp(-tt * 4), tw_, 0, 0.10)
thock(tw_ + 0.05, 0.16, f=80)
pad(["D3", "A3", "E4"], tw_ + 0.1, b - tw_, cutoff=1100, gain=0.06, attack=0.4, release=0.8)
for s in np.arange(tw_ + 0.2, b, B):
    sub_pulse(s, 0.10, f=46)
ui_tick(W("s02f", "design"), 0.06); ui_tick(W("s02f", "AI"), 0.06, 0.3)
whoosh(W("s02g", "imagining"), 0.6, 0.06, 0.4)  # the bulb flies to the robot
error(W("s02g", "not") - 0.02, 0.05)
whoosh(L("s02h") + 0.1, 0.6, 0.06, -0.4)  # and back to you
stamp(W("s02h", "creator") - 0.05, ["A5", "C#6", "E6"], 0.08)
whoosh(b, 0.7, 0.07)

# ---- 03 design it first: warm, playful marimba; each question lands; pencil for the sketch; think time
a, b = SC["s03"]
think0 = E("s03i") + 0.1
think1 = L("s03j") - 0.3
section(a, L("s03g") - 0.2, ["A", "E", "F#m", "D"], pad_gain=0.05, cutoff=1500, arp="marimba", arp_gain=0.05, bass_style="pulse", shaker_on=True)
for k, line in enumerate(("s03b", "s03c", "s03d", "s03e", "s03f")):
    stamp(L(line) - 0.05, [["A5"], ["C#6"], ["E6"], ["F#6"], ["A6"]][k], 0.05)
    for j in range(5):
        pop_snd(L(line) + 0.4 + j * 0.12, 0.025, (j - 2) * 0.3, f0=500 + j * 50, f1=1000 + j * 70)
section(L("s03g") - 0.2, think0 - 0.3, ["D", "A", "E", "F#m"], pad_gain=0.05, cutoff=1700, arp="pluck", arp_gain=0.03, bass_style="pulse")
pencil(L("s03g"), W("s03h", "small") + 1.0, 0.06)  # the sketch draws in
for w in ("lumora", "glow", "small"):
    pencil(W("s03h", w), W("s03h", w) + 0.5, 0.05)
inv = W("s03h", "invisible")
for i in range(8):  # now you see it, now you don't
    bell(["E6", "A6", "C#7", "E7"][i % 4], inv + 0.2 + i * 0.06, 0.018, np.sin(i * 2) * 0.6, decay=0.9, bus=sfx, ratio=3.0)
for w in ("four", "huge", "blue", "golden"):
    pop_snd(W("s03h", w), 0.04, 0.4, f0=600, f1=1200)
# think time: the music thins to one held chord and a soft clock
pad(["F#3", "C#4", "A4", "E5"], think0 - 0.3, think1 - think0 + 1.0, cutoff=900, gain=0.06, attack=0.8, release=1.0)
clock(think0, think1, 0.025)
chime(L("s03j"), ["A5", "E6"], 0.06, gap=0.08, decay=1.0)
whoosh(b, 0.7, 0.07)

# ---- 04 be specific: a light pulse; typing, generating, three reveals of growing size; the equation lifts
a, b = SC["s04"]
section(a, L("s04n") - 0.3, ["F#m", "D", "A", "E"], pad_gain=0.045, cutoff=1300, bass_style="pulse", pulse=True)
p3at = W("s04j", "round") - 0.1
for line, t0, t1 in (("s04c", L("s04c"), E("s04c")), ("s04g", L("s04g"), E("s04g")), ("s04j", p3at, E("s04j") - 0.3)):
    type_text(t0, t1, 0.045)
    click(E(line) + 0.15, 0.08)  # send
    generate(E(line) + 0.25, 1.75)
meh(E("s04c") + 2.05, 0.07)
pop_snd(E("s04c") + 2.05, 0.04)
for k in range(4):  # the AI guessed: shape? colour? home? mood?
    pop_snd(W("s04e", "guess") + k * 0.15, 0.05, (k - 1.5) * 0.4, f0=700, f1=1300)
reveal(E("s04g") + 2.05, notes=("C#6", "E6"))
reveal(E("s04j") + 2.05, big=True)
whoosh(L("s04k") - 0.1, 0.6, 0.05)
for k in range(3):
    ui_tick(L("s04k") + 0.2 + k * 0.15, 0.05, (k - 1) * 0.5, f=2400 + k * 300)
stamp(W("s04l", "same"), ["E6"], 0.05); stamp(W("s04l", "different"), ["A6"], 0.05)
stamp(W("s04l", "explain") - 0.2, ["A5", "C#6", "E6"], 0.07)  # BE SPECIFIC
eq = L("s04n") - 0.3
riser(eq - 0.8, 0.8, 0.04)
section(eq, b, ["A", "E", "F#m", "D"], pad_gain=0.06, cutoff=2200, arp="pluck", arp_gain=0.04, bass_style="eighths", kick_on=True, hats=True)
for k, w in enumerate(("idea", "clear", "better")):
    stamp(W("s04n", w) - 0.2, [["A5", "C#6"], ["C#6", "E6"], ["E6", "A6", "C#7"]][k], 0.07)
    kick(W("s04n", w) - 0.2, 0.18, bus=sfx, tail=0.5)
whoosh(b, 0.7, 0.07)

# ---- 05 your first creation: the studio opens, clean typing, IDEA > WORDS > AI > CREATION, the big reveal
a, b = SC["s05"]
gen5 = W("s05g", "turns")
rv5 = L("s05h") - 0.15
section(a, L("s05c") - 0.3, BRIGHT, pad_gain=0.05, cutoff=1600, arp="pluck", arp_gain=0.035, bass_style="pulse", pulse=True)
stamp(W("s05a", "your") - 0.1, ["A5", "E6"], 0.07)
whoosh(L("s05c") - 0.1, 0.8, 0.08)  # the studio window
chime(L("s05c") + 0.3, ["E6", "A6"], 0.04, gap=0.06, decay=0.8)
pad(["F#3", "C#4", "A4"], L("s05c") - 0.3, gen5 - L("s05c") + 0.5, cutoff=1000, gain=0.05, attack=0.8, release=0.6)
type_at = E("s05d") + 0.3
type_text(type_at, L("s05e") - 0.5, 0.055)
for s in np.arange(type_at, L("s05e") - 0.5, B):
    sub_pulse(s, 0.08, f=46)
lit = [W("s05e", "idea") - 0.1, W("s05e", "words") - 0.1, W("s05f", "AI") - 0.1]
for k, s in enumerate(lit):
    stamp(s, [["A5"], ["C#6"], ["E6"]][k], 0.05)
click(W("s05f", "go") - 0.05, 0.10)  # send
for k in range(14):  # the words fly into the canvas
    ui_tick(W("s05f", "go") + 0.15 + k * 0.08, 0.02, (k % 7 - 3) * 0.15, f=2200 + (k % 5) * 250)
generate(gen5, rv5 - gen5, 0.035)
riser(rv5 - 1.6, 1.6, 0.05)
reveal(rv5, big=True)
impact(rv5 + 0.02)
section(rv5, b, ["A", "E", "F#m", "D"], pad_gain=0.06, cutoff=2600, arp="sixteenth", arp_gain=0.022, bass_style="eighths", kick_on="four", hats=True, clap_on=True)
chime(L("s05i"), ["A5", "C#6", "E6", "A6"], 0.06, gap=0.06, decay=1.4)
whoosh(b, 0.7, 0.07)

# ---- 06 is it perfect? the music steps back; a soft clock while the student looks; the miss
a, b = SC["s06"]
pad(["F#2", "C#3", "A3", "E4"], a, b - a + 0.3, cutoff=700, gain=0.08, attack=0.8, release=0.8)
for s in np.arange(a, b, 2 * B):
    sub_pulse(s, 0.12, f=46)
pop_snd(W("s06b", "perfect") - 0.15, 0.05, f0=500, f1=800)
clock(E("s06b") + 0.1, L("s06c") - 0.25, 0.025)
thock(L("s06c"), 0.08, f=140)
whoosh(L("s06d") - 0.2, 0.6, 0.05)
for k in range(4):  # the highlighter marks
    noise_sweep(E("s06d") + 0.6 + k * 0.9, 0.35, 2500, 5000, 0.02, (k - 1.5) * 0.3, rising=False)
clock(E("s06d") + 0.1, L("s06e") - 0.25, 0.025)
error(L("s06e") - 0.1, 0.11)
pad(["D3", "A3", "F#4"], L("s06f") - 0.2, b - L("s06f") + 0.4, cutoff=1200, gain=0.05, attack=0.5, release=0.6)
stamp(W("s06f", "powerful"), ["C#6"], 0.05)
miss(W("s06f", "wrong") - 0.2, 0.06)
whoosh(b, 0.7, 0.07)

# ---- 07 check, think, improve: restrained, then the energy rises as the improvement goes in
a, b = SC["s07"]
imp = W("s07g", "improve") - 0.1
send7 = E("s07h") + 0.1
fixed = L("s07i") - 0.1
pad(["F#2", "C#3", "A3"], a, imp - a + 0.3, cutoff=650, gain=0.07, attack=0.6, release=0.6)
for s in np.arange(a, imp, B):
    sub_pulse(s, 0.10, f=46)
stamp(W("s07b", "check") - 0.1, ["E6"], 0.05)
for line in ("s07c", "s07d", "s07e"):
    pencil(L(line) + 0.4, L(line) + 0.9, 0.05)  # the ring is drawn
    miss(L(line) + 0.4, 0.07)
stamp(W("s07f", "think") - 0.1, ["A5"], 0.05)
for k in range(3):
    ui_tick(W("s07f", "think") + 0.3 + k * 0.2, 0.04, (k - 1) * 0.4, f=2600)  # the notes turn into fixes
clock(E("s07f") + 0.1, imp - 0.2, 0.022)
riser(imp - 0.8, 0.8, 0.05)
stamp(imp, ["A5", "C#6", "E6"], 0.07)
section(imp, b, ["D", "A", "E", "F#m"], pad_gain=0.055, cutoff=1800, arp="pluck", arp_gain=0.035, bass_style="eighths", kick_on=True, hats=True)
type_text(W("s07h", "keep") - 0.05, E("s07h") - 0.3, 0.035)
click(send7, 0.10)
generate(send7 + 0.1, fixed - send7 - 0.3, 0.03)
reveal(fixed, notes=("A5", "C#6", "E6"))
for k in range(3):  # the crosses turn into ticks
    pop_snd(fixed + 0.2 + k * 0.12, 0.05, (k - 1) * 0.4, f0=600 + k * 80, f1=1200 + k * 100)
whoosh(b, 0.7, 0.07)

# ---- 08 create, check, improve: version 3 (the lift), the journey, the loop
a, b = SC["s08"]
send8 = E("s08b") + 0.1
done = L("s08c") - 0.1
journey = L("s08e") - 0.6
loop = L("s08l") - 0.4
section(a, journey, ["F#m", "D", "A", "E"], pad_gain=0.055, cutoff=1900, arp="pluck", arp_gain=0.035, bass_style="eighths", kick_on=True, hats=True)
miss(W("s08a", "tail") + 0.2, 0.06)
pencil(W("s08a", "tail"), W("s08a", "tail") + 0.5, 0.05)
stamp(W("s08b", "improve") - 0.1, ["C#6", "E6"], 0.06)
type_text(W("s08b", "make") - 0.05, E("s08b") - 0.3, 0.04)
click(send8, 0.10)
generate(send8 + 0.1, done - send8 - 0.3, 0.03)
riser(done - 1.2, 1.2, 0.05)
reveal(done, big=True, notes=("A5", "C#6", "E6"))
pad(["A3", "E4", "A4", "C#5", "E5"], done, journey - done + 0.4, cutoff=2600, gain=0.05, attack=0.1, release=0.6)
whoosh(journey + 0.1, 0.7, 0.06)
section(journey + 0.3, loop, ["A", "E", "F#m", "D"], pad_gain=0.055, cutoff=2000, arp="marimba", arp_gain=0.05, bass_style="pulse", kick_on=True, shaker_on=True)
for k, (w, nth) in enumerate((("version", 0), ("check", 0), ("think", 0), ("version", 1), ("improve", 0), ("version", 2))):
    s = W("s08e", w, nth) - 0.1
    pop_snd(s, 0.06, -0.6 + k * 0.24, f0=420 + k * 70, f1=900 + k * 100)
    pluck(["A4", "C#5", "E5", "F#5", "A5", "C#6"][k], s, 0.045, -0.6 + k * 0.24, decay=0.6)
for line in ("s08g", "s08h", "s08i", "s08j", "s08k"):
    ui_tick(L(line) - 0.1, 0.04, 0.0, f=2800)
riser(loop - 0.8, 0.8, 0.05)
section(loop, b, ["A", "E", "F#m", "D"], pad_gain=0.06, cutoff=2400, arp="sixteenth", arp_gain=0.022, bass_style="eighths", kick_on="four", hats=True, clap_on=True)
for k, w in enumerate(("create", "check", "improve")):
    stamp(W("s08l", w) - 0.12, [["A5", "C#6"], ["C#6", "E6"], ["E6", "A6", "C#7"]][k], 0.07)
    kick(W("s08l", w) - 0.12, 0.22, bus=sfx, tail=0.5)
whoosh(b, 0.7, 0.07)

# ---- 09 AI doesn't know your idea: warm and thoughtful; words fly; "you are the creator" is the sonic emphasis
a, b = SC["s09"]
creator = W("s09g", "creator") - 0.2
pad(["D3", "A3", "F#4"], a, L("s09c") - a, cutoff=900, gain=0.07, attack=0.6, release=0.8)
stamp(L("s09b") - 0.1, ["F#5", "C#6"], 0.06)
section(L("s09c") - 0.3, creator - 0.2, ["D", "A", "E", "F#m"], pad_gain=0.05, cutoff=1500, arp="pluck", arp_gain=0.03, bass_style="pulse", pulse=True)
for k in range(5):  # only what you tell it
    ui_tick(W("s09c", "tell") - 0.6 + k * 0.28, 0.04, -0.4 + k * 0.2, f=2400 + k * 200)
noise_sweep(W("s09d", "see") - 0.1, 0.5, 3000, 700, 0.03, 0.0, rising=False)  # the glass wall
ui_tick(W("s09d", "said") - 0.5, 0.06, 0.3)
chime(W("s09d", "said") + 0.3, ["A5", "E6"], 0.06, gap=0.07, decay=0.9)  # the tail turns golden
pencil(L("s09e"), L("s09e") + 0.7, 0.05)  # the arrow is drawn
stamp(W("s09f", "plan") - 0.4, ["C#6"], 0.05); stamp(W("s09f", "tool") - 0.4, ["E6"], 0.05)
riser(creator - 1.0, 1.0, 0.05)
impact(creator)
kick(creator, 0.35, bus=sfx, tail=0.8)
pad(["A2", "E3", "A3", "C#4", "E4"], creator, b - creator + 0.3, cutoff=2200, gain=0.07, attack=0.05, release=0.6)
bell("A5", creator + 0.02, 0.07, -0.2, decay=2.4); bell("E6", creator + 0.06, 0.05, 0.2, decay=2.4); bell("C#7", creator + 0.1, 0.03, 0.0, decay=2.4)
whoosh(b, 0.7, 0.07)

# ---- 10 your challenge: a steady, light groove; every checkbox ticks
a, b = SC["s10"]
section(a, b, ["F#m", "D", "A", "E"], pad_gain=0.05, cutoff=1600, arp="marimba", arp_gain=0.045, bass_style="pulse", shaker_on=True)
stamp(L("s10a"), ["A5", "E6"], 0.06)
for k, w in enumerate(("name", "habitat", "special", "three", "personality")):
    pop_snd(W("s10b", w) - 0.2, 0.05, (k - 2) * 0.25, f0=450 + k * 60, f1=950 + k * 80)
pop_snd(L("s10c") - 0.1, 0.05, 0.3)
stamp(W("s10d", "improve") - 0.2, ["C#6", "E6"], 0.07)
pencil(W("s10e", "done"), W("s10e", "done") + 0.35, 0.07)
thock(W("s10e", "done") + 0.1, 0.10, f=120)
for k, w in enumerate(("create", "check", "improve")):
    stamp(W("s10f", w) - 0.1, [["A5"], ["C#6"], ["E6"]][k], 0.05)
tick_from = E("s10f") + 0.1
for k in range(7):
    ui_tick(tick_from + k * (min(b, tick_from + 3.2) - tick_from) / 7, 0.06, (k - 3) * 0.15, f=2600 + k * 120)
whoosh(b, 0.7, 0.07)

# ---- 11 reflection: soft and honest; the answers are handwritten
a, b = SC["s11"]
section(a, b, ["D", "A", "Bm", "E"], pad_gain=0.05, cutoff=1300, arp="pluck", arp_gain=0.028, bass_style="whole")
for k, line in enumerate(("s11b", "s11c", "s11d")):
    pop_snd(L(line) - 0.15, 0.06, (k - 1) * 0.5, f0=420, f1=900)
    paper(L(line) - 0.15, 0.04)
pencil(W("s11e", "came") - 0.2, W("s11e", "AI") - 0.1, 0.05)
pencil(W("s11e", "AI") - 0.1, W("s11e", "changed") - 0.4, 0.05)
pencil(W("s11e", "changed") - 0.3, W("s11e", "wrong") + 0.2, 0.05)
chime(W("s11f", "honest") - 0.15, ["A5", "C#6", "E6"], 0.07, gap=0.06, decay=1.2)
whoosh(b, 0.7, 0.07)

# ---- 12 the creation card: save, the card flies into the project space, the first project
a, b = SC["s12"]
save = W("s12c", "save") - 0.05
first = L("s12f") - 0.15
section(a, first - 0.3, ["A", "E", "F#m", "D"], pad_gain=0.05, cutoff=1800, arp="pluck", arp_gain=0.03, bass_style="pulse", pulse=True)
whoosh(L("s12a") - 0.2, 0.6, 0.06)
for k, w in enumerate(("name", "habitat", "ability", "personality", "made")):
    ui_tick(W("s12b", w) - 0.15, 0.05, (k - 2) * 0.2, f=2400 + k * 160)
click(save, 0.12)
whoosh(save + 0.8, 0.8, 0.08, -0.3)
thock(save + 1.2, 0.14, f=160)
chime(save + 1.22, ["E6", "A6"], 0.05, gap=0.06, decay=0.8)
pop_snd(W("s12d", "mission") - 0.2, 0.05, 0.4)
pop_snd(L("s12e") - 0.1, 0.06, f0=600, f1=1200)
chime(L("s12e"), ["C#6", "E6"], 0.04, gap=0.06, decay=0.8)
riser(first - 0.8, 0.8, 0.04)
stamp(first, ["A5", "C#6", "E6", "A6"], 0.08)
pad(["A2", "E3", "A3", "C#4", "E4", "B4"], first, b - first + 0.3, cutoff=2400, gain=0.06, attack=0.1, release=0.6)
whoosh(b, 0.7, 0.07)

# ---- 13 your turn: steps tick in, the coach sees it, the path climbs
a, b = SC["s13"]
coach = L("s13f") - 0.4
path = L("s13g") - 0.3
thock(L("s13b") - 0.4, 0.16, f=140)
stamp(L("s13b") - 0.4, ["A5", "E6"], 0.06)
section(L("s13b") - 0.4, path - 0.2, ["F#m", "D", "A", "E"], pad_gain=0.05, cutoff=1700, arp="marimba", arp_gain=0.045, bass_style="pulse", shaker_on=True)
d = W("s13c", "design") - 0.1
starts = [d, d + 0.18, d + 0.36, d + 0.54, d + 0.72, W("s13c", "write") - 0.1, W("s13c", "generate") - 0.1, W("s13d", "check") - 0.1,
          W("s13d", "check") + 0.3, W("s13d", "improve") - 0.1, W("s13d", "improve") + 0.3, W("s13e", "reflection") - 0.1, W("s13e", "save") - 0.1]
for k, s in enumerate(starts):
    ui_tick(s, 0.045, -0.4 + (k % 7) * 0.13, f=2000 + k * 120)
whoosh(coach, 0.7, 0.06)
for k, w in enumerate(("idea", "first", "improved", "reflection")):
    pop_snd(W("s13f", w) - 0.15, 0.06, (k - 1.5) * 0.4, f0=420 + k * 80, f1=900 + k * 120)
    pluck(["A4", "C#5", "E5", "A5"][k], W("s13f", w) - 0.15, 0.04, (k - 1.5) * 0.4, decay=0.6)
whoosh(path, 0.7, 0.06)
section(path, b, ["A", "E", "F#m", "D"], pad_gain=0.055, cutoff=2200, bass_style="eighths", kick_on=True, hats=True, pulse=True)
scale_ = ["A4", "B4", "C#5", "E5", "F#5", "A5", "C#6"]
for k, w in enumerate(("learn", "practice", "build", "submit", "review", "improve", "master")):
    s = W("s13h", w) - 0.1
    bell(scale_[k], s, 0.05, -0.6 + k * 0.2, decay=1.2, bus=sfx, ratio=2.0)
    ui_tick(s, 0.04, -0.6 + k * 0.2, f=2200 + k * 150)
stamp(W("s13h", "master") - 0.1, ["A5", "C#6", "E6", "A6"], 0.08)
kick(W("s13h", "master") - 0.1, 0.25, bus=sfx, tail=0.7)
whoosh(b, 0.7, 0.07)

# ---- 14 that's creating with AI: triumphant but tasteful, then the sting, then air
a, b = SC["s14"]
creating = L("s14j") - 0.4
plus = W("s14k", "plus")
msg = L("s14l") - 0.3
nxt = L("s14m") - 0.6
pad(["F#2", "C#3", "A3", "E4"], a, L("s14e") - a, cutoff=900, gain=0.07, attack=1.0, release=0.8)
for k, line in enumerate(("s14b", "s14c", "s14d")):
    bell(["A5", "C#6", "E6"][k], L(line) - 0.15, 0.06, (k - 1) * 0.4, decay=2.0)
    pop_snd(L(line) - 0.15, 0.05, (k - 1) * 0.4)
section(L("s14e") - 0.3, creating, ["D", "A", "E", "F#m"], pad_gain=0.055, cutoff=2000, arp="pluck", arp_gain=0.035, bass_style="eighths", kick_on=True, hats=True)
for k, line in enumerate(("s14f", "s14g", "s14h", "s14i")):
    stamp(L(line) - 0.1, [["A5"], ["C#6"], ["E6"], ["A6", "C#7"]][k], 0.05)
riser(creating - 1.0, 1.0, 0.05)
impact(creating + 0.15)
pad(["D3", "A3", "D4", "F#4", "A4", "E5"], creating + 0.15, plus - creating, cutoff=2400, gain=0.07, attack=0.1, release=0.4)
whoosh(L("s14k") - 0.1, 0.5, 0.06)
kick(plus - 0.08, 0.35, bus=sfx, tail=0.8)
pad(["A2", "E3", "A3", "C#4", "E4"], plus - 0.08, msg - plus + 0.5, cutoff=2400, gain=0.07, attack=0.05, release=0.6)
bell("A5", plus - 0.06, 0.06, 0.0, decay=2.2); bell("E6", plus, 0.04, 0.3, decay=2.2)
section(msg, nxt, ["A", "E", "F#m", "D"], pad_gain=0.06, cutoff=2600, arp="sixteenth", arp_gain=0.02, bass_style="eighths", kick_on="four", hats=True, clap_on=True)
for k, w in enumerate(("had", "helped", "made")):
    stamp(W("s14l", w) - 0.3, [["A5", "C#6"], ["C#6", "E6"], ["E6", "A6", "C#7"]][k], 0.07)
# into the TECH environment: the sting, then the room breathes until the end
noise_sweep(nxt - 0.1, 1.6, 6000, 300, 0.05, 0.0, rising=False)
impact(nxt + 0.3)
bell("A5", nxt + 0.33, 0.07, 0.2, decay=3.0); bell("E6", nxt + 0.36, 0.05, -0.2, decay=3.0)
pad(["A2", "E3", "A3", "C#4", "E4", "B4"], nxt + 0.3, b - nxt, cutoff=2400, gain=0.07, attack=0.2, release=0.0)
bass("A1", nxt + 0.3, b - nxt - 1.2, gain=0.07)
stamp(W("s14m", "create") - 0.1, ["A5", "C#6", "E6"], 0.07)
for i in range(7):
    bell(["E6", "F#6", "A6", "B6", "C#7", "E7", "A7"][i], E("s14m") + 0.8 + i * 0.45, 0.016, np.sin(i * 1.7) * 0.6, decay=2.0, bus=sfx, ratio=2.0)


# ================================================================ VOICE-OVER
from master_audio import lufs  # noqa: E402


def line_lufs(x):
    return lufs(np.stack([x, x], axis=1) / np.sqrt(2), SR)


for line in TL["vo"]:
    w = wave.open(os.path.join(HERE, "audio", "vo", line["file"]))
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    x = hp(x, 80)
    x = x * 10 ** ((-19.0 - line_lufs(x)) / 20)  # every line at the same loudness
    place(vo, x, line["at"], 0.0, 1.0)

# ================================================================ MIX (same treatment as Lesson 1)
room = make_ir(2.6, 0.9, 1)
small = make_ir(1.0, 0.25, 2)
music = reverb(music, room, 0.26)
sfx = reverb(sfx, small, 0.16)
vo = reverb(vo, small, 0.04)

# duck the score under the voice (about -9 dB); the narrator always wins
venv = np.abs(vo[:, 0])
venv = lp(venv, 8, order=1)
venv = np.clip(venv / (np.percentile(venv, 99.5) * 0.25), 0, 1)
duck = 1 - 0.7 * lp(venv, 3, order=1).clip(0, 1)
music *= duck[:, None]
sfx *= (1 - 0.25 * lp(venv, 3, order=1).clip(0, 1))[:, None]

tail = int(2.5 * SR)
end = (np.linspace(1, 0, tail) ** 1.4)[:, None]
music[-tail:] *= end
sfx[-tail:] *= end

# the driving sections sit a little lower under the voice
busy = np.ones(N)
for a_, b_ in ((L("s05h") - 0.15, SC["s05"][1]), (L("s08l") - 0.4, SC["s08"][1]), (L("s14l") - 0.3, L("s14m") - 0.6)):
    busy[int(a_ * SR):int(b_ * SR)] = 0.75
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


stems = os.path.join(HERE, "audio", "stems")
os.makedirs(stems, exist_ok=True)
write(os.path.join(stems, "music.wav"), music * 0.64)
write(os.path.join(stems, "sfx.wav"), sfx * 0.72)
write(os.path.join(stems, "vo.wav"), vo * 0.62)
peak = np.abs(mix).max()
raw = mix / max(1.0, peak / 0.95)
write(os.path.join(HERE, "audio", "mix_raw.wav"), raw)
print(f"mix written, {DUR:.1f}s, peak {peak:.2f}")

print("now run: python production/lesson2/master.py")
