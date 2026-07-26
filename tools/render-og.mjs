/* Render website/og-image.html to website/og.png at exactly 1200x630.
   Run after editing og-image.html; the PNG is committed. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(ROOT, 'website', 'og-image.html');
const out = path.join(ROOT, 'website', 'og.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('file://' + src, { waitUntil: 'load' });
/* Wait for the web font, or the type lands in a fallback face. */
await page.evaluate(() => document.fonts.ready).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('wrote', out);
