# Phase 1 — CSS Consolidation

- [x] Analyze all inline `<style>` blocks in index.html
- [x] Analyze style.css for duplicate/overlapping selectors
- [x] Merge inline styles into style.css (remove !important, deduplicate)
- [x] Remove all inline `<style>` blocks from index.html
- [x] Verify no visual regressions
- [x] Clean up temp files

# Phase 1b — Supabase Auth Migration

- [x] Update `sbRegister` to use `supabase.auth.signUp()` (proper password hashing)
- [x] Update `sbLogin` to use `supabase.auth.signInWithPassword()` (server-side auth)
- [x] Fix `doLogout` — added `auth.signOut()` (also fixed syntax error in channel cleanup)
- [x] Update `sbUpdateUser` to use `profiles` table instead of `users`
- [x] Add session restoration on page load (`_db.auth.getSession()` → profiles)
- [x] Create `supabase-migration.sql` with triggers + RLS
- [x] Update SQL comments in index.html (now references new auth setup)

# Phase 1c — RLS Policy Fixes

- [x] Create `supabase-migration.sql` with proper RLS policies (profiles, ads, messages, storage)
- [x] Run `supabase-migration.sql` in Supabase SQL Editor (manual step)

# Phase 1d — Cleanup

- [x] Delete old helper files (fix-auth.js, fix-auth.ps1, check-auth.js, find-fns.js, fix-remaining.js, _fix_styles.mjs)
- [x] Update SQL comments block in index.html to match new auth setup

# ✅ All phases complete