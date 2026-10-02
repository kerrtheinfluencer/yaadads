/* ── §PTR-CALM — pull-to-refresh regression gate.
   ───────────────────────────────────────────────────────────────────────────
   Two real defects lived here and neither was visible to any unit test:

   1. It fired far too easily. Measured on the real app at 390px: a 130px pull
      reloaded the page, and so did a 45° drag and a pull that started on the
      category rail or the buttons above the listings — all of which sit exactly
      where PTR is armed.
   2. There was NO way to cancel. Pull past the line, drag back up to change your
      mind, let go — and the page reloaded anyway, because the upward branch
      returned early while leaving the pull armed.

   This drives real touch events on the real app. Each case gets a fresh page
   load, because the 8s+ cooldown is closure state no test can reach from the
   page, and a dropped performance.now() is how the location.reload() path shows
   up. Skips itself (exit 0) without Chrome.
   Usage: node tools/test-pull-refresh.js                                          */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
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
if (!CHROME) { console.log('SKIP: no Chrome/Edge found — the pull-to-refresh test needs one.'); process.exit(0); }

const PORT = 8950 + Math.floor(Math.random() * 40);
const CDP = 9700 + Math.floor(Math.random() * 40);
const profile = path.join(os.tmpdir(), 'yaad-ptr-' + Math.floor(Math.random() * 1e9));
const server = spawn(process.execPath, [path.join('tools', 'dev-server.js'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const CHROME_ARGS = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, 'about:blank'];
if (process.platform === 'linux' && process.getuid && process.getuid() === 0) CHROME_ARGS.unshift('--no-sandbox');
const browser = spawn(CHROME, CHROME_ARGS, { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cleanup() {
  try { browser.kill(); } catch (e) {}
  try { server.kill(); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);
const watchdog = setTimeout(() => {
  console.error('TIMEOUT: the pull-to-refresh test exceeded 180s and was killed.');
  cleanup(); process.exit(1);
}, 180000);
watchdog.unref();

const HELPERS = `
window.__ptr = 0;
var _loadAds = window.loadAds;
window.loadAds = function () { window.__ptr++; return Promise.resolve(); };
window.__tg = function (type, pts, sel) {
  var host = sel ? document.querySelector(sel) : document.body;
  if (!host) host = document.body;
  var t = pts.map(function (p, i) {
    return new Touch({ identifier: i, target: host, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y });
  });
  var up = (type === 'touchend' || type === 'touchcancel');
  host.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
    touches: up ? [] : t, targetTouches: up ? [] : t, changedTouches: t }));
};
window.__drag = function (pts, sel) {
  window.__tg('touchstart', [pts[0]], sel);
  for (var i = 1; i < pts.length; i++) window.__tg('touchmove', [pts[i]], sel);
  window.__tg('touchend', [pts[pts.length - 1]], sel);
};
true`;

(async function () {
  let failed = 0;
  function check(name, ok, detail) {
    console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || detail === undefined ? '' : ' — ' + detail));
    if (!ok) failed++;
  }

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
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (!pending.has(msg.id)) return;
    const p = pending.get(msg.id); clearTimeout(p.timer); pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 25000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
    return r.result.value;
  };

  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  /* Every case reloads first: PTR's cooldown is closure state a test cannot
     reach from the page, so reusing one page would skip every refresh after the
     first and the suite would go green while testing nothing. */
  async function freshPage() {
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/?ptr=' + Date.now() });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const up = await evaluate('typeof window.loadAds === "function" && !!document.querySelector(".ptr-bar")').catch(() => false);
      if (up) break;
    }
    await evaluate('document.querySelector("#obRoot") && document.querySelector("#obRoot").remove(); true');
    await evaluate(HELPERS);
    await evaluate('window.scrollTo(0, 0); true');
    await sleep(500);
  }

  /* A refresh is either the stubbed loadAds() or a location.reload(), which
     resets performance.now(). Both count. Returns true if the page refreshed. */
  async function didRefresh(t0) {
    await sleep(700);
    const t1 = await evaluate('performance.now()').catch(() => -1);
    if (t1 < t0) return true;                       // location.reload()
    return (await evaluate('window.__ptr').catch(() => 0)) > 0;
  }

  try {
    /* 1. A modest pull must NOT reload the page (it used to). */
    let t0;
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:200,y:120},{x:200,y:170},{x:200,y:250}]); true');
    check('a 130px pull does not reload the page', !(await didRefresh(t0)));

    /* 2. A long deliberate pull must STILL refresh — the feature has to survive. */
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:200,y:120},{x:200,y:200},{x:200,y:280},{x:200,y:340}]); true');
    check('a long deliberate pull still refreshes', await didRefresh(t0));

    /* 3. THE ESCAPE HATCH: pull past the line, drag back UP, then let go.
          Before the fix this still reloaded the page. */
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:200,y:120},{x:200,y:200},{x:200,y:300},{x:200,y:360},' +
                    '{x:200,y:260},{x:200,y:180},{x:200,y:120}]); true');
    check('swiping back up cancels the pull — no refresh', !(await didRefresh(t0)));

    /* 4. A pull that begins on a horizontal rail is a scroll, never a refresh. */
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:200,y:120},{x:200,y:200},{x:200,y:300}], ".cat-pill-sm"); true');
    check('a pull starting on the category rail does not refresh', !(await didRefresh(t0)));

    /* 5. A 45° drag is not a pull-to-refresh. */
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:140,y:120},{x:230,y:200},{x:320,y:280}]); true');
    check('a diagonal drag does not refresh', !(await didRefresh(t0)));

    /* 6. The cancelled state must not leave a stale armed pull behind. */
    await freshPage();
    t0 = await evaluate('performance.now()');
    await evaluate('window.__drag([{x:200,y:120},{x:200,y:250},{x:200,y:340},{x:200,y:140}]); true');
    await sleep(300);
    await evaluate('window.__tg("touchstart",[{x:200,y:400}]); window.__tg("touchend",[{x:200,y:400}]); true');
    check('a tap right after a cancelled pull does not refresh', !(await didRefresh(t0)));
  } catch (e) {
    console.error('ERROR: ' + e.message);
    failed++;
  } finally {
    clearTimeout(watchdog);
    cleanup();
  }

  console.log('\n' + (failed === 0 ? 'PULL-REFRESH: ALL PASSED' : 'PULL-REFRESH: ' + failed + ' FAILED'));
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error('FATAL: ' + e.message); process.exitCode = 1; });