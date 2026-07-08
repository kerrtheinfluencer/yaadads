/* ═══════════════════════════════════════════════════════════
   AD DETAIL — openDetail + openProfile §AD-DETAIL
═══════════════════════════════════════════════════════════ */
function openDetail(id) {
  const ad = _ads.find(function(a){ return a.id === id; }); if (!ad) return;
  const dest = '/ad/' + slugify(ad) + '.html';
  const newViews = (ad.views || 0) + 1;
  ad.views = newViews;

  // Direct REST PATCH — most reliable, bypasses Supabase JS client quirks
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
  fetch('https://cquwshpsfybvgqodbxsf.supabase.co/rest/v1/ads?id=eq.' + id, {
    method: 'PATCH',
    keepalive: true,
    headers: {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ views: newViews })
  });

  // Navigate after tiny delay to let fetch initiate
  // Check if static page exists before navigating away from SPA
  var xhr = new XMLHttpRequest();
  xhr.open('HEAD', dest, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        setTimeout(function() { window.location.href = dest; }, 60);
      } else {
        // Static page missing — update view count and redirect to SPA homepage with ad param
        setTimeout(function() { window.location.href = '/?ad=' + id; }, 60);
      }
    }
  };
  xhr.send();
}

function openProfile(sellerId) {
  const ads = _ads.filter(function(a){ return a.sellerId === sellerId; });
  const sample = ads[0]; if (!sample) return;
  const clr = avatarColor(sample.seller||'?');
  const ini = sample.sellerInit || initials(sample.seller||'?');
  const name = sample.seller || 'Anonymous';
  const activeAds = ads.filter(function(a){ return a.status !== 'sold'; });
  const ratings = typeof getRatings === 'function' ? getRatings(sellerId) : [];
  const avgRating = ratings.length ? (ratings.reduce(function(s,r){return s+r.stars;},0)/ratings.length).toFixed(1) : null;
  const verified = typeof isSellerVerified === 'function' && isSellerVerified(sellerId);
  const totalViews = ads.reduce(function(s,a){ return s+(a.views||0); },0);

  document.getElementById('profileInner').innerHTML =
    '<div class="prof-header">' +
      '<div class="prof-avatar" style="background:' + clr.bg + ';color:' + clr.fg + '">' + ini + '</div>' +
      '<div class="prof-info">' +
        '<div class="prof-name">' + escHtml(name) + (verified ? ' <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#005c35"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</div>' +
        '<div class="prof-since">📍 ' + (sample.parish||'Jamaica') + ' · Yaad Adz Seller</div>' +
        (avgRating ? '<div style="font-size:13px;color:#888;margin-top:2px">⭐ ' + avgRating + ' avg · ' + ratings.length + ' review' + (ratings.length!==1?'s':'') + '</div>' : '') +
        '<div class="prof-stats">' +
          '<div><div class="prof-stat-n">' + activeAds.length + '</div><div class="prof-stat-l">Active Ads</div></div>' +
          '<div><div class="prof-stat-n">' + ads.filter(function(a){return a.status==='sold';}).length + '</div><div class="prof-stat-l">Sold</div></div>' +
          '<div><div class="prof-stat-n">' + fmtN(totalViews) + '</div><div class="prof-stat-l">Total Views</div></div>' +
        '</div>' +
      '</div>' +
      (CU && CU.id !== sellerId && ads.length
        ? '<button class="btn btn-gold btn-sm" onclick="openChat(\'' + ads[0].id + '\',\'' + sellerId + '\',\'' + escHtml(name) + '\',\'' + ini + '\')">✉️ Message</button>'
        : '') +
    '</div>' +
    (ratings.length
      ? '<div style="padding:12px 16px;border-top:1px solid #f0f0f0"><strong style="font-size:13px">Recent Reviews</strong>' +
        ratings.slice(-6).reverse().map(function(r){
          return '<div style="margin-top:8px;font-size:13px"><span>' + '★'.repeat(r.stars) + '☆'.repeat(5-r.stars) + '</span> <span style="color:#555">' + escHtml(r.comment||'') + '</span></div>';
        }).join('') +
        '</div>'
      : '') +
    '<div class="prof-body">' +
      '<h3 style="font-family:var(--font-d);font-size:18px;margin:0 0 16px">Listings by ' + escHtml(name.split(' ')[0]) + '</h3>' +
      (ads.length
        ? '<div class="listings-grid">' + ads.slice(0,12).map(function(a,i){ return cardHTML(a,i); }).join('') + '</div>'
        : '<p style="color:var(--text-3)">No active listings.</p>') +
    '</div>';

  closeOverlay('ovDetail');
  openOverlay('ovProfile');
}


/* ═══════════════════════════════════════════════════════════
   RATINGS SYSTEM §RATINGS
═══════════════════════════════════════════════════════════ */
let _currentRateSellerId = null;
let _currentRateStars = 0;

function getRatings(sellerId) {
  const all = JSON.parse(localStorage.getItem('ya_ratings')||'[]');
  return all.filter(r => r.sellerId === sellerId);
}
function saveRating(sellerId, stars, comment) {
  const all = JSON.parse(localStorage.getItem('ya_ratings')||'[]');
  // One review per reviewer per seller
  const filtered = all.filter(r => !(r.sellerId===sellerId && r.reviewerId===CU.id));
  filtered.push({ sellerId, reviewerId: CU.id, reviewerName: CU.name, stars, comment, ts: Date.now() });
  localStorage.setItem('ya_ratings', JSON.stringify(filtered));
}
function openRateModal(sellerId, sellerName) {
  if (!CU) return openAuth('login');
  _currentRateSellerId = sellerId; _currentRateStars = 0;
  document.getElementById('rateSellerName').textContent = `How was your experience with ${sellerName}?`;
  document.getElementById('rateComment').value = '';
  setRateStar(0);
  openOverlay('ovRate');
}
function setRateStar(n) {
  _currentRateStars = n;
  document.querySelectorAll('.rate-star').forEach((s,i) => s.classList.toggle('lit', i<n));
}
function submitRating() {
  if (!_currentRateStars) { showToast('Please select a star rating','⭐'); return; }
  saveRating(_currentRateSellerId, _currentRateStars, document.getElementById('rateComment').value.trim());
  closeOverlay('ovRate');
  showToast('Rating submitted — thank you! ⭐', '⭐');
}

/* ═══════════════════════════════════════════════════════════
   VERIFIED SELLERS §VERIFIED
═══════════════════════════════════════════════════════════ */
function isSellerVerified(sellerId) {
  // Sellers with 3+ 4-star reviews are auto-verified
  const ratings = getRatings(sellerId);
  const good = ratings.filter(r => r.stars >= 4);
  return good.length >= 3;
}

/* ═══════════════════════════════════════════════════════════
   REPORT LISTING §REPORT
═══════════════════════════════════════════════════════════ */
let _reportAdId = null, _reportReason = null;
function openReport(adId) {
  _reportAdId = adId; _reportReason = null;
  document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('reportSubmitBtn').disabled = true;
  openOverlay('ovReport');
}
function selectReport(el, reason) {
  _reportReason = reason;
  document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('reportSubmitBtn').disabled = false;
}
function submitReport() {
  if (!_reportReason || !_reportAdId) return;
  const reports = JSON.parse(localStorage.getItem('ya_reports')||'[]');
  reports.push({ adId: _reportAdId, reason: _reportReason, ts: Date.now(), reporterId: CU?.id||'guest' });
  localStorage.setItem('ya_reports', JSON.stringify(reports));
  closeOverlay('ovReport');
  showToast('Report submitted — we\'ll review it.', '🚩');
}

/* ═══════════════════════════════════════════════════════════
   MAKE AN OFFER §OFFER
═══════════════════════════════════════════════════════════ */
function openOfferPanel(adId) {
  const panel = document.getElementById('offerPanel'); if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) setTimeout(() => document.getElementById('offerAmt')?.focus(), 100);
}
async function sendOffer(adId, sellerId, sellerName, sellerInit) {
  if (!CU) return openAuth('login');
  const amt = parseFloat(document.getElementById('offerAmt')?.value);
  if (!amt || amt <= 0) { showToast('Please enter a valid offer amount','⚠️'); return; }
  const ad = _ads.find(a => a.id === adId);
  const key = convKey(CU.id, sellerId, adId);
  if (!_msgs[key]) {
    _msgs[key] = { adId, adTitle: ad?.title||'', sellerName, sellerInit, sellerId,
      buyerId: CU.id, buyerName: CU.name, buyerInit: initials(CU.name), messages: [] };
  }
  const offerText = `💰 Offer: J$${fmtN(amt)} for "${ad?.title||'this item'}"`;
  try {
    await sbSendMessage(key, _msgs[key], offerText);
    document.getElementById('offerPanel')?.classList.remove('open');
    closeOverlay('ovDetail');
    currentConv = key; renderChat(key); openOverlay('ovChat');
    showToast(`Offer of J$${fmtN(amt)} sent! 💰`, '💰');
  } catch(e) { showToast('Could not send offer. Try again.','⚠️'); }
}

/* ═══════════════════════════════════════════════════════════
   SHARE AD §SHARE
═══════════════════════════════════════════════════════════ */
async function shareAd(id) {
  const ad = _ads.find(a => a.id === id); if (!ad) return;
  const url = 'https://yaadadz.com/ad/' + slugify(ad) + '.html';
  const text = ad.title + ' — J$' + fmtN(ad.price) + ' on Yaad Adz';
  const shareData = { title: ad.title, text: text, url: url };

  // Try native share (mobile)
  if (navigator.share) {
    try { await navigator.share(shareData); return; } catch(e) { /* user cancelled or failed — fall through */ }
  }

  // Clipboard fallback — works on HTTPS
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied!', '🔗');
  } catch(e) {
    // Final fallback — textarea copy method (works everywhere)
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Link copied!', '🔗');
    } catch(e2) {
      // Can't copy at all — show the URL so user can manually copy
      showToast(url, '🔗');
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   FAVOURITES COUNT (for analytics)
═══════════════════════════════════════════════════════════ */
function getFavCount(id) {
  // Count how many users have this in their local favs — approximate
  return L.favs.includes(id) ? 1 : 0;
}

/* ═══════════════════════════════════════════════════════════
   CONFETTI CELEBRATION
═══════════════════════════════════════════════════════════ */
function launchConfetti() {
  const colors = ['#f4c300','#005c35','#ffffff','#00703f','#ffd700'];
  const count = 80;
  const container = document.body;
  for (let i=0; i<count; i++) {
    const el = document.createElement('div');
    const size = Math.random()*8+5;
    const color = colors[Math.floor(Math.random()*colors.length)];
    const startX = Math.random()*100;
    const delay = Math.random()*0.8;
    const duration = Math.random()*1.5+1.2;
    el.style.cssText = `position:fixed;top:-10px;left:${startX}vw;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random()>0.5?'50%':'2px'};z-index:9999;pointer-events:none;animation:confettiFall ${duration}s ${delay}s ease-in forwards;opacity:1;transform:rotate(${Math.random()*360}deg)`;
    container.appendChild(el);
    setTimeout(() => el.remove(), (duration+delay+0.5)*1000);
  }
}
// Inject confetti keyframes once
if (!document.getElementById('confettiStyles')) {
  const s = document.createElement('style');
  s.id = 'confettiStyles';
  s.textContent = '@keyframes confettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}';
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS §PUSH
   ─ requestPushPermission: ask user after login (polite timing)
   ─ sendPushNotification: fire when new message arrives
   Uses the Web Notifications API — works on Android PWA and
   desktop. iOS 16.4+ supports it when installed as PWA.
═══════════════════════════════════════════════════════════ */
function requestPushPermission() {
  // Only ask if not already decided
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

  // Show a friendly in-app prompt first — better than raw browser dialog
  const banner = document.createElement('div');
  banner.id = 'pushBanner';
  banner.style.cssText = [
    'position:fixed;',
    'bottom:calc(80px + env(safe-area-inset-bottom, 0px));',
    'left:12px;right:12px;',
    'background:#172a1f;',
    'border:1px solid rgba(29,185,84,0.35);',
    'border-radius:16px;padding:14px 16px;',
    'display:flex;align-items:center;gap:12px;',
    'box-shadow:0 8px 32px rgba(0,0,0,0.6);',
    'z-index:99999;',
    'animation:pushSlideUp .3s ease;',
  ].join('');
  banner.innerHTML =
    '<div style="font-size:28px">🔔</div>' +
    '<div style="flex:1">' +
      '<div style="font-weight:700;font-size:14px;color:#e8ede9;margin-bottom:2px">Get message alerts</div>' +
      '<div style="font-size:12px;color:#6b7a71">Know instantly when a seller replies</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-shrink:0">' +
      '<button onclick="dismissPushBanner()" style="background:rgba(255,255,255,0.08);border:none;color:#a0a8a4;padding:7px 12px;border-radius:8px;font-size:13px;cursor:pointer">Not now</button>' +
      '<button onclick="enablePushNotifications()" style="background:#1db954;border:none;color:#fff;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Enable</button>' +
    '</div>';
  document.body.appendChild(banner);

  // Auto-dismiss after 8 seconds
  setTimeout(function() { dismissPushBanner(); }, 8000);
}

function dismissPushBanner() {
  const b = document.getElementById('pushBanner');
  if (b) { b.style.animation = 'pushSlideDown .25s ease forwards'; setTimeout(function(){ b.remove(); }, 250); }
}

function enablePushNotifications() {
  dismissPushBanner();
  Notification.requestPermission().then(function(permission) {
    if (permission === 'granted') {
      showToast('Notifications enabled! 🔔', '🔔');
      // Store preference
      try { localStorage.setItem('ya_push', '1'); } catch(e) {}
    }
  });
}

function sendPushNotification(title, body, url) {
  // Only fire if tab is hidden (user is away) and permission granted
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return; // Don't interrupt if user is actively on the page

  try {
    const n = new Notification(title, {
      body: body,
      icon: 'https://yaadadz.com/icon-192.png',
      badge: 'https://yaadadz.com/icon-72.png',
      tag: 'yaadadz-message', // Replace previous notification
      renotify: true,
      vibrate: [200, 100, 200],
    });
    n.onclick = function() {
      window.focus();
      if (url) { window.location.href = url; }
      n.close();
    };
    // Auto-close after 6 seconds
    setTimeout(function() { n.close(); }, 6000);
  } catch(e) {
    // Notification API may be restricted in some contexts — fail silently
  }
}

// Add slide animations for push banner
(function() {
  if (document.getElementById('pushAnimStyles')) return;
  const s = document.createElement('style');
  s.id = 'pushAnimStyles';
  s.textContent = [
    '@keyframes pushSlideUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }',
    '@keyframes pushSlideDown { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(20px); } }',
  ].join('');
  document.head.appendChild(s);
})();

/* ═══════════════════════════════════════════════════════════
   ACTIVITY TICKER (removed — stub for compatibility)
═══════════════════════════════════════════════════════════ */
function updateTicker() {}

