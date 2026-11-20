(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MGUEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /*
     * Runs a theme's effect layers in WebGL, the same way cluster-render runs
     * them on the cluster: one quad per layer, bottom to top by z, each with
     * its own fragment shader and uniforms.
     *
     * WebGL 1 on purpose - it is GLSL ES 1.00, the dialect the head unit's
     * glslang compiles. A shader that works here is the shader we ship.
     */

    function compile(gl, type, src, id) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            var log = gl.getShaderInfoLog(sh);
            var lines = src.split('\n').map(function (l, i) {
                return (i + 1) + ': ' + l;
            });
            var m = /ERROR: \d+:(\d+)/.exec(log);
            var near = m ? lines.slice(Math.max(0, m[1] - 4), Number(m[1]) + 2).join('\n') : '';
            throw new Error('shader "' + id + '" failed:\n' + log + '\n' + near);
        }
        return sh;
    }

    function program(gl, vert, frag, id) {
        var p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert, id + ':vert'));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag, id + ':frag'));
        gl.bindAttribLocation(p, 0, 'a_pos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error('link "' + id + '": ' + gl.getProgramInfoLog(p));
        }
        return p;
    }

    function create(canvas, opts) {
        opts = opts || {};
        var gl = canvas.getContext('webgl', {
            alpha: false, antialias: false, preserveDrawingBuffer: true
        });
        if (!gl) throw new Error('no WebGL');

        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER,
            new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

        var progs = {};   /* shader id -> program */
        var locs = {};    /* shader id -> { name: location } */
        var atlasTex = null;
        var atlasSize = [1, 1];
        var warned = {};

        function build(shaders, prelude) {
            var id;
            for (id in shaders) {
                if (!Object.prototype.hasOwnProperty.call(shaders, id)) continue;
                var needsText = shaders[id].indexOf('u_atlas') >= 0;
                var frag = prelude.PRELUDE + (needsText ? prelude.TEXT : '') + shaders[id];
                progs[id] = program(gl, prelude.VERT, frag, id);
                locs[id] = {};
            }
        }

        function loc(id, name) {
            if (!(name in locs[id])) locs[id][name] = gl.getUniformLocation(progs[id], name);
            return locs[id][name];
        }

        function setAtlas(image) {
            atlasTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, atlasTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE,
                gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            atlasSize = [image.width, image.height];
        }

        function setUniform(id, name, value) {
            var l = loc(id, name);
            if (!l) return;
            if (typeof value === 'number') { gl.uniform1f(l, value); return; }
            if (typeof value === 'boolean') { gl.uniform1f(l, value ? 1 : 0); return; }
            if (!value || !value.length) return;
            /* Arrays longer than 4 are uniform arrays of vec4. */
            if (value.length === 2) gl.uniform2fv(l, value);
            else if (value.length === 3) gl.uniform3fv(l, value);
            else if (value.length === 4) gl.uniform4fv(l, value);
            else gl.uniform4fv(l, value);
        }

        /*
         * Draws every layer of the theme. `state` is the car state; each
         * layer turns it into uniforms itself.
         */
        function render(theme, state, time, panelH, bottomCut) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.disable(gl.DEPTH_TEST);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
                gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

            var layers = theme.layers.slice().sort(function (a, b) {
                return (a.z || 0) - (b.z || 0);
            });

            for (var i = 0; i < layers.length; i++) {
                var L = layers[i];
                if (L.when && !L.when(state)) continue;
                var prog = progs[L.shader];
                if (!prog) {
                    if (!warned[L.shader]) {
                        warned[L.shader] = 1;
                        if (opts.onWarn) opts.onWarn('no shader "' + L.shader + '"');
                    }
                    continue;
                }
                var u = L.uniforms ? L.uniforms(state, time) : null;
                /* A layer may decline to draw this frame. */
                if (u === null && L.uniforms) continue;

                gl.useProgram(prog);
                var R = L.rect ? L.rect(state) : L;
                gl.viewport(R.x, panelH - R.y - R.h, R.w, R.h);
                setUniform(L.shader, 'u_size', [R.w, R.h]);
                setUniform(L.shader, 'u_time', time);
                /* How much of the layer survives the bottom-strip cut. */
                var keep = bottomCut >= R.y + R.h ? 0 :
                    Math.max(0, (bottomCut - R.y) / R.h);
                setUniform(L.shader, 'u_keep', keep);

                if (atlasTex) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
                    var la = loc(L.shader, 'u_atlas');
                    if (la) gl.uniform1i(la, 0);
                    setUniform(L.shader, 'u_atlasSize', atlasSize);
                }
                for (var k in u) {
                    if (Object.prototype.hasOwnProperty.call(u, k)) setUniform(L.shader, k, u[k]);
                }
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }

        return { gl: gl, build: build, setAtlas: setAtlas, render: render };
    }

    return { create: create };
}));
