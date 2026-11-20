'use strict';
/*
 * The cluster service: signals in, uniforms out.
 *
 * This is deliberately free of the OAP app framework. It takes a `host` that
 * supplies the three things only the head unit can give - signal
 * subscriptions, settings and a log - so the whole service can be driven by
 * a fake host in a test, and so the app shell stays a thin adapter.
 *
 * Node 8.
 */

var ClusterRenderMod = require('./cluster_render_client.js');
var Driver = require('./cluster.js');
var Vehicle = require('./vehicle.js');
var State = require('../engine/state.js');
var Theme = require('../theme/lambo.js');
var Panel = require('../geometry/panel.js');
var core = require('../shaders/core.js');
var parts = require('../shaders/parts.js');

var FRAME_MS = 33;            /* 30 Hz: the eye's limit for a gauge needle */
var IDLE_MS = 250;            /* while the car is not running */

function shaders() {
    var out = {}, k;
    for (k in core) if (Object.prototype.hasOwnProperty.call(core, k)) out[k] = core[k];
    for (k in parts) if (Object.prototype.hasOwnProperty.call(parts, k)) out[k] = parts[k];
    return out;
}

/*
 * host: {
 *   subscribe(signals, onValue)   onValue(service, field, value)
 *   settings()                    { profile, units, shiftLights, tankLitres, enabled }
 *   log                           { info, warn }
 *   onSettingsChanged(fn)         optional
 * }
 * deps lets a test pass its own ClusterRender and clock.
 */
function start(host, deps) {
    deps = deps || {};
    var log = host.log || { info: function () {}, warn: function () {} };
    var settings = host.settings() || {};
    var profileId = settings.profile || Panel.DEFAULT_PROFILE;
    var profile = Panel.profile(profileId);

    var atlas = deps.atlas || require('../../assets/fonts/atlas.json');
    var atlasPixels = deps.atlasPixels || (function () {
        var zlib = require('zlib'), fs = require('fs'), path = require('path');
        return zlib.gunzipSync(
            fs.readFileSync(path.join(__dirname, '../../assets/fonts/atlas.r8.gz')));
    })();

    var cr = deps.cr || new ClusterRenderMod.ClusterRender(
        settings.appId || 'wali_mgu_styles');
    var reader = Vehicle.createReader({});
    var theme = Theme.build(atlas, profileId, settings);
    var driver = Driver.create({
        cr: cr, theme: theme, shaders: shaders(),
        atlas: atlas, atlasPixels: atlasPixels, log: log
    });

    var timer = null;
    var running = false;
    var stopped = false;

    host.subscribe(Vehicle.SIGNALS, function (service, field, value) {
        reader.receive(service, field, value, now());
    });

    function now() { return deps.now ? deps.now() : Date.now(); }

    cr.on('ready', function () {
        log.info('cluster-render: connected');
        driver.ready();
    });
    cr.on('disconnected', function () { log.warn('cluster-render: lost, retrying'); });
    cr.on('budget', function (capKb, maxKb, reason) {
        log.info('cluster-render: budget ' + capKb + '/' + maxKb + ' KB/s (' + reason + ')');
    });
    cr.on('layer', function (ref, state, reason) {
        if (state === 'error') log.warn('cluster-render: layer ' + ref + ' ' + reason);
    });

    function frame() {
        if (stopped) return;
        var raw = reader.raw(now(), settings.tankLitres || profileTank(profile));
        /*
         * Off the cluster while the car is not running: the engine speed is
         * the signal that says the car is awake, and a theme drawn over a
         * sleeping cluster is how black boxes and odd states start.
         */
        var awake = typeof raw.rpm === 'number' && settings.enabled !== false;
        if (awake !== running) {
            running = awake;
            if (!awake) driver.stop(); else driver.ready();
            log.info('cluster: ' + (awake ? 'on' : 'off, handed back to BMW'));
        }
        if (awake) driver.tick(State.present(raw, profile, settings));
        timer = setTimeout(frame, awake ? FRAME_MS : IDLE_MS);
    }

    if (!deps.cr) cr.connect();
    frame();

    return {
        stop: function () {
            stopped = true;
            if (timer) clearTimeout(timer);
            driver.stop();
            if (cr.close) cr.close();
        },
        /* for tests */
        reader: reader, driver: driver, theme: theme
    };
}

/* Tank sizes, litres. Used only to turn the fuel level into a percentage. */
function profileTank(profile) {
    return profile.id === 'x3m40i' ? 65 : 60;
}

module.exports = { start: start, shaders: shaders, FRAME_MS: FRAME_MS };
