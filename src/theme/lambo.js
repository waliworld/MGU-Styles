(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../engine/text.js'),
                                 require('../geometry/panel.js'),
                                 require('./palette.js'),
                                 require('./guide.js'),
                                 require('./textlayers.js'));
    } else {
        root.MGUTheme = factory(root.MGUText, root.MGUPanel, root.MGUPalette, root.MGUGuide,
                                root.MGUTextLayers);
    }
}(typeof self !== 'undefined' ? self : this, function (Text, Panel, Palette, Guide, TextLayers) {
    'use strict';

    /*
     * "Toro" - the Lamborghini Huracan CORSA cluster, reconstructed for the
     * BMW iDrive 7 panel.
     *
     * Geometry and art direction come from the CORSA brief, held as data in
     * src/theme/guide.js so it can be read against the document. The brief's
     * grid runs to y = 704; the MGU keeps y >= 646 for the car's own bottom
     * strip, so the whole instrument is scaled as one and centred.
     *
     * Deliberate departures from the brief, all of them for the car:
     *  - rendered as cluster-render effect layers, not SVG (the head unit
     *    gives us no other way to draw smoothly; see README);
     *  - a progressive lit run on the dial as the rpm indication, which the
     *    brief leaves open rather than specifies;
     *  - GT3 shift lights and a boost gauge, separately asked for;
     *  - the far-left region, which the brief says is unreadable in the
     *    photograph, carries oil temperature and pressure.
     */

    var G = Guide, T = Guide.TACH, B = Guide.BOUNDS;

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* The dial reads in thousands: 0 at the start of the sweep, N at its end. */
    function vOf(rpm, scaleMax) {
        return clamp01(rpm / scaleMax) * scaleMax / 1000;
    }

    /*
     * The brief's own angle function places its 1..10 across the sweep. Our
     * scale runs 0..N over the same sweep, so map a scale value onto the
     * brief's v before asking where it sits: the arc, its crown and its
     * ends stay exactly where the brief puts them whatever N is.
     */
    function briefV(d, n) { return T.vMin + (T.vMax - T.vMin) * d / n; }

    function gearNames(profile) {
        var names = ['P', 'R', 'N'], i;
        for (i = 1; i <= profile.gearCount; i++) names.push(String(i));
        return names;
    }

    function build(atlas, profileId, settings) {
        var P = Panel.profile(profileId);
        var S = Palette.resolve(settings, P);
        var C = S.colours;
        var GC = G.COLOURS;
        var names = gearNames(P);
        var layers = [];
        var imperial = S.units !== 'metric';
        var U = {
            dist: imperial ? 'MI' : 'KM',
            temp: imperial ? '°F' : '°C',
            press: imperial ? 'PSI' : 'BAR',
            speed: imperial ? 'MPH' : 'KM/H'
        };
        var bandFlash = S.revFlash === 'band' || S.revFlash === 'both';
        var edgeFlash = S.revFlash === 'edges' || S.revFlash === 'both';

        /* The dial, in panel pixels. */
        var DC = { x: G.gx(T.cx), y: G.gy(T.cy) };
        var rOuter = G.gs(T.rOuter);
        var ANG = [G.phiRad(T.vMin), G.phiRad(T.vMax)];
        /* The brief's sweep runs past the crown, so the box is the whole
           circle's upper cap plus a margin for the glow. */
        var dialBox = {
            x: Math.max(0, G.gx(T.cx - T.rOuter) - 26),
            y: Math.max(0, G.gy(T.cy - T.rOuter) - 26),
            w: 0, h: 0
        };
        dialBox.w = Math.min(Panel.PANEL_WIDTH, G.gx(T.cx + T.rOuter) + 26) - dialBox.x;
        dialBox.h = Math.min(Panel.BOTTOM_CUT, G.point(T.vMax, T.rOuter).y + 40) - dialBox.y;

        var dialCentre = [DC.x - dialBox.x, DC.y - dialBox.y];
        var N = S.scaleMaxRpm / 1000;
        /* Where the red detailing starts, as a scale value. */
        var redV = S.redFromScale !== null && S.redFromScale !== undefined
            ? S.redFromScale : S.rpmRedline / 1000;

        /* ------------------------------------------------------ helpers */

        var TL = TextLayers.create(atlas, layers, { text: C.text, muted: C.muted });
        var txt = TL.txt, statics = TL.statics;

        /* ------------------------------------------------- background */
        layers.push({
            id: 'bg', z: 0, shader: 'bg',
            x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
            uniforms: function () {
                return {
                    u_black: GC.screenBlack, u_blue: GC.screenBlueBlack,
                    u_lower: GC.lowerField, u_line: GC.geometricLine,
                    u_hex: S.hexagons, u_hexSize: S.hexSize, u_facets: S.facets, u_rev: S.revuelto,
                    u_accent: C.accent
                };
            }
        });

        /* ---------------------------------------------- the tachometer */
        function dialBase() {
            return {
                u_centre: dialCentre, u_ang: ANG,
                u_scale: [0, N]
            };
        }

        layers.push({
            id: 'stipple', z: 4, shader: 'stipple',
            x: dialBox.x, y: dialBox.y, w: dialBox.w, h: dialBox.h,
            uniforms: function (s) {
                var u = dialBase();
                u.u_rev = [vOf(s.rpm || 0, S.scaleMaxRpm), S.dialFill];
                u.u_litCol = C.lit;
                u.u_needle = GC.corsaRed;
                u.u_redV = redV;
                u.u_ring = [G.gs(T.stippleInner), G.gs(T.stippleOuter)];
                u.u_dot = [G.gs(G.STIPPLE.spacing), G.gs(G.STIPPLE.dotRadius),
                           G.STIPPLE.opacity * S.stipple];
                /* the wash is the stipple ring's own outline: always draw it */
                u.u_redFrom = redV;
                u.u_col = GC.stipple;
                u.u_red = GC.dimRed;
                u.u_smoke = S.background === 'modern'
                    ? [GC.screenBlack[0], GC.screenBlack[1], GC.screenBlack[2], 0.78]
                    : [0, 0, 0, 0];
                return u;
            }
        });

        layers.push({
            id: 'dial', z: 10, shader: 'dial',
            x: dialBox.x, y: dialBox.y, w: dialBox.w, h: dialBox.h,
            uniforms: function (s) {
                var u = dialBase();
                u.u_rOuter = rOuter;
                u.u_arcW = G.gs(1.6);
                u.u_tick = [G.gs(T.tickMinor), G.gs(T.tickMajor), G.gs(T.tickWidth)];
                u.u_step = T.tickStep;
                u.u_frac = vOf(s.rpm, S.scaleMaxRpm);
                u.u_redFrom = redV;
                u.u_warn = bandFlash ? (s.limiter || 0) : 0;
                u.u_lit = C.lit;
                u.u_base = GC.fineContour;
                u.u_red = GC.corsaRed;
                return u;
            }
        });

        layers.push({
            id: 'contour', z: 12, shader: 'contour',
            x: dialBox.x, y: dialBox.y, w: dialBox.w, h: dialBox.h,
            uniforms: function (s) {
                var u = dialBase();
                u.u_radii = [G.gs(T.rRecess), G.gs(T.rPlateau)];
                u.u_width = G.gs(T.contourWidth);
                u.u_redFrom = redV;
                u.u_frac = vOf(s.rpm, S.scaleMaxRpm);
                u.u_col = GC.fineContour;
                u.u_red = GC.corsaRed;
                u.u_lit = C.lit;
                return u;
            }
        });

        /* Scale numerals: narrow, inclined, hollow; red from the red mark. */
        var numSize = G.gs(T.numeralHeight) / 0.70;   /* cap height -> em */
        var numItems = [], numVals = [], v;
        for (v = S.showZeroNumeral ? 0 : 1; v <= N; v++) {
            var at = G.point(briefV(v, N), T.rNumeral);
            numItems.push({ str: String(v), x: at.x, y: at.y });
            numVals.push(v);
        }
        var numBox = {
            x: Math.max(0, G.gx(T.cx - T.rNumeral) - 60),
            y: Math.max(0, G.gy(T.cy - T.rNumeral) - 50), w: 0, h: 0
        };
        numBox.w = Math.min(Panel.PANEL_WIDTH, G.gx(T.cx + T.rNumeral) + 60) - numBox.x;
        numBox.h = Math.min(Panel.BOTTOM_CUT,
            Math.max(G.point(T.vMax, T.rNumeral).y, G.point(T.vMin, T.rNumeral).y) + 64) - numBox.y;

        var numLayout = Text.place(atlas, numItems.map(function (it) {
            return { str: it.str, x: it.x - numBox.x, y: it.y - numBox.y };
        }), { face: 'dial', size: numSize, align: 'centre', baseline: 'middle' });

        /* Each glyph carries its own scale value, so "10" works as two. */
        var gt = [];
        (function () {
            var i, j = 0;
            for (i = 0; i < numVals.length; i++) {
                var n = String(numVals[i]).length, c;
                for (c = 0; c < n; c++) {
                    gt.push(numVals[i], numVals[i] >= redV - 0.001 ? 1 : 0, 0, 0);
                    j++;
                }
            }
            while (gt.length < 12 * 4) gt.push(0, 0, 0, 0);
        }());

        layers.push({
            id: 'arcNums', z: 16, shader: 'arcnum',
            x: numBox.x, y: numBox.y, w: numBox.w, h: numBox.h,
            uniforms: function (s) {
                return {
                    u_g: numLayout.g, u_quad: numLayout.p, u_gt: gt,
                    u_cfg: [numLayout.count, numLayout.sharp,
                            vOf(s.rpm, S.scaleMaxRpm), G.gs(T.numeralStroke)],
                    u_colOff: [GC.secondaryWhite[0] * 0.62, GC.secondaryWhite[1] * 0.62,
                               GC.secondaryWhite[2] * 0.62],
                    u_colOn: GC.primaryWhite,
                    u_colRed: GC.corsaRed,
                    u_colPop: C.accent
                };
            }
        });

        /* --------------------------------------------- GT3 shift lights */
        if (S.shiftLights) {
            layers.push({
                id: 'shift', z: 60, shader: 'shiftbar',
                x: 640, y: 6, w: 580, h: 34,
                uniforms: function (s) {
                    var start = S.rpmRedline - 1800;
                    return {
                        u_frac: clamp01((s.rpm - start) / Math.max(1, S.rpmLimiter - start)),
                        u_leds: 15,
                        u_strobe: s.rpm >= S.rpmLimiter - 60 ? 1 : 0,
                        u_c1: C.green, u_c2: C.amber, u_c3: GC.corsaRed
                    };
                }
            });
        }
        if (edgeFlash) {
            layers.push({
                id: 'flash', z: 95, shader: 'flash',
                x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
                uniforms: function (s) {
                    return { u_on: s.limiter || 0, u_rate: S.flashRate,
                             u_col: GC.corsaRed, u_strength: S.flashStrength };
                }
            });
        }

        /* --------------------------------------- gear, CORSA, secondary */
        var gearRect = G.grect(B.gear);
        var gearSize = gearRect.h / 0.70;
        txt('gearBig', 24,
            { x: gearRect.x - 90, y: gearRect.y - 44, w: gearRect.w + 180, h: gearRect.h + 92 },
            { face: 'gear', size: gearSize, align: 'centre', baseline: 'middle',
              x: gearRect.x + gearRect.w / 2, y: gearRect.y + gearRect.h / 2,
              outline: G.gs(3.6), glow: 0.0,
              color: function () { return GC.corsaRed; },
              outCol: function (s) {
                  return s.limiter > 0.5 ? [1, 1, 1] : GC.corsaRed;
              } },
            function (s) { return s.gear; });

        txt('corsa', 24, { x: G.gx(B.corsa.cx) - 100, y: G.gy(B.corsa.cy) - 28, w: 200, h: 50 },
            { face: 'label', size: G.gs(26) / 0.70, align: 'centre',
              x: G.gx(B.corsa.cx), y: G.gy(B.corsa.cy) + G.gs(13),
              color: GC.corsaRed, tracking: 1.5 },
            function (s) { return s.modeLabel || S.mode; });

        if (S.secondaryGlyph) {
            statics('secondary', 24,
                { x: G.gx(B.secondaryR.cx) - 40, y: G.gy(B.secondaryR.cy) - 30, w: 80, h: 50 },
                { face: 'gear', size: G.gs(30) / 0.70, align: 'centre',
                  color: GC.secondaryWhite },
                [{ str: S.secondaryGlyph, x: G.gx(B.secondaryR.cx), y: G.gy(B.secondaryR.cy) + G.gs(15) }]);
        }

        /* ESC state, stacked, small and red. */
        statics('esc', 24, { x: G.gx(B.escBlock.cx) - 60, y: G.gy(B.escBlock.cy) - 34, w: 120, h: 40 },
            { face: 'label', size: G.gs(21) / 0.70, align: 'centre',
              color: GC.corsaRed, tracking: 1 },
            [{ str: 'ESC', x: G.gx(B.escBlock.cx), y: G.gy(B.escBlock.cy) - G.gs(3) }]);
        txt('escMode', 24, { x: G.gx(B.escBlock.cx) - 90, y: G.gy(B.escBlock.cy) - 4, w: 180, h: 40 },
            { face: 'label', size: G.gs(21) / 0.70, align: 'centre',
              x: G.gx(B.escBlock.cx), y: G.gy(B.escBlock.cy) + G.gs(23),
              color: GC.corsaRed, tracking: 1 },
            function (s) { return s.modeLabel || S.mode; });

        /* ---------------------------------------- side instruments */
        function instrument(id, rect, opts) {
            var r = G.grect(rect);
            var barTop = r.y + G.gs(68);
            var barH = r.h - G.gs(68);
            var barW = G.gs(26);
            var cx = r.x + r.w / 2;

            layers.push({
                id: 'icon_' + id, z: 20, shader: 'icon',
                x: cx - G.gs(14), y: r.y, w: G.gs(28), h: G.gs(28),
                uniforms: function () {
                    return { u_kind: opts.icon, u_col: GC.secondaryWhite };
                }
            });
            statics('lbl_' + id, 20,
                { x: r.x - G.gs(30), y: r.y + G.gs(30), w: r.w + G.gs(60), h: G.gs(40) },
                { face: 'label', size: G.gs(15) / 0.70, align: 'centre',
                  color: GC.secondaryWhite, tracking: 0.5 },
                [{ str: opts.l1, x: cx, y: r.y + G.gs(46) },
                 { str: opts.l2, x: cx, y: r.y + G.gs(61) }]);

            layers.push({
                id: 'bar_' + id, z: 21, shader: 'gauge',
                x: cx - barW / 2, y: barTop, w: barW, h: barH,
                uniforms: function (s) {
                    var g = s.pods[opts.key];
                    return {
                        u_frac: clamp01(g.frac), u_redFrom: opts.redFrom,
                        u_invert: opts.invert ? 1 : 0, u_ticks: opts.ticks,
                        u_alarm: g.alarm ? 1 : 0,
                        u_col: GC.primaryWhite, u_red: GC.corsaRed,
                        u_frameCol: GC.fineContour
                    };
                }
            });

            /* Fixed scale markings down the side of the bar. */
            var marks = opts.marks.map(function (mk, i) {
                return { str: mk,
                         x: cx + barW / 2 + G.gs(16),
                         y: barTop + barH * (i / (opts.marks.length - 1)) + G.gs(5) };
            });
            statics('scale_' + id, 21,
                { x: cx, y: barTop - G.gs(10), w: r.w / 2 + G.gs(46), h: barH + G.gs(22) },
                { face: 'label', size: G.gs(14) / 0.70, align: 'left',
                  color: GC.secondaryWhite, alpha: 0.85 }, marks);

            var valTop = Math.min(barTop + barH + G.gs(2), Panel.BOTTOM_CUT - G.gs(30));
            txt('val_' + id, 21,
                { x: cx - G.gs(42), y: valTop, w: G.gs(84), h: G.gs(30) },
                { face: 'display', size: G.gs(19) / 0.70, align: 'centre',
                  x: cx, y: valTop + G.gs(20),
                  color: function (s) {
                      return s.pods[opts.key].alarm ? GC.corsaRed : GC.primaryWhite;
                  } },
                function (s) { return s.pods[opts.key].text; });
        }

        instrument('coolant', B.coolant, {
            icon: 1, l1: 'TEMP.', l2: 'ACQUA', key: 'coolant',
            marks: ['130', '90', '50'], ticks: 5, redFrom: 0.78, invert: false
        });
        instrument('fuel', B.fuel, {
            icon: 0, l1: 'LIVELLO', l2: 'BENZINA', key: 'fuel',
            marks: ['100', '50', '0'], ticks: 5, redFrom: 0.14, invert: true
        });

        /* The far-left region the brief cannot resolve: our own readings. */
        if (S.showAuxLeft) {
            instrument('oilT', [150, 425, 245, 675], {
                icon: 1, l1: 'TEMP.', l2: 'OLIO', key: 'oilTemp',
                marks: ['170', '110', '50'], ticks: 5, redFrom: 0.82, invert: false
            });
            instrument('oilP', [262, 425, 357, 675], {
                icon: 0, l1: 'PRESS.', l2: 'OLIO', key: 'oilPress',
                marks: ['10', '5', '0'], ticks: 5, redFrom: 0.10, invert: true
            });
        }

        /* ------------------------------------------- G-force widget */
        var gf = B.gForce;
        layers.push({
            id: 'gforce', z: 22, shader: 'gforce',
            x: G.gx(gf.cx - gf.w / 2), y: G.gy(gf.cy - gf.h / 2),
            w: G.gs(gf.w), h: G.gs(gf.h),
            uniforms: function (s) {
                return { u_g: [s.gLat, s.gLon], u_max: 1.2, u_col: GC.primaryWhite };
            }
        });
        /* Four readings around it, one per direction, from one coherent
           lateral/longitudinal state (brief section 8). */
        [['gR', 1, 0, 'left', gf.w * 0.42, 5, function (s) { return Math.max(s.gLat, 0); }],
         ['gL', -1, 0, 'right', -gf.w * 0.42, 5, function (s) { return Math.max(-s.gLat, 0); }],
         ['gU', 0, -1, 'centre', 0, -gf.h * 0.52, function (s) { return Math.max(s.gLon, 0); }],
         ['gD', 0, 1, 'centre', 0, gf.h * 0.62, function (s) { return Math.max(-s.gLon, 0); }]
        ].forEach(function (r) {
            var ax = G.gx(gf.cx + r[4]), ay = G.gy(gf.cy + r[5]);
            txt(r[0], 22, { x: ax - G.gs(46), y: ay - G.gs(20), w: G.gs(92), h: G.gs(28) },
                { face: 'display', size: G.gs(14) / 0.70, align: r[3],
                  x: ax, y: ay, color: GC.secondaryWhite },
                function (s) { return r[6](s).toFixed(1); });
        });

        /* ------------------------------------------ lower-left panel */
        var ll = G.grect(B.lowerLeft);
        layers.push({
            id: 'icon_range', z: 26, shader: 'icon',
            x: ll.x, y: ll.y + G.gs(6), w: G.gs(26), h: G.gs(26),
            uniforms: function () { return { u_kind: 0, u_col: GC.secondaryWhite }; }
        });
        txt('range', 26, { x: ll.x + G.gs(32), y: ll.y, w: G.gs(150), h: G.gs(40) },
            { face: 'display', size: G.gs(26) / 0.70, align: 'left',
              x: ll.x + G.gs(34), y: ll.y + G.gs(28), color: GC.primaryWhite },
            function (s) { return s.rangeText; });
        statics('rangeUnit', 26,
            { x: ll.x + G.gs(100), y: ll.y + G.gs(6), w: G.gs(80), h: G.gs(30) },
            { face: 'label', size: G.gs(15) / 0.70, align: 'left', color: GC.secondaryWhite },
            [{ str: U.dist, x: ll.x + G.gs(112), y: ll.y + G.gs(28) }]);

        txt('ambient', 26, { x: ll.x, y: ll.y + G.gs(44), w: G.gs(150), h: G.gs(40) },
            { face: 'display', size: G.gs(26) / 0.70, align: 'left',
              x: ll.x + G.gs(2), y: ll.y + G.gs(72), color: GC.primaryWhite },
            function (s) { return s.ambientText; });
        statics('ambientUnit', 26,
            { x: ll.x + G.gs(60), y: ll.y + G.gs(50), w: G.gs(80), h: G.gs(30) },
            { face: 'label', size: G.gs(15) / 0.70, align: 'left', color: GC.secondaryWhite },
            [{ str: U.temp, x: ll.x + G.gs(74), y: ll.y + G.gs(72) }]);

        txt('clock', 26, { x: ll.x + G.gs(140), y: ll.y + G.gs(42), w: G.gs(230), h: G.gs(42) },
            { face: 'display', size: G.gs(22) / 0.70, align: 'right',
              x: ll.x + ll.w + G.gs(26), y: ll.y + G.gs(72), color: GC.secondaryWhite },
            function (s) { return s.clockText; });

        /* ------------------------------------------------------ speed */
        var sp = G.grect(B.speed);
        txt('speed', 30,
            { x: Math.max(0, sp.x - G.gs(160)), y: sp.y - 12,
              w: sp.w + G.gs(170), h: Panel.BOTTOM_CUT - sp.y + 12 },
            { face: 'gear', size: G.gs(79) / 0.70, align: 'right',
              x: sp.x + sp.w - G.gs(175), y: sp.y + G.gs(92),
              color: GC.primaryWhite },
            function (s) { return String(Math.max(0, Math.round(s.speed))); });
        statics('speedUnit', 30,
            { x: sp.x + sp.w - G.gs(174), y: sp.y + G.gs(62), w: G.gs(110), h: G.gs(38) },
            { face: 'label', size: G.gs(28) / 0.70, align: 'left',
              color: GC.secondaryWhite, tracking: 0.5 },
            [{ str: U.speed, x: sp.x + sp.w - G.gs(168), y: sp.y + G.gs(92) }]);

        /* ------------------------------------------------------ boost */
        /*
         * Left of the load indicator, under CORSA, where the dial's interior
         * is open - well clear of the G readings and the gear's foot.
         */
        if (P.boost && S.showBoost) {
            var bx = 575, bw = 215, by = 498, bh = 18;
            statics('boostLbl', 26, { x: bx - 6, y: by - 30, w: 120, h: 28 },
                { face: 'label', size: G.gs(15) / 0.70, color: GC.secondaryWhite, tracking: 1.5 },
                [{ str: 'BOOST ' + U.press, x: bx, y: by - 9 }]);
            layers.push({
                id: 'boost', z: 26, shader: 'boost',
                x: bx, y: by, w: bw, h: bh,
                uniforms: function (s) {
                    return {
                        u_frac: boostFrac(s.boostPsi, bMax, bMin), u_zero: BOOST_ZERO,
                        u_segs: 20, u_peak: boostFrac(s.boostPeakPsi, bMax, bMin)
                    };
                }
            });
            txt('boostVal', 26, { x: bx + bw - 90, y: by - 32, w: 96, h: 30 },
                { face: 'display', size: G.gs(18) / 0.70, align: 'right',
                  x: bx + bw, y: by - 9, color: GC.primaryWhite },
                function (s) { return s.boostPsi.toFixed(imperial ? 1 : 2); });
        }

        var PSI_PER_BAR = 14.503774;
        var bMax = imperial ? P.boostMaxPsi : P.boostMaxPsi / PSI_PER_BAR;
        var bMin = imperial ? -10 : -10 / PSI_PER_BAR;

        return { id: 'toro', name: 'Toro', layers: layers, profile: P,
                 settings: S, palette: C, guide: G, imperial: imperial,
                 dial: { centre: DC, rOuter: rOuter, ang: ANG, redV: redV } };
    }

    var BOOST_ZERO = 0.22;
    function boostFrac(v, max, min) {
        if (v >= 0) return clamp01(BOOST_ZERO + (1 - BOOST_ZERO) * (v / max));
        return clamp01(BOOST_ZERO * (1 - v / min));
    }

    return { build: build, Guide: Guide, vOf: vOf, briefV: briefV };
}));
