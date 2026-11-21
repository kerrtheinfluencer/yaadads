/* ── §UPGRADE-MEMORY test ──
   1. The real site passes every guard in upgrade-memory/ledger.json and has not gone backwards.
   2. The guard engine itself actually catches things. A memory that cannot fail is decoration, so
      this copies the site into a temp folder, undoes fixes / downgrades / deletes memories one at
      a time, and asserts each is caught — and reported by name.
   Dependency-free. Usage: node tools/test-upgrade-memory.js                                    */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const um = require('./upgrade-memory');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function check(name, ok, detail) { console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || !detail ? '' : ' — ' + detail)); if (!ok) failed++; }

/* 1 ── the real site */
const real = um.check(ROOT);
check('every guard in the ledger passes on the real site', real.problems.length === 0, real.problems.join('\n'));
check('the ledger remembers a meaningful number of fixes', real.counts.active >= 15 && real.counts.guards >= 40, JSON.stringify(real.counts));
check('a high-water mark exists', !!real.mark);
check('the memory has not gone backwards from the mark',
  !real.mark || (real.state.build >= real.mark.build && um.cmpVersion(real.state.release, real.mark.release) >= 0));
check('version comparison is numeric, not alphabetical', um.cmpVersion('v4.10', 'v4.9') > 0 && um.cmpVersion('4.1.0', 'v4.1') === 0 && um.cmpVersion('3.9', '4.0') < 0);

/* 2 ── mutation: copy exactly the files the ledger looks at into a temp site */
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'upgrade-memory/ledger.json'), 'utf8'));
const files = new Set(['sw.js', 'package.json', 'js/site-updates.js', 'js/build.js', 'upgrade-memory/ledger.json', 'upgrade-memory/high-water.json']);
ledger.entries.forEach(e => (e.guards || []).forEach(g => g.file && files.add(g.file)));
function freshSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaad-um-'));
  for (const f of files) {
    const from = path.join(ROOT, f);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(from, path.join(dir, f));
  }
  return dir;
}
const edit = (dir, f, fn) => { const p = path.join(dir, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const verdict = dir => um.check(dir).problems.join('\n');
const dirs = [];
function scenario(name, mutate, expect) {
  const dir = freshSite(); dirs.push(dir);
  mutate(dir);
  const v = verdict(dir);
  check(name, expect.test(v), 'got: ' + (v || '(nothing — not caught!)').slice(0, 300));
}

check('an untouched copy is clean', verdict(freshSite()) === '');
scenario('removing a fixed line is caught and named',
  d => edit(d, 'js/core.js', s => s.split("console.warn('[msg] mark read', e)").join('')), /REGRESSION \[chat-opens-when-markread-fails\]/);
scenario('re-adding a banned pattern is caught',
  d => edit(d, 'js/v3-home.js', s => s + "\ndocument.body.style.setProperty('--p', 1);\n"), /REGRESSION \[listing-scroll-shake\]/);
scenario('re-adding a banned regex is caught',
  d => edit(d, 'style.css', s => s + '\n.x{transition: all .2s;}\n'), /REGRESSION \[no-transition-all-small-controls\]/);
scenario('deleting a guarded file is caught',
  d => fs.rmSync(path.join(d, 'motion.css')), /REGRESSION \[sheets-never-overshoot\]/);
scenario('dropping a file from the service-worker precache is caught',
  d => edit(d, 'sw.js', s => s.replace("'/motion.css',", '')), /REGRESSION \[sw-precache-new-files\]/);
scenario('swapping the stylesheet load order is caught',
  d => edit(d, 'index.html', s => s.replace('<link rel="stylesheet" href="motion.css">', '').replace('<link rel="stylesheet" href="hybrid.css">', '<link rel="stylesheet" href="motion.css"><link rel="stylesheet" href="hybrid.css">')), /REGRESSION \[sheets-never-overshoot\]/);
scenario('an older service-worker build is a downgrade',
  d => edit(d, 'sw.js', s => s.replace(/(CACHE_VERSION\s*=\s*'[^']*?-v)\d+/, '$11')), /DOWNGRADE: sw\.js build/);
scenario('an older package version is a downgrade',
  d => edit(d, 'package.json', s => s.replace(/"version":\s*"[^"]+"/, '"version": "1.0.0"')), /DOWNGRADE: package\.json/);
scenario('an older release is a downgrade',
  d => edit(d, 'js/site-updates.js', s => { const k = s.match(/current:\s*'([^']+)'/)[1]; return s.replace(new RegExp("('" + k + "':\\s*\\{\\s*\\n\\s*version:\\s*)'[^']+'"), "$1'v1.0'"); }), /DOWNGRADE: current release/);
scenario('deleting a memory is caught (it must be retired instead)',
  d => edit(d, 'upgrade-memory/ledger.json', s => { const j = JSON.parse(s); j.entries.pop(); return JSON.stringify(j); }), /MEMORY LOST/);
scenario('deleting a release from the history is caught',
  d => edit(d, 'js/site-updates.js', s => s.replace(/^\s{4}'v4-fresh-look':\s*\{/m, "    'v4-renamed-away': {")), /HISTORY LOST/);
scenario('retiring a memory without a reason is rejected',
  d => edit(d, 'upgrade-memory/ledger.json', s => { const j = JSON.parse(s); j.entries[0].status = 'retired'; return JSON.stringify(j); }), /must say why/);
scenario('an entry with no guards is rejected',
  d => edit(d, 'upgrade-memory/ledger.json', s => { const j = JSON.parse(s); j.entries[0].guards = []; return JSON.stringify(j); }), /needs at least one guard/);
scenario('a build.js newer than the service worker is rejected',
  d => edit(d, 'js/build.js', s => s.replace(/YA_BUILD\s*=\s*\d+/, 'YA_BUILD = 99999')), /says build 99999/);
scenario('losing the in-page guard is caught',
  d => fs.rmSync(path.join(d, 'js/build.js')), /in-page downgrade guard is gone/);

/* stamp: refuses on a bad site, raises the mark on a good one, and never lowers it */
{
  const bad = freshSite(); dirs.push(bad);
  edit(bad, 'js/core.js', s => s.split("console.warn('[msg] mark read', e)").join(''));
  check('stamp refuses to bless a site that has regressed', um.stamp(bad).ok === false);
  const good = freshSite(); dirs.push(good);
  edit(good, 'sw.js', s => s.replace(/(CACHE_VERSION\s*=\s*'[^']*?-v)(\d+)/, (m, a, n) => a + (+n + 5)));
  const r = um.stamp(good);
  check('stamp raises the high-water mark for a newer build', r.ok && r.mark.build === real.state.build + 5);
  check('stamp syncs js/build.js to the new build', new RegExp('YA_BUILD = ' + (real.state.build + 5)).test(fs.readFileSync(path.join(good, 'js/build.js'), 'utf8')));
  check('a second stamp changes nothing', (um.stamp(good).changed || []).length === 0);
}

/* the in-page guard behaves: older build refreshes once, then accepts a real rollback */
{
  const src = fs.readFileSync(path.join(ROOT, 'js/build.js'), 'utf8');
  function run(build, store, session) {
    const calls = { replaced: 0 };
    const mk = o => ({ getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: k => { delete o[k]; } });
    const local = mk(store), sess = mk(session);
    const win = {};
    const sandbox = {
      window: win, localStorage: local, sessionStorage: sess, console: { warn() {} }, setTimeout() {}, Date,
      location: { pathname: '/', search: '', hash: '', replace() { calls.replaced++; }, reload() { calls.replaced++; } },
      navigator: {}, caches: undefined, Promise,
    };
    new Function(...Object.keys(sandbox), src.replace(/YA_BUILD\s*=\s*\d+/, 'YA_BUILD = ' + build))(...Object.values(sandbox));
    return { calls, store, session };
  }
  let r1 = run(10, {}, {});
  check('in-page guard: first visit records the build', r1.store.ya_build_hw === '10' && r1.calls.replaced === 0);
  r1 = run(11, { ya_build_hw: '10' }, {});
  check('in-page guard: a newer build raises the memory', r1.store.ya_build_hw === '11' && r1.calls.replaced === 0);
  r1 = run(9, { ya_build_hw: '10' }, {});
  check('in-page guard: an OLDER build marks a refresh attempt and leaves the memory alone', r1.session.ya_build_try === '1' && r1.store.ya_build_hw === '10');
  r1 = run(9, { ya_build_hw: '10' }, { ya_build_try: '1' });
  check('in-page guard: still older after refreshing = a real rollback, accepted, no loop', r1.store.ya_build_hw === '9' && r1.calls.replaced === 0 && !r1.session.ya_build_try);
}

dirs.forEach(d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });
if (failed) { console.error('\n' + failed + ' check(s) failed'); process.exit(1); }
console.log('\nUPGRADE-MEMORY TESTS: ALL PASSED');
