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

   ── MODERATION ──────────────────────────────────────────────────────────────
   Hide    → status = 'hidden'. This file is the only writer of that value;
             js/core.js (isPublicRow), js/ui-nav.js (realtime handler) and
             generate-pages.js all exclude it, so a hidden post leaves the
             homepage, search, the category counts, the AI chat, similar
             listings, the member's My Ads list, its /ad/… page and the sitemap
             — while the row itself survives for Restore. That is the point of
             hiding instead of deleting: a mistaken judgement stays reversible.
   Restore → status = 'active'.
   Delete  → the row is gone for good. Confirm-gated, because it cannot be
             undone.
   Hide all→ every live listing from the same member, for a spam run.
   Writes ride the public anon key, so they only work while the legacy
   "anon can update/delete ads" policies still exist (supabase-migration.sql).
   Every action therefore checks what the API actually did and reports
   "no rows changed" instead of claiming a success that never happened.

   ── BEHAVIOUR ───────────────────────────────────────────────────────────────
   • Unlock lives in sessionStorage, so it dies with the tab and re-locks when
     the browser closes. Deliberate: "remember me" on a shared device is how
     admin panels get left open.
   • Every failure path is explicit, and results are reported on the dashboard
     status line (#dash-note) — the gate's error line is hidden once unlocked,
     so it must never be the only place a failure lands.
   • Rows are built with DOM APIs and textContent, never innerHTML. Ad titles
     and descriptions are user-supplied, so an HTML sink here would be a stored
     XSS. There is deliberately no innerHTML in this file.
   • `rows` is the list's source of truth, so a hide/restore holds even on a
     project whose RLS hides status='hidden' rows from this public key.
*******************************************************************************/

(function () {
  'use strict';

  /* SHA-256 of the admin password. To change it: hash the new value and paste
     the hex here. The plaintext never belongs in this file. */
  var PW_HASH = '0a21423e4ad9b772d8bf6cafd1187a2eb9d334cb9dabd431c3e3edc91a5c1894';
  var SESSION_KEY = 'ya_admin_unlocked';

  /* The status values this dashboard reasons about. 'sold' is set by the seller
     in the app; 'hidden' is set here and has no member-facing UI anywhere. */
  var ST_ACTIVE = 'active';
  var ST_SOLD = 'sold';
  var ST_HIDDEN = 'hidden';
  var ST_LABEL = { active: 'Live', sold: 'Sold', hidden: 'Hidden' };

  /* Columns the list needs. description is included even though some run to
     several screens: the clamped snippet is what lets a disingenuous post be
     judged without opening it (see §ADMIN-FIT in admin.html). */
  var COLS = 'id,title,category,parish,price,description,status,seller_name,seller_id,views,created_at';
  var FETCH_LIMIT = 300;   // rows pulled per refresh
  var PAGE_ROWS = 25;      // rows drawn before "Show N more"

  var $ = function (id) { return document.getElementById(id); };
  var gate = $('gate'), dash = $('dash'), pw = $('pw'),
      err = $('err'), go = $('go');

  function fail(msg) { err.textContent = msg; }
  function clearErr() { err.textContent = ''; }
  function msgOf(e) { return (e && e.message) ? e.message : String(e); }

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

  /* Local mirror of the listings being managed. Every hide/restore/delete is
     applied here as well as in the database, so the list stays correct even
     where the anon key cannot read status='hidden' rows back. */
  var rows = [];
  var shown = PAGE_ROWS;
  var query = '';
  var busy = false;

  /* ── tiny DOM kit ──────────────────────────────────────────────────────────
     Everything below builds nodes and sets textContent. No innerHTML, ever:
     titles and descriptions come straight from members. */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function btn(label, cls, fn, title) {
    var b = el('button', 'adm-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (title) b.title = title;
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function linkBtn(label, href, title) {
    var a = el('a', 'adm-btn', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    if (title) a.title = title;
    return a;
  }
  function setStat(id, val) {
    var n = $(id);
    if (n) n.textContent = (val === null || val === undefined) ? '–' : val;
  }
  /* Dashboard status line. The gate's #err is hidden once the dashboard is up,
     so anything the admin must see (a failed write included) lands here. */
  function note(text, kind) {
    var n = $('dash-note');
    if (!n) return;
    n.textContent = text || '';
    n.className = 'adm-note' + (kind ? ' is-' + kind : '');
  }
  function setBusy(on) {
    busy = on;
    document.body.classList.toggle('is-busy', on);
  }

  /* ── formatting ────────────────────────────────────────────────────────── */
  function statusOf(r) { return (r && r.status) || ST_ACTIVE; }
  function money(v) {
    var n = Number(v);
    return (v !== null && v !== undefined && v !== '' && isFinite(n) && n > 0)
      ? 'J$' + n.toLocaleString('en-JM') : '';
  }
  function day(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function sellerCount(r) {
    if (!r || !r.seller_id) return 0;
    return rows.filter(function (x) {
      return x.seller_id === r.seller_id && statusOf(x) !== ST_HIDDEN;
    }).length;
  }

  /* ── one listing row ───────────────────────────────────────────────────────
     Returned as a detached node (also handed to tools/test-admin.js through
     window.__admRenderTest) so the worst-case row — a 400-character title and
     a wall of description — can be measured at 360px in a real browser. */
  function listingRow(r) {
    var st = statusOf(r);
    var row = el('div', 'adm-row');
    if (r.id) row.setAttribute('data-id', r.id);

    var main = el('div', 'adm-row-main');
    main.appendChild(el('span', 'adm-row-title', r.title || '(untitled)'));

    var meta = el('div', 'adm-row-meta');
    meta.appendChild(el('span', 'adm-chip is-' + st, ST_LABEL[st] || st));
    if (r.category) meta.appendChild(el('span', 'adm-tag', r.category));
    if (r.parish) meta.appendChild(el('span', 'adm-tag', '📍 ' + r.parish));
    var price = money(r.price);
    if (price) meta.appendChild(el('span', 'adm-tag', price));
    if (r.seller_name) meta.appendChild(el('span', 'adm-tag', '👤 ' + r.seller_name));
    var when = day(r.created_at);
    if (when) meta.appendChild(el('span', 'adm-tag', '🕐 ' + when));
    if (typeof r.views === 'number') meta.appendChild(el('span', 'adm-tag', '👁 ' + r.views));
    if (r.id) meta.appendChild(el('span', 'adm-tag adm-id', r.id));
    main.appendChild(meta);

    if (r.description) {
      var snip = el('span', 'adm-row-snip', r.description);
      snip.title = r.description;
      main.appendChild(snip);
    }
    row.appendChild(main);

    var acts = el('div', 'adm-acts');
    acts.appendChild(linkBtn('View', '/ad/' + adSlug(r) + '.html',
      'Opens the public listing page (a hidden post may no longer have one)'));
    if (st === ST_HIDDEN) {
      acts.appendChild(btn('Restore', 'is-good', function () { restoreRow(r); },
        'Put this listing back on the site'));
    } else {
      acts.appendChild(btn('Hide', '', function () { hideRow(r); },
        'Take this listing off the site without deleting it'));
    }
    acts.appendChild(btn('Delete', 'is-danger', function () { deleteRow(r); },
      'Delete the row from Supabase — cannot be undone'));
    var others = sellerCount(r);
    if (st !== ST_HIDDEN && others > 1) {
      acts.appendChild(btn('Hide all ' + others, 'is-quiet', function () { hideSeller(r); },
        'Hide every live listing from ' + (r.seller_name || 'this member')));
    }
    row.appendChild(acts);
    return row;
  }

  /* ── list rendering ────────────────────────────────────────────────────── */
  function filterRows() {
    var status = $('fltStatus') ? $('fltStatus').value : 'all';
    return rows.filter(function (r) {
      if (status !== 'all' && statusOf(r) !== status) return false;
      if (!query) return true;
      return [r.title, r.description, r.seller_name, r.parish, r.category, r.id]
        .some(function (v) { return v && String(v).toLowerCase().indexOf(query) !== -1; });
    });
  }

  function renderList() {
    var box = $('rows');
    if (!box) return;
    box.textContent = '';
    var list = filterRows();
    var drawn = list.slice(0, shown);
    var count = $('rowcount');
    if (count) {
      count.textContent = list.length + (list.length === 1 ? ' listing' : ' listings') +
        (drawn.length < list.length ? ' · showing ' + drawn.length : '');
    }
    if (!list.length) {
      box.appendChild(el('p', 'adm-note',
        rows.length ? 'Nothing matches that search or status filter.' : 'No listings loaded yet.'));
      return;
    }
    drawn.forEach(function (r) { box.appendChild(listingRow(r)); });
    if (drawn.length < list.length) {
      var more = el('div', 'adm-more');
      more.appendChild(btn('Show ' + Math.min(PAGE_ROWS, list.length - drawn.length) + ' more', '',
        function () { shown += PAGE_ROWS; renderList(); }));
      box.appendChild(more);
    }
  }

  /* ── loading ───────────────────────────────────────────────────────────── */
  function head() { return { count: 'exact', head: true }; }

  function loadStats() {
    var start = new Date(); start.setHours(0, 0, 0, 0);
    return Promise.all([
      db.from('ads').select('*', head()),
      db.from('ads').select('*', head()).eq('status', ST_HIDDEN),
      db.from('ads').select('*', head()).eq('status', ST_SOLD),
      db.from('ads').select('*', head()).gte('created_at', start.toISOString()),
      db.from('profiles').select('*', head())
    ]).then(function (r) {
      function counted(res) {
        return (res && !res.error && typeof res.count === 'number') ? res.count : null;
      }
      var total = counted(r[0]), hidden = counted(r[1]), sold = counted(r[2]);
      setStat('s-ads', total);
      setStat('s-members', counted(r[4]));
      setStat('s-hidden', hidden);
      setStat('s-today', counted(r[3]));
      /* Live = what the site actually shows = everything minus hidden minus
         sold. Left as arithmetic so this tile can never disagree with the
         Listings tile, and legacy null-status rows still count as live. */
      setStat('s-active', (total === null || hidden === null || sold === null)
        ? null : Math.max(0, total - hidden - sold));
      return { ok: true };
    }).catch(function (e) {
      return { ok: false, message: msgOf(e) };
    });
  }

  /* Full re-read: rows + counters. Refresh uses this; a single action only
     re-counts, so a locally hidden row can still be restored in place. */
  function loadAll() {
    if (!connect()) {
      note('Supabase library unavailable (CDN blocked?) — listings can neither be read nor changed in this browser.', 'err');
      var c = $('rowcount');
      if (c) c.textContent = '';
      renderList();
      return;
    }
    note('Loading…');
    db.from('ads').select(COLS)
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
      .then(function (r) {
        if (r.error) throw r.error;
        rows = r.data || [];
        shown = PAGE_ROWS;
        renderList();
        return loadStats();
      })
      .then(function (s) {
        if (!s.ok) { note('Listings loaded, but the counters failed: ' + s.message, 'err'); return; }
        if (!rows.length) note('No listings came back — the table may be empty, or RLS is blocking reads with this key.', 'err');
        else note('');
      })
      .catch(function (e) {
        note('Could not load listings: ' + msgOf(e), 'err');
      });
  }

  /* ── writes ────────────────────────────────────────────────────────────────
     One helper for every mutation. It asks PostgREST to return the affected
     rows and then reports honestly: an RLS denial surfaces as an error, and a
     policy that silently matches nothing surfaces as "no rows changed" instead
     of a success message for a write that never happened. */
  function write(op, id, payload) {
    var t = db.from('ads');
    var q = (op === 'delete') ? t.delete() : t.update(payload);
    return q.eq('id', id).select('id').then(function (r) {
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) {
        throw new Error('no rows changed — this key is not allowed to write that row (RLS)');
      }
      return true;
    });
  }

  /* Re-count after a change, then report the outcome in one place. */
  function afterChange(success, prefix) {
    return loadStats().then(function (s) {
      if (s.ok) note(success, 'ok');
      else note(success + ' — the counters did not refresh: ' + s.message, 'err');
      renderList();
    }).catch(function (e) {
      note(prefix + msgOf(e), 'err');
    });
  }

  /* ── moderation actions ────────────────────────────────────────────────── */

  function hideRow(r) {
    if (busy) return;
    if (!window.confirm('Hide "' + (r.title || '(untitled)') + '" from the site?\n\n' +
      'It leaves the homepage, search, categories, the AI chat and the member\'s My Ads list. ' +
      'Nothing is deleted — Restore brings it straight back.')) return;
    setBusy(true); note('Hiding…');
    write('update', r.id, { status: ST_HIDDEN }).then(function () {
      r.status = ST_HIDDEN;
      return afterChange('Hidden: ' + (r.title || '(untitled)'), 'Could not hide: ');
    }).catch(function (e) {
      note('Could not hide: ' + msgOf(e), 'err');
    }).then(function () { setBusy(false); });
  }

  function restoreRow(r) {
    if (busy) return;
    if (!window.confirm('Put "' + (r.title || '(untitled)') + '" back on the site?')) return;
    setBusy(true); note('Restoring…');
    write('update', r.id, { status: ST_ACTIVE }).then(function () {
      r.status = ST_ACTIVE;
      return afterChange('Restored: ' + (r.title || '(untitled)') +
        ' — its public page returns on the next page-generation run.', 'Could not restore: ');
    }).catch(function (e) {
      note('Could not restore: ' + msgOf(e), 'err');
    }).then(function () { setBusy(false); });
  }

  function deleteRow(r) {
    if (busy) return;
    if (!window.confirm('DELETE "' + (r.title || '(untitled)') + '" for good?\n\n' +
      'This removes the row from Supabase and cannot be undone. Use Hide if you only want it off the site.')) return;
    setBusy(true); note('Deleting…');
    write('delete', r.id).then(function () {
      rows = rows.filter(function (x) { return x.id !== r.id; });
      return afterChange('Deleted: ' + (r.title || '(untitled)'), 'Could not delete: ');
    }).catch(function (e) {
      note('Could not delete: ' + msgOf(e), 'err');
    }).then(function () { setBusy(false); });
  }

  /* A spam run in one tap: hide every live listing from the same member. The
     writes run sequentially so a slow connection cannot trip a rate limit, and
     the outcome counts what actually succeeded. */
  function hideSeller(r) {
    if (busy) return;
    var mine = rows.filter(function (x) {
      return x.seller_id && x.seller_id === r.seller_id && statusOf(x) !== ST_HIDDEN;
    });
    if (mine.length < 2) {
      note('That member has only this listing — use Hide on the row instead.', 'err');
      return;
    }
    if (!window.confirm('Hide all ' + mine.length + ' listings by ' +
      (r.seller_name || 'this member') + '?\n\nEvery one leaves the site immediately. ' +
      'Restore any of them from the Hidden filter if needed.')) return;

    setBusy(true); note('Hiding ' + mine.length + ' listings…');
    var done = 0, failed = 0, lastErr = null;
    var chain = Promise.resolve();
    mine.forEach(function (x) {
      chain = chain.then(function () {
        return write('update', x.id, { status: ST_HIDDEN }).then(function () {
          x.status = ST_HIDDEN; done++;
        }, function (e) { failed++; lastErr = e; });
      });
    });
    chain.then(function () {
      var word = failed
        ? 'Hid ' + done + ' of ' + mine.length + ' — ' + failed + ' failed (' + msgOf(lastErr) + ')'
        : 'Hid ' + done + ' listings by ' + (r.seller_name || 'this member');
      return afterChange(word, 'Bulk hide failed: ').then(function () {
        if (failed) note(word, 'err');
      });
    }).catch(function (e) {
      note('Bulk hide failed: ' + msgOf(e), 'err');
    }).then(function () { setBusy(false); });
  }

  /* ── wire up ────────────────────────────────────────────────────────────── */
  /* Guarded listeners: a missing node (markup drift) must never stop the gate
     from working, matching the no-CDN resilience the rest of the site keeps. */
  function on(id, evt, fn) {
    var n = $(id);
    if (n) n.addEventListener(evt, fn);
  }
  on('go', 'click', unlock);
  on('pw', 'keydown', function (e) { if (e.key === 'Enter') unlock(); });
  on('pw', 'input', clearErr);
  on('refresh', 'click', function () { if (busy) return; shown = PAGE_ROWS; loadAll(); });
  on('lock', 'click', lock);
  on('flt', 'input', function () { query = this.value.trim().toLowerCase(); shown = PAGE_ROWS; renderList(); });
  on('fltStatus', 'change', function () { shown = PAGE_ROWS; renderList(); });

  /* Test hook — tools/test-admin.js renders a worst-case row (400-character
     title, wall of description) through the REAL row builder at a 360px
     viewport, which is how the "text bleeds off screen" bug is kept fixed.
     It only builds a detached node: it can read nothing and change nothing. */
  window.__admRenderTest = listingRow;

  if (isUnlocked()) { showDash(); loadAll(); } else { pw.focus(); }
})();

