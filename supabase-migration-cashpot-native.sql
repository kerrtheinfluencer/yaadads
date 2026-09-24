-- ═══════════════════════════════════════════════════════════════════════════
-- CASH POT RESULTS — native to Yaad Adz's own Supabase project
-- (cquwshpsfybvgqodbxsf.supabase.co). Does NOT depend on the separate
-- CashPotJA app or its Supabase project in any way — this is a fresh,
-- self-contained table Yaad Adz owns and scrapes independently.
-- Run once in the Yaad Adz Supabase project's SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists cashpot_results (
  id          bigint generated always as identity primary key,
  draw_date   date not null,
  slot        smallint not null,        -- 0=Early Bird, 1=Morning, 2=Midday, 3=Mid-Aft, 4=Drive Time, 5=Evening
  number      smallint not null check (number between 1 and 36),
  is_mega     boolean default false,
  is_monsta   boolean default false,
  verified    boolean not null default false,
  scraped_at  timestamptz not null default now(),
  source      text default 'cashpotresults.info',

  unique (draw_date, slot)
);

create index if not exists cashpot_results_date_idx on cashpot_results (draw_date desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Public read (the banner needs anon SELECT). No anon write — only the
-- GitHub Actions scraper writes, using the service_role key, which
-- bypasses RLS entirely. No anon/authenticated write policy is granted.

alter table cashpot_results enable row level security;

drop policy if exists "Anyone can view cashpot results" on cashpot_results;
create policy "Anyone can view cashpot results"
  on cashpot_results for select
  using (true);
