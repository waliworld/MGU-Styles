'use strict';
/*
 * The M style (BMW M View, rebuilt from docs/ref/m-view-reference.jpg)
 * against the car's limits and its own geometry: the bottom strip, the
 * factory telltales, the shader budget, the window the hosted map shows
 * through, and that a tick, its numeral and the marker agree.
 *
 * How closely it matches the photograph is measured by tools/m-compare.py
 * (it needs Python; these tests do not).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Panel = require('../src/geometry/panel.js');
const Themes = require('../src/theme/index.js');
const Track = require('../src/theme/track.js');
const State = require('../src/engine/state.js');
const Sim = require('../preview/sim.js');
const Text = require('../src/engine/text.js');
const atlas = require('../assets/fonts/atlas.json');
const mShaders = require('../src/shaders/mcluster.js');
const allShaders = Object.assign({}, require('../src/shaders/core.js'), require('../src/shaders/parts.js'),
    require('../src/shaders/dial.js'), mShaders);
const M = require('../src/theme/mgeom.js');
const Vehicle = require('../src/car/vehicle.js');

const PROFILE = Panel.profile('x3m40i');
const build = (cfg) => Themes.build(atlas, (cfg && cfg.profile) || 'x3m40i', Object.assign({ style: 'track' }, cfg));
const layer = (t, id) => t.layers.find((L) => L.id === id);
/* a presented state, with anything in `over` laid on top */
const state = (t, raw, over) => Object.assign(State.present(raw || {}, t.profile, t.settings), over);

const TURNS = [
    { kind: 'intersection', angle: 90, side: -1, exit: 0, text: '0.3 mi' },
    { kind: 'intersection', angle: 135, side: 1, exit: 0, text: '1500 ft' },
    { kind: 'intersection', angle: 180, side: -1, exit: 0, text: '0.1 mi' },
    { kind: 'roundabout', angle: 90, side: 1, exit: 3, text: '12.5 km' },
    { kind: 'branch', angle: 30, side: 1, exit: 0, text: '800 m' },
    { kind: 'destination', angle: 0, side: 1, exit: 0, text: '200 yd' },
    { kind: 'tunnel', angle: 0, side: 1, exit: 0, text: '1 mi' }
];
const CENTRES = [{ mode: 'neutral', open: 0, maneuver: null }, { mode: 'map', open: 1, maneuver: null },
    { mode: 'camera', open: 0.5, maneuver: null }].concat(TURNS.map((m) => ({ mode: 'turn', open: 0, maneuver: m })));

/* ---- reading a text layer back: which characters, and where ---- */
const GLYPH_AT = new Map();
for (const [face, f] of Object.entries(atlas.faces)) {
    for (const [ch, g] of Object.entries(f.glyphs)) if (g.tw) GLYPH_AT.set(g.u + ',' + g.v, { face, ch });
}
const isText = (L) => L.shader === 'text' || L.shader === 'mnum';
const countOf = (L, u) => (L.shader === 'mnum' ? u.u_cfg[0] : u.u_count);
/* the glyph boxes of a text layer, in panel pixels */
function quads(L, u) {
    const out = [];
    for (let g = 0; g < countOf(L, u); g++) {
        const [x, y, w, h] = u.u_quad.slice(g * 4, g * 4 + 4);
        out.push({ x: L.x + x, y: L.y + y, w, h });
    }
    return out;
}
function read(L, u) {
    if (!u) return null;
    let s = '';
    for (let g = 0; g < countOf(L, u); g++) {
        const hit = GLYPH_AT.get(Math.round(u.u_g[g * 4] * atlas.size) + ',' + Math.round(u.u_g[g * 4 + 1] * atlas.size));
        s += hit ? hit.ch : '?';
    }
    return s;
}
const says = (t, id, st) => read(layer(t, id), layer(t, id).uniforms(st, 0));
const hits = (r, z) => r.x < z.x + z.w && r.x + r.w > z.x && r.y < z.y + z.h && r.y + r.h > z.y;
/* both M styles: the M View, and the same dials round the other middle */
const M_STYLES = ['track', 'mplus'];
/*
 * A scale layer's glyph boxes with the marker level with each numeral in
 * turn - every numeral at its largest - by the shader's own sums: the tick
 * from the glyph's height, the size about the numeral's anchor.
 */
function grownQuads(L, u) {
    const out = [], s = 1 + u.u_grow;
    for (let g = 0; g < u.u_cfg[0]; g++) {
        const [x, y, w, h] = u.u_quad.slice(g * 4, g * 4 + 4);
        const k = Math.floor((M.SCALE.y0 - (u.u_art[1] + (y + h / 2) / u.u_art[2])) / M.SCALE.dy + 0.5);
        const ax = u.u_ax[g * 4], ay = u.u_ax[g * 4 + 1];
        out.push({ x: L.x + ax + (x - ax) * s, y: L.y + ay + (y - ay) * s, w: w * s, h: h * s, k });
    }
    return out;
}
/* everything a text layer can put ink on in a state: its glyphs, and for a scale its numerals grown */
const inkOf = (L, u) => (L.shader === 'mnum' ? quads(L, u).concat(grownQuads(L, u)) : quads(L, u));

/* ------------------------------------------------------------ the registry */

test('the registry picks the style, Toro by default', () => {
    assert.strictEqual(Themes.build(atlas, 'x3m40i', {}).id, 'toro');
    assert.strictEqual(Themes.build(atlas, 'x3m40i', { style: 'nonsense' }).id, 'toro');
    assert.strictEqual(build().id, 'track');
    assert.strictEqual(build().name, 'M Sport', 'the M View keeps the id saved settings already hold');
    assert.ok(build().hasCentre);
    const plus = build({ style: 'mplus' });
    assert.deepStrictEqual([plus.id, plus.name, plus.hasCentre], ['mplus', 'M Sport Plus', true]);
    assert.deepStrictEqual(Object.keys(Themes.THEMES), ['toro', 'track', 'mplus']);
});

/* ---------------------------------------------------- the artboard's fit */

test('the reference frame is fitted uniformly, its axis on the panel\'s centre, all of it above the strip', () => {
    const A = M.ART;
    assert.deepStrictEqual([A.w, A.h], [1726, 612], 'the reference frame\'s own size');
    /* one scale both ways: px and py differ only by their origin */
    assert.strictEqual(M.px(100) - M.px(0), M.py(100) - M.py(0));
    assert.ok(Math.abs(M.px(M.AX) - Panel.PANEL_WIDTH / 2) < 0.05, 'the dials mirror about x = 960');
    assert.ok(M.px(0) >= 0 && M.px(A.w) <= Panel.PANEL_WIDTH);
    assert.ok(M.py(0) >= 0 && M.py(A.h) <= Panel.BOTTOM_CUT, 'the whole frame is above the car\'s strip');
    /* layers sit on whole pixels and cover what they were asked to */
    const b = M.box(10.2, 20.7, 30.1, 40.9);
    assert.ok(Number.isInteger(b.x) && Number.isInteger(b.y) && Number.isInteger(b.w) && Number.isInteger(b.h));
    assert.ok(b.x <= M.px(10.2) && b.x + b.w >= M.px(30.1) && b.y <= M.py(20.7) && b.y + b.h >= M.py(40.9));
});

test('one fit carries the whole design to a target: the comparison\'s 1:1 artboard, or any other size', () => {
    const panel = build({ mFixture: true });
    const boxes = (t) => t.layers.map((L) => [L.id, L.x, L.y, L.w, L.h]);
    const before = boxes(panel);
    try {
        /* the artboard itself: what tools/m-compare.py measures against the photograph */
        M.setFit({ s: 1, ox: 0, oy: 0 });
        assert.deepStrictEqual([M.px(0), M.py(0), M.px(1726), M.py(612)], [0, 0, 1726, 612]);
        const native = build({ mFixture: true });
        const st = state(native, { speedKmh: 0 });
        for (const L of native.layers.filter((x) => x.shader !== 'flash' && !x.belowCut)) {
            assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= 1726 && L.y + L.h <= 612, L.id + ' is on the artboard');
        }
        /* a shader is told its place in artboard units, one pixel to the unit */
        const dial = layer(native, 'speedDial');
        assert.deepStrictEqual(dial.uniforms(st).u_art, [dial.x, dial.y, 1]);
        /* the speed's "0" is 51.6 units tall there, as in the photograph */
        const zero = quads(layer(native, 'speed'), layer(native, 'speed').uniforms(st, 0))[0];
        const ink = atlas.faces.mw.glyphs['0'];
        assert.ok(Math.abs(0.70 * zero.h / ink.h - 51.6) < 0.01, 'the figure\'s height follows the fit');

        /* twice the size: every layer twice as far out and twice as big (to the pixel grid) */
        M.setFit({ s: 2, ox: 10, oy: 20 });
        const big = build({ mFixture: true });
        for (const [i, L] of big.layers.entries()) {
            const N = native.layers[i];
            if (N.id === 'back' || N.id === 'flash') continue;          /* these cover the panel, whatever the fit */
            assert.strictEqual(L.id, N.id);
            assert.ok(Math.abs(L.x - (10 + 2 * N.x)) <= 2 && Math.abs(L.y - (20 + 2 * N.y)) <= 2, L.id + ' moved with the fit');
            assert.ok(Math.abs(L.w - 2 * N.w) <= 3 && Math.abs(L.h - 2 * N.h) <= 3, L.id + ' grew with the fit');
        }
        assert.strictEqual(layer(big, 'speedDial').uniforms(state(big, {})).u_art[2], 2);
    } finally {
        M.setFit();
    }
    /* and the car's fit is back, exactly */
    assert.deepStrictEqual([M.ART.s, M.ART.ox, M.ART.oy], [M.PANEL_FIT.s, M.PANEL_FIT.ox, M.PANEL_FIT.oy]);
    assert.deepStrictEqual(boxes(build({ mFixture: true })), before);
});

/* ------------------------------------------------- the outline compiler */

/* the generated GLSL of one outline, as a JavaScript function of [x, y] */
function outline(pts, radii, closed) {
    const N = '(-?[\\d.e-]+)';
    const js = mShaders.chain('f', pts, radii, closed)
        .replace(/^float f\(vec2 p\) \{/, '')
        .replace(/\}\s*$/, '')
        .replace(new RegExp('dot\\(p - vec2\\(' + N + ', ' + N + '\\), vec2\\(' + N + ', ' + N + '\\)\\)', 'g'),
            '((p[0] - ($1)) * ($3) + (p[1] - ($2)) * ($4))')
        .replace(new RegExp('q = p - vec2\\(' + N + ', ' + N + '\\);', 'g'), 'q = [p[0] - ($1), p[1] - ($2)];')
        .replace(new RegExp('dot\\(q, vec2\\(' + N + ', ' + N + '\\)\\)', 'g'), '(q[0] * ($1) + q[1] * ($2))')
        .replace(/length\(q\)/g, 'Math.hypot(q[0], q[1])')
        .replace(/\bmax\(/g, 'Math.max(')
        .replace('float d =', 'var d =')
        .replace('vec2 q;', 'var q;');
    assert.ok(!/vec2|float|dot\(/.test(js), 'everything in the outline was understood:\n' + js);
    return new Function('p', js);
}

test('an outline\'s distance: negative inside, the corners rounded by their own radius', () => {
    /* a 100 x 60 box, clockwise with y down; two corners rounded */
    const f = outline([[0, 0], [100, 0], [100, 60], [0, 60]], [10, 0, 20, 0], true);
    const near = (a, b, why) => assert.ok(Math.abs(a - b) < 0.01, `${why}: ${a} != ${b}`);
    near(f([50, 30]), -30, 'the middle');
    near(f([110, 30]), 10, 'right of it');
    near(f([50, -7]), 7, 'above it');
    near(f([100, 0]), 0, 'a sharp corner is on the outline');
    near(f([0, 0]), 10 * (Math.SQRT2 - 1), 'a rounded corner is cut away');
    near(f([10 - 10 / Math.SQRT2, 10 - 10 / Math.SQRT2]), 0, 'on the arc');
    near(f([100, 60]), 20 * (Math.SQRT2 - 1), 'the larger radius cuts further');
    near(f([5, 5]), Math.hypot(5, 5) - 10, 'inside, by the arc');
    /* an open chain: its first and last edges run on for ever */
    const g = outline([[0, 100], [0, 0], [100, 0]], [0, 25, 0], false);
    near(g([50, 5000]), -50, 'far down the first edge');
    near(g([5000, 40]), -40, 'far along the last');
    near(g([0, 0]), 25 * (Math.SQRT2 - 1), 'its one corner is rounded');
});

test('every plate is a clockwise convex slab, and its corners are rounded as measured', () => {
    for (const [id, P] of Object.entries(M.PLATES)) {
        const f = outline(P.v, P.r, true), k = P.v.length;
        const cx = P.v.reduce((a, v) => a + v[0], 0) / k, cy = P.v.reduce((a, v) => a + v[1], 0) / k;
        assert.ok(f([cx, cy]) < -20, `${id}: its middle is inside`);
        assert.ok(M.convexDist(P.v, cx, cy) < -20, `${id} is listed clockwise`);
        for (let i = 0; i < k; i++) {
            const a = P.v[(i + k - 1) % k], b = P.v[i], c = P.v[(i + 1) % k];
            /* convex: each corner turns the same way */
            const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            assert.ok(turn > 0, `${id}: corner ${i} is convex`);
            /* at the corner itself the outline stands off by r (1 / sin(half the angle) - 1) */
            const u = [a[0] - b[0], a[1] - b[1]], w = [c[0] - b[0], c[1] - b[1]];
            const cos = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]));
            const want = P.r[i] * (1 / Math.sin(Math.acos(cos) / 2) - 1);
            assert.ok(Math.abs(f(b) - want) < 0.05, `${id} corner ${i}: ${f(b)} != ${want}`);
        }
        /* its light: a brightness the shader can show, falling gently */
        assert.ok(P.g[2] > 40 && P.g[2] < 118 && Math.abs(P.g[3]) < 1 && Math.abs(P.g[4]) < 1, `${id} light`);
    }
    /* the shaders are written from these same numbers */
    for (const id of ['LU1', 'LU2', 'LL1', 'LL2']) {
        assert.ok(mShaders.mplatesL.includes(mShaders.chain('pl' + id, M.PLATES[id].v, M.PLATES[id].r, true)), id);
    }
    for (const id of ['RU1', 'RU2', 'RL1', 'RL2']) {
        assert.ok(mShaders.mplatesR.includes(mShaders.chain('pl' + id, M.PLATES[id].v, M.PLATES[id].r, true)), id);
    }
});

/* -------------------------------------------------------- the map's window */

test('the window: the black field between the plates, feathered in from their edges', () => {
    const W = M.WINDOW;
    /* down from the top edge of the wide band, far from its sides */
    const top = W.polys[0][0][1];
    const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    for (const d of [-5, 0, W.inset, W.inset + W.feather / 2, W.inset + W.feather, 60]) {
        const want = smooth((d - W.inset) / W.feather);
        assert.ok(Math.abs(Track.revealAt(M.AX, top + d) - want) < 1e-9, `${d} in from the top: ${want}`);
    }
    assert.strictEqual(Track.revealAt(M.AX, top + W.inset + W.feather / 2), 0.5, 'half-way through the feather');
    assert.strictEqual(Track.revealAt(M.AX, 170), 1, 'wide open in the middle');
    assert.strictEqual(Track.revealAt(M.AX, 430), 1, 'and down the neck between the lower plates');
    /* nothing of the picture on a plate, anywhere */
    let onPlate = 0, shown = 0;
    for (let y = 60; y < 560; y += 3) {
        for (let x = 250; x < 1560; x += 3) {
            const r = Track.revealAt(x, y);
            if (r > 0) shown++;
            const plate = Object.keys(M.PLATES).find((id) => M.convexDist(M.PLATES[id].v, x, y) < 0);
            if (plate) { onPlate++; assert.strictEqual(r, 0, `the picture shows on ${plate} at ${x}, ${y}`); }
        }
    }
    assert.ok(onPlate > 5000 && shown > 5000, 'the plates and the window were both sampled');
    /* and the shader computes the same thing, from the same polygons */
    W.polys.forEach((poly, i) => assert.ok(mShaders.mback.includes(mShaders.chain('win' + i, poly, null, true))));
    assert.ok(mShaders.mback.includes('(-d - ' + W.inset + '.0) / ' + W.feather + '.0'));
    assert.match(mShaders.mback, /a = 1\.0 - u_open \* t \* t \* \(3\.0 - 2\.0 \* t\)/);
});

test('the window lies inside BMW\'s map window, where Waze and the camera land', () => {
    const w = build().window, m = Track.MAP_WINDOW;
    assert.ok(w.x >= m.x && w.y >= m.y && w.x + w.w <= m.x + m.w && w.y + w.h <= m.y + m.h,
        JSON.stringify(w) + ' not inside ' + JSON.stringify(m));
    /* and it is the window's own bounds, on the panel */
    const b = M.windowBox();
    assert.ok(w.x <= M.px(b.x0) && w.x + w.w >= M.px(b.x1) && w.y <= M.py(b.y0) && w.y + w.h >= M.py(b.y1));
});

test('the back glass sits above the hosted map (z 0) and is the only see-through layer', () => {
    const t = build();
    const back = layer(t, 'back');
    assert.ok(back.z >= 1);
    assert.ok(t.layers.every((L) => L.z >= back.z), 'nothing of ours is under the glass');
    assert.deepStrictEqual([back.x, back.y, back.w], [0, 0, Panel.PANEL_WIDTH], 'it covers the panel');
    const open = (centre) => back.uniforms(state(t, {}, { centre })).u_open;
    assert.strictEqual(open(CENTRES[0]), 0, 'shut with nothing to show');
    assert.strictEqual(open(CENTRES[1]), 1, 'open on the map');
    assert.strictEqual(open(CENTRES[2]), 0.5, 'and as far as the camera has faded in');
    assert.strictEqual(open(CENTRES[3]), 0, 'our own turn card keeps it shut');
    assert.strictEqual(back.uniforms(state(t, {})).u_open, 0, 'shut when the centre says nothing');
    /* only the glass has a window in it */
    for (const [id, src] of Object.entries(mShaders)) {
        assert.strictEqual(/u_open/.test(src), ['mback', 'mpback', 'mpcentre'].includes(id), id);
    }
});

test('no readout stands where the picture shows', () => {
    for (const units of ['imperial', 'metric']) {
        const t = build({ units, mFixture: true, clock12: true });
        const st = state(t, { rpm: 3000, speedKmh: 330, gear: 'M8', fuelPct: 40, oilTempC: 100, rangeKm: 999,
                              ambientC: -22.5, clock: { h: 23, m: 59 } }, { centre: CENTRES[1] });
        for (const L of t.layers.filter(isText)) {
            const u = L.uniforms(st, 0);
            if (!u) continue;
            for (const q of quads(L, u)) {
                for (const [x, y] of [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h],
                                      [q.x + q.w / 2, q.y + q.h / 2]]) {
                    const ax = (x - M.ART.ox) / M.ART.s, ay = (y - M.ART.oy) / M.ART.s;
                    assert.strictEqual(Track.revealAt(ax, ay), 0, `${L.id} over the map at ${Math.round(x)}, ${Math.round(y)}`);
                }
            }
        }
    }
});

/* ---------------------------------------------------------- the car's rules */

test('M: nothing below the cut, nothing off the panel, nothing under a factory box', () => {
    /* what the car lays over us is decoration's to lose, never a reading's */
    const DECOR = /^(back|plates[LCR]|centreLines|flash|snow\d)$/;
    for (const style of M_STYLES) for (const id of Object.keys(Panel.PROFILES)) {
        const zones = Panel.keepClear(id).filter((z) => z.id !== 'bottomStrip');
        const t = build({ style, profile: id, mFixture: true, holiday: true, clock12: true, mPop: 'on' });
        const st = state(t, { rpm: 3000, speedKmh: 330, gear: 'M8', driveMode: 'SPORT_PLUS', fuelPct: 40, oilTempC: 100,
                              rangeKm: 999, ambientC: -22.5, clock: { h: 23, m: 59 } });
        for (const L of t.layers) {
            if (L.belowCut) assert.strictEqual(L.id, 'back', 'only the glass may be asked below the cut');
            else assert.ok(L.y + L.h <= Panel.BOTTOM_CUT, `${id}/${L.id} reaches ${L.y + L.h}`);
            assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= Panel.PANEL_WIDTH, `${id}/${L.id} off the panel`);
            assert.ok(Number.isInteger(L.x) && Number.isInteger(L.y) && Number.isInteger(L.w) && Number.isInteger(L.h),
                `${id}/${L.id} on whole pixels`);
            if (DECOR.test(L.id)) continue;
            /* a text layer is judged by its glyphs, anything else by its box */
            let ink = [L];
            if (isText(L)) { const u = L.uniforms(st, 0); ink = u ? inkOf(L, u) : []; }
            for (const z of zones) {
                /*
                 * The rev dial's layer is wide because it carries the level
                 * line across its top; down at the M box there is only the
                 * dial's rail, far to the right of it (checked below).
                 */
                if (z.id === 'mBoxB' && L.id === 'revDial') continue;
                assert.ok(!ink.some((r) => hits(r, z)), `${style}/${id}/${L.id} under ${z.name}`);
            }
        }
    }
    /* the rev dial at the heights of the right-hand M box: its innermost
       ink there is the fine contour, the mirror of the speed dial's */
    const z = Panel.PROFILES.mCarS58.extraZones.find((b) => b.id === 'mBoxB');
    for (let y = z.y; y <= z.y + z.h; y += 2) {
        const ay = (y - M.ART.oy) / M.ART.s;
        const inner = M.px(M.mirror(M.contourX(ay) + M.DIAL.conW));
        assert.ok(inner > z.x + z.w + 40, `the rev dial at y ${y} starts at ${Math.round(inner)}`);
    }
});

test('no glyph is hidden behind the cut corners of the glass', () => {
    for (const style of M_STYLES) for (const units of ['imperial', 'metric']) {
        const t = build({ style, units, mFixture: true, clock12: true, mPop: 'on' });
        const st = state(t, { rpm: 3000, speedKmh: 330, gear: 'M8', fuelPct: 40, oilTempC: 100, rangeKm: 999,
                              ambientC: -22.5, clock: { h: 23, m: 59 } });
        for (const L of t.layers.filter(isText)) {
            const u = L.uniforms(st, 0);
            for (const q of (u ? inkOf(L, u) : [])) {
                for (const [x, y] of [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h]]) {
                    assert.ok(!Panel.inCutCorner(x, y), `${style}/${L.id} (${units}) in a cut corner`);
                }
            }
        }
    }
});

test('M shaders fit the budget and avoid what the head unit refuses', () => {
    assert.deepStrictEqual(Object.keys(mShaders).sort(),
        ['mback', 'mbadge', 'mdiag', 'mfoot', 'mgauge', 'mnum', 'mpback', 'mpcentre', 'mplatesL', 'mplatesR', 'mprails',
         'mpsideL', 'mpsideR', 'mrails', 'mstrip', 'tturn'],
        'shaders only: the outline compiler is not listed with them');
    for (const [id, src] of Object.entries(mShaders)) {
        let vectors = 3;                      /* u_size, u_time, u_keep from the prelude */
        for (const m of src.matchAll(/uniform\s+(float|vec2|vec3|vec4)\s+(\w+)(\[(\d+)\])?/g)) {
            vectors += m[4] ? Number(m[4]) : 1;
        }
        assert.ok(vectors <= 48, `${id}: ${vectors} vectors`);
        assert.ok(!/\bbreak\b/.test(src), `${id} uses break`);
        for (const r of ['u_mvp', 'u_mv', 'u_m', 'u_v', 'u_p', 'u_normal']) {
            assert.ok(!new RegExp(`uniform\\s+\\w+\\s+${r}\\b`).test(src), `${id} declares ${r}`);
        }
    }
});

test('with everything switched on the M styles stay inside the layer budget', () => {
    for (const style of M_STYLES) {
        const t = build({ style, mFixture: true, holiday: true, revFlash: 'both', intro: true, clock12: true });
        assert.ok(t.layers.length <= 64, `${style}: ${t.layers.length} layers`);
        assert.strictEqual(new Set(t.layers.map((L) => L.id)).size, t.layers.length, 'no two layers share a name');
    }
});

test('every M layer is given exactly the uniforms its shader declares', () => {
    const BUILT_IN = ['u_size', 'u_time', 'u_keep', 'u_atlas', 'u_atlasSize'];
    for (const cfg of [{ mFixture: true, revFlash: 'both', clock12: true }, { mPanel: 'mode', units: 'metric', clock12: true },
                       { style: 'mplus', mFixture: true, revFlash: 'both', clock12: true },
                       { style: 'mplus', mPanel: 'mode', units: 'metric', clock12: true, mPop: 'off' }]) {
        const t = build(cfg);
        const st = state(t, { rpm: 7100, speedKmh: 120, gear: 'D', driveMode: 'SPORT', fuelPct: 40, oilTempC: 100,
                              rangeKm: 207, ambientC: 12.5, clock: { h: 12, m: 4 } }, { centre: CENTRES[3] });
        for (const L of t.layers) {
            const src = allShaders[L.shader];
            assert.ok(src, `${L.id}: no shader called ${L.shader}`);
            const u = L.uniforms(st, 0);
            assert.ok(u, L.id + ' shows in this state');
            const declared = [...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1])
                .filter((k) => !BUILT_IN.includes(k)).sort();
            assert.deepStrictEqual(Object.keys(u).sort(), declared, `${L.id} (${L.shader})`);
        }
    }
});

test('every uniform is sent in the shape its shader declares (floats, vectors, and arrays only of vec4)', () => {
    /*
     * The car's driver and the preview both type a value by its length:
     * one number a float, 2 / 3 / 4 a vector, anything longer an array of
     * vec4. A float array would arrive as nothing at all.
     */
    const want = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
    for (const cfg of [{ style: 'toro' }, { style: 'toro', holiday: true, intro: true, background: 'modern' },
                       { mFixture: true, revFlash: 'both', clock12: true }, { style: 'mplus', revFlash: 'both', clock12: true }]) {
        const t = Themes.build(atlas, 'x3m40i', Object.assign({ style: 'track' }, cfg));
        const st = state(t, { rpm: 7100, speedKmh: 120, gear: 'D', driveMode: 'SPORT', fuelPct: 40, oilTempC: 100, oilPressBar: 4,
                              rangeKm: 207, ambientC: 12.5, clock: { h: 12, m: 4 }, gLat: 0.2, gLon: 0.1 },
                         { centre: CENTRES[3], sinceOn: 3, now: 5000 });
        for (const L of t.layers) {
            const src = allShaders[L.shader], u = L.uniforms ? L.uniforms(st, 0) : null;
            if (!src || !u) continue;
            for (const [name, v] of Object.entries(u)) {
                const m = src.match(new RegExp('uniform\\s+(\\w+)\\s+' + name + '(?:\\[(\\d+)\\])?\\s*;'));
                if (!m) continue;                                   /* declared-or-not is another test's business */
                const len = typeof v === 'number' || typeof v === 'boolean' ? 1 : v.length;
                if (m[2]) {
                    assert.strictEqual(m[1], 'vec4', `${cfg.style || 'track'}/${L.id}.${name}: an array must be of vec4`);
                    assert.strictEqual(len, 4 * Number(m[2]), `${L.id}.${name}: ${len} numbers for vec4[${m[2]}]`);
                } else {
                    assert.strictEqual(len, want[m[1]], `${cfg.style || 'track'}/${L.id}.${name}: ${len} numbers for a ${m[1]}`);
                }
            }
        }
    }
    /* and no shader of ours declares an array of anything else */
    for (const [id, src] of Object.entries(allShaders)) {
        for (const m of src.matchAll(/uniform\s+(\w+)\s+\w+\[\d+\]/g)) assert.strictEqual(m[1], 'vec4', id + ' declares an array of ' + m[1]);
    }
});

test('every M layer gives finite uniforms and keeps its glyphs inside, in every centre mode', () => {
    const bad = new Set();
    for (const style of M_STYLES) for (const units of ['imperial', 'metric']) {
        for (const mPanel of ['4wd', 'mode']) {
            /* the numerals grow in M Sport Plus by default; here in M Sport too, with the driving-mode panel */
            const t = build({ style, units, mPanel, mFixture: true, clock12: mPanel === 'mode', mPop: mPanel === 'mode' ? 'on' : 'auto' });
            const sim = Sim.create(PROFILE);
            for (let i = 0; i < 1200; i++) {
                sim.step(1 / 60);
                if (i % 151) continue;
                const st = State.present(sim.raw(), PROFILE, t.settings);
                for (const centre of CENTRES) {
                    for (const gear of ['P', 'R', 'N', 'D', '1', '8', 'M8', 'S5']) {
                        for (const speed of [0, 99, 100, 330]) {
                            const s2 = Object.assign({}, st, { gear, speed, centre, modeLabel: 'SPORT PLUS' });
                            for (const L of t.layers) {
                                const u = L.uniforms ? L.uniforms(s2, 0) : null;
                                if (!u) continue;
                                for (const [k, v] of Object.entries(u)) {
                                    for (const n of (typeof v === 'number' ? [v] : v)) {
                                        if (!Number.isFinite(n)) bad.add(`${L.id}.${k} = ${n}`);
                                    }
                                }
                                if (!isText(L)) continue;
                                assert.ok(countOf(L, u) <= Text.MAX_GLYPHS);
                                for (const q of inkOf(L, u)) {
                                    if (q.x >= L.x - 1 && q.y >= L.y - 1 && q.x + q.w <= L.x + L.w + 1 &&
                                        q.y + q.h <= L.y + L.h + 1) continue;
                                    bad.add(`${style}/${L.id} (${units}, gear ${gear}, speed ${speed}): glyph outside ${L.w}x${L.h}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    assert.deepStrictEqual([...bad].sort(), []);
});

/* ---------------------------------------------------------------- the dials */

test('one value mapping: the scale is linear in height, and uneven where the car\'s is', () => {
    /* ticks stand a fixed step apart, the first at the foot */
    for (let k = 0; k < M.SCALE.n; k++) assert.ok(Math.abs(M.tickY(k) - M.tickY(k + 1) - M.SCALE.dy) < 1e-9);
    assert.strictEqual(M.tickY(0), M.SCALE.y0);
    for (const units of ['imperial', 'metric']) {
        const s = M.SPEED_SCALE[units];
        assert.strictEqual(s.length, M.SCALE.n + 1);
        s.forEach((v, k) => assert.strictEqual(M.speedTicks(v, units), k, `${v} is tick ${k}`));
        for (let v = 0; v < s[8] + 40; v += 0.5) {
            const a = M.speedTicks(v, units), b = M.speedTicks(v + 0.5, units);
            assert.ok(b >= a && b <= 8 && a >= 0, 'never falls back, never leaves the scale');
        }
    }
    assert.strictEqual(M.speedTicks(140, 'imperial'), 6.5, 'half-way between 120 and 160');
    assert.strictEqual(M.speedTicks(180, 'metric'), 5.5, 'half-way between 150 and 210');
    assert.strictEqual(M.speedTicks(-3, 'metric'), 0);
    assert.strictEqual(M.speedTicks(undefined, 'metric'), 0);
    assert.strictEqual(M.rpmTicks(4000), 4);
    assert.strictEqual(M.rpmTicks(9500), 8);
    assert.strictEqual(M.rpmTicks(undefined), 0);

    const t = build(), L = layer(t, 'speedDial'), R = layer(t, 'revDial');
    const val = (D, o) => D.uniforms(state(t, {}, o)).u_val;
    assert.strictEqual(val(L, { speed: 0 }), 0);
    assert.strictEqual(val(L, { speed: 80 }), 4, '80 mph is the fifth of nine numerals');
    assert.strictEqual(val(L, { speed: 200 }), 8);
    assert.strictEqual(val(L, { speed: 400 }), 8, 'held at the top, never wraps');
    assert.strictEqual(val(R, { rpm: 4000 }), 4);
    assert.strictEqual(val(layer(build({ units: 'metric' }), 'speedDial'), { speed: 180 }), 5.5);
    /* the rev dial is the speed dial through a mirror */
    assert.strictEqual(L.uniforms(state(t, {})).u_side, 0);
    assert.strictEqual(R.uniforms(state(t, {})).u_side, 1);
    assert.ok(Math.abs((L.x + R.x + R.w) / 2 - 960) <= 1 && Math.abs((L.x + L.w + R.x) / 2 - 960) <= 1);
    assert.deepStrictEqual([L.y, L.h], [R.y, R.h]);
});

test('each numeral stands at its own tick, and the two beside the value light up', () => {
    for (const units of ['imperial', 'metric']) {
        const t = build({ units });
        const st = state(t, {});
        const seen = { speed: [], rev: [] };
        for (const [id, which] of [['speedScaleA', 'speed'], ['speedScaleB', 'speed'], ['revScale', 'rev']]) {
            const L = layer(t, id), u = L.uniforms(st, 0);
            const str = read(L, u), q = quads(L, u);
            /* the tick each glyph belongs to: the shader's own sum */
            const ticks = q.map((g) => Math.floor((M.SCALE.y0 - ((g.y + g.h / 2) - M.ART.oy) / M.ART.s) / M.SCALE.dy + 0.5));
            assert.ok(Math.abs(u.u_art[1] + (q[0].y - L.y + q[0].h / 2) / u.u_art[2] -
                ((q[0].y + q[0].h / 2) - M.ART.oy) / M.ART.s) < 1e-9, 'u_art carries the layer to the artboard');
            const by = {};
            ticks.forEach((k, i) => { by[k] = (by[k] || '') + str[i]; });
            for (const [k, s] of Object.entries(by)) seen[which][k] = s;
            /* level with the tick: the figure's middle is on the tick's height */
            const size = q[0].h / atlas.faces.mw.glyphs['0'].h;
            for (const [i, g] of q.entries()) {
                const m = atlas.faces.mw.glyphs[str[i]];
                const base = g.y - m.by * size;                       /* the baseline */
                const mid = base - 0.35 * size;                       /* half a figure up */
                assert.ok(Math.abs(mid - M.py(M.tickY(ticks[i]))) < 0.75, `${id} "${str[i]}" is level with tick ${ticks[i]}`);
            }
        }
        assert.deepStrictEqual(seen.speed, M.SPEED_SCALE[units].map(String), units + ' speed numerals, foot to top');
        assert.deepStrictEqual(seen.rev, ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    }
    /* what lights: the numerals either side of the value (the shader's rule) */
    assert.match(mShaders.mnum, /float k = floor\(\(Y0 - gy\) \/ DY \+ 0\.5\);/);
    assert.match(mShaders.mnum, /float lit = smoothstep\(0\.0, 0\.25, 1\.0 - abs\(k - u_cfg\.z\)\);/);
    const t = build();
    assert.strictEqual(layer(t, 'speedScaleB').uniforms(state(t, {}, { speed: 76 })).u_cfg[2], 3.8,
        '76 mph: "60" and "80" light, as on the car');
    assert.strictEqual(layer(t, 'speedScaleA').uniforms(state(t, {}, { speed: 76 })).u_cfg[2], 3.8);
    assert.strictEqual(layer(t, 'revScale').uniforms(state(t, {}, { rpm: 738 })).u_cfg[2], 0.738);
});

test('the scale\'s numerals hug the rail: speed outside on the left, revs outside on the right', () => {
    for (const units of ['imperial', 'metric']) {
        const t = build({ units }), st = state(t, {});
        for (const id of ['speedScaleA', 'speedScaleB']) {
            const L = layer(t, id), u = L.uniforms(st, 0);
            for (const q of quads(L, u)) {
                const ay = ((q.y + q.h / 2) - M.ART.oy) / M.ART.s;
                assert.ok(q.x + q.w < M.px(M.rimOuterX(ay)) + 6, `${id}: left of the rim`);
            }
        }
        const R = layer(t, 'revScale');
        for (const q of quads(R, R.uniforms(st, 0))) {
            const ay = ((q.y + q.h / 2) - M.ART.oy) / M.ART.s;
            assert.ok(q.x > M.px(M.mirror(M.rimOuterX(ay))) - 6, 'revScale: right of the rim');
        }
    }
    /* clear of the tyre-pressure telltale, which the car draws beside the speed scale */
    const tyre = Panel.TELLTALES.find((z) => z.id === 'tyre');
    for (const id of ['speedScaleA', 'speedScaleB']) assert.ok(!hits(layer(build({ units: 'metric' }), id), tyre), id);
});

test('the red field follows the redline; the speed dial has none', () => {
    const zone = (cfg, id) => { const t = build(cfg); return layer(t, id).uniforms(state(t, {})).u_zone; };
    assert.deepStrictEqual(zone({}, 'speedDial'), [0, 0, 0, 0]);
    const z = zone({}, 'revDial');                       /* this car: 6750 */
    assert.ok(Math.abs(z[0] - 6.84) < 1e-9 && z[1] > 7.9 && z[1] <= 8, 'red from just past the redline to the top');
    assert.ok(z[2] < z[3] && z[3] < z[0], 'the amber field ends before the red starts');
    assert.ok(Math.abs(zone({ rpmRedline: 7000 }, 'revDial')[0] - 7.09) < 1e-9, 'it moves with the setting');
    const high = zone({ rpmRedline: 8000 }, 'revDial');
    assert.ok(high[0] < high[1], 'a redline at the top of the scale still leaves a field to see');
});

test('the limiter flashes the rev dial and the edges only when asked', () => {
    const warn = (cfg, lim) => { const t = build(cfg); return layer(t, 'revDial').uniforms(state(t, {}, { rpm: 7000, limiter: lim })).u_warn; };
    assert.strictEqual(warn({}, 1), 1);
    assert.strictEqual(warn({}, 0), 0);
    assert.strictEqual(warn({ revFlash: 'edges' }, 1), 0, 'edges only: the dial keeps still');
    const off = build({ revFlash: 'off' });
    assert.strictEqual(layer(off, 'revDial').uniforms(state(off, {}, { rpm: 7000, limiter: 1 })).u_warn, 0);
    assert.ok(!off.layers.some((L) => L.id === 'flash'));
    assert.ok(build({ revFlash: 'both' }).layers.some((L) => L.id === 'flash'));
    /* the speed dial never flashes */
    const t = build();
    assert.strictEqual(layer(t, 'speedDial').uniforms(state(t, {}, { limiter: 1 })).u_warn, 0);
});

/* ------------------------------------------------------------ the readouts */

test('both speeds are shown, each under its own unit', () => {
    const imp = build({ units: 'imperial' }), met = build({ units: 'metric' });
    const at = (t, speed) => state(t, {}, { speed });
    assert.strictEqual(says(imp, 'speed', at(imp, 60)), '60');
    assert.strictEqual(says(imp, 'speedUnit', at(imp, 60)), 'mph');
    assert.strictEqual(says(imp, 'speed2', at(imp, 60)), '97');
    assert.strictEqual(says(imp, 'speed2Unit', at(imp, 60)), 'km/h');
    assert.strictEqual(says(imp, 'speedTitle', at(imp, 60)), 'mph', 'the dial is titled in its own unit');
    assert.strictEqual(says(met, 'speed', at(met, 100)), '100');
    assert.strictEqual(says(met, 'speedUnit', at(met, 100)), 'km/h');
    assert.strictEqual(says(met, 'speed2', at(met, 100)), '62');
    assert.strictEqual(says(met, 'speed2Unit', at(met, 100)), 'mph');
    assert.strictEqual(says(met, 'speedTitle', at(met, 100)), 'km/h');
    assert.strictEqual(says(met, 'revTitle', at(met, 0)), '1/minx1000');
    /* a standing car reads 0 twice, as in the reference frame */
    assert.strictEqual(says(met, 'speed', at(met, 0)), '0');
    assert.strictEqual(says(met, 'speed2', at(met, 0)), '0');
    assert.strictEqual(says(met, 'speed', at(met, -2)), '0', 'never a negative speed');
});

test('the speed is flush right over its unit and keeps clear of the dial at three figures', () => {
    for (const units of ['imperial', 'metric']) {
        const t = build({ units }), L = layer(t, 'speed');
        const right = (n) => { const q = quads(L, L.uniforms(state(t, {}, { speed: n }), 0)); return q[q.length - 1].x + q[q.length - 1].w; };
        assert.ok(Math.abs(right(0) - right(330)) < 0.01 && Math.abs(right(0) - right(88)) < 0.01, 'one right edge for 0, 88 and 330');
        const q = quads(L, L.uniforms(state(t, {}, { speed: 330 }), 0))[0];
        for (let y = q.y; y <= q.y + q.h; y += 4) {
            const ay = (y - M.ART.oy) / M.ART.s;
            assert.ok(q.x > M.px(M.contourX(ay) + M.DIAL.conW) + 40, `330 starts at ${Math.round(q.x)}, on the dial`);
        }
    }
});

test('the gear is shown as the car names it', () => {
    const t = build();
    for (const g of ['P', 'R', 'N', 'D', 'D8', 'S5', 'M3', '1']) assert.strictEqual(says(t, 'gear', state(t, {}, { gear: g })), g);
    assert.strictEqual(says(t, 'gear', state(t, {})), 'P', 'P until the car says otherwise');
});

test('fuel and oil: lit from the foot to the reading, dark with no reading', () => {
    const t = build({ units: 'metric' });
    const fuel = (raw) => layer(t, 'fuelStrip').uniforms(state(t, raw));
    assert.deepStrictEqual([fuel({ fuelPct: 40 }).u_level, fuel({ fuelPct: 40 }).u_on], [0.4, 1]);
    assert.deepStrictEqual([fuel({}).u_level, fuel({}).u_on], [0, 0], 'no reading: nothing lit, not an empty tank');
    assert.strictEqual(fuel({ fuelPct: 100 }).u_level, 1);
    assert.strictEqual(fuel({}).u_side, 0);
    /* oil: the strip runs between its own end marks, in either unit */
    const oil = (cfg, c) => { const x = build(cfg); return layer(x, 'oilStrip').uniforms(state(x, c === null ? {} : { oilTempC: c })); };
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
    near(oil({ units: 'metric' }, 50).u_level, 0);
    near(oil({ units: 'metric' }, 100).u_level, 0.5);
    near(oil({ units: 'metric' }, 150).u_level, 1);
    near(oil({ units: 'imperial' }, (120 - 32) / 1.8).u_level, 0);          /* 120 F */
    near(oil({ units: 'imperial' }, (210 - 32) / 1.8).u_level, 0.5);        /* 210 F */
    near(oil({ units: 'imperial' }, (300 - 32) / 1.8).u_level, 1);          /* 300 F */
    assert.strictEqual(oil({ units: 'metric' }, 20).u_level, 0, 'a cold engine reads the foot, not below it');
    assert.strictEqual(oil({ units: 'metric' }, 190).u_level, 1);
    assert.strictEqual(oil({ units: 'metric' }, null).u_on, 0);
    assert.strictEqual(oil({ units: 'metric' }, 100).u_side, 1, 'the oil strip is the fuel strip mirrored');
    /* and the marks say what the strip measures */
    const marks = (cfg) => { const x = build(cfg); return says(x, 'oilLabels', state(x, {})); };
    assert.strictEqual(marks({ units: 'metric' }), '15010050');
    assert.strictEqual(marks({ units: 'imperial' }), '300210120');
    const unit = (cfg) => { const x = build(cfg); return says(x, 'oilUnit', state(x, {})); };
    assert.deepStrictEqual([unit({ units: 'metric' }), unit({ units: 'imperial' })], ['°C', '°F']);
    assert.strictEqual(says(t, 'fuelLabels', state(t, {})), '11/20');
});

test('the footer: clock, range and outside temperature, each only when the car has told us', () => {
    const t = build({ units: 'metric', clock12: true });
    const full = state(t, { rangeKm: 207, ambientC: 12.5, clock: { h: 12, m: 4 } });
    assert.strictEqual(says(t, 'clock', full), '12:04');
    assert.strictEqual(says(t, 'clockHalf', full), 'pm');
    assert.strictEqual(says(t, 'range', full), '207');
    assert.strictEqual(says(t, 'rangeUnit', full), 'km');
    assert.strictEqual(says(t, 'ambient', full), '+12.5');
    assert.strictEqual(says(t, 'ambientUnit', full), '°C');
    assert.strictEqual(says(t, 'ambient', state(t, { ambientC: -3.5 })), '-3.5', 'frost keeps its own sign');
    const none = state(t, {});
    for (const id of ['clock', 'clockHalf', 'range', 'rangeUnit', 'rangeIcon', 'ambient', 'ambientUnit']) {
        assert.strictEqual(layer(t, id).uniforms(none, 0), null, id + ' is dark with no reading');
    }
    /* am / pm follows the figures, however many there are */
    for (const clock of [{ h: 9, m: 41 }, { h: 12, m: 4 }, { h: 0, m: 0 }, { h: 23, m: 59 }]) {
        const st = state(t, { clock });
        const C = layer(t, 'clock'), H = layer(t, 'clockHalf');
        const cq = quads(C, C.uniforms(st, 0)), hq = quads(H, H.uniforms(st, 0));
        const gap = hq[0].x - (cq[cq.length - 1].x + cq[cq.length - 1].w);
        assert.ok(gap > -6 && gap < 14, `"${says(t, 'clock', st)} ${says(t, 'clockHalf', st)}": gap ${gap}`);
        assert.strictEqual(says(t, 'clockHalf', st), clock.h < 12 ? 'am' : 'pm');
    }
    /* the 24-hour clock has no am / pm */
    const t24 = build({ units: 'imperial' }), st24 = state(t24, { rangeKm: 207, ambientC: 12.5, clock: { h: 15, m: 7 } });
    assert.strictEqual(says(t24, 'clock', st24), '15:07');
    assert.strictEqual(layer(t24, 'clockHalf').uniforms(st24, 0), null);
    assert.strictEqual(says(t24, 'range', st24), '129');
    assert.strictEqual(says(t24, 'rangeUnit', st24), 'mi');
    assert.strictEqual(says(t24, 'ambient', st24), '+55');
    assert.strictEqual(says(t24, 'ambientUnit', st24), '°F');
});

test('the footer\'s panel names the drive, the driving mode, or is left out', () => {
    const fig = (cfg, st) => { const t = build(cfg); return says(t, 'driveFig', state(t, {}, st)) + says(t, 'driveWord', state(t, {}, st)); };
    assert.strictEqual(fig({}), '4WD', 'as in the reference frame, by default');
    assert.strictEqual(fig({ mPanel: '2wd' }), '2WD');
    const mode = build({ mPanel: 'mode' });
    assert.ok(!mode.layers.some((L) => /^drive(Fig|Word)$/.test(L.id)));
    assert.strictEqual(layer(mode, 'driveMode').uniforms(state(mode, {}), 0), null, 'nothing until the car names a mode');
    const sp = state(mode, { driveMode: 'SPORT_PLUS' });
    assert.ok(sp.modeLabel && !/CORSA/.test(sp.modeLabel), 'BMW\'s own names, not Toro\'s');
    assert.strictEqual(says(mode, 'driveMode', sp), sp.modeLabel.replace(/ /g, ''));
    const off = build({ mPanel: 'off' });
    assert.ok(!off.layers.some((L) => /^(footPanel|drive)/.test(L.id)), 'no panel, nothing on it');
    assert.strictEqual(build({ mPanel: 'nonsense' }).settings.mPanel, '4wd');
});

test('the car\'s own lamps are never imitated: they exist only in the reference fixture', () => {
    const LAMPS = /^(lamp|car|limit)/;
    for (const cfg of [{}, { units: 'metric' }, { mPanel: 'mode' }, { holiday: true }, { revFlash: 'both' }]) {
        assert.deepStrictEqual(build(cfg).layers.filter((L) => LAMPS.test(L.id)).map((L) => L.id), []);
    }
    const fx = build({ mFixture: true });
    assert.deepStrictEqual(fx.layers.filter((L) => LAMPS.test(L.id)).map((L) => L.id).sort(),
        ['carBody', 'carEdge', 'carSeats', 'lampBelt', 'lampBrake', 'lampLights', 'limitSign', 'limitWord']);
    /* and the fixture adds nothing else */
    assert.deepStrictEqual(fx.layers.filter((L) => !LAMPS.test(L.id)).map((L) => L.id), build().layers.map((L) => L.id));
    /* no logo of anyone's but the M mark the style is named for */
    assert.ok(!build().layers.some((L) => /brand|logo|roundel/i.test(L.id)));
});

/* --------------------------------------------------------- the centre */

test('the centre shows the right thing in each mode, and nothing of ours over a picture', () => {
    const t = build();
    const on = (id, centre) => layer(t, id).uniforms(state(t, {}, { centre })) !== null;
    for (const id of ['turnArrow', 'turnDist', 'turnSay']) {
        assert.ok(!on(id, CENTRES[0]), id + ': nothing with nothing to show');
        assert.ok(!on(id, CENTRES[1]), id + ': nothing over the map');
        assert.ok(!on(id, CENTRES[2]), id + ': nothing over the camera');
        assert.ok(on(id, CENTRES[3]), id + ': the turn card');
    }
    /* the card stands in the black field the window would open on */
    for (const id of ['turnArrow', 'turnDist', 'turnSay']) {
        const L = layer(t, id), w = t.window;
        assert.ok(L.x >= w.x && L.y >= w.y && L.x + L.w <= w.x + w.w && L.y + L.h <= w.y + w.h, id + ' inside the window');
    }
    const st = state(t, {}, { centre: CENTRES[4] });
    assert.strictEqual(says(t, 'turnDist', st), '1500ft');
    assert.strictEqual(says(t, 'turnSay', st), 'SHARPRIGHT');
});

test('maneuvers read as the right arrow and words', () => {
    const say = (m) => Track.turnOf(m).say;
    assert.strictEqual(say(TURNS[0]), 'TURN LEFT');
    assert.strictEqual(say(TURNS[1]), 'SHARP RIGHT');
    assert.strictEqual(Track.turnOf(TURNS[2]).kind, 1);
    assert.strictEqual(say(TURNS[3]), 'EXIT 3');
    assert.strictEqual(say(TURNS[4]), 'KEEP RIGHT');
    assert.strictEqual(Track.turnOf(TURNS[5]).kind, 3);
    assert.ok(Track.turnOf(TURNS[0]).angle < 0 && Track.turnOf(TURNS[1]).angle > 0, 'left is negative');
    for (const m of TURNS) assert.ok(say(m).replace(/\s/g, '').length <= 12, say(m));
    assert.strictEqual(Track.turnOf(null), null);
});

test('the holiday dressing keeps off the M style\'s instruments', () => {
    const t = build({ holiday: true, mFixture: true, clock12: true });
    const st = state(t, { rpm: 3000, speedKmh: 330, gear: 'M8', fuelPct: 40, oilTempC: 100, rangeKm: 999,
                          ambientC: -22.5, clock: { h: 23, m: 59 } });
    const tree = layer(t, 'tree');
    for (const L of t.layers) {
        if (/^(back|flash|snow\d|tree)$/.test(L.id)) continue;
        const ink = isText(L) ? (L.uniforms(st, 0) ? quads(L, L.uniforms(st, 0)) : []) : [L];
        assert.ok(!ink.some((r) => hits(r, tree)), L.id + ' behind the tree');
    }
    for (const z of Panel.keepClear('x3m40i')) assert.ok(!hits(tree, z), 'the tree under ' + z.name);
    /* the snow falls down the sides, outside the plates and the strips, and
       keeps off whatever is read there: each such layer is inside a box
       the snow leaves clear */
    for (const id of ['snow0', 'snow1']) {
        const S = layer(t, id), clear = S.uniforms().u_clear, boxes = [];
        assert.strictEqual(clear.length, 16, 'four boxes');
        for (let i = 0; i < 16; i += 4) if (clear[i + 2] > 0) boxes.push(clear.slice(i, i + 4));
        for (const L of t.layers.filter((x) => /^plates|Strip$|^speed$|^gear$/.test(x.id))) assert.ok(!hits(L, S), `${L.id} under ${id}`);
        const read = t.layers.filter((x) => t.places.clearOf.test(x.id) && hits(x, S));
        assert.ok(read.length >= 2, id + ' has instruments to keep off');
        for (const L of read) {
            /* the part of it under the snow */
            const x0 = Math.max(L.x, S.x) - S.x, y0 = Math.max(L.y, S.y) - S.y;
            const x1 = Math.min(L.x + L.w, S.x + S.w) - S.x, y1 = Math.min(L.y + L.h, S.y + S.h) - S.y;
            assert.ok(boxes.some((b) => x0 >= b[0] - 0.5 && y0 >= b[1] - 0.5 && x1 <= b[0] + b[2] + 0.5 && y1 <= b[1] + b[3] + 0.5),
                `${L.id} is kept clear by ${id}`);
        }
    }
});

/* ------------------------------------------------------- M Sport Plus */

const PLUS = M.PLUS;
const plusBuild = (cfg) => build(Object.assign({ style: 'mplus' }, cfg));
const artOfPanel = (x, y) => [(x - M.ART.ox) / M.ART.s, (y - M.ART.oy) / M.ART.s];
const BUSY = { rpm: 3000, speedKmh: 330, gear: 'M8', driveMode: 'SPORT_PLUS', fuelPct: 40, oilTempC: 100, rangeKm: 999,
               ambientC: -22.5, clock: { h: 23, m: 59 } };

test('M Sport Plus is M Sport with another middle, and nothing else', () => {
    /* the middle: the glass (its window), the plates, the rails' inner ends, the centre lines */
    const MIDDLE = /^(back|plates[LCR]|rails|centreLines)$/;
    for (const cfg of [{ units: 'metric', mFixture: true, clock12: true }, { units: 'imperial', mPanel: 'mode', revFlash: 'both' }]) {
        /* numerals as the car has them in both, so only the middle can differ */
        const a = build(Object.assign({ mPop: 'off' }, cfg)), b = plusBuild(Object.assign({ mPop: 'off' }, cfg));
        const rest = (t) => t.layers.filter((L) => !MIDDLE.test(L.id));
        assert.deepStrictEqual(rest(b).map((L) => L.id), rest(a).map((L) => L.id), 'the same layers, in the same order');
        assert.deepStrictEqual(a.layers.filter((L) => MIDDLE.test(L.id)).map((L) => L.id),
            ['back', 'platesL', 'platesR', 'rails', 'centreLines']);
        assert.deepStrictEqual(b.layers.filter((L) => MIDDLE.test(L.id)).map((L) => L.id),
            ['back', 'platesL', 'platesC', 'platesR', 'rails'], 'no centre lines: the rails meet instead');
        for (const centre of [CENTRES[0], CENTRES[1], CENTRES[4]]) {
            const sa = state(a, BUSY, { centre, limiter: 1 }), sb = state(b, BUSY, { centre, limiter: 1 });
            rest(a).forEach((L, i) => {
                const N = rest(b)[i];
                assert.deepStrictEqual([N.x, N.y, N.w, N.h, N.z, N.shader], [L.x, L.y, L.w, L.h, L.z, L.shader], L.id + ' is where it was');
                assert.deepStrictEqual(N.uniforms(sb, 0), L.uniforms(sa, 0), L.id + ' shows what it showed');
            });
        }
    }
    /* and M Sport itself draws with the shaders it always had */
    const shadersOf = (t) => [...new Set(t.layers.map((L) => L.shader))].sort();
    assert.deepStrictEqual(shadersOf(build({ revFlash: 'both', mFixture: true })),
        ['flash', 'mback', 'mbadge', 'mdiag', 'mfoot', 'mgauge', 'mnum', 'mplatesL', 'mplatesR', 'mrails', 'mstrip', 'text', 'tturn']);
    assert.deepStrictEqual(shadersOf(plusBuild({ revFlash: 'both' })),
        ['flash', 'mfoot', 'mgauge', 'mnum', 'mpback', 'mpcentre', 'mprails', 'mpsideL', 'mpsideR', 'mstrip', 'text', 'tturn']);
});

test('Plus plates: clockwise convex slabs on one lean, apart from each other, inside the dials', () => {
    const ids = Object.keys(PLUS.PLATES);
    assert.deepStrictEqual(ids, ['A', 'B', 'B2', 'C', 'D', 'F', 'E']);
    for (const id of ids) {
        const P = PLUS.PLATES[id], k = P.v.length, f = outline(P.v, P.r, true);
        const cx = P.v.reduce((a, v) => a + v[0], 0) / k, cy = P.v.reduce((a, v) => a + v[1], 0) / k;
        assert.ok(f([cx, cy]) < -10 && M.convexDist(P.v, cx, cy) < -10, `${id}: clockwise, its middle inside`);
        for (let i = 0; i < k; i++) {
            const a = P.v[(i + k - 1) % k], b = P.v[i], c = P.v[(i + 1) % k];
            assert.ok((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0, `${id}: corner ${i} is convex`);
            /* every edge is level or on the one lean (the foot of the left plate follows its dial instead) */
            const dx = c[0] - b[0], dy = c[1] - b[1];
            if (Math.abs(dy) > 1 && !(id === 'A' && i === 2)) {
                assert.ok(Math.abs(Math.abs(dx / dy) - PLUS.slope) < 0.012, `${id} edge ${i}: ${dx / dy}`);
            }
            /* the shader's outline and the plain sums agree, corner by corner */
            const u = [a[0] - b[0], a[1] - b[1]], w = [c[0] - b[0], c[1] - b[1]];
            const cos = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]));
            const want = P.r[i] * (1 / Math.sin(Math.acos(cos) / 2) - 1);
            assert.ok(Math.abs(f(b) - want) < 0.05 && Math.abs(M.roundDist(P.v, P.r, b[0], b[1]) - want) < 1e-9, `${id} corner ${i}`);
        }
        /* inside the dials: clear of both fine contours, under the top line, over the rails */
        for (const v of P.v) {
            assert.ok(v[0] > M.contourX(v[1]) + 20 && v[0] < M.mirror(M.contourX(v[1])) - 20, `${id} keeps off the dials`);
            assert.ok(v[1] >= PLUS.top && v[1] <= PLUS.bottom && PLUS.top > M.DIAL.topY1 + 20 && PLUS.bottom < M.DIAL.railTop - 20);
        }
    }
    /* no two plates share a point; the black between neighbours is at least a few units */
    for (let y = 100; y < 475; y += 2.5) {
        for (let x = 290; x < 1500; x += 2.5) {
            const near = ids.filter((id) => M.roundDist(PLUS.PLATES[id].v, PLUS.PLATES[id].r, x, y) < 2.5);
            assert.ok(near.length <= 1, `plates ${near} meet at ${x}, ${y}`);
        }
    }
    /* the shaders are written from these numbers */
    for (const [sh, set] of [['mpsideL', ['A', 'B', 'B2']], ['mpcentre', ['C']], ['mpsideR', ['D', 'F', 'E']]]) {
        for (const id of set) assert.ok(mShaders[sh].includes(mShaders.chain('pp' + id, PLUS.PLATES[id].v, PLUS.PLATES[id].r, true)), sh + ' ' + id);
    }
    /* and every plate is inside its layer */
    const t = plusBuild();
    for (const [lid, set] of [['platesL', ['A', 'B', 'B2']], ['platesC', ['C']], ['platesR', ['D', 'F', 'E']]]) {
        const L = layer(t, lid);
        for (const id of set) for (const v of PLUS.PLATES[id].v) {
            assert.ok(M.px(v[0]) >= L.x && M.px(v[0]) <= L.x + L.w && M.py(v[1]) >= L.y && M.py(v[1]) <= L.y + L.h, `${id} in ${lid}`);
        }
    }
});

test('Plus lattice and stripes: fine lines on the plates\' lean, two bands on the centre plate', () => {
    for (const [i, L] of PLUS.LATTICE.entries()) {
        const dx = L[2] - L[0], dy = L[3] - L[1];
        assert.ok(dy === 0 || Math.abs(Math.abs(dx / dy) - PLUS.slope) < 0.012, `line ${i} is level or on the lean`);
        assert.ok(Math.min(L[1], L[3]) >= PLUS.top - 0.01 && Math.max(L[1], L[3]) <= PLUS.bottom + 0.01, `line ${i} within the plates' height`);
        /* a line starts and stops on a plate (it is not seen in the black between) */
        for (const [x, y] of [[L[0], L[1]], [L[2], L[3]]]) {
            const d = Math.min(...Object.values(PLUS.PLATES).map((P) => M.roundDist(P.v, P.r, x, y)));
            assert.ok(d < 4, `line ${i} ends ${d.toFixed(1)} from a plate`);
        }
    }
    const num = (v) => (v % 1 ? String(v) : v + '.0');
    for (const sh of ['mpsideL', 'mpcentre', 'mpsideR']) {
        for (const L of PLUS.LATTICE) {
            assert.ok(mShaders[sh].includes(`sdSegment(p, vec2(${num(L[0])}, ${num(L[1])}), vec2(${num(L[2])}, ${num(L[3])}), 0.0)`),
                sh + ' draws every line');
        }
    }
    /* the stripes: equal bands with a band of plate between, inside the centre plate at their strongest */
    const S = PLUS.STRIPES, C = PLUS.PLATES.C;
    const wb = S.blue[1] - S.blue[0], wr = S.red[1] - S.red[0], gap = S.red[0] - S.blue[1];
    assert.ok(Math.abs(wb - wr) < 1 && Math.abs(gap - wb) < 3, 'blue, plate, red: three bands alike');
    for (const b of [S.blue[0], S.blue[1], S.red[0], S.red[1]]) {
        assert.ok(M.roundDist(C.v, C.r, b - PLUS.slope * S.peak, S.peak) < -10, 'a stripe edge at its strongest is on the centre plate');
    }
    assert.ok(S.rise < PLUS.top && S.peak > PLUS.top && S.gone < PLUS.bottom, 'already showing at the plate\'s top, gone before its foot');
    /* they stand back for a turn card, which is read over them */
    const t = plusBuild(), Cn = layer(t, 'platesC');
    assert.strictEqual(Cn.uniforms(state(t, {}, { centre: CENTRES[0] })).u_calm, 0);
    assert.strictEqual(Cn.uniforms(state(t, {}, { centre: CENTRES[1] })).u_calm, 0);
    assert.strictEqual(Cn.uniforms(state(t, {}, { centre: CENTRES[3] })).u_calm, 1);
    assert.match(mShaders.mpcentre, /lit \*= 1\.0 - 0\.8 \* u_calm;/);
    for (const id of ['turnArrow', 'turnDist', 'turnSay']) {
        const L = layer(t, id), w = t.window;
        assert.ok(L.x >= w.x && L.y >= w.y && L.x + L.w <= w.x + w.w && L.y + L.h <= w.y + w.h, id + ' on the centre plate');
    }
});

test('Plus rails meet in the middle, each cut on the lean', () => {
    const R = PLUS.RAILS;
    assert.ok(Math.abs((R.blueEnd + R.redStart) / 2 - M.AX) < 0.5, 'the gap is about the dials\' axis');
    assert.ok(R.redStart - R.blueEnd > 60 && R.redStart - R.blueEnd < 140);
    assert.ok(R.y > M.DIAL.railTop && R.y < M.DIAL.railBottom);
    assert.ok(mShaders.mprails.includes(`float endB = ${R.blueEnd} - (p.y - ${R.y}) * ${PLUS.slope};`));
    assert.ok(mShaders.mprails.includes(`float endR = ${R.redStart} + (p.y - ${R.y}) * ${PLUS.slope};`));
    /* everything else about the rails is M Sport's own source */
    const strip = (src) => src.split('\n').filter((l) => !/float end[BR] =/.test(l)).join('\n');
    assert.strictEqual(strip(mShaders.mprails), strip(mShaders.mrails));
});

test('Plus window: the map comes up through the centre plate on a curve with no corner in it', () => {
    const W = PLUS.WINDOW, C = PLUS.PLATES.C;
    /* the curve: level at both ends, and its slope too; half-way at half */
    assert.deepStrictEqual([M.smoother(-1), M.smoother(0), M.smoother(0.5), M.smoother(1), M.smoother(2)], [0, 0, 0.5, 1, 1]);
    for (const e of [1e-3, 1e-2]) {
        assert.ok(M.smoother(e) < 12 * e * e * e && 1 - M.smoother(1 - e) < 12 * e * e * e, 'no corner where the fade starts or ends');
    }
    for (let t = 0; t < 1; t += 0.01) assert.ok(M.smoother(t + 0.01) > M.smoother(t), 'it only ever rises');
    /* down from the top edge, far from the sides */
    const top = W.poly[0][1], x = 950;
    for (const d of [-4, 0, W.inset, W.inset + W.feather / 4, W.inset + W.feather / 2, W.inset + W.feather, 90]) {
        const want = M.smoother((d - W.inset) / W.feather);
        assert.ok(Math.abs(Track.plusRevealAt(x, top + d) - want) < 1e-9, `${d} in from the top`);
    }
    assert.strictEqual(Track.plusRevealAt(M.AX, 280), 1, 'wide open in the middle');
    assert.ok(W.feather >= 36, 'a wide fade, not a line');
    /* the fade is as wide all round: across each straight side, the same curve */
    for (let i = 0; i < 3; i++) {
        const a = W.poly[i], b = W.poly[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;      /* inward */
        for (const d of [W.inset + W.feather / 4, W.inset + W.feather / 2, W.inset + 0.75 * W.feather]) {
            assert.ok(Math.abs(Track.plusRevealAt(mx + nx * d, my + ny * d) - M.smoother((d - W.inset) / W.feather)) < 1e-6, `side ${i}, ${d} in`);
        }
    }
    /* the corners are rounded: a point inside the sharp corner but outside its arc shows nothing */
    assert.ok(W.r.every((r) => r >= 10));
    const tr = W.poly[1];
    assert.strictEqual(Track.plusRevealAt(tr[0] - 30, tr[1] + 12), 0, 'the fade turns the corner, it does not point into it');

    /* where it shows: only on the centre plate, well inside it; never on another plate or in the black */
    let shown = 0;
    for (let y = 95; y < 480; y += 2) {
        for (let xx = 280; xx < 1510; xx += 2) {
            const r = Track.plusRevealAt(xx, y);
            if (r <= 0) continue;
            shown++;
            assert.ok(M.roundDist(C.v, C.r, xx, y) < -2 && M.plusWindowDist(xx, y) < -W.inset,
                `the picture at ${xx}, ${y} is off the centre plate`);
        }
    }
    assert.ok(shown > 20000, 'a real window: ' + shown + ' samples');
    /* the glass's hole is always under plate the picture has not begun to thin */
    for (let y = 100; y < 475; y += 1.5) {
        for (let xx = 540; xx < 1270; xx += 1.5) {
            const hole = Math.max(M.plusWindowDist(xx, y), M.roundDist(C.v, C.r, xx, y)) + 2;      /* the shader's own sum */
            if (hole >= 0.5 || hole < -1.5) continue;                                              /* on the hole's edge */
            assert.ok(M.roundDist(C.v, C.r, xx, y) < -1, 'the hole\'s edge is under the plate');
            assert.ok(Track.plusRevealAt(xx, y) < 0.004, 'where the plate is still whole');
        }
    }
    /* the shaders work it out from the same outline and numbers */
    const win = mShaders.chain('pwin', W.poly, W.r, true);
    assert.ok(mShaders.mpcentre.includes(win) && mShaders.mpback.includes(win));
    assert.ok(mShaders.mpcentre.includes(`float t = clamp((-pwin(p) - ${W.inset}.0) / ${W.feather}.0, 0.0, 1.0);`));
    assert.ok(mShaders.mpcentre.includes('a *= 1.0 - u_open * smoother(t);'));
    assert.ok(mShaders.mpcentre.includes('float smoother(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }'));
    assert.ok(mShaders.mpback.includes('a = 1.0 - ac(max(pwin(p), ppC(p)) + 2.0);'));
    assert.ok(mShaders.mpback.includes(mShaders.chain('ppC', C.v, C.r, true)));
});

test('Plus window: on the panel it is inside BMW\'s map window, opens with the map, and no readout stands in it', () => {
    const t = plusBuild(), m = Track.MAP_WINDOW, w = t.window;
    assert.ok(w.x >= m.x && w.x + w.w <= m.x + m.w && w.y + w.h <= m.y + m.h, JSON.stringify(w));
    /* its outline starts a little above BMW's window; the picture itself never does */
    for (let y = 100; y < 640; y += 1) {
        for (let x = 380; x < 1540; x += 3) {
            const [ax, ay] = artOfPanel(x + 0.5, y + 0.5);
            if (Track.plusRevealAt(ax, ay) > 0) {
                assert.ok(x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h, `the picture at ${x}, ${y} is outside BMW's map window`);
            }
        }
    }
    /* the glass and the centre plate open together, by the centre's mode */
    for (const id of ['back', 'platesC']) {
        const open = (centre) => layer(t, id).uniforms(state(t, {}, { centre })).u_open;
        assert.deepStrictEqual([open(CENTRES[0]), open(CENTRES[1]), open(CENTRES[2]), open(CENTRES[3])], [0, 1, 0.5, 0], id);
        assert.strictEqual(layer(t, id).uniforms(state(t, {})).u_open, 0);
    }
    assert.ok(t.layers.every((L) => L.z >= layer(t, 'back').z), 'nothing of ours under the glass');
    /* no figure, word or symbol where the picture shows - grown numerals included */
    for (const units of ['imperial', 'metric']) {
        const tt = plusBuild({ units, mFixture: true, clock12: true });
        const st = state(tt, BUSY, { centre: CENTRES[1] });
        for (const L of tt.layers.filter(isText)) {
            const u = L.uniforms(st, 0);
            for (const q of (u ? inkOf(L, u) : [])) {
                for (const [x, y] of [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.h], [q.x + q.w, q.y + q.h], [q.x + q.w / 2, q.y + q.h / 2]]) {
                    const [ax, ay] = artOfPanel(x, y);
                    assert.strictEqual(Track.plusRevealAt(ax, ay), 0, `${L.id} over the map at ${Math.round(x)}, ${Math.round(y)}`);
                }
            }
        }
    }
});

/* -------------------------------------------------- numerals at the marker */

test('the numerals grow as the marker passes: on in M Sport Plus, the car\'s size in M Sport, a setting in both', () => {
    const grow = (cfg) => { const t = build(cfg); return layer(t, 'revScale').uniforms(state(t, {})).u_grow; };
    assert.strictEqual(grow({}), 0, 'M Sport: as the car has them');
    assert.strictEqual(grow({ style: 'mplus' }), Track.GROW);
    assert.strictEqual(grow({ mPop: 'on' }), Track.GROW);
    assert.strictEqual(grow({ style: 'mplus', mPop: 'off' }), 0);
    assert.strictEqual(grow({ mPop: 'nonsense' }), 0);
    assert.ok(Track.GROW >= 0.15 && Track.GROW <= 0.3, 'enough to see, not enough to crowd the rim');
    /* the shader's rule: full size a tick away, largest with the marker level, smooth between */
    assert.match(mShaders.mnum, /float near = clamp\(1\.0 - abs\(k - u_cfg\.z\), 0\.0, 1\.0\);/);
    assert.match(mShaders.mnum, /float s = 1\.0 \+ u_grow \* near \* near \* \(3\.0 - 2\.0 \* near\);/);
    assert.match(mShaders.mnum, /vec2 pp = u_grow > 0\.0 \? an \+ \(p - an\) \/ s : p;/, 'with no growth a numeral is drawn exactly as before');
    /* a numeral grows about one point, all of its figures together, from inside itself */
    for (const units of ['imperial', 'metric']) {
        const t = plusBuild({ units });
        for (const id of ['speedScaleA', 'speedScaleB', 'revScale']) {
            const L = layer(t, id), u = L.uniforms(state(t, {}), 0), q = quads(L, u), big = grownQuads(L, u);
            assert.strictEqual(u.u_ax.length, Text.MAX_GLYPHS * 4, 'a vec4 a glyph, as every uniform array is sent');
            const byTick = {};
            big.forEach((g, i) => { (byTick[g.k] = byTick[g.k] || []).push(i); });
            for (const [k, is] of Object.entries(byTick)) {
                assert.strictEqual(new Set(is.map((i) => u.u_ax[i * 4])).size, 1, `${id} tick ${k}: one anchor`);
                const x0 = Math.min(...is.map((i) => q[i].x)), x1 = Math.max(...is.map((i) => q[i].x + q[i].w));
                assert.ok(L.x + u.u_ax[is[0] * 4] > x0 && L.x + u.u_ax[is[0] * 4] < x1, `${id} tick ${k}: anchored inside itself`);
                /* and level with its own tick: the shader's tick for the glyph, and the layout's, agree */
                for (const i of is) assert.ok(Math.abs(L.y + u.u_ax[i * 4 + 1] - M.py(M.tickY(Number(k)))) < 1e-6, `${id} tick ${k}: level`);
                /* it stays level with its tick: as much above as below */
                for (const i of is) {
                    assert.ok(Math.abs((big[i].y + big[i].h / 2) - (q[i].y + q[i].h / 2)) < 0.05);
                    assert.ok(Math.abs(big[i].h / q[i].h - (1 + Track.GROW)) < 1e-9);
                }
                /* grown, it is still clear of its rail: left of the speed dial's rim, right of the rev dial's */
                const ay = M.tickY(Number(k));
                if (id === 'revScale') {
                    assert.ok(Math.min(...is.map((i) => big[i].x)) > M.px(M.mirror(M.rimOuterX(ay))) + 4, `${id} tick ${k} off the rim`);
                } else {
                    assert.ok(Math.max(...is.map((i) => big[i].x + big[i].w)) < M.px(M.rimOuterX(ay)) + 4.5, `${id} tick ${k} off the rim`);
                }
            }
        }
        /* beside the tyre-pressure telltale the numeral grows away from it, not into it */
        const A = layer(t, 'speedScaleA'), uA = A.uniforms(state(t, {}), 0), tyre = Panel.TELLTALES.find((z) => z.id === 'tyre');
        const five = grownQuads(A, uA).filter((g) => g.k === 5);
        assert.ok(five.length === 3 && five.every((g) => !hits(g, tyre)), 'the numeral beside the telltale keeps out of it');
        const plain = quads(A, uA).filter((_, i) => grownQuads(A, uA)[i].k === 5);
        const midOf = (qs) => (Math.min(...qs.map((g) => g.x)) + Math.max(...qs.map((g) => g.x + g.w))) / 2;
        assert.ok(A.x + uA.u_ax[9 * 4] < midOf(plain) - 3, 'its anchor is nearer the telltale than its middle is');
        /* every other numeral grows about its own middle */
        const R = layer(t, 'revScale'), uR = R.uniforms(state(t, {}), 0), qR = quads(R, uR);
        qR.forEach((g, i) => assert.ok(Math.abs(R.x + uR.u_ax[i * 4] - (g.x + g.w / 2)) < 1e-6));
    }
});

/* ---------------------------------------------------------------- the 7 */

test('the 7: its leg hangs from the squared end of its bar, in both cuts', () => {
    const zlib = require('zlib'), fs = require('fs'), path = require('path');
    const px = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', 'atlas.r8.gz')));
    assert.strictEqual(px.length, atlas.size * atlas.size);
    for (const face of ['mw', 'mn']) {
        const g = atlas.faces[face].glyphs['7'], zero = atlas.faces[face].glyphs['0'];
        assert.deepStrictEqual([g.tw, g.th], [zero.tw, zero.th], face + ': as wide and as tall as its neighbours');
        const H = 0.70 * atlas.emPx, pad = (g.th - H) / 2, W = g.tw - 2 * pad;
        /* ink at a point of the figure's own box (in figure heights), from the distance field */
        const ink = (fx, fy) => px[(g.v + Math.round(pad + fy * H)) * atlas.size + g.u + Math.round(pad + fx * H)] > 127;
        const w = W / H;
        assert.ok(ink(0.06, 0.09) && ink(w / 2, 0.09) && ink(w - 0.06, 0.09), face + ': a bar the full width');
        assert.ok(ink(w - 0.05, 0.215), face + ': the bar\'s right end runs on down, square');
        assert.ok(!ink(w - 0.52, 0.215), face + ': and nothing hangs from the bar further left (the old leg did)');
        assert.ok(!ink(w - 0.03, 0.42), face + ': then the leg leans away from that side');
        assert.ok(ink(0.36, 0.93) && !ink(0.08, 0.93) && !ink(w - 0.35, 0.93), face + ': down to a foot left of the middle');
    }
});

/* ------------------------------------------------------------- the clock */

test('the time of day comes from the cluster\'s own clock, not the head unit\'s', () => {
    const UTC = Date.UTC(2026, 10, 21, 17, 4, 20);              /* the head unit runs on UTC */
    const H = 3600000, MIN = 60000;
    const show = (h, m, s, status) => ({ displayHour: h, displayMinute: m, displaySecond: s, statusDisplayClockTimeDate: status });
    assert.strictEqual(Vehicle.clockOffset(show(12, 4, 20, 1), UTC), 19 * H, 'five hours behind UTC, kept as time ahead');
    assert.strictEqual(Vehicle.clockOffset(show(17, 4, 20, 1), UTC), 0);
    assert.strictEqual(Vehicle.clockOffset(show(22, 34, 20, 3), UTC), 5 * H + 30 * MIN, 'half-hour zones too');
    assert.strictEqual(Vehicle.clockOffset(show(12, 11, 50, 1), UTC), 19 * H + 7 * MIN + 30000,
        'a clock the owner keeps fast stays as fast as the car shows it');
    assert.strictEqual(Vehicle.clockOffset(show(12, 4, 255, 1), UTC), 19 * H - 20000, 'no seconds given: the minute as it stands');
    assert.strictEqual(Vehicle.clockOffset(show(12, 4, 0, 2), UTC), null, 'the cluster shows --:--: so do we');
    assert.strictEqual(Vehicle.clockOffset(show(12, 4, 0, 15), UTC), undefined, 'not filled in: leave what we had');
    assert.strictEqual(Vehicle.clockOffset(show(31, 4, 0, 1), UTC), null, 'an hour that is not one');
    assert.strictEqual(Vehicle.clockOffset(show(12, -1, 0, 1), UTC), null);
    assert.strictEqual(Vehicle.clockOffset(undefined, UTC), undefined);

    /* through the reader: no time until the cluster has told us, the car's time after */
    const r = Vehicle.createReader({});
    const KOMBI = 'de.bmw.infotainment.KombiIF';
    assert.ok(Vehicle.SIGNALS[KOMBI].statusShowTimeDate, 'the reader asks the cluster for its time');
    assert.strictEqual(r.raw(UTC).clock, undefined, 'no time is better than the wrong one');
    r.receive(KOMBI, 'statusShowTimeDate', show(12, 4, 52, 1), UTC);
    assert.deepStrictEqual(r.raw(UTC).clock, { h: 12, m: 4 });
    assert.deepStrictEqual(r.raw(UTC + 7999).clock, { h: 12, m: 4 }, 'the minute turns over with the car\'s own');
    assert.deepStrictEqual(r.raw(UTC + 8000).clock, { h: 12, m: 5 });
    assert.deepStrictEqual(r.raw(UTC + 12 * H).clock, { h: 0, m: 4 }, 'and it runs on past midnight');
    r.receive(KOMBI, 'statusShowTimeDate', show(12, 4, 0, 15), UTC + 1000);
    assert.deepStrictEqual(r.raw(UTC + 1000).clock, { h: 12, m: 4 }, 'an empty message changes nothing');
    r.receive(KOMBI, 'statusShowTimeDate', show(12, 4, 0, 2), UTC + 2000);
    assert.strictEqual(r.raw(UTC + 2000).clock, undefined, 'the cluster\'s clock is unset: ours goes dark');
});
