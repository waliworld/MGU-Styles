# MGU-Styles

Custom instrument clusters for BMW iDrive 7 (MGU), in three styles you
switch between on iDrive:

- **Toro**, after a modern Lamborghini: a wide rev band, a huge hollow gear
  numeral in arancio, Italian-labelled side pods, and three backgrounds
  (genuine Huracán, modern hex lattice, Revuelto). Plus two things the
  factory car never had, a **boost gauge** and **GT3 three-stage shift
  lights with a limiter flash**.
- **M Sport**, BMW M's iDrive 8 **M View** rebuilt on the iDrive 7 panel
  from a photograph of the real thing, line for line: the blue speed dial
  and the red rev dial as angular rails with a level marker, the dark-blue
  plates behind them, both speeds, fuel and oil as leaning strips, and a
  centre that can show the **Waze map**, **Turn View's front camera** or a
  turn card between the dials.
- **M Sport Plus**, the same dials round another middle: the blue and red
  **M stripes** on one wide plate, with the **Waze map inside that plate**,
  its edges melting into it, and scale numbers that **grow as the needle
  passes them**.

It runs on a rooted head unit through
[`cluster-render`](https://github.com/robertnisipeanu/idrive-apps), installed
from the [MGU Store](https://github.com/robertnisipeanu/mgu-store).

![Toro, driving](docs/img/toro-drive.png)

![The rev band lighting, numerals popping as the revs pass them](docs/img/rpm-sweep.gif)

> **Unofficial, and nothing to do with BMW AG or Automobili Lamborghini.**
> Changing what your cluster shows can distract you and may affect your
> warranty. The car's own warning lights and its bottom strip are never
> covered. Test it parked.

---

## Status

| | |
|---|---|
| Target car | 2023 **X3 M40i** (G01, B58, ZF 8HP) — the car it is developed against |
| Also profiled | other B58 cars, S58 M cars, plug-in hybrids (see Known limitations) |
| Units | imperial (mph, °F, psi); metric available |
| Head unit | iDrive 7 (ID7). iDrive 8 is planned — `cluster-render` already supports it |
| Package | **ready to install** from the MGU Store as **MGU Styles** (`mgustyles_toro`) |
| Releases | **Beta 3** (0.6.0, `main`): M Sport and M Sport Plus. **Beta 2** (0.5.0) and **Beta 1** (0.4.0) are kept on the branches `beta-2` and `beta-1`. See [CHANGELOG.md](CHANGELOG.md) |
| On a car | Beta 1 has been installed on the target car by its owner, and what came back shaped the iDrive page and Toro's gauges. **The two M styles have not been on a car yet**: they have been run in the preview and end to end against a simulated car (below). The in-car checklist is **[docs/IN-CAR-TEST.md](docs/IN-CAR-TEST.md)** |

## The design

The geometry and art direction come from the **Huracán CORSA reconstruction
brief**, held as data in `src/theme/guide.js` so it can be read against the
document line by line.

- **The dial is a circle** — radius 590, centred at (930, 660), *below the
  screen*, swept 154.8° with the crown falling just past 5 on the brief's 1 → 10 scale
  (the sweep is kept when the scale is shortened to 8).
  One angle function, `θ(v) = -178 + 17.2v`, drives the ticks, the contour,
  the stipple and the numerals, so they cannot drift apart.

  I had previously fitted a superellipse to a traced photo and was wrong:
  that curvature was perspective in the photograph, not the dial.

- **Stepped inner perimeter** — the brief's own generator, a short radial
  shoulder at 0.12 of each interval, a plateau from 0.22 to 0.68, and back
  down by 0.80, between radii 483 and 499. A test checks the shader's ramps
  against that table.
- **Hollow inclined numerals**, narrow and leaning ~11°, white up the scale
  and red from the red sector. The slant is baked into the SDF atlas rather
  than sheared in the shader, so the field describes the real shape and the
  metrics come out right.
- **The gear glyph** is a red outline with a transparent interior, leaning
  12°, with CORSA to its left and the pale secondary R beside it.
- **Stipple in the band** — a fine regular point field in the annulus,
  which is what the Huracán's texture actually is at this scale. The
  hexagon lattice is the **modern** background option.
- **Side instruments** stay narrow: thermometer and pump icons, Italian
  labelling (Temp. Acqua, Livello Benzina), fixed scale markings separate
  from the moving level.

### Where this departs from the brief, and why

| | |
|---|---|
| Rendered as cluster-render **effect layers**, not SVG | the head unit gives us no other way to draw smoothly at 30 Hz |
| A **progressive lit run** up the dial as the rpm indication | the brief leaves this open and warns against inventing OEM behaviour, so it is a documented choice |
| **GT3 shift lights** and a **boost gauge** | separately asked for; the brief allows exactly that exception |
| The **far-left region** carries oil temperature and pressure | the brief says that area is unreadable in the photograph, so it is ours to use |
| The grid is **scaled to fit above y = 646** | the car keeps the bottom strip; the whole instrument scales as one, which is what the brief asks for |

### How the revs read

The dial runs **0 → 8** by default, because a B58 or S58 stops at 7,000:
the brief's sweep and proportions are kept, only the scale is shorter.
`Rev scale` in the iDrive settings sets the top (6,000 – 10,000; 10,000
gives the Lamborghini's own 1 → 10).

As the revs climb:

- **the band lights** — the stipple fills in the lit colour up to the
  current rpm, with a red needle at the leading edge;
- **each numeral pops** as the needle reaches it — it grows by up to 40 %
  and turns the accent colour, then settles back to white once passed;
  numerals in the red sector pop red;
- **the GT3 shift lights** fill green → yellow → red;
- **on the limiter** the shift lights go solid, the screen edges flash and
  the dial strobes, at the rate and strength you choose.

![On the limiter: flashing edges, full shift lights, the 7 popping red](docs/img/toro-limiter.png)

### Three backgrounds

`Background` keeps the **genuine** Huracán look (stipple annulus, faint
facets) or switches to:

- **modern**: the Lamborghini hexagon lattice — thin silver lines on the
  left and right only, glowing nodes at some of the joints, faint faceted
  glass inside each cell, and a black centre so the dial stays clean. It
  fades out behind the side pods to keep them readable.
- **revuelto**: the Revuelto's Y light signature, nested three deep on each
  side with the stem pointing at the dial, the accent colour burning at the
  junction, lighter and darker planes between the arms, and a long diagonal
  sweep behind.

![Modern hexagon lattice background](docs/img/toro-modern.png)

![Revuelto background](docs/img/toro-revuelto.png)

## M Sport — BMW M View, from a reference frame

Rebuilt in Beta 2 from one photograph of an M3's iDrive 8 **M View**
([docs/ref/m-view-reference.jpg](docs/ref/m-view-reference.jpg)) and the
guide written for it ([docs/ref/M-VIEW-SPEC.md](docs/ref/M-VIEW-SPEC.md)).
Every line was measured off that frame and is kept in the frame's own
1726 × 612 coordinates (`src/theme/mgeom.js`), then carried to the panel by
one uniform fit — so the photograph, the numbers and the shaders read
straight across. How each was taken, the control points and what is still
off are in **[docs/ref/MEASUREMENTS.md](docs/ref/MEASUREMENTS.md)**.

It is a reference-matched reconstruction for the owner's own car.
**Unofficial, and nothing to do with BMW AG** — see the notice at the top.
In settings and the code it is the style `track`.

![M Sport, driving](docs/img/track.png)

**How close it is.** The photograph above, the render below, in the
photograph's own state (0 km/h, P, 12:04 pm, 207 km, 4WD, +12.5 °C):

![The reference photograph and the render](docs/img/m-compare.jpg)

| Measure (`npm run m-compare`) | Beta 1 | Beta 2 |
|---|---:|---:|
| Mean colour difference, 0 – 255 | 29.8 | 8.5 |
| The photograph's edges with one of ours within 2 px | 26.0 % | 98.7 % |
| Our edges with one of the photograph's within 2 px | 34.0 % | 98.1 % |
| Control points within 2 px (143 measured) | — | 137, mean 0.72 px |

(Beta 3 redrew the figure 7 — its leg now hangs from the squared end of
its bar, as the photograph has it — and changed nothing else of M Sport:
four frames rendered from `beta-2` and from here differ only where a 7 is.)

The remainder is the photograph itself (grain, moiré in the plates, glow,
and 1 – 3 px of lean in a hand-held shot of a curved display) and the
handful of things listed in the measurements.

What it draws, all from live data:

- **Speed (left, blue)** and **revs (right, red)**: an outer rim, a dark
  channel and a fine inner contour, mirror images of each other. The scale
  is linear in *height*: a level white marker rides up the dial, the band
  below it fills, and the two numerals either side of the value turn white.
  0 – 330 km/h or 0 – 200 mph, uneven above the fifth numeral as on the
  car; 0 – 8 for the revs, with a red field from your redline and an amber
  one before it. On the limiter the red band flashes.
- **Both speeds**, the main one flush right over its unit and the other
  unit's below it, and the **gear** on the right.
- **Fuel** and **oil temperature** as leaning four-segment strips lit from
  the foot (oil marked 50 – 150 °C or 120 – 300 °F, its line red where hot
  and blue where cold).
- **The plates and the two fine centre lines**, cyan and red, behind it all.
- **Footer**: the M mark, clock (am / pm in the 12-hour clock), range,
  the four-pane panel with **4WD** (or 2WD, the driving mode, or nothing —
  a setting, since the car does not report its drive), outside temperature.
- **Lettering**: the squared figures are drawn for this, from the
  photograph's own strokes (`tools/mglyphs.py`), as are the fuel pump, oil
  can and M mark; the small words are Inter Tight, the nearest open match.

Three things it deliberately does **not** do:

- **It never imitates a warning lamp.** The photograph shows the parking
  brake, side lights, seat belt, LIMIT and the car seen from above. Those
  are the car's own, and the cluster keeps drawing its real ones over any
  theme, so here they exist only in the reference fixture
  (`preview/index.html?fixture=m`, used for the comparison) — never on the
  road.
- **It never invents a reading.** No fuel level, clock, range or
  temperature is shown until the car has sent one, and a reading that goes
  missing goes dark.
- **The clock is the car's.** The head unit runs on UTC, so the time comes
  from the instrument cluster's own display time and turns over with it.

**The centre.** The black field between the two groups of plates is a
window (`M.WINDOW` in `src/theme/mgeom.js`): the picture fades in 7 units
inside the plates' edges over 22, the cyan and red lines stay over it, and
no figure stands in it. It opens over 180 ms and closes over 110 ms.

| Centre shows | What you see |
|---|---|
| **Waze map** | the phone's map from *Maps on cluster* — and the turn card when no map is up |
| **Turn View camera** | the front camera from IterioDev's *Turn View* |
| **Turn card only** | our own arrow, distance and instruction for the next turn |
| **Nothing** | the M View as the photograph has it |

![M Sport with the Waze map in the centre (a stand-in map in the preview)](docs/img/track-waze.png)

![M Sport with the turn card, metric](docs/img/track-turn.png)

## M Sport Plus — the M stripes, and Waze in the middle

A clone of M Sport in which **only the middle is different**: the dials,
figures, strips, footer and every reading are M Sport's own layers,
untouched (`test/track.test.js` holds the two together layer by layer).
The middle is the centre of a second picture
([docs/ref/m-plus-reference.jpg](docs/ref/m-plus-reference.jpg), the M
setup screen), laid into the same coordinates: seven plates with one fall
of light, the light-blue and red **M stripes** leaning across the wide
centre plate, a lattice of fine lines over them all, and the two lower
rails meeting in the middle. In settings and the code it is the style
`mplus`. The working is in
**[docs/ref/M-PLUS-MEASUREMENTS.md](docs/ref/M-PLUS-MEASUREMENTS.md)**.

![M Sport Plus, at rest](docs/img/mplus.png)

Where that picture has its list of driving modes, this has the **Waze
map** — in the area marked on it
([docs/ref/m-plus-waze-area.jpg](docs/ref/m-plus-waze-area.jpg)): from the
centre plate's top edge to its foot, clear of the two speeds on the left
and standing in from the plate's right edge. The plate itself thins out
into the picture over 40 units on a curve with no corner at either end, so
there is no line where the map starts: blue plate, then map. The stripes
and lattice fade with the plate; with no map up, they are the middle.

![M Sport Plus with the Waze map (a stand-in map in the preview)](docs/img/mplus-waze.png)

The picture's middle above, ours below (the picture's left lies in a
shadow, which is not drawn; its figures stand a little differently because
they are that screen's, where ours are M Sport's):

![The reference's middle and the render's](docs/img/mplus-compare.jpg)

**The numbers grow as the needle passes.** Each scale number swells by a
fifth as the marker comes level with it and settles again as it goes by,
on top of turning white — the nearest number is always the biggest. It
grows about its own middle, except the one beside the car's tyre-pressure
telltale, which grows away from it. On by default here and off in M Sport
(*M / Numbers at the needle* turns it on or off in either).

![The numbers growing as speed and revs rise](docs/img/mplus-sweep.gif)

### How the map and the camera get into the centre

Neither picture is ours: two other apps draw them, and M only asks and
makes room. Everything is set from MGU Styles' own page on iDrive — nothing
needs changing on the cluster or in the other apps. `src/car/centre.js`
does all of it.

- **Waze** ([Maps on cluster](https://github.com/robertnisipeanu/idrive-apps/blob/main/apps/robertn_waze_cluster/README.md)).
  Its service normally draws on the KOMBI's map slot, under BMW's gauges.
  While M is on the cluster with *Waze map* chosen, we ask its control
  socket to draw on the **panel** instead — the same scene we draw in, at
  z 0 in BMW's map window (416,120 1088×480) — and our back glass at z 1
  has the feathered window in it. The window sits wholly inside that map
  window. Whenever we stop wanting it (key-off, another style, *BMW
  original*, the app closing) we put the map back on its own slot, but only
  if we moved it; that is remembered across restarts. This is the approach
  bimmer-lab's Cluster Themes use. The map then draws above BMW's own map
  view, so the car's *Central display area* setting does not matter, and
  Waze's HUD map is off while it is inside the cluster (they share a
  scene). The **Waze on cluster** button on the app's page turns it on
  (and picks M) or off.
- **Turn View** ([IterioDev/car-apps](https://github.com/IterioDev/car-apps)).
  On iDrive 7 its tool draws the camera on the map slot, under the panel;
  our window over BMW's map area is how it shows. *Turn View camera*
  switches Turn View on (it is off at every car start) and off again when
  you leave, unless you had switched it on yourself. Its control socket
  also gives the next maneuver, which is where the turn card comes from.
  We only ever hold that socket for an instant: the Turn View tool starts
  its app (the part that asks the camera for a picture) only while nobody
  is connected. Turn View is closed-source under PolyForm Strict and is
  used as installed; nothing of it is copied here.

## Settings

On the car these are in the app's **Settings** screen on iDrive; changes apply
to the cluster within half a second.

| Setting | Values |
|---|---|
| Show on cluster | on / off (off = BMW's original cluster) |
| Style | Toro (Lamborghini Huracán) · M Sport (BMW M View, iDrive 8) · M Sport Plus (M stripes, Waze in the centre) |
| M: centre shows | Waze map · Turn View camera · turn card only · nothing |
| M: footer panel shows | 4WD · 2WD · the driving mode · nothing |
| M: numbers at the needle | as the style has them (M Sport Plus grows them) · grow as the needle passes · stay the same size |
| Car | X3 M40i (B58) · other B58 · M car (S58) · plug-in hybrid — sets the default redline, limiter and gear count |
| Toro: background | Genuine Huracán (stipple) · Modern hex lattice · Revuelto |
| Accent | arancio · giallo · rosso · verde · blu · viola · bianco |
| Rev band fill | full fill and needle · subtle · off |
| Mode label | Strada / Sport / Corsa · BMW's own names · always CORSA |
| Rev scale | 0–6,000 … 0–10,000 (default 0–8,000) |
| Redline | from the car, or 5,500 – 8,000 rpm |
| **Rev limiter** | from the car, or 6,000 – 9,000 rpm — where the limiter flash and the last shift light sit |
| Rev-limit flash | dial and screen edges · dial only · edges only · off |
| Shift lights | Lamborghini (blades closing on a hex core, bursts at the limit) · GT3 LEDs · single blade · off |
| Shake at the limiter | medium · hard · light · off — the whole cluster jolts in step with the bursts, played by the renderer itself |
| Colour applies to | lights and highlights · everything, gear and labels too |
| Holiday theme | crystal snow down both sides and a Christmas tree in a clean corner |
| Start-up message | on / off: *For my beautiful wife, Nicole Wali, I love you* (or other words, below), 6–20 s, then a slow fade into the cluster |
| Refresh rate | 60 · 45 · 30 · 20 frames a second (default 60) |
| Needles between the car's updates | glide smoothly · glide quickly · jump to each reading — the car sends readings a few times a second; gliding hides the steps |
| Start at every startup | on: comes up with the car every time · off: each start begins with BMW's own, **Cluster on / off** brings it up for that drive |
| Boost gauge | on / off — level with the speed, left of the gear: the figure grows a step with every psi, a faint hanging wedge to its right sweeps right to left |
| Rev number at the needle | outline · bold, filled in colour |
| Oil gauges (far left) | on / off — temperature and pressure (turbo pressure until BeeM-Flash supplies oil pressure) |
| Units | mph, °F, psi · km/h, °C, bar |
| M: clock | 24-hour · 12-hour (with am / pm) |

The redline and limiter are clamped and kept in order whatever is chosen.

**Your own start-up words.** iDrive settings can offer choices but no
keyboard, so the message has five ready-made sets of words and *Your own*.
For your own, put a plain text file named `mgu-styles-message.txt` at the
top of a USB stick, plug it in, and choose *Your own* (or change any
setting) — MGU Styles reads it and keeps a copy, so the stick can come out
again. Up to about 90 characters; letters, figures and `. , ' ! ? & - : +`
show, in the wide capitals the cluster uses. Where the head unit mounts
USB sticks has not been confirmed on the car yet (`/media`, `/run/media`
and `/mnt` are searched); if it is not found, the default words show.

**The iDrive page** steps through the five designs (Toro genuine, modern
hex lattice, Revuelto, M Sport, M Sport Plus) with the ◀ ▶ arrows beside the sketch on the
touchscreen, or **Design** in the bar with the controller. It fills the
whole screen when the Store's renderer (`mgu-render`) is installed, which
the Store now pulls in with the app.
The preview takes more (`flashFromRpm`, `flashRate`, `flashStrength`,
`hexagons`, `hexSize`, `stipple`, `litColour`…) as query parameters, e.g.
`preview/index.html?background=modern&accent=blu&rpmLimiter=6500`; all of
them live in `src/theme/palette.js`. For the M styles: `style=track`
(M Sport) or `style=mplus` (M Sport Plus), `mPop=on|off`;
`fixture=m` is the reference photograph's exact state, lamps and all;
`mPanel=4wd|2wd|mode|off` (with `drive=SPORT` to name a mode);
`clock12=on`; `show=map|camera|magenta` puts a stand-in picture under the
window; `turn=left|right|bear|sharp|uturn|roundabout|keep|dest` shows the
turn card; `art=native` draws the artboard 1:1 instead of fitted to the
panel.

## The one rule everything obeys

**Nothing draws at or below `y = 646`.**

The cluster's own bottom strip lives there. Cover it and the KOMBI decides
its gear readout is gone and draws a **fallback gear box over our artwork**,
which has been seen to persist until the head unit restarts. Several projects
found independently, on real cars, that a layout ending at 646 is clean.

`test/theme.test.js` enforces this, along with the factory keep-clear zones,
the 48-uniform-vector shader budget, and the reserved uniform names the head
unit refuses. Full detail: **[docs/CLUSTER-CONSTRAINTS.md](docs/CLUSTER-CONSTRAINTS.md)**.

## How it is built

Everything that moves is a **GLSL effect layer**. The renderer shares one
5500 KB/s link to the cluster, and a full 1920×720 RGBA frame is 5.5 MB —
about one frame a second. Effect layers upload *nothing* per frame; animation
comes from `u_time` and a handful of uniforms, which is what makes smooth
graphics possible at all. Text is the only asset: a single baked SDF atlas
(1024², about 190 KB) that stays crisp from a 17 px label to the 225 px gear.

```
src/geometry/panel.js    panel geometry, keep-clear zones, vehicle profiles
src/shaders/             GLSL ES 1.00: prelude, rev band, pods, boost, text
src/engine/text.js       SDF text layout (shared by preview and car)
src/engine/state.js      raw vehicle signals -> what the theme draws
src/theme/guide.js       the CORSA brief as data, and its fit to the MGU panel
src/theme/palette.js     colour schemes and every driver setting
src/theme/lambo.js       Toro: 49 layers
src/theme/track.js       M Sport and M Sport Plus: the layout, colours and what each layer shows
src/theme/mgeom.js       both: every measured line, in the reference frame's own coordinates
src/shaders/mcluster.js  both: dials, plates, strips, footer and windows, written from mgeom
src/theme/index.js       the styles, picked by settings.style
src/car/cluster.js       the theme -> cluster-render effect layers
src/car/centre.js        M's centre: Waze and Turn View, asked for, never held
src/car/vehicle.js       BMW SOME/IP signals -> raw readings
src/car/main.js          the service: signals in, uniforms out
app/                     the iDrive app shell (entry, manifest, icon)
apps/mgustyles_toro/     the staged package the Store builds (generated)
kit/                     the MGU App Kit runtime and builder (MIT, vendored)
preview/                 WebGL harness + a vehicle simulator
tools/                   staging, car simulator, atlas baker (and M's drawn figures),
                         screenshotter, M's comparison with its reference
docs/ref/                M's reference frame, its guide and the measurements
test/                    the constraints and the protocol, enforced
```

On the car, `src/car/main.js` takes a `host` that supplies the three things
only the head unit can give — signal subscriptions, settings and a log — so
the service is driven by a fake host in `test/service.test.js` and the app
shell stays a thin adapter. The driver creates the atlas as a single `r8`
asset, one effect layer per theme layer, and then sends **only the uniforms
that changed**: a repeated state costs nothing, and thirty seconds of hard
driving at 30 Hz measures under 120 KB/s against the 5500 KB/s the whole
head unit shares.

It follows the car's own state (`VehicleCondition`): it draws only in drive
readiness and hands the cluster back to BMW at key-off, so nothing is ever
drawn over a sleeping cluster. Every callback is guarded, because an app
that crashes on the head unit can be uninstalled by the platform.

The preview runs **WebGL 1 on purpose** — that is GLSL ES 1.00, the dialect
the head unit's glslang compiles. A shader that works in the preview is the
shader that ships.

## Installing on the car

1. The head unit needs root and the **MGU Store**.
2. Add this repository as a source in the Store. It reads
   [`mgu-repo.json`](mgu-repo.json), which points at the ready-staged app in
   `apps/mgustyles_toro/` and builds it with the kit in `kit/`.
3. Install **MGU Styles**. The Store pulls in `cluster-render` (≥ 0.6.9),
   `mgu-render` (≥ 0.6.11, the full-screen iDrive page) and `mgu-deploy`
   as dependencies.
4. Open MGU Styles on iDrive and press **Cluster on / off**. It starts
   with the car from then on (unless *Start at every startup* is off);
   the same button hands the cluster back to BMW.
   Pick the style in **Settings**.
5. For M's centre: install **Maps on cluster** (`robertnisipeanu/idrive-apps`)
   for Waze, and/or **Turn View** (`IterioDev/car-apps`) for the camera,
   from their own Store sources. Then press **Waze** on MGU Styles' page
   (it switches the map on or off in whichever style is showing: Toro
   opens its background over the map, M Sport shows it between its plates,
   M Sport Plus inside its centre plate), or pick the centre in Settings. Nothing else to set:
   MGU Styles moves the map in and out by itself. Only Turn View's
   *camera* needs the car's **Instrument cluster > Central display area**
   on **Map view**, because Turn View draws its camera there (its own
   requirement). Without either app the M styles still work: M Sport's
   centre stays quiet, M Sport Plus shows its stripes.

It draws only when the car is in drive readiness and `cluster-render` is
running, and gives the cluster back at key-off. Follow
**[docs/IN-CAR-TEST.md](docs/IN-CAR-TEST.md)** for the first drive.

## Running it

```sh
npm test          # unit tests, package staging check, then every shader compiled on a GPU
npm run car-sim   # build the real package and run it against a simulated car
npm run shot      # render a frame to build/shot.png
npm run m-compare # M Sport against its reference photograph, into build/m-compare/ (needs Python)
python3 tools/m-plus-compare.py   # M Sport Plus's middle against its picture, into build/m-plus-compare/
npm run fonts && npm run atlas   # re-bake the SDF atlas from the OFL fonts
```

**Toro is held still.** `sh tools/toro-regress.sh <checkout> <outdir>`
renders eight fixed Toro frames from a checkout and
`python3 tools/img-same.py <a> <b>` compares two sets pixel for pixel;
Beta 2 was checked that way against a checkout of `beta-1` (all eight
identical).

**`npm run car-sim`** is the closest thing to the car this repo can offer.
It builds the package with the kit's own builder, stands in for BMW's
oap-sdk, the native SOME/IP binding and cluster-render's socket, and runs
the built `app.js` unmodified through park → key-on → a pull to the
limiter → key-off. It fails if the app draws before the car is on, does not
draw while driving, or does not hand the cluster back. It then redraws
exactly what crossed the socket in WebGL 1 (`build/car-sim/car-*.png`) and
fails if any shader does not compile.

`CAR_SIM_THEME=track npm run car-sim` (M Sport) or `CAR_SIM_THEME=mplus`
(M Sport Plus) runs with fake *Maps on cluster* and *Turn View* services
beside the fake renderer, and also fails if Waze is moved into the cluster
before the car is on, is not in it while driving, is not given back at
key-off, if the style's window is not open over the map while driving, or
if a Turn View connection is held open. Its replay draws a stand-in map where Waze would draw.

After changing anything in `src/` or `app/`, run `node tools/stage-app.js`
to refresh `apps/mgustyles_toro/`; `npm test` fails if you forget.

For a live preview, serve the repo root and open `preview/index.html`
(`t=` seconds into the drive, `freeze=1`, `units=metric`, `profile=`,
`strip=off`).

## Known limitations

- **The M styles have not been on a car.** They run end to end in
  simulation; the signal decoders use the field names, invalid markers and
  scalings other projects read on real cars. Signals that do not arrive
  show nothing rather than a guess. Still to be seen in the car: the clock
  (it needs the cluster's `statusShowTimeDate`; until that arrives M shows
  no clock), and how the car's own telltales sit over the layout.
- **M's 4WD / 2WD is a setting, not a reading.** The car does not report
  its drive state to the head unit; choose what the panel says, or have it
  show the driving mode, or nothing.
- **Oil pressure has no source wired up yet.** The reader hook is in
  `src/car/vehicle.js`; until something feeds it, it shows dashes. The G
  meter reads the car's lateral/longitudinal acceleration (CDS2); its sign
  convention needs checking in the car.
- **M cars and hybrids.** Some KOMBIs draw extra boxes over a panel layer
  (M cars at `793,289` and `1223,328`; hybrids an eDrive box at `1770,170`).
  The layout is drawn for the X3 M40i, which has neither, so on those cars
  parts of the centre and the fuel readout are covered. The overlaps are
  listed in `test/theme.test.js` and the test fails if they change.
- **Shift lights sit above the rev band**, in the top centre. Whether the
  factory telltale row is drawn over that area is not confirmed; the rev band
  itself also carries the three-stage colour, so the shift cue survives
  either way. Turn them off with the `shiftLights` setting.
- **The brief's left-hand region is a reconstruction gap.** It is obscured
  in the photograph, so what is there is ours, not a match.
- **No visual comparison against the brief's own reference image** has been
  done — that photo was not supplied with the brief here. The geometry
  follows the written specification.
- **Boost** needs a turbocharged engine and comes from the Sport Display,
  falling back to reading the engine unit directly.
- **M's centre depends on two other apps' behaviour on your car.**
  Moving Waze into the panel is the method bimmer-lab's Cluster Themes use
  on cars; it has not been run with this app yet. Do not run both apps'
  map windows at once: whichever asked last owns the map.
- **Turn View and Waze compete for the cluster's video.** Turn View's own
  advice is not to use both on the cluster; the cluster and HUD together
  show at most two videos. Choosing *Turn View camera* gives the Waze map
  back to its own slot, where Turn View's camera hides it.
- **The camera window shows whatever the KOMBI draws in its map area.**
  Turn View's camera lands on the map slot under BMW's gauges, so any
  readout BMW draws over its own map in Map view shows through the window
  too. That has to be judged in the car.
- **The turn card has a distance but no street name.** Turn View's tool
  reports the maneuver and its formatted distance only. Waze sends no turns
  to the car (Turn View's notes), so with Waze the card stays empty.
- **On M cars** the KOMBI's M boxes fall on M's plates and centre lines;
  every reading stays clear of them (`test/track.test.js`), what is behind
  may be covered.

## Credits

- **[bimmer-lab/apps](https://github.com/bimmer-lab/apps)** — showing the
  Waze map inside a cluster theme through waze-on-cluster's control socket,
  and BMW's map window on the panel (416,120 1088×480).
- **[IterioDev/car-apps](https://github.com/IterioDev/car-apps)** — Turn
  View, used as installed, through its documented control socket.

This project is built on what others worked out, mostly on their own cars:

- **[robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps)**
  — `cluster-render`, the renderer every app draws through, and its protocol.
- **[robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)**
  — the Store and its packaging rules.
- **[Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps)** — the
  measurements behind the bottom-strip rule, the cut glass corners, the
  telltale positions and the reserved-uniform trap.
- **[ALMSTRA/idv7lol](https://github.com/ALMSTRA/idv7lol)** — the `y=646` cut,
  the 48-vector shader budget, the boost DIDs, and the **MGU App Kit**
  (MIT) vendored in `kit/` that runs and packages the app.
- **[ZEKAI-Design/ID7-Cluster-Themes](https://github.com/ZEKAI-Design/ID7-Cluster-Themes)**,
  **[NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps)**,
  **[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)**
  — app structure, signal catalogues and layout practice.

Fonts: **Saira** (incl. Semi Condensed), **Chakra Petch**, **Michroma**,
**Barlow Condensed**, **Barlow Semi Condensed** and **Inter Tight**, SIL OFL
1.1, baked into `assets/fonts/`. Licences in `assets/fonts/OFL.txt`. M's
figures and symbols are drawn in this repository (`tools/mglyphs.py`).
