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

  /* Local files this repo really serves. The swap assertions must not depend on
     an external host being reachable from the test machine — and with the
     decode-then-swap behaviour, an unreachable URL means the swap waits for the
     error, which is far too slow to assert on. */
  const ad = { id: 'a1', title: 'Toyota Axio', price: 1200000, neg: true, status: 'active',
    parish: 'Kingston', category: 'vehicles', seller: 'Seller', sellerId: 's1',
    phone: '8765551234', desc: 'Clean car', date: new Date().toISOString(),
    image: '/icon-192.png',
    photos: ['/icon-192.png', '/apple-touch-icon.png', '/splash-750x1334.png'] };
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

  /* §PHOTOSWIPE — the inline gallery is what a visitor actually lands on:
     openDetail() navigates to /ad/<slug>.html whenever that page exists. Until
     now that photo was the one surface you could not swipe at all. */
  check('the generated ad page carries the §PHOTOSWIPE engine', html.includes('§PHOTOSWIPE'));
  check('the inline gallery claims the horizontal axis only (vertical still scrolls)',
    /touch-action:\s*pan-y/.test(html));
  check('the swipe stacks a second photo layer to slide into view',
    html.includes('gallery-ghost') && html.includes('is-armed'));
  check('the swipe rides the finger rather than snapping (translateX on both layers)',
    html.includes('translate3d(') && html.includes('gallerySwipeSync'));
  check('a native image drag cannot hijack the swipe',
    html.includes('draggable="false"') && html.includes("addEventListener('dragstart'"));
  check('the desktop arrows are display:none on touch, never invisible-but-tappable',
    html.includes('@media (hover: none) { .gallery-arrow { display: none; } }'));
  check('the swipe respects prefers-reduced-motion',
    html.includes("matchMedia('(prefers-reduced-motion: reduce)')"));
  check('the thumbnail tap and the lightbox close both re-seat the swipe index',
    /gallerySwipeSync\(idx, true\)/.test(html) && /gallerySwipeSync\(lbIndex, false\)/.test(html));

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

const PS = `window.__ps = function(type, x, y) {
  var el = document.getElementById('mainImg');
  var ev = new PointerEvent(type, { bubbles: true, cancelable: true,
    pointerId: 1, pointerType: 'touch', isPrimary: true,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y });
  el.dispatchEvent(ev);
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
      '   document.getElementById("featuredImg").getAttribute("src") === "/splash-750x1334.png"; })()') === true);

    /* ── §PHOTOSPIN: a photo that is still arriving shows a shimmer ───────────
       Driven deterministically rather than with CDP throttling. Network
       emulation proved unreliable here — the idle warm-up had already pulled
       the file, so the "slow" photo arrived instantly and the assertion measured
       a cache hit. Instead the real showFeatured() runs against a stubbed Image
       that never completes: exactly the state a slow connection produces, every
       time. */
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/_tmp-ad-test.html' });
    await sleep(2000);
    await evaluate('window.__realImage = window.Image;' +
                   'window.Image = function () { return { complete: false }; }; true');
    await evaluate('document.querySelectorAll(".thumb")[2].click(); true');
    await sleep(500);   // past the 220ms delay
    check('a photo that is still arriving shows a loading shimmer',
      await evaluate('document.querySelector(".gallery-main").classList.contains("is-loading")') === true);
    check('the old photo stays on screen while the new one loads (no blank frame)',
      await evaluate('document.getElementById("featuredImg").getAttribute("src")') === '/icon-192.png');

    /* And the mirror case: a photo that is already here must never flash one. */
    await evaluate('window.Image = window.__realImage; true');
    await evaluate('document.querySelectorAll(".thumb")[2].click(); true');
    await sleep(400);
    check('the shimmer clears once the photo arrives',
      await evaluate('!document.querySelector(".gallery-main").classList.contains("is-loading")') === true);
    check('the photo swapped in',
      await evaluate('document.getElementById("featuredImg").getAttribute("src")') === '/splash-750x1334.png');

    /* ── §PHOTOSWIPE — swipe the ad page's own photo ─────────────────────────
       Before this, the inline gallery had a thumbnail strip and a fullscreen
       lightbox but no swipe of its own, so flicking between a listing's photos
       meant tapping into fullscreen first. These drive the real engine with
       synthetic pointer events at a 390px viewport.
       PHOTOS_FEAT on this page is icon-192 / apple-touch-icon / splash-750. */
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/_tmp-ad-test.html' });
    await sleep(1200);
    await evaluate(PS);
    check('the swipe engine mounted on the inline gallery',
      await evaluate('typeof gallerySwipeSync === "function" && !!document.querySelector(".gallery-ghost")'));
    check('the gallery claims the horizontal axis and leaves the vertical to the page',
      await evaluate('getComputedStyle(document.getElementById("mainImg")).touchAction') === 'pan-y');

    /* Real swipes are many frames long, not one synchronous block — the pauses
       matter: without them every gesture reads as zero elapsed time and the
       flick-velocity branch would fire on any nudge. */
    const swipe = async pts => {
      await evaluate('window.__ps("pointerdown", ' + pts[0][0] + ', ' + pts[0][1] + '); true');
      for (let i = 1; i < pts.length - 1; i++) {
        await evaluate('window.__ps("pointermove", ' + pts[i][0] + ', ' + pts[i][1] + '); true');
        await sleep(35);
      }
      const last = pts[pts.length - 1];
      await evaluate('window.__ps("pointerup", ' + last[0] + ', ' + last[1] + '); true');
    };
    const src = () => evaluate('document.getElementById("featuredImg").getAttribute("src")');
    const P0 = '/icon-192.png', P1 = '/apple-touch-icon.png', P2 = '/splash-750x1334.png';

    /* A decisive left drag changes the photo, with the finger. A browser
       synthesises its click within a few ms of the release, so fire it right
       here — that click is what the swipe engine has to swallow. */
    await swipe([[300, 300], [240, 301], [170, 301], [100, 301]]);
    await evaluate('document.getElementById("featuredImg").click(); true');
    await sleep(650);
    check('a decisive swipe advances the inline photo', await src() === P1, 'src=' + await src());
    check('the swipe carries the active thumbnail with it',
      await evaluate('document.querySelectorAll(".thumb")[1].classList.contains("active")') === true);
    check('the swipe keeps the fullscreen index in step (a tap opens the right photo)',
      await evaluate('lbIndex') === 1, 'lbIndex=' + await evaluate('lbIndex'));
    check('the photo settles back to rest, not stranded mid-transform',
      await evaluate('document.getElementById("featuredImg").style.transform') === '');
    check('the click left behind by a swipe is swallowed, not opened as fullscreen',
      await evaluate('document.getElementById("lightbox").classList.contains("open")') === false);

    /* Back the other way — proves the index really tracked, rather than the
       second swipe restarting from photo 0. */
    await swipe([[100, 300], [180, 301], [250, 301], [320, 301]]);
    await sleep(650);
    check('swiping back returns to the previous photo', await src() === P0, 'src=' + await src());

    /* A nudge is not a swipe. */
    await swipe([[300, 300], [295, 301], [290, 302]]);
    await sleep(600);
    check('a small drift springs back without changing the photo',
      await src() === P0, 'src=' + await src());

    /* Vertical drags belong to the page, not the gallery. */
    await swipe([[300, 300], [303, 250], [306, 180], [308, 120]]);
    await sleep(600);
    check('a vertical drag scrolls the page instead of changing the photo',
      await src() === P0, 'src=' + await src());

    /* The first photo has nowhere to go — it must rubber-band, not run off. */
    await swipe([[80, 300], [160, 301], [240, 301], [320, 301]]);
    await sleep(650);
    check('the first photo rubber-bands instead of running off the end',
      await src() === P0, 'src=' + await src());

    /* A tap is still a tap. */
    await evaluate('window.__ps("pointerdown", 200, 300); window.__ps("pointerup", 200, 300); true');
    await sleep(80);
    await evaluate('document.getElementById("featuredImg").click(); true');
    await sleep(150);
    check('a tap still opens fullscreen',
      await evaluate('document.getElementById("lightbox").classList.contains("open")') === true);
    check('fullscreen opens on the photo the swipe left us on', await evaluate('lbIndex') === 0);

    /* Closing fullscreen must re-seat the swipe engine on whatever photo the
       visitor swiped to in there — otherwise the next inline swipe jumps from
       a photo they left several swipes ago. */
    await evaluate('lbNav(1); lbNav(1); true');
    await sleep(80);
    await evaluate('closeLightbox(); true');
    await sleep(150);
    check('closing fullscreen syncs the inline photo back', await src() === P2, 'src=' + await src());
    await swipe([[300, 300], [240, 301], [170, 301], [100, 301]]);
    await sleep(650);
    check('a swipe from the last photo leaves it alone (no running off the end)',
      await src() === P2, 'src=' + await src());
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

