/* ═══════════════════════════════════════════════════════════
   CASH POT BANNER §CASHPOT-BANNER
   Floating pill showing the latest verified Cash Pot draw.
   Native to Yaad Adz: scraped by scrape-cashpot.js (this repo,
   runs via .github/workflows/cashpot-scraper.yml) directly into
   Yaad Adz's own Supabase project — no dependency on the separate
   CashPotJA app, its repo, or its Supabase project.

   Mirrors the #gasBanner pattern in markup/CSS (see index.html +
   style.css #gasBanner block) but owns its own fetch/render logic
   here, matching the module split used elsewhere (widgets-pwa.js
   handles the shared scroll/compact behavior for both banners;
   this file only handles Cash Pot's own data).
═══════════════════════════════════════════════════════════ */
(function () {
  const CP_URL = 'https://cquwshpsfybvgqodbxsf.supabase.co';
  const CP_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
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
    // Only ever reads rows the scraper has marked verified — see
    // scrape-cashpot.js (this repo) for the verified-badge gating logic.
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
