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
        mode: 'CORSA',
        modeLabel: 'lamborghini',  /* lamborghini | bmw | fixed */
        enabled: false,            /* off until turned on: installing never takes the cluster */
        clock12: false,
        secondaryGlyph: 'R',
        shiftLights: true,
        showBoost: true,
        showAuxLeft: true,       /* the brief's unreadable far-left region */
        revFlash: 'both',        /* off | band | edges | both */
        flashRate: 9,            /* Hz */
        flashStrength: 0.52,
        /*
         * The dial keeps the Huracan's sweep and styling but is marked in
         * thousands up to scaleMaxRpm: 8000 suits a BMW six, 10000 gives the
         * Lamborghini's own 1..10. The brief is emphatic that the printed
         * scale is artwork, never an engine's permitted limit, so the
         * operating values (rpmRedline, rpmLimiter) are kept separate.
         */
        scaleMaxRpm: 8000,
        showZeroNumeral: false,  /* the brief keeps the 0 end unlabelled */
        redFromScale: null,      /* null: derive from rpmRedline */
        /*
         * genuine: the Huracan's own field, fine stipple and faint facets.
         * modern:  the Lamborghini side lattice - thin silver hexagon lines
         *          left and right, lit nodes, faceted glass, black centre.
         *          hexSize is the cell's flat-to-flat width in pixels.
         */
        background: 'genuine',
        /* How strongly the dial's band fills with light up to the revs, with
           the red needle at the leading edge. 0 leaves only the ticks and
           numerals to show it, as the brief's still photograph does. */
        dialFill: 1.0,
        stipple: null,           /* null: follow the background */
        facets: null,
        hexagons: null,
        hexSize: 150
    };

    function clampNum(v, lo, hi, fallback) {
        /* null and '' are "not set", not zero. */
        if (v === null || v === undefined || v === '') return fallback;
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

        /* Whole thousands: every numeral lands on a mark. */
        var scale = Math.round(clampNum(settings.scaleMaxRpm, 6000, 10000,
                                        DEFAULTS.scaleMaxRpm) / 1000) * 1000;
        var redline = clampNum(settings.rpmRedline, 2000, scale, profile.rpmRedline);
        var limiter = clampNum(settings.rpmLimiter, redline, scale, profile.rpmLimiter);
        if (limiter < redline) limiter = redline;

        s.scaleMaxRpm = scale;
        s.rpmMax = scale;                 /* the dial's top, in rpm */
        s.rpmRedline = Math.min(redline, scale);
        s.rpmLimiter = Math.min(limiter, scale);
        s.redFromScale = settings.redFromScale === undefined ? null
            : settings.redFromScale;
        /* Where the warning starts. Default: a breath before the limiter. */
        s.flashFromRpm = clampNum(settings.flashFromRpm, 1000, s.rpmLimiter,
                                  s.rpmLimiter - 150);
        s.flashRate = clampNum(s.flashRate, 1, 20, DEFAULTS.flashRate);
        s.flashStrength = clampNum(s.flashStrength, 0, 1, DEFAULTS.flashStrength);
        if (s.background !== 'modern') s.background = 'genuine';
        if (['lamborghini', 'bmw', 'fixed'].indexOf(s.modeLabel) < 0) s.modeLabel = 'lamborghini';
        s.enabled = s.enabled === true || s.enabled === 'on';
        s.clock12 = s.clock12 === true || s.clock12 === '12';
        var modern = s.background === 'modern';
        s.stipple = clampNum(s.stipple, 0, 2, modern ? 0.55 : 1.0);
        s.facets = clampNum(s.facets, 0, 2, modern ? 0.0 : 1.0);
        s.hexagons = clampNum(s.hexagons, 0, 1.5, modern ? 1.0 : 0.0);
        s.showZeroNumeral = s.showZeroNumeral === true;
        s.dialFill = clampNum(s.dialFill, 0, 1.5, DEFAULTS.dialFill);
        s.hexSize = clampNum(s.hexSize, 40, 200, DEFAULTS.hexSize);
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
