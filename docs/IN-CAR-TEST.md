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

## Track style (iDrive 8 M look)

Settings → Style → Track. For the centre, *Maps on cluster* and/or *Turn View*
must be installed, and the car's **Instrument cluster > Central display
area** set to **Map view**.

| # | Check | Expect |
|---|---|---|
| T1 | Parked, engine running, centre *Boost and logo* | Blue tower left, vermilion tower right, TBW mark and boost in the centre. Nothing from BMW's gauges shows anywhere |
| T2 | Bottom strip and telltales | As items 4–5 above: all of BMW's visible |
| T3 | Phone connected, Waze navigating, press **Waze on cluster** | Status row says *Waze map showing* within a few seconds; the map fills the centre window and fades softly into its walls. **Note anything of BMW's showing through inside the window** |
| T4 | Look at the window's edges and four corners | An even fade all round, no hard line, no map outside the frame |
| T5 | Press **Waze on cluster** again | The window closes quickly; boost and logo return. Speed and gear never flicker |
| T6 | Key off with the Waze map showing, then start again | At key-off BMW's cluster returns. With *Maps on cluster* in BMW's Map view, its map is back in BMW's own centre (it was given back) |
| T7 | Centre → *Turn View camera* (front camera car) | Turn View switches on by itself; the camera fills the window. Leaving the setting switches it off again. **Note anything of BMW's drawn over the camera** |
| T8 | A route in BMW Maps or CarPlay, centre *Turn card only* | Arrow, distance and instruction (TURN LEFT, EXIT 2…) as a turn comes up; gone when the route ends |
| T9 | Rev to the limiter (P/N, parked) | The rev strip flashes white; the screen edges flash if set |

## Report back

For anything wrong, a phone photo of the cluster plus the item number is
enough. The app's log is in its data folder on the head unit
(`mgustyles_toro.log`) and records every state change, which makes a
mismatch quick to trace.
