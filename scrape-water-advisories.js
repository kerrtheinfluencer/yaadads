#!/usr/bin/env node
/**
 * scrape-water-advisories.js
 * ───────────────────────────────────────────────────────────────────────
 * Pulls the NWC "Advisories & Disruptions" page and upserts what it finds
 * into the water_advisories table (Yaad Adz's Supabase project).
 *
 * IMPORTANT — read this before running in production:
 * nwcjamaica.com/advisories.php renders its full, filterable advisory list
 * client-side via JS (the raw HTML only contains a short marquee/ticker of
 * current headlines). I couldn't inspect that page's live network requests
 * from here to find the underlying JSON endpoint it calls — if you open the
 * page in Chrome DevTools → Network → XHR/Fetch and reload, you'll likely
 * find a request returning clean structured JSON (parish, cause, status,
 * dates already split out). If you find that URL, scraping becomes far
 * more reliable than what this script does — paste me the endpoint and
 * a sample response and I'll swap PARSE_STRATEGY below to use it directly.
 *
 * Until then, this scrapes the server-rendered ticker text using parish
 * names as anchors, since that doesn't depend on knowing exact CSS
 * selectors/class names I haven't been able to see. It will be less
 * complete (ticker only shows a handful of headlines, no explicit times)
 * but should still surface real, current disruptions by parish.
 *
 * Run: node scrape-water-advisories.js
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY  (service_role key — bypasses RLS)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cquwshpsfybvgqodbxsf.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADVISORIES_URL = 'https://nwcjamaica.com/advisories.php';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY env var. Set it as a GitHub Actions secret.');
  process.exit(1);
}

const PARISHES = [
  'Kingston', 'St. Andrew', 'St Andrew', 'St. Thomas', 'St Thomas',
  'Portland', 'St. Mary', 'St Mary', 'St. Ann', 'St Ann',
  'Trelawny', 'St. James', 'St James', 'Hanover', 'Westmoreland',
  'St. Elizabeth', 'St Elizabeth', 'Manchester', 'Clarendon',
  'St. Catherine', 'St Catherine'
];

// Normalize "St Ann" / "St. Ann" / "ST. ANN" → "St. Ann" (canonical form
// used as the parish column value and matched by water.html).
function canonicalParish(raw) {
  const stripped = raw.replace(/^ST\.?\s+/i, 'St. ').trim();
  const map = {
    'St. Andrew': 'St. Andrew', 'St. Thomas': 'St. Thomas', 'St. Mary': 'St. Mary',
    'St. Ann': 'St. Ann', 'St. James': 'St. James', 'St. Elizabeth': 'St. Elizabeth',
    'St. Catherine': 'St. Catherine'
  };
  for (const [k, v] of Object.entries(map)) {
    if (stripped.toUpperCase().includes(k.toUpperCase().replace('.', ''))) return v;
  }
  const simple = ['Kingston', 'Portland', 'Trelawny', 'Hanover', 'Westmoreland', 'Manchester', 'Clarendon'];
  for (const p of simple) if (stripped.toUpperCase() === p.toUpperCase()) return p;
  return null;
}

function classifyCause(title) {
  const t = title.toUpperCase();
  if (/JPS|POWER|ELECTRICAL|ELECTRIC/.test(t)) return 'power';
  if (/TURBID|QUALITY/.test(t)) return 'quality';
  if (/PIPELINE|MAIN\b|MAINS|VALVE|BURST|LEAK/.test(t)) return 'pipeline';
  if (/PUMP|MECHANICAL|EQUIPMENT|FACILITY ISSUE/.test(t)) return 'mechanical';
  if (/SCHEDULED|MAINTENANCE|PLANNED|EXTRACTION/.test(t)) return 'maintenance';
  return 'other';
}

function classifyStatus(title) {
  const t = title.toUpperCase();
  if (/SCHEDULED|PLANNED|WILL BE|TO BE CARRIED OUT|UPCOMING/.test(t)) return 'planned';
  return 'current';
}

function fingerprint(parish, title) {
  const norm = (parish || 'unknown') + '::' + title.toLowerCase().replace(/\s+/g, ' ').trim();
  // Simple, dependency-free hash — good enough for a unique-ish fingerprint.
  let h = 0;
  for (let i = 0; i < norm.length; i++) { h = (h * 31 + norm.charCodeAt(i)) | 0; }
  return 'fp_' + Math.abs(h).toString(36) + '_' + norm.length;
}

/**
 * Splits the concatenated ticker text into individual advisory headlines
 * using parish names as anchors. NWC headlines consistently end with the
 * affected parish (e.g. "...AT THE SEVILLE#1 FACILITY, ST. ANN"), so we
 * find each parish occurrence and cut the string there.
 */
function splitTickerText(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const anchors = [];
  const parishPattern = new RegExp(PARISHES.map(p => p.replace('.', '\\.?')).join('|'), 'gi');
  let m;
  while ((m = parishPattern.exec(text)) !== null) {
    anchors.push({ index: m.index, length: m[0].length, matched: m[0] });
  }
  if (!anchors.length) return [];

  const items = [];
  let cursor = 0;
  for (const a of anchors) {
    const end = a.index + a.length;
    const chunk = text.slice(cursor, end).trim();
    if (chunk.length > 8) {
      items.push({ title: chunk, parish: canonicalParish(a.matched) });
    }
    cursor = end;
  }
  return items;
}

async function fetchAdvisoriesPage() {
  const res = await fetch(ADVISORIES_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YaadAdzWaterTracker/1.0)' }
  });
  if (!res.ok) throw new Error('Failed to fetch advisories page: HTTP ' + res.status);
  return res.text();
}

async function supabaseUpsert(rows) {
  if (!rows.length) return;
  const res = await fetch(SUPABASE_URL + '/rest/v1/water_advisories?on_conflict=fingerprint', {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Supabase upsert failed: HTTP ' + res.status + ' ' + body);
  }
}

async function markMissingAsResolved(seenFingerprints) {
  // Fetch currently-active rows, then resolve any not seen in this pass.
  const res = await fetch(SUPABASE_URL + '/rest/v1/water_advisories?is_active=eq.true&select=id,fingerprint', {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  if (!res.ok) return;
  const active = await res.json();
  const toResolve = active.filter(r => !seenFingerprints.has(r.fingerprint)).map(r => r.id);
  if (!toResolve.length) return;

  const res2 = await fetch(SUPABASE_URL + '/rest/v1/water_advisories?id=in.(' + toResolve.join(',') + ')', {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ is_active: false, resolved_at: new Date().toISOString() })
  });
  if (!res2.ok) {
    const body = await res2.text().catch(() => '');
    console.error('Failed to mark resolved:', res2.status, body);
  } else {
    console.log('Resolved ' + toResolve.length + ' advisories no longer listed.');
  }
}

async function main() {
  console.log('Fetching', ADVISORIES_URL);
  const html = await fetchAdvisoriesPage();

  // Strip tags to get plain text (crude but dependency-free), then split.
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

  const items = splitTickerText(text);
  if (!items.length) {
    console.log('No advisories found in ticker text — page may have changed, or genuinely nothing active.');
    return;
  }

  const now = new Date().toISOString();
  const seen = new Set();
  const rows = items.map(it => {
    const fp = fingerprint(it.parish, it.title);
    seen.add(fp);
    return {
      fingerprint: fp,
      parish: it.parish,
      title: it.title,
      cause: classifyCause(it.title),
      status: classifyStatus(it.title),
      last_seen_at: now,
      is_active: true
      // first_seen_at defaults to now() only on insert; upsert with
      // merge-duplicates won't overwrite it on an existing row since it's
      // not in Prefer's merge target list behavior for unspecified... to be
      // safe, Postgres upsert here WILL overwrite first_seen_at too, since
      // Supabase's on_conflict merge replaces all provided columns. That's
      // acceptable for now (loses exact first-seen time on re-runs) — flag
      // this as a known simplification if precise first-seen tracking matters.
    };
  });

  console.log('Parsed ' + rows.length + ' advisories:');
  rows.forEach(r => console.log('  [' + r.parish + '] ' + r.cause + '/' + r.status + ': ' + r.title));

  await supabaseUpsert(rows);
  await markMissingAsResolved(seen);
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
