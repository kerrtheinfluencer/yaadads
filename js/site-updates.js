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
           body, date ('Mon D, YYYY'). Optional: notes: [] (bullet list
           rendered under the body, like a quick changelog).
        2. Set SITE_UPDATES.current to that id.
        3. Commit - members see the thread highlight + pill dot once.
           CHANGELOG.md rebuilds itself from this file (see note 6 below).
        4. Optional: blast push subscribers with `node notify-site-update.js`
   - Read-state kept once per update into localStorage ('ya_seen_update').
     Built with DOM APIs (never innerHTML) so nothing can inject markup;
     wrapped defensively so it can never break boot.
   AI MAINTAINER NOTES (local dev) - read before editing js/*:
   1. LOAD ORDER (index.html, all defer): core -> auth-account -> listings -> ui-nav -> search-ai -> ad-social -> widgets-pwa -> photo-gestures -> onboarding -> recent -> for-you -> site-updates -> boot. boot.js calls init() LAST. for-you.js must stay BEFORE boot.js - it wraps renderHome() and defaults the home sort select. photo-gestures.js (§PHOTO-GESTURES) is the single owner of the fullscreen-lightbox touch gestures - never re-add a swipe handler in widgets-pwa.js.
   2. SINGLE SOURCES: CFG/CATS/CAT_MAP/catById//escHtml/fmtN/ago live in core.js. Never re-add category-find or escHtml elsewhere (test: node tools/test-cleanup.js).
   3. SEARCH CACHE: loadAds sets ad._hay {title,desc,par,cat,all} + _adById via rebuildAdIndex(). scoreAd/getFiltered MUST read ad._hay - never toLowerCase in loops.
   4. PHOTO GRIDS: post+edit share _photoThumbsHTML/_addFilesToPhotos in listings.js. Keep onclick names (removePhoto/removeEditAdPhoto) + ids (imgFile/eaImgFile).
   5. SAFE EDITS: keep public names (init/loadAds/openDetail/cardHTML/renderHome/getFiltered/scoreAd/findAd/catById). Do not touch CFG creds, manifest. escHtml() all DB strings before innerHTML.
   6. §FOR-YOU: getFiltered() routes sort 'foryou' into fyRank() (js/for-you.js) and passes scoreAd() in as the relevance fn, so a query always outranks personalisation. That feed's whole promise - never newest-first, never hide a listing, always explain itself - is pinned by tools/test-for-you.js and the §6c block in tools/verify-v2.js. js/for-you.js is an IIFE publishing only window.*, so it can never collide with another file's top-level let/const/var.
   7. NEW js file? add it to PRECACHE_URLS in sw.js AND bump CACHE_VERSION, or installed PWAs keep serving the old shell forever.
   8. BEFORE PUSH: npm test then npm run changelog — the changelog also updates
      itself (pre-commit hook + a bot commit in CI), so npm run changelog is
      only needed to see it before you push.
*******************************************************************************/


var SITE_UPDATES = {
  current: 'calmer-touch',
  items: {
    'message-v2': {
      version: 'v2.17',
      icon: '✉️',
      title: 'Messaging got rebuilt — and it actually works now',
      cta: 'Open Messages',
      ctaFn: "goPage('msgs')",
      body: 'Every listing now has a real ✉️ Message button, so you can talk to a seller without leaving the ad. Inside the chat you get ✓✓ when they read your message, a card showing the price of the item you are discussing, one-tap quick replies, and a 💰 button to make an offer right in the thread. If a message fails to send, it stays in the box with a Retry instead of vanishing.',
      date: 'Sep 26, 2026',
      notes: [
        'New: every listing has a ✉️ Message seller button — the chat had no way in from a listing before',
        'New: ✓✓ Read receipts on your own messages, so you know when a seller actually saw it',
        'New: the thread shows which item it is about, its price, and a tap back to the listing',
        'New: one-tap quick replies — still available? best price? where do we meet? can you deliver?',
        'New: make an offer inside the chat with the 💰 button',
        'New: a one-line safety reminder in every chat, dismissible',
        'Fixed: a message that fails to send no longer disappears — it stays put with a Retry',
        'Fixed: typing is never wiped when a reply arrives mid-sentence',
        'Fixed: messages no longer show as unread while you are reading them',
        'Fixed: the same message could appear twice after a connection drop',
        'Fixed: both inboxes now show the same rows, in the same order, in the same style',
        'Fixed: seller names and listing titles are escaped everywhere they are displayed',
      ],
      url: '/',
    },
    'ai-chat-v2': {
      version: 'v2.13',
      icon: '🤖',
      title: 'The AI chat got a full glow-up',
      cta: 'Try it',
      ctaFn: 'openAiSheet',
      body: 'Yaad Brain now chats like a proper assistant. Ask a follow-up like "the second one" or "anything cheaper?", compare two listings side by side, and get straight answers about any ad. And as always — it all runs 100% on your phone. No account, no cloud, no waiting.',
      date: 'Sep 21, 2026',
      notes: [
        'New: real follow-up chat — "the second one", "cheaper?", "only with photos" all remember the conversation',
        'New: side-by-side compare grid for any two listings — price, vs median, age, views at a glance',
        'New: 👍👎 on replies actually steer the next suggestions',
        'New: the conversation survives closing the app — come back and pick up right where you left off',
        'New: copy, retry or share any reply straight to WhatsApp',
        'Fixed: the whole chat got its glass-and-gold finish — desktop side panel and floating bubble included',
      ],
      url: '/',
    },
    'photo-refresh': {
      version: 'v2.12',
      icon: '📸',
      title: 'Photos view right + smoother pull-to-refresh',
      cta: 'Try now',
      ctaFn: 'openPostAd',
      body: 'Two fixes yuh asked for. Photos on the Post-Ad page now stay in the order yuh pick them, the first one is always the cover, and tapping any photo opens it fullscreen. Pull-to-refresh on mobile is calmer too — a short tug just shows the hint; only a proper pull past the line reloads the listings.',
      date: 'Sep 19, 2026',
      notes: [
        'Fixed: picked photos kept scrambling order and the cover preview pointed at the wrong photo',
        'New: tap any Post-Ad or Edit-Ad photo to view it fullscreen (swipe/arrows, dots + counter)',
        'New: ★ Cover button on non-cover photos to pick your cover without re-uploading',
        'Fixed: tiny overscrolls at the top of the feed no longer trigger a full reload',
        'Pull-to-refresh now needs a deliberate ~110px pull, ignores sideways swipes and pinch-zoom, and never fires inside modals or while typing',
      ],
      url: '/',
    },
    'home-view': {
      version: 'v2.11',
      icon: '📱',
      title: 'One listing at a time on your phone',
      cta: 'Try now',
      ctaFn: 'openPostAd',
      body: 'The home feed on mobile now shows one big, beautiful listing per screen — full-width photos, easier reading, less squinting. Prefer the compact look? Tap the new layout switch beside the sort dropdown to flip to the classic two-column grid, and we remember your choice. Best part: listings keep loading as you scroll — no more Load More button, just keep scrolling.',
      date: 'Sep 15, 2026',
      notes: [
        'New: mobile home feed defaults to a single full-width view with larger photos',
        'New: layout switch (single ⇄ grid) beside the sort dropdown — your choice is remembered',
        'New: unlimited scroll — the next listings load automatically as yuh reach the bottom',
        'Desktop and tablet keep their familiar multi-column layout',
      ],
      url: '/',
    },
    'post-pro': {
      version: 'v2.10',
      icon: '🚀',
      title: 'Posting an ad just got smarter',
      cta: 'Try now',
      ctaFn: 'openPostAd',
      body: 'The posting flow got a full glow-up. Paste any caption, message or note about your item and Smart fill writes the title, price, parish, category and phone for you. Drag & drop or paste photos straight from your clipboard, watch your progress ring fill as you type, and get a proper celebration when your ad goes live — with a one-tap WhatsApp share.',
      date: 'Sep 14, 2026',
      notes: [
        'New: Smart fill — paste your caption or a WhatsApp message and we fill the whole form ✨',
        'New: photo board takes drag & drop and clipboard paste (Ctrl/⌘+V), and you can tap any photo to make it the Cover',
        'New: live progress ring — see how complete your ad is, field by field, as you type',
        'New: guided tour on your first post, plus a ❔ How it works button to replay it any time',
        'New: a clean thank-you screen when you publish — your ad link with one-tap copy, and WhatsApp share',
        'New: your unfinished ad saves automatically — close the app and pick up right where you left off',
        'New: inline field hints tell you exactly what is missing before you hit publish',
        'Cleaned up: removed a flaky third-party link auto-fetch from the posting flow.',
      ],
      url: '/',
    },
    'code-cleanup': {
      version: 'v2.6',
      icon: '🧹',
      title: 'Faster search, same Yaad Adz',
      body: 'Cleaned up the code behind search and listings — same features, less work per tap. Search reuses a ready-made index, category lookups are instant, and listing photos share one renderer. Yuh should feel snappier results, especially on slower phones.',
      date: 'Sep 12, 2026',
      notes: [
        'Search results identical — now served from a pre-built index instead of re-scanning every keystroke',
        'Category badges, filters and AI suggestions resolve instantly (map lookup, no repeated scans)',
        'Post-an-ad and edit-an-ad photo grids share one renderer — same 6-photo limit, same Cover tag',
        'Listing titles now escaped before display (no markup injection from titles)',
      ],
      url: '/',
    },
    'fast-new-ads': {
      version: 'v2.5',
      icon: '⚡',
      title: 'New ads load instantly',
      body: 'When yuh post a new ad, tapping it now shows the listing right away — no more waiting on the page generator. Photos are also served in the right size (up to ~90% lighter pages), so every ad opens faster, especially on mobile data.',
      date: 'Sep 12, 2026',
      notes: [
        'New ads render instantly in-app — the old reload loop (waiting up to 2 hours for the generator) is gone',
        'Thumbnails, galleries and "similar listings" now use size-optimised photos',
        'Fonts no longer block first paint — ad pages and the homepage open sooner',
      ],
      url: '/',
    },
    'update-history': {
      version: 'v2.4',
      icon: '🗞️',
      title: 'Updates keep their own history',
      body: 'The "What\'s new" section is now a permanent message — check it any time to browse every past update, newest first, with versions and dates. The gold dot just means something new. Read old ones whenever yuh ready.',
      date: 'Sep 11, 2026',
      notes: [
        'The updates thread is now a permanent message in your inbox',
        'Browse every past update, newest first, with version and date',
        'The gold dot marks something new — the history never disappears',
      ],
      url: '/',
    },
    'message-history': {
      version: 'v2.3',
      icon: '💬',
      title: 'Message history you can always re-read',
      body: 'Yuh chats now keep their full history — day-by-day separators, a "Load earlier messages" button in long threads, and fresh messages waiting for you even if the app was closed. Past conversations also re-read offline. Never lose a deal again.',
      date: 'Sep 11, 2026',
      notes: [
        'Conversations keep their full past — re-read any time, even offline',
        'Day separators (Today / Yesterday / date) keep long threads easy to follow',
        'Background refresh on open so nothing is ever missing',
      ],
      url: '/',
    },
    'smooth-motion': {
      version: 'v2.2',
      icon: '🎞️',
      title: 'Silky-smooth scrolling & animations',
      body: 'Listings now glide in as you scroll, cards lift with a softer hover, and the whole site moves lighter and faster — tuned to stay buttery even on budget phones. Also new: a little heart pop when yuh save a favourite. Same Yaad Adz, nicer motion.',
      date: 'Sep 11, 2026',
      notes: [
        'Cards rise in with a soft overshoot as you scroll — a wave when a row arrives together',
        'Softer hovers and a heart pop when you save a favourite',
        'Tuned to stay smooth even on budget phones',
      ],
      url: '/',
    },
    'liquid-glass': {
      version: 'v2.1',
      icon: '✨',
      title: 'A fresh new look — Liquid Glass',
      body: 'The whole site got a rich dark-glass finish — bolder cards, better contrast,and easier night browsing. New changes will land here, so this is the place to catch every update.',
      date: 'Sep 10, 2026',
      notes: [
        'Rich dark-glass finish across the whole site',
        'Bolder cards, clearer contrast',
        'Easier night browsing',
      ],
      url: '/',
    },
    'touch-friendlier': {
      version: 'v2.14',
      icon: '👍',
      title: 'Easier to tap, easier on the eyes',
      body: 'A bunch of small things that add up when yuh browsing on a phone. Buttons that were a bit too small are now a comfortable tap, and the category links got real tap targets instead of being tiny slivers of text. Nothing about the layout moved — it just responds better when yuh tapping fast.',
      date: 'Sep 26, 2026',
      notes: [
        'New: the grid/list view toggle is now a full 44px tap target instead of 34px',
        'New: the "ask AI about this" link can actually be hit without aiming',
        'New: the category shortcuts in the SEO sections are proper tap targets now, not 15px slivers',
        'Fixed: the tab that opens AI chat no longer has a tap area wider than the word itself',
        'Same look, same layout — just a lot less fumbling',
      ],
      url: '/',
    },
    'clean-posts': {
      version: 'v2.15',
      icon: '🧹',
      title: 'We can take down junk posts now',
      body: 'We can now hide or delete any post that is a scam, a duplicate, or just junk. Hiding takes a post off the site straight away but keeps it, so a mistake can be undone. If a member is spamming, one tap clears everything they posted.',
      date: 'Sep 27, 2026',
      notes: [
        'Bad posts now come off the homepage, search, categories and the AI chat immediately',
        'Hidden posts lose their own web page and their spot in Google too, not just from the app',
        'One tap clears every post from the same member when someone is spamming',
        'Nothing is destroyed by hiding — a mistake can always be put back',
      ],
      url: '/',
    },
    'report-listing': {
      version: 'v2.16',
      icon: '🚩',
      title: 'Report a post — and this time we actually read them',
      body: 'Every ad now has a "Report this listing" link at the bottom. Tap it, say why (scam, duplicate, wrong category, already sold, or offensive) and it goes straight to our moderation queue. Please use it. Reports are the fastest way to get a bad post off the site.',
      date: 'Sep 27, 2026',
      notes: [
        'New: a Report link on every listing, in the app and on the page you share',
        'You do not need an account to report — scams are exactly what logged-out visitors see',
        'Five reasons to pick from: scam, duplicate, wrong category, already sold, or offensive',
        'Each ad is only counted once per device, so nobody can flood the queue by accident',
        'Fixed: reporting used to save to your own phone and go nowhere. It now really reaches us',
      ],
      url: '/',
    },
    'for-you': {
      version: 'v2.18',
      icon: '✨',
      title: 'The feed is picked for you now — not just the newest',
      cta: 'See your feed',
      ctaFn: 'goHome',
      body: 'The home feed is no longer a queue of whatever was posted last. Every listing is now ranked for you: real photos, a real description and real interest lift a post, freshness fades after the first day, and the top of the page always spreads across categories so no one seller can take it over. Every card tells you why you are seeing it, and Newest First is still one tap away in the sort box.',
      date: 'Sep 28, 2026',
      notes: [
        'New: ✨ For You — the home feed ranks listings instead of just showing the newest',
        'New: a reason on every card — "more like the Toyota you looked at", "popular this week", "just posted today"',
        'New: the top of the feed is a mix, and one seller can no longer flood it',
        'New: a three-week-old listing with real photos and real views can outrank a thin post from this morning',
        'New: 🔀 Shuffle picks for a different mix, and ❔ How this works explains every rule',
        'New: nothing is ever hidden — Newest First shows the exact same listings, and your choice is remembered',
        'Your signals stay on your phone — what you open, save and search is never uploaded anywhere',
      ],
      url: '/',
    },
    'taps-and-messages': {
      version: 'v2.19',
      icon: '👍',
      title: 'Easier to tap, and a quieter bug hunt',
      cta: 'See it',
      ctaFn: 'goHome',
      body: 'The category buttons across the top are bigger now — a proper 44px target instead of a 34px sliver, so they are far easier to hit on a phone. We also went bug hunting and closed three real ones: a newly posted ad sometimes would not open at all, your name and listing titles in a chat are now escaped everywhere they appear (an old page could run code that a member typed into their name), and a link copied out of a chat now carries the full web address instead of a broken half-link.',
      date: 'Sep 28, 2026',
      notes: [
        'New: category buttons are now a full 44px tap target on every screen size',
        'Fixed: tapping a brand-new ad could do nothing at all while its page was still being generated',
        'Fixed: member names, listing titles and message text in a chat are escaped everywhere they are shown',
        'Fixed: a listing link copied out of a chat now shares the full yaadadz.com address',
        'Removed: an old hidden admin page that was only ever kept out of search results',
        'Every test in the project now runs automatically on each change, so this class of bug cannot sit unnoticed again',
      ],
      url: '/',
    },
    'photo-touch': {
      version: 'v2.20',
      icon: '📸',
      title: 'Photos that follow your thumb',
      cta: 'Try it',
      ctaFn: 'openPostAd',
      body: 'Opening a listing photo full-screen on your phone feels a lot smoother now. The picture follows your finger as you drag it, a quick flick moves to the next photo, a small nudge stays put instead of jumping, and you can pull the photo down to close it. Pinch to zoom in, double-tap to zoom in, and the little dots at the bottom of a photo are finally big enough to tap. The photo viewer on a shared ad page works again too.',
      date: 'Oct 1, 2026',
      notes: [
        'New: swiping between photos follows your finger instead of snapping only after you let go',
        'New: a quick flick changes the photo, but a small nudge no longer flips it by accident',
        'New: pinch to zoom and double-tap to zoom on any full-screen photo',
        'New: drag a photo down to close the viewer',
        'New: the dots under a photo are easy to tap on a phone now',
        'Fixed: on a shared listing page the tap-a-photo code had stopped running, so changing the photo left the big image showing the same picture — it runs again now',
        'Fixed: opening a photo full-screen from a listing page now starts on the photo you picked, instead of always the first one',
        'New: closing full-screen leaves the listing page on the photo you were just looking at',
      ],
      url: '/',
    },

'phone-fixes': {
      version: 'v2.21',
      icon: '🐛',
      title: 'A bug sweep for phones',
      cta: 'See it',
      ctaFn: 'goHome',
      body: 'We went looking for more problems and found a few worth fixing. On a phone, the bar above the listings used to push the whole page sideways, and on a smaller screen the single-picture / grid switch could sit off the edge where you could not reach it — that row now fits properly and wraps instead. On a computer, pressing the left or right arrow while viewing a photo jumped two photos at once. And a listing with just one photo no longer shows empty dots and arrows in the viewer.',
      date: 'Oct 2, 2026',
      notes: [
        'Fixed: the bar above the listings no longer scrolls the whole page sideways on a phone',
        'Fixed: the single-picture / grid switch is reachable again on small screens',
        'Fixed: pressing the arrow key while viewing a photo jumped two photos instead of one',
        'Fixed: a listing with a single photo no longer shows empty dots and arrows in the photo viewer',
        'The phone layout check now runs on every change, so this class of bug cannot come back unnoticed',
      ],
      url: '/',
    },
'calmer-touch': {
      version: 'v2.22',
      icon: '🧘',
      title: 'Calmer pulling, faster photos',
      cta: 'See it',
      ctaFn: 'goHome',
      body: 'Two things you told us about. First, the app kept reloading itself when you dragged down the page — now pulling to refresh takes a real, deliberate pull, the way every other app works, and a small drag or a drag at an angle will never do it. Second, changing to another photo on a listing no longer goes blank while it loads: the photo you are looking at stays put and the next one replaces it the moment it is ready, and the photos next to it are quietly warmed up in the background so tapping one is instant.',
      date: 'Oct 3, 2026',
      notes: [
        'Fixed: the page no longer reloads itself when you drag down a little, or drag down at an angle',
        'Fixed: dragging down starting on the category row or the buttons above the listings no longer reloads the page',
        'New: pulling to refresh now needs a long, deliberate pull — like every other app',
        'Fixed: changing to another photo keeps the current photo on screen until the next one has loaded, instead of showing a blank frame',
        'New: the photos next to the one you are viewing are warmed up quietly in the background, so tapping one is instant',
      ],
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
      if (it.meta.notes && it.meta.notes.length) {
        const ul = document.createElement('ul');
        ul.className = 'site-update-notes';
        it.meta.notes.forEach(function(n) {
          const li = document.createElement('li');
          li.textContent = n;
          ul.appendChild(li);
        });
        entry.appendChild(ul);
      }
      if (it.meta.cta && it.meta.ctaFn && typeof window[it.meta.ctaFn] === 'function') {
        const ctaBtn = document.createElement('button');
        ctaBtn.type = 'button';
        ctaBtn.className = 'site-update-btn site-update-btn-primary site-update-cta';
        ctaBtn.style.marginTop = '12px';
        ctaBtn.textContent = it.meta.cta;
        ctaBtn.addEventListener('click', function () {
          closeSiteUpdate();
          try { window[it.meta.ctaFn](); } catch (e) {}
        });
        entry.appendChild(ctaBtn);
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