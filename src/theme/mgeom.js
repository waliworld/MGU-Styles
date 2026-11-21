(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUMGeom = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * The M View's geometry, traced off the reference frame
     * (docs/ref/m-view-reference.jpg, 1726 x 612) and kept in that frame's
     * own coordinates - the "artboard". One copy, read by the shaders
     * (src/shaders/mcluster.js), the layout (src/theme/track.js) and the
     * comparison tool (tools/m-compare.py), so a tick, its numeral and the
     * marker can never disagree.
     *
     * How it was measured is in docs/ref/MEASUREMENTS.md: every edge is a
     * least-squares line through sub-pixel edge crossings of the photograph
     * (residuals 0.1 - 1 px). The two dials are mirror images about AX; the
     * photograph shows them 1 - 2 px apart at the corners (perspective), so
     * each line here is the mean of the left one and the mirrored right one.
     * The blue plates are not mirror images and keep their own lines.
     *
     * A line is written [a, b]:  x = a * y + b.
     */

    /* The artboard, and where it sits on the 1920 x 720 panel: fitted
       uniformly, the dials' axis on the panel's centre, everything above
       y = 646 and the speed scale clear of the tyre-pressure telltale. */
    var PANEL_FIT = { s: 1.03, ox: 29.1, oy: 8 };
    var ART = { w: 1726, h: 612, s: PANEL_FIT.s, ox: PANEL_FIT.ox, oy: PANEL_FIT.oy };
    var AX = 903.8;                 /* the dials' axis of symmetry */
    /*
     * Another fit of the artboard, for tools: the comparison with the
     * photograph renders it 1:1 at the origin, so no resampling stands
     * between the two. Nothing is drawn for one size - the shaders work in
     * artboard units and the layout asks px() - so any target is a matter
     * of these three numbers. The car always uses the panel's fit; with no
     * argument that is put back. Set it before a theme is built.
     */
    function setFit(f) {
        f = f || PANEL_FIT;
        ART.s = f.s; ART.ox = f.ox; ART.oy = f.oy;
    }

    function px(x) { return ART.ox + x * ART.s; }
    function py(y) { return ART.oy + y * ART.s; }
    function pd(d) { return d * ART.s; }
    /* an artboard box as a panel rectangle, on whole pixels */
    function box(x0, y0, x1, y1) {
        var X0 = Math.floor(px(x0)), Y0 = Math.floor(py(y0));
        return { x: X0, y: Y0, w: Math.ceil(px(x1)) - X0, h: Math.ceil(py(y1)) - Y0 };
    }
    function mirror(x) { return 2 * AX - x; }

    /* ------------------------------------------------------------ the scale */
    /*
     * Both scales are linear in height, not along the rail: tick k (0..8)
     * sits at Y0 - k * DY and the marker is a level bar at the value's own
     * height. The speed scale's numbers are uneven above the fifth tick, as
     * on the car.
     */
    var SCALE = { y0: 503.4, dy: 50.7, n: 8 };
    function tickY(k) { return SCALE.y0 - k * SCALE.dy; }
    var SPEED_SCALE = {
        metric: [0, 30, 60, 90, 120, 150, 210, 270, 330],
        imperial: [0, 20, 40, 60, 80, 100, 120, 160, 200]
    };
    /* a speed as a position on the scale, in ticks (0..8) */
    function speedTicks(v, units) {
        var s = SPEED_SCALE[units === 'metric' ? 'metric' : 'imperial'], n = s.length - 1, i;
        if (!(v > 0)) return 0;
        for (i = 1; i <= n; i++) {
            if (v <= s[i]) return i - 1 + (v - s[i - 1]) / (s[i] - s[i - 1]);
        }
        return n;
    }
    function rpmTicks(rpm) { return Math.max(0, Math.min(SCALE.n, (rpm || 0) / 1000)); }

    /* ------------------------------------------------------- the left dial */
    /* (the right dial is this one mirrored about AX) */
    var DIAL = {
        /* the broad outer rim: its outer edge, and how wide it is level */
        rimUp: [-0.538, 323.84],        /* x = 280.8 at y = 80 */
        rimLow: [0.6385, 33.32],        /* x = 212.1 at y = 280 */
        rimWUp: 13.8, rimWLow: 7.8,     /* level widths: 12.2 and 6.6 across */
        rimR: 29.5,                     /* the shoulder's radius, both edges */
        rimTop: 68.4, rimBottom: 497.6,
        /* the dark channel between rim and contour: its outer edge */
        chanUp: [-0.5301, 356.61],
        chanLow: [0.6421, 59.13],
        chanR: 26, chanTop: 71.8, chanBottom: 497.8,
        chanGapUp: 5.0, chanGapLow: 4.5,   /* level gap to the contour's centre */
        /* the fine inner contour: its centre line */
        conUp: [-0.5423, 411.26],       /* x = 362.45 at y = 90 */
        conLow: [0.6347, 92.67],        /* x = 283.08 at y = 300 */
        conW: 2.9, conR: 29, conTopR: 28.5, conBottom: 496.8,
        /* the level line across the top: the photograph has the blue one
           at 69.1 - 72.7 and the red at 67.1 - 71.4 (it is turned a tenth of
           a degree), so this is the pair's mean. Its inner end is not a
           mirror image: the red line runs 4 units further in. */
        topY0: 68.4, topY1: 71.8, topX1: 628.9, topX1R: 633.1,
        /* scale ticks: short level dashes inside the rim */
        tickIn: 1.8, tickLen: 10.7, tickH: 1.5,
        /* the marker: a level white bar across the band at the value */
        markH: 2.5, markGap: 3.0,
        /* the base the fill stands on, and the rail running inward from it */
        tabTop: 508.4, tabLeft: 361.5, tabStep: [420.5, 431.5], tabR: 11,
        railTop: 513.3, railBottom: 519.2
    };

    /* x of a line at a height */
    function at(line, y) { return line[0] * y + line[1]; }
    /* where two lines cross */
    function cross(l1, l2) {
        var y = (l2[1] - l1[1]) / (l1[0] - l2[0]);
        return [l1[0] * y + l1[1], y];
    }
    /* a line moved level by dx */
    function shift(line, dx) { return [line[0], line[1] + dx]; }

    /* the rim's outer edge at a height (the shoulder left sharp): where the
       scale's numerals and the marker's outer end are measured from */
    function rimOuterX(y) { return Math.max(at(DIAL.rimUp, y), at(DIAL.rimLow, y)); }
    function contourX(y) { return Math.max(at(DIAL.conUp, y), at(DIAL.conLow, y)); }

    /* ---------------------------------------------------- the centre lines */
    /* two fine parallel strokes, not mirrored: both lean the same way */
    var DIAG = {
        cyan: { p0: [730.6, 148.5], p1: [927.2, 476.6], p2: [902.1, 519.2], w: 2.9 },
        red: { p0: [863.4, 299.5], p1: [994.5, 519.2], w: 3.2 },
        blueRailEnd: 905.0, redRailStart: 991.0
    };

    /* ----------------------------------------------------------- the plates */
    /*
     * Eight dark-blue slabs, each a convex polygon listed clockwise with a
     * corner radius per vertex (0: sharp). The thin black cuts between
     * neighbours are simply the gaps between them. g is how its light
     * falls, fitted to the photograph: [x, y, brightness there, change per
     * unit right, change per unit down], brightness on the blue channel's
     * 0..255.
     */
    var PLATES = {
        LU1: { v: [[393.6, 104.3], [493.0, 104.3], [401.8, 271.0], [305.6, 271.0]], r: [53, 0, 21, 5.5],
               g: [399, 187, 77.4, 0.019, -0.355] },
        LU2: { v: [[497.0, 104.3], [547.7, 104.3], [623.7, 230.3], [428.0, 230.3]], r: [0, 50, 3, 0],
               g: [524, 179, 83.7, 0.129, -0.368] },
        LL1: { v: [[430.6, 309.5], [672.1, 309.5], [777.5, 481.9], [536.7, 481.9]], r: [3, 0, 0, 42],
               g: [605, 397, 71.4, 0.026, 0.182] },
        LL2: { v: [[629.3, 230.3], [737.9, 230.3], [893.2, 481.9], [780.8, 481.9]], r: [0, 46, 11, 0],
               g: [761, 357, 73.8, 0.059, 0.076] },
        RU1: { v: [[1236.1, 104.0], [1307.6, 104.0], [1377.8, 230.3], [1164.5, 230.3]], r: [47, 0, 0, 3],
               g: [1272, 177, 85.4, -0.047, -0.355] },
        RU2: { v: [[1310.6, 104.0], [1411.7, 104.0], [1500.4, 270.0], [1403.5, 270.0]], r: [0, 37, 3, 21],
               g: [1406, 187, 77.8, -0.016, -0.335] },
        RL1: { v: [[1115.9, 309.0], [1375.4, 309.0], [1275.1, 482.0], [1014.4, 482.0]], r: [0, 3, 56, 0],
               g: [1195, 395, 76.6, -0.023, 0.227] },
        RL2: { v: [[1058.6, 230.3], [1155.7, 230.3], [1008.9, 482.0], [962.3, 398.2]], r: [50, 0, 11.5, 44],
               g: [1049, 335, 79.6, -0.042, 0.091] }
    };
    /* fine lighter lines crossing the plates: [x0, y0, x1, y1, strength] */
    var HAIRLINES = [
        [565.0, 140.0, 517.0, 229.0, 0.5],        /* LU2 */
        [745.0, 262.0, 655.0, 440.0, 0.45],       /* LL1 / LL2 */
        [1230.0, 123.0, 1288.0, 228.0, 0.5],      /* RU1 */
        [1048.0, 250.0, 1180.0, 478.0, 0.45]      /* RL2 / RL1 */
    ];

    /* ------------------------------------------------------------ the strips */
    /*
     * Fuel (left) and oil temperature (right, the mirror): a fine line with
     * four parallelogram segments beside it, lit from the bottom.
     */
    var STRIP = {
        top: 343.5, bottom: 497.5,
        line: [0.6368, 128.4], lineW: 3.8,        /* its left edge, level width */
        seg: [0.6345, 135.7], segW: 14.7,         /* the segments' left edge */
        cuts: [382.0, 420.3, 460.2], cutH: 1.1,   /* dark separators, half height */
        /* oil: where the line turns red (hot) and blue (cold), as heights */
        hot: 362.0, cold: 481.0
    };

    /* ------------------------------------------------------------ the footer */
    var FOOT = {
        /* the dark-blue four-pane panel under the centre */
        panel: { top: 534.5, bottom: 584.3, left: 758.0, right: 1069.5, leanL: -0.51, leanR: -0.58 },
        /* pane separators, as x at the panel's top and bottom */
        seps: [[806.5, 836.5], [907.0, 884.0], [1000.5, 976.5]],
        sepW: 3.2,
        limit: { x: 603.0, y: 557.0, r: 27.0, ring: 33.0 },
        /* the glow under each rail */
        glow: { top: 526.5, bottom: 552.0, x0: 366.0, x1: 690.0 }
    };

    /* ---------------------------------------------------- the centre window */
    /*
     * Where a hosted picture (the Waze map, Turn View's camera) shows
     * through: the whole black field between the two plate groups, which
     * lies inside the rect those apps draw in. Three convex pieces that
     * overlap generously (so their union feathers without seams), each
     * clockwise: the wide band above the plates' shoulders, the funnel
     * between the lower plates, and the neck that runs down to the rails.
     * The picture fades in from `inset` inside the plates' edges over
     * `feather`.
     */
    var WINDOW = {
        polys: [
            [[549.3, 109.0], [1234.4, 109.0], [1164.5, 230.3], [623.7, 230.3]],
            [[663.0, 109.0], [1128.5, 109.0], [962.3, 398.2], [841.6, 398.2]],
            [[750.1, 250.0], [883.2, 250.0], [1008.9, 482.0], [893.2, 481.9]]
        ],
        inset: 7, feather: 22
    };
    /* the picture's strength at an artboard point, window fully open:
       what the shader computes (tests hold the two together) */
    function convexDist(poly, x, y) {
        var d = -1e9, i;
        for (i = 0; i < poly.length; i++) {
            var a = poly[i], b = poly[(i + 1) % poly.length];
            var ex = b[0] - a[0], ey = b[1] - a[1], len = Math.sqrt(ex * ex + ey * ey);
            /* clockwise with y down: the outward normal is (ey, -ex) */
            d = Math.max(d, ((x - a[0]) * ey - (y - a[1]) * ex) / len);
        }
        return d;
    }
    function windowDist(x, y) {
        var d = 1e9, i;
        for (i = 0; i < WINDOW.polys.length; i++) d = Math.min(d, convexDist(WINDOW.polys[i], x, y));
        return d;
    }
    function revealAt(x, y) {
        var t = Math.max(0, Math.min(1, (-windowDist(x, y) - WINDOW.inset) / WINDOW.feather));
        return t * t * (3 - 2 * t);
    }
    /* the window's bounding box, artboard units */
    function windowBox() {
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        WINDOW.polys.forEach(function (p) {
            p.forEach(function (v) {
                x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]);
                y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
            });
        });
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }

    return {
        ART: ART, PANEL_FIT: PANEL_FIT, setFit: setFit, AX: AX, px: px, py: py, pd: pd, box: box, mirror: mirror,
        SCALE: SCALE, tickY: tickY, SPEED_SCALE: SPEED_SCALE, speedTicks: speedTicks, rpmTicks: rpmTicks,
        DIAL: DIAL, at: at, cross: cross, shift: shift, rimOuterX: rimOuterX, contourX: contourX,
        DIAG: DIAG, PLATES: PLATES, HAIRLINES: HAIRLINES, STRIP: STRIP, FOOT: FOOT, WINDOW: WINDOW,
        convexDist: convexDist, windowDist: windowDist, revealAt: revealAt, windowBox: windowBox
    };
}));
