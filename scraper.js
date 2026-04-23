const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY env vars');
  process.exit(1);
}

const db = createClient(URL, KEY);

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YaadAdzBot/1.0)' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching Petrojam...');
  const html = await fetchPage('https://petrojam.com/price/');

  // Try multiple date patterns
  const dateMatch = html.match(/Date:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i)
    || html.match(/Date:\s*([^<\n]+)/i)
    || html.match(/(\w+\s+\d{1,2},?\s+\d{4})/);

  if (!dateMatch) throw new Error('Could not find price date');

  const weekOf = new Date(dateMatch[1].trim()).toISOString().split('T')[0];
  console.log('Week of:', weekOf);

  const fuels = [
    { regex: /E10-87[^\d]*(\d{3}\.\d{2})/i, key: '87' },
    { regex: /E10-90[^\d]*(\d{3}\.\d{2})/i, key: '90' },
    { regex: /Auto\s*Diesel[^\d]*(\d{3}\.\d{2})/i, key: 'diesel' },
    { regex: /ULSD[^\d]*(\d{3}\.\d{2})/i, key: 'ulsd' },
    { regex: /Kerosene[^\d]*(\d{3}\.\d{2})/i, key: 'kerosene' },
    { regex: /Propane[^\d]*(\d{2,3}\.\d{2})/i, key: 'propane' },
  ];

  const prices = [];
  for (const f of fuels) {
    const m = html.match(f.regex);
    if (m) {
      const price = parseFloat(m[1]);
      prices.push({ week_of: weekOf, fuel_type: f.key, ex_refinery_price: price });
      console.log('  ' + f.key + ': J$' + price);
    } else {
      console.log('  ' + f.key + ': not found');
    }
  }

  if (prices.length < 3) {
    console.log('Too few prices parsed. Aborting.');
    process.exit(0);
  }

  for (const p of prices) {
    const { error } = await db
      .from('petrojam_prices')
      .upsert(p, { onConflict: 'week_of,fuel_type', ignoreDuplicates: false });
    if (error) console.error('Upsert error:', error.message);
  }

  console.log('Done. Updated ' + prices.length + ' prices for week of ' + weekOf);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
