/* §P1-PARITY — proves getFiltered/scoreAd sort identically with and without
   the _ts precompute, and that the ADS_HOME_COLS column-select maps rows
   identically to the old select('*'). Realtime full rows still index fine.
   Run: node tools/test-p1-parity.js (no server needed). */
const fs = require('fs');
const vm = require('vm');
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' - ' + extra : ''));
  if (!ok) failures++;
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
function q(expr) { return vm.runInContext(expr, sb); }
vm.runInContext(fs.readFileSync('js/core.js', 'utf8'), sb, { filename: 'js/core.js' });
vm.runInContext(fs.readFileSync('js/search-ai.js', 'utf8'), sb, { filename: 'js/search-ai.js' });

// 1. column-select parity: full row vs ADS_HOME_COLS-projected row map identically
check('ADS_HOME_COLS covers dbToAd row fields', q(
  "['id','title','category','parish','price','description','phone','image_url','negotiable','seller_name','seller_init','seller_id','created_at','status','views'].every(function(c){ return ADS_HOME_COLS.split(',').indexOf(c) !== -1; })"
) === true);
check('column-select maps identically to select(*)', q(
  "(function(){ var full = {id:'x1',title:'2019 Honda Civic',category:'vehicles',parish:'Kingston',price:2800000,description:'Nice',phone:'876-1',image_url:'http://i/x.jpg',negotiable:true,seller_name:'Marcus',seller_init:'MR',seller_id:'s1',created_at:'2025-06-01T00:00:00Z',status:'active',views:5,extra_col:'DROP-ME'}; var slim = {}; ADS_HOME_COLS.split(',').forEach(function(c){ slim[c] = full[c]; }); return JSON.stringify(dbToAd(full)) === JSON.stringify(dbToAd(slim)); })()"
) === true);

// 2. _ts precompute present + equals Date.parse
check('_ts precomputed by buildHay', q(
  "(function(){ var a = dbToAd({id:'t',title:'t',category:'vehicles',parish:'K',price:1,description:'d',phone:'',image_url:'',negotiable:false,seller_name:'',seller_init:'',seller_id:'',created_at:'2025-06-01T00:00:00Z',status:'active',views:0}); buildHay(a); return a._ts === Date.parse('2025-06-01T00:00:00Z'); })()"
) === true);

// 3. sort parity with/without _ts + _hay (legacy path must rank identically)
check('sort parity: _ts/indexed vs legacy rank identically', q(
  "(function(){ function mk(id,t,d){ var a = dbToAd({id:id,title:t,category:'vehicles',parish:'Kingston',price:1,description:'honda',phone:'',image_url:'',negotiable:false,seller_name:'',seller_init:'',seller_id:'',created_at:d,status:'active',views:0}); buildHay(a); return a; } var indexed = [mk('n1','Honda Civic new','2025-06-10T00:00:00Z'), mk('o1','Honda Civic old','2024-01-01T00:00:00Z')]; var legacy = indexed.map(function(a){ var c = Object.assign({}, a); delete c._ts; delete c._hay; return c; }); var save = _ads; _ads = indexed; var r1 = JSON.stringify(getFiltered('honda','all','newest').map(function(a){ return a.id; })); _ads = legacy; var r2 = JSON.stringify(getFiltered('honda','all','newest').map(function(a){ return a.id; })); _ads = save; return r1 === r2 ? r1 : ('MISMATCH:' + r1 + ' vs ' + r2); })()"
) === '["n1","o1"]');

// 4. realtime full-row insert (payload.new carries full row + extras) still indexes
check('realtime full row still indexes (dbToAd+buildHay)', q(
  "(function(){ var rt = dbToAd({id:'r1',title:'Honda Accord',category:'vehicles',parish:'K',price:1,description:'honda',phone:'',image_url:'',negotiable:false,seller_name:'',seller_init:'',seller_id:'',created_at:'2025-01-01T00:00:00Z',status:'active',views:0,extra_col:1}); buildHay(rt); return !!rt._hay && rt._ts > 0 && rt.title.indexOf('Accord') !== -1; })()"
) === true);

// 5. template ships zero prod console output unless opted in
check('generate-pages template dbg is opt-in (no bare console.log)', (function() {
  var src = fs.readFileSync('generate-pages.js', 'utf8');
  var i = src.indexOf('function dbg(msg)');
  if (i === -1) return false;
  var line = src.slice(i, src.indexOf('\n', i) + 1);
  return line.indexOf('yaDebugOn') !== -1 && line.indexOf('console.log') !== -1;
})() === true);
check('generated ad pages stay silent by default (ya_debug gate present)', (function() {
  var src = fs.readFileSync('generate-pages.js', 'utf8');
  return src.indexOf('ya_debug') !== -1 && src.indexOf('debug=1') !== -1;
})() === true);

// 6. SW precache covers the whole app shell + v44 bump (offline first visit works)
check('sw.js precaches full app shell', (function() {
  var sw = fs.readFileSync('sw.js', 'utf8');
  var need = ['/js/core.js', '/js/ui-nav.js', '/js/listings.js', '/js/search-ai.js', '/js/auth-account.js', '/js/ad-social.js', '/js/widgets-pwa.js', '/js/post-pro.js'];
  return need.every(function(u) { return sw.indexOf("'" + u + "'") !== -1; });
})() === true);
check('sw.js cache bumped (v44+)', Number((fs.readFileSync('sw.js', 'utf8').match(/yaadadz-v(\d+)/) || [])[1]) >= 44);

console.log('\n' + (failures === 0 ? 'P1-PARITY: ALL CHECKS PASSED' : 'P1-PARITY: ' + failures + ' FAILED'));
process.exit(failures === 0 ? 0 : 1);
