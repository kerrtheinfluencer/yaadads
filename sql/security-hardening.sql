-- ═══════════════════════════════════════════════════════════════════
-- Yaad Adz — security hardening (idempotent, safe to re-run)
-- Run in Supabase → SQL Editor. READ THE NOTES FIRST, then run section by section.
--
-- The anon key in the site's JS is public by design. Row Level Security (RLS)
-- is the ONLY thing protecting your data. Step 0 shows what is currently allowed.
-- ═══════════════════════════════════════════════════════════════════

-- ── STEP 0: AUDIT (read-only). Look for policies where roles include anon/public
--    with cmd = UPDATE / DELETE / ALL, or with qual = 'true'. Those are the holes.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by tablename, cmd, policyname;

-- Tables with RLS switched OFF (should be none for user data):
select n.nspname, c.relname, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- ── STEP 1: make sure RLS is on for the core tables ───────────────
do $$
declare t text;
begin
  foreach t in array array['ads','messages','profiles','users'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ── STEP 2: id hygiene — stops hostile ids (quotes, tags, slashes) ever being stored.
--    NOT VALID = applies to new/changed rows without failing on old rows.
--    After cleaning any bad rows, run:  alter table public.ads validate constraint ads_id_safe;
do $$
begin
  if to_regclass('public.ads') is not null then
    if not exists (select 1 from pg_constraint where conname = 'ads_id_safe') then
      alter table public.ads add constraint ads_id_safe
        check (id::text ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='ads' and column_name='seller_id')
       and not exists (select 1 from pg_constraint where conname = 'ads_seller_id_safe') then
      alter table public.ads add constraint ads_seller_id_safe
        check (seller_id is null or seller_id::text ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
    end if;
  end if;
end $$;

-- Find existing rows that would fail (review/clean before VALIDATE):
select id, seller_id from public.ads
where id::text !~ '^[A-Za-z0-9_-]{1,64}$'
   or (seller_id is not null and seller_id::text !~ '^[A-Za-z0-9_-]{1,64}$');

-- ── STEP 3: PROFILES — email/phone must not be readable by everyone ──
-- ⚠ Before this: the site reads public profile fields (name, parish, joined, member count).
--   This creates a public view with ONLY safe columns and locks the base table to its owner.
--   Adjust the column list to match your table (check:  \d public.profiles).
do $$
begin
  if to_regclass('public.profiles') is not null then
    -- drop broad read policies (names vary; the audit above shows yours)
    execute 'drop policy if exists "profiles_select_all" on public.profiles';
    execute 'drop policy if exists "Public profiles are viewable by everyone." on public.profiles';
    execute 'drop policy if exists "anon read profiles" on public.profiles';
    execute 'drop policy if exists "Enable read access for all users" on public.profiles';

    execute 'drop policy if exists "profiles_select_own" on public.profiles';
    execute 'create policy "profiles_select_own" on public.profiles
             for select to authenticated using (auth.uid()::text = id::text)';
  end if;
end $$;
-- Public-safe view (edit columns to what actually exists and is safe to show):
-- create or replace view public.public_profiles with (security_invoker = false) as
--   select id, name, parish, created_at from public.profiles;
-- grant select on public.public_profiles to anon, authenticated;
-- Then point the site's public profile/member-count reads at public_profiles.

-- ── STEP 4: ADS — anyone may READ live ads; only the owner may change/delete ──
-- ⚠ The site currently bumps view counts with an anon PATCH. Removing anon UPDATE
--   stops that, so add the RPC below first and switch the client to call it.
create or replace function public.bump_ad_views(p_id text)
returns void language sql security definer set search_path = public as $$
  update public.ads set views = coalesce(views, 0) + 1
  where id::text = p_id and p_id ~ '^[A-Za-z0-9_-]{1,64}$';
$$;
grant execute on function public.bump_ad_views(text) to anon, authenticated;

do $$
declare r record;
begin
  if to_regclass('public.ads') is not null then
    for r in select policyname from pg_policies
             where schemaname='public' and tablename='ads'
               and cmd in ('UPDATE','DELETE','ALL')
               and ('anon' = any(roles) or 'public' = any(roles))
    loop
      execute format('drop policy %I on public.ads', r.policyname);
    end loop;
  end if;
end $$;
-- Owner-only write policies (adjust seller_id match to how your auth maps users):
-- create policy "ads_update_owner" on public.ads for update to authenticated
--   using (seller_id::text = auth.uid()::text) with check (seller_id::text = auth.uid()::text);
-- create policy "ads_delete_owner" on public.ads for delete to authenticated
--   using (seller_id::text = auth.uid()::text);

-- ── STEP 5: MESSAGES — only sender/recipient may read or write ────
-- Drop any anon/public policies; recreate participant-only ones matching your columns.
do $$
declare r record;
begin
  if to_regclass('public.messages') is not null then
    for r in select policyname from pg_policies
             where schemaname='public' and tablename='messages'
               and ('anon' = any(roles) or 'public' = any(roles))
    loop
      execute format('drop policy %I on public.messages', r.policyname);
    end loop;
  end if;
end $$;
-- create policy "messages_participants_read" on public.messages for select to authenticated
--   using (auth.uid()::text in (sender_id::text, recipient_id::text));
-- create policy "messages_send" on public.messages for insert to authenticated
--   with check (auth.uid()::text = sender_id::text);

-- ── STEP 6: STORAGE — anon may read images, but not write/delete ──
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname='storage' and tablename='objects'
             and cmd in ('INSERT','UPDATE','DELETE','ALL')
             and ('anon' = any(roles) or 'public' = any(roles))
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;
-- Authenticated users upload into their own folder only:
-- create policy "uploads_own_folder" on storage.objects for insert to authenticated
--   with check (bucket_id = 'ad-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── STEP 7: re-run the audit query from STEP 0 and confirm no anon write policies remain.

-- ═══ NOTES ═══
-- • The admin panel gate is client-side (SHA-256 check in js/admin.js). Anyone can bypass
--   it from the browser console, so admin actions must be enforced by RLS/RPCs that check a
--   real admin role (e.g. a row in an `admins` table checked via auth.uid()), never by the page.
-- • Steps 3–6 end with commented policies: the site's exact column names/auth model decide
--   them. Uncomment after checking the audit output, and test sign-in, posting, messaging
--   and viewing an ad in a private window.
