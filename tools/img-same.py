#!/usr/bin/env python3
"""img-same.py dirA dirB  - are the PNGs of the same name pixel-identical? Prints the largest difference of each."""
import pathlib
import sys

import numpy as np
from PIL import Image

a, b = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
worst = 0
for f in sorted(a.glob("*.png")):
    g = b / f.name
    if not g.exists():
        print("%-14s missing in %s" % (f.name, b))
        worst = 255
        continue
    x = np.asarray(Image.open(f).convert("RGB")).astype(int)
    y = np.asarray(Image.open(g).convert("RGB")).astype(int)
    d = np.abs(x - y)
    n = int((d.max(axis=2) > 0).sum())
    print("%-14s max difference %3d   pixels that differ %d" % (f.name, d.max(), n))
    worst = max(worst, int(d.max()))
print("identical" if worst == 0 else "DIFFERENT (largest difference %d of 255)" % worst)
sys.exit(0 if worst == 0 else 1)
