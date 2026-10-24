/* Live visit counter — "● N live now" (Supabase Realtime presence) + "M visits today" (per page, Jamaica day).
   Used by the home page and the Gas Prices page.  window.YaadLive.start('home' | 'gas')
   Daily count: RPC site_visit_count (see sql/site-visits.sql); one increment per device per page per day.
   If that function is not installed yet, the home page falls back to the older increment_site_visit() counter. */
(function () {
  'use strict';
  var URL = 'https://cquwshpsfybvgqodbxsf.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXdzaHBzZnlidmdxb2RieHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ1NzQsImV4cCI6MjA4ODIxMDU3NH0.Ang5B1EF6aOou1m-b7j28V_B0Thur69xXdY8hgiPydw';
  var started = false, sb = null, today = '';

  function jamaicaDay() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function setAll(sel, txt) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) { if (els[i].textContent !== txt) { els[i].textContent = txt; els[i].classList.remove('lv-bump'); void els[i].offsetWidth; els[i].classList.add('lv-bump'); } }
  }
  function show(sel) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].hidden = false; }
  function paintToday(n) { n = Number(n); if (!(n >= 0)) return; setAll('[data-live-today]', fmt(n)); var v = document.getElementById('vStat'); if (v) v.textContent = fmt(n); show('[data-live-strip]'); }
  function paintNow(n) { if (n < 1) n = 1; setAll('[data-live-now]', fmt(n)); show('[data-live-strip]'); }

  function getClient(cb) {
    try { if (typeof _db !== 'undefined' && _db) return cb(_db); } catch (e) {}
    function make() { try { cb(window.supabase.createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })); } catch (e) {} }
    if (window.supabase && window.supabase.createClient) return make();
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; s.async = true; s.onload = make;
    document.head.appendChild(s);
  }

  function readToday(page, count) {
    return sb.rpc('site_visit_count', { p_page: page, p_count: !!count }).then(function (r) {
      if (r.error) throw r.error;
      try { localStorage.setItem('ya_visit_count_' + page, String(r.data)); } catch (e) {}
      paintToday(r.data); return true;
    });
  }

  function start(page) {
    if (started) return; started = true;
    page = page || 'home'; today = jamaicaDay();
    var cacheKey = 'ya_visit_count_' + page, dedupKey = 'ya_vd2_' + page + '_' + today; /* new key: the older counter's key made devices that already visited today skip the new table */
    try { var c = localStorage.getItem(cacheKey); if (c) paintToday(c); } catch (e) {}
    getClient(function (client) {
      sb = client;
      var counted = false; try { counted = !!localStorage.getItem(dedupKey); } catch (e) {}
      /* count this device once per day, then keep the number fresh */
      var first = counted ? readToday(page, false) : readToday(page, true).then(function () { try { localStorage.setItem(dedupKey, '1'); } catch (e) {} });
      first.catch(function () { if (page === 'home' && typeof sbTrackVisitLegacy === 'function') sbTrackVisitLegacy('home'); /* new function not installed yet */ });
      setInterval(function () { if (!document.hidden) readToday(page, false).catch(function () {}); }, 45000);

      /* who is here right now */
      try {
        var id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        var ch = sb.channel('yaad-live', { config: { presence: { key: id } } });
        ch.on('presence', { event: 'sync' }, function () { paintNow(Object.keys(ch.presenceState()).length); })
          .subscribe(function (st) { if (st === 'SUBSCRIBED' && !document.hidden) ch.track({ page: page, t: Date.now() }); });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) ch.untrack(); else ch.track({ page: page, t: Date.now() });
        });
      } catch (e) {}
    });
  }
  window.YaadLive = { start: start };
})();
