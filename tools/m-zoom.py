#!/usr/bin/env python3
"""
A close look at one part of the comparison: the photograph, ours and the two
overlaid, side by side and enlarged.

  python3 tools/m-zoom.py x y w h [scale] [out.png]     (artboard units)

Reads build/m-compare (run tools/m-compare.py first).
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "build" / "m-compare"
x, y, w, h = [int(v) for v in sys.argv[1:5]]
s = int(sys.argv[5]) if len(sys.argv) > 5 else 4
out = sys.argv[6] if len(sys.argv) > 6 else str(D / "zoom.png")
ref = Image.open(D / "reference.png").convert("RGB").crop((x, y, x + w, y + h))
ren = Image.open(D / "render.png").convert("RGB").crop((x, y, x + w, y + h))
tiles = [ref, ren, Image.blend(ref, ren, 0.5)]
tiles = [t.resize((w * s, h * s), Image.BICUBIC) for t in tiles]
stack = h * s * 3 + 16 <= 1400 and w * s > 900       # wide strips go one above the other
if stack:
    sheet = Image.new("RGB", (w * s, h * s * 3 + 16), (60, 60, 60))
    for i, t in enumerate(tiles):
        sheet.paste(t, (0, i * (h * s + 8)))
else:
    sheet = Image.new("RGB", (w * s * 3 + 16, h * s), (60, 60, 60))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * (w * s + 8), 0))
sheet.save(out)
print("wrote", out, sheet.size)
