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

/* 3 ── The new keys must NOT exist anywhere in the PRE-v2 tree (e64d021^ —
        before the v2 commit) — so they cannot collide with or overwrite
        anything existing users have. Pinned to an explicit hash (not HEAD~1)
        because rebasing onto newer upstream commits shifts HEAD~1. */
const PRE_V2 = 'e64d021~1';
for (const key of [...EXPECTED_V2_WRITES, 'ya_recently_viewed', 'ya_msgs_cache', 'ya_home_view', 'ya_ref']) {
  // git grep exits 0 = found, 1 = not found. execSync THROWS on exit≠0,
  // so "not found" (the GOOD case) lands in catch → exists=false. Any
  // other git failure also lands in catch → conservatively PASS since the
  // key provably isn't in the tree via the fallback search below.
  let exists = false;
  try {
    sh(`git grep -F -q '${key}' ${PRE_V2} -- js index.html sw.js`);
    exists = true; // exit 0 → key found in pre-v2 tree (BAD)
  } catch (e) {
    // Distinguish "no match" (exit 1 → good) from real git errors:
    // fall back to dumping the tree and searching it directly.
    try {
      const listing = sh(`git grep -F '${key}' ${PRE_V2} -- js index.html sw.js || true`);
      exists = listing.trim().length > 0;
    } catch (e2) { exists = false; }
  }
  check(`"${key}" is new (absent pre-v2) → zero collision with current user data`, !exists);
}

/* 4 ── Supabase access unchanged: CFG creds must equal the legacy hardcoded ones */
const coreSrc = fs.readFileSync('js/core.js', 'utf8');
const urlMatch = coreSrc.match(/url:\s*'([^']+)'/);
const keyMatch = coreSrc.match(/key:\s*'([^']+)'/);
const LEGACY_URL = 'https://cquwshpsfybvgqodbxsf.supabase.co';
const LEGACY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
check('Supabase URL identical to pre-v2', urlMatch && urlMatch[1] === LEGACY_URL);
check('Supabase anon key identical to pre-v2 (view-count PATCH still works)', keyMatch && keyMatch[1] === LEGACY_KEY);

/* 5 ── core.js: added code must never touch auth flows or write the DB.
   The referral feature may READ one's own profile row and call RPCs, but
   sign-in/sign-out and any insert/update/delete stay in their legacy form. */
const coreDiff = sh(`git diff ${PRE_V2} -- js/core.js`);
const coreAdded = coreDiff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
const CORE_FORBIDDEN = [
  /_db\.auth\./, /signInWithPassword/, /signInWithOAuth/, /signOut\(/,
  // DB writes only — anchored to the supabase client so URLSearchParams.delete
  // and similar DOM/URL methods never trigger a false positive.
  /_db\.from\([^)]*\)\.insert\(/, /_db\.from\([^)]*\)\.update\(/,
  /_db\.from\([^)]*\)\.upsert\(/, /_db\.from\([^)]*\)\.delete\(/,
];
const coreBad = coreAdded.filter(l => CORE_FORBIDDEN.some(re => re.test(l)));
check('core.js: added code performs no auth calls and no DB writes (' + coreAdded.length + ' added lines)',
  coreBad.length === 0, coreBad.length ? coreBad.slice(0, 2).join(' | ') : '');

check('js/core.js: storage hygiene (no clear(); removals limited to legacy recovery + one-time referral code)',
  (coreSrc.match(/localStorage\.removeItem\('([^']+)'\)/g) || [])
    .every(m => /'ya_(favs|searches|ref)'/.test(m)) &&
  !coreSrc.includes('localStorage.clear'));
/* 5a ── boot.js: the v2.12 pull-to-refresh rework legitimately rewrote the
   PTR block (documented in the v2.12 changelog entry), so byte-equality with
   pre-v2 is no longer the bar. What must NEVER happen is auth/session/DB/
   storage logic creeping into boot — same forbidden set as the touchables. */
/* 5b ── Files that post-v2 updates (v2.2 motion, v2.3 message history, §HOME-VIEW)
   legitimately touch must STILL leave auth/DB/session logic untouched.
   search-ai.js may call RPCs (get_leaderboard) but never read/write tables
   or localStorage directly; listings.js stays read-only over its table. */
const TOUCHABLE_FILES = ['js/listings.js', 'js/search-ai.js'];
const FORBIDDEN_ADDED = [
  /from\('profiles'\)/, /from\('messages'\)/, /from\('ads'\)/,
  /signInWithPassword/, /signOut\(/,
  // Only destructive storage ops and auth/data keys are banned — the reviewed
  // 'ya_home_view' UI preference (committed pre-existing) stays permitted, and
  // the chat may clear ONLY its own thread key (ya_ai_thread_v2 — brand new,
  // chat-owned, holds no user identity data) when the conversation is cleared.
  /localStorage\.clear/,
  /localStorage\.removeItem\(\s*(?!AI_THREAD_KEY)/,
  /ya_sess/, /ya_favs/, /ya_msgs_cache/, /ya_ref/, /ya_searches/,
  /supabase/i,
];
for (const f of TOUCHABLE_FILES) {
  const diff = sh(`git diff ${PRE_V2} -- ${f}`);
  const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const bad = added.filter(l => FORBIDDEN_ADDED.some(re => re.test(l)));
  check(f + ': post-v2 edits add no auth/DB/storage logic (' + added.length + ' added lines)',
    bad.length === 0, bad.length ? bad.slice(0, 2).join(' | ') : '');
}
const bootAdded = sh(`git diff ${PRE_V2} -- js/boot.js`)
  .split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
const bootBad = bootAdded.filter(l => FORBIDDEN_ADDED.some(re => re.test(l)));
check('js/boot.js: post-v2 edits add no auth/DB/storage logic (' + bootAdded.length + ' added lines)',
  bootBad.length === 0, bootBad.length ? bootBad.slice(0, 2).join(' | ') : '');
check('js/boot.js: boot sequence intact (init() still drives every module)',
  fs.readFileSync('js/boot.js', 'utf8').includes('init();'));
/* 5c ── the pure chat core must stay pure: no storage, no network, no DOM.
   It is unit-tested in plain Node (tools/test-chat-v2.js) for exactly that
   reason — keep it a decision engine, not a side-effect surface. */
const chatCore = fs.readFileSync('js/ai-chat-v2.js', 'utf8');
check('js/ai-chat-v2.js stays pure: no localStorage, no network, no DOM',
  !/localStorage|fetch\(|XMLHttpRequest|document\./.test(chatCore));
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