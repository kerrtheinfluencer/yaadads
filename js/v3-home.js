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
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', 'More categories');
    b.innerHTML = '<span class="cp-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg></span><span class="cp-name">More</span>';
    b.addEventListener('click', function () {
      var deck = document.querySelector('.browse-deck');
      if (!deck) return;
      var open = deck.classList.toggle('v3-cats-open');
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.querySelector('.cp-name').textContent = open ? 'Less' : 'More';
    });
    row.appendChild(b);
  }
  if (typeof window.renderCats === 'function') {
    var origRenderCats = window.renderCats;
    window.renderCats = function () {
      var out = origRenderCats.apply(this, arguments);
      safe(ensureMore);
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

  /* ── boot ── */
  function init() {
    bindLocation();
    syncFilterChips();
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
