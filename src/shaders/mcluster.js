(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../theme/mgeom.js'));
    else root.MGUShadersM = factory(root.MGUMGeom);
}(typeof self !== 'undefined' ? self : this, function (M) {
    'use strict';

    /*
     * The M View, drawn as effect layers.
     *
     * Every shape is written out here from the traced geometry in
     * src/theme/mgeom.js - as numbers in the shader source, so no uniform
     * vectors go on geometry and the two can never drift apart. Shaders
     * work in the reference frame's own coordinates (the 1726 x 612
     * artboard): each layer is told where its rectangle sits on it
     * (u_art: the artboard x and y of its top-left pixel, and panel pixels
     * per artboard unit), so the tables of docs/ref/MEASUREMENTS.md read
     * straight across.
     *
     * A shape is a convex outline - a chain of straight edges, clockwise,
     * with a radius on any corner - and its signed distance is the largest
     * of its edges' distances, with the corner arcs laid over them. Bands
     * (the rim, the channel, the fine contour) are one such outline less
     * another.
     *
     * GLSL ES 1.00, no `break`, 48 uniform vectors at most
     * (docs/CLUSTER-CONSTRAINTS.md section 4).
     */

    function n(v) {
        var s = String(Math.round(v * 1000) / 1000);
        return s.indexOf('.') < 0 && s.indexOf('e') < 0 ? s + '.0' : s;
    }
    function v2(a) { return 'vec2(' + n(a[0]) + ', ' + n(a[1]) + ')'; }
    /* a slope or a cosine, to five places */
    function fine(v) {
        var t = String(Math.round(v * 100000) / 100000);
        return t.indexOf('.') < 0 && t.indexOf('e') < 0 ? t + '.0' : t;
    }
    /* a unit vector, written finely: a thousandth off a direction is a
       tenth of a unit at the far end of a plate's edge */
    function u2(a) {
        function f(v) {
            var t = String(Math.round(v * 100000) / 100000);
            return t.indexOf('.') < 0 && t.indexOf('e') < 0 ? t + '.0' : t;
        }
        return 'vec2(' + f(a[0]) + ', ' + f(a[1]) + ')';
    }
    function rgb(r, g, b) { return 'vec3(' + n(r / 255) + ', ' + n(g / 255) + ', ' + n(b / 255) + ')'; }

    /*
     * GLSL for the signed distance to a convex outline: negative inside.
     * pts run clockwise (y down), the inside on the right of the way round.
     * radii[i] rounds the corner at pts[i]. closed: the last point joins
     * the first; open: the first and last edges run on for ever.
     */
    function chain(name, pts, radii, closed) {
        var k = pts.length, ne = closed ? k : k - 1, edges = [], i;
        for (i = 0; i < ne; i++) {
            var a = pts[i], b = pts[(i + 1) % k];
            var ex = b[0] - a[0], ey = b[1] - a[1], len = Math.sqrt(ex * ex + ey * ey);
            edges.push({ a: a, t: [ex / len, ey / len], n: [ey / len, -ex / len] });
        }
        var d = '';
        edges.forEach(function (e) {
            var term = 'dot(p - ' + v2(e.a) + ', ' + u2(e.n) + ')';
            d = d ? 'max(' + d + ', ' + term + ')' : term;
        });
        var out = ['float ' + name + '(vec2 p) {', '  float d = ' + d + ';', '  vec2 q;'];
        for (i = 0; i < k; i++) {
            var r = radii && radii[i];
            if (!r) continue;
            if (!closed && (i === 0 || i === k - 1)) continue;
            var pe = edges[(i + ne - 1) % ne], ce = edges[i % ne];
            var c = 1 + pe.n[0] * ce.n[0] + pe.n[1] * ce.n[1];
            var cx = pts[i][0] - r * (pe.n[0] + ce.n[0]) / c, cy = pts[i][1] - r * (pe.n[1] + ce.n[1]) / c;
            out.push('  q = p - ' + v2([cx, cy]) + ';',
                     '  if (dot(q, ' + u2(pe.t) + ') > 0.0 && dot(q, ' + u2(ce.t) + ') < 0.0) d = max(d, length(q) - ' + n(r) + ');');
        }
        out.push('  return d;', '}');
        return out.join('\n');
    }

    /* every M shader starts with these */
    var HEAD = [
        'uniform vec3 u_art;',       /* artboard x, y of the layer's corner; panel px per unit */
        'vec2 art() { return u_art.xy + px() / u_art.z; }',
        /* coverage from a distance in artboard units */
        'float ac(float d) { return clamp(0.5 - d * u_art.z, 0.0, 1.0); }',
        'const float AX = ' + n(M.AX) + ';',
        'const float Y0 = ' + n(M.SCALE.y0) + ';',
        'const float DY = ' + n(M.SCALE.dy) + ';',
        ''
    ].join('\n');

    var D = M.DIAL;

    /* ---------------------------------------------------------- the dial */
    /* the left dial's outlines; the right one is drawn through a mirror */
    function wedge(name, up, low, r) {
        var v = M.cross(up, low);
        return chain(name, [[M.at(low, 700), 700], v, [M.at(up, -100), -100]], [0, r, 0], false);
    }
    var conTopY = (D.topY0 + D.topY1) / 2;
    /* the channel's level gap to the contour on the upper limb, measured across it */
    var chanGapAcross = D.chanGapUp / Math.sqrt(1 + D.conUp[0] * D.conUp[0]);
    var conBend = M.cross(D.conUp, D.conLow);
    var tabPoly = (function () {
        var edge = M.shift(D.rimLow, 1.0);
        var run = (D.tabStep[1] - D.tabStep[0]) / (D.railTop - D.tabTop);
        return [[M.at(edge, D.tabTop), D.tabTop], [D.tabStep[0], D.tabTop],
                [D.tabStep[1] + (D.railBottom - D.railTop) * run, D.railBottom],
                [M.at(edge, D.railBottom), D.railBottom]];
    }());

    var mgauge = [
        HEAD,
        'uniform float u_side;',     /* 0: the speed dial; 1: the rev dial, mirrored */
        'uniform float u_val;',      /* the value, in ticks (0..8) */
        'uniform vec3 u_rimHi;',     /* the rim on its upper limb */
        'uniform vec3 u_rimLo;',     /* ... and on its lower */
        'uniform vec3 u_line;',      /* the fine contour and the level top line */
        'uniform vec3 u_lineLo;',    /* ... the contour on its lower limb */
        'uniform vec3 u_chan;',      /* the dark channel */
        'uniform vec3 u_fill;',      /* the lit band, at its base */
        'uniform vec3 u_fillHot;',   /* ... and just under the marker */
        'uniform vec3 u_tick;',
        'uniform vec4 u_zone;',      /* the red field (from, to) and the amber one, in ticks; 0: none */
        'uniform float u_hot;',      /* how far the rim whitens towards the marker */
        'uniform float u_warn;',     /* the limiter: the band flashes */
        wedge('rimO', D.rimUp, D.rimLow, D.rimR),
        wedge('rimI', M.shift(D.rimUp, D.rimWUp), M.shift(D.rimLow, D.rimWLow), D.rimR),
        wedge('chanO', D.chanUp, D.chanLow, D.chanR),
        wedge('chanI', M.shift(D.conUp, -D.chanGapUp), M.shift(D.conLow, -D.chanGapLow), D.conR + 4.0),
        /* the contour's centre line: up the lower limb, round the bend, up
           the upper limb, round into the level top line */
        chain('conK', [[M.at(D.conLow, 700), 700], conBend, [M.at(D.conUp, conTopY), conTopY], [3000, conTopY]],
              [0, D.conR, D.conTopR, 0], false),
        chain('tab', tabPoly, [1.5, 0, 0, 9], true),
        'const vec3 ZRED = ' + rgb(226, 146, 140) + ';',
        'const vec3 ZAMB = ' + rgb(250, 226, 214) + ';',
        'void main() {',
        '  float S = u_art.z;',
        '  vec2 p = art();',
        '  if (u_side > 0.5) p.x = 2.0 * AX - p.x;',
        '  float dO = rimO(p), dI = rimI(p), dK = conK(p);',
        '  float ym = Y0 - u_val * DY;',                     /* the marker's height */
        '  float kf = (Y0 - p.y) / DY;',                     /* this height, in ticks */
        '  vec4 c = vec4(0.0);',
        '',
        /* the dark channel between rim and contour, above the marker */
        '  float dCh = max(max(chanO(p), -chanI(p)), max(' + n(D.chanTop) + ' - p.y, p.y - (ym - 5.6)));',
        /* ... keeping its distance where the contour rounds into the top line */
        '  if (p.y < ' + n(D.chanTop + 2.0 * D.conTopR) + ') dCh = max(dCh, ' + n(chanGapAcross) + ' - dK);',
        '  vec3 chan = u_chan * (1.0 + 0.35 * smoothstep(3.0, 7.8, kf));',
        '  c = over(vec4(chan, ac(dCh)), c);',
        '',
        /* the level line across the top, cut to the rim's own slant */
        '  float topEnd = mix(' + n(D.topX1) + ', ' + n(D.topX1R) + ', u_side);',
        '  float dTop = max(max(' + n(D.topY0) + ' - p.y, p.y - ' + n(D.topY1) + '), max(dO, p.x - topEnd));',
        '  c = over(vec4(u_line, ac(dTop)), c);',
        '',
        /* the fine contour, down to the marker */
        '  float dCon = max(abs(dK) - ' + n(D.conW / 2) + ', max(p.x - topEnd, p.y - (ym - 6.6)));',
        '  c = over(vec4(mix(u_lineLo, u_line, smoothstep(300.0, 240.0, p.y)), ac(dCon)), c);',
        '',
        /* the red field and the amber one before it: fine strips inside the rim */
        '  float dZ = max(dI + 2.4, -dI - 5.4);',
        '  float zr = max(dZ, max(kf - u_zone.y, u_zone.x - kf) * DY);',
        '  float za = max(dZ, max(kf - u_zone.w, u_zone.z - kf) * DY);',
        '  c = over(vec4(ZRED, ac(zr) * step(0.001, u_zone.y)), c);',
        '  c = over(vec4(ZAMB, ac(za) * step(0.001, u_zone.w)), c);',
        '',
        /* the scale's ticks: level dashes in the gap inside the rim */
        '  float k = floor(kf + 0.5);',
        '  float yk = Y0 - k * DY;',
        '  float dT = max(max(abs(p.y - yk) - ' + n(D.tickH) + ', max(dI + ' + n(D.tickIn) + ', -dI - ' + n(D.tickIn + D.tickLen) + ')),',
        '                 p.y - (ym - 5.0));',
        '  if (k < -0.5 || k > 8.5) dT = 1000.0;',
        '  c = over(vec4(u_tick, ac(dT)), c);',
        '',
        /* the rim: its two limbs differ a little, and it whitens towards the marker */
        '  float dRim = max(max(dO, -dI), max(' + n(D.rimTop) + ' - p.y, p.y - (ym - 5.8)));',
        '  vec3 rim = mix(u_rimLo, u_rimHi, smoothstep(280.0, 220.0, p.y));',
        '  rim = mix(rim, vec3(1.0), u_hot * exp(-max(ym - p.y, 0.0) / 45.0));',
        '  c = over(vec4(rim, ac(dRim)), c);',
        '',
        /* the lit band: from the rim's outer edge to the contour's inner,
           from under the marker down to its base */
        '  float dBand = max(dO + 1.0, -dK - ' + n(D.conW / 2) + ');',
        '  float dFill = max(dBand, max(ym + 5.5 - p.y, p.y - ' + n(D.tabTop + 1.0) + '));',
        '  dFill = min(dFill, tab(p));',
        /* lighter just under the marker, settling to the rail's own colour
           well before the base */
        '  float hotz = (1.0 - smoothstep(16.0, 30.0, p.y - ym)) * smoothstep(0.0, 14.0, ' + n(D.tabTop) + ' - p.y);',
        '  vec3 fillc = mix(u_fill, u_fillHot, hotz);',
        '  fillc = mix(fillc, vec3(1.0), u_warn * step(0.5, fract(u_time * 9.0)) * 0.6);',
        '  c = over(vec4(fillc, ac(dFill)), c);',
        '',
        /* the marker: a level white bar across the band at the value */
        '  float dM = max(abs(p.y - ym) - ' + n(D.markH) + ', max(dO + 0.8, -dK - ' + n(D.markGap) + '));',
        '  c = over(vec4(vec3(1.0), ac(dM)), c);',
        '  gl_FragColor = c;',
        '}'
    ].join('\n');

    /* ------------------------------------------------- rails and centre lines */
    var G = M.FOOT.glow, DG = M.DIAG;
    /* the cyan line's return stroke and the red line, as x at a height */
    var cyanBack = (function () {
        var a = (DG.cyan.p2[0] - DG.cyan.p1[0]) / (DG.cyan.p2[1] - DG.cyan.p1[1]);
        return [a, DG.cyan.p1[0] - a * DG.cyan.p1[1]];
    }());
    var redLine = (function () {
        var a = (DG.red.p1[0] - DG.red.p0[0]) / (DG.red.p1[1] - DG.red.p0[1]);
        return [a, DG.red.p0[0] - a * DG.red.p0[1]];
    }());

    /* endB / endR: GLSL for where the blue rail ends and the red one starts, at p.y */
    function railsSrc(endB, endR) {
        return [
            HEAD,
            'uniform vec3 u_blue;',
            'uniform vec3 u_red;',
            'uniform vec3 u_blueGlow;',
            'uniform vec3 u_redGlow;',
            'void main() {',
            '  vec2 p = art();',
            '  float isR = step(AX + 44.0, p.x);',                 /* past the gap between the two rails */
            '  float xm = mix(p.x, 2.0 * AX - p.x, isR);',         /* the same place on the left rail */
            '  float dy = max(' + n(D.railTop) + ' - p.y, p.y - ' + n(D.railBottom) + ');',
            '  float endB = ' + endB + ';',
            '  float endR = ' + endR + ';',
            '  float dB = max(dy, max(' + n(D.tabStep[0] + 4.0) + ' - p.x, p.x - endB));',
            '  float dR = max(dy, max(endR - p.x, p.x - ' + n(M.mirror(D.tabStep[0] + 4.0)) + '));',
            '',
            /* the light each rail throws on the glass under it: a level top
               edge, fading straight down, deepest and strongest under the dial */
            '  float gx = clamp((xm - ' + n(G.x0) + ') / ' + n(G.x1 - G.x0) + ', 0.0, 1.0);',
            '  float yb = ' + n(G.bottom) + ' - (xm - ' + n(G.x0 + 14.0) + ') * 0.0885;',
            '  float fall = 1.0 - clamp((p.y - ' + n(G.top + 0.5) + ') / max(yb - ' + n(G.top + 0.5) + ', 1.0), 0.0, 1.0);',
            '  float lean = ' + n(G.x0 + 6.0) + ' - (p.y - ' + n(G.top) + ') * 0.43;',
            '  float g = ac(' + n(G.top) + ' - p.y) * fall * 1.05 * (1.0 - pow(gx, 1.6)) * ac(lean - xm);',
            '',
            '  vec4 c = vec4(mix(u_blueGlow, u_redGlow, isR), g);',
            '  c = over(vec4(u_blue, ac(dB)), c);',
            '  c = over(vec4(u_red, ac(dR)), c);',
            '  gl_FragColor = c;',
            '}'
        ].join('\n');
    }
    /* M Sport: each rail runs from under its dial's base to where its centre line lands */
    var mrails = railsSrc(n(cyanBack[0]) + ' * p.y + ' + n(cyanBack[1] + DG.cyan.w / 2),
                          n(redLine[0]) + ' * p.y + ' + n(redLine[1] - DG.red.w / 2));

    var mdiag = [
        HEAD,
        'uniform vec3 u_cyan;',
        'uniform vec3 u_red;',
        'void main() {',
        '  vec2 p = art();',
        '  float d1 = min(sdSegment(p, ' + v2(DG.cyan.p0) + ', ' + v2(DG.cyan.p1) + ', 0.0),',
        '                 sdSegment(p, ' + v2(DG.cyan.p1) + ', ' + v2(DG.cyan.p2) + ', 0.0)) - ' + n(DG.cyan.w / 2) + ';',
        '  d1 = max(d1, max(' + n(DG.cyan.p0[1]) + ' - p.y, p.y - ' + n(D.railBottom) + '));',
        '  float d2 = sdSegment(p, ' + v2(DG.red.p0) + ', ' + v2(DG.red.p1) + ', 0.0) - ' + n(DG.red.w / 2) + ';',
        '  d2 = max(d2, max(' + n(DG.red.p0[1]) + ' - p.y, p.y - ' + n(D.railBottom) + '));',
        '  vec4 c = vec4(u_cyan, ac(d1));',
        '  c = over(vec4(u_red, ac(d2)), c);',
        '  gl_FragColor = c;',
        '}'
    ].join('\n');

    /* ------------------------------------------------------------ the plates */
    function plates(names, hairs) {
        var src = [
            HEAD,
            'uniform vec3 u_tint;',      /* a plate's colour per unit of its brightness */
            'uniform vec3 u_hair;'
        ];
        names.forEach(function (id) { src.push(chain('pl' + id, M.PLATES[id].v, M.PLATES[id].r, true)); });
        var h = '';
        hairs.forEach(function (i) {
            var L = M.HAIRLINES[i];
            var term = 'sdSegment(p, ' + v2([L[0], L[1]]) + ', ' + v2([L[2], L[3]]) + ', 0.0)';
            h = h ? 'min(' + h + ', ' + term + ')' : term;
        });
        src.push('void main() {', '  vec2 p = art();', '  float d = 1000.0, b = 0.0, e;');
        /* each plate has its own fall of light, fitted to the photograph */
        names.forEach(function (id) {
            var g = M.PLATES[id].g;
            src.push('  e = pl' + id + '(p);',
                     '  if (e < d) { d = e; b = ' + n(g[2]) + ' + (p.x - ' + n(g[0]) + ') * ' + n(g[3]) +
                     ' + (p.y - ' + n(g[1]) + ') * ' + n(g[4]) + '; }');
        });
        src.push(
            '  vec3 col = u_tint * clamp(b, 40.0, 118.0) / 255.0;',
            '  col += u_hair * ac(' + h + ' - 0.55);',
            '  gl_FragColor = vec4(col, ac(d));',
            '}');
        return src.join('\n');
    }
    var mplatesL = plates(['LU1', 'LU2', 'LL1', 'LL2'], [0, 1]);
    var mplatesR = plates(['RU1', 'RU2', 'RL1', 'RL2'], [2, 3]);

    /* ------------------------------------------------------------ the strips */
    var ST = M.STRIP;
    var cuts = ST.cuts.map(function (y) { return 'abs(p.y - ' + n(y) + ')'; })
        .reduce(function (acc, t) { return acc ? 'min(' + acc + ', ' + t + ')' : t; }, '');
    var mstrip = [
        HEAD,
        'uniform float u_side;',     /* 0: fuel, on the left; 1: oil, its mirror */
        'uniform float u_level;',    /* 0..1 */
        'uniform float u_on;',       /* 0: no reading, nothing lit */
        'uniform vec3 u_lit;',
        'uniform vec3 u_dim;',       /* the unlit segments */
        'uniform vec3 u_ink;',       /* the fine line */
        'uniform vec3 u_hotCol;',
        'uniform vec3 u_coldCol;',
        'uniform vec3 u_lowCol;',    /* fuel: the foot of the last segment */
        'void main() {',
        '  vec2 p = art();',
        '  if (u_side > 0.5) p.x = 2.0 * AX - p.x;',
        '  float dy = max(' + n(ST.top) + ' - p.y, p.y - ' + n(ST.bottom) + ');',
        '  float xl = p.x - (' + n(ST.line[0]) + ' * p.y + ' + n(ST.line[1]) + ');',
        '  float xs = p.x - (' + n(ST.seg[0]) + ' * p.y + ' + n(ST.seg[1]) + ');',
        '  float dL = max(dy, max(-xl, xl - ' + n(ST.lineW) + ') * 0.84);',
        '  float dS = max(max(dy, max(-xs, xs - ' + n(ST.segW) + ') * 0.84), ' + n(ST.cutH) + ' - ' + cuts + ');',
        '',
        /* the line: plain for fuel; for oil red where it is hot, blue where cold */
        '  vec3 ink = u_ink;',
        '  float gap = 1.0;',
        '  if (u_side > 0.5) {',
        '    ink = p.y < ' + n(ST.hot) + ' ? u_hotCol : (p.y > ' + n(ST.cold) + ' ? u_coldCol : u_ink);',
        '    gap = step(0.9, min(abs(p.y - ' + n(ST.hot) + '), abs(p.y - ' + n(ST.cold) + ')));',
        '  }',
        '',
        /* the segments, lit from the bottom to the level */
        '  float yl = ' + n(ST.bottom) + ' - u_level * ' + n(ST.bottom - ST.top) + ';',
        '  float on = u_on * ac(yl - p.y);',
        '  vec3 lit = u_lit;',
        '  if (u_side > 0.5) {',
        '    lit = yl > ' + n(ST.cold + 1.0) + ' ? u_coldCol : (yl < ' + n(ST.hot) + ' ? u_hotCol : u_lit);',
        '  } else {',
        '    float t = clamp((p.y - ' + n(ST.cuts[2]) + ') / ' + n(ST.bottom - ST.cuts[2]) + ', 0.0, 1.0);',
        '    lit = mix(u_lit, u_lowCol, t * t);',
        '  }',
        '  vec4 c = vec4(mix(u_dim, lit, on), ac(dS));',
        '  c = over(vec4(ink, ac(dL) * gap), c);',
        '  gl_FragColor = c;',
        '}'
    ].join('\n');

    /* ---------------------------------------------------- the footer's panel */
    var FP = M.FOOT.panel;
    var seps = M.FOOT.seps.map(function (s) {
        var a = (s[1] - s[0]) / (FP.bottom - FP.top);
        return 'abs(p.x - (' + n(s[0]) + ' + (p.y - ' + n(FP.top) + ') * ' + n(a) + ')) * ' +
               n(1 / Math.sqrt(1 + a * a));
    }).reduce(function (acc, t) { return acc ? 'min(' + acc + ', ' + t + ')' : t; }, '');
    var mfoot = [
        HEAD,
        'uniform vec3 u_pane;',      /* the panes at their top edge */
        'uniform vec3 u_paneFoot;',  /* ... and at their foot: they lighten downwards */
        'void main() {',
        '  vec2 p = art();',
        '  float t = p.y - ' + n(FP.top) + ';',
        '  float d = max(max(' + n(FP.top) + ' - p.y, p.y - ' + n(FP.bottom) + '),',
        '                max(' + n(FP.left) + ' + t * ' + n(FP.leanL) + ' - p.x, p.x - (' + n(FP.right) + ' + t * ' + n(FP.leanR) + ')) * 0.87);',
        '  d = max(d, ' + n(M.FOOT.sepW / 2) + ' - ' + seps + ');',
        '  float fall = clamp((t - 4.0) / ' + n(FP.bottom - FP.top - 7.0) + ', 0.0, 1.0);',
        '  gl_FragColor = vec4(mix(u_pane, u_paneFoot, fall), ac(d));',
        '}'
    ].join('\n');

    /* --------------------------------------------------------- the back glass */
    var W = M.WINDOW, WB = M.windowBox();
    var mback = [
        HEAD,
        'uniform float u_open;',     /* 0..1: how far the hosted picture's window is open */
        'uniform vec3 u_bg;',
        'uniform vec3 u_bgLift;',    /* the faint lift towards the middle */
        W.polys.map(function (poly, i) { return chain('win' + i, poly, null, true); }).join('\n'),
        'void main() {',
        '  vec2 p = art();',
        '  float r = length((p - vec2(AX, 250.0)) / vec2(560.0, 330.0));',
        '  vec3 col = mix(u_bgLift, u_bg, smoothstep(0.0, 1.0, r));',
        '  float a = 1.0;',
        '  if (u_open > 0.001 && p.x > ' + n(WB.x0) + ' && p.x < ' + n(WB.x1) + ' && p.y > ' + n(WB.y0) + ' && p.y < ' + n(WB.y1) + ') {',
        '    float d = ' + W.polys.map(function (poly, i) { return 'win' + i + '(p)'; })
            .reduce(function (acc, t) { return acc ? 'min(' + acc + ', ' + t + ')' : t; }, '') + ';',
        '    float t = clamp((-d - ' + n(W.inset) + ') / ' + n(W.feather) + ', 0.0, 1.0);',
        '    a = 1.0 - u_open * t * t * (3.0 - 2.0 * t);',
        '  }',
        '  gl_FragColor = vec4(col, a);',
        '}'
    ].join('\n');

    /* -------------------------------------------------- the scale's numerals */
    /*
     * The text shader, with one thing more: each glyph knows which tick it
     * stands at from its own height, and the numerals either side of the
     * value turn white and a little heavier, as on the car.
     */
    var mnum = [
        HEAD,
        'uniform vec4 u_g[12];',
        'uniform vec4 u_quad[12];',
        'uniform vec4 u_cfg;',       /* count, sharpness, the value in ticks, extra weight when lit */
        'uniform vec3 u_col;',
        'uniform vec3 u_colOn;',
        'uniform vec4 u_ax[12];',    /* each glyph's numeral: the point it grows about (xy, layer px) */
        'uniform float u_grow;',     /* how much a numeral grows as the marker comes level: 0, not at all */
        'void main() {',
        '  vec2 p = px();',
        '  float a = 0.0;',
        '  vec3 acc = vec3(0.0);',
        '  for (int i = 0; i < 12; i++) {',
        '    float on = step(float(i) + 0.5, u_cfg.x);',
        '    vec4 r = u_quad[i];',
        /* the tick this glyph belongs to, from where its middle is */
        '    float gy = u_art.y + (r.y + r.w * 0.5) / u_art.z;',
        '    float k = floor((Y0 - gy) / DY + 0.5);',
        /* the numeral swells about its own middle as the marker comes
           level with it and settles as it goes by: full size a tick away */
        '    float near = clamp(1.0 - abs(k - u_cfg.z), 0.0, 1.0);',
        '    float s = 1.0 + u_grow * near * near * (3.0 - 2.0 * near);',
        '    vec2 an = u_ax[i].xy;',
        '    vec2 pp = u_grow > 0.0 ? an + (p - an) / s : p;',
        '    vec2 q = (pp - r.xy) / max(r.zw, vec2(1.0));',
        '    float inR = on * step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);',
        '    float lit = smoothstep(0.0, 0.25, 1.0 - abs(k - u_cfg.z));',
        '    vec4 g = u_g[i];',
        '    float raw = texture2D(u_atlas, g.xy + clamp(q, 0.0, 1.0) * g.zw).r;',
        '    float cv = clamp((raw - 0.5 + u_cfg.w * lit) * u_cfg.y * s + 0.5, 0.0, 1.0) * inR;',
        '    acc += mix(u_col, u_colOn, lit) * cv;',
        '    a += cv;',
        '  }',
        '  gl_FragColor = vec4(a > 0.0 ? acc / a : vec3(0.0), clamp(a, 0.0, 1.0));',
        '}'
    ].join('\n');

    /* --------------------------------------------------------- a round badge */
    /* the LIMIT sign's disc and ring (its letters are a text layer) */
    var mbadge = [
        'uniform vec3 u_disc;',
        'uniform vec3 u_ring;',
        'uniform vec2 u_r;',         /* the disc's radius and the ring's, layer px */
        'void main() {',
        '  vec2 p = px() - u_size * 0.5;',
        '  float d = length(p);',
        '  vec4 c = vec4(u_ring, cov(d - u_r.y));',
        '  c = over(vec4(u_disc, cov(d - u_r.x)), c);',
        '  gl_FragColor = c;',
        '}'
    ].join('\n');

    /* ----------------------------------------------------- the next-turn sign */
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

    /* ====================================================== M Sport Plus */
    /*
     * The other middle (M.PLUS): seven plates with one fall of light, the
     * blue and the red M stripe on the centre one, a lattice of fine lines
     * across them all, and the map's window - which here is in the centre
     * plate itself, so the plate thins out towards the picture.
     */
    var PL = M.PLUS, PW = PL.WINDOW, PWB = M.plusWindowBox();
    var COSD = 1 / Math.sqrt(1 + PL.slope * PL.slope);       /* level -> across a diagonal */
    function rgb3(c) { return rgb(c[1], c[2], c[3]); }
    var LT = PL.LIGHT;
    var plusCommon = [
        /* a plate's colour at a height */
        'vec3 plateCol(float y) {',
        '  vec3 c = mix(' + rgb3(LT[0]) + ', ' + rgb3(LT[1]) + ', clamp((y - ' + n(LT[0][0]) + ') / ' + n(LT[1][0] - LT[0][0]) + ', 0.0, 1.0));',
        '  c = mix(c, ' + rgb3(LT[2]) + ', clamp((y - ' + n(LT[1][0]) + ') / ' + n(LT[2][0] - LT[1][0]) + ', 0.0, 1.0));',
        '  return mix(c, ' + rgb3(LT[3]) + ', clamp((y - ' + n(LT[2][0]) + ') / ' + n(LT[3][0] - LT[2][0]) + ', 0.0, 1.0));',
        '}',
        /* how far to the nearest of the lattice's lines */
        'float lattice(vec2 p) {',
        '  float d = 1000.0;',
        PL.LATTICE.map(function (L) {
            return '  d = min(d, sdSegment(p, ' + v2([L[0], L[1]]) + ', ' + v2([L[2], L[3]]) + ', 0.0));';
        }).join('\n'),
        '  return d;',
        '}',
        /* the window's fade: level at both ends, and its slope too */
        'float smoother(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }'
    ].join('\n');

    function plusPlates(names, centre) {
        var src = [HEAD, 'uniform vec3 u_hair;'];        /* the light the lattice's lines add */
        if (centre) {
            src.push('uniform float u_open;',            /* 0..1: how far the map's window is open */
                     'uniform float u_calm;',            /* 1: the stripes stand back (a turn card is over them) */
                     'uniform vec3 u_blue;',             /* the two M stripes */
                     'uniform vec3 u_red;');
        }
        names.forEach(function (id) { src.push(chain('pp' + id, PL.PLATES[id].v, PL.PLATES[id].r, true)); });
        if (centre) src.push(chain('pwin', PW.poly, PW.r, true));
        src.push(plusCommon, 'void main() {', '  vec2 p = art();');
        src.push('  float d = ' + names.map(function (id) { return 'pp' + id + '(p)'; })
            .reduce(function (acc, t) { return acc ? 'min(' + acc + ', ' + t + ')' : t; }, '') + ';');
        src.push('  vec3 plate = plateCol(p.y);', '  vec3 col = plate;');
        if (centre) {
            var S = PL.STRIPES;
            src.push(
                /* the stripes: bands on the diagonals' lean, strongest a fifth
                   of the way down the plate and fading out above and below */
                '  float sx = p.x + ' + fine(PL.slope) + ' * p.y;',
                '  float lit = smoothstep(' + n(S.rise) + ', ' + n(S.peak) + ', p.y) * (1.0 - smoothstep(' + n(S.peak) + ', ' + n(S.gone) + ', p.y));',
                '  lit *= 1.0 - 0.8 * u_calm;',
                '  col = mix(col, u_blue, lit * ac(max(' + n(S.blue[0]) + ' - sx, sx - ' + n(S.blue[1]) + ') * ' + fine(COSD) + '));',
                '  col = mix(col, u_red, 0.9 * lit * ac(max(' + n(S.red[0]) + ' - sx, sx - ' + n(S.red[1]) + ') * ' + fine(COSD) + '));');
        }
        src.push(
            /* the lattice, a little stronger where the plate is lighter */
            '  col += u_hair * ac(lattice(p) - ' + n(PL.latticeW / 2) + ') * (0.35 + 1.7 * plate.b);',
            '  float a = ac(d);');
        if (centre) {
            src.push(
                /* the window: the plate thins out to nothing over the picture */
                '  if (u_open > 0.001) {',
                '    float t = clamp((-pwin(p) - ' + n(PW.inset) + ') / ' + n(PW.feather) + ', 0.0, 1.0);',
                '    a *= 1.0 - u_open * smoother(t);',
                '  }');
        }
        src.push('  gl_FragColor = vec4(col, a);', '}');
        return src.join('\n');
    }
    var mpsideL = plusPlates(['A', 'B', 'B2'], false);
    var mpcentre = plusPlates(['C'], true);
    var mpsideR = plusPlates(['D', 'F', 'E'], false);

    /*
     * Its back glass. The hole is the window's own outline where the
     * centre plate covers it, drawn in two units, so its edge is always
     * under plate the picture has not yet begun to thin: the fade is the
     * plate's alone, and the map comes up through it with nothing dark
     * between and nothing showing past the plate.
     */
    var mpback = [
        HEAD,
        'uniform float u_open;',
        'uniform vec3 u_bg;',
        'uniform vec3 u_bgLift;',
        chain('pwin', PW.poly, PW.r, true),
        chain('ppC', PL.PLATES.C.v, PL.PLATES.C.r, true),
        'void main() {',
        '  vec2 p = art();',
        '  float r = length((p - vec2(AX, 250.0)) / vec2(560.0, 330.0));',
        '  vec3 col = mix(u_bgLift, u_bg, smoothstep(0.0, 1.0, r));',
        '  float a = 1.0;',
        '  if (u_open > 0.001 && p.x > ' + n(PWB.x0) + ' && p.x < ' + n(PWB.x1) + ' && p.y > ' + n(PWB.y0) + ' && p.y < ' + n(PWB.y1) + ') {',
        '    a = 1.0 - ac(max(pwin(p), ppC(p)) + 2.0);',
        '  }',
        '  gl_FragColor = vec4(col, a);',
        '}'
    ].join('\n');

    /* its rails: they run in to a gap about the axis, cut on the diagonals' lean */
    var PR = PL.RAILS;
    var mprails = railsSrc(n(PR.blueEnd) + ' - (p.y - ' + n(PR.y) + ') * ' + fine(PL.slope),
                           n(PR.redStart) + ' + (p.y - ' + n(PR.y) + ') * ' + fine(PL.slope));

    var out = { mback: mback, mplatesL: mplatesL, mplatesR: mplatesR, mgauge: mgauge, mrails: mrails,
                mdiag: mdiag, mstrip: mstrip, mfoot: mfoot, mnum: mnum, mbadge: mbadge, tturn: tturn,
                mpback: mpback, mpsideL: mpsideL, mpcentre: mpcentre, mpsideR: mpsideR, mprails: mprails };
    /* the outline compiler, for the tests: not a shader, so not listed with them */
    Object.defineProperty(out, 'chain', { value: chain, enumerable: false });
    return out;
}));
