-- ═══════════════════════════════════════════════════════════════════════════
-- WATER ADVISORIES — NWC outage/disruption tracker
-- Adds to the existing Yaad Adz Supabase project (cquwshpsfybvgqodbxsf).
-- Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists water_advisories (
  id            bigint generated always as identity primary key,
  -- Stable fingerprint of the source text, used to dedupe re-scrapes and to
  -- detect when an advisory has disappeared from NWC's page (= resolved).
  fingerprint   text unique not null,

  parish        text,                 -- one of the 14 parishes, or null if unmatched
  title         text not null,        -- raw advisory headline as published by NWC
  cause         text default 'other', -- 'power' | 'quality' | 'pipeline' | 'mechanical' | 'maintenance' | 'other'
  status        text default 'current', -- 'current' | 'planned'

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,          -- set when the scraper stops seeing this advisory
  is_active     boolean not null default true,

  source_url    text default 'https://nwcjamaica.com/advisories.php'
);

create index if not exists water_advisories_active_idx
  on water_advisories (is_active, parish);

create index if not exists water_advisories_parish_idx
  on water_advisories (parish);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Read-only to everyone (anon key on the public page). Writes only via the
-- service_role key, which the GitHub Actions scraper uses directly — no
-- write policy is needed for anon/authenticated, so none is granted.

alter table water_advisories enable row level security;

drop policy if exists "Anyone can view water advisories" on water_advisories;
create policy "Anyone can view water advisories"
  on water_advisories for select
  using (true);

-- No insert/update/delete policy for anon or authenticated — the scraper
-- writes with the service_role key, which bypasses RLS entirely. This is
-- intentionally the opposite shape of the old "Anon can update ads (legacy)"
-- policies — do not add a permissive anon write policy here.
