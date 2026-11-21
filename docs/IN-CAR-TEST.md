# First drive: in-car test checklist

Toro has been run end to end against a simulated car (`npm run car-sim`), but
never in a vehicle. This list is what the simulation **cannot** prove. Do the
parked steps first; do the driving steps on a quiet road or with a passenger
watching the cluster.

## Before you start

- Head unit rooted, MGU Store installed, `cluster-render` working (another
  cluster app has drawn on this car, or the Store reports it running).
- Install **MGU Styles** from the Store (see the README). It is **off**
  after install: nothing changes until you press *Show on cluster*.
- To get out at any point: open MGU Styles → **BMW original**. If iDrive is
  unreachable, a key-off hands the cluster back; a head-unit restart always
  does.

## Parked, engine off

| # | Check | Expect |
|---|---|---|
| 1 | Open MGU Styles on iDrive | Status card, settings, a sketch of the dial. Status: *Off – BMW original cluster* |
| 2 | Press **Show on cluster** with the ignition off | Status: *Waiting for the car to switch on*. Cluster unchanged |
| 3 | Ignition on (engine off), then start | Toro appears within about a second of drive readiness |
| 4 | Look at the bottom strip | BMW's strip (location, time, gear, ranges) fully visible. **No grey gear box drawn over Toro** — if one appears, note it and press BMW original |
| 5 | Look at the corners and warning lights | Tyre-pressure and parking-brake telltales visible; nothing clipped by the glass corners |
| 6 | Read the pods | Coolant and fuel plausible against BMW's own readings; oil pressure shows `--` (no source yet) |
| 7 | Settings → Background → Modern, then back | Cluster rebuilds in under a second each time |
| 8 | Settings → Rev limiter → 6,000, rev gently past 5,800 in P/N | Shift lights fill and the screen edges flash just below 6,000. Set it back to *From the car* |

## Driving

| # | Check | Expect |
|---|---|---|
| 9 | Pull away and accelerate | Band lights up from the left with the red needle at the tip; each numeral grows and turns the accent colour as it is reached |
| 10 | Compare speed with BMW's head-up display or GPS | Within 1–2 mph |
| 11 | Gear (D/M, paddles) | Large gear numeral matches the gear engaged; P/R/N shown when selected |
| 12 | Drive mode switch: Comfort → Sport → Sport+ | Label reads STRADA → SPORT → CORSA (or BMW's names if chosen) |
| 13 | Boost under load | Rises to roughly 15–20 psi on a B58 at full load; `--` or 0 at idle |
| 14 | Turn left / brake hard | G meter moves the right way. **If left/right or accel/brake are reversed, note which** — the sign convention is the one thing still unverified |
| 15 | Key off | Toro disappears and BMW's cluster returns, every time |
| 16 | Next start | Toro returns on its own (it starts with the car) |

## M style (BMW M View) — rebuilt in Beta 2

Settings → Style → M, or step to it with **Design** on the app's page.
For the centre, *Maps on cluster* and/or *Turn View* must be installed.
Nothing has to be set on the cluster for Waze; Turn View's camera needs
**Instrument cluster > Central display area** on **Map view** (Turn View's
own requirement).

Beta 2's M has not been on a car yet. A photo of the whole cluster, parked,
is the most useful thing to send back: it can be compared with the
reference frame the same way the preview is.

| # | Check | Expect |
|---|---|---|
| M1 | Parked, engine running, centre *Nothing* | The M View as in `docs/ref/m-view-reference.jpg`: blue speed dial left, red rev dial right, the dark-blue plates, the cyan and red lines through the middle, big `0` and `P`. Nothing of BMW's gauges shows anywhere |
| M2 | Bottom strip and telltales | As items 4–5 above: all of BMW's visible. The tyre-pressure light, when lit, sits left of the speed scale and covers none of its numbers; the parking-brake light is well right of the rev scale |
| M3 | What is *not* there | No parking-brake, seat-belt, lights or LIMIT symbol of ours anywhere: those are the car's and only the car draws them. **If the car's own lamps land on top of something of ours, note which and where** |
| M4 | Rev gently in P | The white marker rises up the red dial, the band under it fills red, and the two numbers either side of the marker turn white. Near your redline a pale strip shows inside the rim |
| M5 | Drive: speed | The marker rises up the blue dial the same way; the big figure is your speed, the smaller one under it the other unit (mph ↔ km/h); both agree with BMW's head-up display |
| M6 | Fuel and oil strips | Fuel lit from the foot to the tank level (half a tank: two segments). Oil temperature rises from the foot as the engine warms; its marks are 120 / 210 / 300 °F (50 / 100 / 150 °C) |
| M7 | Footer | The clock shows **the car's own time**, turning over with the head unit's status-bar clock; range and outside temperature match BMW's. **If the clock is missing, say so**: it needs a signal from the cluster that has not been seen on this car yet (no clock is shown rather than a wrong one) |
| M8 | Settings → M: footer panel shows | 4WD, 2WD, the driving mode (BMW's name, changing as you switch modes), or no panel |
| M9 | Phone connected, Waze navigating, press **Waze** | Status row says *Waze map showing* within a few seconds; the map fills the black field between the plates and fades softly towards them, the two fine lines still over it. **Note anything of BMW's showing through inside the window** |
| M10 | Look at the window's edges | An even fade all round, no hard line, no map on a plate or behind a figure |
| M11 | Press **Waze** again | The window closes quickly. Speed, gear and the dials never flicker |
| M12 | Key off with the Waze map showing, then start again | At key-off BMW's cluster returns and Waze has its usual place back |
| M13 | Centre → *Turn View camera* (front camera car, Map view set) | Turn View switches on by itself; the camera fills the window. Leaving the setting switches it off again. **Note anything of BMW's drawn over the camera** |
| M14 | A route in BMW Maps or CarPlay, centre *Turn card only* | Arrow, distance and instruction (TURN LEFT, EXIT 2…) between the plates as a turn comes up; gone when the route ends |
| M15 | Rev limiter, parked | The red band flashes (and the screen edges, if chosen); nothing else moves |
| M16 | Holiday theme on, in M | Snow down both sides outside the dials, the tree right of the rev scale; no number is snowed on |

## New in 0.3

| # | Check | Expect |
|---|---|---|
| N1 | Open MGU Styles on iDrive | The page fills the whole screen (needs `mgu-render`; the Store installs it with the app). **If it still shows in a frame, say so** |
| N2 | Tap ◀ / ▶ beside the sketch, then turn the controller to **Design** and press | Steps Toro genuine → modern → Revuelto → M; the cluster follows within a second |
| N3 | Toro, side gauges | Two slanted bar gauges each side: TEMP. OLIO / PRESS. OLIO (or PRESS. TURBO) left, BENZINA / TEMP. ACQUA right; the red needle sits at the reading shown beside the label |
| N4 | Rev to the limiter, parked | Lamborghini shift lights close in from both ends, then fire in bursts with the screen flash; the whole cluster shakes in step and settles when the revs drop. BMW's bottom strip and telltales do not move |
| N5 | Settings → Shift lights GT3 / single blade, Shake off | Each looks as named; with shake off nothing moves |
| N6 | Holiday theme on | Snow drifting down both sides, a lit tree right of the dial; the gauges stay readable over it |
| N7 | Start-up message on, then key off and start again | The words show over black for the chosen time, then fade slowly into the cluster. Changing a setting while driving does not bring them back |
| N8 | Start at every startup off, key off, start again | BMW's own cluster; **Cluster on / off** brings MGU Styles up for this drive |

## New in 0.4

| # | Check | Expect |
|---|---|---|
| F1 | Drive with Refresh rate 60 and needles *Glide smoothly* | The dial, speed and gauges move continuously, no steps; a downshift's blip still shows at once. Try 30 and *Jump* to compare |
| F2 | Side gauges | Left pair reads left to right, right pair right to left; each wedge hangs from its scale, deepest at the high numbers |
| F3 | Boost under load | Level with the speed, left of the gear: the figure grows a step with each psi; the faint wedge to its right sweeps right to left |
| F6 | Toro, Waze navigating, press **Waze** on the page | The style stays Toro; within a few seconds the map shows through a soft opening behind the dial. Press again: it closes and Waze goes back to its own place. The page's Waze row says what it is doing |
| F7 | Holiday theme on with Waze showing | Snow falls down both sides but keeps off the gauges; nothing of it over the map |
| F5 | Settings → Rev number at the needle: Bold, filled | The number the needle is passing turns solid in the accent colour; Outline goes back to the hollow look |
| F4 | G meter in a right-hand bend, then braking | The point moves right in the bend and down under braking; the hardest load stays as a red line for about 3 s, then fades |

## Report back

For anything wrong, a phone photo of the cluster plus the item number is
enough. The app's log is in its data folder on the head unit
(`mgustyles_toro.log`) and records every state change, which makes a
mismatch quick to trace.
