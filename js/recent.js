/* ═══════════════════════════════════════════════════════════
   👁️ RECENTLY VIEWED + 🕐 RECENT SEARCHES  §RECENT  (v2)
   - Recently viewed strip above the listings grid
   - Desktop recent-search chips under the results header
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
        ? '<img src="' + esc(thumb(a.image)) + '" alt="" loading="lazy">'
        : '<div style="width:100%;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:var(--surface-2);font-size:28px">📦</div>';
      return '<div class="recent-card" data-id="' + esc(a.id) + '" role="button" tabindex="0" aria-label="View ' + esc(a.title) + '">' +
        img +
        '<div class="recent-card-body">' +
          '<div class="recent-card-price">' + price(a) + '</div>' +
          '<div class="recent-card-title">' + esc(a.title) + '</div>' +
        '</div></div>';
    }).join('');

    strip.style.display = 'block';
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

  /* ── Recent searches row (desktop; mobile has recents in the AI sheet) ── */
  function renderRecentSearches() {
    const row = document.getElementById('recentSearchRow');
    if (!row) return;
    if (window.innerWidth <= 640) { row.classList.remove('show'); return; }
    let searches = [];
    try { if (typeof L !== 'undefined' && L.searches) searches = L.searches; } catch (e) {}
    let searching = false;
    try { searching = typeof searchQ !== 'undefined' && !!searchQ; } catch (e) {}
    if (!searches.length || searching) { row.classList.remove('show'); return; }

    row.innerHTML = '<span class="rsr-label">🕐 Recent</span>' + searches.slice(0, 6).map(function(s) {
      return '<span class="recent-search-chip" data-q="' + esc(s) + '" role="button" tabindex="0" aria-label="Search for ' + esc(s) + '">' +
        '🕐 ' + esc(s) +
        '<button class="rsr-x" type="button" aria-label="Remove ' + esc(s) + '">✕</button>' +
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