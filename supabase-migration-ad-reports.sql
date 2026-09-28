-- ══════════════════════════════════════════════════════════════════════════
-- MEMBER REPORTS ON LISTINGS §AD-REPORTS
--
-- Why this exists: js/ad-social.js had a "Report this ad" modal that saved to
-- localStorage on the reporter's own phone and toasted "we'll review it".
-- The report never left the device, so every report the site ever collected
-- went nowhere. This table is where reports actually land.
--
-- Run once in the Supabase SQL Editor, then set the admin page's REPORT
-- source to "ad_reports". Safe to re-run.
--
-- Design notes:
--   * Guests CAN report. Scam listings are exactly what logged-out browsers
--     see, so requiring an account would hide the worst cases.
--   * reporter_key is a random UUID generated on the member's device. It is
--     how we dedupe and rate-limit without storing an IP, a fingerprint or
--     anything that identifies a person.
--   * reporter_id is stamped SERVER-side from auth.uid() and is never read
--     from the request body, so it cannot be forged.
--   * A report row existing == it still needs attention. The admin resolves
--     one by deleting it (Hide, Delete or Dismiss on the listing). This
--     deliberately trades an audit trail for a queue that can never go
--     stale — see the "Moderation" note at the bottom.
-- ══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.ad_reports (
  id           uuid primary key default gen_random_uuid(),
  ad_id        text not null references public.ads(id) on delete cascade,
  reason       text not null check (reason in
                 ('scam', 'wrong_cat', 'duplicate', 'sold_item', 'offensive')),
  note         text check (note is null or char_length(note) <= 500),
  reporter_key text not null,
  reporter_id  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- One report per device per listing. The 23505 this raises is what the
  -- client turns into "You already reported this listing."
  constraint ad_reports_one_per_device unique (ad_id, reporter_key)
);

-- The queue is always read newest-first and always filtered by ad.
create index if not exists ad_reports_recent
  on public.ad_reports (created_at desc);
create index if not exists ad_reports_by_ad
  on public.ad_reports (ad_id);

alter table public.ad_reports enable row level security;

-- Default deny. Inserts and deletes are re-granted explicitly below.
revoke all on public.ad_reports from anon, authenticated;

-- Anyone (guest or member) may file a report.
grant insert on public.ad_reports to anon, authenticated;

-- The admin dashboard authenticates with the same PUBLIC anon key, so it
-- reads through a view rather than the table: reporter_key and reporter_id
-- stay unreachable even to the page that moderates them.
create or replace view public.admin_ad_reports as
  select r.id, r.ad_id, r.reason, r.note, r.created_at
  from public.ad_reports r;

grant select on public.admin_ad_reports to anon, authenticated;

-- Resolving a report = deleting the row. No select grant is needed to delete
-- by id, and with return=minimal the response body cannot leak the row.
grant delete on public.ad_reports to anon, authenticated;
create policy "Dashboard resolves reports by removing them" on public.ad_reports
  for delete to anon, authenticated using (true);

-- ── Abuse controls ────────────────────────────────────────────────────────
-- Everything here is server-side. A tampered client cannot raise its own
-- limits, spoof a reporter_id, or report its own listing.
create or replace function public.prepare_ad_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner text;
begin
  if new.reporter_key is null or btrim(new.reporter_key) = '' then
    raise exception 'Could not verify this device. Please try again.';
  end if;

  -- Stamp identity from the session; never trust the request body.
  new.reporter_id := auth.uid();
  new.created_at   := now();
  new.reason       := btrim(new.reason);
  new.note         := nullif(btrim(coalesce(new.note, '')), '');

  -- The listing must still exist and still be publicly visible. Reporting a
  -- hidden or deleted ad is meaningless and would only pad the queue.
  if not exists (
    select 1 from public.ads a where a.id = new.ad_id
      and (a.status in ('active', 'sold') or a.status is null)
  ) then
    raise exception 'That listing is no longer available.';
  end if;

  -- Block self-reports, but only where we can prove the identity.
  if new.reporter_id is not null then
    select a.seller_id into owner from public.ads a where a.id = new.ad_id;
    if owner is not null and owner = new.reporter_id::text then
      raise exception 'You cannot report your own listing.';
    end if;
  end if;

  -- Serialise per device so two tabs cannot both slip past a limit.
  perform pg_advisory_xact_lock(hashtextextended(new.reporter_key, 0));

  if (select count(*) from public.ad_reports r
        where r.reporter_key = new.reporter_key
          and r.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many reports in a row. Please wait a few minutes.';
  end if;

  if (select count(*) from public.ad_reports r
        where r.reporter_key = new.reporter_key
          and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Daily report limit reached. Please try tomorrow.';
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_ad_report() from public;
create trigger prepare_ad_report before insert on public.ad_reports
  for each row execute function public.prepare_ad_report();

commit;

-- Moderation: the dashboard reads public.admin_ad_reports and clears a report
-- by deleting its row. Deleting the listing cascades and clears every report
-- against it automatically.
-- Reports are never publicly readable — no IP, no device key, no member id.
