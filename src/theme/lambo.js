(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../engine/text.js'),
                                 require('../geometry/panel.js'));
    } else {
        root.MGUTheme = factory(root.MGUText, root.MGUPanel);
    }
}(typeof self !== 'undefined' ? self : this, function (Text, Panel) {
    'use strict';

    /*
     * "Toro" - a Lamborghini-inspired cluster for the BMW iDrive 7 panel.
     *
     * Nothing draws at or below y = 646: the car keeps its own bottom strip,
     * so the KOMBI never puts its fallback gear box over our artwork.
     * See docs/CLUSTER-CONSTRAINTS.md section 2.
     */

    var C = {
        text:   [0.937, 0.957, 0.976],
        muted:  [0.455, 0.514, 0.576],
        faint:  [0.290, 0.340, 0.400],
        accent: [1.000, 0.416, 0.102],   /* arancio */
        gold:   [1.000, 0.796, 0.173],
        lit:    [0.878, 0.945, 1.000],
        danger: [1.000, 0.141, 0.078],
        cool:   [0.286, 0.600, 1.000],
        tint:   [0.090, 0.180, 0.320]
    };

    /*
     * The sweep is an ellipse: wide and shallow, the proportion that makes a
     * supercar tachometer read across a 16:6 cluster instead of sitting in it
     * as a circle.
     */
    var ARC = {
        cx: 960, cy: 401, rx: 508, ry: 281,
        half: 100 * Math.PI / 180,
        segs: 40, major: 5,
        numInset: 84,
        box: { x: 400, y: 85, w: 1120, h: 420 }
    };

    var GEAR_Y = 318;
    var STRIP_Y = 402, STRIP_PITCH = 46;
    var MODE_Y = 446;
    var POD = { w: 44, top: 200, h: 200 };
    var PODS = [
        { id: 'oilT',  cx: 182,  key: 'oilTemp',  label: 'T.OLIO' },
        { id: 'oilP',  cx: 250,  key: 'oilPress', label: 'P.OLIO' },
        { id: 'water', cx: 1670, key: 'coolant',  label: 'ACQUA' },
        { id: 'fuel',  cx: 1738, key: 'fuel',     label: 'BENZINA' }
    ];
    var BOOST = { x: 700, w: 520, y: 562, h: 36, labelY: 548,
                  zero: 0.22, minPsi: -10 };

    /*
     * Boost is scaled piecewise: vacuum gets the first fifth of the bar and
     * charge pressure the rest. A linear scale wastes a third of the gauge on
     * manifold vacuum, which nobody reads while driving.
     */
    function boostFrac(psi, profile) {
        if (psi >= 0) {
            return clamp01(BOOST.zero + (1 - BOOST.zero) * (psi / profile.boostMaxPsi));
        }
        return clamp01(BOOST.zero * (1 - psi / BOOST.minPsi));
    }

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /* A point on the sweep, and the outward normal there. */
    function arcPoint(t) {
        var a = -ARC.half + t * 2 * ARC.half;
        var n = [Math.sin(a) / ARC.rx, -Math.cos(a) / ARC.ry];
        var len = Math.sqrt(n[0] * n[0] + n[1] * n[1]);
        return {
            x: ARC.cx + ARC.rx * Math.sin(a),
            y: ARC.cy - ARC.ry * Math.cos(a),
            nx: n[0] / len, ny: n[1] / len
        };
    }

    function gearSlots(profile) {
        var names = ['P', 'R', 'N'], i;
        for (i = 1; i <= profile.gearCount; i++) names.push(String(i));
        var x0 = ARC.cx - (names.length - 1) * STRIP_PITCH / 2;
        var out = [];
        for (i = 0; i < names.length; i++) out.push({ name: names[i], x: x0 + i * STRIP_PITCH });
        return out;
    }

    function indexOfGear(slots, gear) {
        for (var i = 0; i < slots.length; i++) if (slots[i].name === gear) return i;
        return -1;
    }

    function build(atlas, profileId, settings) {
        settings = settings || {};
        var P = Panel.profile(profileId);
        var slots = gearSlots(P);
        var layers = [];
        var imperial = settings.units !== 'metric';
        var U = {
            dist: imperial ? 'MI' : 'KM',
            temp: imperial ? '°F' : '°C',
            press: imperial ? 'PSI' : 'BAR',
            speed: imperial ? 'MPH' : 'KM/H'
        };

        function txt(id, z, box, style, fn) {
            layers.push({
                id: id, z: z, shader: 'text',
                x: box.x, y: box.y, w: box.w, h: box.h,
                uniforms: function (state) {
                    var str = fn ? fn(state) : style.str;
                    if (str === null || str === undefined || str === '') return null;
                    var L = Text.layout(atlas, String(str), {
                        face: style.face || 'label', size: style.size,
                        x: style.x - box.x, y: style.y - box.y,
                        align: style.align || 'left', baseline: style.baseline,
                        tracking: style.tracking || 0
                    });
                    if (!L) return null;
                    var col = (typeof style.color === 'function' ? style.color(state) : style.color) || C.text;
                    var oc = (typeof style.outCol === 'function' ? style.outCol(state) : style.outCol) || col;
                    return {
                        u_g: L.g, u_quad: L.p, u_count: L.count, u_sharp: L.sharp,
                        u_color: [col[0], col[1], col[2], style.alpha === undefined ? 1 : style.alpha],
                        u_glowCol: style.glowCol || oc, u_glow: style.glow || 0,
                        u_outline: style.outline || 0, u_outCol: oc
                    };
                }
            });
        }

        /*
         * Static glyphs, batched. One layer holds at most MAX_GLYPHS, so a
         * long batch is split across as many layers as it needs.
         */
        function statics(id, z, box, base, items) {
            var chunk = [], used = 0, n = 0, i;
            function flush() {
                if (!chunk.length) return;
                var local = chunk.map(function (it) {
                    var o = {}, k;
                    for (k in it) if (Object.prototype.hasOwnProperty.call(it, k)) o[k] = it[k];
                    o.x = it.x - box.x; o.y = it.y - box.y;
                    return o;
                });
                var L = Text.place(atlas, local, base);
                chunk = []; used = 0;
                if (!L) return;
                var col = base.color || C.muted;
                var al = base.alpha === undefined ? 1 : base.alpha;
                layers.push({
                    id: id + (n ? '_' + n : ''), z: z, shader: 'text',
                    x: box.x, y: box.y, w: box.w, h: box.h,
                    uniforms: function () {
                        return {
                            u_g: L.g, u_quad: L.p, u_count: L.count, u_sharp: L.sharp,
                            u_color: [col[0], col[1], col[2], al],
                            u_glowCol: col, u_glow: 0, u_outline: 0, u_outCol: col
                        };
                    }
                });
                n++;
            }
            for (i = 0; i < items.length; i++) {
                var str = items[i].str !== undefined ? items[i].str : items[i].ch;
                var cost = String(str).replace(/\s/g, '').length;
                if (used + cost > Text.MAX_GLYPHS) flush();
                chunk.push(items[i]);
                used += cost;
            }
            flush();
        }

        /* ------------------------------------------------------ background */
        layers.push({
            id: 'bg', z: 0, shader: 'bg',
            x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
            uniforms: function () { return { u_tint: C.tint, u_hex: 1.0 }; }
        });

        /* -------------------------------------------------------- rev band */
        var arcBase = function (state) {
            return {
                u_centre: [ARC.cx - ARC.box.x, ARC.cy - ARC.box.y],
                u_r: [ARC.rx, ARC.ry], u_half: ARC.half,
                u_frac: clamp01(state.rpm / P.rpmMax),
                u_redline: P.rpmRedline / P.rpmMax,
                u_lit: C.lit
            };
        };
        layers.push({ id: 'rail', z: 10, shader: 'rail',
            x: ARC.box.x, y: ARC.box.y, w: ARC.box.w, h: ARC.box.h,
            uniforms: arcBase });
        layers.push({ id: 'tach', z: 12, shader: 'tach',
            x: ARC.box.x, y: ARC.box.y, w: ARC.box.w, h: ARC.box.h,
            uniforms: function (s) {
                var u = arcBase(s);
                u.u_segs = ARC.segs; u.u_major = ARC.major;
                u.u_warn = s.limiter || 0;
                return u;
            } });

        /* Numerals, set just inside the ticks and square to the sweep. */
        var nums = [], kn = Math.round(P.rpmMax / 1000), k, pt;
        for (k = 0; k <= kn; k++) {
            pt = arcPoint(k / kn);
            nums.push({ str: String(k),
                        x: pt.x - pt.nx * ARC.numInset,
                        y: pt.y - pt.ny * ARC.numInset });
        }
        statics('arcNums', 14, { x: 420, y: 120, w: 1080, h: 370 },
            { face: 'display', size: 40, align: 'centre', baseline: 'middle',
              color: C.text, alpha: 0.94 }, nums);

        statics('rpmLabel', 14, { x: 440, y: 478, w: 260, h: 44 },
            { face: 'labelL', size: 19, color: C.faint, tracking: 1 },
            [{ str: 'RPM x1000', x: 478, y: 506 }]);

        /* --------------------------------------------- GT3 shift lights */
        if (settings.shiftLights !== false) {
            layers.push({
                id: 'shift', z: 60, shader: 'shiftbar',
                x: 560, y: 22, w: 800, h: 40,
                uniforms: function (s) {
                    var start = P.rpmRedline - 1800;
                    return {
                        u_frac: clamp01((s.rpm - start) / (P.rpmLimiter - start)),
                        u_leds: 15,
                        u_strobe: s.rpm >= P.rpmLimiter - 60 ? 1 : 0
                    };
                }
            });
        }
        layers.push({
            id: 'flash', z: 95, shader: 'flash',
            x: 0, y: 0, w: Panel.PANEL_WIDTH, h: Panel.BOTTOM_CUT,
            uniforms: function (s) { return { u_on: s.limiter || 0 }; }
        });

        /* ------------------------------------------------- gear and mode */
        var stripBox = { x: 700, y: 369, w: 520, h: 48 };
        statics('gearStrip', 18, stripBox,
            { face: 'label', size: 29, align: 'centre', color: C.faint },
            slots.map(function (g) { return { str: g.name, x: g.x, y: STRIP_Y }; }));

        layers.push({
            id: 'gearMark', z: 17, shader: 'marker',
            x: stripBox.x, y: 413, w: stripBox.w, h: 8,
            uniforms: function (s) {
                var i = indexOfGear(slots, s.gear);
                if (i < 0) return null;
                return { u_cx: slots[i].x - stripBox.x, u_w: 24, u_col: C.accent };
            }
        });
        layers.push({
            id: 'gearStripOn', z: 19, shader: 'text',
            x: stripBox.x, y: stripBox.y, w: stripBox.w, h: stripBox.h,
            uniforms: function (s) {
                var i = indexOfGear(slots, s.gear);
                if (i < 0) return null;
                var L = Text.layout(atlas, slots[i].name, {
                    face: 'label', size: 29, x: slots[i].x - stripBox.x,
                    y: STRIP_Y - stripBox.y, align: 'centre'
                });
                if (!L) return null;
                return { u_g: L.g, u_quad: L.p, u_count: L.count, u_sharp: L.sharp,
                         u_color: [C.text[0], C.text[1], C.text[2], 1],
                         u_glowCol: C.accent, u_glow: 0.7,
                         u_outline: 0, u_outCol: C.text };
            }
        });

        /* The big hollow numeral in arancio - the Lamborghini signature. */
        txt('gearBig', 20, { x: 806, y: 196, w: 308, h: 252 },
            { face: 'displayB', size: 225, align: 'centre', baseline: 'middle',
              x: ARC.cx, y: GEAR_Y, outline: 6.0, glow: 0.5,
              color: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; },
              outCol: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; } },
            function (s) { return s.gear; });

        txt('mode', 22, { x: 760, y: 420, w: 400, h: 40 },
            { face: 'label', size: 23, align: 'centre', x: ARC.cx, y: MODE_Y,
              tracking: 7, color: C.gold },
            function (s) { return s.driveMode || ''; });

        /* ------------------------------------------------------- boost */
        if (P.boost) {
            statics('boostLbl', 24, { x: 640, y: 524, w: 420, h: 36 },
                { face: 'label', size: 19, color: C.faint, tracking: 3 },
                [{ str: 'BOOST ' + U.press, x: BOOST.x, y: BOOST.labelY }]);
            layers.push({
                id: 'boost', z: 25, shader: 'boost',
                x: BOOST.x, y: BOOST.y, w: BOOST.w, h: BOOST.h,
                uniforms: function (s) {
                    return {
                        u_frac: boostFrac(s.boostPsi, P),
                        u_zero: BOOST.zero, u_segs: 30,
                        u_peak: boostFrac(s.boostPeakPsi, P)
                    };
                }
            });
            txt('boostVal', 26, { x: 1060, y: 518, w: 180, h: 42 },
                { face: 'display', size: 30, align: 'right',
                  x: BOOST.x + BOOST.w, y: BOOST.labelY, color: C.text },
                function (s) { return s.boostPsi.toFixed(1); });
        }

        /* ------------------------------------------------------ G meter */
        layers.push({
            id: 'gmeter', z: 25, shader: 'gmeter',
            x: 1262, y: 522, w: 104, h: 104,
            uniforms: function (s) {
                return { u_g: [s.gLat, s.gLon], u_peak: [s.gPeakLat, s.gPeakLon], u_max: 1.2 };
            }
        });
        statics('gLbl', 25, { x: 1250, y: 620, w: 130, h: 26 },
            { face: 'label', size: 17, align: 'centre', color: C.faint, tracking: 2 },
            [{ str: 'G', x: 1314, y: 642 }]);

        /* --------------------------------------------------- side pods */
        var lblL = [], lblR = [];
        PODS.forEach(function (pod) {
            var unit = pod.key === 'fuel' ? '%'
                     : pod.key === 'oilPress' ? U.press : U.temp;
            layers.push({
                id: 'pod_' + pod.id, z: 20, shader: 'vbar',
                x: pod.cx - POD.w / 2, y: POD.top, w: POD.w, h: POD.h,
                uniforms: function (s) {
                    var v = s.pods[pod.key];
                    return { u_frac: clamp01(v.frac), u_warn: v.warn, u_segs: 20,
                             u_col: v.col || C.lit, u_alarm: v.alarm ? 1 : 0 };
                }
            });
            (pod.cx < 960 ? lblL : lblR).push(
                { str: pod.label, x: pod.cx, y: POD.top + POD.h + 26 },
                { str: unit, x: pod.cx, y: POD.top + POD.h + 48 });
            txt('podv_' + pod.id, 21,
                { x: pod.cx - 70, y: POD.top - 46, w: 140, h: 42 },
                { face: 'display', size: 27, align: 'centre', x: pod.cx, y: POD.top - 16,
                  color: function (s) {
                      return s.pods[pod.key].alarm ? C.danger : C.text;
                  } },
                function (s) { return s.pods[pod.key].text; });
        });
        statics('podLblL', 21, { x: 110, y: POD.top + POD.h, w: 230, h: 60 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblL);
        statics('podLblR', 21, { x: 1598, y: POD.top + POD.h, w: 230, h: 60 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblR);

        /* ------------------------------------------------- bottom left */
        var CA = 120, CB = 310;
        statics('botLbl', 28, { x: 100, y: 486, w: 420, h: 150 },
            { face: 'label', size: 18, color: C.faint, tracking: 2 },
            [{ str: 'ODOMETER ' + U.dist, x: CA, y: 508 },
             { str: 'RANGE ' + U.dist, x: CB, y: 508 },
             { str: 'CLOCK', x: CA, y: 582 },
             { str: 'OUTSIDE ' + U.temp, x: CB, y: 582 }]);

        txt('odo', 29, { x: 110, y: 514, w: 200, h: 42 },
            { face: 'display', size: 29, x: CA, y: 546, color: C.text },
            function (s) { return s.odoText; });
        txt('range', 29, { x: 300, y: 514, w: 200, h: 42 },
            { face: 'display', size: 29, x: CB, y: 546, color: C.text },
            function (s) { return s.rangeText; });
        txt('clock', 29, { x: 110, y: 588, w: 200, h: 42 },
            { face: 'display', size: 29, x: CA, y: 620, color: C.text },
            function (s) { return s.clockText; });
        txt('ambient', 29, { x: 300, y: 588, w: 200, h: 42 },
            { face: 'display', size: 29, x: CB, y: 620, color: C.text },
            function (s) { return s.ambientText; });

        /* ------------------------------------------------ speed, right */
        txt('speed', 30, { x: 1400, y: 492, w: 420, h: 132 },
            { face: 'display', size: 150, align: 'right', x: 1812, y: 612,
              color: C.text, glow: 0.18, glowCol: C.lit },
            function (s) { return String(Math.max(0, Math.round(s.speed))); });
        statics('speedUnit', 30, { x: 1660, y: 610, w: 180, h: 36 },
            { face: 'label', size: 23, align: 'right', color: C.muted, tracking: 4 },
            [{ str: U.speed, x: 1812, y: 638 }]);

        return { id: 'toro', name: 'Toro', layers: layers, profile: P,
                 palette: C, imperial: imperial, arc: ARC };
    }

    return { build: build, palette: C, ARC: ARC, PODS: PODS, arcPoint: arcPoint };
}));
