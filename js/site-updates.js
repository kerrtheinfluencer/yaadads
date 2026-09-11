/* ═══════════════════════════════════════════════════════════
   SITE UPDATES §UPDATES
   ─ A system "What's new" message in the Messages inbox that tells
     members when the site has been updated. A gold notification dot
     on the Messages pill stays until the member opens the notice, which
     renders as a small glass read-modal.
   ─ To announce a new update:
       1. Add an entry to SITE_UPDATES.items.
       2. Set SITE_UPDATES.current to that id.
       3. Commit — members see a new inbox message + pill dot once.
       4. Optional: blast push subscribers with
          node notify-site-update.js "Title" "Body" [url]
   ─ Read-state kept once per update into localStorage ('ya_seen_update').
     Built with DOM APIs (never innerHTML) so nothing can inject
     markup; wrapped defensively so it can never break boot.
   ═══════════════════════════════════════════════════════════ */

var SITE_UPDATES = {
  current: 'message-history',
  items: {
    'message-history': {
      version: 'v2.3',
      icon: '💬',
      title: 'Message history you can always re-read',
      body: 'Yuh chats now keep their full history — day-by-day separators, a "Load earlier messages" button in long threads, and fresh messages waiting for you even if the app was closed. Past conversations also re-read offline. Never lose a deal again.',
      url: '/',
    },
    'smooth-motion': {
      version: 'v2.2',
      icon: '🎞️',
      title: 'Silky-smooth scrolling & animations',
      body: 'Listings now glide in as you scroll, cards lift with a softer hover, and the whole site moves lighter and faster — tuned to stay buttery even on budget phones. Also new: a little heart pop when yuh save a favourite. Same Yaad Adz, nicer motion.',
      url: '/',
    },
    'liquid-glass': {
      version: 'v2.1',
      icon: '✨',
      title: 'A fresh new look — Liquid Glass',
      body: 'The whole site got a rich dark-glass finish — bolder cards, better contrast,and easier night browsing. New changes will land here, so this is the place to catch every update.',
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
    modal.setAttribute('aria-label', 'What\'s new');

    const row = document.createElement('div');
    row.className = 'site-update-row';

    const icon = document.createElement('div');
    icon.className = 'site-update-icon';
    icon.textContent = meta.icon || '✨';
    row.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'site-update-copy';

    const kicker = document.createElement('div');
    kicker.className = 'site-update-kicker';
    kicker.textContent = 'What\'s new' + (meta.version ? ' · ' + meta.version : '');
    copy.appendChild(kicker);

    const title = document.createElement('div');
    title.className = 'site-update-title';
    title.textContent = meta.title;
    copy.appendChild(title);

    const body = document.createElement('p');
    body.className = 'site-update-body';
    body.textContent = meta.body;
    copy.appendChild(body);

    row.appendChild(copy);
    modal.appendChild(row);

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