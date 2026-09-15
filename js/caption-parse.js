/* CAPTION PARSE — listing caption intelligence.
   Smart fill (js/post-pro.js) calls capParseCaption() to turn any pasted
   text — a caption, a WhatsApp message, a note — into a title, price,
   parish, category and phone. Pure text parsing; no third-party service. */

/* ── §CAP-PARSER — caption intelligence ("Yaad Magic") ──
   NOTE: newlines are handled via CAP_NL (String.fromCharCode) so the
   parser works identically with CRLF pastes from any device. */
var CAP_NL = String.fromCharCode(10);
var CAP_CR = String.fromCharCode(13);
function capNorm(s) {
  return String(s == null ? '' : s)
    .split(CAP_CR + CAP_NL).join(CAP_NL)
    .split(CAP_CR).join(CAP_NL);
}
var CAP_PARISH_RES = [
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
function capDetectParish(text) {
  for (var i = 0; i < CAP_PARISH_RES.length; i++) {
    if (CAP_PARISH_RES[i][0].test(text)) return CAP_PARISH_RES[i][1];
  }
  return '';
}

var CAP_CAT_KW = {
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
function capDetectCategory(text) {
  var t = ' ' + String(text).toLowerCase() + ' ';
  var best = 'other', bestScore = 0, second = 0;
  for (var id in CAP_CAT_KW) {
    var kws = CAP_CAT_KW[id], score = 0;
    for (var k = 0; k < kws.length; k++) { if (t.indexOf(kws[k]) !== -1) score += 2; }
    if (score > bestScore) { second = bestScore; best = id; bestScore = score; }
    else if (score > second) second = score;
  }
  if (bestScore < 2) return { id: 'other', conf: 'low' };
  return { id: best, conf: (bestScore >= 6 && bestScore >= second * 2) ? 'high' : 'medium' };
}

function capParsePriceValue(numStr, suffix) {
  var v = parseFloat(String(numStr).replace(/,/g, ''));
  if (!isFinite(v) || v <= 0) return 0;
  if (suffix) {
    var s = suffix.toLowerCase();
    if (s === 'k') v *= 1000;
    if (s === 'm') v *= 1000000;
  }
  return Math.round(v);
}
function capLooksLikePhone(v) {
  var d = String(v).replace(/[^0-9]/g, '');
  return d.length >= 7 && /^(?:1?876)?\d{7}$/.test(d);
}
function capExtractPrice(text) {
  var lines = text.split(CAP_NL);
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
      if (pi >= 2 && capLooksLikePhone(m[1])) continue;
      var v = capParsePriceValue(m[1], m[2]);
      if (pi === 1 && v < 1000 && /876/.test(line)) continue;
      if (v >= 10) return { price: v, usd: patterns[pi].usd ? patterns[pi].usd.test(line) : false };
    }
  }
  return { price: 0, usd: false };
}function capIsNoise(line) {
  var bare = line.replace(/[^0-9A-Za-z]/g, '');
  return bare.length < 2;
}
function capCleanLine(line) {
  return line
    .replace(/#[^\s#]+/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^[\s|~\-\u2013\u2014=*>\u00b7]+/, '')
    .replace(/[\s|~]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function capTruncateTitle(s, max) {
  s = s.trim();
  if (s.length <= max) return s;
  var cut = s.slice(0, max);
  var sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,\-\u2013\u2014:;.]+$/, '') + '\u2026';
}
function capTitleFromName(name) {
  var base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!base) base = 'Imported item';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function capParseCaption(raw) {
  var out = { title: '', desc: '', price: 0, usd: false, neg: true, parish: '', phone: '', category: 'other', catConf: 'low' };
  var text = capNorm(raw).replace(/[\u200b\u200c]/g, '').trim();
  if (!text) return out;
  var p = capExtractPrice(text);
  out.price = p.price;
  out.usd = p.usd;
  if (/\b(firm|fixed|no\s*less|non[\s\-]?neg|not\s*negotiable|last\s*price|final\s*price)\b/i.test(text)) out.neg = false;
  else if (/\b(neg|nego|negotiable|o\.?b\.?o|offer|haggle|serious\s*offers?|best\s*price)\b/i.test(text)) out.neg = true;
  var pm = text.match(/(?:\+?1[\s.\-]?)?876[\s.\-]?\d{3}[\s.\-]?\d{4}/) || text.match(/\b\d{3}[\s.\-]\d{4}\b/);
  if (pm) out.phone = pm[0].trim();
  out.parish = capDetectParish(text);
  var cat = capDetectCategory(text);
  out.category = cat.id;
  out.catConf = cat.conf;
  var lines = text.split(CAP_NL).map(capCleanLine).filter(function (l) { return l && !capIsNoise(l); });
  var priceLineRe = /^\$?\s*[0-9][0-9,.]*\s*(k|m)?\s*(jmd|usd)?\s*(neg|nego|negotiable|firm|fixed)?\s*(each|per\s*\w+)?\s*$/i;
  var title = '';
  var rest = [];
  for (var i = 0; i < lines.length; i++) {
    if (!title && priceLineRe.test(lines[i])) continue;
    if (!title) { title = lines[i]; continue; }
    rest.push(lines[i]);
  }
  out.title = title ? capTruncateTitle(title, 70) : '';
  out.desc = rest.join(CAP_NL);
  return out;
}
/* XP shim - old wizard XP retired; Post-Ad Pro still calls capAward(). */
function capAward(xp, why) { return 0; }
