'use strict';
/*
 * The side gauges, the shift lights and shake, the holiday dressing, the
 * start-up message and its own words.
 * Run: node --test test/extras.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Panel = require('../src/geometry/panel.js');
const Themes = require('../src/theme/index.js');
const Toro = require('../src/theme/lambo.js');
const Palette = require('../src/theme/palette.js');
const Overlays = require('../src/theme/overlays.js');
const State = require('../src/engine/state.js');
const Driver = require('../src/car/cluster.js');
const Message = require('../src/car/message.js');
const Main = require('../src/car/main.js');
const atlas = require('../assets/fonts/atlas.json');

const P = Panel.profile('x3m40i');
const find = (th, id) => th.layers.find((L) => L.id === id);

function stateAt(rpm, extra) {
    return Object.assign(State.present({ rpm: rpm, speedKmh: 80, gear: '4', oilTempC: 100,
        coolantC: 90, fuelPct: 50 }, P, {}), extra || {});
}

/* ------------------------------------------------------------ gauges */

test('the side gauges are slanted bars, inside the screen and above the strip', () => {
    const th = Toro.build(atlas, 'x3m40i', {});
    for (const id of ['fuel', 'coolant', 'oilT', 'auxPress']) {
        const L = find(th, 'bar_' + id);
        assert.ok(L, id);
        assert.strictEqual(L.shader, 'hgauge');
        assert.ok(L.x >= 0 && L.x + L.w <= Panel.PANEL_WIDTH, id + ' inside the width');
        assert.ok(L.y + L.h <= Panel.BOTTOM_CUT, id + ' above the strip');
        const u = L.uniforms(stateAt(3000));
        assert.ok(u.u_frac >= 0 && u.u_frac <= 1);
        assert.strictEqual(u.u_on, 1);
    }
    /* left pair leans one way, right the other */
    assert.ok(find(th, 'bar_oilT').uniforms(stateAt(3000)).u_shear > 0);
    assert.ok(find(th, 'bar_fuel').uniforms(stateAt(3000)).u_shear < 0);
});

test('a gauge with no reading shows no needle', () => {
    const th = Toro.build(atlas, 'x3m40i', {});
    const st = State.present({ rpm: 900 }, P, {});
    assert.strictEqual(find(th, 'bar_oilT').uniforms(st).u_on, 0);
});

test('the scale numbers follow the units', () => {
    const glyphs = (th, id) => th.layers.filter((L) => L.id.indexOf(id) === 0).length;
    const imp = Toro.build(atlas, 'x3m40i', { units: 'imperial' });
    const met = Toro.build(atlas, 'x3m40i', { units: 'metric' });
    assert.ok(glyphs(imp, 'scale_oilT') >= 1 && glyphs(met, 'scale_oilT') >= 1);
    /* oil temperature 50..170 C is 122..338 F */
    const Text = require('../src/engine/text.js');
    assert.ok(Text.measure(atlas, 'label', '338', 20) > 0);
});

/* ----------------------------------------------------- shift lights */

test('shift light kinds: Toro by default, the old switch still turns them off', () => {
    assert.strictEqual(Palette.resolve({}, P).shiftStyle, 'toro');
    assert.strictEqual(Palette.resolve({ shiftLights: false }, P).shiftStyle, 'off');
    assert.strictEqual(Palette.resolve({ shiftStyle: 'nonsense' }, P).shiftStyle, 'toro');
    const th = Toro.build(atlas, 'x3m40i', {});
    const u = find(th, 'shift').uniforms(stateAt(7000));
    assert.strictEqual(u.u_style, 1);
    assert.strictEqual(u.u_burst, 1);
    assert.strictEqual(u.u_strobe, 1, 'at the limiter');
    const gt3 = Toro.build(atlas, 'x3m40i', { shiftStyle: 'gt3' });
    assert.strictEqual(find(gt3, 'shift').uniforms(stateAt(7000)).u_style, 0);
    assert.ok(!find(Toro.build(atlas, 'x3m40i', { shiftStyle: 'off' }), 'shift'));
});

test('shake keys: a jolt that dies away, resting between bursts', () => {
    const k = Toro.shakeKeys(6, true).split(' ');
    assert.strictEqual(k[0], '0:0.0,0.0,0');
    assert.strictEqual(k[k.length - 1], '900:0,0,0');
    for (const key of k) assert.strictEqual(key.split(':')[1].split(',').length, 3, 'translate: x, y, z');
    assert.ok(k.length <= 256);
    assert.strictEqual(Toro.build(atlas, 'x3m40i', { shake: 'off' }).shakeKeys, null);
});

function fakeCR() {
    const calls = { animate: [], stop: [], effect: [] };
    let ref = 0;
    return {
        calls,
        asset() { return ++ref; },
        effect(o) { calls.effect.push(o); return ++ref; },
        uniform() {}, bind() {}, set() {}, drop() {}, pixels() {},
        animate(r, o) { calls.animate.push({ ref: r, o }); return calls.animate.length; },
        stop(r, a) { calls.stop.push({ ref: r, a }); }
    };
}

test('the cluster shakes at the limiter, played by the renderer, and settles after', () => {
    const cr = fakeCR();
    const theme = Toro.build(atlas, 'x3m40i', {});
    const d = Driver.create({ cr, theme, shaders: Main.shaders(), atlas,
        atlasPixels: Buffer.alloc(atlas.size * atlas.size) });
    d.ready();
    d.tick(stateAt(3000));
    assert.strictEqual(cr.calls.animate.length, 0);
    d.tick(stateAt(7000));
    const still = theme.layers.filter((L) => L.still).length;
    assert.ok(still >= 2, 'the background and the flash stay put');
    assert.strictEqual(cr.calls.animate.length, theme.layers.length - still);
    assert.ok(cr.calls.animate.every((c) => c.o.property === 'translate' && c.o.loop));
    /* held: no more messages while it shakes */
    d.tick(stateAt(7000));
    assert.strictEqual(cr.calls.animate.length, theme.layers.length - still);
    for (let i = 0; i < 11; i++) d.tick(stateAt(3000));
    assert.strictEqual(cr.calls.stop.length, 0, 'it keeps going a moment');
    d.tick(stateAt(3000));
    assert.strictEqual(cr.calls.stop.length, cr.calls.animate.length);
    assert.ok(!d.isShaking());
});

/* ----------------------------------------------------------- extras */

test('holiday: snow down both sides and a tree, behind the instruments', () => {
    for (const style of ['toro', 'track']) {
        const th = Themes.build(atlas, 'x3m40i', { style, holiday: true });
        const ids = th.layers.map((L) => L.id);
        assert.ok(ids.includes('snow0') && ids.includes('snow1') && ids.includes('tree'), style);
        for (const L of th.layers.filter((L) => /^snow|^tree/.test(L.id))) {
            assert.ok(L.z < 10, 'behind the readouts');
            assert.ok(L.x >= 0 && L.x + L.w <= Panel.PANEL_WIDTH && L.y + L.h <= Panel.BOTTOM_CUT);
        }
        assert.ok(!Themes.build(atlas, 'x3m40i', { style }).layers.some((L) => L.id === 'tree'));
    }
});

test('the start-up message: held, then faded into the cluster, then gone', () => {
    const th = Themes.build(atlas, 'x3m40i', { intro: true, introSeconds: '10' });
    const veil = find(th, 'introVeil');
    const text = th.layers.filter((L) => /^introText/.test(L.id));
    assert.ok(veil && text.length >= 3, 'the words take several 12-glyph layers');
    assert.ok(veil.z > 100 && text.every((L) => L.z > veil.z), 'over everything');
    const at = (t) => ({ sinceOn: t });
    assert.strictEqual(veil.uniforms(at(5)).u_a, 1);
    assert.ok(text[0].uniforms(at(5)).u_color[3] > 0.99);
    const fading = text[0].uniforms(at(11.5)).u_color[3];
    assert.ok(fading > 0 && fading < 1, 'fading at 11.5 s');
    assert.strictEqual(text[0].uniforms(at(14)), null, 'gone');
    assert.strictEqual(veil.uniforms(at(14)), null, 'gone');
    assert.strictEqual(veil.uniforms(at(-1)), null, 'not before the cluster is up');
    assert.ok(!Themes.build(atlas, 'x3m40i', {}).layers.some((L) => L.id === 'introVeil'));
});

test('the message: the default words, uppercase, wrapped to fit', () => {
    const S = Palette.resolve({ intro: true }, P);
    assert.strictEqual(S.introText, 'For my beautiful wife, Nicole Wali, I love you');
    assert.strictEqual(Palette.resolve({ introMessage: 'welcome' }, P).introText, 'Welcome back');
    assert.strictEqual(Palette.resolve({ introMessage: 'custom', introText: 'Ciao bella' }, P).introText, 'Ciao bella');
    assert.strictEqual(Overlays.clean(atlas, 'Ciao  bella ~ <3'), 'CIAO BELLA 3');
    const F = Overlays.fit(atlas, Overlays.clean(atlas, S.introText));
    assert.ok(F.lines.length >= 1 && F.lines.length <= 3);
    assert.ok(F.size >= 30);
});

test('your own words: read from a USB stick and kept', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgu-msg-'));
    const stick = path.join(tmp, 'media', 'usb0');
    const data = path.join(tmp, 'data');
    fs.mkdirSync(stick, { recursive: true });
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(stick, Message.NAME), '﻿Happy anniversary,\n  my love\n');
    const roots = [path.join(tmp, 'media')];
    assert.strictEqual(Message.load({ dataDir: data, roots }), 'Happy anniversary, my love');
    fs.rmSync(stick, { recursive: true });
    assert.strictEqual(Message.load({ dataDir: data, roots }), 'Happy anniversary, my love', 'kept');
    assert.strictEqual(Message.load({ roots: [path.join(tmp, 'nowhere')] }), null);
    fs.rmSync(tmp, { recursive: true });
});

/* ------------------------------------------------- fluid, G, boost */

const Smooth = require('../src/car/smooth.js');

test('readings glide between the car updates, the same at any frame rate', () => {
    const run = (stepMs) => {
        const sm = Smooth.create();
        sm.apply({ rpm: 1000 }, 0, 90);
        let out;
        const n = Math.round(90 / stepMs);
        for (let i = 1; i <= n; i++) out = sm.apply({ rpm: 4000 }, i * stepMs, 90);
        return out.rpm;
    };
    const at60 = run(15), at30 = run(30);
    assert.ok(at60 > 2800 && at60 < 3100, 'about 63% of the way after one glide time: ' + at60);
    assert.ok(Math.abs(at60 - at30) < 40, 'frame rate does not change the motion');
    const sm = Smooth.create();
    sm.apply({ rpm: 3000 }, 0, 90);
    assert.strictEqual(sm.apply({ rpm: undefined }, 16, 90).rpm, undefined, 'a lost reading is not faded out');
    assert.strictEqual(Smooth.create().apply({ rpm: 5000, gear: '3' }, 0, 0).rpm, 5000);
    const off = Smooth.create(); off.apply({ rpm: 1000 }, 0, 0);
    assert.strictEqual(off.apply({ rpm: 4000 }, 16, 0).rpm, 4000, 'off: straight to it');
});

test('refresh rate and smoothing settings', () => {
    assert.strictEqual(Palette.resolve({}, P).refreshHz, 60);
    assert.strictEqual(Palette.resolve({ refreshHz: '30' }, P).refreshHz, 30);
    assert.strictEqual(Palette.resolve({ refreshHz: '500' }, P).refreshHz, 60);
    assert.strictEqual(Palette.resolve({ smoothing: 'nope' }, P).smoothing, 'smooth');
});

test('the G meter: a right-hand turn reads to the right, braking down', () => {
    /* the bus is ISO: lateral positive to the left */
    const right = State.present({ rpm: 2000, gLat: -0.5, gLon: -0.3 }, P, {});
    assert.ok(right.gX > 0.49 && right.gY < -0.29);
    const th = Toro.build(atlas, 'x3m40i', {});
    const L = (id) => find(th, id).uniforms(Object.assign(right, { now: 0 }));
    assert.strictEqual(L('gR').u_count > 0, true);
    assert.deepStrictEqual(find(th, 'gforce').uniforms(Object.assign({}, right, { now: 0 })).u_g, [right.gX, right.gY]);
});

test('the G peak is held a few seconds as a line, then fades away', () => {
    const th = Toro.build(atlas, 'x3m40i', {});
    const g = find(th, 'gforce');
    const st = (lat, now) => Object.assign(State.present({ rpm: 2000, gLat: lat, gLon: 0 }, P, {}), { now });
    let u = g.uniforms(st(-0.9, 1000));
    assert.ok(Math.abs(u.u_peak[0] - 0.9) < 1e-9 && u.u_peakA === 1);
    u = g.uniforms(st(-0.2, 3500));
    assert.ok(Math.abs(u.u_peak[0] - 0.9) < 1e-9 && u.u_peakA === 1, 'held');
    u = g.uniforms(st(-0.2, 4750));
    assert.ok(u.u_peakA > 0.3 && u.u_peakA < 0.7, 'fading: ' + u.u_peakA);
    u = g.uniforms(st(-0.2, 7000));
    assert.ok(Math.abs(u.u_peak[0] - 0.2) < 1e-9, 'a new, smaller peak once the old one is gone');
    const smaller = g.uniforms(st(-1.1, 7100));
    assert.ok(Math.abs(smaller.u_peak[0] - 1.1) < 1e-9, 'a harder one replaces it at once');
});

test('boost: level with the speed, a step bigger each psi, its gauge sweeping right to left', () => {
    const th = Toro.build(atlas, 'x3m40i', {});
    const num = find(th, 'boostNum'), gauge = find(th, 'boostGauge'), speed = find(th, 'speed');
    const at = (psi) => Object.assign(stateAt(4000), { boostPsi: psi });
    const height = (psi) => num.uniforms(at(psi)).u_quad[3];
    assert.ok(height(10) > height(5) && height(20) > height(10));
    assert.strictEqual(height(10.2), height(10.9), 'steps, not a creep');
    assert.strictEqual(num.uniforms(at(-6)).u_count, 1, 'vacuum reads 0');
    /* the same baseline as the speed: the bottoms of their figures line up */
    const bottom = (L, st) => { const q = L.uniforms(st).u_quad; return L.y + q[1] + q[3]; };
    assert.ok(Math.abs(bottom(num, at(16)) - bottom(speed, at(16))) < 8, 'level with the speed');
    const u = gauge.uniforms(at(15));
    assert.strictEqual(u.u_dir, -1);
    assert.ok(u.u_alpha < 0.6, 'faint');
    assert.ok(gauge.x > num.x + num.w - 40, 'right of the figure');
});
