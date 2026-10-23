/* Floating gas assistant for the Gas Prices page.
   Answers locally from the weekly Petrojam sheet + station survey via window.YaadGas (js/gas-ai.js) — no server call.
   window.GasChat = { open(), close(), ask(q) } */
(function () {
  'use strict';
  var KEY = 'ya_gaschat_v1', MAX_KEEP = 30;
  var CHIPS = [
    ['⛽ 87 today', 'How much is 87 gas today?'],
    ['💰 J$5,000 of gas', 'What does J$5000 of 87 buy?'],
    ['📈 Going up or down?', 'Will gas prices go up or down?'],
    ['🏷️ Cheapest fuel', 'Cheapest fuel right now'],
    ['🧮 40 L of 90', 'How much is 40 litres of 90?']
  ];
  var OFF_TOPIC = /\b(for sale|selling|wanted|hiring|job|rent(al)?|iphone|phone|house|apartment|land|car for|laptop)\b/i;
  var root, panel, thread, input, fab, sendBtn, chipRow, open = false, busy = false, hist = [], pinTimer = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-MAX_KEEP))); } catch (e) {} }
  function load() { try { hist = JSON.parse(sessionStorage.getItem(KEY) || '[]') || []; } catch (e) { hist = []; } }

  function build() {
    root = document.createElement('div');
    root.className = 'gfc';
    root.innerHTML =
      '<button type="button" class="gfc-fab" aria-label="Ask about gas prices" aria-expanded="false"><span class="gfc-fab-ic" aria-hidden="true">⛽</span><span class="gfc-fab-t">Ask</span></button>' +
      '<section class="gfc-panel" role="dialog" aria-label="Gas assistant" aria-hidden="true">' +
        '<header class="gfc-hd"><div class="gfc-ttl"><span class="gfc-orb" aria-hidden="true"><i></i><i></i><i></i></span><div><b>Gas assistant</b><small>Prices, trends &amp; fill-up costs</small></div></div>' +
        '<button type="button" class="gfc-x" aria-label="Close chat">✕</button></header>' +
        '<div class="gfc-thread" role="log" aria-live="polite"></div>' +
        '<div class="gfc-chips"></div>' +
        '<form class="gfc-form" autocomplete="off"><input class="gfc-in" type="text" enterkeyhint="send" placeholder="Ask about any gas price…" aria-label="Ask a gas question"><button type="submit" class="gfc-send" aria-label="Send" disabled>↑</button></form>' +
      '</section>';
    document.body.appendChild(root);
    fab = root.querySelector('.gfc-fab'); panel = root.querySelector('.gfc-panel'); thread = root.querySelector('.gfc-thread');
    input = root.querySelector('.gfc-in'); sendBtn = root.querySelector('.gfc-send'); chipRow = root.querySelector('.gfc-chips');
    chipRow.innerHTML = CHIPS.map(function (c) { return '<button type="button" class="gfc-chip" data-q="' + esc(c[1]) + '">' + esc(c[0]) + '</button>'; }).join('');

    fab.addEventListener('click', function () { open ? close() : openChat(); });
    root.querySelector('.gfc-x').addEventListener('click', close);
    chipRow.addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
    input.addEventListener('input', function () { sendBtn.disabled = !input.value.trim(); });
    root.querySelector('.gfc-form').addEventListener('submit', function (e) { e.preventDefault(); var q = input.value.trim(); if (q) { input.value = ''; sendBtn.disabled = true; ask(q); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
    input.addEventListener('focus', function () { pin(); if (!pinTimer) pinTimer = setInterval(pin, 150); [60, 250, 600].forEach(function (t) { setTimeout(pin, t); }); });
    input.addEventListener('blur', function () { if (pinTimer) { clearInterval(pinTimer); pinTimer = null; } setTimeout(pin, 80); setTimeout(pin, 350); });
    if (window.visualViewport) { visualViewport.addEventListener('resize', pin); visualViewport.addEventListener('scroll', pin); }

    load();
    if (hist.length) hist.forEach(function (m) { paint(m, true); });
    else paint({ r: 'ai', t: 'Hi! Ask me about today’s pump prices, what a fill-up costs, or whether prices are going up or down.' }, true);
    scroll();
  }

  /* keep the panel snug above the iOS keyboard while typing */
  function pin() {
    if (!panel) return;
    var vv = window.visualViewport, typing = open && document.activeElement === input;
    if (vv && typing && window.innerWidth < 700) {
      panel.style.top = Math.round(vv.offsetTop + 8) + 'px'; panel.style.bottom = 'auto'; panel.style.height = Math.max(260, Math.round(vv.height - 16)) + 'px'; panel.style.maxHeight = 'none';
      panel.classList.add('gfc-typing');
    } else {
      panel.style.removeProperty('top'); panel.style.removeProperty('bottom'); panel.style.removeProperty('height'); panel.style.removeProperty('max-height');
      panel.classList.remove('gfc-typing');
    }
    scroll();
  }

  function paint(m, quiet) {
    var d = document.createElement('div');
    d.className = 'gfc-msg ' + (m.r === 'me' ? 'gfc-me' : 'gfc-ai');
    d.innerHTML = '<div class="gfc-b">' + esc(m.t).replace(/\n/g, '<br>') + '</div>' +
      (m.cta ? '<a class="gfc-cta" href="' + esc(m.cta.href) + '">' + esc(m.cta.label) + ' →</a>' : '');
    if (quiet) d.style.animation = 'none';
    thread.appendChild(d); return d;
  }
  function scroll() { if (thread) thread.scrollTop = thread.scrollHeight; }
  function typing() { var d = document.createElement('div'); d.className = 'gfc-msg gfc-ai gfc-typing-b'; d.innerHTML = '<div class="gfc-b"><span class="gfc-dots"><i></i><i></i><i></i></span></div>'; thread.appendChild(d); scroll(); return d; }

  function openChat() {
    if (!root) build();
    open = true; root.classList.add('gfc-open'); panel.setAttribute('aria-hidden', 'false'); fab.setAttribute('aria-expanded', 'true');
    if (window.YaadGas && YaadGas.preload) { try { YaadGas.preload(); } catch (e) {} }
    scroll();
  }
  function close() {
    open = false; if (!root) return; root.classList.remove('gfc-open'); panel.setAttribute('aria-hidden', 'true'); fab.setAttribute('aria-expanded', 'false');
    if (document.activeElement === input) input.blur(); pin();
  }

  function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    if (!root) build();
    if (!open) openChat();
    if (busy) return; busy = true;
    var me = { r: 'me', t: q }; hist.push(me); paint(me); scroll();
    var t = typing();
    var done = function (ans) { t.remove(); var m = { r: 'ai', t: ans.text, cta: ans.cta }; hist.push(m); paint(m); save(); scroll(); busy = false; };
    var G = window.YaadGas;
    if (!G) return done({ text: 'The gas assistant is still loading — try again in a moment.' });
    if (!G.matches(q) && OFF_TOPIC.test(q)) return setTimeout(function () { done({ text: 'I only do gas prices here. For ads and everything else, ask Yaad Brain.', cta: { label: 'Ask Yaad Brain', href: '/?ask=' + encodeURIComponent(q) } }); }, 350);
    var started = Date.now();
    G.answer(q).then(function (ans) { setTimeout(function () { done(ans); }, Math.max(0, 450 - (Date.now() - started))); })
      .catch(function () { done({ text: 'Something went wrong loading prices — try again in a moment.' }); });
  }

  function init() { if (!root) build(); }
  window.GasChat = { open: function () { if (!root) build(); openChat(); }, close: close, ask: ask };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
