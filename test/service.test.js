'use strict';
/*
 * The service end to end: signals in, uniforms out, and handing the cluster
 * back when the car is not running.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Main = require('../src/car/main.js');

function harness(t, settings) {
    const calls = { effect: 0, uniform: 0, drop: 0, asset: 0, pixels: 0, set: [] };
    const on = {};
    let ref = 100;
    const cr = {
        on(e, f) { on[e] = f; },
        asset() { calls.asset++; return ++ref; },
        effect() { calls.effect++; return ++ref; },
        uniform() { calls.uniform++; },
        bind() {}, set(r, o) { calls.set.push(o); },
        drop() { calls.drop++; }, pixels() { calls.pixels++; }, close() {}
    };
    let onValue = null;
    let clock = 1000000;
    const logs = [];
    const host = {
        log: { info: m => logs.push(m), warn: m => logs.push('WARN ' + m) },
        settings: () => Object.assign({ profile: 'x3m40i', tankLitres: 65 }, settings),
        subscribe(sig, cb) { onValue = cb; calls.signals = sig; }
    };
    const svc = Main.start(host, { cr, now: () => clock });
    t.after(() => svc.stop());   /* a failed assertion must not leave a timer running */
    return {
        calls, logs, svc, on,
        send: (s, f, v) => onValue(s, f, v),
        tick: ms => { clock += ms; },
        rpm: v => onValue('de.bmw.infotainment.vehicle.CDS',
            'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: v * 4 })
    };
}

test('subscribes every service the theme needs', { timeout: 10000 }, (t) => {
    const h = harness(t);
    assert.ok(Object.keys(h.calls.signals).length >= 5);
    assert.ok(h.calls.signals['de.bmw.infotainment.vehicle.CDS']);
    assert.ok(h.calls.signals['de.bmw.infotainment.vehicle.Vehicle2']);
});

test('builds the cluster once connected', { timeout: 10000 }, (t) => {
    const h = harness(t);
    h.on.ready();
    assert.strictEqual(h.calls.asset, 1);
    assert.ok(h.calls.effect > 30);
    assert.strictEqual(h.calls.pixels, 1, 'the atlas bytes go up on connect');
    h.svc.stop();
    assert.ok(h.calls.drop > 30);
});

test('a reconnect re-sends the atlas without duplicating layers', { timeout: 10000 }, (t) => {
    const h = harness(t);
    h.on.ready();
    const layers = h.calls.effect;
    h.on.disconnected();
    h.on.ready();
    assert.strictEqual(h.calls.effect, layers, 'layers are made once; the client replays them');
    assert.strictEqual(h.calls.pixels, 2, 'the asset bytes are ours to re-send');
});

test('the engine speed decides whether we draw at all', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    const before = h.calls.uniform;
    /* No engine speed yet: nothing should be drawn. */
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(h.calls.uniform, before, 'nothing drawn while the car is asleep');

    h.rpm(2000);
    await new Promise(r => setTimeout(r, 400));
    assert.ok(h.calls.uniform > before, 'drawing once the engine is turning');
    assert.ok(h.logs.some(l => /cluster: on/.test(l)));
});

test('the cluster goes back to BMW when the signal stops', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.rpm(2000);
    /* The idle loop ticks every 250 ms, so give it one. */
    await new Promise(r => setTimeout(r, 340));
    assert.ok(h.logs.some(l => /cluster: on/.test(l)), 'it should be drawing first');
    const drops = h.calls.drop;
    h.tick(5000);                       /* the reading goes stale */
    await new Promise(r => setTimeout(r, 120));
    assert.ok(h.calls.drop > drops, 'layers are dropped, not left on a sleeping cluster');
    assert.ok(h.logs.some(l => /handed back to BMW/.test(l)));
});

test('the enabled setting keeps it off', { timeout: 10000 }, async (t) => {
    const h = harness(t, { enabled: false });
    h.on.ready();
    h.rpm(2000);
    const before = h.calls.uniform;
    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(h.calls.uniform, before, 'disabled means disabled');
});
