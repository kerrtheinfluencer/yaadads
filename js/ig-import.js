/* ═══════════════════════════════════════════════════════════
   📸 INSTAGRAM IMPORT — gamified listing migration §IGX
   ═══════════════════════════════════════════════════════════
   Turns a seller's existing Instagram catalogue into live Yaad
   Adz listings with zero re-typing:

     1 · Connect — link an @handle (+XP, badge)
     2 · Gather  — drop the photos saved from IG + paste the
                   captions (separate posts with a --- line)
     3 · Review  — "Magic Parse" auto-fills title, JMD price,
                   parish, category, phone & negotiable from each
                   caption; fix anything inline before publishing
     4 · Publish — photos upload to Supabase Storage, listings
                   insert into the ads table, XP + badges + confetti

   Depends on globals from core.js / listings.js / auth-account.js:
   CATS, PARISHES, catById, escHtml, fmtN, initials, $el, CU, _db,
   _ads, showToast, openOverlay, closeOverlay, openAuth, goPage,
   launchConfetti, uploadToSupabase, sbInsertAd, renderCats,
   renderHome, updateStats, renderMyAds.
   Every id/function here is prefixed igx/IGX — zero clashes.
   ═══════════════════════════════════════════════════════════ */

/* ── §IGX-STORE — gamification state (per device) ── */
var IGX_STORE_KEY = 'ya_igx_v1';
var IGX_XP = { connect: 30, reconnect: 5, demo: 10, parse: 10, photo: 2, edit: 2, publish: 60, badge: 25 };
var IGX_LEVELS = [
  { min: 0,    name: 'Yaad Rookie',   emoji: '🌱' },
  { min: 120,  name: 'Shop Starter',  emoji: '🛍️' },
  { min: 300,  name: 'Rising Vendor', emoji: '📈' },
  { min: 600,  name: 'Big Merchant',  emoji: '🏪' },
  { min: 1000, name: 'Import Boss',   emoji: '👑' },
  { min: 1600, name: 'Yaad Legend',   emoji: '🇯🇲' }
];
var IGX_BADGES = {
  'ig-connected': { emoji: '🔗', name: 'Linked Up',     hint: 'Connect your Instagram handle' },
  'first-drop':   { emoji: '🥇', name: 'First Drop',    hint: 'Publish your first imported listing' },
  'bulk-import':  { emoji: '📦', name: 'Bulk Importer', hint: 'Publish 5+ items in a single run' },
  'mind-reader':  { emoji: '🧠', name: 'Mind Reader',   hint: 'Auto-parse every field on an item' },
  'photo-pro':    { emoji: '📸', name: 'Photo Pro',     hint: 'Publish an item with 3+ photos' },
  'shop-builder': { emoji: '🏅', name: 'Shop Builder',  hint: 'Import 10 items all-time' }
};

var igxStore = (function () {
  var d = { xp: 0, imports: 0, items: 0, badges: [], handle: '', connected: false };
  try {
    var raw = JSON.parse(localStorage.getItem(IGX_STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      d = Object.assign(d, raw);
      if (!Array.isArray(d.badges)) d.badges = [];
    }
  } catch (e) {}
  return d;
})();
function igxSaveStore() { try { localStorage.setItem(IGX_STORE_KEY, JSON.stringify(igxStore)); } catch (e) {} }
function igxLevelInfo(xp) {
  var cur = IGX_LEVELS[0], i;
  for (i = 0; i < IGX_LEVELS.length; i++) { if (xp >= IGX_LEVELS[i].min) cur = IGX_LEVELS[i]; }
  var next = IGX_LEVELS[IGX_LEVELS.indexOf(cur) + 1] || null;
  var pct = next ? Math.min(100, Math.round((xp - cur.min) / (next.min - cur.min) * 100)) : 100;
  return { level: cur, next: next, pct: pct };
}
function igxHasBadge(id) { return igxStore.badges.indexOf(id) !== -1; }
function igxUnlockBadge(id) {
  if (!IGX_BADGES[id] || igxHasBadge(id)) return false;
  igxStore.badges.push(id);
  igxSaveStore();
  igxSession.badgesNew.push(id);
  var b = IGX_BADGES[id];
  showToast(b.emoji + ' Badge unlocked: ' + b.name + ' (+' + IGX_XP.badge + ' XP)', b.emoji);
  igxAward(IGX_XP.badge, 'Badge: ' + b.name);
  return true;
}

/* ── §IGX-STATE — wizard session state ── */
var igxStep = 1;
var igxPhotos = [];   // [{ file: File|null, preview: dataURL-or-empty, demo: {emoji,color}|null }]
var igxCaptionText = '';
var igxItems = [];    // parsed review items
var igxHandleVal = igxStore.handle || '';
var igxPublishing = false;
var igxSession = { badgesNew: [], xpEarned: 0, published: 0, failed: 0, yp: 0 };
var igxPhotoTargetId = null;

/* ── §IGX-XP — XP bar paint + floaters + level-ups ── */
function igxPaintXp() {
  var info = igxLevelInfo(igxStore.xp);
  var fill = $el('igxXpFill'), chip = $el('igxLevelChip'), lbl = $el('igxXpLabel'), nxt = $el('igxXpNext');
  if (fill) fill.style.width = info.pct + '%';
  if (chip) chip.textContent = info.level.emoji + ' ' + info.level.name;
  if (lbl) lbl.textContent = igxStore.xp.toLocaleString('en-JM') + ' XP';
  if (nxt) nxt.textContent = info.next ? ((info.next.min - igxStore.xp) + ' XP to ' + info.next.name) : 'Max level — yuh a legend!';
  return info;
}
function igxXpFloater(txt) {
  var wrap = $el('igxXpWrap');
  if (!wrap) return;
  var f = document.createElement('div');
  f.className = 'igx-xpfloat';
  f.textContent = txt;
  wrap.appendChild(f);
  setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1500);
}
function igxAward(xp, why) {
  if (!xp) return;
  var before = igxLevelInfo(igxStore.xp).level.name;
  igxStore.xp += xp;
  igxSession.xpEarned += xp;
  igxSaveStore();
  var info = igxPaintXp();
  igxXpFloater('+' + xp + ' XP · ' + (why || ''));
  if (info.level.name !== before) igxLevelUpShow(info.level);
}
function igxLevelUpShow(level) {
  var modal = document.querySelector('#ovIgImport .igx-modal');
  if (!modal) return;
  var old = document.getElementById('igxLevelUp');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  var d = document.createElement('div');
  d.id = 'igxLevelUp';
  d.className = 'igx-levelup';
  d.innerHTML = '<div class="igx-lu-burst"></div>' +
    '<div class="igx-lu-medal">' + level.emoji + '</div>' +
    '<div class="igx-lu-kicker">LEVEL UP</div>' +
    '<div class="igx-lu-name">' + escHtml(level.name) + '</div>' +
    '<div class="igx-lu-tap">tap to continue</div>';
  d.onclick = igxLevelUpHide;
  modal.appendChild(d);
  if (typeof launchConfetti === 'function') launchConfetti();
  setTimeout(igxLevelUpHide, 3600);
}
function igxLevelUpHide() {
  var d = document.getElementById('igxLevelUp');
  if (!d || d.classList.contains('igx-lu-out')) return;
  d.classList.add('igx-lu-out');
  setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 420);
}
function igxAlert(msg) {
  var a = $el('igxAlert');
  if (!a) return;
  a.textContent = msg;
  a.className = 'alert-box alert-err show';
  clearTimeout(igxAlert._t);
  igxAlert._t = setTimeout(function () { a.className = 'alert-box alert-err'; }, 4200);
}function igxRenderSummary() {
  var body = $el('igxBody');
  if (!body) return;
  var s = igxSession;
  var badgeChips = '';
  for (var b = 0; b < s.badgesNew.length; b++) {
    var bd = IGX_BADGES[s.badgesNew[b]];
    if (!bd) continue;
    badgeChips += '<span class="igx-pbadge" style="animation-delay:' + (400 + b * 150) + 'ms">' + bd.emoji + ' ' + escHtml(bd.name) + '</span>';
  }
  var nextB = null;
  for (var id2 in IGX_BADGES) { if (!igxHasBadge(id2)) { nextB = IGX_BADGES[id2]; break; } }
  var info = igxLevelInfo(igxStore.xp);
  body.innerHTML = '' +
    '<div class="igx-sum igx-in">' +
      '<div class="igx-sum-check">\u2713</div>' +
      '<h3 class="igx-sum-title">' + (s.published ? s.published + ' listing' + (s.published === 1 ? ' is' : 's are') + ' LIVE! \ud83c\udf89' : 'Nothing went live \ud83d\ude15') + '</h3>' +
      (s.failed ? '<p class="igx-sum-sub">' + s.failed + ' item(s) failed \u2014 usually a photo upload hiccup. Try importing them again.</p>' : '<p class="igx-sum-sub">Your Instagram catalogue is now shoppable on Yaad Adz.</p>') +
      '<div class="igx-sum-stats">' +
        '<div class="igx-sum-stat"><span class="igx-sum-num" id="igxSumXp">0</span><span>XP earned</span></div>' +
        '<div class="igx-sum-stat"><span class="igx-sum-num" id="igxSumYp">0</span><span>YP added</span></div>' +
        '<div class="igx-sum-stat"><span class="igx-sum-num" id="igxSumTotal">' + igxStore.xp.toLocaleString('en-JM') + '</span><span>total XP \u00b7 ' + info.level.emoji + ' ' + escHtml(info.level.name) + '</span></div>' +
      '</div>' +
      (badgeChips ? '<div class="igx-sum-badges">' + badgeChips + '</div>' : '') +
      (nextB ? '<div class="igx-hint-chip">Next badge: ' + nextB.emoji + ' ' + escHtml(nextB.name) + ' \u2014 ' + escHtml(nextB.hint) + '</div>' : '') +
      '<div class="step-nav" style="margin-top:18px">' +
        '<button class="btn btn-ghost" style="min-width:110px" onclick="igxImportMore()">\uff0b Import more</button>' +
        '<button class="btn btn-green btn-lg" style="flex:1" onclick="igxViewListings()">View my listings \u2192</button>' +
      '</div>' +
    '</div>';
  igxCountUp('igxSumXp', s.xpEarned);
  igxCountUp('igxSumYp', s.yp);
}
function igxCountUp(id, target) {
  var el = $el(id);
  if (!el) return;
  if (!target) { el.textContent = '0'; return; }
  var t0 = null;
  var dur = 900;
  function tick(ts) {
    if (!t0) t0 = ts;
    var k = Math.min(1, (ts - t0) / dur);
    var eased = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(target * eased).toLocaleString('en-JM');
    if (k < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function igxImportMore() {
  igxResetSession();
  igxPaintXp();
  igxSetStep(2);
}
function igxViewListings() {
  closeOverlay('ovIgImport');
  if (typeof goPage === 'function') {
    goPage('myads');
  } else if (typeof showToast === 'function') {
    showToast('Listings captured \u2014 check the sandbox panel \ud83d\udce6', '\ud83d\udce6');
  }
}/* ── §IGX-PARSER — caption intelligence ("Yaad Magic") ──
   NOTE: newlines are handled via IGX_NL (String.fromCharCode) so the
   parser works identically with CRLF pastes from any device. */
var IGX_NL = String.fromCharCode(10);
var IGX_CR = String.fromCharCode(13);
function igxNorm(s) {
  return String(s == null ? '' : s)
    .split(IGX_CR + IGX_NL).join(IGX_NL)
    .split(IGX_CR).join(IGX_NL);
}
var IGX_PARISH_RES = [
  [/(?:st\.?|saint)\s*andrew\b|\bpapine\b|constant spring|kingston\s*(?:[6-9]|1[0-9]|20)\b|stony hill|bull bay|gordon town/i, 'St. Andrew'],
  [/half[-\s]?way[-\s]?tree|cross\s*roads|new\s*kingston|downtown\s*kingston|\bkingston\b|\bkgn\b/i, 'Kingston'],
  [/portmore|spanish town|linstead|old harbour|bog walk|ewarton|guys hill|(?:st\.?|saint)\s*catherine/i, 'St. Catherine'],
  [/may\s?pen|denbigh|four\s?paths|chapleton|kellits|(?:st\.?|saint)\s*clarendon|\bclarendon\b/i, 'Clarendon'],
  [/mandeville|christiana|\bporus\b|williamsfield|\bmanchester\b/i, 'Manchester'],
  [/black river|santa cruz|\bjunction\b|(?:st\.?|saint)\s*elizabeth/i, 'St. Elizabeth'],
  [/\bnegril\b|sav(?:anna)?[\s\-]?la[\s\-]?mar|little london|grange hill|westmoreland/i, 'Westmoreland'],
  [/\blucea\b|green island|\bhanover\b/i, 'Hanover'],
  [/montego bay|\bmobay\b|\banchovy\b|\badelphi\b|(?:st\.?|saint)\s*james/i, 'St. James'],
  [/\bfalmouth\b|\bduncans\b|albert town|clarks town|\btrelawny\b/i, 'Trelawny'],
  [/ocho rios|runaway bay|brown'?s town|claremont|moneague|(?:st\.?|saint)\s*ann\b/i, 'St. Ann'],
  [/port maria|anotto bay|oracabessa|\bhighgate\b|(?:st\.?|saint)\s*mary\b/i, 'St. Mary'],
  [/port antonio|buff bay|manchioneal|\bportland\b/i, 'Portland'],
  [/morant bay|\byallahs\b|golden grove|(?:st\.?|saint)\s*thomas/i, 'St. Thomas']
];
function igxDetectParish(text) {
  for (var i = 0; i < IGX_PARISH_RES.length; i++) {
    if (IGX_PARISH_RES[i][0].test(text)) return IGX_PARISH_RES[i][1];
  }
  return '';
}

var IGX_CAT_KW = {
  vehicles: ['car','cars','honda','toyota','nissan','bmw','mercedes','mazda','subaru','suzuki','kia','hyundai','vehicle','truck','suv','jeep','tyre','tire','rims','engine','gearbox','transmission','civic','accord','vezel','grace','corolla','fielder','hiace','serena','voxy','noah','mark x','probox','hilux','fortuner','land cruiser','prado','majesta','raize','yaris','wish','impreza','4x4','pickup','pick-up','motorbike','motorcycle','scooter','mileage'],
  property: ['house','home for','apartment','apt for','rent','rental','land','lot for','property','bedroom','bed rm','bedrm','studio','townhouse','duplex','real estate','sq ft','sqft','lease','acre','self contained','gated'],
  electronics: ['iphone','samsung','galaxy','phone','laptop','macbook','ipad','tablet','tv','ps5','ps4','playstation','xbox','nintendo','switch','headphone','earbud','airpod','speaker','camera','drone','smartwatch','smart watch','apple watch','lenovo','dell','desktop','monitor','printer','router','power bank','bluetooth'],
  fashion: ['shoes','sneaker','heels','dress','clothes','clothing','wig','bundles','hair','bag','handbag','purse','nike','adidas','jordan','puma','gucci','outfit','jersey','jeans','shirt','blouse','skirt','swimsuit','bikini','perfume','jewel','earring','necklace','bracelet','worn','size'],
  furniture: ['bed','sofa','couch','chair','table','desk','wardrobe','dresser','mattress','fridge','refrigerator','stove','washer','dryer','air condition','furniture','dining','bookshelf','cabinet','microwave','curtain','rug'],
  jobs: ['job','jobs','hiring','vacancy','resume','now hiring','position','we are looking','apply','employment','driver wanted'],
  services: ['service','services','repair','fix','install','cleaning','plumb','electric','tailor','barber','salon','nails','lashes','braids','makeup','photographer','videographer','design','printing','transport','movers','delivery','tutor','lessons','nail tech','welding','landscaping'],
  food: ['ackee','saltfish','jerk','patty','cake','catering','produce','farm','fresh','pepper','seasoning','sauce','bread','eggs','chicken','pork','fish','vegetable','plantain','yam','banana','coconut','honey','juice','scotch bonnet','callaloo','spice'],
  music: ['guitar','drum','keyboard','piano','amp','microphone','mixer','turntable','serato','cdj','sound system','dj equipment','violin','saxophone','flute','studio','pa system','audio interface'],
  sports: ['gym','dumbbell','weights','treadmill','bicycle','football','cricket','netball','basketball','domino','fitness','yoga','boxing','skate'],
  kids: ['baby','toddler','kids','children','stroller','crib','car seat','diaper','pampers','toy','toys','nursery','high chair','playpen','school bag','uniform']
};
function igxDetectCategory(text) {
  var t = ' ' + String(text).toLowerCase() + ' ';
  var best = 'other', bestScore = 0, second = 0;
  for (var id in IGX_CAT_KW) {
    var kws = IGX_CAT_KW[id], score = 0;
    for (var k = 0; k < kws.length; k++) { if (t.indexOf(kws[k]) !== -1) score += 2; }
    if (score > bestScore) { second = bestScore; best = id; bestScore = score; }
    else if (score > second) second = score;
  }
  if (bestScore < 2) return { id: 'other', conf: 'low' };
  return { id: best, conf: (bestScore >= 6 && bestScore >= second * 2) ? 'high' : 'medium' };
}

function igxParsePriceValue(numStr, suffix) {
  var v = parseFloat(String(numStr).replace(/,/g, ''));
  if (!isFinite(v) || v <= 0) return 0;
  if (suffix) {
    var s = suffix.toLowerCase();
    if (s === 'k') v *= 1000;
    if (s === 'm') v *= 1000000;
  }
  return Math.round(v);
}
function igxLooksLikePhone(v) {
  var d = String(v).replace(/[^0-9]/g, '');
  return d.length >= 7 && /^(?:1?876)?\d{7}$/.test(d);
}
function igxExtractPrice(text) {
  var lines = text.split(IGX_NL);
  var patterns = [
    { re: /(?:j\s*\$|jmd|usd|us\s*\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|m)?\b/i, usd: /usd|us\s*\$/i },
    { re: /\b(?:price|asking|cost|going\s+for|selling\s+(?:for|at)|sell\s*[:\-]|take)\b[\s:]*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|m)?\b/i, usd: /usd/i },
    { re: /\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)\s*(k|m)?\b/, usd: null },
    { re: /\b([0-9]{2,4}(?:\.[0-9]+)?)\s*(k|m)\b/i, usd: null }
  ];
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    if (!/[$]|price|asking|cost|jmd|usd|going for|selling|firm|neg|take/i.test(line)) continue;
    for (var pi = 0; pi < patterns.length; pi++) {
      if (pi >= 2 && /size|inch|\bgb\b|\btb\b|\bkm\b|\bkg\b|years?\b|ages/i.test(line)) continue;
      var m = line.match(patterns[pi].re);
      if (!m) continue;
      if (pi >= 2 && igxLooksLikePhone(m[1])) continue;
      var v = igxParsePriceValue(m[1], m[2]);
      if (pi === 1 && v < 1000 && /876/.test(line)) continue;
      if (v >= 10) return { price: v, usd: patterns[pi].usd ? patterns[pi].usd.test(line) : false };
    }
  }
  return { price: 0, usd: false };
}function igxIsNoise(line) {
  var bare = line.replace(/[^0-9A-Za-z]/g, '');
  return bare.length < 2;
}
function igxCleanLine(line) {
  return line
    .replace(/#[^\s#]+/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^[\s|~\-\u2013\u2014=*>\u00b7]+/, '')
    .replace(/[\s|~]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function igxTruncateTitle(s, max) {
  s = s.trim();
  if (s.length <= max) return s;
  var cut = s.slice(0, max);
  var sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,\-\u2013\u2014:;.]+$/, '') + '\u2026';
}
function igxTitleFromName(name) {
  var base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!base) base = 'Instagram item';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function igxParseCaption(raw) {
  var out = { title: '', desc: '', price: 0, usd: false, neg: true, parish: '', phone: '', category: 'other', catConf: 'low' };
  var text = igxNorm(raw).replace(/[\u200b\u200c]/g, '').trim();
  if (!text) return out;
  var p = igxExtractPrice(text);
  out.price = p.price;
  out.usd = p.usd;
  if (/\b(firm|fixed|no\s*less|non[\s\-]?neg|not\s*negotiable|last\s*price|final\s*price)\b/i.test(text)) out.neg = false;
  else if (/\b(neg|nego|negotiable|o\.?b\.?o|offer|haggle|serious\s*offers?|best\s*price)\b/i.test(text)) out.neg = true;
  var pm = text.match(/(?:\+?1[\s.\-]?)?876[\s.\-]?\d{3}[\s.\-]?\d{4}/) || text.match(/\b\d{3}[\s.\-]\d{4}\b/);
  if (pm) out.phone = pm[0].trim();
  out.parish = igxDetectParish(text);
  var cat = igxDetectCategory(text);
  out.category = cat.id;
  out.catConf = cat.conf;
  var lines = text.split(IGX_NL).map(igxCleanLine).filter(function (l) { return l && !igxIsNoise(l); });
  var priceLineRe = /^\$?\s*[0-9][0-9,.]*\s*(k|m)?\s*(jmd|usd)?\s*(neg|nego|negotiable|firm|fixed)?\s*(each|per\s*\w+)?\s*$/i;
  var title = '';
  var rest = [];
  for (var i = 0; i < lines.length; i++) {
    if (!title && priceLineRe.test(lines[i])) continue;
    if (!title) { title = lines[i]; continue; }
    rest.push(lines[i]);
  }
  out.title = title ? igxTruncateTitle(title, 70) : '';
  out.desc = rest.join(IGX_NL);
  return out;
}

/* ── §IGX-WIZARD — open / reset / chrome / step 1 ── */
function openIgImport() {
  if (typeof CU === 'undefined' || !CU) {
    if (typeof openAuth === 'function') openAuth('login');
    return;
  }
  igxResetSession();
  igxPaintXp();
  igxSetStep(1);
  openOverlay('ovIgImport');
}
function igxResetSession() {
  igxStep = 1;
  igxPhotos = [];
  igxCaptionText = '';
  igxItems = [];
  igxHandleVal = igxStore.handle || '';
  igxPublishing = false;
  igxSession = { badgesNew: [], xpEarned: 0, published: 0, failed: 0, yp: 0 };
  igxPhotoTargetId = null;
}
function igxSetStep(n) {
  igxStep = n;
  for (var i = 1; i <= 4; i++) {
    var s = $el('is' + i);
    if (s) { s.classList.toggle('active', i === n); s.classList.toggle('done', i < n); }
  }
  igxRenderStep(n);
  var body = $el('igxBody');
  if (body) body.scrollTop = 0;
  var modal = document.querySelector('#ovIgImport .modal');
  if (modal) modal.scrollTop = 0;
}
function igxRenderStep(n) {
  var body = $el('igxBody');
  if (!body) return;
  if (n === 1) body.innerHTML = igxStepBody1();
  else if (n === 2) { body.innerHTML = igxStepBody2(); igxRenderThumbs(); igxGatherMeta(); }
  else if (n === 3) body.innerHTML = igxStepBody3();
  else if (n === 4) body.innerHTML = igxStepBody4();
}function igxStepBody1() {
  var ids = ['ig-connected', 'first-drop', 'bulk-import', 'mind-reader', 'photo-pro', 'shop-builder'];
  var badges = '';
  for (var i = 0; i < ids.length; i++) {
    var b = IGX_BADGES[ids[i]];
    var owned = igxHasBadge(ids[i]);
    badges += '<div class="igx-bdg' + (owned ? ' owned' : '') + '" title="' + escHtml(b.hint) + '">' +
      '<span class="igx-bdg-ico">' + b.emoji + '</span>' +
      '<span class="igx-bdg-name">' + escHtml(b.name) + '</span>' +
      (owned ? '<span class="igx-bdg-check">\u2713</span>' : '') +
      '</div>';
  }
  return '' +
    '<div class="igx-hero igx-in">' +
      '<div class="igx-iglogo"></div>' +
      '<h3 class="igx-hero-title">Bring your Instagram shop to Yaad Adz</h3>' +
      '<p class="igx-hero-sub">Drop in the photos you saved from IG, paste the captions \u2014 we auto-fill titles, JMD prices, parish &amp; category. Yuh just tap publish. \ud83d\ude80</p>' +
      '<div class="igx-connect-row">' +
        '<span class="igx-at">@</span>' +
        '<input id="igxHandle" class="form-inp" type="text" placeholder="your.shop.handle" autocomplete="off" spellcheck="false" value="' + escHtml(igxHandleVal) + '" oninput="igxOnHandle(this.value)" onkeydown="if(event.key===\'Enter\')igxConnect()">' +
        '<button class="btn btn-gold" id="igxConnectBtn" onclick="igxConnect()">Connect</button>' +
      '</div>' +
      '<div class="igx-connect-ring" id="igxConnectRing"><div class="igx-ring-core">\ud83d\udd17</div></div>' +
      '<div class="igx-skip-row">' +
        '<button class="btn btn-ghost btn-sm" onclick="igxSkipConnect()">Skip \u2014 just import \u2192</button>' +
        '<button class="btn btn-outline btn-sm" onclick="igxDemo()">\u2728 Try a demo</button>' +
      '</div>' +
      '<div class="igx-hint-chip">\ud83d\udd17 Connecting earns +30 XP &amp; the Linked Up badge</div>' +
    '</div>' +
    '<div class="igx-bdg-wall igx-in" style="animation-delay:120ms">' +
      '<div class="igx-bdg-wall-title">Badge collection</div>' +
      '<div class="igx-bdg-grid">' + badges + '</div>' +
    '</div>';
}
function igxOnHandle(v) { igxHandleVal = String(v || '').trim().replace(/^@+/, ''); }
function igxConnect() {
  if (!igxHandleVal) {
    igxAlert('Enter your Instagram handle first (or skip).');
    var h = $el('igxHandle');
    if (h) h.focus();
    return;
  }
  var btn = $el('igxConnectBtn'), ring = $el('igxConnectRing');
  if (btn) { btn.disabled = true; btn.textContent = 'Linking\u2026'; }
  if (ring) ring.classList.add('go');
  setTimeout(function () {
    var first = !igxStore.connected;
    igxStore.connected = true;
    igxStore.handle = igxHandleVal;
    igxSaveStore();
    igxUnlockBadge('ig-connected');
    if (first) igxAward(IGX_XP.connect, 'Connected'); else igxAward(IGX_XP.reconnect, 'Re-connected');
    showToast('Linked @' + igxHandleVal + ' \u2014 let\'s import! \ud83d\udcf8', '\ud83d\udd17');
    igxSetStep(2);
  }, 1250);
}
function igxSkipConnect() { igxSetStep(2); }

var IGX_DEMO = [
  { emoji: '\ud83d\udc5f', color: 'linear-gradient(135deg,#fd5949,#d6249f)', caption: 'Nike Air Max 95 \u2014 brand new in box' + IGX_NL + 'US size 10, never worn' + IGX_NL + '$14,500 neg' + IGX_NL + 'Free delivery in Kingston' + IGX_NL + '\ud83d\udccd Kingston' + IGX_NL + '#sneakersja #kicksja' },
  { emoji: '\ud83d\udd0a', color: 'linear-gradient(135deg,#285aeb,#962fbf)', caption: 'Bluetooth soundbar + subwoofer' + IGX_NL + 'Barely used, box included' + IGX_NL + 'Price: $18,000 firm' + IGX_NL + '\ud83d\udccd St. Andrew' },
  { emoji: '\ud83c\udf4d', color: 'linear-gradient(135deg,#fdf497,#fd5949)', caption: 'Fresh pineapple from mi farm \u2014 sweet like sugar \ud83c\udf4d' + IGX_NL + '$500 each or 3 for $1,200' + IGX_NL + 'Delivery island-wide' + IGX_NL + '\ud83d\udccd Black River' },
  { emoji: '\ud83d\udc87', color: 'linear-gradient(135deg,#d6249f,#962fbf)', caption: 'Raw Indian hair bundle \u2014 22 inch' + IGX_NL + '$25k neg' + IGX_NL + 'WhatsApp 876-555-0199' + IGX_NL + '\ud83d\udccd Portmore' + IGX_NL + '#hairja' }
];
function igxDemo() {
  igxPhotos = IGX_DEMO.map(function (d) { return { file: null, preview: '', demo: d }; });
  igxCaptionText = IGX_DEMO.map(function (d) { return d.caption; }).join(IGX_NL + IGX_NL + '---' + IGX_NL + IGX_NL);
  if (!igxStore.connected) {
    igxStore.connected = true;
    if (!igxStore.handle) igxStore.handle = 'demo.shop';
    igxHandleVal = igxStore.handle;
    igxSaveStore();
    igxUnlockBadge('ig-connected');
    igxAward(IGX_XP.connect, 'Connected');
  }
  igxAward(IGX_XP.demo, 'Demo run');
  igxGoParse(true);
}function igxStepBody2() {
  return '' +
    '<div class="igx-gather">' +
      '<div class="igx-lane igx-in">' +
        '<div class="igx-lane-head"><span class="igx-lane-ico">\ud83d\uddbc\ufe0f</span><div><strong>1 \u00b7 Post photos</strong><small>On Instagram: long-press a post \u2192 Save. Then drop the images here.</small></div></div>' +
        '<div class="igx-drop" id="igxDrop" onclick="document.getElementById(\'igxFileIn\').click()" ondragover="igxDragOver(event)" ondragleave="igxDragLeave(event)" ondrop="igxDropFiles(event)">' +
          '<div class="igx-drop-hint"><span class="igx-drop-ico">\u2b07\ufe0f</span><span><strong>Drop photos here</strong><br><small>or tap to browse \u00b7 up to 24</small></span></div>' +
          '<div class="igx-thumb-row" id="igxThumbRow"></div>' +
        '</div>' +
        '<input type="file" id="igxFileIn" accept="image/*" multiple style="display:none" onchange="igxPickFiles(this)">' +
      '</div>' +
      '<div class="igx-lane igx-in" style="animation-delay:90ms">' +
        '<div class="igx-lane-head"><span class="igx-lane-ico">\ud83d\udddd\ufe0f</span><div><strong>2 \u00b7 Captions</strong><small>Copy each IG caption \u2192 paste here. Separate different posts with a line of ---</small></div></div>' +
        '<textarea id="igxCaptionsIn" class="form-inp" rows="7" placeholder="Nike Air Max 95 \u2014 brand new&#10;$14,500 neg&#10;\ud83d\udccd Kingston&#10;&#10;---&#10;&#10;Bluetooth soundbar&#10;Price: $18,000 firm&#10;\ud83d\udccd St. Andrew" oninput="igxCaptionsInput(this)">' + escHtml(igxCaptionText) + '</textarea>' +
        '<div class="igx-gather-meta" id="igxGatherMeta"></div>' +
      '</div>' +
      '<div class="igx-pair-hint igx-in" style="animation-delay:160ms">\u2728 Pairing is automatic: photo 1 + caption 1 = listing 1, photo 2 + caption 2 = listing 2\u2026</div>' +
      '<div class="step-nav">' +
        '<button class="btn btn-ghost" onclick="igxSetStep(1)" style="min-width:90px">\u2190 Back</button>' +
        '<button class="btn btn-green btn-lg" style="flex:1" id="igxParseBtn" onclick="igxGoParse(false)">\u2728 Magic Parse</button>' +
      '</div>' +
    '</div>';
}
function igxPhotoPreview(file) {
  return new Promise(function (resolve) {
    var r = new FileReader();
    r.onload = function (e) { resolve(e.target.result); };
    r.onerror = function () { resolve(''); };
    r.readAsDataURL(file);
  });
}
function igxAddFiles(fileList) {
  var all = Array.prototype.slice.call(fileList || []);
  var valid = all.filter(function (f) { return f && f.type && f.type.indexOf('image/') === 0 && f.size <= 8 * 1024 * 1024; });
  var slots = Math.max(0, 24 - igxPhotos.length);
  var accepted = valid.slice(0, slots);
  var skipped = all.length - accepted.length;
  accepted.forEach(function (file) {
    var entry = { file: file, preview: '', demo: null };
    igxPhotos.push(entry);
    igxPhotoPreview(file).then(function (url) { entry.preview = url; igxRenderThumbs(); });
  });
  if (skipped > 0) showToast(skipped + ' file(s) skipped \u2014 images only, max 8MB, 24 max', '\u26a0\ufe0f');
  if (accepted.length) igxAward(IGX_XP.photo * accepted.length, 'Photos added');
  igxRenderThumbs();
  igxGatherMeta();
}
function igxPickFiles(input) { igxAddFiles(input.files); input.value = ''; }
function igxDragOver(e) { e.preventDefault(); e.stopPropagation(); var d = $el('igxDrop'); if (d) d.classList.add('drag'); }
function igxDragLeave(e) { e.preventDefault(); var d = $el('igxDrop'); if (d) d.classList.remove('drag'); }
function igxDropFiles(e) {
  e.preventDefault(); e.stopPropagation();
  var d = $el('igxDrop');
  if (d) d.classList.remove('drag');
  if (e.dataTransfer && e.dataTransfer.files) igxAddFiles(e.dataTransfer.files);
}
function igxRenderThumbs() {
  var row = $el('igxThumbRow');
  if (!row) return;
  var html = '';
  for (var i = 0; i < igxPhotos.length; i++) {
    var p = igxPhotos[i];
    var inner = p.demo
      ? '<div class="igx-demo-ph" style="background:' + p.demo.color + '">' + p.demo.emoji + '</div>'
      : (p.preview ? '<img src="' + p.preview + '" alt="">' : '<div class="igx-thumb-load"><div class="igx-spinner"></div></div>');
    html += '<div class="igx-thumb" style="animation-delay:' + Math.min(i * 40, 400) + 'ms">' + inner +
      '<button class="igx-thumb-x" onclick="igxRemoveGatherPhoto(' + i + ')">\u2715</button></div>';
  }
  row.innerHTML = html;
}
function igxRemoveGatherPhoto(i) { igxPhotos.splice(i, 1); igxRenderThumbs(); igxGatherMeta(); }
function igxCaptionsInput(ta) { igxCaptionText = igxNorm(ta.value); igxGatherMeta(); }function igxSplitCaptions(text) {
  var lines = igxNorm(text).split(IGX_NL);
  var blocks = [], cur = [];
  for (var i = 0; i < lines.length; i++) {
    var compact = lines[i].replace(/\s/g, '');
    if (/^[-~=*]{3,}$/.test(compact)) {
      if (cur.length) { blocks.push(cur.join(IGX_NL).trim()); cur = []; }
    } else {
      cur.push(lines[i]);
    }
  }
  if (cur.length) blocks.push(cur.join(IGX_NL).trim());
  return blocks.filter(function (s) { return s.length > 0; });
}
function igxGatherMeta() {
  var m = $el('igxGatherMeta');
  var caps = igxSplitCaptions(igxCaptionText);
  if (m) m.textContent = igxPhotos.length + ' photo' + (igxPhotos.length === 1 ? '' : 's') + ' \u00b7 ' + caps.length + ' caption' + (caps.length === 1 ? '' : 's') + ' detected';
  var btn = $el('igxParseBtn');
  if (btn) btn.disabled = (igxPhotos.length === 0 && caps.length === 0);
}
function igxGoParse(silent) {
  var caps = igxSplitCaptions(igxCaptionText);
  if (!igxPhotos.length && !caps.length) {
    if (!silent) igxAlert('Add at least one photo or one caption first \u2014 then hit Magic Parse \u2728');
    return;
  }
  var built = igxBuildItems(igxPhotos, caps);
  igxItems = built.items;
  if (!igxItems.length) {
    if (!silent) igxAlert('Nothing to import \u2014 check your captions.');
    return;
  }
  igxAward(IGX_XP.parse, 'Magic Parse');
  if (built.dupesDropped) showToast(built.dupesDropped + ' identical caption(s) merged', '\ud83e\uddf9');
  igxSetStep(3);
}
function igxBuildItems(photos, captions) {
  var items = [];
  var seen = {};
  var dupesDropped = 0;
  var n = Math.max(photos.length, captions.length);
  for (var i = 0; i < n; i++) {
    var photo = photos[i] || null;
    var caption = captions[i] || '';
    if (!photo && !caption) continue;
    var key = caption.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key && seen[key]) { dupesDropped++; continue; }
    if (key) seen[key] = true;
    items.push(igxMakeItem(photo, caption, i));
  }
  return { items: items, dupesDropped: dupesDropped };
}
function igxMakeItem(photo, caption, idx) {
  var parsed = caption ? igxParseCaption(caption) : null;
  var item = {
    id: 'igxi' + Date.now().toString(36) + '_' + idx,
    photos: [],
    caption: caption || '',
    title: '', price: 0, usd: false, neg: true, parish: '', category: 'other', phone: '', desc: '',
    include: true, dup: false, edited: false, state: 'ready',
    auto: { title: false, price: false, parish: false, category: false, desc: false }
  };
  if (photo) item.photos.push(photo);
  if (parsed) {
    item.title = parsed.title;
    item.price = parsed.price;
    item.usd = parsed.usd;
    item.neg = parsed.neg;
    item.parish = parsed.parish;
    item.category = parsed.category;
    item.phone = parsed.phone;
    item.desc = parsed.desc;
    item.auto = { title: !!parsed.title, price: parsed.price > 0, parish: !!parsed.parish, category: parsed.catConf !== 'low', desc: !!parsed.desc };
  }
  if (!item.title && photo) item.title = photo.demo ? 'Demo item' : igxTitleFromName(photo.file ? photo.file.name : '');
  if (!item.title) item.title = 'Instagram item';
  if (!item.parish && CU && CU.parish) item.parish = CU.parish;
  if (!item.phone && CU && CU.phone) item.phone = CU.phone;
  if (item.usd) item.desc = (item.desc ? item.desc + IGX_NL : '') + 'Price listed in USD.';
  if (typeof _ads !== 'undefined' && item.price > 0 && CU && CU.id) {
    var tl = item.title.toLowerCase();
    for (var a = 0; a < _ads.length; a++) {
      var ad = _ads[a];
      if (ad.sellerId === CU.id && ad.price === item.price && (ad.title || '').toLowerCase() === tl && ad.status !== 'sold') {
        item.dup = true;
        item.include = false;
        break;
      }
    }
  }
  return item;
}/* ── §IGX-REVIEW — step 3 cards + inline editing ── */
function igxParseBadgesHTML(item) {
  var bits = [];
  if (item.auto.price) bits.push('\ud83d\udcb0 Price');
  if (item.auto.parish) bits.push('\ud83d\udccd Parish');
  if (item.auto.category) bits.push('\ud83c\udff7 Category');
  if (item.auto.title) bits.push('\u270d Title');
  if (!bits.length) return '';
  var out = '<div class="igx-parse-badges">';
  for (var i = 0; i < bits.length; i++) {
    out += '<span class="igx-pbadge" style="animation-delay:' + (380 + i * 170) + 'ms">' + bits[i] + '</span>';
  }
  return out + '</div>';
}
function igxPhotoCellHTML(p) {
  if (p.demo) return '<div class="igx-demo-ph" style="background:' + p.demo.color + '">' + p.demo.emoji + '</div>';
  if (p.preview) return '<img src="' + p.preview + '" alt="" loading="lazy">';
  return '<div class="igx-thumb-load"><div class="igx-spinner"></div></div>';
}
function igxCardHTML(item, i) {
  var catOpts = '';
  for (var c = 0; c < CATS.length; c++) {
    catOpts += '<option value="' + CATS[c].id + '"' + (CATS[c].id === item.category ? ' selected' : '') + '>' + CATS[c].icon + ' ' + escHtml(CATS[c].name) + '</option>';
  }
  var parOpts = '<option value="">Select\u2026</option>';
  for (var p = 0; p < PARISHES.length; p++) {
    parOpts += '<option' + (PARISHES[p] === item.parish ? ' selected' : '') + '>' + escHtml(PARISHES[p]) + '</option>';
  }
  var photos = '';
  for (var ph = 0; ph < item.photos.length; ph++) {
    photos += '<div class="igx-thumb igx-mini">' + igxPhotoCellHTML(item.photos[ph]) +
      '<button class="igx-thumb-x" onclick="igxRemoveItemPhoto(\'' + item.id + '\',' + ph + ')">\u2715</button></div>';
  }
  var addTile = item.photos.length < 6
    ? '<button type="button" class="igx-photo-add" onclick="igxAddItemPhoto(\'' + item.id + '\')">\uff0b</button>'
    : '';
  var needs = (!item.title.trim() || !item.price || !item.parish);
  return '' +
    '<div class="igx-card' + (needs ? ' needs-fix' : '') + (item.include ? '' : ' is-off') + '" id="igxC_' + item.id + '" style="animation-delay:' + Math.min(i * 70, 560) + 'ms">' +
      '<div class="igx-scan"></div>' +
      '<div class="igx-card-top">' +
        '<label class="igx-switch"><input type="checkbox"' + (item.include ? ' checked' : '') + ' onchange="igxToggleItem(\'' + item.id + '\')"><span class="igx-switch-ui"></span></label>' +
        '<div class="igx-card-photos">' + photos + addTile + '</div>' +
        '<button type="button" class="igx-card-del" title="Remove item" onclick="igxRemoveItem(\'' + item.id + '\')">\ud83d\uddd1\ufe0f</button>' +
      '</div>' +
      igxParseBadgesHTML(item) +
      (item.dup ? '<div class="igx-dup-chip">\ud83d\udc40 Looks like you already posted this \u2014 unchecked to avoid a dupe</div>' : '') +
      '<div class="igx-fields">' +
        '<input class="form-inp" type="text" value="' + escHtml(item.title) + '" placeholder="Listing title" oninput="igxField(\'' + item.id + '\',\'title\',this.value)">' +
        '<div class="igx-frow">' +
          '<label class="igx-f">Price (JMD)<input class="form-inp" type="number" min="0" value="' + (item.price || '') + '" placeholder="0" oninput="igxField(\'' + item.id + '\',\'price\',this.value)"></label>' +
          '<label class="igx-f">Category<select class="form-inp" onchange="igxField(\'' + item.id + '\',\'category\',this.value)">' + catOpts + '</select></label>' +
          '<label class="igx-f">Parish<select class="form-inp" onchange="igxField(\'' + item.id + '\',\'parish\',this.value)">' + parOpts + '</select></label>' +
        '</div>' +
        '<textarea class="form-inp" rows="2" placeholder="Description" oninput="igxField(\'' + item.id + '\',\'desc\',this.value)">' + escHtml(item.desc) + '</textarea>' +
        '<div class="igx-frow2">' +
          '<label class="igx-negl"><input type="checkbox"' + (item.neg ? ' checked' : '') + ' onchange="igxField(\'' + item.id + '\',\'neg\',this.checked)"> Negotiable</label>' +
          '<input class="form-inp" type="tel" value="' + escHtml(item.phone) + '" placeholder="876-XXX-XXXX" oninput="igxField(\'' + item.id + '\',\'phone\',this.value)">' +
        '</div>' +
      '</div>' +
    '</div>';
}
function igxStepBody3() {
  var n = igxItems.length;
  var inc = 0;
  for (var i = 0; i < n; i++) { if (igxItems[i].include) inc++; }
  var parOpts = '<option value="">Parish for all\u2026</option>';
  for (var p = 0; p < PARISHES.length; p++) parOpts += '<option>' + escHtml(PARISHES[p]) + '</option>';
  var cards = '';
  for (var j = 0; j < igxItems.length; j++) cards += igxCardHTML(igxItems[j], j);
  return '' +
    '<div class="igx-review-head igx-in">' +
      '<div class="igx-review-count"><strong id="igxIncCount">' + inc + '</strong> of ' + n + ' selected for import</div>' +
      '<div class="igx-bulk">' +
        '<button class="btn btn-ghost btn-sm" onclick="igxSelectAll(true)">\u2713 All</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="igxSelectAll(false)">\u2715 None</button>' +
        '<select class="form-inp igx-bulk-parish" onchange="igxApplyParishAll(this.value)">' + parOpts + '</select>' +
        '<button class="btn btn-ghost btn-sm" onclick="igxApplyPhoneAll()">\ud83d\udcdf My phone \u2192 all</button>' +
      '</div>' +
    '</div>' +
    '<div class="igx-grid">' + cards + '</div>' +
    '<input type="file" id="igxItemFileIn" accept="image/*" multiple style="display:none" onchange="igxPickItemFiles(this)">' +
    '<div class="step-nav igx-publish-nav">' +
      '<button class="btn btn-ghost" onclick="igxSetStep(2)" style="min-width:90px">\u2190 Back</button>' +
      '<button class="btn btn-gold btn-lg" style="flex:1" id="igxPublishBtn"' + (inc === 0 ? ' disabled' : '') + ' onclick="igxPublish()">\ud83d\ude80 Publish <span id="igxPubCount">' + inc + '</span> listing' + (inc === 1 ? '' : 's') + '</button>' +
    '</div>';
}function igxFind(id) {
  for (var i = 0; i < igxItems.length; i++) { if (igxItems[i].id === id) return igxItems[i]; }
  return null;
}
function igxToggleItem(id) {
  var it = igxFind(id);
  if (!it) return;
  it.include = !it.include;
  var card = $el('igxC_' + id);
  if (card) card.classList.toggle('is-off', !it.include);
  igxUpdatePublishBar();
}
function igxRemoveItem(id) {
  igxItems = igxItems.filter(function (x) { return x.id !== id; });
  var card = $el('igxC_' + id);
  if (card) {
    card.classList.add('igx-out');
    setTimeout(function () { igxRenderStep(3); }, 240);
  } else {
    igxRenderStep(3);
  }
}
function igxField(id, field, value) {
  var it = igxFind(id);
  if (!it) return;
  if (field === 'price') value = Math.max(0, Math.round(parseFloat(value) || 0));
  it[field] = value;
  if (!it.edited) { it.edited = true; igxAward(IGX_XP.edit, 'Fine-tuning'); }
  if (field === 'title' || field === 'price' || field === 'parish') {
    var card = $el('igxC_' + id);
    if (card) card.classList.toggle('needs-fix', (!it.title.trim() || !it.price || !it.parish));
  }
  igxUpdatePublishBar();
}
function igxUpdatePublishBar() {
  var inc = 0;
  for (var i = 0; i < igxItems.length; i++) { if (igxItems[i].include) inc++; }
  var c = $el('igxPubCount');
  if (c) c.textContent = inc;
  var btn = $el('igxPublishBtn');
  if (btn) btn.disabled = (inc === 0);
}
function igxSelectAll(on) {
  for (var i = 0; i < igxItems.length; i++) igxItems[i].include = on;
  igxRenderStep(3);
}
function igxApplyParishAll(p) {
  if (!p) return;
  for (var i = 0; i < igxItems.length; i++) {
    if (igxItems[i].include) { igxItems[i].parish = p; igxItems[i].edited = true; }
  }
  showToast('Parish set for all selected \ud83d\udccd', '\ud83d\udccd');
  igxRenderStep(3);
}
function igxApplyPhoneAll() {
  var ph = (CU && CU.phone) ? CU.phone : '';
  if (!ph) { igxAlert('No phone saved on your profile \u2014 add one in Edit Profile first.'); return; }
  for (var i = 0; i < igxItems.length; i++) { if (igxItems[i].include) igxItems[i].phone = ph; }
  showToast('Phone applied to all selected \ud83d\udcdf', '\ud83d\udcdf');
  igxRenderStep(3);
}
function igxAddItemPhoto(id) {
  igxPhotoTargetId = id;
  var inp = $el('igxItemFileIn');
  if (inp) { inp.value = ''; inp.click(); }
}
function igxRemoveItemPhoto(id, idx) {
  var it = igxFind(id);
  if (!it) return;
  it.photos.splice(idx, 1);
  igxRenderStep(3);
}
function igxPickItemFiles(input) {
  var id = igxPhotoTargetId;
  igxPhotoTargetId = null;
  var it = id ? igxFind(id) : null;
  if (!it) return;
  var files = Array.prototype.slice.call(input.files || []);
  var slots = Math.max(0, 6 - it.photos.length);
  files.slice(0, slots).forEach(function (file) {
    if (!file.type || file.type.indexOf('image/') !== 0 || file.size > 8 * 1024 * 1024) return;
    var entry = { file: file, preview: '', demo: null };
    it.photos.push(entry);
    igxPhotoPreview(file).then(function (url) { entry.preview = url; igxRenderStep(3); });
  });
  input.value = '';
}/* ── §IGX-PUBLISH — step 4 + celebration ── */
function igxStepBody4() {
  var rows = '';
  for (var i = 0; i < igxItems.length; i++) {
    if (igxItems[i].include) rows += igxRowHTML(igxItems[i]);
  }
  return '' +
    '<div class="igx-pub-head igx-in"><div class="igx-pub-spinner"></div><div><strong>Publishing your listings\u2026</strong><small>Uploading photos &amp; going live \u2014 hang tight!</small></div></div>' +
    '<div class="igx-pub-list" id="igxPubList">' + rows + '</div>' +
    '<div class="igx-pub-note">Keep this open \u2014 closing early will not stop uploads, but yuh will miss the celebration \ud83c\udf89</div>';
}
function igxRowHTML(item) {
  var thumb = item.photos.length ? igxPhotoCellHTML(item.photos[0]) : '<div class="igx-demo-ph" style="background:linear-gradient(135deg,#005c35,#00703f)">\ud83d\udce6</div>';
  return '<div class="igx-pub-row state-' + item.state + '" id="igxRow_' + item.id + '">' +
    '<div class="igx-pub-thumb">' + thumb + '</div>' +
    '<div class="igx-pub-name">' + escHtml(item.title) + '<small>' + (item.price ? 'J$' + fmtN(item.price) : 'No price') + (item.parish ? ' \u00b7 ' + escHtml(item.parish) : '') + '</small></div>' +
    '<div class="igx-pub-status" id="igxRowSt_' + item.id + '">' + igxRowStatusText(item.state) + '</div>' +
  '</div>';
}
function igxRowStatusText(state) {
  if (state === 'queued') return '<span class="igx-st-mut">Queued</span>';
  if (state === 'uploading') return '<span class="igx-st-work"><span class="igx-spinner igx-spinner-sm"></span> Uploading\u2026</span>';
  if (state === 'live') return '<span class="igx-st-live">\u2713 Live</span>';
  if (state === 'fail') return '<span class="igx-st-fail">\u26a0 Failed</span>';
  return '';
}
function igxSetRowState(item) {
  var row = $el('igxRow_' + item.id);
  var st = $el('igxRowSt_' + item.id);
  if (row) row.className = 'igx-pub-row state-' + item.state;
  if (st) st.innerHTML = igxRowStatusText(item.state);
}
async function igxPublish() {
  if (igxPublishing) return;
  var items = [];
  for (var i = 0; i < igxItems.length; i++) { if (igxItems[i].include) items.push(igxItems[i]); }
  if (!items.length) { igxAlert('Select at least one item to publish.'); return; }
  var badCount = 0;
  for (var j = 0; j < items.length; j++) {
    if (!items[j].title.trim() || !items[j].price || !items[j].parish) badCount++;
  }
  if (badCount) { igxAlert('Each listing needs a title, price and parish \u2014 fix the red cards first.'); return; }
  if (typeof _db === 'undefined' || !_db) { igxAlert('No database connection \u2014 check yuh internet and try again.'); return; }
  igxPublishing = true;
  for (var q = 0; q < items.length; q++) items[q].state = 'queued';
  igxSession = { badgesNew: igxSession.badgesNew.slice(), xpEarned: 0, published: 0, failed: 0, yp: 0 };
  var btn = $el('igxPublishBtn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Publishing\u2026'; }
  igxSetStep(4);
  for (var idx = 0; idx < items.length; idx++) {
    var item = items[idx];
    item.state = 'uploading';
    igxSetRowState(item);
    var urls = [];
    var failed = false;
    for (var p2 = 0; p2 < item.photos.length; p2++) {
      var ph = item.photos[p2];
      if (!ph.file) continue;
      var st = $el('igxRowSt_' + item.id);
      if (st) st.innerHTML = '<span class="igx-st-work"><span class="igx-spinner igx-spinner-sm"></span> Photo ' + (p2 + 1) + '/' + item.photos.length + '\u2026</span>';
      var url = null;
      try { url = await uploadToSupabase(ph.file); } catch (e) { url = null; }
      if (url) { urls.push(url); } else { failed = true; break; }
    }
    if (failed) {
      item.state = 'fail';
      igxSession.failed++;
      igxSetRowState(item);
      continue;
    }
    var cat = catById(item.category);
    var ad = {
      id: 'a' + Date.now() + 'x' + idx,
      title: item.title.trim(),
      category: item.category,
      parish: item.parish,
      price: item.price,
      desc: item.desc,
      phone: item.phone || (CU.phone || ''),
      image: urls[0] || '',
      photos: urls,
      neg: !!item.neg,
      icon: cat ? cat.icon : '\ud83d\udce6',
      seller: CU.name,
      sellerInit: initials(CU.name),
      sellerId: CU.id,
      date: new Date().toISOString().split('T')[0],
      status: 'active',
      views: 0
    };
    try {
      await sbInsertAd(ad);
      item.state = 'live';
      igxSession.published++;
      igxAward(IGX_XP.publish, 'Listing live!');
      igxUnlockBadge('first-drop');
      if (igxSession.published >= 5) igxUnlockBadge('bulk-import');
      if (item.photos.length >= 3) igxUnlockBadge('photo-pro');
      if (item.auto.title && item.auto.price && item.auto.parish && item.auto.category) igxUnlockBadge('mind-reader');
    } catch (e) {
      item.state = 'fail';
      igxSession.failed++;
      if (typeof console !== 'undefined' && console.error) console.error('[igx] insert failed:', e);
    }
    igxSetRowState(item);
  }
  igxStore.imports++;
  igxStore.items += igxSession.published;
  igxSaveStore();
  if (igxStore.items >= 10) igxUnlockBadge('shop-builder');
  if (igxSession.published > 0) {
    var yp = igxSession.published * 10;
    var got = await igxBumpYaadPoints(yp);
    if (got) igxSession.yp = yp;
  }
  if (typeof renderCats === 'function') renderCats();
  if (typeof renderHome === 'function') renderHome();
  if (typeof updateStats === 'function') updateStats();
  if (typeof renderMyAds === 'function') renderMyAds();
  if (igxSession.published > 0 && typeof launchConfetti === 'function') launchConfetti();
  igxRenderSummary();
  igxPublishing = false;
}
async function igxBumpYaadPoints(n) {
  try {
    if (typeof _db === 'undefined' || !_db || !CU || !CU.id) return false;
    var res = await _db.from('profiles').select('yaad_points').eq('id', CU.id).single();
    if (res.error || !res.data) return false;
    var cur = res.data.yaad_points || 0;
    var up = await _db.from('profiles').update({ yaad_points: cur + n }).eq('id', CU.id);
    if (up.error) return false;
    CU.yaad_points = cur + n;
    return true;
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[igx] yaad_points bump skipped:', e && e.message);
    return false;
  }
}