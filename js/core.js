/* ═══════════════════════════════════════════════════════════
   ⚙️  CONFIG — Production credentials
   
   SUPABASE SETUP — run supabase-migration.sql in the SQL Editor once.
   It creates:
     - profiles table (linked to auth.users via trigger)
     - RLS policies for profiles, ads, messages
     - Storage bucket + policies for ad-images
     - increment_view() RPC function
   Auth uses Supabase Auth (signUp / signInWithPassword / signOut).
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   📍 TABLE OF CONTENTS — search "§" + section name to jump around
   (e.g. search "§MESSAGING" to jump straight to chat code)
   ───────────────────────────────────────────────────────────
   §CONFIG           Supabase creds, categories, constants   (here)
   §DB               Data functions — loadAds, CRUD, messages
   §STATE            In-memory + local storage state
   §UTIL             Formatting, overlays, toasts, skeletons
   §AUTH             Login, register, logout, session
   §MESSAGING        Chat rendering, inbox, send/receive
   §ACCOUNT          Profile card, my ads, edit profile
   §EDIT-AD          Edit an existing listing
   §POST-AD          New listing wizard
   §FAVOURITES       Save/unsave listings
   §INIT             Boot sequence — runs once on page load
   §UPLOAD           Photo picker + Supabase Storage upload
   §ADSENSE          Ad slot injection
   §NAV              Top nav + mobile bottom nav
   §PAGES            Page routing (home, category, detail, etc)
   §LISTING-RENDER   Card HTML, grid rendering
   §AI-SEARCH        Yaad Brain NLP + search scoring
   §SEO              Slug generation, JSON-LD, meta tags
   §AD-DETAIL        Single listing detail view
   §RATINGS          Seller ratings system
   §VERIFIED         Verified seller badges
   §REPORT           Report a listing
   §OFFER            Make-an-offer flow
   §SHARE            Share ad (native share / copy link)
   §PUSH             Push notification permission + send
   §LIGHTBOX         Fullscreen photo viewer
   §FLOAT-CHAT       Floating AI chat widget (desktop)
   §PWA              Install prompt
   §INFO-PAGES       About, Safety, Terms, Privacy, Contact
   §URL-PARAM        Deep-link handling (?ad=id)
   §QOL              Back-to-top, swipe-to-close, Cmd+K, pull-to-refresh
   §BOOT             init() call — where it all starts
   ═══════════════════════════════════════════════════════════ */

/* §CONFIG */
const CFG = {
  supabase: {
    url: 'https://cquwshpsfybvgqodbxsf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw',
    storageBucket: 'ad-images',  // Supabase Storage bucket name
  },
};


/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const CATS = [
  {id:'vehicles',   name:'Vehicles',     icon:'🚗', color:'#fff3e0'},
  {id:'property',   name:'Property',     icon:'🏡', color:'#e8f5e9'},
  {id:'electronics',name:'Electronics',  icon:'📱', color:'#e3f2fd'},
  {id:'fashion',    name:'Fashion',      icon:'👗', color:'#fce4ec'},
  {id:'furniture',  name:'Furniture',    icon:'🛋️', color:'#f3e5f5'},
  {id:'jobs',       name:'Jobs',         icon:'💼', color:'#e0f7fa'},
  {id:'services',   name:'Services',     icon:'🔧', color:'#fff8e1'},
  {id:'food',       name:'Food & Farm',  icon:'🥭', color:'#e8f5e9'},
  {id:'music',      name:'Music & Arts', icon:'🎵', color:'#ede7f6'},
  {id:'sports',     name:'Sports',       icon:'⚽', color:'#e0f2f1'},
  {id:'kids',       name:'Kids & Baby',  icon:'🧸', color:'#fbe9e7'},
  {id:'other',      name:'Other',        icon:'📦', color:'#f5f5f5'},
];

const PARISHES = ['Kingston','St. Andrew','St. Thomas','Portland','St. Mary','St. Ann','Trelawny','St. James','Hanover','Westmoreland','St. Elizabeth','Manchester','Clarendon','St. Catherine'];

const DEMO = [
  {id:'d1',title:'2019 Honda Civic LX — Low Mileage',category:'vehicles',price:2800000,parish:'Kingston',desc:'Excellent condition. Full AC, new tyres. 34,000 km only. Never in accident. Registered 2024. Serious enquiries only.',seller:'Marcus Reid',sellerInit:'MR',sellerId:'s1',phone:'876-456-7890',date:'2025-06-01',image:'',status:'active',neg:false, views:47},
  {id:'d2',title:'3-Bedroom House — Spanish Town',category:'property',price:18500000,parish:'St. Catherine',desc:'Newly renovated 3BR 2BA in quiet residential area. Large yard, modern kitchen, burglar bars. Close to school & market.',seller:'Donna Clarke',sellerInit:'DC',sellerId:'s2',phone:'876-321-5678',date:'2025-06-03',image:'',status:'active',neg:true, views:83},
  {id:'d3',title:'iPhone 14 Pro 256GB — Like New',category:'electronics',price:95000,parish:'St. James',desc:'Used 6 months only. Deep purple. Original box, charger & case included. No cracks. Battery 98%. Last price.',seller:'Kezia Brown',sellerInit:'KB',sellerId:'s3',phone:'876-654-3210',date:'2025-06-05',image:'',status:'active',neg:false, views:124},
  {id:'d4',title:'Graphic Designer — Logos, Flyers & Social',category:'services',price:5000,parish:'St. Andrew',desc:'Professional designer, 5+ years experience. Logos, flyers, business cards, Instagram content. Fast turnaround. WhatsApp for portfolio.',seller:'Andre Thomas',sellerInit:'AT',sellerId:'s4',phone:'876-789-0123',date:'2025-06-06',image:'',status:'active',neg:true, views:31},
  {id:'d5',title:'Fresh Ackee & Saltfish — Free Delivery',category:'food',price:1500,parish:'Clarendon',desc:'Fresh ackee from my own tree, cleaned and ready. Saltfish packages available. Free delivery within Clarendon.',seller:'Miss Gloria',sellerInit:'MG',sellerId:'s5',phone:'876-555-1234',date:'2025-06-07',image:'',status:'active',neg:false, views:19},
  {id:'d6',title:'Yamaha Guitar + Amp Bundle',category:'music',price:35000,parish:'Kingston',desc:'Yamaha Pacifica 112V in sonic blue. 15W amp, cable, strap & picks included. Perfect for beginners.',seller:'Justin Lee',sellerInit:'JL',sellerId:'s6',phone:'876-234-5678',date:'2025-06-08',image:'',status:'active',neg:false, views:66},
  {id:'d7',title:'Samsung 65" 4K Smart TV',category:'electronics',price:85000,parish:'St. Andrew',desc:'Samsung 65" 4K UHD Smart TV. Netflix, YouTube, Disney+ built-in. Bought 1 year ago, upgrading. Pickup only.',seller:'Troy Brown',sellerInit:'TB',sellerId:'s7',phone:'876-111-2222',date:'2025-06-09',image:'',status:'active',neg:true, views:91},
  {id:'d8',title:'Vacant Lot for Sale — Portmore',category:'property',price:4500000,parish:'St. Catherine',desc:'800 sq ft residential lot in gated community. Survey done, title available. Owner moving abroad.',seller:'Pearl Watson',sellerInit:'PW',sellerId:'s8',phone:'876-777-8888',date:'2025-06-10',image:'',status:'active',neg:false, views:38},
];

/* ═══════════════════════════════════════════════════════════
   SUPABASE CLIENT
═══════════════════════════════════════════════════════════ */
// Wrapped in try/catch so a failure (e.g. ad-blocker strips supabase global)
// does not break the entire page.
let _db = null;
try { _db = supabase.createClient(CFG.supabase.url, CFG.supabase.key); }
catch (e) { console.error("[Yaad Adz] supabase.createClient FAILED:", e); }

/* ═══════════════════════════════════════════════════════════
   IN-MEMORY CACHE (populated on init, kept in sync)
═══════════════════════════════════════════════════════════ */
let _ads  = [];        // live ads cache from Supabase
let _msgs = {};        // messages cache (keyed by conversation)
let _yaadLastLoad = null; // { ok: bool, reason: string, count: number, fromDb: bool, message: string }

/* ═══════════════════════════════════════════════════════════
   LOCAL-ONLY STORAGE (preferences, session, favourites)
   These stay in localStorage — they're per-device by design
═══════════════════════════════════════════════════════════ */
const L = {
  get sess()     { try { return JSON.parse(localStorage.getItem('ya_sess')  || 'null'); } catch(e) { console.warn('[L.sess] corrupted localStorage, resetting:', e); return null; } },
  set sess(v)    { localStorage.setItem('ya_sess', JSON.stringify(v)); },
  get favs()     { try { return JSON.parse(localStorage.getItem('ya_favs')  || '[]'); } catch(e) { console.warn('[L.favs] corrupted localStorage, resetting:', e); localStorage.removeItem('ya_favs'); return []; } },
  set favs(v)    { localStorage.setItem('ya_favs', JSON.stringify(v)); },
  get searches() { try { return JSON.parse(localStorage.getItem('ya_searches') || '[]'); } catch(e) { console.warn('[L.searches] corrupted localStorage, resetting:', e); localStorage.removeItem('ya_searches'); return []; } },
  set searches(v){ localStorage.setItem('ya_searches', JSON.stringify(v.slice(0,8))); },
  // ads now use the _ads cache — L.ads stays for compatibility
  get ads()      { return _ads; },
};

/* ═══════════════════════════════════════════════════════════
   SUPABASE DATA FUNCTIONS §DB
═══════════════════════════════════════════════════════════ */

// Load all active ads into cache
async function loadAds(_isRetry) {
  // ── Capture OLD ids BEFORE we replace _ads (so we can detect new arrivals) ──
  const prevIds = new Set(_ads.map(a => a.id));

  let data, error;
  try {
    // ── Guard: if Supabase JS failed to load (CDN issue, ad-blocker, network)
    // then `_db` is undefined and `.from()` would throw a TypeError.
    if (typeof _db === 'undefined') {
      const msg = (typeof supabase === 'undefined')
        ? 'Supabase JS library did not load. Check the <script> tag for the CDN (cdn.jsdelivr.net) — it may be blocked, the URL is wrong, or the network is offline.'
        : '_db is undefined but supabase exists. Client creation failed — check CFG.supabase.url / key.';
      throw new Error(msg);
    }
    const result = await _db.from('ads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    data = result.data; error = result.error;
  } catch (e) {
    // ── One retry after 1.5s: mobile connections drop mid-request often;
    // don't declare a connection issue on the very first blip.
    if (!_isRetry) {
      console.warn('[loadAds] First attempt failed, retrying once in 1.5s:', e && e.message);
      await new Promise(r => setTimeout(r, 1500));
      return loadAds(true);
    }
    console.error("[loadAds] Supabase threw:", e);
    // Build a more useful message — distinguish "JS didn't load" from "API error"
    let errMsg = String(e && e.message || e);
    if (typeof _db === 'undefined') errMsg = 'Supabase client not initialized (CDN script likely blocked or 404). Check browser network tab for the @supabase/supabase-js CDN request.';
    else if (String(errMsg).indexOf("TypeError: load fail") !== -1) errMsg = "Supabase call threw — likely a network error, CORS issue, or invalid anon key. Open browser DevTools → Network tab to inspect the /rest/v1/ads request.";
    _yaadLastLoad = { ok: false, reason: 'exception', count: _ads.length, fromDb: false, message: errMsg };
    if (!_ads.length) _ads = DEMO;
    return;
  }

  if (error) {
    console.error('[loadAds] Supabase error:', error);
    // Don't silently overwrite real listings with DEMO — preserve whatever
    // the realtime channel has already pushed in. Only fall back to DEMO
    // on the very first load (when _ads is still empty).
    if (!_ads.length) _ads = DEMO;
    _yaadLastLoad = { ok: false, reason: 'supabase_error', count: _ads.length, fromDb: false, message: String(error.message || error) };
    return;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    // Genuine empty result — keep realtime-pushed ads if any, otherwise
    // fall back to DEMO so the page never appears broken
    console.warn('[loadAds] Supabase returned no ads (table empty or RLS blocking)');
    if (!_ads.length) _ads = DEMO;
    _yaadLastLoad = { ok: true, count: _ads.length, fromDb: false };
  } else {
    _ads = data.map(dbToAd);
    _yaadLastLoad = { ok: true, count: _ads.length, fromDb: true };
    console.info('[loadAds] Loaded ' + _ads.length + ' ads from Supabase');
  }

  // ── Detect newly added listings (in current _ads but NOT in prevIds) ──
  const newAds = _ads.filter(a => !prevIds.has(a.id));
  if (newAds.length && prevIds.size > 0) {
    setTimeout(function() { checkSavedSearchAlerts(newAds); }, 1500);
  }
}

// Map DB row → app ad object
function dbToAd(row) {
  // image_url can be: a single URL string, or a JSON array of URLs
  let image = '', photos = [];
  try {
    if (row.image_url && row.image_url.startsWith('[')) {
      photos = JSON.parse(row.image_url);
      image = photos[0] || '';
    } else {
      image = row.image_url || '';
      if (image) photos = [image];
    }
  } catch(e) {
    image = row.image_url || '';
    if (image) photos = [image];
  }
  return {
    id:         row.id,
    title:      row.title,
    category:   row.category,
    parish:     row.parish,
    price:      row.price,
    desc:       row.description,
    phone:      row.phone,
    image:      image,
    photos:     photos,
    neg:        row.negotiable,
    seller:     row.seller_name,
    sellerInit: row.seller_init,
    sellerId:   row.seller_id,
    date:       row.created_at,
    status:     row.status || 'active',
    views:      row.views || 0,
  };
}

// Map app ad object → DB row
function adToDb(ad) {
  // Store photos as JSON array if multiple, single URL if one
  let imageUrl = ad.image || '';
  if (ad.photos && ad.photos.length > 1) {
    imageUrl = JSON.stringify(ad.photos);
  } else if (ad.photos && ad.photos.length === 1) {
    imageUrl = ad.photos[0];
  }
  return {
    id:          ad.id,
    title:       ad.title,
    category:    ad.category,
    parish:      ad.parish,
    price:       ad.price,
    description: ad.desc,
    phone:       ad.phone,
    image_url:   imageUrl,
    negotiable:  ad.neg || false,
    seller_name: ad.seller,
    seller_init: ad.sellerInit,
    seller_id:   ad.sellerId,
    status:      ad.status || 'active',
    views:       ad.views || 0,
  };
}

// Insert a new ad
async function sbInsertAd(ad) {
  const { error } = await _db.from('ads').insert(adToDb(ad));
  if (error) throw error;
  _ads.unshift(ad);
}

// Update ad status (active/sold)
async function sbUpdateAdStatus(id, status) {
  const { error } = await _db.from('ads').update({ status }).eq('id', id);
  if (error) throw error;
  const ad = _ads.find(a => a.id === id);
  if (ad) ad.status = status;
}

// Delete an ad
async function sbDeleteAd(id) {
  const { error } = await _db.from('ads').delete().eq('id', id);
  if (error) throw error;
  _ads = _ads.filter(a => a.id !== id);
}

// Update user profile
async function sbUpdateUser(id, fields) {
  const { error } = await _db.from('profiles').update(fields).eq('id', id);
  if (error) throw error;
}

// Update ad fields
async function sbUpdateAd(id, fields) {
  const { error } = await _db.from('ads').update(fields).eq('id', id);
  if (error) throw error;
}

// Increment views — keepalive fetch survives page navigation
function sbIncrView(id) {
  const ad = _ads.find(a => a.id === id);
  if (!ad) return;
  ad.views = (ad.views || 0) + 1;
  const newViews = ad.views;
  const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
  const BASE = 'https://cquwshpsfybvgqodbxsf.supabase.co/rest/v1';
  const H    = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  // keepalive:true guarantees the request completes even after navigation
  // Try RPC first (security definer bypasses RLS)
  fetch(BASE + '/rpc/increment_view', {
    method: 'POST', keepalive: true, headers: H,
    body: JSON.stringify({ ad_id: id })
  }).then(function(r) {
    if (!r.ok) {
      // RPC missing or failed — fall back to direct PATCH
      fetch(BASE + '/ads?id=eq.' + id, {
        method: 'PATCH', keepalive: true,
        headers: Object.assign({}, H, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ views: newViews })
      }).catch(function(){});
    }
  }).catch(function() {});
}

// ── USER AUTH ──────────────────────────────────────────

// ── GOOGLE SIGN-IN — bypasses Supabase's email rate limit entirely,
// since Google handles verification, not Supabase's default mailer ──
async function signInWithGoogle() {
  const { error } = await _db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    const el = document.getElementById('authAlert');
    if (el) { el.textContent = 'Google sign-in failed: ' + error.message; el.style.display = 'block'; }
  }
}

async function sbRegister(name, email, phone, parish, password) {
  // Use Supabase Auth for proper password hashing
  const { data, error } = await _db.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone, parish }  // stored in raw_user_meta_data
    }
  });
  if (error) {
    if (String(error.message).includes('already registered')) {
      throw new Error('An account with that email already exists.');
    }
    if (String(error.message).toLowerCase().includes('rate limit')) {
      throw new Error('Too many signups right now — please try again in a few minutes. (This is a temporary email-sending limit, not a problem with your details.)');
    }
    throw error;
  }
  if (!data.user) throw new Error('Registration failed — no user returned.');
  // Profile is auto-created by the trigger; fetch it
  const { data: profile } = await _db.from('profiles').select('*').eq('id', data.user.id).single();
  const p = profile || {};
  return { id: data.user.id, name: p.name || name, email: p.email || email, phone: p.phone || phone || '', parish: p.parish || parish || '' };
}

async function sbResetPassword(email) {
  const { error } = await _db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) throw new Error(error.message || 'Could not send reset email.');
}

async function doForgotPassword() {
  const email = document.getElementById('lEmail').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return authErr('Enter your email above first, then tap "Forgot password?"');
  }
  const link = document.getElementById('forgotPwLink');
  if (link) { link.textContent = 'Sending…'; link.style.pointerEvents = 'none'; }
  try {
    await sbResetPassword(email);
    const el = document.getElementById('authAlert');
    if (el) {
      el.className = 'alert-box';
      el.style.cssText = 'display:block;background:var(--green-light);color:var(--green);border-color:var(--green)';
      el.textContent = 'Check your email for a password reset link.';
    }
  } catch(e) {
    authErr(e.message || 'Could not send reset email — please try again.');
  } finally {
    if (link) { link.textContent = 'Forgot password?'; link.style.pointerEvents = ''; }
  }
}

async function sbLogin(email, password) {
  // Use Supabase Auth for proper authentication
  const { data, error } = await _db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'Incorrect email or password.');
  if (!data.user) throw new Error('Login failed — no user returned.');
  // Fetch profile data
  const { data: profile } = await _db.from('profiles').select('*').eq('id', data.user.id).single();
  const p = profile || {};
  return { id: data.user.id, name: p.name || data.user.email, email: p.email || email, phone: p.phone || '', parish: p.parish || '' };
}

// ── MESSAGES ──────────────────────────────────────────

async function loadMessages() {
  if (!CU) return;
  const { data, error } = await _db.from('messages')
    .select('*')
    .or(`seller_id.eq.${CU.id},buyer_id.eq.${CU.id}`)
    .order('created_at', { ascending: true });
  if (error) { console.error('loadMessages:', error); return; }
  // Rebuild _msgs cache keyed by conversation_key
  _msgs = {};
  for (const row of (data || [])) {
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
      ts: new Date(row.created_at).getTime(), read: row.read,
    });
  }
}

async function sbSendMessage(convKey, meta, text) {
  const row = {
    id: 'm' + Date.now(),
    conversation_key: convKey,
    from_user_id: CU.id,
    text,
    read: false,
    ad_id:       meta.adId,
    ad_title:    meta.adTitle,
    seller_id:   meta.sellerId,
    seller_name: meta.sellerName,
    seller_init: meta.sellerInit,
    buyer_id:    meta.buyerId,
    buyer_name:  meta.buyerName,
    buyer_init:  meta.buyerInit,
  };
  const { error } = await _db.from('messages').insert(row);
  if (error) throw error;
  // Update local cache
  if (!_msgs[convKey]) _msgs[convKey] = { ...meta, messages: [] };
  _msgs[convKey].messages.push({ id: row.id, from: CU.id, text, ts: Date.now(), read: false });
}

async function sbMarkRead(convKey) {
  if (!CU || !_msgs[convKey]) return;
  const unreadIds = _msgs[convKey].messages
    .filter(m => m.from !== CU.id && !m.read).map(m => m.id);
  if (!unreadIds.length) return;
  _msgs[convKey].messages.forEach(m => { if (m.from !== CU.id) m.read = true; });
  _db.from('messages').update({ read: true }).in('id', unreadIds); // fire-and-forget
}

// ── UNREAD COUNT ───────────────────────────────────────
function unreadCount() {
  if (!CU) return 0;
  return Object.values(_msgs)
    .filter(c => c.sellerId===CU.id || c.buyerId===CU.id)
    .reduce((n,c) => n + c.messages.filter(m => m.from!==CU.id && !m.read).length, 0);
}

/* ═══════════════════════════════════════════════════════════
   STATE §STATE
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   FORMATTING UTILITIES
═══════════════════════════════════════════════════════════ */
function fmtN(n) { return Number(n||0).toLocaleString('en-JM'); }
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts); const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return d.toLocaleDateString('en-JM', { month:'short', day:'numeric' });
}
function ago(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr); const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return diff + ' days ago';
  if (diff < 30) return Math.floor(diff/7) + ' week' + (Math.floor(diff/7)>1?'s':'') + ' ago';
  if (diff < 365) return Math.floor(diff/30) + ' month' + (Math.floor(diff/30)>1?'s':'') + ' ago';
  return Math.floor(diff/365) + ' year' + (Math.floor(diff/365)>1?'s':'') + ' ago';
}
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
function avatarColor(name) {
  const colors = [
    {bg:'#1a3a2a',fg:'#4ade80'},{bg:'#1e1a3a',fg:'#818cf8'},
    {bg:'#3a1a1a',fg:'#f87171'},{bg:'#3a2e1a',fg:'#fbbf24'},
    {bg:'#1a2e3a',fg:'#38bdf8'},{bg:'#2e1a3a',fg:'#e879f9'},
    {bg:'#1a3a2e',fg:'#34d399'},{bg:'#3a1a2e',fg:'#f472b6'},
  ];
  let hash = 0;
  for (let i = 0; i < (name||'?').length; i++) hash = (hash*31 + (name||'?').charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

/* ═══════════════════════════════════════════════════════════
   §PUSH — Push notification permission + send
   NOTE: these were called from auth-account.js / ui-nav.js but
   were never actually written, so notifications silently failed
   with a console ReferenceError. This covers foreground/backgrounded
   tab notifications. True notifications while the app is fully
   closed require a server (e.g. a Supabase Edge Function using
   web-push + VAPID keys) — this does not cover that case yet.
═══════════════════════════════════════════════════════════ */
function requestPushPermission() {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') showToast('Notifications enabled! 🔔', '🔔');
    });
  } catch(e) { console.error('requestPushPermission error:', e); }
}

function sendPushNotification(title, body, url) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return; // tab is focused — the in-app toast already covers this case
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function(reg) {
        reg.showNotification(title, {
          body: body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { url: url || '/' },
          tag: 'yaadadz-msg',
        });
      });
    } else {
      const n = new Notification(title, { body: body, icon: '/icon-192.png' });
      n.onclick = function() { window.focus(); if (url) location.href = url; n.close(); };
    }
  } catch(e) { console.error('sendPushNotification error:', e); }
}


