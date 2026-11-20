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
const core = require('../src/shaders/core.js');
const parts = require('../src/shaders/parts.js');

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
    'hybrid/podv_fuel/eDrive status box',
    'mCarS58/arcNums/M box (left)',
    'mCarS58/arcNums/M box (right)',
    'mCarS58/gearBig/M box (left)',
    'mCarS58/gearStrip/M box (left)',
    'mCarS58/gearStripOn/M box (left)',
    'mCarS58/rail/M box (left)',
    'mCarS58/rail/M box (right)',
    'mCarS58/tach/M box (left)',
    'mCarS58/tach/M box (right)',
]);

test('no layer overlaps a factory keep-clear zone', () => {
    const seen = new Set();
    for (const id of PROFILES) {
        const zones = Panel.keepClear(id).filter(z => z.id !== 'bottomStrip');
        for (const L of Theme.build(atlas, id, {}).layers) {
            if (L.id === 'bg' || L.id === 'flash') continue;   /* full-panel washes */
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
    const all = Object.assign({}, core, parts);
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
    const all = Object.assign({}, core, parts);
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
