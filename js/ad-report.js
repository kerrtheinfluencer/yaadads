/* ══════════════════════════════════════════════════════════════════════════
   MEMBER REPORTS ON LISTINGS §AD-REPORT

   One implementation, two hosts:

     • The app (index.html) already ships a #ovReport modal, so this reuses it
       and only supplies behaviour.
     • A generated /ad/<slug>.html page is standalone — no app, no #ovReport
       and no shared Supabase client — so this builds an equivalent dialog
       itself and creates a client from data attributes.

   The previous implementation (js/ad-social.js) did the opposite: it wrote the
   report to localStorage on the reporter's own phone and toasted "we'll review
   it". Nothing reached the server, so no report was ever reviewable. This one
   inserts into public.ad_reports, which the admin dashboard reads. If that
   table has not been created yet it says so plainly rather than claiming
   success.

   Public anon key only. Identity, the "is this your own ad" check and the rate
   limits are all enforced by the prepare_ad_report() trigger in Postgres.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var REPORTER_KEY_STORAGE = 'ya_reporter_key';
  var TABLE = 'ad_reports';
  var REASONS = [
    { v: 'scam',      label: '🚫 Scam / Fraud' },
    { v: 'wrong_cat', label: '📂 Wrong category' },
    { v: 'duplicate', label: '🔁 Duplicate listing' },
    { v: 'sold_item', label: '🏷️ Already sold / unavailable' },
    { v: 'offensive', label: '⚠️ Offensive content' }
  ];

  var state = {
    adId: null, reason: null, busy: false,
    db: null, els: null, host: null, title: ''
  };

  /* ── device key ──────────────────────────────────────────────────────────
     A random id per browser, used only to dedupe and rate-limit reports.
     Not an account, not an IP, and never shown to anyone. */
  function reporterKey() {
    var k = null;
    try { k = localStorage.getItem(REPORTER_KEY_STORAGE); } catch (e) { /* private mode */ }
    if (k) return k;
    k = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : 'rk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem(REPORTER_KEY_STORAGE, k); } catch (e) { /* ephemeral */ }
    return k;
  }

  /* ── database handle ────────────────────────────────────────────────────
     Prefer the app's live client so a signed-in session is reused. On a
     standalone ad page there is none, so build a throwaway anon client from
     the data attributes the page markup carries. */
  function db() {
    if (state.db) return state.db;
    if (window._db && typeof window._db.from === 'function') { state.db = window._db; return state.db; }
    var el = state.host;
    var url = el && el.dataset ? el.dataset.supabaseUrl : '';
    var key = el && el.dataset ? el.dataset.supabaseKey : '';
    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
      state.db = window.supabase.createClient(url, key);
      return state.db;
    }
    return null;
  }

  function say(text, kind) {
    if (state.els && state.els.status) {
      state.els.status.textContent = text || '';
      state.els.status.className = 'ar-status' + (kind ? ' is-' + kind : '');
    }
    if (kind === 'err' && window.showToast) window.showToast(text, '⚠️');
  }

  function done(text, icon) {
    say('', null);
    if (window.showToast) { window.showToast(text, icon); return; }
    /* A standalone ad page has no toast system, so leave the confirmation in
       the dialog rather than closing on a "thank you" nobody can see. */
    if (state.els && state.els.status) {
      state.els.status.textContent = text;
      state.els.status.className = 'ar-status is-ok';
    }
  }

  /* ── dialog ──────────────────────────────────────────────────────────────
     Reuse the app's #ovReport when it exists; otherwise build an equivalent.
     Built with DOM APIs and textContent — an ad title is never parsed as
     markup, so nothing a member types or a seller posts can escape into it. */
  function reasonEl(r, options, asButton) {
    var o = document.createElement(asButton ? 'button' : 'div');
    if (asButton) o.type = 'button';
    o.className = 'report-opt' + (asButton ? ' ar-opt' : '');
    o.textContent = r.label;
    o.dataset.reason = r.v;
    o.setAttribute('role', 'button');
    o.setAttribute('tabindex', '0');
    o.setAttribute('aria-checked', 'false');
    o.addEventListener('click', function () { choose(r.v, options); });
    o.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(r.v, options); }
    });
    return o;
  }

  function ensureModal(host) {
    if (state.els) return state.els;
    var existing = document.getElementById('ovReport');
    if (existing) {
      var opts = existing.querySelector('#reportOptions');
      var btn = existing.querySelector('#reportSubmitBtn');
      if (opts && btn) {
        opts.textContent = '';
        REASONS.forEach(function (r) { opts.appendChild(reasonEl(r, opts, false)); });
        btn.disabled = true;
        btn.addEventListener('click', function () { submit(); });
        var head = existing.querySelector('h3');
        if (head) head.textContent = 'Report this listing';
        var note = document.createElement('p');
        note.className = 'ar-status';
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
        btn.parentNode.insertBefore(note, btn);
        state.els = { root: existing, options: opts, submit: btn, status: note };
        return state.els;
      }
    }
    return buildModal(host);
  }

  function buildModal(host) {
    var wrap = document.createElement('div');
    wrap.className = 'overlay ar-overlay';
    wrap.id = 'arReport';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Report this listing');
    wrap.hidden = true;

    var box = document.createElement('div');
    box.className = 'modal ar-modal';
    var h = document.createElement('h3');
    h.className = 'ar-title';
    h.textContent = 'Report this listing';
    var which = document.createElement('p');
    which.className = 'ar-which';
    var list = document.createElement('div');
    list.className = 'ar-options';
    var st = document.createElement('p');
    st.className = 'ar-status';
    st.setAttribute('role', 'status');
    st.setAttribute('aria-live', 'polite');
    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn-red btn-block';
    send.textContent = 'Submit report';
    send.disabled = true;
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost btn-block';
    cancel.textContent = 'Cancel';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'ar-x';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '✕';

    REASONS.forEach(function (r) { list.appendChild(reasonEl(r, list, true)); });
    send.addEventListener('click', function () { submit(); });
    function shut() { close(); }
    cancel.addEventListener('click', shut);
    x.addEventListener('click', shut);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) shut(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && !wrap.hidden) close();
    });

    [x, h, which, list, st, send, cancel].forEach(function (n) { box.appendChild(n); });
    wrap.appendChild(box);
    /* Anchor the dialog next to its trigger when there is one, so a generated
       ad page keeps the dialog within the same stacking context as the link. */
    if (host && host.appendChild) host.appendChild(wrap);
    else document.body.appendChild(wrap);
    state.els = { root: wrap, options: list, submit: send, status: st, which: which };
    return state.els;
  }

  function choose(reason, options) {
    state.reason = reason;
    Array.prototype.forEach.call(options.children, function (c) {
      var on = !!c.dataset && c.dataset.reason === reason;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (state.els && state.els.submit) state.els.submit.disabled = false;
    say('', null);
  }

  function open(adId, opts) {
    opts = opts || {};
    if (!adId) return;
    var els = ensureModal(opts.host);
    state.adId = String(adId);
    state.reason = null;
    state.title = opts.title || '';
    state.host = opts.host || null;
    Array.prototype.forEach.call(els.options.children, function (c) {
      c.classList.remove('selected');
      c.setAttribute('aria-checked', 'false');
    });
    if (els.which) els.which.textContent = state.title ? 'Listing: ' + state.title : '';
    els.submit.disabled = true;
    els.submit.textContent = 'Submit report';
    say('', null);
    if ('hidden' in els.root) els.root.hidden = false;
    if (els.root.style) els.root.style.display = 'flex';
    if (window.openOverlay && els.root.id === 'ovReport') window.openOverlay('ovReport');
    if (window.track) window.track('report_open', {});
  }

  function close() {
    if (!state.els) return;
    if ('hidden' in state.els.root) state.els.root.hidden = true;
    if (state.els.root.style) state.els.root.style.display = '';
    if (window.closeOverlay && state.els.root.id === 'ovReport') window.closeOverlay('ovReport');
  }

  /* Turn a Supabase/PostgREST failure into something a member can act on.
     23505 is our own one-report-per-device index doing its job; 42P01 means
     the migration has not been run yet. Neither may ever read as success. */
  function failure(e) {
    var code = e && e.code, msg = (e && e.message) || '';
    if (code === '23505') return 'You have already reported this listing. Thanks.';
    if (code === '42P01' || code === 'PGRST205') return 'Reporting is not switched on yet. Please tell us another way.';
    if (code === '42501') return 'Reporting is not available right now. Please try again later.';
    if (msg) return msg;
    return 'Could not send that report. Please try again.';
  }

  function rearm() {
    if (!state.els) return;
    state.els.submit.disabled = false;
    state.els.submit.textContent = 'Submit report';
  }

  function submit() {
    if (state.busy || !state.adId || !state.reason) return;
    var client = db();
    if (!client) { say('Reporting is not available on this page.', 'err'); return; }
    state.busy = true;
    if (state.els) { state.els.submit.disabled = true; state.els.submit.textContent = 'Sending…'; }
    say('', null);

    /* reporter_id is deliberately absent — the trigger stamps it from the
       session, so no client can file a report as somebody else. */
    var row = { ad_id: state.adId, reason: state.reason, reporter_key: reporterKey() };

    client.from(TABLE).insert(row).select('id').single()
      .then(function (r) {
        state.busy = false;
        if (r && r.error) { say(failure(r.error), 'err'); rearm(); return; }
        if (window.track) window.track('report_submit', { reason: state.reason });
        close();
        done("Thanks — we'll review this listing.", '🚩');
      })
      .catch(function (e) {
        state.busy = false;
        say(failure(e), 'err');
        rearm();
      });
  }

  /* ── mount helper for generated ad pages ─────────────────────────────────
     One quiet "Report" link beside the share controls. Reporting is a safety
     valve, not a headline feature, so it stays out of the way. */
  function mountLink(host, adId, title) {
    if (!host || host.dataset.reportMounted) return;
    host.dataset.reportMounted = 'true';
    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'ar-link';
    a.textContent = '🚩 Report this listing';
    a.setAttribute('aria-label', 'Report this listing: ' + (title || ''));
    a.addEventListener('click', function () { open(adId, { title: title, host: host }); });
    host.appendChild(a);
  }

  window.YaadReport = {
    open: open, close: close, submit: submit, mountLink: mountLink,
    TABLE: TABLE, REASONS: REASONS
  };

  /* Global aliases so the app's existing markup — and any template that
     reaches for openReport() — lands on this implementation. */
  window.openReport = function (adId) { open(adId, { title: state.title }); };
  window.closeReport = close;
  window.submitReport = submit;
  window.selectReport = function (el, reason) { if (state.els) choose(reason, state.els.options); };
})();
