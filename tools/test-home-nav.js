/* Home-navigation regression check: pressing Home gets you home.
    SELF-CONTAINED: spawns its own dev server
   and its own headless browser (same resolution + teardown pattern as
   tools/test-msg-v2.js), so `npm test` or CI can run it unattended. It used
   to require a human to start both by hand and silently SKIP when they were
   absent - which is why a real layout regression gate sat unwired.
   Uses Node's built-in WebSocket; no browser automation dependency. */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
/* Random high ports, never fixed ones. Fixed ports made this test connect to
   an ORPHANED Chrome + dev server left behind by an earlier crashed run, which
   looks exactly like a hung test and silently measures nothing. */
const PORT = 8800 + Math.floor(Math.random() * 600);
const CDP = 9600 + Math.floor(Math.random() * 600);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Same browser resolution as tools/test-onboarding.js and tools/test-msg-v2.js:
   BROWSER_PATH → Windows → Linux → macOS. Without the Linux entry this skips
   itself on the CI runner, which is a green step that measures nothing. */
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
if (!CHROME) { console.log('SKIP: no Chrome/Edge found — the home-navigation test needs one.'); process.exit(0); }

const profile = path.join(os.tmpdir(), 'yaad-home-' + Math.floor(Math.random() * 1e9));
const server = spawn(process.execPath, [path.join('tools', 'dev-server.js'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const CHROME_ARGS = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, 'about:blank'];
// CI containers run as root; Chrome refuses to start its sandbox there.
if (process.platform === 'linux' && process.getuid && process.getuid() === 0) CHROME_ARGS.unshift('--no-sandbox');
const browser = spawn(CHROME, CHROME_ARGS, { stdio: 'ignore' });

function cleanup() {
  try { browser.kill(); } catch (e) {}
  try { server.kill(); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);

/* Watchdog. A browser that answers but never paints (or a CDP target that goes
   quiet mid-run) would otherwise hang this file forever, and a hanging test in
   `npm test` is how a whole suite gets ignored. Hard stop, always. */
const watchdog = setTimeout(() => {
  console.error('TIMEOUT: the home-navigation test exceeded 180s and was killed.');
  cleanup();
  process.exit(1);
}, 180000);
watchdog.unref && watchdog.unref();

/* Wait for the CDP endpoint instead of assuming someone started it. v1 fetched
   once and died with a raw "TypeError: fetch failed" stack, which reads like a
   broken test rather than a browser that had not finished booting. */
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch('http://localhost:' + CDP + '/json')).json();
      const page = pages.find(p => p.type === 'page');
      if (page) return pages;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('Chrome did not expose a CDP page target within 30s.');
}

(async function () {
  const pages = await waitForCdp();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer); pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 20000);
      pending.set(key, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: key, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  try {
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:' + PORT + '/' });
    await new Promise(resolve => setTimeout(resolve, 9000));
    await evaluate(`document.querySelector('#obRoot')?.remove(); document.body.style.overflow = ''; window.__sameDoc = 1; true`);

    // The logo is a real link home, and it never reloads the page.
    const logo = await evaluate(`(() => { const a = document.querySelector('a.nav-logo'); return a ? a.getAttribute('href') : null; })()`);
    assert.equal(logo, '/', 'the logo is a real <a href="/">');

    // Pressing Home while already on Home scrolls back to the top (both the logo and the Home tab).
    for (const sel of ['a.nav-logo', '#mnHome']) {
      await evaluate(`window.scrollTo(0, 1400); true`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const before = await evaluate(`window.scrollY`);
      assert.ok(before > 400, 'the page scrolled down before pressing ' + sel + ' (' + before + ')');
      await evaluate(`document.querySelector('${sel}').click(); true`);
      await new Promise(resolve => setTimeout(resolve, 1600));
      const after = await evaluate(`window.scrollY`);
      assert.ok(after < 8, sel + ' scrolls back to the top (' + after + ')');
      assert.equal(await evaluate(`window.__sameDoc`), 1, sel + ' never reloads the page');
    }
    // The feed is still there afterwards.
    assert.ok(await evaluate(`document.querySelectorAll('.listings-grid .ad-card').length > 0`), 'the feed is still rendered');
    console.log('PASS: Home logo and Home tab scroll to top without reloading.');
  } finally { ws.close(); }
})().then(() => { cleanup(); })
  .catch(error => { console.error(error); cleanup(); process.exit(1); });
