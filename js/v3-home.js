/* ═══════════════════════════════════════════════════════════════════════════
   §V3-HOME — the Lagoon home screen's behaviour (parish picker, Saved view,
   greeting, bell dot, "More" categories).
   ───────────────────────────────────────────────────────────────────────────
   Wraps existing globals instead of editing them, so removing this one
   <script> line (and the matching v3 CSS) returns the app to how it was:
     getFiltered → adds the parish + saved filters on top of the normal result
     catFilter   → tapping the active category again goes back to "all"
     goHome      → clears the Saved view
     renderCats  → re-adds the "More" button after the rail is rebuilt
     renderNav   → refreshes the greeting when sign-in state changes
     updateMsgBadge → mirrors the unread dot onto the home bell
   Published API: window.v3ShowSaved, window.v3HomeState. Nothing else leaks.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PARISH_KEY = 'ya_v3_parish';
  var state = { parish: '', saved: false };
  window.v3HomeState = state;

  function $(id) { return document.getElementById(id); }
  function safe(fn) { try { return fn(); } catch (e) { /* never break boot */ } }

  /* ── restore the member's last parish ── */
  safe(function () {
    var p = localStorage.getItem(PARISH_KEY) || '';
    if (p && typeof PARISHES !== 'undefined' && PARISHES.indexOf(p) > -1) state.parish = p;
  });

  /* Saved view with nothing saved yet: say so, instead of the generic "no search results". */
  function savedEmptyState() {
    if (!state.saved) return;
    var grid = $('homeGrid');
    var e = grid && grid.querySelector('.empty');
    if (!e || e.getAttribute('data-v3')) return;
    e.setAttribute('data-v3', '1');
    var parishNote = state.parish ? ' in ' + state.parish.replace(/[<>&"]/g, '') : '';
    e.innerHTML = '<div class="empty-icon">🤍</div><h3>Nothing saved' + parishNote + ' yet</h3>' +
      '<p>Tap the heart on any listing and it will wait for you here.</p>' +
      '<button type="button" class="btn btn-gold" onclick="goHome()">Browse listings</button>';
  }

  /* ── re-render helpers ── */
  function refresh(scrollToFeed) {
    safe(function () { if (typeof renderCats === 'function') renderCats(); });
    safe(function () { if (typeof renderHome === 'function') renderHome(); });
    syncFilterChips();
    syncLocation();
    safe(savedEmptyState);
    if (scrollToFeed) {
      setTimeout(function () {
        var el = $('v3Filters') || $('homeGrid');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  /* ── 1. filters layered onto the normal result ── */
  if (typeof window.getFiltered === 'function') {
    var origGetFiltered = window.getFiltered;
    window.getFiltered = function () {
      var r = origGetFiltered.apply(this, arguments);
      if (state.parish) r = r.filter(function (a) { return a.parish === state.parish; });
      if (state.saved && typeof isFav === 'function') r = r.filter(function (a) { return isFav(a.id); });
      return r;
    };
  }

  /* ── 2. tap the active category again → back to all ── */
  if (typeof window.catFilter === 'function') {
    var origCatFilter = window.catFilter;
    window.catFilter = function (id) {
      if (typeof activeF !== 'undefined' && id === activeF && id !== 'all') id = 'all';
      var r = origCatFilter.call(this, id);
      safe(syncFilterChips);
      return r;
    };
  }

  /* ── keep the chips + result-row layout in step with every home render
     (typed search, AI search, category tap all end in renderHome) ── */
  if (typeof window.renderHome === 'function') {
    var origRenderHome = window.renderHome;
    window.renderHome = function () {
      var out = origRenderHome.apply(this, arguments);
      safe(syncFilterChips);
      return out;
    };
  }

  /* ── 3. Home clears the Saved view ── */
  if (typeof window.goHome === 'function') {
    var origGoHome = window.goHome;
    window.goHome = function () {
      var wasSaved = state.saved;
      state.saved = false;
      var out = origGoHome.apply(this, arguments);
      if (wasSaved) safe(function () { refresh(false); });
      syncFilterChips();
      return out;
    };
  }

  /* ── the Saved tab ── */
  window.v3ShowSaved = function () {
    safe(function () {
      var onHome = $('page-home') && $('page-home').classList.contains('active');
      if (!onHome) origGoHomeSafe();
      state.saved = true;
      document.querySelectorAll('.mob-nav-item').forEach(function (el) { el.classList.remove('active'); });
      var tab = $('mnSaved');
      if (tab) tab.classList.add('active');
      refresh(true);
    });
  };
  function origGoHomeSafe() {
    // go to the home page without resetting our own state first
    var keep = state.saved;
    if (typeof window.goHome === 'function') window.goHome();
    state.saved = keep;
  }

  /* ── 4. parish picker ── */
  function syncLocation() {
    var lab = $('v3LocLabel'), sel = $('v3LocSel');
    if (lab) lab.textContent = state.parish || 'All Jamaica';
    if (sel && sel.value !== state.parish) sel.value = state.parish;
  }
  function bindLocation() {
    var sel = $('v3LocSel');
    if (!sel || sel._v3) return;
    sel._v3 = true;
    sel.addEventListener('change', function () {
      state.parish = sel.value || '';
      safe(function () { localStorage.setItem(PARISH_KEY, state.parish); });
      refresh(true);
    });
    syncLocation();
  }

  /* ── active-filter chips under the category row ── */
  function syncFilterChips() {
    var deck = document.querySelector('.browse-deck');
    if (!deck) return;
    var box = $('v3Filters');
    if (!box) {
      box = document.createElement('div');
      box.id = 'v3Filters';
      box.className = 'v3-filters';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Active filters');
      deck.parentNode.insertBefore(box, deck.nextSibling);
    }
    var chips = '';
    safe(function () {
      if (typeof activeF !== 'undefined' && activeF && activeF !== 'all' && typeof catById === 'function') {
        var c = catById(activeF);
        chips += '<button type="button" class="v3-fchip" data-clear="cat">' + String(c.name || 'Category').replace(/[<>&"]/g, '') + ' <span aria-hidden="true">✕</span></button>';
      }
    });
    var q = '';
    safe(function () { if (typeof searchQ !== 'undefined' && searchQ) q = String(searchQ); });
    document.body.classList.toggle('v3-rows', !!q);
    if (q) chips += '<button type="button" class="v3-fchip" data-clear="query">🔍 ' + q.replace(/[<>&"]/g, '').slice(0, 40) + ' <span aria-hidden="true">✕</span></button>';
    if (state.saved) chips += '<button type="button" class="v3-fchip" data-clear="saved">♥ Saved listings <span aria-hidden="true">✕</span></button>';
    if (state.parish) chips += '<button type="button" class="v3-fchip" data-clear="parish">📍 ' + state.parish.replace(/[<>&"]/g, '') + ' <span aria-hidden="true">✕</span></button>';
    box.innerHTML = chips;
    box.hidden = !chips;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.v3-fchip');
    if (!b) return;
    if (b.getAttribute('data-clear') === 'cat') {
      if (typeof window.catFilter === 'function') window.catFilter('all');
      syncFilterChips();
      return;
    }
    if (b.getAttribute('data-clear') === 'query') {
      if (typeof window.goHome === 'function') window.goHome();
      syncFilterChips();
      return;
    }
    if (b.getAttribute('data-clear') === 'saved') {
      state.saved = false;
      document.querySelectorAll('.mob-nav-item').forEach(function (el) { el.classList.remove('active'); });
      var h = $('mnHome'); if (h) h.classList.add('active');
    } else {
      state.parish = '';
      safe(function () { localStorage.removeItem(PARISH_KEY); });
    }
    refresh(false);
  });

  /* ── 5. "More" categories ── */
  function ensureMore() {
    var row = $('catRow');
    if (!row || row.querySelector('.v3-more')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'v3-more';
        b.setAttribute('aria-label', 'Browse all categories');
    b.innerHTML = '<span class="cp-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg></span><span class="cp-name">More</span>';
    b.addEventListener('click', function () { if (typeof goPage === 'function') goPage('browse'); });
    row.appendChild(b);
  }
  if (typeof window.renderCats === 'function') {
    var origRenderCats = window.renderCats;
    window.renderCats = function () {
      var out = origRenderCats.apply(this, arguments);
      safe(ensureMore);
    safe(setupHeroSearch);
    safe(setupAiFloat);
    safe(setupListingDepth);
      return out;
    };
  }

  /* ── 6. greeting + bell ── */
  function greet() {
    var el = $('v3GreetName');
    if (!el) return;
    var name = '';
    safe(function () { if (typeof CU !== 'undefined' && CU && CU.name) name = String(CU.name).trim().split(/\s+/)[0]; });
    el.textContent = (name || 'Jamaica') + '.';
  }
  if (typeof window.renderNav === 'function') {
    var origRenderNav = window.renderNav;
    window.renderNav = function () {
      var out = origRenderNav.apply(this, arguments);
      safe(greet);
      return out;
    };
  }
  function syncBell() {
    var dot = $('v3BellDot'), badge = $('mobMsgBadge');
    if (!dot) return;
    dot.hidden = !(badge && badge.classList.contains('show'));
  }
  if (typeof window.updateMsgBadge === 'function') {
    var origBadge = window.updateMsgBadge;
    window.updateMsgBadge = function () {
      var out = origBadge.apply(this, arguments);
      safe(syncBell);
      return out;
    };
  }


  /* ── 7. Browse hub (board S) + search result rows (board J) ── */
  var ICONS = {
    vehicles: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3"/>',
    property: '<path d="M4 11 12 4l8 7v9H4zM10 20v-6h4v6"/>',
    electronics: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    fashion: '<path d="M8 3 3 7l3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0z"/>',
    furniture: '<path d="M3 12h18v6H3zM5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M6 18v2M18 18v2"/>',
    jobs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    services: '<path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3z"/>',
    food: '<path d="M12 21v-9M12 12c0-4 3-7 8-7 0 5-3 8-8 7zM12 15c0-3-2-5-6-5 0 4 2 6 6 5z"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    sports: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
    kids: '<circle cx="12" cy="13" r="7"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M9.5 14.5c1.4 1.4 3.6 1.4 5 0"/>',
    other: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
    all: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'
  };
  var BLURB = { vehicles: 'Cars, bikes, parts', property: 'Rent, buy, land' };
  function svgIcon(id, size, stroke) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[id] || ICONS.other) + '</svg>';
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function buildBrowse() {
    var feat = $('v3bFeature'), grid = $('v3bGrid'), par = $('v3bParishes');
    if (!feat || typeof CATS === 'undefined') return;
    var big = CATS.filter(function (c) { return c.id === 'vehicles' || c.id === 'property'; });
    var rest = CATS.filter(function (c) { return c.id !== 'vehicles' && c.id !== 'property'; });
    feat.innerHTML = big.map(function (c, i) {
      return '<button type="button" class="v3b-big" data-cat="' + esc(c.id) + '">' + svgIcon(c.id, 34, i ? '#9af0c4' : '#ffd27a') +
        '<span class="v3b-big-t"><b>' + esc(c.name) + '</b><span>' + esc(BLURB[c.id] || '') + '</span></span></button>';
    }).join('');
    grid.innerHTML = '<button type="button" class="v3b-tile v3b-all" data-cat="all">' + svgIcon('all', 24, 'currentColor') + 'All listings</button>' +
      rest.map(function (c) {
        return '<button type="button" class="v3b-tile" data-cat="' + esc(c.id) + '">' + svgIcon(c.id, 24, 'currentColor') + esc(c.name) + '</button>';
      }).join('');
    if (par && typeof PARISHES !== 'undefined') {
      par.innerHTML = PARISHES.map(function (p) {
        return '<button type="button" class="v3b-chip' + (state.parish === p ? ' on' : '') + '" data-parish="' + esc(p) + '">' + esc(p) + '</button>';
      }).join('');
    }
  }
  window.renderBrowse = function () { safe(buildBrowse); };

  function leaveBrowse(fn) {
    if (typeof window.goHome === 'function') window.goHome();
    safe(fn);
    setTimeout(function () {
      var el = $('v3Filters') && !$('v3Filters').hidden ? $('v3Filters') : $('homeGrid');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#page-browse [data-cat], #page-browse [data-parish]');
    if (!t) return;
    if (t.hasAttribute('data-cat')) {
      var id = t.getAttribute('data-cat');
      leaveBrowse(function () { if (id !== 'all' && typeof window.catFilter === 'function') window.catFilter(id); });
    } else {
      var p = t.getAttribute('data-parish');
      leaveBrowse(function () {
        state.parish = p;
        safe(function () { localStorage.setItem(PARISH_KEY, p); });
        refresh(false);
      });
    }
  });
  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'v3bSearch') return;
    e.preventDefault();
    var q = ($('v3bInput').value || '').trim();
    if (!q) { $('v3bInput').focus(); return; }
    var n = $('navSearchInput'); if (n) n.value = q;
    if (typeof window.goHome === 'function') window.goHome();
    if (n) n.value = q;
    if (typeof handleNavSearch === 'function') handleNavSearch();
    $('v3bInput').blur(); $('v3bInput').value = '';
  });



  /* Open Browse with its search box ready to type in. iOS only raises the keyboard
     for a focus() made inside the tap itself, and the page is not visible until the
     next frame — so a hidden proxy input takes focus now and hands it over once
     Browse is on screen. */
  function openBrowseSearch() {
    var proxy = null;
    safe(function () {
      proxy = document.createElement('input');
      proxy.setAttribute('aria-hidden', 'true'); proxy.tabIndex = -1;
      proxy.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
      document.body.appendChild(proxy);
      proxy.focus();
    });
    if (typeof goPage === 'function') goPage('browse');
    function handOver() {
      var real = $('v3bInput');
      if (real) { try { real.focus(); } catch (e) {} }
      if (proxy) { proxy.remove(); proxy = null; }
    }
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(handOver); });
    else setTimeout(handOver, 60);
  }

  /* ── hero search: a tap opens Browse (like "All"); the AI orb floats and reacts ── */
  function setupHeroSearch() {
    var form = $('v3HeroSearch'), input = $('v3HeroInput');
    if (!form || !input || form.getAttribute('data-v3')) return;
    form.setAttribute('data-v3', '1');
    input.readOnly = true;                       // no keyboard on the home screen
    input.setAttribute('inputmode', 'none');
    input.setAttribute('placeholder', 'Search Yaad Adz');
    form.classList.add('v3-hs-tap');
    form.addEventListener('click', function (e) {
      openBrowseSearch();
    });
    input.addEventListener('focus', function () { input.blur(); });
  }

  /* The floating AI orb: bobs and glows on its own, tilts toward a pressing finger,
     throws a few sparkles when pressed, and shrinks with the gas pill on scroll. */
  /* depth on the listing page: the photo recedes as you scroll, the backdrop sharpens */
  function setupListingDepth() {
    if (window.__v3Depth) return; window.__v3Depth = true;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ticking = false;
    function update() {
      ticking = false;
      var hero = document.querySelector('#page-detail.active .v3d-hero');
      if (!hero) { document.body.style.removeProperty('--p'); return; }
      var h = hero.offsetHeight || 300;
      var p = Math.max(0, Math.min(1, (window.pageYOffset || 0) / (h * 0.85)));
      document.body.style.setProperty('--p', p.toFixed(3));
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
  }

  function setupAiFloat() {
    var ai = $('v3AiOrb');
    if (!ai || ai.getAttribute('data-v3')) return;
    ai.setAttribute('data-v3', '1');
    var orb = ai.querySelector('.v3-orb');
    ai.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
      var r = ai.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      orb.style.setProperty('--tx', (Math.max(-1, Math.min(1, dx)) * 5).toFixed(1) + 'px');
      orb.style.setProperty('--ty', (Math.max(-1, Math.min(1, dy)) * 5).toFixed(1) + 'px');
    });
    function rest() { orb.style.removeProperty('--tx'); orb.style.removeProperty('--ty'); }
    ai.addEventListener('pointerleave', rest);
    ai.addEventListener('pointerup', rest);
    ai.addEventListener('pointercancel', rest);
    ai.addEventListener('pointerdown', function () {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      for (var i = 0; i < 6; i++) {
        var sp = document.createElement('i');
        sp.className = 'v3-spark';
        var a = (Math.PI * 2 * i) / 6 + Math.random() * .6, d = 30 + Math.random() * 16;
        sp.style.setProperty('--sx', (Math.cos(a) * d).toFixed(1) + 'px');
        sp.style.setProperty('--sy', (Math.sin(a) * d).toFixed(1) + 'px');
        ai.appendChild(sp);
        setTimeout(function (n) { return function () { n.remove(); }; }(sp), 700);
      }
    });
    // shrink together with the gas pill when the page scrolls down
    var gas = $('gasBanner');
    if (gas && window.MutationObserver) {
      var sync = function () { ai.classList.toggle('is-compact', gas.classList.contains('gas-banner-compact')); };
      new MutationObserver(sync).observe(gas, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
  }

  /* ── boot ── */
  function init() {
    bindLocation();
    syncFilterChips();
    safe(buildBrowse);
    greet();
    syncBell();
    safe(ensureMore);
    // the first render may already have happened with a restored parish
    if (state.parish) safe(function () { if (typeof renderHome === 'function') renderHome(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // boot.js runs init() after deferred scripts; re-assert once the app is up
  window.addEventListener('load', function () { setTimeout(init, 400); });
})();
