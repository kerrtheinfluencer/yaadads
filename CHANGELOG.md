# Yaad Adz — Changelog

> Auto-generated from `js/site-updates.js` (`SITE_UPDATES.items`) — the same
> entries members see in the in-app **What’s new** history overlay.
> Do not edit by hand — it regenerates itself on every commit and on
> push to main (`npm run changelog` refreshes it manually).

## ✨ v2.13 — More marketplace, less empty space (Sep 17, 2026) · latest

A more compact homepage with the same green-and-gold glass finish. Shorter text, golden-ratio spacing and slimmer stats bring listings closer to the top.

- Responsive headline and shorter introduction across phone, tablet and desktop
- 13/21/34px spacing rhythm with preserved glass materials and gold accents
- Single scrollable suggestion row with comfortable 44px touch targets
- Slimmer stat chips without removing live counters

## 💬 v2.12 — Buyer reviews & comments on listings (Sep 17, 2026)

Each listing now has a place for buyer questions and reviews, with free buyer signup or your existing account. Posting becomes available once database setup is complete; until then the section clearly shows a setup notice.

- Reviews and comments sections on listing pages, including brand-new ads
- Google or email buyer signup directly on the listing — no ad or phone number required
- Posting requires a real signed-in session; email confirmation is respected
- One 1–5 star review per member per ad, with own-post deletion and abuse reporting after database activation
- Reviews are member opinions, not verified purchases; existing browser-only seller ratings are not imported
- Deployment note: database migration must be applied before public posting is available
- Desktop homepage hero has less empty space; mobile and tablet spacing is unchanged

## 📱 v2.11 — One listing at a time on your phone (Sep 15, 2026)

The home feed on mobile now shows one big, beautiful listing per screen — full-width photos, easier reading, less squinting. Prefer the compact look? Tap the new layout switch beside the sort dropdown to flip to the classic two-column grid, and we remember your choice. Best part: listings keep loading as you scroll — no more Load More button, just keep scrolling.

- New: mobile home feed defaults to a single full-width view with larger photos
- New: layout switch (single ⇄ grid) beside the sort dropdown — your choice is remembered
- New: unlimited scroll — the next listings load automatically as yuh reach the bottom
- Desktop and tablet keep their familiar multi-column layout

## 🚀 v2.10 — Posting an ad just got smarter (Sep 14, 2026)

The posting flow got a full glow-up. Paste any caption, message or note about your item and Smart fill writes the title, price, parish, category and phone for you. Drag & drop or paste photos straight from your clipboard, watch your progress ring fill as you type, and get a proper celebration when your ad goes live — with a one-tap WhatsApp share.

- New: Smart fill — paste your caption or a WhatsApp message and we fill the whole form ✨
- New: photo board takes drag & drop and clipboard paste (Ctrl/⌘+V), and you can tap any photo to make it the Cover
- New: live progress ring — see how complete your ad is, field by field, as you type
- New: guided tour on your first post, plus a ❔ How it works button to replay it any time
- New: a clean thank-you screen when you publish — your ad link with one-tap copy, and WhatsApp share
- New: your unfinished ad saves automatically — close the app and pick up right where you left off
- New: inline field hints tell you exactly what is missing before you hit publish
- Cleaned up: removed a flaky third-party link auto-fetch from the posting flow.

## 🧹 v2.6 — Faster search, same Yaad Adz (Sep 12, 2026)

Cleaned up the code behind search and listings — same features, less work per tap. Search reuses a ready-made index, category lookups are instant, and listing photos share one renderer. Yuh should feel snappier results, especially on slower phones.

- Search results identical — now served from a pre-built index instead of re-scanning every keystroke
- Category badges, filters and AI suggestions resolve instantly (map lookup, no repeated scans)
- Post-an-ad and edit-an-ad photo grids share one renderer — same 6-photo limit, same Cover tag
- Listing titles now escaped before display (no markup injection from titles)

## ⚡ v2.5 — New ads load instantly (Sep 12, 2026)

When yuh post a new ad, tapping it now shows the listing right away — no more waiting on the page generator. Photos are also served in the right size (up to ~90% lighter pages), so every ad opens faster, especially on mobile data.

- New ads render instantly in-app — the old reload loop (waiting up to 2 hours for the generator) is gone
- Thumbnails, galleries and "similar listings" now use size-optimised photos
- Fonts no longer block first paint — ad pages and the homepage open sooner
- Optional: instant static pages after posting (supabase-migration-3-instant-page-regen.sql)

## 🗞️ v2.4 — Updates keep their own history (Sep 11, 2026)

The "What's new" section is now a permanent message — check it any time to browse every past update, newest first, with versions and dates. The gold dot just means something new. Read old ones whenever yuh ready.

- The updates thread is now a permanent message in your inbox
- Browse every past update, newest first, with version and date
- The gold dot marks something new — the history never disappears

## 💬 v2.3 — Message history you can always re-read (Sep 11, 2026)

Yuh chats now keep their full history — day-by-day separators, a "Load earlier messages" button in long threads, and fresh messages waiting for you even if the app was closed. Past conversations also re-read offline. Never lose a deal again.

- Conversations keep their full past — re-read any time, even offline
- Day separators (Today / Yesterday / date) keep long threads easy to follow
- Background refresh on open so nothing is ever missing

## 🎞️ v2.2 — Silky-smooth scrolling & animations (Sep 11, 2026)

Listings now glide in as you scroll, cards lift with a softer hover, and the whole site moves lighter and faster — tuned to stay buttery even on budget phones. Also new: a little heart pop when yuh save a favourite. Same Yaad Adz, nicer motion.

- Cards rise in with a soft overshoot as you scroll — a wave when a row arrives together
- Softer hovers and a heart pop when you save a favourite
- Tuned to stay smooth even on budget phones

## ✨ v2.1 — A fresh new look — Liquid Glass (Sep 10, 2026)

The whole site got a rich dark-glass finish — bolder cards, better contrast,and easier night browsing. New changes will land here, so this is the place to catch every update.

- Rich dark-glass finish across the whole site
- Bolder cards, clearer contrast
- Easier night browsing
