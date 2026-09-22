# Listing reviews and comments

## Activate posting

The frontend ships with an explicit setup-unavailable state. It does not store public feedback locally or pretend a failed submission succeeded.

1. In the existing Supabase project's SQL Editor, run `supabase-migration-ad-feedback.sql` once. It creates new tables, policies, indexes and a trigger; it does not replace existing auth or ad policies.
2. Confirm email/password and Google are enabled in Authentication > Providers. Use the existing project's Google configuration.
3. In Authentication > URL Configuration, allow production listing callback URLs (`https://yaadadz.com/ad/**`) and the homepage callback. Keep email confirmation enabled according to your existing policy.
4. Reload a listing. The setup notice should disappear and the public empty state should appear.
5. With two test accounts and a test listing, verify email confirmation, Google return, comment persistence after reload, one review per member, rejection of seller self-reviews, own-post deletion, and report submission. Also verify anonymous inserts and another member's deletion are rejected by RLS. Do not use real public listings for test posts.
6. Review `ad_feedback_reports` in the Supabase dashboard regularly. Reports are private. Administrators can remove abusive feedback through the dashboard; cascading deletion also removes its reports.

No purchase verification is claimed. Display names are public member-supplied names, not verified identities. Emails are never included in public feedback queries. Existing local-only seller ratings are intentionally separate.

## Verification

- `node tools/verify-v2.js` checks application integration and syntax.
- Open `tools/test-ad-feedback.html` in a browser for the mocked auth/posting regression suite. It must end in `ALL PASSED`; no real accounts or posts are created.
- `node tools/test-ad-feedback.js` checks every committed listing and shared generator markup.
- `npm test` currently has a pre-existing failure in the legacy data-safety check for `HOME_VIEW_KEY` in `js/search-ai.js`, also present before this feature.

Database migration and real authenticated end-to-end posting have NOT been executed from this workspace: database-admin access and a test account were not configured. Browser rendering against the real backend was verified in its missing-table state.
