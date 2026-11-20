'use strict';
/*
 * The car-side driver, against a recording stand-in for cluster-render.
 * Checks what actually crosses the socket: the layers, the one asset, the
 * binds, and how many bytes a frame costs.
 *
 * Run: node --test test/cluster.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');

const Driver = require('../src/car/cluster.js');
const Theme = require('../src/theme/lambo.js');
const State = require('../src/engine/state.js');
const Panel = require('../src/geometry/panel.js');
const Prelude = require('../src/shaders/prelude.js');
const Sim = require('../preview/sim.js');
const atlas = require('../assets/fonts/atlas.json');
const core = require('../src/shaders/core.js');
const parts = require('../src/shaders/parts.js');
const dialShaders = require('../src/shaders/dial.js');

const SHADERS = Object.assign({}, core, parts, dialShaders);

/* Records every call the driver makes, the way the real client would see it. */
function fakeCR() {
    const calls = { asset: [], effect: [], uniform: [], bind: [], set: [], drop: [], pixels: [] };
    let ref = 0;
    return {
        calls,
        asset(o) { calls.asset.push(o); return ++ref; },
        effect(o) { calls.effect.push(o); return ++ref; },
        uniform(r, name, values, opts) { calls.uniform.push({ ref: r, name, values, opts }); },
        bind(r, sampler, a) { calls.bind.push({ ref: r, sampler, asset: a }); },
        set(r, o) { calls.set.push({ ref: r, opts: o }); },
        drop(r) { calls.drop.push(r); },
        pixels(r, rects, px) { calls.pixels.push({ ref: r, rects, bytes: px.length }); }
    };
}

function makeDriver() {
    const cr = fakeCR();
    const theme = Theme.build(atlas, 'x3m40i', {});
    const d = Driver.create({
        cr, theme, shaders: SHADERS, atlas,
        atlasPixels: Buffer.alloc(atlas.size * atlas.size)
    });
    return { cr, theme, d };
}

test('start-up creates one asset and a layer per theme layer', () => {
    const { cr, theme, d } = makeDriver();
    d.ready();
    assert.strictEqual(cr.calls.asset.length, 1, 'exactly one asset: we are far under the 16 limit');
    assert.strictEqual(cr.calls.asset[0].format, 'r8');
    assert.strictEqual(cr.calls.asset[0].w, atlas.size);
    assert.strictEqual(cr.calls.effect.length, theme.layers.length);
    assert.strictEqual(cr.calls.pixels.length, 1);
    assert.strictEqual(cr.calls.pixels[0].bytes, atlas.size * atlas.size);
});

test('every layer goes on the panel target and inside the drawable area', () => {
    const { cr, d } = makeDriver();
    d.ready();
    for (const e of cr.calls.effect) {
        assert.strictEqual(e.target, 'panel');
        for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(e[k]), 'layer ' + k + ' is a whole pixel');
        assert.ok(e.y + e.h <= Panel.BOTTOM_CUT, 'a layer reaches into the bottom strip');
        assert.strictEqual(e.contend, false, 'we never take the slot by force');
        assert.strictEqual(e.guide_hold, false, "BMW's turn box stays");
        assert.ok(e.fs.indexOf('#version 100') === 0, 'shader is GLSL ES 1.00');
    }
});

test('text layers are bound to the atlas, others are not', () => {
    const { cr, theme, d } = makeDriver();
    d.ready();
    const wantsAtlas = theme.layers.filter(L => SHADERS[L.shader].indexOf('u_atlas') >= 0);
    assert.strictEqual(cr.calls.bind.length, wantsAtlas.length);
    assert.ok(wantsAtlas.length > 0);
    for (const b of cr.calls.bind) assert.strictEqual(b.sampler, 'u_atlas');
});

test('composed shaders carry no reserved uniform and no break', () => {
    for (const [id, body] of Object.entries(SHADERS)) {
        const src = Prelude.compose(body);
        assert.ok(!/\bbreak\b/.test(src), `${id} uses break`);
        for (const r of ['u_mvp', 'u_mv', 'u_m', 'u_v', 'u_p', 'u_normal']) {
            assert.ok(!new RegExp(`uniform\\s+\\w+\\s+${r}\\s*[;\\[]`).test(src),
                `${id} declares the reserved uniform ${r}`);
        }
    }
});

test('glyph arrays are sent as typed vec4 arrays', () => {
    const { cr, d } = makeDriver();
    d.ready();
    const profile = Panel.profile('x3m40i');
    d.tick(State.present(Sim.create(profile).raw(), profile, {}));
    const arrays = cr.calls.uniform.filter(u => u.values.length > 4);
    assert.ok(arrays.length > 0);
    for (const a of arrays) {
        assert.ok(a.opts && a.opts.type === 'vec4',
            `${a.name} is ${a.values.length} long and must be sent as vec4`);
        assert.strictEqual(a.values.length % 4, 0);
    }
});

test('an unchanged frame sends nothing', () => {
    const { cr, d } = makeDriver();
    d.ready();
    const profile = Panel.profile('x3m40i');
    const st = State.present(Sim.create(profile).raw(), profile, {});
    d.tick(st);
    const after = cr.calls.uniform.length;
    assert.strictEqual(d.tick(st), 0, 'a repeated state must cost nothing');
    assert.strictEqual(cr.calls.uniform.length, after);
});

test('a driving frame stays far inside the upload budget', () => {
    const { cr, d } = makeDriver();
    d.ready();
    const profile = Panel.profile('x3m40i');
    const sim = Sim.create(profile);
    const before = cr.calls.uniform.length;
    let frames = 0;
    for (let i = 0; i < 1800; i++) {      /* 30 s at 60 Hz */
        sim.step(1 / 60);
        if (i % 2) continue;               /* drive the cluster at 30 Hz */
        d.tick(State.present(sim.raw(), profile, {}));
        frames++;
    }
    const msgs = cr.calls.uniform.length - before;
    /* A uniform message is JSON: name, ref and the values. Budget is
       5500 KB/s for the whole head unit; we want a rounding error. */
    const bytes = cr.calls.uniform.slice(before)
        .reduce((n, u) => n + 40 + u.values.length * 8, 0);
    const kbPerSec = bytes / 1024 / 30;
    assert.ok(kbPerSec < 120, `uniforms cost ${kbPerSec.toFixed(1)} KB/s, too much`);
    assert.ok(msgs / frames < 30, 'too many uniform messages per frame');
});

test('stop hands the cluster back', () => {
    const { cr, theme, d } = makeDriver();
    d.ready();
    d.stop();
    assert.strictEqual(cr.calls.drop.length, theme.layers.length + 1, 'layers and the asset');
    assert.strictEqual(d.tick({}), 0);
    assert.strictEqual(d.isBuilt(), false);
});

test('a layer with nothing to show is hidden, not drawn blank', () => {
    const { cr, d } = makeDriver();
    d.ready();
    const profile = Panel.profile('x3m40i');
    /* No gear: the big numeral and the strip marker have nothing to draw. */
    const st = State.present({ rpm: 800, gear: '' }, profile, {});
    st.gear = '';
    d.tick(st);
    assert.ok(cr.calls.set.some(s => s.opts.visible === false),
        'at least one layer should hide itself');
});
