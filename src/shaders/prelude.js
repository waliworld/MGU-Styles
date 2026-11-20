(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUPrelude = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * The vertex shader every effect layer shares. cluster-render draws each
     * layer as one quad; we match its convention (v_uv, u_size, u_keep) so a
     * shader written here drops straight into an effect layer on the car.
     */
    var VERT = [
        '#version 100',
        'precision highp float;',
        'attribute vec2 a_pos;',
        'varying vec2 v_uv;',
        'void main() {',
        '  v_uv = vec2(a_pos.x, 1.0 - a_pos.y);',  /* y down, like the panel */
        '  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);',
        '}'
    ].join('\n');

    /*
     * Shared fragment prelude.
     *
     * Hard rules (docs/CLUSTER-CONSTRAINTS.md section 4):
     *  - u_mvp/u_mv/u_m/u_v/u_p/u_normal are reserved: never declare them.
     *  - 48 uniform vectors per shader, maximum.
     *  - no `break` out of a loop.
     */
    var PRELUDE = [
        '#version 100',
        '#ifdef GL_FRAGMENT_PRECISION_HIGH',
        'precision highp float;',
        '#else',
        'precision mediump float;',
        '#endif',
        'varying vec2 v_uv;',
        'uniform vec2 u_size;',   /* layer size in panel pixels */
        'uniform float u_time;',  /* seconds, for animation */
        /* The share of the layer kept when the car cuts it at the bottom
           strip. 0 means all of it. Mirrors idv7lol's u_keep. */
        'uniform float u_keep;',
        '',
        'const float PI = 3.14159265359;',
        'const float TAU = 6.28318530718;',
        '',
        'vec2 uvDrawn() { return vec2(v_uv.x, v_uv.y * (u_keep > 0.0 ? u_keep : 1.0)); }',
        'vec2 px() { return uvDrawn() * u_size; }',
        '',
        /* Antialiased coverage from a signed distance in pixels. */
        'float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }',
        'float covW(float d, float w) { return clamp(0.5 - d / max(w, 0.0001), 0.0, 1.0); }',
        '',
        /* Signed distance primitives, all in pixel space. */
        'float sdCircle(vec2 p, float r) { return length(p) - r; }',
        'float sdBox(vec2 p, vec2 b) {',
        '  vec2 d = abs(p) - b;',
        '  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);',
        '}',
        'float sdRound(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }',
        'float sdSegment(vec2 p, vec2 a, vec2 b, float r) {',
        '  vec2 pa = p - a, ba = b - a;',
        '  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
        '  return length(pa - ba * h) - r;',
        '}',
        /* Ring band between two radii. */
        'float sdRing(vec2 p, float r0, float r1) {',
        '  float d = length(p);',
        '  return max(d - r1, r0 - d);',
        '}',
        '',
        /* Angle of p measured clockwise from straight up, 0..TAU. */
        'float angleUp(vec2 p) {',
        '  float a = atan(p.x, -p.y);',
        '  return a < 0.0 ? a + TAU : a;',
        '}',
        '',
        /* Regular hexagon distance, flat-top, circumradius r. */
        /* Never zero, so a normal built from it cannot collapse. */
        'float sgn(float x) { return x < 0.0 ? -1.0 : 1.0; }',
        /* Guarded power, for the superellipse the dial is built on. */
        'float sePow(float x, float e) { return pow(max(x, 0.000001), e); }',
        '',
        /* Odd quartic-in-x^2 used to remap the dial's polar angle to and
           from arc length (src/geometry/superarc.js). */
        'float oddPoly4(vec4 c, float x) {',
        '  float x2 = x * x;',
        '  return x * (c.x + x2 * (c.y + x2 * (c.z + x2 * c.w)));',
        '}',
        'float remapOdd(vec4 c, float v) {',
        '  return sgn(v) * oddPoly4(c, min(abs(v), 1.0));',
        '}',
        '',
        'float sdHex(vec2 p, float r) {',
        '  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);',
        '  p = abs(p);',
        '  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;',
        '  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);',
        '  return length(p) * sign(p.y);',
        '}',
        '',
        'vec3 srgbMix(vec3 a, vec3 b, float t) { return mix(a, b, clamp(t, 0.0, 1.0)); }',
        '',
        /* Premultiplied "over" compositing, matching the renderer. */
        'vec4 over(vec4 src, vec4 dst) {',
        '  float a = src.a + dst.a * (1.0 - src.a);',
        '  vec3 c = src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a);',
        '  return vec4(a > 0.0 ? c / a : vec3(0.0), a);',
        '}',
        ''
    ].join('\n');

    /*
     * SDF glyph sampling, appended only to shaders that draw text.
     * u_atlas is the baked atlas (assets/fonts/atlas.png); R holds the
     * distance, 0.5 is the glyph edge.
     */
    var TEXT = [
        'uniform sampler2D u_atlas;',
        'uniform vec2 u_atlasSize;',
        /* px per distance unit: atlasSpread * drawnSize / glyphCellSize */
        'float glyphAlpha(vec2 uv, float sharp) {',
        '  float d = texture2D(u_atlas, uv).r - 0.5;',
        '  return clamp(d * sharp + 0.5, 0.0, 1.0);',
        '}',
        ''
    ].join('\n');

    /*
     * The full fragment source for one layer. Text layers get the atlas
     * helpers appended; everything else stays lean. The preview and the car
     * driver both build their shaders here, so they compile the same source.
     */
    function compose(body) {
        return PRELUDE + (body.indexOf('u_atlas') >= 0 ? TEXT : '') + body;
    }

    return { VERT: VERT, PRELUDE: PRELUDE, TEXT: TEXT, compose: compose };
}));
