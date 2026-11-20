#!/usr/bin/env python3
"""The app's 140x140 iDrive tile: the dial's sweep, its stepped contour and a
hollow red P, drawn from the same geometry as the cluster. Deterministic."""
import math, pathlib, sys
from PIL import Image, ImageDraw, ImageFont

S = 4                      # supersample
W = 140 * S
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, W - 1, W - 1], radius=26 * S, fill=(7, 11, 17, 255))

cx, cy, r = W / 2, W * 0.86, W * 0.62
a0, a1 = -178 + 17.2, -178 + 172.0          # the brief's sweep, degrees
def pt(deg, rr):
    return (cx + rr * math.cos(math.radians(deg)), cy + rr * math.sin(math.radians(deg)))

for i in range(0, 41):
    a = a0 + (a1 - a0) * i / 40
    major = i % 5 == 0
    col = (255, 38, 61, 255) if i > 34 else (232, 240, 246, 255)
    d.line([pt(a, r), pt(a, r - (14 if major else 8) * S)], fill=col, width=(3 if major else 2) * S // 2)
prev = None
for i in range(0, 161):
    t = i / 160.0
    f = (t * 8) % 1.0
    up = min(1, max(0, (f - 0.12) / 0.10)); dn = min(1, max(0, (f - 0.68) / 0.12))
    p = pt(a0 + (a1 - a0) * t, r * 0.80 + r * 0.035 * (up - dn))
    if prev:
        d.line([prev, p], fill=(255, 38, 61, 255) if t > 0.84 else (164, 178, 189, 255), width=S + 1)
    prev = p

font_path = pathlib.Path(__file__).resolve().parent.parent / 'build' / 'fonts' / 'saira-latin-700-normal.ttf'
if font_path.exists():
    font = ImageFont.truetype(str(font_path), 72 * S)
    glyph = Image.new('L', (W, W), 0)
    ImageDraw.Draw(glyph).text((W * 0.5, W * 0.66), 'P', font=font, fill=255, anchor='ms')
    glyph = glyph.transform((W, W), Image.AFFINE, (1, math.tan(math.radians(12)), -math.tan(math.radians(12)) * W * 0.66, 0, 1, 0), resample=Image.BICUBIC)
    from PIL import ImageFilter
    inner = glyph.filter(ImageFilter.MinFilter(4 * S + 1))
    ring = Image.eval(Image.composite(glyph, Image.new('L', (W, W), 0), glyph), lambda v: v)
    ring = Image.fromarray(__import__('numpy').clip(__import__('numpy').asarray(glyph, 'int16') - __import__('numpy').asarray(inner, 'int16'), 0, 255).astype('uint8'))
    red = Image.new('RGBA', (W, W), (255, 38, 61, 255))
    img.paste(red, (0, 0), ring)

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'app/icon.png')
img.resize((140, 140), Image.LANCZOS).save(out, optimize=True)
print('wrote', out)
