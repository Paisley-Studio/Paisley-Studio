"""Contact sheet of rendered stills: python production/sheet.py out.jpg f1.jpg f2.jpg ..."""
import sys
from PIL import Image, ImageDraw
files = sys.argv[2:]
ims = [Image.open(f).convert("RGB") for f in files]
w, h = 640, int(640 * ims[0].height / ims[0].width)
cols = 3
sheet = Image.new("RGB", (w * cols, h * ((len(ims) + cols - 1) // cols)), "black")
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im.resize((w, h)), (x, y))
    ImageDraw.Draw(sheet).text((x + 8, y + 6), f.split("/")[-1], fill="yellow")
sheet.save(sys.argv[1], quality=85)
