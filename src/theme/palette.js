(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUPalette = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * Colour schemes and the settings that shape the theme.
     * Everything a driver can change lives here, so the layout code never
     * has a colour or a rev limit written into it.
     */

    var BASE = {
        text:   [0.945, 0.961, 0.980],
        muted:  [0.470, 0.525, 0.588],
        faint:  [0.300, 0.350, 0.412],
        steel:  [0.520, 0.580, 0.670],
        danger: [1.000, 0.141, 0.078],
        cool:   [0.286, 0.600, 1.000],
        green:  [0.130, 0.850, 0.420],
        amber:  [1.000, 0.720, 0.060]
    };

    /* accent: the gear numeral and highlights. lit: the rev band once lit. */
    var SCHEMES = {
        arancio: { name: 'Arancio',  accent: [1.000, 0.416, 0.102], second: [1.000, 0.796, 0.173], tint: [0.150, 0.110, 0.060] },
        giallo:  { name: 'Giallo',   accent: [1.000, 0.820, 0.090], second: [1.000, 0.560, 0.120], tint: [0.150, 0.130, 0.050] },
        rosso:   { name: 'Rosso',    accent: [1.000, 0.180, 0.110], second: [1.000, 0.560, 0.200], tint: [0.160, 0.060, 0.050] },
        verde:   { name: 'Verde',    accent: [0.180, 0.880, 0.480], second: [0.800, 0.950, 0.350], tint: [0.060, 0.150, 0.100] },
        blu:     { name: 'Blu',      accent: [0.200, 0.580, 1.000], second: [0.500, 0.850, 1.000], tint: [0.060, 0.120, 0.220] },
        viola:   { name: 'Viola',    accent: [0.690, 0.450, 1.000], second: [0.950, 0.600, 1.000], tint: [0.120, 0.080, 0.200] },
        bianco:  { name: 'Bianco',   accent: [0.920, 0.950, 0.985], second: [0.700, 0.780, 0.880], tint: [0.090, 0.110, 0.150] }
    };

    /* What the rev band turns as it lights. */
    var LIT = {
        ice:    [0.878, 0.945, 1.000],
        white:  [1.000, 1.000, 1.000],
        accent: null                      /* follow the scheme's accent */
    };

    var DEFAULTS = {
        units: 'imperial',
        accent: 'arancio',
        litColour: 'ice',
        shiftLights: true,
        revFlash: 'both',        /* off | band | edges | both */
        flashRate: 9,            /* Hz */
        flashStrength: 0.52,
        arcShape: 1.55,
        hexagons: 1.0,
        hexSize: 46,
        gearStrip: true
    };

    function clampNum(v, lo, hi, fallback) {
        v = Number(v);
        if (!isFinite(v)) return fallback;
        return Math.max(lo, Math.min(hi, v));
    }

    /*
     * Folds the driver's settings over the vehicle profile and returns one
     * object the layout can read without re-checking anything.
     *
     * Rev limits are clamped and kept in order: max >= limiter >= redline.
     * The numerals are one per 1000 rpm and must each be a single digit, so
     * the scale tops out at 9000 - which no BMW inline six passes anyway.
     */
    function resolve(settings, profile) {
        settings = settings || {};
        var s = {}, k;
        for (k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
                s[k] = settings[k] === undefined ? DEFAULTS[k] : settings[k];
            }
        }

        var max = clampNum(settings.rpmMax, 4000, 9000, profile.rpmMax);
        max = Math.round(max / 1000) * 1000;          /* whole thousands */
        var redline = clampNum(settings.rpmRedline, 2000, max, profile.rpmRedline);
        var limiter = clampNum(settings.rpmLimiter, redline, max, profile.rpmLimiter);
        if (limiter < redline) limiter = redline;

        s.rpmMax = max;
        s.rpmRedline = Math.min(redline, max);
        s.rpmLimiter = Math.min(limiter, max);
        /* Where the warning starts. Default: a breath before the limiter. */
        s.flashFromRpm = clampNum(settings.flashFromRpm, 1000, s.rpmLimiter,
                                  s.rpmLimiter - 150);
        s.flashRate = clampNum(s.flashRate, 1, 20, DEFAULTS.flashRate);
        s.flashStrength = clampNum(s.flashStrength, 0, 1, DEFAULTS.flashStrength);
        /*
         * The dial's superellipse exponent. 2 is an ellipse; the reference
         * clusters measure near 1.55, which is what gives the long wings.
         */
        s.arcShape = clampNum(s.arcShape, 1.2, 2.6, DEFAULTS.arcShape);
        s.hexagons = clampNum(s.hexagons, 0, 1.5, DEFAULTS.hexagons);
        s.hexSize = clampNum(s.hexSize, 20, 120, DEFAULTS.hexSize);
        if (['off', 'band', 'edges', 'both'].indexOf(s.revFlash) < 0) {
            s.revFlash = DEFAULTS.revFlash;
        }

        var scheme = SCHEMES[s.accent] || SCHEMES[DEFAULTS.accent];
        var lit = LIT[s.litColour] !== undefined ? LIT[s.litColour] : LIT.ice;
        s.colours = {
            text: BASE.text, muted: BASE.muted, faint: BASE.faint,
            steel: BASE.steel, danger: BASE.danger, cool: BASE.cool,
            green: BASE.green, amber: BASE.amber,
            accent: scheme.accent, second: scheme.second, tint: scheme.tint,
            lit: lit || scheme.accent
        };
        s.schemeName = scheme.name;
        return s;
    }

    return {
        BASE: BASE, SCHEMES: SCHEMES, LIT: LIT, DEFAULTS: DEFAULTS, resolve: resolve
    };
}));
