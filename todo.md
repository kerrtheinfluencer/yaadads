# Yaad Adz — v2 Roadmap

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

## 🔜 Backlog (v2.1+)
- [ ] Dark mode (design tokens are ready; needs audit of ~3,300 lines for hardcoded colors)
- [ ] Dedicated maskable icon artwork (current icons reused with padding assumption)
- [ ] Code-split `search-ai.js` (85KB) — lazy-load the Yaad Brain scoring tables
- [ ] Saved searches + alerts (push on new matching listings)
- [ ] "More from this parish/category" cross-links inside generated ad pages
- [ ] Seller verification badge workflow in admin dashboard
- [ ] i18n: full Patois toggle for UI strings
- [ ] Rotate Supabase anon key before expiry (CI warns automatically)
