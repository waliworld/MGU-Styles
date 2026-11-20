(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUShadersParts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* -------------------------------------------------------------- text */
    /*
     * Draws up to 12 glyphs from the baked SDF atlas. No loop ever breaks
     * (section 4): every glyph is sampled and masked arithmetically.
     */
    var text = [
        'uniform vec4 u_g[12];',     /* atlas uv rect per glyph */
        'uniform vec4 u_quad[12];',     /* layer-space rect per glyph */
        'uniform float u_count;',
        'uniform float u_sharp;',
        'uniform vec4 u_color;',
        'uniform vec3 u_glowCol;',
        'uniform float u_glow;',
        'uniform float u_outline;',  /* px; > 0 draws a hollow numeral */
        'uniform vec3 u_outCol;',
        '',
        'void main() {',
        '  vec2 p = px();',
        '  float cover = 0.0;',
        '  float ring = 0.0;',
        '  float halo = 0.0;',
        '  for (int i = 0; i < 12; i++) {',
        '    float on = step(float(i) + 0.5, u_count);',
        '    vec4 r = u_quad[i];',
        '    vec2 q = (p - r.xy) / max(r.zw, vec2(1.0));',
        '    float inR = on * step(0.0, q.x) * step(q.x, 1.0)',
        '              * step(0.0, q.y) * step(q.y, 1.0);',
        '    vec4 g = u_g[i];',
        '    vec2 uv = g.xy + clamp(q, 0.0, 1.0) * g.zw;',
        '    float raw = texture2D(u_atlas, uv).r;',
        '    float d = (raw - 0.5) * u_sharp;',
        /* Normalised distance: -1 at the edge of the baked field, so the
           glow dies exactly where the glyph cell ends and never draws a box. */
        '    float dn = (raw - 0.5) * 2.0;',
        '    cover = max(cover, clamp(d + 0.5, 0.0, 1.0) * inR);',
        '    ring  = max(ring,  clamp(d + 0.5 + u_outline, 0.0, 1.0) * inR);',
        '    halo  = max(halo,  smoothstep(-1.0, -0.06, dn) * inR);',
        '  }',
        '',
        /* Hollow mode keeps the stroke and drops the middle. */
        '  float stroke = max(ring - cover, 0.0);',
        '  float fill = mix(cover, 0.0, step(0.5, u_outline));',
        '  float edge = mix(0.0, stroke, step(0.5, u_outline));',
        '',
        /* The glow sits outside the drawn shape, never inside a hollow one. */
        '  float aura = halo * (1.0 - ring) * u_glow * 0.5;',
        '  float a = clamp(fill * u_color.a + edge + aura, 0.0, 1.0);',
        '  vec3 c = u_color.rgb * fill * u_color.a',
        '         + u_outCol * edge',
        '         + u_glowCol * aura;',
        '  gl_FragColor = vec4(a > 0.0 ? c / a : vec3(0.0), a);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------- plate */
    /* A rounded pod: faint fill, hairline edge, light caught on the top. */
    var plate = [
        'uniform float u_radius;',
        'uniform vec4 u_fill;',
        'uniform vec4 u_line;',
        'uniform float u_lineW;',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 h = u_size * 0.5;',
        '  float d = sdRound(p - h, h - 1.0, u_radius);',
        '  float inside = cov(d);',
        '  float edge = cov(abs(d + u_lineW * 0.5) - u_lineW * 0.5);',
        '  float top = 1.0 - clamp(p.y / max(u_size.y, 1.0), 0.0, 1.0);',
        '  vec4 f = u_fill;',
        '  f.rgb *= 0.85 + 0.45 * top;',
        '  float a = clamp(inside * f.a + edge * u_line.a, 0.0, 1.0);',
        '  vec3 c = f.rgb * inside * f.a + u_line.rgb * edge * u_line.a;',
        '  gl_FragColor = vec4(a > 0.0 ? c / a : vec3(0.0), a);',
        '}'
    ].join('\n');

    /* -------------------------------------------------------------- vbar */
    /*
     * A vertical column of leaning segments, as on the Huracan's side pods:
     * fills from the bottom, segments past the warning point burning red.
     */
    var vbar = [
        'uniform float u_frac;',
        'uniform float u_warn;',
        'uniform float u_segs;',
        'uniform vec3 u_col;',
        'uniform float u_alarm;',
        'void main() {',
        '  vec2 p = px();',
        '  float n = u_segs;',
        '  float pitch = u_size.y / n;',
        '  float i = floor(p.y / pitch);',
        '  float t = 1.0 - (i + 0.5) / n;',                /* bottom = 0 */
        '  float cy = (i + 0.5) * pitch;',
        '  vec2 q = p - vec2(u_size.x * 0.5, cy);',
        '  q.x -= (cy - u_size.y * 0.5) * 0.10;',          /* the lean */
        '  float d = sdRound(q, vec2(u_size.x * 0.40, pitch * 0.30), pitch * 0.14);',
        '  float body = cov(d);',
        '',
        '  float lit = step(t, u_frac);',
        '  float hot = step(u_warn, t);',
        '  vec3 on = mix(u_col, vec3(1.0, 0.16, 0.10), hot);',
        '  vec3 off = mix(vec3(0.085, 0.105, 0.130), vec3(0.20, 0.065, 0.055), hot);',
        '  float beat = u_alarm * (0.5 + 0.5 * sin(u_time * 14.0));',
        '  on = mix(on, vec3(1.0), beat * 0.6);',
        '  vec3 col = mix(off, on, lit);',
        '  float glow = exp(-max(d, 0.0) / 5.0) * lit * (0.30 + 0.5 * beat);',
        '  float a = clamp(body + glow, 0.0, 1.0);',
        '  gl_FragColor = vec4(a > 0.0 ? (col * body + on * glow) / a : vec3(0.0), a);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------- boost */
    /*
     * Charge pressure. Vacuum runs left of the zero mark in cool blue,
     * positive boost right of it in amber turning red near the ceiling,
     * with a peak-hold tick that decays.
     */
    var boost = [
        'uniform float u_frac;',
        'uniform float u_zero;',
        'uniform float u_peak;',
        'uniform float u_segs;',
        'void main() {',
        '  vec2 p = px();',
        '  float n = u_segs;',
        '  float pitch = u_size.x / n;',
        '  float i = floor(p.x / pitch);',
        '  float t = (i + 0.5) / n;',
        '  float cx = (i + 0.5) * pitch;',
        '  vec2 q = p - vec2(cx, u_size.y * 0.5);',
        '  q.x -= q.y * 0.20;',
        /* Taller towards the top of the scale. */
        '  float h = u_size.y * mix(0.30, 0.46, smoothstep(u_zero, 1.0, t));',
        '  float d = sdRound(q, vec2(pitch * 0.28, h), pitch * 0.12);',
        '  float body = cov(d);',
        '',
        '  float vac = step(t, u_zero);',
        '  float lo = min(u_frac, u_zero), hi = max(u_frac, u_zero);',
        '  float lit = step(lo, t) * step(t, hi);',
        '  float heat = smoothstep(u_zero, 1.0, t);',
        '  vec3 on = mix(vec3(1.0, 0.56, 0.10), vec3(1.0, 0.16, 0.08), heat * heat);',
        '  on = mix(on, vec3(0.30, 0.62, 1.0), vac);',
        '  vec3 off = vec3(0.075, 0.095, 0.120);',
        '  vec3 col = mix(off, on, lit);',
        '',
        /* Zero mark, and the peak-hold tick. */
        '  float zero = cov(abs(p.x - u_zero * u_size.x) - 1.0);',
        '  col = mix(col, vec3(0.62, 0.70, 0.80), zero * (1.0 - lit));',
        '  float pk = cov(abs(p.x - u_peak * u_size.x) - 1.6) * step(u_zero, u_peak);',
        '  float glow = exp(-max(d, 0.0) / 5.5) * lit * 0.34;',
        '  float a = clamp(max(body, zero * 0.75) + glow + pk, 0.0, 1.0);',
        '  vec3 c = col * max(body, zero * 0.75) + on * glow + vec3(1.0) * pk;',
        '  gl_FragColor = vec4(a > 0.0 ? c / a : vec3(0.0), a);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------ gmeter */
    /* Lateral and longitudinal load: rings, a live dot, a decaying peak. */
    var gmeter = [
        'uniform vec2 u_g;',        /* lat, lon in g */
        'uniform vec2 u_peak;',
        'uniform float u_max;',
        'void main() {',
        '  vec2 p = px() - u_size * 0.5;',
        '  float R = min(u_size.x, u_size.y) * 0.5 - 2.0;',
        '  float r = length(p);',
        '  vec3 col = vec3(0.0);',
        '  float a = 0.0;',
        /* Two reference rings and a crosshair. */
        '  float ring1 = cov(abs(r - R) - 1.0);',
        '  float ring2 = cov(abs(r - R * 0.5) - 0.7);',
        '  float cross = max(cov(abs(p.x) - 0.6), cov(abs(p.y) - 0.6)) * step(r, R);',
        '  col += vec3(0.42, 0.49, 0.58) * ring1;',
        '  col += vec3(0.24, 0.29, 0.36) * (ring2 + cross * 0.55);',
        '  a = clamp(ring1 * 0.85 + ring2 * 0.6 + cross * 0.35, 0.0, 1.0);',
        /* Peak, then the live dot. */
        '  vec2 pk = clamp(u_peak / u_max, -1.0, 1.0) * R;',
        '  float pd = cov(sdCircle(p - vec2(pk.x, -pk.y), 3.0));',
        '  col += vec3(0.95, 0.62, 0.20) * pd; a = max(a, pd * 0.8);',
        '  vec2 gp = clamp(u_g / u_max, -1.0, 1.0) * R;',
        '  float d = sdCircle(p - vec2(gp.x, -gp.y), 5.5);',
        '  float dot = cov(d);',
        '  float halo = exp(-max(d, 0.0) / 7.0) * 0.55;',
        '  col += vec3(1.0) * dot + vec3(1.0, 0.42, 0.12) * halo;',
        '  a = clamp(a + dot + halo, 0.0, 1.0);',
        '  gl_FragColor = vec4(a > 0.0 ? col / a : vec3(0.0), a);',
        '}'
    ].join('\n');

    /* --------------------------------------------------------- hairline */
    /* A single rule, used to separate the bands of the layout. */
    var hairline = [
        'uniform vec4 u_color;',
        'uniform float u_fade;',
        'void main() {',
        '  vec2 p = px();',
        '  float d = cov(abs(p.y - u_size.y * 0.5) - u_size.y * 0.25);',
        '  float t = p.x / max(u_size.x, 1.0);',
        '  float f = mix(1.0, sin(t * PI), u_fade);',
        '  float a = d * u_color.a * f;',
        '  gl_FragColor = vec4(u_color.rgb, a);',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------ marker */
    /* A small rounded bar under the selected gear. */
    var marker = [
        'uniform float u_cx;',
        'uniform float u_w;',
        'uniform vec3 u_col;',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 q = p - vec2(u_cx, u_size.y * 0.5);',
        '  float d = sdRound(q, vec2(u_w * 0.5, u_size.y * 0.30), u_size.y * 0.22);',
        '  float body = cov(d);',
        '  float glow = exp(-max(d, 0.0) / 6.0) * 0.45;',
        '  float a = clamp(body + glow, 0.0, 1.0);',
        '  gl_FragColor = vec4(u_col, a);',
        '}'
    ].join('\n');

    return { text: text, plate: plate, marker: marker, vbar: vbar, boost: boost,
             gmeter: gmeter, hairline: hairline };
}));
