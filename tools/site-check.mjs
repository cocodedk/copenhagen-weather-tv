/* Check the assembled GitHub Pages site: every language at every breakpoint the
   skill requires (360 / 390 / 768 / 1280), asserting the mobile-first rules and
   that live data actually rendered. Screenshots land in shots/site/.
   Run: node tools/build-site.mjs && node tools/site-check.mjs */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = path.join(ROOT, '_site');
const OUT = path.join(ROOT, 'shots', 'site');
const LIVE = !!process.env.LIVE;
const FIXTURE = LIVE ? null
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/forecast.json'), 'utf8'));

if (!fs.existsSync(SITE)) {
  console.error('no _site/ — run: node tools/build-site.mjs');
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
               '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
               '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(SITE, rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(`ASSERT ${label}`); };

const PAGES = [{ id: 'en', url: '/' }, { id: 'da', url: '/da/' }, { id: 'fa', url: '/fa/' }];
const WIDTHS = [360, 390, 768, 1280];

for (const p of PAGES) {
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.route('**api.open-meteo.com/**', (route) => {
      if (FIXTURE) {
        return route.fulfill({ status: 200, contentType: 'application/json',
                               body: JSON.stringify(FIXTURE) });
      }
      return route.continue();
    });
    /* Google Fonts is the only external dependency; block it so the check is
       hermetic and does not silently pass or fail on network weather. */
    await page.route('**fonts.googleapis.com/**', (r) => r.abort());
    await page.route('**fonts.gstatic.com/**', (r) => r.abort());

    const errs = [];
    const external = (u) => /fonts\.(googleapis|gstatic)\.com|favicon/i.test(u || '');
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => {
      /* Font requests are blocked on purpose above; judge by the failing URL,
         not the message text, which is just "net::ERR_FAILED". */
      if (m.type() === 'error' && !external(m.location().url) && !external(m.text())) {
        errs.push(m.text());
      }
    });

    await page.goto(base + p.url, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelectorAll('#days li').length > 0, null, { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const small = [].slice.call(document.querySelectorAll('a, button'))
        .filter((el) => el.offsetParent !== null)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.height < 44;
        })
        .map((el) => (el.textContent || '').trim().slice(0, 24) + ` [${Math.round(el.getBoundingClientRect().height)}px]`);
      return {
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        bodyFont: parseFloat(cs.fontSize),
        dir: document.documentElement.getAttribute('dir') || 'ltr',
        hours: document.querySelectorAll('#hours .hour').length,
        days: document.querySelectorAll('#days li').length,
        tiles: document.querySelectorAll('#now-tiles .ntile').length,
        temp: document.getElementById('now-temp').textContent.trim(),
        cond: document.getElementById('now-cond').textContent.trim(),
        status: document.getElementById('now-status-text').textContent.trim(),
        dayName: (document.querySelector('#days .day-n') || {}).textContent,
        glow: getComputedStyle(document.documentElement).getPropertyValue('--glow').trim(),
        h1s: document.querySelectorAll('h1').length,
        skipped: (() => {
          const levels = [].slice.call(document.querySelectorAll('h1,h2,h3'))
            .map((el) => +el.tagName[1]);
          for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) return true;
          return false;
        })(),
        imgAlt: [].slice.call(document.querySelectorAll('img')).filter((i) => !i.hasAttribute('alt')).length,
        /* Name the widest offenders so an overflow is diagnosable, not a guess.
           Elements that scroll their own content (pre, .hours) are legitimate. */
        wide: [].slice.call(document.querySelectorAll('body *'))
          .filter((el) => {
            if (el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) return false;
            /* Anything inside a scroll container is contained, not overflowing. */
            for (let n = el; n && n !== document.body; n = n.parentElement) {
              const cs = getComputedStyle(n);
              if (cs.position === 'fixed') return false;
              if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
            }
            return true;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}=${Math.round(el.getBoundingClientRect().right)}`)
          .slice(0, 4)
      };
    });

    const tag = `${p.id}-${w}`;
    await page.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: w === 1280 });

    check(m.scrollW <= m.clientW + 1,
      `${tag}: no horizontal scroll (${m.scrollW} > ${m.clientW}) — widest: ${m.wide.join(', ') || 'none identified'}`);
    check(m.bodyFont >= 16, `${tag}: body font >= 16px (${m.bodyFont})`);
    check(m.hours === 12, `${tag}: 12 hour chips (got ${m.hours})`);
    check(m.days === 7, `${tag}: 7 day rows (got ${m.days})`);
    check(m.tiles === 4, `${tag}: 4 hero tiles (got ${m.tiles})`);
    check(/\d/.test(m.temp), `${tag}: temperature rendered ("${m.temp}")`);
    check(m.h1s === 1, `${tag}: exactly one h1 (got ${m.h1s})`);
    check(!m.skipped, `${tag}: heading levels not skipped`);
    check(m.imgAlt === 0, `${tag}: every img has alt (${m.imgAlt} missing)`);
    check(!errs.length, `${tag}: no page errors — ${errs.slice(0, 2).join(' | ')}`);
    check(m.glow.length > 0, `${tag}: ambient glow colour was set from conditions`);
    if (p.id === 'fa') check(m.dir === 'rtl', `${tag}: Persian page is dir=rtl (got ${m.dir})`);

    /* Translations must actually reach the rendered DOM, not just the markup. */
    if (p.id === 'da') {
      check(/dag|Mandag|Tirsdag|Onsdag|Torsdag|Fredag|Lørdag|Søndag/.test(m.dayName || ''),
        `${tag}: day names are Danish (got "${m.dayName}")`);
      check(/[æøåÆØÅ]|Opdateret|Offline/.test(m.status), `${tag}: status is Danish (got "${m.status}")`);
    }
    if (p.id === 'fa') {
      check(/[؀-ۿ]/.test(m.dayName || ''), `${tag}: day names are Persian (got "${m.dayName}")`);
      check(/[؀-ۿ]/.test(m.cond), `${tag}: condition is Persian (got "${m.cond}")`);
    }
    if (p.id === 'en') {
      check(/^(Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(m.dayName || ''),
        `${tag}: day names are English (got "${m.dayName}")`);
    }

    if (w === 1280) {
      console.log(`${p.id.toUpperCase()} @${w}: ${m.temp} · ${m.cond} · ${m.status} · glow ${m.glow}`);
    }
    await page.close();
  }
}

/* The demo iframe must actually boot the TV app and be scaled to fit. */
const demo = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await demo.route('**api.open-meteo.com/**', (route) => FIXTURE
  ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) })
  : route.continue());
await demo.goto(base + '/', { waitUntil: 'load' });
await demo.evaluate(() => document.getElementById('demo').scrollIntoView());
await demo.waitForTimeout(2500);
const d = await demo.evaluate(() => {
  const f = document.getElementById('demo-iframe');
  const doc = f.contentDocument;
  return {
    transform: f.style.transform,
    frameW: document.getElementById('demo-frame').clientWidth,
    innerDays: doc ? doc.querySelectorAll('.day').length : -1,
    innerStamp: doc && doc.getElementById('build-stamp') ? doc.getElementById('build-stamp').textContent : ''
  };
});
check(/scale\(0\.\d+\)/.test(d.transform), `demo iframe is scaled to the column (${d.transform})`);
check(d.innerDays === 7, `demo iframe booted the TV app (7 day cards, got ${d.innerDays})`);
check(d.innerStamp.length > 0, `demo shows the build stamp (got "${d.innerStamp}")`);
await demo.screenshot({ path: path.join(OUT, 'demo-embed.png') });
console.log(`demo: ${d.transform} in ${d.frameW}px, stamp ${d.innerStamp}, ${d.innerDays} day cards`);

await browser.close();
server.close();

console.log(`\nshots in ${OUT}`);
if (problems.length) {
  console.log(`\nFAIL (${problems.length}):`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('\nPASS — all three languages, all four breakpoints.');
