/* ── §UPGRADE-MEMORY (in the page) — this tab never runs an OLDER build than it has already run ──
   YA_BUILD is stamped from sw.js's CACHE_VERSION by `node tools/upgrade-memory.js stamp`
   (the Upgrade Memory bot does it after every push). The highest build this browser has ever
   run is remembered in localStorage. If an older copy of the site turns up — a stale service-worker
   cache, an old file served by a CDN edge, a bad rollback — the page throws away its caches and
   reloads ONCE to fetch the current build, instead of quietly bringing back problems that were
   already fixed. If the newest build really is older (an intentional rollback), the memory is
   lowered so nobody is stuck in a loop. Must stay the FIRST script on the page. */
(function () {
  var YA_BUILD = 150;
  window.YA_BUILD = YA_BUILD;
  var KEY = 'ya_build_hw', TRY = 'ya_build_try';
  var seen = 0, tried = null;
  try { seen = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) {}
  try { tried = sessionStorage.getItem(TRY); } catch (e) {}

  if (YA_BUILD >= seen) {
    try { if (YA_BUILD > seen) localStorage.setItem(KEY, String(YA_BUILD)); sessionStorage.removeItem(TRY); } catch (e) {}
    return;
  }
  /* older than something this browser already ran */
  if (tried) {                       // we already purged once this session and still got the older build: it is a real rollback
    try { localStorage.setItem(KEY, String(YA_BUILD)); sessionStorage.removeItem(TRY); } catch (e) {}
    try { console.warn('[upgrade-memory] server is on build ' + YA_BUILD + ', older than ' + seen + ' — accepting the rollback'); } catch (e) {}
    return;
  }
  try { sessionStorage.setItem(TRY, '1'); } catch (e) { return; }
  try { console.warn('[upgrade-memory] stale build ' + YA_BUILD + ' < ' + seen + ' — refreshing to the current build'); } catch (e) {}
  var jobs = [];
  try { if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) {}
  try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) {}
  var done = false;
  function go() { if (done) return; done = true; try { location.replace(location.pathname + location.search + (location.search ? '&' : '?') + '_b=' + Date.now() + location.hash); } catch (e) { location.reload(); } }
  Promise.all(jobs).then(go, go);
  setTimeout(go, 2500);
})();
