'use strict';
/*
 * What fills the centre of the Track theme: the Waze map, Turn View's
 * camera, our own turn card, or nothing.
 *
 * Two other apps own those pictures; we only ask and watch.
 *
 * Waze on cluster (robertnisipeanu/idrive-apps, native/waze-on-cluster)
 *   Draws the phone's map on cluster-render's `map` target by default: the
 *   KOMBI slot under BMW's gauges. Its control socket also takes
 *   {"cmd":"start","target":"panel"}, which puts the map in the panel scene
 *   at z 0, in BMW's map window (416,120 1088x480) - under our frame, which
 *   then cuts a window over it. The status file says where it is and
 *   whether it is showing. The socket has one owner at a time (the Waze
 *   app while its page is open answers "busy"), so we connect, send, and
 *   close, and retry. "start" is not saved by the service, and we put the
 *   map back on `map` whenever we stop wanting it - only if we moved it,
 *   remembered across restarts - so BMW's own map view and the Waze HUD
 *   map keep working. The same approach as bimmer-lab/apps (shared/waze.js).
 *
 * Turn View (IterioDev/car-apps, PolyForm Strict: used as installed,
 * nothing of it copied)
 *   On iDrive 7 its tool draws the front camera on the `map` target, under
 *   the panel. Our window over BMW's map area shows it. Its control socket
 *   pushes its state on connect: settings.enabled, status.camera,
 *   status.route and status.maneuver { kind, angle, side, exit, text }.
 *   The tool starts the Turn View app (which asks the camera ECU for the
 *   picture) only while NO client is connected, so we never stay
 *   connected: connect, read the first line, close. Turn View is off at
 *   every car start on iDrive 7; the "camera" centre switches it on, and
 *   off again when we leave, only if we switched it on.
 *
 * Never throws: every socket and file error ends in a status text.
 * Node 8.
 */

var fs = require('fs');
var net = require('net');
var path = require('path');

var PATHS = {
    wazeStatus: '/run/waze-on-cluster/status.json',
    wazeCtl: '/dev/shm/waze-on-cluster/ctl.sock',
    tvCtl: '/run/iteriodev-turnview/ctl.sock'
};
var POLL_MS = 1000;
var STALE_MS = 10000;        /* a status file older than this: the service isn't running */
var RETRY_MS = 5000;
var LINGER_MS = 800;
var READ_MS = 1500;          /* how long a Turn View poll waits for its first line */
var MANEUVER_MS = 5000;      /* a maneuver not confirmed for this long is dropped */
var OPEN_MS = 180, CLOSE_MS = 110;   /* the TBW brief, section 7 */

var PREFS = ['waze', 'camera', 'turn', 'off'];

function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/*
 * opts: { log, now, dataDir, paths: { wazeStatus, wazeCtl, tvCtl } }
 * env WAZE_STATUS, WAZE_CTL, TURNVIEW_CTL override the paths (car-sim).
 */
function create(opts) {
    opts = opts || {};
    var log = opts.log || { info: function () {}, warn: function () {} };
    var now = opts.now || Date.now;
    var p = opts.paths || {};
    var paths = {
        wazeStatus: process.env.WAZE_STATUS || p.wazeStatus || PATHS.wazeStatus,
        wazeCtl: process.env.WAZE_CTL || p.wazeCtl || PATHS.wazeCtl,
        tvCtl: process.env.TURNVIEW_CTL || p.tvCtl || PATHS.tvCtl
    };
    var memoFile = opts.dataDir ? path.join(opts.dataDir, 'centre.json') : null;
    var memo = { wazeMoved: false, tvEnabled: false };
    try {
        var m = JSON.parse(fs.readFileSync(memoFile, 'utf8'));
        memo.wazeMoved = m.wazeMoved === true;
        memo.tvEnabled = m.tvEnabled === true;
    } catch (e) { /* first run */ }

    function saveMemo() {
        if (!memoFile) return;
        try { fs.writeFileSync(memoFile, JSON.stringify(memo)); } catch (e) {
            log.warn('centre: cannot save ' + memoFile + ' (' + e.message + ')');
        }
    }

    var pref = 'off';            /* what the theme asks for right now */
    var timer = null;
    var stopped = false;
    var ticks = 0;

    /* ------------------------------------------------------------ Waze */
    var waze = { st: null, sending: false, nextTry: 0, problem: null, inflight: null };

    function wazeWanted() { return pref === 'waze'; }
    function wazeUp() {
        return wazeWanted() && !!waze.st && waze.st.target === 'panel' && waze.st.state === 'showing';
    }

    function pollWaze() {
        fs.stat(paths.wazeStatus, function (err, st) {
            if (stopped) return;
            if (err || now() - st.mtime.getTime() > STALE_MS) { waze.st = null; return syncWaze(); }
            fs.readFile(paths.wazeStatus, 'utf8', function (e, txt) {
                var s = null;
                try {
                    if (!e) {
                        var j = JSON.parse(txt);
                        s = { state: String(j.state || ''), target: j.target == null ? null : String(j.target) };
                    }
                } catch (x) { s = null; }
                waze.st = s;
                if (s && s.target === 'map' && memo.wazeMoved && !wazeWanted()) {
                    memo.wazeMoved = false; saveMemo();       /* it's back */
                }
                if (s && s.target === 'panel') waze.problem = null;
                syncWaze();
            });
        });
    }

    function syncWaze() {
        var s = waze.st;
        if (stopped || waze.sending || now() < waze.nextTry || !s) return;
        if (s.state === 'unsupported' || s.state === 'off') return;
        if (wazeWanted() && s.target !== 'panel') sendWaze('panel');
        else if (!wazeWanted() && memo.wazeMoved && s.target === 'panel') sendWaze('map');
    }

    function sendWaze(target, cb) {
        waze.sending = true;
        waze.inflight = target;
        waze.nextTry = now() + RETRY_MS;
        var answer = '', done = false, sock;
        function finish(problem) {
            if (done) return;
            done = true;
            clearTimeout(t);
            try { sock.destroy(); } catch (e) { /* closed */ }
            waze.sending = false;
            if (waze.inflight === target) waze.inflight = null;
            if (/"reason"\s*:\s*"busy"/.test(answer)) problem = 'busy';
            waze.problem = problem || null;
            if (!waze.problem && stopped && target === 'panel') {
                /* a stop overtook this: stop() is sending it back */
            } else if (!waze.problem) {
                log.info('centre: asked Waze for the map on "' + target + '"');
                memo.wazeMoved = target === 'panel';
                saveMemo();
            } else {
                log.info('centre: Waze "' + target + '" not sent (' + waze.problem + ')');
            }
            if (cb) cb();
        }
        var t = setTimeout(function () { finish(null); }, LINGER_MS + 1000);
        try { sock = net.connect(paths.wazeCtl); } catch (e) { return finish(e.code || e.message); }
        sock.setEncoding('utf8');
        sock.on('data', function (d) { if (answer.length < 4096) answer += d; });
        sock.on('error', function (e) { finish(e.code || e.message); });
        sock.on('close', function () { finish(null); });
        sock.on('connect', function () {
            sock.write(JSON.stringify({ cmd: 'start', target: target }) + '\n');
            setTimeout(function () { try { sock.end(); } catch (e) { /* closed */ } }, LINGER_MS);
        });
    }

    function wazeText() {
        var s = waze.st;
        if (!s) return 'Waze on cluster not running';
        if (s.state === 'unsupported') return 'Waze on cluster: car not supported';
        if (s.state === 'off') return 'Waze map is off in the Waze app';
        if (!wazeWanted()) return 'Waze map in BMW\'s map view';
        if (s.target !== 'panel') {
            if (waze.problem === 'busy') return 'Waze app page is open, retrying';
            if (waze.problem) return 'Cannot reach Waze on cluster (' + waze.problem + ')';
            return 'Moving the Waze map into the cluster';
        }
        if (s.state === 'showing') return 'Waze map showing';
        if (s.state === 'frozen') return 'Waze map frozen, waiting for the phone';
        return 'Waiting for the Waze map';
    }

    /* ------------------------------------------------------- Turn View */
    var tv = { st: null, at: 0, busy: false, problem: null, nextSet: 0 };

    function tvWanted() { return pref === 'camera' || pref === 'turn' || pref === 'waze'; }

    /* Connect, take the state the tool pushes on connect, close. Optionally
       send one request first. */
    function tvTalk(request, cb) {
        if (tv.busy) return;
        tv.busy = true;
        var buf = '', done = false, sock;
        function finish(problem, state) {
            if (done) return;
            done = true;
            clearTimeout(t);
            try { sock.destroy(); } catch (e) { /* closed */ }
            tv.busy = false;
            tv.problem = problem || null;
            if (state) { tv.st = state; tv.at = now(); }
            else if (problem) tv.st = null;
            if (cb) cb(!problem);
        }
        var t = setTimeout(function () { finish('no answer'); }, READ_MS);
        try { sock = net.connect(paths.tvCtl); } catch (e) { return finish(e.code || e.message); }
        sock.setEncoding('utf8');
        sock.on('error', function (e) { finish(e.code || e.message); });
        sock.on('close', function () { finish(tv.st && now() - tv.at < READ_MS ? null : 'closed'); });
        sock.on('connect', function () {
            if (request) sock.write(JSON.stringify(request) + '\n');
        });
        sock.on('data', function (d) {
            buf += d;
            if (buf.length > 65536) return finish('too long');
            var n;
            while ((n = buf.indexOf('\n')) >= 0) {
                var line = buf.slice(0, n);
                buf = buf.slice(n + 1);
                var m = null;
                try { m = JSON.parse(line); } catch (e) { continue; }
                /* after a request, wait for the state that answers it */
                if (m && m.state && (!request || !request.settings ||
                        (m.state.settings && m.state.settings.enabled === request.settings.enabled))) {
                    return finish(null, m.state);
                }
            }
        });
    }

    function tvEnabled() { return !!(tv.st && tv.st.settings && tv.st.settings.enabled); }
    function tvStatus() { return (tv.st && tv.st.status) || {}; }
    function cameraUp() {
        return pref === 'camera' && tvEnabled() && tvStatus().camera === 'decoding' && now() - tv.at < STALE_MS;
    }

    function pollTv() {
        var wantOn = pref === 'camera';
        tvTalk(null, function (ok) {
            if (!ok || stopped || now() < tv.nextSet) return;
            if (wantOn && !tvEnabled()) setTv(true);
            else if (!wantOn && memo.tvEnabled && tvEnabled()) setTv(false);
            else if (!wantOn && memo.tvEnabled && !tvEnabled()) { memo.tvEnabled = false; saveMemo(); }
        });
    }

    function setTv(on) {
        tv.nextSet = now() + RETRY_MS;
        tvTalk({ op: 'set', settings: { enabled: on } }, function (ok) {
            if (!ok) return;
            memo.tvEnabled = on;
            saveMemo();
            log.info('centre: Turn View switched ' + (on ? 'on' : 'off'));
        });
    }

    function maneuver() {
        if (!tv.st || now() - tv.at > MANEUVER_MS) return null;
        var s = tvStatus();
        var m = s.maneuver;
        if (!m || !m.kind || m.kind === 'ignored' || s.route === 'none') return null;
        return {
            kind: String(m.kind),
            angle: typeof m.angle === 'number' ? m.angle : 0,
            side: m.side < 0 ? -1 : 1,
            exit: typeof m.exit === 'number' ? m.exit : 0,
            text: typeof m.text === 'string' ? m.text.slice(0, 16) : ''
        };
    }

    function tvText() {
        if (tv.problem) return 'Turn View not running';
        if (!tv.st) return 'Turn View: checking';
        var s = tvStatus();
        if (pref === 'camera') {
            if (!tvEnabled()) return 'Switching Turn View on';
            if (s.camera === 'decoding') return 'Turn View camera showing';
            if (s.camera === 'waiting') return 'Waiting for the camera';
            return 'Turn View camera: ' + (s.camera || 'off');
        }
        return s.route === 'active' ? 'Route active' : 'No route';
    }

    /* ---------------------------------------------- the centre's mode */
    var shown = 'neutral';       /* what is in the window now */
    var phase = 'idle';          /* idle | closing | opening */
    var phaseAt = 0;
    var open = 0;                /* 0..1, eased, what the theme's window uses */

    function targetMode() {
        if (pref === 'waze' && wazeUp()) return 'map';
        if (pref === 'camera' && cameraUp()) return 'camera';
        if (pref !== 'off' && maneuver()) return 'turn';
        return 'neutral';
    }
    function isVideo(m) { return m === 'map' || m === 'camera'; }

    /* One step of the fades; called every frame by state(). */
    function step(t) {
        var want = targetMode();
        if (phase === 'idle') {
            if (want !== shown) {
                if (isVideo(shown) && open > 0) { phase = 'closing'; phaseAt = t; }
                else { shown = want; if (isVideo(shown)) { phase = 'opening'; phaseAt = t; } }
            }
        }
        if (phase === 'closing') {
            open = 1 - smooth((t - phaseAt) / CLOSE_MS);
            if (open <= 0) {
                open = 0;
                shown = want;
                phase = isVideo(shown) ? 'opening' : 'idle';
                phaseAt = t;
            }
        } else if (phase === 'opening') {
            if (want !== shown) { phase = 'closing'; phaseAt = t - CLOSE_MS * (1 - open); }
            else {
                open = smooth((t - phaseAt) / OPEN_MS);
                if (open >= 1) { open = 1; phase = 'idle'; }
            }
        } else {
            open = isVideo(shown) ? 1 : 0;
        }
    }

    function poll() {
        if (stopped) return;
        try {
            pollWaze();
            /* Turn View logs every connection: every 2 s is plenty for a turn */
            ticks++;
            if ((tvWanted() || memo.tvEnabled) && (ticks % 2 === 1 || pref === 'camera')) pollTv();
        } catch (e) { log.warn('centre: ' + e.message); }
    }

    return {
        PREFS: PREFS,
        start: function () {
            if (timer) return;
            timer = setInterval(poll, POLL_MS);
            poll();
        },
        /* 'waze' | 'camera' | 'turn' | 'off': only while our layers are up and
           the theme has a centre; anything else gives both pictures back. */
        want: function (p) {
            p = PREFS.indexOf(p) >= 0 ? p : 'off';
            if (p === pref) return;
            pref = p;
            waze.nextTry = 0;
            tv.nextSet = 0;
            poll();
        },
        state: function () {
            var t = now();
            step(t);
            return { mode: shown, open: open, maneuver: maneuver() };
        },
        info: function () {
            return { waze: wazeText(), turnView: tvText(), wazeUp: wazeUp(), cameraUp: cameraUp() };
        },
        /* Give both pictures back. cb once Waze has been asked (best effort). */
        stop: function (cb) {
            stopped = true;
            if (timer) clearInterval(timer);
            timer = null;
            pref = 'off';
            var pending = 0;
            function one() { if (--pending <= 0 && cb) cb(); }
            if ((memo.wazeMoved || waze.inflight === 'panel') && !(waze.st && waze.st.target === 'map' && !waze.inflight)) {
                pending++; waze.sending = false; waze.nextTry = 0; sendWaze('map', one);
            }
            if (memo.tvEnabled && tvEnabled()) {
                pending++; tv.busy = false;
                tvTalk({ op: 'set', settings: { enabled: false } }, function (ok) {
                    if (ok) { memo.tvEnabled = false; saveMemo(); }
                    one();
                });
            }
            if (!pending && cb) cb();
        }
    };
}

module.exports = { create: create, PATHS: PATHS, PREFS: PREFS, OPEN_MS: OPEN_MS, CLOSE_MS: CLOSE_MS };
