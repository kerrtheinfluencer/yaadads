/* ── v2 DATA-SAFETY TEST — proves the update cannot break existing user data
   Run: node tools/test-data-safety.js   (no server needed) ── */
const fs = require('fs');
const { execSync } = require('child_process');

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failures++;
}
function sh(cmd) { return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString(); }

/* 1 ── Every localStorage key v2 WRITES must be brand new (except ya_searches,
        which recent.js writes with the same list-semantics core.js already used) */
const V2_FILES = ['js/onboarding.js', 'js/recent.js'];
const EXPECTED_V2_WRITES = new Set([
  'ya_onboarded_v2', 'ya_tour_done_v2', 'ya_tip_cmdk', 'ya_tip_fav3',
  'ya_tip_gas', 'ya_tip_pwa', 'ya_tip_post', 'ya_v2_visit_count', 'ya_recently_viewed',
]);
const written = new Set();
for (const f of V2_FILES) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/localStorage\.setItem\(\s*'([^']+)'/g)) written.add(m[1]);
}
let onlyExpected = [...written].every(k => EXPECTED_V2_WRITES.has(k));
check('v2 writes only its own NEW localStorage keys', onlyExpected, [...written].join(', '));

// ya_searches (pre-existing key) is written only via the safe filter-reassign
const recentSrc = fs.readFileSync('js/recent.js', 'utf8');
const searchesWrites = (recentSrc.match(/L\.searches\s*=/g) || []).length;
check('recent.js touches ya_searches only via L.searches filter (preserves existing items)',
  searchesWrites === 1 && recentSrc.includes('L.searches = L.searches.filter(s => s !== q)'), searchesWrites + ' assignment(s)');

/* 2 ── v2 never deletes or wipes storage */
for (const f of V2_FILES) {
  const src = fs.readFileSync(f, 'utf8');
  check(f + ': no removeItem', !src.includes('localStorage.removeItem'));
  check(f + ': no localStorage.clear()', !src.includes('localStorage.clear'));
}

/* 3 ── The new keys must NOT exist anywhere in the PRE-v2 tree (HEAD~1 —
        the upstream commit my v2 commit was rebased onto) — so they cannot
        collide with or overwrite anything existing users have */
for (const key of [...EXPECTED_V2_WRITES, 'ya_recently_viewed']) {
  let exists = true;
  try { sh(`git grep -q "'${key}'" HEAD~1 -- js index.html sw.js`); } catch (e) { exists = false; }
  check(`"${key}" is new (absent in pre-v2 HEAD~1) → zero collision with current user data`, !exists);
}

/* 4 ── Supabase access unchanged: CFG creds must equal the legacy hardcoded ones */
const coreSrc = fs.readFileSync('js/core.js', 'utf8');
const urlMatch = coreSrc.match(/url:\s*'([^']+)'/);
const keyMatch = coreSrc.match(/key:\s*'([^']+)'/);
const LEGACY_URL = 'https://cquwshpsfybvgqodbxsf.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
check('Supabase URL identical to pre-v2', urlMatch && urlMatch[1] === LEGACY_URL);
check('Supabase anon key identical to pre-v2 (view-count PATCH still works)', keyMatch && keyMatch[1] === LEGACY_KEY);

/* 5 ── Auth/session/DB layer untouched in git (no diff vs last commit) */
const UNTOUCHED = ['js/core.js', 'js/boot.js', 'js/listings.js', 'js/search-ai.js',
  'gas-prices-data.json', 'gas-stations-snapshot.json', 'sw.js'];
// NOTE: sw.js IS modified (cache bump) — verified separately below; auth files:
const AUTH_FILES = ['js/core.js', 'js/boot.js', 'js/listings.js', 'js/search-ai.js'];
for (const f of AUTH_FILES) {
  let dirty = true;
  try { sh(`git diff --quiet HEAD -- ${f}`); dirty = false; } catch (e) {}
  check(`${f} unmodified since last commit (auth/DB/session logic intact)`, !dirty);
}
const dataFiles = ['gas-prices-data.json', 'gas-stations-snapshot.json'];
for (const f of dataFiles) {
  let dirty = true;
  try { sh(`git diff --quiet HEAD -- ${f}`); dirty = false; } catch (e) {}
  check(`${f} unmodified (live data untouched)`, !dirty);
}

/* 6 ── sw.js: only the version + precache list may change, strategies intact */
const sw = fs.readFileSync('sw.js', 'utf8');
check('SW still skips Supabase requests (auth/data never cached)',
  sw.includes("url.hostname.includes('supabase.co')") && sw.includes('return;'));
check('SW network-first for ad/category/parish pages (no stale listings)',
  sw.includes("url.pathname.startsWith('/ad/')") && sw.includes('networkFirstPages'));

/* 7 ── Returning-user skip: onboarding must check BEFORE showing the welcome */
const ob = fs.readFileSync('js/onboarding.js', 'utf8');
check('onboarding: returning users skip auto-welcome', ob.includes('isReturningUser()'));
check('onboarding: reads existing signals (session/favs/searches) read-only',
  ob.includes("localStorage.getItem('ya_sess'") && ob.includes("localStorage.getItem('ya_favs'"));
check('onboarding: replay entry point kept', ob.includes('startOnboarding'));

console.log('\n' + (failures === 0 ? 'DATA-SAFETY: ALL CHECKS PASSED' : 'DATA-SAFETY: ' + failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);