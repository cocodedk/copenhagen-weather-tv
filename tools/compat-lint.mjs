/* Chromium-ceiling lint.
   The desktop test loop runs a MODERN Chromium, so it happily accepts features the
   TV's frozen WebView does not have — a green smoke test proves nothing about
   compatibility. This scans the source for the known-missing features instead.
   Default ceiling: Chromium 69 (Tizen 5.5, ~2020 sets), which also covers the
   Chromium 76 of Tizen 6.0. Run: node tools/compat-lint.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CEILING = Number(process.env.CHROMIUM_CEILING || 69);

/* [label, needsChrome, regex, applies-to] */
const RULES = [
  ['CSS flex `gap`',          84, /(^|[;{\s])(row-|column-)?gap\s*:/,        'flex'],
  ['CSS min()/max()/clamp()', 79, /[:\s]\s*(clamp|min|max)\s*\(/,            'css'],
  ['CSS `inset` shorthand',   87, /(^|[;{\s])inset\s*:/,                     'css'],
  ['CSS :is()/:where()',      88, /:(is|where)\s*\(/,                        'css'],
  ['CSS aspect-ratio',        88, /(^|[;{\s])aspect-ratio\s*:/,              'css'],
  ['CSS :focus-visible',      86, /:focus-visible/,                          'css'],
  ['CSS content-visibility',  85, /content-visibility\s*:/,                  'css'],
  ['CSS backdrop-filter',     76, /backdrop-filter\s*:/,                     'css'],
  ['JS optional chaining ?.', 80, /\?\.[A-Za-z_$[(]/,                        'js'],
  ['JS nullish ??',           80, /[^?]\?\?[^=]/,                            'js'],
  ['JS logical assignment',   85, /(\?\?=|\|\|=|&&=)/,                       'js'],
  ['JS String.replaceAll',    85, /\.replaceAll\s*\(/,                       'js'],
  ['JS Array.prototype.at',   92, /\.at\s*\(\s*-?\d/,                        'js'],
  ['JS structuredClone',      98, /\bstructuredClone\s*\(/,                  'js'],
  ['JS Promise.allSettled',   76, /Promise\.allSettled/,                     'js'],
  ['JS Object.hasOwn',        93, /Object\.hasOwn/,                          'js'],
  ['JS Array.findLast',       97, /\.findLast(Index)?\s*\(/,                 'js'],
  ['JS RegExp named groups',  64, /\(\?<[A-Za-z]/,                           'js'],
];

/* Only the files the TV actually loads. Exempt, because they target modern
   browsers or never reach the set at all: tools/ and tests/ (desktop Node),
   website/ and _site/ (the GitHub Pages site — it may use :focus-visible and
   friends), dist/ and shots/ (build output). The shared modules the site
   borrows live in js/, so they are still held to the TV's ceiling. */
const SKIP = new Set(['tools', 'tests', 'website', '_site', 'shots', 'dist', 'node_modules']);
const TARGETS = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html)$/.test(e.name)) TARGETS.push(p);
  }
})(ROOT);

/* Flex `gap` is unsupported; grid `gap` has been fine since Chrome 66. Decide by
   looking at the `display` declared in the same rule block. */
function isFlexBlock(css, gapIndex) {
  const open = css.lastIndexOf('{', gapIndex);
  const block = css.slice(open, css.indexOf('}', gapIndex) + 1);
  return /display\s*:\s*(inline-)?flex/.test(block) && !/display\s*:\s*(inline-)?grid/.test(block);
}

/* Blank out comments (keeping newlines, so line numbers stay honest) — otherwise
   the notes in the source documenting these very rules trip the lint. `//` is only
   treated as a line comment when it is not part of a URL scheme. */
function stripComments(src, ext) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let out = src.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (ext === 'html') out = out.replace(/<!--[\s\S]*?-->/g, blank);
  if (ext === 'js' || ext === 'html') out = out.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
  return out;
}

const hits = [];
for (const file of TARGETS) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).slice(1);
  const src = stripComments(raw, ext);
  const lines = src.split('\n');
  const rawLines = raw.split('\n');

  for (const [label, needs, re, scope] of RULES) {
    if (needs <= CEILING) continue;
    const applies = scope === 'css' ? (ext === 'css' || ext === 'html')
                  : scope === 'flex' ? (ext === 'css' || ext === 'html')
                  : (ext === 'js' || ext === 'html');
    if (!applies) continue;

    lines.forEach((line, i) => {
      const m = re.exec(line);
      if (!m) return;
      if (scope === 'flex' && !isFlexBlock(src, src.indexOf(line) + m.index)) return;
      hits.push({
        file: path.relative(ROOT, file), line: i + 1, label, needs,
        snippet: rawLines[i].trim().slice(0, 90)
      });
    });
  }
}

console.log(`Chromium ceiling: ${CEILING}  ·  scanned ${TARGETS.length} files`);
if (!hits.length) {
  console.log('PASS — nothing used that the target WebView lacks.');
  process.exit(0);
}
console.log(`\nFAIL (${hits.length}):`);
for (const h of hits) {
  console.log(`  ✗ ${h.file}:${h.line}  ${h.label} (needs Chrome ${h.needs})`);
  console.log(`      ${h.snippet}`);
}
process.exit(1);
