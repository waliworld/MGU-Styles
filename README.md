# MGU-Styles — "Toro"

A custom instrument cluster for BMW iDrive 7 (MGU), drawn in the style of a
modern Lamborghini: a wide elliptical rev band, a huge hollow gear numeral in
arancio, Italian-labelled side pods — plus two things the factory car never
had, a **boost gauge** and **GT3 three-stage shift lights with a limiter
flash**.

It runs on a rooted head unit through
[`cluster-render`](https://github.com/robertnisipeanu/idrive-apps), installed
from the [MGU Store](https://github.com/robertnisipeanu/mgu-store).

![Toro, driving](docs/img/toro-drive.png)

> **Unofficial, and nothing to do with BMW AG or Automobili Lamborghini.**
> Changing what your cluster shows can distract you and may affect your
> warranty. The car's own warning lights and its bottom strip are never
> covered. Test it parked.

---

## Status

| | |
|---|---|
| Target car | 2023 **X3 M40i** (G01, B58, ZF 8HP) — the car it is developed against |
| Units | imperial (mph, °F, psi); metric available |
| Head unit | iDrive 7 (ID7). iDrive 8 is planned — `cluster-render` already supports it |
| Tried on a car | **not yet.** Everything below is verified in the preview and by tests |

## The design

The geometry and art direction come from the **Huracán CORSA reconstruction
brief**, held as data in `src/theme/guide.js` so it can be read against the
document line by line.

- **The dial is a circle** — radius 590, centred at (930, 660), *below the
  screen*, swept 154.8° with the crown falling just past 5 on a 1 → 10 scale.
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
- **Stipple, not honeycomb** — a fine regular point field in the annulus,
  which is what the Huracán's texture actually is at this scale. The
  honeycomb is still there behind `hexagons` if you want the Aventador look.
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

The dial is marked **1 → 10 like the car it copies**. That is artwork, not a
rev limit: `scaleMaxRpm` says which engine speed reaches 10 (10,000 by
default), and the red detailing lands on the *car's* redline, so on a B58 it
marks 6,750 rather than the Lamborghini's 8.5.

## Settings

Everything a driver can change lives in `src/theme/palette.js`; the layout
code has no colour or rev limit written into it.

| Setting | Values | |
|---|---|---|
| `accent` | `arancio` `giallo` `rosso` `verde` `blu` `viola` `bianco` | the gear numeral and highlights |
| `litColour` | `ice` `white` `accent` | what the rev band turns as it lights |
| `rpmRedline` / `rpmLimiter` | rpm | clamped and kept in order, whatever is passed |
| `revFlash` | `off` `band` `edges` `both` | flash the dial, the screen edges, both, or neither |
| `flashFromRpm` | rpm | where the warning starts; defaults to just under the limiter |
| `flashRate` / `flashStrength` | 1–20 Hz / 0–1 | how it flashes |
| `shiftLights` | on/off | the GT3 strip above the dial |
| `gearStrip` | on/off | the `P R N 1…8` band |
| `scaleMaxRpm` | 4000–12000 | the engine speed that reaches 10 on the dial |
| `redFromScale` | scale value | where the red detailing starts; derived from `rpmRedline` when unset |
| `stipple` / `facets` | 0–2 | the annulus point field and the faint background facets |
| `hexagons` / `hexSize` | 0–1.5 / 20–120 px | the honeycomb, **off by default** — the Huracán field is stipple |
| `showAuxLeft` | on/off | oil temperature and pressure in the brief's unreadable far-left region |
| `showBoost` | on/off | the boost gauge |
| `mode` / `secondaryGlyph` | text | the CORSA label and the pale glyph beside the gear |
| `units` | `imperial` `metric` | mph/°F/psi or km/h/°C/bar |

Each dial numeral carries its own scale value, so `10` works as two glyphs
and lights with the rest. `test/theme.test.js` pins that, the angle function,
the circle, and the stepped-contour table.

In the preview every one of these is a query parameter:
`preview/index.html?accent=blu&rpmMax=7000&revFlash=band&units=metric`.

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
(1024², 116 KB) that stays crisp from a 17 px label to the 225 px gear.

```
src/geometry/panel.js    panel geometry, keep-clear zones, vehicle profiles
src/shaders/             GLSL ES 1.00: prelude, rev band, pods, boost, text
src/engine/text.js       SDF text layout (shared by preview and car)
src/engine/state.js      raw vehicle signals -> what the theme draws
src/theme/guide.js       the CORSA brief as data, and its fit to the MGU panel
src/theme/palette.js     colour schemes and every driver setting
src/theme/lambo.js       the layout: 38 layers
src/car/cluster.js       the theme -> cluster-render effect layers
src/car/vehicle.js       BMW SOME/IP signals -> raw readings
src/car/main.js          the service: signals in, uniforms out
preview/                 WebGL harness + a vehicle simulator
tools/                   font fetch, atlas baker, screenshotter
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

It takes the cluster off and hands it back to BMW whenever the engine speed
goes stale, so nothing is ever drawn over a sleeping cluster.

The preview runs **WebGL 1 on purpose** — that is GLSL ES 1.00, the dialect
the head unit's glslang compiles. A shader that works in the preview is the
shader that ships.

## Installing on the car

`cluster-render` is the renderer; the Store installs it as a dependency.
The pieces in this repo that the head unit runs are `src/car/` plus
`assets/fonts/atlas.r8.gz` (the atlas as raw bytes, so the app needs `zlib`
and no PNG decoder).

**Still to do before it can be installed:** the OAP app shell — the iDrive
screen, `package.json`/`mgu-app.json` manifest with
`"mguHmi": ["ID7"]` and the signal list from `src/car/vehicle.js`, an app id
of our own, and the `mgu-repo.json` that lets the Store build it from this
repo tree. That shell needs BMW's oap-sdk, which the head unit supplies and
which is not redistributable, and it cannot be meaningfully verified without
a car. See
[mgu-store's publishing rules](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md).

## Running it

```sh
npm test                       # 24 tests, then compiles every shader on a GPU
npm run shot                   # render a frame to build/shot.png
npm run fonts && npm run atlas # re-bake the SDF atlas from the OFL fonts
```

`npm test` ends by rendering the cluster in headless Chromium, so a shader
that would not compile fails the suite rather than the car.

For a live preview, serve the repo root and open
`preview/index.html`. Query options: `t=` seconds into the drive, `freeze=1`,
`rpm=`, `speed=`, `units=metric`, `profile=`, `strip=off` to hide the guide
over BMW's strip.

## Known limitations

- **Not yet run on a car**, and the OAP app shell is not written yet (above).
  The signal decoders use the field names, invalid markers and scalings that
  other projects read on real cars, but nothing here has been seen in a
  vehicle.
- **Oil pressure and the G meter have no source wired up yet.** The DIDs and
  the reader hooks are in `src/car/vehicle.js`; until something feeds them,
  those readouts show dashes rather than a number we cannot stand behind.
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

## Credits

This project is built on what others worked out, mostly on their own cars:

- **[robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps)**
  — `cluster-render`, the renderer every app draws through, and its protocol.
- **[robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)**
  — the Store and its packaging rules.
- **[Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps)** — the
  measurements behind the bottom-strip rule, the cut glass corners, the
  telltale positions and the reserved-uniform trap.
- **[ALMSTRA/idv7lol](https://github.com/ALMSTRA/idv7lol)** — the `y=646` cut,
  the 48-vector shader budget, and the boost DIDs.
- **[ZEKAI-Design/ID7-Cluster-Themes](https://github.com/ZEKAI-Design/ID7-Cluster-Themes)**,
  **[NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps)**,
  **[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)**
  — app structure, signal catalogues and layout practice.

Fonts: **Saira** and **Barlow Condensed**, SIL OFL 1.1, baked into
`assets/fonts/`. Licences in `assets/fonts/OFL.txt`.
