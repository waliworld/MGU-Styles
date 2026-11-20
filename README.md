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

The reference is the Huracán/Aventador cluster: one dominant sweep, a huge
central gear, and quiet instrumentation pushed to the edges.

- **Rev band** — an *ellipse*, not a circle. A 1920×720 cluster is nearly
  three times wider than it is tall, and a circular dial sits in that space
  instead of filling it. Ticks are solved in real pixels against each tick's
  own tangent and normal, so they stay square while their spacing tightens
  towards the ends, exactly as on the car it is drawn after.
- **Gear** — a hollow numeral in arancio, over a `P R N 1…8` strip with a
  marker under the engaged gear. It turns red on the limiter.
- **Side pods** — leaning segment columns: oil temperature and pressure to
  the left, coolant and fuel to the right, labelled in Italian.
- **Boost** — scaled piecewise, vacuum compressed into the first fifth of the
  bar so charge pressure gets the rest, with a decaying peak-hold tick.
- **Shift lights** — fifteen LEDs filling green → amber → red across the last
  1800 rpm, strobing at the limiter together with a full-screen edge flash
  that leaves the middle of the cluster readable.

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
src/theme/lambo.js       the layout: 38 layers
preview/                 WebGL harness + a vehicle simulator
tools/                   font fetch, atlas baker, screenshotter
```

The preview runs **WebGL 1 on purpose** — that is GLSL ES 1.00, the dialect
the head unit's glslang compiles. A shader that works in the preview is the
shader that ships.

## Running it

```sh
sh tools/fetch-fonts.sh        # OFL fonts (only needed to re-bake)
python3 tools/bake-atlas.py    # -> assets/fonts/atlas.{png,json}
node --test test/theme.test.js # the constraints, enforced
node tools/shot.js build/shot.png "t=9&freeze=1&strip=off"
```

For a live preview, serve the repo root and open
`preview/index.html`. Query options: `t=` seconds into the drive, `freeze=1`,
`rpm=`, `speed=`, `units=metric`, `profile=`, `strip=off` to hide the guide
over BMW's strip.

## Known limitations

- **Not yet run on a car.** Signal plumbing is written against the
  documented SOME/IP fields but is unverified in a vehicle.
- **M cars and hybrids.** Some KOMBIs draw extra boxes over a panel layer
  (M cars at `793,289` and `1223,328`; hybrids an eDrive box at `1770,170`).
  The layout is drawn for the X3 M40i, which has neither, so on those cars
  parts of the centre and the fuel readout are covered. The overlaps are
  listed in `test/theme.test.js` and the test fails if they change.
- **Shift lights sit above the rev band**, in the top centre. Whether the
  factory telltale row is drawn over that area is not confirmed; the rev band
  itself also carries the three-stage colour, so the shift cue survives
  either way. Turn them off with the `shiftLights` setting.
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
