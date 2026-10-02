/* ── §GEN-PERF — the static ad page generator had gone quadratic, quietly.
   ───────────────────────────────────────────────────────────────────────────
   buildSimilarHTML() scores every ad against every other ad. Inside that inner
   loop it re-derived the SAME facts about each candidate on every single
   comparison: titleKeywords() re-allocated a 31-entry stopword Set and re-ran
   three regexes, a make-set was rebuilt, and the date was re-parsed. That is
   N² parses to produce N distinct values — measured at 89–97% of a generator
   run, scaling at 1.27 -> 4.97 ms/ad as the catalogue grew.

   It now memoises those facts per ad in a WeakMap, so scoring does N² cheap
   Set lookups over cached data instead of N² parses.

   Three jobs:
     1. WORK COUNT — deterministic. Counts how many times the title tokeniser
        runs across a full generation pass and asserts it is ~N, not ~N².
        Timing tests rot on shared CI runners; counting calls cannot.
     2. BEHAVIOUR — the scorer was rewritten, so pin what it must still
        produce: a warm second pass derives nothing, no ad suggests itself, no
        sold ad is ever suggested, same-make still leads, and the recent-fill
        fallback still fills an otherwise-empty block.
     3. THE WRITE PATH — main() went from a blocking writeFileSync loop to a
        16-worker pool, so it is driven end to end against a stubbed database.
   No network, no browser, no npm deps. Usage: node tools/test-gen-perf.js   */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || detail === undefined ? '' : ' — ' + detail));
  if (!ok) failed++;
}

/* Load the generator with main() stripped (so requiring it never touches the
   net), the title tokeniser instrumented with a call counter, and the helpers
   the behaviour checks need exported. */
function loadInstrumented() {
  const src = fs.readFileSync(path.join(ROOT, 'generate-pages.js'), 'utf8')
    .replace(/\nmain\(\)\.catch[\s\S]*$/,
      '\nmodule.exports = { buildPage, buildSimilarHTML, slugify, count: () => TOKEN_CALLS, reset: () => { TOKEN_CALLS = 0; } };\n')
    .replace('function titleKeywords(title) {',
      'let TOKEN_CALLS = 0;\nfunction titleKeywords(title) {\n  TOKEN_CALLS++;');
  const tmp = path.join(ROOT, '_tmp-gen-perf.js');
  fs.writeFileSync(tmp, src, 'utf8');
  try { return require(tmp); } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

/* A catalogue shaped like the real one: repeated makes, models, categories and
   parishes, so the same-category and same-make paths are genuinely exercised. */
const CATS = ['vehicles', 'property', 'electronics', 'furniture', 'jobs', 'other'];
const PARISHES = ['Kingston', 'St. Andrew', 'St. Catherine', 'Portland', 'Clarendon', 'Manchester'];
const MAKES = ['Toyota', 'Honda', 'Nissan', 'BMW', 'Audi', 'Ford', 'Suzuki', 'Mazda'];
const MODELS = ['Corolla', 'Civic', 'Note', 'X5', 'Fiesta', 'Swift', 'Cx5'];
const THINGS = ['laptop', 'phone', 'sofa', 'bike', 'tv', 'table'];
function mkAd(i) {
  const cat = CATS[i % CATS.length];
  const title = cat === 'vehicles'
    ? `${MAKES[i % MAKES.length]} ${MODELS[i % MODELS.length]} 2015 for sale good condition`
    : `${THINGS[i % THINGS.length]} ${MAKES[i % MAKES.length]} like new cheap`;
  return {
    id: 'ad' + (100000 + i), title,
    price: 50000 + (i * 7919) % 4000000, neg: i % 3 === 0,
    status: i % 11 === 0 ? 'sold' : 'active',
    parish: PARISHES[i % PARISHES.length], category: cat,
    seller: 'Seller ' + (i % 40), sellerId: 's' + (i % 40),
    phone: '8765' + (100000 + i), desc: 'Well kept item. '.repeat(3),
    date: new Date(Date.now() - (i % 90) * 86400000).toISOString(),
    image: 'https://example.supabase.co/storage/v1/object/public/ads/p' + i + '.jpg',
    photos: [0, 1, 2].map(k => 'https://example.supabase.co/storage/v1/object/public/ads/p' + i + '_' + k + '.jpg'),
  };
}

/* The slugs a similar-listings block links to, in display order. */
function linkedSlugs(html) {
  const out = [];
  const re = /<a class="sim-card" href="[^"]*\/ad\/([^"]+)\.html"/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const { buildPage, buildSimilarHTML, slugify, count, reset } = loadInstrumented();

/* ── 1. work count: linear, not quadratic ───────────────────────────────── */
const N = 240;
const ads = Array.from({ length: N }, (_, i) => mkAd(i));
ads.forEach(a => buildPage(a, ads));      // warm-up pass fills the memo
reset();
ads.forEach(a => buildPage(a, ads));      // the measured pass
const calls = count();

check('a second pass over ' + N + ' ads derives nothing new (every fact already cached)',
  calls === 0, calls + ' calls on the warm pass');
check('title tokenising is O(N), not O(N²) — ' + calls + ' calls for ' + N +
      ' ads (the old inner loop needed ~' + (N * (N - 1)).toLocaleString('en-US') + ')',
  calls <= N, calls + ' calls');

/* ── 2. behaviour the refactor had to preserve ───────────────────────────── */
const slugToAd = new Map(ads.map(a => [slugify(a), a]));
const pages = ads.map(a => buildPage(a, ads));

check('every page still renders a similar-listings block',
  pages.every(p => p.includes('sim-card')));

check('no ad suggests itself', ads.every((a, i) => !linkedSlugs(pages[i]).includes(slugify(a))));

check('no sold ad is ever suggested', ads.every((a, i) =>
  linkedSlugs(pages[i]).every(s => {
    const other = slugToAd.get(s);
    return !other || other.id === a.id || other.status !== 'sold';
  })));

check('every suggested link points at a real ad', ads.every((a, i) =>
  linkedSlugs(pages[i]).every(s => slugToAd.has(s))));

/* Same-make must still lead: tier 1 is worth 50–100, more than any other tier.
   Assert the LEAD is the same make, not merely the same category — with a
   synthetic catalogue several ads share a title exactly, so the first Toyota
   found is not necessarily the one that ranks first. */
const toyota = ads.find(a => a.category === 'vehicles' && /^Toyota/.test(a.title));
const otherToyota = toyota && ads.find(a => a.category === 'vehicles' && /^Toyota/.test(a.title) && a.id !== toyota.id);
if (toyota && otherToyota) {
  const leadSlug = linkedSlugs(buildSimilarHTML(toyota, ads))[0];
  const leadAd = slugToAd.get(leadSlug);
  check('the leading suggestion shares the make, not just the category',
    leadAd && leadAd.id !== toyota.id && /^Toyota/.test(leadAd.title),
    'lead=' + (leadAd ? leadAd.title : leadSlug));
}

/* The recent-fill fallback: a category with nothing comparable in it still gets
   a populated block rather than an empty section. */
const lonely = ads.filter(a => a.category === 'other');
if (lonely.length) {
  const filler = buildSimilarHTML(lonely[0], ads);
  check('the recent-fill fallback fills a block that would otherwise be empty',
    linkedSlugs(filler).length > 0);
}

/* Nothing to compare against at all => no section, not a broken one. */
check('a catalogue of one renders no similar block',
  buildSimilarHTML(ads[0], [ads[0]]) === '');

/* The memo is keyed per ad object, not by title value. Two ads with an
   IDENTICAL title but different ids are each other's best match — and their
   slugs differ, so this fails loudly if one ever inherits the other's slug
   (exactly what a value-keyed cache would do). */
const twinA = mkAd(3), twinB = mkAd(3);
twinB.id = 'adDIFFERENT';
const twinHtml = buildSimilarHTML(twinA, [twinA, twinB]);
const twinLinks = linkedSlugs(twinHtml);
check('the memo is keyed per ad object (identical titles, different ids)',
  twinLinks.includes(slugify(twinB)) && !twinLinks.includes(slugify(twinA)),
  'links=' + twinLinks.join(',') + ' twinB=' + slugify(twinB));

/* ── 3. the concurrent write path, run for real ─────────────────────────────
   main() was rewritten from a blocking writeFileSync loop to a 16-worker pool,
   so it gets driven end to end: a stubbed Supabase client, every write
   redirected into a temp dir (so the repo's own index.html/sitemap.xml are
   never touched), and the network pings neutralised. */
function runMain(tmpRoot, rows) {
  globalThis.__TMPROOT = tmpRoot;
  globalThis.__fakeRows = rows;
  globalThis.__noNet = { get: () => ({ on: () => {} }), request: () => ({ on: () => {}, write: () => {}, end: () => {} }) };
  const src = fs.readFileSync(path.join(ROOT, 'generate-pages.js'), 'utf8')
    .replace(/\nmain\(\)\.catch[\s\S]*$/, '\nmodule.exports = { main, slugify, dbToAd };\n')
    .replace(/path\.join\(__dirname,/g, 'path.join(globalThis.__TMPROOT,')
    .replace("const { createClient } = require('@supabase/supabase-js');",
      "const { createClient } = { createClient: () => ({ from: () => ({ select: () => ({ order: " +
      "() => ({ range: async () => ({ data: globalThis.__fakeRows, error: null }) }) }) }) }) };")
    .replace("const https = require('https');", 'const https = globalThis.__noNet;')
    .replace("const https2 = require('https');", 'const https2 = globalThis.__noNet;');
  const tmp = path.join(ROOT, '_tmp-gen-main.js');
  fs.writeFileSync(tmp, src, 'utf8');
  delete require.cache[require.resolve(tmp)];
  const mod = require(tmp);
  const quiet = console.log;
  console.log = () => {};
  // Resolve to the module exports (not just main()'s promise) — the caller
  // needs slugify/dbToAd too, and this file is deleted on the way out.
  return mod.main().then(() => mod, e => { throw e; }).finally(() => {
    console.log = quiet;
    try { fs.unlinkSync(tmp); } catch (e) {}
  });
}

(async function job3() {
  const os = require('node:os');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genperf-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'ad'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'ad', 'stale-should-be-swept.html'), 'stale', 'utf8');
    // main() re-reads these before rewriting them, so seed them from the repo.
    for (const f of ['index.html', 'robots.txt', 'sitemap.xml', 'sitemap.html']) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) fs.copyFileSync(p, path.join(tmpRoot, f));
    }
    const rows = ads.slice(0, 120).map((a, i) => ({
      id: 'row' + (1000 + i), title: a.title, category: a.category, parish: a.parish,
      price: a.price, description: a.desc, phone: a.phone, image_url: a.image,
      negotiable: a.neg, seller_name: a.seller, seller_init: 'S', seller_id: a.sellerId,
      created_at: a.date, status: a.status, views: 0,
    }));
    const { slugify, dbToAd } = await runMain(tmpRoot, rows);

    const written = fs.readdirSync(path.join(tmpRoot, 'ad')).filter(f => f.endsWith('.html'));
    const expected = new Set(rows.map(r => slugify(dbToAd(r)) + '.html'));
    const actual = new Set(written);

    check('the concurrent writer produced exactly one page per ad',
      written.length === expected.size && [...expected].every(f => actual.has(f)),
      'wrote ' + written.length + ', expected ' + expected.size);
    check('the stale-file sweep still deletes pages for removed ads',
      !actual.has('stale-should-be-swept.html'));
    check('no page was truncated or left half-written by the pool',
      written.every(f => fs.readFileSync(path.join(tmpRoot, 'ad', f), 'utf8').length > 500));
  } catch (e) {
    check('main() runs end to end against a stubbed database', false, e.message);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    try { fs.unlinkSync(path.join(ROOT, '_tmp-gen-main.js')); } catch (e) {}
  }
  console.log('\n' + (failed === 0 ? 'GEN-PERF: ALL PASSED' : 'GEN-PERF: ' + failed + ' FAILED'));
  process.exitCode = failed ? 1 : 0;
})();