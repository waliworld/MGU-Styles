(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../engine/text.js'),
                                 require('../geometry/panel.js'),
                                 require('./palette.js'));
    } else {
        root.MGUTheme = factory(root.MGUText, root.MGUPanel, root.MGUPalette);
    }
}(typeof self !== 'undefined' ? self : this, function (Text, Panel, Palette) {
    'use strict';

    /*
     * "Toro" - a Lamborghini-inspired cluster for the BMW iDrive 7 panel.
     *
     * Nothing draws at or below y = 646: the car keeps its own bottom strip,
     * so the KOMBI never puts its fallback gear box over our artwork.
     * See docs/CLUSTER-CONSTRAINTS.md section 2.
     */

    /*
     * The sweep is a wide, shallow ellipse - twice as wide as it is tall,
     * ending where its tangent turns vertical. A circular dial sits in a
     * 1920x720 cluster; this one spans it, which is the whole architecture
     * of the clusters it is drawn after.
     */
    var ARC = {
        cx: 960, cy: 415, rx: 620, ry: 310,
        half: 96 * Math.PI / 180,
        segs: 40, major: 5,
        depth: [58, 74],        /* minor, major tick depth */
        bezelInset: 60, bezelNotch: 18,
        numInset: 100, numSize: 42,
        box: { x: 310, y: 72, w: 1300, h: 410 }
    };

    var GEAR = { y: 332, size: 230 };
    var STRIP = { y: 346, pitch: 70, gap: 102, band: { x: 520, y: 316, w: 880, h: 44 } };
    var MODE_Y = 450;
    var POD = { w: 46, top: 215, h: 200 };
    var PODS = [
        { id: 'oilT',  cx: 190,  key: 'oilTemp',  label: 'T.OLIO' },
        { id: 'oilP',  cx: 258,  key: 'oilPress', label: 'P.OLIO' },
        { id: 'water', cx: 1662, key: 'coolant',  label: 'ACQUA' },
        { id: 'fuel',  cx: 1730, key: 'fuel',     label: 'BENZINA' }
    ];
    var BOOST = { x: 660, w: 520, y: 500, h: 34, labelY: 490, zero: 0.22, minPsi: -10 };
    var PSI_PER_BAR = 14.503774;
    var GM = { cx: 1300, cy: 516, size: 96 };
    var COL = { a: 180, b: 372 };          /* bottom-left readout columns */

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

    function gearNames(profile) {
        var names = ['P', 'R', 'N'], i;
        for (i = 1; i <= profile.gearCount; i++) names.push(String(i));
        return names;
    }

    function build(atlas, profileId, settings) {
        var P = Panel.profile(profileId);
        var S = Palette.resolve(settings, P);
        var C = S.colours;
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

        /* Static glyphs, batched; split across layers at the glyph budget. */
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
            uniforms: function () {
                return { u_tint: C.tint, u_hex: S.hexagons, u_hexSize: S.hexSize };
            }
        });

        /* -------------------------------------------------------- rev band */
        var arcBase = function (state) {
            return {
                u_centre: [ARC.cx - ARC.box.x, ARC.cy - ARC.box.y],
                u_r: [ARC.rx, ARC.ry], u_half: ARC.half,
                u_frac: clamp01(state.rpm / S.rpmMax),
                u_redline: S.rpmRedline / S.rpmMax,
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
                u.u_depth = ARC.depth;
                u.u_warn = bandFlash ? (s.limiter || 0) : 0;
                return u;
            } });

        /* The stepped inner bezel, notched around every numeral. */
        var kn = Math.round(S.rpmMax / 1000);
        layers.push({ id: 'bezel', z: 13, shader: 'bezel',
            x: ARC.box.x, y: ARC.box.y, w: ARC.box.w, h: ARC.box.h,
            uniforms: function () {
                return {
                    u_centre: [ARC.cx - ARC.box.x, ARC.cy - ARC.box.y],
                    u_r: [ARC.rx, ARC.ry], u_half: ARC.half,
                    u_steps: kn, u_inset: ARC.bezelInset, u_notch: ARC.bezelNotch,
                    u_col: C.steel
                };
            } });

        /* Numerals that light and swell as the revs sweep past them. */
        var numBox = { x: 380, y: 150, w: 1160, h: 330 };
        var numPlace = [], k, pt;
        for (k = 0; k <= kn; k++) {
            pt = arcPoint(k / kn);
            numPlace.push({
                str: String(k),
                x: pt.x - pt.nx * ARC.numInset - numBox.x,
                y: pt.y - pt.ny * ARC.numInset - numBox.y
            });
        }
        var numLayout = Text.place(atlas, numPlace, {
            face: 'display', size: ARC.numSize, align: 'centre', baseline: 'middle'
        });
        layers.push({
            id: 'arcNums', z: 14, shader: 'arcnum',
            x: numBox.x, y: numBox.y, w: numBox.w, h: numBox.h,
            uniforms: function (s) {
                return {
                    u_g: numLayout.g, u_quad: numLayout.p,
                    u_count: numLayout.count, u_sharp: numLayout.sharp,
                    u_frac: clamp01(s.rpm / S.rpmMax), u_grow: 0.30, u_glow: 0.9,
                    u_colOff: C.faint, u_colOn: C.text
                };
            }
        });

        statics('rpmLabel', 14, { x: 410, y: 444, w: 240, h: 40 },
            { face: 'labelL', size: 19, color: C.faint, tracking: 1 },
            [{ str: 'RPM x1000', x: 430, y: 470 }]);

        /* --------------------------------------------- GT3 shift lights */
        if (S.shiftLights) {
            layers.push({
                id: 'shift', z: 60, shader: 'shiftbar',
                x: 560, y: 26, w: 800, h: 40,
                uniforms: function (s) {
                    var start = S.rpmRedline - 1800;
                    return {
                        u_frac: clamp01((s.rpm - start) / Math.max(1, S.rpmLimiter - start)),
                        u_leds: 15,
                        u_strobe: s.rpm >= S.rpmLimiter - 60 ? 1 : 0,
                        u_c1: C.green, u_c2: C.amber, u_c3: C.danger
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
                             u_col: C.danger, u_strength: S.flashStrength };
                }
            });
        }

        /* ------------------------------------------------- gear and mode */
        if (S.gearStrip) {
            layers.push({
                id: 'gearBand', z: 16, shader: 'gearband',
                x: STRIP.band.x, y: STRIP.band.y, w: STRIP.band.w, h: STRIP.band.h,
                uniforms: function () {
                    return { u_color: [0.66, 0.72, 0.80, 0.22] };
                }
            });
            /*
             * The strip scrolls so the engaged gear sits under the big
             * numeral, with its neighbours running out to either side - the
             * way the reference clusters do it. Drawing it at a fixed
             * position instead leaves the numeral sitting on top of whatever
             * gear happens to be in the middle.
             */
            layers.push({
                id: 'gearStrip', z: 18, shader: 'text',
                x: STRIP.band.x, y: 322, w: STRIP.band.w, h: 44,
                uniforms: function (s) {
                    var active = names.indexOf(s.gear);
                    if (active < 0) return null;
                    var items = [], j;
                    var span = Math.floor((Text.MAX_GLYPHS - 1) / 2);
                    for (j = Math.max(0, active - span);
                         j <= Math.min(names.length - 1, active + span); j++) {
                        if (j === active) continue;      /* hidden by the numeral */
                        /* The big numeral is wider than the pitch, so the
                           strip opens a gap around it; without one it eats
                           its own neighbours. */
                        var n = j - active;
                        var dx = (n < 0 ? -1 : 1) *
                                 (STRIP.gap + (Math.abs(n) - 1) * STRIP.pitch);
                        items.push({
                            str: names[j],
                            x: ARC.cx + dx - STRIP.band.x,
                            y: STRIP.y - 322
                        });
                    }
                    if (!items.length) return null;
                    var L = Text.place(atlas, items, {
                        face: 'label', size: 29, align: 'centre'
                    });
                    if (!L) return null;
                    return {
                        u_g: L.g, u_quad: L.p, u_count: L.count, u_sharp: L.sharp,
                        u_color: [C.steel[0], C.steel[1], C.steel[2], 1.0],
                        u_glowCol: C.muted, u_glow: 0, u_outline: 0, u_outCol: C.muted
                    };
                }
            });
        }

        /* The big hollow numeral - the Lamborghini signature. */
        txt('gearBig', 20, { x: 820, y: 212, w: 280, h: 240 },
            { face: 'displayB', size: GEAR.size, align: 'centre', baseline: 'middle',
              x: ARC.cx, y: GEAR.y, outline: 6.0, glow: 0.5,
              color: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; },
              outCol: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; } },
            function (s) { return s.gear; });

        txt('mode', 22, { x: 760, y: 424, w: 400, h: 40 },
            { face: 'label', size: 23, align: 'centre', x: ARC.cx, y: MODE_Y,
              tracking: 7, color: C.second },
            function (s) { return s.driveMode || ''; });

        /* ------------------------------------------------------- boost */
        /* state.js reports boost in psi or bar depending on the unit, so the
           scale ends have to be in the same one. */
        var bMax = imperial ? P.boostMaxPsi : P.boostMaxPsi / PSI_PER_BAR;
        var bMin = imperial ? BOOST.minPsi : BOOST.minPsi / PSI_PER_BAR;
        if (P.boost) {
            statics('boostLbl', 24, { x: 600, y: 466, w: 420, h: 34 },
                { face: 'label', size: 19, color: C.faint, tracking: 3 },
                [{ str: 'BOOST ' + U.press, x: BOOST.x, y: BOOST.labelY }]);
            /* A dark pad so the bar reads against the honeycomb. */
            layers.push({
                id: 'boostPad', z: 23, shader: 'plate',
                x: BOOST.x - 16, y: BOOST.y - 9, w: BOOST.w + 32, h: BOOST.h + 18,
                uniforms: function () {
                    return { u_radius: 9, u_fill: [0.020, 0.028, 0.038, 0.88],
                             u_line: [0.30, 0.35, 0.42, 0.55], u_lineW: 1.2 };
                }
            });
            layers.push({
                id: 'boost', z: 25, shader: 'boost',
                x: BOOST.x, y: BOOST.y, w: BOOST.w, h: BOOST.h,
                uniforms: function (s) {
                    return {
                        u_frac: boostFrac(s.boostPsi, bMax, bMin), u_zero: BOOST.zero,
                        u_segs: 30, u_peak: boostFrac(s.boostPeakPsi, bMax, bMin)
                    };
                }
            });
            txt('boostVal', 26, { x: 1020, y: 462, w: 180, h: 40 },
                { face: 'display', size: 29, align: 'right',
                  x: BOOST.x + BOOST.w, y: BOOST.labelY, color: C.text },
                function (s) { return s.boostPsi.toFixed(imperial ? 1 : 2); });
        }

        /* ------------------------------------------------------ G meter */
        layers.push({
            id: 'gmeter', z: 25, shader: 'gmeter',
            x: GM.cx - GM.size / 2, y: GM.cy - GM.size / 2, w: GM.size, h: GM.size,
            uniforms: function (s) {
                return { u_g: [s.gLat, s.gLon], u_peak: [s.gPeakLat, s.gPeakLon], u_max: 1.2 };
            }
        });
        statics('gLbl', 25, { x: 1250, y: 570, w: 130, h: 26 },
            { face: 'label', size: 17, align: 'centre', color: C.faint, tracking: 2 },
            [{ str: 'G', x: GM.cx, y: 588 }]);

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
        statics('podLblL', 21, { x: 120, y: POD.top + POD.h, w: 230, h: 60 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblL);
        statics('podLblR', 21, { x: 1592, y: POD.top + POD.h, w: 230, h: 60 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblR);

        /* ------------------------------------------------- bottom left */
        statics('botLbl', 28, { x: 150, y: 496, w: 400, h: 120 },
            { face: 'label', size: 18, color: C.faint, tracking: 2 },
            [{ str: 'ODOMETER ' + U.dist, x: COL.a, y: 516 },
             { str: 'RANGE ' + U.dist, x: COL.b, y: 516 },
             { str: 'CLOCK', x: COL.a, y: 590 },
             { str: 'OUTSIDE ' + U.temp, x: COL.b, y: 590 }]);

        txt('odo', 29, { x: 170, y: 522, w: 200, h: 42 },
            { face: 'display', size: 29, x: COL.a, y: 554, color: C.text },
            function (s) { return s.odoText; });
        txt('range', 29, { x: 362, y: 522, w: 200, h: 42 },
            { face: 'display', size: 29, x: COL.b, y: 554, color: C.text },
            function (s) { return s.rangeText; });
        txt('clock', 29, { x: 170, y: 596, w: 200, h: 42 },
            { face: 'display', size: 29, x: COL.a, y: 628, color: C.text },
            function (s) { return s.clockText; });
        txt('ambient', 29, { x: 362, y: 596, w: 200, h: 42 },
            { face: 'display', size: 29, x: COL.b, y: 628, color: C.text },
            function (s) { return s.ambientText; });

        /* ------------------------------------------------ speed, right */
        txt('speed', 30, { x: 1420, y: 508, w: 300, h: 134 },
            { face: 'display', size: 128, align: 'right', x: 1700, y: 612,
              color: C.text, glow: 0.18, glowCol: C.lit },
            function (s) { return String(Math.max(0, Math.round(s.speed))); });
        statics('speedUnit', 30, { x: 1706, y: 584, w: 120, h: 40 },
            { face: 'label', size: 25, align: 'left', color: C.muted, tracking: 3 },
            [{ str: U.speed, x: 1712, y: 612 }]);

        return { id: 'toro', name: 'Toro', layers: layers, profile: P,
                 settings: S, palette: C, imperial: imperial, arc: ARC };
    }

    /*
     * Boost is scaled piecewise: vacuum gets the first fifth of the bar and
     * charge pressure the rest. A linear scale wastes a third of the gauge
     * on manifold vacuum, which nobody reads while driving.
     */
    function boostFrac(v, max, min) {
        if (v >= 0) return clamp01(BOOST.zero + (1 - BOOST.zero) * (v / max));
        return clamp01(BOOST.zero * (1 - v / min));
    }

    return { build: build, ARC: ARC, PODS: PODS, arcPoint: arcPoint };
}));
