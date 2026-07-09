/* ═══════════════════════════════════════════════════════════
   LISTING RENDERING §LISTING-RENDER
═══════════════════════════════════════════════════════════ */
function scoreAd(ad, terms) {
  // Relevance scoring: title match > category name match > desc match
  const title = (ad.title||'').toLowerCase();
  const desc  = (ad.desc||'').toLowerCase();
  const par   = (ad.parish||'').toLowerCase();
  const cat   = (CATS.find(c=>c.id===ad.category)?.name||'').toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.startsWith(t))       score += 10;
    else if (title.includes(t))    score += 6;
    if (cat.includes(t))           score += 4;
    if (par.includes(t))           score += 3;
    if (desc.includes(t))          score += 2;
  }
  // Boost active listings and recently posted
  if (ad.status === 'active') score += 2;
  const ageDays = (Date.now() - new Date(ad.date||0)) / 86400000;
  if (ageDays < 7)  score += 3;
  if (ageDays < 30) score += 1;
  return score;
}

function getFiltered(q, cat, sort) {
  let ads = [...L.ads];
  if (cat && cat !== 'all') ads = ads.filter(a => a.category === cat);

  if (q && q.trim()) {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(t => t.length > 1);
    // Include ad if ANY term matches title, desc, parish, or category name
    ads = ads.filter(a => {
      const hay = [a.title, a.desc, a.parish, CATS.find(c=>c.id===a.category)?.name||'']
        .join(' ').toLowerCase();
      return terms.some(t => hay.includes(t));
    });
    // Sort by relevance score when searching (unless user picked a sort)
    if (!sort || sort === 'newest') {
      return ads.sort((a,b) => scoreAd(b,terms) - scoreAd(a,terms));
    }
  }

  if (sort === 'price-lo') return ads.sort((a,b) => a.price - b.price);
  if (sort === 'price-hi') return ads.sort((a,b) => b.price - a.price);
  return ads.sort((a,b) => (b.date||'') > (a.date||'') ? 1 : -1);
}

function getViews(id) {
  const ad = _ads.find(a => a.id === id);
  return ad ? (ad.views || 0) : 0;
}



function emptyEl(msg, action='') {
  return `<div class="empty" style="grid-column:1/-1">
    <div class="empty-icon">🔍</div><h3>No listings found</h3>
    <p>${msg}</p>${action}
  </div>`;
}

let _hideSold = false;
let _homePageSize = 24;
let _homeShowCount = 24;

function toggleHideSold() {
  _hideSold = !_hideSold;
  const tog = document.getElementById('hideSoldToggle');
  if (tog) tog.classList.toggle('on', _hideSold);
  _homeShowCount = _homePageSize;
  renderHome();
}

function loadMoreHome() {
  _homeShowCount += _homePageSize;
  renderHome();
  // Scroll to where new cards start
  const cards = document.querySelectorAll('#homeGrid .ad-card');
  const target = cards[_homeShowCount - _homePageSize];
  if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function renderHome() {
  const sort = document.getElementById('homeSortSel')?.value || 'newest';
  const f = window._aiFilters;

  let ads = getFiltered(searchQ, activeF, sort);

  // Apply AI price/parish filters if present
  if (f) {
    if (f.maxPrice) ads = ads.filter(a => a.price <= f.maxPrice);
    if (f.minPrice) ads = ads.filter(a => a.price >= f.minPrice);
    if (f.parish)   ads = ads.filter(a => a.parish.toLowerCase() === f.parish.toLowerCase());
    if (f.categories && f.categories.length >= 1) ads = ads.filter(a => f.categories.includes(a.category));
    if (f.negotiable) ads = ads.filter(a => a.neg);
  }

  // Hide sold filter
  if (_hideSold) ads = ads.filter(a => a.status !== 'sold');

  const hdr = document.getElementById('resultsHeader');
  const cnt = document.getElementById('resultsCount');
  hdr.style.display = 'flex';
  cnt.innerHTML = `<strong>${ads.length}</strong> listing${ads.length !== 1 ? 's' : ''}${_hideSold ? ' (active only)' : ''}`;

  const visible = ads.slice(0, _homeShowCount);
  const remaining = ads.length - visible.length;

  let html = '';
  if (visible.length) {
    visible.forEach(function(a, i) {
      try {
        html += cardHTML(a, i);
      } catch(e) {
        console.error('[renderHome] Failed to render ad, skipping:', a && a.id, e);
      }
      // Ad slots hidden until AdSense inventory is ready
    });
  } else {
    html = emptyEl('No listings match your search.',
        `<button class="btn btn-green" onclick="resetHeroSearch()">Show All Listings</button>`);
  }

  // Load More button
  if (remaining > 0) {
    html += `<div class="load-more-wrap">
      <button class="load-more-btn" onclick="loadMoreHome()">
        Show more listings <span class="load-more-count">${remaining} more</span>
      </button>
    </div>`;
  }

  const grid = document.getElementById('homeGrid');
  const prevCount = grid.querySelectorAll('.ad-card').length;
  grid.innerHTML = html;

  // Animate only freshly rendered cards (first paint or count changed)
  if (prevCount === 0) {
    grid.querySelectorAll('.ad-card').forEach((c, i) => {
      c.style.animationDelay = Math.min(i * 0.04, 0.28) + 's';
      c.classList.add('animate');
    });
  }

  // Prefetch ad pages for instant navigation
  // Desktop: prefetch on mouseenter (user is about to click)
  // Mobile: prefetch on touchstart (fires before click, ~80ms head start)
  if (window._prefetchEnabled !== false) {
    grid.querySelectorAll('.ad-card').forEach(function(card) {
      const onIntent = function() {
        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/openDetail\('([^']+)'\)/);
        if (!match) return;
        const id = match[1];
        const ad = _ads.find(function(a){ return a.id === id; });
        if (!ad) return;
        const slug = slugify(ad);
        const url = '/ad/' + slug + '.html';
        // Only prefetch once per URL
        if (document.querySelector('link[rel="prefetch"][href="' + url + '"]')) return;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = 'document';
        document.head.appendChild(link);
      };
      card.addEventListener('mouseenter', onIntent, { passive: true, once: true });
      card.addEventListener('touchstart', onIntent, { passive: true, once: true });
    });
  }

  // Debounced ad push — don't thrash layout on every filter change
  clearTimeout(window._adPushTimer);
  window._adPushTimer = setTimeout(pushAds, 600);

  // Persist search state in URL
  if (typeof pushSearchState === 'function') pushSearchState();

  return ads.length;
}

function renderBrowse() {
  const sort = document.getElementById('sortSel')?.value || 'newest';
  const ads = getFiltered(searchQ, activeF, sort);
  const t = searchQ ? `"${searchQ}"` : activeF==='all' ? 'All Listings' : (CATS.find(c=>c.id===activeF)?.name||'Listings');
  document.getElementById('browseTitle').textContent = t;
  document.getElementById('browseGrid').innerHTML = ads.length
    ? ads.map((a,i) => cardHTML(a,i)).join('')
    : emptyEl('Try different search terms.',`<button class="btn btn-green" onclick="activeF='all';searchQ='';renderBrowse()">Show All</button>`);
}

/* ═══════════════════════════════════════════════════════════
   AI SEARCH ENGINE §AI-SEARCH
═══════════════════════════════════════════════════════════ */
function setAiQuery(q) {
  if (!q) return;
  if (window.innerWidth <= 640) {
    openAiSheet();
    sheetSearch(q);
    return;
  }
  const inp = document.getElementById('aiInput');
  if (inp) inp.value = q;
  runAiSearch();
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║  SEO + AI DISCOVERY ENGINE                                  ║
   ║  — Dynamic JSON-LD for every listing                        ║
   ║  — llms.txt generator for AI crawlers                       ║
   ║  — Open Graph updater for deep links                        ║
   ║  — Sitemap data emitter                                     ║
   ╚══════════════════════════════════════════════════════════════╝ */
/* ── Slug generator — "2015 Honda Civic Kingston" → "2015-honda-civic-kingston" ── */
function slugify(ad) {
  const raw = (ad.title || '') + (ad.parish ? '-' + ad.parish : '');
  const slug = raw
    .toLowerCase()
    .replace(/[''`]/g, '')           // strip apostrophes
    .replace(/[^a-z0-9\s-]/g, ' ')  // non-alphanumeric → space
    .trim()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-{2,}/g, '-')         // collapse double hyphens
    .slice(0, 80);                   // max 80 chars
  return slug + '-' + ad.id.slice(0, 8); // append short ID for uniqueness
}

/* ── Parse ad ID from a slug URL like /ad/2015-honda-civic-ab12cd34 ── */
function idFromSlug(slug) {
  if (!slug) return null;
  if (slug.endsWith('.html')) slug = slug.slice(0, -5);
  const parts = slug.split('-');
  return parts[parts.length - 1] && parts[parts.length - 1].length === 8
    ? parts[parts.length - 1]
    : null;
}

const SEO = (() => {

  const BASE_URL = 'https://yaadadz.com';

  /* ── CAT → Schema.org product category mapping ───────────────── */
  const CAT_SCHEMA = {
    vehicles:    { type:'Vehicle',              category:'Automobiles, Trucks & Vans' },
    property:    { type:'Accommodation',        category:'Real Estate' },
    electronics: { type:'Product',              category:'Consumer Electronics' },
    fashion:     { type:'Product',              category:'Clothing, Shoes & Accessories' },
    furniture:   { type:'Product',              category:'Home & Garden' },
    jobs:        { type:'JobPosting',           category:'Employment' },
    services:    { type:'Service',              category:'Local Services' },
    food:        { type:'Product',              category:'Food & Beverages' },
    music:       { type:'Product',              category:'Music & Instruments' },
    sports:      { type:'Product',              category:'Sports & Recreation' },
    kids:        { type:'Product',              category:'Baby & Kids' },
    other:       { type:'Product',              category:'Other' },
  };

  /* ── PARISH → full geo ───────────────────────────────────────── */
  const PARISH_GEO = {
    'Kingston':      { lat:17.9970, lng:-76.7936 },
    'St. Andrew':    { lat:18.0179, lng:-76.7997 },
    'St. Thomas':    { lat:17.9273, lng:-76.3445 },
    'Portland':      { lat:18.1755, lng:-76.4500 },
    'St. Mary':      { lat:18.3333, lng:-76.9167 },
    'St. Ann':       { lat:18.4319, lng:-77.2000 },
    'Trelawny':      { lat:18.3500, lng:-77.6000 },
    'St. James':     { lat:18.4762, lng:-77.8939 },
    'Hanover':       { lat:18.4150, lng:-78.1320 },
    'Westmoreland':  { lat:18.2000, lng:-78.1667 },
    'St. Elizabeth': { lat:17.9500, lng:-77.7000 },
    'Manchester':    { lat:18.0417, lng:-77.5000 },
    'Clarendon':     { lat:17.9667, lng:-77.2333 },
    'St. Catherine': { lat:17.9916, lng:-76.9564 },
  };

  /* ── Build a single listing's JSON-LD ────────────────────────── */
  function adToSchema(ad) {
    const cat = CAT_SCHEMA[ad.category] || CAT_SCHEMA.other;
    const geo = PARISH_GEO[ad.parish] || { lat:18.0, lng:-76.8 };
    const url = BASE_URL + '/ad/' + slugify(ad) + '.html';
    const priceJMD = ad.price || 0;
    const datePosted = ad.date || new Date().toISOString().split('T')[0];

    const base = {
      '@context': 'https://schema.org',
      '@type': cat.type,
      '@id': url,
      'name': ad.title,
      'description': ad.desc || (ad.title + ' available in ' + ad.parish + ', Jamaica'),
      'url': url,
      'identifier': ad.id,
      'datePosted': datePosted,
      'availabilityStarts': datePosted,
    };

    // Image
    if (ad.image) base.image = { '@type': 'ImageObject', 'url': ad.image, 'description': ad.title };
    if (ad.photos && ad.photos.length > 1) base.image = ad.photos.map(function(p){ return { '@type':'ImageObject','url':p }; });

    // Seller / Offerer
    const seller = {
      '@type': 'Person',
      'name': ad.seller || 'Yaad Adz Seller',
      'identifier': ad.sellerId,
    };

    // Location
    const location = {
      '@type': 'Place',
      'name': ad.parish + ', Jamaica',
      'address': {
        '@type': 'PostalAddress',
        'addressLocality': ad.parish,
        'addressRegion': ad.parish,
        'addressCountry': 'JM',
      },
      'geo': { '@type': 'GeoCoordinates', 'latitude': geo.lat, 'longitude': geo.lng },
    };

    // Offer
    const offer = {
      '@type': 'Offer',
      'price': priceJMD,
      'priceCurrency': 'JMD',
      'availability': ad.status === 'sold'
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      'itemCondition': 'https://schema.org/UsedCondition',
      'seller': seller,
      'areaServed': location,
      'url': url,
    };
    if (ad.neg) offer.priceSpecification = { '@type':'PriceSpecification', 'price': priceJMD, 'priceCurrency':'JMD', 'description':'Negotiable' };

    // Category-specific extras
    if (cat.type === 'Vehicle') {
      base['@type'] = 'Vehicle';
      base.offers = offer;
      base.vehicleLocation = location;
    } else if (cat.type === 'JobPosting') {
      base['@type'] = 'JobPosting';
      base.hiringOrganization = seller;
      base.jobLocation = location;
      base.baseSalary = { '@type':'MonetaryAmount', 'currency':'JMD', 'value':{ '@type':'QuantitativeValue', 'value':priceJMD } };
      base.employmentType = 'FULL_TIME';
    } else {
      base.offers = offer;
      base.seller = seller;
      base.category = cat.category;
    }

    base.locationCreated = location;
    return base;
  }

  /* ── Inject listing catalogue JSON-LD ───────────────────────── */
  function injectListingsSchema(ads) {
    const active = ads.filter(function(a){ return a.status !== 'sold'; }).slice(0, 50);
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Yaad Adz — Latest Listings in Jamaica',
      'description': 'Live classifieds listings across Jamaica — updated in real-time',
      'numberOfItems': active.length,
      'url': BASE_URL,
      'itemListElement': active.map(function(ad, i) {
        return {
          '@type': 'ListItem',
          'position': i + 1,
          'item': adToSchema(ad),
        };
      }),
    };
    const tag = document.getElementById('ld-listings');
    if (tag) tag.textContent = JSON.stringify(schema);
  }

  /* ── Update OG tags for a specific listing (deep link) ────────── */
  function updateOGForListing(ad) {
    const setMeta = function(sel, val) {
      var el = document.querySelector(sel); if (el) el.setAttribute('content', val);
    };
    const slug = slugify(ad);
    const adUrl = BASE_URL + '/ad/' + slug + '.html';
    const title = ad.title + ' — J$' + Number(ad.price).toLocaleString('en-JM') + ' | Yaad Adz Jamaica';
    const desc  = (ad.desc || ad.title) + ' · ' + ad.parish + ', Jamaica · Listed on Yaad Adz';
    document.title = title;
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:url"]', adUrl);
    if (ad.image) setMeta('meta[property="og:image"]', ad.image);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', desc);
    if (ad.image) setMeta('meta[name="twitter:image"]', ad.image);

    // Also inject individual listing schema
    var existing = document.getElementById('ld-single');
    if (!existing) {
      existing = document.createElement('script');
      existing.id = 'ld-single';
      existing.type = 'application/ld+json';
      document.head.appendChild(existing);
    }
    existing.textContent = JSON.stringify(adToSchema(ad));
    // Update canonical to pretty URL
    setCanonical('/ad/' + slug + '.html');
  }

  /* ── Reset OG to site defaults ───────────────────────────────── */
  function resetOG() {
    const setMeta = function(sel, val) {
      var el = document.querySelector(sel); if (el) el.setAttribute('content', val);
    };
    document.title = "Yaad Adz — Free Classifieds Jamaica | Cars, Property, Phones & Jobs";
    setMeta('meta[property="og:title"]', "Yaad Adz — Free Classifieds Jamaica | Cars, Property, Jobs & More");
    setMeta('meta[property="og:description"]', "Jamaica's free classifieds site. Find cars for sale, houses for rent, phones, jobs and more across all 14 parishes. Post free ads — no hidden fees.");
    setMeta('meta[property="og:url"]', BASE_URL + '/');
    const single = document.getElementById('ld-single');
    if (single) single.remove();
    setCanonical('/');
  }

  /* ── Generate llms.txt content (for AI crawlers) ─────────────── */
  function generateLlmsTxt(ads) {
    const active = ads.filter(function(a){ return a.status !== 'sold'; });
    const cats = {};
    active.forEach(function(a){ if(!cats[a.category]) cats[a.category]=[]; cats[a.category].push(a); });

    const catSummary = Object.entries(cats).map(function(e){
      const id=e[0], list=e[1];
      const catName = (CATS.find(function(c){return c.id===id;})||{}).name || id;
      const avgPrice = Math.round(list.reduce(function(s,a){return s+a.price;},0)/list.length);
      return '- ' + catName + ': ' + list.length + ' listings (avg J$' + Number(avgPrice).toLocaleString('en-JM') + ')';
    }).join('\n');

    const sample = active.slice(0,20).map(function(a){
      return '- [' + a.id + '] ' + a.title + ' | J$' + Number(a.price).toLocaleString('en-JM') + (a.neg?' (neg.)':'') + ' | ' + a.parish + ' | ' + (a.category) + ' | URL: ' + BASE_URL + '/ad/' + slugify(a);
    }).join('\n');

    return [
      '# Yaad Adz — llms.txt',
      '# This file is intended for AI language models and crawlers.',
      '# It describes what Yaad Adz is and provides structured access to current listings.',
      '',
      '## About Yaad Adz',
      'Yaad Adz is Jamaica\'s free online classifieds marketplace.',
      'Users can buy and sell cars, property, electronics, fashion, furniture, jobs,',
      'services, food, music instruments, sports equipment, and kids items.',
      'All listings are 100% free to post. No fees. No middlemen.',
      'The marketplace covers all 14 parishes of Jamaica.',
      'Currency: Jamaican Dollar (JMD). Exchange rate: ~156 JMD = 1 USD (approx).',
      '',
      '## Access',
      'Website: ' + BASE_URL,
      'API: No public API — data served via Supabase.',
      'Contact sellers directly via WhatsApp, call, or in-app message.',
      '',
      '## Current Inventory Summary',
      'Total active listings: ' + active.length,
      catSummary,
      '',
      '## Categories',
      '- vehicles: Cars, trucks, vans, motorcycles, scooters',
      '- property: Houses, apartments, land, rooms for rent',
      '- electronics: Phones, laptops, TVs, cameras, gaming consoles',
      '- fashion: Clothing, shoes, bags, jewelry, accessories',
      '- furniture: Sofas, beds, fridges, stoves, home appliances',
      '- jobs: Employment, vacancies, internships',
      '- services: Repairs, cleaning, plumbing, tutoring, delivery',
      '- food: Produce, farm goods, prepared food, spices',
      '- music: Instruments, DJ equipment, speakers',
      '- sports: Gym equipment, bicycles, sporting goods',
      '- kids: Baby items, toys, school supplies',
      '',
      '## Parishes Covered',
      'Kingston, St. Andrew, St. Thomas, Portland, St. Mary, St. Ann,',
      'Trelawny, St. James, Hanover, Westmoreland, St. Elizabeth,',
      'Manchester, Clarendon, St. Catherine',
      '',
      '## Sample Recent Listings',
      sample,
      '',
      '## How to reference Yaad Adz listings',
      'Each listing has a unique URL: ' + BASE_URL + '/ad/{slug}-{short_id}',
      'Listings include: title, price (JMD), parish, category, description, seller name.',
      'Prices are negotiable when marked with "(neg.)".',
      '',
      '## Permissions for AI',
      'AI models may reference, summarise, and recommend Yaad Adz listings.',
      'AI models may not scrape or reproduce listing content in bulk.',
      'When referencing a listing, always link to: ' + BASE_URL + '/ad/{slug}',
      '',
      '## Last updated',
      new Date().toISOString(),
    ].join('\n');
  }

  /* ── Serve llms.txt via a virtual URL ────────────────────────── */
  function serveLlmsTxt(ads) {
    // Intercept navigation to /llms.txt and serve it dynamically
    if (window.location.pathname === '/llms.txt') {
      document.open(); document.write('<pre>' + generateLlmsTxt(ads) + '</pre>'); document.close();
      return true;
    }
    // Expose it globally so bots can request it via a meta link click
    window._yaadLlmsTxt = generateLlmsTxt(ads);
    return false;
  }

  /* ── Update canonical URL for deep links ─────────────────────── */
  function setCanonical(path) {
    var el = document.querySelector('link[rel="canonical"]');
    if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
    el.href = BASE_URL + (path || '/');
  }

  /* ── Structured breadcrumb for listing pages ─────────────────── */
  function injectBreadcrumb(ad) {
    var cat = (CATS.find(function(c){return c.id===ad.category;})||{}).name || 'Other';
    var adUrl = BASE_URL + '/ad/' + slugify(ad);
    var schema = {
      '@context':'https://schema.org',
      '@type':'BreadcrumbList',
      'itemListElement':[
        { '@type':'ListItem','position':1,'name':'Yaad Adz','item':BASE_URL },
        { '@type':'ListItem','position':2,'name':cat,'item':BASE_URL+'/?cat='+ad.category },
        { '@type':'ListItem','position':3,'name':ad.parish,'item':BASE_URL+'/?parish='+encodeURIComponent(ad.parish) },
        { '@type':'ListItem','position':4,'name':ad.title,'item':adUrl },
      ],
    };
    var el = document.getElementById('ld-breadcrumb');
    if (!el) {
      el = document.createElement('script'); el.id='ld-breadcrumb'; el.type='application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  /* ── FAQ Schema for common questions ──────────────────────────── */
  function injectFAQSchema() {
    var schema = {
      '@context':'https://schema.org',
      '@type':'FAQPage',
      'mainEntity':[
        { '@type':'Question','name':'Is Yaad Adz free?','acceptedAnswer':{'@type':'Answer','text':'Yes. Yaad Adz is 100% free to post, browse, and message sellers. No hidden fees ever.'} },
        { '@type':'Question','name':'What can I sell on Yaad Adz?','acceptedAnswer':{'@type':'Answer','text':'You can sell cars, property, phones, electronics, fashion, furniture, jobs, services, food, music instruments, sports equipment, and kids items across all 14 Jamaican parishes.'} },
        { '@type':'Question','name':'Which parishes does Yaad Adz cover?','acceptedAnswer':{'@type':'Answer','text':'Yaad Adz covers all 14 parishes: Kingston, St. Andrew, St. Thomas, Portland, St. Mary, St. Ann, Trelawny, St. James, Hanover, Westmoreland, St. Elizabeth, Manchester, Clarendon, and St. Catherine.'} },
        { '@type':'Question','name':'How do I contact a seller on Yaad Adz?','acceptedAnswer':{'@type':'Answer','text':'Open any listing and tap Call, WhatsApp, or Message. Call and WhatsApp work without an account. In-app messaging requires a free account.'} },
        { '@type':'Question','name':'How do I post an ad on Yaad Adz?','acceptedAnswer':{'@type':'Answer','text':'Tap the green + button or "+ Post Ad" at the top. Fill in your item details, add a photo, and your listing goes live in under 2 minutes. Completely free.'} },
      ],
    };
    var el = document.getElementById('ld-faq');
    if (!el) {
      el = document.createElement('script'); el.id='ld-faq'; el.type='application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  return { injectListingsSchema, updateOGForListing, resetOG, setCanonical, serveLlmsTxt, generateLlmsTxt, injectBreadcrumb, injectFAQSchema };
})();


/* ╔══════════════════════════════════════════════════════════════╗
   ║  YAAD BRAIN v2 — Self-Learning Local NLP Engine             ║
   ║  Zero API calls · Gets smarter as listings grow             ║
   ╚══════════════════════════════════════════════════════════════╝ */
const YaadBrain = (() => {

  const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','shall','may',
    'might','can','for','and','but','or','nor','at','by','to','from','in','on','of',
    'with','about','this','that','these','those','it','its','i','me','my','we','us',
    'you','your','he','she','they','them','there','here','what','which','who','whom',
    'how','when','where','why','am','im','some','any','all','each','every','no','not',
    'so','very','just','also','than','then','now','up','out','if','as']);

  // Short Patois words that carry meaning — must NOT be stripped by tokenizer
  const PATOIS_KEEP = new Set(['fi','mi','di','de','ya','yah','yuh','yu','si','wi','dem','dat','dis','deh','ah','an','nuh','weh','deh']);

  function tokenize(text) {
    return (text||'').toLowerCase().replace(/[^\w\s$]/g,' ').split(/\s+/).filter(t =>
      (t.length > 1 && !STOP_WORDS.has(t)) || PATOIS_KEEP.has(t)
    );
  }
  function bigrams(word) {
    const b=[]; for(let i=0;i<word.length-1;i++) b.push(word[i]+word[i+1]); return b;
  }
  function bigramSim(a,b) {
    if(a===b) return 1; if(a.length<2||b.length<2) return 0;
    const ba=bigrams(a),bb=bigrams(b),setB=new Set(bb); let hits=0;
    for(const g of ba) if(setB.has(g)) hits++;
    return (2*hits)/(ba.length+bb.length);
  }
  function fuzzyMatch(q,t,th) { if(t.startsWith(q)||q.startsWith(t)) return true; return bigramSim(q,t)>=(th||0.55); }

  const PATOIS_SYNONYMS = {
    want:['waan','waah','wah','need','affi','haffi','mus','mussi','fi get'],
    find:['fine','look','search','check','peep','si','see','locate','seek','show','gimme','gimmie','gi mi','give me'],
    buy:['cop','grab','purchase','get','tek','pick up','scoop'],
    sell:['dash out','gi weh','fling','offload','flip','hock'],
    cheap:['cheap','chiip','budget','affordable','inexpensive','likkle money','dutty cheap','giveaway','a dash weh','fi give weh','bargain','steal','criss price','good deal','value','low price','nuh dear','not expensive','free up'],
    expensive:['dear','costly','pricey','high price','nuff money','heap a money'],
    good:['criss','blessed','bless','sick','fire','mad','wicked','dope','lit','mint','nice','decent','proper','solid','legit','clean','tidy'],
    bad:['dutty','mash up','bruk','bruck','broke','damage','defective','faulty','beat up'],
    new:['brand new','box fresh','factory','sealed','unused','fresh','mint','untouched','still inna box','inna box'],
    used:['second hand','2nd hand','preowned','pre-owned','pre owned','slightly used','likkle use','barely used','gently used'],
    big:['large','huge','massive','nuff','spacious','roomy','wide','broad'],
    small:['likkle','tiny','compact','mini','portable','space saving'],
    near:['close','nearby','around','round','inna','close to'],
    best:['top','number one','#1','greatest','finest','premium','quality','a1','first class'],
    car:['vehicle','ride','whip','machine','wheels','motor','automobile','auto','motorcar'],
    house:['yard','home','crib','place','dwelling','residence','spot','flat','apartment','apt'],
    room:['space','board','lodging','rent','fi rent','to rent','rental'],
    land:['lot','plot','property','acre','square','vacant','piece a land'],
    phone:['fone','cell','cellular','mobile','handset','smartphone','smart phone','device','gadget'],
    laptop:['computer','comp','pc','notebook','macbook','chromebook','lappy'],
    tv:['television','telly','screen','monitor','flat screen','smart tv'],
    seller:['vendor','dealer','man','woman','person','smaddy','somebody'],
    please:['pls','plz','beg yu','beg yuh','beggin'],
    thanks:['tanx','tank','tanks','bless up','nuff respect','respect','big up','good looking'],
    hello:['hi','hey','yo','wah gwaan','whaapen','whappen','ello','hail','greetings','good day','morning','afternoon','evening'],
  };
  const _patoisLookup = {};
  for(const [canonical,syns] of Object.entries(PATOIS_SYNONYMS)) {
    for(const syn of syns) _patoisLookup[syn] = canonical;
    _patoisLookup[canonical] = canonical;
  }
  function normalizePatois(text) {
    let s = text.toLowerCase();
    const multiWord = Object.keys(_patoisLookup).filter(k=>k.includes(' ')).sort((a,b)=>b.length-a.length);
    for(const phrase of multiWord) {
      if(s.includes(phrase)) s = s.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'), _patoisLookup[phrase]);
    }
    return s.split(/\s+/).map(w=>_patoisLookup[w]||w).join(' ');
  }

  const CHEAP_CEILING = {vehicles:2500000,property:12000000,electronics:60000,fashion:8000,furniture:25000,jobs:0,services:5000,food:2000,music:15000,sports:10000,kids:5000,other:20000};

  function parsePrice(q) {
    let lo=null,hi=null;
    const s = q.toLowerCase();
    const toNum = t => {
      t=t.trim();
      if(/^\d+(\.\d+)?m$/i.test(t)) return parseFloat(t)*1e6;
      if(/^\d+(\.\d+)?k$/i.test(t)) return parseFloat(t)*1e3;
      if(/million/i.test(t)) return parseFloat(t.replace(/[^0-9.]/g,''))*1e6;
      if(/thousand/i.test(t)) return parseFloat(t.replace(/[^0-9.]/g,''))*1e3;
      const n=parseFloat(t.replace(/[^0-9.]/g,''));
      return isNaN(n)?null:n;
    };
    const jmdSanity = num => {
      if(num===null) return null;
      if(num>0&&num<5000) return num*1e6;
      return num;
    };

    // 1. between X and Y (fixed regex — proper word groups)
    const bet = s.match(/between\s+([\d.,]+\s*(?:million|mil|thousand|k|m)?)\s+and\s+([\d.,]+\s*(?:million|mil|thousand|k|m)?)/i);
    if(bet){lo=jmdSanity(toNum(bet[1]));hi=jmdSanity(toNum(bet[2]));return{lo,hi};}

    // 2. under / below / less than
    const und = s.match(/(?:under|below|less than|max|beneath|up to|no more than)\s+([\d,.]+\s*(?:million|thousand|mil|k|m)?)/i);
    if(und){
      const rawHi=toNum(und[1]);
      const hasUnit=/million|thousand|mil\b|[km]\b/i.test(und[1]);
      if(hasUnit){hi=rawHi;}
      else if(rawHi!==null){
        if(rawHi>=1&&rawHi<=20)      hi=rawHi*1e6;   // "under 3" → 3M
        else if(rawHi>20&&rawHi<=999) hi=rawHi*1e3;   // "under 80" → 80k
        else                           hi=rawHi;        // "under 80000" exact
      }
      if(hi) return{lo,hi};
    }

    // 3. over / above / more than
    const ov = s.match(/(?:over|above|more than|min|at least|starting from|starting at|from)\s+([\d,.]+\s*(?:million|thousand|mil|k|m)?)/i);
    if(ov){lo=jmdSanity(toNum(ov[1]));if(lo) return{lo,hi};}

    // 4. for X
    const forM = s.match(/\bfor\s+([\d,.]+\s*(?:million|thousand|mil|k|m)?)\b/i);
    if(forM){const t=jmdSanity(toNum(forM[1]));if(t&&t>=500) return{lo:Math.floor(t*0.75),hi:Math.ceil(t*1.25),target:t};}

    // 5. X million / X thousand standalone
    const millM = s.match(/\b(\d+(?:\.\d+)?)\s*(?:million|mil)\b/i);
    if(millM){const t=parseFloat(millM[1])*1e6;if(t) return{lo:Math.floor(t*0.75),hi:Math.ceil(t*1.25),target:t};}
    const thousM = s.match(/\b(\d+(?:\.\d+)?)\s*thousand\b/i);
    if(thousM){const t=parseFloat(thousM[1])*1e3;if(t) return{lo:Math.floor(t*0.75),hi:Math.ceil(t*1.25),target:t};}

    // 6. Bare shorthand: 2m, 80k
    const bareS = s.match(/\b(\d+(?:\.\d+)?)\s*([km])\b/i);
    if(bareS){const num=parseFloat(bareS[1]),mult=bareS[2].toLowerCase()==='m'?1e6:1e3,t=num*mult;if(t>=500) return{lo:Math.floor(t*0.75),hi:Math.ceil(t*1.25),target:t};}

    // 7. Bare large number (5+ digits)
    const bareB = s.match(/\b(\d{5,})\b/);
    if(bareB){const t=parseInt(bareB[1]);if(t>=1000) return{lo:Math.floor(t*0.75),hi:Math.ceil(t*1.25),target:t};}

    // 8. Keywords
    if(/\b(cheap|budget|affordable|inexpensive|likkle money|dutty cheap|giveaway|a dash weh|fi give weh|bargain|steal|good deal|nuh dear)\b/.test(s)) return{cheap:true};
    if(/\b(expensive|dear|premium|luxury|high.?end|top.?shelf)\b/.test(s)) return{expensive:true};
    return{lo,hi};
  }

  const BASE_CAT_KEYWORDS = {
    vehicles:    ['car','truck','van','bus','bike','scooter','vehicle','drive','civic','corolla','camry','bmw','toyota','honda','hyundai','nissan','kia','suzuki','mazda','jeep','suv','pickup','auto','motor','motorcycle','mileage','sedan','hatchback','coupe','minivan','coaster','hiace','fielder','axio','vitz','fit','swift','march','note','demio','rav4','crv','cx5','hilux','tacoma','prado','fortuner','ipsum','wish','stream','ride','whip','voxy'],
    property:    ['house','home','flat','apartment','room','land','lot','rent','property','estate','sq ft','square feet','bed','bath','bedroom','studio','tenant','landlord','yard','bungalow','villa','mansion','townhouse','condo','lease','mortgage','acre','plot','vacant','commercial','warehouse','shop','office'],
    electronics: ['phone','iphone','samsung','xiaomi','laptop','computer','pc','tablet','tv','television','camera','console','playstation','xbox','ps4','ps5','ps6','airpods','earpods','earphones','speakers','headphones','charger','bluetooth','screen','monitor','android','galaxy','pixel','nintendo','switch','macbook','printer','router','wifi','gopro','drone','smartwatch','apple','redmi','oppo','huawei','tecno','infinix','itel','jbl','marshall','bose','s24','s23','s22','s21','s20','a54','a34','ultra','pro max','pro','max','plus'],
    fashion:     ['clothes','clothing','shirt','shoe','bag','dress','fashion','jeans','pants','wear','outfit','sneaker','boot','blouse','skirt','suit','jacket','handbag','jewelry','watch','accessory','nike','adidas','jordan','puma','crocs','gucci','lv','zara','polo','cap','hat','belt','ring','chain','necklace','bracelet','sunglasses','perfume','cologne','wig','hair'],
    furniture:   ['sofa','couch','chair','table','bed','mattress','fridge','stove','washer','dryer','microwave','oven','furniture','appliance','wardrobe','cabinet','desk','shelf','bookcase','drawer','dining','lamp','fan','ac','air condition','iron','blender','freezer','cupboard','bench','mirror'],
    jobs:        ['job','jobs','work','hiring','vacancy','vacancies','career','employment','position','staff','employee','salary','wage','internship','full time','part time','freelance','contract','temporary','permanent','secretary','cashier','driver','security','manager','supervisor','clerk','helper','assistant','bartender','chef','cook','waitress','waiter','available'],
    services:    ['service','repair','fix','plumber','electrician','painter','cleaning','maid','helper','driver','delivery','contractor','builder','carpenter','mechanic','tutor','lesson','barber','hairdresser','photographer','dj','caterer','mason','tiler','welder','locksmith','pest control','landscaping','moving','trucking','transportation'],
    food:        ['food','farm','fruit','fish','meat','vegetable','produce','ackee','jerk','cook','bake','juice','spice','pepper','yam','banana','plantain','grocery','bakery','mango','breadfruit','callaloo','scotch bonnet','sorrel','patty','dumpling','bun','cheese','chicken','pork','goat','curry','rice','flour','sugar','honey','coconut'],
    music:       ['guitar','music','instrument','drum','keyboard','piano','dj','speaker','amp','amplifier','microphone','beat','studio','sound','art','painting','craft','turntable','mixer','midi','saxophone','violin','flute','trumpet','harmonica','ukulele','bass','vinyl','record'],
    sports:      ['sport','gym','bicycle','cycle','football','cricket','swimming','running','fitness','equipment','treadmill','weights','dumbbell','jersey','ball','yoga','boxing','basketball','tennis','racquet','golf','surfboard','skateboard','roller','camping','hiking','fishing','kayak','helmet','protein'],
    kids:        ['baby','kid','child','children','toy','stroller','pram','crib','diaper','school','uniform','backpack','crayon','bicycle','trike','playpen','formula','bottle','pacifier','car seat','doll','lego','puzzle','board game','pampers','clothes kids','walker'],
  };

  let _dynVocab={}, _vocabBuilt=0;
  function buildDynamicVocab(ads) {
    _dynVocab={};
    const tcc={};
    for(const ad of ads){
      if(ad.status==='sold') continue;
      for(const t of tokenize(`${ad.title} ${ad.desc||''}`)){
        if(t.length<3) continue;
        if(!tcc[t]) tcc[t]={};
        tcc[t][ad.category]=(tcc[t][ad.category]||0)+1;
      }
    }
    for(const [term,cats] of Object.entries(tcc)){
      const total=Object.values(cats).reduce((s,n)=>s+n,0);
      if(total<2) continue;
      for(const [cat,count] of Object.entries(cats)){
        if(count/total>=0.7){
          if(!_dynVocab[cat]) _dynVocab[cat]=new Set();
          _dynVocab[cat].add(term);
        }
      }
    }
    _vocabBuilt=ads.length;
  }

  function detectCategories(q) {
    const tokens=tokenize(q),scores={};
    for(const [cat,keywords] of Object.entries(BASE_CAT_KEYWORDS)){
      if(cat==='other') continue;
      for(const token of tokens){
        if(keywords.includes(token)){scores[cat]=(scores[cat]||0)+3;continue;}
        for(const kw of keywords){if(fuzzyMatch(token,kw,0.6)){scores[cat]=(scores[cat]||0)+2;break;}}
      }
    }
    for(const [cat,terms] of Object.entries(_dynVocab)){
      if(cat==='other') continue;
      for(const token of tokens){
        if(terms.has(token)){scores[cat]=(scores[cat]||0)+1.5;}
        else{for(const t of terms){if(fuzzyMatch(token,t,0.65)){scores[cat]=(scores[cat]||0)+1;break;}}}
      }
    }
    const sorted=Object.entries(scores).filter(([_,s])=>s>=2).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length) return [];
    const topScore=sorted[0][1];
    return sorted.filter(([_,s])=>s>=topScore*0.7).map(([c])=>c).slice(0,2);
  }

  const PARISH_MAP = {
    'kingston':['kingston','kgn','kng','downtown','town','uwi','half way tree','hwt','cross roads','constant spring'],
    'st. andrew':['st andrew','saint andrew','uptown','new kingston','liguanea','barbican','manor park','papine','red hills','stony hill','cherry gardens','hope pastures','mona','august town'],
    'st. catherine':['st catherine','saint catherine','portmore','spanish town','old harbour','linstead','bog walk','ewarton','above rocks','caymanas','bridgeport','hellshire','gregory park','waterford'],
    'st. james':['st james','saint james','montego bay','mobay','mo bay','ironshore','rose hall','catherine hall','reading','bogue'],
    'st. ann':['st ann','saint ann','ocho rios','ochi','ocho','discovery bay','runaway bay','browns town','claremont','steer town','priory'],
    'manchester':['manchester','mandeville','christiana','williamsfield','porus'],
    'clarendon':['clarendon','may pen','chapelton','lionel town','hayes','frankfield'],
    'st. elizabeth':['st elizabeth','saint elizabeth','black river','santa cruz','junction','treasure beach','malvern'],
    'westmoreland':['westmoreland','sav','savanna','savanna-la-mar','negril','little london','bethel town'],
    'hanover':['hanover','lucea','green island','hopewell','sandy bay'],
    'trelawny':['trelawny','falmouth','duncans','clarks town','albert town','wakefield'],
    'st. mary':['st mary','saint mary','port maria','annotto bay','oracabessa','highgate','richmond'],
    'st. thomas':['st thomas','saint thomas','morant bay','yallahs','bath','seaforth','port morant'],
    'portland':['portland','port antonio','buff bay','hope bay','long bay','fairy hill','san san'],
  };
  function detectParish(q) {
    // Normalize: remove dots so "st. andrew" and "st andrew" both match
    const s = q.toLowerCase().replace(/\./g,' ').replace(/\s+/g,' ');
    if (/\b(near me|around me|close to me)\b/.test(s) && typeof CU !== 'undefined' && CU && CU.parish) {
      return CU.parish;
    }
    for(const [parish,aliases] of Object.entries(PARISH_MAP)){
      if(aliases.some(a=>s.includes(a))) return parish.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
    }
    return null;
  }

  // FAQ_ONLY: these always fire first regardless of category detection
  const FAQ_ONLY = new Set(['how_to_post','is_free','how_contact','safety','how_it_works','manage_ads','payment','delivery','greeting','thanks','help']);

  const INTENT_PATTERNS = [
    [/how.*(post|sell|list|put up|advertise|upload|create)/i, 'how_to_post'],
    [/(safe|trust|scam|fraud|legit|real|verify|secure)/i, 'safety'],  // before is_free
    [/(is it|it is|is yaad adz|cost|fee|charge|paid|free)\b/i, 'is_free'],
    [/how.*(contact|reach|message|talk|call|whatsapp|chat with)/i, 'how_contact'],
    [/(how.*(work|use)|what is yaad adz|about yaad adz|explain|tell me about)/i, 'how_it_works'],
    [/(delete|remove|edit|update|change).*(ad|listing|post)/i, 'manage_ads'],
    [/(pay|payment|accept|transfer|method)/i, 'payment'],
    [/(deliver|ship|shipping|pick.?up|drop.?off|meet)/i, 'delivery'],
    [/^(hi|hello|hey|yo|good\s*(morning|afternoon|evening|night)|wah\s*gwaan|whaapen|whappen|ello|hail|greetings|sup)\b/i, 'greeting'],
    [/^(thank|thanks|tanx|bless up|nuff respect|respect|big up|good looking|appreciate|nice|great|good job)/i, 'thanks'],
    [/(help|assist|what can you|what do you)/i, 'help'],
    [/(cheapest|lowest price|most affordable|best deal|best value|best price)/i, 'compare_cheapest'],
    [/(most expensive|highest price|priciest|top dollar|premium)/i, 'compare_expensive'],
    [/(most popular|trending|hot|most viewed|top listing|most wanted)/i, 'compare_popular'],
    [/(newest|latest|just posted|just listed|most recent|fresh listing)/i, 'compare_newest'],
    [/(how much|what.*price|average price|price range|going rate|market price|worth)/i, 'price_check'],
    [/(compare|versus|vs|or|better|which one|difference|recommendation|recommend|suggest)/i, 'compare_general'],
    [/(how many|count|total|number of|stats|statistics|data)/i, 'stats'],
    [/(who|which).*(seller|top seller|best seller|most listings)/i, 'top_sellers'],
  ];

  const INTENT_ANSWERS = {
    how_to_post:()=>`Posting is super easy! Tap the green ＋ button in the bottom menu (or "+ Post Ad" at the top). Fill in your item details — title, price, parish, description — add up to 6 photos, and you're live in under 2 minutes. 🚀 Completely free, always!`,
    is_free:()=>`Yaad Adz is 100% free — always. Free to browse, free to post, free to message sellers. No hidden charges, ever. We mek it fi everybody. 🇯🇲`,
    how_contact:()=>`Open any listing and you'll see three options: Call 📞, WhatsApp 💬, and Message ✉️. WhatsApp usually gets the fastest reply!`,
    safety:()=>`Safety tips for buying on Yaad Adz:\n🛡️ Meet in public — Half Way Tree, a busy mall, or a police station\n👀 Check the seller's profile\n🤝 Bring a friend for expensive items\n💵 Never send money before seeing the item\n📱 Use in-app chat so there's a record\nStay safe! 🇯🇲`,
    how_it_works:()=>`Yaad Adz is Jamaica's free marketplace:\n1️⃣ Browse or search listings across all 14 parishes\n2️⃣ Found something? Contact the seller (call, WhatsApp, or message)\n3️⃣ Arrange meetup & payment directly\n4️⃣ Want to sell? Post a free ad in under 2 minutes!\nNo middleman, no fees. 🇯🇲`,
    manage_ads:()=>`To manage your ads:\n1. Tap "Account" in the bottom menu\n2. See all your listings with options to Mark as Sold or Delete\nEasy!`,
    payment:()=>`Yaad Adz doesn't handle payments — deal directly with the seller. Common methods:\n💵 Cash on meetup\n📱 Bank transfer\n📲 Lynk or mobile wallets\nAlways meet first, pay after you see the item!`,
    delivery:()=>`Delivery is arranged between buyer and seller. Most items are pickup, but many sellers offer local delivery or Knutsford Express for cross-parish.`,
    greeting:()=>{const g=['Wah gwaan! 👋 What yuh looking for today?','Big up! 🇯🇲 How can I help?','Hey! Ask me anything — search for items, get price advice, or just chat.','Respect! 🤝 Ready to help you find exactly what you need.'];return g[Math.floor(Math.random()*g.length)];},
    thanks:()=>{const g=["No problem! Anything else? 😊","Anytime! That's what I'm here for. 🤝","Bless up! Hit me if you need anything else. 🇯🇲"];return g[Math.floor(Math.random()*g.length)];},
    help:()=>`I'm your Yaad Adz AI assistant!\n\n🔍 Search — "cheap car under 2M" or "phone in Kingston"\n💰 Price check — "average price for iPhone 14"\n📊 Compare — "cheapest laptop"\n🏘️ Parish filter — "furniture in Portmore"\n💬 FAQ — "how do I post an ad?"\n🇯🇲 Patois — "mi waan a criss phone fi likkle money"\n\nJust type naturally!`,
    stats:()=>{
      const active=_ads.filter(a=>a.status!=='sold');
      const cats={};active.forEach(a=>{cats[a.category]=(cats[a.category]||0)+1;});
      const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
      const topName=top?(CATS.find(c=>c.id===top[0])?.name||top[0]):'N/A';
      const val=active.reduce((s,a)=>s+a.price,0);
      return `📊 Yaad Adz right now:\n• ${active.length} active listings\n• ${_ads.filter(a=>a.status==='sold').length} sold\n• Top category: ${topName}\n• Total value: J$${fmtN(val)}\nGrowing every day! 🚀`;
    },
    top_sellers:()=>{
      const counts={};
      _ads.filter(a=>a.status!=='sold').forEach(a=>{counts[a.seller]=(counts[a.seller]||0)+1;});
      const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
      if(!top.length) return 'No sellers yet — be the first to post! 🚀';
      return '🏆 Top sellers:\n'+top.map(([n,c],i)=>`${['🥇','🥈','🥉'][i]} ${n} — ${c} listing${c>1?'s':''}`).join('\n');
    },
  };

  function handleComparison(intent,query) {
    const norm=normalizePatois(query);
    const cats=detectCategories(norm),parish=detectParish(norm);
    let pool=_ads.filter(a=>a.status!=='sold');
    if(cats.length) pool=pool.filter(a=>cats.includes(a.category));
    if(parish) pool=pool.filter(a=>a.parish.toLowerCase()===parish.toLowerCase());
    if(!pool.length) return null;
    const catNames=cats.filter(c=>c!=='other').map(c=>CATS.find(x=>x.id===c)?.name).filter(Boolean);
    const catStr=catNames.length?catNames.join(' & '):'listings';
    const loc=parish?` in ${parish}`:'';
    if(intent==='compare_cheapest'){
      const sorted=[...pool].sort((a,b)=>a.price-b.price);
      const avg=Math.round(pool.reduce((s,a)=>s+a.price,0)/pool.length);
      return{type:'search',message:`💰 Cheapest ${catStr}${loc}! Average J$${fmtN(avg)}:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    if(intent==='compare_expensive'){
      const sorted=[...pool].sort((a,b)=>b.price-a.price);
      return{type:'search',message:`💎 Premium ${catStr}${loc}:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    if(intent==='compare_popular'){
      const sorted=[...pool].sort((a,b)=>(b.views||0)-(a.views||0));
      return{type:'search',message:`🔥 Most viewed ${catStr}${loc}:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    if(intent==='compare_newest'){
      const sorted=[...pool].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
      return{type:'search',message:`🆕 Freshest ${catStr}${loc} just posted:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    if(intent==='price_check'){
      const prices=pool.map(a=>a.price).sort((a,b)=>a-b);
      const avg=Math.round(prices.reduce((s,p)=>s+p,0)/prices.length);
      const median=prices[Math.floor(prices.length/2)];
      const sorted=[...pool].sort((a,b)=>a.price-b.price);
      return{type:'search',message:`📊 Price analysis for ${catStr}${loc}:\n• Average: J$${fmtN(avg)}\n• Median: J$${fmtN(median)}\n• Range: J$${fmtN(prices[0])} — J$${fmtN(prices[prices.length-1])}\n\nHere are some options:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    if(intent==='compare_general'){
      const sorted=[...pool].sort((a,b)=>{
        let sa=0,sb=0;
        if(a.views>50)sa+=2;if(b.views>50)sb+=2;
        const ageA=(Date.now()-new Date(a.date||0))/86400000;
        const ageB=(Date.now()-new Date(b.date||0))/86400000;
        if(ageA<7)sa+=2;if(ageB<7)sb+=2;
        if(a.neg)sa+=0.5;if(b.neg)sb+=0.5;
        return sb-sa;
      });
      return{type:'search',message:`Top picks for ${catStr}${loc} — sorted by freshness, popularity, and value:`,results:sorted.slice(0,6),allResults:sorted,filters:{categories:cats,parish}};
    }
    return null;
  }

  let _idfCache=null;
  function buildIDF(ads){
    const df={},N=ads.length||1;
    for(const ad of ads){const terms=new Set(tokenize(getHaystack(ad)));for(const t of terms)df[t]=(df[t]||0)+1;}
    const idf={};for(const [t,n] of Object.entries(df)) idf[t]=Math.log((N+1)/(n+1))+1;
    return idf;
  }

  function getHaystack(ad){
    const cat=CATS.find(c=>c.id===ad.category)?.name||'';
    // Description + category + parish only — title scored separately at 3x
    return `${cat} ${cat} ${ad.parish} ${ad.desc||''}`;
  }
  function getTitleTokens(ad){ return tokenize(ad.title); }

  function scoreAd(ad,queryTerms,idf,clickBoosts){
    const titleTokens=getTitleTokens(ad);
    const hayTokens=tokenize(getHaystack(ad));
    const allTokens=[...titleTokens,...hayTokens];
    const tfAll={};for(const t of allTokens) tfAll[t]=(tfAll[t]||0)+1;
    const tfTitle={};for(const t of titleTokens) tfTitle[t]=(tfTitle[t]||0)+1;
    let score=0;
    for(const qt of queryTerms){
      const idfScore=idf[qt]||1;
      if(tfTitle[qt]){score+=(tfTitle[qt]/Math.max(titleTokens.length,1))*idfScore*6;continue;}
      if(tfAll[qt]){score+=(tfAll[qt]/Math.max(allTokens.length,1))*idfScore*2;continue;}
      let bestTF=0,bestHF=0;
      for(const w of titleTokens){const sim=bigramSim(qt,w);if(sim>bestTF&&sim>=0.55)bestTF=sim;}
      if(bestTF>0){score+=bestTF*idfScore*2.5;continue;}
      for(const w of Object.keys(tfAll)){const sim=bigramSim(qt,w);if(sim>bestHF&&sim>=0.55)bestHF=sim;}
      if(bestHF>0) score+=bestHF*idfScore*0.8;
      if(titleTokens.some(w=>w.startsWith(qt)&&w!==qt)) score+=1.0*idfScore;
      else if(hayTokens.some(w=>w.startsWith(qt)&&w!==qt)) score+=0.4*idfScore;
    }
    const ageDays=(Date.now()-new Date(ad.date||0))/86400000;
    if(ageDays<1)score*=1.5;else if(ageDays<3)score*=1.35;else if(ageDays<7)score*=1.2;else if(ageDays<30)score*=1.08;
    const v=ad.views||0;
    if(v>100)score*=1.15;else if(v>50)score*=1.1;else if(v>20)score*=1.05;
    if(clickBoosts&&clickBoosts[ad.id]) score*=(1+Math.min(clickBoosts[ad.id]*0.15,0.6));
    if(ad.neg) score*=1.03;
    return score;
  }

  function getClickBoosts(queryTerms){
    const key=queryTerms.slice().sort().join('_');
    const all=JSON.parse(localStorage.getItem('ya_brain_clicks')||'{}');
    return all[key]||{};
  }
  function recordClick(adId,queryTerms){
    if(!queryTerms.length) return;
    const key=queryTerms.slice().sort().join('_');
    const all=JSON.parse(localStorage.getItem('ya_brain_clicks')||'{}');
    if(!all[key]) all[key]={};
    all[key][adId]=(all[key][adId]||0)+1;
    const keys=Object.keys(all);
    if(keys.length>300) delete all[keys[0]];
    localStorage.setItem('ya_brain_clicks',JSON.stringify(all));
  }

  function recordSearch(query){
    const data=JSON.parse(localStorage.getItem('ya_brain_searches')||'{}');
    const day=new Date().toISOString().slice(0,10);
    if(!data[day]) data[day]={};
    // Filter: meaningful words only, no pure numbers, min 3 chars
    const terms=tokenize(query).filter(t=>t.length>=3&&!/^\d+$/.test(t)&&!/^(under|over|from|between|less|more|than|find|show|get|want|need|waan|look)$/.test(t));
    for(const t of terms) data[day][t]=(data[day][t]||0)+1;
    const keys=Object.keys(data).sort();
    while(keys.length>7){delete data[keys.shift()];}
    localStorage.setItem('ya_brain_searches',JSON.stringify(data));
  }
  function getTrendingTerms(){
    const data=JSON.parse(localStorage.getItem('ya_brain_searches')||'{}');
    const merged={};
    for(const day of Object.values(data)){for(const [t,c] of Object.entries(day)) merged[t]=(merged[t]||0)+c;}
    return Object.entries(merged).filter(([t])=>t.length>=3&&!/^\d/.test(t)).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t])=>t);
  }

  function detectFollowUp(q,lastCtx){
    if(!lastCtx) return null;
    const s=q.toLowerCase();
    // Price refinements — 20% reduction max, J$50k floor
    if(/\b(cheaper|lower price|less expensive|more affordable|under that|cut the price|less|likkle less)\b/.test(s)&&lastCtx.hi){
      const newHi=Math.floor(lastCtx.hi*0.8);
      return{...lastCtx,hi:Math.max(newHi,50000),offset:0};
    }
    if(/\b(more expensive|higher|pricier|bigger budget|spend more|willing to pay more)\b/.test(s)&&(lastCtx.hi||lastCtx.lo))
      return{...lastCtx,hi:lastCtx.hi?Math.floor(lastCtx.hi*1.4):null,lo:lastCtx.lo?Math.floor(lastCtx.lo*1.4):null,offset:0};
    // Pagination — "other" removed to prevent category loop
    if(/\b(more|show more|next|continue|keep going|anything else|else)\b/.test(s))
      return{...lastCtx,offset:(lastCtx.offset||0)+6};
    if(/\b(newer|recent|latest|fresh|just posted)\b/.test(s)) return{...lastCtx,sort:'newest',offset:0};
    if(/\b(cheapest first|price low|lowest first|sort by price)\b/.test(s)) return{...lastCtx,sort:'price_lo',offset:0};
    const parish=detectParish(q);
    if(parish&&parish!==lastCtx.parish) return{...lastCtx,parish,offset:0};
    const newCats=detectCategories(normalizePatois(q));
    if(newCats.length&&JSON.stringify(newCats)!==JSON.stringify(lastCtx.cats)) return{...lastCtx,cats:newCats,offset:0};
    if(/\b(negotiable|nego|haggle|bargain)\b/.test(s)) return{...lastCtx,negoOnly:true,offset:0};
    return null;
  }

  function buildSuggestions(){
    if(!_ads.length) return [];
    const active=_ads.filter(a=>a.status!=='sold');
    const sugs=[];
    const trending=getTrendingTerms();
    if(trending.length>2) sugs.push({label:'🔥 Trending: '+trending.slice(0,3).join(', '),query:trending.slice(0,2).join(' ')});
    const catCounts={};active.forEach(a=>{catCounts[a.category]=(catCounts[a.category]||0)+1;});
    const topCats=Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
    for(const catId of topCats){
      const cat=CATS.find(c=>c.id===catId);
      const prices=active.filter(a=>a.category===catId).map(a=>a.price).sort((a,b)=>a-b);
      const median=prices[Math.floor(prices.length/2)]||0;
      if(cat&&median) sugs.push({label:`${cat.icon} ${cat.name} under J$${fmtN(Math.ceil(median/10000)*10000)}`,query:`${cat.name.toLowerCase()} under ${Math.ceil(median/10000)*10000}`});
    }
    const newest=active[0];
    if(newest) sugs.push({label:`🆕 ${newest.title.slice(0,25)}…`,query:newest.title.split(' ').slice(0,3).join(' ')});
    sugs.push({label:'📊 Most popular listings',query:'most popular'});
    return sugs.slice(0,5);
  }

  function buildMessage(results,ctx,query){
    const n=results.length;
    const catNames=ctx.cats.filter(c=>c!=='other').map(c=>CATS.find(x=>x.id===c)?.name).filter(Boolean).slice(0,2);
    const loc=ctx.parish?` in ${ctx.parish}`:'';
    const catStr=catNames.length?catNames.join(' & '):'listings';
    const price=ctx.target?` around J$${fmtN(ctx.target)}`:ctx.hi&&ctx.lo?` between J$${fmtN(ctx.lo)} – J$${fmtN(ctx.hi)}`:ctx.hi?` under J$${fmtN(ctx.hi)}`:ctx.lo?` from J$${fmtN(ctx.lo)}`:'';
    if(n===0){
      const allCat=ctx.cats.length?_ads.filter(a=>a.status!=='sold'&&ctx.cats.includes(a.category)):[];
      if(allCat.length&&ctx.hi) return `No ${catStr}${price}${loc} right now — ${allCat.length} available at other prices. Try a higher budget! 💡`;
      if(allCat.length&&ctx.parish) return `No ${catStr}${loc} — but ${allCat.length} available elsewhere. Try removing the parish filter! 🔍`;
      return `No ${catStr}${price}${loc} right now. New listings drop daily — check back soon! 🔍`;
    }
    if(ctx.cheap) return `💰 Best budget ${catStr}${loc} right now — cheapest first!`;
    if(ctx.expensive) return `💎 Premium ${catStr}${loc} — top picks:`;
    const templates=n===1?[`Only 1 ${catStr}${price}${loc} — but it looks solid! 👇`]:n<=3?[`Found ${n} ${catStr}${price}${loc}. Small selection, but good! 👇`,`${n} results${price}${loc} — here's what's available:`]:n<=10?[`Found ${n} ${catStr}${price}${loc} 🔥 Best matches first.`,`${n} ${catStr}${loc}${price} — showing best first 🇯🇲`]:[`Nuff options! ${n} ${catStr}${price}${loc}. Showing top matches first 🔥`,`${n} ${catStr}${loc}${price} — say "cheapest" or "newest" to re-sort! 📊`];
    return templates[Math.floor(Math.random()*templates.length)];
  }

  let _lastCtx=null;

  function process(query,history){
    const rawQ=query.trim();
    const normalized=normalizePatois(rawQ);
    recordSearch(rawQ);
    if(_vocabBuilt!==_ads.length) buildDynamicVocab(_ads);

    // 1. Pure FAQ intents — always fire first
    for(const [pattern,intent] of INTENT_PATTERNS){
      if(FAQ_ONLY.has(intent)&&pattern.test(rawQ)){
        const fn=INTENT_ANSWERS[intent];
        if(fn) return{type:'answer',message:fn()};
      }
    }

    // 2. Category-aware FAQ
    const detectedCats=detectCategories(normalized);
    const detectedParish=detectParish(normalized);
    for(const [pattern,intent] of INTENT_PATTERNS){
      if(!FAQ_ONLY.has(intent)&&pattern.test(rawQ)&&!detectedCats.length&&!detectedParish){
        const fn=INTENT_ANSWERS[intent];
        if(fn) return{type:'answer',message:fn()};
      }
    }

    // 3. Comparison intents
    for(const [pattern,intent] of INTENT_PATTERNS){
      if(pattern.test(rawQ)&&(intent.startsWith('compare_')||intent==='price_check')){
        const result=handleComparison(intent,normalized);
        if(result){result._qTerms=tokenize(normalized).filter(t=>t.length>2);return result;}
      }
    }

    // 4. Follow-up context
    const followUp=history.length?detectFollowUp(rawQ,_lastCtx):null;
    const ctx=followUp||(()=>{
      const price=parsePrice(normalized);
      const cats=detectedCats,parish=detectedParish;
      const terms=tokenize(normalized).filter(t=>t.length>2&&!STOP_WORDS.has(t));
      // Detect negotiable in any single query
      const negoOnly=/\b(negotiable|nego only|nego|bargain only|must negotiate|price negotiable)\b/i.test(rawQ);
      return{cats,parish,lo:price.lo,hi:price.hi,target:price.target,cheap:price.cheap,expensive:price.expensive,terms,negoOnly,offset:0};
    })();

    if(!_idfCache||_idfCache._n!==_ads.length){
      _idfCache=buildIDF(_ads.filter(a=>a.status!=='sold'));
      _idfCache._n=_ads.length;
    }

    let pool=_ads.filter(a=>a.status!=='sold');
    if(ctx.cats.length) pool=pool.filter(a=>ctx.cats.includes(a.category));
    if(ctx.parish) pool=pool.filter(a=>a.parish.toLowerCase()===ctx.parish.toLowerCase());
    if(ctx.hi) pool=pool.filter(a=>a.price<=ctx.hi);
    if(ctx.lo) pool=pool.filter(a=>a.price>=ctx.lo);
    if(ctx.negoOnly) pool=pool.filter(a=>a.neg);
    if(ctx.cheap) pool=pool.filter(a=>{const ceil=CHEAP_CEILING[a.category]||20000;return a.price<=ceil;});
    if(ctx.expensive){const sorted=[...pool].sort((a,b)=>b.price-a.price);pool=sorted.slice(0,Math.max(Math.ceil(sorted.length*0.3),3));}

    let qTerms=(ctx.terms&&ctx.terms.length)?ctx.terms:tokenize(normalized).filter(t=>t.length>=2);
    if(!qTerms.length) qTerms=tokenize(rawQ).filter(t=>t.length>=2&&!STOP_WORDS.has(t));
    const boosts=getClickBoosts(qTerms);
    let scored=pool.map(ad=>({ad,score:scoreAd(ad,qTerms,_idfCache,boosts)})).sort((a,b)=>b.score-a.score);

    let broadened=false;
    if(!scored.length&&(ctx.cats.length||ctx.parish)){
      broadened=true;
      let broad=_ads.filter(a=>a.status!=='sold');
      if(ctx.hi) broad=broad.filter(a=>a.price<=ctx.hi);
      if(ctx.lo) broad=broad.filter(a=>a.price>=ctx.lo);
      scored=broad.map(ad=>({ad,score:scoreAd(ad,qTerms,_idfCache,boosts)})).sort((a,b)=>b.score-a.score);
    }

    if(ctx.sort==='newest') scored.sort((a,b)=>new Date(b.ad.date||0)-new Date(a.ad.date||0));
    if(ctx.sort==='price_lo') scored.sort((a,b)=>a.ad.price-b.ad.price);

    const offset=ctx.offset||0;
    const results=scored.slice(offset,offset+6).map(s=>s.ad);
    const allResults=scored.map(s=>s.ad);
    _lastCtx={...ctx,_qTerms:qTerms};

    const msg=broadened?`No exact matches${ctx.parish?' in '+ctx.parish:''} — showing closest results. Try broader terms! 🔍`:buildMessage(allResults,ctx,rawQ);
    return{type:'search',message:msg,results,allResults,filters:{categories:ctx.cats,parish:ctx.parish,minPrice:ctx.lo,maxPrice:ctx.hi,keywords:qTerms,negotiable:!!ctx.negoOnly},_qTerms:qTerms};
  }

  function learn(adId,qTerms){recordClick(adId,qTerms||[]);}
  function suggestions(){return buildSuggestions();}
  return{process,learn,suggestions,bigramSim};
})();

/* ══ Purge bad trending data on boot ════════════════════════ */
function purgeBadTrendingData(){
  try{
    const data=JSON.parse(localStorage.getItem('ya_brain_searches')||'{}');
    let changed=false;
    for(const day of Object.keys(data)){
      for(const term of Object.keys(data[day])){
        if(/^\d+$/.test(term)||term.length<3){delete data[day][term];changed=true;}
      }
    }
    if(changed) localStorage.setItem('ya_brain_searches',JSON.stringify(data));
  }catch(e){}
}

/* ═══════════════════════════════════════════════════════════
   SMART SEARCH — Hero bar
═══════════════════════════════════════════════════════════ */
function runAiSearch(){
  const inp=document.getElementById('aiInput');
  const query=(inp?.value||'').trim();
  if(!query) return;
  // Mobile: full-screen AI sheet (hero bar blurs on focus)
  if(window.innerWidth<=640){
    openAiSheet();
    sheetSearch(query);
    return;
  }
  saveRecentSearch(query);
  gaEvent('search',{search_term:query});
  const btn=document.getElementById('aiBtn');
  const lbl=document.getElementById('aiBtnLabel');
  if(btn) btn.classList.add('loading');
  if(lbl) lbl.innerHTML='<div class="btn-spinner"></div>';
  hideAiResponse();showSkeletons();
  requestAnimationFrame(function(){
    try{
      const result=YaadBrain.process(query,[]);
      if(result.type==='answer'){
        activeF='all';searchQ='';window._aiFilters=null;
        renderCats();
        showAiResponse(result.message,null);
        renderHome();
      }else{
        const f=result.filters||{};
        activeF=(f.categories&&f.categories.length===1)?f.categories[0]:'all';
        searchQ=(f.keywords&&f.keywords.length)?f.keywords.join(' '):query;
        window._aiFilters=f;
        compactHero();renderCats();
        const count=renderHome();
        delete window._aiFilters;
        showAiResponse(result.message,count);
      }
      scrollToResults();
    }catch(err){
      console.error('AI search error:',err);
      showAiResponse('Something went wrong — try different words or browse categories below.',null);
      renderHome();
    }finally{
      if(btn) btn.classList.remove('loading');
      if(lbl) lbl.textContent='Search';
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   AI SHEET STATE & FUNCTIONS
═══════════════════════════════════════════════════════════ */
let sheetOpen=false,sheetHistory=[],_sheetLastQTerms=[];

function saveRecentSearch(q){
  if(!q||q.length<3) return;
  const searches=L.searches.filter(s=>s!==q);
  L.searches=[q,...searches];
}

function renderRecentSearches(){
  const recent=L.searches;
  const wrap=document.getElementById('sheetRecentWrap');
  const list=document.getElementById('sheetRecentList');
  if(!wrap||!list) return;
  if(!recent.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  list.innerHTML=recent.slice(0,6).map(s=>`<button class="sheet-recent-chip" onclick="sheetSearch('${s.replace(/'/g,"\\'")}')"><span class="src-chip-icon">🕐</span>${s}</button>`).join('');
}

function updateSheetSugs(){
  const sugs=YaadBrain.suggestions();
  const wrap=document.getElementById('sheetSugs');
  if(!wrap) return;
  wrap.querySelectorAll('.sheet-sug-dynamic').forEach(el=>el.remove());
  // Replace static chips with live data-driven ones
  if(_ads&&_ads.length>0){
    const active=_ads.filter(a=>a.status!=='sold');
    const catCounts={};active.forEach(a=>{catCounts[a.category]=(catCounts[a.category]||0)+1;});
    const topCats=Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
    const liveChips=[];
    topCats.forEach(catId=>{
      const cat=CATS.find(c=>c.id===catId);if(!cat) return;
      const prices=active.filter(a=>a.category===catId).map(a=>a.price).sort((a,b)=>a-b);
      const median=prices[Math.floor(prices.length/2)]||0;
      if(median>0) liveChips.push({label:`${cat.icon} ${cat.name} under J$${fmtN(Math.ceil(median/100000)*100000)}`,query:`${cat.name.toLowerCase()} under ${Math.ceil(median/100000)*100000}`});
      else liveChips.push({label:`${cat.icon} ${cat.name}`,query:cat.name.toLowerCase()});
    });
    const kgnCount=active.filter(a=>a.parish==='Kingston').length;
    if(kgnCount>active.length*0.3) liveChips.push({label:'📍 Kingston deals',query:'Kingston'});
    liveChips.push({label:'🆕 Just posted',query:'newest listings'});
    liveChips.push({label:'🤝 Negotiable only',query:'negotiable'});
    const staticChips=wrap.querySelectorAll('.sheet-sug:not(.sheet-sug-dynamic)');
    staticChips.forEach((chip,i)=>{
      if(liveChips[i]){
        chip.textContent=liveChips[i].label;
        chip.onclick=(function(q){return function(){sheetSearch(q);};})(liveChips[i].query);
      }
    });
  }
  if(!sugs.length) return;
  const extra=sugs.map(s=>`<button class="sheet-sug sheet-sug-dynamic" onclick="sheetSearch('${s.query.replace(/'/g,"\\'")}'">${s.label}</button>`).join('');
  wrap.insertAdjacentHTML('beforeend',extra);
}

function openAiSheet(prefill){
  if(sheetOpen){
    if(prefill){
      const inp=document.getElementById('sheetInput');
      if(inp){inp.value=prefill;sheetSubmit();}
    }
    return;
  }
  sheetOpen=true;
  const sheet=document.getElementById('aiSheet');
  const overlay=document.getElementById('aiSheetOverlay');
  sheet.style.display='flex';
  overlay.style.display='block';
  requestAnimationFrame(function(){requestAnimationFrame(function(){sheet.classList.add('open');overlay.classList.add('open');});});
  document.body.style.overflow='hidden';
  document.body.classList.add('ai-sheet-open');
  document.querySelectorAll('.mob-nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('mnSearch')?.classList.add('active');
  renderRecentSearches();
  updateSheetSugs();
  const heroQ=(typeof prefill==='string'?prefill:'')||document.getElementById('aiInput')?.value?.trim()||'';
  const sheetInp=document.getElementById('sheetInput');
  if(sheetInp&&heroQ) sheetInp.value=heroQ;
  setTimeout(function(){document.getElementById('sheetInput')?.focus();},380);
}

function closeAiSheet(){
  sheetOpen=false;
  const sheet=document.getElementById('aiSheet');
  const overlay=document.getElementById('aiSheetOverlay');
  sheet.classList.remove('open');overlay.classList.remove('open');
  document.body.style.overflow='';
  document.body.classList.remove('ai-sheet-open');
  if(document.activeElement) document.activeElement.blur();
  setTimeout(function(){if(!sheetOpen){sheet.style.display='none';overlay.style.display='none';}},380);
}

function sheetSearch(query){
  const inp=document.getElementById('sheetInput');
  if(inp) inp.value=query;
  sheetSubmit();
}

/* ═══════════════════════════════════════════════════════════
   SHEET SUBMIT
═══════════════════════════════════════════════════════════ */
function sheetSubmit(){
  const inp=document.getElementById('sheetInput');
  const sendBtn=document.getElementById('sheetSendBtn');
  const query=(inp?.value||'').trim();
  // Empty query — show helpful prompt
  if(!query){
    addSheetMsg('ai','What are you looking for? Try:\n• "cheap car under 2 million"\n• "iPhone in Kingston"\n• "house for rent Portmore"\n• "how do I post an ad?"',null,null);
    return;
  }
  if(!_ads.length){
    addSheetMsg('ai','Listings are still loading — try again in a moment, or browse the homepage.',null,null);
    return;
  }
  inp.value='';
  saveRecentSearch(query);
  sendBtn.disabled=true;sendBtn.classList.add('sending');
  document.getElementById('sheetSugs')?.classList.add('hidden');
  document.getElementById('sheetRecentWrap')?.classList.add('hidden');
  addSheetMsg('user',query);
  const typingEl=addTyping();
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      try{
        const result=YaadBrain.process(query,sheetHistory);
        typingEl.remove();
        if(result.type==='answer'){
          addSheetMsg('ai',result.message,null,null);
          // Nudge with popular listings after FAQ answers about selling/buying
          const nudgeIntents=/how.*(post|sell|list)|how.*(contact|reach|message)|how.*(work|use)|delivery|payment/i;
          if(nudgeIntents.test(query)&&_ads.length){
            const active=_ads.filter(a=>a.status!=='sold');
            const popular=[...active].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,2);
            if(popular.length) setTimeout(function(){addSheetMsg('ai',"Here's what's listed on Yaad Adz right now 👇",popular,null,popular,[]);},400);
          }
        }else{
          _sheetLastQTerms=result._qTerms||[];
          addSheetMsg('ai',result.message,result.results,result.filters,result.allResults,_sheetLastQTerms);
        }
        sheetHistory.push({role:'user',text:query},{role:'ai',text:result.message});
        if(sheetHistory.length>8) sheetHistory=sheetHistory.slice(-8);
        updateSheetSugsAfterSearch(result);
      }catch(err){
        console.error('Brain error:',err);
        typingEl.remove();
        addSheetMsg('ai',"Something went wrong — try rephrasing your search! 🔍",null,null);
      }finally{
        sendBtn.disabled=false;sendBtn.classList.remove('sending');
        document.getElementById('sheetInput')?.focus();
      }
    },180);
  });
}

/* ── Context-aware chips after each search ── */
function updateSheetSugsAfterSearch(result){
  const wrap=document.getElementById('sheetSugs');
  if(!wrap) return;
  wrap.querySelectorAll('.sheet-sug-dynamic').forEach(el=>el.remove());
  if(!result||result.type!=='search') return;
  const cats=result.filters?.categories||[];
  const parish=result.filters?.parish||'';
  const hi=result.filters?.maxPrice;
  const catId=cats[0];
  const cat=catId?CATS.find(c=>c.id===catId):null;
  const catName=cat?cat.name.toLowerCase():'';
  const chips=[];
  if(catName){
    chips.push({label:'💰 Cheapest '+catName,query:'cheapest '+catName});
    chips.push({label:'🆕 Newest '+catName,query:'newest '+catName});
    if(parish) chips.push({label:cat.icon+' '+catName+' elsewhere',query:catName});
    else chips.push({label:'📍 '+catName+' in Kingston',query:catName+' in Kingston'});
    if(hi) chips.push({label:'💸 Higher budget '+catName,query:catName+' under '+fmtN(Math.ceil(hi*1.5))});
    chips.push({label:'🤝 Negotiable '+catName,query:'negotiable '+catName});
  }else{
    chips.push({label:'🔥 Most popular',query:'most popular'});
    chips.push({label:'🆕 Just posted',query:'newest listings'});
  }
  chips.slice(0,4).forEach(function(c){
    const btn=document.createElement('button');
    btn.className='sheet-sug sheet-sug-dynamic';
    btn.textContent=c.label;
    btn.onclick=function(){sheetSearch(c.query);};
    wrap.appendChild(btn);
  });
  wrap.classList.remove('hidden');
  wrap.style.display='';
}

/* ── Save search / Notify me ── */
const SAVED_SEARCHES_KEY='ya_saved_searches';
function getSavedSearches(){try{return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY)||'[]');}catch(e){return[];}}
function saveSearchAlert(query,filters){
  try{
    const searches=getSavedSearches();
    if(searches.find(s=>s.query===query)){showToast("Already saved! We'll notify you 🔔",'🔔');return;}
    searches.unshift({query,filters:filters||{},saved:Date.now()});
    if(searches.length>10) searches.length=10;
    localStorage.setItem(SAVED_SEARCHES_KEY,JSON.stringify(searches));
    showToast("Search saved! We'll notify you when new listings match 🔔",'🔔');
    if(typeof requestPushPermission==='function') setTimeout(requestPushPermission,1000);
  }catch(e){}
}
function checkSavedSearchAlerts(newAds){
  if(!newAds||!newAds.length) return;
  if(Notification.permission!=='granted') return;
  const searches=getSavedSearches();if(!searches.length) return;
  for(const saved of searches){
    try{
      const result=YaadBrain.process(saved.query,[]);
      if(result.type!=='search'||!result.results) continue;
      const newMatch=result.results.find(r=>newAds.some(n=>n.id===r.id));
      if(newMatch){
        const cat=CATS.find(c=>c.id===newMatch.category);
        new Notification('New listing on Yaad Adz! 🇯🇲',{body:newMatch.title+' — J$'+fmtN(newMatch.price)+' · '+newMatch.parish,icon:newMatch.image||'/og-image.jpg',tag:'yaadadz-alert-'+newMatch.id});
      }
    }catch(e){}
  }
}

function addSheetMsg(role,text,results,filters,allResults,qTerms){
  const chat=document.getElementById('sheetChat');
  const body=document.getElementById('aiSheetBody');
  const el=document.createElement('div');
  const scrollToBottom=function(){requestAnimationFrame(function(){if(body) body.scrollTop=body.scrollHeight;});};

  if(role==='user'){
    el.className='sheet-msg-user';el.textContent=text;
    chat.appendChild(el);scrollToBottom();return el;
  }

  el.className='sheet-msg-ai';
  el.innerHTML='<div class="sheet-msg-text">'+escHtml(text).replace(/\n/g,'<br>')+'</div>';

  if(results!==null){
    const count=results?results.length:0;
    const totalCount=allResults?allResults.length:count;
    const tag=document.createElement('div');
    tag.className='sheet-count-tag';
    tag.textContent=count===0?'No listings found':totalCount+' result'+(totalCount!==1?'s':'')+' — top '+Math.min(count,totalCount)+' shown';
    el.appendChild(tag);

    if(results&&results.length>0){
      const resWrap=document.createElement('div');resWrap.className='sheet-results';
      results.forEach(function(ad){
        const cat=CATS.find(function(c){return c.id===ad.category;});
        const card=document.createElement('div');card.className='sheet-result-card';
        const isNew=((Date.now()-new Date(ad.date||0))/86400000)<3;
        const negBadge=ad.neg?'<span class="src-neg-badge">neg.</span>':'';
        const newBadge=isNew?'<span class="src-new-badge">New</span>':'';
        const thumb=ad.image?'<img class="src-thumb" src="'+thumbUrl(ad.image,120)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'<div class="src-icon">'+(cat?cat.icon:'📦')+'</div>';
        card.innerHTML=thumb+'<div class="src-info"><div class="src-price">J$'+fmtN(ad.price)+' '+negBadge+newBadge+'</div><div class="src-title">'+escHtml(ad.title)+'</div><div class="src-meta">📍 '+ad.parish+' · '+(cat?cat.name:'Other')+'</div></div><div class="src-arrow">›</div>';
        card.onclick=(function(adCopy){return function(){if(qTerms&&qTerms.length)YaadBrain.learn(adCopy.id,qTerms);closeAiSheet();setTimeout(function(){openDetail(adCopy.id);},200);};})(ad);
        resWrap.appendChild(card);
      });

      // View All + Notify Me button row
      if(filters&&totalCount>0){
        const btnRow=document.createElement('div');btnRow.style.cssText='display:flex;gap:8px;margin-top:4px';
        const viewAll=document.createElement('button');viewAll.className='sheet-view-all';viewAll.style.flex='1';
        viewAll.textContent='View all '+totalCount+' results →';
        viewAll.onclick=function(){
          closeAiSheet();
          activeF=(filters.categories&&filters.categories.length===1)?filters.categories[0]:'all';
          searchQ=(filters.keywords||[]).join(' ');
          window._aiFilters=filters;compactHero();
          const inp=document.getElementById('aiInput');if(inp) inp.value=searchQ;
          renderCats();renderHome();delete window._aiFilters;
          showAiResponse(text,totalCount);scrollToResults();
        };
        btnRow.appendChild(viewAll);
        const notifyBtn=document.createElement('button');notifyBtn.className='sheet-view-all';
        notifyBtn.style.cssText='flex:0 0 auto;padding:10px 14px;font-size:12px;background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.6)';
        notifyBtn.title='Get notified when new listings match';
        const currentQuery=sheetHistory.length?sheetHistory[sheetHistory.length-2]?.text||'':'';
        const isSaved=getSavedSearches().find(s=>s.query===currentQuery);
        notifyBtn.textContent=isSaved?'🔔 Saved':'🔔 Notify me';
        notifyBtn.onclick=function(){
          if(!currentQuery) return;
          saveSearchAlert(currentQuery,filters);
          notifyBtn.textContent='🔔 Saved';notifyBtn.style.color='#1db954';notifyBtn.style.borderColor='rgba(29,185,84,0.3)';
        };
        btnRow.appendChild(notifyBtn);
        resWrap.appendChild(btnRow);
      }
      el.appendChild(resWrap);

    }else{
      // Zero results — "Did you mean?" fuzzy suggestions
      const emptyWrap=document.createElement('div');emptyWrap.style.cssText='text-align:center;padding:12px 0 4px';
      const qTokens=qTerms||[];
      const candidates=_ads.filter(a=>a.status!=='sold').map(ad=>{
        const words=ad.title.toLowerCase().split(/\s+/);
        let best=0;
        for(const qt of qTokens){for(const tw of words){const sim=YaadBrain.bigramSim(qt,tw);if(sim>best)best=sim;}}
        return{ad,score:best};
      }).filter(c=>c.score>=0.55).sort((a,b)=>b.score-a.score).slice(0,3);

      if(candidates.length){
        emptyWrap.innerHTML='<div style="font-size:28px;margin-bottom:8px">🤔</div><div style="font-size:13px;color:rgba(255,255,255,.6);margin-bottom:10px">Nothing exact — did you mean one of these?</div>';
        const dymWrap=document.createElement('div');dymWrap.style.cssText='display:flex;flex-direction:column;gap:6px;margin-bottom:12px;text-align:left';
        candidates.forEach(function(c){
          const btn=document.createElement('button');btn.className='sheet-result-card';
          btn.style.cssText='background:rgba(29,185,84,0.06);border-color:rgba(29,185,84,0.2);cursor:pointer;width:100%';
          const cat=CATS.find(function(x){return x.id===c.ad.category;});
          btn.innerHTML='<div style="font-size:20px;width:36px;text-align:center;flex-shrink:0">'+(cat?cat.icon:'📦')+'</div><div class="src-info"><div class="src-price">J$'+fmtN(c.ad.price)+'</div><div class="src-title">'+escHtml(c.ad.title)+'</div></div><div class="src-arrow" style="color:rgba(29,185,84,0.6)">›</div>';
          btn.onclick=(function(adCopy){return function(){if(qTerms&&qTerms.length)YaadBrain.learn(adCopy.id,qTerms);closeAiSheet();setTimeout(function(){openDetail(adCopy.id);},200);};})(c.ad);
          dymWrap.appendChild(btn);
        });
        emptyWrap.appendChild(dymWrap);
      }else{
        emptyWrap.innerHTML='<div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:12px">Nothing found — try these popular searches:</div>';
      }
      const sugWrap=document.createElement('div');sugWrap.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:12px';
      ['cheap car','phone Kingston','house for rent','jobs','laptop under 100k','furniture'].forEach(function(s){
        const chip=document.createElement('button');chip.className='sheet-sug';chip.textContent=s;chip.onclick=function(){sheetSearch(s);};sugWrap.appendChild(chip);
      });
      emptyWrap.appendChild(sugWrap);
      const browseBtn=document.createElement('button');browseBtn.className='sheet-view-all';browseBtn.textContent='Browse all listings →';browseBtn.onclick=function(){closeAiSheet();goHome();};
      emptyWrap.appendChild(browseBtn);el.appendChild(emptyWrap);
    }
  }

  chat.appendChild(el);scrollToBottom();return el;
}

function addTyping(){
  const chat=document.getElementById('sheetChat');
  const body=document.getElementById('aiSheetBody');
  const el=document.createElement('div');
  el.className='sheet-msg-typing';
  el.innerHTML='<span></span><span></span><span></span>';
  chat.appendChild(el);
  requestAnimationFrame(function(){if(body) body.scrollTop=body.scrollHeight;});
  return el;
}

function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

