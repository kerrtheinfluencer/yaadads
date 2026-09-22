/* Browser layout regression check. Start tools/dev-server.js 8893 and Chrome
   with --headless=new --remote-debugging-port=9233 and a temporary profile.
   Uses Node's built-in WebSocket; no browser automation dependency. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async function () {
  const pages = await (await fetch('http://localhost:9233/json')).json();
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
    await send('Page.navigate', { url: 'http://localhost:8893/' });
    await new Promise(resolve => setTimeout(resolve, 9000));
    await evaluate(`document.fonts.ready.then(() => true)`);
    // Dismiss onboarding only in this disposable browser, to measure the feed.
    await evaluate(`document.querySelector('#obRoot')?.remove(); document.body.style.overflow = ''; true`);
    for (const width of [1440, 780, 768, 640, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await evaluate(`document.querySelector('.hero').classList.remove('searched'); window.scrollTo(0,0); true`);
      await new Promise(resolve => setTimeout(resolve, 700));
      const metrics = await evaluate(`(() => {
        const hero = document.querySelector('.hero');
        const row = document.querySelector('.ai-suggestions');
        const rect = hero.getBoundingClientRect();
        const cards = document.querySelectorAll('.listings-grid .ad-card');
        return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
          heroHeight: Math.round(rect.height), heroBottom: Math.round(rect.bottom),
          firstListingTop: cards.length ? Math.round(cards[0].getBoundingClientRect().top) : null,
          chipHeight: row.firstElementChild.getBoundingClientRect().height,
          firstChipReachable: row.firstElementChild.getBoundingClientRect().left >= row.getBoundingClientRect().left,
          counters: ['sStat','uStat','vStat'].every(id => !!document.getElementById(id)) };
      })()`);
      console.log(JSON.stringify(metrics));
      assert.equal(metrics.overflow, false, 'page overflow at ' + width);
      assert.ok(metrics.chipHeight >= 44, 'touch target at ' + width);
      assert.ok(metrics.firstChipReachable, 'first suggestion clipped at ' + width);
      assert.ok(metrics.counters, 'live counters retained');
      assert.ok(metrics.heroHeight < 500, 'hero stays compact at ' + width);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(os.tmpdir(), 'yaad-hero-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      await evaluate(`document.querySelector('.hero').classList.add('searched'); true`);
      await new Promise(resolve => setTimeout(resolve, 700));
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.ai-suggestions')).display`), 'none');
    }
    console.log('PASS: responsive hero, touch targets, counters, overflow and search collapse. Screenshots in ' + os.tmpdir());
  } finally { ws.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
