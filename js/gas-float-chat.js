/* Floating gas assistant for the Gas Prices page.
   Answers locally from the weekly Petrojam sheet + station survey via window.YaadGas (js/gas-ai.js) — no server call.
   Smart bits: station cards with Map / Directions / Waze / WhatsApp, "near me" via GPS, share-any-answer on WhatsApp,
   follow-up suggestions, remembers the fuel you asked about, "directions to the second one".
   window.GasChat = { open(), close(), ask(q) } */
(function () {
  'use strict';
  var KEY = 'ya_gaschat_v3', LOC_KEY = 'ya_gaschat_loc', PREF_KEY = 'ya_gaschat_pref', MAX_KEEP = 30;
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
  var root, panel, thread, input, fab, sendBtn, chipRow, open = false, busy = false, hist = [], pinTimer = null, lastStations = null, lastFuel = null,
      S = { last: null, lastQ: '', town: null }, townList = [], pref = loadPref();

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ h: hist.slice(-MAX_KEEP), s: lastStations, f: lastFuel, st: S })); } catch (e) {} }
  function load() { try { var o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o) { hist = o.h || []; lastStations = o.s || null; lastFuel = o.f || null; if (o.st) S = o.st; } } catch (e) { hist = []; } }
  /* long-term memory (this device): the fuel you ask about most, your tank size and your car's economy */
  function loadPref() { try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || { n: {} }; } catch (e) { return { n: {} }; } }
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) {} }
  function usualFuel() { var best = null, c = 0; Object.keys(pref.n || {}).forEach(function (k) { if (pref.n[k] > c) { c = pref.n[k]; best = k; } }); return c >= 2 ? best : null; }

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
  function reset() { hist = []; lastStations = null; lastFuel = null; S = { last: null, lastQ: '', town: null }; thread.innerHTML = ''; try { sessionStorage.removeItem(KEY); } catch (e) {} greet(); setChips(START_CHIPS); }

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
        '<div class="gfc-st-top"><b>' + (s.rank ? '<i class="gfc-st-n">' + s.rank + '</i>' : '') + esc(s.name) + '</b><span class="gfc-st-p">' + (s.est ? '≈ ' : '') + 'J$' + Number(s.price).toFixed(2) + '</span></div>' +
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
    if (m.cta) {
      var h = m.cta.href || '';
      if (/#stations/.test(h)) html += '<button type="button" class="gfc-cta" data-act="cta-near">📍 Cheapest ' + esc(curFuel()) + ' near me →</button>';
      else if (/#prices/.test(h) && typeof window.showGTab === 'function') html += '<button type="button" class="gfc-cta" data-act="cta-prices">' + esc(m.cta.label) + ' →</button>';
      else html += '<a class="gfc-cta" href="' + esc(h) + '">' + esc(m.cta.label) + ' →</a>';
    }
    if (m.more) html += '<button type="button" class="gfc-more" data-act="more">Show more stations ↓</button>';
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
      var text = (m.full || m.t).replace(/\n{3,}/g, '\n\n') + '\n' + (st ? '📍 Directions: ' + gmaps(st) + '\n' : '') + 'More: ' + (st ? stationUrl(st) : location.origin + '/gas-prices.html#prices');
      share({ title: 'Jamaica gas prices — Yaad Adz', text: text, url: location.origin + '/gas-prices.html', heading: 'Share this answer' });
    } else if (act === 'cta-near') { ask('Cheapest ' + curFuel() + ' near me');
    } else if (act === 'cta-prices') { close(); window.showGTab('prices'); b.blur();
    } else if (act === 'more') { b.remove(); ask('show more'); b.blur();
    } else if (act === 'copy' && m) {
      var txt = m.full || m.t;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { b.textContent = '✓ Copied'; }, function () { b.textContent = 'Press and hold to copy'; });
      setTimeout(function () { b.textContent = '📋 Copy'; }, 1800);
    }
  }

  function openChat() {
    if (!root) build();
    open = true; root.classList.add('gfc-open'); panel.setAttribute('aria-hidden', 'false'); fab.setAttribute('aria-expanded', 'true');
    if (window.YaadGas) { try { YaadGas.preload(); YaadGas.towns().then(function (t) { townList = t; }); } catch (e) {} }
    scroll();
  }
  function close() {
    open = false; if (!root) return; root.classList.remove('gfc-open'); panel.setAttribute('aria-hidden', 'true'); fab.setAttribute('aria-expanded', 'false');
    if (document.activeElement === input) input.blur(); pin();
  }

  /* ── smarts: slots + memory + a small planner ── */
  var FUEL_NAME = { '87': '87', '90': '90', diesel: 'diesel', ulsd: 'ULSD' };
  function fuelWord(q) {
    var s = q.toLowerCase();
    if (/\bulsd\b|ultra.?low/.test(s)) return 'ulsd';
    if (/diesel/.test(s)) return 'diesel';
    if (/\b90\b|premium|super/.test(s)) return '90';
    if (/\b87\b|regular|unleaded/.test(s)) return '87';
    return null;
  }
  function curFuel() { return FUEL_NAME[lastFuel || usualFuel() || '87'] || '87'; }
  function noteFuel(f) { lastFuel = f; pref.n = pref.n || {}; pref.n[f] = (pref.n[f] || 0) + 1; savePref(); }
  function kmTxt(k) { return k < 1 ? Math.round(k * 1000) + ' m' : k.toFixed(1) + ' km'; }
  function j0(n) { return 'J$' + Math.round(n).toLocaleString('en-US'); }

  function pickStation(q) {
    if (!lastStations || !lastStations.length || !DIR_RX.test(q)) return null;
    var s = q.toLowerCase(), n = lastStations.length, i = -1;
    if (/\b(second|2nd|#?2|two)\b/.test(s)) i = 1; else if (/\b(third|3rd|#?3|three)\b/.test(s)) i = 2; else if (/\b(fourth|4th|#?4|four)\b/.test(s)) i = 3;
    else if (/\b(first|1st|#?1|one|cheapest|top|closest|nearest|that|it|there)\b/.test(s)) i = 0;
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

  /* "is it worth driving?" — the maths on the stations from the last answer */
  function worthIt() {
    var L = lastStations;
    if (!L || !L.length || L[0].km == null) return { text: 'Ask me “cheapest ' + curFuel() + ' near me” first — then I can work out whether driving further to save money is worth it.' };
    var tank = pref.tank || 40, kmpl = pref.kmpl || 10;
    var near = S.nearest || L.slice().sort(function (a, b) { return a.km - b.km; })[0], best = L.slice().sort(function (a, b) { return a.price - b.price; })[0];
    if (best.name === near.name || best.price >= near.price) return { text: '✅ The cheapest of these (' + best.name + ') is also the closest — no detour needed.', stations: [best], keep: true };
    var save = (near.price - best.price) * tank, extra = Math.max(0, best.km - near.km), cost = extra * 2 / kmpl * best.price, net = save - cost;
    return {
      text: '🧮 ' + best.name + ' is J$' + (near.price - best.price).toFixed(2) + '/L cheaper than your closest (' + near.name + '). On a ' + tank + ' L fill-up that saves about ' + j0(save) + '.\n' +
        'The extra ' + extra.toFixed(1) + ' km each way costs roughly ' + j0(cost) + ' in fuel (at ~' + kmpl + ' km/L), so you keep about ' + j0(Math.max(0, net)) + '.\n' +
        (net > 150 ? '👍 Worth the drive.' : net > 0 ? '🤏 A small win — only worth it if it’s on your way.' : '🙅 Not worth a detour — fill up at the closest one.') + '\nTell me your tank size or km per litre and I’ll use it.',
      stations: [best], keep: true
    };
  }
  function explain() {
    var st = lastStations && lastStations[0];
    if (st && st.est) return { text: 'The ≈ means the price is estimated for today: I take the station’s official survey price and add how much the national fuel price moved since that survey week. Stations with no ≈ show the survey price exactly. Drivers’ reports on the map override both.' };
    return null;
  }

  function suggest(q, ans) {
    var cf = curFuel(), other = cf === '90' ? '87' : '90';
    if (ans.stations && ans.stations.length) {
      var c = [['🧭 Directions to #1', 'Directions to the first one']];
      if (ans.stations.length > 1 && ans.stations[0].km != null) c.push(['🧮 Worth the drive?', 'Is it worth driving further?']);
      c.push(['📍 Cheapest ' + other + ' near me', 'Cheapest ' + other + ' near me'], ['⛽ Cheapest diesel', 'Cheapest diesel near me'], ['📈 Going up or down?', 'Will gas prices go up or down?']);
      return c;
    }
    if (/\d\s*(l\b|litre|liter|gal)|\$\s*\d|buy|cost/i.test(q)) return [['📍 Cheapest ' + cf + ' near me', 'Cheapest ' + cf + ' near me'], ['⚖️ 87 vs 90', 'Compare 87 and 90'], ['📈 Going up or down?', 'Will gas prices go up or down?'], ['🧮 40 L', 'How much is 40 litres?']];
    if (/up or down|trend|going up|go up|go down|week/i.test(q)) return [['⛽ Fill-up cost', 'How much is 40 litres?'], ['📍 Cheapest ' + cf + ' near me', 'Cheapest ' + cf + ' near me'], ['🏷️ Cheapest fuel', 'Cheapest fuel right now']];
    return [['📍 Cheapest ' + cf + ' near me', 'Cheapest ' + cf + ' near me']].concat(START_CHIPS.slice(1));
  }

  var CHEAP_RX = /\b(cheap|cheaper|cheapest|lowest|best price|best prices|least)\b/i;
  var STATION_WORDS = /\b(station|stations|pump|pumps|where|near|nearby|closest|nearest|around|town|in\s+[a-z]+)\b/i;
  var NEWFUEL_RX = /^(?:and |what about |how about |same for |now |try |switch to |show |or )?(?:the )?(87|90|diesel|ulsd|regular|premium)(?: gas| fuel| price| prices)?\s*\??$/i;

  /* decide what the user means, using what we remember */
  function plan(q) {
    var s = q.toLowerCase().trim(), explicit = fuelWord(q);
    var P = { q: q, fuel: explicit, type: 'default', town: null };
    var m;
    if (/^(hi|hello|hey|yo|wah gwaan|wagwan|good (morning|afternoon|evening))\b/.test(s) && s.length < 25) { P.type = 'hello'; return P; }
    if (/^(thanks|thank you|thx|cheers|nice|great|perfect|ok(ay)?|cool|bless|respect)\b/.test(s) && s.length < 30) { P.type = 'thanks'; return P; }
    if ((m = s.match(/(\d{2,3})\s*(?:l|litre|liter)s?\s*tank|tank\s*(?:is|holds|of|size)?\s*(\d{2,3})/))) { P.type = 'tank'; P.n = +(m[1] || m[2]); return P; }
    if ((m = s.match(/(\d{1,2}(?:\.\d)?)\s*km\s*(?:\/|per|a)\s*(?:l|litre|liter)/))) { P.type = 'kmpl'; P.n = +m[1]; return P; }
    if (/\b(why|how come|explain|what does (?:the )?≈|what is (?:the )?≈|how (?:is|are|was|were) (?:that|this|it|they) (?:calculated|worked out|estimated))\b/.test(s) && !/\d\s*(l\b|litre)/.test(s) && S.last) { P.type = 'explain'; return P; }
    if (/\b(worth (?:it|the drive|driving|going)|is it worth|should i (?:drive|go|bother)|is it better to drive|detour)\b/.test(s)) { P.type = 'worth'; return P; }
    if (/^(show more|more|next|others?|any other(?:s)?|more stations|what else)\b/.test(s) && S.last && S.last.type === 'cheapest') { P.type = 'more'; return P; }
    if (pickStation(q) && !(CHEAP_RX.test(s) && explicit)) { P.type = 'dir'; return P; }
    /* "what about diesel?" → same question, other fuel */
    if ((m = s.match(NEWFUEL_RX)) && S.last) { P.type = 'switch'; P.fuel = fuelWord(m[1]); return P; }
    /* "what about Mandeville?" → same question, other town */
    var tHit = townList.filter(function (t) { return s.indexOf(t) !== -1; }).sort(function (a, b) { return b.length - a.length; })[0];
    var bare = tHit && s.replace(tHit, '').replace(/\b(what about|how about|and|in|at|around|near|the|for|try|prices?|gas|fuel|stations?|cheapest|\?)\b/g, '').replace(/[^a-z0-9]/g, '').length === 0;
    if (bare && S.last) { P.type = 'cheapest'; P.town = tHit; P.fuel = explicit || S.last.fuel || curFuel(); return P; }
    /* a bare number after a cost question → litres or J$ */
    if ((m = s.match(/^(?:what about |and |how about |try )?(\d+(?:\.\d+)?)\s*(l|litres?|liters?|gal|gallons?)?\s*\??$/)) && S.last) {
      var n = +m[1];
      P.type = 'default'; P.rewrite = m[2] ? n + ' ' + m[2] + ' of ' + curFuel() : (n >= 300 ? 'J$' + n + ' of ' + curFuel() : n + ' litres of ' + curFuel());
      return P;
    }
    /* cheapest <fuel> [near me | in <town>] → a station search */
    var near = G() && G().isNear(q);
    if (CHEAP_RX.test(s) && (explicit || near || tHit || /\b(station|stations|pump|where)\b/.test(s))) {
      P.type = 'cheapest'; P.fuel = explicit || (/\bfuel\b/.test(s) && !near && !tHit ? null : curFuel()); if (P.fuel === null) { P.type = 'default'; return P; }
      P.town = tHit || null; P.near = !!near || (!tHit);
      return P;
    }
    if (near) { P.type = 'cheapest'; P.fuel = explicit || curFuel(); P.near = true; return P; }
    if (tHit && /\b(price|prices|gas|fuel|diesel|87|90|station|stations)\b/.test(s)) { P.type = 'default'; }
    return P;
  }
  function G() { return window.YaadGas; }

  function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    if (!root) build();
    if (!open) openChat();
    if (busy) return; busy = true;
    var me = { r: 'me', t: q }; hist.push(me); paint(me); scroll();
    var Y = G();
    var finish = function (t, ans) {
      if (t) t.remove();
      var full = ans.text, shown = ans.text;
      if (ans.stations && ans.stations.length) shown = ans.text.split('\n').filter(function (l) { return !/^\d+\. /.test(l); }).join('\n').replace(/\n{3,}/g, '\n\n').replace(/(:)\n\n/, '$1\n');
      var m = { r: 'ai', t: shown, full: full, cta: ans.cta, stations: ans.stations, more: ans.more };
      if (ans.stations && ans.stations.length && !ans.keep) lastStations = ans.stations;
      if (ans.nearest !== undefined && !ans.keep) S.nearest = ans.nearest;
      hist.push(m); var el = paint(m); setChips(suggest(q, ans)); save();
      /* long answers start at their first line instead of scrolling past it */
      var top = el.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - 6; thread.scrollTop = (thread.scrollHeight - top > thread.clientHeight) ? top : thread.scrollHeight; busy = false;
    };
    if (!Y) return finish(null, { text: 'The gas assistant is still loading — try again in a moment.' });

    var P = plan(q);
    if (P.fuel) noteFuel(P.fuel);
    var wait = function (fn, ms) { var t = typing(); setTimeout(function () { finish(t, fn()); }, ms || 300); };

    switch (P.type) {
      case 'hello': return wait(function () { return { text: 'Wah gwaan! 👋 Want today’s prices, the cheapest ' + curFuel() + ' near you, or what a fill-up will cost?' }; });
      case 'thanks': return wait(function () { return { text: 'Anytime! 🙌 Drive safe — ask me anything else about gas.' }; });
      case 'tank': pref.tank = Math.max(10, Math.min(200, P.n)); savePref(); return wait(function () { return { text: '✅ Got it — I’ll use a ' + pref.tank + ' L fill-up when I work out savings.' }; });
      case 'kmpl': pref.kmpl = Math.max(3, Math.min(40, P.n)); savePref(); return wait(function () { return { text: '✅ Noted — your car does about ' + pref.kmpl + ' km per litre. I’ll use that when I work out whether a detour pays off.' }; });
      case 'worth': return wait(worthIt, 350);
      case 'explain': return wait(function () { return explain() || { text: 'Pump prices are the Petrojam ex-refinery price plus about J$25 for what stations typically charge. Ask me about a specific fuel or station and I’ll show the working.' }; });
      case 'dir': var ps = pickStation(q); return wait(function () { return { text: '🧭 ' + ps.name + (ps.town ? ' (' + ps.town + ')' : '') + ' — ' + (ps.est ? '≈ ' : '') + 'J$' + Number(ps.price).toFixed(2) + ' for ' + ps.fuel + '. Tap a button to get there or share it.', stations: [ps], keep: true }; });
    }

    var fuel = P.fuel || lastFuel || usualFuel() || '87';
    var usedUsual = !P.fuel && !lastFuel && usualFuel();

    /* station searches: cheapest <fuel> near me / in <town> / more */
    var run = function (o, label) {
      var t = typing(label);
      var done = function (ans) {
        S.last = { type: 'cheapest', fuel: o.fuel, town: o.town || null, near: !!o.coords, offset: o.offset || 0 };
        S.lastQ = q;
        if (usedUsual && !o.offset) ans.text += '\n(Using ' + (FUEL_NAME[o.fuel]) + ' — the fuel you usually ask about. Say “diesel” or “87” to switch.)';
        finish(t, ans);
      };
      Y.cheapest(o).then(done);
    };
    var litres = pref.tank, kmpl = pref.kmpl;
    if (P.type === 'more') { var L = S.last; return run({ fuel: L.fuel, town: L.town, coords: L.near ? JSON.parse(sessionStorage.getItem(LOC_KEY) || 'null') : null, offset: (L.offset || 0) + 4, litres: litres, kmpl: kmpl }); }
    if (P.type === 'switch' && S.last && S.last.type === 'cheapest') {
      var L2 = S.last, o2 = { fuel: P.fuel, town: L2.town, litres: litres, kmpl: kmpl };
      if (L2.near) return locate().then(function (c) { o2.coords = c; run(o2); }, function () { run(o2); });
      return run(o2);
    }
    if (P.type === 'switch') {  /* last question wasn't a station search: ask it again with the new fuel */
      var base = (S.lastQ || '').replace(/\b(87|90|diesel|ulsd|regular|premium)\b/ig, '').trim();
      q = (base ? base + ' ' : 'price of ') + P.fuel; P = plan(q); P.fuel = fuelWord(q); P.type = 'default';
    }
    if (P.type === 'cheapest') {
      var o = { fuel: P.fuel || fuel, town: P.town, litres: litres, kmpl: kmpl };
      if (P.town) return run(o);
      var t3 = typing('Finding your location');
      return locate().then(function (c) { t3.remove(); o.coords = c; run(o); }, function (er) {
        t3.remove();
        S.last = { type: 'cheapest', fuel: o.fuel, town: null, near: false, offset: 0 };
        Y.cheapest(o).then(function (ans) {
          ans.text = ((er && er.code === 1) ? '📵 I can’t see your location (allow it for this site in your browser settings to get distances and directions). Here’s the cheapest ' + FUEL_NAME[o.fuel] + ' across Jamaica instead:\n\n' : '📡 I couldn’t get your location just now, so here’s the cheapest ' + FUEL_NAME[o.fuel] + ' across Jamaica:\n\n') + ans.text.replace(/^[^\n]*\n/, '');
          finish(null, ans);
        });
      });
    }

    /* everything else: price, cost, budget, trend, compare… via the answer engine, with remembered fuel */
    var fq = P.rewrite || q;
    if (!fuelWord(fq) && fuel !== '87' && /\d\s*(l\b|litre|liter|gal)|\$\s*\d|cheap|price|cost|buy|compare|vs/i.test(fq) && !/\b(fuel|fuels)\b/i.test(fq)) fq += ' ' + fuel;
    S.lastQ = fq; S.last = { type: 'default', fuel: fuelWord(fq) || fuel };
    var t2 = typing();
    if (!Y.matches(fq) && OFF_TOPIC.test(fq)) return setTimeout(function () { finish(t2, { text: 'I only do gas prices here. For ads and everything else, ask Yaad Brain.', cta: { label: 'Ask Yaad Brain', href: '/?ask=' + encodeURIComponent(q) } }); }, 350);
    var started = Date.now();
    Y.answer(fq).then(function (ans) { setTimeout(function () { finish(t2, ans); }, Math.max(0, 450 - (Date.now() - started))); })
      .catch(function () { finish(t2, { text: 'Something went wrong loading prices — try again in a moment.' }); });
  }

  function init() { if (!root) build(); }
  window.GasChat = { open: function () { if (!root) build(); openChat(); }, close: close, ask: ask };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
