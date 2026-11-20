(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUSuperArc = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * The dial's curve: a superellipse |x/rx|^k + |y/ry|^k = 1, swept as the
     * upper arc. k below 2 drops the curve away from the apex faster than
     * any ellipse can, which is what gives the reference clusters their long
     * wings instead of a dome.
     *
     * Position along the dial is the ordinary polar angle, because that is
     * one atan per pixel in the shader. Polar angle alone would space the
     * blocks 2.4 : 1 (wide at the ends); the superellipse's own parameter
     * spaces them 5 : 1 the other way. Neither is what the reference does -
     * it spaces them evenly by arc length - so this module fits a pair of
     * odd polynomials between polar angle and arc length. Four terms brings
     * the spacing inside 1.1 : 1, and both directions are a handful of
     * multiplies in the shader.
     *
     * Node 8 compatible.
     */

    var TERMS = 4;      /* odd terms: x, x^3, x^5, x^7 */

    /* The point on the curve at polar angle phi (0 = apex, + = clockwise),
       relative to the centre, with the outward unit normal. */
    function point(phi, rx, ry, k) {
        var sp = Math.sin(phi), cp = Math.cos(phi);
        var A = Math.pow(Math.max(Math.abs(sp) / rx, 1e-12), k);
        var B = Math.pow(Math.max(Math.abs(cp) / ry, 1e-12), k);
        var r = Math.pow(A + B, -1 / k);
        var x = r * sp, y = -r * cp;
        var gx = (A / (A + B)) / Math.max(Math.abs(x) / rx, 1e-4) * (x < 0 ? -1 : 1) / rx;
        var gy = (B / (A + B)) / Math.max(Math.abs(y) / ry, 1e-4) * (y < 0 ? -1 : 1) / ry;
        var len = Math.sqrt(gx * gx + gy * gy) || 1;
        return { x: x, y: y, nx: gx / len, ny: gy / len };
    }

    /* Least squares for y = c0 x + c1 x^3 + ... with f(1) = 1 held exactly. */
    function fitOdd(xs, ys) {
        var k = TERMS - 1, A = [], b = [], i, j;
        for (i = 0; i < xs.length; i++) {
            if (xs[i] === 0) continue;
            var base = [], row = [];
            for (j = 0; j < TERMS; j++) base.push(Math.pow(xs[i], 2 * j + 1));
            for (j = 0; j < k; j++) row.push(base[j] - base[k]);
            A.push(row);
            b.push(ys[i] - base[k]);
        }
        var M = [], v = [];
        for (i = 0; i < k; i++) { M.push(new Array(k)); v.push(0); for (j = 0; j < k; j++) M[i][j] = 0; }
        for (i = 0; i < A.length; i++) {
            for (var a = 0; a < k; a++) {
                v[a] += A[i][a] * b[i];
                for (var c = 0; c < k; c++) M[a][c] += A[i][a] * A[i][c];
            }
        }
        for (a = 0; a < k; a++) {                       /* gaussian elimination */
            var piv = a;
            for (var r = a + 1; r < k; r++) if (Math.abs(M[r][a]) > Math.abs(M[piv][a])) piv = r;
            var tmp = M[a]; M[a] = M[piv]; M[piv] = tmp;
            var tv = v[a]; v[a] = v[piv]; v[piv] = tv;
            for (r = a + 1; r < k; r++) {
                var f = M[r][a] / M[a][a];
                for (c = a; c < k; c++) M[r][c] -= f * M[a][c];
                v[r] -= f * v[a];
            }
        }
        var out = new Array(k), sum = 0;
        for (a = k - 1; a >= 0; a--) {
            var t = v[a];
            for (c = a + 1; c < k; c++) t -= M[a][c] * out[c];
            out[a] = t / M[a][a];
        }
        for (i = 0; i < k; i++) sum += out[i];
        return out.concat([1 - sum]);
    }

    function evalOdd(co, x) {
        var x2 = x * x;
        return x * (co[0] + x2 * (co[1] + x2 * (co[2] + x2 * co[3])));
    }

    /* Odd extension, so one fit covers both halves of the sweep. */
    function remap(co, v) {
        var s = v < 0 ? -1 : 1;
        return s * evalOdd(co, Math.min(Math.abs(v), 1));
    }

    var cache = {};

    /*
     * P maps normalised polar angle -> normalised arc length,
     * Q maps back. arcLen is the whole sweep in pixels.
     */
    function maps(rx, ry, k, half, N) {
        var key = [rx, ry, k, half].join(':');
        if (cache[key]) return cache[key];
        N = N || 2000;
        var ms = [], ss = [], L = 0, prev = point(0, rx, ry, k), i;
        for (i = 0; i <= N; i++) {
            var m = i / N;
            var q = point(m * half, rx, ry, k);
            if (i) L += Math.sqrt((q.x - prev.x) * (q.x - prev.x) + (q.y - prev.y) * (q.y - prev.y));
            ms.push(m); ss.push(L); prev = q;
        }
        var taus = [];
        for (i = 0; i <= N; i++) taus.push(ss[i] / L);
        var out = {
            arcLen: 2 * L,
            P: fitOdd(ms, taus),
            Q: fitOdd(taus, ms)
        };
        cache[key] = out;
        return out;
    }

    /* The point at a normalised arc-length position t in [0,1]. */
    function atArc(t, rx, ry, k, half) {
        var m = remap(maps(rx, ry, k, half).Q, t * 2 - 1);
        return point(m * half, rx, ry, k);
    }

    return { TERMS: TERMS, point: point, maps: maps, remap: remap,
             evalOdd: evalOdd, atArc: atArc };
}));
