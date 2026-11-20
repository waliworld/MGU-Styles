'use strict';
/*
 * The glyph atlas, in the app package: the same bytes as assets/fonts,
 * embedded in atlas_data.js by tools/stage-app.js. Stands in for
 * src/car/atlas.js. Node 8.
 */
var zlib = require('zlib');
var data = require('./atlas_data.js');

function load() {
    return { meta: data.meta, pixels: zlib.gunzipSync(Buffer.from(data.r8gz, 'base64')) };
}

module.exports = { load: load };
