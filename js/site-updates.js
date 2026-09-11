/*******************************************************************************
   SITE UPDATES - UPDATES
   - A persistent "What's new" thread in the Messages inbox. Members can check
     it ANY time - it stays at the top of the inbox and opens an overlay listing
     the FULL history of past updates (newest first, with version + date), not
     just the latest one. A gold dot on the Messages pill shows while the newest
     update is unread.
   - To announce a new update:
        1. Add an entry to SITE_UPDATES.items (append at the END - history
           renders newest-first). Every entry needs: version, icon, title,
           body, date ('Mon D, YYYY').
        2. Set SITE_UPDATES.current to that id.
        3. Commit - members see the thread highlight + pill dot once.
        4. Optional: blast push subscribers with `node notify-site-update.js`
   - Read-state kept once per update into localStorage ('ya_seen_update').
     Built with DOM APIs (never innerHTML) so nothing can inject markup;
     wrapped defensively so it can never break boot.
*******************************************************************************/


var SITE_UPDATES = {
  current: 'update-history',
  items: {
    'update-history': {
      version: 'v2.4',
      icon: '🗞️',
      title: 'Updates keep their own history',
      body: 'The "What\'s new" section is now a permanent message — check it any time to browse every past update, newest first, with versions and dates. The gold dot just means something new. Read old ones whenever yuh ready.',
      date: 'Sep 11, 2026',
      url: '/',
    },
    'message-history': {
      version: 'v2.3',
      icon: '💬',
      title: 'Message history you can always re-read',
      body: 'Yuh chats now keep their full history — day-by-day separators, a "Load earlier messages" button in long threads, and fresh messages waiting for you even if the app was closed. Past conversations also re-read offline. Never lose a deal again.',
      date: 'Sep 11, 2026',
      url: '/',
    },
    'smooth-motion': {
      version: 'v2.2',
      icon: '🎞️',
      title: 'Silky-smooth scrolling & animations',
      body: 'Listings now glide in as you scroll, cards lift with a softer hover, and the whole site moves lighter and faster — tuned to stay buttery even on budget phones. Also new: a little heart pop when yuh save a favourite. Same Yaad Adz, nicer motion.',
      date: 'Sep 11, 2026',
      url: '/',
    },
    'liquid-glass': {
      version: 'v2.1',
      icon: '✨',
      title: 'A fresh new look — Liquid Glass',
      body: 'The whole site got a rich dark-glass finish — bolder cards, better contrast,and easier night browsing. New changes will land here, so this is the place to catch every update.',
      date: 'Sep 10, 2026',
      url: '/',
    },
  },
};

function siteUpdateSeenId() {
  try { return localStorage.getItem('ya_seen_update') || ''; } catch (e) { return ''; }
}

function siteUpdateMeta() {
  return SITE_UPDATES.items[SITE_UPDATES.current] || null;
}

// All past updates, newest first (dates are 'Mon D, YYYY').
function _updateDateNum(s) {
  var m = String(s || '').match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (!m) return 0;
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return (+m[3]) * 10000 + (MON.indexOf(m[1]) + 1) * 100 + (+m[2]);
}
function siteUpdateList() {
  var items = SITE_UPDATES.items || {};
  var out = Object.keys(items).map(function(k){ return { key: k, meta: items[k] }; });
  out.sort(function(a, b) { return _updateDateNum(b.meta.date) - _updateDateNum(a.meta.date); });
  return out;
}

function siteUpdateUnread() {
  const meta = siteUpdateMeta();
  return !!meta && siteUpdateSeenId() !== SITE_UPDATES.current;
}

function markSiteUpdateRead() {
  try { localStorage.setItem('ya_seen_update', SITE_UPDATES.current); } catch (e) {}
}

function enableSiteUpdatePush() {
  try {
    if (typeof requestPushPermission === 'function') { requestPushPermission(); return; }
    if (typeof subscribeToPush === 'function') { subscribeToPush(['listings', 'gas_prices', 'messages', 'site_updates']); }
  } catch (e) { console.error('[site-updates] enableSiteUpdatePush error:', e); }
}

function closeSiteUpdate() {
  const ov = document.getElementById('suOverlay');
  if (!ov) return;
  ov.classList.add('leaving');
  setTimeout(function () { ov.remove(); }, 220);
}

function refreshInboxAndBadge() {
  try {
    if (typeof renderInbox === 'function') renderInbox();
    if (typeof updateMsgBadge === 'function') updateMsgBadge();
  } catch (e) {}
}

function openSiteUpdate() {
  try {
    const meta = siteUpdateMeta();
    if (!meta) return;
    // If the modal is already open, do nothing (in particular do NOT mark
    // read — a stray second tap must not clear the row behind a hidden
    // or half-rendered modal).
    if (document.getElementById('suOverlay')) return;

    const ov = document.createElement('div');
    ov.id = 'suOverlay';
    ov.className = 'su-overlay';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeSiteUpdate(); });

    const modal = document.createElement('div');
    modal.className = 'site-update-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'What\'s new — all updates');

    // ── Modal header: "What's new · N updates" ──
    const all = siteUpdateList();
    const hd = document.createElement('div');
    hd.className = 'site-update-modal-hd';
    const hdIcon = document.createElement('div');
    hdIcon.className = 'site-update-modal-hd-icon';
    hdIcon.textContent = '🗞️';
    hd.appendChild(hdIcon);
    const hdTitle = document.createElement('div');
    hdTitle.className = 'site-update-modal-hd-title';
    hdTitle.textContent = 'What\'s new';
    hd.appendChild(hdTitle);
    const hdCount = document.createElement('div');
    hdCount.className = 'site-update-modal-hd-count';
    hdCount.textContent = all.length + ' update' + (all.length === 1 ? '' : 's');
    hd.appendChild(hdCount);
    modal.appendChild(hd);

    // ── Full history list (newest first) ──
    const list = document.createElement('div');
    list.className = 'site-update-list';

    all.forEach(function(it) {
      const entry = document.createElement('div');
      entry.className = 'site-update-entry' + (it.key === SITE_UPDATES.current ? ' is-latest' : '');

      const hdr = document.createElement('div');
      hdr.className = 'site-update-entry-hd';

      const icon = document.createElement('div');
      icon.className = 'site-update-entry-icon';
      icon.textContent = it.meta.icon || '✨';
      hdr.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'site-update-entry-title';
      title.textContent = it.meta.title || '';
      hdr.appendChild(title);

      if (it.key === SITE_UPDATES.current) {
        const latest = document.createElement('span');
        latest.className = 'su-new-chip';
        latest.textContent = 'New';
        hdr.appendChild(latest);
      }
      if (it.meta.version) {
        const ver = document.createElement('span');
        ver.className = 'site-update-ver';
        ver.textContent = it.meta.version;
        hdr.appendChild(ver);
      }
      const dateEl = document.createElement('span');
      dateEl.className = 'site-update-date';
      dateEl.textContent = it.meta.date || '';
      hdr.appendChild(dateEl);

      entry.appendChild(hdr);

      if (it.meta.body) {
        const body = document.createElement('p');
        body.className = 'site-update-body';
        body.textContent = it.meta.body;
        entry.appendChild(body);
      }
      list.appendChild(entry);
    });

    modal.appendChild(list);

    // ── Actions: Got it / Notify me ──
    const actions = document.createElement('div');
    actions.className = 'site-update-actions';

    const gotIt = document.createElement('button');
    gotIt.type = 'button';
    gotIt.className = 'site-update-btn site-update-btn-primary';
    gotIt.textContent = 'Got it';
    gotIt.addEventListener('click', function () { closeSiteUpdate(); refreshInboxAndBadge(); });
    actions.appendChild(gotIt);

    const hasNotif = ('Notification' in window);
    if (hasNotif && window.Notification.permission !== 'granted' && window.Notification.permission !== 'denied') {
      const notif = document.createElement('button');
      notif.type = 'button';
      notif.className = 'site-update-btn site-update-btn-ghost';
      notif.textContent = '🔔 Notify me';
      notif.addEventListener('click', enableSiteUpdatePush);
      actions.appendChild(notif);
    }

    modal.appendChild(actions);
    ov.appendChild(modal);
    document.body.appendChild(ov);

    // Mark read only AFTER the modal is actually on screen. Previously the
    // read-state was saved before the modal existed — so if anything above
    // failed, the tap was consumed, nothing appeared, and the inbox row
    // vanished on the next render ("unclickable + disappears").
    markSiteUpdateRead();

    const firstBtn = modal.querySelector('button');
    if (firstBtn) { try { firstBtn.focus(); } catch (e) {} }
  } catch (e) {
    console.error('[site-updates] openSiteUpdate error:', e);
  }
}

// Escape closes the modal (once, safe to re-register).
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSiteUpdate(); });