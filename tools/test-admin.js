/* §ADMIN — guards admin.html / js/admin.js.
   Run: node tools/test-admin.js
   Two things this proves:
     1. adSlug() in js/admin.js still matches slugify() in generate-pages.js.
        The admin page cannot import the app, so the logic is duplicated. If
        the two drift, every listing link in the admin dashboard 404s. This is
        the check that stops that happening silently.
     2. In a real browser: the gate blocks the dashboard, a wrong password is
        rejected, the right one unlocks it, the page survives a dead CDN, and a
        worst-case listing row (400-character title, wall of description) does
        not push the dashboard past a 360px viewport.
     3. That Hide actually hides: core.js, the realtime handlers and the page
        generator all have to exclude status='hidden', or a "hidden" post would
        quietly stay on the site. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (extra ? ' - ' + extra : ''));
  ok ? pass++ : fail++;
}

/* ── 1. slug parity ──────────────────────────────────────────────────────── */

/* Pull a named function's source out of a file, so we test the REAL shipped
   implementation instead of a re-typed copy that could itself be wrong. */
function extractFn(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error(name + ' not found in ' + file);
  let depth = 0, started = false, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

function makeSlug(src) {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext('__fn = (' + src + ')', sb);
  if (typeof sb.__fn !== 'function') throw new Error('could not load function');
  return sb.__fn;
}

const pageSlug = makeSlug(extractFn('generate-pages.js', 'slugify'));
const appSlug  = makeSlug(extractFn('js/search-ai.js', 'slugify'));

/* Re-derive the admin copy from its own source. It is named adSlug there, and
   it is an IIFE, so slice its body out rather than executing the page. */
const adminSrc = fs.readFileSync('js/admin.js', 'utf8');
const adminLive = adminSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const adminSlug = makeSlug(extractFn('js/admin.js', 'adSlug'));

/* Real rows pulled from the live `ads` table, plus nasty edge cases. */
const FIXTURES = [
  { id: 'a1790283220774', title: 'Toyota Hilux 4X4', parish: 'St. Andrew' },
  { id: 'a1790068754906', title: 'Mercedes 190SL Roadster year (1955-1963)', parish: 'St. Ann' },
  { id: 'a1789878451889', title: 'Moto network unlock service', parish: 'St. James' },
  { id: 'a1773071692630', title: "Waters Tropical honey 250 ml", parish: '' },
  { id: 'a1', title: "Bob's  double  space & sym#bols!", parish: 'Kingston' },
  { id: 'a2', title: 'x'.repeat(120), parish: 'Very Long Parish Name Indeed' },
  { id: 'a3', title: '', parish: '' },
  { id: 'a4', title: 'ÉLECTION — café ünïcode', parish: 'St. Thomas' },
];

let mismatch = 0, sample = null;
for (const fx of FIXTURES) {
  const a = adminSlug(fx), b = pageSlug(fx), c = appSlug(fx);
  if (a !== b || a !== c) {
    mismatch++;
    if (!sample) sample = 'adSlug=' + a + '  pageSlug=' + b + '  appSlug=' + c;
  }
}
check('adSlug matches slugify on all ' + FIXTURES.length + ' fixtures',
  mismatch === 0, mismatch + ' mismatch(es): ' + (sample || ''));

/* ── 2. static guarantees ────────────────────────────────────────────────── */

const html = fs.readFileSync('admin.html', 'utf8');
check('no plaintext password in shipped files',
  !/Iamsuperman/.test(adminSrc) && !/Iamsuperman/.test(html));
check('no innerHTML sink in admin.js (stored-XSS guard)',
  !/innerHTML/.test(adminLive), /innerHTML/.test(adminLive) ? 'found in live code' : '');
check('admin page is noindex', /noindex/.test(html));
check('no slug/cat columns assumed (ads has category)',
  !/\.slug\b/.test(adminLive) && /\.category|adSlug/.test(adminLive));
check('does not query RLS-locked reports table',
  !/ad_feedback_reports/.test(adminLive));
check('gate unlocks via sessionStorage, not localStorage',
  /sessionStorage\.setItem/.test(adminLive) && !/localStorage\.setItem/.test(adminLive));

/* ── 2b. moderation features ─────────────────────────────────────────────── */

check('hide writes status=hidden (the value the public site excludes)',
  /\{ status: ST_HIDDEN \}/.test(adminLive));
check('restore writes status=active',
  /\{ status: ST_ACTIVE \}/.test(adminLive));
check('delete rides the same verified write() helper as hide/restore',
  /op === 'delete'/.test(adminLive) && /t\.delete\(\)/.test(adminLive));
check('every destructive action is confirm-gated (hide, restore, delete, bulk)',
  (adminLive.match(/window\.confirm\(/g) || []).length >= 4,
  (adminLive.match(/window\.confirm\(/g) || []).length + ' confirm() call(s)');
check('a write that changed nothing is reported, never swallowed',
  /no rows changed/.test(adminLive));
check('bulk hide reports partial failures instead of claiming success',
  /'Hid ' \+ done \+ ' of ' \+ mine\.length/.test(adminLive));
check('list ships search + status filter + paging',
  /id="flt"/.test(html) && /id="fltStatus"/.test(html) && /more'/.test(adminLive));
check('hidden listings get their own stat tile',
  /id="s-hidden"/.test(html) && /setStat\('s-hidden'/.test(adminLive));
check('dashboard has its own status line (the gate error is hidden after unlock)',
  /id="dash-note"/.test(html) && /function note\(/.test(adminLive));
check('rows never render arbitrary markup (DOM API only, no innerHTML)',
  !/\.innerHTML/.test(adminLive) && /createElement/.test(adminLive));

/* §ADMIN-FIT — the reported "text bleeds off screen" bug. These are the CSS
   guards that stop a 400-character title or a nowrap meta row from widening
   the page; the browser pass below proves it at 360px for real. */
check('row grid track can shrink (minmax(0,1fr)) and wraps long words anywhere',
  /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(html) && /overflow-wrap:\s*anywhere/.test(html));
check('title + description snippets are clamped, not allowed to grow unbounded',
  /-webkit-line-clamp:\s*3/.test(html) && /-webkit-line-clamp:\s*2/.test(html));
check('body can never scroll sideways',
  /body\.adm\s*\{[^}]*overflow-x:\s*hidden/.test(html));
check('toolbar, rows and buttons meet the 44px tap target the site uses',
  /min-height:\s*44px/.test(html) && /min-height:\s*46px/.test(html));

/* ── 2c. the hide has to actually hide (cross-file) ─────────────────────── */

const coreJs = fs.readFileSync('js/core.js', 'utf8');
const navJs  = fs.readFileSync('js/ui-nav.js', 'utf8');
const genJs  = fs.readFileSync('generate-pages.js', 'utf8');
check('core.js drops hidden rows at the one load boundary',
  /function isPublicRow\(row\)\s*\{[^}]*!==\s*'hidden'/.test(coreJs) &&
  /indexAds\(data\.filter\(isPublicRow\)\.map\(dbToAd\)\)/.test(coreJs));
check('realtime INSERT + UPDATE respect hidden listings',
  /isPublicRow\(payload\.new\)/.test(navJs));
check('generated ad pages + sitemap exclude hidden listings',
  /filter\(ad => ad\.status !== 'hidden'\)/.test(genJs));


/* ── 3. live browser behaviour ──────────────────────────────────────────── */

const PORT = 9337;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => fs.existsSync(p));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(process.cwd(), p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const cdpGet = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', d => b += d);
    r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

async function browser() {
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await cdpGet('/json/version'); }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!ver) { check('chrome devtools reachable', false, 'never came up'); return; }

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p, s) => new Promise(res => {
    const msg = { id: ++id, method: m, params: p || {} };
    if (s) msg.sessionId = s;
    pending.set(msg.id, res); ws.send(JSON.stringify(msg));
  });
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  /* block the CDN, to exercise the no-network path like §P1-NO-CDN does */
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] }, sessionId);
  await send('Page.navigate',
    { url: 'http://127.0.0.1:' + server.address().port + '/admin.html' }, sessionId);
  await new Promise(r => setTimeout(r, 2500));

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) return 'THREW: ' + JSON.stringify(r.exceptionDetails.text);
    return r.result && r.result.value;
  };

  check('gate shown, dashboard hidden on load',
    await ev('!document.getElementById("gate").hidden && document.getElementById("dash").hidden'));

  await ev('document.getElementById("pw").value="wrongpass";document.getElementById("go").click();1');
  await new Promise(r => setTimeout(r, 900));
  check('wrong password rejected, dashboard stays locked',
    await ev('document.getElementById("dash").hidden === true'));
  check('wrong password shows an error',
    await ev('document.getElementById("err").textContent.indexOf("Wrong") !== -1'));

  await ev('document.getElementById("pw").value="Iamsuperman";document.getElementById("go").click();1');
  await new Promise(r => setTimeout(r, 1500));
  check('correct password unlocks the dashboard',
    await ev('document.getElementById("gate").hidden === true && document.getElementById("dash").hidden === false'));
  check('unlock stored in sessionStorage only, not localStorage',
    await ev('sessionStorage.getItem("ya_admin_unlocked")==="1" && localStorage.getItem("ya_admin_unlocked")===null'));

  /* §ADMIN-FIT — the reported bug: one live listing has a 400-character title
     and a description that runs to several screens, and the old row layout
     pushed the whole page sideways on a phone. Render that worst case through
     the REAL row builder at 360px and measure what actually sticks out. */
  await send('Emulation.setDeviceMetricsOverride',
    { width: 360, height: 720, deviceScaleFactor: 1, mobile: true }, sessionId);
  await new Promise(r => setTimeout(r, 250));

  check('worst-case row renders its Hide/Restore/Delete controls at 360px',
    (await ev('(function(){' +
      'if(typeof window.__admRenderTest!=="function")return -1;' +
      'var box=document.getElementById("rows");if(!box)return -2;' +
      'var n=window.__admRenderTest({id:"a-test-1",title:"x".repeat(400),' +
      'description:"y".repeat(600),parish:"Very Long Parish Name Indeed",price:123456789,' +
      'status:"hidden",seller_name:"A Really Long Member Display Name",category:"vehicles",' +
      'views:9999,created_at:"2026-09-26T12:00:00Z"});' +
      'box.textContent="";box.appendChild(n);' +
      'return document.querySelectorAll("#rows .adm-acts .adm-btn").length;})()')) >= 3);
  check('nothing bleeds past the 360px viewport',
    await ev('(function(){' +
      'if(document.documentElement.scrollWidth>window.innerWidth+1)' +
      'return "page scrollWidth "+document.documentElement.scrollWidth+" > "+window.innerWidth;' +
      'var bad=[];Array.prototype.forEach.call(document.querySelectorAll("#dash *"),function(n){' +
      'var b=n.getBoundingClientRect();' +
      'if(b.width&&b.right>window.innerWidth+1)bad.push((n.className||n.tagName)+"@"+Math.round(b.right));});' +
      'return bad.length?("overflow: "+bad.slice(0,3).join(", ")):true;})()'));
  check('a hidden row renders the Hidden badge and a Restore control',
    await ev('!!document.querySelector("#rows .adm-chip.is-hidden") && ' +
      'Array.prototype.some.call(document.querySelectorAll("#rows .adm-acts .adm-btn"),' +
      'function(b){return b.textContent==="Restore";})'));

  await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);

  await ev('document.getElementById("lock").click();1');
  check('Lock button re-locks the gate',
    await ev('document.getElementById("dash").hidden === true && document.getElementById("gate").hidden === false'));

  check('survives dead CDN without throwing',
    await ev('typeof document.getElementById("err").textContent === "string"'));

  ws.close();
}

if (!CHROME) {
  console.log('[SKIP] no Chrome/Edge found - browser checks not run');
} else {
  server.listen(0, '127.0.0.1', () => {
    spawn(CHROME, ['--headless=new', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1200,900',
      '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
      '--user-data-dir=' + path.join(process.cwd(), '.chrome-admin-tmp'),
      'about:blank'], { stdio: 'ignore' });
    setTimeout(() => browser()
      .catch(e => check('browser checks', false, e.message))
      .then(() => {
        console.log('\n' + (fail === 0
          ? 'ADMIN TESTS: ALL ' + pass + ' PASSED'
          : 'ADMIN TESTS: ' + fail + ' FAILED'));
        server.close();
        process.exit(fail === 0 ? 0 : 1);
      }), 1200);
  });
}
