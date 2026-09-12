/* ═══════════════════════════════════════════════════════════
   UI UTILITIES — Overlay, Toast, Skeletons §UTIL
═══════════════════════════════════════════════════════════ */
function openOverlay(id)  {
  const el = document.getElementById(id); if (!el) return;
  el.classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeOverlay(id) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.remove('open');
  if (!document.querySelector('.overlay.open')) document.body.style.overflow = '';
}
// Close overlay on backdrop click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('overlay')) closeOverlay(e.target.id);
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(function(m){ closeOverlay(m.id); });
});

let _toastTimer;
function showToast(msg, icon, action) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  // v2: optional action button — pass { label, fn } as the 3rd argument.
  // Non-breaking: all existing showToast(msg, icon) calls keep working.
  // Built with DOM APIs (not innerHTML) so dynamic text like user names can't inject HTML.
  const hasAction = action && typeof action.fn === 'function';
  t.textContent = '';
  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'toast-icon';
    ic.textContent = icon;
    t.appendChild(ic);
  }
  const msgEl = document.createElement('span');
  msgEl.className = 'toast-msg';
  msgEl.textContent = msg;
  t.appendChild(msgEl);
  if (hasAction) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      clearTimeout(_toastTimer);
      t.classList.remove('show');
      t.style.pointerEvents = '';
      action.fn();
    });
    t.appendChild(btn);
    t.style.pointerEvents = 'auto';
  } else {
    t.style.pointerEvents = '';
  }
  requestAnimationFrame(function() { t.classList.add('show'); });
  clearTimeout(_toastTimer);
  // Action toasts linger longer so users have time to tap the button
  _toastTimer = setTimeout(function() {
    t.classList.remove('show');
    t.style.pointerEvents = '';
  }, hasAction ? 6500 : 2800);
}

function showSkeletons() {
  const grid = document.getElementById('homeGrid');
  if (!grid) return;
  grid.innerHTML = Array(8).fill(
    '<div class="ad-card sk-card" style="pointer-events:none">' +
      '<div class="ad-card-img sk-img"></div>' +
      '<div class="ad-card-body">' +
        '<div class="sk-line" style="height:12px;width:45%;margin-bottom:8px"></div>' +
        '<div class="sk-line" style="height:16px;margin-bottom:6px"></div>' +
        '<div class="sk-line" style="height:10px;width:60%"></div>' +
      '</div>' +
    '</div>'
  ).join('');
}
function scrollToResults() {
  const el = document.getElementById('homeGrid') || document.getElementById('resultsHeader');
  if (el) setTimeout(function(){ el.scrollIntoView({ behavior:'smooth', block:'start' }); }, 50);
}

/** Google Analytics helper (safe no-op if gtag missing) */
function gaEvent(name, params) {
  try {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  } catch (e) {}
}

/** Thumbnail URL — Supabase storage resize when available */
function thumbUrl(url, width) {
  if (!url) return '';
  const w = width || 120;
  // The plain object URL ignores ?width= — only the /render/image/ endpoint
  // actually resizes (verified working for this project).
  const m = url.match(/^https:\/\/([^.]+)\.supabase\.co\/storage\/v1\/object\/public\/(.+)$/);
  if (m) {
    return 'https://' + m[1] + '.supabase.co/storage/v1/render/image/public/' + m[2]
      + '?width=' + w + '&quality=75';
  }
  return url;
}

/* ═══════════════════════════════════════════════════════════
   HERO / AI RESPONSE
═══════════════════════════════════════════════════════════ */
function showAiResponse(text, count) {
  const card = document.getElementById('aiResponseCard');
  const textEl = document.getElementById('aiResponseText');
  const badge = document.getElementById('aiCountBadge');
  if (!card) return;
  textEl.innerHTML = escHtml(text).replace(/\n/g, '<br>');
  if (count !== null && count !== undefined) {
    badge.textContent = count + ' listing' + (count !== 1 ? 's' : '');
    badge.classList.add('show');
  } else { badge.classList.remove('show'); }
  card.classList.add('show');
  const reset = document.querySelector('.hero-reset');
  if (reset) reset.style.display = '';
}
function hideAiResponse() {
  const card = document.getElementById('aiResponseCard');
  if (card) card.classList.remove('show');
}
function compactHero() {
  const hero = document.getElementById('heroSection');
  if (hero) hero.classList.add('compact');
}
function resetHeroSearch() {
  searchQ = ''; activeF = 'all'; window._aiFilters = null;
  _homeShowCount = _homePageSize;
  const inp = document.getElementById('aiInput');
  if (inp) inp.value = '';
  const hero = document.getElementById('heroSection');
  if (hero) hero.classList.remove('compact');
  hideAiResponse();
  renderCats(); renderHome();
  const reset = document.querySelector('.hero-reset');
  if (reset) reset.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   AUTH — Modal, Login, Register, Logout §AUTH
═══════════════════════════════════════════════════════════ */
function openAuth(tab) {
  authTab(tab || 'login');
  document.getElementById('authAlert').classList.remove('show');
  openOverlay('ovAuth');
}
function authTab(t) {
  document.getElementById('fLogin').style.display = t === 'login' ? '' : 'none';
  document.getElementById('fReg').style.display   = t === 'register' ? '' : 'none';
  document.getElementById('tLogin').classList.toggle('active', t === 'login');
  document.getElementById('tReg').classList.toggle('active',   t === 'register');
  document.getElementById('authAlert').classList.remove('show');
}
function authErr(m) {
  const e = document.getElementById('authAlert');
  e.textContent = m; e.className = 'alert-box alert-err show';
}
async function doLogin() {
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  if (!email || !pass) return authErr('Please fill in all fields.');
  const btn = document.querySelector('#fLogin .btn-green');
  if (btn) { btn.textContent = 'Logging in…'; btn.disabled = true; }
  try {
    const user = await sbLogin(email, pass);
    CU = { id: user.id, name: user.name, email: user.email, phone: user.phone || '', parish: user.parish || '' };
    L.sess = CU;
    await loadMessages(); subscribeMessages();
    closeOverlay('ovAuth');
    renderNav(); updateStats(); updateMsgBadge();
    showToast('Welcome back, ' + user.name.split(' ')[0] + '! 👋', '👋');
    // Ask for push permission after login (polite — user just chose to engage)
    setTimeout(requestPushPermission, 4000);
  } catch(e) {
    authErr(e.message || 'Incorrect email or password.');
  } finally {
    if (btn) { btn.textContent = 'Log In'; btn.disabled = false; }
  }
}
async function doRegister() {
  const name   = document.getElementById('rName').value.trim();
  const email  = document.getElementById('rEmail').value.trim();
  const phone  = document.getElementById('rPhone').value.trim();
  const pass   = document.getElementById('rPass').value;
  const parish = document.getElementById('rParish').value;
  if (!name || !email || !pass) return authErr('Please fill in all required fields.');
  if (pass.length < 6) return authErr('Password must be at least 6 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authErr('Please enter a valid email.');
  const btn = document.querySelector('#fReg .btn-green');
  if (btn) { btn.textContent = 'Creating account…'; btn.disabled = true; }
  try {
    const user = await sbRegister(name, email, phone, parish, pass);
    CU = { id: user.id, name, email, phone, parish };
    L.sess = CU;
    subscribeMessages();
    closeOverlay('ovAuth');
    renderNav(); updateStats(); updateMsgBadge();
    showToast('Welcome to Yaad Adz, ' + name.split(' ')[0] + '! 🎉', '🎉');
    launchConfetti();
    // Ask for push permission after registration
    setTimeout(requestPushPermission, 5000);
  } catch(e) {
    authErr(e.message || 'Registration failed. Please try again.');
  } finally {
    if (btn) { btn.textContent = 'Create Free Account'; btn.disabled = false; }
  }
}
function doLogout() {
if (_msgChannel) { _db.removeChannel(_msgChannel); _msgChannel = null; }
  if (_db && _db.auth) _db.auth.signOut().catch(function(){});
  CU = null; L.sess = null; _msgs = {};
  renderNav(); updateMsgBadge(); goHome();
  showToast('Logged out successfully.', '👋');
}
/* ═══════════════════════════════════════════════════════════
   MSG BADGE
═══════════════════════════════════════════════════════════ */
function updateMsgBadge() {
  const count = typeof unreadCount === 'function' ? unreadCount() : 0;
  // Mobile bottom nav badge
  const badge = document.getElementById('mobMsgBadge');
  const updUnread = typeof siteUpdateUnread === 'function' && siteUpdateUnread();
  if (badge) {
    if (count > 0) { badge.textContent = count; badge.classList.add('show'); badge.classList.remove('is-update'); }
    else if (updUnread) { badge.textContent = '!'; badge.classList.add('show', 'is-update'); }
    else { badge.textContent = ''; badge.classList.remove('show', 'is-update'); }
  }
  // Desktop nav badge
  const navBadge = document.getElementById('navMsgBadge');
  if (navBadge) {
    if (count > 0) { navBadge.textContent = count > 9 ? '9+' : count; navBadge.style.display = ''; navBadge.classList.remove('is-update'); }
    else if (updUnread) { navBadge.textContent = '!'; navBadge.style.display = ''; navBadge.classList.add('is-update'); }
    else { navBadge.style.display = 'none'; navBadge.classList.remove('is-update'); }
  }
}

/* ── MESSAGING — renderChat, renderInbox, sendMsg, openChat §MESSAGING ── */

/* Persistent "Yaad Adz updates" thread row — always visible in inboxes so
   members can re-check the full update history ANY time. Gold "New" chip
   (+ pill dot) while the newest update is unread; History chip once read. */
function siteUpdateRowHtml() {
  const meta = (typeof siteUpdateMeta === 'function' && siteUpdateMeta()) || null;
  if (!meta) return '';
  const updUnread = typeof siteUpdateUnread === 'function' && siteUpdateUnread();
  const body = meta.body || '';
  const preview = body.length > 90 ? body.slice(0, 89) + '…' : body;
  const name = 'What’s new' + (meta.version ? ' · ' + escHtml(meta.version) : '');
  const chip = updUnread ? '<span class="su-new-chip">New</span>'
                         : '<span class="su-open-chip">History</span>';
  const time = updUnread ? 'now' : (meta.date ? escHtml(meta.date.split(',')[0]) : '');
  return '<div class="inbox-item site-update-inbox' + (updUnread ? ' unread' : '') + '" onclick="openSiteUpdate()">' +
    '<div class="inbox-avatar su-avatar">' + escHtml(meta.icon || '🗞️') + '</div>' +
    '<div class="inbox-info">' +
      '<div class="inbox-name">' + name + chip + '</div>' +
      '<div class="inbox-preview">' + escHtml(preview) + '</div>' +
      '<span class="inbox-ad">🗞️ Yaad Adz updates · tap for full history</span>' +
    '</div>' +
    '<div class="inbox-time">' + time + '</div>' +
  '</div>';
}

/* Chat history window — long threads render the most recent slice with a
   "Load earlier messages" button instead of mounting hundreds of bubbles
   at once. Everything stays in memory (fetched from Supabase), so paging
   back through history is instant and works offline from the cache. */
var CHAT_WINDOW = 60;
var _chatShown = {};   // conversation key -> how many messages are rendered
var _chatKeepPos = false;
var _prevChatH = 0;

function dayLabel(d) {
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var that  = new Date(d.getFullYear(),  d.getMonth(),  d.getDate()).getTime();
  var days = Math.round((today - that) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderChat(key) {
  const conv = _msgs[key]; if (!conv) return;
  const isbuyer = CU.id === conv.buyerId;
  const otherName = isbuyer ? conv.sellerName : conv.buyerName;
  const otherInit = isbuyer ? conv.sellerInit : conv.buyerInit;
  const clr = avatarColor(otherName);

  var shown = _chatShown[key] || CHAT_WINDOW;
  if (shown > conv.messages.length) shown = conv.messages.length;
  // _chatShown[key] === 2 means "show everything" (set by loadEarlierMsgs).
  if (_chatShown[key] === 2) shown = conv.messages.length;
  var hiddenCount = conv.messages.length - shown;
  var slice = conv.messages.slice(hiddenCount);

  var msgsHtml = '';
  if (!conv.messages.length) {
    msgsHtml = '<div style="text-align:center;padding:40px 0;color:var(--text-3);font-size:14px">Start the conversation!</div>';
  } else {
    if (hiddenCount > 0) {
      msgsHtml += '<div class="chat-earlier"><button class="chat-earlier-btn" onclick="loadEarlierMsgs(\'' + key + '\')">⬆ Show full history (' + hiddenCount + ' more)</button></div>';
    }
    var lastDay = '';
    slice.forEach(function(m) {
      var d = new Date(m.ts);
      var dayKey = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        msgsHtml += '<div class="chat-day-sep"><span>' + escHtml(dayLabel(d)) + '</span></div>';
      }
      var out = m.from === CU.id;
      msgsHtml += '<div class="msg ' + (out?'msg-out':'msg-in') + '">' +
        '<div class="msg-bubble">' + escHtml(m.text||'') + '</div>' +
        '<div class="msg-time">' + fmtTime(m.ts) + '</div></div>';
    });
  }

  document.getElementById('chatInner').innerHTML =
    '<div class="chat-header">' +
      '<div class="s-avatar" style="background:' + clr.bg + ';color:' + clr.fg + ';width:42px;height:42px;font-size:16px">' + otherInit + '</div>' +
      '<div class="chat-info"><div class="chat-name">' + otherName + '</div><div class="chat-ad-ref">Re: ' + (conv.adTitle||'') + '</div></div>' +
    '</div>' +
    '<div class="chat-messages" id="chatMsgs">' + msgsHtml + '</div>' +
    '<div class="chat-input-row">' +
      '<input class="chat-input" id="chatInput" placeholder="Type a message…" onkeydown="if(event.key===\'Enter\')sendMsg()">' +
      '<button class="chat-send" onclick="sendMsg()">➤</button>' +
    '</div>';
  setTimeout(function(){
    const el = document.getElementById('chatMsgs');
    if (!el) return;
    // After "Load earlier", stay anchored where the user was reading;
    // otherwise land on the newest message as before.
    el.scrollTop = _chatKeepPos ? (el.scrollHeight - _prevChatH) : el.scrollHeight;
    _chatKeepPos = false;
  }, 50);
}

// Expand the chat to the FULL thread in one tap (scroll stays anchored).
// The first open renders the latest CHAT_WINDOW only for performance, but
// there is no hard cap — one tap unfurls the entire conversation, so
// scrolling back through history is effectively unlimited.
function loadEarlierMsgs(key) {
  var conv = _msgs[key]; if (!conv) return;
  var msgsEl = document.getElementById('chatMsgs');
  _prevChatH = msgsEl ? msgsEl.scrollHeight : 0;
  _chatKeepPos = true;
  _chatShown[key] = 2; // sentinel: renderChat shows the ENTIRE thread
  renderChat(key);
}

function renderInbox() {
  const el = document.getElementById('inboxList');
  if (!CU) { el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><h3>Messages</h3><p>Log in to view your conversations.</p><button class="btn btn-green" onclick="openAuth(\'login\')">Log In</button></div>'; return; }
  const myConvs = Object.entries(_msgs).filter(function(e){ return e[1].sellerId===CU.id || e[1].buyerId===CU.id; });
  myConvs.sort(function(a,b){ return (b[1].messages.at(-1)?.ts||0)-(a[1].messages.at(-1)?.ts||0); });
  const _updateRow = siteUpdateRowHtml();
  if (!myConvs.length) {
    // The updates thread is always available, so the inbox is never dead-empty.
    el.innerHTML = _updateRow + '<div class="inbox-empty-hint">No conversations yet — open any listing and tap 💬 to message a seller.</div>';
    return;
  }
  el.innerHTML = _updateRow + myConvs.map(function(e){
    const key = e[0], conv = e[1];
    const isbuyer = CU.id === conv.buyerId;
    const otherName = isbuyer ? conv.sellerName : conv.buyerName;
    const otherInit = isbuyer ? conv.sellerInit : conv.buyerInit;
    const last = conv.messages.at(-1);
    const unread = conv.messages.filter(function(m){ return m.from !== CU.id && !m.read; }).length;
    const clr = avatarColor(otherName);
    return '<div class="inbox-item' + (unread?' unread':'') + '" onclick="openChatFromInbox(\'' + key + '\')">' +
      '<div class="inbox-avatar" style="background:' + clr.bg + ';color:' + clr.fg + '">' + otherInit + '</div>' +
      '<div class="inbox-info">' +
        '<div class="inbox-name">' + (otherName||'') + (unread?'<span style="background:var(--green);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px">' + unread + ' new</span>':'') + '</div>' +
        '<div class="inbox-preview">' + (last ? escHtml(last.text) : 'Start a conversation…') + '</div>' +
        '<span class="inbox-ad">📋 ' + (conv.adTitle||'') + '</span>' +
      '</div>' +
      '<div class="inbox-time">' + (last ? fmtTime(last.ts) : '') + '</div>' +
    '</div>';
  }).join('');
}

async function sendMsg() {
  const input = document.getElementById('chatInput');
  const text = (input?.value || '').trim();
  if (!text || !currentConv || !CU) return;
  const conv = _msgs[currentConv]; if (!conv) return;
  input.value = '';
  try {
    await sbSendMessage(currentConv, conv, text);
    renderChat(currentConv); updateMsgBadge();
  } catch(e) { showToast('Message failed. Try again.', '⚠️'); }
}

function openChat(adId, sellerId, sellerName, sellerInit) {
  if (!CU) return openAuth('login');
  const ad = _ads.find(function(a){ return a.id === adId; });
  const key = convKey(CU.id, sellerId, adId);
  if (!_msgs[key]) {
    _msgs[key] = { adId, adTitle: ad?.title||'', sellerName, sellerInit, sellerId,
      buyerId: CU.id, buyerName: CU.name, buyerInit: initials(CU.name), messages: [] };
  }
  currentConv = key;
  _chatShown[key] = CHAT_WINDOW;
  renderChat(key);
  openOverlay('ovChat');
  updateMsgBadge();
  // Silent background history refresh — re-opens show the full past even
  // if the realtime channel dropped messages while the app was open.
  if (typeof refreshMessages === 'function') {
    var before = _msgs[key].messages.length;
    refreshMessages().then(function(){
      var c = _msgs[key];
      if (c && c.messages.length > before && currentConv === key) renderChat(key);
    });
  }
}

async function openChatFromInbox(key) {
  const conv = _msgs[key]; if (!conv) return;
  await sbMarkRead(key);
  currentConv = key;
  _chatShown[key] = CHAT_WINDOW;
  renderChat(key);
  openOverlay('ovChat');
  updateMsgBadge();
  if (document.getElementById('page-msgs')?.classList.contains('active')) renderInbox();
  // Silent background history refresh — the full past re-reads correctly
  // even if the realtime channel dropped messages earlier in the session.
  if (typeof refreshMessages === 'function') {
    var before = (conv.messages && conv.messages.length) || 0;
    refreshMessages().then(function(){
      var c = _msgs[key];
      if (c && c.messages.length > before && currentConv === key) renderChat(key);
      if (document.getElementById('page-msgs')?.classList.contains('active')) renderInbox();
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   MY ADS
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   ACCOUNT PAGE — Profile Card + My Ads §ACCOUNT
═══════════════════════════════════════════════════════════ */
function renderProfileCard() {
  const el = document.getElementById('profileCard');
  if (!el || !CU) { if(el) el.innerHTML=''; return; }
  const clr = avatarColor(CU.name);
  const ini = initials(CU.name);
  const myAds = _ads.filter(a => a.sellerId === CU.id);
  const activeCount = myAds.filter(a => a.status !== 'sold').length;
  const soldCount = myAds.filter(a => a.status === 'sold').length;
  el.innerHTML =
    '<div style="background:var(--nav-bg);border-radius:var(--r-lg);overflow:hidden">' +
      '<div style="padding:28px 24px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">' +
        '<div class="s-avatar" style="background:'+clr.bg+';color:'+clr.fg+';width:64px;height:64px;font-size:24px;flex-shrink:0">'+ini+'</div>' +
        '<div style="flex:1;min-width:160px">' +
          '<div style="font-family:var(--font-d);font-size:22px;font-weight:800;color:#fff">'+escHtml(CU.name)+'</div>' +
          '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-top:2px">'+escHtml(CU.email)+'</div>' +
          (CU.phone ? '<div style="font-size:13px;color:rgba(255,255,255,.45);margin-top:1px">📱 '+escHtml(CU.phone)+'</div>' : '') +
          (CU.parish ? '<div style="font-size:13px;color:rgba(255,255,255,.45);margin-top:1px">📍 '+escHtml(CU.parish)+'</div>' : '') +
        '</div>' +
        '<button class="btn btn-outline btn-sm" onclick="openEditProfile()">✏️ Edit Profile</button>' +
      '</div>' +
      '<div style="display:flex;gap:0;border-top:1px solid rgba(255,255,255,.08)">' +
        '<div style="flex:1;text-align:center;padding:14px 0">' +
          '<div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:var(--gold)">'+myAds.length+'</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px">Total Ads</div>' +
        '</div>' +
        '<div style="flex:1;text-align:center;padding:14px 0;border-left:1px solid rgba(255,255,255,.08)">' +
          '<div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:#4ade80">'+activeCount+'</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px">Active</div>' +
        '</div>' +
        '<div style="flex:1;text-align:center;padding:14px 0;border-left:1px solid rgba(255,255,255,.08)">' +
          '<div style="font-family:var(--font-d);font-size:22px;font-weight:700;color:rgba(255,255,255,.5)">'+soldCount+'</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px">Sold</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost btn-sm" onclick="doLogout()">🚪 Log Out</button>' +
    '</div>';
}

function renderMyAds() {
  renderProfileCard();
  // Render messages into account page inbox
  const acctInbox = document.getElementById('acctInboxList');
  if (acctInbox) {
    if (!CU) {
      acctInbox.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Log in to view messages.</p></div>';
    } else {
      const keys = Object.keys(_msgs);
      const _updateRow = siteUpdateRowHtml();
      if (!keys.length) {
        // The updates thread is always available, so the inbox is never dead-empty.
        acctInbox.innerHTML = _updateRow + '<div class="inbox-empty-hint">No conversations yet — open any listing and tap 💬 to message a seller.</div>';
      } else {
        const _msgsHtml = keys.map(function(key) {
          const conv = _msgs[key];
          const msgs = conv.messages || [];
          const last = msgs[msgs.length - 1];
          const unread = msgs.filter(function(m){ return !m.read && m.from !== CU.id; }).length;
          const other = CU.id === conv.sellerId ? conv.buyerName : conv.sellerName;
          const otherInit = CU.id === conv.sellerId ? conv.buyerInit : conv.sellerInit;
          return '<div class="inbox-item' + (unread ? ' unread' : '') + '" onclick="openChatFromInbox(\'' + key + '\')">' +
            '<div class="inbox-avatar">' + (otherInit || '?') + '</div>' +
            '<div class="inbox-body">' +
              '<div class="inbox-top"><span class="inbox-name">' + (other || 'User') + '</span>' +
              '<span class="inbox-time">' + (last ? ago(last.ts) : '') + '</span></div>' +
              '<div class="inbox-prev">' + (conv.adTitle || '') + (last ? ' · ' + last.text.slice(0, 40) : '') + '</div>' +
            '</div>' +
            (unread ? '<div class="inbox-badge">' + unread + '</div>' : '') +
            '</div>';
        }).join('');
        acctInbox.innerHTML = _updateRow + _msgsHtml;
      }
    }
  }
  const el = document.getElementById('myAdsBox');
  if (!CU) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔐</div><h3>Please log in</h3><p>You need an account to manage your listings.</p><button class="btn btn-green" onclick="openAuth(\'login\')">Log In</button></div>';
    return;
  }
  const ads = _ads.filter(function(a){ return a.sellerId === CU.id; });
  if (!ads.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><h3>No listings yet</h3><p>Post your first free ad and start selling today!</p><button class="btn btn-green" onclick="openPostAd()">Post Your First Ad</button></div>';
    return;
  }
  el.innerHTML = ads.map(function(ad) {
    const cat = CATS.find(function(c){ return c.id === ad.category; });
    const thumb = ad.image ? '<img src="' + ad.image + '" onerror="this.style.display=\'none\'">' : (cat?.icon||'📦');
    return '<div class="my-ad-row">' +
      '<div class="my-ad-thumb">' + thumb + '</div>' +
      '<div class="my-ad-info">' +
        '<div class="my-ad-title">' + escHtml(ad.title) + '</div>' +
        '<div class="my-ad-price">J$' + fmtN(ad.price) + '</div>' +
        '<div class="my-ad-meta">📍 ' + ad.parish + ' · ' + (cat?.name||'Other') + ' · ' + ago(ad.date) + '</div>' +
      '</div>' +
      '<span class="s-badge ' + (ad.status==='sold'?'s-sold':'s-active') + '">' + (ad.status==='sold'?'● Sold':'● Active') + '</span>' +
      '<div class="my-ad-acts">' +
        '<button class="btn btn-ghost btn-sm" onclick="openEditAd(\'' + ad.id + '\')">✏️ Edit</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="openDetail(\'' + ad.id + '\')">View</button>' +
        '<button class="btn ' + (ad.status==='sold'?'btn-ghost':'btn-red') + ' btn-sm" onclick="toggleSold(\'' + ad.id + '\');setTimeout(renderMyAds,200)">' + (ad.status==='sold'?'Relist':'Sold') + '</button>' +
        '<button class="btn btn-red btn-sm" onclick="delAd(\'' + ad.id + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   EDIT PROFILE
═══════════════════════════════════════════════════════════ */
function openEditProfile() {
  if (!CU) return openAuth('login');
  document.getElementById('epName').value = CU.name || '';
  document.getElementById('epEmail').value = CU.email || '';
  document.getElementById('epPhone').value = CU.phone || '';
  document.getElementById('epPassword').value = '';
  // Fill parish select
  const epParish = document.getElementById('epParish');
  epParish.innerHTML = '<option value="">Select parish…</option>' + PARISHES.map(p => '<option' + (p===CU.parish?' selected':'') + '>' + p + '</option>').join('');
  document.getElementById('editProfileAlert').className = 'alert-box';
  openOverlay('ovEditProfile');
}

async function saveProfile() {
  const name = document.getElementById('epName').value.trim();
  const phone = document.getElementById('epPhone').value.trim();
  const parish = document.getElementById('epParish').value;
  const password = document.getElementById('epPassword').value;
  const alertEl = document.getElementById('editProfileAlert');

  if (!name) { alertEl.textContent='Name is required.'; alertEl.className='alert-box alert-err show'; return; }

  const btn = document.getElementById('saveProfileBtn');
  btn.textContent = 'Saving…'; btn.disabled = true;

  try {
    const updates = { name, phone, parish };
    if (password && password.length >= 6) updates.password = password;
    else if (password && password.length > 0) {
      alertEl.textContent='Password must be at least 6 characters.'; alertEl.className='alert-box alert-err show';
      btn.textContent='Save Changes'; btn.disabled=false; return;
    }

    await sbUpdateUser(CU.id, updates);

    // Update local session
    CU.name = name;
    CU.phone = phone;
    CU.parish = parish;
    L.sess = CU;

    // Update seller name on all user's ads in DB and cache
    const myAds = _ads.filter(a => a.sellerId === CU.id);
    const newInit = initials(name);
    for (const ad of myAds) {
      ad.seller = name;
      ad.sellerInit = newInit;
    }
    if (myAds.length) {
      _db.from('ads').update({ seller_name: name, seller_init: newInit }).eq('seller_id', CU.id);
    }

    renderNav(); renderProfileCard(); renderMyAds();
    closeOverlay('ovEditProfile');
    showToast('Profile updated! ✅', '✅');
  } catch(e) {
    alertEl.textContent = 'Update failed: ' + (e.message||'try again');
    alertEl.className = 'alert-box alert-err show';
  } finally {
    btn.textContent = 'Save Changes'; btn.disabled = false;
  }
}

