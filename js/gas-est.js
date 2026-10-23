/* Hybrid station prices: official survey price + the national (Petrojam) move since the survey week.
   est = survey price + (ex-refinery price now − ex-refinery price in the survey's week)
   Station pump prices follow the wholesale price, so this keeps old survey numbers close to today. */
(function () {
  'use strict';
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  /* history.weeks labels look like "24 Sept" / "1 Oct" (no year). Anchor the last label to price_date. */
  function weekDates(data) {
    var weeks = data && data.history && data.history.weeks;
    if (!weeks || !weeks.length) return null;
    var anchor = new Date(data.price_date || data.last_updated || Date.now());
    if (isNaN(anchor)) anchor = new Date();
    var out = new Array(weeks.length), y = anchor.getUTCFullYear(), prev = null;
    for (var i = weeks.length - 1; i >= 0; i--) {
      var m = String(weeks[i]).match(/(\d{1,2})\s+([A-Za-z]{3})/);
      if (!m) return null;
      var d = Date.UTC(y, MON[m[2].toLowerCase()], Number(m[1]));
      if (prev !== null && d > prev) { y--; d = Date.UTC(y, MON[m[2].toLowerCase()], Number(m[1])); }
      out[i] = d; prev = d;
    }
    return out;
  }

  /* Δ J$/L for a fuel between the survey week and now. null when it can't be worked out. */
  function delta(data, key, surveyIso) {
    try {
      var series = data.history && data.history[key], dates = weekDates(data);
      if (!series || !dates || series.length !== dates.length) return null;
      var t = new Date(surveyIso).getTime();
      if (isNaN(t)) return null;
      var idx = -1;
      for (var i = 0; i < dates.length; i++) if (dates[i] <= t) idx = i;   // price in force during the survey week
      if (idx < 0) return null;
      var d = series[series.length - 1] - series[idx];
      return isFinite(d) ? d : null;
    } catch (e) { return null; }
  }

  /* survey price → estimate for today (rounded to 10c). Falls back to the survey price. */
  function estimate(data, key, surveyPrice, surveyIso) {
    var d = delta(data, key, surveyIso);
    if (surveyPrice == null) return null;
    if (d == null || Math.abs(d) > 40) return { price: surveyPrice, delta: 0, est: false };
    return { price: Math.round((surveyPrice + d) * 10) / 10, delta: d, est: Math.abs(d) >= 0.05 };
  }

  window.YaadGasEst = { delta: delta, estimate: estimate };
})();
