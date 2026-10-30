"""Prepare the supplied project screens for the film. The originals in public/img are never changed.

- Recolours their purple to Paisley teal (brand lock), leaving photos, blues, greens and golds alone.
- Removes the placeholder logo; the film draws the real Paisley lockup in its place (art.tsx Lockup).
- Cuts the game into transparent sprites so it can really be played in code (creations.tsx GameScreen).

Usage: python production/cut_assets.py     Writes public/img/real/*
Set RECOLOUR = False to keep the purple exactly as supplied.
"""
import glob
import os

import numpy as np
from PIL import Image

RECOLOUR = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "img")
OUT = os.path.join(SRC, "real")
os.makedirs(OUT, exist_ok=True)


def load(pattern):
    return np.asarray(Image.open(glob.glob(os.path.join(SRC, pattern))[0]).convert("RGB")).astype(np.float64) / 255


def recolour(a):
    """Hue-shift only the violet range onto brand teal (H 174), darkening the strong violets towards #245F5A."""
    if not RECOLOUR:
        return a
    mx, mn = a.max(axis=2), a.min(axis=2)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # hue in degrees
    h = np.zeros_like(mx)
    m = d > 1e-6
    bm = m & (mx == b)
    rm = m & (mx == r) & ~bm
    h[bm] = 240 + 60 * (r[bm] - g[bm]) / d[bm]
    h[rm] = (60 * (g[rm] - b[rm]) / d[rm]) % 360
    mask = (h > 228) & (h < 305) & (s > 0.035)
    new_h = 174 / 60
    new_s = np.clip(s * 0.9, 0, 0.72)
    new_v = mx * (0.5 + 0.5 * (1 - np.clip(s * 1.25, 0, 1)) ** 1.2)
    c = new_v * new_s
    x = c * (1 - abs(new_h % 2 - 1))
    base = new_v - c
    out = a.copy()  # H 174 sits in the G-to-B sextant: r = 0, g = c, b = x
    out[..., 0] = np.where(mask, base, r)
    out[..., 1] = np.where(mask, base + c, g)
    out[..., 2] = np.where(mask, base + x, b)
    return out


def save(a, name, q=93):
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, subsampling=0)


def patch(a, box, sample):
    """Paint a box with the colour sampled at a nearby clean point."""
    x0, y0, x1, y1 = box
    a[y0:y1, x0:x1] = a[sample[1], sample[0]]


def hx(a, x, y):
    return "#%02X%02X%02X" % tuple((a[y, x] * 255).astype(int))


site = recolour(load("Paisley Christmas*"))
patch(site, (30, 8, 340, 78), (400, 20))
save(site, "site.jpg")
blog = recolour(load("Amani*"))
patch(blog, (30, 8, 345, 82), (420, 20))
save(blog, "blog.jpg")
print("site page", hx(site, 400, 20), "seconds tile", hx(site, 575, 735), "page", hx(site, 268, 700))
print("blog page", hx(blog, 420, 20), "card", hx(blog, 700, 985))

game = recolour(load("Festive Pixel*"))
BG = game[20, 900]
clean = game.copy()
patch(clean, (60, 40, 575, 130), (900, 20))
save(clean, "game.jpg")
print("game bg", hx(game, 900, 20))
alpha = np.clip((np.abs(game - BG).sum(axis=2) - 0.05) / 0.14, 0, 1)
rgba = np.dstack([game, alpha])
SPRITES = {
    "dino": (165, 525, 387, 741), "cactus": (608, 528, 754, 741), "gifts": (882, 620, 1082, 741),
    "bird": (1162, 412, 1290, 536), "star": (1456, 566, 1522, 630), "tree": (1616, 506, 1774, 741),
    "cloud": (122, 296, 270, 350), "sun": (1490, 178, 1700, 310), "hearts": (1538, 60, 1706, 106), "score": (1284, 36, 1412, 68),
}
for name, (x0, y0, x1, y1) in SPRITES.items():
    Image.fromarray((rgba[y0:y1, x0:x1] * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, f"game_{name}.png"))
print("wrote", sorted(os.listdir(OUT)))
