'use strict';
/*
 * The cluster service: signals in, uniforms out.
 *
 * Free of the app framework on purpose. It takes a `host` that supplies the
 * three things only the head unit can give - signal subscriptions, settings
 * and a log - so the whole service runs against a fake host in the tests,
 * and the app shell (apps/mgu_styles/main.js) stays a thin adapter.
 *
 * It must never throw. On the car an unexpected exit makes BMW's handler wipe
 * the app's data, and a second one uninstalls it (kit/runtime/mgu.js).
 *
 * Node 8.
 */

var ClusterRenderMod = require('./cluster_render_client.js');
var Driver = require('./cluster.js');
var Vehicle = require('./vehicle.js');
var Atlas = require('./atlas.js');
var State = require('../engine/state.js');
var Theme = require('../theme/lambo.js');
var Panel = require('../geometry/panel.js');
var core = require('../shaders/core.js');
var parts = require('../shaders/parts.js');
var dialShaders = require('../shaders/dial.js');

var FRAME_MS = 33;            /* 30 Hz: past what the eye reads off a gauge */
var IDLE_MS = 250;            /* while nothing is drawn */
var SETTLE_MS = 400;          /* settings changes, while someone scrolls through them */

function shaders() {
    var out = {}, k, i;
    var sets = [core, parts, dialShaders];
    for (i = 0; i < sets.length; i++) {
        for (k in sets[i]) {
            if (Object.prototype.hasOwnProperty.call(sets[i], k)) out[k] = sets[i][k];
        }
    }
    return out;
}

/*
 * Whether the car is in a state to draw on. VehicleCondition (kit numbering):
 * off while parked or switching off (5 or lower, 12), and no new layout while
 * drive readiness is starting (8) - a target mapped while the KOMBI switches
 * on or off can drop the cluster's display service (idv7lol, kit Redline).
 * A car that sends no state falls back to a live engine-speed reading.
 */
function carState(raw) {
    var c = raw.condition;
    if (typeof c === 'number') {
        if (c <= 5 || c === 12) return 'off';
        if (c === 8) return 'starting';
        return 'on';
    }
    return typeof raw.rpm === 'number' ? 'on' : 'off';
}

/* Tank sizes, litres, only to turn the fuel level into a percentage. */
function profileTank(profile) {
    return profile.id === 'x3m40i' ? 65 : profile.id === 'mCarS58' ? 59 : 60;
}

/*
 * host: {
 *   subscribe(signals, onValue)   onValue(service, field, value)
 *   settings()                    the current settings object
 *   onSettingsChanged(fn)         optional
 *   log                           { info, warn }
 * }
 * deps lets a test pass its own ClusterRender, clock and atlas.
 */
function start(host, deps) {
    deps = deps || {};
    var log = host.log || { info: function () {}, warn: function () {} };
    function now() { return deps.now ? deps.now() : Date.now(); }

    var loaded = deps.atlas && deps.atlasPixels ? null : Atlas.load();
    var atlas = deps.atlas || loaded.meta;
    var atlasPixels = deps.atlasPixels || loaded.pixels;

    var settings = {};
    var profile = null;
    var theme = null;
    var driver = null;
    var cr = deps.cr || new ClusterRenderMod.ClusterRender(deps.appId || 'wali_mgu_styles');
    var reader = Vehicle.createReader({});
    var SHADERS = shaders();

    var connected = false;
    var running = false;        /* our layers are up */
    var stopped = false;
    var timer = null, settleTimer = null;
    var status = 'Starting';

    /*
     * Every callback that runs outside frame() goes through this. The kit's
     * uncaughtException handler exits the process, and on the car an
     * unexpected exit is how an app loses its data or gets uninstalled.
     */
    function guard(name, fn) {
        return function () {
            try { return fn.apply(null, arguments); } catch (e) {
                log.warn(name + ': ' + (e && e.stack || e));
            }
        };
    }

    function setStatus(s) {
        if (s === status) return;
        status = s;
        log.info('status: ' + s);
    }

    /* Read the settings and build a theme and driver for them. */
    function configure() {
        try {
            settings = host.settings() || {};
            profile = Panel.profile(settings.profile || Panel.DEFAULT_PROFILE);
            theme = Theme.build(atlas, profile.id, settings);
            driver = Driver.create({
                cr: cr, theme: theme, shaders: SHADERS,
                atlas: atlas, atlasPixels: atlasPixels, log: log
            });
        } catch (e) {
            log.warn('configure: ' + (e && e.stack || e));
            driver = null;
        }
    }

    /* Settings changed: take the old layers down first - the renderer allows
       only 16 assets per client and refuses the rest silently - then rebuild. */
    function reconfigure() {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(guard('settings', function () {
            settleTimer = null;
            var wasRunning = running;
            try { if (driver) driver.stop(); } catch (e) { log.warn('stop: ' + e); }
            running = false;
            configure();
            log.info('settings applied');
            if (wasRunning && connected && driver && theme.settings.enabled) {
                driver.ready();
                running = true;
            }
        }), SETTLE_MS);
    }

    try {
        host.subscribe(Vehicle.SIGNALS, guard('signal', function (service, field, value) {
            reader.receive(service, field, value, now());
        }));
    } catch (e) { log.warn('subscribe: ' + e); }
    if (host.onSettingsChanged) host.onSettingsChanged(guard('settings', reconfigure));

    cr.on('ready', guard('ready', function () {
        connected = true;
        log.info('cluster-render: connected');
        /* the client replays our layers itself; the atlas bytes are ours */
        if (running && driver) driver.ready();
    }));
    cr.on('disconnected', guard('disconnected', function () {
        connected = false;
        log.warn('cluster-render: lost, reconnecting');
    }));
    cr.on('budget', guard('budget', function (capKb, maxKb, reason) {
        log.info('cluster-render: budget ' + capKb + '/' + maxKb + ' KB/s (' + reason + ')');
    }));
    cr.on('layer', guard('layer', function (ref, st, reason) {
        if (st === 'error') log.warn('cluster-render: layer ' + ref + ' ' + reason);
    }));
    cr.on('refused', guard('refused', function (op, ref, reason) {
        log.warn('cluster-render refused ' + op + ' ' + ref + ': ' + reason);
    }));
    /* an EventEmitter with no 'error' listener throws the error */
    cr.on('error', guard('error', function (e) { log.warn('cluster-render: ' + e); }));

    function frame() {
        if (stopped) return;
        try {
            var raw = reader.raw(now(), settings.tankLitres || profileTank(profile));
            var car = carState(raw);
            var enabled = theme && theme.settings.enabled;

            var want = enabled && connected && !!driver &&
                (car === 'on' || (car === 'starting' && running));

            if (want && !running) {
                driver.ready();
                running = true;
                log.info('cluster: on');
            } else if (!want && running) {
                driver.stop();
                running = false;
                log.info('cluster: off, handed back to BMW');
            }

            if (running) driver.tick(State.present(raw, profile, theme.settings));

            setStatus(!enabled ? 'Off - BMW original cluster'
                : !connected ? 'Waiting for cluster-render'
                : car === 'off' ? 'Waiting for the car to switch on'
                : car === 'starting' ? 'Car switching on'
                : running ? 'On the cluster' : 'Starting');
        } catch (e) {
            log.warn('frame: ' + (e && e.stack || e));
        }
        timer = setTimeout(frame, running ? FRAME_MS : IDLE_MS);
    }

    configure();
    if (!deps.cr) cr.connect();
    frame();

    return {
        stop: function () {
            stopped = true;
            if (timer) clearTimeout(timer);
            if (settleTimer) clearTimeout(settleTimer);
            try { if (driver) driver.stop(); } catch (e) { /* closing anyway */ }
            running = false;
            if (cr.close) cr.close();
        },
        status: function () { return status; },
        /* for tests */
        reader: reader,
        driver: function () { return driver; },
        theme: function () { return theme; },
        isRunning: function () { return running; }
    };
}

module.exports = { start: start, shaders: shaders, carState: carState, FRAME_MS: FRAME_MS };
