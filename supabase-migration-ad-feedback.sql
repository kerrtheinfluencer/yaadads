-- Run once in the Supabase SQL Editor before enabling live posting.
-- Uses existing public.ads (text id) and Supabase Auth; no legacy ratings are imported.
begin;
create table if not exists public.ad_feedback (
  id uuid primary key default gen_random_uuid(),
  ad_id text not null references public.ads(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Buyer',
  kind text not null check (kind in ('comment', 'review')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  rating smallint,
  created_at timestamptz not null default now(),
  constraint ad_feedback_rating check (
    (kind = 'comment' and rating is null) or
    (kind = 'review' and rating is not null and rating between 1 and 5)
  )
);
create unique index if not exists ad_feedback_one_review
  on public.ad_feedback(ad_id, author_id) where kind = 'review';
create index if not exists ad_feedback_listing_date
  on public.ad_feedback(ad_id, created_at desc, id desc);
create index if not exists ad_feedback_author_date
  on public.ad_feedback(author_id, created_at desc);
alter table public.ad_feedback enable row level security;
revoke all on public.ad_feedback from anon, authenticated;
grant select on public.ad_feedback to anon, authenticated;
grant insert, delete on public.ad_feedback to authenticated;

create policy "Read feedback on visible listings" on public.ad_feedback
  for select to anon, authenticated using (exists (
    select 1 from public.ads a where a.id = ad_id
    and (a.status in ('active', 'sold') or a.status is null)
  ));
create policy "Members post their own feedback" on public.ad_feedback
  for insert to authenticated with check (author_id = (select auth.uid()) and exists (
    select 1 from public.ads a where a.id = ad_id
    and (a.status in ('active', 'sold') or a.status is null)
    and (kind = 'comment' or a.seller_id::text is distinct from (select auth.uid())::text)
  ));
create policy "Members delete their own feedback" on public.ad_feedback
  for delete to authenticated using (author_id = (select auth.uid()));

-- Author, timestamp and rate limits are enforced on the server, never trusted from a form.
create or replace function public.prepare_ad_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    raise exception 'Sign in to post.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.ad_feedback where author_id = auth.uid()
    and created_at > now() - interval '30 seconds') then
    raise exception 'Please wait 30 seconds between posts.';
  end if;
  if (select count(*) from public.ad_feedback where author_id = auth.uid()
    and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Daily posting limit reached. Please try tomorrow.';
  end if;
  select coalesce(nullif(left(btrim(raw_user_meta_data->>'name'), 80), ''),
    nullif(left(btrim(raw_user_meta_data->>'full_name'), 80), ''), 'Buyer')
    into new.author_name from auth.users where id = auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end;
$$;
revoke all on function public.prepare_ad_feedback() from public;
create trigger prepare_ad_feedback before insert on public.ad_feedback
  for each row execute function public.prepare_ad_feedback();

create table if not exists public.ad_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.ad_feedback(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'misleading')),
  created_at timestamptz not null default now(),
  unique(feedback_id, reporter_id)
);
alter table public.ad_feedback_reports enable row level security;
revoke all on public.ad_feedback_reports from anon, authenticated;
grant insert on public.ad_feedback_reports to authenticated;
create policy "Members report visible feedback" on public.ad_feedback_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and exists (
    select 1 from public.ad_feedback f where f.id = feedback_id
  ));
commit;
-- Moderation: review ad_feedback_reports in the dashboard and remove abusive feedback.
-- No reports, emails or private profile fields are publicly readable.
