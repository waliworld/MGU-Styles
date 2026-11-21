(function (root) {
    'use strict';
    /*
     * Preview-only stand-ins for what other apps put under the Track theme's
     * window, drawn where they land on the car: BMW's map window, panel
     * (416,120 1088x480). Demonstration content, not a real source.
     *   1 a night map (roads, water, a route)
     *   2 a camera test grid with contrast markers (TBW brief section 5)
     *   3 flat magenta (the brief's first hardware check)
     */
    var fixture = [
        'uniform float u_kind;',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }',
        'float line(vec2 p, vec2 a, vec2 b, float w) { return 1.0 - smoothstep(w - 0.8, w + 0.8, sdSegment(p, a, b, 0.0)); }',
        'void main() {',
        '  vec2 p = px();',
        '  vec2 n = p / u_size;',
        '  vec3 col;',
        '  if (u_kind > 2.5) { col = vec3(1.0, 0.0, 1.0); }',
        '  else if (u_kind > 1.5) {',
        '    vec2 g = mod(p, 64.0);',
        '    float grid = step(min(g.x, g.y), 1.5);',
        '    vec2 cell = floor(p / 64.0);',
        '    float chk = mod(cell.x + cell.y, 2.0);',
        '    col = mix(vec3(0.20), vec3(0.32), chk);',
        '    col = mix(col, vec3(0.95), grid);',
        '    float cx = 1.0 - step(2.0, min(abs(p.x - u_size.x * 0.5), abs(p.y - u_size.y * 0.5)));',
        '    col = mix(col, vec3(1.0, 0.1, 0.1), cx);',
        '  } else {',
        '    col = vec3(0.05, 0.16, 0.32) + vec3(0.0, 0.05, 0.10) * n.y;',
        '    float water = smoothstep(0.02, 0.0, length((p - vec2(300.0, 210.0)) / vec2(220.0, 60.0)) - 1.0);',
        '    col = mix(col, vec3(0.10, 0.42, 0.62), water * 0.8);',
        '    vec2 b = mod(p, vec2(46.0, 38.0));',
        '    float streets = step(min(b.x, b.y), 1.2) * step(0.45, hash(floor(p / vec2(46.0, 38.0))));',
        '    col = mix(col, vec3(0.55, 0.68, 0.82), streets * 0.55);',
        '    float road = line(p, vec2(0.0, 150.0), vec2(u_size.x, 250.0), 2.5);',
        '    road = max(road, line(p, vec2(560.0, 0.0), vec2(520.0, u_size.y), 2.0));',
        '    col = mix(col, vec3(0.85, 0.90, 0.95), road);',
        '    float route = line(p, vec2(540.0, u_size.y), vec2(552.0, 0.0), 5.0);',
        '    col = mix(col, vec3(0.92, 0.95, 1.0), route);',
        '    float car = 1.0 - smoothstep(6.0, 8.0, length(p - vec2(541.0, 380.0)));',
        '    col = mix(col, vec3(0.95, 0.20, 0.25), car);',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');
    root.MGUShadersFixture = { fixture: fixture };
    root.MGUFixtureLayer = function (kind) {
        return { id: 'fixture', z: -1, shader: 'fixture', x: 416, y: 120, w: 1088, h: 480,
                 uniforms: function () { return { u_kind: kind }; } };
    };
    /* sample maneuvers, as Turn View's tool reports them */
    root.MGUSampleTurns = {
        left: { kind: 'intersection', angle: 90, side: -1, exit: 0, text: '0.3 mi' },
        right: { kind: 'intersection', angle: 90, side: 1, exit: 0, text: '500 ft' },
        bear: { kind: 'intersection', angle: 30, side: 1, exit: 0, text: '1.2 mi' },
        sharp: { kind: 'intersection', angle: 135, side: -1, exit: 0, text: '200 ft' },
        uturn: { kind: 'intersection', angle: 180, side: -1, exit: 0, text: '0.1 mi' },
        roundabout: { kind: 'roundabout', angle: 90, side: 1, exit: 2, text: '0.4 mi' },
        keep: { kind: 'branch', angle: 30, side: -1, exit: 0, text: '2 mi' },
        straight: { kind: 'intersection', angle: 0, side: 1, exit: 0, text: '3 mi' },
        dest: { kind: 'destination', angle: 0, side: 1, exit: 0, text: '0.2 mi' }
    };
}(typeof self !== 'undefined' ? self : this));
