/* ── §PHOTO-GESTURES regression test.
   Two jobs, one file:
     1. STATIC — render a generated ad page and PARSE every inline <script>.
        This guards a real bug found while building this feature: the page
        template held `/(?:\?|&)debug=1/`, whose `\?` collapses to `?` inside the
        template literal, emitting an INVALID regex. One bad regex is a
        SyntaxError for the WHOLE block, so every generated ad page shipped with
        a dead lightbox, gallery and view counter. A regex-on-the-source check
        can never see it — only parsing the output can.
     2. BROWSER — drive the real lightbox in headless Chrome with synthetic
        touch events: a strong swipe changes photo, a small drift does NOT, a
        downward drag dismisses, pinch and double-tap zoom, dots are 44px.
   Self-contained (spawns its own server + browser). No npm browser dependency.
   Skips itself (exit 0) on a machine without Chrome, like test-msg-v2.js.
   Usage: node tools/test-photo-gestures.js                                        */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || detail === undefined ? '' : ' — ' + detail));
  if (!ok) failed++;
}

/* ── 1. static: the generated ad page must ship only parseable script ────── */
(function staticChecks() {
  let src = fs.readFileSync(path.join(ROOT, 'generate-pages.js'), 'utf8');
  // Strip the unconditional main() so requiring the file never touches the net.
  src = src.replace(/\nmain\(\)\.catch[\s\S]*$/, '\nmodule.exports = { buildPage: buildPage };\n');
  const tmp = path.join(ROOT, '_tmp-test-gen.js');
  fs.writeFileSync(tmp, src);
  let buildPage;
  try { buildPage = require(tmp).buildPage; }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }

  const img = 'https://cquwshpsfybvgqodbxsf.supabase.co/storage/v1/object/public/ads/a.jpg';
  const ad = { id: 'a1', title: 'Toyota Axio', price: 1200000, neg: true, status: 'active',
    parish: 'Kingston', category: 'vehicles', seller: 'Seller', sellerId: 's1',
    phone: '8765551234', desc: 'Clean car', date: new Date().toISOString(),
    image: img, photos: [img, img.replace('a.jpg', 'b.jpg'), img.replace('a.jpg', 'c.jpg')] };
  const html = buildPage(ad, [ad]);
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let parseErr = 0, firstErr = '';
  blocks.forEach(b => { try { new Function(b); } catch (e) { parseErr++; firstErr = firstErr || e.message; } });
  check('the generated ad page ships only parseable inline scripts (' + blocks.length + ' blocks)',
    parseErr === 0, parseErr + ' block(s) threw: ' + firstErr);
  check('the generated ad page carries the §PHOTO-GESTURES engine', html.includes('§PHOTO-GESTURES'));
  check('the naive first/last-touch swipe is gone from the generated page',
    html.indexOf('changedTouches[0].clientX - sx') === -1);
  check('the generated lightbox owns touch (touch-action: none)', html.includes('touch-action: none'));

  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  check('SPA: the lightbox image owns touch and zoom',
    css.includes('touch-action:none') && css.includes('.lightbox-img {'));
  check('SPA: lightbox dots are 44px tap targets',
    css.includes('.lightbox-dot { position:relative;width:44px;height:44px'));
  check('SPA: a gallery flick cannot skip photos (scroll-snap-stop: always)',
    css.includes('scroll-snap-stop: always'));

  // Handed to the browser half of this test to load and drive.
  fs.writeFileSync(path.join(ROOT, '_tmp-ad-test.html'), html);
})();
const AD_PAGE = path.join(ROOT, '_tmp-ad-test.html');
function removeAdPage() { try { fs.unlinkSync(AD_PAGE); } catch (e) {} }
process.on('exit', removeAdPage);

/* ── 2. browser: drive real touch gestures ──────────────────────────────── */
const CHROME = [
  process.env.BROWSER_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TG = `window.__tg = function(type, pts) {
  pts = pts || [];
  var touches = pts.map(function(p, i) {
    return new Touch({ identifier: (p.id != null ? p.id : i), target: document.getElementById('lightbox'),
      clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, radiusX: 2, radiusY: 2, force: 1 });
  });
  var lifted = (type === 'touchend' || type === 'touchcancel');
  var ev = new TouchEvent(type, { bubbles: true, cancelable: true,
    touches: lifted ? [] : touches, targetTouches: lifted ? [] : touches, changedTouches: touches });
  document.getElementById('lightbox').dispatchEvent(ev);
  return true;
}; true`;

(async function () {
  if (!CHROME) { console.log('SKIP: no Chrome/Edge found — the §PHOTO-GESTURES browser test needs one.'); removeAdPage(); return; }
  const PORT = 8900 + Math.floor(Math.random() * 400);
  const CDP = 9700 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), 'yaad-photo-' + Math.floor(Math.random() * 1e9));
  const server = spawn(process.execPath, [path.join('tools', 'dev-server.js'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const CHROME_ARGS = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, 'about:blank'];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) CHROME_ARGS.unshift('--no-sandbox');
  const browser = spawn(CHROME, CHROME_ARGS, { stdio: 'ignore' });
  const cleanup = () => {
    try { browser.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  };
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: the §PHOTO-GESTURES browser test exceeded 180s and was killed.');
    cleanup(); process.exit(1);
  }, 180000);
  watchdog.unref();

  try {
    console.log('… waiting for the headless browser on :' + CDP);
    let pages;
    for (let i = 0; i < 60; i++) {
      try { pages = await (await fetch('http://localhost:' + CDP + '/json')).json(); if (pages.find(p => p.type === 'page')) break; } catch (e) {}
      await sleep(500);
    }
    const target = pages && pages.find(p => p.type === 'page');
    if (!target) throw new Error('headless browser never came up');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP websocket never opened (15s)')), 15000);
      ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
      ws.addEventListener('error', ev => { clearTimeout(t); reject(new Error('CDP websocket error: ' + ((ev && ev.message) || 'unknown'))); }, { once: true });
    });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data);
      if (!pending.has(msg.id)) return;
      const p = pending.get(msg.id); clearTimeout(p.timer); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 20000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async expression => {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
      return r.result.value;
    };

    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/?photo=' + Date.now() });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await evaluate('typeof openLightbox === "function" && !!document.getElementById("lightbox")').catch(() => false)) break;
    }
    if (await evaluate('typeof openLightbox') !== 'function') throw new Error('app never booted');
    await evaluate(TG);

    const open3 = async () => {
      await evaluate('closeLightbox(); true');
      await sleep(80);
      await evaluate("openLightbox(['a.png','b.png','c.png'], 0); true");
      await sleep(80);
    };
    /* A strong horizontal drag changes the photo. */
    await open3();
    await evaluate("window.__tg('touchstart',[{x:300,y:400}]); window.__tg('touchmove',[{x:200,y:405}]); window.__tg('touchmove',[{x:120,y:405}]); window.__tg('touchend',[{x:120,y:405}]); true");
    await sleep(60);
    check('a decisive swipe advances to the next photo', await evaluate('_lbIndex') === 1,
      'index=' + await evaluate('_lbIndex'));

    /* A small drift must NOT change the photo. */
    await evaluate("window.__tg('touchstart',[{x:300,y:400}]); window.__tg('touchmove',[{x:288,y:402}]); window.__tg('touchend',[{x:288,y:402}]); true");
    await sleep(60);
    check('a small drift does not change the photo', await evaluate('_lbIndex') === 1,
      'index=' + await evaluate('_lbIndex'));

    /* A mostly-vertical drag from the top dismisses the viewer. */
    await evaluate("window.__tg('touchstart',[{x:300,y:100}]); window.__tg('touchmove',[{x:305,y:200}]); window.__tg('touchmove',[{x:308,y:260}]); window.__tg('touchend',[{x:308,y:260}]); true");
    await sleep(60);
    check('a downward drag dismisses the lightbox',
      await evaluate('document.getElementById("lightbox").classList.contains("open")') === false);

    /* Double-tap zooms in. */
    await open3();
    await evaluate("window.__tg('touchstart',[{x:300,y:400}]); window.__tg('touchend',[{x:300,y:400}]); window.__tg('touchstart',[{x:300,y:400}]); window.__tg('touchend',[{x:300,y:400}]); true");
    await sleep(60);
    const dt = String(await evaluate('document.getElementById("lbImg").style.transform'));
    check('a double-tap zooms the photo', /scale\(2\.5/.test(dt), dt);

    /* Two fingers spread apart zoom in. */
    await open3();
    await evaluate("window.__tg('touchstart',[{id:1,x:250,y:400},{id:2,x:350,y:400}]); window.__tg('touchmove',[{id:1,x:200,y:400},{id:2,x:400,y:400}]); window.__tg('touchend',[{id:1,x:200,y:400},{id:2,x:400,y:400}]); true");
    await sleep(60);
    const pz = String(await evaluate('document.getElementById("lbImg").style.transform'));
    check('a two-finger spread zooms in', /scale\(\s*[2-9]/.test(pz), pz);

    /* The chrome is a real, tappable size. */
    check('lightbox dots are 44px tap targets',
      await evaluate('getComputedStyle(document.querySelector(".lightbox-dot")).width') === '44px');
    check('the lightbox owns the touch surface (touch-action: none)',
      await evaluate('getComputedStyle(document.getElementById("lightbox")).touchAction') === 'none');

    /* One keypress, one photo. js/listings.js and js/widgets-pwa.js both used
       to register a document keydown handler, so a single ArrowRight called
       lbNav() twice and skipped a photo on desktop. */
    await open3();
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); true');
    await sleep(60);
    check('one ArrowRight moves exactly one photo', await evaluate('_lbIndex') === 1,
      'index=' + await evaluate('_lbIndex'));
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true');
    await sleep(60);
    check('Escape closes the lightbox',
      await evaluate('document.getElementById("lightbox").classList.contains("open")') === false);

    /* ── the INLINE gallery on a real generated ad page ──────────────────
       The user-visible path: not fullscreen, tap a thumbnail. This is what
       went dark for every ad page while the template emitted an invalid regex
       — the whole <script> threw, so the photo never changed. */
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/_tmp-ad-test.html' });
    await sleep(900);
    check('the generated ad page script runs (no invalid-regex SyntaxError)',
      await evaluate('typeof setFeatured') === 'function',
      'typeof setFeatured=' + await evaluate('typeof setFeatured'));
    check('tapping a thumbnail changes the inline photo', await evaluate(
      '(function(){ var before = document.getElementById("featuredImg").getAttribute("src");' +
      ' document.querySelectorAll(".thumb")[2].click();' +
      ' return new Promise(function(res){ setTimeout(function(){' +
      '  res(document.getElementById("featuredImg").getAttribute("src") !== before); }, 350); }); })()') === true);
    check('opening fullscreen starts on the photo you picked', await evaluate(
      'document.getElementById("featuredImg").click(); lbIndex') === 2,
      'lbIndex=' + await evaluate('lbIndex'));
    check('closing fullscreen syncs the inline gallery back', await evaluate(
      '(function(){ closeLightbox(); var t = document.querySelectorAll(".thumb");' +
      ' return document.querySelector(".thumb.active") === t[2] &&' +
      '   document.getElementById("featuredImg").getAttribute("src").indexOf("c.jpg") > -1; })()') === true);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    failed++;
  } finally {
    clearTimeout(watchdog);
    removeAdPage();
    cleanup();
  }
})().then(() => {
  console.log('\n' + (failed === 0 ? 'PHOTO-GESTURES: ALL PASSED' : 'PHOTO-GESTURES: ' + failed + ' FAILED'));
  process.exitCode = failed ? 1 : 0;
}).catch(e => { console.error('FATAL: ' + e.message); process.exitCode = 1; });

