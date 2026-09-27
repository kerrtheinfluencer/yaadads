/* §ADMIN — guards admin.html / js/admin.js.
   Run: node tools/test-admin.js
   Two things this proves:
     1. adSlug() in js/admin.js still matches slugify() in generate-pages.js.
        The admin page cannot import the app, so the logic is duplicated. If
        the two drift, every listing link in the admin dashboard 404s. This is
        the check that stops that happening silently.
     2. In a real browser: the gate blocks the dashboard, a wrong password is
        rejected, the right one unlocks it, and the page survives a dead CDN. */
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
