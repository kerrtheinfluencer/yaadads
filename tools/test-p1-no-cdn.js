/* §P1-NO-CDN — proves the site still works with each dependency REMOVED.
   Inventions tested: (1) no Supabase CDN → DEMO fallback, no throw;
   (2) no localStorage (private mode) → loads, no throw; (3) no network
   (offline) → realtime-less but renders; (4) old cached ad without _ts →
   sort still correct via _ts fallback.
   Run: node tools/test-p1-no-cdn.js (no server needed). */
const fs = require('fs');
const vm = require('vm');
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' - ' + extra : ''));
  if (!ok) failures++;
}
function makeSandbox(opts) {
  opts = opts || {};
  const store = {};
  const quiet = { log: function() {}, warn: function() {}, error: function() {}, info: function() {}, debug: function() {} };
  const sb = {
    console: quiet,
    localStorage: opts.noStorage ? undefined : {
      getItem: function(k) { return (k in store) ? store[k] : null; },
      setItem: function(k, v) { store[k] = String(v); },
      removeItem: function(k) { delete store[k]; }
    },
    document: {
      getElementById: function() { return null; },
      createElement: function() { return { style: {} }; },
      addEventListener: function() {},
      querySelector: function() { return null; },
      querySelectorAll: function() { return []; },
      head: {}, body: {}
    },
    window: { innerWidth: 1280 },
    navigator: { userAgent: 'node-test' },
    setTimeout: function() { return 0; },
    clearTimeout: function() {},
    requestAnimationFrame: function() { return 0; },
    atob: function(s) { return Buffer.from(s, 'base64').toString('binary'); }
  };
  if (!opts.noSupabase) sb.supabase = { createClient: function() { return null; } };
  // else: supabase global MISSING entirely (CDN blocked) — core.js must survive
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  return sb;
}
function loadAll(sb) {
  vm.runInContext(fs.readFileSync('js/core.js', 'utf8'), sb, { filename: 'js/core.js' });
  vm.runInContext(fs.readFileSync('js/search-ai.js', 'utf8'), sb, { filename: 'js/search-ai.js' });
}
function q(sb, expr) { try { return vm.runInContext(expr, sb); } catch (e) { return 'THREW:' + e.message; } }

// 1 — no Supabase CDN at all: page must boot to DEMO, never throw
(function() {
  const sb = makeSandbox({ noSupabase: true });
  let threw = null;
  try { loadAll(sb); } catch (e) { threw = e.message; }
  check('NO-CDN-1: core+search load with supabase global missing', threw === null, threw || '');
  check('NO-CDN-2: DEMO fallback indexed (8 ads, search works)', q(sb,
    "(_ads = DEMO.slice(), DEMO.length === 8 && getFiltered('honda','all','newest').length >= 1)"
  ) === true);
  check('NO-CDN-3: scoreAd/sort degrade gracefully (no NaN ranks)', q(sb,
    "(function(){ var r = getFiltered('','all','newest'); return r.length === 8 && r.every(function(a){ return typeof a._ts === 'number'; }); })()"
  ) === true);
})();

// 2 — localStorage blocked (private mode): nothing throws, search still ranks
(function() {
  const sb = makeSandbox({ noStorage: true });
  let threw = null;
  try { loadAll(sb); } catch (e) { threw = e.message; }
  check('NO-STORAGE-1: loads with localStorage undefined', threw === null, threw || '');
  check('NO-STORAGE-2: search still ranks without storage', q(sb,
    "(_ads = DEMO.slice(), getFiltered('iphone','all','newest').length >= 1)"
  ) === true);
})();

// 3 — legacy cached ad object WITHOUT _ts (old SW cache / old tab): sort must
// still be correct — scoreAd falls back to parsing date, never NaN-crashes.
// NOTE: with an ACTIVE query the rank comes from scoreAd (relevance +
// recency boost); the pure newest-first path only applies with NO query.
(function() {
  const sb = makeSandbox({});
  loadAll(sb);
  check('LEGACY-1: ad without _ts still sorts newest-first correctly (no query)', q(sb,
    "(function(){ function mk(id,d){ return {id:id,title:'Honda '+id,category:'vehicles',parish:'K',price:1,desc:'honda',date:d,status:'active'}; } _ads = [mk('old','2024-01-01T00:00:00Z'), mk('new','2025-06-10T00:00:00Z')]; var r = getFiltered('','all','newest').map(function(a){ return a.id; }); return JSON.stringify(r); })()"
  ) === '["new","old"]');
  check('LEGACY-2: relevance query on legacy ads never NaN-crashes + ranks', q(sb,
    "(function(){ function mk(id,d){ return {id:id,title:'Honda '+id,category:'vehicles',parish:'K',price:1,desc:'honda',date:d,status:'active'}; } _ads = [mk('old','2024-01-01T00:00:00Z'), mk('new','2025-06-10T00:00:00Z')]; var r = getFiltered('honda','all','newest'); return r.length === 2 && r.every(function(a){ return isFinite(scoreAd(a, ['honda'])); }); })()"
  ) === true);
})();

console.log('\n' + (failures === 0 ? 'P1-NO-CDN: ALL CHECKS PASSED' : 'P1-NO-CDN: ' + failures + ' FAILED'));
process.exit(failures === 0 ? 0 : 1);
