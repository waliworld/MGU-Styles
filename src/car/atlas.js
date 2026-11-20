'use strict';
/*
 * The glyph atlas the cluster's text is drawn from.
 *
 * In the repository it is read from assets/fonts. The app package has no
 * assets folder - the kit's builder ships only top-level .js files - so
 * tools/stage-app.js puts app/atlas.staged.js in this file's place, which
 * reads the same bytes from atlas_data.js. Node 8.
 */
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

function load() {
    var dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    return {
        meta: JSON.parse(fs.readFileSync(path.join(dir, 'atlas.json'), 'utf8')),
        pixels: zlib.gunzipSync(fs.readFileSync(path.join(dir, 'atlas.r8.gz')))
    };
}

module.exports = { load: load };
