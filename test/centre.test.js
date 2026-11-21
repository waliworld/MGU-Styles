'use strict';
/*
 * The centre's sources against fake Waze-on-cluster and Turn View services
 * on real Unix sockets: what we ask, when we give it back, and that we
 * never stay connected to Turn View.
 */
const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const Centre = require('../src/car/centre.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'centre-')); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) {
    const end = Date.now() + (ms || 4000);
    while (Date.now() < end) { if (fn()) return true; await wait(25); }
    return false;
}

/* waze-on-cluster: a status file and a control socket that moves the map */
function fakeWaze(dir, opts) {
    opts = opts || {};
    const st = { state: opts.state || 'showing', target: 'map' };
    const file = path.join(dir, 'status.json');
    const write = () => fs.writeFileSync(file, JSON.stringify(st));
    write();
    const tick = setInterval(write, 200);
    const cmds = [];
    const sock = path.join(dir, 'ctl.sock');
    const srv = net.createServer((c) => {
        c.setEncoding('utf8');
        c.on('data', (d) => {
            d.split('\n').filter(Boolean).forEach((l) => {
                const m = JSON.parse(l);
                cmds.push(m);
                if (opts.busy) { c.write('{"ok":false,"reason":"busy"}\n'); return; }
                st.target = m.target; write();
                c.write('{"ok":true}\n');
            });
        });
        c.on('error', () => {});
    }).listen(sock);
    return { st, cmds, file, sock, close: () => { clearInterval(tick); srv.close(); } };
}

/* Turn View's tool: pushes its state on connect, takes 'set' */
function fakeTv(dir, init) {
    const state = { settings: { enabled: false }, status: { camera: 'off', route: 'none', maneuver: null } };
    Object.assign(state.status, init || {});
    let open = 0, maxOpen = 0, connects = 0;
    const sets = [];
    const sock = path.join(dir, 'tv.sock');
    const srv = net.createServer((c) => {
        open++; connects++; maxOpen = Math.max(maxOpen, open);
        c.on('close', () => { open--; });
        c.on('error', () => {});
        c.setEncoding('utf8');
        c.write(JSON.stringify({ state }) + '\n');
        c.on('data', (d) => {
            d.split('\n').filter(Boolean).forEach((l) => {
                const q = JSON.parse(l);
                if (q.op === 'set') {
                    sets.push(q.settings);
                    Object.assign(state.settings, q.settings);
                    state.status.camera = state.settings.enabled ? 'decoding' : 'off';
                    c.write(JSON.stringify({ state }) + '\n');
                }
            });
        });
    }).listen(sock);
    return { state, sets, sock, stats: () => ({ open, maxOpen, connects }), close: () => srv.close() };
}

function make(dir, w, t) {
    return Centre.create({ dataDir: dir, paths: { wazeStatus: w ? w.file : path.join(dir, 'none.json'), wazeCtl: w ? w.sock : path.join(dir, 'none.sock'), tvCtl: t ? t.sock : path.join(dir, 'none2.sock') } });
}

test('waze: moved into the panel when wanted, the window opens, and it goes back', async (t) => {
    const dir = tmp(), w = fakeWaze(dir), c = make(dir, w, null);
    t.after(() => { c.stop(); w.close(); });
    c.start();
    await wait(300);
    assert.strictEqual(w.cmds.length, 0, 'nothing asked while not wanted');
    c.want('waze');
    assert.ok(await until(() => c.info().wazeUp), 'map showing in the panel');
    assert.deepStrictEqual(w.cmds[0], { cmd: 'start', target: 'panel' });
    assert.ok(await until(() => c.state().open === 1), 'window fully open');
    assert.strictEqual(c.state().mode, 'map');
    c.want('off');
    assert.ok(await until(() => w.st.target === 'map'), 'given back to its own slot');
    assert.ok(await until(() => c.state().open === 0 && c.state().mode === 'neutral'));
    assert.ok(await until(() => JSON.parse(fs.readFileSync(path.join(dir, 'centre.json'))).wazeMoved === false),
              'remembers the map is back');
});

test('waze: never moves a map we did not move, and stop() hands ours back', async (t) => {
    const dir = tmp(), w = fakeWaze(dir), c = make(dir, w, null);
    t.after(() => w.close());
    w.st.target = 'panel';                       /* someone else put it there */
    c.start();
    await wait(400);
    assert.strictEqual(w.cmds.length, 0);
    c.want('waze');
    await wait(200);
    c.stop();
    assert.strictEqual(w.cmds.length, 0, 'already on the panel: nothing to send, and not ours to take back');

    const dir2 = tmp(), w2 = fakeWaze(dir2), c2 = make(dir2, w2, null);
    t.after(() => w2.close());
    c2.start(); c2.want('waze');
    assert.ok(await until(() => w2.st.target === 'panel'));
    await new Promise((r) => c2.stop(r));
    assert.strictEqual(w2.st.target, 'map', 'stop gives the map back');
});

test('waze: busy, off and missing service are reported, not thrown', async (t) => {
    const dir = tmp(), w = fakeWaze(dir, { busy: true }), c = make(dir, w, null);
    t.after(() => { c.stop(); w.close(); });
    c.start(); c.want('waze');
    assert.ok(await until(() => /busy|retrying/i.test(c.info().waze)), c.info().waze);
    assert.strictEqual(c.state().mode, 'neutral');
    const c2 = make(tmp(), null, null);
    c2.start(); c2.want('waze');
    await wait(300);
    assert.match(c2.info().waze, /not running/);
    c2.stop();
});

test('turn view: maneuvers become a turn card, with short connections only', async (t) => {
    const dir = tmp();
    const tv = fakeTv(dir, { route: 'active', maneuver: { kind: 'intersection', angle: 90, side: -1, exit: 0, text: '0.3 mi' } });
    const c = make(dir, null, tv);
    t.after(() => { c.stop(); tv.close(); });
    c.start(); c.want('turn');
    assert.ok(await until(() => c.state().mode === 'turn'));
    const m = c.state().maneuver;
    assert.deepStrictEqual(m, { kind: 'intersection', angle: 90, side: -1, exit: 0, text: '0.3 mi' });
    assert.strictEqual(c.state().open, 0, 'our own card: no window');
    await wait(2500);
    assert.ok(tv.stats().connects >= 2, 'polled again');
    assert.strictEqual(tv.stats().open, 0, 'no connection held between polls');
    assert.strictEqual(tv.stats().maxOpen, 1);
    assert.deepStrictEqual(tv.sets, [], 'turn card never switches Turn View on');
    tv.state.status.route = 'none';
    assert.ok(await until(() => c.state().mode === 'neutral', 4000), 'route ended: card goes');
});

test('turn view camera: switched on when chosen, off again when left', async (t) => {
    const dir = tmp(), tv = fakeTv(dir), c = make(dir, null, tv);
    t.after(() => { c.stop(); tv.close(); });
    c.start(); c.want('camera');
    assert.ok(await until(() => c.info().cameraUp), c.info().turnView);
    assert.deepStrictEqual(tv.sets, [{ enabled: true }]);
    assert.ok(await until(() => c.state().mode === 'camera' && c.state().open === 1));
    c.want('off');
    assert.ok(await until(() => tv.sets.length === 2));
    assert.deepStrictEqual(tv.sets[1], { enabled: false });
    assert.ok(await until(() => c.state().open === 0));
});

test('turn view camera: one the driver switched on is left on', async (t) => {
    const dir = tmp(), tv = fakeTv(dir), c = make(dir, null, tv);
    t.after(() => { c.stop(); tv.close(); });
    tv.state.settings.enabled = true; tv.state.status.camera = 'decoding';
    c.start(); c.want('camera');
    assert.ok(await until(() => c.info().cameraUp));
    c.want('off');
    await wait(2500);
    assert.deepStrictEqual(tv.sets, [], 'not ours to switch off');
});

test('the window closes before it changes picture', async (t) => {
    let clock = 0;
    const dir = tmp(), w = fakeWaze(dir);
    t.after(() => w.close());
    const c = Centre.create({ dataDir: dir, now: () => Date.now() + clock, paths: { wazeStatus: w.file, wazeCtl: w.sock, tvCtl: path.join(dir, 'x') } });
    c.start(); c.want('waze');
    assert.ok(await until(() => c.state().open === 1));
    c.want('turn');                     /* no maneuver: neutral */
    const a = c.state();
    assert.strictEqual(a.mode, 'map', 'still the map while it closes');
    clock += Centre.CLOSE_MS / 2;
    const mid = c.state();
    assert.ok(mid.open > 0 && mid.open < 1, 'half closed: ' + mid.open);
    clock += Centre.CLOSE_MS;
    const end = c.state();
    assert.strictEqual(end.open, 0);
    assert.strictEqual(end.mode, 'neutral');
    c.stop();
});
