'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const markup = require('./ad-feedback-markup');
const sample = markup({ id: 'test"<&', sellerId: 'seller"' });
assert(sample.includes('data-ad-id="test&quot;&lt;&amp;"'));
assert(sample.includes('data-seller-id="seller&quot;"'));
const files = fs.readdirSync('ad').filter(f => f.endsWith('.html'));
assert(files.length > 0);
for (const file of files) {
  const html = fs.readFileSync(path.join('ad', file), 'utf8');
  assert.equal((html.match(/data-ad-feedback/g) || []).length, 1, file);
  assert(html.includes('/js/ad-feedback.js'), file);
  assert(html.includes('/ad-feedback.css'), file);
  const id = html.match(/var adId\s*=\s*'([^']+)'/)[1];
  assert(html.includes('data-ad-id="' + id + '"'), file);
}
assert(fs.readFileSync('generate-pages.js', 'utf8').includes("require('./tools/ad-feedback-markup')(ad)"));
assert(fs.readFileSync('js/ad-social.js', 'utf8').includes('window.AdFeedback.mount(feedback, _db)'));
const src = fs.readFileSync('js/ad-feedback.js', 'utf8');
assert(!src.includes('innerHTML'));
assert(!src.includes('localStorage'));
assert(src.includes('db.auth.getUser()'));
console.log('PASS: all ' + files.length + ' listing pages, shared markup escaping, SPA integration and session-only feedback.');
