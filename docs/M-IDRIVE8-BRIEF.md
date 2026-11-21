# BMW M iDrive 8–inspired cluster design guide

Build a high-resolution digital instrument cluster in the visual language of BMW M’s iDrive 8. Use the three dashboard photos as references for the overall proportions, sharp blue and red gauge accents, large white figures, and the way the center opens for navigation or camera guidance. Draw original instrument paths, numberforms, icons, and status markers. Keep the display unbranded. The dimensions below are exact targets for this implementation. The photos establish the design cues and visible behavior.

Speed and fuel sit on the left. Gear, RPM, and oil temperature sit on the right. **Only the center fades when switching between the map, Waze, Turn Viewer, or camera.** Keep every gauge, unit, telltale, and status strip at its normal opacity throughout.

## 1. Canvas and instrument geometry

Use a 1920 × 720 logical canvas, with the origin at the upper-left. For a web renderer, set SVG viewBox="0 0 1920 720" and preserveAspectRatio="xMidYMid meet". Keep the artwork, source viewport, and capture frame on one uniform transform. Letterbox to fit a different output ratio. Use the inverse transform for approved interaction.

| Region | Bounds or anchor in design units |
| --- | --- |
| Left gauge envelope | x=72–416, y=112–592 |
| Right gauge envelope | x=1504–1848, y=112–592 |
| Top warning and telltale space | x=72–1848, y=34–90 |
| Center aperture | x=440–1480, y=108–586 |
| Center guidance safe area | x=500–1420, y=154–540 |
| Lower status rail | x=72–1848, y=626–686 |
| Speed numeric anchor | right edge x=372, baseline y=378 |
| Speed unit anchor | right edge x=372, baseline y=416 |
| Gear anchor | centered at x=1652, baseline y=388 |
| RPM scale title | right edge x=1798, baseline y=128 |
| Left secondary scale | fuel module x=190–385, y=459–560 |
| Right secondary scale | oil temperature module x=1536–1718, y=459–560 |

Put both primary instruments on angled outer rails. Give the left side a short upper blue entry, an inset around midheight, and a longer diagonal return below it. Give the right side a steep upper red section, a brief vertical shoulder, and a more upright lower return. Both rails frame the content with dark air around the large digits. Use open edges and only localized graphite shading behind the speed and gear. The span between the gauges should read as one screen, with restrained top and bottom horizontal accents.

Reference paths for this design:

~~~text
Blue speed rail, from minimum to maximum:
M 343 571 H 226 L 177 537 L 105 380 L 86 326 L 104 281 L 177 153 H 336

Blue inner hairline:
M 352 551 H 233 L 193 524 L 124 373 L 105 327 L 124 288 L 190 173 H 344

Red RPM rail, from minimum to maximum:
M 1552 572 H 1708 L 1751 540 L 1820 407 L 1820 342 L 1806 306 L 1732 145 H 1588

Red inner hairline:
M 1568 552 H 1699 L 1736 523 L 1800 402 L 1800 347 L 1787 313 L 1719 165 H 1593

Center boundary:
M 464 108 H 1456 L 1480 132 V 562 L 1456 586 H 464 L 440 562 V 132 Z
~~~

Stroke the instrument rails between 11 and 15 units. Use near-square ends, bevel joins, and clean deliberate diagonal cuts. Use 1.25–1.75 units for inner hairlines. Put the ends of the blue and red rails on separate planes and leave the 24-unit gutters next to the center aperture open. The permanent gauge layers can use alpha for shading and highlights. Their alpha is independent of the map or camera state. A host priority warning can cover the center without relying on either provider.

## 2. Color, lettering, and gauge motion

| Token | Day | Night | Placement |
| --- | --- | --- | --- |
| Outside field | #0A101A | #04070E | Full canvas and gutters |
| Recess shade | #101A29 | #091321 | Subtle shade behind the instruments |
| Inactive center matte | #101A26 | #0A1320 | Center at rest and transition background |
| Main digits | #F4F8FF | #E8F0FA | Speed and gear |
| Secondary text | #A9BBD1 | #8DA4BD | Scales and units |
| Blue rail | #287EF5 | #2579E4 | Speed scale |
| Blue edge highlight | #73DDFF | #56C8FF | Narrow lit speed edge and marker accent |
| Red rail | #F12A3F | #DE263D | RPM scale |
| Red edge highlight | #FF7180 | #FF586C | Narrow red edge and marker accent |
| Warning amber | #FFD067 | #F2BD51 | Vehicle warnings and approved shift overlays |
| Neutral rule | #51657B | #304458 | Low contrast separators |

- Draw wide, squared digits with clear open counters where the outline permits, flat horizontal strokes, and small chamfers. Use an independent set of original glyph outlines with tabular widths. Keep digit lean nearly upright, starting at 0–4°. Use 94 visible units for speed and 88 for gear. Target an advance of 63–66 units for speed digits. Check single, double, and triple digits against the speed anchor. Keep P, R, N, D, and numbered gears within a common optical box.
- Use 24–28 units for the speed unit, 19–23 for scale labels, and 18–21 for secondary labels. Right-align the speed unit under the speed value. Mark the RPM scale with a small muted ×1000 r/min label. Draw scale numerals in a subdued blue or rose tint and brighten the active marker. Keep the main number brighter than its rail.
- Draw each rail as an inactive track with a narrow colored edge. Draw active progress from the bottom along the rail’s path length using one SVG path and a dash mask or equivalent. Use the stated path direction and clamp the normalized value to 0–1. The point where the active track ends receives a short white marker, starting at 19 × 3.5 units, aligned across the rail normal. Place ticks on the long angled sections. Define tick positions as explicit value/fraction pairs when the scale spacing is nonlinear. The digital value, marker, and labels must use one unit conversion and the same value mapping. Keep short decorative rail caps outside the range used for tick labels and active progress.
- Use a small optional red fringe on the high RPM end. Obtain shift and operating limits from verified vehicle data. The end of the drawn scale is a display choice.
- Draw fuel at the lower inside edge of the left gauge and oil temperature at the corresponding lower inside edge of the right. Use compact diagonal segmented bars with a white live section and dark inactive segments. Start each module at a 5-segment track with a width of 9–12 units. Put the fuel or oil glyph near the lower endpoint and the labels outside the bar. Retain an em dash for unknown readings. Keep oil and coolant as separate data channels.
- Put clock and remaining range on the lower left and ambient temperature on the lower right. If the host supplies a drive setting, use one restrained center status lozenge with angular ends. Keep speed limit distinct from cruise target. Show host-provided telltales in stable positions.
- Keep glow confined to the lit rail and the active marker. Start with a 0.65–0.9-unit blur sigma at 8–14% opacity. Restore a sharp vector edge above it. Use shallow graphite shading at the gauge edges and keep the central field visually quiet.
- The final screen uses clean gradients and sharp small labels. Keep physical glass glare, reflections, perspective distortion, and steering wheel occlusion in optional presentation renders.

## 3. Define exactly what fades

The screen has a **spatial feather** at the edge of one polygon and a separate **temporal fade** when the content changes. Use the same aperture in Map, Waze, Turn Viewer, and optional camera modes.

| Screen section | Behavior in every center mode |
| --- | --- |
| Center walls and corner cuts | Feather over 40 units measured inward from the polygon edge |
| Central interior | Fully reveals the selected source after the temporal fade |
| Side gutters | Remain outside the aperture. No source pixels appear there |
| Left instrument and its speed, fuel, and units | Fixed at their normal opacity |
| Right instrument and its RPM, gear, oil temperature, and units | Fixed at their normal opacity |
| Top warning rail and bottom status rail | Fixed at their normal opacity |
| Any host-owned priority overlay | Drawn independently above the center content |

Let d be signed Euclidean distance to the closest segment of the closed center polygon. d is positive inside, zero on the perimeter, and negative outside. Use a point-in-polygon test for sign and closest-point-on-segment distance for magnitude. Work in logical units.

~~~ts
function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

const reveal = smoothstep(0, 40, signedDistanceToCenterPolygon);
const temporalReveal = smoothstep(0, 1, transitionProgress);
const centerAlpha = reveal * temporalReveal;
~~~

Reference checkpoints once the source has fully transitioned, away from the chamfers:

| Pixel coordinate | Expected provider alpha |
| --- | ---: |
| (439, 347) | 0 |
| (440, 347) | 0 |
| (450, 347) | 0.15625 |
| (460, 347) | 0.5 |
| (470, 347) | 0.84375 |
| (480, 347) | 1 |
| (960, 108) | 0 |
| (960, 128) | 0.5 |
| (960, 148) | 1 |
| (960, 347) | 1 |
| (1460, 347) | 0.5 |
| (1480, 347) | 0 |
| (960, 566) | 0.5 |
| (960, 586) | 0 |

At the corners, measure against the chamfer. A pair of horizontal gradients alone will leave the corners and top/bottom untreated. Implement the analytical distance in a shader or precompute a stable alpha mask from the polygon for each target output. Vector-render the foreground gauges independently. Export a colorless PNG mask with an alpha channel if the host expects a texture. Interpolate alpha linearly. Keep mask weights independent of whether the artwork is in a day or night palette.

The clear center must contain route instructions and attribution. Position provider UI in the safe rectangle. For a surface the renderer cannot reflow, use an approved viewport, a compatible layout exposed by its owner, or a contained fit with a matte. Preserve attribution, controls, route labels, and other required source content. Maps and camera may fill the same opening with different safe framing.

## 4. Wire up one of two composition paths

### A. The renderer owns the center content

Use this for the reference app, a shared display host, or a provider exposing an authorized render surface.

Draw the opaque base and neutral matte, then the selected provider layer using centerAlpha. Draw the fixed instruments and warning layers last. A selected provider should be opaque inside its own composed viewport after optional internal layers are resolved. Apply the feather once when blending that completed viewport over the matte.

When both providers are available at once, composite each onto the same neutral matte, then mix the two resolved views using the transition progress. Apply the spatial feather once to the mixed result. Use premultiplied alpha at the compositing boundary. Use linear-light interpolation where the render pipeline supports it and encode the final RGB for the display’s color space. Two overlapping independently faded surfaces can leak the matte or appear dim through the transition.

### B. The existing MGU app owns an underlying surface

Use this when the authorized display host explicitly supports both surfaces on the same cluster output. The MGU app may provide the Waze surface, a map, or the turn/camera view. The selected surface must already be behind the cluster overlay in the compositor.

- Paint the theme’s plate, underlay, and any effects that can span the center into a background buffer. Set that buffer’s alpha to 1 − centerAlpha across the cluster. If using premultiplied RGBA, scale its premultiplied RGB and alpha together.
- Draw foreground gauges and the permanent rails into a separate layer above the masked background. Place no opaque artwork or full-display black fill across the center after cutting the opening.
- Keep the external source fully opaque behind the aperture. Apply the spatial feather on the overlay only, so the two matched boundaries do not attenuate the image twice.
- The correct steady-state pixel in the core is the original source pixel, apart from an approved source-internal adjustment. A black CSS background at the root, an opaque window, or a format that drops alpha will cover it.
- Verify target display identity, surface order, RGBA output, real alpha blending, geometry, and resize before attaching a live source. A transparent WebView or correctly exported alpha image alone cannot establish compositor support.
- Verify input separately. Transparency is visual. Input focus and routing belong to the host. Keep moving-vehicle interaction under the authorized navigation host’s rules.

If the host lacks an approved way to share or layer surfaces, use the renderer-owned center with a supported source. If only approved maneuver events exist, render Turn Viewer from those events. If neither is available, show the neutral center and allow navigation on the available supported display. Keep native cluster ownership and required vehicle information with the vehicle’s host.

## 5. Connect Waze and the existing MGU program

Build the UI against a small adapter. Inventory the existing program’s documented outputs or interfaces available to its owner before binding it to the renderer. Record the exact display target, whether it publishes full map pixels or only maneuvers, initialization/readiness signals, ownership of input, and lifecycle callbacks.

Design around the following support distinctions:

| Available source | Output offered by the cluster |
| --- | --- |
| Authorized Waze map surface attached to the cluster output | Live Waze map in the aperture |
| Authorized Waze maneuver feed without map pixels | Turn Viewer with Waze-sourced maneuvers |
| Another authorized map surface | Map in the same aperture, labeled by the real provider where appropriate |
| Another authorized maneuver feed | Turn Viewer using that provider’s data |
| No compatible surface or maneuver data | Neutral center. Navigation continues on its own available display |

Waze documents instrument-cluster navigation through Android Auto on supported vehicles. The exact vehicle/host and projection mode determine availability. Waze Deep Links can open a location or start navigation in Waze. Their documented interface does not deliver a cluster render surface or subscribe to maneuvers. Treat the existing rooted MGU program as an already running provider and use its authorized output contract. A successful app launch or a Waze image on the head unit is separate from a confirmed presentation on the instrument cluster.

For the first hardware check, substitute a flat magenta rectangle, then a numbered grid with contrast markers, as the authorized source. Confirm the core copies the source, each feather edge behaves the same, and there is no leak into the gauges. Replace the grid with the actual provider only after the host path passes.

Provider references
- [Waze Help — Waze on Android Auto](https://support.google.com/waze/answer/15113302)
- [Google for Developers — Waze Deep Links](https://developers.google.com/waze/deeplinks)
- [W3C — CSS Masking](https://www.w3.org/TR/css-masking-1/)
- [W3C — Compositing and Blending](https://www.w3.org/TR/compositing-1/)

## 6. Make the turn viewer work with and without a camera

**Turn Viewer is the maneuver renderer.** Use an original turn arrow, distance, and street name inside the center. It must work as a clear graphics-only view. A camera is a distinct background capability that the host may supply.

### Graphics-only Turn Viewer

- Main arrow footprint starts at x=895–1025, y=229–359. Use a 120–132-unit directional SVG icon with a short stem and generous separation from the distance. Draw left, right, gentle left/right, U-turn, merge, keep left/right, straight, and roundabout as original paths.
- Distance line is centered at x=960, baseline y=421, visible size 51 units. Render the unit at 25 units. Put the street at y=468 with size 26. Use measured line widths and an ellipsis within the safe rectangle. Keep the maneuver name or street from pushing the distance line.
- Use supplied lane data if present and current. Give it a separate row at y=500–526. Use shape and position in addition to color to highlight the recommended lane.
- Take street, turn type, distance, route identity, and confidence or validity from the provider. Clear stale guidance on reroute, route cancellation, provider failure, or route identity change. Keep the current route as the single source of truth.
- In demo mode use synthetic records. Avoid implying an arrow was derived from a camera image.

### Turn Viewer over a camera

- Use only a camera surface already made available by the authorized host for this use. Let its applicable restrictions and required warning overlays take precedence.
- Use the identical aperture and feather. Contain the critical camera picture by default and preserve the original aspect ratio. Any approved crop must preserve the source’s intended area and be validated with a camera test grid. Keep the original field of view. Use a neutral matte for leftover canvas.
- Put the compact turn arrow in a fixed screen-space panel around x=895–1025, y=235–365. If the frame is bright, add a local matte behind the arrow and distance rather than globally darkening the feed.
- Treat guidance as a screen-space overlay. Road-registered AR requires a separately authorized and calibrated source with aligned pose and frame timing. Use the graphics-only view until that is available.
- Upon lost, paused, or stale video, leave the camera view and use the graphics-only Turn Viewer whenever fresh maneuver information is available. With no valid maneuver either, return to the live map if available or neutral. Do not leave a frozen road view on the cluster.

## 7. Specify selection, readiness, and fade timing

Default to a live compatible map in Auto mode when it is ready. Expose Map and Turn as preferences where the host permits, and retain the preference through reconnection if its source is still valid. For Auto, show Turn Viewer only on a current provider-issued imminent maneuver signal. When that signal clears, the maneuver completes, or the route is canceled, resolve the new center mode. Derive no automatic turn trigger from distance alone until a project explicitly chooses and validates its own policy. Use camera during turn mode only when the authorized host allows it and delivers a current frame.

| Event | Required transition |
| --- | --- |
| Boot or resume | Keep the normal instrument frame. Start with neutral or an already confirmed provider |
| First valid map frame | Fade the center open over 180 ms |
| Map to turn, or turn to map, with both source views ready in one compositor | Mix the center views over 180 ms with the same spatial feather |
| Only one external surface slot | Close to neutral over 110 ms. Switch surfaces while covered. Wait for the current source to present its first frame. Reopen over 180 ms |
| New source fails before switch | Retain the old healthy view if still valid, or return to neutral |
| Feed lost, canceled route, stale camera, or host revocation | Remove invalid content promptly. Use a fresh eligible fallback or neutral |
| Vehicle host priority | Yield the center immediately as directed by the host. Reevaluate sources after release |
| Reduced motion | Swap the center content on a ready boundary without decorative animation |

Animate elapsed time with smoothstep easing. Use a monotonic clock. Limit transitions to center layers. Position, scale, visibility, and opacity of all fixed instruments must be unchanged by the center transition.

Set a unique request ID on every source bind. Accept readiness and frame notifications only from the current request and host session. Reject reordered maneuver events. On suspend, provider restart, display resize, or surface loss, invalidate old frame references and request a fresh viewport or handle. Use the provider’s cadence and freshness rules. A stationary map may reuse the same pixels for a long interval, so prefer a provider health signal for map availability. For moving camera, check current frame metadata or presentation health from the host. Do not use a single inactivity timer for both.

## 8. Use a small provider contract

Treat the following TypeScript as a design contract. Map native platform callbacks to it. The actual surface handle type belongs to the authorized host. Normalize local timestamps to the same monotonic clock before comparing them.

~~~ts
type CenterMode = "neutral" | "map" | "turn" | "camera-turn";
type CenterPreference = "auto" | "map" | "turn";

interface ProviderStatus {
  bindingId: string;
  sessionId: string;
  source: "map" | "camera";
  outputId: string;
  presentable: boolean;      // First frame for this binding confirmed on target
  lastHealthAtMs: number;    // Local monotonic clock
  visibleFrameAtMs?: number; // Local mapped presentation timestamp
}

interface Maneuver {
  bindingId: string;
  routeId: string;
  sequence: number;
  receivedAtMs: number;
  expiresAtMs?: number;
  kind: "left" | "right" | "slight-left" | "slight-right"
    | "u-turn" | "merge" | "keep-left" | "keep-right"
    | "straight" | "roundabout" | "other";
  streetName?: string;
  distanceMeters: number;
  imminent: boolean;
  roundaboutExit?: number;
  lanes?: Array<{ direction: string; recommended: boolean }>;
}

interface ClusterTelemetry {
  speedKph: number | null;
  engineRpm: number | null;
  gear: string | null;
  fuelPercent: number | null;
  oilTemperatureC: number | null;
  ambientTemperatureC: number | null;
  rangeKm: number | null;
}
~~~

Keep telemetry and provider slots independent. Normalize mph/km/h and °F/°C at the display boundary. Unknown stays unknown through conversions. Validate field ranges and string lengths, apply clipping where needed, and resolve all live vehicle values through the host’s authorized interfaces. This brief is for the display and presentation adapter.

## 9. Define quality and handoff

Build the reference renderer using SVG for fixed geometry, local glyphs, icons, and layered fades. A native renderer can use the same coordinate table and path data. Cache masks and fixed geometry at the current output scale. Render provider surfaces at the required display resolution, avoid GPU-to-CPU copies inside the live render loop when the supported host can share a surface, and use an actual target device or authorized bench setup to measure timing. Start with a 60 fps render target and retain the instrument frame when a provider drops a frame.

Deliver these items:

1. Runnable renderer and one isolated provider adapter interface. Include mock map, turn, and optional camera fixtures.
2. One centralized design configuration, editable paths or font assets, and a mask asset or exact mask generator.
3. A view selector with Neutral, Map, Turn, and Camera Turn preview fixtures. Include day/night and reduced motion options in the development preview.
4. Opaque composite PNGs at 1920 × 720 and 3840 × 1440. Add lossless 7680 × 2880 stills where appropriate. Export fixed vector artwork as self-contained SVG and an RGBA overlay PNG or frame set that preserves a fully transparent center in the open state.
5. A README with run/export instructions, supported provider paths, fixture data origins, target display capabilities, and the actual results of hardware and mock tests. Explicitly label when an MGU path has yet to be verified.

Acceptance checks:

- Use a solid source color to sample the alpha values in §3. Allow about 2/255 when measured in an 8-bit reference alpha PNG. Sample the nearest matching logical coordinate in high-resolution renders. Tests around boundaries must account for pixel-center conventions.
- Compare all pixels outside the aperture in frozen fixtures. Side gauges, status rails, and warnings must match bit-for-bit across center modes at constant telemetry and theme settings.
- Check the four chamfers and all four edges, the transparent core, and the corner of each gutter. Look for opaque blacks, seam banding, double masking, and halos. Verify the final output alpha with a checkerboard or underlying test surface.
- Run rapid Map → Turn → Map selection, late frame arrival, reconnect, camera interruption, route cancellation, navigation without valid camera, unavailable Waze, and host priority override. Verify graceful fallback and fresh frame handoff.
- Verify maps and camera on their real output identifiers, aligned to the aperture, at intended aspect ratios. Verify legibility in dark and bright demo imagery and that safety status survives every transition.
- Use the photographs to judge scale hierarchy, placement of center content, and legibility. Use this brief’s own geometry and test coordinates to judge exactness.

**Definition of done:** The fixed instrument frame draws sharply and consistently, the selected source is clearly visible in the center, the edges feather smoothly, source changes never fade the instruments, and an unavailable or stale source resolves to a supported fallback.

