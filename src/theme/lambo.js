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
        /* how much of the screen it fills, and where it sits */
        G.setFit(S.zoom, S.shiftY);
        var C = S.colours;
        var GC = G.COLOURS;
        /* The brief paints the gear and the mode labels red. With the
           colour set to apply to everything they follow the accent, which
           is read every frame so the interior light can move it live. */
        function keyCol() { return S.accentScope === 'full' ? C.accent : GC.corsaRed; }
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
            /* z 1: the hosted map draws at z 0, under this.
               belowCut: the only layer allowed past the bottom strip. */
            id: 'bg', z: 1, shader: 'bg', belowCut: true, still: true,
            x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT + S.bottomExtra,
            uniforms: function (s) {
                var c = s && s.centre;
                var open = (c && c.mode === 'map' ? c.open : 0) * S.holeMax;
                return {
                    u_hole: S.hole, u_holeOpen: [open, S.holeFeather, S.holeChamfer],
                    u_black: GC.screenBlack, u_blue: GC.screenBlueBlack,
                    u_lower: GC.lowerField, u_line: GC.geometricLine,
                    u_hex: S.hexagons, u_hexSize: S.hexSize, u_facets: S.facets, u_rev: S.revuelto,
                    u_hexTint: S.hexTint,
                    /* white lifted towards the accent, unless a colour was set */
                    u_node: C.node || [0.5 + 0.5 * C.accent[0], 0.5 + 0.5 * C.accent[1],
                                       0.5 + 0.5 * C.accent[2]],
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
            x: Math.max(0, G.gx(T.cx - T.rNumeral) - 84),
            y: Math.max(0, G.gy(T.cy - T.rNumeral) - 74), w: 0, h: 0
        };
        numBox.w = Math.min(Panel.PANEL_WIDTH, G.gx(T.cx + T.rNumeral) + 84) - numBox.x;
        numBox.h = Math.min(Panel.BOTTOM_CUT,
            Math.max(G.point(T.vMax, T.rNumeral).y, G.point(T.vMin, T.rNumeral).y) + 88) - numBox.y;

        var numLayout = Text.place(atlas, numItems.map(function (it) {
            return { str: it.str, x: it.x - numBox.x, y: it.y - numBox.y };
        }), { face: 'dial', size: numSize, align: 'centre', baseline: 'middle' });

        /*
         * The scale grows as it climbs: the first numeral a tenth larger
         * than the brief's, each one after it a little larger again, and
         * the numeral at the red mark the largest - a twentieth above the
         * first. Baked into the glyph quads here rather than sent to the
         * shader, which has no uniform vectors to spare; the shader's own
         * scaling, as the needle passes, multiplies on top of it.
         */
        (function growWithTheScale() {
            var first = 1.10, atRed = 1.05, span = Math.max(1, redV - 1), i, j = 0;
            for (i = 0; i < numVals.length; i++) {
                var t = Math.max(0, Math.min(1, (numVals[i] - 1) / span));
                var k = first * (1 + (atRed - 1) * t);
                var n = String(numVals[i]).length, c;
                for (c = 0; c < n && j < 12; c++, j++) {
                    var q = j * 4;
                    var cx = numLayout.p[q] + numLayout.p[q + 2] / 2;
                    var cy = numLayout.p[q + 1] + numLayout.p[q + 3] / 2;
                    numLayout.p[q + 2] *= k;
                    numLayout.p[q + 3] *= k;
                    numLayout.p[q] = cx - numLayout.p[q + 2] / 2;
                    numLayout.p[q + 1] = cy - numLayout.p[q + 3] / 2;
                }
            }
        }());

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

        /* ------------------------------------------------ shift lights */
        /* Three kinds (src/shaders/core.js shiftbar). The Lamborghini one
           is wider, closes in from both ends and fires in bursts at the
           limit, with the screen flash in step and the cluster shaking. */
        var toroShift = S.shiftStyle === 'toro';
        if (S.shiftLights) {
            var SB = toroShift ? { x: 520, y: 2, w: 880, h: 46, leds: 11 }
                : S.shiftStyle === 'blade' ? { x: 600, y: 8, w: 720, h: 30, leds: 1 }
                : { x: 640, y: 6, w: 580, h: 34, leds: 15 };
            layers.push({
                id: 'shift', z: 60, shader: 'shiftbar',
                x: SB.x, y: SB.y, w: SB.w, h: SB.h,
                uniforms: function (s) {
                    var start = S.rpmRedline - 1800;
                    return {
                        u_frac: clamp01((s.rpm - start) / Math.max(1, S.rpmLimiter - start)),
                        u_leds: SB.leds, u_style: S.shiftStyleIndex, u_burst: toroShift ? 1 : 0,
                        u_strobe: s.rpm >= S.rpmLimiter - 60 ? 1 : 0,
                        u_c1: toroShift || S.shiftStyle === 'blade' ? GC.primaryWhite : C.green,
                        u_c2: toroShift ? [1.0, 0.45, 0.08] : C.amber, u_c3: GC.corsaRed
                    };
                }
            });
        }
        if (edgeFlash) {
            layers.push({
                id: 'flash', z: 95, shader: 'flash', still: true,
                x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
                uniforms: function (s) {
                    return { u_on: s.limiter || 0, u_rate: S.flashRate,
                             u_col: S.flashCol, u_strength: S.flashStrength,
                             u_style: S.flashStyleIndex, u_spread: S.flashSpread,
                             u_burst: toroShift ? 1 : 0 };
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
              color: function () { return keyCol(); },
              outCol: function (s) {
                  return s.limiter > 0.5 ? [1, 1, 1] : keyCol();
              } },
            function (s) { return s.gear; });

        txt('corsa', 24, { x: G.gx(B.corsa.cx) - 100, y: G.gy(B.corsa.cy) - 28, w: 200, h: 50 },
            { face: 'label', size: G.gs(26) / 0.70, align: 'centre',
              x: G.gx(B.corsa.cx), y: G.gy(B.corsa.cy) + G.gs(13),
              color: keyCol, tracking: 1.5 },
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
              color: keyCol, tracking: 1 },
            [{ str: 'ESC', x: G.gx(B.escBlock.cx), y: G.gy(B.escBlock.cy) - G.gs(3) }]);
        txt('escMode', 24, { x: G.gx(B.escBlock.cx) - 90, y: G.gy(B.escBlock.cy) - 4, w: 180, h: 40 },
            { face: 'label', size: G.gs(21) / 0.70, align: 'centre',
              x: G.gx(B.escBlock.cx), y: G.gy(B.escBlock.cy) + G.gs(23),
              color: keyCol, tracking: 1 },
            function (s) { return s.modeLabel || S.mode; });

        /* ---------------------------------------- side instruments */
        /*
         * The Huracan's side instruments: two slanted horizontal gauges a
         * side, each a label with its icon, a scale with numbers and ticks,
         * a hatched bar whose last section is orange-red, and a red needle
         * at the value (shader 'hgauge'). They lean with the screen's own
         * angled corners, and the upper one of each pair sits further in so
         * the pair follows that edge too.
         *
         * rect is in guide units; inside it the gauge keeps a fixed grid,
         * 100 units tall (src/shaders/parts.js hgauge).
         */
        var HOT = [1.0, 0.36, 0.10];
        function instrument(id, rect, o) {
            var r = G.grect(rect);
            var k = r.h / 100;
            var left = o.side === 'left';
            var shear = o.shear !== undefined ? o.shear : left ? 0.30 : -0.30;
            var podOf = o.pod || function (s) { return s.pods[o.key]; };
            var X0 = 16, X1 = r.w / k - 16;
            /* where a fraction of the scale lands, at a height in the grid */
            function at(f, y) {
                var ff = o.dir < 0 ? 1 - f : f;
                return r.x + k * (X0 + ff * (X1 - X0) + (63 - y) * shear);
            }
            var iconS = o.icon === null ? 0 : 26 * k;
            var iconX = left ? r.x + k * (2 + (63 - 12) * shear) : r.x + r.w - k * 2 - iconS + k * (63 - 12) * shear;
            if (o.icon !== null) layers.push({
                id: 'icon_' + id, z: 20, shader: 'icon',
                x: iconX, y: r.y - 10 * k, w: iconS, h: iconS,
                uniforms: function () {
                    return { u_kind: o.icon, u_col: GC.secondaryWhite };
                }
            });
            var lblX = left ? iconX + iconS + (iconS ? 8 * k : 0) : iconX - 8 * k;
            var lblBox = { x: r.x - 20 * k, y: r.y - 12 * k, w: r.w + 40 * k, h: 30 * k };
            function label(suffix, str, show) {
                statics('lbl_' + id + suffix, 20, lblBox,
                    { face: 'label', size: 16 * k / 0.70, align: left ? 'left' : 'right',
                      color: GC.secondaryWhite, tracking: 0.8, show: show },
                    [{ str: str, x: lblX, y: r.y + 13 * k }]);
            }
            /* the scale's numbers in the car's orange-red italic figures */
            function numbers(suffix, marks, show) {
                var figures = marks.every(function (m) { return /^[0-9]+$/.test(m); });
                statics('scale_' + id + suffix, 21,
                    { x: r.x - 30 * k, y: r.y + 18 * k, w: r.w + 60 * k, h: 28 * k },
                    { face: figures ? 'dial' : 'label', size: (figures ? 15 : 14) * k / 0.70, align: 'centre',
                      color: HOT, alpha: 0.95, show: show },
                    marks.map(function (m, i) {
                        return { str: m, x: at(i / (marks.length - 1), 34), y: r.y + 41 * k };
                    }));
            }
            if (o.alt) {
                label('', o.label, function (s) { return !s.auxIsOil; });
                label('_alt', o.alt.label, function (s) { return !!s.auxIsOil; });
                numbers('', o.marks, function (s) { return !s.auxIsOil; });
                numbers('_alt', o.alt.marks, function (s) { return !!s.auxIsOil; });
            } else {
                label('', o.label, null);
                numbers('', o.marks, null);
            }

            layers.push({
                id: 'bar_' + id, z: 21, shader: 'hgauge',
                x: r.x, y: r.y, w: r.w, h: r.h,
                uniforms: function (s) {
                    var g = podOf(s);
                    var red = o.alt && s.auxIsOil ? o.alt.red : o.red;
                    return {
                        u_frac: clamp01(g.frac), u_dir: o.dir, u_redZone: red,
                        u_shear: shear, u_on: g.text === '--' ? 0 : 1,
                        u_alarm: g.alarm ? 1 : 0,
                        u_col: GC.primaryWhite, u_hot: HOT, u_needle: GC.corsaRed
                    };
                }
            });

            /* the reading itself, at the far end of the label row */
            var valX = left ? r.x + r.w - 4 * k + (63 - 12) * shear * k : r.x + 4 * k + (63 - 12) * shear * k;
            txt('val_' + id, 21,
                { x: left ? valX - 90 * k : valX, y: r.y - 14 * k, w: 90 * k, h: 32 * k },
                { face: 'display', size: 19 * k / 0.70, align: left ? 'right' : 'left',
                  x: valX, y: r.y + 14 * k,
                  color: function (s) {
                      return podOf(s).alarm ? GC.corsaRed : GC.primaryWhite;
                  } },
                function (s) { return podOf(s).text; });
        }

        /* scale numbers in the units shown: the pods' fractions are fixed in C */
        function tLabels(cs) {
            return cs.map(function (c) { return String(Math.round(imperial ? c * 9 / 5 + 32 : c)); });
        }
        instrument('fuel', [1572, 422, 1882, 522], {
            side: 'right', icon: 0, label: 'BENZINA', key: 'fuel', dir: 1,
            marks: ['0', '50', '100'], red: [0, 0.12]
        });
        instrument('coolant', [1600, 538, 1910, 638], {
            side: 'right', icon: 1, label: 'TEMP. ACQUA', key: 'coolant', dir: -1,
            marks: tLabels([50, 90, 130]), red: [0.81, 1]   /* reads 130 .. 50 left to right */
        });

        /* The far-left region the brief cannot resolve: our own readings. */
        if (S.showAuxLeft) {
            /*
             * The left pair mirrors the right: as the car's fuel gauge grows
             * left to right and its water gauge right to left, oil
             * temperature grows right to left and oil pressure left to right,
             * each wedge tallest at its high numbers. Both sit clear of the
             * dial's low end.
             */
            instrument('oilT', [14, 430, 304, 530], {
                side: 'left', icon: 2, label: 'TEMP. OLIO', key: 'oilTemp', dir: -1,
                marks: tLabels([50, 110, 170]), red: [0.83, 1]
            });
            /*
             * The Huracan's second left gauge is oil pressure. Nothing on
             * this car's bus carries it: BeeM-Flash can (docs/BEEM-FLASH-FEED.md),
             * and until it does the slot shows turbo pressure, labelled as
             * what it is rather than left reading dashes.
             */
            instrument('auxPress', [0, 540, 290, 640], {
                side: 'left', icon: 2, label: 'PRESS. TURBO', key: 'auxPress', dir: 1,
                marks: imperial ? ['0', '12', '25'] : ['0', '0.8', '1.7'], red: [0.86, 1],
                alt: { label: 'PRESS. OLIO', marks: imperial ? ['0', '70', '140'] : ['0', '5', '10'],
                       red: [0, 0.08] }
            });
        }

        /* ------------------------------------------- G-force widget */
        var gf = B.gForce;
        layers.push({
            id: 'gforce', z: 22, shader: 'gforce',
            x: G.gx(gf.cx - gf.w / 2), y: G.gy(gf.cy - gf.h / 2),
            w: G.gs(gf.w), h: G.gs(gf.h),
            uniforms: function (s) {
                if (!s.gOk) return null;
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
                function (s) { return s.gOk ? r[6](s).toFixed(1) : '--'; });
        });

        /*
         * No range, clock or outside temperature of ours: the cluster's own
         * bottom strip, which we never cover, already carries all three -
         * and the head unit's clock runs on UTC, so ours read the wrong
         * time on the car. The room they took goes to the instrument.
         */

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
            /*
             * Boost, drawn as one of the side instruments: a slanted scale,
             * a hatched wedge rising to the top of the range and a red
             * needle. Vacuum rests on the 0. Under CORSA, left of the load
             * indicator, where the dial's interior is open.
             */
            var bTop = imperial ? Math.ceil(P.boostMaxPsi / 10) * 10 : Math.round(P.boostMaxPsi / 14.503774 * 10) / 10;
            var bPod = function (s) {
                var v = s.boostPsi;          /* psi or bar, as shown */
                return { frac: clamp01(v / bTop), alarm: false,
                         text: v.toFixed(imperial ? 1 : 2) };
            };
            instrument('boost', [548, 440, 838, 532], {
                side: 'left', icon: null, label: 'BOOST ' + U.press, pod: bPod, dir: 1, shear: 0.30,
                marks: imperial ? ['0', String(bTop / 2), String(bTop)]
                    : ['0', (bTop / 2).toFixed(1), bTop.toFixed(1)],
                red: [0.88, 1]
            });
        }

        var PSI_PER_BAR = 14.503774;
        var bMax = imperial ? P.boostMaxPsi : P.boostMaxPsi / PSI_PER_BAR;
        var bMin = imperial ? -10 : -10 / PSI_PER_BAR;

        return { id: 'toro', name: 'Toro', layers: layers, profile: P,
                 setAccent: function (rgb) { return Palette.setAccent(S, rgb); },
                 /* the shake, played by the renderer while the limiter holds */
                 shakeKeys: S.shakePx > 0 ? shakeKeys(S.shakePx, toroShift) : null,
                 shake: function (s) { return s.limiter >= 0.98; },
                 hasCentre: true, window: { x: S.hole[0], y: S.hole[1], w: S.hole[2], h: S.hole[3] },
                 settings: S, palette: C, guide: G, imperial: imperial,
                 dial: { centre: DC, rOuter: rOuter, ang: ANG, redV: redV } };
    }

    /*
     * The shake's keyframes, "t:x,y,0 ...": a hard jolt that dies away.
     * With the Lamborghini lights it lands on their bursts (0.36 s of
     * every 0.9 s) and rests between; otherwise it never stops.
     */
    function shakeKeys(a, bursts) {
        var path = [[0, 0], [-1, 0.4], [0.9, -0.5], [-0.75, 0.3], [0.7, 0.5],
                    [-0.55, -0.4], [0.45, 0.2], [-0.3, -0.2], [0.15, 0.1], [0, 0]];
        var step = 40, out = [], i;
        for (i = 0; i < path.length; i++) {
            out.push(i * step + ':' + (path[i][0] * a).toFixed(1) + ',' + (path[i][1] * a).toFixed(1) + ',0');
        }
        if (bursts) out.push('900:0,0,0');
        return out.join(' ');
    }

    var BOOST_ZERO = 0.22;
    function boostFrac(v, max, min) {
        if (v >= 0) return clamp01(BOOST_ZERO + (1 - BOOST_ZERO) * (v / max));
        return clamp01(BOOST_ZERO * (1 - v / min));
    }

    return { build: build, Guide: Guide, vOf: vOf, briefV: briefV, shakeKeys: shakeKeys };
}));
