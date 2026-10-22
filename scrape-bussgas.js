#!/usr/bin/env node
/* Imports per-station fuel prices from Bussgas (which republishes the Consumer Affairs
   Commission weekly survey) into gas-station-prices.json.
   - 1 request for the station map + 1 small request per station, spaced out (~4 min total).
   - Run weekly by .github/workflows/update-station-prices.yml. Credit shown on the site.
   Usage: node scrape-bussgas.js            (live)
          node scrape-bussgas.js --parse-only <map-file>   (parse a saved map response) */
'use strict';
const fs = require('fs');
const BASE = 'https://bussgasja.com';
const UA = 'YaadAdz-station-prices/1.0 (+https://yaadadz.com; weekly, credited to Bussgas/CAC)';
const OUT = 'gas-station-prices.json';
const DELAY_MS = 1100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/* map HTML → [{ id, name, town, lat, lon, survey }] (only stations that have a price lookup) */
function parseMap(html) {
  const calls = {};
  const re = /loadChartPopUp\((\d+),\s*'chart_(\d+)',\s*'(\d+)'\)/g;
  let m;
  while ((m = re.exec(html))) calls[m[2]] = { id: Number(m[1]), survey: m[3] };
  const out = [], seen = new Set();
  const blocks = html.split(/var marker_[0-9a-f]+ = L\.marker\(/).slice(1);
  for (const b of blocks) {
    const c = b.match(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/);
    const nm = b.match(/<h3>([\s\S]*?)<\/h3>/);
    const tw = b.match(/<\/h3>\s*<p>([\s\S]*?)<\/p>/);
    const div = b.match(/id="chart_(\d+)"/);
    if (!c || !nm || !div) continue;
    const call = calls[div[1]];
    if (!call || seen.has(call.id)) continue;
    const lat = Number(c[1]), lon = Number(c[2]);
    if (lat < 17 || lat > 19 || lon < -79 || lon > -76) continue;   // Jamaica only
    seen.add(call.id);
    out.push({ id: call.id, name: decode(nm[1]), town: decode(tw && tw[1]), lat, lon, survey: call.survey });
  }
  return out;
}

const plausible = v => { const n = Number(v); return isFinite(n) && n >= 100 && n <= 500 ? Math.round(n * 100) / 100 : null; };

function priceRecord(st, d) {
  const p = { '87': plausible(d.val_87), '90': plausible(d.val_90), diesel: plausible(d.val_Diesel), ulsd: plausible(d.val_ULSD) };
  if (!Object.values(p).some(v => v != null)) return null;
  return { id: st.id, name: st.name, town: st.town, lat: st.lat, lon: st.lon, as_of: d.validitycutoff || null, prices: p };
}

async function get(url, json) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html' } });
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return json ? await r.json() : await r.text();
    } catch (e) { if (i === 2) throw e; await sleep(2000); }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--parse-only') {
    const st = parseMap(fs.readFileSync(args[1], 'utf8'));
    console.log(st.length + ' stations; sample:', JSON.stringify(st.slice(0, 2)));
    return;
  }
  const html = await get(BASE + '/bussgas/map-content?lat=18.1&lon=-77.3&zoom=9', false);
  const stations = parseMap(html);
  console.log('stations found:', stations.length);
  if (stations.length < 100) throw new Error('Too few stations parsed (' + stations.length + ') — page layout may have changed');
  const out = [];
  let failed = 0;
  for (const st of stations) {
    await sleep(DELAY_MS);
    try {
      const d = await get(BASE + '/bussgas/station-chart/' + st.id + '/' + st.survey + '/', true);
      const rec = priceRecord(st, d);
      if (rec) out.push(rec);
    } catch (e) { failed++; console.log('skip', st.id, String(e.message || e).slice(0, 60)); }
  }
  console.log('priced stations:', out.length, 'failed:', failed);
  if (out.length < 100) throw new Error('Too few priced stations (' + out.length + ') — keeping the previous file');
  const asOf = out.map(r => r.as_of).filter(Boolean).sort().pop() || null;
  fs.writeFileSync(OUT, JSON.stringify({
    source: 'Bussgas (bussgasja.com), from the Consumer Affairs Commission weekly survey',
    scraped_at: new Date().toISOString(), survey_week_ending: asOf, count: out.length, stations: out
  }));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { parseMap, priceRecord, plausible };
