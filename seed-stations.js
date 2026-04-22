#!/usr/bin/env node
/**
 * Petrojam Price Scraper
 * Fetches current week prices from petrojam.com and upserts to Supabase.
 * Run manually: node scrape-petrojam.js
 * Or via GitHub Actions cron every Wednesday.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cquwshpsfybvgqodbxsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const FUEL_MAP = [
  { regex: /Gasolene\s*87/i,           key: '87',       name: 'Gasolene 87' },
  { regex: /Gasolene\s*90/i,           key: '90',       name: 'Gasolene 90' },
  { regex: /Auto\s*Diesel/i,           key: 'diesel',   name: 'Auto Diesel' },
  { regex: /ULSD/i,                    key: 'ulsd',     name: 'ULSD' },
  { regex: /Kerosene/i,                key: 'kerosene', name: 'Kerosene' },
  { regex: /Propane/i,                 key: 'propane',  name: 'Propane' },
  { regex: /Butane(?!.*Asphalt)/i,     key: 'butane',   name: 'Butane' },
];

async function scrape() {
  console.log('⛽ Fetching Petrojam homepage…');
  const res = await fetch('https://www.petrojam.com/');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Extract date: "April 23, 2026"
  const dateMatch = html.match(/Date:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i)
               || html.match(/Date:\s*([^<\n]+)/i);
  if (!dateMatch) throw new Error('Could not find price date');
  const dateStr = dateMatch[1].trim();
  const weekOf = new Date(dateStr).toISOString().split('T')[0];
  console.log(`📅 Week of: ${weekOf}`);

  // Extract prices from table rows
  const prices = [];
  for (const fuel of FUEL_MAP) {
    // Look for: FuelName</td>...$Price
    const pattern = new RegExp(
      fuel.name.replace(/\s+/g, '\\s*') +
      '[\\s\\S]{0,60}\\$?([\\d,\\.]+)',
      'i'
    );
    const match = html.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      prices.push({ week_of: weekOf, fuel_type: fuel.key, ex_refinery_price: price });
      console.log(`  ✅ ${fuel.key}: J$${price}`);
    } else {
      console.log(`  ⚠️  ${fuel.key}: not found`);
    }
  }

  if (prices.length === 0) throw new Error('No prices extracted');

  // Upsert
  for (const p of prices) {
    const { error } = await db
      .from('petrojam_prices')
      .upsert(p, { onConflict: 'week_of,fuel_type', ignoreDuplicates: false });
    if (error) console.error('❌ Upsert error:', error.message);
  }

  console.log(`\n✅ Done. Inserted/updated ${prices.length} prices.`);
}

scrape().catch(err => {
  console.error('💥 Fatal:', err.message);
  process.exit(1);
});
