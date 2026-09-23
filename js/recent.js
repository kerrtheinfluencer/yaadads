/* ═══════════════════════════════════════════════════════════
   👁️ RECENTLY VIEWED + 🕐 RECENT SEARCHES  §RECENT / §DECK  (v2)
   - Recently viewed strip above the listings grid
   - Recent-search rail inside the browse deck (desktop; the AI
     sheet carries recents on mobile)
   Storage: ya_recently_viewed (this file), ya_searches (core.js L.searches)
   ═══════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  const KEY = 'ya_recently_viewed';
  const MAX = 8;

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }
  function setRecent(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX))); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function price(a) {
    if (typeof fmtN === 'function') return 'J$' + fmtN(a.price);
    return 'J$' + Number(a.price || 0).toLocaleString('en-JM');
  }
  function thumb(url) {
    if (typeof thumbUrl === 'function') { try { return thumbUrl(url, 300); } catch (e) {} }
    return url;
  }

  /* ── Track views: wrap openDetail (chains safely with onboarding.js) ── */
  function hookTracking() {
    if (typeof window.openDetail !== 'function') { setTimeout(hookTracking, 300); return; }
    const orig = window.openDetail;
    if (orig._recentHooked) return;
    const wrapped = function(id) {
      try {
        if (id) {
          const ids = getRecent().filter(x => x !== id);
          ids.unshift(id);
          setRecent(ids);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped._recentHooked = true;
    window.openDetail = wrapped;
  }

  /* ── Recently viewed strip ── */
  function renderStrip() {
    const strip = document.getElementById('recentStrip');
    const row = document.getElementById('recentStripRow');
    if (!strip || !row) return;
    const ads = (typeof _ads !== 'undefined') ? _ads : [];
    if (!ads.length) { strip.style.display = 'none'; return; }

    // Prune ids that no longer resolve (sold & removed, deleted…)
    const ids = getRecent().filter(id => ads.some(a => a.id === id));
    if (ids.length !== getRecent().length) setRecent(ids);

    const items = ids.map(id => ads.find(a => a.id === id)).filter(Boolean).slice(0, MAX);
    if (!items.length) { strip.style.display = 'none'; return; }

    row.innerHTML = items.map(function(a) {
      const img = a.image
        ? '<img src="' + esc(thumb(a.image)) + '" alt="" loading="lazy" decoding="async">'
        : '<div class="recent-noimg" aria-hidden="true">📦</div>';
      return '<div class="recent-card" data-id="' + esc(a.id) + '" role="button" tabindex="0" aria-label="View ' + esc(a.title) + '">' +
        img +
        '<div class="recent-card-body">' +
          '<div class="recent-card-price">' + price(a) + '</div>' +
          '<div class="recent-card-title">' + esc(a.title) + '</div>' +
        '</div></div>';
    }).join('');

    strip.style.display = 'block';
    // §RAIL-FADE — the strip is a sideways rail, so the edge that still hides
    // more cards fades out (js/ui-nav.js) exactly like the category rail does.
    if (typeof initRailFade === 'function') initRailFade(row);
    row.querySelectorAll('.recent-card').forEach(function(card) {
      const open = function() { if (typeof openDetail === 'function') openDetail(card.dataset.id); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });

    const clearBtn = document.getElementById('recentClear');
    if (clearBtn && !clearBtn._wired) {
      clearBtn._wired = true;
      clearBtn.addEventListener('click', function() {
        setRecent([]);
        strip.style.display = 'none';
        if (typeof showToast === 'function') showToast('Recently viewed cleared', '🧹');
      });
    }
  }

  /* ── Recent searches rail (desktop; mobile has recents in the AI sheet) ──
     Kept deliberately quiet: the clock lives on the label instead of on every
     chip, emails (people sign in through the search box by mistake) and
     runaway strings never make it in, and chip text ellipsises instead of
     stretching the row. Removal stays per-chip — ya_searches is shared with
     the AI sheet, so this file never wipes the whole list (test-data-safety
     guards that). */
  const MAX_CHIPS = 5;
  const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function searchList() {
    let raw = [];
    try { if (typeof L !== 'undefined' && Array.isArray(L.searches)) raw = L.searches; } catch (e) {}
    const seen = {};
    return raw.filter(function(s) {
      if (typeof s !== 'string') return false;
      const q = s.trim();
      if (!q || q.length > 40 || LOOKS_LIKE_EMAIL.test(q)) return false;
      const key = q.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function(s) { return s.trim(); }).slice(0, MAX_CHIPS);
  }

  function renderRecentSearches() {
    const row = document.getElementById('recentSearchRow');
    if (!row) return;
    if (window.innerWidth <= 640) { row.classList.remove('show'); return; }
    const searches = searchList();
    let searching = false;
    try { searching = typeof searchQ !== 'undefined' && !!searchQ; } catch (e) {}
    if (!searches.length || searching) { row.classList.remove('show'); return; }

    row.innerHTML =
      '<span class="rsr-label"><span aria-hidden="true">🕘</span>Recent</span>' +
      searches.map(function(s) {
        return '<span class="recent-search-chip" data-q="' + esc(s) + '" role="button" tabindex="0" aria-label="Search for ' + esc(s) + '">' +
          '<span class="rsr-txt">' + esc(s) + '</span>' +
          '<button class="rsr-x" type="button" aria-label="Remove ' + esc(s) + ' from recent searches">✕</button>' +
        '</span>';
      }).join('');
    row.classList.add('show');

    row.querySelectorAll('.recent-search-chip').forEach(function(chip) {
      const q = chip.dataset.q;
      const run = function() {
        const inp = document.getElementById('navSearchInput');
        if (inp) inp.value = q;
        if (typeof handleNavSearch === 'function') handleNavSearch();
      };
      chip.addEventListener('click', run);
      chip.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
      });
      const x = chip.querySelector('.rsr-x');
      if (x) x.addEventListener('click', function(e) {
        e.stopPropagation();
        try { if (typeof L !== 'undefined') L.searches = L.searches.filter(s => s !== q); } catch (err) {}
        renderRecentSearches();
      });
    });
  }

  /* ── Re-render whenever the home grid re-renders ──
     renderHome is a global (function declaration in search-ai.js), so we
     wrap it once — this picks up load, search, filter and sort changes. */
  function hookRender() {
    if (typeof window.renderHome !== 'function') { setTimeout(hookRender, 300); return; }
    const orig = window.renderHome;
    if (orig._recentHooked) return;
    const wrapped = function() {
      const r = orig.apply(this, arguments);
      try { renderStrip(); renderRecentSearches(); } catch (e) {}
      return r;
    };
    wrapped._recentHooked = true;
    window.renderHome = wrapped;
  }

  // First paint (in case renderHome was already called before we hooked)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      hookTracking(); hookRender();
      setTimeout(function() { renderStrip(); renderRecentSearches(); }, 600);
    });
  } else {
    hookTracking(); hookRender();
    setTimeout(function() { renderStrip(); renderRecentSearches(); }, 600);
  }
})();