'use strict';
/*
 * Fluid readings between the car's updates.
 *
 * The head unit hands us rpm, speed and pressures a few times a second;
 * drawn as they arrive, a needle steps. Each frame, every moving reading
 * glides towards its latest value instead (time-based, so it is the same
 * at any refresh rate), over `tauMs` - long enough to hide the steps,
 * short enough that a downshift's blip still reads at once. A reading that
 * disappears is dropped at once, never faded out as if it were real.
 *
 * Node 8.
 */

var KEYS = ['rpm', 'speedKmh', 'boostBar', 'gLat', 'gLon', 'oilTempC', 'oilPressBar', 'coolantC'];
/* temperatures barely move: a longer glide keeps their needles still */
var SLOW = { oilTempC: 4, coolantC: 4, oilPressBar: 1.5 };

function create() {
    var v = {};
    var last = null;
    return {
        apply: function (raw, now, tauMs) {
            var dt = last === null ? 0 : Math.max(0, Math.min(500, now - last));
            last = now;
            var out = {}, k, i;
            for (k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = raw[k];
            for (i = 0; i < KEYS.length; i++) {
                k = KEYS[i];
                var target = raw[k];
                if (typeof target !== 'number' || !isFinite(target)) { delete v[k]; continue; }
                var tau = tauMs * (SLOW[k] || 1);
                if (!(tau > 0) || typeof v[k] !== 'number' || !dt) { v[k] = target; continue; }
                v[k] += (target - v[k]) * (1 - Math.exp(-dt / tau));
                out[k] = v[k];
            }
            return out;
        }
    };
}

/* settings.smoothing -> glide time, ms */
var TAU = { smooth: 90, light: 45, off: 0 };

module.exports = { create: create, KEYS: KEYS, TAU: TAU };
