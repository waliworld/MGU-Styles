(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../geometry/panel.js'));
    } else {
        root.MGUGuide = factory(root.MGUPanel);
    }
}(typeof self !== 'undefined' ? self : this, function (Panel) {
    'use strict';

    /*
     * The Huracan CORSA reconstruction brief, as data.
     *
     * Every number here is the brief's own, in its 1920x720 reconstruction
     * grid, so this file can be read against the document line by line. The
     * brief's grid happens to match the MGU panel, but its content runs to
     * y = 704 and the MGU keeps everything at or below y = 646 for the car's
     * own bottom strip (docs/CLUSTER-CONSTRAINTS.md section 2). So the whole
     * instrument is scaled as one - which is what the brief asks for - and
     * centred, rather than its contents being rearranged.
     *
     * Node 8 compatible.
     */

    var GRID = { w: 1920, h: 720, contentBottom: 704 };

    /* Uniform fit into the drawable area, centred. */
    var BASE = Panel.BOTTOM_CUT / GRID.contentBottom;
    var FIT = BASE;
    var OFF_X = (Panel.PANEL_WIDTH - GRID.w * FIT) / 2;
    var OFF_Y = 0;

    /*
     * How much of the screen the instrument fills, and where it sits. The
     * zoom is anchored at the bottom cut, so growing it never pushes
     * anything over the cluster's own strip; the nudge then moves the whole
     * thing, and is clamped so the bottom still clears the cut.
     */
    function setFit(zoom, shiftY) {
        zoom = typeof zoom === 'number' && zoom > 0 ? zoom : 1;
        shiftY = typeof shiftY === 'number' ? shiftY : 0;
        FIT = BASE * zoom;
        OFF_X = (Panel.PANEL_WIDTH - GRID.w * FIT) / 2;
        var bottom = Panel.BOTTOM_CUT;              /* where the grid's bottom lands */
        OFF_Y = bottom - GRID.contentBottom * FIT + Math.min(shiftY, 0);
    }

    function gx(x) { return OFF_X + x * FIT; }
    function gy(y) { return OFF_Y + y * FIT; }
    function gs(v) { return v * FIT; }              /* a length */
    function grect(r) {
        return { x: gx(r[0]), y: gy(r[1]), w: gs(r[2] - r[0]), h: gs(r[3] - r[1]) };
    }

    /* ---------------------------------------------------- tachometer */
    var TACH = {
        cx: 930, cy: 660,
        rOuter: 590,
        rNumeral: 535,
        rRecess: 483,        /* stepped contour, recessed level */
        rPlateau: 499,       /* stepped contour, raised level */
        stippleInner: 507,
        stippleOuter: 582,
        vMin: 1, vMax: 10,
        /* thetaDegrees(v) = -178 + 17.2 v, SVG convention: 0 is +x, +y down */
        theta0: -178, thetaPerV: 17.2,
        tickStep: 0.1,
        tickMinor: 4, tickMajor: 9, tickWidth: 1.1,
        contourWidth: 2.0,
        /* the stepped generator, fraction of one interval -> radius */
        step: [[0.00, 483], [0.12, 483], [0.22, 499],
               [0.68, 499], [0.80, 483], [1.00, 483]],
        numeralHeight: 45,      /* visible character height, 42-48 */
        numeralStroke: 1.8,     /* hollow contour width, 1.6-2.0 */
        redFromV: 8.5           /* visual red sector onset, tuned against the photo */
    };

    /* The brief's angle function, in its own SVG convention. */
    function thetaDeg(v) { return TACH.theta0 + TACH.thetaPerV * v; }
    /* The shader measures from straight up, clockwise. */
    function phiRad(v) { return (thetaDeg(v) + 90) * Math.PI / 180; }

    /* A point on the dial at scale value v and radius r, in panel pixels. */
    function point(v, r) {
        var a = thetaDeg(v) * Math.PI / 180;
        return { x: gx(TACH.cx + r * Math.cos(a)), y: gy(TACH.cy + r * Math.sin(a)) };
    }

    /* ------------------------------------------------------- layout */
    /* The brief's bounds table, [x0, y0, x1, y1] or a centre. */
    var BOUNDS = {
        gear:        [815, 240, 1075, 510],
        corsa:       { cx: 650, cy: 360 },
        secondaryR:  { cx: 1090, cy: 440 },
        gForce:      { cx: 925, cy: 605, w: 190, h: 108 },
        lowerLeft:   [365, 585, 690, 704],
        speed:       [1160, 592, 1490, 704],
        escBlock:    { cx: 1570, cy: 365 },
        coolant:     [1625, 425, 1720, 675],
        fuel:        [1760, 425, 1855, 675],
        farLeft:     [35, 0, 300, 704]
    };

    /* ------------------------------------------------------ palette */
    /* The brief's tokens, as linear-ish 0..1 triples for the shaders. */
    function hex(h) {
        return [parseInt(h.substr(1, 2), 16) / 255,
                parseInt(h.substr(3, 2), 16) / 255,
                parseInt(h.substr(5, 2), 16) / 255];
    }
    var COLOURS = {
        screenBlack:     hex('#02050A'),
        screenBlueBlack: hex('#07111B'),
        lowerField:      hex('#10212A'),
        primaryWhite:    hex('#E8F0F6'),
        secondaryWhite:  hex('#A4B2BD'),
        fineContour:     hex('#BAC8D4'),
        corsaRed:        hex('#FF263D'),
        dimRed:          hex('#761322'),
        geometricLine:   hex('#173344'),
        stipple:         hex('#73818B')
    };

    /* ------------------------------------------------- stippling */
    var STIPPLE = { spacing: 4.5, rowOffset: 2.25, dotRadius: 0.55, opacity: 0.19 };

    return {
        GRID: GRID, setFit: setFit,
        fit: function () { return FIT; }, offY: function () { return OFF_Y; },
        gx: gx, gy: gy, gs: gs, grect: grect,
        TACH: TACH, BOUNDS: BOUNDS, COLOURS: COLOURS, STIPPLE: STIPPLE,
        thetaDeg: thetaDeg, phiRad: phiRad, point: point
    };
}));
