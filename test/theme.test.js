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
    'mCarS58/bezel/M box (left)',
    'mCarS58/bezel/M box (right)',
    'mCarS58/gearBand/M box (left)',
    'mCarS58/gearBand/M box (right)',
    'mCarS58/gearBig/M box (left)',
    'mCarS58/gearStrip/M box (left)',
    'mCarS58/gearStrip/M box (right)',
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


/* ------------------------------------------------- settings and scale */

test('the scale numerals are always single digits', () => {
    /* src/shaders/parts.js arcnum works out which numeral a glyph belongs
       to from its index, which only holds while each numeral is one glyph. */
    for (const rpmMax of [4000, 6000, 7000, 8000, 9000, 99999]) {
        const S = Palette.resolve({ rpmMax }, Panel.profile('x3m40i'));
        assert.ok(S.rpmMax <= 9000, `rpmMax ${S.rpmMax} would need a two-digit numeral`);
        assert.strictEqual(S.rpmMax % 1000, 0, 'the scale is marked in whole thousands');
    }
});

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
    const tach = band.layers.find(L => L.id === 'tach');
    const st = State.present({ rpm: 7000 }, Panel.profile('x3m40i'), band.settings);
    assert.ok(tach.uniforms(st, 0).u_warn > 0.5, 'the band should be flashing');
    const off = Theme.build(atlas, 'x3m40i', { revFlash: 'off' });
    assert.strictEqual(off.layers.find(L => L.id === 'tach')
        .uniforms(State.present({ rpm: 7000 }, Panel.profile('x3m40i'), off.settings), 0).u_warn, 0);
});

test('shift lights and the gear strip can be turned off', () => {
    const noShift = Theme.build(atlas, 'x3m40i', { shiftLights: false });
    assert.ok(!noShift.layers.some(L => L.id === 'shift'));
    const noStrip = Theme.build(atlas, 'x3m40i', { gearStrip: false });
    assert.ok(!noStrip.layers.some(L => L.id === 'gearStrip'));
    assert.ok(!noStrip.layers.some(L => L.id === 'gearBand'));
});

test('the gear strip scrolls and never draws the engaged gear', () => {
    const theme = Theme.build(atlas, 'x3m40i', {});
    const strip = theme.layers.find(L => L.id === 'gearStrip');
    const profile = Panel.profile('x3m40i');
    const names = ['P', 'R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'];
    const digits = atlas.faces.label.glyphs;

    for (const gear of names) {
        const st = State.present({ rpm: 1500 }, profile, theme.settings);
        st.gear = gear;
        const u = strip.uniforms(st, 0);
        assert.ok(u, `no strip for ${gear}`);
        assert.ok(u.u_count <= Text.MAX_GLYPHS, `${gear}: ${u.u_count} glyphs`);

        /* The engaged gear sits under the big numeral, so it is not drawn;
           everything else is placed relative to it. */
        const centre = Theme.ARC.cx - strip.x;
        for (let i = 0; i < u.u_count; i++) {
            const gx = u.u_quad[i * 4] + u.u_quad[i * 4 + 2] / 2;
            assert.ok(Math.abs(gx - centre) > 70,
                `${gear}: a glyph sits under the big numeral at ${gx}`);
        }
    }
});

test('the numerals react to the revs', () => {
    const theme = Theme.build(atlas, 'x3m40i', {});
    const nums = theme.layers.find(L => L.id === 'arcNums');
    const profile = Panel.profile('x3m40i');
    const lo = nums.uniforms(State.present({ rpm: 800 }, profile, theme.settings), 0);
    const hi = nums.uniforms(State.present({ rpm: 6400 }, profile, theme.settings), 0);
    assert.ok(hi.u_frac > lo.u_frac, 'the sweep position follows the revs');
    assert.ok(lo.u_grow > 0, 'numerals grow as the sweep passes them');
    assert.strictEqual(lo.u_count, 9, '0 to 8 for an 8000 rpm scale');
});

test('a changed rpm scale moves the numerals and the redline', () => {
    const a = Theme.build(atlas, 'x3m40i', { rpmMax: 8000, rpmRedline: 6750 });
    const b = Theme.build(atlas, 'x3m40i', { rpmMax: 6000, rpmRedline: 5000 });
    const profile = Panel.profile('x3m40i');
    const tachA = a.layers.find(L => L.id === 'tach')
        .uniforms(State.present({ rpm: 3000 }, profile, a.settings), 0);
    const tachB = b.layers.find(L => L.id === 'tach')
        .uniforms(State.present({ rpm: 3000 }, profile, b.settings), 0);
    assert.ok(tachB.u_frac > tachA.u_frac, 'the same revs sit further round a shorter scale');
    assert.ok(Math.abs(tachA.u_redline - 6750 / 8000) < 1e-9, 'redline follows the scale');
    assert.ok(Math.abs(tachB.u_redline - 5000 / 6000) < 1e-9, 'redline follows the scale');
    assert.strictEqual(b.layers.find(L => L.id === 'arcNums')
        .uniforms(State.present({ rpm: 0 }, profile, b.settings), 0).u_count, 7);
});
