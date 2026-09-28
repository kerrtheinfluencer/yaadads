/* ═══════════════════════════════════════════════════════════════════════════
   ✨ FOR YOU — the ranked home feed                                §FOR-YOU
   ───────────────────────────────────────────────────────────────────────────
   A "For You" feed is only worth having if it is HONEST and it is genuinely
   BETTER than "Newest First". This one is built on three rules:

     1. THE NEWEST CANNOT WIN BY DEFAULT. Recency is a decaying score — full
        strength on day one, about half at a week, about 5% at a month — never
        a sort key. A three-week-old listing with real photos, a real
        description and real views beats a thin post from this morning.
     2. THE TOP OF THE FEED IS ALWAYS A MIX. The first slots are shared out
        round-robin across categories, and every later pick is penalised for
        repeating the category, parish or seller that just appeared. No one
        category, parish or seller can take over the page.
     3. NOTHING IS EVER HIDDEN — ONLY ORDERED. Every public listing stays in
        the feed and keeps its exact place under Newest First. Sold posts and
        repeated copies are pushed down, never removed.

   Signals (read from this device only — nothing about a member is uploaded):
     ❤️ favourites   ·   👁️ recently viewed   ·   🔍 recent searches
   plus listing quality (photos, description, views, phone, negotiable),
   freshness, a deterministic DAILY SHUFFLE so the long tail rotates instead
   of settling, and demotions for posts you just viewed, sold posts and
   repeated same-seller copies.

   The feed explains itself: every card carries a one-line reason chip, the
   bar above the grid summarises the signals in play, and ❔ How this works
   spells out all five rules. "Newest First" turns the whole thing off.

   Public surface (window.*) — also driven by the headless test:
     fyRank(ads, opts)  → ranked + diversified copy (called by getFiltered)
     fyReason(ad)       → { icon, text } reason chip for one listing
     fySummary()        → one-line "why you are seeing this"
     fySignals()        → ['❤️ 3 saved', …] chips for the explainer panel
     fySetMode(v)       → switch the home feed mode (remembers the choice)
     fyShuffle()        → re-roll the daily pick order
     fyToggleHow()      → open/close the explainer
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Storage ─────────────────────────────────────────────────────────────
     Three signals are READ ONLY here — they belong to js/recent.js and
     js/core.js and are never written from this file. The only key this module
     ever writes is ya_home_sort, a brand-new UI preference, so the feed can
     never overwrite habits already stored on a member's phone
     (tools/test-data-safety.js guards that promise). */
  var SORT_KEY   = 'ya_home_sort';
  var REROLL_KEY = 'ya_fy_reroll';          // sessionStorage: ephemeral, never on disk
  var VIEWS_KEY  = 'ya_recently_viewed';
  var FAVS_KEY   = 'ya_favs';
  var SEARCH_KEY = 'ya_searches';
  var MODES      = ['foryou', 'newest', 'price-lo', 'price-hi'];

  /* ── Ranking weights ─────────────────────────────────────────────────────
     Quality and affinity together outweigh freshness (1.35 + 1.00 vs 0.85),
     and jitter is deliberately smaller than any of them: the daily shuffle is
     a rotation of the tail, never a coin flip over which post leads. The
     relevance weight is larger than the whole base range on purpose — a
     search query must always outrank personalisation. */
  var W_QUALITY  = 1.35;   // photos, description, views, contactability
  var W_AFFINITY = 1.00;   // your own signals
  var W_FRESH    = 0.85;   // decayed recency
  var W_JITTER   = 0.35;   // deterministic daily rotation of the tail
  var W_RELEV    = 3.60;   // only ever used when there is a query
  var HALF_LIFE  = 7;      // days for freshness to halve
  var DAY1_BONUS = 0.22;   // "posted today" reads as full strength
  var VIEWED_X   = 0.62;   // you just opened it — the strip above already has it
  var SOLD_X     = 0.45;   // still listed, never leading
  var REPEAT_X   = 0.55;   // per extra copy of the same title + price from one seller

  /* ── Diversity (rule 2) ─────────────────────────────────────────────────── */
  var TOP_MIX    = 8;      // slots filled round-robin across categories
  var RANK_DEPTH = 200;    // feed positions worth diversifying (O(n²) guard)
  var P_CAT = 0.42, P_PARISH = 0.30, P_SELLER = 0.55;
  var P_CAT_FATIGUE = 0.05, P_SELLER_FATIGUE = 0.04;
  var WIN_SHORT = 3, WIN_SELLER = 6;

  /* ── Small helpers ──────────────────────────────────────────────────────── */
  function ls(k) {
    try { return (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || ''; }
    catch (e) { return ''; }
  }
  function isFn(f) { return typeof f === 'function'; }
  function clamp01(n) { return !isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
  function hash(str) {
    var h = 2166136261, i, s = String(str == null ? '' : str);
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    /* Final avalanche (MurmurHash3 fmix32). Plain FNV-1a diffuses a one
       character change (…|0 → …|1, i.e. every 🔀 shuffle) so weakly that all
       the draws move by the same tiny amount and the order barely budges —
       which is exactly what re-rolling must NOT do. */
    h ^= h >>> 16; h = (h * 2246822507) >>> 0;
    h ^= h >>> 13; h = (h * 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  function joinList(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, arr.length - 1).join(', ') + ' and ' + arr[arr.length - 1];
  }
  function catName(id) { if (typeof catById !== 'function') return ''; try { return (catById(id) || {}).name || ''; } catch (e) { return ''; } }
  function catIcon(id) { if (typeof catById !== 'function') return ''; try { return (catById(id) || {}).icon || ''; } catch (e) { return ''; } }
  function adOf(id) {
    if (!id) return null;
    if (typeof findAd === 'function') { try { return findAd(id) || null; } catch (e) {} }
    var list = (typeof _ads !== 'undefined' && _ads) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function viewCount(ad) {
    if (typeof getViews === 'function') { try { return getViews(ad.id) || 0; } catch (e) {} }
    return ad.views || 0;
  }
  function photoQty(ad) {
    if (ad.photos && ad.photos.length) return ad.photos.length;
    return ad.image ? 1 : 0;
  }
  function ageDays(ad, now) {
    var ts = (typeof ad._ts === 'number' && ad._ts) || 0;
    if (!ts) { try { ts = ad.date ? Date.parse(ad.date) || 0 : 0; } catch (e) { ts = 0; } }
    if (!ts) return 365;
    return Math.max(0, (now - ts) / 86400000);
  }

  /* ── Words that carry no taste on their own ("for sale", "good", and every
        category / parish name) so a title token only means a brand, a model
        or an actual item. ─────────────────────────────────────────────────── */
  var STOP = (function () {
    var words = ('for sale used new good great nice best cheap lowest price free must go sell selling only ' +
      'very your any all one two three four five set pcs piece pieces bargain deal obo neg negotiable ' +
      'firm call whatsapp contact delivery pick up near mint clean excellent condition works working ' +
      'jamaica jmd style size large small medium original quality plus pro and the with from that this ' +
      'have has not but can will just like about around today tomorrow week weeks month months year ' +
      'years day days left urgent fast quick limited available ready brand affordable').split(/\s+/);
    var m = {}, i;
    for (i = 0; i < words.length; i++) m[words[i]] = 1;
    function eat(str) {
      String(str || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) { if (w) m[w] = 1; });
    }
    try { (typeof CATS !== 'undefined' ? CATS : []).forEach(function (c) { eat(c && c.name); }); } catch (e) {}
    try { (typeof PARISHES !== 'undefined' ? PARISHES : []).forEach(eat); } catch (e) {}
    return m;
  })();

  function tokensOf(title) {
    var out = [], parts = String(title || '').toLowerCase().split(/[^a-z0-9]+/), i, t;
    for (i = 0; i < parts.length && out.length < 6; i++) {
      t = parts[i];
      if (t.length < 3 || t.length > 18 || STOP[t] || /^\d+$/.test(t)) continue;
      if (out.indexOf(t) === -1) out.push(t);
    }
    return out;
  }
  function tokensOfAd(ad) {
    if (!ad._fyTok) ad._fyTok = tokensOf(ad.title);
    return ad._fyTok;
  }
  function hayOf(ad) {
    if (ad._hay && ad._hay.all) return ad._hay.all;
    return [ad.title, ad.desc, ad.parish, catName(ad.category)].join(' ').toLowerCase();
  }
  function bandOf(price) {
    var p = Number(price) || 0;
    if (p <= 0) return 'free';
    if (p < 25000) return 'b1';
    if (p < 100000) return 'b2';
    if (p < 500000) return 'b3';
    if (p < 2000000) return 'b4';
    return 'b5';
  }
  function normTitle(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function dupeKey(ad) {
    return (ad.sellerId || ad.seller || '') + '|' + normTitle(ad.title) + '|' + (Number(ad.price) || 0);
  }

  /* ═══ PROFILE — what this device has told us about its owner ═════════════ */
  var _prof = null, _profSig = '';
  function profileSig() { return ls(VIEWS_KEY) + '¦' + ls(FAVS_KEY) + '¦' + ls(SEARCH_KEY); }
  function profile() {
    var s = profileSig();
    if (_prof && s === _profSig) return _prof;   // one read per render, not per ad
    _profSig = s;
    _prof = buildProfile();
    return _prof;
  }
  function parseList(raw) {
    try { var v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function bump(map, k, w) { if (k == null || k === '') return; map[k] = (map[k] || 0) + w; }
  function tally(p, ad, w) {
    bump(p.cats, ad.category, w);
    bump(p.parishes, ad.parish, w);
    bump(p.bands, bandOf(ad.price), w * 0.8);
    if (ad.sellerId) bump(p.sellers, ad.sellerId, w * 0.5);
    p.seen[ad.id] = 1;
    var toks = tokensOf(ad.title), i;
    for (i = 0; i < toks.length; i++) bump(p.words, toks[i], w);
  }
  function buildProfile() {
    var p = {
      cats: {}, parishes: {}, bands: {}, sellers: {}, words: {}, terms: {}, seen: {},
      viewed: 0, saved: 0, searched: 0, signals: 0,
      topCat: '', topParish: '', topWord: '', termKeys: []
    };
    var recent = parseList(ls(VIEWS_KEY));
    var favs = parseList(ls(FAVS_KEY));
    var searches = parseList(ls(SEARCH_KEY));
    var i, ad, w, q, terms, ti, t;

    for (i = 0; i < recent.length; i++) {
      ad = adOf(recent[i]);
      if (!ad) continue;
      w = (recent.length - i) / recent.length;   // the last thing you opened counts most
      tally(p, ad, w);
      p.viewed++;
    }
    for (i = 0; i < favs.length; i++) {
      ad = adOf(favs[i]);
      if (!ad) continue;
      tally(p, ad, 2);                           // ❤️ saving a listing is the strongest signal
      p.saved++;
    }
    for (i = 0; i < searches.length; i++) {
      q = String(searches[i] || '').toLowerCase().trim();
      if (q.length < 3 || q.length > 40) continue;
      p.searched++;
      terms = q.split(/[^a-z0-9]+/);
      for (ti = 0; ti < terms.length; ti++) {
        t = terms[ti];
        if (t.length < 3 || STOP[t]) continue;
        p.terms[t] = (p.terms[t] || 0) + 1.1;
      }
    }
    scale(p.cats); scale(p.parishes); scale(p.bands); scale(p.sellers); scale(p.terms);
    /* A title word has to show up twice before we call it an interest — one
       stray "civic" in one title is not a taste. */
    p.words = scale(p.words, 2);
    p.termKeys = Object.keys(p.terms)
      .sort(function (a, b) { return p.terms[b] - p.terms[a]; })
      .slice(0, 12);
    var kCat = topKey(p.cats), kWord = topKey(p.words);
    p.topCat = kCat ? catName(kCat) : '';
    p.topParish = topKey(p.parishes);
    p.topWord = kWord;
    p.signals = p.viewed + p.saved + p.searched;
    return p;
  }
  /* Every map ends up 0…1 so the weights above are the only thing that
     decides how much each signal is worth. */
  function scale(map, minCount) {
    var k, max = 0;
    for (k in map) if (map[k] > max) max = map[k];
    if (!max) return map;
    for (k in map) {
      if (minCount && map[k] < minCount) delete map[k];
      else map[k] = map[k] / max;
    }
    return map;
  }
  function topKey(map) {
    var k, best = '', bv = 0;
    for (k in map) if (map[k] > bv) { bv = map[k]; best = k; }
    return best;
  }

  /* ═══ SCORING ════════════════════════════════════════════════════════════ */

  /* Rule 1's other half: a listing is judged on what a buyer can actually
     use — photos, a real description, real views, a way to make contact. */
  function qualityOf(ad) {
    var q = 0.30;
    q += Math.min(1, Math.log(viewCount(ad) + 1) / Math.log(250)) * 0.90;  // attention is evidence
    var photos = photoQty(ad);
    q += photos >= 4 ? 0.42 : photos >= 2 ? 0.28 : photos === 1 ? 0.10 : -0.30;
    var d = (ad.desc || '').length;
    q += d >= 300 ? 0.38 : d >= 100 ? 0.24 : d >= 30 ? 0.10 : -0.18;
    if (ad.phone) q += 0.12;
    if (ad.neg) q += 0.08;
    var t = String(ad.title || '').trim();
    if (t.length >= 12 && t.length <= 72) q += 0.10;
    else if (t.length < 5) q -= 0.25;
    return clamp01(q / 2.30);
  }

  /* Recency as a curve, not a key: 1.0 today, ~0.5 at a week, ~0.25 at two
     weeks, ~0.05 at a month. Nothing ever drops out of the feed. */
  function freshOf(ad, now) {
    var age = ageDays(ad, now);
    var f = Math.pow(0.5, age / HALF_LIFE);
    if (age < 1) f = Math.min(1, f + DAY1_BONUS);
    return clamp01(f);
  }

  function brandMatch(ad, p) {
    var toks = tokensOfAd(ad), i, v, best = 0;
    for (i = 0; i < toks.length; i++) {
      v = p.words[toks[i]];
      if (v && v > best) best = v;
    }
    return best;
  }
  function termMatch(ad, p) {
    if (!p.termKeys.length) return 0;
    var hay = hayOf(ad), i, v, best = 0;
    for (i = 0; i < p.termKeys.length; i++) {
      if (hay.indexOf(p.termKeys[i]) !== -1) {
        v = p.terms[p.termKeys[i]];
        if (v > best) best = v;
      }
    }
    return best;
  }
  /* The only part of the order that comes from the member rather than the
     listing. Every map is 0…1, so the weights are the whole story. */
  function affinityOf(ad, p) {
    if (!p) return 0;
    var s = 2.20 * (p.cats[ad.category] || 0)
          + 1.30 * (p.parishes[ad.parish] || 0)
          + 1.00 * brandMatch(ad, p)
          + 0.90 * (p.bands[bandOf(ad.price)] || 0)
          + 0.70 * termMatch(ad, p)
          + 0.40 * (ad.sellerId ? (p.sellers[ad.sellerId] || 0) : 0);
    return clamp01(s / 6.50);
  }

  /* ── The daily shuffle seed ──────────────────────────────────────────────
     Deterministic inside a session (so scroll-to-append can never reshuffle
     cards already on screen) and different every day (so the long tail gets
     its turn instead of one order settling forever). 🔀 Shuffle picks
     re-rolls it on demand. */
  var reroll = 0, _seed = '';
  try { if (typeof sessionStorage !== 'undefined') reroll = Number(sessionStorage.getItem(REROLL_KEY)) || 0; } catch (e) {}
  function dayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function seedKey() { if (!_seed) _seed = dayKey() + '|' + reroll; return _seed; }
  function jitterOf(id) { return hash(id + '|' + seedKey()) / 4294967296; }

  function scoreAll(list, p, opts, now) {
    var rel = opts && isFn(opts.relevance) ? opts.relevance : null;
    var i, j, relMax = 0, rv;
    if (rel) {
      for (i = 0; i < list.length; i++) {
        rv = Number(rel(list[i])) || 0;
        list[i]._fyRel = rv;                 // scored once per render, reused below
        if (rv > relMax) relMax = rv;
      }
    }
    var repeat = {}, ad, key, s;
    for (j = 0; j < list.length; j++) {
      ad = list[j];
      key = dupeKey(ad);
      repeat[key] = (repeat[key] || 0) + 1;
      s = W_QUALITY  * qualityOf(ad)
        + W_AFFINITY * affinityOf(ad, p)
        + W_FRESH    * freshOf(ad, now)
        + W_JITTER   * jitterOf(ad.id);
      if (rel && relMax > 0) s += W_RELEV * ((ad._fyRel || 0) / relMax);
      if (p && p.seen[ad.id]) s *= VIEWED_X;                        // just viewed — it is in the strip above
      if (ad.status === 'sold') s *= SOLD_X;                        // still listed, never leading
      if (repeat[key] > 1) s *= Math.pow(REPEAT_X, repeat[key] - 1); // same seller, same title, same price
      ad._fy = s;
    }
    return list;
  }

  /* Rule 2 in code. Phase 1 spreads the TOP_MIX best slots across categories
     (round-robin, best of each category first) so no single category — or one
     very fast poster — can own the top of the page. Phase 2 then fills the
     rest greedily, penalising whatever category / parish / seller just
     appeared. Phase 1 is skipped when there is a query: relevance leads. */
  function diversify(list, searching) {
    if (list.length < 8) return list;
    var pool = list.slice(0, RANK_DEPTH);
    var out = [], i, k, ad;
    var catWin = [], parWin = [], selWin = [];
    var catCount = {}, selCount = {};

    function inWindow(win, val) {
      if (val == null || val === '') return 0;
      var n = 0, w;
      for (w = 0; w < win.length; w++) if (win[w] === val) n++;
      return n;
    }
    function pushWindow(win, val, size) {
      if (val == null || val === '') return;
      win.push(val);
      while (win.length > size) win.shift();
    }
    function take(a) {
      out.push(a);
      pushWindow(catWin, a.category, WIN_SHORT);
      pushWindow(parWin, a.parish, WIN_SHORT);
      pushWindow(selWin, a.sellerId, WIN_SELLER);
      catCount[a.category] = (catCount[a.category] || 0) + 1;
      if (a.sellerId) selCount[a.sellerId] = (selCount[a.sellerId] || 0) + 1;
    }

    if (!searching) {
      var buckets = {}, order = [];
      for (i = 0; i < pool.length; i++) {
        ad = pool[i];
        k = ad.category || 'other';
        if (!buckets[k]) { buckets[k] = []; order.push(k); }
        buckets[k].push(ad);
      }
      order.sort(function (a, b) { return buckets[b][0]._fy - buckets[a][0]._fy; });
      var slots = 0, moved = true, guard = 0;
      while (slots < TOP_MIX && moved && guard++ < TOP_MIX + 2) {
        moved = false;
        for (k = 0; k < order.length && slots < TOP_MIX; k++) {
          ad = buckets[order[k]].shift();
          if (!ad) continue;
          take(ad);
          slots++;
          moved = true;
        }
      }
      var taken = {};
      for (i = 0; i < out.length; i++) taken[out[i].id] = 1;
      var rest = [];
      for (i = 0; i < pool.length; i++) if (!taken[pool[i].id]) rest.push(pool[i]);
      pool = rest;
    }

    while (pool.length) {
      var best = 0, bestScore = -Infinity, sc;
      for (i = 0; i < pool.length; i++) {
        ad = pool[i];
        sc = ad._fy
          - P_CAT * inWindow(catWin, ad.category)
          - P_PARISH * inWindow(parWin, ad.parish)
          - P_SELLER * inWindow(selWin, ad.sellerId)
          - P_CAT_FATIGUE * (catCount[ad.category] || 0)
          - P_SELLER_FATIGUE * (ad.sellerId ? (selCount[ad.sellerId] || 0) : 0);
        if (sc > bestScore + 1e-9) { bestScore = sc; best = i; }
      }
      take(pool.splice(best, 1)[0]);
    }
    for (i = RANK_DEPTH; i < list.length; i++) out.push(list[i]);   // deep tail keeps base order
    return out;
  }

  /* ── fyRank — the whole pipeline, called by getFiltered() ──────────────── */
  function fyRank(ads, opts) {
    if (!Array.isArray(ads)) return [];
    var copy = ads.slice();
    if (copy.length < 2) return copy;
    var now = Date.now();
    var p = profile();
    scoreAll(copy, p, opts || {}, now);
    copy.sort(function (a, b) {
      if (b._fy !== a._fy) return b._fy - a._fy;
      return String(a.id) < String(b.id) ? -1 : 1;   // stable, deterministic ties
    });
    return diversify(copy, !!(opts && isFn(opts.relevance)));
  }

  /* ═══ WHY AM I SEEING THIS? ═════════════════════════════════════════════
     One honest line per card. Each chip is the strongest signal that actually
     fired for that listing — never a guessed reason, never a duplicate of the
     chip above it. */
  var GENERIC = [
    { icon: '🧭', text: 'Worth a look' },
    { icon: '🆕', text: 'Fresh find' },
    { icon: '🎯', text: 'Picked for you' },
    { icon: '🌈', text: 'Something different' },
    { icon: '🗺️', text: 'From across the island' },
    { icon: '🛒', text: 'Ready to go' }
  ];
  function topTermIn(ad, p) {
    if (!p.termKeys.length) return '';
    var hay = hayOf(ad), i, best = '', bv = 0;
    for (i = 0; i < p.termKeys.length; i++) {
      if (hay.indexOf(p.termKeys[i]) !== -1 && p.terms[p.termKeys[i]] > bv) {
        bv = p.terms[p.termKeys[i]];
        best = p.termKeys[i];
      }
    }
    return best;
  }
  function topWordIn(ad, p) {
    var toks = tokensOfAd(ad), i, v, best = '', bv = 0;
    for (i = 0; i < toks.length; i++) {
      v = p.words[toks[i]];
      if (v && v > bv) { bv = v; best = toks[i]; }
    }
    return best;
  }
  function reasonOf(ad, p) {
    var now = Date.now(), w, c, t, ph, v;
    if (p) {
      w = topWordIn(ad, p);
      if (w) return { icon: '🔎', text: 'More like “' + w + '”' };
      c = p.cats[ad.category];
      if (c >= 0.5 && catName(ad.category)) return { icon: '❤️', text: 'Because you like ' + catName(ad.category) };
      if ((p.parishes[ad.parish] || 0) >= 0.5) return { icon: '📍', text: 'Because you browse ' + ad.parish };
      t = topTermIn(ad, p);
      if (t) return { icon: '🔍', text: 'You searched “' + t + '”' };
      if ((p.bands[bandOf(ad.price)] || 0) >= 0.6) return { icon: '💰', text: 'In your usual price range' };
      if (ad.sellerId && (p.sellers[ad.sellerId] || 0) >= 0.6) return { icon: '👤', text: 'A seller you looked at before' };
    }
    v = viewCount(ad);
    if (v >= 80) return { icon: '🔥', text: 'Popular this week' };
    if (v >= 30) return { icon: '👀', text: 'Lots of people looked' };
    if (ageDays(ad, now) < 1) return { icon: '✨', text: 'Just posted today' };
    ph = photoQty(ad);
    if (ph >= 3) return { icon: '📷', text: ph + ' photos to check' };
    return GENERIC[hash(ad.id) % GENERIC.length];
  }

  /* ═══ PUBLIC SURFACE (window.*) ═════════════════════════════════════════ */
  window.fyRank = fyRank;
  window.fyReason = function (ad) { return ad ? reasonOf(ad, profile()) : null; };
  window.fySummary = function () {
    var p = profile(), bits = [];
    if (p.topWord) bits.push('“' + p.topWord + '”');
    if (p.topCat) bits.push(p.topCat);
    if (p.topParish) bits.push(p.topParish);
    if (!bits.length && p.searched) bits.push('your recent searches');
    if (!bits.length) return 'New here? Fresh posts, popular picks and every category — not just the newest.';
    return 'Tuned to ' + joinList(bits) + ' — ranked on your phone, never uploaded.';
  };
  window.fySignals = function () {
    var p = profile(), out = [];
    if (p.saved) out.push('❤️ ' + p.saved + ' saved');
    if (p.viewed) out.push('👁️ ' + p.viewed + ' viewed');
    if (p.searched) out.push('🔍 ' + p.searched + (p.searched === 1 ? ' search' : ' searches'));
    return out;
  };

  /* ═══ UI — the bar, the chips, the explainer ═════════════════════════════ */
  function el(id) {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    return document.getElementById(id);
  }
  function currentMode() {
    var sel = el('homeSortSel');
    var v = sel ? String(sel.value || '') : '';
    if (MODES.indexOf(v) === -1) v = ls(SORT_KEY);
    if (MODES.indexOf(v) === -1) v = 'foryou';
    return v;
  }
  function saveMode(v) {
    if (MODES.indexOf(v) === -1) return;
    /* The key is spelled out instead of using SORT_KEY on purpose: it makes
       the one write this module can ever perform visible to the data-safety
       guard (tools/test-data-safety.js) as a literal. */
    try { localStorage.setItem('ya_home_sort', v); } catch (e) {}
  }
  /* One remembered preference drives both sort boxes (home + browse), so they
     must never disagree: picking "Newest First" in one leaves the other
     showing For You, which reads as a bug. */
  function syncSelects(v) {
    if (MODES.indexOf(v) === -1) return;
    var sel = el('homeSortSel');
    if (sel && sel.value !== v) sel.value = v;
    var bsel = el('sortSel');
    if (bsel && MODES.indexOf(bsel.value) !== -1 && bsel.value !== v) bsel.value = v;
  }
  function resetFeed() {
    try {
      if (typeof _homeShowCount !== 'undefined' && typeof _homePageSize !== 'undefined') _homeShowCount = _homePageSize;
    } catch (e) {}
  }
  function repaintHome() { if (typeof renderHome === 'function') renderHome(); }

  var HOW_RULES = [
    ['Your own signals, on your phone', 'what you open, save and search tunes the order. Nothing about you is uploaded anywhere.'],
    ['Freshness fades', 'a post is at full strength on day one, about half at a week and about 5% at a month — so a good three-week-old listing can still outrank a thin post from this morning.'],
    ['Quality counts', 'real photos, a real description, views and a working phone number lift a listing. The newest post is not automatically the best.'],
    ['The top is always a mix', 'the first slots are shared out across categories, and no seller can take over the page.'],
    ['Daily shuffle', 'the order rotates every day so older posts get their turn. Nothing is ever hidden — every listing stays in the feed, and Newest First is one tap away.']
  ];

  function buildBar(bar) {
    if (bar._fyBuilt) return;
    bar._fyBuilt = true;
    var hd = document.createElement('div');
    hd.className = 'fy-hd';
    var badge = document.createElement('span');
    badge.className = 'fy-badge';
    badge.textContent = '✨ For You';
    var line = document.createElement('span');
    line.className = 'fy-line';
    var acts = document.createElement('div');
    acts.className = 'fy-actions';
    var shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'fy-btn';
    shuffle.textContent = '🔀 Shuffle picks';
    shuffle.setAttribute('aria-label', 'Shuffle the For You picks');
    shuffle.addEventListener('click', function () { window.fyShuffle(); });
    var how = document.createElement('button');
    how.type = 'button';
    how.className = 'fy-btn fy-btn-ghost';
    how.textContent = '❔ How this works';
    how.setAttribute('aria-expanded', 'false');
    how.setAttribute('aria-controls', 'fyPanel');
    how.addEventListener('click', function () { window.fyToggleHow(); });
    acts.appendChild(shuffle);
    acts.appendChild(how);
    hd.appendChild(badge);
    hd.appendChild(line);
    hd.appendChild(acts);
    var panel = document.createElement('div');
    panel.className = 'fy-panel';
    panel.id = 'fyPanel';
    panel.hidden = true;
    bar.appendChild(hd);
    bar.appendChild(panel);
    bar._fyLine = line;
    bar._fyPanel = panel;
    bar._fyHow = how;
  }

  function fillPanel(bar) {
    var panel = bar._fyPanel;
    if (!panel || panel._fyFilled) return;
    panel._fyFilled = true;
    var h = document.createElement('div');
    h.className = 'fy-panel-h';
    h.textContent = 'How your For You feed is built';
    panel.appendChild(h);
    var ul = document.createElement('ul');
    HOW_RULES.forEach(function (r) {
      var li = document.createElement('li');
      var lead = document.createElement('strong');
      lead.textContent = r[0] + ' — ';
      li.appendChild(lead);
      li.appendChild(document.createTextNode(r[1]));
      ul.appendChild(li);
    });
    panel.appendChild(ul);
    var sig = document.createElement('div');
    sig.className = 'fy-signals';
    sig.id = 'fySignalRow';
    panel.appendChild(sig);
    var foot = document.createElement('div');
    foot.className = 'fy-foot';
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'fy-btn';
    back.textContent = '🆕 Show Newest First instead';
    back.addEventListener('click', function () { window.fySetMode('newest', true); });
    var note = document.createElement('span');
    note.className = 'fy-note';
    note.textContent = 'Your choice is remembered on this device.';
    foot.appendChild(back);
    foot.appendChild(note);
    panel.appendChild(foot);
  }

  /* Rebuilt with DOM APIs only (never innerHTML) so a listing title can never
     ride into the bar as markup — the same rule js/site-updates.js follows. */
  function paintSignals(bar) {
    var row = bar._fyPanel && bar._fyPanel.querySelector('#fySignalRow');
    if (!row) return;
    var chips = window.fySignals();
    var key = chips.join('|');
    if (row._fyKey === key) return;
    row._fyKey = key;
    while (row.firstChild) row.removeChild(row.firstChild);
    var label = document.createElement('span');
    label.className = 'fy-note';
    label.textContent = chips.length ? 'In play right now:' : 'No signals yet — this feed is a mix of the whole island:';
    row.appendChild(label);
    chips.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'fy-sig';
      chip.textContent = c;
      row.appendChild(chip);
    });
  }

  /* The reason chips — the part that makes this a for-you PAGE and not just a
     hidden sort. Injected into the card body top, in visual order, never
     repeating the line directly above it, and idempotent so the append-only
     infinite-scroll path only decorates what it just added. */
  function decorate(grid) {
    var cards = grid.querySelectorAll('.ad-card');
    var p = profile(), lastText = '', i, card, body, chip, ad, r;
    for (i = 0; i < cards.length; i++) {
      card = cards[i];
      body = card.querySelector('.ad-card-body');
      if (!body) continue;
      chip = body.querySelector('.fy-chip');
      if (chip) { lastText = chip.textContent; continue; }   // already explained in this pass
      ad = adOf(card.getAttribute('data-id'));
      if (!ad) continue;
      r = reasonOf(ad, p);
      if (!r || r.text === lastText) continue;
      chip = document.createElement('div');
      chip.className = 'fy-chip';
      chip.textContent = r.icon + ' ' + r.text;
      body.insertBefore(chip, body.firstChild);
      lastText = chip.textContent;
    }
  }

  /* The bar's one-liner. During a search the ranking is relevance-led, so the
     line says that instead of claiming the feed is a personal selection. */
  function fyLineText() {
    var q = '';
    try { if (typeof searchQ !== 'undefined' && searchQ) q = String(searchQ); } catch (e) {}
    if (q) return 'Best matches for “' + q + '” first — then ranked for you.';
    return window.fySummary();
  }

  function paint() {
    var grid = el('homeGrid');
    var bar = el('fyBar');
    var on = currentMode() === 'foryou';
    if (grid && on) decorate(grid);
    if (!bar) return;
    if (!on) {
      bar.classList.remove('show');
      bar.setAttribute('aria-hidden', 'true');
      return;
    }
    buildBar(bar);
    bar._fyLine.textContent = fyLineText();
    if (bar._fyPanel && !bar._fyPanel.hidden) paintSignals(bar);
    bar.removeAttribute('aria-hidden');
    bar.classList.add('show');
  }

  function fySetMode(v, toTop) {
    if (MODES.indexOf(v) === -1) v = 'foryou';
    syncSelects(v);
    saveMode(v);
    resetFeed();
    repaintHome();
    if (toTop) {
      var bar = el('fyBar');
      if (bar && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: Math.max(0, bar.offsetTop - 90), behavior: 'smooth' });
      }
    }
  }

  function fyShuffle() {
    reroll++;
    _seed = '';                     // a brand-new order for the same listings
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(REROLL_KEY, String(reroll)); } catch (e) {}
    resetFeed();
    repaintHome();
    if (typeof showToast === 'function') showToast('Picked again — same island, new order 🔀', '🔀');
  }

  function fyToggleHow() {
    var bar = el('fyBar');
    if (!bar) return;
    buildBar(bar);
    fillPanel(bar);
    var open = bar._fyPanel.hidden;
    bar._fyPanel.hidden = !open;
    bar._fyHow.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) paintSignals(bar);
  }

  /* ═══ WIRING ════════════════════════════════════════════════════════════
     renderHome() is the single place the home grid is built, so wrapping it
     (the same chaining pattern js/recent.js uses) covers load, search, filter,
     sort, view switch and every infinite-scroll append. */
  function hookRender() {
    if (typeof renderHome !== 'function') { setTimeout(hookRender, 200); return; }
    var orig = window.renderHome;
    if (orig._fyHooked) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { paint(); } catch (e) { if (typeof console !== 'undefined') console.warn('[for-you] paint failed:', e && e.message); }
      return r;
    };
    wrapped._fyHooked = true;
    window.renderHome = wrapped;
  }

  function init() {
    _seed = '';
    var saved = MODES.indexOf(ls(SORT_KEY)) !== -1 ? ls(SORT_KEY) : 'foryou';
    /* Both sort selects default to ✨ For You (the markup ships that option
       first) and remember whatever the member picks instead. */
    var sel = el('homeSortSel');
    if (sel) {
      sel.value = saved;
      sel.addEventListener('change', function () { saveMode(sel.value); syncSelects(sel.value); });
    }
    var bsel = el('sortSel');
    if (bsel) {
      bsel.value = saved;
      bsel.addEventListener('change', function () { saveMode(bsel.value); syncSelects(bsel.value); });
    }
    hookRender();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(paint, 600); });
    } else {
      setTimeout(paint, 600);
    }
  }

  window.fySetMode = fySetMode;
  window.fyShuffle = fyShuffle;
  window.fyToggleHow = fyToggleHow;

  /* Browsers only — the ranking core above stays runnable headless, which is
     how tools/test-for-you.js proves the rules without a DOM. */
  if (typeof document !== 'undefined' && document.getElementById && document.createElement) init();
})();
