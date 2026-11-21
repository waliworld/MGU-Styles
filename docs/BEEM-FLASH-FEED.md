# Showing BeeM-Flash readings on the cluster

MGU Styles can put channels from **BeeM-Flash** (`waliworld/BeeM-Flash`) on
the instrument cluster. BeeM-Flash reads things the cluster's own bus
signals do not carry — oil pressure above all — so the Huracán's second
left dial can show real oil pressure instead of turbo pressure.

Nothing in the BeeM-Flash repository has to change for MGU Styles to
build or run. The reading end is already here
(`src/car/feed.js`); this page is the contract for the writing end.

## How it works

BeeM-Flash writes its current sample to one small file. MGU Styles reads
that file five times a second and drops any sample older than 2.5 s. A
file that is missing, stale, half-written or malformed simply means no
feed: the cluster carries on with the car's own signals and no dial lies.

```
BeeM-Flash  --writes-->  /dev/shm/beem-flash/cluster.json  --reads-->  MGU Styles
```

`/dev/shm` is in RAM, so this costs no flash wear. `/run/beem-flash/cluster.json`
is read as a fallback, and the `BEEM_FEED` environment variable overrides
the path for testing.

## The file

One JSON object, at most 64 KB, rewritten in place:

```json
{
  "t": 1764201600000,
  "units": "metric",
  "channels": [
    { "key": "oilPressure", "label": "Oil pressure", "unit": "bar",
      "value": 4.2, "min": 0, "max": 8 },
    { "key": "timing", "label": "Ignition timing", "unit": "°", "value": 11.5 },
    { "key": "iat", "label": "Intake air temp", "unit": "°C", "value": 38 }
  ]
}
```

| Field | |
|---|---|
| `t` | when the sample was taken, ms since the epoch. Left out or more than a minute off the clock, the file's own mtime is used |
| `units` | `metric` or `imperial` — what `value` is in. **Always send metric**: see below |
| `channels[].key` | BeeM-Flash's own channel key, exactly as `apps/wali_datalog/channels.js` spells it (`oilPressure`, `boost`, `iat`, `timing`, `afr`, …) |
| `channels[].value` | the engineering value, a finite number |
| `channels[].unit`, `label`, `min`, `max` | optional, used for labelling and scaling |

**Send values in the channel's base (metric) unit** — bar, °C, km/h — the
units BeeM-Flash's catalogue declares in `unit`, not `iunit`. MGU Styles
converts for display, so the driver's choice of mph/°F/psi in either app
stays independent.

Channels MGU Styles uses today:

| Key | Used for |
|---|---|
| `oilPressure` | the second left dial on Toro, in place of turbo pressure, and its label changes to **PRESS. OLIO** |

Any other channel is read and kept, ready for the readout row; sending
more costs nothing.

## Writing it

Write to a temporary file in the same directory and rename, so the reader
never sees half a file:

```js
const fs = require('fs');
const path = require('path');

const DIR = '/dev/shm/beem-flash';
const OUT = path.join(DIR, 'cluster.json');

let lastWrite = 0;
function publishToCluster(sample, catalogue) {      // sample: key -> value
    if (Date.now() - lastWrite < 150) return;       // 5-7 Hz is plenty
    lastWrite = Date.now();
    const channels = [];
    for (const key of Object.keys(sample)) {
        const v = sample[key];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        const c = catalogue[key] || {};
        channels.push({ key: key, value: v, label: c.label, unit: c.unit,
                        min: c.min, max: c.max });
    }
    const body = JSON.stringify({ t: Date.now(), units: 'metric', channels: channels });
    try {
        fs.mkdirSync(DIR, { recursive: true, mode: 0o755 });
        const tmp = OUT + '.' + process.pid;
        fs.writeFileSync(tmp, body, { mode: 0o644 });
        fs.renameSync(tmp, OUT);                     // atomic within the directory
    } catch (e) { /* the cluster simply shows no feed */ }
}
```

Call it wherever BeeM-Flash already has a fresh sample — the same place
the live dashboard is updated. Points worth keeping to:

- **Only while it is reading.** Stop writing when logging and the live
  view are both off; the file goes stale by itself in 2.5 s and the
  cluster falls back.
- **Mode 0644**, directory 0755: MGU Styles runs as an ordinary OAP app
  and only needs to read it.
- **Rename, never append.** A partly written file is dropped, but a
  rename means the reader never even sees one.
- **No faster than about 10 Hz.** The cluster reads at 5 Hz; writing more
  often only costs CPU.

## Checking it

With the car on and both apps installed, open MGU Styles on iDrive: the
status rows show `BeeM-Flash: N channels` when the feed is being read, and
the second left dial on Toro reads **PRESS. OLIO**.

Off the car, write a file by hand and run the preview:

```sh
mkdir -p /dev/shm/beem-flash
echo '{"t":0,"units":"metric","channels":[{"key":"oilPressure","value":4.2,"unit":"bar"}]}' \
  > /dev/shm/beem-flash/cluster.json
```

`test/feed.test.js` covers the reader: a good file, a stale one, a
truncated one, a missing directory, and the switch of the dial's label.
