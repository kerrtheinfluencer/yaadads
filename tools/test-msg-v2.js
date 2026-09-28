/* ── §MSG-V2 end-to-end messaging regression test.
   Boots the real app in a headless Chrome against tools/dev-server.js, then
   drives the actual chat with hostile member data. Everything the v1 chat got
   wrong is invisible to a regex check: a stored-XSS name only shows up when a
   real parser meets it, a double-send needs two keys pressed, and "the offer
   feature ships" means nothing unless a click really sends one.
   Self-contained — spawns its own server + browser and tears both down.
   Usage: node tools/test-msg-v2.js                                            */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
/* Random high ports, never fixed ones. A crashed run that leaves an orphaned
   browser on a fixed port makes the NEXT run connect to a dead target — which
   looks like a hang and tests nothing. */
const PORT = 8800 + Math.floor(Math.random() * 600);
const CDP = 9600 + Math.floor(Math.random() * 600);
/* Browser resolution mirrors tools/test-onboarding.js exactly (BROWSER_PATH →
   Windows → Linux → macOS). Without the Linux/macOS entries this file SKIPs
   itself on the GitHub runner, which is a green step that tests nothing. */
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
if (!CHROME) { console.log('SKIP: no Chrome/Edge found — the §MSG-V2 browser test needs one.'); process.exit(0); }

const profile = path.join(os.tmpdir(), 'yaad-msg-' + Math.floor(Math.random() * 1e9));
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Watchdog. The CDP socket is a live handle, so a browser that never answers
   would hang this file forever instead of failing — and a hanging test in
   `npm test` is how a whole suite gets ignored. Hard stop, always. */
const watchdog = setTimeout(() => {
  console.error('TIMEOUT: the §MSG-V2 browser test exceeded 180s and was killed.');
  cleanup();
  process.exit(1);
}, 180000);
watchdog.unref();

/* Fixtures. The names, titles and one message carry markup ON PURPOSE: a member
   can call themselves anything, and every one of those strings lands in innerHTML. */
const XSS = '<img src=x onerror="window.__pwned=1">';
const KEY = 'me__them__ad1';
const SETUP = `(() => {
  CU = { id: 'me', name: 'Tester', email: 't@t.jm', phone: '', parish: 'Kingston' };
  _ads.push({ id: 'ad1', title: 'Toyota Axio ${XSS}', price: 1200000, neg: true,
              status: 'active', parish: 'Kingston', category: 'vehicles',
              seller: 'Seller', sellerId: 'them', date: new Date().toISOString(),
              image: '', photos: [] });
  _msgs['${KEY}'] = {
    adId: 'ad1', adTitle: 'Axio ${XSS}',
    sellerId: 'them', sellerName: 'Seller ${XSS}', sellerInit: '${XSS}',
    buyerId: 'me', buyerName: 'Tester', buyerInit: 'T',
    messages: [
      { id: 'm1', from: 'them', text: 'Is it still there? ${XSS}', ts: Date.now() - 60000, read: false },
      { id: 'm2', from: 'me',   text: 'Yes, still here', ts: Date.now() - 30000, read: false },
      { id: 'm3', from: 'me',   text: 'Read by you', ts: Date.now() - 20000, read: true }
    ]
  };
  window.__pwned = 0;
  openChatFromInbox('${KEY}');
  return true;
})()`;

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok || detail === undefined ? '' : ' — ' + detail));
  if (!ok) failed++;
}

(async function () {
  console.log('… waiting for the headless browser on :' + CDP);
  let pages;
  for (let i = 0; i < 60; i++) {
    try {
      pages = await (await fetch('http://localhost:' + CDP + '/json')).json();
      if (pages.find(p => p.type === 'page')) break;
    } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  const target = pages && pages.find(p => p.type === 'page');
  assert.ok(target, 'headless browser never came up');
  console.log('… attaching to ' + target.webSocketDebuggerUrl);

  /* The handshake can fail silently: an unreachable endpoint or a browser that
     refuses the origin leaves 'open' unfired forever, and an unresolved await
     is an invisible hang. Race it, and fail loudly. */
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('CDP websocket never opened (15s)')), 15000);
    ws.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
    ws.addEventListener('error', ev => {
      clearTimeout(t);
      reject(new Error('CDP websocket error: ' + ((ev && ev.message) || 'unknown')));
    }, { once: true });
  });
  console.log('… attached');
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timer); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
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

  try {
    // No Network domain and no --virtual-time-budget here: virtual time stalls
    // CDP replies (Network.enable never answers), and this test only needs the
    // DOM. A throwaway profile has no service worker and no cache to bust.
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: 'http://localhost:' + PORT + '/?msgv2=' + Date.now() });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const up = await evaluate('typeof renderChat === "function" && typeof openChatFromInbox === "function"').catch(() => false);
      if (up) break;
    }
    assert.equal(await evaluate('typeof renderChat'), 'function', 'app never booted');

    await evaluate(SETUP);
    await sleep(300);

    /* 1 ── stored XSS: a hostile name/title/bubble must arrive as TEXT. */
    check('a hostile seller name is rendered as text, not executed',
      await evaluate('window.__pwned === 0') === true,
      'the payload ran — member data reached innerHTML unescaped');
    check('the name keeps its literal characters',
      await evaluate('document.querySelector(".chat-name").textContent.indexOf("<img") > -1') === true);
    check('the ad title in the header is escaped too',
      await evaluate('document.querySelector(".chat-ad-ref").innerHTML.indexOf("<img") === -1') === true);
    check('the message bubble is escaped',
      await evaluate('document.querySelector(".msg-in .msg-bubble").innerHTML.indexOf("<img") === -1') === true);

    /* 2 ── read receipts: ✓ sent / ✓✓ read, driven by the real `read` flag. */
    const ticks = await evaluate('Array.from(document.querySelectorAll(".msg-out .msg-ticks")).map(n => n.textContent + (n.classList.contains("is-read") ? "|read" : "|sent"))');
    check('outgoing bubbles carry ✓ sent / ✓✓ read from real state',
      JSON.stringify(ticks) === JSON.stringify(['✓|sent', '✓✓|read']), JSON.stringify(ticks));

    /* 3 ── ad context bar. */
    check('the thread shows which listing it is about, with its price',
      await evaluate('!!document.querySelector(".chat-adbar .chat-adbar-t") && document.querySelector(".chat-adbar .chat-adbar-m").textContent.indexOf("1,200,000") > -1') === true);
    check('the ad bar links back by data attribute, not onclick',
      await evaluate('!!document.querySelector(".chat-adbar-btn[data-chat-ad=ad1]") && !document.querySelector(".chat-adbar-btn").getAttribute("onclick")') === true);

    /* 4 ── quick replies fill the composer without sending anything. */
    await evaluate('document.querySelectorAll(".chat-chip")[1].click()');
    const chip = await evaluate('document.getElementById("chatInput").value');
    check('a quick reply drops its text into the composer', chip === 'What’s your best price?', JSON.stringify(chip));
    check('the send button enables once there is something to send',
      await evaluate('!document.getElementById("chatSend").disabled') === true);
    check('tapping a chip sends nothing',
      await evaluate('_msgs["' + KEY + '"].messages.length') === 3);
    check('quick replies are the buyer\u2019s questions in a buyer thread',
      await evaluate('Array.from(document.querySelectorAll(".chat-chip")).map(n => n.textContent).join("|")')
        === 'Hi! Is this still available?|What\u2019s your best price?|Where can we meet?|Can you deliver?');
    check('a long thread drops the chips instead of cluttering it',
      await evaluate('_msgs["me__them__ad1"].messages.push({id:"z",from:"them",text:"x",ts:Date.now(),read:false}), ' +
                     '_msgs["me__them__ad1"].messages.push({id:"z2",from:"them",text:"x",ts:Date.now(),read:false}), ' +
                     '_msgs["me__them__ad1"].messages.push({id:"z3",from:"them",text:"x",ts:Date.now(),read:false}), ' +
                     '_msgs["me__them__ad1"].messages.push({id:"z4",from:"them",text:"x",ts:Date.now(),read:false}), ' +
                     'renderChat("me__them__ad1"), document.querySelectorAll(".chat-chip").length') === 0);
    await evaluate('_msgs["me__them__ad1"].messages.length = 3, renderChat("me__them__ad1")');
    await sleep(200);
    check('a seller gets the seller\u2019s questions, not the buyer\u2019s',
      await evaluate('(() => { CU.id = "them"; renderChat("me__them__ad1"); ' +
        'const t = Array.from(document.querySelectorAll(".chat-chip")).map(n => n.textContent).join("|"); ' +
        'CU.id = "me"; renderChat("me__them__ad1"); return t; })()')
        === 'Is it still available?|What is your best offer?|When can I come see it?|Are you able to deliver?');

    /* 5 ── a failed send must not eat the text (v1 cleared the box up front). */
    await evaluate('window.__tried = 0; sbSendMessage = function () { window.__tried++; return Promise.reject(new Error("offline")); }; true');
    await evaluate('document.getElementById("chatInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))');
    await sleep(500);
    console.log('   DIAG ' + await evaluate('JSON.stringify({ tried: window.__tried, sending: _msgSending, conv: !!currentConv, cu: !!CU, ' +
      'boxVal: (document.getElementById("chatInput")||{}).value, stub: sbSendMessage.toString().slice(0, 40), ' +
      'toast: ((document.getElementById("toast")||{}).textContent || "") })'));
    check('a failed send restores what you typed',
      await evaluate('document.getElementById("chatInput").value') === 'What’s your best price?',
      JSON.stringify(await evaluate('document.getElementById("chatInput").value')));
    check('a background refresh never deletes a conversation (merge, not replace)',
      await evaluate('loadMessages(), new Promise(r => setTimeout(() => r(!!_msgs["me__them__ad1"]), 1500))') === true);
    check('a failed send offers a one-tap Retry',
      await evaluate('!!(document.getElementById("toast") || {}).textContent && /Retry|failed/i.test(document.getElementById("toast").textContent)') === true);

    /* 6 ── a send is single-flight: Enter twice must post one message. */
    await evaluate('window.__tried = 0; sbSendMessage = function (k, meta, text) { window.__tried++; _msgs[k].messages.push({ id: "x1", from: CU.id, text: text, ts: Date.now(), read: false }); return Promise.resolve(); }; true');
    await evaluate('var b = document.getElementById("chatInput"); b.value = "one message"; ' +
                   'b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); ' +
                   'b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); true');
    await sleep(500);
    const tried = await evaluate('window.__tried');
    check('Enter twice in a row sends exactly one message', tried === 1, 'tried=' + tried);
    check('the composer is cleared after a successful send',
      await evaluate('document.getElementById("chatInput").value') === '');
    check('the sent message appears in the thread',
      await evaluate('!!Array.from(document.querySelectorAll(".msg-out .msg-bubble")).find(n => n.textContent === "one message")') === true);

    /* 7 ── the in-chat offer. v1 shipped a panel with no markup to open. */
    check('the offer row starts closed', await evaluate('document.getElementById("chatOfferRow").hidden') === true);
    await evaluate('document.querySelector("[data-offer-toggle]").click()');
    check('the offer row opens', await evaluate('document.getElementById("chatOfferRow").hidden') === false);
    await evaluate('window.__offer = null; sbSendMessage = function (k, meta, text) { window.__offer = text; return Promise.resolve(); }; document.getElementById("offerAmt").value = "900000"; document.getElementById("chatOfferGo").click(); true');
    await sleep(400);
    const offer = await evaluate('window.__offer');
    check('an offer actually sends through the chat',
      offer === '💰 Offer: J$900,000 for "Axio ' + XSS + '"', JSON.stringify(offer));

    /* 8 ── the entry point that never existed: Message on a listing.
       _ads is server-owned and the app reloads it, so re-seed the fixture.
       showAdInline() is the renderer openDetail() falls back to when a static
       /ad/<slug>.html page has not been generated yet — it is the listing view
       that every brand-new ad actually gets, and the one carrying the button. */
    await evaluate('_ads.push({ id: "ad1", title: "Toyota Axio", price: 1200000, neg: true, status: "active", ' +
      'parish: "Kingston", category: "vehicles", seller: "Seller", sellerId: "them", ' +
      'date: new Date().toISOString(), image: "", photos: [] }), showAdInline(findAd("ad1"))');
    await sleep(300);
    check('a listing mounts a Message button for a buyer',
      await evaluate('!!document.querySelector(".detail-msg-btn")') === true);
    await evaluate('document.querySelector(".detail-msg-btn").click()');
    await sleep(400);
    check('tapping it opens the chat with that seller',
      await evaluate('document.getElementById("ovChat").classList.contains("open") && currentConv === convKey(CU.id, "them", "ad1")') === true);
    await evaluate('openChat("ad1", CU.id, "Me", "T")');
    check('a seller never gets a chat with themselves',
      await evaluate('currentConv !== convKey(CU.id, CU.id, "ad1")') === true);

    /* 9 ── nothing member-authored is sitting in an inline handler. */
    const inline = await evaluate('Array.from(document.querySelectorAll("[data-conv],[data-qr],[data-chat-ad]")).map(n => n.getAttribute("onclick")).filter(Boolean).length');
    check('no data-carrying element uses an inline onclick', inline === 0, inline + ' found');

    /* 10 ── the two inboxes render the same rows. */
    await evaluate('renderInbox(); renderMyAds()');
    await sleep(200);
    const rows = await evaluate('[document.querySelectorAll("#inboxList [data-conv]").length, document.querySelectorAll("#acctInboxList [data-conv]").length]');
    check('the Messages page and the Account page show the same conversations',
      rows[0] === 1 && rows[1] === 1, JSON.stringify(rows));

    console.log('\n' + (failed === 0 ? 'MSG-V2 BROWSER TESTS: ALL PASSED' : failed + ' MSG-V2 CHECK(S) FAILED'));
    clearTimeout(watchdog);
    try { ws.close(); } catch (e) {}
    cleanup();
    process.exit(failed === 0 ? 0 : 1);
  } catch (e) {
    console.error(e);
    clearTimeout(watchdog);
    try { ws.close(); } catch (e) {}
    cleanup();
    process.exit(1);
  }
})();

