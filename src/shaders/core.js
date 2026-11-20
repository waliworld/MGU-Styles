(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUShadersCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * Fragment shaders for the moving parts of the cluster.
     * GLSL ES 1.00 only - see docs/CLUSTER-CONSTRAINTS.md section 4:
     * no break in loops, no reserved uniform names, 48 vectors per shader.
     */

    /* ---------------------------------------------------------------- bg */
    /*
     * The honeycomb. On the real car it is a plain, visible pattern of large
     * hexagons - not a texture you have to look for - so it is drawn as a
     * filled cell with a lighter rim, brightest behind the dial and falling
     * away at the edges.
     */
    var bg = [
        'uniform vec3 u_tint;',
        'uniform float u_hex;',
        'uniform float u_hexSize;',
        '',
        'float hexDist(vec2 p, float s) {',
        '  vec2 hs = vec2(1.7320508, 1.0) * s;',
        '  vec2 a = mod(p, hs) - hs * 0.5;',
        '  vec2 b = mod(p - hs * 0.5, hs) - hs * 0.5;',
        '  vec2 g = dot(a, a) < dot(b, b) ? a : b;',
        '  return sdHex(g, s * 0.52);',
        '}',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 c = p - vec2(u_size.x * 0.5, u_size.y * 0.62);',
        '  float r = length(c / vec2(u_size.x * 0.54, u_size.y * 0.86));',
        '',
        '  vec3 col = vec3(0.016, 0.021, 0.028);',
        '  col += u_tint * 0.075 * exp(-r * r * 1.8);',
        '',
        /* Filled cells with a lit rim: the pattern reads as a surface. */
        '  float d = hexDist(p - vec2(0.0, 10.0), u_hexSize);',
        '  float fill = cov(d + 3.0);',
        '  float rim = cov(abs(d + 3.0) - 1.3);',
        '  float near = 0.42 + 0.58 * exp(-r * r * 1.25);',
        '  col += vec3(0.030, 0.038, 0.049) * fill * u_hex * near;',
        '  col += vec3(0.085, 0.102, 0.125) * rim * u_hex * near;',
        '',
        /* A brushed sheen across the upper half. */
        '  float sheen = exp(-pow((p.y - u_size.y * 0.08) / (u_size.y * 0.40), 2.0));',
        '  col += vec3(0.012, 0.016, 0.022) * sheen;',
        '',
        '  col *= 1.0 - 0.58 * smoothstep(0.74, 1.38, r);',
        /* The glass is cut on a diagonal at the top corners: a hard edge. */
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((u_size.x - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    /* -------------------------------------------------------------- tach */
    /*
     * The rev band.
     *
     * The sweep is a SUPERELLIPSE, |x/rx|^k + |y/ry|^k = 1 with k below 2,
     * not an ellipse. Measured off the reference clusters, their dial drops
     * away from the apex far faster than any ellipse can: at the half-way
     * point it sits ~40 px lower, and by three quarters ~55 px lower, which
     * is what gives it the long wings reaching into the corners instead of
     * a dome. k is `arcShape` in the settings.
     *
     * Position along the dial is the ordinary polar angle, which costs one
     * atan and spaces the blocks about as evenly as the ellipse did - the
     * superellipse's own parameter bunches them 5:1 at the ends.
     *
     * Blocks are solved in real pixels against each block's own tangent and
     * normal, so they stay square the whole way round.
     */
    var tach = [
        'uniform vec2 u_centre;',
        'uniform vec2 u_r;',         /* rx, ry */
        'uniform float u_k;',        /* superellipse exponent */
        'uniform float u_half;',     /* half sweep, radians */
        'uniform float u_segs;',
        'uniform float u_major;',
        'uniform vec2 u_depth;',     /* minor, major block depth in px */
        'uniform float u_frac;',
        'uniform float u_redline;',
        'uniform float u_warn;',
        'uniform vec3 u_lit;',
        'uniform vec4 u_remapP;',   /* polar angle -> arc length */
        'uniform vec4 u_remapQ;',   /* arc length -> polar angle */
        'uniform float u_arcLen;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  float k = u_k;',
        '',
        /* Where the pixel sits relative to the curve, in pixels. */
        '  float u = abs(p.x) / u_r.x, v = abs(p.y) / u_r.y;',
        '  float un = sePow(u, k), vn = sePow(v, k);',
        '  float S = un + vn;',
        '  vec2 gr = vec2(un / max(u, 0.0001) * sgn(p.x) / u_r.x,',
        '                 vn / max(v, 0.0001) * sgn(p.y) / u_r.y);',
        '  float gl = max(length(gr), 0.000001);',
        '  float ed = (S - 1.0) / (k * gl);',
        '',
        /*
         * Step onto the curve along its own normal before asking where we
         * are along it. Taking the polar angle of the pixel itself shears
         * the blocks into wedges near the ends, where the normal and the
         * radius point in quite different directions.
         */
        '  vec2 foot = p - ed * (gr / gl);',
        '  float m = atan(foot.x, -foot.y) / u_half;',
        '  float t = (remapOdd(u_remapP, m) + 1.0) * 0.5;',
        /* A block's own half-width of slack, so the first and last are not
           sliced off by the end of the sweep. */
        '  float slack = 0.6 / u_segs;',
        '  float onArc = step(-slack, t) * step(t, 1.0 + slack) * step(abs(m), 1.05);',
        '',
        /* The one block this pixel can belong to, and its frame. */
        '  float ft = t * u_segs;',
        '  float seg = clamp(floor(ft), 0.0, u_segs - 1.0);',
        '  float tc = (seg + 0.5) / u_segs;',
        '  float pc = remapOdd(u_remapQ, tc * 2.0 - 1.0) * u_half;',
        '  float sp = sin(pc), cp = cos(pc);',
        '  float A = sePow(abs(sp) / u_r.x, k);',
        '  float B = sePow(abs(cp) / u_r.y, k);',
        '  float SAB = A + B;',
        '  float rr = pow(max(SAB, 0.000001), -1.0 / k);',
        '  vec2 c = rr * vec2(sp, -cp);',
        /* u^k and v^k at the block centre fall out of A and B, no more pow. */
        '  float cu = abs(c.x) / u_r.x, cv = abs(c.y) / u_r.y;',
        '  vec2 gn = vec2((A / SAB) / max(cu, 0.0001) * sgn(c.x) / u_r.x,',
        '                 (B / SAB) / max(cv, 0.0001) * sgn(c.y) / u_r.y);',
        '  vec2 nrm = normalize(gn);',
        '  vec2 tg = vec2(-nrm.y, nrm.x);',
        '  vec2 d = p - c;',
        '  float along = dot(d, tg);',
        '  float radial = dot(d, nrm);',
        '',
        /* Arc length is uniform in t, so the spacing is just this. */
        '  float pitchPx = u_arcLen / u_segs;',
        '',
        '  float isMajor = step(0.5, 1.0 - abs(mod(seg + 0.5, u_major) - 0.5) * 2.0);',
        '  float depth = mix(u_depth.x, u_depth.y, isMajor);',
        '  float halfW = pitchPx * mix(0.36, 0.42, isMajor);',
        '  vec2 q = vec2(along, radial + depth * 0.5);',
        '  float dist = sdRound(q, vec2(halfW, depth * 0.5), 3.0);',
        '  float body = cov(dist) * onArc;',
        '',
        '  float past = step(tc, u_frac);',
        '  float red = step(u_redline, tc);',
        '',
        /* Milled metal: dark at the rim, bright at the inner end. */
        '  float lift = clamp(-radial / max(depth, 1.0), 0.0, 1.0);',
        '  vec3 steel = mix(vec3(0.255, 0.295, 0.350), vec3(0.420, 0.120, 0.095), red);',
        '  vec3 dark = steel * (0.30 + 1.05 * pow(lift, 0.75));',
        '  vec3 hot = mix(u_lit, vec3(1.0, 0.145, 0.095), red);',
        '  hot *= 0.70 + 0.34 * lift;',
        '',
        '  float flash = u_warn * (0.5 + 0.5 * sin(u_time * 37.0));',
        '  hot = mix(hot, vec3(1.0), flash * 0.75);',
        '',
        '  vec3 col = mix(dark, hot, past);',
        '  float alpha = body;',
        '  float rim = cov(abs(dist + 1.3) - 1.3) * onArc;',
        '  vec3 rimCol = mix(vec3(0.52, 0.58, 0.67), hot * 1.25, past);',
        '',
        '  float band = cov(abs(ed + u_depth.y * 0.5) - u_depth.y * 0.85) * onArc;',
        '  float litGlow = band * step(t, u_frac) * (0.07 + 0.30 * flash);',
        '  float edge = exp(-pow((t - u_frac) * u_segs * 3.2, 2.0)) * band;',
        '  vec3 glowCol = mix(u_lit, vec3(1.0, 0.18, 0.10), step(u_redline, u_frac));',
        '',
        '  vec3 outCol = col * alpha + rimCol * rim * 0.55',
        '              + glowCol * (litGlow * 0.22 + edge * 0.30);',
        '  float outA = clamp(alpha + rim * 0.55 + litGlow * 0.14 + edge * 0.24, 0.0, 1.0);',
        '  gl_FragColor = vec4(outA > 0.0 ? outCol / outA : vec3(0.0), outA);',
        '}'
    ].join('\n');

    /* --------------------------------------------------------- tach rail */
    /* The bright hairline that runs outside the blocks. */
    var rail = [
        'uniform vec2 u_centre;',
        'uniform vec2 u_r;',
        'uniform float u_k;',
        'uniform float u_half;',
        'uniform float u_frac;',
        'uniform float u_redline;',
        'uniform vec3 u_lit;',
        'uniform vec4 u_remapP;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  float u = abs(p.x) / u_r.x, v = abs(p.y) / u_r.y;',
        '  float un = sePow(u, u_k), vn = sePow(v, u_k);',
        '  float S = un + vn;',
        '  vec2 gr = vec2(un / max(u, 0.0001) * sgn(p.x) / u_r.x,',
        '                 vn / max(v, 0.0001) * sgn(p.y) / u_r.y);',
        '  float gl = max(length(gr), 0.000001);',
        '  float ed = (S - 1.0) / (u_k * gl);',
        '  vec2 foot = p - ed * (gr / gl);',
        '  float m = atan(foot.x, -foot.y) / u_half;',
        '  float t = (remapOdd(u_remapP, m) + 1.0) * 0.5;',
        '  float onArc = step(0.0, t) * step(t, 1.0) * step(abs(m), 1.0);',
        '',
        '  float line = cov(abs(ed - 9.0) - 1.3) * onArc;',
        '  float lit = step(t, u_frac);',
        '  vec3 col = mix(vec3(0.44, 0.50, 0.58),',
        '                 mix(u_lit, vec3(1.0, 0.20, 0.12), step(u_redline, t)), lit);',
        '  float glow = exp(-abs(ed - 9.0) / 13.0) * onArc * lit * 0.30;',
        '  float alpha = clamp(line + glow, 0.0, 1.0);',
        '  gl_FragColor = vec4(alpha > 0.0 ? (col * line + col * glow) / alpha : vec3(0.0), alpha);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------- bezel */
    /*
     * The stepped inner bezel: a hairline that follows the inside of the
     * blocks and notches inward around every numeral, so each one sits in
     * its own pocket. It is the detail that makes the dial look machined
     * rather than drawn, and the reference clusters all have it.
     */
    var bezel = [
        'uniform vec2 u_centre;',
        'uniform vec2 u_r;',
        'uniform float u_k;',
        'uniform float u_half;',
        'uniform float u_steps;',
        'uniform float u_inset;',
        'uniform float u_notch;',
        'uniform vec3 u_col;',
        'uniform vec4 u_remapP;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  float u = abs(p.x) / u_r.x, v = abs(p.y) / u_r.y;',
        '  float un = sePow(u, u_k), vn = sePow(v, u_k);',
        '  float S = un + vn;',
        '  vec2 gr = vec2(un / max(u, 0.0001) * sgn(p.x) / u_r.x,',
        '                 vn / max(v, 0.0001) * sgn(p.y) / u_r.y);',
        '  float gl = max(length(gr), 0.000001);',
        '  float ed = (S - 1.0) / (u_k * gl);',
        '  vec2 foot = p - ed * (gr / gl);',
        '  float m = atan(foot.x, -foot.y) / u_half;',
        '  float t = (remapOdd(u_remapP, m) + 1.0) * 0.5;',
        '  float onArc = step(0.0, t) * step(t, 1.0) * step(abs(m), 1.0);',
        '',
        '  float d2n = abs(fract(t * u_steps + 0.5) - 0.5);',
        '  float near = 1.0 - smoothstep(0.26, 0.34, d2n);',
        '  float line = -u_inset - u_notch * near;',
        '  gl_FragColor = vec4(u_col, cov(abs(ed - line) - 1.1) * onArc * 0.9);',
        '}'
    ].join('\n');

    /* ---------------------------------------------------------- shiftbar */
    /*
     * GT3 shift lights: a strip of LEDs that fills green, then amber, then
     * red as the engine approaches the limiter, and strobes once there.
     */
    var shiftbar = [
        'uniform float u_frac;',
        'uniform float u_strobe;',
        'uniform float u_leds;',
        'uniform vec3 u_c1;',
        'uniform vec3 u_c2;',
        'uniform vec3 u_c3;',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  float n = u_leds;',
        '  float pitch = u_size.x / n;',
        '  float i = floor(p.x / pitch);',
        '  float cx = (i + 0.5) * pitch;',
        '  vec2 q = p - vec2(cx, u_size.y * 0.5);',
        '',
        '  float w = pitch * 0.30;',
        '  float h = u_size.y * 0.40;',
        '  q.x -= q.y * 0.18;',
        '  float d = sdRound(q, vec2(w, h), w * 0.45);',
        '  float body = cov(d);',
        '',
        '  float lit = step((i + 0.5) / n, u_frac);',
        '  vec3 stage = i < n * 0.4 ? u_c1 : (i < n * 0.73 ? u_c2 : u_c3);',
        '  float strobe = u_strobe * step(0.5, fract(u_time * 9.0));',
        '  stage = mix(stage, vec3(1.0), strobe * 0.85);',
        '  lit = max(lit, u_strobe * strobe);',
        '',
        '  vec3 off = vec3(0.070, 0.086, 0.105);',
        '  vec3 col = mix(off, stage, lit);',
        '  float glow = exp(-max(d, 0.0) / 7.0) * lit * 0.55;',
        '  float alpha = clamp(body + glow, 0.0, 1.0);',
        '  vec3 outc = col * body + stage * glow;',
        '  gl_FragColor = vec4(alpha > 0.0 ? outc / alpha : vec3(0.0), alpha);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------- flash */
    /* The rev-limit warning. Edges only: the middle of the cluster stays
       readable, which is the whole point of a shift light. */
    var flash = [
        'uniform float u_on;',
        'uniform float u_rate;',
        'uniform vec3 u_col;',
        'uniform float u_strength;',
        'void main() {',
        '  vec2 p = px() / u_size;',
        '  float edge = pow(1.0 - 4.0 * p.x * (1.0 - p.x), 3.0);',
        '  edge = max(edge, pow(1.0 - 4.0 * p.y * (1.0 - p.y), 3.0));',
        '  float beat = step(0.5, fract(u_time * u_rate));',
        '  float a = u_on * beat * edge * u_strength;',
        '  gl_FragColor = vec4(mix(u_col, vec3(1.0), 0.25), a);',
        '}'
    ].join('\n');

    return { bg: bg, tach: tach, rail: rail, bezel: bezel,
             shiftbar: shiftbar, flash: flash };
}));
