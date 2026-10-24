/* Floating gas assistant for the Gas Prices page.
   Answers locally from the weekly Petrojam sheet + station survey via window.YaadGas (js/gas-ai.js) — no server call.
   Smart bits: station cards with Map / Directions / Waze / WhatsApp, "near me" via GPS, share-any-answer on WhatsApp,
   follow-up suggestions, remembers the fuel you asked about, "directions to the second one".
   window.GasChat = { open(), close(), ask(q) } */
(function () {
  'use strict';
  var KEY = 'ya_gaschat_v2', LOC_KEY = 'ya_gaschat_loc', MAX_KEEP = 30;
  var START_CHIPS = [
    ['📍 Cheapest near me', 'Cheapest 87 near me'],
    ['⛽ 87 today', 'How much is 87 gas today?'],
    ['💰 J$5,000 of gas', 'What does J$5000 of 87 buy?'],
    ['📈 Going up or down?', 'Will gas prices go up or down?'],
    ['🏷️ Cheapest fuel', 'Cheapest fuel right now'],
    ['🧮 40 L of 90', 'How much is 40 litres of 90?']
  ];
  var OFF_TOPIC = /\b(for sale|selling|wanted|hiring|job|rent(al)?|iphone|phone|house|apartment|land|car for|laptop)\b/i;
  var DIR_RX = /\b(direction|directions|navigate|navigation|take me|route|get there|how (?:do i|to) get|map|where is|show me (?:it|that|the))\b/i;
  var IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  var WA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.4 15.1L2 22l5-1.6A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.3 15l-.3-.2-2.9.9.9-2.8-.2-.3a8.1 8.1 0 0 1 6.8-12.6Zm-3 3.7c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4l-.5-.3-1.8-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.4-1.8-.2-.3 0-.4.1-.5l.4-.5.3-.4c.1-.2 0-.3 0-.5l-.8-2c-.2-.5-.4-.4-.6-.4Z"/></svg>';
  var root, panel, thread, input, fab, sendBtn, chipRow, open = false, busy = false, hist = [], pinTimer = null, lastStations = null, lastFuel = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ h: hist.slice(-MAX_KEEP), s: lastStations, f: lastFuel })); } catch (e) {} }
  function load() { try { var o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o) { hist = o.h || []; lastStations = o.s || null; lastFuel = o.f || null; } } catch (e) { hist = []; } }

  /* ── links ── */
  function gmaps(s) { return 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '&travelmode=driving'; }
  function waze(s) { return 'https://waze.com/ul?ll=' + s.lat + ',' + s.lng + '&navigate=yes'; }
  function apple(s) { return 'https://maps.apple.com/?daddr=' + s.lat + ',' + s.lng + '&dirflg=d&q=' + encodeURIComponent(s.name); }
  function stationUrl(s) { return location.origin + '/gas-prices.html#s=' + encodeURIComponent(s.id); }
  function stationText(s) {
    return '⛽ ' + s.name + (s.town ? ' (' + s.town + ')' : '') + '\n' + s.fuel + ': ' + (s.est ? '≈ ' : '') + 'J$' + Number(s.price).toFixed(2) + (s.est ? '\n(≈ estimated for today)' : '') +
      '\n📍 Directions: ' + gmaps(s) + '\nMore prices: ' + stationUrl(s);
  }
  function share(d) {
    if (typeof window.openShare === 'function') return window.openShare(d);
    window.open('https://wa.me/?text=' + encodeURIComponent(d.text), '_blank', 'noopener');
  }

  function build() {
    root = document.createElement('div');
    root.className = 'gfc';
    root.innerHTML =
      '<button type="button" class="gfc-fab" aria-label="Ask about gas prices" aria-expanded="false"><span class="gfc-fab-ic" aria-hidden="true">⛽</span><span class="gfc-fab-t">Ask</span></button>' +
      '<section class="gfc-panel" role="dialog" aria-label="Gas assistant" aria-hidden="true">' +
        '<header class="gfc-hd"><div class="gfc-ttl"><span class="gfc-orb" aria-hidden="true"><i></i><i></i><i></i></span><div><b>Gas assistant</b><small>Prices, stations &amp; directions</small></div></div>' +
        '<div class="gfc-hbtns"><button type="button" class="gfc-clr" aria-label="Start a new chat" title="New chat">↺</button><button type="button" class="gfc-x" aria-label="Close chat">✕</button></div></header>' +
        '<div class="gfc-thread" role="log" aria-live="polite"></div>' +
        '<div class="gfc-chips"></div>' +
        '<form class="gfc-form" autocomplete="off"><input class="gfc-in" type="text" enterkeyhint="send" placeholder="Ask about any gas price…" aria-label="Ask a gas question"><button type="submit" class="gfc-send" aria-label="Send" disabled>↑</button></form>' +
      '</section>';
    document.body.appendChild(root);
    fab = root.querySelector('.gfc-fab'); panel = root.querySelector('.gfc-panel'); thread = root.querySelector('.gfc-thread');
    input = root.querySelector('.gfc-in'); sendBtn = root.querySelector('.gfc-send'); chipRow = root.querySelector('.gfc-chips');

    fab.addEventListener('click', function () { open ? close() : openChat(); });
    root.querySelector('.gfc-x').addEventListener('click', close);
    root.querySelector('.gfc-clr').addEventListener('click', reset);
    chipRow.addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
    thread.addEventListener('click', onThreadClick);
    input.addEventListener('input', function () { sendBtn.disabled = !input.value.trim(); });
    root.querySelector('.gfc-form').addEventListener('submit', function (e) { e.preventDefault(); var q = input.value.trim(); if (q) { input.value = ''; sendBtn.disabled = true; ask(q); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) close(); });
    input.addEventListener('focus', function () { pin(); if (!pinTimer) pinTimer = setInterval(pin, 150); [60, 250, 600].forEach(function (t) { setTimeout(pin, t); }); });
    input.addEventListener('blur', function () { if (pinTimer) { clearInterval(pinTimer); pinTimer = null; } setTimeout(pin, 80); setTimeout(pin, 350); });
    if (window.visualViewport) { visualViewport.addEventListener('resize', pin); visualViewport.addEventListener('scroll', pin); }

    /* tuck the button away while scrolling so it never sits on top of what you are reading */
    var st = null;
    window.addEventListener('scroll', function () { if (open) return; fab.classList.add('gfc-away'); clearTimeout(st); st = setTimeout(function () { fab.classList.remove('gfc-away'); }, 700); }, { passive: true });

    load();
    if (hist.length) hist.forEach(function (m) { paint(m, true); }); else greet();
    setChips(START_CHIPS);
    scroll();
  }

  function greet() { paint({ r: 'ai', g: 1, t: 'Hi! Ask me for today’s pump prices, the cheapest station near you, what a fill-up costs, or whether prices are going up or down. I can send directions and share anything on WhatsApp.' }, true); }
  function reset() { hist = []; lastStations = null; lastFuel = null; thread.innerHTML = ''; try { sessionStorage.removeItem(KEY); } catch (e) {} greet(); setChips(START_CHIPS); }

  function setChips(list) { chipRow.innerHTML = list.map(function (c) { return '<button type="button" class="gfc-chip" data-q="' + esc(c[1]) + '">' + esc(c[0]) + '</button>'; }).join(''); chipRow.scrollLeft = 0; }

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

  /* ── rendering ── */
  function stationCards(list) {
    return '<div class="gfc-sts">' + list.map(function (s, i) {
      var meta = [s.town, s.km != null ? (s.km < 1 ? Math.round(s.km * 1000) + ' m' : s.km.toFixed(1) + ' km') : '', s.fuel].filter(Boolean).join(' · ');
      return '<div class="gfc-st" data-i="' + i + '">' +
        '<div class="gfc-st-top"><b>' + esc(s.name) + '</b><span class="gfc-st-p">' + (s.est ? '≈ ' : '') + 'J$' + Number(s.price).toFixed(2) + '</span></div>' +
        '<small>' + esc(meta) + '</small>' +
        '<div class="gfc-st-acts">' +
          '<button type="button" data-act="map">📍 Map</button>' +
          '<a href="' + esc(IS_APPLE ? apple(s) : gmaps(s)) + '" target="_blank" rel="noopener">🧭 Directions</a>' +
          '<a href="' + esc(waze(s)) + '" target="_blank" rel="noopener">Waze</a>' +
          '<button type="button" class="gfc-wa" data-act="sharest" aria-label="Share on WhatsApp">' + WA + '</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function paint(m, quiet) {
    var d = document.createElement('div');
    d.className = 'gfc-msg ' + (m.r === 'me' ? 'gfc-me' : 'gfc-ai');
    var html = '<div class="gfc-b">' + esc(m.t).replace(/\n/g, '<br>') + '</div>';
    if (m.stations && m.stations.length) html += stationCards(m.stations);
    if (m.cta) html += '<a class="gfc-cta" href="' + esc(m.cta.href) + '">' + esc(m.cta.label) + ' →</a>';
    if (m.r === 'ai' && !m.g) html += '<div class="gfc-tools"><button type="button" data-act="shareans">' + WA + ' WhatsApp</button><button type="button" data-act="copy">📋 Copy</button></div>';
    d.innerHTML = html;
    d._m = m;
    if (quiet) d.style.animation = 'none';
    thread.appendChild(d); return d;
  }
  function scroll() { if (thread) thread.scrollTop = thread.scrollHeight; }
  function typing(label) { var d = document.createElement('div'); d.className = 'gfc-msg gfc-ai gfc-typing-b'; d.innerHTML = '<div class="gfc-b">' + (label ? esc(label) + ' ' : '') + '<span class="gfc-dots"><i></i><i></i><i></i></span></div>'; thread.appendChild(d); scroll(); return d; }

  function onThreadClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var msgEl = b.closest('.gfc-msg'), m = msgEl && msgEl._m, act = b.dataset.act;
    var cardEl = b.closest('.gfc-st'), s = cardEl && m && m.stations && m.stations[+cardEl.dataset.i];
    if (act === 'map' && s) {
      if (typeof window.gotoStation === 'function') { close(); window.gotoStation(s); } else location.href = stationUrl(s);
    } else if (act === 'sharest' && s) {
      share({ title: s.name + ' — gas prices', text: stationText(s), url: stationUrl(s), heading: 'Share this station' });
    } else if (act === 'shareans' && m) {
      var st = m.stations && m.stations[0];
      var text = m.t.replace(/\n{3,}/g, '\n\n') + '\n' + (st ? '📍 Directions: ' + gmaps(st) + '\n' : '') + 'More: ' + (st ? stationUrl(st) : location.origin + '/gas-prices.html#prices');
      share({ title: 'Jamaica gas prices — Yaad Adz', text: text, url: location.origin + '/gas-prices.html', heading: 'Share this answer' });
    } else if (act === 'copy' && m) {
      var txt = m.t;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = '✓ Copied'; }, function () { b.textContent = 'Press and hold to copy'; });
      setTimeout(function () { b.textContent = '📋 Copy'; }, 1800);
    }
  }

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

  /* ── smarts ── */
  function fuelWord(q) {
    var s = q.toLowerCase();
    if (/\bulsd\b|ultra.?low/.test(s)) return 'ulsd';
    if (/diesel/.test(s)) return 'diesel';
    if (/\b90\b|premium|super/.test(s)) return '90';
    if (/\b87\b|regular|unleaded/.test(s)) return '87';
    return null;
  }
  /* "what about 40 litres?" after talking about diesel → keeps talking about diesel */
  function withFuel(q) {
    var f = fuelWord(q);
    if (f) { lastFuel = f; return q; }
    if (lastFuel && lastFuel !== '87' && /\d\s*(l\b|litre|liter|gal)|\$\s*\d|cheapest|cheap|near|closest|price|cost/i.test(q) && !/\b(fuel|fuels)\b/i.test(q)) return q + ' ' + lastFuel;
    return q;
  }
  function pickStation(q) {
    if (!lastStations || !lastStations.length || !DIR_RX.test(q)) return null;
    var s = q.toLowerCase(), n = lastStations.length, i = -1;
    if (/\b(second|2nd|#?2|two)\b/.test(s)) i = 1; else if (/\b(third|3rd|#?3|three)\b/.test(s)) i = 2; else if (/\b(fourth|4th|#?4|four)\b/.test(s)) i = 3;
    else if (/\b(first|1st|#?1|one|cheapest|top|closest|nearest)\b/.test(s)) i = 0;
    if (i < 0) {
      lastStations.forEach(function (st, k) { var w = st.name.toLowerCase().split(/[^a-z0-9]+/).filter(function (x) { return x.length > 3; }); if (i < 0 && w.some(function (x) { return s.indexOf(x) !== -1; })) i = k; });
    }
    if (i < 0) i = 0;
    return lastStations[Math.min(i, n - 1)];
  }
  function locate() {
    return new Promise(function (res, rej) {
      try { var c = JSON.parse(sessionStorage.getItem(LOC_KEY) || 'null'); if (c && Date.now() - c.t < 600000) return res(c); } catch (e) {}
      if (!navigator.geolocation) return rej(new Error('nogeo'));
      navigator.geolocation.getCurrentPosition(function (p) {
        var c = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() };
        try { sessionStorage.setItem(LOC_KEY, JSON.stringify(c)); } catch (e) {}
        res(c);
      }, function (er) { rej(er); }, { timeout: 10000, maximumAge: 300000 });
    });
  }
  function suggest(q, ans) {
    var other = lastFuel === '90' ? ['87', '87'] : ['90', '90'];
    if (ans.stations && ans.stations.length) {
      var fl = ans.stations[0].fuel.toLowerCase() === 'diesel' ? 'diesel' : ans.stations[0].fuel;
      return [['🧭 Directions to #1', 'Directions to the first one'], ['📍 Cheapest ' + other[0] + ' near me', 'Cheapest ' + other[1] + ' near me'], ['⛽ Cheapest diesel near me', 'Cheapest diesel near me'], ['📈 Going up or down?', 'Will gas prices go up or down?']].filter(function (c, i) { return !(i === 1 && fl === other[0]); });
    }
    if (/\d\s*(l\b|litre|liter|gal)|\$\s*\d|buy|cost/i.test(q)) return [['📍 Cheapest near me', 'Cheapest ' + (lastFuel || '87') + ' near me'], ['⚖️ 87 vs 90', 'Compare 87 and 90'], ['📈 Going up or down?', 'Will gas prices go up or down?'], ['🧮 40 L', 'How much is 40 litres?']];
    if (/up or down|trend|going up|go up|go down|week/i.test(q)) return [['⛽ Fill-up cost', 'How much is 40 litres?'], ['📍 Cheapest near me', 'Cheapest ' + (lastFuel || '87') + ' near me'], ['🏷️ Cheapest fuel', 'Cheapest fuel right now']];
    return START_CHIPS;
  }

  function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    if (!root) build();
    if (!open) openChat();
    if (busy) return; busy = true;
    var me = { r: 'me', t: q }; hist.push(me); paint(me); scroll();
    var G = window.YaadGas;
    var finish = function (t, ans) {
      if (t) t.remove();
      var m = { r: 'ai', t: ans.text, cta: ans.cta, stations: ans.stations };
      if (ans.stations && ans.stations.length) lastStations = ans.stations;
      hist.push(m); var el = paint(m); setChips(suggest(q, ans)); save();
      /* long answers start at their first line instead of scrolling past it */
      var top = el.offsetTop - 6; thread.scrollTop = (thread.scrollHeight - top > thread.clientHeight) ? top : thread.scrollHeight; busy = false;
    };
    if (!G) return finish(null, { text: 'The gas assistant is still loading — try again in a moment.' });

    /* "directions to the second one" */
    var ps = pickStation(q);
    if (ps) { var t0 = typing(); return setTimeout(function () { finish(t0, { text: '🧭 ' + ps.name + (ps.town ? ' (' + ps.town + ')' : '') + ' — ' + (ps.est ? '≈ ' : '') + 'J$' + Number(ps.price).toFixed(2) + ' for ' + ps.fuel + '. Tap a button to get there or share it.', stations: [ps] }); }, 300); }

    var fq = withFuel(q);
    /* nearest / cheapest near me → uses your location */
    if (G.isNear && G.isNear(fq)) {
      var t1 = typing('Finding your location');
      return locate().then(function (c) { return G.answerNear(fq, c); }).then(function (ans) { finish(t1, ans); }, function (er) {
        finish(t1, { text: (er && er.code === 1)
          ? 'I can’t see your location — allow location access for this site in your browser settings, then ask again. Or name a town, like “cheapest 87 in Portmore”.'
          : 'I couldn’t get your location just now. Try again, or name a town, like “cheapest 87 in Portmore”.' });
      });
    }
    var t2 = typing();
    if (!G.matches(fq) && OFF_TOPIC.test(fq)) return setTimeout(function () { finish(t2, { text: 'I only do gas prices here. For ads and everything else, ask Yaad Brain.', cta: { label: 'Ask Yaad Brain', href: '/?ask=' + encodeURIComponent(q) } }); }, 350);
    var started = Date.now();
    G.answer(fq).then(function (ans) { setTimeout(function () { finish(t2, ans); }, Math.max(0, 450 - (Date.now() - started))); })
      .catch(function () { finish(t2, { text: 'Something went wrong loading prices — try again in a moment.' }); });
  }

  function init() { if (!root) build(); }
  window.GasChat = { open: function () { if (!root) build(); openChat(); }, close: close, ask: ask };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
