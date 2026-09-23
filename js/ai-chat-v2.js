/* ╔══════════════════════════════════════════════════════════════════════╗
   ║  AI CHAT v2 — PURE CONVERSATIONAL CORE             §AI-CHAT-V2       ║
   ║  100% local. No network, no API keys, no external calls.             ║
   ╚══════════════════════════════════════════════════════════════════════╝
   This module is the thinking half of the chat: it turns a follow-up line
   ("the second one", "which is best?", "anything cheaper than that",
   "only ones with photos") into a decision the UI can act on, and it turns
   a set of listings into human-readable value analysis (median price,
   freshness, negotiable share, best-pick rationale).

   It is deliberately DOM-free and dependency-free so it can be unit tested
   in plain Node (tools/test-chat-v2.js) and reused by any surface.

   UMD: browser → window.AiChatV2 ; Node → module.exports                */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AiChatV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── φ constants (mirrors the CSS --phi / Fibonacci ramp) ─────────── */
  var PHI = 1.618;
  var FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
  function fib(i) { return FIB[Math.max(0, Math.min(i | 0, FIB.length - 1))]; }

  var LAST = -2;                 // sentinel for "the last one"
  var DAY = 86400000;

  /* ── tiny helpers ─────────────────────────────────────────────────── */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function money(n) { return 'J$' + String(Math.round(num(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
  }
  function ageDays(ad, now) {
    var t = ad && ad.date ? new Date(ad.date).getTime() : 0;
    if (!t) return 9999;
    return Math.max(0, ((now || Date.now()) - t) / DAY);
  }
  function relativeAge(ad, now) {
    var d = ageDays(ad, now);
    if (d < 1) return 'today';
    if (d < 2) return 'yesterday';
    if (d < 7) return Math.floor(d) + ' days ago';
    if (d < 30) return Math.floor(d / 7) + ' week' + (Math.floor(d / 7) > 1 ? 's' : '') + ' ago';
    return Math.floor(d / 30) + ' month' + (Math.floor(d / 30) > 1 ? 's' : '') + ' ago';
  }
  function active(ad) { return !!ad && ad.status !== 'sold'; }
  function words(s) { return norm(s).split(' ').filter(Boolean); }

  /* ══ BUDGET PARSING — "under 2m", "around 80k", "1 and 2 million" ══
     Mirrors YaadBrain's shorthand rules (under 3 → 3M, under 80 → 80k) so both
     engines read a price the same way, and gives the UI something honest to
     echo back: "6 of 23 under J$2,000,000". */
  function scalePrice(raw, unit) {
    var n = parseFloat(String(raw).replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) return 0;
    var u = String(unit || '').toLowerCase();
    if (u === 'k' || u === 'thousand') return Math.round(n * 1e3);
    if (u === 'm' || u === 'million' || u === 'mil') return Math.round(n * 1e6);
    if (n <= 20) return Math.round(n * 1e6);     /* "under 3"   → 3M   */
    if (n <= 999) return Math.round(n * 1e3);    /* "under 80"  → 80k  */
    return Math.round(n);                        /* "under 80000"      */
  }
  function parseBudget(text) {
    var s = norm(text), m;
    m = s.match(/between\s+\$?([\d.,]+)\s*(k|thousand|m|million|mil)?\s*(?:and|to|-)\s*\$?([\d.,]+)\s*(k|thousand|m|million|mil)?/);
    if (m) {
      var lo = scalePrice(m[1], m[2]), hi = scalePrice(m[3], m[4]);
      if (lo > hi) { var swap = lo; lo = hi; hi = swap; }
      return { min: lo, max: hi, label: money(lo) + ' – ' + money(hi) };
    }
    m = s.match(/(?:under|below|less than|max|beneath|up to|no more than|nuh more|cheaper than)\s+\$?([\d.,]+)\s*(k|thousand|m|million|mil)?/);
    if (m) { var cap = scalePrice(m[1], m[2]); return { min: 0, max: cap, label: 'under ' + money(cap) }; }
    m = s.match(/(?:over|above|more than|starting at|from)\s+\$?([\d.,]+)\s*(k|thousand|m|million|mil)?/);
    if (m) { var floor = scalePrice(m[1], m[2]); return { min: floor, max: 0, label: 'from ' + money(floor) }; }
    m = s.match(/\b(?:around|about|roughly|circa|budget of)\s+\$?([\d.,]+)\s*(k|thousand|m|million|mil)?/);
    if (m) {
      var target = scalePrice(m[1], m[2]);
      return { min: Math.round(target * 0.8), max: Math.round(target * 1.2), label: 'around ' + money(target) };
    }
    return null;
  }
  /** Keep only the listings inside a parsed budget. */
  function withinBudget(pool, budget) {
    if (!budget) return (pool || []).slice();
    return (pool || []).filter(function (a) {
      var p = num(a.price);
      if (!p) return true;                       /* "contact for price" still counts */
      if (budget.max && p > budget.max) return false;
      if (budget.min && p < budget.min) return false;
      return true;
    });
  }

  /* ══ ORDINAL RESOLUTION — "the second one", "#3", "2", "last" ══════ */
  var ORDINAL_WORDS = {
    first: 1, '1st': 1, one: 1,
    second: 2, '2nd': 2, two: 2,
    third: 3, '3rd': 3, three: 3,
    fourth: 4, '4th': 4, four: 4,
    fifth: 5, '5th': 5, five: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10
  };

  /** One-based → zero-based. */
  function toIndex(oneBased) {
    var n = oneBased | 0;
    return n <= 0 ? -1 : n - 1;
  }

  /** First ordinal/number found in the text, else -1 (LAST for "last"). */
  function ordinalIndex(text) {
    var s = norm(text), m;
    // "open 2" / "show the second one" / "view #3" — strip the verb first
    s = s.replace(/^(?:open|show|view|see|display|pull up|look at|si|tek)\s+(?:the\s+|number\s+|no\.?\s*|#)?/, '');
    m = s.match(/(?:#|number\s*|no\.?\s*|item\s*|option\s*|listing\s*|ad\s*)(\d{1,2})\b/);
    if (m) return toIndex(parseInt(m[1], 10));
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
    if (m) return toIndex(parseInt(m[1], 10));
    // "last" wins before word ordinals — "the last one" is not "one"
    if (/\b(last|final|bottom)\b/.test(s)) return LAST;
    if (/^(?:the\s+)?one\b/.test(s)) return 0;
    // longest names first so "second" beats "one" inside "the second one"
    var keys = Object.keys(ORDINAL_WORDS).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (new RegExp('\\b' + keys[i] + '\\b').test(s)) return toIndex(ORDINAL_WORDS[keys[i]]);
    }
    m = s.match(/^(?:the\s+|number\s+)?(\d{1,2})(?:\s+(?:one|please|pls|bro))?[?!.]?$/);
    if (m) return toIndex(parseInt(m[1], 10));
    return -1;
  }

  /** Every ordinal mentioned, in order of appearance. */
  function ordinalList(text) {
    var s = norm(text), out = [], seen = {};
    var re = /(?:#|number\s*|no\.?\s*|item\s*|option\s*|listing\s*|ad\s*)(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      var idx = m[1] ? toIndex(parseInt(m[1], 10))
        : m[2] ? toIndex(parseInt(m[2], 10))
          : toIndex(ORDINAL_WORDS[m[3]]);
      if (idx >= 0 && !seen[idx]) { seen[idx] = 1; out.push(idx); }
    }
    if (!out.length) {
      var one = ordinalIndex(s);
      if (one >= 0 || one === LAST) out.push(one);
    }
    return out;
  }

  /** Resolve a possibly-LAST / out-of-range index against a list length. */
  function resolveIndex(idx, len) {
    if (idx === LAST) return (len || 0) - 1;
    if (idx < 0 || idx === undefined || idx === null) return -1;
    if (len && idx >= len) return -1;
    return idx;
  }
/* ══ POOL ANALYTICS — what the listings actually look like ════════ */
  function analyzePool(pool) {
    var list = (pool || []).filter(active);
    var prices = list.map(function (a) { return num(a.price); })
      .filter(function (p) { return p > 0; })
      .sort(function (a, b) { return a - b; });
    var stats = {
      count: list.length,
      priced: prices.length,
      min: prices.length ? prices[0] : 0,
      max: prices.length ? prices[prices.length - 1] : 0,
      median: 0, avg: 0, negotiable: 0, withPhotos: 0,
      freshest: null, cheapest: null, topViewed: null, newestDays: 9999
    };
    if (prices.length) {
      var mid = Math.floor(prices.length / 2);
      stats.median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
      stats.avg = Math.round(prices.reduce(function (s, p) { return s + p; }, 0) / prices.length);
    }
    list.forEach(function (a) {
      if (a.neg) stats.negotiable++;
      if (a.image) stats.withPhotos++;
    });
    if (list.length) {
      stats.freshest = list.reduce(function (best, a) { return ageDays(a) < ageDays(best) ? a : best; }, list[0]);
      stats.newestDays = ageDays(stats.freshest);
      stats.cheapest = list.reduce(function (best, a) { return num(a.price) < num(best.price) ? a : best; }, list[0]);
      stats.topViewed = list.reduce(function (best, a) { return num(a.views) > num(best.views) ? a : best; }, list[0]);
    }
    return stats;
  }

  function pctBelow(price, median) {
    if (!median || !price) return 0;
    return Math.round(((median - price) / median) * 100);
  }

  /* ═ VALUE SCORING — why this one, in plain words ═════════════════ */
  function scorePick(ad, stats, now) {
    if (!ad) return { score: 0, reasons: [], belowMedian: 0 };
    var reasons = [], score = 0;
    var below = pctBelow(num(ad.price), stats && stats.median);

    if (below >= 25) { score += 4; reasons.push('💸 ' + below + '% below the median price'); }
    else if (below >= 10) { score += 2.5; reasons.push('💸 ' + below + '% under the median'); }
    else if (below > 0) { score += 1; reasons.push('💸 a little under the median'); }
    else if (below <= -35) { score -= 1.5; reasons.push('💎 priced well above the median'); }

    var d = ageDays(ad, now);
    if (d < 1) { score += 2.5; reasons.push('🆕 posted today'); }
    else if (d < 3) { score += 2; reasons.push('🆕 posted in the last 3 days'); }
    else if (d < 7) { score += 1; reasons.push('📅 posted this week'); }

    if (ad.neg) { score += 1.2; reasons.push('🤝 price is negotiable'); }
    if (num(ad.views) > 60) { score += 1; reasons.push('🔥 ' + num(ad.views) + ' views — popular'); }
    if (ad.image) { score += 0.6; reasons.push('📸 has real photos'); }

    return { score: Math.round(score * 100) / 100, reasons: reasons, belowMedian: below };
  }

  /** Best pick from a pool + runner-up (for "which is best?"). */
  function bestPick(pool, stats, now) {
    var list = (pool || []).filter(active);
    if (!list.length) return null;
    var s = stats || analyzePool(list);
    var ranked = list.map(function (ad) {
      var r = scorePick(ad, s, now);
      return { ad: ad, score: r.score, reasons: r.reasons, belowMedian: r.belowMedian };
    }).sort(function (a, b) { return b.score - a.score; });
    return { pick: ranked[0], runnerUp: ranked[1] || null, stats: s };
  }
/* ══ PRICE ADVICE — "is this a good deal?" ══════════════════════ */
  function priceAdvice(ad, stats) {
    if (!ad || !stats || !stats.median) {
      return { tone: 'neutral', label: 'No comparison data yet', below: 0, text: 'Not enough similar listings to judge this price yet.' };
    }
    var below = pctBelow(num(ad.price), stats.median);
    if (below >= 20) return { tone: 'good', label: 'Good deal', below: below, text: 'That is about ' + below + '% below the median (' + money(stats.median) + ') for this set — a solid buy if the item checks out.' };
    if (below >= 5) return { tone: 'fair', label: 'Fair price', below: below, text: 'Slightly below the median of ' + money(stats.median) + ' — reasonable, and likely negotiable territory.' };
    if (below > -10) return { tone: 'fair', label: 'Around market', below: below, text: 'Right around the median of ' + money(stats.median) + ' — market price, no premium and no bargain.' };
    return { tone: 'high', label: 'Above market', below: below, text: 'About ' + Math.abs(below) + '% above the median (' + money(stats.median) + '). Worth negotiating, or check the cheaper ones in this set.' };
  }

  /* ══ HUMAN-READABLE DETAIL + COMPARISON ═══════════════════════════ */
  function detailText(ad, opts) {
    var o = opts || {};
    if (!ad) return 'I could not find that one any more — try the search again.';
    var lines = [];
    lines.push('📌 ' + (ad.title || 'Untitled listing'));
    lines.push('💰 ' + money(ad.price) + (ad.neg ? ' · negotiable' : ''));
    lines.push('📍 ' + (ad.parish || 'Jamaica') + ' · ' + (o.catName || 'Listing'));
    lines.push('🕐 Posted ' + relativeAge(ad, o.now));
    if (ad.seller) lines.push('👤 Sold by ' + ad.seller);
    if (ad.desc) {
      var d = String(ad.desc).replace(/\s+/g, ' ').trim();
      if (d.length > 180) d = d.slice(0, 177).replace(/\s\S*$/, '') + '…';
      lines.push('📝 ' + d);
    }
    if (o.advice) lines.push('', '📊 ' + o.advice.text);
    lines.push('', 'Tap the card below to open it — Call, WhatsApp and Message are all in there.');
    return lines.join('\n');
  }

  function compareText(a, b, stats) {
    if (!a || !b) return 'I need two listings to compare — say "compare the first and second".';
    var now = Date.now();
    var cheaper = num(a.price) <= num(b.price) ? a : b;
    var dearer = cheaper === a ? b : a;
    var diff = num(dearer.price) - num(cheaper.price);
    var pc = num(dearer.price) ? Math.round((diff / num(dearer.price)) * 100) : 0;
    var lines = ['⚖️ Head to head:'];
    lines.push('1️⃣ ' + (a.title || '') + ' — ' + money(a.price) + ' · ' + (a.parish || '') + ' · ' + relativeAge(a, now));
    lines.push('2️⃣ ' + (b.title || '') + ' — ' + money(b.price) + ' · ' + (b.parish || '') + ' · ' + relativeAge(b, now));
    if (diff > 0) lines.push('', '💰 ' + (cheaper.title || 'The cheaper one') + ' is ' + money(diff) + ' less — about ' + pc + '% cheaper.');
    else lines.push('', '💰 Same price — freshness, condition and location decide it.');
    if (Math.abs(ageDays(a, now) - ageDays(b, now)) >= 1) {
      lines.push((ageDays(a, now) < ageDays(b, now) ? '🆕 ' + (a.title || 'the first') : '🆕 ' + (b.title || 'the second')) + ' was posted more recently.');
    }
    if (!!a.neg !== !!b.neg) lines.push('🤝 ' + ((a.neg ? a : b).title || 'One of them') + ' is negotiable — the other is not.');
    var verdict = bestPick([a, b], stats, now);
    if (verdict && verdict.pick) {
      lines.push('', '🏆 My pick: ' + (verdict.pick.ad.title || '') +
        (verdict.pick.reasons.length ? ' — ' + String(verdict.pick.reasons[0]).replace(/^\S+\s/, '') : ''));
    }
    return lines.join('\n');
  }

  /* ══ POOL REFINEMENT — pure filters, no re-search needed ══════════ */
  function refinePool(pool, intent) {
    var list = (pool || []).filter(active);
    if (intent === 'photos_only') return list.filter(function (a) { return !!a.image; });
    if (intent === 'negotiable_only') return list.filter(function (a) { return !!a.neg; });
    if (intent === 'same_parish') {
      var top = '', counts = {};
      list.forEach(function (a) { counts[a.parish] = (counts[a.parish] || 0) + 1; });
      Object.keys(counts).forEach(function (p) { if (counts[p] > (counts[top] || 0)) top = p; });
      return list.filter(function (a) { return a.parish === top; });
    }
    if (intent === 'cheapest_half') {
      var sorted = list.slice().sort(function (a, b) { return num(a.price) - num(b.price); });
      return sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
    }
    if (intent === 'newest_half') {
      var byDate = list.slice().sort(function (a, b) { return ageDays(a) - ageDays(b); });
      return byDate.slice(0, Math.max(1, Math.ceil(byDate.length / 2)));
    }
    return list;
  }
/* ══ CHAT INTENT CLASSIFIER ═══════════════════════════════════════
     Only conversational intents live here. A real listing search
     ("cheap car under 2m") returns 'search' so YaadBrain keeps doing
     what it does best. Every refinement intent requires a live result
     set, so a fresh search can never be hijacked by chat phrasing. */
  var RE = {
    greeting: /^(hi|hey|hello|yo|hiya|good\s*(morning|afternoon|evening|night)|wah\s*gwaan|whaapen|whappen|ello|hail|greetings|sup|howdy)\b/,
    new_chat: /\b(new chat|start over|start again|reset|clear (this|the chat|conversation)|forget (that|this|it))\b/,
    help: /^(help|\?|what can you do|what can i ask|how (do|does) (this|it|you) work|commands|options)\b/,
    detail: /\b(tell me more|more (info|details|about)|details|describe|what about (it|that|this|them)|more on (it|that|this))\b/,
    best: /\b(which (one|is)|best (pick|option|deal|one|buy)|recommend|what (would|do) you (pick|suggest|recommend)|help me (choose|decide)|narrow (it|them) down|top pick|pick one for me|which should i)\b/,
    compare: /\b(compare|versus|\bvs\b|difference between|side by side)\b/,
    cheaper: /\b(cheaper than|less (expensive|than)|lower price than|something cheaper|anything cheaper)\b/,
    advice: /\b(good deal|fair price|worth it|overpriced|too expensive|is (this|that|it) (a )?good|reasonable price)\b/,
    why: /\b(why|how come)\b/,
    contact: /\b(who (is|do i contact)|seller|contact (them|him|her|the|info)|phone number|whatsapp|reach (them|him|her))\b/,
    photos_only: /\b((only|just) (the )?(ones?|listings?)? ?(with|having) (photos?|pictures?|images?)|with photos|has photos|photos only|pictures only|pics only)\b/,
    negotiable_only: /\b((only )?(negotiable|nego) (ones?|listings?|only)|negotiable only|only negotiable)\b/,
    same_parish: /\b(same (parish|area|place|town)|close by|nearby|near me|in (the )?same (parish|area))\b/,
    cheapest_half: /\b(only the cheapest|cheapest ones|show (me )?the cheap ones|bottom half)\b/,
    newest_half: /\b(only the newest|newest ones|freshest ones|top half)\b/,
    sort_price_asc: /\b(cheapest first|lowest price first|price low to high|sort by price|cheap to dear)\b/,
    sort_price_desc: /\b(most expensive first|highest price first|price high to low|dear first)\b/,
    sort_newest: /\b(newest first|freshest first|most recent first|latest first)\b/,
    sort_views: /\b(most (viewed|popular) first|popular first|trending now)\b/,
    open_verb: /\b(open|show|view|see|display|pull up|look at|si|tek)\b/
  };

  /** Classify any user line into a decision the UI can act on. */
  function classify(query, state) {
    var s = norm(query);
    var st = state || {};
    var results = (st.results || []).filter(active);
    var out = { intent: 'search', index: -1, indices: [], count: results.length, budget: parseBudget(s) };

    if (!s) { out.intent = 'empty'; return out; }
    if (RE.new_chat.test(s)) { out.intent = 'new_chat'; return out; }
    if (RE.greeting.test(s)) { out.intent = 'greeting'; return out; }
    if (RE.help.test(s)) { out.intent = 'help'; return out; }
    if (!results.length) return out;   // ↓ everything below needs live results

    out.index = resolveIndex(ordinalIndex(s), results.length);
    out.indices = ordinalList(s)
      .map(function (i) { return resolveIndex(i, results.length); })
      .filter(function (i) { return i >= 0; });

    if (RE.cheaper.test(s)) { out.intent = 'cheaper_than'; if (out.index < 0) out.index = 0; return out; }
    if (RE.compare.test(s)) {
      out.intent = 'compare_2';
      if (out.indices.length < 2) out.indices = out.indices.length ? [out.indices[0], out.indices[0] === 0 ? 1 : 0] : [0, 1];
      return out;
    }
    if (RE.why.test(s)) { out.intent = 'explain_pick'; if (out.index < 0) out.index = 0; return out; }
    if (RE.best.test(s)) { out.intent = 'best_pick'; return out; }
    if (RE.advice.test(s)) { out.intent = 'price_advice'; if (out.index < 0) out.index = 0; return out; }
    if (RE.detail.test(s)) { out.intent = 'detail'; if (out.index < 0) out.index = 0; return out; }
    if (RE.contact.test(s)) { out.intent = 'contact'; if (out.index < 0) out.index = 0; return out; }
    /* sorting keeps the same result set — it just reorders it */
    if (RE.sort_price_asc.test(s)) { out.intent = 'sort_price_asc'; return out; }
    if (RE.sort_price_desc.test(s)) { out.intent = 'sort_price_desc'; return out; }
    if (RE.sort_newest.test(s)) { out.intent = 'sort_newest'; return out; }
    if (RE.sort_views.test(s)) { out.intent = 'sort_views'; return out; }
    if (RE.photos_only.test(s)) { out.intent = 'photos_only'; return out; }
    if (RE.negotiable_only.test(s)) { out.intent = 'negotiable_only'; return out; }
    if (RE.same_parish.test(s)) { out.intent = 'same_parish'; return out; }
    if (RE.cheapest_half.test(s)) { out.intent = 'cheapest_half'; return out; }
    if (RE.newest_half.test(s)) { out.intent = 'newest_half'; return out; }

    // "open 2", "the second one", "2" → open that exact listing
    if (out.index >= 0 && (RE.open_verb.test(s) || words(s).length <= 3)) { out.intent = 'open_pick'; return out; }
    return out;
  }

/* ══ FOLLOW-UP CHIPS — the next best questions, in order ═════════ */
  function followUpChips(query, state) {
    var st = state || {};
    var results = (st.results || []).filter(active);
    var stats = st.stats || (results.length ? analyzePool(results) : null);
    var chips = [];
    if (!results.length) {
      chips.push({ label: '🚗 Cheap cars', query: 'cheap car under 2 million' });
      chips.push({ label: '📱 Phones', query: 'phone under 80000' });
      chips.push({ label: '🏡 Houses', query: 'house under 20 million' });
      chips.push({ label: '💼 Jobs', query: 'jobs available' });
      return chips;
    }
    chips.push({ label: '🏆 Which is best?', query: 'which one is best?' });
    if (results.length > 1) chips.push({ label: '⚖️ Compare top two', query: 'compare the first and second' });
    if (stats && stats.negotiable) chips.push({ label: '🤝 Negotiable only', query: 'only negotiable ones' });
    if (stats && stats.withPhotos < results.length) chips.push({ label: '📸 With photos', query: 'only ones with photos' });
    chips.push({ label: '📌 More about #1', query: 'tell me more about the first one' });
    chips.push({ label: '💸 Cheaper than #1', query: 'anything cheaper than the first one' });
    return chips.slice(0, 6);
  }

  return {
    PHI: PHI, fib: fib, DAY: DAY, LAST: LAST,
    money: money, relativeAge: relativeAge, ageDays: ageDays, pctBelow: pctBelow,
    parseBudget: parseBudget, withinBudget: withinBudget, scalePrice: scalePrice,
    ordinalIndex: ordinalIndex, ordinalList: ordinalList, resolveIndex: resolveIndex,
    analyzePool: analyzePool, scorePick: scorePick, bestPick: bestPick,
    priceAdvice: priceAdvice, detailText: detailText, compareText: compareText,
    refinePool: refinePool, classify: classify, followUpChips: followUpChips
  };
});