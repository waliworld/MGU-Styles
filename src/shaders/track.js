(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUShadersTrack = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * The Track theme (TBW brief, docs/TBW-TRACK-BRIEF.md): everything that
     * is not text, drawn in the brief's own 1920x720 design units and fitted
     * onto the panel by u_fit (tx, ty, scale).
     *
     * One frame layer: the outside field, both towers with the blue spine
     * and the vermilion accent, the speed bar, the 12-segment rev strip, the
     * fuel and oil ribbons, the centre's matte and its feathered window. The
     * window is the only see-through part of the theme: alpha there is
     * 1 - open * smoothstep(0, 40, d), d the distance into the centre
     * polygon in design units, so the map or camera under it shows in the
     * core and fades into the walls (brief section 3).
     */

    var FIT = [
        'uniform vec3 u_fit;',                    /* tx, ty, scale: panel = t + design * scale */
        'vec2 design() { return (px() - u_fit.xy) / u_fit.z; }',
        'float aaw() { return 1.0 / u_fit.z; }',  /* one panel pixel in design units */
        /* signed distance to a rectangle lo..hi with its corners cut by
           c = (top-left, top-right, bottom-right, bottom-left); exact inside */
        'float sdCham(vec2 q, vec2 lo, vec2 hi, vec4 c) {',
        '  vec2 h = (hi - lo) * 0.5;',
        '  vec2 r = q - (lo + hi) * 0.5;',
        '  float ch = r.x > 0.0 ? (r.y > 0.0 ? c.z : c.y) : (r.y > 0.0 ? c.w : c.x);',
        '  vec2 a = abs(r);',
        '  float box = max(a.x - h.x, a.y - h.y);',
        '  float cut = (a.x + a.y - (h.x + h.y - ch)) * 0.70710678;',
        '  return max(box, cut);',
        '}',
        'float seg(vec2 q, vec2 a, vec2 b) { return sdSegment(q, a, b, 0.0); }'
    ].join('\n');

    var tframe = [
        FIT,
        'uniform float u_open;',
        'uniform vec3 u_outside;',
        'uniform vec3 u_plate;',
        'uniform vec3 u_matte;',
        'uniform vec3 u_sep;',
        'uniform vec3 u_blue;',
        'uniform vec3 u_verm;',
        'uniform vec3 u_amber;',
        'uniform vec3 u_red;',
        'uniform vec3 u_dim;',
        'uniform vec4 u_speed;',                  /* frac, ticks, -, - */
        'uniform vec4 u_rpm;',                    /* frac, first red segment, flash, segments */
        'uniform vec4 u_ribbons;',                /* fuel frac, fuel low, oil frac, oil hot */
        '',
        'vec3 over(vec3 c, vec3 s, float a) { return mix(c, s, clamp(a, 0.0, 1.0)); }',
        '',
        'void main() {',
        '  vec2 q = design();',
        '  float aw = aaw();',
        '  vec3 col = u_outside;',
        '',
        /* a slight lift towards the middle, no blur, no glare (brief 2) */
        '  col += vec3(0.010, 0.014, 0.020) * exp(-pow((q.y - 330.0) / 300.0, 2.0));',
        '',
        /* ---- towers ---- */
        '  float dl = sdCham(q, vec2(72.0, 116.0), vec2(416.0, 588.0), vec4(16.0, 28.0, 28.0, 16.0));',
        '  float dr = sdCham(q, vec2(1504.0, 116.0), vec2(1848.0, 588.0), vec4(20.0));',
        '  vec3 plateL = u_plate * (1.0 + 0.10 * (1.0 - (q.y - 116.0) / 472.0));',
        '  col = over(col, plateL, covW(dl, aw));',
        '  col = over(col, plateL, covW(dr, aw));',
        '  col = over(col, u_sep, covW(abs(dl) - 0.75, aw) * 0.85);',
        '  col = over(col, u_sep, covW(abs(dr) - 0.75, aw) * 0.85);',
        '',
        /* ---- the centre: matte, its walls, the window ---- */
        '  float dc = sdCham(q, vec2(440.0, 108.0), vec2(1480.0, 586.0), vec4(24.0));',
        '  float inC = covW(dc, aw);',
        '  vec3 matte = u_matte * (0.92 + 0.08 * (1.0 - abs(q.x - 960.0) / 520.0));',
        '  col = over(col, matte, inC);',
        '  col = over(col, u_sep, covW(abs(dc) - 0.65, aw) * 0.55 * (1.0 - u_open));',
        /* the neutral line under the centre (brief 1) */
        '  col = over(col, u_sep, covW(abs(q.y - 608.0) - 0.65, aw) * step(464.0, q.x) * step(q.x, 1456.0) * 0.8);',
        '',
        /* ---- the left tower: blue spine, speed bar ---- */
        '  float sp = min(min(seg(q, vec2(136.0, 140.0), vec2(104.0, 140.0)), seg(q, vec2(104.0, 140.0), vec2(104.0, 303.0))),',
        '             min(min(seg(q, vec2(104.0, 303.0), vec2(118.0, 317.0)), seg(q, vec2(118.0, 317.0), vec2(118.0, 518.0))),',
        '                 min(seg(q, vec2(118.0, 518.0), vec2(163.0, 563.0)), seg(q, vec2(163.0, 563.0), vec2(386.0, 563.0)))));',
        '  col += u_blue * exp(-sp / 2.4) * 0.12;',                       /* the accent's own glow, ~12% */
        '  col = over(col, u_blue, covW(sp - 1.2, aw));',
        '',
        '  float barX = 130.0, barW = 5.0, barTop = 188.0, barBot = 477.0;',
        '  float inBar = covW(abs(q.x - barX) - barW, aw) * covW(abs(q.y - (barTop + barBot) * 0.5) - (barBot - barTop) * 0.5, aw);',
        '  float fillTo = barBot - (barBot - barTop) * clamp(u_speed.x, 0.0, 1.0);',
        '  float lit = inBar * covW(fillTo - q.y, aw);',
        '  col = over(col, u_dim * 0.35, inBar);',
        '  col = over(col, u_blue, lit);',
        '  col += u_blue * exp(-max(sdBox(q - vec2(barX, (fillTo + barBot) * 0.5), vec2(barW, (barBot - fillTo) * 0.5)), 0.0) / 6.0) * 0.10 * step(0.002, u_speed.x);',
        /* ticks at every interval, against explicit anchors (brief 2) */
        '  float nT = max(u_speed.y, 1.0);',
        '  float tStep = (barBot - barTop) / nT;',
        '  float ti = floor((barBot - q.y) / tStep + 0.5);',
        '  float ty = barBot - ti * tStep;',
        '  float tick = covW(abs(q.y - ty) - 0.8, aw) * covW(abs(q.x - 143.0) - 5.0, aw) * step(-0.5, ti) * step(ti, nT + 0.5);',
        '  col = over(col, u_dim, tick * 0.9);',
        '',
        /* ---- the right tower: accent, rev strip ---- */
        '  float ra = min(seg(q, vec2(1524.0, 132.0), vec2(1818.0, 132.0)),',
        '             min(seg(q, vec2(1818.0, 132.0), vec2(1830.0, 144.0)), seg(q, vec2(1830.0, 144.0), vec2(1830.0, 211.0))));',
        '  col += u_verm * exp(-ra / 2.4) * 0.12;',
        '  col = over(col, u_verm, covW(ra - 1.1, aw));',
        '',
        '  float nS = u_rpm.w;',
        '  float pitch = 25.5;',
        /* a slight lean, the clipped-corner look of the numerals */
        '  vec2 rq = vec2(q.x - (q.y - 186.0) * 0.18, q.y);',
        '  float si = floor((rq.x - 1524.0) / pitch);',
        '  float sx = 1524.0 + si * pitch + 10.5;',
        '  float inSeg = covW(sdBox(rq - vec2(sx, 186.0), vec2(10.5, 10.0)), aw) * step(0.0, si) * step(si, nS - 1.0);',
        '  float segFill = clamp(u_rpm.x * nS - si, 0.0, 1.0);',
        '  vec3 segCol = si >= u_rpm.y ? u_red : u_verm;',
        '  float beat = step(0.5, fract(u_time * 9.0));',
        '  float flash = u_rpm.z * beat;',
        '  segCol = mix(segCol, vec3(1.0), flash * 0.7);',
        '  segFill = max(segFill, flash);',
        '  col = over(col, u_dim * 0.28, inSeg);',
        '  col = over(col, segCol, inSeg * segFill);',
        '',
        /* ---- ribbons: fuel (left), oil temperature (right) ---- */
        '  for (int k = 0; k < 2; k++) {',
        '    float x0 = k == 0 ? 156.0 : 1540.0;',
        '    float x1 = k == 0 ? 376.0 : 1812.0;',
        '    float f = k == 0 ? u_ribbons.x : u_ribbons.z;',
        '    float warn = k == 0 ? u_ribbons.y : u_ribbons.w;',
        '    vec3 acc = k == 0 ? u_blue : u_verm;',
        '    vec3 wc = k == 0 ? u_amber : u_red;',
        '    float inR = covW(abs(q.y - 537.0) - 4.0, aw) * covW(abs(q.x - (x0 + x1) * 0.5) - (x1 - x0) * 0.5, aw);',
        '    float fx = x0 + (x1 - x0) * clamp(f, 0.0, 1.0);',
        '    col = over(col, u_dim * 0.30, inR);',
        '    col = over(col, mix(acc, wc, warn), inR * covW(q.x - fx, aw));',
        /* four subdivisions */
        '    float st = (x1 - x0) / 4.0;',
        '    float di = floor((q.x - x0) / st + 0.5);',
        '    float tk = covW(abs(q.x - (x0 + di * st)) - 0.7, aw) * covW(abs(q.y - 548.0) - 4.0, aw) * step(-0.5, di) * step(di, 4.5);',
        '    col = over(col, u_dim, tk * 0.85);',
        '  }',
        '',
        /* the window: the only see-through part */
        '  float reveal = smoothstep(0.0, 40.0, -dc);',
        '  float alpha = 1.0 - u_open * reveal;',
        '',
        /* the glass is cut on a diagonal at the top corners (panel pixels) */
        '  vec2 p = px();',
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((u_size.x - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
    ].join('\n');

    /*
     * The turn arrow, an original drawing: a short stem, a shaft bent by the
     * turn's angle, an open head. Kinds: 0 straight / turn by u_angle,
     * 1 U-turn, 2 roundabout (ring, exit at u_angle), 3 destination.
     * Local units: the layer is the brief's 130x130 arrow box.
     */
    var tturn = [
        'uniform float u_kind;',
        'uniform float u_angle;',                 /* radians, + right, - left */
        'uniform vec3 u_col;',
        'uniform vec3 u_ring;',
        '',
        'float head(vec2 p, vec2 tip, vec2 dir, float len, float w) {',
        '  vec2 n = vec2(-dir.y, dir.x);',
        '  vec2 b = tip - dir * len;',
        '  return min(sdSegment(p, tip, b + n * w, 0.0), sdSegment(p, tip, b - n * w, 0.0));',
        '}',
        '',
        'void main() {',
        '  vec2 p = px() / u_size;',
        '  float aw = 1.0 / u_size.x;',
        '  float t = 0.042;',                    /* stroke half-width */
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
        '    float body = min(pin, drop);',
        '    gl_FragColor = vec4(u_col, covW(body, aw));',
        '    return;',
        '  }',
        '  float a = covW(d - t, aw);',
        '  float rg = covW(ringD - t * 0.7, aw);',
        '  vec3 col = mix(u_ring, u_col, a);',
        '  gl_FragColor = vec4(col, max(a, rg * 0.9));',
        '}'
    ].join('\n');

    return { tframe: tframe, tturn: tturn };
}));
