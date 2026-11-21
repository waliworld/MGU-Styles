'use strict';
/*
 * The start-up message's own words.
 *
 * iDrive's settings can offer choices but not a keyboard, so anyone's own
 * words come from a small text file: `mgu-styles-message.txt` at the top of
 * a USB stick (any stick the head unit has mounted). The first time it is
 * seen it is copied into the app's data folder, so the stick can go back in
 * the drawer and the words stay.
 *
 * Plain text, one or two short lines, at most 90 characters used. Letters,
 * figures and . , ' ! ? & - : + show; anything else is left out.
 *
 * Node 8. Never throws: no file just means the default words.
 */

var fs = require('fs');
var path = require('path');

var NAME = 'mgu-styles-message.txt';
var KEPT = 'startup-message.txt';
var ROOTS = ['/media', '/run/media', '/mnt', '/media/usb'];
var MAX_BYTES = 2048;

function readText(file) {
    try {
        var st = fs.statSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) return null;
        var txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\s+/g, ' ').trim();
        return txt ? txt.slice(0, 120) : null;
    } catch (e) { return null; }
}

/* A stick's top folder, one or two levels under each root (/media/usb0,
   /run/media/<user>/<label>). */
function onSticks(roots) {
    var i, j, k;
    for (i = 0; i < roots.length; i++) {
        var t = readText(path.join(roots[i], NAME));
        if (t) return t;
        var a = [];
        try { a = fs.readdirSync(roots[i]); } catch (e) { continue; }
        for (j = 0; j < a.length && j < 32; j++) {
            var d1 = path.join(roots[i], a[j]);
            t = readText(path.join(d1, NAME));
            if (t) return t;
            var b = [];
            try { b = fs.readdirSync(d1); } catch (e) { continue; }
            for (k = 0; k < b.length && k < 32; k++) {
                t = readText(path.join(d1, b[k], NAME));
                if (t) return t;
            }
        }
    }
    return null;
}

/* opts: { dataDir, roots, log }. Returns the words, or null. */
function load(opts) {
    opts = opts || {};
    var log = opts.log || { info: function () {}, warn: function () {} };
    var kept = opts.dataDir ? path.join(opts.dataDir, KEPT) : null;
    var fresh = onSticks(opts.roots || ROOTS);
    if (fresh && kept) {
        var old = readText(kept);
        if (old !== fresh) {
            try {
                fs.writeFileSync(kept + '.tmp', fresh, { mode: 420 });
                fs.renameSync(kept + '.tmp', kept);
                log.info('message: new start-up words from USB');
            } catch (e) { log.warn('message: could not keep the words: ' + e); }
        }
    }
    return fresh || (kept ? readText(kept) : null);
}

module.exports = { load: load, NAME: NAME, KEPT: KEPT, ROOTS: ROOTS };
