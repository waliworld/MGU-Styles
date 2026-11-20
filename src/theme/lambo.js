(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../engine/text.js'),
                                 require('../geometry/panel.js'),
                                 require('./palette.js'),
                                 require('../geometry/superarc.js'));
    } else {
        root.MGUTheme = factory(root.MGUText, root.MGUPanel, root.MGUPalette,
                                root.MGUSuperArc);
    }
}(typeof self !== 'undefined' ? self : this, function (Text, Panel, Palette, SuperArc) {
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
        cx: 960, cy: 478, rx: 790, ry: 380, k: 1.55,
        half: 93 * Math.PI / 180,
        segs: 40, major: 5,
        depth: [64, 82],        /* minor, major tick depth */
        bezelInset: 66, bezelNotch: 20,
        numInset: 110, numSize: 44,
        box: { x: 130, y: 58, w: 1660, h: 502 }
    };

    var GEAR = { y: 335, size: 230 };
    var STRIP = { y: 350, pitch: 70, gap: 102, band: { x: 520, y: 324, w: 880, h: 44 } };
    var MODE_Y = 440;
    /*
     * The sweep runs nearly the full width, so the side gauges sit in the
     * narrow columns outside its ends, clear of the factory telltales.
     */
    var POD = { w: 46, top: 374, h: 206, valueY: 360, labelY: 606, unitY: 628 };
    var PODS = [
        { id: 'oilT',  cx: 52,   key: 'oilTemp',  label: 'T.OLIO' },
        { id: 'oilP',  cx: 120,  key: 'oilPress', label: 'P.OLIO' },
        { id: 'water', cx: 1800, key: 'coolant',  label: 'ACQUA' },
        { id: 'fuel',  cx: 1868, key: 'fuel',     label: 'BENZINA' }
    ];
    var BOOST = { x: 620, w: 520, y: 486, h: 34, labelY: 476, zero: 0.22, minPsi: -10 };
    var PSI_PER_BAR = 14.503774;
    var GM = { cx: 1300, cy: 500, size: 100 };
    /* The four readouts run as one row under the dial. */
    var ROW = { labelY: 556, valueY: 596, cols: [330, 520, 680, 840] };
    var SPEED = { x: 1700, y: 612, size: 130, unitX: 1712 };

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /*
     * A point on the sweep and the outward normal there, for the
     * superellipse the dial is built on. Position along the dial is the
     * ordinary polar angle, matching src/shaders/core.js.
     */
    function arcPoint(t, k) {
        var q = SuperArc.atArc(t, ARC.rx, ARC.ry, k || ARC.k, ARC.half);
        return { x: ARC.cx + q.x, y: ARC.cy + q.y, nx: q.nx, ny: q.ny };
    }

    function arcMaps(k) {
        return SuperArc.maps(ARC.rx, ARC.ry, k || ARC.k, ARC.half);
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
        var AM = arcMaps(S.arcShape);
        var arcBase = function (state) {
            return {
                u_remapP: AM.P,
                u_centre: [ARC.cx - ARC.box.x, ARC.cy - ARC.box.y],
                u_r: [ARC.rx, ARC.ry], u_k: S.arcShape, u_half: ARC.half,
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
                u.u_remapQ = AM.Q;
                u.u_arcLen = AM.arcLen;
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
                    u_r: [ARC.rx, ARC.ry], u_k: S.arcShape, u_half: ARC.half,
                    u_remapP: AM.P,
                    u_steps: kn, u_inset: ARC.bezelInset, u_notch: ARC.bezelNotch,
                    u_col: C.steel
                };
            } });

        /* Numerals that light and swell as the revs sweep past them. */
        var numBox = { x: 150, y: 150, w: 1620, h: 400 };
        var numPlace = [], k, pt;
        for (k = 0; k <= kn; k++) {
            pt = arcPoint(k / kn, S.arcShape);
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

        statics('rpmLabel', 14, { x: 300, y: 486, w: 240, h: 40 },
            { face: 'labelL', size: 19, color: C.faint, tracking: 1 },
            [{ str: 'RPM x1000', x: 320, y: 512 }]);

        /* --------------------------------------------- GT3 shift lights */
        if (S.shiftLights) {
            layers.push({
                id: 'shift', z: 60, shader: 'shiftbar',
                x: 560, y: 18, w: 800, h: 40,
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
                x: STRIP.band.x, y: 316, w: STRIP.band.w, h: 58,
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
                            y: STRIP.y - 316
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
        txt('gearBig', 20, { x: 812, y: 204, w: 296, h: 266 },
            { face: 'displayB', size: GEAR.size, align: 'centre', baseline: 'middle',
              x: ARC.cx, y: GEAR.y, outline: 6.0, glow: 0.5,
              color: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; },
              outCol: function (s) { return s.limiter > 0.5 ? C.danger : C.accent; } },
            function (s) { return s.gear; });

        txt('mode', 22, { x: 760, y: 414, w: 400, h: 40 },
            { face: 'label', size: 23, align: 'centre', x: ARC.cx, y: MODE_Y,
              tracking: 7, color: C.second },
            function (s) { return s.driveMode || ''; });

        /* ------------------------------------------------------- boost */
        /* state.js reports boost in psi or bar depending on the unit, so the
           scale ends have to be in the same one. */
        var bMax = imperial ? P.boostMaxPsi : P.boostMaxPsi / PSI_PER_BAR;
        var bMin = imperial ? BOOST.minPsi : BOOST.minPsi / PSI_PER_BAR;
        if (P.boost) {
            statics('boostLbl', 24, { x: 560, y: 452, w: 420, h: 34 },
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
            txt('boostVal', 26, { x: 980, y: 448, w: 180, h: 40 },
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
        statics('gLbl', 25, { x: 1240, y: 556, w: 130, h: 26 },
            { face: 'label', size: 17, align: 'centre', color: C.faint, tracking: 2 },
            [{ str: 'G', x: GM.cx, y: 574 }]);

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
                { str: pod.label, x: pod.cx, y: POD.labelY },
                { str: unit, x: pod.cx, y: POD.unitY });
            var vx = Math.max(0, Math.min(pod.cx - 60, Panel.PANEL_WIDTH - 120));
            txt('podv_' + pod.id, 21,
                { x: vx, y: POD.valueY - 30, w: 120, h: 40 },
                { face: 'display', size: 25, align: 'centre', x: pod.cx, y: POD.valueY,
                  color: function (s) {
                      return s.pods[pod.key].alarm ? C.danger : C.text;
                  } },
                function (s) { return s.pods[pod.key].text; });
        });
        statics('podLblL', 21, { x: 0, y: POD.labelY - 20, w: 200, h: 56 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblL);
        statics('podLblR', 21, { x: 1720, y: POD.labelY - 20, w: 200, h: 56 },
            { face: 'label', size: 18, align: 'centre', color: C.faint, tracking: 1 }, lblR);

        /* --------------------------------------------- readouts, a row */
        statics('botLbl', 28, { x: 270, y: 534, w: 700, h: 36 },
            { face: 'label', size: 18, color: C.faint, tracking: 2 },
            [{ str: 'ODOMETER ' + U.dist, x: ROW.cols[0], y: ROW.labelY },
             { str: 'RANGE ' + U.dist, x: ROW.cols[1], y: ROW.labelY },
             { str: 'CLOCK', x: ROW.cols[2], y: ROW.labelY },
             { str: 'OUTSIDE ' + U.temp, x: ROW.cols[3], y: ROW.labelY }]);

        [['odo', 0, 'odoText'], ['range', 1, 'rangeText'],
         ['clock', 2, 'clockText'], ['ambient', 3, 'ambientText']
        ].forEach(function (r) {
            txt(r[0], 29, { x: ROW.cols[r[1]] - 10, y: ROW.valueY - 34, w: 190, h: 44 },
                { face: 'display', size: 29, x: ROW.cols[r[1]], y: ROW.valueY, color: C.text },
                function (s) { return s[r[2]]; });
        });

        /* ------------------------------------------------ speed, right */
        txt('speed', 30, { x: 1396, y: 494, w: 336, h: 152 },
            { face: 'display', size: SPEED.size, align: 'right', x: SPEED.x, y: SPEED.y,
              color: C.text, glow: 0.18, glowCol: C.lit },
            function (s) { return String(Math.max(0, Math.round(s.speed))); });
        statics('speedUnit', 30, { x: SPEED.unitX - 6, y: SPEED.y - 28, w: 130, h: 40 },
            { face: 'label', size: 25, align: 'left', color: C.muted, tracking: 3 },
            [{ str: U.speed, x: SPEED.unitX, y: SPEED.y }]);

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
