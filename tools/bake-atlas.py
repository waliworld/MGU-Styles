#!/usr/bin/env python3
"""
Bakes an SDF (signed distance field) glyph atlas.

One atlas serves every piece of text on the cluster. An SDF stays crisp at
any size, so the huge centre gear digit and a 16 px label come from the same
texture - which matters because cluster-render allows only 16 assets per
client (docs/CLUSTER-CONSTRAINTS.md section 5).

Output: assets/fonts/atlas.png  (R = distance, 128 = the glyph edge)
        assets/fonts/atlas.json (per-glyph uv + metrics, in em units)

Run after tools/fetch-fonts.sh. Deterministic: same fonts in, same bytes out.
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "build" / "fonts"
OUT = ROOT / "assets" / "fonts"

# Rasterise this tall, then take the distance field. Big enough that the
# distance field is smooth; the atlas is downsampled after.
RASTER = 256
SUPER = 4               # supersample while rasterising
SPREAD = 10             # distance range in final-atlas pixels
DOWN = 4                # RASTER -> cell size
PAD = SPREAD + 2

# The faces the theme uses. Keep this list short: every face multiplies the
# atlas area, and the whole thing has to fit one texture.
FACES = {
    # id            file                                       characters
    "display": ("saira-latin-600-normal.ttf", "0123456789-.:/"),
    "displayB": ("saira-latin-700-normal.ttf", "0123456789PRNDSM"),
    "label": ("barlow-condensed-latin-600-normal.ttf",
              "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.:-/%+° "),
    "labelL": ("barlow-condensed-latin-500-normal.ttf",
               "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.:-/%+° "),
}


def glyph_sdf(font, ch):
    """Rasterise one glyph supersampled and return (sdf_cell, metrics)."""
    big = ImageFont.truetype(str(font), RASTER * SUPER)
    l, t, r, b = big.getbbox(ch, anchor="ls")
    advance = big.getlength(ch) / (RASTER * SUPER)
    if r <= l or b <= t:  # blank glyph, e.g. space
        return None, {"adv": advance, "w": 0, "h": 0, "bx": 0, "by": 0}

    padb = PAD * DOWN * SUPER
    w, h = r - l + padb * 2, b - t + padb * 2
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((-l + padb, -t + padb), ch, font=big, fill=255, anchor="ls")
    img = img.resize((max(1, w // SUPER), max(1, h // SUPER)), Image.LANCZOS)

    a = np.asarray(img, dtype=np.float32) / 255.0
    inside = a > 0.5
    if not inside.any():
        return None, {"adv": advance, "w": 0, "h": 0, "bx": 0, "by": 0}

    # Signed distance in cell pixels, then in final-atlas pixels.
    d_out = distance_transform_edt(~inside)
    d_in = distance_transform_edt(inside)
    sd = (d_in - d_out) / DOWN
    sd = np.clip(sd / SPREAD, -1.0, 1.0)
    cell = ((sd * 0.5 + 0.5) * 255.0).astype(np.uint8)
    cell = np.asarray(
        Image.fromarray(cell).resize(
            (max(1, cell.shape[1] // DOWN), max(1, cell.shape[0] // DOWN)),
            Image.LANCZOS))

    # Metrics in em units, relative to the pen on the baseline, y down.
    em = RASTER * SUPER
    return cell, {
        "adv": advance,
        "w": (r - l + padb * 2) / em,
        "h": (b - t + padb * 2) / em,
        "bx": (l - padb) / em,
        "by": (t - padb) / em,
    }


def main():
    if not FONTS.is_dir():
        sys.exit("run tools/fetch-fonts.sh first")
    OUT.mkdir(parents=True, exist_ok=True)

    cells, meta = [], {}
    for face, (fname, chars) in FACES.items():
        path = FONTS / fname
        meta[face] = {"source": fname, "glyphs": {}}
        for ch in chars:
            cell, m = glyph_sdf(path, ch)
            if cell is not None:
                cells.append((face, ch, cell))
            meta[face]["glyphs"][ch] = m

    # Shelf-pack, widest first, into the smallest power-of-two square.
    cells.sort(key=lambda c: -c[2].shape[0])
    for size in (512, 1024, 2048, 4096):
        placed, x, y, shelf = {}, 1, 1, 0
        ok = True
        for face, ch, cell in cells:
            h, w = cell.shape
            if x + w + 1 > size:
                x, y, shelf = 1, y + shelf + 1, 0
            if y + h + 1 > size:
                ok = False
                break
            placed[(face, ch)] = (x, y)
            x += w + 1
            shelf = max(shelf, h)
        if ok:
            break
    else:
        sys.exit("atlas does not fit 4096x4096")

    atlas = np.full((size, size), 0, dtype=np.uint8)  # 0 = fully outside
    for face, ch, cell in cells:
        x, y = placed[(face, ch)]
        h, w = cell.shape
        atlas[y:y + h, x:x + w] = cell
        g = meta[face]["glyphs"][ch]
        g["u"], g["v"], g["tw"], g["th"] = x, y, w, h

    Image.fromarray(atlas, "L").save(OUT / "atlas.png", optimize=True)
    # The head unit takes the atlas as a raw r8 asset. Shipping the bytes
    # gzipped means the app needs zlib and no PNG decoder.
    import gzip
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
