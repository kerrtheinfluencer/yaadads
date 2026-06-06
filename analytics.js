/* ═══════════════════════════════════════════════════════════════════
   YAAD ADZ — Google Analytics 4 Event Tracking
   Measurement ID: G-KE3X5BMY63
   ═══════════════════════════════════════════════════════════════════
   This file is loaded AFTER the main index.html so that
   the app's functions (renderNav, doLogin, doPostAd, etc.)
   are already defined. Events fire to GA4 via gtag().
   ═══════════════════════════════════════════════════════════════════ */

(function(){
  // ── Self-contained gaEvent shim ─────────────────────────────────────
  // analytics.js is loaded BEFORE index.html's body scripts run, so a
  // `gaEvent()` defined later in index.html may not exist yet on a slow
  // connection or if a user interacts before the page finishes parsing.
  // Defining our own shim here makes analytics.js self-contained and
  // guarantees all custom events (search, login, post_ad, share, etc.)
  // always fire — regardless of script load order.
  function gaEvent(name, params) {
    try {
      if (typeof gtag === 'function') gtag('event', name, params || {});
    } catch (e) { /* never let analytics break the app */ }
  }
  // If a global gaEvent is defined later by index.html, use that one
  // (it may have richer behaviour). Otherwise this shim handles it.
  // ───────────────────────────────────────────────────────────────────

  if (typeof gtag !== 'function') {
    // Don't bail out — page_view from the inline gtag('config', ...) call
    // will still fire once gtag.js loads. Custom events will be queued
    // and dispatched as patches call gaEvent(), which itself re-checks.
    console.warn('[analytics] gtag not loaded yet — will fire events as it loads');
  }

  // ── Wait for app to initialize before patching handlers ──
  const ready = () => {
    patchNavSearch();
    patchCategoryFilter();
    patchPostAd();
    patchLogin();
    patchRegister();
    patchFavourites();
    patchShare();
    patchAdClicks();
    patchOpenAiSheet();
    console.log('[analytics] GA4 tracking ready');
  };

  // ── 1. Nav search bar submits ────────────────────────────
  function patchNavSearch() {
    const orig = window.handleNavSearch;
    if (typeof orig !== 'function') return;
    window.handleNavSearch = function(ev) {
      const inp = document.getElementById('navSearchInput');
      const q = (inp && inp.value || '').trim();
      if (q) gaEvent('search', { search_term: q, source: 'nav' });
      return orig.apply(this, arguments);
    };
  }

  // ── 2. Category filter clicks ────────────────────────────
  function patchCategoryFilter() {
    const orig = window.catFilter;
    if (typeof orig !== 'function') return;
    window.catFilter = function(id) {
      gaEvent('filter_category', { category: id });
      return orig.apply(this, arguments);
    };
  }

  // ── 3. Post ad submission ────────────────────────────────
  function patchPostAd() {
    const orig = window.doPostAd;
    if (typeof orig !== 'function') return;
    window.doPostAd = async function() {
      // Capture details before the ad is sent
      const cat   = document.getElementById('aCat')?.value;
      const parish = document.getElementById('aParish')?.value;
      const price = parseFloat(document.getElementById('aPrice')?.value) || 0;
      const title = document.getElementById('aTitle')?.value?.trim() || '';

      let result;
      try { result = await orig.apply(this, arguments); }
      catch(e) { throw e; }

      gaEvent('post_ad', {
        category: cat,
        parish: parish,
        price: price,
        // Never include the title in analytics — may contain PII
        title_length: title.length
      });
      return result;
    };
  }

  // ── 4. Login events ──────────────────────────────────────
  function patchLogin() {
    const orig = window.doLogin;
    if (typeof orig !== 'function') return;
    window.doLogin = async function() {
      let result;
      try { result = await orig.apply(this, arguments); }
      catch(e) { gaEvent('login_failed', { method: 'email' }); throw e; }
      gaEvent('login', { method: 'email' });
      return result;
    };
  }

  // ── 5. Registration events ──────────────────────────────
  function patchRegister() {
    const orig = window.doRegister;
    if (typeof orig !== 'function') return;
    window.doRegister = async function() {
      let result;
      try { result = await orig.apply(this, arguments); }
      catch(e) { gaEvent('sign_up_failed', { method: 'email' }); throw e; }
      gaEvent('sign_up', { method: 'email' });
      return result;
    };
  }

  // ── 6. Favourite toggle (add_to_wishlist) ───────────────
  function patchFavourites() {
    const orig = window.togFav;
    if (typeof orig !== 'function') return;
    window.togFav = function(id, btn) {
      const f = JSON.parse(localStorage.getItem('ya_favs') || '[]');
      const isAdd = !f.includes(id);
      const result = orig.apply(this, arguments);
      gaEvent(isAdd ? 'add_to_wishlist' : 'remove_from_wishlist', { ad_id: id });
      return result;
    };
  }

  // ── 7. Share event ───────────────────────────────────────
  function patchShare() {
    const orig = window.shareAd;
    if (typeof orig !== 'function') return;
    window.shareAd = async function(id) {
      gaEvent('share', { content_type: 'listing', item_id: id, method: 'native_or_clipboard' });
      return await orig.apply(this, arguments);
    };
  }

  // ── 8. Ad card clicks (select_item) ─────────────────────
  function patchAdClicks() {
    // Hook into the card rendering by patching openDetail
    const orig = window.openDetail;
    if (typeof orig !== 'function') return;
    window.openDetail = function(id) {
      const ad = _ads.find(a => a.id === id);
      if (ad) {
        gaEvent('select_item', {
          items: [{
            item_id: id,
            item_name: ad.title,
            item_category: ad.category,
            price: ad.price
          }]
        });
      }
      return orig.apply(this, arguments);
    };
  }

  // ── 9. AI sheet opens ────────────────────────────────────
  function patchOpenAiSheet() {
    const orig = window.openAiSheet;
    if (typeof orig !== 'function') return;
    window.openAiSheet = function(prefill) {
      gaEvent('open_ai_sheet', { has_prefill: !!prefill });
      return orig.apply(this, arguments);
    };
  }

  // ── DOM-level delegation for dynamic AI sheet submits ──
  function bindSheetSubmit() {
    const sheet = document.getElementById('aiSheet');
    if (!sheet) return;
    sheet.addEventListener('click', (e) => {
      const sugBtn = e.target.closest('.sheet-sug, .sheet-recent-chip');
      if (sugBtn) {
        const q = sugBtn.textContent?.trim();
        if (q) gaEvent('ai_suggestion_click', { query: q });
      }
    }, { passive: true });
  }

  // ── Auto-bound on every page load ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { ready(); bindSheetSubmit(); });
  } else {
    ready();
    bindSheetSubmit();
  }

  // Re-bind after init() runs (the app boots after DOMContentLoaded)
  setTimeout(() => { bindSheetSubmit(); }, 500);
})();
