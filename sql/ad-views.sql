-- ═══════════════════════════════════════════════════════════════════
-- Yaad Adz — ad view counter (idempotent, safe to re-run)
-- Run once in Supabase → SQL Editor. This is all that's needed to make
-- view counts work even after anonymous UPDATE on `ads` is removed.
-- ═══════════════════════════════════════════════════════════════════

-- Used by the site and all generated ad pages (preferred)
create or replace function public.bump_ad_views(p_id text)
returns void language sql security definer set search_path = public as $$
  update public.ads set views = coalesce(views, 0) + 1
  where id::text = p_id and p_id ~ '^[A-Za-z0-9_-]{1,64}$';
$$;
grant execute on function public.bump_ad_views(text) to anon, authenticated;

-- Older name some cached pages still call
create or replace function public.increment_view(ad_id text)
returns void language sql security definer set search_path = public as $$
  update public.ads set views = coalesce(views, 0) + 1
  where id::text = ad_id and ad_id ~ '^[A-Za-z0-9_-]{1,64}$';
$$;
grant execute on function public.increment_view(text) to anon, authenticated;

-- Check: both functions should be listed
select proname, pg_get_function_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('bump_ad_views', 'increment_view');
