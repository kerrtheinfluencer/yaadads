/* ═══════════════════════════════════════════════════════════════════════════
   §V3-SCREENS — Lagoon Chats (board N) and Saved (board O) behaviour.
   ───────────────────────────────────────────────────────────────────────────
   Chats : search box + All / Buying / Selling chips on top of the normal inbox
           (renderInbox is wrapped so the filter survives every re-render).
   Saved : a real page with three tabs — Listings (your hearts), Searches
           (alerts saved with "Notify me") and Sellers (people behind the
           listings you saved). Edit mode removes items.
   Removing this <script> and the v3 CSS returns the old screens' behaviour;
   window.v3ShowSaved is also defined in v3-home.js as the fallback.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function safe(fn) { try { return fn(); } catch (e) { /* never break the app */ } }
  function esc(t) { return typeof escHtml === 'function' ? escHtml(t == null ? '' : String(t)) : String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ───────────────────────── Chats ───────────────────────── */
  var chatF = 'all', chatQ = '';
  function applyChatFilter() {
    var list = $('inboxList'); if (!list) return;
    var rows = list.querySelectorAll('.inbox-item[data-conv]');
    var other = list.querySelectorAll('.inbox-item:not([data-conv])');
    var q = chatQ.toLowerCase(), shown = 0;
    rows.forEach(function (r) {
      var okRole = chatF === 'all' || r.getAttribute('data-role') === chatF;
      var okText = !q || r.textContent.toLowerCase().indexOf(q) > -1;
      var on = okRole && okText;
      r.hidden = !on;
      if (on) shown++;
    });
    other.forEach(function (r) { r.hidden = !(chatF === 'all' && !q); });
    var none = $('v3ChatNone');
    if (none) none.hidden = !(rows.length && !shown);
    var chips = $('v3ChatChips');
    if (chips) chips.hidden = !rows.length && chatF === 'all' && !q;
  }
  function bindChats() {
    var s = $('v3ChatSearch'), c = $('v3ChatChips');
    if (s && !s._v3) {
      s._v3 = true;
      s.addEventListener('input', function () { chatQ = s.value.trim(); applyChatFilter(); });
    }
    if (c && !c._v3) {
      c._v3 = true;
      c.addEventListener('click', function (e) {
        var b = e.target.closest('.v3s-chip'); if (!b) return;
        chatF = b.getAttribute('data-f');
        c.querySelectorAll('.v3s-chip').forEach(function (x) {
          var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        applyChatFilter();
      });
    }
  }
  if (typeof window.renderInbox === 'function') {
    var origInbox = window.renderInbox;
    window.renderInbox = function () {
      var out = origInbox.apply(this, arguments);
      safe(bindChats); safe(applyChatFilter);
      return out;
    };
  }

  /* ───────────────────────── Saved ───────────────────────── */
  var tab = 'listings', editing = false;
  var heartSvg = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.8 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.3 3.3 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';
  var closeSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var bellSvg = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0"/></svg>';

  function favAds() {
    var ids = []; safe(function () { ids = (typeof L !== 'undefined' && L.favs) ? L.favs : []; });
    var out = [];
    ids.forEach(function (id) {
      var a = null;
      safe(function () { a = typeof findAd === 'function' ? findAd(id) : null; });
      if (a) out.push(a);
    });
    return out;
  }
  function thumb(u) { return (typeof thumbUrl === 'function' && u) ? thumbUrl(u, 360) : u; }
  function empty(icon, title, text) {
    return '<div class="v3s-empty"><div class="v3s-empty-ic" aria-hidden="true">' + icon + '</div><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
      '<button type="button" class="btn btn-gold" onclick="goHome()">Browse listings</button></div>';
  }

  function renderListings() {
    var ads = favAds();
    if (!ads.length) return empty('🤍', 'Nothing saved yet', 'Tap the heart on any listing and it will wait for you here.');
    var cards = ads.map(function (a, i) {
      var sold = a.status === 'sold';
      var cat = (typeof catById === 'function') ? catById(a.category) : {};
      var img = a.image ? '<img src="' + esc(thumb(a.image)) + '" alt="" loading="lazy" decoding="async">' : '<span class="v3s-ph" aria-hidden="true">' + esc(cat.icon || '📦') + '</span>';
      return '<div class="v3s-sc' + (sold ? ' sold' : '') + '" data-id="' + esc(a.id) + '" role="button" tabindex="0" style="--i:' + i + '">' +
        '<div class="v3s-sc-img">' + img + (sold ? '<span class="v3s-badge">Sold</span>' : '') +
        '<button type="button" class="v3s-heart" data-unsave="' + esc(a.id) + '" aria-label="Remove ' + esc(a.title) + ' from saved">' + (editing ? closeSvg : heartSvg) + '</button></div>' +
        '<div class="v3s-sc-b"><span class="v3s-price">J$' + esc(typeof fmtN === 'function' ? fmtN(a.price) : a.price) + '</span><span class="v3s-title">' + esc(a.title) + '</span><span class="v3s-loc">' + esc(a.parish) + '</span></div></div>';
    }).join('');
    return '<div class="v3s-grid">' + cards + '</div>';
  }

  function savedSearches() { var s = []; safe(function () { s = (typeof getSavedSearches === 'function') ? getSavedSearches() : []; }); return s; }
  function renderSearches() {
    var list = savedSearches();
    if (!list.length) return empty('🔔', 'No saved searches', 'Search for something, then tap “Notify me” and it will show up here.');
    return '<div class="v3s-card v3s-rows">' + list.map(function (s, i) {
      var f = [];
      safe(function () { Object.keys(s.filters || {}).forEach(function (k) { var v = s.filters[k]; if (typeof v === 'string' || typeof v === 'number') f.push(String(v)); }); });
      return '<div class="v3s-row" data-search="' + i + '" role="button" tabindex="0">' +
        '<span class="v3s-ric">' + bellSvg + '</span>' +
        '<span class="v3s-rmid"><b>' + esc(s.query) + '</b><span>' + esc(f.slice(0, 3).join(' · ') || 'We’ll tell you about new matches') + (s.saved && typeof fmtTime === 'function' ? ' · ' + esc(fmtTime(s.saved)) : '') + '</span></span>' +
        (editing ? '<button type="button" class="v3s-del" data-del-search="' + i + '" aria-label="Delete saved search">' + closeSvg + '</button>' : '<span class="v3s-chev" aria-hidden="true">›</span>') + '</div>';
    }).join('') + '</div>';
  }

  function renderSellers() {
    var ads = favAds(), by = {}, order = [];
    ads.forEach(function (a) {
      if (!a.sellerId) return;
      if (!by[a.sellerId]) { by[a.sellerId] = { a: a, n: 0 }; order.push(a.sellerId); }
      by[a.sellerId].n++;
    });
    if (!order.length) return empty('👤', 'No sellers yet', 'Sellers behind the listings you save will appear here.');
    return '<div class="v3s-card v3s-rows">' + order.map(function (id) {
      var g = by[id], a = g.a, name = a.seller || 'Seller';
      var clr = (typeof avatarColor === 'function') ? avatarColor(name) : { bg: '#14684a', fg: '#fff' };
      var ini = a.sellerInit || (typeof initials === 'function' ? initials(name) : name.charAt(0));
      return '<div class="v3s-row" data-seller="' + esc(id) + '" role="button" tabindex="0">' +
        '<span class="v3s-av" style="background:' + clr.bg + ';color:' + clr.fg + '">' + esc(ini) + '</span>' +
        '<span class="v3s-rmid"><b>' + esc(name) + '</b><span>' + g.n + ' saved listing' + (g.n === 1 ? '' : 's') + ' · ' + esc(a.parish) + '</span></span><span class="v3s-chev" aria-hidden="true">›</span></div>';
    }).join('') + '</div>';
  }

  function renderSaved() {
    var body = $('v3SavedBody'); if (!body) return;
    var html = tab === 'listings' ? renderListings() : tab === 'searches' ? renderSearches() : renderSellers();
    body.innerHTML = html;
    body.classList.toggle('editing', editing);
    var seg = $('v3SavedSeg');
    if (seg) {
      var idx = ['listings', 'searches', 'sellers'].indexOf(tab);
      seg.style.setProperty('--i', String(idx));
      seg.querySelectorAll('button').forEach(function (b) {
        var on = b.getAttribute('data-tab') === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    var eb = $('v3SavedEdit');
    if (eb) { eb.textContent = editing ? 'Done' : 'Edit'; eb.setAttribute('aria-pressed', editing ? 'true' : 'false'); }
  }

  window.v3ShowSaved = function () {
    safe(function () {
      if (typeof goPage === 'function') goPage('saved');
      tab = 'listings'; editing = false;
      renderSaved();
      document.querySelectorAll('.mob-nav-item').forEach(function (el) { el.classList.remove('active'); });
      var t = $('mnSaved'); if (t) t.classList.add('active');
      window.scrollTo(0, 0);
    });
  };

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var page = t.closest('#page-saved');
    if (!page) return;
    var seg = t.closest('#v3SavedSeg button[data-tab]');
    if (seg) { tab = seg.getAttribute('data-tab'); renderSaved(); return; }
    if (t.closest('#v3SavedEdit')) { editing = !editing; renderSaved(); return; }
    var un = t.closest('[data-unsave]');
    if (un) {
      e.stopPropagation();
      var id = un.getAttribute('data-unsave');
      var card = un.closest('.v3s-sc');
      if (typeof togFav === 'function' && typeof isFav === 'function' && isFav(id)) togFav(id);
      if (card) { card.classList.add('leaving'); setTimeout(renderSaved, 260); } else renderSaved();
      return;
    }
    var ds = t.closest('[data-del-search]');
    if (ds) {
      e.stopPropagation();
      safe(function () {
        var list = savedSearches(); list.splice(+ds.getAttribute('data-del-search'), 1);
        localStorage.setItem('ya_saved_searches', JSON.stringify(list));
      });
      renderSaved(); return;
    }
    var card2 = t.closest('.v3s-sc[data-id]');
    if (card2) { if (typeof openDetail === 'function') openDetail(card2.getAttribute('data-id')); return; }
    var srow = t.closest('.v3s-row[data-search]');
    if (srow && !editing) {
      var q = (savedSearches()[+srow.getAttribute('data-search')] || {}).query;
      if (q) {
        if (typeof goHome === 'function') goHome();
        var n = $('navSearchInput'); if (n) n.value = q;
        if (typeof handleNavSearch === 'function') handleNavSearch();
      }
      return;
    }
    var sel = t.closest('.v3s-row[data-seller]');
    if (sel && typeof openProfile === 'function') openProfile(sel.getAttribute('data-seller'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var r = e.target.closest && e.target.closest('#page-saved .v3s-sc, #page-saved .v3s-row');
    if (r && e.target === r) { e.preventDefault(); r.click(); }
  });

  /* ── boot ── */
  function init() { bindChats(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', function () { setTimeout(init, 400); });
})();
