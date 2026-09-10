/* ═══════════════════════════════════════════════════════════
   SITE UPDATES §UPDATES
   ─ A "What's new" notice that tells members when the site has
     been updated.
   ─ To announce a new update:
       1. Add an entry to SITE_UPDATES.items below.
       2. Set SITE_UPDATES.current to that id.
       3. Commit — returning visitors see it once (per-update
          dismissal kept in localStorage 'ya_seen_update').
       4. Optional: blast push subscribers with
          node notify-site-update.js "Title" "Body" [url]
   ─ Built with DOM APIs (never innerHTML) so nothing can inject
     markup; wrapped defensively so it can never break boot.
   ═══════════════════════════════════════════════════════════ */

var SITE_UPDATES = {
  current: 'liquid-glass',
  items: {
    'liquid-glass': {
      version: 'v2.1',
      icon: '✨',
      title: 'A fresh new look — Liquid Glass',
      body: 'The whole site got a rich dark-glass finish — bolder cards, better contrast, and easier night browsing. New changes will land here, so this is the place to catch every update.',
      url: '/',
    },
  },
};

function siteUpdateSeenId() {
  try { return localStorage.getItem('ya_seen_update') || ''; } catch (e) { return ''; }
}

function dismissSiteUpdate() {
  try { localStorage.setItem('ya_seen_update', SITE_UPDATES.current); } catch (e) {}
  const card = document.getElementById('siteUpdateCard');
  if (!card) return;
  card.classList.add('leaving');
  setTimeout(function () { card.remove(); }, 220);
}

function enableSiteUpdatePush() {
  try {
    if (typeof requestPushPermission === 'function') { requestPushPermission(); return; }
    if (typeof subscribeToPush === 'function') { subscribeToPush(['listings', 'gas_prices', 'messages', 'site_updates']); }
  } catch (e) { console.error('[site-updates] enableSiteUpdatePush error:', e); }
}

// Never show the card on top of another overlay/tour, and never leave a
// dangling watchdog. If things stay busy we just skip quietly.
function siteUpdateBusy() {
  try {
    if (document.body.classList.contains('ai-sheet-open')) return true;
    if (document.querySelector('.overlay.open')) return true;
    const root = document.getElementById('obRoot');
    if (root && (root.classList.contains('ob-welcome-open') || root.classList.contains('ob-tour-open'))) return true;
  } catch (e) {}
  return false;
}

function maybeShowSiteUpdate() {
  try {
    if (!document.body) return;
    const meta = SITE_UPDATES.items[SITE_UPDATES.current];
    if (!meta) return;
    if (siteUpdateSeenId() === SITE_UPDATES.current) return;
    if (document.getElementById('siteUpdateCard')) return;
    if (siteUpdateBusy()) return;
    const home = document.getElementById('page-home');
    if (!home) return;

    const card = document.createElement('div');
    card.id = 'siteUpdateCard';
    card.className = 'site-update-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Site update');

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
    kicker.textContent = 'What’s new' + (meta.version ? ' · ' + meta.version : '');
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
    card.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'site-update-actions';

    const gotIt = document.createElement('button');
    gotIt.type = 'button';
    gotIt.className = 'site-update-btn site-update-btn-primary';
    gotIt.textContent = 'Got it';
    gotIt.addEventListener('click', dismissSiteUpdate);
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

    card.appendChild(actions);

    // Top of the home page, right under the sticky nav.
    home.insertBefore(card, home.firstChild);
  } catch (e) {
    console.error('[site-updates] maybeShowSiteUpdate error:', e);
  }
}

(function () {
  // Wait for first paint, and give the onboarding welcome its moment.
  setTimeout(function () {
    if (!siteUpdateBusy()) { maybeShowSiteUpdate(); return; }
    // If a modal/tour is up, retry quietly until it closes (watchdog).
    let tries = 0;
    const timer = setInterval(function () {
      tries++;
      if (!siteUpdateBusy() || tries > 12) {
        clearInterval(timer);
        maybeShowSiteUpdate();
      }
    }, 1500);
  }, 3000);
})();