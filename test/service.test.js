'use strict';
/*
 * The service end to end, against a recording stand-in for cluster-render
 * and a fake head unit: signals in, uniforms out, and the cluster handed
 * back to BMW whenever it should be.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Main = require('../src/car/main.js');

const CDS = 'de.bmw.infotainment.vehicle.CDS';
const COND = 'de.bmw.infrastructure.VehicleCondition';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function harness(t, initial, centre) {
    const calls = { effect: 0, uniform: 0, drop: 0, asset: 0, pixels: 0 };
    const on = {};
    let ref = 100;
    const cr = {
        on(e, f) { on[e] = f; },
        asset() { calls.asset++; return ++ref; },
        effect() { calls.effect++; return ++ref; },
        uniform() { calls.uniform++; },
        bind() {}, set() {},
        drop() { calls.drop++; }, pixels() { calls.pixels++; }, close() {}
    };
    let onValue = null, changed = null;
    let clock = 1000000;
    let values = Object.assign({ profile: 'x3m40i', enabled: true }, initial);
    const logs = [];
    const host = {
        log: { info: m => logs.push(m), warn: m => logs.push('WARN ' + m) },
        settings: () => values,
        onSettingsChanged(fn) { changed = fn; },
        subscribe(sig, cb) { onValue = cb; calls.signals = sig; }
    };
    const svc = Main.start(host, { cr, now: () => clock, centre });
    t.after(() => svc.stop());   /* a failed assertion must not leave a timer running */
    return {
        calls, logs, svc, on,
        send: (s, f, v) => onValue(s, f, v),
        tick: ms => { clock += ms; },
        rpm: v => onValue(CDS, 'statusEngineSpeed2', { actualValueRPMEngineCrankshaft: v * 4 }),
        condition: c => onValue(COND, 'VehicleCondition', { statusConditionVehicle: c }),
        change(next) { values = Object.assign({}, values, next); changed(); }
    };
}

test('subscribes everything the cluster reads, G-force and car state included', { timeout: 10000 }, (t) => {
    const h = harness(t);
    const sig = h.calls.signals;
    for (const svc of ['de.bmw.infotainment.vehicle.CDS', 'de.bmw.infotainment.vehicle.Vehicle2',
                       'de.bmw.infrastructure.VehicleInformation', 'de.bmw.infotainment.vehicle.CDS2',
                       'de.bmw.infrastructure.VehicleCondition']) {
        assert.ok(sig[svc], `missing ${svc}`);
    }
    assert.ok(sig['de.bmw.infrastructure.VehicleInformation'].DataPowerTrain2, 'the engaged gear');
});

test('it is off until turned on: installing never takes the cluster', { timeout: 10000 }, async (t) => {
    const h = harness(t, { enabled: undefined });
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    assert.strictEqual(h.calls.effect, 0, 'nothing on the cluster');
    assert.strictEqual(h.svc.status(), 'Off - BMW original cluster');
});

test('turned on with the car ready, it draws', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    assert.strictEqual(h.calls.asset, 1, 'one atlas');
    assert.ok(h.calls.effect > 30, 'the layers go up');
    assert.ok(h.calls.uniform > 0, 'and are driven');
    assert.strictEqual(h.svc.status(), 'On the cluster');
});

test('nothing goes up while the car is off or switching on', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('WOHNEN');                     /* 5: parked, someone inside */
    h.rpm(0);
    await wait(320);
    assert.strictEqual(h.calls.effect, 0);
    assert.strictEqual(h.svc.status(), 'Waiting for the car to switch on');
    h.condition('FAHRBEREITSCHAFT_HERSTELLEN'); /* 8: drive readiness starting */
    await wait(320);
    assert.strictEqual(h.calls.effect, 0, 'no new layout while the KOMBI switches on');
    h.condition('FAHREN');
    await wait(320);
    assert.ok(h.calls.effect > 30);
});

test('switching off hands the cluster back to BMW', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(1500);
    await wait(320);
    const drops = h.calls.drop;
    h.condition('FAHRBEREITSCHAFT_BEENDEN');   /* 12: drive readiness ending */
    await wait(120);
    assert.ok(h.calls.drop > drops, 'layers dropped');
    assert.ok(h.logs.some(l => /handed back to BMW/.test(l)));
});

test('a car that sends no state falls back to the engine speed', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    await wait(300);
    assert.strictEqual(h.calls.effect, 0, 'no engine speed, no state: off');
    h.rpm(900);
    await wait(320);
    assert.ok(h.calls.effect > 30);
    h.tick(5000);                              /* the reading goes stale */
    await wait(120);
    assert.ok(h.logs.some(l => /handed back to BMW/.test(l)));
});

test('nothing is drawn until cluster-render is there', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    assert.strictEqual(h.calls.effect, 0);
    assert.strictEqual(h.svc.status(), 'Waiting for cluster-render');
    h.on.ready();
    await wait(320);
    assert.ok(h.calls.effect > 30);
});

test('a changed setting rebuilds the cluster, old layers down first', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    const made = h.calls.effect, drops = h.calls.drop;
    h.change({ background: 'modern', scaleMaxRpm: 7000 });
    await wait(600);                           /* settle, then rebuild */
    assert.ok(h.calls.drop >= drops + made, 'every old layer and the atlas dropped');
    assert.ok(h.calls.effect > made, 'and rebuilt');
    assert.strictEqual(h.svc.theme().settings.background, 'modern');
    assert.strictEqual(h.svc.theme().settings.scaleMaxRpm, 7000);
    assert.strictEqual(h.calls.asset, 2, 'one atlas at a time');
});

test('turning it off from the settings hands the cluster back', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    assert.ok(h.svc.isRunning());
    h.change({ enabled: false });
    await wait(700);
    assert.ok(!h.svc.isRunning());
    assert.strictEqual(h.svc.status(), 'Off - BMW original cluster');
});

test('a reconnect re-sends the atlas without remaking the layers', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    h.condition('FAHREN');
    h.rpm(2000);
    await wait(320);
    const layers = h.calls.effect, pixels = h.calls.pixels;
    h.on.disconnected();
    h.on.ready();
    assert.strictEqual(h.calls.effect, layers, 'the client replays its layers itself');
    assert.strictEqual(h.calls.pixels, pixels + 1, 'the atlas bytes are ours to send');
});

test('a bad signal payload never brings the service down', { timeout: 10000 }, async (t) => {
    const h = harness(t);
    h.on.ready();
    for (const v of [null, undefined, 42, 'x', {}, { statusConditionVehicle: {} }]) {
        h.send(COND, 'VehicleCondition', v);
        h.send(CDS, 'statusEngineSpeed2', v);
        h.send('de.bmw.infotainment.vehicle.CDS2', 'statusLateralAccelerationMassCenter', v);
    }
    await wait(300);
    assert.ok(!h.logs.some(l => /^WARN frame/.test(l)), 'no frame failed');
});

/* A centre that records what it is asked for and hands out a fixed state. */
function fakeCentre() {
    const asked = [];
    let stopped = false;
    return {
        asked, isStopped: () => stopped,
        start() {}, want(p) { if (asked[asked.length - 1] !== p) asked.push(p); },
        state: () => ({ mode: 'map', open: 1, maneuver: null }),
        info: () => ({ waze: 'Waze map showing', turnView: 'No route', wazeUp: true, cameraUp: false }),
        stop() { stopped = true; }
    };
}

test('Track: the centre is asked for only while our layers are up, and given back', { timeout: 10000 }, async (t) => {
    const c = fakeCentre();
    const h = harness(t, { style: 'track', centre: 'waze' }, c);
    h.on.ready();
    h.condition('WOHNEN');
    await wait(300);
    assert.deepStrictEqual(c.asked, ['off'], 'parked: nothing moved into the cluster');
    h.condition('FAHREN');
    h.rpm(1500);
    await wait(300);
    assert.strictEqual(c.asked[c.asked.length - 1], 'waze');
    assert.strictEqual(h.svc.centre().waze, 'Waze map showing');
    const frame = h.svc.driver() && h.svc.theme().layers.find((L) => L.id === 'frame');
    assert.ok(frame, 'the Track frame is up');
    h.condition('FAHRBEREITSCHAFT_BEENDEN');
    await wait(300);
    assert.strictEqual(c.asked[c.asked.length - 1], 'off', 'key-off gives the map back');
    h.svc.stop();
    assert.ok(c.isStopped());
});

test('Toro asks for the map only when its own centre is set to it', { timeout: 10000 }, async (t) => {
    const off = fakeCentre();
    const h = harness(t, { style: 'toro', centre: 'off' }, off);
    h.on.ready(); h.condition('FAHREN'); h.rpm(1500);
    await wait(300);
    assert.deepStrictEqual(off.asked, ['off'], 'nothing moved while the opening is shut');

    const on = fakeCentre();
    const h2 = harness(t, { style: 'toro', centre: 'waze' }, on);
    h2.on.ready(); h2.condition('FAHREN'); h2.rpm(1500);
    await wait(300);
    assert.strictEqual(on.asked[on.asked.length - 1], 'waze', 'the opening asks for the map');
});

test('switching style rebuilds the cluster and moves the centre with it', { timeout: 10000 }, async (t) => {
    const c = fakeCentre();
    const h = harness(t, { style: 'toro', centre: 'camera' }, c);
    h.on.ready(); h.condition('FAHREN'); h.rpm(1500);
    await wait(300);
    assert.strictEqual(h.svc.theme().id, 'toro');
    h.change({ style: 'track' });
    await wait(800);
    assert.strictEqual(h.svc.theme().id, 'track');
    assert.strictEqual(c.asked[c.asked.length - 1], 'camera');
    h.change({ centre: 'off' });
    await wait(800);
    assert.strictEqual(c.asked[c.asked.length - 1], 'off');
});
