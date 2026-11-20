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
     * The sweep is a wide, shallow ellipse - about twice as wide as it is
     * tall, ending where its tangent turns vertical. That proportion is what
     * makes the dial read as a Lamborghini arch rather than a squashed
     * circle, and it is what the reference clusters do.
     *
     * Ticks are solved in real pixels, not in the ellipse's parameter space:
     * for a pixel we find the one tick it could belong to, then measure
     * against that tick's own centre, tangent and normal. Shapes stay square
     * everywhere on the sweep while the spacing tightens towards the ends.
     * Each is a milled block, dark at the rim and bright at its inner end,
     * with a lit edge - the look of the machined dial it copies.
     */
    var tach = [
        'uniform vec2 u_centre;',
        'uniform vec2 u_r;',         /* rx, ry */
        'uniform float u_half;',     /* half sweep, radians */
        'uniform float u_segs;',
        'uniform float u_major;',
        'uniform vec2 u_depth;',     /* minor, major tick depth in px */
        'uniform float u_frac;',
        'uniform float u_redline;',
        'uniform float u_warn;',
        'uniform vec3 u_lit;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  vec2 pn = p / u_r;',
        '  float rn = length(pn);',
        '  float a = atan(pn.x, -pn.y);',
        '  float t = (a + u_half) / (2.0 * u_half);',
        '  float onArc = step(0.0, t) * step(t, 1.0);',
        '',
        /* Signed distance to the ellipse itself, first order. */
        '  vec2 grad = vec2(p.x / (u_r.x * u_r.x), p.y / (u_r.y * u_r.y)) / max(rn, 0.0001);',
        '  float ed = (rn - 1.0) / max(length(grad), 0.00001);',
        '',
        /* The one tick this pixel can belong to. */
        '  float ft = t * u_segs;',
        '  float seg = clamp(floor(ft), 0.0, u_segs - 1.0);',
        '  float tc = (seg + 0.5) / u_segs;',
        '  float ac = -u_half + tc * 2.0 * u_half;',
        '  vec2 c = vec2(u_r.x * sin(ac), -u_r.y * cos(ac));',
        '  vec2 nrm = normalize(vec2(sin(ac) / u_r.x, -cos(ac) / u_r.y));',
        '  vec2 tg = vec2(-nrm.y, nrm.x);',
        '  vec2 d = p - c;',
        '  float along = dot(d, tg);',
        '  float radial = dot(d, nrm);',
        '',
        /* Tick width follows the local spacing so the gaps stay even. */
        '  float speed = length(vec2(u_r.x * cos(ac), u_r.y * sin(ac)));',
        '  float pitchPx = speed * (2.0 * u_half / u_segs);',
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
        '',
        /* The lit edge around each block. */
        '  float rim = cov(abs(dist + 1.3) - 1.3) * onArc;',
        '  vec3 rimCol = mix(vec3(0.52, 0.58, 0.67), hot * 1.25, past);',
        '',
        /* Bloom behind the lit run, and a brighter leading edge. */
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
        'uniform float u_half;',
        'uniform float u_frac;',
        'uniform float u_redline;',
        'uniform vec3 u_lit;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  vec2 pn = p / u_r;',
        '  float rn = length(pn);',
        '  float a = atan(pn.x, -pn.y);',
        '  float t = (a + u_half) / (2.0 * u_half);',
        '  float onArc = step(0.0, t) * step(t, 1.0);',
        '  vec2 grad = vec2(p.x / (u_r.x * u_r.x), p.y / (u_r.y * u_r.y)) / max(rn, 0.0001);',
        '  float ed = (rn - 1.0) / max(length(grad), 0.00001);',
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
        'uniform float u_half;',
        'uniform float u_steps;',    /* numeral intervals across the sweep */
        'uniform float u_inset;',    /* how far inside the ellipse the line runs */
        'uniform float u_notch;',    /* extra inset around each numeral */
        'uniform vec3 u_col;',
        '',
        'void main() {',
        '  vec2 p = px() - u_centre;',
        '  vec2 pn = p / u_r;',
        '  float rn = length(pn);',
        '  float a = atan(pn.x, -pn.y);',
        '  float t = (a + u_half) / (2.0 * u_half);',
        '  float onArc = step(0.0, t) * step(t, 1.0);',
        '  vec2 grad = vec2(p.x / (u_r.x * u_r.x), p.y / (u_r.y * u_r.y)) / max(rn, 0.0001);',
        '  float ed = (rn - 1.0) / max(length(grad), 0.00001);',
        '',
        /* Distance to the nearest numeral, in numeral steps. */
        '  float ft = t * u_steps;',
        '  float d2n = abs(fract(ft + 0.5) - 0.5);',
        /* A short chamfer rather than a square step, as on the car. */
        '  float near = 1.0 - smoothstep(0.26, 0.34, d2n);',
        '  float line = -u_inset - u_notch * near;',
        '',
        '  float a1 = cov(abs(ed - line) - 1.1) * onArc;',
        '  gl_FragColor = vec4(u_col, a1 * 0.9);',
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
