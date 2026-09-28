/* Report-a-listing markup for generated listing pages. Public anon key only.
   Mirrors tools/ad-feedback-markup.js: the same creds are read from the single
   source of truth in js/core.js and verified to be the public anon key, so a
   service-role key can never be baked into a page that ships to every visitor.

   The page passes its listing id, title and creds as data attributes, then
   hands the element to YaadReport.mountLink(). Nothing about the ad is
   interpolated into an inline handler. */
'use strict';
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const url = core.match(/url:\s*'([^']+)'/)[1];
const key = core.match(/key:\s*'([^']+)'/)[1];
const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
if (claims.role !== 'anon') throw new Error('Report markup requires a public anon key.');

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = function reportMarkup(ad) {
  return `<link rel="stylesheet" href="/ad-report.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
<script src="/js/ad-report.js" defer></script>
<div class="ar-host" id="arHost" data-ad-id="${esc(ad.id)}" data-ad-title="${esc(ad.title)}"
     data-supabase-url="${esc(url)}" data-supabase-key="${esc(key)}"></div>
<script>
/* Boot the report link once ad-report.js has run. Both are deferred, and this
   inline script also defers, so document order guarantees the global exists. */
document.addEventListener('DOMContentLoaded', function () {
  var host = document.getElementById('arHost');
  if (!host || !window.YaadReport) return;
  window.YaadReport.mountLink(host, host.dataset.adId, host.dataset.adTitle);
});
</script>`;
};
