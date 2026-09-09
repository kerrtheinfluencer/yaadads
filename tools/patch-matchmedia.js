/* ── v2 HOTFIX: guard the Chromium-only window.matchMedia API in every
   generated static page. An unguarded call crashes the page script on
   iOS Safari / Firefox (matchMedia is undefined there), which kills the
   photo lightbox, seller buttons and share links — i.e. "can't click
   anything on the ad page".
   Run: node tools/patch-matchmedia.js ── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['ad', 'category', 'parish'];
const FILES = ['404.html', 'offline.html', 'gas-prices.html', 'index.html', 'dash-kxrr1.html'];

// Matches both "window.matchMedia('(display-mode: standalone)').matches"
// and the wrapped operand only — replaces with the guarded form.
const RE = /window\.matchMedia\('\(display-mode: standalone\)'\)\.matches/g;
const REPLACEMENT =
  "(typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)";

let patched = 0, scanned = 0;

function scan(pathname) {
  if (!fs.existsSync(pathname) || fs.statSync(pathname).isDirectory()) return;
  scanned++;
  const src = fs.readFileSync(pathname, 'utf8');
  if (RE.test(src)) {
    const out = src.replace(RE, REPLACEMENT);
    fs.writeFileSync(pathname, out, 'utf8');
    patched++;
    console.log('✓ patched ' + path.relative(ROOT, pathname));
  }
}

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) scan(path.join(dir, f));
}
for (const f of FILES) scan(path.join(ROOT, f));

console.log('----');
console.log('Scanned ' + scanned + ' files, patched ' + patched);
console.log('Remaining unguarded occurrences:');
let remaining = 0;
// Matches ONLY unguarded calls (not preceded by the typeof guard)
const UNGUARDED =
  /(?<!typeof window\.matchMedia === 'function' && )window\.matchMedia\('\(display-mode: standalone\)'\)\.matches/g;
for (const d of [...DIRS, '.']) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const p = path.join(dir, f);
    const c = fs.readFileSync(p, 'utf8');
    if (UNGUARDED.test(c)) {
      remaining++;
      console.log('  ! ' + path.relative(ROOT, p));
    }
  }
}
console.log(remaining === 0 ? '  none → all safe' : '  ' + remaining + ' remaining');