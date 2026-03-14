#!/usr/bin/env node
/**
 * Yaad Adz — Static Ad Page Generator
 * ─────────────────────────────────────
 * Pulls every active ad from Supabase and writes a standalone
 * HTML file to ./ad/<slug>.html so Google can crawl each listing.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=xxx node generate-pages.js
 *
 * Or with a .env file (needs: npm install @supabase/supabase-js dotenv)
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cquwshpsfybvgqodbxsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_j9j7NG5GhMeXqiiFnEAO-w_jeMnyY1n';
const BASE_URL     = 'https://yaadadz.com';
const OUT_DIR      = path.join(__dirname, 'ad');

// ── Helpers ───────────────────────────────────────────────────
function slugify(ad) {
  const raw = (ad.title || '') + (ad.parish ? '-' + ad.parish : '');
  return raw
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) + '-' + ad.id.slice(0, 8);
}

function fmtPrice(p) {
  return 'J$' + Number(p || 0).toLocaleString('en-JM');
}

function ago(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30)  return days + ' days ago';
  if (days < 365) return Math.floor(days / 30) + ' months ago';
  return Math.floor(days / 365) + ' years ago';
}

const CAT_ICONS = {
  vehicles:'🚗', property:'🏡', electronics:'📱', fashion:'👗',
  furniture:'🛋️', jobs:'💼', services:'🔧', food:'🥭',
  music:'🎵', sports:'⚽', kids:'🧸', other:'📦',
};
const CAT_NAMES = {
  vehicles:'Vehicles', property:'Property', electronics:'Electronics',
  fashion:'Fashion', furniture:'Furniture', jobs:'Jobs',
  services:'Services', food:'Food & Farm', music:'Music & Arts',
  sports:'Sports', kids:'Kids & Baby', other:'Other',
};

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// ── DB row → ad object ────────────────────────────────────────
function dbToAd(row) {
  let image = '', photos = [];
  try {
    const parsed = JSON.parse(row.image_url || '');
    if (Array.isArray(parsed)) { photos = parsed; image = parsed[0] || ''; }
    else { image = row.image_url || ''; photos = image ? [image] : []; }
  } catch(e) {
    image = row.image_url || '';
    if (image) photos = [image];
  }
  return {
    id: row.id, title: row.title, category: row.category,
    parish: row.parish, price: row.price, desc: row.description,
    phone: row.phone, image, photos,
    neg: row.negotiable, seller: row.seller_name,
    sellerInit: row.seller_init, sellerId: row.seller_id,
    date: row.created_at, status: row.status || 'active',
    views: row.views || 0,
  };
}

// ── JSON-LD for a single ad ───────────────────────────────────
function adSchema(ad, adUrl) {
  const PARISH_GEO = {
    'Kingston':{lat:17.9970,lng:-76.7936},'St. Andrew':{lat:18.0179,lng:-76.7997},
    'St. Thomas':{lat:17.9273,lng:-76.3445},'Portland':{lat:18.1755,lng:-76.4500},
    'St. Mary':{lat:18.3333,lng:-76.9167},'St. Ann':{lat:18.4319,lng:-77.2000},
    'Trelawny':{lat:18.3500,lng:-77.6000},'St. James':{lat:18.4762,lng:-77.8939},
    'Hanover':{lat:18.4150,lng:-78.1320},'Westmoreland':{lat:18.2000,lng:-78.1667},
    'St. Elizabeth':{lat:17.9500,lng:-77.7000},'Manchester':{lat:18.0417,lng:-77.5000},
    'Clarendon':{lat:17.9667,lng:-77.2333},'St. Catherine':{lat:17.9916,lng:-76.9564},
  };
  const geo = PARISH_GEO[ad.parish] || {lat:18.0,lng:-76.8};
  const location = {
    '@type':'Place', 'name': ad.parish + ', Jamaica',
    'address':{'@type':'PostalAddress','addressLocality':ad.parish,'addressCountry':'JM'},
    'geo':{'@type':'GeoCoordinates','latitude':geo.lat,'longitude':geo.lng},
  };
  const offer = {
    '@type':'Offer','price':ad.price,'priceCurrency':'JMD',
    'availability': ad.status==='sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    'itemCondition':'https://schema.org/UsedCondition',
    'url': adUrl,
    'seller':{'@type':'Person','name':ad.seller||'Yaad Adz Seller'},
  };
  const base = {
    '@context':'https://schema.org','@type':'Product',
    '@id': adUrl, 'name': ad.title,
    'description': ad.desc || (ad.title + ' available in ' + ad.parish + ', Jamaica'),
    'url': adUrl, 'offers': offer,
  };
  if (ad.image) base.image = {'@type':'ImageObject','url':ad.image,'description':ad.title};
  if (ad.photos && ad.photos.length > 1) base.image = ad.photos.map(p=>({'@type':'ImageObject','url':p}));
  const breadcrumb = {
    '@context':'https://schema.org','@type':'BreadcrumbList',
    'itemListElement':[
      {'@type':'ListItem','position':1,'name':'Yaad Adz','item':BASE_URL},
      {'@type':'ListItem','position':2,'name':CAT_NAMES[ad.category]||'Other','item':BASE_URL+'/?cat='+ad.category},
      {'@type':'ListItem','position':3,'name':ad.parish,'item':BASE_URL+'/?parish='+encodeURIComponent(ad.parish)},
      {'@type':'ListItem','position':4,'name':ad.title,'item':adUrl},
    ],
  };
  return [base, breadcrumb];
}

// ── Similar listings HTML ─────────────────────────────────────
function buildSimilarHTML(ad, allAds) {
  // Score: same parish + same category = best, then same category only
  const others = allAds.filter(a => a.id !== ad.id && a.status !== 'sold');

  const scored = others.map(a => {
    let score = 0;
    if (a.category === ad.category) score += 10;
    if (a.parish   === ad.parish)   score += 5;
    // Boost recent listings
    const ageDays = (Date.now() - new Date(a.date||0)) / 86400000;
    if (ageDays < 7)  score += 3;
    if (ageDays < 30) score += 1;
    return { ad: a, score };
  });

  const similar = scored
    .filter(s => s.score >= 10)   // must at least share the category
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => s.ad);

  if (!similar.length) return '';

  const cards = similar.map(a => {
    const slug     = slugify(a);
    const catIcon  = CAT_ICONS[a.category] || '📦';
    const imgHtml  = a.image
      ? `<img src="${esc(a.image)}" alt="${esc(a.title)}" loading="lazy">`
      : `<div class="sim-placeholder">${catIcon}</div>`;
    return `
      <a class="sim-card" href="${BASE_URL}/ad/${slug}.html">
        <div class="sim-img">${imgHtml}</div>
        <div class="sim-body">
          <div class="sim-price">${fmtPrice(a.price)}</div>
          <div class="sim-title">${esc(a.title)}</div>
          <div class="sim-meta">📍 ${esc(a.parish)} · ${ago(a.date)}</div>
        </div>
      </a>`;
  }).join('');

  return `
  <div class="similar-section">
    <h2 class="similar-heading">Similar Listings</h2>
    <div class="similar-grid">${cards}</div>
    <div style="text-align:center;margin-top:20px">
      <a class="see-more-btn" href="${BASE_URL}/?cat=${ad.category}">See all ${CAT_NAMES[ad.category] || 'listings'} →</a>
    </div>
  </div>`;
}

// ── HTML template for one ad page ─────────────────────────────
function buildPage(ad, allAds) {
  const slug   = slugify(ad);
  const adUrl  = BASE_URL + '/ad/' + slug;
  const catIcon = CAT_ICONS[ad.category] || '📦';
  const catName = CAT_NAMES[ad.category] || 'Other';
  const price  = fmtPrice(ad.price);
  const schemas = adSchema(ad, adUrl);
  const rawPhone = (ad.phone || '').replace(/\D/g,'');
  let waPhone = '';
  if (rawPhone.length >= 7) {
    waPhone = rawPhone.length === 7 ? '1876'+rawPhone
      : rawPhone.length === 10 && rawPhone.startsWith('876') ? '1'+rawPhone
      : rawPhone.length === 11 && rawPhone.startsWith('1') ? rawPhone
      : '1876'+rawPhone;
  }
  const waText = encodeURIComponent('Hi! I saw your ad on Yaad Adz: ' + ad.title + ' - ' + adUrl);
  const waLink = waPhone ? `https://wa.me/${waPhone}?text=${waText}` : '';

  // Gallery HTML
  let galleryHtml = '';
  const photos = ad.photos && ad.photos.length ? ad.photos : (ad.image ? [ad.image] : []);
  if (photos.length >= 1) {
    galleryHtml = `
    <div class="gallery">
      <div class="gallery-main" id="mainImg">
        <img src="${esc(photos[0])}" alt="${esc(ad.title)}" id="featuredImg" loading="eager" onclick="openLightbox(0)" style="cursor:zoom-in">
        <div class="gallery-zoom-hint" onclick="openLightbox(0)">🔍 ${photos.length > 1 ? photos.length + ' photos · tap to expand' : 'Tap to view fullscreen'}</div>
        ${ad.status === 'sold' ? '<div class="sold-ribbon">SOLD</div>' : ''}
      </div>
      ${photos.length > 1 ? `
      <div class="gallery-thumbs">
        ${photos.map((p,i) => `<img src="${esc(p)}" alt="${esc(ad.title)} photo ${i+1}" class="thumb${i===0?' active':''}" onclick="setFeatured(this,'${esc(p)}',${i})" loading="lazy">`).join('')}
      </div>` : ''}
    </div>`;
  } else {
    galleryHtml = `<div class="gallery gallery-placeholder"><span style="font-size:80px">${catIcon}</span></div>`;
  }

  const soldBadge = ad.status === 'sold'
    ? `<span class="status-badge sold">● Sold</span>`
    : `<span class="status-badge active">● Available</span>`;

  const contactHtml = ad.status !== 'sold' ? `
    <div class="contact-box">
      <div class="contact-title">Contact Seller</div>
      ${ad.phone ? `<a class="cta-btn cta-call" href="tel:${esc(ad.phone)}">📞 Call Seller</a>` : ''}
      ${waLink ? `<a class="cta-btn cta-wa" href="${waLink}" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>` : ''}
      <a class="cta-btn cta-site" href="${BASE_URL}/?ad=${ad.id}">✉️ Message on Yaad Adz</a>
    </div>` : `<div class="contact-box sold-msg">This item has been sold. <a href="${BASE_URL}/?cat=${ad.category}">Browse similar listings →</a></div>`;

  const similarHTML = buildSimilarHTML(ad, allAds);

  return `<!DOCTYPE html>
<html lang="en-JM" prefix="og: https://ogp.me/ns#">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

<title>${esc(ad.title)} — ${price} | Yaad Adz Jamaica</title>
<meta name="description" content="${esc((ad.desc||ad.title).slice(0,155))} · ${esc(ad.parish)}, Jamaica. Listed on Yaad Adz — Jamaica's free classifieds.">
<meta name="robots" content="${ad.status==='sold' ? 'noindex' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${adUrl}">

<!-- Open Graph -->
<meta property="og:type" content="product">
<meta property="og:site_name" content="Yaad Adz">
<meta property="og:title" content="${esc(ad.title)} — ${price} | Yaad Adz Jamaica">
<meta property="og:description" content="${esc((ad.desc||ad.title).slice(0,200))} · ${esc(ad.parish)}, Jamaica">
<meta property="og:url" content="${adUrl}">
<meta property="og:locale" content="en_JM">
${ad.image ? `<meta property="og:image" content="${esc(ad.image)}">
<meta property="og:image:alt" content="${esc(ad.title)}">` : `<meta property="og:image" content="${BASE_URL}/og-image.jpg">`}
<meta property="product:price:amount" content="${ad.price}">
<meta property="product:price:currency" content="JMD">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ad.title)} — ${price}">
<meta name="twitter:description" content="${esc((ad.desc||ad.title).slice(0,200))}">
${ad.image ? `<meta name="twitter:image" content="${esc(ad.image)}">` : ''}

<!-- Geo -->
<meta name="geo.region" content="JM">
<meta name="geo.placename" content="${esc(ad.parish)}, Jamaica">

<!-- JSON-LD Structured Data -->
<script type="application/ld+json">${JSON.stringify(schemas[0], null, 2)}</script>
<script type="application/ld+json">${JSON.stringify(schemas[1], null, 2)}</script>

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-F70Z3M7TJ9"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-F70Z3M7TJ9');
</script>

<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9656521698490533" crossorigin="anonymous"></script>

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,800;1,9..144,700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      #0c1e14;
    --bg2:     #112019;
    --bg3:     #172a1f;
    --green:   #1db954;
    --gold:    #f5c842;
    --text-1:  #e8ede9;
    --text-2:  #a0a8a4;
    --text-3:  #6b7a71;
    --border:  rgba(255,255,255,0.08);
    --radius:  14px;
    --font-s:  'Outfit', sans-serif;
    --font-d:  'Fraunces', serif;
    --shadow:  0 4px 24px rgba(0,0,0,0.4);
  }

  html { scroll-behavior: smooth; }

  body {
    font-family: var(--font-s);
    background: var(--bg);
    color: var(--text-1);
    min-height: 100vh;
    line-height: 1.6;
  }

  /* ── NAV ── */
  nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(12,30,20,0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    height: 56px;
    display: flex; align-items: center; gap: 16px;
  }
  .nav-logo {
    font-family: var(--font-d);
    font-weight: 800; font-size: 22px;
    color: var(--text-1);
    text-decoration: none;
    display: flex; align-items: center; gap: 6px;
  }
  .nav-logo em { color: var(--gold); font-style: italic; }
  .nav-spacer { flex: 1; }
  .nav-back {
    display: flex; align-items: center; gap: 6px;
    color: var(--text-2); font-size: 14px;
    text-decoration: none;
    padding: 6px 12px; border-radius: 8px;
    border: 1px solid var(--border);
    transition: all 0.2s;
  }
  .nav-back:hover { color: var(--text-1); border-color: var(--green); }
  .nav-post {
    background: var(--gold); color: #1a1a1a;
    font-weight: 700; font-size: 13px;
    padding: 7px 14px; border-radius: 8px;
    text-decoration: none; white-space: nowrap;
    transition: opacity 0.2s;
  }
  .nav-post:hover { opacity: 0.88; }

  /* ── BREADCRUMB ── */
  .breadcrumb {
    max-width: 960px; margin: 0 auto;
    padding: 14px 24px 0;
    font-size: 12px; color: var(--text-3);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .breadcrumb a { color: var(--text-3); text-decoration: none; }
  .breadcrumb a:hover { color: var(--green); }
  .breadcrumb span { opacity: 0.5; }

  /* ── MAIN LAYOUT ── */
  .page-wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 24px 60px;
  }

  .ad-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 28px;
    align-items: start;
    align-content: start;
    margin-top: 20px;
  }

  /* ── GALLERY ── */
  .gallery { width: 100%; }
  .gallery-main {
    position: relative;
    background: var(--bg3);
    border-radius: var(--radius);
    overflow: hidden;
    aspect-ratio: 4/3;
  }
  .gallery-main img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: opacity 0.2s;
  }
  .gallery-zoom-hint {
    position: absolute; bottom: 12px; right: 12px;
    background: rgba(0,0,0,0.55);
    color: #fff; font-size: 11px;
    padding: 5px 10px; border-radius: 20px;
    cursor: zoom-in;
    backdrop-filter: blur(4px);
    transition: opacity 0.2s;
  }
  .gallery-zoom-hint:hover { opacity: 0.8; }
  .gallery-thumbs {
    display: flex; gap: 8px;
    margin-top: 10px; flex-wrap: wrap;
  }
  .gallery-thumbs .thumb {
    width: 72px; height: 54px;
    object-fit: cover;
    border-radius: 8px;
    cursor: pointer;
    opacity: 0.6;
    border: 2px solid transparent;
    transition: all 0.2s;
  }
  .gallery-thumbs .thumb.active,
  .gallery-thumbs .thumb:hover { opacity: 1; border-color: var(--green); }
  .gallery-placeholder {
    background: var(--bg3);
    border-radius: var(--radius);
    min-height: 260px;
    display: flex; align-items: center; justify-content: center;
  }
  .sold-ribbon {
    position: absolute; top: 16px; left: 0;
    background: #e53935; color: #fff;
    font-weight: 800; font-size: 13px; letter-spacing: 2px;
    padding: 6px 16px;
    border-radius: 0 6px 6px 0;
  }

  /* ── RIGHT PANEL ── */
  .ad-panel {
    position: sticky; top: 76px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .price-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px;
  }
  .price-main {
    font-family: var(--font-d);
    font-size: 32px; font-weight: 800;
    color: var(--green);
    line-height: 1.1;
  }
  .price-neg {
    font-size: 13px; font-weight: 400;
    color: var(--text-3); margin-top: 2px;
  }
  .ad-title-panel {
    font-size: 18px; font-weight: 700;
    color: var(--text-1); margin-top: 10px; line-height: 1.3;
  }
  .ad-meta-tags {
    display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
  }
  .meta-tag {
    background: rgba(255,255,255,0.06);
    border-radius: 20px; padding: 4px 12px;
    font-size: 12px; color: var(--text-2);
  }
  .status-badge {
    padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;
  }
  .status-badge.active { background: rgba(29,185,84,0.15); color: var(--green); }
  .status-badge.sold   { background: rgba(229,57,53,0.15); color: #e53935; }

  /* ── CONTACT BOX ── */
  .contact-box {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .contact-title {
    font-weight: 700; font-size: 14px; color: var(--text-2);
    margin-bottom: 2px;
  }
  .cta-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px 16px; border-radius: 10px;
    font-weight: 600; font-size: 15px;
    text-decoration: none; transition: opacity 0.2s;
    cursor: pointer;
  }
  .cta-btn:hover { opacity: 0.85; }
  .cta-call { background: var(--green); color: #fff; }
  .cta-wa   { background: #25d366; color: #fff; }
  .cta-site { background: rgba(255,255,255,0.08); color: var(--text-1); border: 1px solid var(--border); }
  .sold-msg { font-size: 14px; color: var(--text-2); }
  .sold-msg a { color: var(--green); }

  /* ── AD BODY (left column below gallery) ── */
  .ad-body { display: flex; flex-direction: column; gap: 20px; }
  .section-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }
  .section-card h2 {
    font-family: var(--font-d);
    font-size: 17px; font-weight: 800;
    color: var(--text-1); margin-bottom: 12px;
  }
  .desc-text {
    font-size: 15px; color: var(--text-2);
    line-height: 1.75; white-space: pre-wrap;
  }
  .seller-row {
    display: flex; align-items: center; gap: 14px;
  }
  .seller-avatar {
    width: 46px; height: 46px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; flex-shrink: 0;
    background: #1db954; color: #fff;
  }
  .seller-name { font-weight: 700; font-size: 15px; color: var(--text-1); }
  .seller-sub  { font-size: 12px; color: var(--text-3); margin-top: 2px; }

  /* ── AD SLOT ── */
  .ad-slot-wrap {
    margin: 8px 0;
    min-height: 0;
    background: transparent;
    border-radius: var(--radius);
    overflow: hidden;
  }
  .ad-slot-wrap:has(ins[data-adsbygoogle-status]) {
    min-height: 90px;
    background: rgba(255,255,255,0.02);
  }

  /* ── SIMILAR LISTINGS ── */
  .similar-section {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px 60px;
  }
  .similar-heading {
    font-family: var(--font-d);
    font-size: 22px; font-weight: 800;
    color: var(--text-1);
    margin-bottom: 18px;
  }
  .similar-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .sim-card {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
    display: flex; flex-direction: column;
  }
  .sim-card:hover {
    transform: translateY(-3px);
    border-color: var(--green);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .sim-img {
    width: 100%; aspect-ratio: 4/3;
    overflow: hidden; background: var(--bg2);
    display: flex; align-items: center; justify-content: center;
  }
  .sim-img img {
    width: 100%; height: 100%; object-fit: cover;
    display: block; transition: transform 0.2s;
  }
  .sim-card:hover .sim-img img { transform: scale(1.04); }
  .sim-placeholder { font-size: 36px; }
  .sim-body { padding: 12px; flex: 1; }
  .sim-price {
    font-family: var(--font-d);
    font-size: 16px; font-weight: 800;
    color: var(--green); margin-bottom: 4px;
  }
  .sim-title {
    font-size: 13px; font-weight: 600;
    color: var(--text-1); line-height: 1.4;
    margin-bottom: 6px;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .sim-meta { font-size: 11px; color: var(--text-3); }
  .see-more-btn {
    display: inline-block;
    padding: 10px 24px; border-radius: 10px;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--border);
    color: var(--text-2); font-size: 14px; font-weight: 600;
    text-decoration: none; transition: all 0.2s;
  }
  .see-more-btn:hover { border-color: var(--green); color: var(--green); }

  /* ── LIGHTBOX ── */
  .lightbox {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.96);
    z-index: 9999;
    align-items: center; justify-content: center; flex-direction: column;
  }
  .lightbox.open { display: flex; }
  .lb-img {
    max-width: 95vw; max-height: 85vh;
    object-fit: contain; border-radius: 6px;
    user-select: none; display: block;
  }
  .lb-close {
    position: absolute; top: 16px; right: 16px;
    background: rgba(255,255,255,0.15); color: #fff;
    border: none; border-radius: 50%;
    width: 40px; height: 40px; font-size: 20px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
  }
  .lb-close:hover { background: rgba(255,255,255,0.3); }
  .lb-nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    background: rgba(255,255,255,0.15); color: #fff;
    border: none; border-radius: 50%;
    width: 48px; height: 48px; font-size: 26px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
  }
  .lb-nav:hover { background: rgba(255,255,255,0.3); }
  .lb-prev { left: 16px; }
  .lb-next { right: 16px; }
  .lb-counter {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    color: rgba(255,255,255,0.65); font-size: 13px;
  }
  .lb-dots {
    position: absolute; bottom: 44px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px;
  }
  .lb-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: rgba(255,255,255,0.35); cursor: pointer; transition: background 0.2s;
  }
  .lb-dot.active { background: #fff; }

  /* ── FOOTER ── */
  footer {
    background: var(--bg2);
    border-top: 1px solid var(--border);
    text-align: center;
    padding: 28px 24px;
    font-size: 13px; color: var(--text-3);
  }
  footer a { color: var(--text-3); text-decoration: none; margin: 0 8px; }
  footer a:hover { color: var(--green); }
  .footer-logo { font-family: var(--font-d); font-size: 18px; font-weight: 800; color: var(--text-1); margin-bottom: 8px; }
  .footer-logo em { color: var(--gold); font-style: italic; }

  /* ── RESPONSIVE ── */
  @media (max-width: 700px) {
    .ad-layout { grid-template-columns: 1fr; }
    .ad-panel { position: static; }
    .page-wrap { padding: 16px 16px 48px; }
    nav { padding: 0 16px; }
    .breadcrumb { padding: 12px 16px 0; }
    .price-main { font-size: 26px; }
    .similar-section { padding: 0 16px 48px; }
    .similar-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .lb-nav { width: 38px; height: 38px; font-size: 20px; }
  }
</style>
</head>
<body>

<nav>
  <a class="nav-logo" href="${BASE_URL}">
    <span>🇯🇲</span>Yaad <em>Adz</em>
  </a>
  <div class="nav-spacer"></div>
  <a class="nav-back" href="${BASE_URL}/?cat=${ad.category}">← ${catName}</a>
  <a class="nav-post" href="${BASE_URL}/?post=1">+ Post Ad</a>
</nav>

<div class="breadcrumb">
  <a href="${BASE_URL}">Yaad Adz</a>
  <span>›</span>
  <a href="${BASE_URL}/?cat=${ad.category}">${catIcon} ${catName}</a>
  <span>›</span>
  <a href="${BASE_URL}/?parish=${encodeURIComponent(ad.parish)}">${esc(ad.parish)}</a>
  <span>›</span>
  <span style="color:var(--text-2)">${esc(ad.title.slice(0,40))}${ad.title.length>40?'…':''}</span>
</div>

<div class="page-wrap">
  <div class="ad-layout">

    <!-- LEFT: Gallery + Description -->
    <div class="ad-body">
      ${galleryHtml}

      <div class="section-card">
        <h2>Description</h2>
        <p class="desc-text">${esc(ad.desc || 'No description provided.')}</p>
      </div>

      <div class="section-card">
        <h2>Seller</h2>
        <div class="seller-row">
          <div class="seller-avatar">${esc(ad.sellerInit || (ad.seller||'?').charAt(0))}</div>
          <div>
            <div class="seller-name">${esc(ad.seller || 'Anonymous')}</div>
            <div class="seller-sub">Yaad Adz Member · ${esc(ad.parish)}</div>
          </div>
        </div>
      </div>

      <!-- AdSense in-content — only shown on listings with real content -->
      ${(ad.desc && ad.desc.trim().length > 30 && photos.length > 0) ? `
      <div class="ad-slot-wrap">
        <ins class="adsbygoogle"
          style="display:block"
          data-ad-client="ca-pub-9656521698490533"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
      </div>` : ''}
    </div>

    <!-- RIGHT: Price + Contact -->
    <div class="ad-panel">
      <div class="price-card">
        <div class="price-main">${price}</div>
        ${ad.neg ? '<div class="price-neg">Price is negotiable</div>' : ''}
        <div class="ad-title-panel">${esc(ad.title)}</div>
        <div class="ad-meta-tags">
          <span class="meta-tag">📍 ${esc(ad.parish)}</span>
          <span class="meta-tag">${catIcon} ${catName}</span>
          <span class="meta-tag">🕐 ${ago(ad.date)}</span>
          ${soldBadge}
        </div>
      </div>

      ${contactHtml}

      <!-- AdSense sidebar — only shown on listings with real content -->
      ${(ad.desc && ad.desc.trim().length > 30 && photos.length > 0) ? `
      <div class="ad-slot-wrap">
        <ins class="adsbygoogle"
          style="display:block"
          data-ad-client="ca-pub-9656521698490533"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
      </div>` : ''}
    </div>

  </div>
</div>

<!-- SIMILAR LISTINGS -->
${similarHTML}

<footer>
  <div class="footer-logo">Yaad <em>Adz</em> 🇯🇲</div>
  <p>Jamaica's free classifieds marketplace</p>
  <div style="margin-top:10px">
    <a href="${BASE_URL}">Home</a>
    <a href="${BASE_URL}/?cat=vehicles">Cars</a>
    <a href="${BASE_URL}/?cat=property">Property</a>
    <a href="${BASE_URL}/?cat=electronics">Electronics</a>
    <a href="${BASE_URL}/?cat=jobs">Jobs</a>
  </div>
  <p style="margin-top:10px">© 2025 Yaad Adz · Made with ❤️ in Jamaica</p>
</footer>

<!-- LIGHTBOX -->
<div class="lightbox" id="lightbox" onclick="if(event.target===this)closeLightbox()">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <button class="lb-nav lb-prev" id="lbPrev" onclick="lbNav(-1)">‹</button>
  <img class="lb-img" id="lbImg" src="" alt="${esc(ad.title)}">
  <button class="lb-nav lb-next" id="lbNext" onclick="lbNav(1)">›</button>
  <div class="lb-dots" id="lbDots"></div>
  <div class="lb-counter" id="lbCounter"></div>
</div>

<script>
  // ── Photos array ─────────────────────────────────────────────
  var PHOTOS = ${JSON.stringify(photos)};
  var lbIndex = 0;

  // ── Thumbnail switcher ────────────────────────────────────────
  function setFeatured(thumb, src, idx) {
    var img = document.getElementById('featuredImg');
    img.style.opacity = '0';
    setTimeout(function() { img.src = src; img.style.opacity = '1'; }, 150);
    document.querySelectorAll('.thumb').forEach(function(t) { t.classList.remove('active'); });
    thumb.classList.add('active');
    lbIndex = idx;
  }

  // ── Lightbox ──────────────────────────────────────────────────
  function openLightbox(startIndex) {
    if (!PHOTOS.length) return;
    lbIndex = startIndex || 0;
    document.getElementById('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderLightbox();
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.body.style.overflow = '';
  }
  function lbNav(dir) {
    lbIndex = (lbIndex + dir + PHOTOS.length) % PHOTOS.length;
    renderLightbox();
  }
  function lbGoTo(i) { lbIndex = i; renderLightbox(); }
  function renderLightbox() {
    var img = document.getElementById('lbImg');
    img.src = PHOTOS[lbIndex];

    // Counter
    document.getElementById('lbCounter').textContent = (lbIndex + 1) + ' / ' + PHOTOS.length;

    // Nav arrows
    var showNav = PHOTOS.length > 1;
    document.getElementById('lbPrev').style.display = showNav ? '' : 'none';
    document.getElementById('lbNext').style.display = showNav ? '' : 'none';

    // Dots
    var dotsEl = document.getElementById('lbDots');
    if (PHOTOS.length > 1 && PHOTOS.length <= 10) {
      dotsEl.innerHTML = PHOTOS.map(function(_, i) {
        return '<span class="lb-dot' + (i === lbIndex ? ' active' : '') + '" onclick="lbGoTo(' + i + ')"></span>';
      }).join('');
      dotsEl.style.display = 'flex';
    } else {
      dotsEl.style.display = 'none';
    }
  }

  // Keyboard nav
  document.addEventListener('keydown', function(e) {
    var lb = document.getElementById('lightbox');
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   lbNav(-1);
    if (e.key === 'ArrowRight')  lbNav(1);
  });

  // Touch swipe
  (function() {
    var sx = 0;
    var lb = document.getElementById('lightbox');
    lb.addEventListener('touchstart', function(e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend',   function(e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) lbNav(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  // ── Push AdSense ──────────────────────────────────────────────
  window.addEventListener('load', function() {
    try {
      var ads = document.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
      ads.forEach(function() { (adsbygoogle = window.adsbygoogle || []).push({}); });
    } catch(e) {}
  });
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('🇯🇲 Yaad Adz — Ad Page Generator');
  console.log('──────────────────────────────────');

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('📁 Created ./ad/ directory');
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('🔌 Connecting to Supabase…');

  let allRows = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await db
      .from('ads')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('❌ Supabase error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(\`📋 Found \${allRows.length} ads\`);

  const allAds = allRows.map(dbToAd);

  const existingFiles = new Set(
    fs.existsSync(OUT_DIR)
      ? fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.html'))
      : []
  );
  const generatedFiles = new Set();

  let created = 0, deleted = 0;

  for (const ad of allAds) {
    const slug = slugify(ad);
    const file = slug + '.html';
    const dest = path.join(OUT_DIR, file);
    generatedFiles.add(file);
    const html = buildPage(ad, allAds);
    fs.writeFileSync(dest, html, 'utf8');
    created++;
    if (created % 50 === 0) console.log(\`  ✅ \${created} pages written…\`);
  }

  for (const file of existingFiles) {
    if (!generatedFiles.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      deleted++;
    }
  }

  // ── Generate sitemap.xml ──────────────────────────────────────
  console.log('🗺️  Generating sitemap.xml…');
  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { url: BASE_URL + '/',                    priority: '1.0', changefreq: 'hourly'  },
    { url: BASE_URL + '/?cat=vehicles',       priority: '0.9', changefreq: 'hourly'  },
    { url: BASE_URL + '/?cat=property',       priority: '0.9', changefreq: 'hourly'  },
    { url: BASE_URL + '/?cat=electronics',    priority: '0.9', changefreq: 'hourly'  },
    { url: BASE_URL + '/?cat=fashion',        priority: '0.8', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=furniture',      priority: '0.8', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=jobs',           priority: '0.9', changefreq: 'hourly'  },
    { url: BASE_URL + '/?cat=services',       priority: '0.8', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=food',           priority: '0.7', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=music',          priority: '0.7', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=sports',         priority: '0.7', changefreq: 'daily'   },
    { url: BASE_URL + '/?cat=kids',           priority: '0.7', changefreq: 'daily'   },
    { url: BASE_URL + '/?parish=Kingston',          priority: '0.8', changefreq: 'hourly' },
    { url: BASE_URL + '/?parish=St.%20Andrew',      priority: '0.8', changefreq: 'hourly' },
    { url: BASE_URL + '/?parish=St.%20Catherine',   priority: '0.8', changefreq: 'hourly' },
    { url: BASE_URL + '/?parish=St.%20James',       priority: '0.8', changefreq: 'hourly' },
    { url: BASE_URL + '/?parish=Manchester',        priority: '0.7', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=St.%20Ann',         priority: '0.7', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=Clarendon',         priority: '0.7', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=Westmoreland',      priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=St.%20Elizabeth',   priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=Portland',          priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=St.%20Mary',        priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=St.%20Thomas',      priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=Trelawny',          priority: '0.6', changefreq: 'daily'  },
    { url: BASE_URL + '/?parish=Hanover',           priority: '0.6', changefreq: 'daily'  },
  ];

  const activeAds = allAds.filter(ad => ad.status !== 'sold');
  const adEntries = activeAds.map(ad => {
    const lastmod = ad.date ? new Date(ad.date).toISOString().split('T')[0] : today;
    return { url: BASE_URL + '/ad/' + slugify(ad) + '.html', lastmod, priority: '0.8', changefreq: 'weekly', image: ad.image || null, title: ad.title };
  });

  const staticXml = staticPages.map(p => \`
  <url>
    <loc>\${p.url}</loc>
    <lastmod>\${today}</lastmod>
    <changefreq>\${p.changefreq}</changefreq>
    <priority>\${p.priority}</priority>
  </url>\`).join('');

  const adXml = adEntries.map(p => \`
  <url>
    <loc>\${p.url}</loc>
    <lastmod>\${p.lastmod}</lastmod>
    <changefreq>\${p.changefreq}</changefreq>
    <priority>\${p.priority}</priority>\${p.image ? \`
    <image:image>
      <image:loc>\${p.image}</image:loc>
      <image:title>\${p.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</image:title>
    </image:image>\` : ''}
  </url>\`).join('');

  const sitemap = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <!-- Generated by Yaad Adz on \${new Date().toISOString()} -->
  <!-- \${staticPages.length} static pages + \${adEntries.length} active listings -->
\${staticXml}
\${adXml}
</urlset>\`;

  fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap, 'utf8');
  console.log(\`   ✅ sitemap.xml written — \${staticPages.length} static + \${adEntries.length} ad pages\`);

  const robotsPath = path.join(__dirname, 'robots.txt');
  let robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : '';
  if (!robots.includes('Sitemap:')) {
    robots += \`\nSitemap: \${BASE_URL}/sitemap.xml\n\`;
    fs.writeFileSync(robotsPath, robots, 'utf8');
    console.log('   ✅ robots.txt updated with Sitemap link');
  }

  console.log('');
  console.log(\`✅ Done!\`);
  console.log(\`   📄 \${created} ad pages written to ./ad/\`);
  if (deleted) console.log(\`   🗑️  \${deleted} stale pages deleted\`);
  console.log(\`   🗺️  sitemap.xml updated (\${staticPages.length + adEntries.length} URLs total)\`);
  if (allRows.length > 0) console.log(\`   🌐 Example: \${BASE_URL}/ad/\${slugify(dbToAd(allRows[0]))}.html\`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
