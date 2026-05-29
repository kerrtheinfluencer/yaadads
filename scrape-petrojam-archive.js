#!/usr/bin/env node
/**
 * Scrape Petrojam Prices Archive (https://www.petrojam.com/price/)
 * Writes gas-prices-data.json for gas-prices.html and optional Supabase upsert.
 *
 * Usage:
 *   node scrape-petrojam-archive.js
 *   SUPABASE_URL=... SUPABASE_KEY=... node scrape-petrojam-archive.js --db
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ARCHIVE_URL = 'https://www.petrojam.com/price/';
const OUT_FILE = path.join(__dirname, 'gas-prices-data.json');
const WEEKS_FOR_CHART = 12;

const FUEL_META = {
  '87':      { name: 'Gasolene 87', icon: '⛽', color: '#22c55e', class: 'gasoline-87' },
  '90':      { name: 'Gasolene 90', icon: '🔥', color: '#3b82f6', class: 'gasoline-90' },
  diesel:    { name: 'Auto Diesel', icon: '🛢️', color: '#f97316', class: 'diesel' },
  ulsd:      { name: 'ULSD', icon: '⚡', color: '#7c3aed', class: 'ulsd' },
  kerosene:  { name: 'Kerosene', icon: '🔥', color: '#ec4899', class: 'kerosene' },
  propane:   { name: 'Propane', icon: '💨', color: '#06b6d4', class: 'propane' },
  butane:    { name: 'Butane', icon: '🔥', color: '#f59e0b', class: 'butane' },
};

const COL_KEYS = ['87', '90', 'diesel', 'kerosene', 'propane', 'butane', 'hfo', 'asphalt', 'ulsd'];

function fetchPage(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchPage(next, timeoutMs));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/** Parse "May 28, 2026" → ISO date YYYY-MM-DD (Thursday anchor week) */
function parseArchiveDate(str) {
  const d = new Date(str.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('en-JM', { month: 'short', day: 'numeric' });
}

function formatDisplayDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return d.toLocaleDateString('en-JM', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Parse archive table rows from HTML.
 * Each data row: |May 28, 2026|194.1328|201.5787|...
 */
/** Years available in archive dropdown (Toolset Views: wpcf_price_date) */
function parseYearOptions(html) {
  const years = new Set();
  const re = /<option value="(20\d{2})">/g;
  let m;
  while ((m = re.exec(html))) years.add(m[1]);
  return [...years].sort((a, b) => Number(b) - Number(a));
}

function parseArchiveTable(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html))) {
    const inner = trMatch[1];
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(inner))) {
      const text = tdMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) cells.push(text);
    }
    if (cells.length < 10) continue;
    const dateStr = cells[0];
    if (!/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(dateStr)) continue;

    const iso = parseArchiveDate(dateStr);
    if (!iso) continue;

    const prices = {};
    COL_KEYS.forEach((key, i) => {
      const val = parseFloat(cells[i + 1]);
      if (!isNaN(val)) prices[key] = val;
    });

    rows.push({ date: dateStr, week_of: iso, prices });
  }

  // Newest first on page — sort descending by date
  rows.sort((a, b) => (a.week_of < b.week_of ? 1 : a.week_of > b.week_of ? -1 : 0));
  return rows;
}

function buildPayload(archiveRows) {
  if (!archiveRows.length) throw new Error('No price rows parsed from archive');

  const latest = archiveRows[0];
  const chartFuels = ['87', '90', 'diesel', 'ulsd', 'kerosene', 'propane'];
  const chartRows = archiveRows.slice(0, WEEKS_FOR_CHART).reverse(); // oldest → newest

  const history = { weeks: chartRows.map((r) => formatWeekLabel(r.week_of)) };
  chartFuels.forEach((key) => {
    history[key] = chartRows.map((r) => r.prices[key] ?? null);
  });

  const prevWeek = archiveRows[1] || null;
  const week4 = archiveRows[4] || null;

  const prevWeekMap = prevWeek ? prevWeek.prices : {};
  const week4Map = week4 ? week4.prices : {};

  const prices = Object.keys(FUEL_META)
    .filter((key) => latest.prices[key] != null)
    .map((key) => ({
      key,
      ...FUEL_META[key],
      exRefinery: latest.prices[key],
    }));

  return {
    source: 'https://www.petrojam.com/price/',
    scraped_at: new Date().toISOString(),
    week_of: latest.week_of,
    price_date: latest.date,
    last_updated_display: formatDisplayDate(latest.week_of),
    prices,
    history,
    comparisons: {
      prev_week: prevWeekMap,
      week_4_ago: week4Map,
    },
    archive_count: archiveRows.length,
    archive_oldest: archiveRows[archiveRows.length - 1].week_of,
    archive_newest: latest.week_of,
  };
}

/** Flatten rows for Supabase petrojam_prices table */
function rowsForDb(archiveRows) {
  const out = [];
  for (const row of archiveRows) {
    for (const [fuel_type, ex_refinery_price] of Object.entries(row.prices)) {
      if (!FUEL_META[fuel_type] && fuel_type !== 'hfo' && fuel_type !== 'asphalt') {
        // still store hfo/asphalt if present
      }
      if (ex_refinery_price == null || isNaN(ex_refinery_price)) continue;
      out.push({ week_of: row.week_of, fuel_type, ex_refinery_price });
    }
  }
  return out;
}

async function upsertSupabase(archiveRows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.warn('⚠️  SUPABASE_URL/KEY not set — skipping DB upsert');
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(url, key);
  const records = rowsForDb(archiveRows);
  console.log('📤 Upserting', records.length, 'rows to petrojam_prices…');

  const BATCH = 200;
  let ok = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await db
      .from('petrojam_prices')
      .upsert(batch, { onConflict: 'week_of,fuel_type', ignoreDuplicates: false });
    if (error) throw new Error('Supabase upsert: ' + error.message);
    ok += batch.length;
  }
  console.log('   ✅', ok, 'records upserted');
}

async function fetchAllArchiveRows() {
  const firstHtml = await fetchPage(ARCHIVE_URL);
  const years = parseYearOptions(firstHtml);
  const currentYear = new Date().getFullYear();
  const minListed = years.length ? Math.min(...years.map(Number)) : currentYear - 5;
  // Petrojam's dropdown skips some years; query them anyway (e.g. 2022–2025).
  for (let y = currentYear; y >= minListed; y--) {
    const s = String(y);
    if (!years.includes(s)) years.push(s);
  }
  years.sort((a, b) => Number(b) - Number(a));

  const byWeek = new Map();

  function mergeRows(rows) {
    for (const row of rows) {
      if (!byWeek.has(row.week_of)) byWeek.set(row.week_of, row);
    }
  }

  console.log('   Years in archive:', years.join(', '));

  // Default view = current year (most recent weeks)
  mergeRows(parseArchiveTable(firstHtml));

  // Each year filter adds ~20 more weeks (Petrojam paginates the table)
  for (const year of years) {
    const url = ARCHIVE_URL + '?wpcf_price_date=' + year;
    console.log('   Fetching', year, '…');
    const html = await fetchPage(url);
    mergeRows(parseArchiveTable(html));
    await new Promise((r) => setTimeout(r, 400));
  }

  return [...byWeek.values()].sort((a, b) =>
    (a.week_of < b.week_of ? 1 : a.week_of > b.week_of ? -1 : 0));
}

async function main() {
  const writeDb = process.argv.includes('--db');

  console.log('⛽ Petrojam archive scraper');
  console.log('   Fetching', ARCHIVE_URL);

  const archiveRows = await fetchAllArchiveRows();
  if (archiveRows.length < 3) {
    throw new Error('Only parsed ' + archiveRows.length + ' rows — archive HTML may have changed');
  }

  console.log('   Parsed', archiveRows.length, 'unique weekly rows');
  console.log('   Range:', archiveRows[archiveRows.length - 1].date, '→', archiveRows[0].date);
  console.log('   Latest:', archiveRows[0].date);
  archiveRows[0].prices && Object.entries(archiveRows[0].prices).forEach(([k, v]) => {
    if (['87', '90', 'diesel', 'ulsd', 'kerosene', 'propane'].includes(k)) {
      console.log('     ', k + ':', 'J$' + v);
    }
  });

  const payload = buildPayload(archiveRows);
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log('   ✅ Wrote', OUT_FILE);

  if (writeDb) await upsertSupabase(archiveRows);
}

main().catch((err) => {
  console.error('💥', err.message);
  process.exit(1);
});
