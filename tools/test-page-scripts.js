/* ── Every committed page must ship only PARSEABLE inline script, and every
      <script src> must point at a file that actually exists.
   ───────────────────────────────────────────────────────────────────────────
   Both halves are invisible to a source-level check, which is how the
   invalid-regex SyntaxError lived for months: the template in generate-pages.js
   LOOKED correct (`\\?` is valid JavaScript there), but inside a template
   literal the `\\` collapsed, so the emitted page contained `/(?:?|&)/`. One
   bad regex is a SyntaxError for the whole <script> block, which killed the
   lightbox, the thumbnail switcher and the view counter on EVERY generated ad
   page while every unit test stayed green.

   And a typo in a script src is the same class of failure at a distance: the
   file 404s, the code never runs, and nothing in the repo notices.

   No browser, no network — pure Node, so it belongs in `npm test`.
   Usage: node tools/test-page-scripts.js                                          */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || detail === undefined ? '' : ' — ' + detail));
  if (!ok) failures++;
}

/* The shipped HTML. Dotted directories (.chrome-*-tmp) are build scratch and
   are skipped on purpose — only real, served pages matter. */
const pages = [];
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  const full = path.join(ROOT, f);
  if (fs.statSync(full).isFile()) pages.push(f);
}
for (const dir of ['ad', 'category', 'parish']) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.html')) pages.push(path.join(dir, f));
}

let blocks = 0;
const parseErrors = new Map();
const missingSrc = new Map();
for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');

  // 1. every inline <script> must actually parse
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    const code = m[2];
    if (!code.trim()) continue;
    if (/\bsrc\s*=/.test(attrs)) continue;                    // external file — checked below
    /* Skip non-JS payloads. <script type="application/ld+json"> is JSON, and
       parsing it as JavaScript fails on the first ":" — a false positive that
       would make this gate cry wolf on every page carrying schema.org data. */
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(?:text\/javascript|text\/jscript|application\/javascript|module)$/i.test(type)) continue;
    blocks++;
    try { new Function(code); }
    catch (e) {
      if (!parseErrors.has(e.message)) parseErrors.set(e.message, []);
      if (parseErrors.get(e.message).length < 3) parseErrors.get(e.message).push(page);
    }
  }

  // 2. every <script src> must resolve to a file on disk
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/gi)) {
    const src = m[1];
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) continue;   // CDN/inline data
    if (!src.startsWith('/')) continue;                                      // relative — resolved by the page
    const target = path.join(ROOT, src.slice(1).split('?')[0]);
    if (!fs.existsSync(target)) {
      if (!missingSrc.has(src)) missingSrc.set(src, []);
      if (missingSrc.get(src).length < 3) missingSrc.get(src).push(page);
    }
  }
}

check('every shipped page has parseable inline script (' + pages.length + ' pages, ' + blocks + ' blocks)',
  parseErrors.size === 0,
  [...parseErrors].map(([m, where]) => m + ' [e.g. ' + where.join(', ') + ']').join(' | '));
check('every <script src="/..." resolves to a real file', missingSrc.size === 0,
  [...missingSrc].map(([s, where]) => s + ' [e.g. ' + where.join(', ') + ']').join(' | '));

console.log('\n' + (failures === 0 ? 'PAGE-SCRIPTS: ALL PASSED' : 'PAGE-SCRIPTS: ' + failures + ' FAILED'));
process.exit(failures === 0 ? 0 : 1);