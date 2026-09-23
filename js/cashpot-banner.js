/* ═══════════════════════════════════════════════════════════
   CASH POT BANNER §CASHPOT-BANNER
   Floating pill showing the latest verified Cash Pot draw,
   read directly from CashPotJA's Supabase project (cross-project
   public read — that table is locked to anon SELECT only, no
   write access from here or anywhere client-side).

   Mirrors the #gasBanner pattern in markup/CSS (see index.html +
   style.css #gasBanner block) but owns its own fetch/render logic
   here, matching the module split used elsewhere (widgets-pwa.js
   handles the shared scroll/compact behavior for both banners;
   this file only handles Cash Pot's own data).
═══════════════════════════════════════════════════════════ */
(function () {
  const CP_URL = 'https://xnokltjszzgaswccjpax.supabase.co';
  const CP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhub2tsdGpzenpnYXN3Y2NqcGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTQyODAsImV4cCI6MjA4OTc3MDI4MH0.FgGKae2ksWnXDEB0_Mx0MNLucuKXOAO1lJrR6CbDwHM';
  const SLOT_NAMES = ['Early Bird', 'Morning', 'Midday', 'Mid-Aft', 'Drive Time', 'Evening'];
  const REFRESH_MS = 3 * 60 * 1000; // re-check every 3 min — draws land roughly every 2 hrs, no need to poll harder

  const numEl = document.getElementById('cashpotBannerNum');
  const subEl = document.getElementById('cashpotBannerSub');
  if (!numEl || !subEl) return; // banner not on this page

  function render(row) {
    numEl.textContent = row.number;
    const extras = (row.is_mega ? ' ⭐' : '') + (row.is_monsta ? ' 🔴' : '');
    subEl.textContent = (SLOT_NAMES[row.slot] || 'Latest') + extras;
  }

  function renderFallback() {
    numEl.textContent = '—';
    subEl.textContent = 'Tap for results';
  }

  function fetchLatest() {
    // Only ever reads rows the server-side scraper has marked verified —
    // see CashPotJA's scrape-cashpot.js for that gating logic.
    const url = CP_URL +
      '/rest/v1/cashpot_results?verified=eq.true&select=draw_date,slot,number,is_mega,is_monsta' +
      '&order=draw_date.desc,slot.desc&limit=1';

    fetch(url, { headers: { apikey: CP_KEY, Authorization: 'Bearer ' + CP_KEY } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (rows) {
        if (!rows || !rows.length) throw new Error('no verified rows yet');
        render(rows[0]);
      })
      .catch(function (err) {
        console.warn('[CashPotBanner] fetch failed:', err.message || err);
        renderFallback();
      });
  }

  fetchLatest();
  setInterval(fetchLatest, REFRESH_MS);
})();
