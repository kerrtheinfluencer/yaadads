/* Pre-deploy cleanup tests - run: node tools/test-cleanup.js
   Loads REAL js files in a sandbox with DOM stubs, checks no regression.
   No network. Exits non-zero on failure. */
const fs = require('fs');
const vm = require('vm');
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' - ' + extra : ''));
  if (!ok) failures++;
}
function q(sb, expr) {
  try { return vm.runInContext(expr, sb); }
  catch (e) { return 'THREW:' + e.message; }
}
const store = {};
const sb = {
  console,
  localStorage: {
    getItem: function(k) { return (k in store) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  },
  document: {
    getElementById: function() { return null; },
    createElement: function() { return { style: {} }; },
    addEventListener: function() {},
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    head: {}, body: {}
  },
  window: { innerWidth: 1280 },
  navigator: { userAgent: 'node-test' },
  supabase: { createClient: function() { return null; } },
  setTimeout: function() { return 0; },
  clearTimeout: function() {},
  requestAnimationFrame: function() { return 0; },
  atob: function(s) { return Buffer.from(s, 'base64').toString('binary'); }
};
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
function load(f) {
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), sb, { filename: f }); return true; }
  catch (e) { check(f + ' loads', false, e.message); return false; }
}
const okCore = load('js/core.js');
const okSearch = load('js/search-ai.js');
check('core.js loads', okCore === true);
check('search-ai.js loads', okSearch === true);
check('catById exists', q(sb, 'typeof catById') === 'function');
check('CAT_MAP covers CATS', q(sb, 'Object.keys(CAT_MAP).length') === q(sb, 'CATS.length'));
check('escHtml escapes', q(sb, 'escHtml(\'<b>&"\')') === '&lt;b&gt;&amp;&quot;');
check('$el alias', q(sb, 'typeof $el') === 'function' && q(sb, '$ === $el') === true);
check('helpers exist', q(sb, 'typeof buildHay') === 'function' && q(sb, 'typeof findAd') === 'function');
check('CFG creds unchanged', q(sb, 'CFG.supabase.url') === 'https://cquwshpsfybvgqodbxsf.supabase.co');
check('DEMO indexed', q(sb, 'DEMO.length') === 8 && q(sb, 'typeof DEMO[0]._hay') === 'object');
check('getFiltered finds honda', q(sb, "_ads = DEMO.slice(); getFiltered('honda','all','newest').length") >= 1);
check('search parity legacy vs _hay', q(sb, `(function(){
  var legacy = DEMO.map(function(a){ var c = Object.assign({}, a); delete c._hay; return c; });
  var indexed = DEMO.map(function(a){ var c = Object.assign({}, a); buildHay(c); return c; });
  var save = _ads, out = true;
  var qs = ['', 'honda', 'house spanish town', 'iphone', 'ackee', 'zzz-no-match'];
  for (var i = 0; i < qs.length; i++) {
    _ads = legacy;  var r1 = JSON.stringify(getFiltered(qs[i],'all','newest').map(function(a){return a.id;}));
    _ads = indexed; var r2 = JSON.stringify(getFiltered(qs[i],'all','newest').map(function(a){return a.id;}));
    if (r1 !== r2) { out = 'MISMATCH:' + qs[i]; break; }
  }
  _ads = save; return out;
})()`) === true);
check('findAd matches _ads.find', q(sb, `_ads = DEMO.slice(); rebuildAdIndex(); _ads.every(function(a){ return findAd(a.id) === a; })`) === true);
check('catById matches CATS.find', q(sb, `DEMO.every(function(a){
  var old = (CATS.find(function(c){return c.id===a.category;}) || {name:'Other'}).name;
  return old === catById(a.category).name;
})`) === true);
check('photo renderer static check', (function(){
  var s = fs.readFileSync('js/listings.js', 'utf8');
  var hasShared = s.indexOf('function _photoThumbsHTML') !== -1 && s.indexOf('function _addFilesToPhotos') !== -1;
  var noDup = (s.match(/photo-thumb-wrap/g) || []).length <= 2;
  var bothUse = s.indexOf("_photoThumbsHTML(_editAdPhotos") !== -1 && s.indexOf('_photoThumbsHTML(uploadPhotos') !== -1;
  var keepsApi = ['renderPhotoGrid', 'renderEditAdPhotoGrid', 'handleImgFiles', 'handleEditAdImgs', 'removePhoto', 'removeEditAdPhoto']
    .every(function(n){ return s.indexOf('function ' + n) !== -1; });
  return hasShared && noDup && bothUse && keepsApi;
})() === true);
check('no CATS.find() calls left in js/ app code', (function(){
  var skip = { 'test-cleanup-part1.tmp': 1 };
  return fs.readdirSync('js').filter(function(f){ return f.endsWith('.js') && !skip[f]; })
    .every(function(f){
      var lines = fs.readFileSync('js/' + f, 'utf8').split('\n')
        .filter(function(l){
          var i = l.indexOf('CATS.find(');
          if (i === -1) return false;
          var t = l.trim();
          if (t.indexOf('*') === 0 || t.indexOf('//') === 0) return false; // comments
          return true;
        });
      if (lines.length) console.log('   leftover in ' + f + ': ' + lines[0].trim().slice(0, 80));
      return lines.length === 0;
    });
})() === true);
check('single escHtml (core.js)', (function(){
  var defs = fs.readdirSync('js').filter(function(f){ return f.endsWith('.js'); })
    .filter(function(f){ return /function escHtml/.test(fs.readFileSync('js/' + f, 'utf8')); });
  return defs.length === 1 && defs[0] === 'core.js';
})() === true);
check('cardHTML escapes title', fs.readFileSync('js/ui-nav.js', 'utf8').indexOf('${escHtml(ad.title)}') !== -1);
process.exitCode = failures === 0 ? 0 : 1;
console.log('\\n' + (failures === 0 ? 'CLEANUP TESTS: ALL PASSED - safe to deploy' : 'CLEANUP TESTS: ' + failures + ' FAILED - do NOT deploy'));
