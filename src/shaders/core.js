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
     * Two looks, chosen by the `background` setting.
     *
     * genuine - the Huracan's own field: a near-black base, a subtle dark
     *   blue gradient and a gentle lift under the middle, with a few faint
     *   angular facets behind the gear (brief section 6-7).
     *
     * modern - the Lamborghini showroom honeycomb: each cell a slightly
     *   raised plate, lit from the upper left so its near edges catch the
     *   light and its far edges fall into shadow, with a soft sheen across
     *   its face. A sparse, fixed handful of cells glow in the accent
     *   colour. Light and opaque, never loud enough to compete with the
     *   dial: it sits under everything at a few percent.
     *
     * All of it is deterministic, so identical frames are identical.
     */
    var bg = [
        'uniform vec3 u_black;',
        'uniform vec3 u_blue;',
        'uniform vec3 u_lower;',
        'uniform vec3 u_line;',
        'uniform vec3 u_accent;',
        'uniform float u_hex;',
        'uniform float u_hexSize;',
        'uniform float u_facets;',
        'uniform float u_rev;',
        'uniform vec4 u_hole;',          /* x, y, w, h of the map opening */
        'uniform vec3 u_holeOpen;',      /* open 0..1, feather px, corner cut px */
        '',
        /* Which cell p falls in: xy local offset from its centre, zw cell id. */
        'vec4 hexCell(vec2 p, float s) {',
        '  vec2 hs = vec2(1.7320508, 1.0) * s;',
        '  vec2 a = mod(p, hs) - hs * 0.5;',
        '  vec2 b = mod(p - hs * 0.5, hs) - hs * 0.5;',
        '  vec2 ia = floor(p / hs);',
        '  vec2 ib = floor((p - hs * 0.5) / hs) + 0.5;',
        '  return dot(a, a) < dot(b, b) ? vec4(a, ia) : vec4(b, ib);',
        '}',
        'float hash21(vec2 id) {',
        '  return fract(sin(dot(id, vec2(127.1, 311.7))) * 43758.5453);',
        '}',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 n = p / u_size;',
        '  vec3 col = u_black;',
        '',
        /* Blue through the upper and middle field, a restrained lift below. */
        '  col = mix(col, u_blue, 0.55 * exp(-pow((n.y - 0.34) / 0.46, 2.0)));',
        '  float lift = exp(-pow((n.x - 0.5) / 0.34, 2.0)) * exp(-pow((n.y - 0.86) / 0.26, 2.0));',
        '  col = mix(col, u_lower, 0.34 * lift);',
        '',
        /* genuine: a few long asymmetric facets, 3-7% opacity */
        '  vec2 q = p - vec2(u_size.x * 0.48, u_size.y * 0.52);',
        '  float f = 1e9;',
        '  f = min(f, abs(dot(q, normalize(vec2(0.92, -0.39))) - 40.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(0.74, 0.67))) + 120.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(-0.55, 0.84))) - 210.0));',
        '  f = min(f, abs(dot(q, normalize(vec2(0.33, 0.94))) + 265.0));',
        '  float facet = cov(f - 0.7) * exp(-dot(q, q) / 150000.0);',
        '  col += u_line * facet * u_facets * 0.055;',
        '',
        /* modern: the Lamborghini side lattice - thin silver hexagon lines,
           pointy-top, on the left and right only, lit nodes at the joints,
           faint faceted glass inside each cell; the centre stays black. */
        '  if (u_hex > 0.001) {',
        /* both sides, fading in from the centre and out towards the far edge */
        '    float side = abs(n.x - 0.5);',
        '    float mask = smoothstep(0.19, 0.34, side) * (1.0 - 0.35 * smoothstep(0.42, 0.50, side));',
        '    mask *= 1.0 - 0.62 * smoothstep(0.50, 0.66, n.y);',   /* quiet behind the pods */
        /* mirror so both sides share one lattice, anchored at the screen edge */
        '    vec2 m = vec2(side * u_size.x, p.y);',
        '    float s = u_hexSize;',                     /* flat-to-flat width */
        '    float R = s * 0.57735;',                   /* centre to corner */
        /* hexCell tiles flat-top cells; work in swapped axes to get pointy-top */
        '    vec4 hc = hexCell(m.yx + vec2(R * 0.5, 0.0), s);',
        '    vec2 g = hc.xy;',
        '    vec2 a = abs(g);',
        '    float hd = max(a.y, dot(a, vec2(0.8660254, 0.5)));',
        '    float edge = s * 0.5 - hd;',               /* px to the nearest line */
        '    float line = cov(edge - 0.6) * 0.9 + exp(-edge / 2.2) * 0.25;',
        /* nodes: the two corners of this quadrant, then pick some to light */
        '    vec2 c1 = vec2(R, 0.0), c2 = vec2(R * 0.5, s * 0.5);',
        '    float d1 = length(a - c1), d2 = length(a - c2);',
        '    vec2 corner = (d1 < d2 ? c1 : c2) * sign(g + vec2(1e-4));',
        '    float dn = min(d1, d2);',
        '    vec2 world = (m.yx + vec2(R * 0.5, 0.0)) - g + corner;',
        '    float on = step(0.68, hash21(floor(world / (R * 0.5) + 0.5)));',
        '    float ring = cov(abs(dn - 9.0) - 0.9) * 0.80;',
        '    float core = cov(dn - 3.4) * 0.95 + cov(dn - 8.2) * 0.20;',
        '    float halo = exp(-dn / 12.0) * 0.32;',
        '    float node = on * max(max(ring, core), halo) * (1.0 - smoothstep(0.52, 0.60, n.y));',
        /* faceted glass: six triangles per cell, each catching the light differently */
        '    float ang = atan(g.x, g.y);',
        '    float sector = floor((ang + 3.14159265) / 1.0471976);',
        '    float shade = 0.5 + 0.5 * sin(sector * 2.3 + hash21(hc.zw) * 6.2831);',
        '    float glass = 0.010 + 0.055 * shade * shade;',
        '    vec3 silver = vec3(0.78, 0.80, 0.84);',
        '    col = mix(col, vec3(0.0), 0.6 * mask * u_hex);',   /* black behind the lattice */
        '    col += vec3(glass) * mask * u_hex;',
        '    col += silver * line * (0.30 + 0.25 * exp(-dn / 40.0)) * mask * u_hex;',
        '    col += mix(silver, vec3(1.0), 0.5) * node * 0.85 * mask * u_hex;',
        '  }',
        '',
        /* revuelto: the Y light signature, nested three deep on each side with
           the stem pointing at the dial, faceted planes between the arms and
           the accent burning at the junction. Mirrored; the centre stays clear. */
        '  if (u_rev > 0.001) {',
        '    vec2 q = vec2(abs(p.x - u_size.x * 0.5), p.y);',
        '    col = mix(col, vec3(0.006, 0.008, 0.011), 0.55 * u_rev);',
        '    float lines = 0.0, glow = 0.0, plane = 0.0;',
        '    for (int i = 0; i < 3; i++) {',
        '      float k = float(i);',
        '      vec2 J = vec2(760.0 + k * 46.0, 300.0);',            /* the junction */
        '      vec2 S = J - vec2(150.0 - k * 20.0, 0.0);',          /* the stem, inward */
        '      vec2 A = J + vec2(330.0, -235.0);',                  /* upper arm, outward */
        '      vec2 Bm = J + vec2(330.0, 235.0);',                  /* lower arm */
        '      float d = min(sdSegment(q, S, J, 0.0), min(sdSegment(q, J, A, 0.0), sdSegment(q, J, Bm, 0.0)));',
        '      float w = 1.0 - k * 0.30;',
        '      lines += (cov(d - (1.3 - k * 0.3)) + exp(-d / 3.0) * 0.30) * w;',
        '      glow += exp(-length(q - J) / (26.0 + k * 10.0)) * w;',
        '    }',
        /* two planes either side of the arms: lighter above, darker below */
        '    vec2 r = q - vec2(760.0, 300.0);',
        '    float upper = step(0.0, r.x) * step(r.y, 0.0) * step(-r.y, r.x * 0.712);',
        '    float lower = step(0.0, r.x) * step(0.0, r.y) * step(r.y, r.x * 0.712);',
        '    float fade = exp(-max(r.x, 0.0) / 520.0);',
        '    plane = (upper * 0.040 + lower * 0.016) * fade;',
        /* a long diagonal sweep behind it, the car's side intake line */
        '    float sweep = cov(abs(dot(q - vec2(700.0, 560.0), normalize(vec2(0.34, 0.94)))) - 0.6) * smoothstep(640.0, 900.0, q.x) * 0.5;',
        '    vec3 silver = vec3(0.70, 0.73, 0.78);',
        '    float vis = smoothstep(600.0, 700.0, q.x) * (1.0 - 0.55 * smoothstep(0.55, 0.75, n.y));',
        '    col += vec3(plane) * u_rev;',
        '    col += silver * (lines * 0.38 + sweep * 0.22) * vis * u_rev;',
        '    col += u_accent * glow * 0.55 * vis * u_rev;',
        '  }',
        '',
        /* The glass is cut on a diagonal at the top corners: a hard edge. */
        '  float cl = (p.x * 190.0 + p.y * 325.0) - 325.0 * 190.0;',
        '  float cr = ((u_size.x - p.x) * 200.0 + p.y * 270.0) - 270.0 * 200.0;',
        '  col *= clamp(cl * 0.06, 0.0, 1.0) * clamp(cr * 0.06, 0.0, 1.0);',
        '',
        /*
         * The map opening. Waze draws under this layer; the background
         * fades away over the feather so the map appears out of the dark
         * rather than behind a cut-out.
         */
        '  float a = 1.0;',
        '  if (u_holeOpen.x > 0.001) {',
        '    vec2 hc = u_hole.xy + u_hole.zw * 0.5;',
        '    vec2 hh = u_hole.zw * 0.5;',
        '    vec2 hq = abs(p - hc);',
        /* a long hexagon: the rectangle with its ends cut away at 45 degrees */
        '    float box = max(hq.x - hh.x, hq.y - hh.y);',
        '    float cut = (hq.x + hq.y - (hh.x + hh.y - u_holeOpen.z)) * 0.70710678;',
        '    float d = max(box, cut);',
        /* a long, soft fade rather than an edge: the map comes out of the dark */
        '    float t = smoothstep(-u_holeOpen.y, 0.0, d);',
        '    a = 1.0 - u_holeOpen.x * (1.0 - t * t * (3.0 - 2.0 * t));',
        '  }',
        '  gl_FragColor = vec4(max(col, vec3(0.0)) * a, a);',
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
    /*
     * The rev-limit warning. u_style picks how far it reaches:
     *   0 edges   a border round the screen
     *   1 wide    the border, pulled well in towards the middle
     *   2 full    the whole screen, the middle a little weaker
     *   3 top     a band across the top only
     * u_spread stretches whichever shape is chosen (0.2 tight .. 1 broad).
     */
    var flash = [
        'uniform float u_on;',
        'uniform float u_rate;',
        'uniform vec3 u_col;',
        'uniform float u_strength;',
        'uniform float u_style;',
        'uniform float u_spread;',
        'void main() {',
        '  vec2 p = px() / u_size;',
        '  float k = mix(5.0, 0.9, clamp(u_spread, 0.0, 1.0));',
        '  float ex = pow(1.0 - 4.0 * p.x * (1.0 - p.x), k);',
        '  float ey = pow(1.0 - 4.0 * p.y * (1.0 - p.y), k);',
        '  float shape = max(ex, ey);',
        '  if (u_style > 2.5) shape = pow(1.0 - p.y, k * 0.5);',
        '  else if (u_style > 1.5) shape = 0.55 + 0.45 * max(ex, ey);',
        '  float beat = step(0.5, fract(u_time * u_rate));',
        '  float a = u_on * beat * shape * u_strength;',
        '  gl_FragColor = vec4(mix(u_col, vec3(1.0), 0.25), clamp(a, 0.0, 1.0));',
        '}'
    ].join('\n');

    return { bg: bg, shiftbar: shiftbar, flash: flash };
}));
