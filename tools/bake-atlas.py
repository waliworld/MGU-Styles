#!/usr/bin/env python3
"""
Bakes an SDF (signed distance field) glyph atlas.

One atlas serves every piece of text on the cluster. An SDF stays crisp at
any size, so the huge centre gear glyph and a 16 px label come from the same
texture - which matters because cluster-render allows only 16 assets per
client (docs/CLUSTER-CONSTRAINTS.md section 5).

Faces may carry a slant. The Huracan's dial numerals, gear character and
speed are all inclined (Huracan_Corsa guide, sections 4, 5 and 10), so the
shear is baked into the glyph rather than applied in the shader: the field
then describes the real shape and the metrics come out right.

Output: assets/fonts/atlas.png     (R = distance, 128 = the glyph edge)
        assets/fonts/atlas.r8.gz   (the same bytes raw, for the head unit)
        assets/fonts/atlas.json    (per-glyph uv + metrics, in em units)

Run after tools/fetch-fonts.sh. Deterministic: same fonts in, same bytes out.
"""
import gzip
import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "build" / "fonts"
OUT = ROOT / "assets" / "fonts"

RASTER = 256            # cell resolution for one em before downsampling
SUPER = 4               # supersample while rasterising
SPREAD = 10             # distance range, in final-atlas pixels
DOWN = 4                # RASTER -> cell size
PAD = SPREAD + 2

DIGITS = "0123456789"
# id -> (file, characters, slant in degrees)
FACES = {
    # upright, for small readouts and labels
    "display": ("saira-latin-600-normal.ttf", DIGITS + "-.:/%°+", 0.0),
    "label": ("barlow-condensed-latin-600-normal.ttf",
              DIGITS + "ABCDEFGHIJKLMNOPQRSTUVWXYZ.:-/%+° ", 0.0),
    "labelL": ("barlow-condensed-latin-500-normal.ttf",
               DIGITS + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
               "abcdefghijklmnopqrstuvwxyz.:-/%+° ", 0.0),
    # inclined, for the dial itself
    "dial": ("saira-latin-500-normal.ttf", DIGITS, 11.0),
    "gear": ("saira-latin-700-normal.ttf", DIGITS + "PRNDSM", 17.0),
    # the Track theme: heavy, squared, clipped corners (TBW brief section 2)
    "track": ("chakra-petch-latin-700-normal.ttf", DIGITS + "PRNDSM", 0.0),
    # the M style (iDrive 8): wide squared figures, flat strokes, upright
    "mnum": ("saira-semi-condensed-latin-700-normal.ttf", DIGITS + "PRNDSM+-.", 0.0),
}


def glyph_sdf(path, ch, slant_deg):
    """Rasterise one glyph (optionally sheared about its baseline) and return
    (sdf cell, metrics). Metrics come from the drawn pixels, not the font's
    own box, so a sheared glyph measures correctly."""
    em = RASTER * SUPER
    font = ImageFont.truetype(str(path), em)
    advance = font.getlength(ch) / em

    k = math.tan(math.radians(slant_deg))
    pad = (PAD + 2) * DOWN * SUPER
    lean = int(abs(k) * em * 1.4)
    w = int(font.getlength(ch)) + pad * 2 + lean * 2 + em
    h = int(em * 2.6) + pad * 2
    ox, oy = pad + lean, int(h - pad - em * 0.6)      # pen on the baseline

    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((ox, oy), ch, font=font, fill=255, anchor="ls")
    if k:
        # output(x, y) samples input(x + k*y - k*oy): the top leans right.
        img = img.transform((w, h), Image.AFFINE, (1, k, -k * oy, 0, 1, 0),
                            resample=Image.BICUBIC)

    small = img.resize((w // SUPER, h // SUPER), Image.LANCZOS)
    a = np.asarray(small, dtype=np.float32) / 255.0
    inside = a > 0.5
    if not inside.any():
        return None, {"adv": advance, "w": 0, "h": 0, "bx": 0, "by": 0}

    ys, xs = np.nonzero(a > 0.02)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    p = PAD
    x0, y0 = max(0, x0 - p), max(0, y0 - p)
    x1 = min(a.shape[1], x1 + p)
    y1 = min(a.shape[0], y1 + p)
    cell = inside[y0:y1, x0:x1]

    d_out = distance_transform_edt(~cell)
    d_in = distance_transform_edt(cell)
    sd = np.clip(((d_in - d_out) / DOWN) / SPREAD, -1.0, 1.0)
    img8 = ((sd * 0.5 + 0.5) * 255.0).astype(np.uint8)
    img8 = np.asarray(Image.fromarray(img8).resize(
        (max(1, img8.shape[1] // DOWN), max(1, img8.shape[0] // DOWN)),
        Image.LANCZOS))

    emS = em / SUPER
    return img8, {
        "adv": advance,
        "w": (x1 - x0) / emS, "h": (y1 - y0) / emS,
        "bx": (x0 - ox / SUPER) / emS, "by": (y0 - oy / SUPER) / emS,
    }


def main():
    if not FONTS.is_dir():
        sys.exit("run tools/fetch-fonts.sh first")
    OUT.mkdir(parents=True, exist_ok=True)

    cells, meta = [], {}
    for face, (fname, chars, slant) in FACES.items():
        path = FONTS / fname
        meta[face] = {"source": fname, "slant": slant, "glyphs": {}}
        for ch in chars:
            cell, m = glyph_sdf(path, ch, slant)
            if cell is not None:
                cells.append((face, ch, cell))
            meta[face]["glyphs"][ch] = m

    cells.sort(key=lambda c: -c[2].shape[0])
    for size in (512, 1024, 2048, 4096):
        placed, x, y, shelf = {}, 1, 1, 0
        ok = True
        for face, ch, cell in cells:
            ch_h, ch_w = cell.shape
            if x + ch_w + 1 > size:
                x, y, shelf = 1, y + shelf + 1, 0
            if y + ch_h + 1 > size:
                ok = False
                break
            placed[(face, ch)] = (x, y)
            x += ch_w + 1
            shelf = max(shelf, ch_h)
        if ok:
            break
    else:
        sys.exit("atlas does not fit 4096x4096")

    atlas = np.zeros((size, size), dtype=np.uint8)
    for face, ch, cell in cells:
        x, y = placed[(face, ch)]
        ch_h, ch_w = cell.shape
        atlas[y:y + ch_h, x:x + ch_w] = cell
        g = meta[face]["glyphs"][ch]
        g["u"], g["v"], g["tw"], g["th"] = x, y, ch_w, ch_h

    Image.fromarray(atlas, "L").save(OUT / "atlas.png", optimize=True)
    with gzip.GzipFile(str(OUT / "atlas.r8.gz"), "wb", compresslevel=9, mtime=0) as f:
        f.write(atlas.tobytes())
    (OUT / "atlas.json").write_text(json.dumps(
        {"size": size, "spread": SPREAD, "emPx": RASTER // DOWN, "faces": meta},
        separators=(",", ":"), sort_keys=True))
    used = int((atlas > 0).sum()) / (size * size) * 100
    print("atlas %dx%d  %d glyphs  %.0f%% covered  png %d KB  r8.gz %d KB"
          % (size, size, len(cells), used,
             (OUT / "atlas.png").stat().st_size // 1024,
             (OUT / "atlas.r8.gz").stat().st_size // 1024))


if __name__ == "__main__":
    main()
