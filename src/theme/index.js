(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./lambo.js'), require('./track.js'));
    } else {
        root.MGUThemes = factory(root.MGUTheme, root.MGUTrack);
    }
}(typeof self !== 'undefined' ? self : this, function (Toro, Track) {
    'use strict';

    /*
     * The cluster's styles. settings.style picks one (not "theme": the app
     * kit keeps that name for its own screen theme and resets it); each builds the same
     * shape: { id, name, layers, settings, ... } (src/theme/lambo.js).
     */
    var THEMES = { toro: Toro, track: Track };

    function idOf(settings) {
        var t = settings && settings.style;
        return Object.prototype.hasOwnProperty.call(THEMES, t) ? t : 'toro';
    }

    function build(atlas, profileId, settings) {
        return THEMES[idOf(settings)].build(atlas, profileId, settings);
    }

    return { build: build, idOf: idOf, THEMES: THEMES };
}));
