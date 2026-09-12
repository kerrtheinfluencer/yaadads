# Yaad Adz — Changelog

> Auto-generated from `js/site-updates.js` (`SITE_UPDATES.items`) — the same
> entries members see in the in-app **What’s new** history overlay.
> Do not edit by hand: run `npm run changelog` after adding an update.

## 🧹 v2.6 — Faster search, same Yaad Adz (Sep 12, 2026) · latest

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
