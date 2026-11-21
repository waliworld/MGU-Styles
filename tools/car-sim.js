#!/usr/bin/env node
'use strict';
/*
 * The car, simulated: the built app, run end to end in this container.
 *
 *   node tools/car-sim.js            run, report, write build/car-sim/
 *
 * It builds the real package with the kit's own builder, then stands in for
 * the three things only a head unit has - BMW's oap-sdk, its native SOME/IP
 * binding, and the cluster-render service's socket - and runs the built
 * app.js, unmodified, through a key-on, drive, limiter, key-off sequence.
 *
 * What it proves: the package builds; the kit runtime starts it; the real
 * signal path (kit/runtime/signals.js) feeds it; the real cluster-render
 * client puts layers on the wire; it stays off until the car is ready and
 * hands the cluster back at key-off; and every shader it sends compiles in
 * GLSL ES 1.00. It also captures exactly what the renderer was told, so
 * tools/car-sim-replay.html can draw the cluster the way the car would.
 *
 * What it cannot prove: anything about BMW's SDK or the KOMBI themselves.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'app.base.json'), 'utf8'));
const ID = spec.id;
const PKG = path.join(ROOT, 'dist', ID);
const SRC = path.join(PKG, 'source');
const OUT = path.join(ROOT, 'build', 'car-sim');
const SOCK_DIR = '/dev/shm/cluster-render';
const SOCK = path.join(SOCK_DIR, 'render.sock');

function sh(cmd) { cp.execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }); }

/* ------------------------------------------------------------ build */
function build() {
    sh('node tools/stage-app.js');
    sh('python3 kit/tools/build.py --preview-only ' + ID);
}

/* ------------------------------------------------- the head unit's parts */
function installHeadUnit(settings) {
    const nm = path.join(SRC, 'node_modules');
    const put = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(nm, rel)), { recursive: true });
        fs.writeFileSync(path.join(nm, rel), text);
    };
    /* BMW's SDK: an app with no screens, so the kit runs it in the background
       the way the platform's autostart does. */
    put('oap-sdk/package.json', '{"name":"oap-sdk","version":"0.0.0-sim","main":"index.js"}');
    put('oap-sdk/index.js', `'use strict';
const EventEmitter = require('events');
class OnlineApp extends EventEmitter {
  constructor() { super(); this.rhmiApplication = null; }
  start() { setTimeout(() => this.emit('appStatusProxyReady'), 5); return Promise.resolve(); }
  registerActive() { return Promise.resolve(); }
}
const say = (l) => (m) => process.stdout.write('[sdk ' + l + '] ' + m + '\\n');
module.exports = { OnlineApp, logging: { getSDKLogger: () => ({
  error: say('error'), warn: say('warn'), info: say('info'), debug() {} }) } };
`);
    /* The native SOME/IP binding: proxies that deliver the scenario's
       payloads to whoever subscribed. */
    put('someip/package.json', '{"name":"someip","version":"0.0.0-sim","main":"index.js"}');
    put('someip/index.js', `'use strict';
const scenario = require(process.env.CAR_SIM_SCENARIO);
const t0 = Date.now();
exports.buildProxy = (cfg, instance) => Promise.resolve({
  init() { return Promise.resolve(); },
  isAvailable() { return true; },
  subscribeToAvailability(cb) { setImmediate(() => cb(true)); },
  getValue(field) {
    const v = scenario.value(cfg.interface, field, Date.now() - t0);
    return v === undefined ? Promise.reject(new Error('no value')) : Promise.resolve(v);
  },
  subscribe(sub) {
    setInterval(() => {
      const v = scenario.value(cfg.interface, sub.name, Date.now() - t0);
      if (v !== undefined) sub.onReceive(v);
    }, 40);
    return Promise.resolve();
  },
  shutdown() { return Promise.resolve(); }
});
`);
    /* Per-interface configs, as the head unit keeps them. */
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', ID, 'app.json'), 'utf8'));
    const dir = path.join(PKG, 'someipInterfaces');
    fs.mkdirSync(dir, { recursive: true });
    Object.keys(app.signals).forEach((iface) => {
        const fields = {};
        Object.keys(app.signals[iface]).filter((f) => f[0] !== '_')
            .forEach((f) => { fields[f] = { getter: true, notifier: true }; });
        fs.writeFileSync(path.join(dir, iface.replace(/\./g, '_') + '.json'),
            JSON.stringify({ interface: iface, fields }));
    });
    /* Settings, as the iDrive screen would have saved them. */
    const data = path.join(PKG, 'data');
    fs.rmSync(data, { recursive: true, force: true });
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify(settings));
    return data;
}

/* ------------------------------------------- the renderer's socket */
function renderer() {
    const state = { atlas: null, hello: null, layers: {}, assets: {}, refused: [], ops: {}, bytes: 0, frames: 0 };
    fs.mkdirSync(SOCK_DIR, { recursive: true });
    try { fs.unlinkSync(SOCK); } catch (e) { /* none */ }
    const reply = (sock, obj) => {
        const b = Buffer.from(JSON.stringify(obj));
        const m = Buffer.alloc(5 + b.length);
        m.writeUInt32LE(b.length + 1, 0); m[4] = 0x4a; b.copy(m, 5);
        sock.write(m);
    };
    const server = net.createServer((sock) => {
        let buf = Buffer.alloc(0);
        sock.on('error', () => {});
        sock.on('data', (d) => {
            buf = Buffer.concat([buf, d]);
            while (buf.length >= 5) {
                const len = buf.readUInt32LE(0);
                if (buf.length < 4 + len) break;
                const type = buf[4], body = buf.slice(5, 4 + len);
                buf = buf.slice(4 + len);
                state.bytes += 4 + len;
                if (type === 0x46) {                       /* a frame: the atlas */
                    const ref = body.readUInt32LE(0), n = body.readUInt16LE(12);
                    state.assets[ref] = state.assets[ref] || {};
                    state.assets[ref].pixels = body.slice(14 + n * 8);
                    state.atlas = state.assets[ref].pixels;
                    state.frames++;
                    continue;
                }
                const m = JSON.parse(body.toString('utf8'));
                state.ops[m.op] = (state.ops[m.op] || 0) + 1;
                if (m.op === 'hello') {
                    state.hello = m;
                    reply(sock, { ev: 'hello', proto: 1, backend: 'id7',
                                  targets: 'map:1088x480,panel:1920x720,hud:800x480' });
                } else if (m.op === 'asset') {
                    state.assets[m.ref] = Object.assign(state.assets[m.ref] || {}, { meta: m });
                } else if (m.op === 'layer') {
                    state.layers[m.ref] = { msg: m, uniforms: {}, binds: {}, visible: m.visible !== 0 };
                } else if (m.op === 'uniform' && state.layers[m.ref]) {
                    state.layers[m.ref].uniforms[m.name] = m.v.split(' ').map(Number);
                } else if (m.op === 'bind' && state.layers[m.ref]) {
                    state.layers[m.ref].binds[m.sampler] = m.asset;
                } else if (m.op === 'set' && state.layers[m.ref]) {
                    if (m.visible !== undefined) state.layers[m.ref].visible = m.visible !== 0;
                } else if (m.op === 'drop') {
                    delete state.layers[m.ref];
                    delete state.assets[m.ref];
                }
            }
        });
    });
    server.listen(SOCK);
    return { state, close: () => server.close() };
}

/* ------------------------------------------------------- scenario */
function writeScenario(file) {
    fs.writeFileSync(file, `'use strict';
/* key-on at 2.5 s, drive readiness at 4 s, a pull to the limiter, key-off at 10.5 s */
const CDS = 'de.bmw.infotainment.vehicle.CDS', V2 = 'de.bmw.infotainment.vehicle.Vehicle2';
const VI = 'de.bmw.infrastructure.VehicleInformation', VC = 'de.bmw.infrastructure.VehicleCondition';
const FES = 'de.bmw.infotainment.drivingexcitement.FES', CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
const KI = 'de.bmw.infotainment.KombiIF', ENV = 'de.bmw.infrastructure.EnvironmentalInformation';
function drive(t) {
  if (t < 4000) return { rpm: 0, kmh: 0, gear: 3 };
  if (t < 5000) return { rpm: 760, kmh: 0, gear: 3 };
  const u = Math.min(1, (t - 5000) / 1800);
  const rpm = t < 7600 ? 1600 + u * 5390 : 5200;           /* to 6990 by 6.8 s, held to 7.6 s */
  return { rpm, kmh: 35 + u * 55, gear: 5 + Math.min(3, Math.floor((t - 5000) / 900)) };
}
exports.value = (iface, field, t) => {
  const d = drive(t);
  if (iface === VC) return { statusConditionVehicle: t < 2500 ? 'WOHNEN' : t < 4000 ? 'FAHRBEREITSCHAFT_HERSTELLEN'
                                                    : t < 10500 ? 'FAHREN' : 'FAHRBEREITSCHAFT_BEENDEN' };
  if (iface === CDS && field === 'statusEngineSpeed2') return t < 10500 ? { actualValueRPMEngineCrankshaft: Math.round(d.rpm * 4) } : undefined;
  if (iface === CDS && field === 'statusEngineTemperature') return { temperatureEngineDrive: 48 + 92, temperatureEngineOilDrive: 48 + 104 };
  if (iface === V2) return { speedVehicleCentreOfGravity: Math.round(d.kmh * 64) };
  if (iface === VI && field === 'DataPowerTrain2') return { statusGearSelectionDrive: d.gear };
  if (iface === FES && field === 'statusSwitchDriveDynamicSport2') return { displayBoostPressure: t > 5000 && t < 7600 ? 108 : 0, actualValueModeDrivingExperience: 'SPORT_EXPERT' };
  if (iface === FES) return { actualValueModeDrivingExperience: 'SPORT_EXPERT' };
  if (iface === CDS2 && field === 'statusLateralAccelerationMassCenter') return { lateralAccelerationCentreOfGravity: Math.round((65 + 0.4 * 9.80665 * Math.sin(t / 700)) / 0.002) };
  if (iface === CDS2) return { longitudinalAccelerationCentreOfGravity: Math.round((65 + 0.3 * 9.80665) / 0.002) };
  if (iface === KI) return { range: 412, fluidLevelFuelTank: 41, mileageKilometre: 18420 };
  if (iface === ENV) return { temperatureExterior: Math.round((21.5 + 40) / 0.5) };
  return undefined;
};
`);
}

/* ------------------------- the Track centre's two neighbours, faked */
function neighbours() {
    const dir = path.join(OUT, 'neighbours');
    fs.mkdirSync(dir, { recursive: true });
    /* waze-on-cluster: status file + control socket that moves the map */
    const waze = { target: 'map', state: 'showing', cmds: [] };
    const statusFile = path.join(dir, 'waze-status.json');
    const writeStatus = () => fs.writeFileSync(statusFile, JSON.stringify({ state: waze.state, target: waze.target }));
    writeStatus();
    const tick = setInterval(writeStatus, 500);
    const wazeSock = path.join(dir, 'waze-ctl.sock');
    const ws = net.createServer((c) => {
        c.setEncoding('utf8'); c.on('error', () => {});
        c.on('data', (d) => d.split('\n').filter(Boolean).forEach((l) => {
            let m; try { m = JSON.parse(l); } catch (e) { return; }
            waze.cmds.push({ t: Date.now(), target: m.target });
            waze.target = m.target; writeStatus();
            c.write('{"ok":true}\n');
        }));
    }).listen(wazeSock);
    /* Turn View's tool: a route with a left turn coming */
    const tv = { connects: 0, open: 0, maxOpen: 0 };
    const tvSock = path.join(dir, 'tv-ctl.sock');
    const ts = net.createServer((c) => {
        tv.connects++; tv.open++; tv.maxOpen = Math.max(tv.maxOpen, tv.open);
        c.on('close', () => { tv.open--; }); c.on('error', () => {});
        c.write(JSON.stringify({ state: { settings: { enabled: false }, status: { camera: 'off', route: 'active',
            maneuver: { kind: 'intersection', angle: 90, side: -1, exit: 0, text: '0.3 mi' } } } }) + '\n');
    }).listen(tvSock);
    return {
        waze, tv,
        env: { WAZE_STATUS: statusFile, WAZE_CTL: wazeSock, TURNVIEW_CTL: tvSock },
        close: () => { clearInterval(tick); ws.close(); ts.close(); }
    };
}

/* ------------------------------------------------------------ run */
function snapshot(state, t) {
    const layers = Object.keys(state.layers).map((r) => {
        const l = state.layers[r];
        return JSON.parse(JSON.stringify({ ref: Number(r), msg: l.msg, uniforms: l.uniforms, binds: l.binds, visible: l.visible }));
    });
    return { t, layers, ops: Object.assign({}, state.ops), bytes: state.bytes };
}

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    process.stdout.write('building the package with the kit\'s builder... ');
    build();
    console.log('done');

    const THEME = process.env.CAR_SIM_THEME || 'toro';
    const data = installHeadUnit({ enabled: true, style: THEME, centre: process.env.CAR_SIM_CENTRE || 'waze',
                                   background: process.env.CAR_SIM_BG || 'genuine' });
    const nb = neighbours();
    const scenarioFile = path.join(OUT, 'scenario.js');
    writeScenario(scenarioFile);
    const r = renderer();

    const log = [];
    const app = cp.spawn(process.execPath, [path.join(SRC, 'javascript', 'app.js')], {
        cwd: data, env: Object.assign({}, process.env, nb.env, { CAR_SIM_SCENARIO: scenarioFile })
    });
    app.stdout.on('data', (d) => log.push(String(d)));
    app.stderr.on('data', (d) => log.push('ERR ' + String(d)));
    let exited = null;
    app.on('exit', (code) => { exited = code; });

    const marks = [[2000, 'parked, ignition off'], [3500, 'drive readiness starting'],
                   [6200, 'pulling through 5,000 rpm'], [7300, 'on the limiter'],
                   [9400, 'cruising'], [11800, 'switched off']];
    const shots = [];
    const start = Date.now();
    for (const [at, what] of marks) {
        await new Promise((res) => setTimeout(res, Math.max(0, at - (Date.now() - start))));
        const s = snapshot(r.state, at);
        s.what = what;
        s.wazeTarget = nb.waze.target;
        s.theme = THEME;
        shots.push(s);
    }
    app.kill('SIGTERM');
    await new Promise((res) => setTimeout(res, 300));
    r.close();
    nb.close();

    /* the atlas as the renderer received it */
    fs.writeFileSync(path.join(OUT, 'snapshots.json'), JSON.stringify(shots));
    if (r.state.atlas) fs.writeFileSync(path.join(OUT, 'atlas.r8'), r.state.atlas);
    fs.writeFileSync(path.join(OUT, 'app.log'), log.join(''));
    const fileLog = path.join(data, ID + '.log');
    if (fs.existsSync(fileLog)) fs.copyFileSync(fileLog, path.join(OUT, 'app-file.log'));

    /* ------------------------------------------------ report */
    console.log('\nthe app ' + (exited === null || exited === 0 || exited === 143 ? 'ran' : 'EXITED ' + exited) +
        '; renderer said hello to "' + (r.state.hello && r.state.hello.app) + '"');
    shots.forEach((s) => {
        const vis = s.layers.filter((l) => l.visible).length;
        console.log('  ' + (s.t / 1000).toFixed(1) + ' s  ' + s.what.padEnd(28) + vis + ' layers on the cluster');
    });
    console.log('  wire: ' + Object.keys(r.state.ops).map((k) => k + ' ' + r.state.ops[k]).join(', ') +
        '; ' + Math.round(r.state.bytes / 1024) + ' KB in ' + ((Date.now() - start) / 1000).toFixed(1) + ' s');
    const warns = log.join('').split('\n').filter((l) => /WARN|ERR|FATAL|error/i.test(l) &&
        !/someip native|no SOME\/IP config/.test(l));
    if (warns.length) { console.log('\nwarnings from the app:'); warns.slice(0, 15).forEach((w) => console.log('  ' + w)); }
    console.log('\nwrote ' + path.relative(ROOT, OUT) + '/ (snapshots, atlas, logs)');

    /* what must hold on the car */
    const on = (i) => shots[i].layers.filter((l) => l.visible).length;
    const problems = [];
    if (exited !== null && exited !== 0) problems.push('the app exited (' + exited + ')');
    if (!r.state.hello) problems.push('the app never said hello to cluster-render');
    if (on(0) || on(1)) problems.push('it drew before the car was on');
    if (!on(2) || !on(3) || !on(4)) problems.push('it did not draw while driving');
    if (shots[5].layers.length) problems.push('it did not hand the cluster back at key-off');
    if (!r.state.atlas) problems.push('the glyph atlas never arrived');
    if (THEME === 'track') {
        console.log('  waze: ' + (nb.waze.cmds.map((c) => ((c.t - start) / 1000).toFixed(1) + ' s start ' + c.target).join(', ') || 'never asked'));
        console.log('  turn view: ' + nb.tv.connects + ' polls, at most ' + nb.tv.maxOpen + ' connection open');
        const toPanel = nb.waze.cmds.filter((c) => c.target === 'panel');
        if (!toPanel.length) problems.push('Waze was never moved into the cluster');
        else if (toPanel[0].t - start < 4000) problems.push('Waze was moved before the car was on');
        if (nb.waze.target !== 'map') problems.push('Waze was not given back at key-off');
        if (shots[3].wazeTarget !== 'panel') problems.push('Waze not in the panel while driving');
        if (nb.tv.maxOpen > 1 || nb.tv.open > 0) problems.push('a Turn View connection was held open');
    }
    if (problems.length) { console.log('\nFAILED: ' + problems.join('; ')); process.exit(1); }
    console.log('car behaviour: as expected');
}

main().catch((e) => { console.error(e); process.exit(1); });
