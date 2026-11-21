#!/bin/sh
# Downloads the OFL fonts the atlas is baked from and converts them to TTF.
# The baked atlas is committed; this script only needs running to re-bake.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/build/fonts"
mkdir -p "$DIR"
fetch() { # pkg version file
  curl -sSLf --max-time 90 -o "$DIR/$3.woff2" \
    "https://cdn.jsdelivr.net/npm/@fontsource/$1@$2/files/$3.woff2"
  echo "  $3"
}
echo "fetching:"
fetch barlow-condensed 5.0.13 barlow-condensed-latin-500-normal
fetch barlow-condensed 5.0.13 barlow-condensed-latin-600-normal
fetch saira           5.0.18 saira-latin-500-normal
fetch saira           5.0.18 saira-latin-600-normal
fetch saira           5.0.18 saira-latin-700-normal
fetch chakra-petch    5.0.13 chakra-petch-latin-700-normal
fetch saira-semi-condensed 5.0.13 saira-semi-condensed-latin-700-normal
fetch michroma        5.0.13 michroma-latin-400-normal
fetch inter-tight     5.0.16 inter-tight-latin-400-normal
fetch barlow-semi-condensed 5.0.13 barlow-semi-condensed-latin-700-normal
echo "converting to ttf:"
python3 - "$DIR" <<'PY'
import sys, pathlib
from fontTools.ttLib import TTFont
d = pathlib.Path(sys.argv[1])
for w in sorted(d.glob('*.woff2')):
    f = TTFont(str(w))
    f.flavor = None
    out = w.with_suffix('.ttf')
    f.save(str(out))
    print('  ' + out.name)
PY
