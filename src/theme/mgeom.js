(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUMGeom = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * The M style's fixed geometry, in the guide's 1920x720 design units
     * (docs/M-IDRIVE8-BRIEF.md section 1). One copy, read by the shaders
     * (src/shaders/mcluster.js) and by the layout (src/theme/track.js), so
     * a tick, its label and the rail's lit run can never disagree.
     */

    var RAILS = {
        /* from minimum to maximum, as the guide gives them */
        left: {
            rail: [[343, 571], [226, 571], [177, 537], [105, 380], [86, 326], [104, 281], [177, 153], [336, 153]],
            hair: [[352, 551], [233, 551], [193, 524], [124, 373], [105, 327], [124, 288], [190, 173], [344, 173]],
            inside: 1           /* which side of the path, travelling it, faces the centre */
        },
        right: {
            rail: [[1552, 572], [1708, 572], [1751, 540], [1820, 407], [1820, 342], [1806, 306], [1732, 145], [1588, 145]],
            hair: [[1568, 552], [1699, 552], [1736, 523], [1800, 402], [1800, 347], [1787, 313], [1719, 165], [1593, 165]],
            inside: -1
        }
    };
    /* The scale runs between these vertices; the short horizontal ends are
       caps outside the range (guide section 2). */
    var RANGE = [1, 6];
    var RAIL_W = 13;            /* stroke, 11-15 */
    var HAIR_W = 1.5;           /* 1.25-1.75 */
    var MARKER = [19, 3.5];     /* across the rail, along it */

    /* The secondary bars: diagonal, parallel to each rail's lower return. */
    var BARS = {
        fuel: { bottom: [300, 540], top: [257, 450], width: 11, segs: 5 },
        oil: { bottom: [1620, 540], top: [1669, 450], width: 11, segs: 5 }
    };

    var CENTRE = { x0: 440, y0: 108, x1: 1480, y1: 586, chamfer: 24, feather: 40 };

    function measure(pts) {
        var cum = [0], i;
        for (i = 1; i < pts.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        return cum;
    }

    /* A point on a path by arc length, with the unit normal pointing away
       from the centre (where scale labels go). */
    function pointAt(side, arc) {
        var R = RAILS[side], pts = R.rail, cum = measure(pts), i;
        for (i = 1; i < pts.length - 1 && cum[i] <= arc; i++) { /* find the segment */ }
        var a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1];
        var t = Math.max(0, Math.min(1, (arc - cum[i - 1]) / L));
        var dx = (b[0] - a[0]) / L, dy = (b[1] - a[1]) / L;
        var inX = R.inside * -dy, inY = R.inside * dx;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, nx: -inX, ny: -inY };
    }

    /* Arc length of the scale's ends, and of a fraction along it. */
    function range(side) {
        var cum = measure(RAILS[side].rail);
        return { a0: cum[RANGE[0]], a1: cum[RANGE[1]], total: cum[cum.length - 1] };
    }
    function arcOf(side, f) {
        var r = range(side);
        return r.a0 + (r.a1 - r.a0) * Math.max(0, Math.min(1, f));
    }

    /* Speed scales, value/fraction pairs: evenly spaced labels, uneven values
       above 120 mph / 150 km/h, as on the car (guide section 2). */
    var SPEED_SCALE = {
        imperial: [0, 20, 40, 60, 80, 100, 120, 160, 200],
        metric: [0, 30, 60, 90, 120, 150, 210, 270, 330]
    };
    function speedFrac(v, units) {
        var s = SPEED_SCALE[units === 'metric' ? 'metric' : 'imperial'], n = s.length - 1, i;
        if (!(v > 0)) return 0;
        for (i = 1; i <= n; i++) {
            if (v <= s[i]) return (i - 1 + (v - s[i - 1]) / (s[i] - s[i - 1])) / n;
        }
        return 1;
    }

    return { RAILS: RAILS, RANGE: RANGE, RAIL_W: RAIL_W, HAIR_W: HAIR_W, MARKER: MARKER, BARS: BARS,
             CENTRE: CENTRE, measure: measure, pointAt: pointAt, range: range, arcOf: arcOf,
             SPEED_SCALE: SPEED_SCALE, speedFrac: speedFrac };
}));
