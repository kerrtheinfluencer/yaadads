/* ═══════════════════════════════════════════════════════════
   notify-site-update.js — announce a site update to push
   subscribers (topic: site_updates). Pairs with the in-app
   "What's new" notice in js/site-updates.js.

   Usage:
     node notify-site-update.js "Title" "Body" [url]

   Env (same convention as scrape-petrojam-archive.js):
     SUPABASE_URL           required — project URL
     PUSH_WEBHOOK_SECRET    required — auth for /functions/v1/send-push
                            (keep in GitHub repo secrets, never commit)

   If either env var is missing the script exits quietly (code 2)
   and never fails a CI run over it.
   ═══════════════════════════════════════════════════════════ */

const https = require('https');

const FALLBACK_URL = 'https://yaadadz.com/';
const PUSH_FUNCTION_PATH = '/functions/v1/send-push';

function postJson(urlString, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }, headers || {}),
      timeout: 15000,
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(out);
        else reject(new Error('HTTP ' + res.statusCode + ': ' + out));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.write(data);
    req.end();
  });
}

async function main() {
  const [, , title, body, url] = process.argv;
  const supabaseUrl = process.env.SUPABASE_URL;
  const secret = process.env.PUSH_WEBHOOK_SECRET;

  if (!supabaseUrl || !secret) {
    console.log('⚠️  SUPABASE_URL / PUSH_WEBHOOK_SECRET not set — skipping site-update push');
    process.exit(2);
  }
  if (!title || !body) {
    console.log('Usage: node notify-site-update.js "Title" "Body" [url]');
    process.exit(2);
  }

  try {
    await postJson(supabaseUrl + PUSH_FUNCTION_PATH, {
      title,
      body,
      url: url || FALLBACK_URL,
      topic: 'site_updates',
    }, { 'x-webhook-secret': secret });
    console.log('🔔 Site-update push sent to site_updates subscribers');
  } catch (err) {
    console.error('⚠️  Push notification failed:', err.message);
    process.exit(1);
  }
}

main();