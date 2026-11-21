#!/usr/bin/env python3
"""
Enlarged tiles around control points of the comparison: the photograph, ours
and the two overlaid, a row a point, pixels shown as pixels.

  python3 tools/m-near.py out.png P.RL2.0 R.top.end ...     (ids from tools/m-points.js)

Reads build/m-compare (run tools/m-compare.py first).
"""
import json
import pathlib
import subprocess
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "build" / "m-compare"
pts = {p["id"]: p for p in json.loads(subprocess.check_output(["node", "tools/m-points.js", "--json"], cwd=str(ROOT)))}
out, ids = sys.argv[1], sys.argv[2:]
ref = Image.open(D / "reference.png").convert("RGB")
ren = Image.open(D / "render.png").convert("RGB")
half, s = 22, 6
w = half * 2 * s
sheet = Image.new("RGB", ((w + 6) * 3, (w + 6) * len(ids)), (60, 60, 60))
for i, pid in enumerate(ids):
    x, y = int(round(pts[pid]["x"])), int(round(pts[pid]["y"]))
    box = (x - half, y - half, x + half, y + half)
    a, b = ref.crop(box), ren.crop(box)
    for j, t in enumerate((a, b, Image.blend(a, b, 0.5))):
        t = t.resize((w, w), Image.NEAREST)
        # a cross-hair on the point itself
        px = t.load()
        for k in range(-s * 3, s * 3 + 1):
            for (ux, uy) in ((w // 2 + k, w // 2), (w // 2, w // 2 + k)):
                px[ux, uy] = (255, 255, 0)
        sheet.paste(t, (j * (w + 6), i * (w + 6)))
sheet.save(out)
print("wrote", out, sheet.size)
