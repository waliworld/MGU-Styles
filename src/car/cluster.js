'use strict';
/*
 * Drives the theme on the instrument cluster through cluster-render.
 *
 * Every layer of the theme becomes one effect layer on the `panel` target.
 * Effect layers upload no pixels: the only thing that crosses the socket
 * after start-up is the uniforms that actually changed, a few hundred bytes
 * a frame against a 5500 KB/s budget shared with the whole head unit.
 *
 * Node 8: no spread, no optional chaining, no template literals.
 */

var Prelude = require('../shaders/prelude.js');
var Panel = require('../geometry/panel.js');

var TARGET = 'panel';
var EPS = 0.0005;

function same(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < EPS;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) >= EPS) return false;
    }
    return true;
}

function copy(v) { return typeof v === 'number' ? v : v.slice(); }

/*
 * opts: {
 *   cr,          a ClusterRender (or anything with the same surface)
 *   theme,       from src/theme/lambo.js
 *   shaders,     { id: fragment body }
 *   atlas,       assets/fonts/atlas.json
 *   atlasPixels, Buffer of w*h bytes, r8
 *   log          { info, warn }
 * }
 */
function create(opts) {
    var cr = opts.cr;
    var theme = opts.theme;
    var log = opts.log || { info: function () {}, warn: function () {} };

    var atlasRef = 0;
    var refs = {};        /* layer id -> ref */
    var sent = {};        /* layer id -> { uniform: lastValue } */
    var visible = {};     /* layer id -> bool */
    var built = false;
    var stopped = false;

    /* Sorted bottom to top; cluster-render draws by class then z. */
    var ordered = theme.layers.slice().sort(function (a, b) {
        return (a.z || 0) - (b.z || 0);
    });

    function send(id, ref, name, value) {
        var last = sent[id];
        if (last && same(last[name], value)) return 0;
        var values = typeof value === 'number' ? [value] : value;
        if (values.length > 4) cr.uniform(ref, name, values, { type: 'vec4' });
        else cr.uniform(ref, name, values);
        last[name] = copy(value);
        return 1;
    }

    function build() {
        if (built) return;
        /*
         * The atlas first: binds are refused until the asset exists, and the
         * service allows only 16 assets per client - over that it hands out a
         * ref and silently refuses it, so layers bound to it draw nothing.
         * One asset is all this theme needs.
         */
        atlasRef = cr.asset({
            target: TARGET, format: 'r8',
            w: opts.atlas.size, h: opts.atlas.size,
            sampling: 'bilinear', wrap: 'clamp'
        });
        if (!atlasRef) { log.warn('cluster: the glyph atlas was refused'); return; }

        function pixelRect(T) {
            var x0 = Math.floor(T.x), y0 = Math.floor(T.y);
            return Object.assign({}, T, { x: x0, y: y0,
                w: Math.ceil(T.x + T.w) - x0, h: Math.ceil(T.y + T.h) - y0 });
        }
        for (var i = 0; i < ordered.length; i++) {
            /* whole pixels on the wire: the renderer's rectangles are integers */
            var L = pixelRect(ordered[i]);
            var body = opts.shaders[L.shader];
            if (!body) { log.warn('cluster: no shader "' + L.shader + '"'); continue; }

            var ref = cr.effect({
                target: TARGET,
                klass: L.klass || 'content',
                z: L.z || 0,
                x: L.x, y: L.y, w: L.w, h: L.h,
                fs: Prelude.compose(body),
                /* u_time from the renderer's own clock: animation keeps
                   running without us sending anything. */
                time: true,
                /* We never take the slot from the stock cluster by force and
                   we leave BMW's turn box alone. */
                contend: false,
                guide_hold: false
            });
            if (!ref) { log.warn('cluster: layer "' + L.id + '" was refused'); continue; }

            refs[L.id] = ref;
            sent[L.id] = {};
            visible[L.id] = true;

            cr.uniform(ref, 'u_size', [L.w, L.h]);
            /*
             * How much of the layer survives the bottom-strip cut. The theme
             * keeps every layer above it, so this is 0 ("all of it") - but
             * the shader honours it, so a layout change cannot quietly start
             * covering the strip.
             */
            var keep = (L.belowCut || Panel.BOTTOM_CUT >= L.y + L.h) ? 0 :
                Math.max(0, (Panel.BOTTOM_CUT - L.y) / L.h);
            cr.uniform(ref, 'u_keep', [keep]);
            if (body.indexOf('u_atlas') >= 0) {
                cr.bind(ref, 'u_atlas', atlasRef);
                cr.uniform(ref, 'u_atlasSize', [opts.atlas.size, opts.atlas.size]);
            }
        }
        built = true;
        log.info('cluster: ' + Object.keys(refs).length + ' layers, 1 asset');
    }

    /* Called on every (re)connect: the client replays layers and uniforms
       itself, but the asset's bytes are ours to send. */
    function ready() {
        build();
        if (atlasRef) cr.pixels(atlasRef, null, opts.atlasPixels);
    }

    /* One frame. Returns how many uniform messages went out. */
    function tick(state) {
        if (!built || stopped) return 0;
        var writes = 0;
        for (var i = 0; i < ordered.length; i++) {
            var L = ordered[i];
            var ref = refs[L.id];
            if (!ref) continue;
            var u = L.uniforms ? L.uniforms(state, 0) : {};

            /* A layer with nothing to say is hidden rather than drawn blank. */
            if (u === null) {
                if (visible[L.id]) { cr.set(ref, { visible: false }); visible[L.id] = false; }
                continue;
            }
            if (!visible[L.id]) { cr.set(ref, { visible: true }); visible[L.id] = true; }

            for (var k in u) {
                if (Object.prototype.hasOwnProperty.call(u, k)) {
                    writes += send(L.id, ref, k, u[k]);
                }
            }
        }
        return writes;
    }

    /* Hand the cluster back to BMW. */
    function stop() {
        stopped = true;
        for (var id in refs) {
            if (Object.prototype.hasOwnProperty.call(refs, id)) cr.drop(refs[id]);
        }
        if (atlasRef) cr.drop(atlasRef);
        refs = {}; sent = {}; visible = {}; atlasRef = 0; built = false;
    }

    return {
        ready: ready, tick: tick, stop: stop,
        refs: function () { return refs; },
        isBuilt: function () { return built; }
    };
}

module.exports = { create: create, TARGET: TARGET };
