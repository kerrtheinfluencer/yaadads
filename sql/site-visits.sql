-- Yaad Adz — daily visit counter (home + gas pages). Run once in Supabase → SQL Editor.
-- Safe to re-run. Leaves the older increment_site_visit() function alone; the site tries this one first.

create table if not exists public.site_visit_days (
  page  text    not null,
  day   date    not null,
  count integer not null default 0,
  primary key (page, day)
);

alter table public.site_visit_days enable row level security;
-- no direct table policies on purpose: the site only talks to the function below.

create or replace function public.site_visit_count(p_page text, p_count boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'America/Jamaica')::date;
  pg text := left(coalesce(nullif(trim(p_page), ''), 'home'), 24);
  n integer;
begin
  if p_count then
    insert into public.site_visit_days (page, day, count) values (pg, d, 1)
    on conflict (page, day) do update set count = public.site_visit_days.count + 1
    returning count into n;
  else
    select count into n from public.site_visit_days where page = pg and day = d;
  end if;
  return coalesce(n, 0);
end;
$$;

grant execute on function public.site_visit_count(text, boolean) to anon, authenticated;
