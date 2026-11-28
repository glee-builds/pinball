// Smoke test: play the game in headless Chromium and fail on any page error.
// Not named *.test.js on purpose, so `node --test "test/*.test.js"` skips it.
// Run: node test/smoke.mjs   (needs Playwright; CI installs it with --no-save)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(root, 'playwright'));
}
const { chromium } = loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.resolve(here, '..', 'index.html')).href;
const RUN_MS = 20000;
const errors = [];

function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(12345);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  // Fonts are external; abort them up front so a blocked network adds no noise.
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (r) => r.abort());
  const page = await context.newPage();
  await page.addInitScript(() => { window.__before = new Set(Object.getOwnPropertyNames(window)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message || e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location().url || '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(loc)) return;
    errors.push('console.error: ' + m.text() + (loc ? ' (' + loc + ')' : ''));
  });

  await page.goto(url);
  await sleep(500);
  await page.click('#go');

  const box = await page.locator('#pad').boundingBox();
  const scores = new Set();
  const end = Date.now() + RUN_MS;
  while (Date.now() < end) {
    if (await page.locator('#card').isVisible()) {
      await page.click('#go');
      await sleep(100);
      continue;
    }
    const left = rand() < 0.5;
    const x = box.x + box.width * (left ? 0.25 : 0.75);
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (await page.locator('#hint').isVisible()) await sleep(600);
    else await sleep(40 + rand() * 120);
    await page.mouse.up();
    scores.add(await page.locator('#score').innerText());
    await sleep(30 + rand() * 120);
  }

  if (!(scores.size > 1 || (scores.size === 1 && !scores.has('0')))) {
    errors.push('assertion: #score never changed from "0"');
  }

  const colors = await page.evaluate(() => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const seen = new Set();
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
      const d = ctx.getImageData(Math.floor((i + 0.5) * c.width / 40), Math.floor((j + 0.5) * c.height / 40), 1, 1).data;
      seen.add(d.join(','));
    }
    return seen.size;
  });
  if (colors <= 10) errors.push(`assertion: canvas looks blank (${colors} distinct colors, need > 10)`);

  const extra = await page.evaluate(() =>
    Object.getOwnPropertyNames(window).filter((k) => k !== '__before' && !window.__before.has(k)));
  if (extra.length !== 1 || extra[0] !== 'makeSim') {
    errors.push('assertion: new globals should be exactly [makeSim], got [' + extra.join(', ') + ']');
  }
  console.log(`scores seen: ${[...scores].join(',')}; distinct colors: ${colors}; new globals: ${extra.join(',')}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error('SMOKE TEST FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke test passed');
