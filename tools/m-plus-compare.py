#!/usr/bin/env python3
"""
Compares M Sport Plus's middle with the picture it is traced from.

  python3 tools/m-plus-compare.py [--out build/m-plus-compare]

The picture (docs/ref/m-plus-reference.jpg, 2576 x 967) is carried into the
M artboard by the two scales its plates were (0.702 across about the dials'
axis, 1 / 1.4952 down: src/theme/mgeom.js, PLUS), the style is rendered on
the artboard 1:1, and these are written:

  reference.png   the picture, on the artboard
  render.png      ours
  overlay.png     the two at 50 % each
  middle.png      the middle alone: the picture | ours | overlay, one above the other
  plates.png      plate or not: grey where both agree, magenta the picture's only, green ours only

and it prints how much of the unshadowed half of the middle the two agree
on. Only the middle is expected to match: the dials, figures, strips and
footer are M Sport's (the M View photograph's), and the picture's own list
of driving modes is what the map takes the place of. The left of the
picture lies in a shadow, which is not drawn.
"""
import argparse
import pathlib
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = ROOT / "docs" / "ref" / "m-plus-reference.jpg"
# the picture -> the artboard (docs/ref/M-PLUS-MEASUREMENTS.md)
AX, CX, K = 903.8, 1299.4, 0.702          # the dials' axis in each, and the scale across
Y_ART, Y_PIC, FY = 70.1, 142.0, 1.4952    # the top line in each, and picture px per unit down
W, H = 1726, 612


def to_artboard(pic):
    ya, xa = np.mgrid[0:H, 0:W].astype(float)
    sx = CX + (xa + 0.5 - AX) / K - 0.5
    sy = Y_PIC + (ya + 0.5 - Y_ART) * FY - 0.5
    src = np.asarray(pic.convert("RGB")).astype(float)
    out = np.stack([ndimage.map_coordinates(src[..., c], [sy, sx], order=1, mode="constant", cval=0)
                    for c in range(3)], axis=-1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def plate(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > 30) & (b > 1.3 * r) & (b > 1.05 * g)
    red = (r > 70) & (r > 1.6 * g) & (b < 140) & (g < 110)       # the red stripe is plate too
    return blue | red


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "build" / "m-plus-compare"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    shot = str(out / "shot.png")
    # the fixture's readings, the car's size of numerals, no lamps: only the middle differs from M Sport
    query = "fixture=m&style=mplus&freeze=1&strip=off&art=native&mFixture=off&mPop=off"
    subprocess.check_call(["node", "tools/shot.js", shot, query], cwd=str(ROOT), stdout=subprocess.DEVNULL)
    ref = to_artboard(Image.open(REF))
    ren = Image.open(shot).convert("RGB").crop((0, 0, W, H))
    ref.save(out / "reference.png")
    ren.save(out / "render.png")
    Image.blend(ref, ren, 0.5).save(out / "overlay.png")

    box = (280, 90, 1520, 480)
    a, b = ref.crop(box), ren.crop(box)
    sheet = Image.new("RGB", (a.size[0], a.size[1] * 3 + 16), (60, 60, 60))
    for i, t in enumerate((a, b, Image.blend(a, b, 0.5))):
        sheet.paste(t, (0, i * (a.size[1] + 8)))
    sheet.save(out / "middle.png")

    R, N = np.asarray(ref).astype(float), np.asarray(ren).astype(float)
    ys, xs = np.mgrid[0:H, 0:W]
    # the unshadowed half of the middle, leaving out a band round every white figure and word in either
    bright = (R.min(axis=2) > 115) | (N.min(axis=2) > 115)
    m = (ys > 100) & (ys < 475) & (xs > 905) & (xs < 1500) & ~ndimage.binary_dilation(bright, iterations=6)
    pr, pn = plate(R), plate(N)
    agree = float((pr == pn)[m].mean())
    iou = float((pr & pn & m).sum()) / float(((pr | pn) & m).sum())
    vis = np.zeros(R.shape, np.uint8)
    vis[..., 1] = (pn & m) * 160
    vis[..., 0] = (pr & m) * 160
    vis[..., 2] = (pr & m) * 160
    Image.fromarray(vis).crop((880, 90, 1520, 480)).save(out / "plates.png")
    print("the middle's unshadowed half: plate or not agrees on %.1f %% of it; the plates overlap by %.1f %%"
          % (agree * 100, iou * 100))
    print("wrote", out)


if __name__ == "__main__":
    sys.exit(main())
