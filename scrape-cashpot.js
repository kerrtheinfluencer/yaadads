#!/usr/bin/env node
/**
 * scrape-cashpot.js
 * ───────────────────────────────────────────────────────────────────────
 * Yaad Adz's own Cash Pot scraper. Runs server-side on a schedule, fetches
 * cashpotresults.info directly, and writes to Yaad Adz's own Supabase
 * project. Does NOT depend on the separate CashPotJA app, its repo, or
 * its Supabase project in any way — this is fully self-contained.
 *
 * ACCURACY: only saves a result when cashpotresults.info's own "✅
 * Verified" badge is present for that slot. If a slot isn't verified
 * yet, it's skipped and picked up on a later scheduled run instead of
 * guessing from an unconfirmed number.
 *
 * KNOWN LIMITATION: Mega/Monsta ball detection uses a color-keyword
 * heuristic on the ball image markup — I have not been able to fetch
 * cashpotresults.info's raw HTML from here to verify the exact class
 * names/colors it currently uses. The draw NUMBER itself (the part that
 * actually matters for the banner) does not depend on this — Mega/Monsta
 * are shown as a bonus emoji tag only. If they come out wrong, that's an
 * isolated fix in the MEGA/MONSTA DETECTION section below; it does not
 * affect whether numbers save correctly.
 *
 * Run: node scrape-cashpot.js
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY  (Yaad Adz's service_role key)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cquwshpsfybvgqodbxsf.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const TARGET = 'https://cashpotresults.info/';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY env var. Set it as a GitHub Actions secret.');
  process.exit(1);
}

const SN = ['Early Bird','Morning','Midday','Mid-Aft','Drive Time','Evening'];
const SH = [8.5, 10.5, 13, 15, 17, 20.42];

const SLOT_KEYS = [
  { keys: ['EARLY-BIRD','EARLYBIRD'], slot: 0 },
  { keys: ['MORNING'], slot: 1 },
  { keys: ['MIDDAY'], slot: 2 },
  { keys: ['MID AFTERNOON','MID-AFTERNOON','MIDAFTERNOON'], slot: 3 },
  { keys: ['DRIVE TIME','DRIVETIME'], slot: 4 },
  { keys: ['EVENING'], slot: 5 }
];

function jaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Jamaica' }));
}
function p2(n) { return String(n).padStart(2, '0'); }
function jaToday() { const j = jaNow(); return j.getFullYear() + '-' + p2(j.getMonth()+1) + '-' + p2(j.getDate()); }
function jaYest() { const j = jaNow(); j.setDate(j.getDate()-1); return j.getFullYear() + '-' + p2(j.getMonth()+1) + '-' + p2(j.getDate()); }

function scrapeHTML(html, isYesterday, nowHour) {
  const UP = html.toUpperCase();
  const results = [];
  const filled = [false,false,false,false,false,false];

  for (const sd of SLOT_KEYS) {
    if (filled[sd.slot]) continue;
    if (!isYesterday && nowHour < SH[sd.slot] + 0.083) continue; // hasn't drawn yet today

    let pos = -1;
    for (const k of sd.keys) { const i = UP.indexOf(k); if (i !== -1) { pos = i; break; } }
    if (pos === -1) continue;

    let nxt = html.length;
    for (const other of SLOT_KEYS) {
      for (const k of other.keys) {
        const np = UP.indexOf(k, pos + 4);
        if (np !== -1 && np < nxt) nxt = np;
      }
    }

    const chunk = html.substring(pos, Math.min(nxt, pos + 2000));
    const chunkUP = chunk.toUpperCase();

    const isVerified = /VERIFIED/.test(chunkUP);
    if (!isVerified) {
      console.log('  [skip] ' + SN[sd.slot] + ' — not marked Verified yet, will retry next run');
      continue;
    }

    let num = null;
    const boldMatch = chunk.match(/<td[^>]*wpdt-bold[^>]*>\s*(\d{1,2})\s*<\/td>/i);
    if (boldMatch) {
      const n = parseInt(boldMatch[1], 10);
      if (n >= 1 && n <= 36) num = n;
    }
    if (num === null) {
      const nm = chunk.replace(/<[^>]+>/g, ' ').match(/\b(\d{1,2})\b/g);
      if (nm) for (const s of nm) { const n = parseInt(s, 10); if (n >= 1 && n <= 36) { num = n; break; } }
    }
    if (num === null) { console.log('  [skip] ' + SN[sd.slot] + ' — verified but no number found (page layout may have changed)'); continue; }

    // ── MEGA/MONSTA DETECTION — see file header re: unverified heuristic ──
    let isMega = false, isMonsta = false;
    const tdBlocks = chunk.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    let numTdIdx = -1;
    for (let i = 0; i < tdBlocks.length; i++) {
      if (/wpdt-bold/i.test(tdBlocks[i]) && />\s*\d{1,2}\s*</.test(tdBlocks[i])) { numTdIdx = i; break; }
    }
    if (numTdIdx !== -1) {
      const ball1 = tdBlocks[numTdIdx+2] || '';
      const ball2 = tdBlocks[numTdIdx+3] || '';
      const getSrc = (td) => { const m = td.match(/src=["']([^"']+)["']/i); return m ? m[1].toLowerCase() : td.toLowerCase(); };
      const src1 = getSrc(ball1), src2 = getSrc(ball2);
      const ball1IsGrey = /grey|gray|silver|ffffff|000000|eeeeee|dddddd|cccccc/.test(src1) || src1 === '';
      const ball1IsColoured = /gold|yellow|mega|ffd7|ffc|ffb|ffa|ff9|f90|orange|amber|ffd0|color/.test(src1);
      if (ball1IsColoured && !ball1IsGrey) isMega = true;
      const ball2IsRed = /red|monsta|#?ff0000|c0392|e74c|ff0|d00|c00|crimson|scarlet/.test(src2);
      if (ball2IsRed) isMonsta = true;
    }

    filled[sd.slot] = true;
    results.push({ slot: sd.slot, num, mega: isMega, monsta: isMonsta });
  }
  return results;
}

async function fetchPage() {
  const res = await fetch(TARGET, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YaadAdzCashPot/1.0)' } });
  if (!res.ok) throw new Error('Fetch failed: HTTP ' + res.status);
  return res.text();
}

async function upsertResult(date, slot, num, isMega, isMonsta) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/cashpot_results?on_conflict=draw_date,slot', {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      draw_date: date, slot, number: num,
      is_mega: !!isMega, is_monsta: !!isMonsta,
      verified: true, scraped_at: new Date().toISOString(), source: 'cashpotresults.info'
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Supabase upsert failed for ' + date + ' slot ' + slot + ': HTTP ' + res.status + ' ' + body);
  }
}

async function main() {
  console.log('Fetching', TARGET);
  const html = await fetchPage();
  const htmlUP = html.toUpperCase();
  const today = jaToday(), yest = jaYest();
  const ja = jaNow(), nh = ja.getHours() + ja.getMinutes()/60;

  const yIdx = htmlUP.indexOf('YESTERDAY');
  const todayHTML = yIdx !== -1 ? html.substring(0, yIdx) : html;
  const yestHTML = yIdx !== -1 ? html.substring(yIdx) : '';

  const todayResults = scrapeHTML(todayHTML, false, nh);
  const yestResults = yestHTML ? scrapeHTML(yestHTML, true, 25) : [];

  console.log('Today (' + today + '): ' + todayResults.length + ' verified draws found');
  console.log('Yesterday (' + yest + '): ' + yestResults.length + ' verified draws found');

  let saved = 0;
  for (const r of todayResults) {
    await upsertResult(today, r.slot, r.num, r.mega, r.monsta);
    console.log('  saved [' + today + '] ' + SN[r.slot] + ' = ' + r.num + (r.mega ? ' MEGA' : '') + (r.monsta ? ' MONSTA' : ''));
    saved++;
  }
  for (const r of yestResults) {
    await upsertResult(yest, r.slot, r.num, r.mega, r.monsta);
    console.log('  saved [' + yest + '] ' + SN[r.slot] + ' = ' + r.num + (r.mega ? ' MEGA' : '') + (r.monsta ? ' MONSTA' : ''));
    saved++;
  }

  if (!saved) {
    console.log('Nothing new/verified this run. If this persists across ' +
      'several runs during draw hours, check: (1) is cashpotresults.info ' +
      'reachable at all — try fetching it directly in a browser; (2) has ' +
      'its page layout changed — the SLOT_KEYS / "VERIFIED" text match ' +
      'may need updating; (3) check this workflow\'s run logs in the ' +
      'Actions tab for the specific [skip] reasons logged above.');
  } else {
    console.log('Done — ' + saved + ' verified result(s) saved.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
