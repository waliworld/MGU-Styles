(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./lambo.js'), require('./track.js'), require('./overlays.js'));
    } else {
        root.MGUThemes = factory(root.MGUTheme, root.MGUTrack, root.MGUOverlays);
    }
}(typeof self !== 'undefined' ? self : this, function (Toro, Track, Overlays) {
    'use strict';

    /*
     * The cluster's styles. settings.style picks one (not "theme": the app
     * kit keeps that name for its own screen theme and resets it); each builds the same
     * shape: { id, name, layers, settings, ... } (src/theme/lambo.js).
     */
    /* track: M Sport (the id it has always had in saved settings);
       mplus: M Sport Plus, the same style with the other middle */
    var THEMES = { toro: Toro, track: Track, mplus: Track.plus };

    function idOf(settings) {
        var t = settings && settings.style;
        return Object.prototype.hasOwnProperty.call(THEMES, t) ? t : 'toro';
    }

    function build(atlas, profileId, settings) {
        var theme = THEMES[idOf(settings)].build(atlas, profileId, settings);
        /* the holiday dressing and the start-up message, over either style */
        return Overlays.add(theme, atlas, theme.settings, theme.settings.colours);
    }

    return { build: build, idOf: idOf, THEMES: THEMES };
}));
