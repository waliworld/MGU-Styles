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
#
# The faces as they stood at Beta 1, in that order. They are packed first,
# exactly as then, so every glyph Toro draws keeps its place in the atlas
# and Toro renders bit for bit as it did (tools/toro-regress.sh). Three of
# them belonged to the first M style and nothing draws them now: they are
# packed for their place only (LEGACY) - no pixels, no metadata.
FROZEN = {
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
    "track": ("chakra-petch-latin-700-normal.ttf", DIGITS + "PRNDSM", 0.0),
    "mnum": ("saira-semi-condensed-latin-700-normal.ttf", DIGITS + "PRNDSM+-.", 0.0),
    # the start-up message: wide and geometric, as Lamborghini letters its cars
    "lambo": ("michroma-latin-400-normal.ttf",
              DIGITS + "ABCDEFGHIJKLMNOPQRSTUVWXYZ.,'!?&-:+ ", 0.0),
}
LEGACY = ("labelL", "track", "mnum")
FROZEN_SIZE = 1024

# Faces added since, packed after the frozen block.
#
# The M View (docs/ref): its own figures and symbols, traced in
# tools/mglyphs.py - wide for the dials and readouts, narrower for the
# footer and the strips' labels. Its words (km/h, mph, pm ...) are Inter
# Tight, which sets them to the reference's widths within a pixel
# (docs/ref/MEASUREMENTS.md).
ADDED = {
    "mw": ("@mw", DIGITS + "PRNDSM", 0.0),
    "mn": ("@mn", DIGITS + ":.+-/", 0.0),
    "mi": ("@mi", "fromblscgte", 0.0),
    "ms": ("inter-tight-latin-400-normal.ttf",
           DIGITS + "abcdefghijklmnopqrstuvwxyzCFLIMT/°. ", 0.0),
    # the heavy capitals of the footer's panel: "WD", or the driving mode
    "mb": ("barlow-semi-condensed-latin-700-normal.ttf",
           DIGITS + "ABCDEFGHIJKLMNOPQRSTUVWXYZ+- ", 0.0),
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

    return cell_from_image(img, ox, oy, advance)


def cell_from_image(img, ox, oy, advance):
    """An alpha image drawn at RASTER * SUPER px per em, its pen at (ox, oy),
    -> (sdf cell, metrics). Shared by the fonts and the drawn glyphs."""
    em = RASTER * SUPER
    w, h = img.size
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


def drawn_glyph(face, ch):
    """A glyph of tools/mglyphs.py: a figure of the M View's own hand, or one
    of its symbols."""
    import mglyphs
    assert mglyphs.EM == RASTER * SUPER
    if face == "mi":
        img, ox, oy, adv = mglyphs.icon_glyph(ch)
    else:
        img, ox, oy, adv = mglyphs.figure_glyph(mglyphs.FIGURES[face][0], ch)
    return cell_from_image(img, ox, oy, adv)


def main():
    if not FONTS.is_dir():
        sys.exit("run tools/fetch-fonts.sh first")
    OUT.mkdir(parents=True, exist_ok=True)

    def bake(faces):
        cells, meta = [], {}
        for face, (fname, chars, slant) in faces.items():
            path = FONTS / fname
            meta[face] = {"source": fname, "slant": slant, "glyphs": {}}
            for ch in chars:
                if fname.startswith("@"):
                    cell, m = drawn_glyph(fname[1:], ch)
                else:
                    cell, m = glyph_sdf(path, ch, slant)
                if cell is not None:
                    cells.append((face, ch, cell))
                meta[face]["glyphs"][ch] = m
        cells.sort(key=lambda c: -c[2].shape[0])
        return cells, meta

    def pack(cells, size, y0):
        """shelves of cells from row y0 down -> ({(face, ch): (x, y)}, next free row) or None"""
        placed, x, y, shelf = {}, 1, y0, 0
        for face, ch, cell in cells:
            ch_h, ch_w = cell.shape
            if x + ch_w + 1 > size:
                x, y, shelf = 1, y + shelf + 1, 0
            if y + ch_h + 1 > size:
                return None
            placed[(face, ch)] = (x, y)
            x += ch_w + 1
            shelf = max(shelf, ch_h)
        return placed, y + shelf + 1

    size = FROZEN_SIZE
    old_cells, meta = bake(FROZEN)
    packed = pack(old_cells, size, 1)
    if packed is None:
        sys.exit("the frozen faces no longer fit %d: the fonts have changed" % size)
    placed, free = packed
    new_cells, new_meta = bake(ADDED)
    packed = pack(new_cells, size, free)
    if packed is None:
        sys.exit("the added faces do not fit under the frozen block (from row %d of %d)" % (free, size))
    placed.update(packed[0])
    meta.update(new_meta)
    for face in LEGACY:
        del meta[face]

    cells = [c for c in old_cells if c[0] not in LEGACY] + new_cells
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
    print("atlas %dx%d  %d glyphs  %.0f%% covered  rows used %d  png %d KB  r8.gz %d KB"
          % (size, size, len(cells), used, packed[1],
             (OUT / "atlas.png").stat().st_size // 1024,
             (OUT / "atlas.r8.gz").stat().st_size // 1024))


if __name__ == "__main__":
    main()
