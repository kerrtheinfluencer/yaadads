/* §SECURITY — the static page generator must survive hostile listing data.
   Feeds it ads whose title/description/seller/image/id are attack strings and asserts that nothing can
   close a <script>, break out of an attribute or a JS string, or write a file outside /ad/.
   No network. Usage: node tools/test-generator-security.js */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (n, ok, d) => { console.log((ok ? '[PASS] ' : '[FAIL] ') + n + (ok || d === undefined ? '' : ' — ' + d)); if (!ok) failed++; };

const src = fs.readFileSync(path.join(ROOT, 'generate-pages.js'), 'utf8').replace(/^#!.*\n/, '').replace(/\nmain\(\)\.catch[\s\S]*$/, '\nmodule.exports = { dbToAd, buildPage, slugify, jsonForScript, SAFE_ID };\n');
const m = { exports: {} };
new Function('require', 'module', 'exports', '__dirname', 'process', src)(id => require(id.startsWith('.') ? path.join(ROOT, id) : id), m, m.exports, ROOT, process);
const { dbToAd, buildPage, slugify, jsonForScript, SAFE_ID } = m.exports;

const EVIL = '</script><script>window.__pwned=1</script>';
const row = {
  id: 'a123', title: 'Car ' + EVIL, description: 'desc ' + EVIL + '  "quoted" \'single\'', phone: '8765551234',
  seller_name: 'Bob ' + EVIL, seller_init: '<img src=x onerror=alert(1)>', seller_id: "x');alert(1);//", parish: 'Kingston',
  category: 'vehicles', price: 1000, negotiable: true, created_at: new Date().toISOString(), status: 'active',
  image_url: JSON.stringify(['https://a.example/x.jpg', "https://a/x');alert(1);//", 'javascript:alert(1)', 'https://b.example/y" onerror="alert(1)', 'https://ok.example/z.jpg'])
};
const ad = dbToAd(row);
check('only clean http(s) image URLs survive', ad.photos.length === 2 && ad.photos.every(u => /^https:\/\/(a|ok)\.example\//.test(u)), JSON.stringify(ad.photos));
check('seller_init is stripped to plain characters', /^[\p{L}\p{N} .]{0,4}$/u.test(ad.sellerInit), ad.sellerInit);
check('hostile seller_id is dropped', ad.sellerId === '');
const html = buildPage(ad, [ad]);
check('no injected <script> element', !/<script>window\.__pwned/.test(html));
check('</script> never appears inside JSON blocks', (html.match(/<\/script>/g) || []).length === (html.match(/<script\b/g) || []).length, `${(html.match(/<\/script>/g) || []).length} closes vs ${(html.match(/<script\b/g) || []).length} opens`);
check('no inline setFeatured/copyAdLink handlers with data in them', !/onclick="setFeatured\(this,'/.test(html) && !/onclick="copyAdLink\('/.test(html));
check('jsonForScript escapes < > & and line separators', !new RegExp('[<>&\u2028\u2029]').test(jsonForScript({ a: '<>&' + String.fromCharCode(0x2028, 0x2029) })));
check('slug cannot contain path characters', /^[a-z0-9-]+$/.test(slugify({ title: 'x', parish: 'y', id: '/../../etc' })), slugify({ title: 'x', parish: 'y', id: '/../../etc' }));
check('SAFE_ID rejects quotes, tags and slashes', ['x\');alert(1);//', '<b>', 'a/b', '', 'a b'].every(v => !SAFE_ID.test(v)) && SAFE_ID.test('a1774663-xyz_9'));
console.log(failed ? '\nSECURITY GENERATOR TESTS: ' + failed + ' FAILED' : '\nSECURITY GENERATOR TESTS: ALL PASSED');
process.exit(failed ? 1 : 0);
