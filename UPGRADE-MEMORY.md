# Upgrade Memory

Everything this site has already fixed, and the guards that stop an update from bringing it back.
Generated from `upgrade-memory/ledger.json` by `node tools/upgrade-memory.js docs` — edit the ledger, not this file.

**High-water mark:** build 153 · release v4.1 · package 4.1.0. The site never goes below these.

20 active memories, 61 guards, 0 retired.

## Accessibility

### Motion ignored the reduced-motion setting  `reduced-motion-respected`

- **Since:** v4.1
- **Problem:** Decorative loops and slides kept running for people who asked for less motion.
- **Fix:** A reduced-motion block removes transitions, entrance animations and decorative loops.
- **Rule:** New animation must be covered by the prefers-reduced-motion block in motion.css.
- **Guards:** 2

## Account

### Buyer join card was crowded  `buyer-signup-google-first`

- **Since:** v4.1
- **Problem:** The join card showed Google, a dropdown and three fields at once.
- **Fix:** A full-width Continue with Google button with the Google logo; email is behind "Use email instead".
- **Rule:** The primary action on the join card is Google. The email form stays collapsed by default.
- **Guards:** 3

## CI

### Smoke Test was red for weeks  `smoke-test-installs-deps`

- **Since:** v4.1
- **Problem:** The photo-gesture test needs @supabase/supabase-js but the workflow never installed dependencies, so every later step was skipped.
- **Fix:** The workflow runs npm ci --ignore-scripts, and the missing test:home script exists.
- **Rule:** Every CI step must reference a script that exists; install dependencies before running tests.
- **Guards:** 2

## Layout

### Two footers on phones  `one-footer-on-phone`

- **Since:** v4.1
- **Problem:** The SEO "About Yaad Adz" block and the real footer both showed as separate heavy sections.
- **Fix:** On phones the About text folds into the footer as small centred text; category links are hidden. It stays in the page for search engines.
- **Rule:** Never delete .seo-about (it is crawlable SEO content); fold it visually instead.
- **Guards:** 2

## Messages

### A failed mark-as-read write blocked the chat from opening  `chat-opens-when-markread-fails`

- **Since:** v4.1
- **Problem:** sbMarkRead threw (no database / offline) before renderChat ran, so the thread never opened.
- **Fix:** The write is fire-and-forget inside try/catch with a rejection handler.
- **Rule:** Background writes must never be awaited or allowed to throw in the path that opens a screen.
- **Guards:** 2

### Member-supplied names/titles reached innerHTML  `chat-xss-escaped`

- **Since:** v3
- **Problem:** A hostile display name or ad title executed as HTML inside the chat.
- **Fix:** Every member-supplied string is escaped with escHtml before it enters markup.
- **Rule:** Never put a name, title or message into innerHTML without escHtml. test-msg-v2 drives a hostile payload.
- **Guards:** 3

## Motion

### Listing photo and contact bar shook while scrolling  `listing-scroll-shake`

- **Since:** v4.1
- **Problem:** The photo depth effect set a CSS variable on <body> and re-blurred a full-screen layer every scroll frame, starving the compositor, so the photo and the fixed contact pill jittered on iPhone.
- **Fix:** Depth now changes transform/opacity only, on the hero alone; the backdrop blur is constant; the contact pill sits on its own layer.
- **Rule:** Never drive per-frame effects through <body> variables or animate filter/blur on scroll. Only transform and opacity.
- **Guards:** 5

### Bottom sheets bounced past their edge  `sheets-never-overshoot`

- **Since:** v4.1
- **Problem:** The shared spring overshot by 56%, so sheets slid past rest and showed a gap at the screen edge, and cards bounced.
- **Fix:** Sheets and modals use an expo-out curve with no overshoot; only small controls keep a soft spring; --v3-spring was softened globally.
- **Rule:** Large surfaces (sheets, modals, the dock, cards) never use an overshooting curve. Overshoot is for chips and buttons only.
- **Guards:** 5

### Small controls animated every property  `no-transition-all-small-controls`

- **Since:** v4.1
- **Problem:** `transition: all` on small controls animated layout properties and wasted frames.
- **Fix:** Replaced with explicit property lists.
- **Rule:** Do not add `transition: all .15s/.2s` to small controls; list the properties.
- **Guards:** 1

## Navigation

### Minimized bar columns snapped instead of animating  `dock-columns-animate`

- **Since:** v4.1
- **Problem:** hybrid.css set its own transition list and dropped grid-template-columns, so the dock columns snapped while the height animated.
- **Fix:** motion.css owns one transition list for every dock property, including grid-template-columns, left and right.
- **Rule:** Any rule that sets `transition` on .mob-nav must include every property that changes between the expanded and compact states.
- **Guards:** 2

### Highlighted tab was cut off in the minimized bar  `dock-active-pill-fits`

- **Since:** v4.1
- **Problem:** The gold pill for the active tab was wider than its grid column and was clipped at the bar edge, off-centre.
- **Fix:** The active tab's column grows (1.75fr) to hold its pill, via :has(); the bar has side padding.
- **Rule:** The minimized bar must keep a column for the active pill; never fix a clipped pill by hiding overflow.
- **Guards:** 3

### Pressing Home on Home did nothing / the logo reloaded the page  `home-tab-scrolls-top`

- **Since:** v4.1
- **Problem:** goHome returned early when already on Home (no scroll, filters stuck), and the logo link followed href="/" and reloaded the whole page.
- **Fix:** goHome prevents the default on plain taps, clears filters, rebuilds the feed and scrolls to the top (smooth unless reduced-motion).
- **Rule:** The logo stays a real <a href="/"> but a plain tap is always handled in-app. Pressing Home when on Home scrolls to top.
- **Guards:** 5

### Gas pill and AI orb overlapped the nav bar  `no-floating-helpers-overlap`

- **Since:** v4.0
- **Problem:** The old floating gas banner and AI orb sat on top of the bottom bar.
- **Fix:** They are hidden on phones; gas price and Ask live in the dock strip (js/dock.js).
- **Rule:** Do not re-show #gasBanner / .v3-ai-float on phones. The dock strip replaces them.
- **Guards:** 3

### AI icon was cut off at the bar corner  `ask-bubble-not-orb`

- **Since:** v4.1
- **Problem:** The equaliser orb touched the right edge of the dock and was clipped by its rounded corner.
- **Fix:** A typing chat bubble with right padding on the strip; animation pauses while scrolling and for reduced motion.
- **Rule:** Keep padding-right on .hy-strip so the Ask control clears the corner radius.
- **Guards:** 3

### Bottom bar floated above the iPhone keyboard  `keyboard-hides-nav`

- **Since:** v4.0
- **Problem:** With the keyboard open the nav and back-to-top button rode above it.
- **Fix:** html.kb-open hides the nav and the back-to-top button.
- **Rule:** Keep the kb-open rules for the dock and back-to-top.
- **Guards:** 1

## Notifications

### Bell showed nothing for unread notifications  `bell-unread-badge`

- **Since:** v4.0
- **Problem:** The home bell had no unread indicator.
- **Fix:** A red badge with the unread count (9+ above nine), refreshed on load, new chats, tab focus and opening Notifications.
- **Rule:** The bell badge is driven by v3UnreadNotifs(); do not replace it with a boolean dot.
- **Guards:** 4

### New notifications were easy to miss  `notification-popup-to-bell`

- **Since:** v4.1
- **Problem:** A new message only produced a plain toast.
- **Fix:** On phones a centred glass card rises, then curves into the bell, which rings and bumps its badge.
- **Rule:** Phone notifications use v3Notify (centred card that returns to the bell); plain toasts are desktop-only.
- **Guards:** 4

## Offline

### New CSS/JS not available offline  `sw-precache-new-files`

- **Since:** v4.1
- **Problem:** Files not added to sw.js precache were missing for offline/PWA users.
- **Fix:** hybrid.css, motion.css, js/dock.js and js/build.js are precached.
- **Rule:** Every new CSS/JS file must be added to the sw.js precache list and CACHE_VERSION bumped.
- **Guards:** 5

## Releases

### Old builds could come back from a stale cache  `upgrade-memory-in-page-guard`

- **Since:** v4.1
- **Problem:** A stale service-worker cache or CDN edge could serve an older build, silently resurrecting fixed problems.
- **Fix:** js/build.js remembers the highest build this browser has run and refreshes once if an older one appears.
- **Rule:** js/build.js must remain the first script in index.html and stay precached.
- **Guards:** 3

## Safety

### Buyer-feedback script must not build markup from strings  `ad-feedback-no-markup-strings`

- **Since:** v4.1
- **Problem:** A change used innerHTML in js/ad-feedback.js; the security test rejects that and CI went red.
- **Fix:** The Google button and its logo are built with createElement/createElementNS.
- **Rule:** js/ad-feedback.js never uses innerHTML or localStorage (member text goes in through textContent only).
- **Guards:** 3
