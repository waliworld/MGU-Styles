(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../geometry/panel.js'),
                                 require('../engine/text.js'),
                                 require('./palette.js'),
                                 require('./textlayers.js'),
                                 require('./mgeom.js'));
    } else {
        root.MGUTrack = factory(root.MGUPanel, root.MGUText, root.MGUPalette, root.MGUTextLayers, root.MGUMGeom);
    }
}(typeof self !== 'undefined' ? self : this, function (Panel, Text, Palette, TextLayers, M) {
    'use strict';

    /*
     * "M" - BMW M's iDrive 8 M View, rebuilt on the iDrive 7 panel from one
     * reference frame (docs/ref/m-view-reference.jpg) and its guide
     * (docs/ref/M-VIEW-SPEC.md): the blue speed dial and the red rev dial
     * as angular rails with a level marker, the eight dark-blue plates
     * behind them, the two fine lines through the middle, fuel and oil as
     * leaning segmented strips, and the footer.
     *
     * Everything here is placed in the reference frame's own coordinates
     * (the 1726 x 612 "artboard", src/theme/mgeom.js) and carried to the
     * panel by one uniform fit, so the guide's tables and
     * docs/ref/MEASUREMENTS.md read straight across. Every figure and
     * symbol is drawn from data: nothing is painted on for one state.
     *
     * What the car tells us is shown; what it does not is left dark. The
     * reference frame also shows lamps (parking brake, side lights, seat
     * belt, LIMIT, the car seen from above): those are the car's own
     * warnings, which the instrument cluster keeps drawing itself, so they
     * appear here only in the reference fixture (`mFixture`, the preview and
     * the comparison tool) - never as an imitation on the road.
     *
     * Not affiliated with BMW AG; a reference-matched reconstruction for
     * the owner's own car.
     */

    var A = M.ART;                /* the artboard and its fit to the target (read live: a tool may refit it) */
    var CAP = 0.70;               /* a figure's height, in em (all faces) */
    function X(x) { return M.px(x); }
    function Y(y) { return M.py(y); }
    function box(x0, y0, x1, y1) { return M.box(x0, y0, x1, y1); }
    /* where a layer's rectangle sits on the artboard, for its shader */
    function artOf(b) { return [(b.x - A.ox) / A.s, (b.y - A.oy) / A.s, A.s]; }
    /* the size (em, panel px) that draws a figure h artboard units tall */
    function fig(h) { return h * A.s / CAP; }
    function words(em) { return em * A.s; }

    var MAP_WINDOW = { x: 416, y: 120, w: 1088, h: 480 };   /* where the hosted pictures land */
    var KM_PER_MI = 1.609344;

    function c(r, g, b) { return [r / 255, g / 255, b / 255]; }
    /* sampled off the reference frame (docs/ref/MEASUREMENTS.md) */
    var K = {
        white: c(250, 251, 253),
        soft: c(228, 228, 236),          /* footer figures, strip labels */
        blueNum: c(127, 143, 169), redNum: c(186, 128, 134),
        blueTitle: c(190, 198, 214), redTitle: c(192, 152, 158),
        unit: c(222, 234, 255), unit2: c(142, 166, 204),
        bg: c(6, 5, 11), bgLift: c(13, 13, 22),
        plateTint: [0.235, 0.515, 1.0], hair: c(14, 24, 40),
        pane: c(9, 18, 46), paneFoot: c(21, 42, 79),
        L: { rimHi: c(143, 198, 234), rimLo: c(105, 172, 220), line: c(162, 198, 238), lineLo: c(124, 168, 214),
             chan: c(14, 30, 64),
             fill: c(98, 180, 234), fillHot: c(133, 196, 239), tick: c(112, 148, 206), hot: 0.72 },
        R: { rimHi: c(220, 56, 64), rimLo: c(214, 54, 64), line: c(214, 84, 88), lineLo: c(196, 64, 72),
             chan: c(32, 8, 15),
             fill: c(215, 49, 52), fillHot: c(234, 96, 87), tick: c(140, 56, 68), hot: 0.22 },
        railBlue: c(98, 180, 234), railRed: c(210, 52, 60),
        glowBlue: c(64, 136, 212), glowRed: c(200, 48, 52),
        diagCyan: c(176, 212, 244), diagRed: c(228, 72, 82),
        segLit: c(250, 249, 253), segDim: c(95, 94, 105), segLow: c(172, 138, 152),
        hot: c(196, 90, 104), cold: c(150, 200, 244), oilIcon: c(122, 170, 234),
        lampRed: c(238, 84, 70), lampBelt: c(236, 118, 100), lampLights: c(228, 236, 196),
        limitDisc: c(252, 253, 253), limitRing: c(92, 100, 108), limitInk: c(43, 50, 56),
        carBody: c(104, 102, 110), carEdge: c(196, 198, 206), carSeat: c(232, 122, 102)
    };

    /* A maneuver from Turn View -> the arrow's kind and angle, and a short
       instruction (the text layers hold 12 glyphs). */
    function turnOf(m) {
        if (!m) return null;
        var lr = m.side < 0 ? 'LEFT' : 'RIGHT';
        var a = (m.angle || 0) * (m.side < 0 ? -1 : 1) * Math.PI / 180;
        if (m.kind === 'destination') return { kind: 3, angle: 0, say: 'ARRIVE' };
        if (m.kind === 'roundabout') {
            return { kind: 2, angle: (m.side < 0 ? -1 : 1) * Math.PI / 2,
                     say: m.exit ? 'EXIT ' + m.exit : 'ROUNDABOUT' };
        }
        if (m.kind === 'branch') return { kind: 0, angle: a, say: m.angle ? 'KEEP ' + lr : 'CONTINUE' };
        if (m.kind === 'intersection') {
            if (m.angle >= 180) return { kind: 1, angle: m.side < 0 ? -1 : 1, say: 'U-TURN' };
            var say = !m.angle ? 'STRAIGHT' : m.angle <= 45 ? 'BEAR ' + lr
                : m.angle >= 120 ? 'SHARP ' + lr : 'TURN ' + lr;
            return { kind: 0, angle: a, say: say };
        }
        if (m.kind === 'tunnel') return { kind: 0, angle: 0, say: 'TUNNEL' };
        return { kind: 0, angle: 0, say: 'CONTINUE' };
    }

    function centreOf(s) { return s.centre || { mode: 'neutral', open: 0, maneuver: null }; }
    function oilC(s) { return typeof s.oilTempC === 'number' && isFinite(s.oilTempC) ? s.oilTempC : null; }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /* where each scale numeral's ink ends (speed, right-aligned to it) or
       starts (revs), by tick, top of the scale first: measured */
    var SPEED_EDGE = [340.0, 308.0, 275.0, 242.0, 209.0, 184.0, 202.0, 231.0, 259.0];
    var REV_EDGE = [1471.0, 1508.5, 1536.5, 1568.5, 1599.5, 1629.0, 1610.0, 1579.0, 1555.0];
    var NUM_H = { speed: 19.6, rev: 21.6 };
    /* the figures' side bearings, in figure heights (tools/mglyphs.py) */
    function bearing(face, ch) {
        if (ch === '1') return -0.05;
        if (ch === '7') return face === 'mw' ? 0.05125 : 0.0375;
        return face === 'mw' ? 0.1025 : 0.075;
    }

    function build(atlas, profileId, settings) {
        var SC = A.s;                 /* target pixels per artboard unit, for this build */
        var P = Panel.profile(profileId);
        var S = Palette.resolve(settings, P);
        S.modeLabel = 'bmw';          /* BMW's own names, should the panel show the mode */
        S.mode = '';
        S.centre = ['waze', 'camera', 'turn', 'off'].indexOf(settings && settings.centre) >= 0
            ? settings.centre : 'waze';
        S.mPanel = ['4wd', '2wd', 'mode', 'off'].indexOf(settings && settings.mPanel) >= 0
            ? settings.mPanel : '4wd';
        var fixture = !!(settings && settings.mFixture);
        var metric = S.units === 'metric';
        var units = metric ? 'metric' : 'imperial';
        var layers = [];
        var TL = TextLayers.create(atlas, layers, { text: K.white, muted: K.soft });
        var txt = TL.txt, statics = TL.statics;
        var flashRail = S.revFlash === 'band' || S.revFlash === 'both';
        var flashEdges = S.revFlash === 'edges' || S.revFlash === 'both';

        function speedTicks(s) { return M.speedTicks(Math.max(0, s.speed || 0), units); }
        function revTicks(s) { return M.rpmTicks(s.rpm); }

        /* a layer drawn by one of the M shaders (src/shaders/mcluster.js) */
        function shape(id, z, shader, b, fn, extra) {
            var art = artOf(b);
            var L = { id: id, z: z, shader: shader, x: b.x, y: b.y, w: b.w, h: b.h,
                      uniforms: function (s) {
                          var u = fn ? fn(s) : {};
                          if (u === null) return null;
                          u.u_art = art;
                          return u;
                      } };
            if (extra) Object.keys(extra).forEach(function (k) { L[k] = extra[k]; });
            layers.push(L);
            return L;
        }
        /* a text layer whose words and place follow the state:
           fn(state) -> { str, face, size, x, y, align, color } or null */
        function dyn(id, z, b, fn) {
            layers.push({
                id: id, z: z, shader: 'text', x: b.x, y: b.y, w: b.w, h: b.h,
                uniforms: function (s) {
                    var o = fn(s);
                    if (!o || o.str === null || o.str === undefined || o.str === '') return null;
                    var L = Text.layout(atlas, String(o.str), { face: o.face, size: o.size,
                        x: o.x - b.x, y: o.y - b.y, align: o.align || 'left' });
                    if (!L) return null;
                    var col = o.color || K.white;
                    return { u_g: L.g, u_quad: L.p, u_count: L.count, u_sharp: L.sharp,
                             u_color: [col[0], col[1], col[2], 1], u_glowCol: col, u_glow: 0,
                             u_outline: 0, u_outCol: col };
                }
            });
        }
        /* a symbol of the "mi" face, its box's corner at an artboard point */
        function icon(id, z, ch, x, y, w, h, color, show) {
            var b = box(x - 2, y - 2, x + w + 2, y + h + 2);
            statics(id, z, b, { face: 'mi', size: 32 * SC, align: 'left', color: color, show: show },
                [{ str: ch, x: X(x), y: Y(y) }]);
        }

        /* ---------------------------------------------------- the back glass */
        shape('back', 1, 'mback',
            { x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT + S.bottomExtra },
            function (s) {
                var ce = centreOf(s);
                return { u_open: ce.mode === 'map' || ce.mode === 'camera' ? ce.open : 0,
                         u_bg: K.bg, u_bgLift: K.bgLift };
            },
            /* belowCut: the glass may be asked to run under the car's own
               bottom strip, so black shows there instead of BMW's art */
            { belowCut: true });

        /* --------------------------------------------------------- the plates */
        function plateLook() { return { u_tint: K.plateTint, u_hair: K.hair }; }
        shape('platesL', 2, 'mplatesL', box(300, 100, 898, 486), plateLook);
        shape('platesR', 2, 'mplatesR', box(958, 100, 1505, 486), plateLook);

        /* the footer's four-pane panel */
        if (S.mPanel !== 'off') {
            shape('footPanel', 2, 'mfoot', box(722, 531, 1074, 589), function () {
                return { u_pane: K.pane, u_paneFoot: K.paneFoot };
            });
        }

        /* ---------------------------------------- rails and the centre lines */
        shape('rails', 6, 'mrails', box(356, 505, 1452, 555), function () {
            return { u_blue: K.railBlue, u_red: K.railRed, u_blueGlow: K.glowBlue, u_redGlow: K.glowRed };
        });
        shape('centreLines', 6, 'mdiag', box(724, 144, 1000, 522), function () {
            return { u_cyan: K.diagCyan, u_red: K.diagRed };
        });

        /* ----------------------------------------------------------- the dials */
        function dial(id, b, side, look, val, zone, warn) {
            shape(id, 10, 'mgauge', b, function (s) {
                return {
                    u_side: side, u_val: val(s),
                    u_rimHi: look.rimHi, u_rimLo: look.rimLo, u_line: look.line, u_lineLo: look.lineLo,
                    u_chan: look.chan,
                    u_fill: look.fill, u_fillHot: look.fillHot, u_tick: look.tick, u_hot: look.hot,
                    u_zone: zone, u_warn: warn ? warn(s) : 0
                };
            });
        }
        dial('speedDial', box(186, 64, 634, 523), 0, K.L, speedTicks, [0, 0, 0, 0]);
        /* the red field from the redline to the top of the scale, and the
           amber one just before it */
        var red = Math.min(M.SCALE.n - 0.3, S.rpmRedline / 1000);
        dial('revDial', box(M.mirror(634), 64, M.mirror(186), 523), 1, K.R, revTicks,
            [red + 0.09, M.SCALE.n - 0.04, red - 0.33, red - 0.05],
            function (s) { return flashRail ? (s.limiter || 0) : 0; });

        /* --------------------------------------------------- fuel and oil */
        function strip(id, b, side, fn) {
            shape(id, 12, 'mstrip', b, function (s) {
                var v = fn(s);
                return { u_side: side, u_level: v === null ? 0 : clamp01(v), u_on: v === null ? 0 : 1,
                         u_lit: K.segLit, u_dim: K.segDim, u_ink: K.soft,
                         u_hotCol: K.hot, u_coldCol: K.cold, u_lowCol: K.segLow };
            });
        }
        strip('fuelStrip', box(344, 340, 470, 501), 0, function (s) {
            var f = s.pods && s.pods.fuel;
            return f && f.text !== '--' ? f.frac : null;
        });
        /* the oil scale runs between its own end marks: 50 to 150 C, or
           120 to 300 F - round numbers either way, each at its true height */
        strip('oilStrip', box(M.mirror(470), 340, M.mirror(344), 501), 1, function (s) {
            var t = oilC(s);
            if (t === null) return null;
            return metric ? (t - 50) / 100 : (t * 1.8 + 32 - 120) / 180;
        });

        /* ------------------------------------------------- the scale numerals */
        /*
         * Each numeral stands level with its tick, hard against the rail.
         * The shader works out which tick a glyph belongs to from its own
         * height, and lights the ones either side of the value.
         */
        function scale(id, b, face, h, items, val, col) {
            var size = fig(h);
            var placed = Text.place(atlas, items.map(function (it) {
                return { str: it.str, x: it.x - b.x, y: it.y - b.y, align: it.align };
            }), { face: face, size: size });
            var art = artOf(b);
            layers.push({
                id: id, z: 20, shader: 'mnum', x: b.x, y: b.y, w: b.w, h: b.h,
                uniforms: function (s) {
                    return { u_art: art, u_g: placed.g, u_quad: placed.p,
                             u_cfg: [placed.count, placed.sharp, val(s), 0.045],
                             u_col: col, u_colOn: K.white };
                }
            });
        }
        function speedItem(k) {
            var str = String(M.SPEED_SCALE[units][k]);
            var h = NUM_H.speed;
            /* right-aligned: the pen ends a bearing past the ink */
            return { str: str, align: 'right',
                     x: X(SPEED_EDGE[k] + bearing('mw', str.charAt(str.length - 1)) * h),
                     y: Y(M.tickY(k) + h / 2) };
        }
        function revItem(k) {
            var str = String(k), h = NUM_H.rev;
            return { str: str, align: 'left', x: X(REV_EDGE[k] - bearing('mw', str.charAt(0)) * h),
                     y: Y(M.tickY(k) + h / 2) };
        }
        /* twelve glyphs a layer: the speed scale takes two */
        scale('speedScaleA', box(104.5, 80, 268, 266), 'mw', NUM_H.speed,
            [8, 7, 6, 5].map(speedItem), speedTicks, K.blueNum);
        scale('speedScaleB', box(128, 282, 350, 522), 'mw', NUM_H.speed,
            [4, 3, 2, 1, 0].map(speedItem), speedTicks, K.blueNum);
        scale('revScale', box(1462, 78, 1668, 524), 'mw', NUM_H.rev,
            [8, 7, 6, 5, 4, 3, 2, 1, 0].map(revItem), revTicks, K.redNum);

        statics('speedTitle', 20, box(302, 36, 380, 72),
            { face: 'ms', size: words(24.8), align: 'left', color: K.blueTitle },
            [{ str: metric ? 'km/h' : 'mph', x: X(309.5), y: Y(64.6) }]);
        statics('revTitle', 20, box(1356, 34, 1530, 70),
            { face: 'ms', size: words(26.1), align: 'left', color: K.redTitle },
            [{ str: '1/min x 1000', x: X(1364.5), y: Y(62.4) }]);

        /* --------------------------------------------------- speed and gear */
        /* the figures stand on the black band between the plates, the speed
           flush right over its unit, both units always shown */
        var BIG = 51.6;
        txt('speed', 30, box(372, 234, 616, 304),
            { face: 'mw', size: fig(BIG), align: 'right', x: X(603.0 + 0.1025 * BIG), y: Y(295.0), color: K.white },
            function (s) { return String(Math.round(Math.max(0, s.speed || 0))); });
        statics('speedUnit', 30, box(520, 296, 616, 330),
            { face: 'ms', size: words(25.5), align: 'right', color: K.unit },
            [{ str: metric ? 'km/h' : 'mph', x: X(606.0), y: Y(321.2) }]);
        var SMALL = 25.3;
        txt('speed2', 30, box(480, 332, 616, 372),
            { face: 'mw', size: fig(SMALL), align: 'right', x: X(607.2 + 0.1025 * SMALL), y: Y(364.3), color: K.white },
            function (s) {
                var v = Math.max(0, s.speed || 0);
                return String(Math.round(metric ? v / KM_PER_MI : v * KM_PER_MI));
            });
        statics('speed2Unit', 30, box(520, 364, 616, 398),
            { face: 'ms', size: words(25.5), align: 'right', color: K.unit2 },
            [{ str: metric ? 'mph' : 'km/h', x: X(607.5), y: Y(388.2) }]);

        txt('gear', 30, box(1228, 234, 1390, 304),
            { face: 'mw', size: fig(50.8), align: 'centre', x: X(1308.8), y: Y(294.4), color: K.white },
            function (s) { return s.gear || 'P'; });

        /* ------------------------------------------- the strips' labels */
        var LBL = 17.1;
        statics('fuelLabels', 30, box(378, 338, 500, 502),
            { face: 'mn', size: fig(LBL), align: 'left', color: K.soft },
            [{ str: '1', x: X(383.0 + 0.05 * LBL), y: Y(361.0) },
             { str: '1/2', x: X(427.0 + 0.05 * LBL), y: Y(429.2) },
             { str: '0', x: X(473.6 - 0.075 * LBL), y: Y(497.2) }]);
        icon('fuelIcon', 30, 'f', 455.0, 443.0, 32, 24, K.soft);
        var oilMarks = metric ? ['150', '100', '50'] : ['300', '210', '120'];
        statics('oilLabels', 30, box(1272, 338, 1428, 502),
            { face: 'mn', size: fig(LBL), align: 'right', color: K.soft },
            [{ str: oilMarks[0], x: X(1421.0 + 0.075 * LBL), y: Y(360.2) },
             { str: oilMarks[1], x: X(1377.3 + 0.075 * LBL), y: Y(429.6) },
             { str: oilMarks[2], x: X(1335.3 + 0.075 * LBL), y: Y(498.0) }]);
        statics('oilUnit', 30, box(1364, 368, 1404, 404),
            { face: 'ms', size: words(26.1), align: 'left', color: K.soft },
            [{ str: metric ? '°C' : '°F', x: X(1370.0), y: Y(397.0) }]);
        icon('oilIcon', 30, 'o', 1319.0, 440.0, 42, 28, K.oilIcon);

        /* ------------------------------------------------------- the footer */
        icon('mMark', 30, 'm', 157.0, 496.0, 80, 28, K.soft);

        var FOOT_H = 23.0, FOOT_Y = 585.0;
        var clockPen = X(130.0 + 0.05 * FOOT_H);
        txt('clock', 30, box(122, 554, 262, 594),
            { face: 'mn', size: fig(FOOT_H), align: 'left', x: clockPen, y: Y(FOOT_Y), color: K.soft },
            function (s) { return s.clockText && s.clockText !== '--' ? s.clockText : null; });
        /* am / pm follows the figures, however many there are */
        dyn('clockHalf', 30, box(180, 556, 300, 598), function (s) {
            if (!S.clock12 || !s.clockText || s.clockText === '--' || !s.clockHalf) return null;
            var w = Text.measure(atlas, 'mn', s.clockText, fig(FOOT_H), 0);
            return { str: s.clockHalf, face: 'ms', size: words(25.5), x: clockPen + w + 5.3 * SC,
                     y: Y(FOOT_Y - 0.6), color: K.soft };
        });

        icon('rangeIcon', 30, 'r', 339.0, 560.0, 32, 25, K.soft,
            function (s) { return s.rangeText && s.rangeText !== '--'; });
        var rangePen = X(382.0 - 0.075 * FOOT_H);
        txt('range', 30, box(374, 552, 480, 592),
            { face: 'mn', size: fig(FOOT_H), align: 'left', x: rangePen, y: Y(FOOT_Y - 1.2), color: K.soft },
            function (s) { return s.rangeText && s.rangeText !== '--' ? s.rangeText : null; });
        dyn('rangeUnit', 30, box(400, 554, 530, 594), function (s) {
            if (!s.rangeText || s.rangeText === '--') return null;
            var w = Text.measure(atlas, 'mn', s.rangeText, fig(FOOT_H), 0);
            return { str: metric ? 'km' : 'mi', face: 'ms', size: words(26.0), x: rangePen + w + 6.3 * SC,
                     y: Y(FOOT_Y - 1.4), color: K.soft };
        });

        /* the drive's name on the panel: 4WD as the frame shows it, or the
           car's own name for the driving mode */
        if (S.mPanel === '4wd' || S.mPanel === '2wd') {
            statics('driveFig', 30, box(900, 542, 942, 574),
                { face: 'mw', size: fig(18.0), align: 'left', color: K.white },
                [{ str: S.mPanel.charAt(0), x: X(911.0 - 0.1025 * 18.0), y: Y(568.2) }]);
            statics('driveWord', 30, box(934, 542, 982, 576),
                { face: 'mb', size: fig(18.0), align: 'left', color: K.white },
                [{ str: 'WD', x: X(938.0), y: Y(568.2) }]);
        } else if (S.mPanel === 'mode') {
            /* as tall as "4WD" where it fits; a long name is set smaller,
               so it stays on its own pane */
            dyn('driveMode', 30, box(892, 542, 992, 576), function (s) {
                if (!s.modeLabel) return null;
                var h = 17.0, room = 82.0;
                var w = Text.measure(atlas, 'mb', s.modeLabel, fig(h), 0) / SC;
                if (w > room) h = h * room / w;
                return { str: s.modeLabel, face: 'mb', size: fig(h), align: 'centre',
                         x: X(942.0), y: Y(559.2 + h / 2), color: K.white };
            });
        }

        /* outside temperature, flush right before its unit */
        txt('ambient', 30, box(1560, 554, 1680, 594),
            { face: 'mn', size: fig(FOOT_H), align: 'right', x: X(1674.3 + 0.075 * FOOT_H), y: Y(FOOT_Y + 1.6),
              color: K.soft },
            function (s) {
                if (!s.ambientText || s.ambientText === '--') return null;
                var t = s.ambientText;
                return t.charAt(0) === '-' ? t : '+' + t;
            });
        statics('ambientUnit', 30, box(1676, 558, 1716, 596),
            { face: 'ms', size: words(26.1), align: 'left', color: K.soft,
              show: function (s) { return s.ambientText && s.ambientText !== '--'; } },
            [{ str: metric ? '°C' : '°F', x: X(1682.0), y: Y(FOOT_Y + 2.6) }]);

        /* ------------------------------------- the reference frame's lamps */
        if (fixture) {
            icon('lampBrake', 30, 'b', 68.0, 475.0, 46, 40, K.lampRed);
            icon('lampLights', 30, 'l', 53.0, 350.0, 48, 24, K.lampLights);
            icon('lampBelt', 30, 's', 1080.0, 537.0, 32, 46, K.lampBelt);
            icon('carBody', 30, 'c', 1116.0, 533.0, 134, 54, K.carBody);
            icon('carSeats', 31, 't', 1116.0, 533.0, 134, 54, K.carSeat);
            icon('carEdge', 32, 'e', 1116.0, 533.0, 134, 54, K.carEdge);
            var lb = box(M.FOOT.limit.x - 36, M.FOOT.limit.y - 36, M.FOOT.limit.x + 36, M.FOOT.limit.y + 36);
            layers.push({
                id: 'limitSign', z: 30, shader: 'mbadge', x: lb.x, y: lb.y, w: lb.w, h: lb.h,
                uniforms: function () {
                    return { u_disc: K.limitDisc, u_ring: K.limitRing,
                             u_r: [M.FOOT.limit.r * SC, M.FOOT.limit.ring * SC] };
                }
            });
            statics('limitWord', 31, box(574, 544, 632, 570),
                { face: 'ms', size: words(19.3), align: 'centre', color: K.limitInk, tracking: -0.3 },
                [{ str: 'LIMIT', x: X(603.2), y: Y(564.2) }]);
        }

        /* ---------------------------------------- the centre, next turn */
        function turn(s) { var ce = centreOf(s); return ce.mode === 'turn' ? turnOf(ce.maneuver) : null; }
        var arrow = box(792, 118, 892, 218);
        layers.push({
            id: 'turnArrow', z: 26, shader: 'tturn',
            x: arrow.x, y: arrow.y, w: arrow.w, h: arrow.h,
            uniforms: function (s) {
                var t = turn(s);
                if (!t) return null;
                return { u_kind: t.kind, u_angle: t.angle, u_col: K.white, u_ring: K.unit2 };
            }
        });
        txt('turnDist', 27, box(896, 124, 1150, 184),
            { face: 'ms', size: words(46), align: 'left', x: X(906), y: Y(172), color: K.white },
            function (s) { return turn(s) ? (centreOf(s).maneuver.text || null) : null; });
        txt('turnSay', 27, box(896, 184, 1150, 222),
            { face: 'label', size: words(30), align: 'left', x: X(908), y: Y(212), color: K.unit, tracking: 1 },
            function (s) { var t = turn(s); return t ? t.say : null; });

        /* ---------------------------------------------- the limiter flash */
        if (flashEdges) {
            layers.push({
                id: 'flash', z: 95, shader: 'flash',
                x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
                uniforms: function (s) {
                    return { u_on: s.limiter || 0, u_rate: S.flashRate,
                             u_col: K.R.rimHi, u_strength: S.flashStrength,
                             u_style: S.flashStyleIndex, u_spread: S.flashSpread, u_burst: 0 };
                }
            });
        }

        var wb = M.windowBox();
        var win = box(wb.x0, wb.y0, wb.x1, wb.y1);
        return { id: 'track', name: 'M', layers: layers, profile: P, settings: S,
                 /* the holiday dressing: snow outside the dials, the tree
                    right of the rev scale (src/theme/overlays.js) */
                 places: { snow: [[0, 0, 300, 646], [1620, 0, 300, 646]], tree: [1776, 352, 136, 172],
                           clearOf: /^(speedScale|revScale|lamp|mMark|clock|ambient)/ },
                 palette: K, imperial: !metric, hasCentre: true, art: A,
                 window: { x: win.x, y: win.y, w: win.w, h: win.h } };
    }

    return { build: build, MAP_WINDOW: MAP_WINDOW, turnOf: turnOf, revealAt: M.revealAt,
             SPEED_EDGE: SPEED_EDGE, REV_EDGE: REV_EDGE, X: X, Y: Y };
}));
