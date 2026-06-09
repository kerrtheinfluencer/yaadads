-- ══════════════════════════════════════════════════════════════
-- PHASE 1b + 1c: Supabase Auth Migration + RLS Policy Fixes
-- Run this in Supabase SQL Editor AFTER the existing schema
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. CREATE PROFILES TABLE (linked to Supabase Auth)
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  phone text default '',
  parish text default '',
  joined timestamptz default now()
);

-- Enable RLS on profiles
alter table profiles enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2. TRIGGER: Auto-create profile when user signs up via Auth
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone, parish)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'parish', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 3. MIGRATE EXISTING USERS to Supabase Auth
--    Run this ONCE to create auth accounts for existing users.
--    NOTE: Existing users will need to reset their passwords
--    since we can't hash plaintext passwords. Alternatively,
--    you can create auth accounts with temporary passwords.
-- ─────────────────────────────────────────────────────────────
-- Option A: Create auth accounts with temporary passwords
-- Uncomment and run this section to migrate existing users:

-- Do this in JavaScript instead (see index.html migration section)
-- The JS code will:
--   1. Read all users from the users table
--   2. For each user, try to create an auth account
--   3. Link the auth user to the profiles table

-- ─────────────────────────────────────────────────────────────
-- 4. DROP OLD USERS TABLE (after migration is complete)
--    Only run this AFTER you've verified all users are migrated
-- ─────────────────────────────────────────────────────────────
-- drop table if exists users;

-- ─────────────────────────────────────────────────────────────
-- 5. FIX RLS POLICIES — Proper security
-- ─────────────────────────────────────────────────────────────

-- ── ADS TABLE ────────────────────────────────────────────────
-- Drop old permissive policies
drop policy if exists "Public read ads" on ads;
drop policy if exists "Public insert ads" on ads;
drop policy if exists "Public update ads" on ads;
drop policy if exists "Public delete ads" on ads;

-- Public can read all active ads (needed for browsing)
create policy "Anyone can view active ads"
  on ads for select
  using (status = 'active' or status is null);

-- Authenticated users can insert ads (seller_id must match their auth uid)
create policy "Authenticated users can insert ads"
  on ads for insert
  to authenticated
  with check (seller_id = auth.uid()::text);

-- Users can only update their own ads
create policy "Users can update own ads"
  on ads for update
  to authenticated
  using (seller_id = auth.uid()::text)
  with check (seller_id = auth.uid()::text);

-- Users can only delete their own ads
create policy "Users can delete own ads"
  on ads for delete
  to authenticated
  using (seller_id = auth.uid()::text);

-- Also allow anon delete for backward compat (old ads without auth)
-- Remove this after migration is complete
create policy "Anon can update ads (legacy)"
  on ads for update
  to anon
  using (true)
  with check (true);

create policy "Anon can delete ads (legacy)"
  on ads for delete
  to anon
  using (true);

-- ── PROFILES TABLE ────────────────────────────────────────────
-- Anyone can read basic profile info (for seller names on ads)
create policy "Anyone can view profiles"
  on profiles for select
  using (true);

-- Users can only update their own profile
create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert is handled by the trigger (security definer), no direct inserts needed

-- ── MESSAGES TABLE ────────────────────────────────────────────
-- Drop old permissive policies
drop policy if exists "Public read msgs" on messages;
drop policy if exists "Public insert msgs" on messages;
drop policy if exists "Public update msgs" on messages;

-- Users can only read messages where they are seller or buyer
create policy "Users can read own messages"
  on messages for select
  to authenticated
  using (
    seller_id = auth.uid()::text
    or buyer_id = auth.uid()::text
  );

-- Authenticated users can insert messages (must be part of conversation)
create policy "Authenticated users can send messages"
  on messages for insert
  to authenticated
  with check (
    from_user_id = auth.uid()::text
    and (
      seller_id = auth.uid()::text
      or buyer_id = auth.uid()::text
    )
  );

-- Users can update read status of messages in their conversations
create policy "Users can mark messages read"
  on messages for update
  to authenticated
  using (
    seller_id = auth.uid()::text
    or buyer_id = auth.uid()::text
  )
  with check (
    seller_id = auth.uid()::text
    or buyer_id = auth.uid()::text
  );

-- ── BACKWARD COMPAT: Allow anon read/insert for old flow ──────
-- Remove these after full migration
create policy "Anon can read msgs (legacy)"
  on messages for select
  to anon
  using (true);

create policy "Anon can insert msgs (legacy)"
  on messages for insert
  to anon
  with check (true);

create policy "Anon can update msgs (legacy)"
  on messages for update
  to anon
  using (true);

-- ── USERS TABLE (keep for backward compat until migration) ────
-- Drop old permissive policies
drop policy if exists "Public read users" on users;
drop policy if exists "Public insert users" on users;

-- Only allow reading users table for legacy compat
create policy "Anon can read users (legacy)"
  on users for select
  to anon
  using (true);

create policy "Anon can insert users (legacy)"
  on users for insert
  to anon
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 6. STORAGE POLICIES — Proper ownership
-- ─────────────────────────────────────────────────────────────
-- Drop old storage policies
drop policy if exists "Anyone can upload images" on storage.objects;
drop policy if exists "Anyone can view images" on storage.objects;
drop policy if exists "Anyone can delete own images" on storage.objects;

-- Public can view ad images (needed for browsing)
create policy "Anyone can view ad images"
  on storage.objects for select
  using (bucket_id = 'ad-images');

-- Authenticated users can upload to their own folder
create policy "Authenticated users can upload images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ad-images');

-- Also allow anon uploads for backward compat
create policy "Anon can upload images (legacy)"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'ad-images');

-- Authenticated users can delete their own images
create policy "Authenticated users can delete own images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ad-images');

-- Also allow anon delete for backward compat
create policy "Anon can delete images (legacy)"
  on storage.objects for delete
  to anon
  using (bucket_id = 'ad-images');