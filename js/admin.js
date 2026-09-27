/*******************************************************************************
   YAAD ADZ — ADMIN DASHBOARD (admin.html)

   ── READ THIS BEFORE TRUSTING THE PASSWORD GATE ──────────────────────────────
   The gate below is a CONVENIENCE LOCK, not authentication. Do not mistake it
   for security:

     • The password is stored as a SHA-256 hash, so the plaintext is not
       sitting in the shipped file. That stops a casual reader of the source.
     • It does NOT stop anyone determined. Every number on this dashboard is
       fetched with the PUBLIC Supabase anon key, which already ships to every
       visitor inside js/core.js. Someone can open devtools, read that key, and
       query the same rows directly — no password and no gate involved.
     • SHA-256 is fast by design, so an 11-character dictionary word falls to
       brute force in seconds. The hash keeps the password out of plain sight;
       it does not make it strong.

   For a dashboard that genuinely cannot be read by outsiders, pick one:
     1. Keep the file out of the public build. Cheapest, and honest about what
        it is.
     2. Host-level basic auth (Netlify _headers, Cloudflare Access, server
        .htpasswd). The right answer for a one-person admin.
     3. Supabase RLS policies + a real authenticated user, so the anon key
        cannot read the tables at all. The only option that is real auth.

   The gate exists to stop accidental visitors and shoulder-surfers. Treat it
   as a door curtain, not a lock.

   ── BEHAVIOUR ───────────────────────────────────────────────────────────────
   • Unlock lives in sessionStorage, so it dies with the tab and re-locks when
     the browser closes. Deliberate: "remember me" on a shared device is how
     admin panels get left open.
   • Every failure path is explicit. If the Supabase CDN is unreachable this
     says so in plain English instead of throwing, matching the no-CDN
     resilience the rest of the site already guarantees (§P1-NO-CDN).
   • Rows are built with DOM APIs and textContent, never innerHTML. Ad titles
     are user-supplied, so an HTML sink here would be a stored XSS. There is
     deliberately no innerHTML in this file.
*******************************************************************************/

(function () {
  'use strict';

  /* SHA-256 of the admin password. To change it: hash the new value and paste
     the hex here. The plaintext never belongs in this file. */
  var PW_HASH = '0a21423e4ad9b772d8bf6cafd1187a2eb9d334cb9dabd431c3e3edc91a5c1894';
  var SESSION_KEY = 'ya_admin_unlocked';

  var $ = function (id) { return document.getElementById(id); };
  var gate = $('gate'), dash = $('dash'), pw = $('pw'),
      err = $('err'), go = $('go');

  function fail(msg) { err.textContent = msg; }
  function clearErr() { err.textContent = ''; }

  /* constant-time-ish compare: avoids leaking a prefix match via timing */
  function sameHash(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0, i;
    for (i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
        });
    }
    return Promise.reject(new Error('no crypto'));
  }

  /* MUST stay byte-identical to slugify() in js/search-ai.js and
     generate-pages.js. This page is standalone and cannot import the app, so
     the logic is duplicated rather than shared - which means it can drift.
     tools/test-admin.js asserts both copies agree on fixtures, so run that if
     you ever touch this function. Getting it wrong yields dead 404 links. */
  function adSlug(ad) {
    var raw = (ad.title || '') + (ad.parish ? '-' + ad.parish : '');
    return raw
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .slice(0, 80) + '-' + String(ad.id || '').slice(0, 8);
  }
  function unlock() {
    clearErr();
    if (!pw.value) { fail('Enter the password.'); return; }
    pw.disabled = true; go.disabled = true; fail('Checking…');
    sha256Hex(pw.value).then(function (hex) {
      if (sameHash(hex, PW_HASH)) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* private mode */ }
        pw.value = '';
        showDash();
        loadAll();
      } else {
        fail('Wrong password.');
        pw.select();
      }
    }).catch(function () {
      fail('Could not verify — this browser blocks the crypto API.');
    }).then(function () {
      pw.disabled = false; go.disabled = false;
    });
  }

  function showDash() { gate.hidden = true; dash.hidden = false; }
  function lock() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    dash.hidden = true; gate.hidden = false; pw.value = ''; clearErr(); pw.focus();
  }
  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  /* ── data ───────────────────────────────────────────────────────────────── */

  var db = null;
  function connect() {
    if (db) return true;
    var root = $('adRoot');
    if (!window.supabase || !root) {
      fail('Could not load the Supabase library (CDN unreachable).');
      return false;
    }
    try {
      db = window.supabase.createClient(root.dataset.supabaseUrl, root.dataset.supabaseKey);
    } catch (e) {
      fail('Supabase client failed to start: ' + (e && e.message ? e.message : e));
      return false;
    }
    return true;
  }

  function count(table) {
    return db.from(table).select('*', { count: 'exact', head: true })
      .then(function (r) { return r.error ? null : r.count; });
  }
  function setStat(id, val) {
    $(id).textContent = (val === null || val === undefined) ? '—' : val;
  }

  function fill(id, rows, emptyText) {
    var box = $(id);
    box.textContent = '';
    if (!rows || !rows.length) {
      var p = document.createElement('p');
      p.className = 'adm-note';
      p.textContent = emptyText;
      box.appendChild(p);
      return;
    }
    rows.forEach(function (r) {
      var a = document.createElement('a');
      a.className = 'adm-row';
      a.href = '/ad/' + adSlug(r) + '.html';
      var t = document.createElement('span');
      t.textContent = r.title || '(untitled)';
      var s = document.createElement('small');
      s.textContent = [r.parish, r.price ? 'J$' + r.price : null, r.status]
        .filter(Boolean).join(' · ');
      a.appendChild(t); a.appendChild(s);
      box.appendChild(a);
    });
  }

  function loadAll() {
    if (!connect()) return;
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var iso = start.toISOString();

    /* Reports are deliberately NOT queried here. ad_feedback_reports has RLS
       revoked from anon (`revoke all ... from anon, authenticated` in
       supabase-migration-ad-feedback.sql), so with the public key the query can
       only ever come back empty or error. Showing a count that can never be
       right would be worse than showing nothing, so the tile says where
       reports actually live instead. */
    Promise.all([
      count('ads'),
      count('profiles'),
      db.from('ads').select('*', { count: 'exact', head: true }).neq('status', 'sold'),
      db.from('ads').select('*', { count: 'exact', head: true }).gte('created_at', iso),
      db.from('ads')
        .select('id,title,parish,price,status,created_at')
        .order('created_at', { ascending: false }).limit(12)
    ]).then(function (r) {
      setStat('s-ads', r[0]);
      setStat('s-members', r[1]);
      setStat('s-active', (r[2] && !r[2].error) ? r[2].count : null);
      setStat('s-today', (r[3] && !r[3].error) ? r[3].count : null);
      if (r[4] && r[4].error) {
        fill('recent', null, 'Could not load listings (' + r[4].error.message + ').');
      } else {
        fill('recent', r[4] && r[4].data, 'No listings yet.');
      }
    }).catch(function (e) {
      fail('Could not load data: ' + (e && e.message ? e.message : e));
    });
  }

  /* ── wire up ────────────────────────────────────────────────────────────── */
  go.addEventListener('click', unlock);
  pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
  pw.addEventListener('input', clearErr);
  $('refresh').addEventListener('click', loadAll);
  $('lock').addEventListener('click', lock);

  if (isUnlocked()) { showDash(); loadAll(); } else { pw.focus(); }
})();

