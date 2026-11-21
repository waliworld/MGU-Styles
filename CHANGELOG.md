# Releases

`main` is the current release; the Store installs whatever `main` holds.
Each earlier release is kept on a branch of its own name. To go back to
one: `git checkout <branch>`, or point the Store's source at that branch.

## Beta 3 — `main`, app version 0.6.0

**M Sport, and a second M style beside it.** Toro is exactly as it was.

- **M Sport** is the M View of Beta 2 under its new name, with one
  correction: **the figure 7**. Its leg now hangs from the squared right
  end of its bar and leans back to its foot, as the photograph has it; it
  had been drawn from the top corner, which stood it too upright and too
  far left. Both cuts (the dials' and the footer's) are redrawn. Nothing
  else of M Sport changed: frames rendered from `beta-2` and from here
  differ only where a 7 is.
- **M Sport Plus** (new, style `mplus`): a clone of M Sport with only the
  middle different — the centre of the M setup screen
  (`docs/ref/m-plus-reference.jpg`): seven plates on one lean with the
  light-blue and red M stripes across the wide centre one, a lattice of
  fine lines, and the lower rails meeting in the middle.
- **Waze inside the centre plate**, in the area marked on that picture
  (`docs/ref/m-plus-waze-area.jpg`). The plate thins out into the map over
  40 units on a curve with no corner at either end, so the map has no
  edge: it comes up through the blue. It keeps clear of both speeds, and
  the stripes stand back when a turn card is shown over them.
- **The numbers grow as the needle passes** — a fifth bigger with the
  marker level, settling as it goes by. On in M Sport Plus, off in M Sport;
  new setting *M / Numbers at the needle* for either.
- The iDrive page steps through five designs; the style setting lists
  three. Saved settings keep working (`track` is M Sport).
- Tools: `tools/m-plus-compare.py` lays the picture's middle over ours
  (plate or not agrees on 97 % of its unshadowed half).
- Checked: 119 tests (9 new: the clone differs only in its middle, its
  plates and window, the fade's curve, nothing of the map past the plate
  or under a reading, growing numerals against the rim and the
  tyre-pressure telltale, the 7's shape, and that every uniform is sent
  in the shape its shader declares), every shader compiled in WebGL 1,
  all three styles through the simulated head unit, Toro pixel-identical
  to Beta 1.

Not yet on a car: see `docs/IN-CAR-TEST.md`.

## Beta 2 — branch `beta-2`, app version 0.5.0

**The M style, rebuilt to look like the real thing.** Toro is exactly as
it was in Beta 1.

- **M** is now BMW M's iDrive 8 *M View*, traced from the owner's
  reference photograph (`docs/ref/m-view-reference.jpg`) to its guide
  (`docs/ref/M-VIEW-SPEC.md`): the two angular dials with a level marker
  and a filling band, the eight dark-blue plates, the cyan and red centre
  lines, both speeds, fuel and oil as leaning strips, and the footer with
  clock, range, the 4WD panel and outside temperature.
- **Measured, not eyeballed.** Every line is a fit to the photograph, kept
  in the photograph's own coordinates. `npm run m-compare` renders the
  photograph's state 1:1 and compares: mean colour difference 29.8 → 8.5;
  the photograph's edges with one of ours within 2 px 26 % → 98.7 %; 137 of
  143 control points within 2 px (mean 0.72 px). Details and what is still
  off: `docs/ref/MEASUREMENTS.md`.
- **Its own figures and symbols**, drawn from the photograph's strokes
  (`tools/mglyphs.py`): two cuts of the squared numerals, the fuel pump,
  oil can and M mark. Words in Inter Tight; `WD` in Barlow Semi Condensed.
- **Both speeds at once** (mph over km/h or the reverse), oil marked in
  °F or °C at true heights, am / pm with the 12-hour clock.
- **The clock is the car's own**, read from the instrument cluster rather
  than the head unit (which runs on UTC). Until the cluster has sent it,
  no clock is shown.
- **New setting, *M: footer panel shows***: 4WD, 2WD, the driving mode, or
  nothing. (*M: colours* night / day is gone: the M View has one look.)
- **Waze and Turn View** show in the black field between the plates,
  feathered in from the plates' edges, the centre lines still over them.
- **Never an imitation warning lamp.** The lamps in the photograph are the
  car's; ours exist only in the comparison fixture.
- **Toro: untouched.** Its sources are unchanged, its 133 glyphs are the
  same pixels in the atlas, and eight fixed frames render identically to
  Beta 1 (`tools/toro-regress.sh`, `tools/img-same.py`).
- Tools: `tools/m-compare.py` (overlay, edge map, colour map, blink GIF,
  400 % crops, control points), `tools/m-points.js`, `tools/m-zoom.py`,
  `tools/m-near.py`.
- Removed: `docs/M-IDRIVE8-BRIEF.md` (the earlier brief; it is still on
  `beta-1`).

Not yet on a car: see `docs/IN-CAR-TEST.md`, *M style*.

## Beta 1 — branch `beta-1`, app version 0.4.0

The Toro (Lamborghini) style as approved, with everything around it.

- **Toro**: the Huracán dial with 60 Hz gliding needles; hanging-wedge side
  gauges (oil temperature and pressure left, fuel and coolant right); boost
  level with the speed; the G meter with its point and peak hold; three
  backgrounds (genuine, modern hex lattice, Revuelto); accents incl. magenta
  and *match the interior light*; outline or filled rev number at the needle.
- **Shift lights**: Lamborghini blades with bursts and a screen shake at the
  limiter, GT3 LEDs, single blade.
- **Extras**: holiday theme, start-up message (own words from a USB text
  file), start at every startup, refresh rate and needle smoothing.
- **Waze** on the cluster in either style; Turn View's camera in M.
- **BeeM-Flash** feed: oil pressure, G and the interior light's colour.
- **iDrive page**: full screen with `mgu-render`, design arrows, one
  Cluster on / off button.
- **M**: the first iDrive 8 M-style attempt (replaced in Beta 2).
