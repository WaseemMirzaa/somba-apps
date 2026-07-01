// Screenshot harness: serves the built Flutter web app and captures each
// screen one-by-one in a phone viewport using coordinate-based taps.
//
// Usage: node tool/shots.mjs <buildWebDir> <outDir> <label>
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import http from 'http';
import fs from 'fs';
import path from 'path';

const [buildDir, outDir, label = 'after'] = process.argv.slice(2);
if (!buildDir || !outDir) {
  console.error('usage: node shots.mjs <buildWebDir> <outDir> <label>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
  '.map': 'application/json', '.bin': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(buildDir, url);
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(buildDir, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const W = 412, H = 892;

// Bottom NavigationBar destination centers (4 tabs) + product-detail app bar
const nav = (i) => ({ x: (W / 8) * (2 * i + 1), y: H - 38 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;
  console.log('serving on', base);

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  // The CDN (gstatic) is blocked in this environment; serve CanvasKit from the
  // locally-bundled copy inside build/web/canvaskit instead.
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const m = url.match(/flutter-canvaskit\/[^/]+\/(.*)$/);
    if (m) {
      const local = path.join(buildDir, 'canvaskit', m[1]);
      if (fs.existsSync(local)) {
        const ct = url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
        return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(local) });
      }
    }
    return route.continue();
  });

  async function ready() {
    // Poll until Flutter has painted a real frame into a canvas.
    for (let i = 0; i < 60; i++) {
      const ok = await page.evaluate(() => {
        const c = document.querySelector('flt-scene-host canvas, flutter-view canvas, canvas');
        return !!c && c.width > 0 && c.height > 0;
      });
      if (ok) break;
      await wait(500);
    }
    await wait(3500);
  }

  async function reload() {
    await page.goto(base, { waitUntil: 'load' });
    await ready();
  }

  async function shot(name) {
    await wait(1800); // let network images settle
    const p = path.join(outDir, `${label}-${name}.png`);
    await page.screenshot({ path: p });
    console.log('captured', p);
  }

  async function tap(x, y) {
    await page.mouse.click(x, y);
    await wait(1600);
  }

  // ---- Flow 1: Home + product detail ----
  await reload();
  await shot('01-home');
  await page.mouse.wheel(0, 560); await wait(1300);
  await shot('02-home-scrolled');
  await tap(100, 655);                // tap first product card image
  await shot('03-product-detail');

  // ---- Flow 2: Cart + checkout ----
  await reload();
  await tap(374, 32);                 // header cart bag icon
  await shot('04-cart');
  await tap(W / 2, H - 52);           // checkout button in summary bar
  await shot('05-checkout');

  // ---- Flow 3: Categories / Deals / Account / Orders ----
  await reload();
  await tap(nav(1).x, nav(1).y);
  await shot('06-categories');
  await tap(nav(2).x, nav(2).y);
  await shot('07-deals');
  await tap(nav(3).x, nav(3).y);
  await shot('08-account');
  await tap(W / 2, 264);              // "My Orders" row on account
  await shot('09-orders');

  await browser.close();
  server.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
