#!/usr/bin/env node
/*
 * Screenshots the preview. Used to look at the design without a car.
 *   node tools/shot.js out.png [query]
 * e.g. node tools/shot.js build/shot.png "t=9&freeze=1&strip=off"
 */
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png' };

/* fetch() will not read file:// URLs, so the preview is served. */
function serve() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]);
            const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
            fs.readFile(file, (err, buf) => {
                if (err) { res.writeHead(404); res.end('no'); return; }
                res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
                res.end(buf);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

(async () => {
    const out = process.argv[2] || 'build/shot.png';
    const query = process.argv[3] || 't=9&freeze=1';
    const srv = await serve();
    const url = 'http://127.0.0.1:' + srv.address().port + '/preview/index.html?' + query;

    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 720 }, deviceScaleFactor: 1 });
    const logs = [];
    page.on('console', m => logs.push(m.type() + ': ' + m.text()));
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 20000 })
        .catch(() => {});
    const err = await page.evaluate(() => window.__error);
    if (err) { console.error('PAGE ERROR:\n' + err); }
    const state = await page.evaluate(() => window.__state && {
        rpm: Math.round(window.__state.rpm), speed: Math.round(window.__state.speed),
        gear: window.__state.gear, boost: +window.__state.boostPsi.toFixed(1)
    });
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 720 } });
    if (logs.length) console.log(logs.join('\n'));
    console.log('state:', JSON.stringify(state));
    console.log('wrote', out);
    await browser.close();
    srv.close();
    if (err) process.exit(1);
})();
