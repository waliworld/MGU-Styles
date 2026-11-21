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
            'vec3 ' + name + '(vec2 p) {',
            '  float best = 1e9; float side = 0.0; float arc = 0.0;',
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
                '; arc = ' + f(cum[i - 1]) + ' + t; }'
            );
        }
        out.push('  return vec3(best, side, arc);', '}');
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
        var R = M.RAILS[side], rg = M.range(side);
        var bar = side === 'left' ? M.BARS.fuel : M.BARS.oil;
        var bx = bar.top[0] - bar.bottom[0], by = bar.top[1] - bar.bottom[1], bl = Math.hypot(bx, by);
        var glyph = side === 'left'
            ? 'pumpGlyph(q, ' + v2([bar.bottom[0] + 48, bar.bottom[1] - 17]) + ')'
            : 'oilGlyph(q, ' + v2([bar.bottom[0] - 46, bar.bottom[1] - 20]) + ')';
        var nSteps = 8;
        return [
            'uniform vec2 u_origin;',
            FIT,
            'uniform float u_val;',          /* 0..1 along the scale */
            'uniform vec3 u_rail;',
            'uniform vec3 u_hi;',
            'uniform vec3 u_ink;',           /* the marker and the live bar */
            'uniform vec3 u_sub;',           /* ticks */
            'uniform vec3 u_warn;',
            'uniform vec3 u_fringe;',        /* the high-end mark */
            'uniform vec4 u_bar;',           /* frac, warn, fringe-from (0..1, >1 none), flash */
            polyFn('railD', R.rail, R.inside),
            polyFn('hairD', R.hair, R.inside),
            GLYPHS,
            'void main() {',
            '  vec2 q = design();',
            '  float aw = aaw();',
            '  vec3 col = vec3(0.0);',
            '  float alpha = 0.0;',
            '  vec3 r = railD(q);',
            '  vec3 h = hairD(q);',
            '  float sd = r.y > 0.0 ? r.x : -r.x;',             /* signed: + towards the centre */
            '  float beside = step(0.001, abs(r.y));',           /* not past either end */
            '  float a0 = ' + f(rg.a0) + ', a1 = ' + f(rg.a1) + ';',
            '  float act = a0 + (a1 - a0) * clamp(u_val, 0.0, 1.0);',
            '  float beat = u_bar.w * step(0.5, fract(u_time * 9.0));',
            '',
            /* the band: the rail's stroke and the gap in to the hairline */
            '  float stroke = covW(r.x - ' + f(M.RAIL_W / 2) + ', aw);',
            /* inside the rail's centre line, outside the hairline */
            '  float gap = step(0.0, sd) * step(h.y, 0.0) * step(r.x, 26.0);',
            '  float band = max(stroke, gap);',
            /* the bottom cap is decorative and always lit, as on the car */
            '  float lit = max(covW(r.z - act, aw) * step(a0 - 0.5, r.z), step(r.z, a0));',
            /* inactive: a deep track; active: the rail colour lifting to its highlight */
            '  vec3 trackC = u_rail * 0.40;',
            '  vec3 litC = mix(u_rail, u_hi, 0.30 + 0.25 * smoothstep(-6.5, 20.0, sd));',
            '  litC = mix(litC, vec3(1.0), beat * 0.55);',
            '  vec3 bandC = mix(trackC, litC, lit);',
            '  float bandA = band * mix(0.92, 1.0, lit) * mix(0.55, 1.0, max(stroke, lit));',
            '  col = bandC; alpha = bandA;',
            /* the narrow lit edge on the outer side of the rail */
            '  float edge = covW(abs(sd + ' + f(M.RAIL_W / 2 - 1.1) + ') - 1.1, aw) * beside;',
            '  col = over(col, u_hi, edge); alpha = max(alpha, edge);',
            /* glow, the lit rail only (guide: ~0.8 sigma, 8-14%) */
            '  float glow = exp(-max(r.x - 6.5, 0.0) / 1.6) * 0.12 * lit * (1.0 - band);',
            '  col = mix(col, u_hi, glow / max(alpha + glow, 0.001)); alpha = max(alpha, glow);',
            /* the hairline */
            '  float hl = covW(h.x - ' + f(M.HAIR_W / 2) + ', aw) * (1.0 - band);',
            '  col = over(col, mix(u_rail, u_hi, 0.4), hl); alpha = max(alpha, hl * 0.85);',
            /* the high-end fringe, outside the rail */
            '  float fr = step(a0 + (a1 - a0) * u_bar.z, r.z) * step(r.z, a1) * covW(abs(sd + 10.5) - 2.0, aw) * beside;',
            '  col = over(col, u_fringe, fr); alpha = max(alpha, fr);',
            /* ticks: one per scale step, short, outside the rail */
            '  float st = (a1 - a0) / ' + f(nSteps) + ';',
            '  float k = floor((r.z - a0) / st + 0.5);',
            '  float tk = covW(abs(r.z - (a0 + k * st)) - 0.9, aw) * covW(abs(sd + 13.5) - 3.5, aw)',
            '           * step(0.5, k) * step(k, ' + f(nSteps - 0.5) + ') * (1.0 - fr);',
            '  col = over(col, u_sub, tk); alpha = max(alpha, tk * 0.9);',
            /* the marker: white, across the rail's normal */
            '  float mk = covW(abs(r.z - act) - ' + f(M.MARKER[1] / 2) + ', aw) * covW(abs(sd) - ' + f(M.MARKER[0] / 2) + ', aw);',
            '  col = over(col, u_ink, mk); alpha = max(alpha, mk);',
            '  float mg = exp(-max(length(vec2(r.z - act, sd)) - 9.0, 0.0) / 1.4) * 0.12 * (1.0 - mk);',
            '  col = mix(col, u_ink, mg / max(alpha + mg, 0.001)); alpha = max(alpha, mg);',
            '',
            /* the secondary bar: 5 segments up a diagonal, live from the bottom */
            '  vec2 bd = vec2(' + f(bx / bl) + ', ' + f(by / bl) + ');',
            '  vec2 bq = q - ' + v2(bar.bottom) + ';',
            '  float along = dot(bq, bd);',
            '  float acrossB = bd.x * bq.y - bd.y * bq.x;',
            '  float inBar = covW(abs(acrossB) - ' + f(bar.width / 2) + ', aw) * covW(abs(along - ' + f(bl / 2) + ') - ' + f(bl / 2) + ', aw);',
            '  float segL = ' + f(bl / bar.segs) + ';',
            '  float segOn = step(along, u_bar.x * ' + f(bl) + ' + 0.01);',
            '  vec3 barC = mix(vec3(0.16, 0.19, 0.24), mix(u_ink, u_warn, u_bar.y), segOn);',
            '  float bA = inBar * (1.0 - step(segL - 3.0, mod(along, segL)));',
            '  col = over(col, barC, bA); alpha = max(alpha, bA);',
            '  float g = covW(' + glyph + ', aw);',
            '  col = over(col, u_sub, g); alpha = max(alpha, g);',
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
        'float sdCham(vec2 q, vec2 lo, vec2 hi, float ch) {',
        '  vec2 h = (hi - lo) * 0.5;',
        '  vec2 a = abs(q - (lo + hi) * 0.5);',
        '  return max(max(a.x - h.x, a.y - h.y), (a.x + a.y - (h.x + h.y - ch)) * 0.70710678);',
        '}',
        polyFn('hairL', M.RAILS.left.hair, M.RAILS.left.inside),
        polyFn('hairR', M.RAILS.right.hair, M.RAILS.right.inside),
        'void main() {',
        '  vec2 q = design();',
        '  float aw = aaw();',
        '  vec3 col = u_outside;',
        /* graphite inside each chevron, darker towards the gutter */
        '  vec3 hl = hairL(q);',
        '  vec3 hr = hairR(q);',
        /* inside each hairline, fading out towards the gutter: no hard edge */
        '  float inL = smoothstep(0.0, 1.0, hl.y) * (1.0 - smoothstep(330.0, 432.0, q.x));',
        '  float inR = smoothstep(0.0, 1.0, hr.y) * smoothstep(1488.0, 1590.0, q.x);',
        '  float shadeL = inL * exp(-hl.x / 160.0);',
        '  float shadeR = inR * exp(-hr.x / 160.0);',
        '  col = over(col, u_recess, max(shadeL, shadeR));',
        /* a soft graphite lift right behind the big figures */
        '  col += vec3(0.020, 0.028, 0.040) * exp(-pow(length((q - vec2(290.0, 340.0)) / vec2(110.0, 70.0)), 2.0));',
        '  col += vec3(0.020, 0.028, 0.040) * exp(-pow(length((q - vec2(1652.0, 350.0)) / vec2(90.0, 70.0)), 2.0));',
        '',
        /* the centre */
        '  float dc = sdCham(q, vec2(' + f(C.x0) + ', ' + f(C.y0) + '), vec2(' + f(C.x1) + ', ' + f(C.y1) + '), ' + f(C.chamfer) + ');',
        '  float inC = covW(dc, aw);',
        '  col = over(col, u_matte, inC);',
        '',
        /* restrained top and bottom accents, fading towards the middle */
        '  float topL = covW(abs(q.y - 153.0) - 1.0, aw) * step(336.0, q.x) * (1.0 - smoothstep(336.0, 760.0, q.x));',
        '  float topR = covW(abs(q.y - 145.0) - 1.0, aw) * step(q.x, 1588.0) * smoothstep(1160.0, 1588.0, q.x);',
        '  col = over(col, u_blue, topL * 0.85 * (1.0 - inC * u_open));',
        '  col = over(col, u_red, topR * 0.85 * (1.0 - inC * u_open));',
        '  float botY = 606.0;',
        '  float botL = covW(abs(q.y - botY) - 3.0, aw) * smoothstep(300.0, 340.0, q.x) * (1.0 - smoothstep(420.0, 900.0, q.x));',
        '  float botR = covW(abs(q.y - botY) - 3.0, aw) * (1.0 - smoothstep(1555.0, 1595.0, q.x)) * smoothstep(1020.0, 1500.0, q.x);',
        '  col = over(col, mix(u_blue * 0.55, u_blue, smoothstep(900.0, 300.0, q.x)), botL);',
        '  col = over(col, mix(u_red * 0.55, u_red, smoothstep(1020.0, 1620.0, q.x)), botR);',
        '  float rule = covW(abs(q.y - botY) - 0.6, aw) * step(900.0, q.x) * step(q.x, 1020.0);',
        '  col = over(col, u_rule, rule);',
        '',
        /* the drive-mode lozenge: angular ends, blue */
        '  vec2 lz = q - vec2(960.0, 654.0);',
        '  float lzd = max(abs(lz.y) - 19.0, abs(lz.x) + (lz.y + 19.0) * 0.45 - 118.0);',
        '  float lzIn = covW(lzd, aw) * u_lozenge;',
        '  col = over(col, mix(u_blue * 0.30, u_blue * 0.55, smoothstep(19.0, -19.0, lz.y)), lzIn);',
        '  col = over(col, u_blueHi, covW(abs(lzd) - 0.8, aw) * u_lozenge * 0.9);',
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
