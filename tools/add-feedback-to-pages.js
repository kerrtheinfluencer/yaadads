/* Add the shared feedback section to committed pages without changing listing data. */
'use strict';
const fs = require('fs');
const path = require('path');
const markup = require('./ad-feedback-markup');
const dir = path.join(__dirname, '../ad');
let count = 0;
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const dest = path.join(dir, file);
  const html = fs.readFileSync(dest, 'utf8');
  if (html.includes('data-ad-feedback')) continue;
  const id = (html.match(/var adId\s*=\s*'([^']+)'/) || [])[1];
  const marker = '      <!-- AdSense in-content — only shown on listings with real content -->';
  if (!id || !html.includes(marker)) throw new Error('Unrecognized listing template: ' + file);
  fs.writeFileSync(dest, html.replace(marker, '      ' + markup({ id }) + '\n\n' + marker));
  count++;
}
console.log('Added feedback to ' + count + ' listing pages.');
