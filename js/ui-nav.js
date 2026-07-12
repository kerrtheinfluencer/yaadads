/* ═══════════════════════════════════════════════════════════
   GOOGLE ADSENSE — push ad slots §ADSENSE
═══════════════════════════════════════════════════════════ */
function pushAds() {
  try {
    const slots = document.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
    slots.forEach(function() { (adsbygoogle = window.adsbygoogle || []).push({}); });
  } catch(e) { /* adblock or not loaded yet */ }
}

async function init() {
  fillParishSelects();
  fillCatSelect();
  await restoreSession();
  renderNav();

  if (CU && (!CU.parish || !CU.phone)) {
    try {
      if (!sessionStorage.getItem('ya_profile_nudged')) {
        sessionStorage.setItem('ya_profile_nudged', '1');
        setTimeout(function() {
          showToast('Add your parish & phone to your profile so buyers can find and reach you', '📍');
        }, 2500);
      }
    } catch(e) {}
  }

  // Detect PWA standalone mode — apply safe area CSS only when installed
  if (window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('pwa-mode');
  }
  purgeBadTrendingData(); // clean up old numeric trending tokens

  showSkeletons();
  document.getElementById('resultsHeader').style.display = 'none';

  try {
    await loadAds();
    if (CU) await loadMessages();
  } catch(e) {
    console.error('Init load error:', e);
    _ads = DEMO;
    // Only show connection banner on actual Supabase failure (not demo fallback)
    if (e && e.message && !_ads.length) {
      const banner = document.getElementById('setupBanner');
      if (banner) { banner.style.display = 'block'; }
    }
  }

  // ── DIAGNOSTIC: surface load status to the user ──
  // If the previous "fix" silently fell back to DEMO ads, the user thought
  // their real ads were broken. Now we tell them what actually happened.
  if (_yaadLastLoad && !_yaadLastLoad.ok) {
    const banner = document.getElementById('setupBanner');
    if (banner) {
      let msg = '⚠️ <strong>Connection issue</strong> — Showing demo listings. Your real ads are safe. ';
      if (_yaadLastLoad.reason === 'supabase_error') msg += 'Supabase error: ' + (_yaadLastLoad.message || 'unknown');
      else if (_yaadLastLoad.reason === 'exception') msg += 'Error: ' + (_yaadLastLoad.message || 'unknown');
      banner.innerHTML = msg;
      banner.style.display = 'block';
    }
    console.warn('[Yaad Adz] Loaded from DEMO fallback — DB not connected:', _yaadLastLoad);
  } else if (_yaadLastLoad && _yaadLastLoad.fromDb === false && _yaadLastLoad.count > 0) {
    console.warn('[Yaad Adz] Supabase returned 0 ads — using DEMO fallback. Check that your ads table has rows and the RLS policy allows public reads.');
  } else if (_yaadLastLoad && _yaadLastLoad.fromDb) {
    console.info('[Yaad Adz] Loaded ' + _yaadLastLoad.count + ' ads from Supabase ✓');
  }

  renderCats();
  renderHome();
  // Hide static SEO intro now that live listings have rendered
  const seoIntro = document.getElementById('seoIntro');
  if (seoIntro) seoIntro.style.display = 'none';
  updateStats();
  updateMsgBadge();
  updateTicker();
  document.getElementById('setupBanner')?.classList.remove('show');
  startNavPlaceholderCycle();
  checkUrlAdParam();

  // If 404 redirect arrived before ads loaded, resolve now
  if (window._pendingSlug) {
    const shortId = idFromSlug(window._pendingSlug);
    if (shortId) {
      const ad = _ads.find(function(a){ return a.id.startsWith(shortId); });
      if (ad) setTimeout(() => openDetail(ad.id), 300);
    }
    window._pendingSlug = null;
  }

  // SEO + AI Discovery — inject after ads loaded
  SEO.injectListingsSchema(_ads);
  SEO.injectFAQSchema();
  SEO.serveLlmsTxt(_ads);

  // Update llms.txt whenever new ads arrive (handled in realtime subscription)
  window._seoRefresh = function() {
    SEO.injectListingsSchema(_ads);
    SEO.serveLlmsTxt(_ads);
  };

  // Real-time: new ads
  _db.channel('ads-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ads' }, payload => {
      const incoming = dbToAd(payload.new);
      if (!_ads.find(a => a.id === incoming.id)) {
        _ads.unshift(incoming);
        renderCats(); renderHome(); updateStats(); updateTicker(); if(window._seoRefresh) window._seoRefresh();
        showToast('New listing just posted! 🆕', '🆕');
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ads' }, payload => {
      const idx = _ads.findIndex(a => a.id === payload.new.id);
      if (idx > -1) _ads[idx] = dbToAd(payload.new);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ads' }, payload => {
      _ads = _ads.filter(a => a.id !== payload.old.id);
      renderCats(); renderHome(); updateStats();
    })
    .subscribe();

  if (CU) subscribeMessages();

  // Initialize all ad slots on page
  setTimeout(pushAds, 1000);
}

let _msgChannel = null;
function subscribeMessages() {
  if (_msgChannel) { _db.removeChannel(_msgChannel); _msgChannel = null; }
  _msgChannel = _db.channel('msg-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const row = payload.new;
      if (row.seller_id !== CU.id && row.buyer_id !== CU.id) return;
      if (row.from_user_id === CU.id) return;
      const key = row.conversation_key;
      if (!_msgs[key]) {
        _msgs[key] = {
          adId: row.ad_id, adTitle: row.ad_title,
          sellerId: row.seller_id, sellerName: row.seller_name, sellerInit: row.seller_init,
          buyerId: row.buyer_id,   buyerName: row.buyer_name,   buyerInit: row.buyer_init,
          messages: [],
        };
      }
      _msgs[key].messages.push({
        id: row.id, from: row.from_user_id, text: row.text,
        ts: new Date(row.created_at).getTime(), read: false,
      });
      updateMsgBadge();
      if (currentConv === key) renderChat(key);
      showToast('New message received 💬', '💬');
      // Fire push notification if app is in background
      const senderName = (row.from_user_id === row.seller_id ? row.seller_name : row.buyer_name) || 'Someone';
      sendPushNotification(
        '💬 New message from ' + senderName,
        row.text ? row.text.slice(0, 80) : 'You have a new message on Yaad Adz',
        '/?msgs=1'
      );
    })
    .subscribe();
}

function startNavPlaceholderCycle() {} // nav search removed

function updateStats() {
  const el = document.getElementById('sStat');
  if (el) {
    el.textContent = _ads.length;
    // Cache so next load shows the right number immediately, not 0
    try { localStorage.setItem('ya_last_count', _ads.length); } catch(e) {}
  }
  const uEl = document.getElementById('uStat');
  // Show cached count immediately so it never sits at "0" while waiting
  try {
    const cachedUsers = localStorage.getItem('ya_last_users');
    if (uEl && cachedUsers) uEl.textContent = cachedUsers;
  } catch(e) {}

  _db.from('users').select('id', { count: 'exact', head: true })
    .then(({ count, error }) => {
      if (error) { console.error('[updateStats] users count failed:', error.message); return; }
      const val = count || 1;
      if (uEl) uEl.textContent = val;
      try { localStorage.setItem('ya_last_users', val); } catch(e) {}
    })
    .catch(e => console.error('[updateStats] users query threw:', e));
}

// Apply cached count immediately on paint — before Supabase responds
(function() {
  try {
    const cached = localStorage.getItem('ya_last_count');
    if (cached) {
      const el = document.getElementById('sStat');
      if (el && el.textContent === '0') el.textContent = cached;
    }
  } catch(e) {}
})();

function cardHTML(ad, idx) {
  const cat   = CATS.find(c => c.id === ad.category);
  const catColor = cat?.color || '#f5f5f5';
  const img   = ad.image
    ? `<img src="${ad.image}" alt="${ad.title}" loading="lazy" decoding="async" width="270" height="200" onload="this.classList.add('loaded')" onerror="this.parentElement.innerHTML='<span class=img-placeholder>${cat?.icon||'📦'}</span>'">`
    : `<span class="img-placeholder">${cat?.icon||'📦'}</span>`;
  const fav   = isFav(ad.id) ? '❤️' : '🤍';
  const tag   = ad.status === 'sold'
    ? `<span class="sold-tag">Sold</span>`
    : `<span class="ad-cat-tag">${cat?.name||'Other'}</span>`;
  const views = getViews(ad.id);
  const trending = views >= 80 && ad.status !== 'sold'
    ? `<span class="trending-badge">🔥 Trending</span>` : '';
  const ageDays = (Date.now() - new Date(ad.date||0)) / 86400000;
  const freshBadge = ageDays < 2 && ad.status !== 'sold'
    ? `<span class="fresh-badge">✨ New</span>` : '';
  const photoCount = (ad.photos && ad.photos.length > 1)
    ? `<span class="photo-count-badge">📷 ${ad.photos.length}</span>` : '';
  const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

  // ── Neg pill ──
  const negPill = ad.neg ? `<span class="neg-pill">Neg.</span>` : '';

  // ── Premium seller row ──
  const sellerName  = ad.seller || 'Seller';
  const sellerInit  = ad.sellerInit || initials(sellerName);
  const sellerClr   = avatarColor(sellerName);
  const sellerRow   = ad.sellerId
    ? `<div class="ad-seller-row">
        <a class="ad-seller-row-link" onclick="event.stopPropagation();openProfile('${ad.sellerId}')" aria-label="View ${escHtml(sellerName)}'s profile">
          <span class="ad-seller-avatar" style="background:${sellerClr.bg};color:${sellerClr.fg}">${escHtml(sellerInit)}</span>
          <div class="ad-seller-info">
            <span class="ad-seller-name"><span class="ad-seller-name-text">${escHtml(sellerName)}</span> <span class="ad-seller-verified">Verified</span></span>
            <span class="ad-seller-sub">Member · ${ago(ad.date)}</span>
          </div>
        </a>
       </div>`
    : '';

  return `<div class="ad-card${ad.status==='sold'?' sold':''}" onclick="openDetail('${ad.id}')">
    <div class="accent-stripe"></div>
    <div class="card-glow"></div>
    ${ad.status==='sold' ? '<div class="sold-watermark"></div>' : ''}
    <div class="ad-card-img" style="--cat-bg:${catColor}">${img}${tag}${freshBadge}${trending}${photoCount}
      <button class="fav-btn" onclick="event.stopPropagation();togFav('${ad.id}',this)">${fav}</button>
    </div>
    <div class="ad-card-body">
      <div class="ad-price">J$${fmtN(ad.price)}${negPill}</div>
      <div class="ad-title">${ad.title}</div>
      <div class="ad-meta">
        <span>${ad.parish}</span>
        <span>${ago(ad.date)}</span>
        <span class="ad-views">${eyeSvg} ${fmtN(views)}</span>
      </div>
      ${sellerRow}
    </div>
  </div>`;
}

function fillParishSelects() {
  const opts = PARISHES.map(p => `<option>${p}</option>`).join('');
  ['rParish','aParish'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Select parish…</option>${opts}`;
  });
}

function fillCatSelect() {
  document.getElementById('aCat').innerHTML = CATS.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   NAV + MOBILE BOTTOM NAV §NAV
═══════════════════════════════════════════════════════════ */
function renderNav() {
  const el = document.getElementById('navActions');
  const navSearch = `
    <form class="nav-search-pill" id="navSearchPill" role="search" autocomplete="off" onsubmit="handleNavSearch(event)">
      <span class="nav-search-icon" aria-hidden="true">🔍</span>
      <input class="nav-search-input" id="navSearchInput" type="search" autocomplete="off" spellcheck="false"
             placeholder="Search cars, phones, houses…"
             aria-label="Search Yaad Adz listings"
             oninput="navSearchPlaceholderSync()"
             onfocus="this.parentElement.classList.add('has-focus')"
             onblur="this.parentElement.classList.remove('has-focus')">

      <span class="nav-search-kbd" id="navSearchKbd">⌘K</span>
    </form>`;
  if (CU) {
    const clr = avatarColor(CU.name);
    const ini = initials(CU.name);
    el.innerHTML = navSearch + `
      <div class="badge-wrap nav-hide-mobile">
        <button class="btn btn-outline btn-sm" onclick="goPage('msgs')" style="display:flex;align-items:center;gap:5px">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Messages
        </button>
        <span id="navMsgBadge" style="display:none;position:absolute;top:-7px;right:-7px;background:#e53e3e;color:#fff;border-radius:50%;min-width:18px;height:18px;font-size:11px;font-weight:700;line-height:18px;text-align:center;padding:0 3px;pointer-events:none"></span>
      </div>
      <div class="badge-wrap nav-hide-mobile">
        <div class="user-pill" onclick="goPage('myads')">
          <div class="u-avatar" style="background:${clr.bg};color:${clr.fg}">${ini}</div>
          <span class="nav-hide-mobile">${CU.name.split(' ')[0]}</span>
        </div>
      </div>
      <button class="btn btn-outline btn-sm nav-hide-mobile" onclick="doLogout()">Log out</button>`;
  } else {
    el.innerHTML = navSearch + `
      <button class="btn btn-outline btn-sm" onclick="openAuth('login')">Log in</button>
      <button class="btn btn-gold btn-sm" onclick="openAuth('register')">Join Free</button>`;
  }
  // Update bottom nav account icon with user avatar when logged in
  updateMobAccountIcon();
}

/* ── Nav search handler — performs a normal listings search, not AI chat ── */
function handleNavSearch(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
  const inp = document.getElementById('navSearchInput');
  const q = (inp && inp.value || '').trim();
  if (!q) { if (inp) inp.focus(); return; }
  searchQ = q;
  if (activeF !== 'all') activeF = 'all';
  window._aiFilters = null;
  hideAiResponse();
  const heroEl = document.querySelector('.hero');
  if (heroEl) heroEl.classList.remove('searched');
  const aiInp = document.getElementById('aiInput');
  if (aiInp) aiInp.value = q;
  if (inp) inp.blur();
  renderCats(); renderHome();
  setTimeout(function(){
    const grid = document.getElementById('homeGrid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

/* Sync the decorative placeholder span to the input's actual state. */
function navSearchPlaceholderSync() {
  const inp  = document.getElementById('navSearchInput');
  const kbd  = document.getElementById('navSearchKbd');
  const pill = document.getElementById('navSearchPill');
  if (!inp) return;
  const hasValue = (inp.value || '').length > 0;
  if (kbd)  kbd.style.opacity = hasValue ? '0' : '';
  if (pill) pill.classList.toggle('has-text', hasValue);
}

/* ═══════════════════════════════════════════════════════════
   MOBILE BOTTOM NAV — Account icon
═══════════════════════════════════════════════════════════ */
function updateMobAccountIcon() {
  const icon = document.getElementById('mobAccountIcon');
  if (!icon) return;
  if (CU) {
    const clr = avatarColor(CU.name);
    const ini = initials(CU.name);
    icon.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:' + clr.bg + ';color:' + clr.fg + ';font-size:10px;font-weight:800;line-height:1';
    icon.textContent = ini;
  } else {
    icon.style.cssText = '';
    icon.textContent = '👤';
  }
}

/* ═══════════════════════════════════════════════════════════
   PAGES §PAGES
═══════════════════════════════════════════════════════════ */
function goHome() {
  activeF = 'all'; searchQ = '';
  _homeShowCount = _homePageSize;
  // navSearch removed
  const inp = document.getElementById('aiInput');
  if (inp) inp.value = '';
  hideAiResponse();
  document.querySelector('.hero')?.classList.remove('searched');
  goPage('home');
}

function goPage(p) {
  const current = document.querySelector('.page.active');
  const next = document.getElementById('page-'+p);
  if (!next || next === current) return;
  // Fade out current, then swap
  if (current) current.classList.remove('active');
  // Use rAF so CSS transition has a frame to start from opacity:0
  requestAnimationFrame(() => {
    next.classList.add('active');
    window.scrollTo({top:0, behavior:'instant'});
  });
  document.querySelectorAll('.mob-nav-item').forEach(el => el.classList.remove('active'));
  const map = {home:'mnHome',msgs:'mnMsgs',myads:'mnAccount'};
  if (map[p]) document.getElementById(map[p])?.classList.add('active');
  if (p==='browse')  renderBrowse();
  if (p==='myads')   renderMyAds();
  if (p==='msgs')    renderInbox();
}

function handleAccountTab() {
  if (CU) goPage('myads');
  else openAuth('login');
}

/* ═══════════════════════════════════════════════════════════
   CATEGORIES — compact row
═══════════════════════════════════════════════════════════ */
function renderCats() {
  const ads = L.ads;
  const row = document.getElementById('catRow');
  if (!row) return;
  const allCount = ads.filter(a => a.status !== 'sold').length;
  // If already rendered, just update active state and counts — no innerHTML wipe
  const existing = row.querySelectorAll('.cat-pill-sm');
  if (existing.length === CATS.length + 1) {
    existing[0].classList.toggle('active', activeF === 'all');
    existing[0].querySelector('span:last-child').textContent = allCount;
    CATS.forEach((c, i) => {
      const n = ads.filter(a => a.category===c.id && a.status!=='sold').length;
      existing[i+1].classList.toggle('active', activeF === c.id);
      existing[i+1].querySelector('span:last-child').textContent = n;
    });
    return;
  }
  // First render — build from scratch
  let html = `<button class="cat-pill-sm ${activeF==='all'?'active':''}" onclick="catFilter('all')"><span class="cp-icon">✨</span> All <span style="opacity:.6;font-size:11px">${allCount}</span></button>`;
  html += CATS.map(c => {
    const n = ads.filter(a => a.category===c.id && a.status!=='sold').length;
    return `<button class="cat-pill-sm ${activeF===c.id?'active':''}" onclick="catFilter('${c.id}')"><span class="cp-icon">${c.icon}</span> ${c.name} <span style="opacity:.6;font-size:11px">${n}</span></button>`;
  }).join('');
  row.innerHTML = html;
}

function renderHomeFilters() {} // no-op — replaced by catRow

function catFilter(id) {
  if (activeF === id) return; // no-op if already selected
  activeF = id; searchQ = '';
  _homeShowCount = _homePageSize;
  hideAiResponse();
  document.querySelector('.hero')?.classList.remove('searched');
  const inp = document.getElementById('aiInput');
  if (inp) inp.value = '';
  renderCats();   // surgical update — fast
  renderHome();   // grid swap
  window.scrollTo({ top: 0, behavior: 'instant' }); // instant avoids animation conflict
}

