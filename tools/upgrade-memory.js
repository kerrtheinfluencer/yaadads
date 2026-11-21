#!/usr/bin/env node
/* ── §UPGRADE-MEMORY — the site's memory of problems it has already solved ──────────
 *
 * Every bug we fix is written down once, in upgrade-memory/ledger.json, together with
 * machine-checkable GUARDS: the exact lines/rules/files that make the fix real. Every
 * push re-checks every guard. A change that quietly undoes an old fix (an older file
 * pasted over a newer one, a "tidy-up" that removes the line nobody remembered the
 * reason for, a merge that resurrects a deleted pattern) fails the build and says WHICH
 * solved problem it brought back and what the rule is.
 *
 * It also remembers a high-water mark (upgrade-memory/high-water.json): the highest
 * build, release and package version the site has ever reached, and every ledger id and
 * release that has ever existed. Going backwards on any of them, or deleting a memory,
 * is a downgrade and fails the build. Memories can only be RETIRED (with a reason),
 * never silently dropped.
 *
 *   node tools/upgrade-memory.js check            verify everything (exit 1 on regression)
 *   node tools/upgrade-memory.js list             show what the site remembers
 *   node tools/upgrade-memory.js add --id … --title … --problem … --fix … --rule …
 *                                 --guard "contains|js/file.js|exact text" [--guard …]
 *   node tools/upgrade-memory.js retire <id> "reason it no longer applies"
 *   node tools/upgrade-memory.js stamp            raise the high-water mark + js/build.js + docs
 *                                                 (refuses unless check passes)
 *   node tools/upgrade-memory.js docs             regenerate UPGRADE-MEMORY.md
 *
 * Guard types (all paths relative to the repo root):
 *   contains      {file, text}                  the file must contain this exact text
 *   absent        {file, text}                  the file must NOT contain this exact text
 *   regex         {file, pattern, flags?}       the pattern must match
 *   absent-regex  {file, pattern, flags?}       the pattern must NOT match
 *   exists        {file}                        the file must exist
 *   in-precache   {file}                        sw.js must precache this file
 *   load-order    {file, first, then}           in this HTML file `first` loads before `then`
 *
 * Dependency-free on purpose: it runs anywhere Node does, including CI before `npm ci`.   */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..');
const LEDGER = 'upgrade-memory/ledger.json';
const MARK = 'upgrade-memory/high-water.json';
const BUILD_JS = 'js/build.js';
const DOCS = 'UPGRADE-MEMORY.md';

const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const readJson = (root, f) => JSON.parse(read(root, f));
const exists = (root, f) => fs.existsSync(path.join(root, f));
const writeJson = (root, f, v) => {
  fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
  fs.writeFileSync(path.join(root, f), JSON.stringify(v, null, 2) + '\n');
};

/* "4.10.0" vs "4.9" → numeric, segment by segment. */
function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/* ── what the site is right now ── */
function currentState(root) {
  const sw = read(root, 'sw.js');
  const m = sw.match(/CACHE_VERSION\s*=\s*'[^']*?-v(\d+)'/);
  const build = m ? parseInt(m[1], 10) : null;
  const su = read(root, 'js/site-updates.js');
  const cur = su.match(/current:\s*'([^']+)'/);
  const releaseKeys = [];
  const re = /^\s{4}'([a-z0-9][a-z0-9-]*)':\s*\{\s*\n\s*version:\s*'([^']+)'/gim;
  let x;
  const versions = {};
  while ((x = re.exec(su))) { releaseKeys.push(x[1]); versions[x[1]] = x[2]; }
  const pkg = readJson(root, 'package.json');
  return {
    build,
    releaseKey: cur ? cur[1] : null,
    release: cur && versions[cur[1]] ? versions[cur[1]] : null,
    releaseKeys,
    pkg: pkg.version || null,
  };
}

/* ── guards ── */
function runGuard(root, g) {
  const need = f => { if (!exists(root, f)) throw new Error('file is missing: ' + f); return read(root, f); };
  switch (g.type) {
    case 'contains': return need(g.file).includes(g.text) || fail(`${g.file} no longer contains: ${clip(g.text)}`);
    case 'absent': return !need(g.file).includes(g.text) || fail(`${g.file} contains something that was removed on purpose: ${clip(g.text)}`);
    case 'regex': return new RegExp(g.pattern, g.flags || '').test(need(g.file)) || fail(`${g.file} no longer matches /${clip(g.pattern)}/`);
    case 'absent-regex': return !new RegExp(g.pattern, g.flags || '').test(need(g.file)) || fail(`${g.file} matches /${clip(g.pattern)}/, which was banned on purpose`);
    case 'exists': return exists(root, g.file) || fail(`${g.file} is missing`);
    case 'in-precache': {
      const sw = need('sw.js');
      return sw.includes("'/" + g.file + "'") || sw.includes('"/' + g.file + '"') || fail(`sw.js does not precache ${g.file}`);
    }
    case 'load-order': {
      const h = need(g.file);
      const a = h.indexOf(g.first), b = h.indexOf(g.then);
      if (a < 0) return fail(`${g.file} does not load ${g.first}`);
      if (b < 0) return fail(`${g.file} does not load ${g.then}`);
      return a < b || fail(`${g.file} must load ${g.first} BEFORE ${g.then}`);
    }
    default: throw new Error('unknown guard type: ' + g.type);
  }
}
function fail(msg) { const e = new Error(msg); e.guard = true; throw e; }
const clip = s => { s = String(s).replace(/\s+/g, ' '); return s.length > 90 ? s.slice(0, 87) + '…' : s; };

/* ── the whole check ── */
function check(root = DEFAULT_ROOT) {
  const problems = [];   // things that must fail the build
  const notes = [];      // things worth saying
  const ledger = readJson(root, LEDGER);
  const mark = exists(root, MARK) ? readJson(root, MARK) : null;
  const state = currentState(root);
  let guards = 0, active = 0;

  const ids = new Set();
  for (const e of ledger.entries) {
    if (!e.id || ids.has(e.id)) problems.push(`ledger: duplicate or missing id "${e.id}"`);
    ids.add(e.id);
    if (!e.title || !e.problem || !e.fix || !e.rule) problems.push(`ledger [${e.id}]: needs title, problem, fix and rule`);
    if (e.status === 'retired') {
      if (!e.retired || !e.retired.reason) problems.push(`ledger [${e.id}]: a retired memory must say why`);
      continue;
    }
    active++;
    if (!e.guards || !e.guards.length) problems.push(`ledger [${e.id}]: an active memory needs at least one guard`);
    for (const g of e.guards || []) {
      guards++;
      try { runGuard(root, g); } catch (err) {
        problems.push(`REGRESSION [${e.id}] ${e.title}\n      ${err.message}\n      problem: ${e.problem}\n      rule:    ${e.rule}`);
      }
    }
  }

  /* the high-water mark: the site only ever moves forward */
  if (mark) {
    if (state.build == null) problems.push('sw.js has no CACHE_VERSION build number');
    else if (state.build < mark.build) problems.push(`DOWNGRADE: sw.js build is ${state.build} but the site already reached ${mark.build}`);
    if (state.release && mark.release && cmpVersion(state.release, mark.release) < 0)
      problems.push(`DOWNGRADE: current release is ${state.release} but the site already reached ${mark.release}`);
    if (!state.release) problems.push('js/site-updates.js: could not read the current release version');
    if (state.pkg && mark.package && cmpVersion(state.pkg, mark.package) < 0)
      problems.push(`DOWNGRADE: package.json is ${state.pkg} but the site already reached ${mark.package}`);
    for (const id of mark.ledgerIds || []) if (!ids.has(id)) problems.push(`MEMORY LOST: ledger entry "${id}" was deleted. Retire it with a reason instead of removing it.`);
    for (const k of mark.releaseKeys || []) if (!state.releaseKeys.includes(k)) problems.push(`HISTORY LOST: release "${k}" was removed from js/site-updates.js`);
  } else {
    notes.push('no high-water mark yet (run: node tools/upgrade-memory.js stamp)');
  }

  /* the in-page guard must never claim a build newer than the code it ships with */
  if (exists(root, BUILD_JS)) {
    const b = read(root, BUILD_JS).match(/YA_BUILD\s*=\s*(\d+)/);
    if (!b) problems.push(`${BUILD_JS}: no YA_BUILD number`);
    else if (state.build != null && +b[1] > state.build) problems.push(`${BUILD_JS} says build ${b[1]} but sw.js is ${state.build}`);
    else if (state.build != null && +b[1] < state.build) notes.push(`${BUILD_JS} is at ${b[1]}, sw.js is ${state.build} (the Upgrade Memory bot re-stamps it after the push)`);
  } else problems.push(`${BUILD_JS} is missing — the in-page downgrade guard is gone`);

  return { problems, notes, ledger, mark, state, counts: { entries: ledger.entries.length, active, guards } };
}

/* ── stamp: raise the mark, sync build.js, regenerate the docs ── */
function stamp(root = DEFAULT_ROOT) {
  const r = check(root);
  if (r.problems.length) return { ok: false, problems: r.problems };
  const s = r.state;
  const mark = r.mark || { build: 0, release: '0', package: '0', ledgerIds: [], releaseKeys: [] };
  const next = {
    schema: 1,
    build: Math.max(mark.build || 0, s.build),
    release: cmpVersion(s.release, mark.release || '0') >= 0 ? s.release : mark.release,
    package: cmpVersion(s.pkg || '0', mark.package || '0') >= 0 ? s.pkg : mark.package,
    ledgerIds: [...new Set([...(mark.ledgerIds || []), ...r.ledger.entries.map(e => e.id)])].sort(),
    releaseKeys: [...new Set([...(mark.releaseKeys || []), ...s.releaseKeys])],
    updated: new Date().toISOString().slice(0, 10),
  };
  const before = JSON.stringify(mark);
  const changed = [];
  if (JSON.stringify({ ...next, updated: mark.updated }) !== before) { writeJson(root, MARK, next); changed.push(MARK); }
  const buildSrc = read(root, BUILD_JS);
  const synced = buildSrc.replace(/YA_BUILD\s*=\s*\d+/, 'YA_BUILD = ' + next.build);
  if (synced !== buildSrc) { fs.writeFileSync(path.join(root, BUILD_JS), synced); changed.push(BUILD_JS); }
  const doc = docs(root);
  if (!exists(root, DOCS) || read(root, DOCS) !== doc) { fs.writeFileSync(path.join(root, DOCS), doc); changed.push(DOCS); }
  return { ok: true, changed, mark: next };
}

/* ── the human-readable memory ── */
function docs(root = DEFAULT_ROOT) {
  const ledger = readJson(root, LEDGER);
  const mark = exists(root, MARK) ? readJson(root, MARK) : null;
  const out = [];
  out.push('# Upgrade Memory', '');
  out.push('Everything this site has already fixed, and the guards that stop an update from bringing it back.',
    'Generated from `upgrade-memory/ledger.json` by `node tools/upgrade-memory.js docs` — edit the ledger, not this file.', '');
  if (mark) out.push(`**High-water mark:** build ${mark.build} · release ${mark.release} · package ${mark.package}. The site never goes below these.`, '');
  const active = ledger.entries.filter(e => e.status !== 'retired');
  const retired = ledger.entries.filter(e => e.status === 'retired');
  out.push(`${active.length} active memories, ${active.reduce((n, e) => n + (e.guards || []).length, 0)} guards, ${retired.length} retired.`, '');
  const byArea = {};
  active.forEach(e => (byArea[e.area || 'general'] = byArea[e.area || 'general'] || []).push(e));
  for (const area of Object.keys(byArea).sort()) {
    out.push('## ' + area, '');
    for (const e of byArea[area]) {
      out.push(`### ${e.title}  \`${e.id}\``, '');
      out.push(`- **Since:** ${e.since || '—'}`);
      out.push(`- **Problem:** ${e.problem}`);
      out.push(`- **Fix:** ${e.fix}`);
      out.push(`- **Rule:** ${e.rule}`);
      out.push(`- **Guards:** ${(e.guards || []).length}`, '');
    }
  }
  if (retired.length) {
    out.push('## Retired', '');
    retired.forEach(e => out.push(`- \`${e.id}\` — ${e.title}. Retired: ${e.retired.reason}`));
    out.push('');
  }
  return out.join('\n');
}

/* ── CLI ── */
function arg(argv, name) { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; }
function args(argv, name) { const o = []; argv.forEach((a, i) => { if (a === '--' + name) o.push(argv[i + 1]); }); return o; }

function parseGuard(s) {
  const [type, file, ...rest] = s.split('|');
  const v = rest.join('|');
  if (type === 'contains' || type === 'absent') return { type, file, text: v };
  if (type === 'regex' || type === 'absent-regex') return { type, file, pattern: v };
  if (type === 'exists' || type === 'in-precache') return { type, file };
  if (type === 'load-order') { const [first, then] = rest; return { type, file, first, then }; }
  throw new Error('bad --guard "' + s + '" (use type|file|value)');
}

function main(argv) {
  const cmd = argv[0] || 'check';
  const root = DEFAULT_ROOT;
  if (cmd === 'check') {
    const r = check(root);
    r.notes.forEach(n => console.log('note: ' + n));
    if (r.problems.length) {
      console.error('\nUPGRADE MEMORY: ' + r.problems.length + ' problem(s) — this change would undo something the site already solved:\n');
      r.problems.forEach(p => console.error('  ✗ ' + p + '\n'));
      process.exit(1);
    }
    console.log(`UPGRADE MEMORY: ok — ${r.counts.active} memories, ${r.counts.guards} guards, build ${r.state.build}, release ${r.state.release}.`);
  } else if (cmd === 'list') {
    const r = check(root);
    r.ledger.entries.forEach(e => console.log(`${e.status === 'retired' ? '·' : '✓'} ${e.id.padEnd(34)} ${e.since || ''}  ${e.title}  (${(e.guards || []).length} guards)`));
  } else if (cmd === 'add') {
    const ledger = readJson(root, LEDGER);
    const e = { id: arg(argv, 'id'), status: 'active', since: arg(argv, 'since') || 'v' + (currentState(root).release || '').replace(/^v/, ''),
      area: arg(argv, 'area') || 'general', title: arg(argv, 'title'), problem: arg(argv, 'problem'), fix: arg(argv, 'fix'), rule: arg(argv, 'rule'),
      guards: args(argv, 'guard').map(parseGuard) };
    for (const k of ['id', 'title', 'problem', 'fix', 'rule']) if (!e[k]) { console.error('missing --' + k); process.exit(2); }
    if (!e.guards.length) { console.error('give at least one --guard "type|file|value"'); process.exit(2); }
    if (ledger.entries.some(x => x.id === e.id)) { console.error('id already exists: ' + e.id); process.exit(2); }
    ledger.entries.push(e);
    writeJson(root, LEDGER, ledger);
    const r = check(root);
    if (r.problems.length) { console.error('Saved, but a guard does not pass on the current code:\n' + r.problems.join('\n')); process.exit(1); }
    console.log('Remembered: ' + e.id + ' (' + e.guards.length + ' guards). Run `node tools/upgrade-memory.js stamp` to update the docs and high-water mark.');
  } else if (cmd === 'retire') {
    const ledger = readJson(root, LEDGER);
    const e = ledger.entries.find(x => x.id === argv[1]);
    if (!e || !argv[2]) { console.error('usage: retire <id> "reason"'); process.exit(2); }
    e.status = 'retired'; e.retired = { reason: argv[2], date: new Date().toISOString().slice(0, 10) };
    writeJson(root, LEDGER, ledger);
    console.log('Retired ' + e.id);
  } else if (cmd === 'stamp') {
    const r = stamp(root);
    if (!r.ok) { console.error('Refusing to stamp — fix these first:\n' + r.problems.join('\n')); process.exit(1); }
    console.log(r.changed.length ? 'Stamped: ' + r.changed.join(', ') : 'Already up to date.');
  } else if (cmd === 'docs') {
    fs.writeFileSync(path.join(root, DOCS), docs(root));
    console.log('Wrote ' + DOCS);
  } else { console.error('unknown command: ' + cmd); process.exit(2); }
}

module.exports = { check, stamp, docs, currentState, cmpVersion, runGuard };
if (require.main === module) main(process.argv.slice(2));
