/* ── FOR YOU unit tests (run: node tools/test-for-you.js) ──
   Proves the ranked feed (js/for-you.js) keeps its promises with no browser,
   no DOM and no network:

     1. NOTHING IS HIDDEN       — every listing stays, only the order changes
     2. THE NEWEST CANNOT LEAD  — a strong 3-week-old listing beats a thin post
                                  from this morning, in every category
     3. THE TOP IS ALWAYS A MIX — no category and no seller takes over the page
     4. A QUERY LEADS           — search relevance outranks personalisation
     plus: the member's own signals really do change the order, the order is
     stable inside a session, 🔀 shuffle re-rolls it, and loading the module
     writes NOTHING to device storage (tools/test-data-safety.js relies on it).

   Harness: the module is plain top-level script code (window.* assignments and
   typeof-guarded globals only), so it runs in a bare vm context with a fake
   window + localStorage and the app's catById/findAd/getViews stubbed. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0, passes = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok ? '' : ' — ' + JSON.stringify(extra === undefined ? '' : extra)));
  ok ? passes++ : failures++;
}

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'for-you.js'), 'utf8');

const CATS = [
  { id: 'vehicles', name: 'Vehicles', icon: '🚗' },
  { id: 'electronics', name: 'Electronics', icon: '📱' },
  { id: 'property', name: 'Property', icon: '🏠' },
  { id: 'furniture', name: 'Furniture', icon: '🛋️' },
];
const PARISHES = ['Kingston', 'St. Ann', 'St. Mary', 'Manchester'];
const DAY = 86400000;
const NOW = Date.now();
const iso = days => new Date(NOW - days * DAY).toISOString();

function makeStorage(seed) {
  const data = Object.assign({}, seed || {});
  const writes = [];
  return {
    data: data, writes: writes,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { writes.push(k); data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); }
  };
}

/* Loads js/for-you.js exactly the way index.html does — as a plain script in a
   shared global scope — and hands back the sandbox so the fake ad list can be
   swapped between cases. */
function loadApp(seed) {
  const store = makeStorage(seed);
  const ctx = {
    window: {},
    localStorage: store,
    sessionStorage: makeStorage(),
    CATS: CATS,
    PARISHES: PARISHES,
    _ads: [],
    catById: id => CATS.filter(c => c.id === id)[0] || { id: id, name: 'Other', icon: '📦' },
    findAd: id => ctx._ads.filter(a => a.id === id)[0] || null,
    getViews: id => {                       // resolves an ID, exactly like js/search-ai.js getViews()
      const found = ctx._ads.filter(a => a.id === id)[0];
      return found ? (found.views || 0) : 0;
    },
    console: console
  };
  ctx.window.console = console;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'js/for-you.js' });
  ctx.store = store;
  return ctx;
}

let seq = 0;
function ad(o) {
  const merged = Object.assign({
    id: 'a' + (++seq), title: 'Item for sale', price: 50000, parish: 'Kingston',
    category: 'furniture', desc: '', image: '', photos: [], seller: 'Seller',
    sellerId: '', phone: '', neg: false, date: iso(3), status: 'active', views: 0
  }, o || {});
  /* Every fixture title gets its id appended: the anti-spam rule deliberately
     demotes a seller's repeats of the SAME title + price, and identical fake
     titles would otherwise trip it all over these cases. */
  merged.title = merged.title + ' ' + merged.id;
  return merged;
}
/* A listing a buyer can actually use: photos, a real description, views, a
   phone number. */
function strong(o) {
  return ad(Object.assign({
    title: 'Toyota Vitz 2014 clean', desc: 'x'.repeat(320), image: 'p.jpg',
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'], phone: '8765551234', views: 220
  }, o || {}));
}
/* Posted this morning with nothing else going for it. */
function thin(o) {
  return ad(Object.assign({ title: 'thing', desc: '', image: '', views: 0, date: iso(0.2) }, o || {}));
}
const ids = list => list.map(a => a.id).join(',');
const at = (list, id) => list.map(a => a.id).indexOf(id);
const newestFirst = list => list.slice().sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

/* ═══ 1 + 2 — nothing hidden, and the newest cannot win by default ══════ */
(function () {
  const app = loadApp();
  const list = [];
  CATS.forEach((c, ci) => {
    list.push(strong({ id: 'old' + ci, category: c.id, parish: PARISHES[ci], date: iso(21 + ci) }));
    list.push(thin({ id: 'new' + ci, category: c.id, parish: PARISHES[ci] }));
  });
  app._ads = list;
  const ranked = app.window.fyRank(list, null);

  check('every listing stays in the feed — order is the only thing that changes',
    ranked.length === list.length && list.every(a => at(ranked, a.id) > -1));
  check('the first slots are the strong older listings, not today\'s posts',
    ranked.slice(0, 4).every(a => String(a.id).indexOf('old') === 0), ids(ranked.slice(0, 4)));
  const perCat = CATS.every((c, ci) =>
    at(ranked, 'old' + ci) > -1 && at(ranked, 'new' + ci) > -1 && at(ranked, 'old' + ci) < at(ranked, 'new' + ci));
  check('in every category the strong 3-week-old listing outranks the thin new one', perCat);
  check('the result is not simply newest-first', ids(ranked) !== ids(newestFirst(list)));
})();

/* ═══ 3 — the top of the feed is a mix ═════════════════════════════════ */
(function () {
  const app = loadApp();
  const list = [];
  for (let i = 0; i < 10; i++) {
    list.push(strong({
      id: 'flood' + i, category: 'vehicles', parish: 'Kingston', sellerId: 'S1',
      seller: 'Flooder', title: 'Toyota Vitz ' + i, price: 900000 + i, date: iso(1)
    }));
  }
  CATS.slice(1).forEach((c, ci) => {
    for (let i = 0; i < 3; i++) {
      list.push(strong({
        id: 'other' + ci + '_' + i, category: c.id, parish: PARISHES[ci + 1],
        sellerId: 'S' + (ci + 2) + '_' + i, title: 'Nice ' + c.name + ' ' + i,
        price: 30000 + i, date: iso(9)
      }));
    }
  });
  app._ads = list;
  const ranked = app.window.fyRank(list, null);

  check('a 19-ad feed still shows all 19', ranked.length === 19);
  check('the first 4 slots cover 4 different categories',
    new Set(ranked.slice(0, 4).map(a => a.category)).size === 4, ranked.slice(0, 4).map(a => a.category));
  const s1Top = ranked.slice(0, 6).filter(a => a.sellerId === 'S1').length;
  check('one seller cannot take the top of the page (≤2 in the first 6)', s1Top <= 2, s1Top);
  const s1Ten = ranked.slice(0, 10).filter(a => a.sellerId === 'S1').length;
  check('the 10-ad flood is spread down the feed, never clustered at the top', s1Ten <= 3, s1Ten);
  check('the flooded listings are all still present (pushed down, never deleted)',
    list.filter(a => a.sellerId === 'S1').every(a => at(ranked, a.id) > -1));
})();

/* ═══ 4 — the member's own signals ═════════════════════════════════════ */
(function () {
  const favSource = ad({ id: 'fav1', category: 'furniture', parish: 'Kingston', price: 40000, title: 'Desk', image: 'p.jpg', date: iso(6) });
  const twinA = ad({ id: 'twinA', category: 'furniture', parish: 'Kingston', price: 40000, title: 'Twin alpha', image: 'p.jpg', desc: 'z'.repeat(150), views: 30, date: iso(20) });
  const twinB = ad({ id: 'twinB', category: 'electronics', parish: 'St. Ann', price: 5000000, title: 'Twin beta', image: 'p.jpg', desc: 'z'.repeat(150), views: 30, date: iso(20) });
  const filler = CATS.map((c, ci) => thin({ id: 'fill' + ci, category: c.id, parish: PARISHES[ci] }));

  const cold = loadApp();
  cold._ads = [favSource, twinA, twinB].concat(filler);
  const coldRank = cold.window.fyRank(cold._ads, null);

  const app = loadApp({ ya_favs: JSON.stringify(['fav1']), ya_recently_viewed: JSON.stringify(['fav1']) });
  app._ads = [favSource, twinA, twinB].concat(filler);
  const warmRank = app.window.fyRank(app._ads, null);

  /* The twin pair has identical quality and age, and the feed's mix rule keeps
     categories interleaved, so the honest test of personalisation is the score
     the tagger gave each twin — and the favourite's own listing rising. */
  check('a ❤️ saved listing lifts its own category + parish above an identical twin',
    twinA._fy > twinB._fy + 0.2, { A: twinA._fy, B: twinB._fy });
  check('the order changes once the member has signals', ids(coldRank) !== ids(warmRank));

  const rA = app.window.fyReason(twinA);
  const rB = app.window.fyReason(twinB);
  check('the reason chip names the category you like', rA && /Because you like Furniture/.test(rA.text), rA);
  check('a listing with no signal gets an honest, non-personal reason',
    rB && !/Because you|You searched/.test(rB.text), rB);
  check('fySignals reports what is in play',
    JSON.stringify(app.window.fySignals()) === JSON.stringify(['❤️ 1 saved', '👁️ 1 viewed']),
    app.window.fySignals());
  check('fySummary names the taste it is tuned to',
    /furniture|kingston|desk/i.test(app.window.fySummary()), app.window.fySummary());
  check('fySummary is honest on a cold start',
    /New here\?/.test(cold.window.fySummary()), cold.window.fySummary());
})();

/* ═══ 5 — a query always leads ═════════════════════════════════════════ */
(function () {
  const app = loadApp({ ya_favs: JSON.stringify(['best0']) });
  const list = [];
  CATS.forEach((c, ci) => {
    list.push(strong({ id: 'best' + ci, category: c.id, parish: PARISHES[ci], date: iso(0.2), views: 900 }));
    list.push(thin({ id: 'meh' + ci, category: c.id, parish: PARISHES[ci], date: iso(40) }));
  });
  app._ads = list;
  const ranked = app.window.fyRank(list, { relevance: a => (a.id === 'meh1' ? 10 : 1) });
  check('search relevance outranks personalisation and freshness',
    ranked[0].id === 'meh1', ranked[0] && ranked[0].id);
  check('relevance ranking still keeps every listing', ranked.length === list.length);
})();

/* ═══ 6 — sold posts are pushed down, never removed ════════════════════ */
(function () {
  const app = loadApp();
  const soldGreat = strong({ id: 'sold1', category: 'electronics', status: 'sold', date: iso(0.1), views: 400 });
  const active = strong({ id: 'active1', category: 'furniture', date: iso(2) });
  const others = CATS.map((c, ci) => strong({ id: 'o' + ci, category: c.id, parish: PARISHES[ci], date: iso(4) }));
  app._ads = [soldGreat, active].concat(others);
  const ranked = app.window.fyRank(app._ads, null);
  check('a sold listing never leads the feed', ranked[0].id !== 'sold1', ids(ranked.slice(0, 3)));
  check('the sold listing is still in the feed', at(ranked, 'sold1') > -1);
  check('an active listing leads instead', ranked[0].status !== 'sold');
})();

/* ═══ 7 — determinism + 🔀 shuffle ═════════════════════════════════════ */
(function () {
  const app = loadApp();
  const list = [];
  CATS.forEach((c, ci) => {
    for (let i = 0; i < 5; i++) {
      list.push(ad({ id: 'same' + ci + '_' + i, category: c.id, parish: PARISHES[i % 4], title: 'Same ' + c.name + i }));
    }
  });
  app._ads = list;
  const once = ids(app.window.fyRank(list, null));
  const twice = ids(app.window.fyRank(list, null));
  check('the same session always returns the same order (a scroll never reshuffles cards)', once === twice);

  const before = {};
  list.forEach(a => { before[a.id] = a._fy; });
  app.window.fyShuffle();
  const shuffled = ids(app.window.fyRank(list, null));
  check('🔀 shuffle gives every listing a fresh draw', list.every(a => a._fy !== before[a.id]));
  check('🔀 shuffle re-rolls the visible order', shuffled !== once);
  check('shuffle keeps every listing', shuffled.split(',').length === list.length);
})();

/* ═══ 8 — the module writes nothing to the device ══════════════════════ */
(function () {
  const app = loadApp({ ya_favs: JSON.stringify(['fav1']), ya_searches: JSON.stringify(['toyota']) });
  app._ads = [strong({ id: 'fav1' }), thin({ id: 't' })];
  app.window.fyRank(app._ads, null);
  app.window.fyReason(app._ads[0]);
  app.window.fySummary();
  app.window.fySignals();
  check('ranking, reasons and summary never touch localStorage', app.store.writes.length === 0, app.store.writes);
  check('ya_home_sort is the only key this module can write',
    /'ya_home_sort'/.test(SRC) && !/localStorage\.removeItem|localStorage\.clear/.test(SRC));
})();

console.log('\n' + (failures === 0
  ? 'FOR-YOU: ALL ' + passes + ' CHECKS PASSED'
  : 'FOR-YOU: ' + failures + ' CHECK(S) FAILED (' + passes + ' passed)'));
process.exit(failures === 0 ? 0 : 1);
