# BMW M3 iDrive 8 M View — Exact-Reference Reconstruction Guide

**Revision 3 — supersedes every earlier guide, coordinate map, and sample.**

## Coding AI: nonnegotiable target

Use the newly supplied file **`IMG_9460(2).jpeg`** as the **only visual authority** for the screenshot-match mode. Its actual resolution is **1726 × 612 pixels**, and its content is fundamentally different from `IMG_9427.jpeg`. The older picture shows an M setup list; the new reference shows the BMW M View dual-dial driving layout with an empty central region. **Do not carry the five SPORT PLUS rows, the old center blue/red stripes, or the previous render into this design.**

Your assignment is to rebuild a real-time, fully vector-rendered, state-driven BMW M instrument interface that is optically indistinguishable from the supplied reference at its 1726 × 612 artboard size. That means exact control points, dial contour widths, color distributions, text outlines, individual fuel/oil bar segments, status icons, and footer layout. The last generated preview was not acceptable and must not be used as a template. Reconstruct from the new original JPEG, and validate every region at 200–400% magnification with image overlays.

**Verified versus inferred:** 1726 × 612 is the actual *provided image* resolution, not an asserted BMW-native framebuffer size. The photo is noisy/compressed and may have camera distortion or processing. Some visual measurements below are approximate first-pass anchors measured from that image, not a leaked OEM CAD specification. For literal factory pixel parity, a direct uncompressed 2024 G80 cluster capture and target hardware resolution still must be verified. Do not call unverified values OEM-certified.

### Mandatory output

1. Complete working source that draws all instruments as independent vector paths and supports dynamic updates.
2. A pixel-exact static fixture matching the supplied frame: `0 km/h`, secondary `0 mph`, `P`, parking brake on, `12:04 pm`, `207 km`, `LIMIT`, `4WD`, seatbelt lamp, and `+12.5°C`.
3. A freely resizable rendering pipeline with **native artboard `1726 × 612`**, a fixed aspect ratio, independently configurable target framebuffer, and no CSS/Qt automatic layout drift.
4. Export PNGs of original/reference, render, 50% alpha overlay, edge-difference, and color-difference maps.
5. Reconstruct *both* ROAD and SPORT/TRACK variants **only** when separate real reference frames are available. Never invent unseen OEM screens from this one image.

## 1. How to study the image before writing code

Zoom the **actual supplied JPEG** into these four areas without stretching:

| Region | Crop in source pixels `(x,y,w,h)` | Mandatory observations |
|---|---|---|
| A — speedometer and fuel | `(130,58,620,510)` | Outer blue shoulder, nested curved inner rail, all speed numerals, boxed `0`, 2nd mph, stepped fuel bar and petrol icon |
| B — center negative space | `(665,115,440,440)` | Two thin diagonal blue/red lines, their very precise lower elbows, truly black empty center, adjacent M panels |
| C — tachometer and oil | `(1010,57,650,510)` | Burgundy channel, hot-pink red perimeter, 8–0 numerals, shift lights, P, segmented oil temperature and blue icon |
| D — footer/status | `(75,482,1610,130)` | Outline M mark, time/range, LIMIT badge, segmented blue 4WD platform, seatbelt, miniature vehicle top view, external temp |

Use both bicubic **3×** and nearest-neighbor **6×** views. The bicubic view reveals overall shape and anti-aliasing; nearest-neighbor reveals source-pixel edges. Photo grain must not be interpreted as deliberate glowing lines. Use transparent-overlap composites to compare actual control points.

## 2. Source coordinate system and global composition

- Root viewBox exactly `0 0 1726 612`.
- Background is nearly black `#010207` to `#0b0d14`, with only restrained low-frequency illumination and slight photographic noise in the reference.
- **Do not** add a rounded dashboard container, card border, bezel, title banner, brand logo, or empty black space above the source frame. The image itself is the complete cluster artboard.
- Overall arrangement: left speed scale approximately `x=115..625`; black open central window `x=705..1080`; right tach scale `x=1175..1660`; footer `y=525..610`.
- The central area is **intentionally mostly empty**. Two large diagonal V-like needle-strokes are the defining feature, not blue ribbon wallpaper or SPORT PLUS text.
- All features must be authored in absolute source coordinates and uniformly transformed for deployment; do not stretch X independently of Y. Rectify actual panel capture separately if projecting into native hardware pixels.

## 3. Speedometer — the left blue rail

### Path architecture (coordinates approximate photo pixels)

| Element | Landmarks / path | Stroke or fill behavior |
|---|---|---|
| Top cyan line | `(287,70)` to `(625,70)` | Thin `2–3 px`, nearly straight, pale ice blue |
| Main outside body | starts `(287,70)`, descends to `(197,238)`, bends at `(195,250)`, continues to `(354,502)` | Broad luminous cyan outer rim with tightly rounded shoulder, *not* a perfect V |
| Recessed interior channel | inner approximately `(315,71)` down toward `(207,249)`, then `(364,501)` | Dark teal / navy semi-transparent panel, not solid cyan |
| Inner delicate contour | `(376,71)` curved to `(267,249)` and `(408,501)` | Thin `2–2.5 px` light-cyan stroke, smooth at bend |
| Scale tick marks | small dashes along diagonal near `y=100,149,198,250,299,350,401,452` | Short thin ice-blue horizontal marks, aligned to sloping frame |
| Bottom cyan cap | `(352,501)` to `(416,507)` | Separate short near-white horizontal shape |
| Main lower rail | `(358,513)` to `(904,515)` | Crisp `4–6 px` bright aqua line with restrained blue shadow below |
| Center-left diagonal | `(732,150)` to `(929,478)` then `(904,516)` | Separate very thin pale blue line, precise sharp elbow; **not part of the outside speed bezel** |

The cyan outer edge, dark-blue channel, inner luminous curved stroke, ticks, bottom white cap, long lower rail, and center diagonal MUST be independent paths. Do not draw the entire dial with one polygon or a gradient outline. Zoom shows the outer bend is subtly rounded while the lower elbow near `(905,515)` is sharp.

### Speed numbers, exact value sequence and anchors

Render this **nonlinear, angular** scale, not a circular speedometer. Top-to-bottom:

| Value | Approx. top-left anchor |
|---|---|
| 330 | `(175,88)` |
| 270 | `(149,138)` |
| 210 | `(133,189)` |
| 150 | `(113,239)` |
| 120 | `(137,289)` |
| 90 | `(187,339)` |
| 60 | `(222,391)` |
| 30 | `(255,442)` |
| 0 | `(316,494)` |

Use BMW-style wide squarish digital numerals, with open counters, chamfered/softened right angles, shallow proportions, and a pale desaturated cyan. A stock Arial/DejaVu font produces visibly wrong `0`, `2`, `3`, `4`, and `7` shapes. **Trace the distinct numbers as filled SVG paths or build a licensed OEM type/glyph atlas.** Matching the numeric glyph contours is mandatory, not an optional polish pass.

The large central actual speed is a **white squared ring `0`** occupying approximately `(539,245)..(604,295)`. It is not a round oval. Under it:

- `km/h` starts near `(548,305)`, medium condensed lettering ~20 px.
- The independent secondary `0` (mph conversion) is near `(576,341)..(608,366)`.
- `mph` near `(562,370)..(606,390)`, muted gray-blue. Both speed values are visible simultaneously in the reference, so never omit the secondary unit.

### Fuel strip left of digital speed

Slanted thin fuel indicator extends from about `(350,343)` to `(465,498)`. It is **not continuous white**: draw the top pieces in dark steel gray, middle pieces in gray, and lower sections in white, each with a tiny dark separator. Fine white leading edge runs alongside it. Labels:

- `1` near `(380,344)`.
- `1/2` near `(427,412)`.
- `0` near `(473,480)`.
- Small actual fuel-pump pictogram with directional chevron at `(455,445)..(488,470)`.

Do not substitute a horizontal fuel progress bar, colored battery icon, circular tank outline, or generic emoji.

## 4. M-colored dark-blue background geometry (major source of previous visual error)

The source uses four large, layered BMW M-like **blue slabs**, rather than a single flat gradient. Match their panel outlines, corner radii, diagonal negative gaps, and subtle thin crossings. Draw the near-black gaps on top of blue plates at the correct Z-order.

| Group | Approximate defining vertices (clockwise, source px) | Appearance |
|---|---|---|
| Left upper slab | `(396,105)`, `(541,105)`, `(627,230)`, `(457,230)`, `(405,270)`, `(309,270)` | Deep blue, rounded top corners, strong descending oblique |
| Left lower slab | `(437,311)`, `(670,311)`, `(886,480)`, `(558,480)`, `(530,463)` | Lower side of M, navy gradient, angled black separator |
| Right upper slab | `(1246,105)`, `(1395,105)`, `(1500,270)`, `(1403,270)`, `(1328,230)`, `(1169,230)` | Mirrored dark blue shape, black thin internal cut |
| Right lower slab | `(1060,230)`, `(1381,230)`, `(1227,480)`, `(969,480)` | Broad long blue descending form, near-black diagonal slash |

The upper left and right slabs each have a very thin diagonal dark cut. The lower slabs are not symmetrical rectangles. Their color stays in restrained dark cobalt `#081C35`–`#0D3868`, with soft electric-blue center highlights. The photograph contains visible grain; don't recreate JPEG block noise as large vector geometry.

The large black horizontal notch across the blue upper/lower geometry should frame the speed `0` and gear `P`. **No card backgrounds, neon lighting, decorative BMW roundel, speedline wallpaper, or floating 3D vehicle in the middle.**

## 5. Center M View strokes — the signature defining elements

This is the most important difference from the previous reference. There are exactly **two principal independent center slanted strokes**:

- Pale cyan: from about **`(732,150)` → `(928,478)` → `(904,516)`**, with uniform thin line width ~2–3 px. The last short section makes a sharp return to the lower cyan rail.
- Bright red: from about **`(863,300)` → `(994,516)`**, where it becomes the lower horizontal red tach rail. Source hue is luminous crimson but stroke is narrow, not a thick ribbon.

The void between and above these strokes remains close to black. Do not fill it with navigation data, a logo, gear status, or M setup options in the reference fixture. If a separate Waze/turn-viewer layer is implemented later, use a deliberately approved center-window mask and keep all speed, tach, gear, oil/fuel, warning indicators, and the lower rails unobstructed.

## 6. Right tachometer — red mirror and separate oil bar

### Red frame and number placements

- Thin top line from `(1177,69)` to `(1511,69)`; label **`1/min x 1000`** around `(1364,44)`.
- Outside hot-red boundary runs from `(1512,70)` to shoulder `(1608,248)`, bends, then returns to `(1445,514)`. Main perimeter is relatively thin and bright.
- Behind the outline is a deep dark wine/burgundy channel, with a smaller black recessed rail and an inner thin magenta contour from `(1418,71)` through `(1534,250)` down to `(1405,503)`.
- Lower horizontal red rail from `(993,516)` to about `(1438,516)`, with a separate brighter red sloping cap at `(1412,474)..(1490,514)` and a short white mark near `(1417,465)`.
- Very small pale/yellow shift-strip pieces near `(1525,130)..(1551,178)`, not a large glowing racing RPM arc.

Right-hand numerals, pale salmon/pink, clockwise down the outer rail:

| Value | Approx. top-left anchor |
|---|---|
| 8 | `(1552,86)` |
| 7 | `(1578,136)` |
| 6 | `(1611,187)` |
| 5 | `(1631,237)` |
| 4 | `(1598,288)` |
| 3 | `(1566,338)` |
| 2 | `(1538,389)` |
| 1 | `(1504,439)` |
| 0 | `(1472,494)` |

The large `P` on the right is a **white squared-stroke character** occupying about `(1279,245)..(1342,295)`. It is placed on the existing black notch (not a black rectangle with a visible border). Preserve its stem width, counter shape, and exact baseline. Dynamic gear states must use the same optical center.

### Oil/coolant-temperature strip

Reference places the sloped strip around `(1345,343)..(1459,500)` with individually separated gray/white bars, tiny red cap at top and cyan/light-blue cap at bottom. Match:

- `150` near `(1369,344)`.
- `°C` near `(1368,375)`.
- `100` near `(1328,412)`.
- `50` near `(1297,478)`.
- Small cyan oil/coolant pictogram near `(1322,450)`.

Each segment has a dark 1–2 px separation and subtle descending brightness differences. Use exact path outlines, not a single rectangle gradient, and do not swap the oil/coolant status icon for an unrelated symbol.

## 7. Footer, vehicle and warning details — one asset at a time

The footer is integrated into black glass, not a horizontal app toolbar. All shapes must maintain the exact positions of the picture. Draw from left to right:

1. Far-left yellow lighting icon around `(76,360)` and the red circled parking-brake `(P)` centered near `(91,493)`.
2. Thin **outline** BMW M mark at `(157,497)..(228,523)`; it is explicitly *not* filled gray stripes. Do not improvise M branding.
3. `12:04 pm` from approximately `(130,560)` to `(270,588)`. Wide squared digital numerals, compact low-case `pm`. No incorrect overlap.
4. Small left-arrow-plus-fuel-pump icon around `(342,563)` followed by `207 km` beginning near `(382,559)`.
5. Round white **LIMIT** badge centered near `(604,558)`, radius ~30 px, with a steel-gray outer ring and compact black lettering.
6. Segmented **navy blue four-pane bottom panel** from approximately `(725,537)` to `(1081,583)`. Bold bright `4WD` centered near `(912,548)`, with the separators visibly slanting rightward.
7. Red seatbelt unfastened indicator around `(1080,544)..(1110,582)`.
8. Detailed tiny **top-down vehicle** around `(1117,536)..(1250,584)`: dark-gray body, silver glancing edge highlights, black window section, four reddish seat patches, side mirrors/tires, subtle windshield reflections. It must look like a miniature car silhouette, not a mobile-phone icon or solid blob.
9. `+12.5°C` at approximately `(1584,563)` with the BMW-style large squarish digits and smaller raised degree/temperature suffix, right-aligned before the screen edge.

There are subtle blue and red reflections just below the lower rails around `y≈522–548`. These are weak and controlled; they must not turn into glassmorphism or a giant underside glow.

## 8. Typography — no generic font substitution in the accepted output

Build a reusable **BMW-like custom digital glyph atlas** for at least `0 1 2 3 4 5 6 7 8 9 : . + -` plus `P`, and separate small text lettering for `km/h`, `mph`, `pm`, `LIMIT`, `4WD`, and `°C`. When valid licensed BMW font/assets are available, use them. Otherwise hand-trace the contours from the 200–400% zoom crops. Generic default sans-serif, 7-segment arcade numerals, and a normal round `0` are unacceptable for final matching.

At the 1726px artboard scale, dial text is approximately 20–28 px high; primary digital speed/gear values are around 50 px tall; footer numeric status roughly 25–30 px tall. **These are starting measurements**; the output must be adjusted by optical overlap tests with the original.

Use independent kerning and optical baseline controls for each number row. For example, the left speed values do not form one vertical table; their X positions move outward/inward along a curved V scale. Tachometer values similarly follow the outer right arc. Place by the landmark table, not by a numerical interpolation function.

## 9. Rendering layers and code architecture

Draw in this exact layer order:

1. Black glass/backdrop, with very subtle luminance noise if desired for photo comparison.
2. Four independent deep-blue M plates and their fine diagonal hairlines.
3. All near-black separators/negative-space slices across those plates.
4. Cyan and red recessed gauge channels.
5. Bright outer cyan/red rims plus inner thin contours.
6. Lower horizontal blue/red rails, distinct short white caps, center diagonal strokes.
7. Tiny scale ticks, individual fuel/oil temperature segments, shift LEDs.
8. Custom path-based numerals, gear, both speed units and gauge labels.
9. Footer symbols, M outline, 4WD panel, LIMIT badge, seatbelt, miniature car, outside temperature.
10. Only after the geometry is correct: subtle bloom below bottom rails, restrained photographic noise and anti-aliasing calibration.

Suggested modules:

```text
cluster/
  artboard/ReferenceFrame1726
  background/MGlass
  background/MLeftUpperPlate
  background/MLeftLowerPlate
  background/MRightUpperPlate
  background/MRightLowerPlate
  gauges/SpeedOuterRail
  gauges/SpeedInnerRail
  gauges/SpeedTicksAndScale
  gauges/TachOuterRail
  gauges/TachInnerRail
  gauges/TachTicksAndScale
  gauges/FuelSegments
  gauges/OilTempSegments
  gauges/ShiftLightSegments
  gauges/CenterBlueAndRedDiagonal
  type/BMWNumericGlyphAtlas
  type/BMWSmallLabels
  indicators/DualSpeedReadout
  indicators/GearIndicator
  indicators/WarningTelltales
  indicators/FooterInfo
  indicators/TopViewVehicle
  state/ClusterState
  state/ReadOnlyVehicleTelemetryAdapter
  state/DeterministicDemoPlayer
  qa/ReferenceOverlay
  qa/PerspectiveCalibrator
  qa/PixelDifferenceReporter
```

Use Qt Quick/QML, GPU Canvas/SVG, or WebGL; the approach must retain vector path precision and smooth compositing. Use a real data model rather than a drawing that is only correct for the parked screenshot.

## 10. Data model, safety and dynamic behavior

```ts
type MClusterState = {
  speedKmh: number;
  secondSpeedUnit: 'mph' | 'km/h';
  rpm: number;
  gear: string;
  fuelFraction: number;
  rangeKm: number;
  oilTempC: number | null;
  exteriorTempC: number | null;
  clockISO: string;
  mXDriveMode: string;
  speedLimiterActive: boolean;
  parkingBrakeActive: boolean;
  seatbeltUnfastened: boolean;
  lightStatus: string | null;
  engineReady: boolean;
  warningIds: string[];
};
```

- Demo fixture: `speedKmh=0`, secondary mph `0`, `gear='P'`, `rangeKm=207`, `mXDriveMode='4WD'`, `clock='12:04 pm'`, `exteriorTempC=12.5`, parking brake on, seatbelt unfastened.
- The speedometer/tachometer rails and numerical readings are data-bound, not drawn permanently with one fixed state. Interpolate only display motion; do not invent telemetry when stale or disconnected.
- If using this on a live vehicle, safety-critical warnings and actual speed/gear always take precedence and are never masked by maps, camera, or turn-viewer.
- Aim for 60 fps if supported by the target device, with clear degradation handling and actual framebuffer calibration. 60 fps is a development goal, not a BMW official claim.
- The source picture shows a **0–330 km/h** outer printed scale and 0–8 ×1000 rpm tach scale. The printed maxima are not evidence of the actual vehicle's top speed or safe engine redline.

### Optional later navigation / turn-viewer integration

The center black region between the two diagonals is an attractive portal for an external MGU-rooted Waze or turn-viewer surface, but this is a *custom feature* and not part of the reference image. If authorized later, render only the central content layer with a localized opacity mask around roughly `x=740..1050`, `y=105..470`; **keep the signature cyan/red center lines, all outer gauges, real-time numerical readings, status/warning symbols and bottom rails fully legible**. Do not treat an approximate mask as a certified safe production HMI without vehicle testing.

## 11. Mandatory image-based acceptance tests

1. Load the actual 1726 × 612 reference JPEG and record its SHA-256, pixel dimensions, orientation, and exact normalized display crop.
2. Trace at least **80 manually verified control points** spanning the two outer gauge shapes, inner contours, eight/nine numerals per side, lower rails, center diagonal elbows, blue slabs, fuel/oil bars, primary `0`, gear `P`, LIMIT badge, and footer status.
3. Render at exactly **1726 × 612** and compare with the source using **50% alpha overlay**, **edge-only difference**, and **perceptual/linear RGB difference**. Include a blink comparator that alternates original/render at matched coordinates. The previous render failed this test.
4. Zoom to 400% to confirm the `0`, `P`, `330`, `8`, `LIMIT`, and small fuel/oil symbols. Reject normal-font replacements that look different.
5. Match all major edge junctions within **±2 source pixels** after photographic perspective has been resolved. Use separately tuned masks for photographic texture, which cannot be reproduced by pure static vectors. This is a proposed acceptance threshold, not a verified result already achieved.
6. Do not declare the application 1:1 until the reference-versus-render overlays show no meaningful mismatched bars, lines, numeral contours or panel geometry. The SVG sample is a starting traced implementation, not proof that this test has passed.
7. Test the live behaviors separately: zero speed parked, normal cruising, increasing rpm near shift light threshold, unit conversions, changing 4WD display state if vehicle supports it, warning lamp changes, telemetry interruption, dimming, and resolution changes.

## 12. Final delivery requirements for the coding AI

Provide: executable vector implementation, all vector component source, font/glyph atlas, original reference frame metadata, screenshot fixtures, overlay/diff test reports, and a compact list of remaining measured mismatches. Preserve strict BMW M visual language, with no TBW branding, racing-game elements, or decorative redesign. The final output is judged by *source-photo shape and typography equivalence*, not by subjective aesthetic similarity.

### Authenticity note

This guide deliberately targets the exact newly supplied M View image, not the older `IMG_9427.jpeg` and not an imagined generic dashboard. Official 2024 BMW M3 interface differences depend on hardware, software, drive mode, market and configuration. The picture's provenance and exact model-year/software variant have not independently been verified, so label the deliverable **reference-matched BMW M View reconstruction** unless further OEM evidence is supplied.
