/* Desktop test loop: serve the app, open it at exactly 1920x1080, drive it with
   synthetic remote keys, assert the layout did not collapse, and screenshot.
   Catches ~everything except real remote quirks. Run: node tools/smoke.mjs

   Runs against tests/fixtures/forecast.json by default, so the suite is
   deterministic and needs no network — CI must never depend on a live third
   party. LIVE=1 hits the real Open-Meteo API instead (worth doing by hand when
   the API contract may have changed). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'shots');
const CHROME = process.env.CHROME_PATH || undefined;
const LIVE = !!process.env.LIVE;
const FIXTURE = LIVE ? null
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/forecast.json'), 'utf8'));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nope');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

/* One route handler for the whole run: serve the fixture, pass through in LIVE
   mode, or abort once the offline phase flips killNetwork. */
let killNetwork = false;
await page.route('**api.open-meteo.com/**', (route) => {
  if (killNetwork) return route.abort();
  if (FIXTURE) {
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE)
    });
  }
  return route.continue();
});

const problems = [];
/* The last phase deliberately kills the network, so failures there are expected. */
let offlinePhase = false;
const ignorable = (t) => offlinePhase || /favicon/.test(t);
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !ignorable(m.text() + m.location().url)) {
    problems.push(`console.${m.type()}: ${m.text()}`);
  }
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  if (!ignorable(r.url())) problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
});

/* Synthetic keydown with a forced keyCode — synthetic events default it to 0,
   which is exactly the bug that makes "it works with a real remote only". */
const key = (code) => page.evaluate((c) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => c });
  Object.defineProperty(e, 'which', { get: () => c });
  document.dispatchEvent(e);
}, code);

const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.CPHWX && window.CPHWX.state.model, null, { timeout: 25000 });
await page.waitForTimeout(400);
await shot('01-today');

/* ---- layout assertions ---- */
const m = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) };
  };
  const strip = document.getElementById('hourly-strip');
  return {
    doc: { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight },
    app: box('#app'), hero: box('#hero'), stats: box('#stats'), footer: box('#ftr'),
    counts: {
      stats: document.querySelectorAll('.stat').length,
      hours: document.querySelectorAll('.hour').length,
      days: document.querySelectorAll('.day').length,
      icons: document.querySelectorAll('#hourly-strip use, #daily-row use').length
    },
    tile: box('.stat'), hour: box('.hour'), day: box('.day'),
    stripScroll: strip.scrollWidth,
    /* one-line checks: a wrap here silently blows the fixed 330px hero height */
    condLines: Math.round(document.getElementById('hero-cond').offsetHeight /
               parseFloat(getComputedStyle(document.getElementById('hero-cond')).fontSize) * 10) / 10,
    rangeW: Math.round(document.getElementById('hero-range').scrollWidth),
    heroMainW: Math.round(document.getElementById('hero-main').offsetWidth),
    subClipped: [].slice.call(document.querySelectorAll('.stat-sub, .stat-k, .stat-v'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.className + ':' + el.textContent),
    heroTemp: document.getElementById('hero-temp').textContent.trim(),
    cond: document.getElementById('hero-cond').textContent.trim(),
    status: document.getElementById('status').textContent.trim(),
    clock: document.getElementById('clock').textContent.trim(),
    stampSize: parseFloat(getComputedStyle(document.getElementById('build-stamp')).fontSize)
  };
});

const check = (ok, label) => { if (!ok) problems.push(`ASSERT ${label}`); };
check(m.doc.sw <= 1920, `no horizontal overflow (scrollWidth=${m.doc.sw})`);
check(m.doc.sh <= 1080, `no vertical overflow (scrollHeight=${m.doc.sh})`);
check(m.app.h === 1080, `#app is 1080 tall (got ${m.app.h})`);
check(m.footer.bottom <= 1080, `footer inside the screen (bottom=${m.footer.bottom})`);
check(m.counts.stats === 6, `6 stat tiles (got ${m.counts.stats})`);
check(m.counts.hours === 24, `24 hour cells (got ${m.counts.hours})`);
check(m.counts.days === 7, `7 day cards (got ${m.counts.days})`);
check(m.tile.h > 100, `stat tiles did not collapse (h=${m.tile.h})`);
check(m.hour.h > 150, `hour cells did not collapse (h=${m.hour.h})`);
check(m.day.h > 180, `day cards did not collapse (h=${m.day.h})`);
check(m.stripScroll > 1920, `hourly strip is scrollable (scrollWidth=${m.stripScroll})`);
check(/^-?\d+°[CF]$/.test(m.heroTemp), `hero temperature rendered ("${m.heroTemp}")`);
check(/^\d{2}:\d{2}$/.test(m.clock), `clock rendered ("${m.clock}")`);
check(/^Updated \d{2}:\d{2}$/.test(m.status), `status rendered ("${m.status}")`);
check(m.condLines < 1.4, `hero condition stays on one line (ratio=${m.condLines})`);
check(m.rangeW <= m.heroMainW - 220, `hero subtitle fits (${m.rangeW}px in ${m.heroMainW - 220}px)`);
check(m.subClipped.length === 0, `no clipped stat text: ${JSON.stringify(m.subClipped)}`);

/* ---- rendered values must match the fixture, not merely "look like numbers" ---- */
const cards = await page.evaluate(() => [].slice.call(document.querySelectorAll('.day')).map((el) => ({
  n: el.querySelector('.day-n').textContent,
  d: el.querySelector('.day-d').textContent,
  hi: el.querySelector('.day-hi').textContent,
  lo: el.querySelector('.day-lo').textContent
})));
if (FIXTURE) {
  const c = FIXTURE.current;
  const dy = FIXTURE.daily;
  const expTemp = Math.round(c.temperature_2m) + '°C';
  const expStatus = 'Updated ' + c.time.slice(11, 16);
  check(m.heroTemp === expTemp, `hero temp matches fixture (${m.heroTemp} vs ${expTemp})`);
  check(m.status === expStatus, `status matches fixture (${m.status} vs ${expStatus})`);
  check(cards[0].n === 'Today', `first card says Today (got "${cards[0].n}")`);
  for (let i = 1; i < dy.time.length; i++) {
    /* Cross-check units.js's hand-rolled Sakamoto weekday against the platform's
       date library — an off-by-one there would otherwise be invisible. */
    const expected = new Date(dy.time[i] + 'T12:00:00Z')
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    check(cards[i].n === expected, `day ${i} weekday is ${expected} (got "${cards[i].n}")`);
    const expHi = Math.round(dy.temperature_2m_max[i]) + '°';
    const expLo = Math.round(dy.temperature_2m_min[i]) + '°';
    check(cards[i].hi === expHi && cards[i].lo === expLo,
      `day ${i} hi/lo is ${expHi}/${expLo} (got ${cards[i].hi}/${cards[i].lo})`);
  }
}

/* ---- D-pad walk ---- */
const focus = () => page.evaluate(() => {
  const f = window.Nav.focused();
  return f ? { row: f.row, col: f.col, cls: f.el.className, text: f.el.textContent.slice(0, 22) } : null;
});
const trail = [];
trail.push(['start', await focus()]);
for (const [name, code] of [['right', 39], ['right', 39], ['up', 38], ['right', 39], ['down', 40]]) {
  await key(code); trail.push([name, await focus()]);
}
check(trail.some((t) => t[1] && t[1].row === 0), 'Up reaches the hourly row');
check(trail[trail.length - 1][1].row === 1, 'Down returns to the day row');

/* select Thursday-ish via OK on a day card, then via a number key */
await key(39); await key(13); await page.waitForTimeout(250);
await shot('02-day-selected');
const sel = await page.evaluate(() => ({
  dayIdx: window.CPHWX.state.dayIdx,
  note: document.getElementById('hourly-scope').textContent,
  hours: document.querySelectorAll('.hour').length,
  selected: document.querySelectorAll('.day.selected').length
}));
check(sel.dayIdx > 0, `OK selects a future day (dayIdx=${sel.dayIdx})`);
check(sel.selected === 1, `exactly one day card marked selected (got ${sel.selected})`);
check(sel.hours === 24, `future day shows 24 hours (got ${sel.hours})`);

await key(53); await page.waitForTimeout(200); /* "5" -> day index 4 */
check((await page.evaluate(() => window.CPHWX.state.dayIdx)) === 4, 'number key 5 jumps to day 4');

/* ---- color keys ---- */
await key(404); await page.waitForTimeout(200);          /* GREEN: units */
const imp = await page.evaluate(() => document.getElementById('hero-temp').textContent.trim());
check(/°F$/.test(imp), `GREEN switches to Fahrenheit ("${imp}")`);
await shot('03-fahrenheit');
await key(404); await page.waitForTimeout(150);          /* back to metric */

await key(405); await page.waitForTimeout(200);          /* YELLOW: theme -> day */
await key(405); await page.waitForTimeout(200);          /* -> night */
check(await page.evaluate(() => document.body.classList.contains('theme-night')), 'YELLOW cycles to the night theme');
await shot('04-night-theme');
await key(405); await page.waitForTimeout(150);          /* -> auto */

await key(406); await page.waitForTimeout(250);          /* BLUE: diagnostics */
const dbg = await page.evaluate(() => {
  const el = document.getElementById('debug');
  return { hidden: el.hidden, text: el.textContent };
});
check(dbg.hidden === false, 'BLUE opens the diagnostics overlay');
check(/measured layout/.test(dbg.text), 'diagnostics overlay reports measured layout');
await shot('05-diagnostics');
await key(406); await page.waitForTimeout(150);

/* ---- Back behaviour: step out of the day, then the exit dialog ---- */
await key(10009); await page.waitForTimeout(200);
check((await page.evaluate(() => window.CPHWX.state.dayIdx)) === 0, 'Back returns to Today first');
await key(10009); await page.waitForTimeout(200);
const dlg = await page.evaluate(() => ({
  hidden: document.getElementById('dialog').hidden,
  scope: window.Nav.getScope(),
  focus: window.Nav.focused()?.el.id
}));
check(dlg.hidden === false, 'Back at the root opens the exit dialog');
check(dlg.scope === 'dialog', 'arrows are captured by the dialog scope');
check(dlg.focus === 'dlg-no', 'the dialog defaults to "Stay"');
await shot('06-exit-dialog');
/* A background repaint while the dialog is open must not move the highlight off
   "Stay", and must not lose the main grid's remembered position either. */
await page.evaluate(() => window.CPHWX.paint());
await page.waitForTimeout(150);
const afterRepaint = await page.evaluate(() => ({
  scope: window.Nav.getScope(), focus: window.Nav.focused()?.el.id
}));
check(afterRepaint.scope === 'dialog', 'a repaint behind the dialog keeps the dialog scope');
check(afterRepaint.focus === 'dlg-no', 'a repaint behind the dialog leaves "Stay" focused');

/* OK on "Exit": tizen is absent on the desktop, so the fallback toasts and
   closes the dialog itself — no second Back press, that would just reopen it. */
await key(37); await key(13); await page.waitForTimeout(250);
check(await page.evaluate(() => !document.getElementById('toast').hidden), 'exit falls back to a toast on desktop');
check(await page.evaluate(() => document.getElementById('dialog').hidden), 'the fallback closes the dialog');
const restored = await page.evaluate(() => {
  const f = window.Nav.focused();
  return { scope: window.Nav.getScope(), row: f?.row, col: f?.col };
});
check(restored.scope === 'main', 'closing the dialog hands the arrows back to the grid');
check(restored.row === 1, `focus returns to the day row (got row ${restored.row})`);

/* "Now" must be the current hour, never a fallback to midnight. */
const nowCell = await page.evaluate(() => {
  const cells = [].slice.call(document.querySelectorAll('.hour'));
  const i = cells.findIndex((c) => c.classList.contains('now'));
  return { index: i, label: cells[0].querySelector('.hour-t').textContent };
});
check(nowCell.index === 0, `the "Now" cell leads the strip (index ${nowCell.index})`);
check(nowCell.label === 'Now', `first hour cell is labelled Now (got "${nowCell.label}")`);

/* ---- offline fallback: cached forecast must still paint ---- */
offlinePhase = true;
killNetwork = true;
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.CPHWX && window.CPHWX.state.model, null, { timeout: 15000 });
await page.waitForTimeout(600);
const off = await page.evaluate(() => ({
  stale: window.CPHWX.state.stale,
  status: document.getElementById('status').textContent,
  days: document.querySelectorAll('.day').length
}));
check(off.stale === true, 'offline reload falls back to the cached forecast');
check(/^Offline/.test(off.status), `offline status is shown ("${off.status}")`);
check(off.days === 7, 'cached forecast still renders 7 days');
await shot('07-offline-cache');

await browser.close();
server.close();

console.log('--- measurements ---');
console.log(JSON.stringify(m, null, 2));
console.log('--- focus trail ---');
for (const [n, f] of trail) console.log(' ', n.padEnd(6), f ? `r${f.row}c${f.col} ${f.cls}` : 'none');
console.log(`--- shots in ${OUT} ---`);
if (problems.length) {
  console.log(`\nFAIL (${problems.length}):`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('\nPASS — all assertions held, no console errors.');
