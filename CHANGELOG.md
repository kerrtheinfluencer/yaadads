# Yaad Adz — Changelog

> Auto-generated from `js/site-updates.js` (`SITE_UPDATES.items`) — the same
> entries members see in the in-app **What’s new** history overlay.
> Do not edit by hand — it regenerates itself on every commit and on
> push to main (`npm run changelog` refreshes it manually).

## 📸 v2.20 — Photos that follow your thumb (Oct 1, 2026) · latest

Photos now follow your thumb: swiping tracks your finger, a quick flick moves to the next photo and a small nudge stays put, you can pinch or double-tap to zoom, and drag a photo down to close it. Changing photo on a listing keeps what you are looking at until the next one has loaded — with a gentle shimmer instead of a blank space when it is slow — and the photos next to it warm up quietly, so tapping one is instant. Pulling down to refresh now takes a real, deliberate pull, and swiping back up cancels it. On a phone, the bar above the listings no longer pushes the page sideways.

- New: swiping between photos follows your finger — a quick flick moves on, a small nudge stays put
- New: pinch or double-tap to zoom, and drag a photo down to close the viewer
- New: the dots under a photo are easy to tap on a phone now
- New: a photo that is slow to load shows a gentle shimmer instead of a blank space — a photo you have already loaded never flashes it
- New: the photos next to the one you are viewing warm up quietly, so tapping one is instant
- New: pulling to refresh now needs a deliberate pull — never a small drag, an angled drag, or one starting on the category row
- New: you can cancel pull-to-refresh by swiping back up — it used to reload the page anyway
- Fixed: on a shared listing page the photo switcher had stopped running, so changing the photo left the big image unchanged
- Fixed: a photo full-screen now opens on the one you picked, and closing leaves the page on the photo you were looking at
- Fixed: changing photo keeps the current photo on screen until the next has loaded, instead of showing a blank frame
- Fixed: a listing with a single photo no longer shows empty dots and arrows
- Fixed: the bar above the listings no longer scrolls the page sideways on a phone, and the single-picture / grid switch is reachable on small screens
- Fixed: pressing the arrow key while viewing a photo jumped two photos instead of one
- Every test in the project now runs automatically on each change, so this class of bug cannot sit unnoticed again

## ✨ v2.18 — The feed is picked for you now — not just the newest (Sep 28, 2026)

The home feed is no longer a queue of whatever was posted last. Every listing is now ranked for you: real photos, a real description and real interest lift a post, freshness fades after the first day, and the top of the page always spreads across categories so no one seller can take it over. Every card tells you why you are seeing it, and Newest First is still one tap away in the sort box.

- New: ✨ For You — the home feed ranks listings instead of just showing the newest
- New: a reason on every card — "more like the Toyota you looked at", "popular this week", "just posted today"
- New: the top of the feed is a mix, and one seller can no longer flood it
- New: a three-week-old listing with real photos and real views can outrank a thin post from this morning
- New: 🔀 Shuffle picks for a different mix, and ❔ How this works explains every rule
- New: nothing is ever hidden — Newest First shows the exact same listings, and your choice is remembered
- Your signals stay on your phone — what you open, save and search is never uploaded anywhere

## 👍 v2.19 — Easier to tap, and a quieter bug hunt (Sep 28, 2026)

The category buttons across the top are bigger now — a proper 44px target instead of a 34px sliver, so they are far easier to hit on a phone. We also went bug hunting and closed three real ones: a newly posted ad sometimes would not open at all, your name and listing titles in a chat are now escaped everywhere they appear (an old page could run code that a member typed into their name), and a link copied out of a chat now carries the full web address instead of a broken half-link.

- New: category buttons are now a full 44px tap target on every screen size
- Fixed: tapping a brand-new ad could do nothing at all while its page was still being generated
- Fixed: member names, listing titles and message text in a chat are escaped everywhere they are shown
- Fixed: a listing link copied out of a chat now shares the full yaadadz.com address
- Removed: an old hidden admin page that was only ever kept out of search results
- Every test in the project now runs automatically on each change, so this class of bug cannot sit unnoticed again

## 🧹 v2.15 — We can take down junk posts now (Sep 27, 2026)

We can now hide or delete any post that is a scam, a duplicate, or just junk. Hiding takes a post off the site straight away but keeps it, so a mistake can be undone. If a member is spamming, one tap clears everything they posted.

- Bad posts now come off the homepage, search, categories and the AI chat immediately
- Hidden posts lose their own web page and their spot in Google too, not just from the app
- One tap clears every post from the same member when someone is spamming
- Nothing is destroyed by hiding — a mistake can always be put back

## 🚩 v2.16 — Report a post — and this time we actually read them (Sep 27, 2026)

Every ad now has a "Report this listing" link at the bottom. Tap it, say why (scam, duplicate, wrong category, already sold, or offensive) and it goes straight to our moderation queue. Please use it. Reports are the fastest way to get a bad post off the site.

- New: a Report link on every listing, in the app and on the page you share
- You do not need an account to report — scams are exactly what logged-out visitors see
- Five reasons to pick from: scam, duplicate, wrong category, already sold, or offensive
- Each ad is only counted once per device, so nobody can flood the queue by accident
- Fixed: reporting used to save to your own phone and go nowhere. It now really reaches us

## ✉️ v2.17 — Messaging got rebuilt — and it actually works now (Sep 26, 2026)

Every listing now has a real ✉️ Message button, so you can talk to a seller without leaving the ad. Inside the chat you get ✓✓ when they read your message, a card showing the price of the item you are discussing, one-tap quick replies, and a 💰 button to make an offer right in the thread. If a message fails to send, it stays in the box with a Retry instead of vanishing.

- New: every listing has a ✉️ Message seller button — the chat had no way in from a listing before
- New: ✓✓ Read receipts on your own messages, so you know when a seller actually saw it
- New: the thread shows which item it is about, its price, and a tap back to the listing
- New: one-tap quick replies — still available? best price? where do we meet? can you deliver?
- New: make an offer inside the chat with the 💰 button
- New: a one-line safety reminder in every chat, dismissible
- Fixed: a message that fails to send no longer disappears — it stays put with a Retry
- Fixed: typing is never wiped when a reply arrives mid-sentence
- Fixed: messages no longer show as unread while you are reading them
- Fixed: the same message could appear twice after a connection drop
- Fixed: both inboxes now show the same rows, in the same order, in the same style
- Fixed: seller names and listing titles are escaped everywhere they are displayed

## 👍 v2.14 — Easier to tap, easier on the eyes (Sep 26, 2026)

A bunch of small things that add up when yuh browsing on a phone. Buttons that were a bit too small are now a comfortable tap, and the category links got real tap targets instead of being tiny slivers of text. Nothing about the layout moved — it just responds better when yuh tapping fast.

- New: the grid/list view toggle is now a full 44px tap target instead of 34px
- New: the "ask AI about this" link can actually be hit without aiming
- New: the category shortcuts in the SEO sections are proper tap targets now, not 15px slivers
- Fixed: the tab that opens AI chat no longer has a tap area wider than the word itself
- Same look, same layout — just a lot less fumbling

## 🤖 v2.13 — The AI chat got a full glow-up (Sep 21, 2026)

Yaad Brain now chats like a proper assistant. Ask a follow-up like "the second one" or "anything cheaper?", compare two listings side by side, and get straight answers about any ad. And as always — it all runs 100% on your phone. No account, no cloud, no waiting.

- New: real follow-up chat — "the second one", "cheaper?", "only with photos" all remember the conversation
- New: side-by-side compare grid for any two listings — price, vs median, age, views at a glance
- New: 👍👎 on replies actually steer the next suggestions
- New: the conversation survives closing the app — come back and pick up right where you left off
- New: copy, retry or share any reply straight to WhatsApp
- Fixed: the whole chat got its glass-and-gold finish — desktop side panel and floating bubble included

## 📸 v2.12 — Photos view right + smoother pull-to-refresh (Sep 19, 2026)

Two fixes yuh asked for. Photos on the Post-Ad page now stay in the order yuh pick them, the first one is always the cover, and tapping any photo opens it fullscreen. Pull-to-refresh on mobile is calmer too — a short tug just shows the hint; only a proper pull past the line reloads the listings.

- Fixed: picked photos kept scrambling order and the cover preview pointed at the wrong photo
- New: tap any Post-Ad or Edit-Ad photo to view it fullscreen (swipe/arrows, dots + counter)
- New: ★ Cover button on non-cover photos to pick your cover without re-uploading
- Fixed: tiny overscrolls at the top of the feed no longer trigger a full reload
- Pull-to-refresh now needs a deliberate ~110px pull, ignores sideways swipes and pinch-zoom, and never fires inside modals or while typing

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
