#!/usr/bin/env python3
"""
Compares the M style's render with the reference frame it is traced from.

  python3 tools/m-compare.py [--shot build/x.png] [--query "..."] [--out build/m-compare]

With no --shot it takes one of the preview's reference fixture
(preview/index.html?fixture=m: 0 km/h, P, 12:04 pm, 207 km, 4WD, +12.5 C and
the lamps of docs/ref/m-view-reference.jpg), rendered on the reference's own
1726 x 612 artboard, one render pixel to one pixel of the photograph
(art=native: nothing is resampled). With --panel it takes the 1920 x 720
panel as the car shows it instead, and maps that back to the artboard
(src/theme/mgeom.js ART). Either way it writes the pictures the guide asks
for (docs/ref/M-VIEW-SPEC.md, section 11):

  reference.png   the photograph
  render.png      ours, on the same artboard
  overlay.png     the two at 50 % each
  edges.png       edges only: the photograph's magenta, ours green, both white
  colour.png      absolute RGB difference, x2
  blink.gif       the two alternating
  A.png .. D.png  the guide's four study regions, photograph | ours | overlay
  zoom-*.png      the figures and symbols the guide names, at 400 %
  points.png      the control points (tools/m-points.js) on the overlay at
                  200 %: green where the photograph is within 2 px of ours,
                  red where it is not, blue for anchors (not measured)

and prints how far apart they are: mean colour difference per region, how
many of each picture's edges have a partner within 2 px in the other, and at
each control point how far the photograph's picture sits from ours.

The photograph is a hand-held shot of a curved display: grain, moire in the
plates and 1 - 2 px of perspective are in it and not in the render, so the
numbers never reach zero. They are for comparing one build with the next.
"""
import argparse
import json
import pathlib
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = ROOT / "docs" / "ref" / "m-view-reference.jpg"
REGIONS = {  # the guide's crops, (x, y, w, h)
    "A": (130, 58, 620, 510), "B": (665, 115, 440, 440),
    "C": (1010, 57, 650, 510), "D": (75, 482, 1610, 130),
}
ZOOMS = {  # what the guide wants seen at 400 % (section 11.4), (x, y, w, h)
    "0": (520, 232, 110, 76), "P": (1250, 232, 116, 76), "330": (160, 78, 120, 44),
    "8": (1536, 76, 60, 44), "limit": (562, 518, 84, 78), "fuel": (440, 432, 60, 44),
    "oil": (1306, 432, 64, 40), "4wd": (892, 540, 100, 40), "clock": (120, 552, 170, 46),
}
NATIVE = {"w": 1726, "h": 612, "s": 1.0, "ox": 0.0, "oy": 0.0}


def art():
    out = subprocess.check_output(
        ["node", "-e", "console.log(JSON.stringify(require('./src/theme/mgeom.js').ART))"], cwd=str(ROOT))
    return json.loads(out)


def to_artboard(shot, a):
    """the screenshot -> the reference's 1726 x 612"""
    if a["s"] == 1 and a["ox"] == 0 and a["oy"] == 0:
        return shot.convert("RGB").crop((0, 0, a["w"], a["h"]))        # already 1:1: only cut out
    box = (a["ox"], a["oy"], a["ox"] + a["w"] * a["s"], a["oy"] + a["h"] * a["s"])
    return shot.convert("RGB").resize((a["w"], a["h"]), Image.LANCZOS, box=box)


def offset_at(ref, ren, x, y, r=10, reach=4):
    """
    How far the photograph's picture around (x, y) sits from ours: the
    smallest shift (whole px, up to `reach`) at which the two patches agree
    as well as they ever do. Agreement is normalised correlation, so the
    photograph's grain, glow and exposure do not count - only where the
    shapes are. Along a straight edge every shift agrees equally well, which
    is why the smallest one is taken: the distance across the edge.
    Returns (shift in px, how well they agree at their best: 0..1).
    """
    h, w = ref.shape
    xi, yi = int(round(x)), int(round(y))
    if xi - r - reach < 0 or yi - r - reach < 0 or xi + r + reach >= w or yi + r + reach >= h:
        return None
    a = ren[yi - r:yi + r + 1, xi - r:xi + r + 1]
    a = a - a.mean()
    na = np.sqrt((a * a).sum())
    if na < 1e-6:
        return None
    best, scores = -2.0, []
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            b = ref[yi + dy - r:yi + dy + r + 1, xi + dx - r:xi + dx + r + 1]
            b = b - b.mean()
            nb = np.sqrt((b * b).sum())
            c = float((a * b).sum() / (na * nb)) if nb > 1e-6 else -1.0
            scores.append((c, float(np.hypot(dx, dy))))
            best = max(best, c)
    return min(d for c, d in scores if c >= best - 0.015), best


def control_points():
    out = subprocess.check_output(["node", "tools/m-points.js", "--json"], cwd=str(ROOT))
    return json.loads(out)


def edges(img, sigma=1.0, thr=22.0):
    """a thin binary edge map: gradient magnitude of the smoothed luminance, thresholded"""
    g = np.asarray(img.convert("L")).astype(float)
    g = ndimage.gaussian_filter(g, sigma)
    mag = np.hypot(ndimage.sobel(g, axis=1), ndimage.sobel(g, axis=0)) / 4.0
    return mag > thr


def partner(a, b, tol=2):
    """the share of a's edge pixels with an edge of b within tol px"""
    if not a.any():
        return 1.0
    near = ndimage.binary_dilation(b, structure=np.ones((2 * tol + 1, 2 * tol + 1)))
    return float((a & near).sum()) / float(a.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot")
    ap.add_argument("--query", default="fixture=m&freeze=1&strip=off")
    ap.add_argument("--panel", action="store_true", help="compare the 1920 x 720 panel, mapped back to the artboard")
    ap.add_argument("--out", default=str(ROOT / "build" / "m-compare"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    shot = args.shot
    if not shot:
        shot = str(out / "shot.png")
        query = args.query if args.panel else args.query + "&art=native"
        subprocess.check_call(["node", "tools/shot.js", shot, query], cwd=str(ROOT),
                              stdout=subprocess.DEVNULL)
    a = art() if args.panel else NATIVE
    ref = Image.open(REF).convert("RGB")
    assert ref.size == (a["w"], a["h"]), "the reference is not the artboard's size"
    ren = to_artboard(Image.open(shot), a)

    ref.save(out / "reference.png")
    ren.save(out / "render.png")
    Image.blend(ref, ren, 0.5).save(out / "overlay.png")
    ref.save(out / "blink.gif", save_all=True, append_images=[ren], duration=600, loop=0)

    R = np.asarray(ref).astype(float)
    N = np.asarray(ren).astype(float)
    diff = np.abs(R - N)
    Image.fromarray(np.clip(diff * 2, 0, 255).astype(np.uint8)).save(out / "colour.png")

    er, en = edges(ref), edges(ren)
    e = np.zeros(R.shape, dtype=np.uint8)
    e[..., 0] = er * 255
    e[..., 2] = er * 255          # the photograph: magenta
    e[..., 1] = en * 255          # ours: green; both: white
    Image.fromarray(e).save(out / "edges.png")

    print("%-9s %9s %12s %12s" % ("region", "colour", "ref edges", "our edges"))
    rows = [("all", (0, 0, a["w"], a["h"]))] + sorted(REGIONS.items())
    report = {}
    for name, (x, y, w, h) in rows:
        sl = (slice(y, y + h), slice(x, x + w))
        c = float(diff[sl].mean())
        p1, p2 = partner(er[sl], en[sl]), partner(en[sl], er[sl])
        report[name] = {"colour": round(c, 2), "refEdgesMatched": round(p1, 3), "ourEdgesMatched": round(p2, 3)}
        print("%-9s %9.2f %11.1f%% %11.1f%%" % (name, c, p1 * 100, p2 * 100))
        if name != "all":
            cr, cn = ref.crop((x, y, x + w, y + h)), ren.crop((x, y, x + w, y + h))
            sheet = Image.new("RGB", (w * 3 + 16, h), (40, 40, 40))
            sheet.paste(cr, (0, 0))
            sheet.paste(cn, (w + 8, 0))
            sheet.paste(Image.blend(cr, cn, 0.5), (2 * w + 16, 0))
            sheet.save(out / (name + ".png"))

    # the figures and symbols the guide names, at 400 %
    for name, (x, y, w, h) in ZOOMS.items():
        cr, cn = ref.crop((x, y, x + w, y + h)), ren.crop((x, y, x + w, y + h))
        tiles = [t.resize((w * 4, h * 4), Image.BICUBIC) for t in (cr, cn, Image.blend(cr, cn, 0.5))]
        sheet = Image.new("RGB", (w * 12 + 16, h * 4), (60, 60, 60))
        for i, t in enumerate(tiles):
            sheet.paste(t, (i * (w * 4 + 8), 0))
        sheet.save(out / ("zoom-" + name + ".png"))

    # the control points: how far the photograph's picture at each one sits from ours
    lum = lambda im: ndimage.gaussian_filter(np.asarray(im.convert("L")).astype(float), 1.0)
    Lr, Ln = lum(ref), lum(ren)
    marks = Image.blend(ref, ren, 0.5).resize((a["w"] * 2, a["h"] * 2), Image.BICUBIC)
    px = marks.load()
    rows, far, weak = [], [], []
    for p in control_points():
        on = p["kind"] != "anchor"
        m = offset_at(Lr, Ln, p["x"], p["y"]) if on else None
        ok = True
        if on and m is not None:
            d, agree = m
            if agree < 0.5:
                weak.append((p["id"], round(agree, 2)))       # too little in common to measure: not counted
                col = (255, 200, 60)
            else:
                rows.append((p["id"], d))
                ok = d <= 2.0
                if not ok:
                    far.append((p["id"], round(d, 1)))
                col = (60, 255, 90) if ok else (255, 60, 60)
        else:
            col = (150, 160, 255)
        cx, cy = int(round(p["x"] * 2)), int(round(p["y"] * 2))
        for k in range(-5, 6):
            for (ux, uy) in ((cx + k, cy), (cx, cy + k)):
                if 0 <= ux < marks.size[0] and 0 <= uy < marks.size[1]:
                    px[ux, uy] = col
    marks.save(out / "points.png")
    d = np.array([r[1] for r in rows])
    report["controlPoints"] = {
        "measured": len(rows), "within1px": int((d <= 1.0).sum()), "within2px": int((d <= 2.0).sum()),
        "meanPx": round(float(d.mean()), 2), "worstPx": round(float(d.max()), 2),
        "beyond2px": far, "notMeasurable": weak,
    }
    print("control points measured: %d; the photograph within 1 px of ours at %d, within 2 px at %d; "
          "mean %.2f px, worst %.2f px" % (len(rows), int((d <= 1.0).sum()), int((d <= 2.0).sum()), d.mean(), d.max()))
    for f in far:
        print("   beyond 2 px: %-16s %.1f px" % f)
    if weak:
        print("   not measurable (the photograph and ours share too little there): " +
              ", ".join("%s (%.2f)" % w for w in weak))
    (out / "report.json").write_text(json.dumps(report, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    sys.exit(main())
