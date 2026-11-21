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
            /* the caps run on towards the centre, as in the photograph, and
               stop clear of the centre aperture (x 440) */
            rail: [[430, 571], [226, 571], [177, 537], [105, 380], [86, 326], [104, 281], [177, 153], [430, 153]],
            hair: [[352, 551], [233, 551], [193, 524], [124, 373], [105, 327], [124, 288], [190, 173], [344, 173]],
            inside: 1,          /* which side of the path, travelling it, faces the centre */
            vertex: 4           /* where the width steps from the low to the high limb */
        },
        right: {
            rail: [[1490, 572], [1708, 572], [1751, 540], [1820, 407], [1820, 342], [1806, 306], [1732, 145], [1490, 145]],
            hair: [[1568, 552], [1699, 552], [1736, 523], [1800, 402], [1800, 347], [1787, 313], [1719, 165], [1593, 165]],
            inside: -1,
            /* the width changes at the top of the long diagonal, before the
               vertical shoulder: offsetting across the shoulder would cross */
            vertex: 3
        }
    };
    /* The scale runs between these vertices; the horizontal ends are caps
       outside the range (guide section 2). */
    var RANGE = [1, 6];
    /*
     * Measured off the reference photograph (3600 px wide, 0.588 design
     * units a pixel), each element thicker on the upper limb than the lower:
     *   outer rail stroke   23 px / 13 px  ->  13.5 / 7.6 units
     *   value band          72 px / 37 px  ->  42   / 22  units
     *   band's inner line    7 px          ->   4        units
     *   rail to band gap    35 px          ->  21        units
     */
    var RAIL_W = [7.6, 13.5];   /* low limb, high limb (guide: 11-15 at the top) */
    var BAND_W = [22, 42];
    var HAIR_W = 1.5;           /* 1.25-1.75 */
    var MARKER = [19, 3.5];     /* across the rail, along it */

    /*
     * The secondary bars are vertical, inside the chevron's lower half, with
     * their labels alongside (measured off the photograph: fuel x 246-266,
     * y 420-580, labels to its right).
     */
    var BARS = {
        fuel: { x: 246, w: 20, y0: 576, y1: 420, segs: 5, glyph: [228, 566] },
        oil: { x: 1654, w: 20, y0: 576, y1: 420, segs: 5, glyph: [1690, 566] }
    };

    var CENTRE = { x0: 440, y0: 108, x1: 1480, y1: 586, chamfer: 24, feather: 40 };

    function measure(pts) {
        var cum = [0], i;
        for (i = 1; i < pts.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        }
        return cum;
    }

    /*
     * The band that fills with the value runs parallel to the rail, inside
     * it: its edges are the rail's chevron (without the caps) offset inward
     * by the gap and by the gap plus the band's width, mitred at each
     * corner so the corners stay sharp, as they are on the car.
     */
    var GAP = 22;               /* rail edge to the band */

    function offsetPath(pts, offs, inside) {
        /* lines, as point + unit direction, moved inward by offs[i] */
        var L = [], i;
        for (i = 1; i < pts.length; i++) {
            var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
            var len = Math.hypot(dx, dy);
            dx /= len; dy /= len;
            var nx = inside * -dy, ny = inside * dx;     /* unit normal, inward */
            L.push({ px: pts[i - 1][0] + nx * offs[i - 1], py: pts[i - 1][1] + ny * offs[i - 1],
                     dx: dx, dy: dy });
        }
        var out = [[L[0].px, L[0].py]];
        for (i = 1; i < L.length; i++) {
            var A = L[i - 1], B = L[i];
            var den = A.dx * B.dy - A.dy * B.dx;
            if (Math.abs(den) < 1e-6) { out.push([B.px, B.py]); continue; }
            var t = ((B.px - A.px) * B.dy - (B.py - A.py) * B.dx) / den;
            out.push([A.px + A.dx * t, A.py + A.dy * t]);  /* the mitre */
        }
        var last = L[L.length - 1], e = pts[pts.length - 1];
        var tl = (e[0] - last.px) * last.dx + (e[1] - last.py) * last.dy;
        out.push([last.px + last.dx * tl, last.py + last.dy * tl]);
        return out;
    }

    /* The chevron without its caps, and the band's two edges. */
    function scalePath(side) { return RAILS[side].rail.slice(RANGE[0], RANGE[1] + 1); }

    /*
     * The band is wider on the upper limb, as on the car: each limb is
     * offset by its own amount and the two offsets mitre at the vertex, so
     * the change happens exactly where the chevron turns.
     */
    function bandEdges(side) {
        var R = RAILS[side], pts = scalePath(side), lo = [], hi = [], i;
        for (i = 0; i < pts.length - 1; i++) {
            var up = (RANGE[0] + i) >= R.vertex ? 1 : 0;
            lo.push(RAIL_W[up] / 2 + GAP);
            hi.push(RAIL_W[up] / 2 + GAP + BAND_W[up]);
        }
        return { outer: dedup(offsetPath(pts, lo, R.inside)),
                 inner: dedup(offsetPath(pts, hi, R.inside)) };
    }

    /* drop points a mitre left almost on top of each other, and any that
       double back (a mitre that crossed itself) */
    function dedup(pts) {
        var out = [pts[0]], i;
        for (i = 1; i < pts.length; i++) {
            var p = out[out.length - 1];
            if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) <= 3) continue;
            if (out.length >= 2) {
                var q = out[out.length - 2];
                var ax = p[0] - q[0], ay = p[1] - q[1];
                var bx = pts[i][0] - p[0], by = pts[i][1] - p[1];
                if (ax * bx + ay * by < 0) { out.pop(); i--; continue; }   /* bevel it away */
            }
            out.push(pts[i]);
        }
        if (out.length < 2) out.push(pts[pts.length - 1]);
        return out;
    }

    /* The arc length at which the limbs change width. */
    function vertexArc(side) {
        var R = RAILS[side];
        return measure(R.rail)[R.vertex];
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

    return { RAILS: RAILS, RANGE: RANGE, RAIL_W: RAIL_W, BAND_W: BAND_W, HAIR_W: HAIR_W,
             MARKER: MARKER, BARS: BARS, CENTRE: CENTRE, measure: measure, pointAt: pointAt,
             range: range, arcOf: arcOf, vertexArc: vertexArc, GAP: GAP,
             offsetPath: offsetPath, scalePath: scalePath, bandEdges: bandEdges,
             SPEED_SCALE: SPEED_SCALE, speedFrac: speedFrac };
}));
