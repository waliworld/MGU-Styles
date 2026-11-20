'use strict';
/*
 * The rules in docs/CLUSTER-CONSTRAINTS.md, enforced.
 * Run: node --test test/theme.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const Panel = require('../src/geometry/panel.js');
const Theme = require('../src/theme/lambo.js');
const Text = require('../src/engine/text.js');
const State = require('../src/engine/state.js');
const Sim = require('../preview/sim.js');
const atlas = require('../assets/fonts/atlas.json');
const Palette = require('../src/theme/palette.js');
const core = require('../src/shaders/core.js');
const parts = require('../src/shaders/parts.js');
const dialShaders = require('../src/shaders/dial.js');
const Guide = require('../src/theme/guide.js');

const PROFILES = Object.keys(Panel.PROFILES);

test('no layer draws into the bottom strip', () => {
    for (const id of PROFILES) {
        for (const L of Theme.build(atlas, id, {}).layers) {
            assert.ok(L.y + L.h <= Panel.BOTTOM_CUT,
                `${id}/${L.id} reaches y=${L.y + L.h}, past the cut at ${Panel.BOTTOM_CUT}`);
        }
    }
});

/*
 * The layout is drawn for the X3 M40i, which has neither the M boxes nor the
 * eDrive box. On those cars the KOMBI draws its own box over part of our
 * artwork. These are the overlaps we know about and accept until those
 * profiles get their own layout; the test fails if the list grows or shrinks.
 * See docs/CLUSTER-CONSTRAINTS.md section 3 and README "Known limitations".
 */
const KNOWN_OVERLAPS = new Set([
    'mCarS58/gearBig/M box (left)',
]);

test('no layer overlaps a factory keep-clear zone', () => {
    const seen = new Set();
    for (const id of PROFILES) {
        const zones = Panel.keepClear(id).filter(z => z.id !== 'bottomStrip');
        for (const L of Theme.build(atlas, id, {}).layers) {
            /* Full-field procedural layers span the dial by nature; what
               matters is that no readout hides under a factory box. */
            if (['bg', 'flash', 'stipple', 'dial', 'contour', 'arcNums']
                .indexOf(L.id) >= 0) continue;
            for (const z of zones) {
                if (!(L.x < z.x + z.w && L.x + L.w > z.x &&
                      L.y < z.y + z.h && L.y + L.h > z.y)) continue;
                const key = `${id}/${L.id}/${z.name}`;
                seen.add(key);
                assert.ok(KNOWN_OVERLAPS.has(key), `new overlap: ${key}`);
            }
        }
    }
    for (const k of KNOWN_OVERLAPS) {
        assert.ok(seen.has(k), `${k} no longer overlaps - drop it from KNOWN_OVERLAPS`);
    }
});

test('every layer stays inside the panel', () => {
    for (const L of Theme.build(atlas, 'x3m40i', {}).layers) {
        assert.ok(L.x >= 0 && L.y >= 0, `${L.id} starts off-panel`);
        assert.ok(L.x + L.w <= Panel.PANEL_WIDTH, `${L.id} runs past the right edge`);
    }
});

test('shaders keep inside the uniform-vector budget', () => {
    /* GLSL ES counts a vecN or a float as one vector; an array as its length. */
    const all = Object.assign({}, core, parts, dialShaders);
    for (const [id, src] of Object.entries(all)) {
        let vectors = 0;
        for (const m of src.matchAll(/uniform\s+(float|vec2|vec3|vec4|mat4)\s+(\w+)(\[(\d+)\])?/g)) {
            vectors += (m[1] === 'mat4' ? 4 : 1) * (m[4] ? Number(m[4]) : 1);
        }
        vectors += 3;  /* u_size, u_time, u_keep from the prelude */
        assert.ok(vectors <= 48, `${id} declares ${vectors} uniform vectors, over the 48 the unit allows`);
    }
});

test('shaders avoid what the head unit refuses', () => {
    const all = Object.assign({}, core, parts, dialShaders);
    const reserved = ['u_mvp', 'u_mv', 'u_m', 'u_v', 'u_p', 'u_normal'];
    for (const [id, src] of Object.entries(all)) {
        assert.ok(!/\bbreak\b/.test(src), `${id} uses break inside a loop`);
        for (const r of reserved) {
            assert.ok(!new RegExp(`uniform\\s+\\w+\\s+${r}\\b`).test(src),
                `${id} declares the reserved uniform ${r}`);
        }
    }
});

test('every layer produces valid uniforms across a drive', () => {
    const profile = Panel.profile('x3m40i');
    const theme = Theme.build(atlas, 'x3m40i', {});
    const sim = Sim.create(profile);
    for (let i = 0; i < 2000; i++) {
        sim.step(1 / 60);
        if (i % 97) continue;
        const st = State.present(sim.raw(), profile, {});
        for (const L of theme.layers) {
            const u = L.uniforms ? L.uniforms(st, i / 60) : null;
            if (u === null) continue;
            for (const [k, v] of Object.entries(u)) {
                const vals = typeof v === 'number' ? [v] : v;
                for (const n of vals) {
                    assert.ok(Number.isFinite(n), `${L.id}.${k} produced ${n}`);
                }
            }
        }
    }
});

test('missing signals fall back to dashes, never to a stale number', () => {
    const profile = Panel.profile('x3m40i');
    const st = State.present({}, profile, {});
    assert.strictEqual(st.odoText, '--');
    assert.strictEqual(st.clockText, '--');
    assert.strictEqual(st.pods.coolant.text, '--');
    assert.strictEqual(st.speed, 0);
});

test('text layout never exceeds the shader glyph budget', () => {
    const L = Text.layout(atlas, 'ABCDEFGHIJKLMNOPQRST', { face: 'label', size: 20, x: 0, y: 0 });
    assert.ok(L.count <= Text.MAX_GLYPHS);
    assert.strictEqual(L.g.length, Text.MAX_GLYPHS * 4);
});

test('imperial and metric both present cleanly', () => {
    const profile = Panel.profile('x3m40i');
    const raw = { speedKmh: 100, coolantC: 90, odoKm: 1000, rangeKm: 400,
                  ambientC: 20, boostBar: 1, clock: { h: 13, m: 5 }, rpm: 3000 };
    const imp = State.present(raw, profile, {});
    const met = State.present(raw, profile, { units: 'metric' });
    assert.strictEqual(Math.round(imp.speed), 62);
    assert.strictEqual(Math.round(met.speed), 100);
    assert.strictEqual(imp.pods.coolant.text, '194');
    assert.strictEqual(met.pods.coolant.text, '90');
    assert.ok(imp.boostPsi > 14 && imp.boostPsi < 15);
});


/* ------------------------------------------------- settings and scale */



test('rev limits stay ordered however they are set', () => {
    const p = Panel.profile('x3m40i');
    const cases = [
        { rpmMax: 7000, rpmRedline: 9000, rpmLimiter: 9000 },
        { rpmRedline: 100, rpmLimiter: 50 },
        { rpmLimiter: 2000, rpmRedline: 6500 },
        { rpmMax: 'nonsense', rpmRedline: null }
    ];
    for (const c of cases) {
        const S = Palette.resolve(c, p);
        assert.ok(S.rpmRedline <= S.rpmMax, JSON.stringify(c));
        assert.ok(S.rpmLimiter <= S.rpmMax, JSON.stringify(c));
        assert.ok(S.rpmLimiter >= S.rpmRedline, JSON.stringify(c));
        assert.ok(S.flashFromRpm <= S.rpmLimiter, JSON.stringify(c));
    }
});

test('every colour scheme builds a complete theme', () => {
    for (const accent of Object.keys(Palette.SCHEMES)) {
        for (const litColour of Object.keys(Palette.LIT)) {
            const t = Theme.build(atlas, 'x3m40i', { accent, litColour });
            assert.ok(t.layers.length > 30, accent);
            for (const c of [t.palette.accent, t.palette.lit, t.palette.second]) {
                assert.ok(Array.isArray(c) && c.length === 3, `${accent}/${litColour}`);
                for (const v of c) assert.ok(v >= 0 && v <= 1);
            }
        }
    }
});

test('the rev-limit flash can be turned off and shaped', () => {
    const has = (t, id) => t.layers.some(L => L.id === id);
    assert.ok(has(Theme.build(atlas, 'x3m40i', { revFlash: 'both' }), 'flash'));
    assert.ok(has(Theme.build(atlas, 'x3m40i', { revFlash: 'edges' }), 'flash'));
    assert.ok(!has(Theme.build(atlas, 'x3m40i', { revFlash: 'band' }), 'flash'));
    assert.ok(!has(Theme.build(atlas, 'x3m40i', { revFlash: 'off' }), 'flash'));
    /* band-only still flashes the dial itself */
    const band = Theme.build(atlas, 'x3m40i', { revFlash: 'band' });
    const tach = band.layers.find(L => L.id === 'dial');
    const st = State.present({ rpm: 7000 }, Panel.profile('x3m40i'), band.settings);
    assert.ok(tach.uniforms(st, 0).u_warn > 0.5, 'the band should be flashing');
    const off = Theme.build(atlas, 'x3m40i', { revFlash: 'off' });
    assert.strictEqual(off.layers.find(L => L.id === 'dial')
        .uniforms(State.present({ rpm: 7000 }, Panel.profile('x3m40i'), off.settings), 0).u_warn, 0);
});










test('every glyph lands inside its own layer', () => {
    /*
     * A text layer only draws what falls inside its quad. A glyph placed
     * outside it is silently clipped - which is how a label goes missing
     * without anything failing. Check every layer against a whole drive.
     */
    const profile = Panel.profile('x3m40i');
    const bad = new Set();
    for (const units of ['imperial', 'metric']) {
        const theme = Theme.build(atlas, 'x3m40i', { units });
        const sim = Sim.create(profile);
        for (let i = 0; i < 1500; i++) {
            sim.step(1 / 60);
            if (i % 113) continue;
            const st = State.present(sim.raw(), profile, theme.settings);
            for (const gear of ['P', 'R', 'N', '1', '8']) {
                const s2 = Object.assign({}, st, { gear });
                for (const L of theme.layers) {
                    if (L.shader !== 'text' && L.shader !== 'arcnum') continue;
                    const u = L.uniforms(s2, 0);
                    if (!u) continue;
                    for (let g = 0; g < u.u_count; g++) {
                        const [x, y, w, h] = u.u_quad.slice(g * 4, g * 4 + 4);
                        if (x >= -1 && y >= -1 && x + w <= L.w + 1 && y + h <= L.h + 1) continue;
                        bad.add(`${L.id}: glyph at ${Math.round(x)},${Math.round(y)} ` +
                            `${Math.round(w)}x${Math.round(h)} outside its ${L.w}x${L.h} layer`);
                    }
                }
            }
        }
    }
    assert.deepStrictEqual([...bad].sort(), [],
        'clipped text:\n  ' + [...bad].sort().join('\n  '));
});







/* --------------------------------------------- the CORSA reconstruction */

test('the dial follows the brief\'s circle and angle function', () => {
    const T = Guide.TACH;
    /* thetaDegrees(v) = -178 + 17.2 v, and the crown falls just past 5. */
    assert.strictEqual(Guide.thetaDeg(1), -160.8);
    assert.ok(Math.abs(Guide.thetaDeg(10) - -6) < 1e-9);
    let crown = 1, best = Infinity;
    for (let v = 1; v <= 10; v += 0.01) {
        const y = Guide.point(v, T.rOuter).y;
        if (y < best) { best = y; crown = v; }
    }
    assert.ok(crown > 5 && crown < 5.3, `crown at v=${crown.toFixed(2)}`);

    /* Every labelled point is the same distance from the centre: a circle. */
    const c = { x: Guide.gx(T.cx), y: Guide.gy(T.cy) };
    for (let v = 1; v <= 10; v++) {
        const p = Guide.point(v, T.rOuter);
        const r = Math.hypot(p.x - c.x, p.y - c.y);
        assert.ok(Math.abs(r - Guide.gs(T.rOuter)) < 0.01, `v=${v} r=${r}`);
    }
});

test('the brief\'s grid is fitted, not stretched, into the drawable area', () => {
    /* One scale for both axes, and nothing reaches the car's bottom strip. */
    assert.ok(Guide.FIT > 0.8 && Guide.FIT < 1);
    assert.ok(Math.abs(Guide.gy(Guide.GRID.contentBottom) - Panel.BOTTOM_CUT) < 0.01);
    assert.ok(Guide.gs(100) / 100 === Guide.FIT, 'lengths scale by the same factor');
    assert.ok(Guide.gx(0) > 0 && Guide.gx(Guide.GRID.w) < Panel.PANEL_WIDTH,
        'the composition is letterboxed, not cropped');
});

test('the stepped contour generator matches the brief\'s table', () => {
    /* 0.00 and 0.12 recessed, 0.22-0.68 plateau, back down by 0.80. */
    const T = Guide.TACH;
    const radius = (f) => {
        const up = Math.max(0, Math.min(1, (f - 0.12) / 0.10));
        const dn = Math.max(0, Math.min(1, (f - 0.68) / 0.12));
        return T.rRecess + (T.rPlateau - T.rRecess) * (up - dn);
    };
    for (const [f, want] of T.step) {
        assert.ok(Math.abs(radius(f) - want) < 1e-9,
            `fraction ${f} should sit at ${want}, got ${radius(f)}`);
    }
});

test('the scale is marked 1 to 10 and carries its own values', () => {
    const theme = Theme.build(atlas, 'x3m40i', {});
    const nums = theme.layers.find(L => L.id === 'arcNums');
    const u = nums.uniforms(State.present({ rpm: 0 }, Panel.profile('x3m40i'), theme.settings), 0);
    assert.strictEqual(u.u_cfg[0], 11, '1..10 is eleven glyphs, "10" being two');
    const vals = [];
    for (let i = 0; i < 11; i++) vals.push(u.u_gt[i * 4]);
    assert.deepStrictEqual(vals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]);
    /* Red where the dial's own red detailing starts, so the two agree. */
    for (let i = 0; i < 11; i++) {
        assert.strictEqual(u.u_gt[i * 4 + 1], vals[i] >= theme.dial.redV - 0.001 ? 1 : 0);
    }
});

test('the printed scale is artwork, the rev limits are separate', () => {
    /* The brief is emphatic that 10 is not a permitted rev limit. */
    const S = Palette.resolve({}, Panel.profile('x3m40i'));
    assert.strictEqual(S.scaleMaxRpm, 10000);
    assert.strictEqual(S.rpmRedline, 6750);
    assert.strictEqual(S.rpmLimiter, 7000);
    /* The red sector lands where the engine actually redlines. */
    const theme = Theme.build(atlas, 'x3m40i', {});
    assert.ok(Math.abs(theme.dial.redV - (1 + 9 * 6750 / 10000)) < 1e-9);
    /* A shorter artwork scale moves the same revs further round. */
    const a = Theme.build(atlas, 'x3m40i', { scaleMaxRpm: 10000 });
    const b = Theme.build(atlas, 'x3m40i', { scaleMaxRpm: 7000 });
    const at = (t) => t.layers.find(L => L.id === 'dial')
        .uniforms(State.present({ rpm: 3500 }, Panel.profile('x3m40i'), t.settings), 0).u_frac;
    assert.ok(at(b) > at(a));
});

test('the far-left region and our own additions can be turned off', () => {
    const has = (t, id) => t.layers.some(L => L.id === id);
    assert.ok(has(Theme.build(atlas, 'x3m40i', {}), 'bar_oilT'));
    assert.ok(!has(Theme.build(atlas, 'x3m40i', { showAuxLeft: false }), 'bar_oilT'));
    assert.ok(!has(Theme.build(atlas, 'x3m40i', { showBoost: false }), 'boost'));
    assert.ok(!has(Theme.build(atlas, 'x3m40i', { shiftLights: false }), 'shift'));
});
