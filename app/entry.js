'use strict';
/*
 * MGU Styles - the iDrive app (Toro and Track cluster styles).
 *
 * A thin adapter between the MGU App Kit (kit/runtime/mgu.js) and the
 * cluster service (service.js, built from src/car/main.js). The service
 * runs in the background: the platform starts the app by itself
 * ("autostart"), so the cluster comes back at every start once turned on.
 * The screen shows what it is doing and holds the on/off buttons.
 *
 * This file is staged as main.js by tools/stage-app.js; the kit's builder
 * makes it the package's app.js. Node 8.
 */
const mgu = require('./kit/mgu');
const Service = require('./service.js');
const MGeom = require('./mgeom.js');

/*
 * How often each interface is re-read. Notifications carry most readings,
 * but a car that does not notify a field leaves it on the poll - so the
 * gear, the g sensor and boost need a fast one or the cluster runs behind
 * (a 3 s poll showed the gear two shifts late on the car).
 */
const POLL_MS = {
    'de.bmw.infotainment.vehicle.CDS': 300,              // rpm, temperatures
    'de.bmw.infotainment.vehicle.Vehicle2': 300,         // speed
    'de.bmw.infrastructure.VehicleInformation': 250,     // the engaged gear
    'de.bmw.infotainment.vehicle.CDS2': 400,             // lateral / long. g
    'de.bmw.infotainment.drivingexcitement.FES': 500,    // boost, drive mode
    'de.bmw.infrastructure.VehicleCondition': 1000,
    'de.bmw.infotainment.MDrive': 2000,
    'de.bmw.infotainment.KombiIF': 5000,                 // range, fuel, odo
    'de.bmw.infrastructure.EnvironmentalInformation': 15000
};
const DEFAULT_POLL_MS = 3000;

/* The app's current settings as one plain object. */
function settingsOf(settings, spec) {
    const out = {};
    (spec.settings || []).forEach((s) => { out[s.key] = settings.get(s.key); });
    return out;
}

/* What the service needs from the head unit, from the kit's background context. */
function hostFor(bg) {
    return {
        log: {
            info: (m) => bg.log.info(m),
            warn: (m) => bg.log.warn(m)
        },
        settings: () => settingsOf(bg.settings, bg.spec),
        dataDir: bg.dataDir,
        onSettingsChanged: (fn) => bg.settings.onChange(fn),
        subscribe(signals, onValue) {
            Object.keys(signals).forEach((svc) => {
                const handlers = {};
                Object.keys(signals[svc]).forEach((field) => {
                    if (field.charAt(0) === '_') return;
                    handlers[field] = (v) => onValue(svc, field, v);
                });
                /* Notifications carry the readings; the poll only catches
                   any the head unit drops. */
                const pollMs = POLL_MS[svc] || DEFAULT_POLL_MS;
                Promise.resolve()
                    .then(() => bg.signals.watch(svc, '1', handlers, bg.log, { pollMs }))
                    .then((r) => { if (r && r.error) bg.log.warn('signals ' + svc + ': ' + r.error); })
                    .catch((e) => bg.log.warn('signals ' + svc + ': ' + e));
            });
        }
    };
}

/* ------------------------------------------------------------ the screen */

const INK = '#e8f0f6', DIM = '#8d9aa6', FAINT = '#55626e', RED = '#ff263d';
const CARD = '#121b25', FIELD = '#05090f';

function statusColour(status) {
    if (/^On the cluster/.test(status)) return '#3ddc84';
    if (/^Off/.test(status)) return DIM;
    return '#ffb020';
}

/* A small drawing of the dial: the brief's sweep, ticks and stepped contour. */
function dialSketch(cv, cx, cy, r, accent) {
    const a0 = -178 + 17.2, a1 = -178 + 172;            /* degrees, the brief's sweep */
    const pt = (deg, rr) => [cx + rr * Math.cos(deg * Math.PI / 180), cy + rr * Math.sin(deg * Math.PI / 180)];
    for (let i = 0; i <= 80; i++) {
        const a = a0 + (a1 - a0) * i / 80;
        const major = i % 10 === 0;
        const p = pt(a, r), q = pt(a, r - (major ? 12 : 6));
        cv.line(p[0], p[1], q[0], q[1], major ? 2 : 1, i > 68 ? RED : (i < 46 ? INK : FAINT));
    }
    let prev = null;
    for (let i = 0; i <= 160; i++) {
        const t = i / 160, v = t * 8, f = v - Math.floor(v);
        const up = Math.max(0, Math.min(1, (f - 0.12) / 0.10)), dn = Math.max(0, Math.min(1, (f - 0.68) / 0.12));
        const p = pt(a0 + (a1 - a0) * t, r * 0.82 + r * 0.027 * (up - dn));
        if (prev) cv.line(prev[0], prev[1], p[0], p[1], 1.5, t > 0.84 ? RED : DIM);
        prev = p;
    }
    const n = pt(a0 + (a1 - a0) * 0.57, r * 0.84), m = pt(a0 + (a1 - a0) * 0.57, r);
    cv.line(n[0], n[1], m[0], m[1], 2.5, accent);
}

/* A small drawing of the M View: the two dials' rails, the centre lines and
   the readouts, from the same geometry the cluster is drawn with. */
function mSketch(cv, x, y, w) {
    const s = w / MGeom.ART.w, D = MGeom.DIAL;
    const P = (px, py) => [x + px * s, y + py * s];
    const path = (pts, width, col) => {
        for (let i = 1; i < pts.length; i++) {
            const a = P(pts[i - 1][0], pts[i - 1][1]), b = P(pts[i][0], pts[i][1]);
            cv.line(a[0], a[1], b[0], b[1], width, col);
        }
    };
    const vertex = MGeom.cross(D.rimUp, D.rimLow), bend = MGeom.cross(D.conUp, D.conLow);
    const rim = [[MGeom.at(D.rimUp, D.rimTop), D.rimTop], vertex, [MGeom.at(D.rimLow, D.rimBottom), D.rimBottom]];
    const con = [[D.topX1, D.topY0], [MGeom.at(D.conUp, D.topY0), D.topY0], bend, [MGeom.at(D.conLow, D.conBottom), D.conBottom]];
    const flip = (pts) => pts.map((p) => [MGeom.mirror(p[0]), p[1]]);
    cv.roundRect(x, y, w, MGeom.ART.h * s, 8, '#05070d');
    path(rim, 5, '#8fc6ea'); path(con, 1.5, '#a8cbf0');
    path(flip(rim), 5, '#dc3840'); path(flip(con), 1.5, '#d65458');
    path([[D.tabLeft, D.railTop + 3], [MGeom.DIAG.blueRailEnd, D.railTop + 3]], 3, '#62b4ea');
    path([[MGeom.DIAG.redRailStart, D.railTop + 3], [MGeom.mirror(D.tabLeft), D.railTop + 3]], 3, '#d2343c');
    path([MGeom.DIAG.cyan.p0, MGeom.DIAG.cyan.p1, MGeom.DIAG.cyan.p2], 1.5, '#b0d4f4');
    path([MGeom.DIAG.red.p0, MGeom.DIAG.red.p1], 1.5, '#e4485a');
    cv.text('76', x + 520 * s, y + 296 * s, 50 * s * 1.5, INK, { literal: true });
    cv.text('6', x + 1284 * s, y + 296 * s, 50 * s * 1.5, INK, { literal: true });
}

/* The Toro backgrounds' own marks behind the dial sketch. */
function toroBackdrop(cv, bgName, x0, y0, w, h, accent) {
    if (bgName === 'modern') {
        /* the side lattice: hexagons down both sides */
        const r = 22;
        for (let side = 0; side < 2; side++) {
            for (let row = 0; row < 7; row++) {
                for (let col = 0; col < 3; col++) {
                    const cx = side ? x0 + w - 40 - col * r * 1.75 : x0 + 40 + col * r * 1.75;
                    const cy = y0 + 40 + row * r * 1.55 + (col % 2) * r * 0.78;
                    if (cy > y0 + h - 20) continue;
                    for (let k = 0; k < 6; k++) {
                        const a0 = Math.PI / 3 * k + Math.PI / 6, a1 = a0 + Math.PI / 3;
                        cv.line(cx + r * 0.9 * Math.cos(a0), cy + r * 0.9 * Math.sin(a0),
                                cx + r * 0.9 * Math.cos(a1), cy + r * 0.9 * Math.sin(a1), 1, '#3a4654');
                    }
                    cv.circle(cx + r * 0.9 * Math.cos(Math.PI / 6), cy + r * 0.9 * Math.sin(Math.PI / 6), 2.5, accent);
                }
            }
        }
    } else if (bgName === 'revuelto') {
        /* the Revuelto's Y lights, sweeping in from both sides */
        for (let side = 0; side < 2; side++) {
            const sx = side ? -1 : 1, bx = side ? x0 + w - 30 : x0 + 30, my = y0 + h * 0.5;
            cv.line(bx, my, bx + sx * 120, my - 90, 3, accent);
            cv.line(bx, my, bx + sx * 120, my + 90, 3, accent);
            cv.line(bx + sx * 120, my - 90, bx + sx * 220, my - 100, 2, accent);
            cv.line(bx + sx * 120, my + 90, bx + sx * 220, my + 100, 2, accent);
        }
    } else {
        /* genuine: the Huracan's fine stipple */
        for (let i = 0; i < 140; i++) {
            const px = x0 + 20 + ((i * 97) % (w - 40)), py = y0 + 20 + ((i * 53) % (h - 40));
            cv.circle(px, py, 1, '#1d2731');
        }
    }
}

/*
 * The designs the arrows step through, in order. Each is a style and, for
 * Toro, its background; the colours and everything else stay as set.
 */
const DESIGNS = [
    { name: 'Toro', sub: 'Lamborghini Huracan, genuine', style: 'toro', background: 'genuine' },
    { name: 'Toro', sub: 'Lamborghini, modern hex lattice', style: 'toro', background: 'modern' },
    { name: 'Toro', sub: 'Lamborghini Revuelto', style: 'toro', background: 'revuelto' },
    { name: 'M', sub: 'BMW M View, iDrive 8', style: 'track' }
];
function designIndex(style, background) {
    if (style === 'track') return 3;
    const i = DESIGNS.findIndex((d) => d.style === 'toro' && d.background === background);
    return i < 0 ? 0 : i;
}

/* Where the arrows are drawn and tapped (the page's 1600 x 520). */
const ARROWS = { y: 262, left: 724, right: 1534, r: 30, hit: 78 };

function arrow(cv, cx, cy, r, dir, col) {
    cv.circle(cx, cy, r, '#1a2633');
    const t = r * 0.42;
    cv.line(cx - dir * t * 0.5, cy - t, cx + dir * t * 0.7, cy, 4, col);
    cv.line(cx + dir * t * 0.7, cy, cx - dir * t * 0.5, cy + t, 4, col);
}

mgu.run({
    background(bg) {
        /*
         * "Start at every startup" off: each start of the head unit begins
         * with BMW's own cluster, and Show on cluster brings ours up for
         * that drive only.
         */
        try {
            if (bg.settings.get('autoStart') === false && bg.settings.get('enabled') === true) {
                bg.settings.set('enabled', false);
                bg.log.info('start at every startup is off: BMW original until turned on');
            }
        } catch (e) { bg.log.warn('autoStart: ' + e); }
        try {
            const svc = Service.start(hostFor(bg), { appId: bg.spec.id });
            bg.log.info('cluster service started');
            return svc;
        } catch (e) {
            bg.log.error('cluster service did not start: ' + (e && e.stack || e));
            return null;
        }
    },

    start(ctx) {
        const { ui, settings, background } = ctx;
        const loop = ctx.loop('MAIN', 4, render);
        let last = '';

        function choice(key) {
            const item = settings.item(key);
            const v = settings.get(key);
            const opt = item && item.options && item.options.find((o) => o[0] === String(v));
            return opt ? opt[1] : String(v);
        }

        function render() {
            const status = background ? background.status()
                : 'The cluster service did not start - see Logs';
            const on = settings.get('enabled') === true;
            const track = settings.get('style') === 'track';
            const centre = background && background.centre ? background.centre() : null;
            const feed = background && background.feed ? background.feed() : null;
            const sig = JSON.stringify([status, on, centre, feed, settingsOf(settings, ctx.spec)]);
            if (sig === last) return;
            last = sig;

            const cv = ctx.canvas(1600, 520);
            const label = (s, x, y, size, c) => cv.text(s, x, y, size, c || INK, { literal: true });
            const fitLabel = (s, x, y, size, maxW, c) => {
                const w = cv.textWidth(String(s), size, { literal: true });
                label(String(s), x, y, w > maxW ? size * maxW / w : size, c);
            };
            cv.fillRect(0, 0, 1600, 520, '#070b11');
            const auto = settings.get('autoStart') !== false;
            const di = designIndex(settings.get('style'), settings.get('background'));
            const D = DESIGNS[di];

            /*
             * Full screen (mgu-render) shows x 12-1588, y 38-520 of this page
             * scaled up to the whole display; everything sits inside that.
             */
            /* left: what it is, and what it is doing */
            cv.roundRect(16, 44, 640, 470, 16, CARD);
            label(track ? 'M' : 'TORO', 44, 104, 48, INK);
            fitLabel(D.sub, 44, 138, 20, 580, DIM);
            cv.roundRect(44, 158, 584, 62, 10, FIELD);
            cv.circle(74, 189, 9, statusColour(status));
            fitLabel(status, 96, 198, 24, 510, INK);

            const rows = track ? [
                ['Centre', choice('centre')],
                ['Waze', centre ? centre.waze : '-'],
                ['Turn View', centre ? centre.turnView : '-'],
                ['Redline / limiter', choice('rpmRedline') + '  /  ' + choice('rpmLimiter')]
            ] : [
                ['Waze', settings.get('centre') === 'waze' ? (centre ? centre.waze : 'asked for') : 'Off'],
                ['Colour', choice('accent')],
                ['Shift lights', choice('shiftStyle') + (settings.get('shake') !== 'off' ? ', shake' : '')],
                ['Extras', [settings.get('holiday') ? 'Holiday' : '', settings.get('intro') ? 'Start-up message' : '']
                    .filter(Boolean).join(', ') || 'None'],
                ['Readings', feed || 'BeeM-Flash: not running']
            ];
            rows.forEach((r, i) => {
                const y = 258 + i * (rows.length > 4 ? 38 : 44);
                label(r[0], 44, y, 18, FAINT);
                fitLabel(r[1], 230, y, 20, 400, INK);
            });
            label(!on ? 'Off. Cluster on / off brings it up.'
                : auto ? 'On at every start. Cluster on / off gives BMW\'s back.'
                       : 'On for this drive; BMW\'s own at the next start.',
                  44, 460, 17, DIM);
            label("Warnings and the bottom strip always stay BMW's.", 44, 488, 17, FAINT);

            /* right: the design, with arrows to step through them */
            cv.roundRect(672, 44, 912, 470, 16, CARD);
            cv.roundRect(774, 66, 708, 392, 12, FIELD);
            const accent = { arancio: '#ff6a1a', giallo: '#ffd117', rosso: '#ff2e1c', verde: '#2ee07a',
                             blu: '#3394ff', viola: '#b073ff', bianco: '#ebf2fb', magenta: '#ff2bd6' }[settings.get('accent')] || '#ff6a1a';
            if (track) mSketch(cv, 786, 140, 684);
            else {
                toroBackdrop(cv, D.background, 774, 66, 708, 392, accent);
                dialSketch(cv, 1128, 436, 300, accent);
                label('4', 1104, 380, 96, RED);
            }
            arrow(cv, ARROWS.left, ARROWS.y, ARROWS.r, -1, INK);
            arrow(cv, ARROWS.right, ARROWS.y, ARROWS.r, 1, INK);
            /* which design, and where it is in the list */
            const name = D.name + '  ' + (di + 1) + ' / ' + DESIGNS.length;
            const nw = cv.textWidth(name, 22, { literal: true });
            label(name, 1128 - nw / 2, 503, 22, INK);
            DESIGNS.forEach((d, i) => cv.circle(1128 - (DESIGNS.length - 1) * 11 + i * 22, 473, 4.5,
                i === di ? accent : '#2a3846'));

            return ui.image('MAIN_GFX', cv);
        }

        function refresh() { last = ''; loop.kick(); }
        settings.onChange(refresh);
        ctx.onLayout(refresh);
        ui.onVisible((name) => { if (name === 'MAIN') refresh(); });
        function step(dir) {
            const i = designIndex(settings.get('style'), settings.get('background'));
            const d = DESIGNS[(i + dir + DESIGNS.length) % DESIGNS.length];
            settings.set('style', d.style);
            if (d.background) settings.set('background', d.background);
            refresh();
        }
        ui.onClick('BTN_SHOW', () => { settings.set('enabled', settings.get('enabled') !== true); refresh(); });
        ui.onClick('BTN_DESIGN', () => step(1));
        /* the arrows by the sketch, where the kit runs the screen (touch) */
        if (ctx.onTap) {
            ctx.onTap((x, y) => {
                if (Math.abs(y - ARROWS.y) > ARROWS.hit) return;
                if (Math.abs(x - ARROWS.left) <= ARROWS.hit) step(-1);
                else if (Math.abs(x - ARROWS.right) <= ARROWS.hit) step(1);
            });
        }
        /* Waze on the cluster, in whichever style is showing: both host it
           (M in its window, Toro behind its opening). On or off, nothing else. */
        ui.onClick('BTN_WAZE', () => {
            settings.set('centre', settings.get('centre') === 'waze' ? 'off' : 'waze');
            refresh();
        });
        refresh();
    }
});
