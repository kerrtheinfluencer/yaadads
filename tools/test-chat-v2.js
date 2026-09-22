/* ── AI CHAT v2 unit tests (run: node tools/test-chat-v2.js) ──
   Proves the pure conversational core (js/ai-chat-v2.js) behaves:
   ordinal resolution, intent classification, pool analytics, value
   scoring, price advice, refinement filters and follow-up chips.
   100% local — the module under test makes zero network calls.       */
const A = require('../js/ai-chat-v2.js');

let failures = 0, passes = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok ? '' : ' — ' + (extra === undefined ? '' : JSON.stringify(extra))));
  ok ? passes++ : failures++;
}
function eq(name, got, want) { check(name, got === want, { got: got, want: want }); }

const NOW = new Date('2026-09-17T12:00:00Z').getTime();
function ad(o) {
  return Object.assign({ id: 'a' + Math.random(), title: 'Item', price: 100000, parish: 'Kingston',
    category: 'electronics', desc: 'Nice item', seller: 'Seller', date: '2026-09-16', status: 'active', neg: false, views: 10 }, o || {});
}
const LIST = [
  ad({ id: 'a1', price: 80000, date: '2026-09-17', neg: true, views: 90, image: 'img1.jpg' }),
  ad({ id: 'a2', price: 120000, date: '2026-09-14' }),
  ad({ id: 'a3', price: 200000, date: '2026-08-01', neg: true }),
  ad({ id: 'a4', price: 90000, date: '2026-09-15', image: 'img4.jpg' }),
  ad({ id: 'a5', price: 70000, date: '2026-09-10', status: 'sold' })
];

/* 1 — ordinal resolution */
eq('ordinalIndex: "the second one"', A.ordinalIndex('the second one'), 1);
eq('ordinalIndex: "#3"', A.ordinalIndex('#3'), 2);
eq('ordinalIndex: "3rd"', A.ordinalIndex('3rd'), 2);
eq('ordinalIndex: "open 2"', A.ordinalIndex('open 2'), 1);
eq('ordinalIndex: "show the first one"', A.ordinalIndex('show the first one'), 0);
eq('ordinalIndex: "the last one"', A.ordinalIndex('the last one'), A.LAST);
eq('ordinalIndex: no ordinal', A.ordinalIndex('cheap laptop kingston'), -1);
eq('ordinalIndex: bare price is not an ordinal', A.ordinalIndex('under 80000'), -1);
eq('resolveIndex: LAST', A.resolveIndex(A.LAST, 5), 4);
eq('resolveIndex: out of range', A.resolveIndex(9, 5), -1);
eq('ordinalList: "first and third"', JSON.stringify(A.ordinalList('compare the first and third')), JSON.stringify([0, 2]));

/* 2 — classification */
const state = { results: LIST.filter(x => x.status !== 'sold') };
eq('classify: fresh search stays a search', A.classify('iphone under 80000', state).intent, 'search');
eq('classify: patois search stays a search', A.classify('mi waan a criss phone fi likkle money', state).intent, 'search');
eq('classify: "2" with results', A.classify('2', state).intent, 'open_pick');
eq('classify: "the second one" with results', A.classify('the second one', state).intent, 'open_pick');
eq('classify: "the last one" index resolves', A.classify('the last one', state).index, state.results.length - 1);
eq('classify: ordinal out of range falls back to search', A.classify('the ninth one', state).intent, 'search');
eq('classify: detail', A.classify('tell me more about the first one', state).intent, 'detail');
eq('classify: best pick', A.classify('which one is best?', state).intent, 'best_pick');
eq('classify: compare (explicit pair)', JSON.stringify(A.classify('compare the first and second', state).indices), JSON.stringify([0, 1]));
eq('classify: compare (default pair)', JSON.stringify(A.classify('compare them', state).indices), JSON.stringify([0, 1]));
eq('classify: cheaper than pick', A.classify('anything cheaper than the first one', state).intent, 'cheaper_than');
eq('classify: price advice', A.classify('is this a good deal', state).intent, 'price_advice');
eq('classify: why pick', A.classify('why is that the best?', state).intent, 'explain_pick');
eq('classify: photos only', A.classify('only ones with photos', state).intent, 'photos_only');
eq('classify: negotiable only', A.classify('only negotiable ones', state).intent, 'negotiable_only');
eq('classify: same parish', A.classify('only in the same parish', state).intent, 'same_parish');
eq('classify: new chat', A.classify('new chat', state).intent, 'new_chat');
eq('classify: help', A.classify('help', state).intent, 'help');
eq('classify: greeting', A.classify('wah gwaan', state).intent, 'greeting');
eq('classify: empty', A.classify('', state).intent, 'empty');
check('classify: nothing hijacks a search when no results yet',
  ['the second one', 'compare them', 'which is best', '2'].every(q => A.classify(q, { results: [] }).intent === 'search'));

/* 3 — pool analytics */
const stats = A.analyzePool(LIST);
eq('analyzePool: sold listings excluded', stats.count, 4);
eq('analyzePool: median of [80k,90k,120k,200k]', stats.median, 105000);

/* 4 — value scoring + best pick */
const best = A.bestPick(LIST, stats, NOW);
check('bestPick: returns a pick with reasons', !!(best && best.pick && best.pick.ad && best.pick.reasons.length), best && best.pick && best.pick.ad && best.pick.ad.id);
check('bestPick: fresh+negotiable+below-median ad ranks first', best.pick.ad.id === 'a1', best.pick.ad.id);
const scores = LIST.filter(x => x.status !== 'sold').map(x => A.scorePick(x, stats, NOW).score);
check('scorePick: scores finite for every active ad', scores.every(s => isFinite(s)));

/* 5 — price advice tones */
eq('priceAdvice: 20%+ below median = good', A.priceAdvice(ad({ price: 80000 }), stats).tone, 'good');
eq('priceAdvice: around median = fair', A.priceAdvice(ad({ price: 105000 }), stats).tone, 'fair');
eq('priceAdvice: way above = high', A.priceAdvice(ad({ price: 200000 }), stats).tone, 'high');
check('priceAdvice: no stats is honest about it', A.priceAdvice(ad({}), A.analyzePool([])).tone === 'neutral');

/* 6 — detail + comparison text */
const detail = A.detailText(LIST[0], { catName: 'Phones & Electronics', now: NOW });
check('detailText: has price line', /J\$80,000/.test(detail));
check('detailText: has negotiable marker', /negotiable/.test(detail));
check('detailText: has parish', /Kingston/.test(detail));
check('detailText: keeps short desc', /Nice item/.test(detail));
const cmp = A.compareText(LIST[0], LIST[1], stats);
check('compareText: cheaper delta mentioned', /J\$40,000/.test(cmp));
check('compareText: negotiable difference flagged', /negotiable/.test(cmp));
check('compareText: verdict present', /My pick/.test(cmp));
check('compareText: guards missing input', /need two listings/.test(A.compareText(LIST[0], null, stats)));

/* 7 — refinement filters are pure and safe */
eq('refinePool: photos_only', A.refinePool(LIST, 'photos_only').length, 2);
eq('refinePool: negotiable_only', A.refinePool(LIST, 'negotiable_only').length, 2);
eq('refinePool: same_parish keeps the dominant parish', A.refinePool(LIST, 'same_parish').every(x => x.parish === 'Kingston'), true);
check('refinePool: unknown intent returns the active pool', A.refinePool(LIST, 'nope').length === 4);

/* 8 — follow-up chips */
const chips0 = A.followUpChips('', { results: [] });
check('chips: empty state suggests starter searches', chips0.length >= 4 && chips0.every(c => c.label && c.query));
const chips = A.followUpChips('phones', { results: state.results });
check('chips: best-pick chip present with results', chips.some(c => /best/i.test(c.label)));
check('chips: compare chip present for 2+ results', chips.some(c => /compare/i.test(c.label)));
check('chips: every chip has a query a search can run', chips.every(c => c.query && c.query.length > 3));

/* 9 — φ constants */
eq('PHI constant', A.PHI, 1.618);
check('fib ramp stays Fibonacci', JSON.stringify([A.fib(0), A.fib(3), A.fib(7), A.fib(20)]), JSON.stringify([1, 5, 34, 144]));

/* 10 — pool analytics details
   (these five used to sit AFTER process.exit(), so they never ran) */
eq('analyzePool: negotiable count', stats.negotiable, 2);
eq('analyzePool: withPhotos count', stats.withPhotos, 2);
eq('analyzePool: freshest is a1', stats.freshest.id, 'a1');
/* cheapest ACTIVE listing: a5 (70k) is sold, so a1 (80k) wins over a4 (90k) */
eq('analyzePool: cheapest active is a1', stats.cheapest.id, 'a1');
eq('pctBelow: 80k vs 105k median', A.pctBelow(80000, 105000), 24);

/* 11 — budget parsing (shared by the core and the renderer's chips/status) */
eq('parseBudget: "under 2m"', A.parseBudget('under 2m').max, 2000000);
eq('parseBudget: "under 80k"', A.parseBudget('under 80k').max, 80000);
eq('parseBudget: bare "under 80000"', A.parseBudget('under 80000').max, 80000);
eq('parseBudget: "between 1 and 2 million" (lo)', A.parseBudget('between 1 and 2 million').min, 1000000);
eq('parseBudget: "between 1 and 2 million" (hi)', A.parseBudget('between 1 and 2 million').max, 2000000);
eq('parseBudget: "around 100k" gives a ±20% band', A.parseBudget('around 100k').min, 80000);
check('parseBudget: a plain search has no budget', A.parseBudget('iphone kingston') === null);
eq('withinBudget: nothing over the cap survives', A.withinBudget(LIST, A.parseBudget('under 100k')).filter(x => x.price > 100000).length, 0);
eq('classify: budget is surfaced on the decision', A.classify('phone under 80k', state).budget.max, 80000);

/* 12 — sort intents (reorder, never re-search) */
eq('classify: "cheapest first"', A.classify('cheapest first', state).intent, 'sort_price_asc');
eq('classify: "price high to low"', A.classify('price high to low', state).intent, 'sort_price_desc');
eq('classify: "newest first"', A.classify('newest first', state).intent, 'sort_newest');
eq('classify: "most popular first"', A.classify('most popular first', state).intent, 'sort_views');
check('classify: "newest first" is not confused with newest_half',
  A.classify('newest first', state).intent === 'sort_newest' && A.classify('only the newest', state).intent === 'newest_half');

console.log('\n' + (failures === 0 ? 'AI CHAT V2 TESTS: ALL ' + passes + ' PASSED' : failures + ' FAILED / ' + passes + ' passed — do NOT deploy'));
process.exit(failures === 0 ? 0 : 1);
