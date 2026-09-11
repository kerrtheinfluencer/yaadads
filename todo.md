# Yaad Adz — v2 Roadmap

## ✅ Shipped in v2.x (post-v2 updates)

### Updates history thread (v2.4)
- 🗞️ "What's new" is now a **persistent message** at the top of the Messages inbox — check it any time (New chip + pill dot while unread, History chip after)
- 📜 Opens a full-history overlay listing every past update (newest first, version + date chips, latest highlighted gold); `siteUpdateList()` sorts by the new `date` field on each entry
- 📋 Every update carries **notes** (changelog bullets rendered under the body); the overlay has **unlimited scroll** (grows to fit any number of updates, only scrolls when content outgrows the screen)
- 💬 Chat threads expand to **full history in one tap** ("Show full history") — no per-page limits
- Inbox no longer shows a dead-empty state — the updates thread + a hint fill an empty inbox

### Message history (v2.3)
- 💬 Full conversation history stays re-readable: silent refresh when opening Messages or a chat (no reliance on the realtime channel), day separators (Today/Yesterday/date), and a "Load earlier messages" button that pages long threads in slices of 60 (anchored scroll, no jump)
- 📴 Offline re-read: last 40 messages × 25 conversations persisted to `ya_msgs_cache` (add-only key, keyed by user id) and hydrated at boot
- 🛠️ Same-millisecond message-id collision fixed in `sbSendMessage`

### Motion system (v2.2)
- 🎞️ "Liquid rise" card entrances (overshoot + settle, wave stagger, desktop-only scale, photo glide), all compositor-only — see commit 5de9ef9
- Hover shadow pre-render + opacity crossfade, `hover:hover` gating, scoped `will-change`, compositor-only ambient glows, rAF-throttled scroll handlers everywhere

### What's-new notice (v2.1 → ongoing)
- 🔔 Site-update modal system (`SITE_UPDATES` in `js/site-updates.js`) — overlay + glass modal CSS added after the original CSS was missing (v2.2 fix, commit 5a7968c)

## ✅ Shipped in v2 (this update)

### Onboarding & tips (new)
- `js/onboarding.js` now actually loads on the homepage (was built but never wired up)
- Welcome modal: 4 slides (intro → AI search → post free → ⛽ gas prices)
- Coach-mark tour: search, categories, favourites, **post ad**, **gas banner**, messages, account (steps auto-skip missing targets)
- Contextual tips, once each, queued so they never stack:
  - ⌨️ Cmd+K (desktop, after scrolling to results)
  - ❤️ Favourites (after 3rd listing view, logged in)
  - 🚀 Post-your-first-ad (after 3rd listing view, logged out — with action button)
  - ⛽ Gas prices (14s in, with "View" action)
  - 📲 Add-to-home-screen (2nd visit, with Install action)
- Footer → "🔄 Replay Tour" replays everything
- **Returning users skip the auto-welcome** (any prior session/favourites/searches/visits signal) — their data flows are untouched; tips still fire, tour still replayable
- Focus trap, Escape/arrow-key navigation, `prefers-reduced-motion` respected

### UI/UX
- **Desktop "＋ Post Ad" button** in the nav (posting was mobile-only before!)
- Toast v2: optional action buttons (used by onboarding tips), XSS-safe DOM building
- 44px minimum tap targets on all icon-only controls (WCAG 2.5.5)
- 👁️ Recently-viewed strip on the homepage (`js/recent.js`)
- 🕐 Recent-searches chips on desktop (shares `ya_searches` with the AI sheet)
- Pinch-zoom no longer blocked (`maximum-scale` removed from viewport meta)

### PWA
- `manifest.json`: app id, `launch_handler`, maskable icons, **app shortcuts** (⛽ Gas Prices, ＋ Post Ad, 💬 Messages)
- Deep links `?post=1` and `?page=msgs|myads` handled in `widgets-pwa.js`

### Performance & hygiene
- Inline logo SVG (duplicated 3×, ~46KB) extracted to `/logo.svg` + `<img>` refs
- Sentry now `defer`-loaded, initialised after window load (no render blocking)
- Supabase creds read from `CFG` only (was duplicated in `ad-social.js`)
- SW cache bumped to `v18`; new assets pre-cached
- Gas page: relative "updated X days ago" + 🔗 share button (native share / clipboard)
- Generated ad pages: `fetchpriority="high"` on featured image, ⛽ Gas Prices footer link
- Removed empty `supabase.d.ts`
- `smoke-test.yml`: CI now checks onboarding wiring, manifest validity, JS syntax, CSS balance, logo.svg

### Dev/test tooling (new, in `tools/`)
- `tools/dev-server.js` — zero-dependency local server (`node tools/dev-server.js [port]`, default 8888)
- `tools/verify-v2.js` — 40 static checks (wiring, syntax, manifest, SW, CSS)
- `tools/test-data-safety.js` — 29 checks proving v2 only ADDS storage keys, never wipes/overwrites; Supabase creds unchanged; auth/DB files untouched in git (keys verified against pre-v2 commit `HEAD~1`)
- `tools/test-existing-user-flow.html` — headless/browser test: seeds pre-v2 user data, boots the real app, asserts welcome-skip + data preservation + tips firing
- `tools/test-existing-user.html`, `tools/test-check-storage.html` — simpler helpers for manual inspection

### Site update notifications (new)
- 🔔 **"What's new" notice** — one-time glass banner on the homepage telling members when the site is updated; dismissed once per update via `ya_seen_update`. Announce new versions by editing `SITE_UPDATES` in `js/site-updates.js`
- 📨 **Push for site updates** — new `site_updates` topic added to default push subscriptions; owners announce via `node notify-site-update.js "Title" "Body" [url]` (reuses the existing `/functions/v1/send-push` webhook + `x-webhook-secret` convention)
- SW cache bumped to `v19`; `/js/site-updates.js` pre-cached for installed PWAs

## 🔜 Backlog (v2.1+)
- [ ] Dark mode (design tokens are ready; needs audit of ~3,300 lines for hardcoded colors)
- [ ] Dedicated maskable icon artwork (current icons reused with padding assumption)
- [ ] Code-split `search-ai.js` (85KB) — lazy-load the Yaad Brain scoring tables
- [ ] Saved searches + alerts (push on new matching listings)
- [ ] "More from this parish/category" cross-links inside generated ad pages
- [ ] Seller verification badge workflow in admin dashboard
- [ ] i18n: full Patois toggle for UI strings
- [ ] Rotate Supabase anon key before expiry (CI warns automatically)
