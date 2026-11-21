(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../theme/mgeom.js'));
    else root.MGUShadersM = factory(root.MGUMGeom);
}(typeof self !== 'undefined' ? self : this, function (M) {
    'use strict';

    /*
     * The M style (docs/M-IDRIVE8-BRIEF.md), drawn in the guide's design
     * units and fitted onto the panel by u_fit (tx, ty, scale).
     *
     * The rails' paths are written into the shader source from
     * src/theme/mgeom.js, segment by segment, so no uniform vectors go on
     * geometry (GLSL ES 1.00 has no constant arrays, and the unit allows
     * 48 vectors a shader).
     */

    function f(v) { var s = String(Math.round(v * 1000) / 1000); return s.indexOf('.') < 0 ? s + '.0' : s; }
    function v2(p) { return 'vec2(' + f(p[0]) + ', ' + f(p[1]) + ')'; }

    /*
     * A polyline's distance function: returns (distance, side, arc), side
     * > 0 towards the centre, arc the length along the path to the nearest
     * point. The two end segments have square caps (guide: near-square ends).
     */
    function polyFn(name, pts, inside) {
        var cum = M.measure(pts), out = [
            'vec4 ' + name + '(vec2 p) {',
            '  float best = 1e9; float side = 0.0; float arc = 0.0; float itr = 0.0;',
            '  vec2 a; vec2 d; float t; float dd; float al; float pr;'
        ], i;
        for (i = 1; i < pts.length; i++) {
            var L = cum[i] - cum[i - 1];
            var dx = (pts[i][0] - pts[i - 1][0]) / L, dy = (pts[i][1] - pts[i - 1][1]) / L;
            var end = i === 1 || i === pts.length - 1;
            out.push(
                '  a = ' + v2(pts[i - 1]) + '; d = vec2(' + f(dx) + ', ' + f(dy) + ');',
                '  al = dot(p - a, d); pr = d.x * (p.y - a.y) - d.y * (p.x - a.x);',
                '  t = clamp(al, 0.0, ' + f(L) + ');',
                end ? '  dd = max(abs(pr), max(-al, al - ' + f(L) + '));'
                    : '  dd = length(p - (a + d * t));',
                /* past either end of the path there is no inside or outside */
            '  if (dd < best) { best = dd; side = pr * ' + f(inside) +
                (i === 1 ? ' * step(0.0, al)' : '') + (i === pts.length - 1 ? ' * step(al, ' + f(L) + ')' : '') +
                '; arc = ' + f(cum[i - 1]) + ' + t;',
                '    itr = step(1.0, al) * step(al, ' + f(L - 1) + '); }'
            );
        }
        out.push('  return vec4(best, side, arc, itr);', '}');
        return out.join('\n');
    }

    var FIT = [
        'uniform vec3 u_fit;',
        'vec2 design() { return (px() + u_origin - u_fit.xy) / u_fit.z; }',
        'float aaw() { return 1.0 / u_fit.z; }',
        'vec3 over(vec3 c, vec3 s, float a) { return mix(c, s, clamp(a, 0.0, 1.0)); }'
    ].join('\n');

    /* An original fuel-pump and oil-can glyph, ~24 units, centred on c. */
    var GLYPHS = [
        'float pumpGlyph(vec2 q, vec2 c) {',
        '  vec2 r = q - c;',
        '  float body = sdBox(r - vec2(-3.0, 0.0), vec2(5.5, 9.0));',
        '  float win = sdBox(r - vec2(-3.0, -4.0), vec2(3.0, 2.5));',
        '  float hose = sdSegment(r, vec2(2.5, -3.0), vec2(6.5, -3.0), 1.1);',
        '  hose = min(hose, sdSegment(r, vec2(6.5, -3.0), vec2(6.5, 5.0), 1.1));',
        '  hose = min(hose, sdSegment(r, vec2(6.5, -3.0), vec2(4.0, -8.0), 1.1));',
        '  return min(max(body, -win), hose);',
        '}',
        'float oilGlyph(vec2 q, vec2 c) {',
        '  vec2 r = q - c;',
        '  float can = sdBox(r - vec2(-2.0, 2.0), vec2(7.0, 4.0));',
        '  float lid = sdSegment(r, vec2(-6.0, -3.5), vec2(-2.0, -3.5), 1.2);',
        '  float spout = sdSegment(r, vec2(5.0, 0.5), vec2(11.0, -3.0), 1.2);',
        '  float drop = length(r - vec2(11.5, 3.5)) - 1.6;',
        '  return min(min(can, lid), min(spout, drop));',
        '}'
    ].join('\n');

    /*
     * One gauge: the rail, its hairline, the lit run with the white marker,
     * ticks on the angled sections, the high-end fringe, and the secondary
     * diagonal bar with its glyph.
     */
    function gauge(side) {
        var R = M.RAILS[side], rg = M.range(side), vA = M.vertexArc(side);
        var bar = side === 'left' ? M.BARS.fuel : M.BARS.oil;
        var glyph = (side === 'left' ? 'pumpGlyph(q, ' : 'oilGlyph(q, ') + v2(bar.glyph) + ')';
        var nSteps = 8;
        var GAP = 22;            /* rail edge to the band, measured off the photograph */
        return [
            'uniform vec2 u_origin;',
            FIT,
            'uniform float u_val;',          /* 0..1 along the scale */
            'uniform vec3 u_rail;',          /* the rail and the lit band */
            'uniform vec3 u_hi;',            /* its bright edge */
            'uniform vec3 u_ink;',           /* the marker and the live bar */
            'uniform vec3 u_sub;',           /* ticks */
            'uniform vec3 u_warn;',
            'uniform vec3 u_fringe;',        /* the shift mark */
            'uniform vec4 u_bar;',           /* secondary bar: frac, warn, -, flash */
            'uniform vec4 u_marks;',         /* redline frac, shift frac, on, - */
            polyFn('railD', R.rail, R.inside),
            polyFn('bandOutD', M.bandEdges(side).outer, R.inside),
            polyFn('bandInD', M.bandEdges(side).inner, R.inside),
            GLYPHS,
            'void main() {',
            '  vec2 q = design();',
            '  float aw = aaw();',
            '  vec3 col = vec3(0.0);',
            '  float alpha = 0.0;',
            '  vec4 r = railD(q);',
            '  float sd = r.y > 0.0 ? r.x : -r.x;',             /* + towards the centre */
            '  float beside = step(0.001, abs(r.y));',          /* not past either end */
            '  float a0 = ' + f(rg.a0) + ', a1 = ' + f(rg.a1) + ';',
            '  float act = a0 + (a1 - a0) * clamp(u_val, 0.0, 1.0);',
            '  float inScale = step(a0, r.z) * step(r.z, a1);',
            '  float beat = u_bar.w * step(0.5, fract(u_time * 9.0));',
            /* each element is thicker on the upper limb: the step is at the vertex */
            '  float limb = smoothstep(' + f(vA - 26) + ', ' + f(vA + 26) + ', r.z);',
            '  float wRail = mix(' + f(M.RAIL_W[0] / 2) + ', ' + f(M.RAIL_W[1] / 2) + ', limb);',
            '  float wBand = mix(' + f(M.BAND_W[0]) + ', ' + f(M.BAND_W[1]) + ', limb);',
            '',
            /* ---- the outer rail: lit its whole length, with its own glow ---- */
            '  float rail = covW(r.x - wRail, aw);',
            '  vec3 railC = mix(u_rail, u_hi, 0.22 + 0.16 * limb);',
            '  railC = mix(railC, vec3(1.0), beat * 0.6);',
            '  col = railC; alpha = rail;',
            '  float rg2 = exp(-max(r.x - wRail, 0.0) / 3.0) * 0.11 * (1.0 - rail);',
            '  col = mix(col, u_hi, rg2 / max(alpha + rg2, 0.001)); alpha = max(alpha, rg2);',
            '',
            /* ---- the value band: between two mitred offsets of the chevron ---- */
            '  vec4 bo = bandOutD(q); vec4 bi = bandInD(q);',
            '  float so = bo.y > 0.0 ? bo.x : -bo.x;',          /* + inside the band */
            '  float si = bi.y > 0.0 ? bi.x : -bi.x;',          /* + past its inner edge */
            '  float band = covW(-so, aw) * covW(si, aw) * inScale;',
            '  float lit = covW(r.z - act, aw);',
            '  float across = clamp(so / max(so - si, 1.0), 0.0, 1.0);',
            /* a shallow gradient across it, brighter at the rail side */
            '  vec3 dark = u_rail * (0.36 - 0.11 * across);',
            '  vec3 bright = u_rail * (0.62 - 0.14 * across);',
            /* lifting towards the head of the fill, as on the car */
            '  bright *= 0.86 + 0.30 * smoothstep(150.0, 0.0, act - r.z);',
            '  bright = mix(bright, vec3(1.0), beat * 0.5);',
            '  col = mix(col, mix(dark, bright, lit), band);',
            '  alpha = max(alpha, band);',
            /* the thin bright line along the band\'s inner edge */
            '  float inner = covW(abs(si) - 2.1, aw) * inScale;',
            '  col = mix(col, mix(u_rail, u_hi, 0.18 + 0.30 * lit) * (0.72 + 0.28 * lit), inner);',
            '  alpha = max(alpha, inner);',
            /* the lit band\'s bloom, out towards the rail */
            '  float bl = exp(-max(max(-so, si), 0.0) / 6.0) * lit * inScale * 0.13 * (1.0 - band) * (1.0 - rail);',
            '  col = mix(col, u_hi, bl / max(alpha + bl, 0.001)); alpha = max(alpha, bl);',
            '',
            /* ---- redline and shift marks, in the gap (rev gauge) ---- */
            '  float gapIn = covW(-so - 17.0, aw) * covW(so + 4.0, aw) * u_marks.z;',
            '  float redRun = step(a0 + (a1 - a0) * u_marks.x, r.z) * inScale;',
            '  float shiftRun = step(a0 + (a1 - a0) * u_marks.y, r.z) * (1.0 - redRun) * inScale;',
            '  col = mix(col, u_rail, gapIn * redRun); alpha = max(alpha, gapIn * redRun);',
            '  col = mix(col, u_fringe, gapIn * shiftRun); alpha = max(alpha, gapIn * shiftRun);',
            '',
            /* ---- ticks, outside the rail ---- */
            '  float st = (a1 - a0) / ' + f(nSteps) + ';',
            '  float k = floor((r.z - a0) / st + 0.5);',
            '  float tk = covW(abs(r.z - (a0 + k * st)) - 1.4, aw) * covW(abs(sd + wRail + 7.5) - 5.0, aw)',
            '           * step(-0.5, k) * step(k, ' + f(nSteps + 0.5) + ') * r.w * inScale;',
            '  col = mix(col, u_sub, tk); alpha = max(alpha, tk * 0.85);',
            '',
            /* ---- the marker at the head of the fill ---- */
            '  float mk = covW(abs(r.z - act) - ' + f(M.MARKER[1] / 2) + ', aw)',
            '           * covW(abs(sd + 1.0) - ' + f(M.MARKER[0] / 2) + ', aw) * inScale;',
            '  col = mix(col, u_ink, mk); alpha = max(alpha, mk);',
            '  float mg = exp(-max(length(vec2((r.z - act) * 1.6, sd)) - 10.0, 0.0) / 2.2) * 0.16 * (1.0 - mk) * inScale;',
            '  col = mix(col, u_ink, mg / max(alpha + mg, 0.001)); alpha = max(alpha, mg);',
            '',
            /* ---- the secondary bar: five segments, filling from the bottom ---- */
            '  vec2 bq = q - vec2(' + f(bar.x + bar.w / 2) + ', ' + f((bar.y0 + bar.y1) / 2) + ');',
            '  float inBar = covW(abs(bq.x) - ' + f(bar.w / 2) + ', aw) * covW(abs(bq.y) - ' + f((bar.y0 - bar.y1) / 2) + ', aw);',
            '  float up = (' + f(bar.y0) + ' - q.y) / ' + f(bar.y0 - bar.y1) + ';',
            '  float segL = ' + f((bar.y0 - bar.y1) / bar.segs) + ';',
            '  float segGap = step(segL - 3.5, mod(' + f(bar.y0) + ' - q.y, segL));',
            '  float segOn = step(up, u_bar.x + 0.001);',
            /* the live part is light, the rest a dark track, as on the car */
            '  vec3 barC = mix(vec3(0.13, 0.15, 0.19), mix(u_ink, u_warn, u_bar.y) * (0.70 + 0.30 * up), segOn);',
            '  float bA = inBar * (1.0 - segGap);',
            '  col = mix(col, barC, bA); alpha = max(alpha, bA);',
            '  float g = covW(' + glyph + ', aw);',
            '  col = mix(col, u_sub, g); alpha = max(alpha, g);',
            '  gl_FragColor = vec4(col, alpha);',
            '}'
        ].join('\n');
    }

    /*
     * The frame: the outside field, graphite shading behind the speed and
     * the gear, the centre's matte and feathered window, the top and bottom
     * accents and the drive-mode lozenge. Full panel, under the gauges.
     */
    var C = M.CENTRE;
    var mframe = [
        'uniform vec2 u_origin;',
        FIT,
        'uniform float u_open;',
        'uniform vec3 u_outside;',
        'uniform vec3 u_recess;',
        'uniform vec3 u_matte;',
        'uniform vec3 u_rule;',
        'uniform vec3 u_blue;',
        'uniform vec3 u_red;',
        'uniform vec3 u_blueHi;',
        'uniform vec3 u_redHi;',
        'uniform float u_lozenge;',          /* 1: a drive mode to show */
        'uniform float u_badge;',            /* 1: draw the stripe badge */
        'float slab(float x, float a, float b) {',
        '  return smoothstep(a - 7.0, a + 7.0, x) * (1.0 - smoothstep(b - 7.0, b + 7.0, x));',
        '}',
        'float sdCham(vec2 q, vec2 lo, vec2 hi, float ch) {',
        '  vec2 h = (hi - lo) * 0.5;',
        '  vec2 a = abs(q - (lo + hi) * 0.5);',
        '  return max(max(a.x - h.x, a.y - h.y), (a.x + a.y - (h.x + h.y - ch)) * 0.70710678);',
        '}',
        'void main() {',
        '  vec2 q = design();',
        '  float aw = aaw();',
        '  vec3 col = u_outside;',
        /* a shallow graphite lift behind each group of figures - no edges */
        '  col = mix(col, u_recess, 0.85 * exp(-pow(length((q - vec2(430.0, 330.0)) / vec2(250.0, 250.0)), 2.2)));',
        '  col = mix(col, u_recess, 0.85 * exp(-pow(length((q - vec2(1490.0, 330.0)) / vec2(250.0, 250.0)), 2.2)));',
        '  col += vec3(0.016, 0.022, 0.032) * exp(-pow(length((q - vec2(470.0, 300.0)) / vec2(150.0, 95.0)), 2.0));',
        '  col += vec3(0.016, 0.022, 0.032) * exp(-pow(length((q - vec2(1470.0, 310.0)) / vec2(130.0, 95.0)), 2.0));',
        '',
        /* the centre */
        '  float dc = sdCham(q, vec2(' + f(C.x0) + ', ' + f(C.y0) + '), vec2(' + f(C.x1) + ', ' + f(C.y1) + '), ' + f(C.chamfer) + ');',
        '  float inC = covW(dc, aw);',
        /*
         * The angular planes the car draws across the instrument area. They
         * run on behind the gauges, as in the photograph, and are strongest
         * inside the aperture, where they go with the matte - so the map
         * replaces them as the window opens.
         */
        '  float u = (q.x - 960.0) + (q.y - 334.0) * 0.42;',
        '  float v = clamp((q.y - 90.0) / 490.0, 0.0, 1.0);',
        '  float fade = (1.0 - 0.52 * v) * (1.0 - 0.34 * smoothstep(200.0, 700.0, u))',
        '            * (1.0 - smoothstep(560.0, 745.0, abs(q.x - 960.0)))',
        '            * (1.0 - smoothstep(230.0, 320.0, abs(q.y - 334.0)));',
        /* measured off the photograph: the planes darken towards the left */
        '  vec3 pl = vec3(0.0);',
        '  pl += u_blue * 0.09 * slab(u, -760.0, -190.0);',
        '  pl += u_blue * 0.26 * slab(u, -190.0, 200.0);',
        '  pl += u_blue * 0.42 * slab(u, 200.0, 760.0);',
        '  pl += u_blue * 0.10 * (covW(abs(u + 190.0) - 2.0, aw) + covW(abs(u - 200.0) - 2.0, aw)',
        '                       + covW(abs(u + 760.0) - 2.0, aw) + covW(abs(u - 760.0) - 2.0, aw));',
        '  float w2 = (q.x - 960.0) - (q.y - 334.0) * 1.35;',
        '  pl += u_blue * 0.10 * slab(w2, -300.0, 140.0);',
        '  pl += u_red * 0.10 * slab(w2, 140.0, 250.0);',
        '  pl += u_blue * 0.09 * covW(abs(w2 + 420.0) - 2.0, aw);',
        '  pl *= fade;',
        /* one field across the whole instrument area, so the aperture has no
           edge of its own until the map opens inside it */
        '  col += pl;',
        '  col = over(col, col + u_matte * 0.55, inC * 0.40);',
        '',
        /* the restrained bar under each gauge, fading towards the middle */
        '  float botY = 592.0;',
        '  float botL = covW(abs(q.y - botY) - 2.5, aw) * smoothstep(205.0, 245.0, q.x) * (1.0 - smoothstep(430.0, 880.0, q.x));',
        '  float botR = covW(abs(q.y - botY) - 2.5, aw) * (1.0 - smoothstep(1675.0, 1715.0, q.x)) * smoothstep(1040.0, 1490.0, q.x);',
        '  col = over(col, mix(u_blue * 0.5, u_blue, smoothstep(880.0, 240.0, q.x)), botL);',
        '  col = over(col, mix(u_red * 0.5, u_red, smoothstep(1040.0, 1680.0, q.x)), botR);',
        '  float rule = covW(abs(q.y - botY) - 0.6, aw) * step(880.0, q.x) * step(q.x, 1040.0);',
        '  col = over(col, u_rule, rule * 0.8);',
        '',
        /* the drive-mode lozenge: angular ends, blue */
        '  vec2 lz = q - vec2(960.0, 611.0);',
        '  float lzd = max(abs(lz.y) - 17.0, abs(lz.x) + (lz.y + 17.0) * 0.45 - 106.0);',
        '  float lzIn = covW(lzd, aw) * u_lozenge;',
        '  col = over(col, mix(u_blue * 0.30, u_blue * 0.55, smoothstep(19.0, -19.0, lz.y)), lzIn);',
        '  col = over(col, u_blueHi, covW(abs(lzd) - 0.8, aw) * u_lozenge * 0.9);',
        '',
        /* the badge: three slanted stripes, the M letter sits beside them */
        '  vec2 bq = q - vec2(68.0, 607.0);',
        '  float bu = bq.x + bq.y * 0.42;',
        '  float inB = covW(abs(bq.y) - 8.0, aw) * u_badge;',
        '  col = over(col, u_blueHi * 0.85, inB * slab(bu, -24.0, -14.0));',
        '  col = over(col, u_blue * 0.75, inB * slab(bu, -13.0, -3.0));',
        '  col = over(col, u_red, inB * slab(bu, -2.0, 8.0));',
        '',
        '  float reveal = smoothstep(0.0, ' + f(C.feather) + ', -dc);',
        '  float alpha = 1.0 - u_open * reveal;',
        /* the glass is cut on a diagonal at the top corners (panel pixels) */
        '  vec2 p = px() + u_origin;',
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((1920.0 - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
    ].join('\n');

    /*
     * The turn arrow, an original drawing: a short stem, a shaft bent by the
     * turn's angle, an open head. Kinds: 0 straight / turn by u_angle,
     * 1 U-turn, 2 roundabout (ring, exit at u_angle), 3 destination.
     */
    var tturn = [
        'uniform float u_kind;',
        'uniform float u_angle;',
        'uniform vec3 u_col;',
        'uniform vec3 u_ring;',
        'float head(vec2 p, vec2 tip, vec2 dir, float len, float w) {',
        '  vec2 n = vec2(-dir.y, dir.x);',
        '  vec2 b = tip - dir * len;',
        '  return min(sdSegment(p, tip, b + n * w, 0.0), sdSegment(p, tip, b - n * w, 0.0));',
        '}',
        'void main() {',
        '  vec2 p = px() / u_size;',
        '  float aw = 1.0 / u_size.x;',
        '  float t = 0.042;',
        '  float d = 1e3;',
        '  float ringD = 1e3;',
        '  vec2 base = vec2(0.5, 0.94);',
        '  if (u_kind < 0.5) {',
        '    vec2 piv = vec2(0.5, 0.56);',
        '    vec2 dir = vec2(sin(u_angle), -cos(u_angle));',
        '    float len = 0.40 - 0.10 * abs(sin(u_angle));',
        '    vec2 tip = piv + dir * len;',
        '    d = min(sdSegment(p, base, piv, 0.0), sdSegment(p, piv, tip - dir * 0.02, 0.0));',
        '    d = min(d, head(p, tip, dir, 0.17, 0.15));',
        '  } else if (u_kind < 1.5) {',
        '    float s = sign(u_angle + 1e-4);',
        '    vec2 c = vec2(0.5 + 0.13 * s, 0.36);',
        '    vec2 a = vec2(0.5, 0.36);',
        '    vec2 e = vec2(0.5 + 0.26 * s, 0.36);',
        '    float arc = abs(length(p - c) - 0.13);',
        '    arc = p.y > 0.36 ? 1e3 : arc;',
        '    d = min(min(sdSegment(p, base, a, 0.0), arc), sdSegment(p, e, vec2(e.x, 0.62), 0.0));',
        '    d = min(d, head(p, vec2(e.x, 0.70), vec2(0.0, 1.0), 0.15, 0.13));',
        '  } else if (u_kind < 2.5) {',
        '    vec2 c = vec2(0.5, 0.46);',
        '    float r = 0.17;',
        '    ringD = abs(length(p - c) - r);',
        '    vec2 dir = vec2(sin(u_angle), -cos(u_angle));',
        '    vec2 from = c + dir * r;',
        '    vec2 tip = c + dir * (r + 0.27);',
        '    d = min(sdSegment(p, base, c + vec2(0.0, r), 0.0), sdSegment(p, from, tip - dir * 0.02, 0.0));',
        '    d = min(d, head(p, tip, dir, 0.15, 0.13));',
        '  } else {',
        '    vec2 c = vec2(0.5, 0.40);',
        '    float pin = max(length(p - c) - 0.22, -(length(p - c) - 0.09));',
        '    float drop = sdSegment(p, c + vec2(0.0, 0.18), vec2(0.5, 0.88), 0.0) - 0.035;',
        '    gl_FragColor = vec4(u_col, covW(min(pin, drop), aw));',
        '    return;',
        '  }',
        '  float a = covW(d - t, aw);',
        '  float rg = covW(ringD - t * 0.7, aw);',
        '  gl_FragColor = vec4(mix(u_ring, u_col, a), max(a, rg * 0.9));',
        '}'
    ].join('\n');

    return { mframe: mframe, mgaugeL: gauge('left'), mgaugeR: gauge('right'), tturn: tturn };
}));
