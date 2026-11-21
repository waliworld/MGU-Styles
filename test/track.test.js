'use strict';
/*
 * The Track theme (TBW brief) against the car's limits and the brief's own
 * numbers: the feather checkpoints, the window inside BMW's map window, and
 * the same bottom-strip, keep-clear, budget and clipping rules as Toro.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Panel = require('../src/geometry/panel.js');
const Themes = require('../src/theme/index.js');
const Track = require('../src/theme/track.js');
const State = require('../src/engine/state.js');
const Sim = require('../preview/sim.js');
const atlas = require('../assets/fonts/atlas.json');
const trackShaders = require('../src/shaders/mcluster.js');
const M = require('../src/theme/mgeom.js');

const build = (cfg) => Themes.build(atlas, (cfg && cfg.profile) || 'x3m40i', Object.assign({ style: 'track' }, cfg));
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

test('the registry picks the style, Toro by default', () => {
    assert.strictEqual(Themes.build(atlas, 'x3m40i', {}).id, 'toro');
    assert.strictEqual(Themes.build(atlas, 'x3m40i', { style: 'nonsense' }).id, 'toro');
    assert.strictEqual(build().id, 'track');
    assert.ok(build().hasCentre);
});

test('the feather follows the guide\'s rule across the aperture (section 3)', () => {
    const C = M.CENTRE, cy = (C.y0 + C.y1) / 2, cx = (C.x0 + C.x1) / 2;
    /* the guide's own profile: 0 on the perimeter, 0.5 twenty units in,
       1 at forty, smoothstep between - checked on all four walls */
    const want = [[0, 0], [10, 0.15625], [20, 0.5], [30, 0.84375], [40, 1], [120, 1]];
    for (const [d, alpha] of want) {
        for (const [x, y, where] of [[C.x0 + d, cy, 'left'], [C.x1 - d, cy, 'right'],
                                     [cx, C.y0 + d, 'top'], [cx, C.y1 - d, 'bottom']]) {
            assert.ok(Math.abs(Track.revealAt(x, y) - alpha) <= 2 / 255,
                `${where} ${d} in: ${Track.revealAt(x, y)} != ${alpha}`);
        }
    }
    assert.strictEqual(Track.revealAt(C.x0 - 1, cy), 0, 'nothing outside the polygon');
    /* at the corners it is measured against the chamfer, not the box */
    assert.ok(Track.revealAt(C.x0 + 30, C.y0 + 30) < Track.revealAt(C.x0 + 30, cy));
    /* and the shader computes the same thing */
    assert.match(trackShaders.mframe, /smoothstep\(0\.0, 40\.0, -dc\)/);
    assert.match(trackShaders.mframe, new RegExp('vec2\\(' + C.x0 + '\\.0, ' + C.y0 +
        '\\.0\\), vec2\\(' + C.x1 + '\\.0, ' + C.y1 + '\\.0\\), ' + C.chamfer + '\\.0\\)'));
});

test('the window lies inside BMW\'s map window, where Waze and the camera land', () => {
    const w = build().window, m = Track.MAP_WINDOW;
    assert.ok(w.x >= m.x && w.y >= m.y && w.x + w.w <= m.x + m.w && w.y + w.h <= m.y + m.h,
        JSON.stringify(w) + ' not inside ' + JSON.stringify(m));
});

test('the frame sits above the hosted map (z 0) and is the only see-through layer', () => {
    const t = build();
    const frame = t.layers.find((L) => L.id === 'frame');
    assert.ok(frame.z >= 1);
    assert.ok(t.layers.every((L) => L.z >= 1), 'every layer above the map');
    const st = State.present({}, Panel.profile('x3m40i'), t.settings);
    assert.strictEqual(frame.uniforms(Object.assign({}, st, { centre: CENTRES[0] })).u_open, 0);
    assert.strictEqual(frame.uniforms(Object.assign({}, st, { centre: CENTRES[1] })).u_open, 1);
    /* our own turn card keeps the window shut */
    assert.strictEqual(frame.uniforms(Object.assign({}, st, { centre: CENTRES[3] })).u_open, 0);
});

test('Track: nothing below the cut, nothing off the panel, nothing under a factory box', () => {
    for (const id of Object.keys(Panel.PROFILES)) {
        const zones = Panel.keepClear(id).filter((z) => z.id !== 'bottomStrip');
        for (const L of build({ profile: id }).layers) {
            if (L.belowCut) assert.strictEqual(L.id, 'frame', 'only the frame goes below');
            else assert.ok(L.y + L.h <= Panel.BOTTOM_CUT, `${id}/${L.id} reaches ${L.y + L.h}`);
            assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.w <= Panel.PANEL_WIDTH, `${L.id} off the panel`);
            if (L.id === 'frame' || L.id === 'flash') continue;
            for (const z of zones) {
                /* the M boxes sit in the middle: what the centre shows is
                   ours to lose there, readouts are not */
                /*
                 * On M cars the KOMBI draws its own boxes in the middle of
                 * the panel. The centre is ours to lose there. The gauge
                 * layers are wide because they carry the caps, but nothing
                 * of theirs is drawn where the right box falls: the band's
                 * inner edge starts at x 1515 and the oil bar at 1501, both
                 * clear of the box at 1223-1394.
                 */
                if (/^M box/.test(z.name) && /^(turn|speedGauge|revGauge)/.test(L.id)) continue;
                const hit = L.x < z.x + z.w && L.x + L.w > z.x && L.y < z.y + z.h && L.y + L.h > z.y;
                assert.ok(!hit, `${id}/${L.id} under ${z.name}`);
            }
        }
    }
});

test('Track shaders fit the budget and avoid what the head unit refuses', () => {
    for (const [id, src] of Object.entries(trackShaders)) {
        let vectors = 3;
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

test('every Track layer gives finite uniforms and keeps its glyphs inside, in every centre mode', () => {
    const profile = Panel.profile('x3m40i');
    const bad = new Set();
    for (const units of ['imperial', 'metric']) {
        for (const trackPalette of ['night', 'day']) {
            const t = build({ units, trackPalette });
            const sim = Sim.create(profile);
            for (let i = 0; i < 1200; i++) {
                sim.step(1 / 60);
                if (i % 151) continue;
                const st = State.present(sim.raw(), profile, t.settings);
                for (const centre of CENTRES) {
                    for (const gear of ['P', 'R', 'N', 'D', '1', '8', 'M8', 'S5']) {
                        for (const speed of [0, 99, 100, 330]) {
                            const s2 = Object.assign({}, st, { gear, speed, centre });
                            for (const L of t.layers) {
                                const u = L.uniforms ? L.uniforms(s2, 0) : null;
                                if (!u) continue;
                                for (const [k, v] of Object.entries(u)) {
                                    for (const n of (typeof v === 'number' ? [v] : v)) {
                                        if (!Number.isFinite(n)) bad.add(`${L.id}.${k} = ${n}`);
                                    }
                                }
                                if (L.shader !== 'text') continue;
                                for (let g = 0; g < u.u_count; g++) {
                                    const [x, y, w, h] = u.u_quad.slice(g * 4, g * 4 + 4);
                                    if (x >= -1 && y >= -1 && x + w <= L.w + 1 && y + h <= L.h + 1) continue;
                                    bad.add(`${L.id} (${units}, gear ${gear}, speed ${speed}): glyph outside ${Math.round(L.w)}x${Math.round(L.h)}`);
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

test('speed digits keep clear of the rail at 330', () => {
    const t = build({ units: 'metric' });
    const L = t.layers.find((x) => x.id === 'speed');
    const st = Object.assign(State.present({}, Panel.profile('x3m40i'), t.settings), { speed: 330 });
    const u = L.uniforms(st);
    const left = L.x + u.u_quad[0];
    /* clear of the left rail's inner hairline at the figures' height */
    assert.ok(left > Track.X(130), `330 starts at ${Math.round(left)}, over the rail`);
    /* right-aligned on the brief's anchor whatever the number */
    const right = (n) => { const v = L.uniforms(Object.assign({}, st, { speed: n })); const c = v.u_count - 1; return L.x + v.u_quad[c * 4] + v.u_quad[c * 4 + 2]; };
    assert.ok(Math.abs(right(0) - right(330)) < Track.D(16), 'one anchor for 0 and 330');
});

test('the centre shows the right thing in each mode, and nothing of ours over a picture', () => {
    const t = build();
    const st = State.present({ boostBar: 1 }, Panel.profile('x3m40i'), t.settings);
    const on = (id, centre) => t.layers.find((L) => L.id === id).uniforms(Object.assign({}, st, { centre })) !== null;
    for (const id of ['turnArrow', 'turnDist', 'turnSay']) {
        assert.ok(!on(id, CENTRES[0]), id + ': neutral is the quiet matte');
        assert.ok(!on(id, CENTRES[1]), id + ': nothing over the map');
        assert.ok(on(id, CENTRES[3]), id + ': the turn card');
    }
    /* unbranded (guide): no logo layer anywhere */
    assert.ok(!t.layers.some((L) => /brand|logo/i.test(L.id)));
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

test('drive modes read as BMW names them, and nothing when unknown', () => {
    const t = build();
    assert.strictEqual(State.present({}, Panel.profile('x3m40i'), t.settings).modeLabel, '');
    const sp = State.present({ driveMode: 'SPORT_PLUS' }, Panel.profile('x3m40i'), t.settings).modeLabel;
    assert.ok(sp && !/CORSA/.test(sp), sp);
});

test('the rails light from the bottom along the guide\'s paths, with one value mapping', () => {
    const t = build();
    const st = (o) => Object.assign(State.present({}, Panel.profile('x3m40i'), t.settings), o);
    const L = t.layers.find((x) => x.id === 'speedGauge'), R = t.layers.find((x) => x.id === 'revGauge');
    assert.strictEqual(L.uniforms(st({ speed: 0 })).u_val, 0);
    assert.strictEqual(L.uniforms(st({ speed: 80 })).u_val, 0.5, '80 mph is the fifth of nine labels');
    assert.strictEqual(L.uniforms(st({ speed: 200 })).u_val, 1);
    assert.strictEqual(L.uniforms(st({ speed: 400 })).u_val, 1, 'clamped, never wraps');
    assert.ok(Math.abs(L.uniforms(st({ speed: 140 })).u_val - 6.5 / 8) < 1e-9, 'between 120 and 160');
    assert.strictEqual(R.uniforms(st({ rpm: 4000 })).u_val, 0.5);
    /* the red run and the amber shift mark sit at the redline and before it */
    assert.strictEqual(R.uniforms(st({ rpm: 0 })).u_marks[0], 6750 / 8000);
    assert.strictEqual(R.uniforms(st({ rpm: 0 })).u_marks[1], (6750 - 400) / 8000);
    assert.strictEqual(R.uniforms(st({ rpm: 0 })).u_marks[2], 1, 'marks on the rev gauge');
    const Lg = build().layers.find((x) => x.id === 'speedGauge');
    assert.strictEqual(Lg.uniforms(st({})).u_marks[2], 0, 'none on the speed gauge');
    /* the numeral that brightens is the one at the marker */
    const on = t.layers.find((x) => x.id === 'speedScaleOn');
    assert.ok(on.uniforms(st({ speed: 76 })).u_count === 2, '"80" lit at 76 mph, as in the photograph');
    /* labels sit outside the rail, on the side away from the centre */
    for (let k = 0; k <= 8; k++) {
        const p = M.pointAt('left', M.arcOf('left', k / 8));
        assert.ok(p.nx < 0.01, 'left labels go left of the rail');
        const q = M.pointAt('right', M.arcOf('right', k / 8));
        assert.ok(q.nx > -0.01, 'right labels go right of the rail');
    }
});

test('the limiter flashes the rev rail and the edges only when asked', () => {
    const st = (rpm, lim) => Object.assign(State.present({}, Panel.profile('x3m40i'), {}), { rpm, limiter: lim });
    const R = build().layers.find((L) => L.id === 'revGauge');
    assert.strictEqual(R.uniforms(st(7000, 1)).u_bar[3], 1);
    const off = build({ revFlash: 'off' });
    assert.strictEqual(off.layers.find((L) => L.id === 'revGauge').uniforms(st(7000, 1)).u_bar[3], 0);
    assert.ok(!off.layers.some((L) => L.id === 'flash'));
});
