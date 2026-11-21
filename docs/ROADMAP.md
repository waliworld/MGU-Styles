# Refining list

What is still to do, in the order it was asked for. Each item moves to the
changelog in a commit message when it is done.

## Toro: refine the whole theme

The owner's verdict after the 0.3 gauges: *"the theme is still very far
from perfect"*. Kept here for a dedicated pass against the Huracan
reference photographs, not done piecemeal:

- Compare every element against the photos side by side, at the car's
  scale: dial band and its segments, numerals, gear, CORSA, the speed
  readout, the side and boost gauges, the background, the shift lights.
- The dial: the Huracan's lit segments are solid blocks that turn red at
  the top of the range (photo IMG_9451); ours is a continuous band.
- Typography: the car's figures and labels against Saira / Barlow.
- Colour and contrast on the car's own panel (photos of our cluster in the
  car, day and night).

## M Sport (BMW M View) and M Sport Plus

M Sport was rebuilt in Beta 2 from the owner's reference frame and guide
(`docs/ref/`); measured mismatches are listed in
`docs/ref/MEASUREMENTS.md` section 8. M Sport Plus (Beta 3) is the same
with the middle of a second picture (`docs/ref/M-PLUS-MEASUREMENTS.md`).
Still open:

- **M Sport Plus on the car, with Waze.** The fade is judged against a
  stand-in map here; the real map's colours, and how the car's panel shows
  the thinnest part of the fade, need a photo (IN-CAR-TEST P4).
- **M Sport Plus keeps M Sport's figures where they are.** In its picture
  the speed and the gear stand further out from the middle; the owner
  asked for the middle only. Moving them would be a small change.

- **A photo from the car.** A straight-on photo of the cluster with M
  showing would tell what the car's panel adds or hides (its telltales,
  its colour). Cropped and scaled to the panel's 1920 × 720 it can go
  through the same comparison:
  `python3 tools/m-compare.py --panel --shot photo.png`.
- **Other M View states.** The guide rules out inventing screens from one
  frame, and the reference shows a parked car: how the band fills, how the
  numerals light and where the red field sits when driving are drawn from
  the data and the frame's own logic, not from photographs of them. More
  reference frames (driving, high revs, another mode) would let those be
  matched the same way; ROAD / SPORT / TRACK variants are not attempted.
- **The small words' type.** Inter Tight is the nearest open face; the
  car's own is a little heavier.
- **Fixture lamps** (the car seen from above, the seat-belt figure) are
  simplified. They never show on the road, so this only matters for the
  comparison's score.
- **4WD / 2WD** is a setting until a signal for the drive state is found.

## Waiting on the car

- iDrive page fills the screen once `mgu-render` is installed (IN-CAR-TEST N1).
- Where USB sticks are mounted, for your own start-up words.
- The limiter shake as it looks on the real cluster.
- G-force data arriving on this car.
- Whether a background below y 646 (`bottomExtra`) ever brings up the
  KOMBI's fallback gear box.
- M's clock: whether the cluster's `statusShowTimeDate` arrives on this
  car (IN-CAR-TEST M7).
- Where the car's own telltales fall on M's layout (IN-CAR-TEST M2, M3).
