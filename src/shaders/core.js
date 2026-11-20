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
     * A near-black base, a subtle dark blue gradient, and a gentle lift
     * under the middle - no more (brief section 6). Behind the gear sit a
     * few faint angular facets with long diagonals, sparse enough to vanish
     * at normal viewing distance; the brief is explicit that this is not a
     * full-screen hexagonal grid.
     *
     * The honeycomb is kept behind u_hex because it was asked for earlier
     * and suits the Aventador-style references, but it is off by default:
     * the Huracan's field reads as fine stipple in the annulus instead.
     */
    var bg = [
        'uniform vec3 u_black;',
        'uniform vec3 u_blue;',
        'uniform vec3 u_lower;',
        'uniform vec3 u_line;',
        'uniform float u_hex;',
        'uniform float u_hexSize;',
        'uniform float u_facets;',
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
        '  vec2 n = p / u_size;',
        '  vec3 col = u_black;',
        '',
        /* Blue through the upper and middle field. */
        '  col = mix(col, u_blue, 0.55 * exp(-pow((n.y - 0.34) / 0.46, 2.0)));',
        /* A restrained lift under the middle, not a grey panel. */
        '  float lift = exp(-pow((n.x - 0.5) / 0.34, 2.0)) * exp(-pow((n.y - 0.86) / 0.26, 2.0));',
        '  col = mix(col, u_lower, 0.34 * lift);',
        '',
        /* A few long asymmetric facets behind the centre. */
        '  vec2 q = p - vec2(u_size.x * 0.48, u_size.y * 0.52);',
        '  float f = 1e9;',
        '  f = min(f, abs(dot(q, normalize(vec2(0.92, -0.39))) - 40.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(0.74, 0.67))) + 120.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(-0.55, 0.84))) - 210.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(0.33, 0.94))) + 265.0));',
        '  float facet = cov(f - 0.7) * exp(-dot(q, q) / 150000.0);',
          /* 3-7% opacity: present under inspection, gone at a glance. */
        '  col += u_line * facet * u_facets * 0.055;',
        '',
        /* Optional honeycomb, off by default. */
        '  float hd = hexDist(p - vec2(0.0, 10.0), u_hexSize);',
        '  float fill = cov(hd + 3.0), rim = cov(abs(hd + 3.0) - 1.3);',
        '  float near = 0.42 + 0.58 * exp(-pow((n.x - 0.5) / 0.55, 2.0));',
        '  col += (vec3(0.030, 0.038, 0.049) * fill + vec3(0.085, 0.102, 0.125) * rim)',
        '       * u_hex * near;',
        '',
        /* The glass is cut on a diagonal at the top corners: a hard edge. */
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((u_size.x - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '',
        '  gl_FragColor = vec4(col, 1.0);',
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

    return { bg: bg, shiftbar: shiftbar, flash: flash };
}));
