/* ── AI CHAT WIRING TESTS (run: node tools/test-chat-wiring.js) ──────────
   Static + logic guards for the v2 chat. Every check here covers a bug that
   actually shipped in the working tree:
     · the chat module once carried a stray brace (whole file failed to parse)
     · the refiners were moved outside the AiChat closure (ReferenceError)
     · ~40 classes the renderer emits had no CSS at all
     · the chat core wasn't precached, so PWAs kept the old bundle
     · five assertions sat after process.exit() and never ran
   No DOM, no network.                                                        */
const fs = require('fs');
const path = require('path');

let failures = 0, passes = 0;
function check(name, ok, extra) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (ok ? '' : ' — ' + (extra === undefined ? '' : extra)));
  ok ? passes++ : failures++;
}
const read = p => fs.readFileSync(p, 'utf8');

/* 1 — every app module parses (a single stray brace kills the whole file) */
const jsFiles = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const bad = [];
jsFiles.forEach(f => {
  try { new Function(read(path.join('js', f))); }
  catch (e) { bad.push(f + ': ' + e.message); }
});
check('all ' + jsFiles.length + ' modules in js/ parse', bad.length === 0, bad.join(' | '));

/* 2 — load order: the pure core must exist before the renderer reads it */
const html = read('index.html');
const iCore = html.indexOf('src="js/ai-chat-v2.js"');
const iChat = html.indexOf('src="js/search-ai.js"');
check('index.html loads js/ai-chat-v2.js before js/search-ai.js', iCore > -1 && iChat > -1 && iCore < iChat, iCore + ' vs ' + iChat);

/* 3 — every ai-* CLASS the chat uses has a rule in style.css */
function classNames(src) {
  const out = [];
  const patterns = [
    /class\s*=\s*"([^"]*)"/g,
    /class\s*=\s*'([^']*)'/g,
    /className\s*=\s*'([^']*)'/g,
    /className\s*=\s*`([^`]*)`/g,
    /classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'/g,
  ];
  patterns.forEach(re => {
    let m;
    while ((m = re.exec(src)) !== null) out.push(...String(m[1]).split(/\s+/));
  });
  return out.filter(Boolean);
}
const css = read('style.css');
const styled = new Set((css.match(/\.(ai-[a-z0-9-]+)/g) || []).map(s => s.slice(1)));
const used = new Set();
[html, ...jsFiles.map(f => read(path.join('js', f)))].forEach(src => {
  classNames(src).forEach(c => { if (/^ai-/.test(c)) used.add(c); });
});
const unstyled = [...used].filter(c => !styled.has(c)).sort();
check('every ai-* class the chat uses is styled (' + used.size + ' classes)', unstyled.length === 0,
  'unstyled: ' + unstyled.join(', '));

/* 4 — the refiners must stay INSIDE the AiChat closure (they read its state) */
const chat = read('js/search-ai.js');
const start = chat.indexOf('const AiChat=(function(){');
const end = chat.indexOf('})();', start);
const inside = start > -1 && end > start ? chat.slice(start, end) : '';
check('AiChat closure found in search-ai.js', inside.length > 0);
check('buildSharedRefiners is defined inside the AiChat closure', /function buildSharedRefiners\(/.test(inside));
check('no file-level buildSharedRefiners copy', !/^function buildSharedRefiners/m.test(chat));
check('no leftover buildLocal2 helper', !/function buildLocal2\(/.test(chat));
check('stray-brace guard: brace counts balance', (() => {
  const o = (chat.match(/{/g) || []).length, c = (chat.match(/}/g) || []).length;
  return o === c;
})());

/* 5 — every refiner/advice intent the renderer switches on classifies cleanly */
const A = require('../js/ai-chat-v2.js');
const LIST = [
  { id: 'a', title: 'A', price: 100000, parish: 'Kingston', category: 'x', date: '2026-09-16', status: 'active', neg: true, image: 'i.jpg' },
  { id: 'b', title: 'B', price: 200000, parish: 'Kingston', category: 'x', date: '2026-09-10', status: 'active', neg: false },
  { id: 'c', title: 'C', price: 300000, parish: 'Portmore', category: 'x', date: '2026-09-01', status: 'active', neg: false, image: 'i.jpg' }
];
const state = { results: LIST, pool: LIST, stats: A.analyzePool(LIST) };
[['anything cheaper than the first one', 'cheaper_than'],
 ['why is that the best?', 'explain_pick'],
 ['who do i contact for the first one', 'contact'],
 ['only ones with photos', 'photos_only'],
 ['only negotiable', 'negotiable_only'],
 ['same area', 'same_parish'],
 ['show me the cheap ones', 'cheapest_half'],
 ['only the newest', 'newest_half'],
 ['cheapest first', 'sort_price_asc'],
 ['price high to low', 'sort_price_desc'],
 ['newest first', 'sort_newest'],
 ['most popular first', 'sort_views']].forEach(pair => {
  let got;
  try { got = A.classify(pair[0], state).intent; } catch (e) { got = 'threw: ' + e.message; }
  check('classify “' + pair[0] + '” → ' + pair[1], got === pair[1], got);
});
check('refinePool answers every refiner intent',
  ['photos_only', 'negotiable_only', 'same_parish', 'cheapest_half', 'newest_half']
    .every(i => Array.isArray(A.refinePool(LIST, i))));
/* the renderer must handle every intent the core can emit */
['photos_only', 'negotiable_only', 'same_parish', 'cheapest_half', 'newest_half',
 'cheaper_than', 'explain_pick', 'contact', 'sort_price_asc', 'sort_price_desc',
 'sort_newest', 'sort_views', 'best_pick', 'compare_2', 'price_advice', 'detail',
 'open_pick', 'greeting', 'help', 'new_chat'].forEach(intent => {
  check('renderer handles intent ' + intent, chat.indexOf("'" + intent + "'") > -1);
});

/* 6 — shipping the fix must reach installed PWAs */
const sw = read('sw.js');
check('sw.js precaches js/ai-chat-v2.js', sw.indexOf("'/js/ai-chat-v2.js'") > -1);
const ver = (sw.match(/yaadadz-v(\d+)/) || [])[1];
check('sw.js cache version is v42 or newer', ver !== undefined && Number(ver) >= 42, 'found ' + (ver ? 'v' + ver : 'none'));

/* 8 — no code may point at the removed hero search bar (id="aiInput") */
const deadRefs = [];
jsFiles.forEach(f => {
  const src = read(path.join('js', f));
  if (/getElementById\(\s*['"]aiInput['"]\s*\)/.test(src)) deadRefs.push(f);
});
check('no dead aiInput references (removed hero bar)', deadRefs.length === 0, deadRefs.join(', '));
check('core.js exposes searchInput() for the live search field', /function searchInput\(\)/.test(read('js/core.js')));

/* 9 — the chat test file must not hide assertions after process.exit()
   (the LAST exit is the one that ends the run; earlier mentions in comments
   or the summary line don't count) */
const t = read('tools/test-chat-v2.js');
const exitAt = t.lastIndexOf('process.exit(');
check('tools/test-chat-v2.js has no checks after process.exit',
  exitAt > -1 && !/(^|\n)\s*(eq|check)\(/.test(t.slice(exitAt)));

/* 10 — §CHAT-UNIFORM: the two surfaces must stay one chat.
   Every check here covers a drift that actually shipped:
     · float header said "local" while sheet said "100% local"
     · float header inlined its gold <em> style instead of sharing the class
     · float send fired on empty input while sheetSubmit never could
     · float error bubble used dead sheet-msg-* classes (unstyled)
     · one surface woke without syncing its send-button state
     · each surface greeted an empty thread with different copy        */
check('uniform: both headers carry the same status node', (function() {
  var h = read('index.html');
  return h.indexOf('id="aiSheetStatusTxt"') > -1 && h.indexOf('id="aiFloatStatusTxt"') > -1;
})());
check('uniform: float header shares the sheet <em> style (no inline style)', (function() {
  var h = read('index.html');
  var i = h.indexOf('ai-float-header-name');
  if (i === -1) return false;
  return h.slice(i, h.indexOf('</header>', i)).indexOf('style=') === -1;
})());
check('uniform: setStatus paints both headers', /aiFloatStatusTxt/.test(chat));
check('uniform: float send starts disabled + syncs on input', (function() {
  var h = read('index.html');
  var i = h.indexOf('id="floatSendBtn"');
  if (i === -1) return false;
  var tag = h.slice(i - 200, h.indexOf('>', i) + 1);
  return tag.indexOf('disabled') > -1 && h.indexOf("aiChatSyncSend('float')") > -1;
})());
check('uniform: AiChat exposes syncSendBtn + submit paths use it', (function() {
  return /function syncSendBtn\(/.test(chat) && /syncSendBtn:syncSendBtn/.test(chat) &&
    chat.indexOf("syncSendBtn(surface") > -1 && read('js/widgets-pwa.js').indexOf('syncSendBtn') > -1;
})());
check('uniform: floatSubmit guards empty input like sheetSubmit', (function() {
  var w = read('js/widgets-pwa.js');
  var i = w.indexOf('function floatSubmit');
  if (i === -1) return false;
  return w.slice(i, i + 600).indexOf('if (!query) return;') > -1;
})());
check('uniform: float error bubble uses styled ai-* classes', (function() {
  var w = read('js/widgets-pwa.js');
  var i = w.indexOf('function floatSubmit');
  if (i === -1) return false;
  var body = w.slice(i, i + 1400);
  return body.indexOf('ai-msg ai-msg-ai') > -1 && body.indexOf('sheet-msg-ai') === -1;
})());
check('uniform: one greeting for an empty thread (no float-only copy)', (function() {
  var body = chat.split('§CHAT-UNIFORM — one greeting everywhere')[0];
  return body.indexOf("I'm your Yaad Adz assistant") === -1;
})());
check('uniform: float composer has the same Patois hint line as the sheet', (function() {
  var h = read('index.html');
  var i = h.indexOf('ai-float-input-wrap');
  if (i === -1) return false;
  return h.slice(i, i + 1200).indexOf('understands Patois') > -1;
})());

console.log('\n' + (failures === 0
  ? 'CHAT WIRING TESTS: ALL ' + passes + ' PASSED'
  : failures + ' FAILED / ' + passes + ' passed — do NOT deploy'));
process.exit(failures === 0 ? 0 : 1);
