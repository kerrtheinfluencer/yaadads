/* Yaad Brain · gas answers
   Answers fuel questions from /gas-prices-data.json (Petrojam weekly sheet).
   Pump price = ex-refinery + J$25 estimate (same as the Gas Prices page).
   Exposes window.YaadGas = { matches(q), answer(q) → Promise<{text, cta}> } */
(function () {
  'use strict';
  var MARKUP = 25, GAL = 3.78541, cache = null, loading = null;

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    loading = fetch('/gas-prices-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { cache = d; return d; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  var stCache = undefined;
  function loadStations() {
    if (stCache !== undefined) return Promise.resolve(stCache);
    return fetch('/gas-station-prices.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) { stCache = d && d.stations && d.stations.length ? d : null; return stCache; });
  }
  function fmtDay(iso) { var d = new Date(iso); return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  var FKEY = { '87': '87', '90': '90', diesel: 'diesel', ulsd: 'ulsd' };

  /* structured station rows for the chat cards (map / directions / share buttons) */
  function pack(list, label, offset) {
    return list.map(function (x, i) {
      var o = { id: x.id, name: x.name, town: x.town || '', lat: x.lat, lng: x.lon != null ? x.lon : x.lng, price: x._p, est: !!x._e, fuel: label, rank: (offset || 0) + i + 1 };
      if (x._d != null) o.km = x._d;
      return o;
    });
  }
  function hav(a, b, c, d2) {
    var R = 6371, r = Math.PI / 180, dLa = (c - a) * r, dLo = (d2 - b) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  var NEAR_RX = /\b(near me|nearby|near here|closest|nearest|around me|close to me|around here)\b/i;
  function isNear(q) { return NEAR_RX.test(String(q || '')); }

  var LAB = { '87': '87', '90': '90', diesel: 'Diesel', ulsd: 'ULSD' };
  function kmTxt(k) { return k < 1 ? Math.round(k * 1000) + ' m' : k.toFixed(1) + ' km'; }

  /* The cheapest stations for ONE fuel — around a point (coords), in a town, or nationwide.
     o = { fuel:'87'|'90'|'diesel'|'ulsd', coords?:{lat,lng}, town?, offset?, litres?, kmpl? }
     With coords it also does the maths on whether driving further to the cheapest one pays off. */
  function cheapest(o) {
    o = o || {};
    return Promise.all([load(), loadStations()]).then(function (r) {
      var d = r[0], st = r[1];
      if (!st) return { text: 'I can’t see the station prices right now — open the Stations map to browse them.', cta: CTA_ST };
      var key = FKEY[o.fuel] ? o.fuel : '87', label = LAB[key], E = window.YaadGasEst, tank = o.litres || 40, kmpl = o.kmpl || 10;
      var town = o.town ? String(o.town).toLowerCase() : null, rows = [], anyEst = false;
      st.stations.forEach(function (x) {
        if (x.lat == null || x.lon == null || x.prices[key] == null) return;
        if (town && (x.town || '').toLowerCase() !== town) return;
        var e = E ? E.estimate(d, key, x.prices[key], x.as_of || st.survey_week_ending) : null;
        x._p = e ? e.price : x.prices[key]; x._e = !!(e && e.est);
        x._d = o.coords ? hav(o.coords.lat, o.coords.lng, x.lat, x.lon) : null;
        rows.push(x);
      });
      var where = town ? ' in ' + town.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
      if (!rows.length) return { text: 'No station' + where + ' lists a ' + label + ' price in the latest survey.', cta: CTA_ST };
      var pool = rows, scope = town ? 'town' : 'national', nearest = null;
      if (o.coords) {
        var byD = rows.slice().sort(function (a, b) { return a._d - b._d; });
        nearest = byD[0];
        var within = rows.filter(function (x) { return x._d <= 12; });
        if (within.length >= 2) { pool = within; scope = 'near'; } else { pool = byD.slice(0, 8); scope = 'closest'; }
      }
      var sorted = pool.slice().sort(function (a, b) { return a._p - b._p || (a._d || 0) - (b._d || 0); });
      var off = o.offset || 0, page = sorted.slice(off, off + 4);
      if (!page.length) return { text: 'That’s every ' + label + ' station I have prices for' + (town ? where : o.coords ? ' around you' : '') + '.', meta: { fuel: key, scope: scope, offset: off, total: sorted.length }, more: false };
      page.forEach(function (x) { if (x._e) anyEst = true; });
      var head = scope === 'near' ? '📍 Cheapest ' + label + ' near you (within 12 km):' : scope === 'closest' ? '📍 Cheapest ' + label + ' — the closest stations I have prices for:' : scope === 'town' ? '📍 Cheapest ' + label + where + ':' : '📍 Cheapest ' + label + ' in Jamaica right now:';
      if (off) head = '📍 More ' + label + ' stations' + (scope === 'town' ? where : '') + ':';
      var lines = page.map(function (x, i) { return (off + i + 1) + '. ' + x.name + ' — ' + (x._e ? '≈ ' : '') + j2(x._p) + (x._d != null ? ' · ' + kmTxt(x._d) : x.town ? ' · ' + x.town : ''); });
      var think = '';
      if (o.coords && off === 0) {
        var best = sorted[0];
        if (best === nearest) think = '💡 The cheapest one is also the closest to you.';
        else if (nearest._p > best._p) {
          var save = (nearest._p - best._p) * tank, extra = Math.max(0, best._d - nearest._d), cost = extra * 2 / kmpl * best._p, net = save - cost;
          think = '💡 Vs your closest station (' + nearest.name + ', ' + kmTxt(nearest._d) + '): ' + best.name + ' is ' + j2(nearest._p - best._p) + '/L cheaper — about ' + j(save) + ' saved on a ' + tank + ' L fill-up' +
            (extra > 0.3 ? ', roughly ' + j(Math.max(0, net)) + ' after the extra ' + extra.toFixed(1) + ' km each way in fuel (at ~' + kmpl + ' km/L)' : '') + '. ' + (net > 150 ? 'Worth the drive.' : 'Probably not worth a detour.');
        }
      }
      return {
        text: head + '\n' + lines.join('\n') + (think ? '\n\n' + think : '') + '\n\n' + (anyEst ? 'Estimated for today: survey price plus this week’s fuel price change. ' : '') + 'Check the pump — stations can differ.',
        stations: pack(page, label, off), near: !!o.coords, more: off + 4 < sorted.length,
        nearest: nearest ? { name: nearest.name, town: nearest.town || '', price: nearest._p, km: nearest._d, est: nearest._e } : null,
        meta: { fuel: key, scope: scope, town: town, offset: off, total: sorted.length }
      };
    }).catch(function () { return { text: 'I couldn’t load station prices just now — try again in a moment.', cta: CTA_ST }; });
  }
  function answerNear(q, coords) {
    return load().then(function (d) { var f = fuelOf(q, d.prices); return cheapest({ fuel: FKEY[f.p.key] ? f.p.key : '87', coords: coords }); });
  }
  /* town names the survey knows, lower-case (for "what about Mandeville?") */
  function towns() {
    return loadStations().then(function (st) { var t = {}; (st ? st.stations : []).forEach(function (x) { if (x.town && x.town.length >= 4) t[x.town.toLowerCase()] = 1; }); return Object.keys(t); });
  }
  /* explicit fuel / amount in a sentence */
  function parse(q, prices) {
    var f = fuelOf(q, prices || (cache && cache.prices) || []);
    return { fuel: f && f.explicit ? f.p.key : null, amount: amountOf(q) };
  }

  /* "cheapest 87 in Mandeville", "diesel prices in Portmore", "price at Texaco Bushy Park" */
  function stationAnswer(q, d, st) {
    if (!st) return null;
    var s = q.toLowerCase();
    var f = fuelOf(q, d.prices), key = FKEY[f.p.key] ? f.p.key : '87';
    var words = s.replace(/[^a-z0-9\s'`-]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2; });
    var towns = {};
    st.stations.forEach(function (x) { if (x.town) towns[x.town.toLowerCase()] = 1; });
    var townHit = Object.keys(towns).filter(function (t) { return t.length >= 4 && s.indexOf(t) !== -1; }).sort(function (a, b) { return b.length - a.length; })[0];
    var stop = /^(the|gas|fuel|price|prices|cheapest|cheap|lowest|diesel|ulsd|petrol|station|stations|what|how|much|does|cost|per|litre|liter|for|near|and|best|where|can|find|got|any|show|tell|today|now|right|90|87)$/;
    var hits = [];
    if (townHit) {
      hits = st.stations.filter(function (x) { return (x.town || '').toLowerCase() === townHit; });
    } else {
      var terms = words.filter(function (w) { return !stop.test(w); });
      if (terms.length) hits = st.stations.filter(function (x) { var n = (x.name + ' ' + (x.town || '')).toLowerCase(); return terms.every(function (t) { return n.indexOf(t) !== -1; }); });
      if (hits.length > 8 || (!hits.length)) hits = [];
    }
    if (!hits.length) return null;
    var E = window.YaadGasEst, anyEst = false;
    hits.forEach(function (x) { var e = x.prices[key] != null && E ? E.estimate(d, key, x.prices[key], x.as_of || st.survey_week_ending) : null; x._p = e ? e.price : x.prices[key]; x._e = !!(e && e.est); if (x._e) anyEst = true; });
    var priced = hits.filter(function (x) { return x._p != null; }).sort(function (a, b) { return a._p - b._p; });
    var label = { '87': '87', '90': '90', diesel: 'Diesel', ulsd: 'ULSD' }[key];
    var week = fmtDay(st.survey_week_ending);
    if (!priced.length) return { text: 'I found ' + hits.length + ' station' + (hits.length === 1 ? '' : 's') + ' there but none list a ' + label + ' price in the latest survey.', cta: CTA_ST };
    var lines = priced.slice(0, 5).map(function (x, i) { return (i + 1) + '. ' + x.name + (x.town ? ' (' + x.town + ')' : '') + ' — ' + (x._e ? '≈ ' : '') + j2(x._p); });
    var head = townHit ? '📍 ' + label + ' prices in ' + townHit.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' (cheapest first):' : '📍 ' + label + ' at the station' + (priced.length > 1 ? 's' : '') + ' I found:';
    return { text: head + '\n' + lines.join('\n') + (priced.length > 5 ? '\n…and ' + (priced.length - 5) + ' more on the map.' : '') + '\n\n' + (anyEst ? 'Estimated for today: the official survey (week ending ' + week + ') plus this week’s fuel price change' : 'Official survey, week ending ' + week) + '. Check the pump — stations can differ.' + (f.explicit ? '' : '\nI assumed 87 — say “90” or “diesel” for others.'), cta: CTA_ST, stations: pack(priced.slice(0, 5), label) };
  }

  var GAS_WORDS = /\b(gas|gasoline|gasolene|petrol|fuel|diesel|ulsd|kerosene|kero|propane|butane|lpg|petrojam|fill\s?-?up|fillup|pump price|octane|(?:87|90)\s*(?:gas|octane|fuel)|cooking gas)\b|\d\s*(?:litres?|liters?|ltrs?|gallons?)\b|\b(?:87|90)\s*(?:vs\.?|or|versus|and)\s*(?:87|90)\b/i;
  var NOT_GAS = /\b(stove|cooker|oven|generator|heater|cylinder|regulator|for sale|selling|sale|rent|job|hiring|wanted|tanker|truck|station for|service station for|wholesale)\b/i;

  function matches(q) {
    q = String(q || '');
    if (!GAS_WORDS.test(q)) return false;
    if (NOT_GAS.test(q) && !/\b(price|cost|how much|cheap|today|this week|per litre|per liter)\b/i.test(q)) return false;
    return true;
  }

  function fuelOf(q, prices) {
    var s = q.toLowerCase(), key = null;
    if (/\bulsd\b|ultra.?low/.test(s)) key = 'ulsd';
    else if (/diesel/.test(s)) key = 'diesel';
    else if (/kero/.test(s)) key = 'kerosene';
    else if (/propane/.test(s)) key = 'propane';
    else if (/butane|lpg|cooking gas/.test(s)) key = 'butane';
    else if (/\b90\b|premium|super/.test(s)) key = '90';
    else if (/\b87\b|regular|unleaded/.test(s)) key = '87';
    var p = key && prices.filter(function (x) { return x.key === key; })[0];
    return p ? { p: p, explicit: true } : { p: prices.filter(function (x) { return x.key === '87'; })[0] || prices[0], explicit: false };
  }

  function num(s) { return parseFloat(String(s).replace(/,/g, '')); }

  /* {kind:'litres', v} | {kind:'money', v} | null */
  function amountOf(q) {
    var s = q.toLowerCase().replace(/\b(87|90)\s*(?:gas|octane|fuel)\b/g, ' ');
    var m = s.match(/(\d[\d,]*\.?\d*)\s*(?:l\b|lt\b|ltr|litre|liter)/);
    if (m) return { kind: 'litres', v: num(m[1]) };
    m = s.match(/(\d[\d,]*\.?\d*)\s*(?:gal|gallon)/);
    if (m) return { kind: 'litres', v: num(m[1]) * GAL, gal: num(m[1]) };
    m = s.match(/(?:j\$|\$)\s*(\d[\d,]*\.?\d*)\s*(k)?/) || s.match(/(\d[\d,]*\.?\d*)\s*(k)?\s*(?:dollars?|bucks|jmd)/);
    if (m) return { kind: 'money', v: num(m[1]) * (m[2] ? 1000 : 1) };
    m = s.match(/\b(?:put|gimme|give me|buy|get|worth)\s+(?:in\s+)?(\d[\d,]*\.?\d*)\s*(k)?\b/);
    if (m) { var v = num(m[1]) * (m[2] ? 1000 : 1); return v >= 300 ? { kind: 'money', v: v } : { kind: 'litres', v: v }; }
    return null;
  }

  function j(n) { return 'J$' + Math.round(n).toLocaleString('en-US'); }
  function j2(n) { return 'J$' + n.toFixed(2); }
  function pump(p) { return p.exRefinery + MARKUP; }
  function prevOf(d, p) {
    var pw = d.comparisons && d.comparisons.prev_week && d.comparisons.prev_week[p.key];
    if (pw != null) return pw;
    var h = d.history && d.history[p.key];
    return h && h.length > 1 ? h[h.length - 2] : null;
  }
  function wk4Of(d, p) {
    var w = d.comparisons && d.comparisons.week_4_ago && d.comparisons.week_4_ago[p.key];
    if (w != null) return w;
    var h = d.history && d.history[p.key];
    return h && h.length > 4 ? h[h.length - 5] : null;
  }
  function delta(d, p) {
    var pv = prevOf(d, p);
    if (pv == null) return null;
    return p.exRefinery - pv;
  }
  function dTxt(x) { return x === null ? 'no change data yet' : Math.abs(x) < 0.005 ? 'unchanged vs last week' : (x > 0 ? '▲ up ' : '▼ down ') + j2(Math.abs(x)) + ' vs last week'; }
  var CTA = { label: 'Open Gas Prices', href: '/gas-prices.html#prices' };
  var CTA_ST = { label: 'Find stations', href: '/gas-prices.html#stations' };

  function build(q, d) {
    var s = q.toLowerCase(), prices = d.prices, f = fuelOf(q, prices), p = f.p, amt = amountOf(q);
    var asOf = d.price_date || d.last_updated_display || 'this week';
    var note = '\n\nEstimate = Petrojam ex-refinery + J$' + MARKUP + ' pump markup. Stations can differ a little.';

    /* 1 · how much for X litres / what does $X buy */
    if (amt && amt.v > 0) {
      var pp = pump(p);
      if (amt.kind === 'litres') {
        var lab = amt.gal ? amt.gal + ' gallon' + (amt.gal === 1 ? '' : 's') + ' (' + amt.v.toFixed(1) + ' L)' : amt.v + ' L';
        return { text: '⛽ ' + lab + ' of ' + p.name + ' ≈ ' + j(pp * amt.v) + '\nPump price about ' + j2(pp) + '/L (as of ' + asOf + ').' + (f.explicit ? '' : '\nI assumed 87 — say “90” or “diesel” for others.') + note, cta: CTA };
      }
      var l = amt.v / pp;
      return { text: '💰 ' + j(amt.v) + ' buys about ' + l.toFixed(1) + ' L of ' + p.name + ' (' + (l / GAL).toFixed(1) + ' gal)\nPump price about ' + j2(pp) + '/L (as of ' + asOf + ').' + (f.explicit ? '' : '\nI assumed 87 — say “90” or “diesel” for others.') + note, cta: CTA };
    }

    /* 2 · stations */
    if (/station|near me|nearby|where|closest|cheapest.*(pump|place)|find/.test(s) && !/difference|compare/.test(s)) {
      return { text: '📍 The Stations tab shows every station on a map. Tap “Cheapest” to rank the ones near you by reported price, or tap a station to report what you paid.', cta: CTA_ST };
    }

    /* 3 · trend / will it go up */
    if (/trend|going up|go up|going down|come down|increase|decrease|rise|drop|change|last week|this week|will it|forecast|predict|week/.test(s)) {
      var lines = ['📈 Price moves vs last week (' + asOf + '):'];
      prices.slice(0, 5).forEach(function (x) { var dd = delta(d, x); lines.push('• ' + x.name + ': ' + j(pump(x)) + ' — ' + dTxt(dd)); });
      var w4 = wk4Of(d, p);
      if (w4 != null) lines.push('\n' + p.name + ' vs 4 weeks ago: ' + (p.exRefinery - w4 >= 0 ? '▲ ' : '▼ ') + j2(Math.abs(p.exRefinery - w4)) + '/L.');
      lines.push('Petrojam updates weekly — I can’t predict the next move, but this shows the direction.');
      return { text: lines.join('\n'), cta: CTA };
    }

    /* 4 · compare / difference / which is cheaper */
    var two = (s.match(/\b(87|90|diesel|ulsd|kerosene|propane|butane)\b/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
    if ((/difference|compare|vs\.?|versus|cheaper|better|which|worth/.test(s)) && two.length >= 2) {
      var A = prices.filter(function (x) { return x.key === two[0]; })[0], B = prices.filter(function (x) { return x.key === two[1]; })[0];
      if (A && B) {
        var diff = Math.abs(pump(A) - pump(B));
        return { text: '⚖️ ' + A.name + ' ' + j2(pump(A)) + '/L vs ' + B.name + ' ' + j2(pump(B)) + '/L\n' + (pump(A) < pump(B) ? A.name : B.name) + ' is cheaper by ' + j2(diff) + '/L — about ' + j(diff * 40) + ' on a 40 L fill-up.' + note, cta: CTA };
      }
    }
    if (/cheapest|cheap|lowest|least|save/.test(s)) {
      var motor = prices.filter(function (x) { return x.key === '87' || x.key === '90' || x.key === 'diesel' || x.key === 'ulsd'; }).sort(function (a, b) { return pump(a) - pump(b); });
      return { text: '💸 Cheapest road fuel right now: ' + motor[0].name + ' at about ' + j2(pump(motor[0])) + '/L.\nRanked: ' + motor.map(function (x) { return x.name + ' ' + j(pump(x)); }).join(' · ') + '.\nWant the cheapest station near you? Use the Stations tab.' + note, cta: CTA_ST };
    }

    /* 5 · how is it calculated */
    if (/how.*(calculat|work|estimate|come|get)|markup|ex.?refinery|why|explain|accurate|source|petrojam/.test(s)) {
      return { text: 'ℹ️ Petrojam publishes the ex-refinery price every week. I add about J$' + MARKUP + '/L for what stations typically charge, so the pump price is an estimate. Drivers can also report real pump prices on the Stations tab.', cta: CTA };
    }

    /* 6 · fill-up cost with no amount given */
    if (/fill|tank|full|how much (?:to|for|is|does)/.test(s) && !/price of|per litre|per liter/.test(s)) {
      var pp2 = pump(p);
      return { text: '⛽ A fill-up of ' + p.name + ' at about ' + j2(pp2) + '/L:\n• 20 L ≈ ' + j(pp2 * 20) + '\n• 40 L ≈ ' + j(pp2 * 40) + '\n• 50 L ≈ ' + j(pp2 * 50) + '\nTell me any amount — “35 litres” or “J$7000” — and I’ll work it out.' + note, cta: CTA };
    }

    /* 7 · default: price of the fuel asked (or the headline fuels) */
    if (f.explicit) {
      return { text: '⛽ ' + p.name + ': about ' + j2(pump(p)) + '/L at the pump (ex-refinery ' + j2(p.exRefinery) + ') — ' + dTxt(delta(d, p)) + '.\nAs of ' + asOf + '. Ask “40 litres” or “J$5000” for a quick cost.' + note, cta: CTA };
    }
    var top = prices.filter(function (x) { return x.key === '87' || x.key === '90' || x.key === 'diesel'; });
    return { text: '⛽ Pump prices today (est., ' + asOf + '):\n' + top.map(function (x) { return '• ' + x.name + ': ' + j2(pump(x)) + '/L — ' + dTxt(delta(d, x)); }).join('\n') + '\nTry “40 litres of 90”, “what does J$5000 buy”, “cheapest fuel” or “gas stations near me”.' + note, cta: CTA };
  }

  function answer(q) {
    q = String(q || '');
    return load().then(function (d) {
      if (/\b(in|at|around|near)\b|station|cheapest|cheap/i.test(q) && !/near me|nearby|closest/i.test(q)) {
        return loadStations().then(function (st) { return stationAnswer(q, d, st) || build(q, d); });
      }
      return build(q, d);
    }).catch(function () {
      return { text: 'I couldn’t load the latest gas prices just now — open the Gas Prices page for the live sheet.', cta: CTA };
    });
  }

  window.YaadGas = { matches: matches, answer: answer, answerNear: answerNear, cheapest: cheapest, towns: towns, parse: parse, isNear: isNear, preload: function () { loadStations(); return load(); } };
})();
