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
    var bg = [
        'uniform vec3 u_tint;',
        'uniform float u_hex;',
        '',
        'float hexEdge(vec2 p, float s) {',
        '  vec2 hs = vec2(1.7320508, 1.0) * s;',
        '  vec2 a = mod(p, hs) - hs * 0.5;',
        '  vec2 b = mod(p - hs * 0.5, hs) - hs * 0.5;',
        '  vec2 g = dot(a, a) < dot(b, b) ? a : b;',
        '  return abs(sdHex(g, s * 0.52));',
        '}',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 c = p - vec2(u_size.x * 0.5, u_size.y * 0.74);',
        '  float r = length(c / vec2(u_size.x * 0.52, u_size.y * 0.80));',
        '',
        /* Deep base with a cool lift towards the middle. */
        '  vec3 col = vec3(0.012, 0.018, 0.026);',
        '  col += u_tint * 0.085 * exp(-r * r * 1.9);',
        '  col += vec3(0.016, 0.022, 0.032) * (1.0 - clamp(p.y / u_size.y, 0.0, 1.0));',
        '',
        /* Honeycomb, the Lamborghini signature, held right at the edge of sight. */
        '  float e = hexEdge(p - vec2(0.0, 12.0), 34.0);',
        '  float mesh = cov(e - 0.9) * (1.0 - cov(e - 0.1));',
        '  col += vec3(0.055, 0.075, 0.100) * mesh * u_hex * (0.35 + 0.65 * exp(-r * r * 1.3));',
        '',
        /* A brushed sheen across the upper half. */
        '  float sheen = exp(-pow((p.y - u_size.y * 0.10) / (u_size.y * 0.42), 2.0));',
        '  col += vec3(0.010, 0.014, 0.020) * sheen;',
        '',
        /* Vignette, and the cut glass corners the cluster never shows. */
        '  col *= 1.0 - 0.55 * smoothstep(0.72, 1.35, r);',
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((u_size.x - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    /* -------------------------------------------------------------- tach */
    /*
     * The rev band. The cluster is twice as wide as it is tall, so the band
     * is an ellipse, not a circle - that flat, wide sweep is what makes a
     * Lamborghini cluster read the way it does.
     *
     * Ticks are solved in real pixels, not in the ellipse's parameter space:
     * for a pixel we find the one tick it could belong to, then measure
     * against that tick's own centre, tangent and normal. Shapes stay square
     * everywhere on the sweep while the spacing tightens towards the ends,
     * exactly as on the car it is drawn after.
     */
    var tach = [
        'uniform vec2 u_centre;',
        'uniform vec2 u_r;',         /* rx, ry */
        'uniform float u_half;',     /* half sweep, radians */
        'uniform float u_segs;',
        'uniform float u_major;',
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
        '  float depth = mix(30.0, 48.0, isMajor);',
        '  float halfW = pitchPx * mix(0.30, 0.37, isMajor);',
        '  vec2 q = vec2(along, radial + depth * 0.5);',
        '  float dist = sdRound(q, vec2(halfW, depth * 0.5), 2.5);',
        '  float body = cov(dist) * onArc;',
        '',
        '  float past = step(tc, u_frac);',
        '  float red = step(u_redline, tc);',
        '',
        '  vec3 dark = mix(vec3(0.105, 0.130, 0.158), vec3(0.235, 0.064, 0.052), red);',
        '  vec3 hot = mix(u_lit, vec3(1.0, 0.145, 0.095), red);',
        '  float lift = clamp(-radial / max(depth, 1.0), 0.0, 1.0);',
        '  dark *= 1.18 - 0.42 * lift;',
        '  hot *= 1.06 - 0.22 * lift;',
        '',
        '  float flash = u_warn * (0.5 + 0.5 * sin(u_time * 37.0));',
        '  hot = mix(hot, vec3(1.0), flash * 0.75);',
        '',
        '  vec3 col = mix(dark, hot, past);',
        '  float alpha = body * mix(0.94, 1.0, past);',
        '',
        /* Bloom behind the lit run, and a brighter leading edge. */
        /* The glow band must not depend on the tick depth, or it steps at
           every major mark and leaves a straight seam across the sweep. */
        '  float band = cov(abs(ed + 24.0) - 37.0) * onArc;',
        '  float litGlow = band * step(t, u_frac) * (0.13 + 0.38 * flash);',
        '  float edge = exp(-pow((t - u_frac) * u_segs * 2.2, 2.0)) * band;',
        '  vec3 glowCol = mix(u_lit, vec3(1.0, 0.18, 0.10), step(u_redline, u_frac));',
        '',
        '  vec3 outCol = col * alpha + glowCol * (litGlow * 0.40 + edge * 0.55);',
        '  float outA = clamp(alpha + litGlow * 0.26 + edge * 0.44, 0.0, 1.0);',
        '  gl_FragColor = vec4(outA > 0.0 ? outCol / outA : vec3(0.0), outA);',
        '}'
    ].join('\n');

    /* --------------------------------------------------------- tach rail */
    /* A hairline just outside the ticks that brightens with the revs. */
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
        '  float line = cov(abs(ed - 11.0) - 1.1) * onArc;',
        '  float lit = step(t, u_frac);',
        '  vec3 col = mix(vec3(0.15, 0.19, 0.24),',
        '                 mix(u_lit, vec3(1.0, 0.20, 0.12), step(u_redline, t)), lit);',
        '  float glow = exp(-abs(ed - 11.0) / 14.0) * onArc * lit * 0.34;',
        '  float alpha = clamp(line + glow, 0.0, 1.0);',
        '  gl_FragColor = vec4(alpha > 0.0 ? (col * line + col * glow) / alpha : vec3(0.0), alpha);',
        '}'
    ].join('\n');

    /* ---------------------------------------------------------- shiftbar */
    /*
     * GT3 shift lights: a strip of LEDs that fills green, then amber, then
     * red as the engine approaches the limiter, and strobes once there.
     */
    var shiftbar = [
        'uniform float u_frac;',    /* 0..1 across the shift window */
        'uniform float u_strobe;',  /* 0..1, limiter */
        'uniform float u_leds;',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  float n = u_leds;',
        '  float pitch = u_size.x / n;',
        '  float i = floor(p.x / pitch);',
        '  float cx = (i + 0.5) * pitch;',
        '  vec2 q = p - vec2(cx, u_size.y * 0.5);',
        '',
        /* Slightly tapered bars, leaning like a Lamborghini tick. */
        '  float w = pitch * 0.30;',
        '  float h = u_size.y * 0.40;',
        '  q.x -= q.y * 0.18;',
        '  float d = sdRound(q, vec2(w, h), w * 0.45);',
        '  float body = cov(d);',
        '',
        '  float lit = step((i + 0.5) / n, u_frac);',
        /* Three stages across the strip. */
        '  vec3 stage = i < n * 0.4 ? vec3(0.13, 0.85, 0.42)',
        '             : (i < n * 0.73 ? vec3(1.0, 0.72, 0.06) : vec3(1.0, 0.13, 0.07));',
        '  float strobe = u_strobe * step(0.5, fract(u_time * 9.0));',
        '  stage = mix(stage, vec3(1.0), strobe * 0.85);',
        '  lit = max(lit, u_strobe * strobe);',
        '',
        '  vec3 off = vec3(0.055, 0.070, 0.088);',
        '  vec3 col = mix(off, stage, lit);',
        '  float glow = exp(-max(d, 0.0) / 7.0) * lit * 0.55;',
        '  float alpha = clamp(body + glow, 0.0, 1.0);',
        '  vec3 outc = col * body + stage * glow;',
        '  gl_FragColor = vec4(alpha > 0.0 ? outc / alpha : vec3(0.0), alpha);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------- flash */
    /* The full-screen warning at the limiter. Edges only: the middle stays
       readable, which is the point of a shift light. */
    var flash = [
        'uniform float u_on;',
        'void main() {',
        '  vec2 p = px() / u_size;',
        '  float edge = pow(1.0 - 4.0 * p.x * (1.0 - p.x), 2.2);',
        '  edge = max(edge, pow(1.0 - 4.0 * p.y * (1.0 - p.y), 2.2));',
        '  float beat = step(0.5, fract(u_time * 9.0));',
        '  float a = u_on * beat * edge * 0.62;',
        '  gl_FragColor = vec4(mix(vec3(1.0, 0.10, 0.06), vec3(1.0), 0.25), a);',
        '}'
    ].join('\n');

    return { bg: bg, tach: tach, rail: rail, shiftbar: shiftbar, flash: flash };
}));
