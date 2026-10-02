# Yaad Adz — v2 Roadmap

## ✅ Shipped in v2.x (post-v2 updates)

### 👉 Swipe the photo right on the ad page itself (v2.21)
- 🖐️ **`§PHOTOSWIPE`** — the inline gallery on a generated ad page was the one photo surface you could **not** swipe. It had a thumbnail strip and a fullscreen lightbox, but in between the photo only moved if you tapped into the viewer first — and `openDetail()` sends every visitor to `/ad/<slug>.html` whenever that page exists, so that was the main ad page.
- 🎞️ **Two stacked layers, not a track.** `#featuredImg` (the photo being left) and one reusable `gallery-ghost` (the photo coming in) are moved with `translateX`. Absolute layers rather than an N-slide flex track keep `#featuredImg` **one stable node** — which is exactly what `showFeatured()` and `syncFeatured()` already assume — and mean a twenty-photo listing builds one extra node, not twenty.
- ⚡ **No blank frame, ever.** The ghost is **decoded before it is ever made visible**, and because it has already downloaded that exact URL, the hand-off to `showFeatured()` at the end of the swipe is a **cache hit** — so the existing §PHOTOSPIN shimmer can never fire on a swipe.
- 🧠 **Feel:** distance **OR** flick velocity commits (so a short quick flick counts); the first/last photo **rubber-band** instead of running off; a nudge **springs back**; the release settles on a 340 ms curve. `touch-action: pan-y` means a finger dragged **up** the photo still scrolls the page. Neighbours are prefetched on touch-down so the drag starts against painted pixels.
- 🔒 **Safe seams.** `setFeatured()` (thumbnail tap) and `syncFeatured()` (closing fullscreen) both call back through `gallerySwipeSync()`, so the engine's index can never drift — otherwise the next swipe would continue from a photo the visitor left several swipes ago. A committed swipe **swallows the click** that would otherwise fall through to `openLightbox(lbIndex)`; a plain tap still opens fullscreen. `prefers-reduced-motion` drops every transition. Desktop gets hover arrows that are `display:none` on touch, so they can never sit invisible-but-tappable over a photo.
- 🧪 `tools/test-photo-gestures.js` gained 8 static + 14 browser checks (real synthetic pointer events at 390px): advances, thumbnail follows, index stays in step, click swallowed, swipe back, small drift, vertical drag, rubber-band at both ends, tap still opens fullscreen, lightbox→inline re-seat.
- 🩹 Caught in the act: a backtick inside a CSS comment **terminated the page template literal** — the exact class of bug `test-page-scripts.js` was written to catch. All five are gone; `git grep` for backticks inside the template is now the habit to keep.

### ✨ For You — a ranked feed instead of a queue of the newest (v2.18)
- 🧠 **`js/for-you.js`** — the home feed now *ranks* every listing instead of showing only the newest. It is deliberately **not** another sort:
  - **The newest cannot win by default.** Freshness is a decaying score (full strength on day one, ~half at a week, ~5% at a month) worth `W_FRESH` — never a sort key. Quality (`W_QUALITY`: photos, description, views, phone, negotiable) and affinity (`W_AFFINITY`) outweigh it, so a three-week-old listing with real photos and real views beats a thin post from this morning — proven deterministically in `tools/test-for-you.js`.
  - **The top is always a mix.** The first `TOP_MIX` (8) slots are filled round-robin across categories, then every later pick is penalised for repeating the category (`P_CAT`), parish (`P_PARISH`) or seller (`P_SELLER`) that just appeared. A 10-ad flood from one seller can no longer own the page.
  - **Nothing is ever hidden — only ordered.** Every public listing is returned (the tail past `RANK_DEPTH` untouched); sold posts and same-seller duplicates are demoted, never removed. Newest First still shows the exact same set.
  - **Deterministic daily shuffle** (`jitterOf`, seeded by local date + 🔀 reroll) rotates the long tail without reshuffling cards mid-scroll; the seed is stable inside a session so `§PERF-APPEND` infinite scroll stays consistent.
  - **Signals are local-only:** ❤️ `ya_favs` + 👁️ `ya_recently_viewed` + 🔍 `ya_searches` are read (never written) and folded into category / parish / price-band / brand / search-term affinity. The module writes exactly one new key, `ya_home_sort`, and nothing else.
  - **Search still wins:** `getFiltered()` hands `scoreAd()` relevance into `fyRank()` with a weight larger than the whole base range, so a query always outranks personalisation.
- 👁️ **It explains itself** — every card carries a reason chip ("❤️ Because you like Vehicles", "🔍 You searched “vitz”", "🔥 Popular this week", "📷 4 photos to check"), the bar above the grid sums up the signals in play, and **❔ How this works** spells out all five rules. `🔀 Shuffle picks` re-rolls on demand. Built with DOM APIs only (no `innerHTML`).
- 🎛️ **Wiring** — `homeSortSel` (home) and `sortSel` (browse) both list **✨ For You** first and default to it; the choice is remembered per device, and **🆕 Show Newest First instead** is one tap inside the explainer.
- 🧪 `tools/test-for-you.js` (27 headless checks: nothing hidden, newest can't lead, mix/no-flood, affinity, relevance, sold demotion, determinism, shuffle, zero storage writes) + `tools/fy-preview.js` (`npm run fy:preview` prints a real 44-listing feed next to newest-first) + `tools/verify-v2.js` §6c wiring/promise checks + `js/for-you.js` added to the data-safety guard's `V2_FILES`.
- 🎨 `style.css` §FOR-YOU (bar, badge, buttons, explainer, `.fy-chip`) reuses the shared glass tokens and joins the sheen / edge-light lists; SW cache bumped to `v58` and `/js/for-you.js` pre-cached.

### ⚡ New ads load instantly + leaner ad pages (v2.5)
- 🚀 **New ads render inline** — tapping a just-posted ad now shows the listing immediately. The old fallback bounced `/ad/<slug>.html` → `/?ad=<id>` in an infinite reload loop (re-checking the same missing page every hop) until the 2-hour generator ran. `openDetail()` now falls back to `showAdInline(ad)` — a full detail view rendered inside the app.
- 🖼️ **Size-optimised images everywhere** — every ad image now goes through Supabase's image renderer (`/storage/v1/render/image/public/…`), verified working on this project. Featured 1280w, thumbs 144w, similar cards 360w, og/twitter/JSON-LD 1200w, lightbox 1600w. A 6-photo ad page drops from ~5.7MB → ~1MB of images.
- 🖼️ `thumbUrl()` now uses the render endpoint — the old `?width=` query param on the object URL was being ignored by Supabase, so thumbnails were pulling full 500KB files all along.
- ⚡ **Non-blocking fonts** — Google Fonts switched to `rel=preload` + `onload` swap on ad pages and the homepage, so text renders a paint sooner.
- ⛓️ **Instant static pages (optional)** — added the missing `supabase-migration-3-instant-page-regen.sql` (the file the deploy workflow references). A DB trigger fires `repository_dispatch('new-ad-posted')` the moment an ad is inserted, so static pages appear in ~2 min instead of up to 2 hours. **Setup:** run the SQL in Supabase + store a `gh_pat` (GitHub PAT with `repo` scope) in `yaadadz_config`.
- 🧹 SW cache bumped to `v27`; `tools/verify-v2.js` updated to match.

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

## 🔎 Known issues (v2.19, verified 2026-09-28)
- 🐛 **Sustained horizontal overflow at 390px** on the homepage — reproducible in `npm run test:hero` (fails at 390 only, 1440/780/768/640/320 are clean) and it still reproduces with the For You bar hidden, so it is **pre-existing and not from §FOR-YOU**. Culprit not yet isolated; the hero harness is deliberately kept out of CI until it is fixed, because a permanently red step is a step people learn to ignore.
- ℹ️ Chat share links are now absolute (`adLink` uses `SEO.base`); anything else still building a URL from a non-global `BASE_URL` is a bug of the same family — grep for `BASE_URL` before adding a new one.

## 📉 Dropped / not needed
- ~~Rotate Supabase anon key~~ — **not needed**: the key in `js/core.js` expires 2088210574 (≈2036), and CI already warns when it gets under 30 days.
- ~~`patch-matchmedia.js`~~ — deleted; `generate-pages.js` now emits the guarded `matchMedia` call itself, so there was nothing left to patch.
- ~~`dash-kxrr1.html`~~ — deleted; a second admin surface reading `ads` + `messages` + `users`, only ever hidden from crawlers. `admin.html` (v2.14) replaced it.

## 🔜 Backlog (unchanged)
- [ ] Dark mode (design tokens are ready; needs an audit of ~3,300 lines for hardcoded colors)
- [ ] Dedicated maskable icon artwork (current icons reused with padding assumption)
- [ ] Code-split `search-ai.js` (145KB) — lazy-load the Yaad Brain scoring tables
- [ ] Saved searches + alerts (push on new matching listings)
- [ ] "More from this parish/category" cross-links inside generated ad pages
- [ ] Seller verification badge workflow in admin dashboard
- [ ] i18n: full Patois toggle for UI strings
