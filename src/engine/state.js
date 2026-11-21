(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * Turns raw vehicle signals into what the theme draws. The car app and
     * the preview both go through here, so the simulator exercises exactly
     * the code that runs in the car.
     *
     * Raw signals use the canonical units the head unit reports:
     * km/h, rpm, degrees C, bar, km, percent.
     */

    var MI_PER_KM = 0.621371;
    var PSI_PER_BAR = 14.503774;

    function c2f(c) { return c * 9 / 5 + 32; }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function pad(n, w) {
        var s = String(Math.max(0, Math.floor(n)));
        while (s.length < w) s = '0' + s;
        return s;
    }

    /*
     * BMW's driving modes as the Lamborghini names its own: Strada for the
     * road, Sport, and Corsa for the track. 'bmw' shows BMW's own name;
     * 'fixed' always shows the mode setting's text.
     */
    var LAMBO = { COMFORT: 'STRADA', ECO_PRO: 'STRADA', ADAPTIVE: 'STRADA',
                  SPORT: 'SPORT', SPORT_PLUS: 'CORSA', TRACK: 'CORSA' };
    var BMW = { COMFORT: 'COMFORT', ECO_PRO: 'ECO PRO', ADAPTIVE: 'ADAPTIVE',
                SPORT: 'SPORT', SPORT_PLUS: 'SPORT+', TRACK: 'TRACK' };
    function modeLabelOf(mode, style, fallback) {
        if (style === 'fixed' || !mode) return fallback;
        var t = style === 'bmw' ? BMW : LAMBO;
        return t[mode] || fallback;
    }

    /* A reading that has gone stale shows dashes rather than a stale number. */
    function has(v) { return typeof v === 'number' && isFinite(v); }

    function pod(frac, warn, alarm, text, col) {
        return { frac: clamp01(frac), warn: warn, alarm: alarm ? 1 : 0,
                 text: text, col: col };
    }

    var DANGER = [1.0, 0.141, 0.078];
    var COOL = [0.286, 0.600, 1.0];
    var LIT = [0.878, 0.945, 1.0];
    var GOLD = [1.0, 0.796, 0.173];

    /*
     * raw: { rpm, speedKmh, gear, driveMode, boostBar, boostPeakBar,
     *        oilTempC, oilPressBar, coolantC, fuelPct, odoKm, rangeKm,
     *        ambientC, clock: {h, m}, gLat, gLon, gPeakLat, gPeakLon }
     */
    function present(raw, profile, opts) {
        opts = opts || {};
        var imperial = opts.units !== 'metric';
        var dash = '--';

        var rpm = has(raw.rpm) ? raw.rpm : 0;
        var speed = has(raw.speedKmh) ? raw.speedKmh : 0;
        if (imperial) speed *= MI_PER_KM;

        /* The rev-limit warning, ramped in so it never snaps on. Where it
           starts and ends is a setting (src/theme/palette.js). */
        var limAt = opts.rpmLimiter || profile.rpmLimiter;
        var limFrom = opts.flashFromRpm || (limAt - 150);
        var limiter = clamp01((rpm - limFrom) / Math.max(1, limAt - limFrom));

        var boost = has(raw.boostBar) ? raw.boostBar : 0;
        var boostPeak = has(raw.boostPeakBar) ? raw.boostPeakBar : 0;
        if (imperial) { boost *= PSI_PER_BAR; boostPeak *= PSI_PER_BAR; }

        /* ---- side pods ---- */
        var oilC = raw.oilTempC, oilP = raw.oilPressBar;
        var watC = raw.coolantC, fuel = raw.fuelPct;

        var oilTemp = has(oilC)
            ? pod((oilC - 50) / 120, (150 - 50) / 120, oilC >= 150,
                  String(Math.round(imperial ? c2f(oilC) : oilC)),
                  oilC < 80 ? COOL : LIT)
            : pod(0, 2, 0, dash, LIT);

        var oilPsi = has(oilP) ? (imperial ? oilP * PSI_PER_BAR : oilP) : null;
        var oilPress = has(oilP)
            ? pod(oilP / 10, 2, rpm > 1200 && oilP < 1.0,
                  (imperial ? Math.round(oilPsi) : oilP.toFixed(1)), LIT)
            : pod(0, 2, 0, dash, LIT);

        var coolant = has(watC)
            ? pod((watC - 50) / 80, (115 - 50) / 80, watC >= 115,
                  String(Math.round(imperial ? c2f(watC) : watC)),
                  watC < 70 ? COOL : LIT)
            : pod(0, 2, 0, dash, LIT);

        var fuelPod = has(fuel)
            ? pod(fuel / 100, 2, fuel <= 10,
                  String(Math.round(fuel)), fuel <= 10 ? DANGER : GOLD)
            : pod(0, 2, 0, dash, GOLD);

        /* The second left dial: oil pressure when something can supply it. */
        var auxIsOil = has(oilP);
        var auxPress = auxIsOil
            ? pod(imperial ? oilP * PSI_PER_BAR / 140 : oilP / 10, 2, rpm > 1200 && oilP < 1.0,
                  imperial ? String(Math.round(oilP * PSI_PER_BAR)) : oilP.toFixed(1), LIT)
            : pod(boost / (imperial ? 25 : 25 / PSI_PER_BAR), 2, 0,
                  boost.toFixed(imperial ? 1 : 2), LIT);

        /* ---- readouts ---- */
        var odoText = dash;
        if (has(raw.odoKm)) {
            odoText = pad(imperial ? raw.odoKm * MI_PER_KM : raw.odoKm, 6);
        }
        var rangeText = has(raw.rangeKm)
            ? String(Math.round(imperial ? raw.rangeKm * MI_PER_KM : raw.rangeKm))
            : dash;
        var ambientText = has(raw.ambientC)
            ? String(imperial ? Math.round(c2f(raw.ambientC)) : raw.ambientC.toFixed(1))
            : dash;

        var clockText = dash;
        if (raw.clock && has(raw.clock.h)) {
            var h = raw.clock.h, m = raw.clock.m || 0;
            if (opts.clock12) {
                var hh = h % 12; if (hh === 0) hh = 12;
                clockText = hh + ':' + pad(m, 2);
            } else {
                clockText = pad(h, 2) + ':' + pad(m, 2);
            }
        }

        return {
            rpm: rpm,
            speed: speed,
            gear: raw.gear || 'P',
            driveMode: raw.driveMode || '',
            modeLabel: modeLabelOf(raw.driveMode, opts.modeLabel,
                                   opts.mode === undefined || opts.mode === null ? 'CORSA' : opts.mode),
            limiter: limiter,
            boostPsi: boost,
            boostPeakPsi: boostPeak,
            gOk: has(raw.gLat) || has(raw.gLon),
            auxIsOil: auxIsOil,
            /* the meter's own axes: x to the right, y forward. The bus's
               lateral is ISO (left positive), so a right-hand turn - the
               car accelerating to the right - reads to the right */
            gX: has(raw.gLat) ? -raw.gLat : 0,
            gY: has(raw.gLon) ? raw.gLon : 0,
            gLat: has(raw.gLat) ? raw.gLat : 0,
            gLon: has(raw.gLon) ? raw.gLon : 0,
            gPeakLat: has(raw.gPeakLat) ? raw.gPeakLat : 0,
            gPeakLon: has(raw.gPeakLon) ? raw.gPeakLon : 0,
            pods: { oilTemp: oilTemp, oilPress: oilPress,
                    coolant: coolant, fuel: fuelPod,
                    /* the Huracan's second left dial is oil pressure. This
                       car does not publish it, so turbo pressure takes the
                       slot unless a feed supplies the real thing. */
                    auxPress: auxPress },
            odoText: odoText, rangeText: rangeText,
            clockText: clockText, ambientText: ambientText
        };
    }

    return { present: present, modeLabelOf: modeLabelOf,
             MI_PER_KM: MI_PER_KM, PSI_PER_BAR: PSI_PER_BAR };
}));
