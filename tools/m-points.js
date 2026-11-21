#!/usr/bin/env node
/*
 * The M style's control points: where its lines turn, end and meet, in the
 * reference frame's own coordinates (docs/ref/m-view-reference.jpg,
 * 1726 x 612). Every one is worked out from src/theme/mgeom.js - the
 * numbers the shaders draw from - so this list cannot drift from the
 * render.
 *
 *   node tools/m-points.js            a Markdown table (docs/ref/MEASUREMENTS.md)
 *   node tools/m-points.js --json     for tools/m-compare.py, which marks them
 *                                     on the overlay and measures how far each
 *                                     is from an edge of the photograph
 *
 * kind: 'edge'   the point lies on a visible edge;
 *       'line'   on the centre of a fine stroke (edges half its width away);
 *       'anchor' a place something is set from (not itself on an edge).
 */
'use strict';
const M = require('../src/theme/mgeom.js');
const Track = require('../src/theme/track.js');

const D = M.DIAL, pts = [];
const add = (group, id, x, y, kind, what) => pts.push({ group, id, x: +x.toFixed(1), y: +y.toFixed(1), kind, what });
const mx = (x) => M.mirror(x);

/* ---- the two dials: the left as traced, the right its mirror ---- */
function dial(side, tag, name) {
    const X = (x) => (side ? mx(x) : x);
    const rimI = { up: M.shift(D.rimUp, D.rimWUp), low: M.shift(D.rimLow, D.rimWLow) };
    /* straight stretches, sampled away from the shoulder's radius */
    for (const y of [90, 150, 205]) {
        add(name, `${tag}.rimO.up${y}`, X(M.at(D.rimUp, y)), y, 'edge', 'rim, outer edge, upper limb');
        add(name, `${tag}.rimI.up${y}`, X(M.at(rimI.up, y)), y, 'edge', 'rim, inner edge, upper limb');
        add(name, `${tag}.con.up${y}`, X(M.at(D.conUp, y)), y, 'line', 'fine contour, upper limb');
    }
    for (const y of [300, 380, 460]) {
        add(name, `${tag}.rimO.low${y}`, X(M.at(D.rimLow, y)), y, 'edge', 'rim, outer edge, lower limb');
        add(name, `${tag}.con.low${y}`, X(M.at(D.conLow, y)), y, 'line', 'fine contour, lower limb');
    }
    const e = M.cross(D.rimUp, D.rimLow), c = M.cross(D.conUp, D.conLow);
    /* the shoulder is rounded: its apex stands in from the sharp corner */
    const apex = (v, up, low, r) => {
        const a = Math.atan(1 / Math.abs(up[0])) + Math.atan(1 / low[0]);     /* the corner's own angle */
        return v[0] + r * (1 / Math.sin(a / 2) - 1);
    };
    add(name, `${tag}.rimO.elbow`, X(apex(e, D.rimUp, D.rimLow, D.rimR)), e[1], 'edge', 'rim, outer edge, the shoulder\'s apex');
    add(name, `${tag}.con.elbow`, X(apex(c, D.conUp, D.conLow, D.conR)), c[1], 'line', 'fine contour, the shoulder\'s apex');
    add(name, `${tag}.top.end`, X(D.topX1), (D.topY0 + D.topY1) / 2, 'line', 'the level top line, its inner end');
    add(name, `${tag}.top.mid`, X(480), (D.topY0 + D.topY1) / 2, 'line', 'the level top line');
    for (let k = 1; k <= 8; k++) {
        const y = M.tickY(k), xi = Math.max(M.at(rimI.up, y), M.at(rimI.low, y));
        add(name, `${tag}.tick${k}`, X(xi + D.tickIn + D.tickLen / 2), y, 'line', `scale tick ${k}`);
    }
    add(name, `${tag}.tab.step`, X(D.tabStep[0]), D.tabTop, 'edge', 'the base tab, where it steps down to the rail');
    add(name, `${tag}.rail.top`, X(600), D.railTop, 'edge', 'the lower rail, top edge');
    add(name, `${tag}.rail.bottom`, X(600), D.railBottom, 'edge', 'the lower rail, bottom edge');
}
dial(0, 'L', 'speed dial');
dial(1, 'R', 'rev dial');

/* ---- the scale numerals: where each one's ink meets the rail side ---- */
for (let k = 0; k <= 8; k++) {
    add('speed numerals', `L.num${k}`, Track.SPEED_EDGE[k], M.tickY(k), 'anchor',
        `"${M.SPEED_SCALE.metric[k]}": right end of its ink, level with tick ${k}`);
    add('rev numerals', `R.num${k}`, Track.REV_EDGE[k], M.tickY(k), 'anchor', `"${k}": left end of its ink, level with tick ${k}`);
}

/* ---- the centre lines ---- */
const G = M.DIAG;
add('centre lines', 'C.cyan.top', G.cyan.p0[0], G.cyan.p0[1], 'line', 'cyan stroke, upper end');
add('centre lines', 'C.cyan.mid', (G.cyan.p0[0] + G.cyan.p1[0]) / 2, (G.cyan.p0[1] + G.cyan.p1[1]) / 2, 'line', 'cyan stroke, half-way');
add('centre lines', 'C.cyan.elbow', G.cyan.p1[0], G.cyan.p1[1], 'line', 'cyan stroke, the elbow');
add('centre lines', 'C.cyan.foot', G.cyan.p2[0], G.cyan.p2[1], 'line', 'cyan stroke, where it lands on the blue rail');
add('centre lines', 'C.red.top', G.red.p0[0], G.red.p0[1], 'line', 'red stroke, upper end');
add('centre lines', 'C.red.mid', (G.red.p0[0] + G.red.p1[0]) / 2, (G.red.p0[1] + G.red.p1[1]) / 2, 'line', 'red stroke, half-way');
add('centre lines', 'C.red.foot', G.red.p1[0], G.red.p1[1], 'line', 'red stroke, where it lands on the red rail');

/* ---- the plates: each corner (a rounded one at its arc's apex) ---- */
for (const [id, P] of Object.entries(M.PLATES)) {
    const k = P.v.length;
    P.v.forEach((b, i) => {
        const a = P.v[(i + k - 1) % k], c = P.v[(i + 1) % k];
        const u = [a[0] - b[0], a[1] - b[1]], w = [c[0] - b[0], c[1] - b[1]];
        const lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
        const bis = [u[0] / lu + w[0] / lw, u[1] / lu + w[1] / lw], lb = Math.hypot(bis[0], bis[1]);
        const half = Math.acos((u[0] * w[0] + u[1] * w[1]) / (lu * lw)) / 2;
        const inset = P.r[i] * (1 / Math.sin(half) - 1);
        add('plates', `P.${id}.${i}`, b[0] + bis[0] / lb * inset, b[1] + bis[1] / lb * inset, 'edge',
            `plate ${id}, corner ${i}` + (P.r[i] ? ` (radius ${P.r[i]}, at the arc)` : ''));
    });
}
M.HAIRLINES.forEach((h, i) => {
    add('plates', `P.hair${i}.a`, h[0], h[1], 'anchor', `hairline ${i}, one end`);
    add('plates', `P.hair${i}.b`, h[2], h[3], 'anchor', `hairline ${i}, the other`);
});

/* ---- fuel (left) and oil (right, its mirror) ---- */
const S = M.STRIP;
function strip(side, tag, name) {
    const X = (x) => (side ? mx(x) : x);
    for (const y of [S.top + 8, (S.top + S.bottom) / 2, S.bottom - 8]) {
        add(name, `${tag}.line${Math.round(y)}`, X(M.at(S.line, y) + S.lineW / 2), y, 'line', 'the fine line');
        add(name, `${tag}.segL${Math.round(y)}`, X(M.at(S.seg, y)), y, 'edge', 'segments, the edge by the line');
        add(name, `${tag}.segR${Math.round(y)}`, X(M.at(S.seg, y) + S.segW), y, 'edge', 'segments, the far edge');
    }
    S.cuts.forEach((y, i) => add(name, `${tag}.cut${i}`, X(M.at(S.seg, y) + S.segW / 2), y, 'line', `the cut between segments ${i} and ${i + 1}`));
    add(name, `${tag}.top`, X(M.at(S.seg, S.top) + S.segW / 2), S.top, 'edge', 'top of the strip');
    add(name, `${tag}.bottom`, X(M.at(S.seg, S.bottom) + S.segW / 2), S.bottom, 'edge', 'foot of the strip');
}
strip(0, 'F', 'fuel strip');
strip(1, 'O', 'oil strip');

/* ---- the footer ---- */
const F = M.FOOT, fp = F.panel, fh = fp.bottom - fp.top;
add('footer', 'T.panel.tl', fp.left, fp.top, 'edge', 'four-pane panel, top left');
add('footer', 'T.panel.tr', fp.right, fp.top, 'edge', 'four-pane panel, top right');
add('footer', 'T.panel.bl', fp.left + fh * fp.leanL, fp.bottom, 'edge', 'four-pane panel, bottom left');
add('footer', 'T.panel.br', fp.right + fh * fp.leanR, fp.bottom, 'edge', 'four-pane panel, bottom right');
F.seps.forEach((s, i) => {
    add('footer', `T.sep${i}.top`, s[0], fp.top, 'line', `pane separator ${i}, top`);
    add('footer', `T.sep${i}.bottom`, s[1], fp.bottom, 'line', `pane separator ${i}, bottom`);
});
for (const [n, dx, dy] of [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]) {
    add('footer', `T.limit.${n}`, F.limit.x + dx * F.limit.r, F.limit.y + dy * F.limit.r, 'edge', 'LIMIT disc, its rim');
}
add('footer', 'T.limit.c', F.limit.x, F.limit.y, 'anchor', 'LIMIT disc, centre');
add('footer', 'T.glow.L', F.glow.x0 + 40, F.glow.top, 'edge', 'the glow under the blue rail, its level top');
add('footer', 'T.glow.R', mx(F.glow.x0 + 40), F.glow.top, 'edge', 'the glow under the red rail, its level top');

/* ---- the readouts ---- */
add('readouts', 'N.speed', 603.0, 295.0, 'anchor', 'speed: right end of its ink, on the baseline');
add('readouts', 'N.speed2', 607.2, 364.3, 'anchor', 'second speed: right end of its ink, on the baseline');
add('readouts', 'N.gear', 1308.8, 294.4, 'anchor', 'gear: its middle, on the baseline');
add('readouts', 'N.clock', 130.0, 585.0, 'anchor', 'clock: left end of its ink, on the baseline');
add('readouts', 'N.range', 382.0, 583.8, 'anchor', 'range: left end of its ink, on the baseline');
add('readouts', 'N.ambient', 1674.3, 586.6, 'anchor', 'outside temperature: right end of its ink, on the baseline');
add('readouts', 'N.4wd', 911.0, 568.2, 'anchor', '"4WD": left end of its ink, on the baseline');

if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(pts));
} else {
    const groups = [...new Set(pts.map((p) => p.group))];
    console.log(`${pts.length} control points (${pts.filter((p) => p.kind !== 'anchor').length} on an edge or a stroke).\n`);
    for (const g of groups) {
        console.log(`**${g}**\n`);
        console.log('| point | x | y | kind | what |');
        console.log('|---|---:|---:|---|---|');
        for (const p of pts.filter((q) => q.group === g)) console.log(`| \`${p.id}\` | ${p.x} | ${p.y} | ${p.kind} | ${p.what} |`);
        console.log('');
    }
}
