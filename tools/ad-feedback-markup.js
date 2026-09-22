/* Shared markup for existing and newly generated listing pages. Public anon key only. */
'use strict';
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const url = core.match(/url:\s*'([^']+)'/)[1];
const key = core.match(/key:\s*'([^']+)'/)[1];
const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
if (claims.role !== 'anon') throw new Error('Feedback markup requires a public anon key.');
function esc(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
module.exports = function feedbackMarkup(ad) {
  return `<link rel="stylesheet" href="/ad-feedback.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
<script src="/js/ad-feedback.js" defer></script>
<section class="ad-feedback" data-ad-feedback data-ad-id="${esc(ad.id)}" data-seller-id="${esc(ad.sellerId)}" data-supabase-url="${esc(url)}" data-supabase-key="${esc(key)}">
<h2>Reviews &amp; comments</h2><p>Loading buyer reviews and comments…</p><noscript>Enable JavaScript to read and post feedback.</noscript>
</section>`;
};
