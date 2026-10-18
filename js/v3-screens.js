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


  /* ───────────────────────── Notifications (board U) ─────────────────────────
     Built only from things that are really true right now: unread chats, the
     What's-new note, your own ads that went live this week, and today's gas
     price. Nothing is invented. */
  var SEEN_KEY = 'ya_v3_notif_seen';
  function seenStamp() { var n = 0; safe(function () { n = +localStorage.getItem(SEEN_KEY) || 0; }); return n; }
  var NI = {
    chat: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    gas: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h14M15 9h2a2 2 0 012 2v5a1.5 1.5 0 003 0V8l-3-3"/></svg>'
  };
  function notifItems() {
    var items = [], seen = seenStamp();
    safe(function () {
      if (typeof CU !== 'undefined' && CU && typeof _msgs !== 'undefined') {
        Object.keys(_msgs).forEach(function (key) {
          var c = _msgs[key];
          if (c.sellerId !== CU.id && c.buyerId !== CU.id) return;
          var unread = (c.messages || []).filter(function (m) { return m.from !== CU.id && !m.read; });
          if (!unread.length) return;
          var last = c.messages[c.messages.length - 1] || {};
          var other = CU.id === c.buyerId ? c.sellerName : c.buyerName;
          items.push({ kind: 'msg', ic: 'chat', ts: last.ts || Date.now(), unread: true, conv: key,
            title: (other || 'Someone') + ' sent a message' + (unread.length > 1 ? ' · ' + unread.length + ' new' : ''), text: last.text || '' });
        });
      }
    });
    safe(function () {
      var meta = (typeof siteUpdateMeta === 'function') ? siteUpdateMeta() : null;
      if (!meta) return;
      var un = typeof siteUpdateUnread === 'function' && siteUpdateUnread();
      var body = String(meta.body || ''); body = body.length > 90 ? body.slice(0, 89) + '…' : body;
      items.push({ kind: 'update', ic: 'spark', ts: un ? Date.now() : 0, unread: un && seen < Date.now() - 1, act: 'update', stampable: true,
        title: 'What’s new' + (meta.version ? ' · ' + meta.version : ''), text: body });
    });
    safe(function () {
      if (typeof CU === 'undefined' || !CU || typeof _ads === 'undefined') return;
      var week = Date.now() - 7 * 86400000;
      _ads.filter(function (a) { return a.sellerId === CU.id && a.status !== 'sold' && new Date(a.date).getTime() > week; })
        .slice(0, 3).forEach(function (a) {
          var t = new Date(a.date).getTime();
          items.push({ kind: 'ad', ic: 'ok', ts: t, unread: t > seen, act: 'ad:' + a.id, stampable: true, title: 'Your ad is live', text: a.title + ' is now visible to buyers' });
        });
    });
    safe(function () {
      var el = $('bannerPrice'), t = el && el.textContent.trim();
      if (t && /\d/.test(t)) items.push({ kind: 'gas', ic: 'gas', ts: 0, unread: false, act: 'href:/gas-prices', title: 'Gas prices today', text: 'Latest average ' + t + ' · tap for stations' });
    });
    items.sort(function (a, b) { return b.ts - a.ts; });
    return items;
  }
  function renderNotifs() {
    var body = $('v3NotifBody'); if (!body) return;
    var items = notifItems(), html = '';
    var canPush = false;
    safe(function () { canPush = 'Notification' in window && Notification.permission === 'default'; });
    if (canPush) {
      html += '<div class="v3s-card v3n-push"><span class="v3n-push-t"><b>Turn on push alerts</b><span>Messages, price drops and saved searches</span></span>' +
        '<button type="button" class="v3me-gold" id="v3NotifPush">Enable</button></div>';
    }
    if (typeof CU !== 'undefined' && !CU) {
      html += '<div class="v3s-card v3n-push"><span class="v3n-push-t"><b>Sign in for chat alerts</b><span>See new messages and your ad updates here</span></span>' +
        '<button type="button" class="v3me-gold" onclick="openAuth(\'login\')">Sign in</button></div>';
    }
    var day = Date.now() - 86400000;
    var today = items.filter(function (i) { return i.unread || i.ts > day; });
    var earlier = items.filter(function (i) { return today.indexOf(i) < 0; });
    function group(label, list) {
      if (!list.length) return '';
      return '<h2 class="v3n-g">' + label + '</h2><div class="v3s-card v3s-rows v3n-list">' + list.map(function (i) {
        var attrs = i.conv ? ' data-conv="' + esc(i.conv) + '"' : ' data-nact="' + esc(i.act || '') + '"';
        return '<div class="v3s-row v3n-row' + (i.unread ? ' unread' : '') + '"' + attrs + ' role="button" tabindex="0">' +
          '<span class="v3n-ic v3n-' + i.kind + '">' + NI[i.ic] + '</span>' +
          '<span class="v3s-rmid"><b>' + esc(i.title) + '</b><span>' + esc(i.text) + '</span></span>' +
          (i.unread ? '<span class="v3n-dot" aria-label="Unread"></span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    html += group('Today', today) + group('Earlier', earlier);
    if (!items.length) html += '<div class="v3s-empty"><div class="v3s-empty-ic" aria-hidden="true">🔔</div><h2>You’re all caught up</h2><p>New messages and updates on your ads will show up here.</p></div>';
    body.innerHTML = html;
    var mark = $('v3NotifMark');
    if (mark) mark.hidden = !items.some(function (i) { return i.unread && i.stampable; });
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    if (t.closest('#v3NotifMark')) {
      safe(function () { localStorage.setItem(SEEN_KEY, String(Date.now())); if (typeof markSiteUpdateRead === 'function') markSiteUpdateRead(); });
      renderNotifs(); safe(function () { if (typeof renderInbox === 'function') renderInbox(); });
      return;
    }
    if (t.closest('#v3NotifPush')) { safe(function () { if (typeof enablePushNotifications === 'function') enablePushNotifications(); else if (typeof requestPushPermission === 'function') requestPushPermission(); }); setTimeout(renderNotifs, 1500); return; }
    var row = t.closest('#page-notifs [data-nact]');
    if (row) {
      var a = row.getAttribute('data-nact') || '';
      if (a === 'update' && typeof openSiteUpdate === 'function') { openSiteUpdate(); setTimeout(renderNotifs, 400); }
      else if (a.indexOf('ad:') === 0 && typeof openDetail === 'function') openDetail(a.slice(3));
      else if (a.indexOf('href:') === 0) location.href = a.slice(5);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var r = e.target.closest && e.target.closest('#page-notifs .v3n-row');
    if (r && e.target === r) { e.preventDefault(); r.click(); }
  });
  if (typeof window.goPage === 'function') {
    var origGoPage = window.goPage;
    window.goPage = function (p) {
      var out = origGoPage.apply(this, arguments);
      if (p === 'notifs') safe(renderNotifs);
      if (p === 'myads') safe(syncMe);
      return out;
    };
  }

  /* ───────────────────────── Me (board P) ───────────────────────── */
  function syncMe() {
    var card = $('v3InstallCard');
    if (card) {
      var standalone = false;
      safe(function () { standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone; });
      var can = false; safe(function () { can = !!(typeof _pwaPrompt !== 'undefined' && _pwaPrompt); });
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      card.hidden = standalone || !(can || ios);
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#v3MeMenu [data-me]'); if (!b) return;
    var a = b.getAttribute('data-me');
    if (a === 'ads') { var m = $('v3MyAds'); if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (a === 'searches') { if (window.v3ShowSaved) { window.v3ShowSaved(); var tb = document.querySelector('#v3SavedSeg [data-tab="searches"]'); if (tb) tb.click(); } }
    else if (a === 'notifs') goPage('notifs');
    else if (a === 'help') { if (typeof openInfoPage === 'function') openInfoPage('contact'); }
    else if (a === 'out') { if (typeof doLogout === 'function') doLogout(); }
  });

  /* ───────────────────────── Sign-in (board T) ───────────────────────── */
  if (typeof window.authTab === 'function') {
    var origAuthTab = window.authTab;
    window.authTab = function (t) {
      var out = origAuthTab.apply(this, arguments);
      safe(function () {
        var reg = t === 'register';
        $('v3aH').textContent = reg ? 'Create your account' : 'Welcome back';
        $('v3aSub').textContent = reg ? 'Free forever — post, chat and save' : 'Sign in to buy, sell and chat';
        $('v3aSwitch').innerHTML = reg ? 'Already a member? <a href="#" onclick="authTab(\'login\');return false">Log in</a>'
                                       : 'New here? <a href="#" onclick="authTab(\'register\');return false">Create an account</a>';
      });
      return out;
    };
  }


  /* ───────────────────────── Post an ad (board M) ─────────────────────────
     The 3-step wizard keeps every id and function it had. Added here: the
     "Step N of 3" line, and a category chip rail that mirrors the #aCat
     <select> (which stays in the page as the source of truth). */
  var STEP_NAMES = { 1: 'Details', 2: 'Photo & contact', 3: 'Preview' };
  function syncPostStep(n) {
    var el = $('v3ppStep'); if (!el) return;
    var step = n || (typeof currentPostStep !== 'undefined' ? currentPostStep : 1);
    el.textContent = 'Step ' + step + ' of 3 · ' + (STEP_NAMES[step] || '');
  }
  function buildPostCats() {
    var rail = $('v3ppCats'), sel = $('aCat');
    if (!rail || !sel || typeof CATS === 'undefined') return;
    if (!rail.firstChild) {
      rail.innerHTML = CATS.map(function (c) {
        return '<button type="button" class="v3pp-chip" data-cat="' + esc(c.id) + '" aria-pressed="false">' + esc(c.name) + '</button>';
      }).join('');
    }
    syncPostCats();
  }
  function syncPostCats() {
    var rail = $('v3ppCats'), sel = $('aCat'); if (!rail || !sel) return;
    rail.querySelectorAll('.v3pp-chip').forEach(function (b) {
      var on = b.getAttribute('data-cat') === sel.value;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#v3ppCats .v3pp-chip');
    if (b) {
      var sel = $('aCat'); if (!sel) return;
      sel.value = b.getAttribute('data-cat');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      syncPostCats(); return;
    }
    if (e.target.closest && e.target.closest('#ovPost')) setTimeout(syncPostCats, 0);
  });
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'aCat') syncPostCats(); });
  if (typeof window.setStep === 'function') {
    var origSetStep = window.setStep;
    window.setStep = function (n) { var out = origSetStep.apply(this, arguments); safe(function () { syncPostStep(n); syncPostCats(); }); return out; };
  }
  if (typeof window.openPostAd === 'function') {
    var origOpenPost = window.openPostAd;
    window.openPostAd = function () {
      var out = origOpenPost.apply(this, arguments);
      safe(function () { buildPostCats(); syncPostStep(1); setTimeout(syncPostCats, 60); });
      return out;
    };
  }

  /* ── boot ── */
  function init() { bindChats(); safe(buildPostCats); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', function () { setTimeout(init, 400); });
})();
