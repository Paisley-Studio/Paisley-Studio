"""Contact sheet of review stills: python production/sheet.py <dir> <out.jpg> [cols]"""
import os, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
fs = sorted((f for f in os.listdir(d) if f.startswith("f") and f.endswith(".jpg")), key=lambda f: int(f[1:-4]))
ims = [Image.open(os.path.join(d, f)) for f in fs]
w, h = 480, 270
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * h), "black")
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im.resize((w, h)), (x, y))
    dr.text((x + 6, y + 4), f"{int(f[1:-4]) / 30:.1f}s", fill="yellow")
sheet.save(out, quality=85)
