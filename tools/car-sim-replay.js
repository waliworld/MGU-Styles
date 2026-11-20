#!/usr/bin/env node
'use strict';
/*
 * Draws what tools/car-sim.js captured on the renderer's socket, in a real
 * WebGL 1 (GLSL ES 1.00) context: each layer the app sent, with the exact
 * shader, uniforms, rectangle and z-order the KOMBI would get.
 *
 *   node tools/car-sim-replay.js     -> build/car-sim/*.png, fails if any shader
 *                                       does not compile or link
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'car-sim');
const { VERT } = require('../src/shaders/prelude.js');

function page(snap, atlasB64) {
    return `<!doctype html><body style="margin:0;background:#000">
<canvas id=c width=1920 height=720></canvas><script>
const snap = ${JSON.stringify(snap)}, VERT = ${JSON.stringify(VERT)};
const atlas = Uint8Array.from(atob(${JSON.stringify(atlasB64)}), (c) => c.charCodeAt(0));
const gl = document.getElementById('c').getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
const errors = [];
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1024, 1024, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, atlas);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
function sh(type, src, name) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) errors.push(name + ': ' + gl.getShaderInfoLog(s));
  return s;
}
const layers = snap.layers.slice().sort((a, b) => (a.msg.z - b.msg.z) || (a.ref - b.ref));
for (const l of layers) {
  const m = l.msg, name = m.class + '#' + l.ref;
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT, name + ' vs'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, m.fs, name));
  gl.bindAttribLocation(p, 0, 'a_position'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { errors.push(name + ' link: ' + gl.getProgramInfoLog(p)); continue; }
  if (!l.visible) continue;
  gl.useProgram(p);
  gl.viewport(m.x, 720 - m.y - m.h, m.w, m.h);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const id = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const ul = (n) => gl.getUniformLocation(p, n);
  if (ul('u_mvp')) gl.uniformMatrix4fv(ul('u_mvp'), false, new Float32Array([2,0,0,0, 0,2,0,0, 0,0,1,0, -1,-1,0,1]));
  if (ul('u_time')) gl.uniform1f(ul('u_time'), snap.t / 1000);
  for (const [n, v] of Object.entries(l.uniforms)) {
    const arr = ul(n + '[0]'), loc = arr || ul(n);
    if (!loc) continue;
    const info = (() => { const c = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < c; i++) { const u = gl.getActiveUniform(p, i); if (u.name.replace('[0]','') === n) return u; } })();
    const f = new Float32Array(v);
    switch (info && info.type) {
      case gl.FLOAT: gl.uniform1fv(loc, f); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(loc, f); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(loc, f); break;
      default: gl.uniform4fv(loc, f);
    }
  }
  if (l.binds.u_atlas) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(ul('u_atlas'), 0); }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
window.__done = { errors, drawn: layers.filter((l) => l.visible).length };
</script>`;
}

(async () => {
    const snaps = JSON.parse(fs.readFileSync(path.join(OUT, 'snapshots.json'), 'utf8'));
    const atlas = fs.readFileSync(path.join(OUT, 'atlas.r8')).toString('base64');
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
    let failed = 0;
    for (const s of snaps.filter((x) => x.layers.length)) {
        const pg = await browser.newPage({ viewport: { width: 1920, height: 720 } });
        await pg.setContent(page(s, atlas));
        await pg.waitForFunction(() => window.__done, null, { timeout: 60000 });
        const r = await pg.evaluate(() => window.__done);
        const file = 'car-' + s.t + '.png';
        await pg.locator('canvas').screenshot({ path: path.join(OUT, file) });
        console.log((s.t / 1000).toFixed(1) + ' s  ' + s.what.padEnd(28) + r.drawn + ' layers drawn -> ' + file +
            (r.errors.length ? '  ' + r.errors.length + ' SHADER ERRORS' : ''));
        r.errors.slice(0, 5).forEach((e) => console.log('   ' + e));
        failed += r.errors.length;
        await pg.close();
    }
    await browser.close();
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
