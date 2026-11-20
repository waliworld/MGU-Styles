# Cluster constraints (iDrive 7 / MGU)

Everything in this file is a **hard limit of the car**, not a style choice.
Breaking one of these does not look bad — it makes the KOMBI draw black
boxes over our artwork, refuse a shader, or drop the scene entirely.

Sources are named per rule. Findings marked **car-verified** were measured
on real vehicles by the upstream projects we build on; findings marked
*(unverified)* are reported but not reproduced.

---

## 1. The panel target

`cluster-render` exposes the whole instrument cluster as the `panel` target.

| | |
|---|---|
| Slot | `0x203` |
| Size | **1920 x 720** |
| Scene id | `0x010004f8` (falls back to `0x01000400`, the HUD's, if the KOMBI rejects it) |
| Draws | **over** the factory gauges |
| Drawn over us | factory telltales, warnings, the bottom strip |

Source: `robertnisipeanu/idrive-apps/native/cluster-render/README.md`,
`PROTOCOL.md`.

## 2. The bottom strip — the single most important rule

**Do not draw below `y = 646`.**

The cluster's own bottom strip (gear, drive mode, ranges) lives there. If a
panel layer covers it, the KOMBI decides its gear readout has been lost and
draws a **fallback gear box over our layer**, at roughly
`x 1490-1652, y 271-442` — a black rectangle in the middle of the artwork.
Nothing we draw can fill or hide it, and it has been seen to **persist after
our layers are gone**, until the head unit restarts.

- A layout that ends at `y = 646` and leaves the strip to the car gets no
  boxes. **Car-verified** on multiple vehicles (Cluster Layouts 0.14-0.17;
  `bimmer-lab/apps` #1, #5; `ALMSTRA/idv7lol` cuts every layer at 646 by
  default after issue #7 on a G82 M4).
- Narrower measurement: only the gear window **`x 1385-1462, y 665-720`**
  actually triggers it. White drawn over all of `y 0-665`, and over the rest
  of the strip, brought no box. **Car-verified**
  (`Vizualyse/idrive-apps/knowledge/cluster-and-hud.md`, 2026-11-14).

We take the conservative rule: **every layer is cut at `y = 646`.**
`MGU_STYLES_BOTTOM_CUT` in `src/geometry/panel.js`.

## 3. Keep-clear zones

| Zone | Rect | Applies to | Why |
|---|---|---|---|
| Bottom strip | `0,646 1920x74` | all | §2 |
| Top-left corner | triangle `(0,190)-(325,0)-(0,0)` | all | glass is cut on a diagonal; pixels there are not visible |
| Top-right corner | triangle `(1650,0)-(1920,200)-(1920,0)` | all | same |
| Tyre telltale | ~`40,260` | all | KOMBI draws over us |
| Parking brake telltale | ~`1840,245` | all | KOMBI draws over us |
| eDrive box | `1770,170 150x95` | hybrids | KOMBI draws over us |
| M box A | `793,289 246x92` | M cars | KOMBI draws over us |
| M box B | `1223,328 171x78` | M cars | KOMBI draws over us |

Corners and telltale positions: **car-verified** by calibration grid
(`Vizualyse`, 2026-11-14). eDrive and M boxes: reported by
`eroobeeroo/idrive7-cluster-info` `layout_common.js` *(unverified here)*.

The bottom corners are slightly rounded. All of `1920x720` is otherwise
visible, including the top edge in the middle.

## 4. Shader limits (effect layers)

Effect layers are GLSL ES 1.00 fragment shaders compiled **by the unit's own
glslang**, which is stricter than a desktop browser.

- **Reserved uniform names.** `u_mvp`, `u_mv`, `u_m`, `u_v`, `u_p`,
  `u_normal` are reserved and must be `mat4` if declared at all. Declaring
  `vec4 u_v` makes the unit refuse the layer ("effect did not compile")
  while WebGL accepts it happily. **Car-verified** (`Vizualyse`).
- **Uniform budget: 48 vectors max** per shader, counted the way GLSL ES
  counts them. A shader of ~70 vectors **restarted a G21's KOMBI**.
  **Car-verified** (`ALMSTRA/idv7lol`).
- **No `break` out of a loop.** Suspected of the same KOMBI restart.
- Keep loops short and bounded; the unit unrolls them.

## 5. Asset limits

- **16 assets per client, refused after the fact.** Past the limit the
  client still returns a ref and the server silently refuses it, so layers
  bound to it draw *nothing* with no error. Always drop assets you are
  replacing *before* creating the new ones. **Car-verified** (`Vizualyse`).

## 6. Upload budget

- One shared link to the KOMBI for every head-unit participant. Ceiling
  **5500 KB/s**, floor 2000, stepping down 500 at a time on congestion.
- A full 1920x720 RGBA frame is **5.5 MB** — about 1 fps. Pushing pixels for
  animation is not viable.
- **Effect (GLSL) layers upload nothing per frame.** Animation comes from
  `u_time` and uniform updates, which cost bytes in the tens. This is why
  this project is built on effect layers rather than a software rasteriser.

## 7. Layer stack

Bottom to top: class (`ambient`, `content`, `overlay`, `alert`), then the
client's `z`, then newest. The KOMBI still draws its own warnings, the
navigation direction list and parts of the panel **above everything** we do.
Nothing can be drawn above those — by design, and we do not try.

## 8. Lifecycle

- The car's own safety display always wins. We never cover warnings.
- Keep off the cluster while the car is off or switching on/off.
- On renderer restart, clients reconnect and resend their layers.
