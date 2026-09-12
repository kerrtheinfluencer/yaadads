-- supabase-migration-3-instant-page-regen.sql
-- ─────────────────────────────────────────────────────────────────────────
-- INSTANT PAGE REGENERATION FOR NEW ADS
-- ─────────────────────────────────────────────────────────────────────────
-- The GitHub Actions workflow .github/workflows/generate-ad-pages.yml already
-- listens for a `repository_dispatch` event of type `new-ad-posted`. That
-- workflow comment says a Supabase trigger fires it — but this migration
-- (the file it references) was missing, so new ads only got their static page
-- on the 2-hour cron. This trigger fires the dispatch the instant an ad row
-- is inserted, so a freshly posted ad gets its /ad/<slug>.html page in ~2 min
-- (GitHub Actions run + Pages deploy) instead of waiting up to 2 hours.
--
-- PREREQUISITES
--   1. A GitHub Personal Access Token (classic) with `repo` scope, stored in
--      the `yaadadz_config` table under key `gh_pat` (see step 3).
--   2. pg_net extension enabled (Supabase Dashboard → Database → Extensions).
--
-- SETUP (one-time)
--   1. In Supabase SQL Editor, create a config table to hold the PAT:
--        CREATE TABLE IF NOT EXISTS public.yaadadz_config (
--          key text PRIMARY KEY,
--          value text NOT NULL
--        );
--   2. Insert your PAT (replace ghp_xxx):
--        INSERT INTO public.yaadadz_config(key,value)
--        VALUES ('gh_pat','ghp_YOUR_PERSONAL_ACCESS_TOKEN')
--        ON CONFLICT (key) DO UPDATE SET value = excluded.value;
--   3. Run THIS file (the trigger + function below).
--
-- The function reads the PAT from the config table on every insert, so you can
-- rotate the token without editing this migration.
-- ─────────────────────────────────────────────────────────────────────────

-- Config table (safe to re-run)
CREATE TABLE IF NOT EXISTS public.yaadadz_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Function: fire a repository_dispatch('new-ad-posted') on each new ad
CREATE OR REPLACE FUNCTION public.trigger_new_ad_page_regen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
declare
  pat      text;
  repo     text := 'kerrtheinfluencer/yaadads';   -- <-- change if repo moves
  gh_url   text;
  resp     bigint;
begin
  -- Look up the PAT; if missing/empty, silently skip (cron safety-net still runs)
  select value into pat from public.yaadadz_config where key = 'gh_pat';
  if pat is null or pat = '' or pat = 'ghp_YOUR_PERSONAL_ACCESS_TOKEN' then
    return new;
  end if;

  gh_url := 'https://api.github.com/repos/' || repo || '/dispatches';

  -- pg_net.http_post is async (returns immediately); perfect for a trigger
  begin
    resp := net.http_post(
      url := gh_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || pat,
        'Accept',        'application/vnd.github+json',
        'Content-Type',  'application/json',
        'User-Agent',    'yaadadz-supabase-trigger'
      ),
      body := jsonb_build_object(
        'event_type',      'new-ad-posted',
        'client_payload',  jsonb_build_object('ad_id', new.id, 'title', new.title)
      )
    );
  exception when others then
    -- Never let a GitHub hiccup break the INSERT. Log and move on.
    raise notice 'yaadadz: new-ad dispatch failed (%)', sqlerrm;
  end;

  return new;
end;
$$;

-- Trigger: fire after every ad INSERT
DROP TRIGGER IF EXISTS trg_new_ad_page_regen ON public.ads;
CREATE TRIGGER trg_new_ad_page_regen
  AFTER INSERT ON public.ads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_new_ad_page_regen();
