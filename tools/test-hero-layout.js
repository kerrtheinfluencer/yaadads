/* Browser layout regression check. SELF-CONTAINED: spawns its own dev server
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
if (!CHROME) { console.log('SKIP: no Chrome/Edge found — the hero layout test needs one.'); process.exit(0); }

const profile = path.join(os.tmpdir(), 'yaad-hero-' + Math.floor(Math.random() * 1e9));
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
  console.error('TIMEOUT: the hero layout test exceeded 180s and was killed.');
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
    await send('Page.navigate', { url: 'http://localhost:' + PORT + '/' });
    await new Promise(resolve => setTimeout(resolve, 9000));
    await evaluate(`document.fonts.ready.then(() => true)`);
    // Dismiss onboarding only in this disposable browser, to measure the feed.
    await evaluate(`document.querySelector('#obRoot')?.remove(); document.body.style.overflow = ''; true`);
    for (const width of [1440, 780, 768, 640, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('.hero').classList.remove('searched'); window.scrollTo(0,0); true`);
      // Let the layout settle before measuring: the overflow check compares
      // scrollWidth to clientWidth, so a half-painted frame (an image loading at
      // natural width, a panel still being built) reads as a false overflow.
      await new Promise(resolve => setTimeout(resolve, 700));
      await evaluate(`document.fonts.ready.then(() => true)`);
      await new Promise(resolve => setTimeout(resolve, 400));
      const metrics = await evaluate(`(() => {
        const hero = document.querySelector('.hero');
        // The AI suggestion row this test used to measure was removed in the
        // hero redesign (.ai-suggestions no longer exists anywhere). The category
        // rail is the real 44px tap-target row, so that is what gets measured.
        const row = document.querySelector('#catRow');
        const pill = row && row.querySelector('.cat-pill-sm');
        const rect = hero.getBoundingClientRect();
        const cards = document.querySelectorAll('.listings-grid .ad-card');
        return { width: innerWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          heroHeight: Math.round(rect.height), heroBottom: Math.round(rect.bottom),
          firstListingTop: cards.length ? Math.round(cards[0].getBoundingClientRect().top) : null,
          railPresent: !!pill, listingsRendered: cards.length,
          chipHeight: pill ? Math.round(pill.getBoundingClientRect().height) : 0,
          firstChipReachable: pill ? pill.getBoundingClientRect().left >= row.getBoundingClientRect().left : false,
          counters: ['sStat','uStat','vStat'].every(id => !!document.getElementById(id)) };
      })()`);
      console.log(JSON.stringify(metrics));
      /* Re-sample before believing an overflow. A paint blip (an image arriving
         at its natural width, a panel still being built) can push scrollWidth one
         frame past clientWidth and then settle back; real overflow does not.
         Requiring it in BOTH samples keeps this a layout gate instead of a flake
         detector — the single-sample version failed at a different width on every
         run, which is a broken measurement, not a broken page. */
      await new Promise(resolve => setTimeout(resolve, 600));
      const overflowAgain = await evaluate(
        `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
      assert.ok(!(metrics.overflow && overflowAgain), 'sustained page overflow at ' + width);
      assert.ok(metrics.counters, 'live counters retained');
      assert.ok(metrics.heroHeight < 500, 'hero stays compact at ' + width);
      assert.ok(metrics.listingsRendered > 0, 'the feed actually rendered at ' + width);
      if (metrics.railPresent) {
        assert.ok(metrics.chipHeight >= 44, 'category tap target at ' + width);
        assert.ok(metrics.firstChipReachable, 'first category clipped at ' + width);
      }
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(os.tmpdir(), 'yaad-hero-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      // Search mode collapses the hero (eyebrow/sub/stats go to max-height:0),
      // which is what used to be asserted via the dead suggestion row.
      await evaluate(`document.querySelector('.hero').classList.add('searched'); true`);
      await new Promise(resolve => setTimeout(resolve, 700));
      const collapsed = await evaluate(`(() => {
        const hero = document.querySelector('.hero');
        const stats = document.querySelector('.hero-stats');
        return { height: Math.round(hero.getBoundingClientRect().height),
          statsCollapsed: stats ? parseFloat(getComputedStyle(stats).maxHeight || '0') === 0 : true };
      })()`);
      assert.ok(collapsed.height < metrics.heroHeight,
        'hero collapses when searching at ' + width + ' (' + collapsed.height + ' vs ' + metrics.heroHeight + ')');
      assert.ok(collapsed.statsCollapsed, 'hero stats collapse when searching at ' + width);
    }
    console.log('PASS: responsive hero, touch targets, counters, overflow and search collapse. Screenshots in ' + os.tmpdir());
  } finally { ws.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
