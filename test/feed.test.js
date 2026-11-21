'use strict';
/* The BeeM-Flash feed: what it reads, what it refuses, and the dial it drives. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Feed = require('../src/car/feed.js');
const State = require('../src/engine/state.js');
const Panel = require('../src/geometry/panel.js');

function tmpFile() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'feed-')), 'cluster.json');
}
const sample = (ch) => JSON.stringify({ t: Date.now(), units: 'metric', channels: ch });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a good sample is read and its channels offered', async (t) => {
    const f = tmpFile();
    fs.writeFileSync(f, sample([{ key: 'oilPressure', value: 4.2, unit: 'bar' },
                                { key: 'timing', value: 11.5 }]));
    const feed = Feed.create({ path: f });
    t.after(() => feed.stop());
    feed.start();
    assert.ok(feed.live());
    assert.strictEqual(feed.value('oilPressure'), 4.2);
    assert.strictEqual(feed.value('timing'), 11.5);
    assert.strictEqual(feed.value('nothing'), undefined);
    assert.match(feed.info(), /2 channels/);
});

test('a stale, truncated, empty or missing file means no feed', async (t) => {
    const f = tmpFile();
    /* stale: the mtime is old */
    fs.writeFileSync(f, sample([{ key: 'oilPressure', value: 4.2 }]));
    const old = Date.now() / 1000 - 60;
    fs.utimesSync(f, old, old);
    let feed = Feed.create({ path: f });
    feed.start(); feed.stop();
    assert.strictEqual(feed.live(), false, 'stale');

    for (const bad of ['{"channels":[{"key":"oilPres', '', '{}', '{"channels":"no"}',
                       '{"channels":[{"key":"x","value":"NaN"}]}']) {
        fs.writeFileSync(f, bad);
        feed = Feed.create({ path: f });
        feed.start(); feed.stop();
        assert.strictEqual(feed.value('x'), undefined, JSON.stringify(bad));
    }
    feed = Feed.create({ path: path.join(os.tmpdir(), 'feed-none', 'cluster.json') });
    feed.start(); feed.stop();
    assert.strictEqual(feed.live(), false, 'missing');
    assert.match(feed.info(), /not running/);
});

test('a reading that stops being written goes stale and is dropped', async (t) => {
    const f = tmpFile();
    let clock = 1e12;
    fs.writeFileSync(f, JSON.stringify({ t: clock, channels: [{ key: 'oilPressure', value: 4.2 }] }));
    const feed = Feed.create({ path: f, now: () => clock });
    t.after(() => feed.stop());
    feed.start();
    assert.strictEqual(feed.value('oilPressure'), 4.2);
    clock += Feed.STALE_MS + 10;
    assert.strictEqual(feed.live(), false);
    assert.strictEqual(feed.value('oilPressure'), undefined);
});

test('the second left dial follows whichever pressure it has', () => {
    const p = Panel.profile('x3m40i');
    const turbo = State.present({ boostBar: 1.2 }, p, {});
    assert.strictEqual(turbo.auxIsOil, false);
    assert.strictEqual(turbo.pods.auxPress.text, (1.2 * 14.503774).toFixed(1));

    const oil = State.present({ boostBar: 1.2, oilPressBar: 4.2 }, p, {});
    assert.strictEqual(oil.auxIsOil, true);
    assert.strictEqual(oil.pods.auxPress.text, String(Math.round(4.2 * 14.503774)));
    assert.ok(oil.pods.auxPress.frac > 0.5 && oil.pods.auxPress.frac < 0.55);
});

test('the dial label switches with it, and only one is ever shown', () => {
    const Themes = require('../src/theme/index.js');
    const atlas = require('../assets/fonts/atlas.json');
    const th = Themes.build(atlas, 'x3m40i', {});
    const main = th.layers.find((L) => L.id === 'lbl_auxPress');
    const alt = th.layers.find((L) => L.id === 'lbl_auxPress_alt');
    assert.ok(main && alt, 'both labels exist');
    const p = Panel.profile('x3m40i');
    const turbo = State.present({ boostBar: 1 }, p, th.settings);
    const oil = State.present({ boostBar: 1, oilPressBar: 4 }, p, th.settings);
    assert.ok(main.uniforms(turbo) !== null && alt.uniforms(turbo) === null, 'turbo');
    assert.ok(main.uniforms(oil) === null && alt.uniforms(oil) !== null, 'oil');
});
