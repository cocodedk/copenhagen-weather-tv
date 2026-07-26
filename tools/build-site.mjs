/* Assemble the GitHub Pages site into _site/.
   The landing pages and the TV app share ONE copy of wmo.js / units.js / api.js:
   they are copied out of the app at assembly time rather than duplicated in the
   repo, so a weather-label or unit fix can never apply to only one of them.
   Run: node tools/build-site.mjs   (then: python3 -m http.server -d _site) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, '_site');

/* Modules the landing pages reuse from the TV app. */
const SHARED = ['wmo.js', 'units.js', 'api.js'];
/* Everything the TV app needs to run in a browser as the live demo. */
const APP = ['index.html', 'icon.png', 'js', 'css'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const copy = (from, to) => fs.cpSync(from, to, { recursive: true });

copy(path.join(ROOT, 'website'), OUT);

fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
for (const f of SHARED) copy(path.join(ROOT, 'js', f), path.join(OUT, 'vendor', f));

/* The demo is the .wgt payload itself — no build step, nothing stripped. The
   app already guards every tizen/webapis call in try/catch, so it runs as-is. */
const demo = path.join(OUT, 'demo');
fs.mkdirSync(demo, { recursive: true });
for (const f of APP) copy(path.join(ROOT, f), path.join(demo, f));

/* Inline the app's icon sprite into every page that asks for it. Extracted from
   the app rather than duplicated, so the site's icons are literally the TV's.
   (An external <use href="sprite.svg#id"> is not reliably supported, so it has
   to be inlined rather than linked.) */
const appHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sprite = /<svg id="sprite"[\s\S]*?<\/svg>/.exec(appHtml);
if (!sprite) throw new Error('could not find <svg id="sprite"> in index.html');

let injected = 0;
for (const page of fs.readdirSync(OUT, { recursive: true })) {
  const p = path.join(OUT, page);
  if (!p.endsWith('.html') || !fs.statSync(p).isFile()) continue;
  const src = fs.readFileSync(p, 'utf8');
  if (!src.includes('<!--SPRITE-->')) continue;
  fs.writeFileSync(p, src.replace('<!--SPRITE-->', sprite[0]));
  injected++;
}
if (!injected) throw new Error('no page contained the <!--SPRITE--> placeholder');

/* Keep sitemap lastmod honest without a Date call inside the page. */
const stamp = new Date().toISOString().slice(0, 10);
const smPath = path.join(OUT, 'sitemap.xml');
if (fs.existsSync(smPath)) {
  fs.writeFileSync(smPath, fs.readFileSync(smPath, 'utf8').replaceAll('__LASTMOD__', stamp));
}

const count = (dir) => fs.readdirSync(dir, { recursive: true })
  .filter((f) => fs.statSync(path.join(dir, f)).isFile()).length;
console.log(`_site assembled: ${count(OUT)} files (shared: ${SHARED.join(', ')})`);
