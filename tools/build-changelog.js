/* ── build-changelog.js (run: node tools/build-changelog.js) ──
 * Single source of truth: js/site-updates.js (SITE_UPDATES.items).
 * Generates CHANGELOG.md newest-first so the repo changelog can never drift
 * from what members see in the in-app What's-new history overlay.
 * CI (smoke-test.yml) re-runs this and fails the push if CHANGELOG.md
 * wasn't regenerated — run `npm run changelog` before pushing. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SU_PATH = path.join(ROOT, 'js', 'site-updates.js');
const OUT_PATH = path.join(ROOT, 'CHANGELOG.md');

function parseUpdates(src) {
  // Extract the `items: { ... }` block balance-aware (notes arrays nest).
  const itemsIdx = src.indexOf('items:');
  if (itemsIdx === -1) throw new Error('SITE_UPDATES.items not found');
  const openIdx = src.indexOf('{', itemsIdx);
  let depth = 0, end = -1;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Unbalanced braces in SITE_UPDATES.items');
  const block = src.slice(openIdx, end + 1);

  const cur = (src.match(/current:\s*'([^']+)'/) || [])[1] || '';

  // Split top-level entries: 'id': { ... } — brace-aware.
  const entries = [];
  const re = /'([^']+)'\s*:\s*\{/g;
  let m;
  while ((m = re.exec(block))) {
    let d = 0, j = m.index + m[0].length - 1;
    for (; j < block.length; j++) {
      if (block[j] === '{') d++;
      else if (block[j] === '}') { d--; if (d === 0) break; }
    }
    entries.push({ id: m[1], body: block.slice(m.index + m[0].length, j) });
    re.lastIndex = j + 1;
  }

  const str = (b, k) => ((b.match(new RegExp(k + ":\\s*'((?:[^'\\\\]|\\\\.)*)'", 's')) || [])[1] || '').replace(/\\'/g, "'");
  const notes = (b) => {
    const nm = b.match(/notes:\s*\[([\s\S]*?)\]/);
    if (!nm) return [];
    const out = [];
    const nr = /'((?:[^'\\]|\\.)*)'/g;
    let n;
    while ((n = nr.exec(nm[1]))) out.push(n[1].replace(/\\'/g, "'"));
    return out;
  };
  const dateNum = (s) => {
    const dm = String(s || '').match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
    if (!dm) return 0;
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (+dm[3]) * 10000 + (MON.indexOf(dm[1]) + 1) * 100 + (+dm[2]);
  };

  const items = entries.map((e) => ({
    id: e.id,
    version: str(e.body, 'version'),
    icon: str(e.body, 'icon'),
    title: str(e.body, 'title'),
    body: str(e.body, 'body'),
    date: str(e.body, 'date'),
    notes: notes(e.body),
    current: e.id === cur,
  }));
  items.sort((a, b) => dateNum(b.date) - dateNum(a.date));
  return { current: cur, items };
}

function renderMd(current, items) {
  const lines = [];
  lines.push('# Yaad Adz — Changelog');
  lines.push('');
  lines.push('> Auto-generated from `js/site-updates.js` (`SITE_UPDATES.items`) — the same');
  lines.push('> entries members see in the in-app **What\u2019s new** history overlay.');
  lines.push('> Do not edit by hand: run `npm run changelog` after adding an update.');
  lines.push('');
  for (const it of items) {
    const head = '## ' + (it.icon ? it.icon + ' ' : '') + (it.version ? it.version + ' — ' : '') + (it.title || it.id) + (it.date ? ' (' + it.date + ')' : '') + (it.current ? ' · latest' : '');
    lines.push(head);
    lines.push('');
    if (it.body) { lines.push(it.body); lines.push(''); }
    for (const n of it.notes) lines.push('- ' + n);
    if (it.notes.length) lines.push('');
  }
  return lines.join('\n');
}

try {
  const src = fs.readFileSync(SU_PATH, 'utf8');
  const { current, items } = parseUpdates(src);
  if (!items.length) throw new Error('No SITE_UPDATES entries parsed');
  fs.writeFileSync(OUT_PATH, renderMd(current, items));
  console.log('CHANGELOG.md regenerated — ' + items.length + ' entries (current: ' + current + ')');
} catch (e) {
  console.error('build-changelog failed: ' + e.message);
  process.exit(1);
}
