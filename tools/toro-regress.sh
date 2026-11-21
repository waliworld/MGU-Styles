#!/bin/sh
# Renders a fixed set of Toro frames with the preview in a checkout.
#   sh tools/toro-regress.sh <checkout> <outdir>
# Used to prove a change left Toro alone: render the release before (a
# worktree of its tag) and the working tree after, and compare the files.
set -e
SRC="$1"; OUT="$2"; mkdir -p "$OUT"
i=0
for Q in \
  "t=9&freeze=1&strip=off" \
  "t=3&freeze=1&strip=off&rpm=7000" \
  "t=9&freeze=1&strip=off&background=modern&accent=blu&numeralFill=on" \
  "t=9&freeze=1&strip=off&background=revuelto&accent=magenta&accentScope=full" \
  "t=9&freeze=1&strip=off&holiday=on&centre=waze&show=map" \
  "t=9&freeze=1&strip=off&intro=on&since=11.6" \
  "t=5&freeze=1&strip=off&units=metric&shiftStyle=gt3&rpm=6600" \
  "t=5&freeze=1&strip=off&shiftStyle=blade&showAuxLeft=off&showBoost=off&ambient=20FF80"
do
  i=$((i+1))
  (cd "$SRC" && node tools/shot.js "$OUT/toro-$i.png" "$Q" >/dev/null 2>&1) || { echo "render $i failed"; exit 1; }
done
echo "rendered $i Toro frames from $SRC into $OUT"
