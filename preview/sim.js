(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUSim = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * Drives the preview with a plausible car: a standing start, shifts near
     * the redline, a lift, some corners. Only the preview uses this; the car
     * app feeds real signals into the same src/engine/state.js.
     */
    function create(profile) {
        var s = {
            rpm: 800, speedKmh: 0, gearIdx: 0, throttle: 0,
            oilTempC: 72, coolantC: 82, fuelPct: 64,
            odoKm: 18420, boostBar: -0.4, boostPeakBar: 0,
            gLat: 0, gLon: 0, gPeakLat: 0, gPeakLon: 0, t: 0
        };
        /* engine rpm per km/h in each of the eight gears */
        var RATIOS = [175, 108, 74, 54, 42, 34, 28, 23];

        function step(dt) {
            s.t += dt;
            var cycle = s.t % 26;
            /* Throttle: pull hard, lift, cruise, repeat. */
            s.throttle = cycle < 14 ? 1.0 : (cycle < 17 ? 0.0 : 0.35);

            var gearN = Math.min(s.gearIdx, RATIOS.length - 1);
            var target = s.speedKmh * RATIOS[gearN] + 760;
            s.rpm += (target - s.rpm) * Math.min(1, dt * 7);

            if (s.throttle > 0.5 && s.rpm > profile.rpmLimiter - 120 &&
                s.gearIdx < RATIOS.length - 1) {
                s.gearIdx++;
            }
            if (s.speedKmh < 6) s.gearIdx = 0;

            var accel = s.throttle * (14.5 - s.speedKmh * 0.045) - 2.4;
            s.speedKmh = Math.max(0, s.speedKmh + accel * dt);
            if (cycle > 17) s.speedKmh += (95 - s.speedKmh) * dt * 0.5;

            /* Boost follows throttle and revs, with a little lag. */
            var peakBar = (profile.boostMaxPsi * 0.78) / 14.5;
            var spool = Math.min(1, Math.max(0, (s.rpm - 1500) / 1600));
            var want = s.throttle > 0.2
                ? peakBar * spool * (0.45 + 0.55 * s.throttle) *
                  (1 - 0.25 * Math.max(0, (s.rpm - 5200) / 2000))
                : -0.42;
            s.boostBar += (want - s.boostBar) * Math.min(1, dt * 4.5);
            s.boostPeakBar = Math.max(s.boostPeakBar * (1 - dt * 0.18), s.boostBar);

            s.gLon += ((accel / 9.81) - s.gLon) * Math.min(1, dt * 5);
            s.gLat = Math.sin(s.t * 0.55) * 0.62 * Math.min(1, s.speedKmh / 60);
            s.gPeakLat = Math.abs(s.gLat) > Math.abs(s.gPeakLat)
                ? s.gLat : s.gPeakLat * (1 - dt * 0.25);
            s.gPeakLon = Math.abs(s.gLon) > Math.abs(s.gPeakLon)
                ? s.gLon : s.gPeakLon * (1 - dt * 0.25);

            s.oilTempC = Math.min(128, s.oilTempC + dt * 0.35 * s.throttle);
            s.coolantC = Math.min(104, s.coolantC + dt * 0.1);
            s.fuelPct = Math.max(4, s.fuelPct - dt * 0.012);
            s.odoKm += s.speedKmh * dt / 3600;
        }

        function raw() {
            var gearNames = ['1', '2', '3', '4', '5', '6', '7', '8'];
            return {
                rpm: s.rpm, speedKmh: s.speedKmh,
                gear: s.speedKmh < 1.5 ? 'P' : gearNames[s.gearIdx],
                driveMode: s.throttle > 0.5 ? 'SPORT PLUS' : 'SPORT',
                boostBar: s.boostBar, boostPeakBar: s.boostPeakBar,
                oilTempC: s.oilTempC, oilPressBar: 2.1 + s.rpm / 3400,
                coolantC: s.coolantC, fuelPct: s.fuelPct,
                odoKm: s.odoKm, rangeKm: s.fuelPct * 6.1,
                ambientC: 14.5, clock: { h: 9, m: 39 },
                gLat: s.gLat, gLon: s.gLon,
                gPeakLat: s.gPeakLat, gPeakLon: s.gPeakLon
            };
        }

        /* Puts the car at an exact point, for a repeatable screenshot. */
        function poke(o) { for (var k in o) if (o.hasOwnProperty(k)) s[k] = o[k]; }

        return { step: step, raw: raw, poke: poke, inner: s };
    }

    return { create: create };
}));
