-- Migration 003: profiles table (create + trigger + backfill)
--
-- The JWT custom access token hook in 001_init.sql references
-- public.profiles, and the Stripe webhook writes to it, but the table
-- itself was never created in a migration. It was created manually in
-- the Supabase dashboard at some point, which means:
--   (a) it isn't reproducible on a fresh project
--   (b) new signups weren't getting a row, so the webhook's UPDATE
--       would affect 0 rows silently and has_paid never flipped
--
-- This migration is idempotent: IF NOT EXISTS on every object so it
-- can be run safely against an environment that already has a
-- manually-created profiles table.

-- 1. profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  has_paid boolean not null default false,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. RLS: users can read their own profile row; only service-role writes
alter table public.profiles enable row level security;

drop policy if exists "User can select own profile" on public.profiles;
create policy "User can select own profile"
  on public.profiles for select
  using (id = auth.uid());

-- Intentionally no INSERT / UPDATE / DELETE policies for non-service
-- callers. The trigger below inserts via SECURITY DEFINER; the webhook
-- and /buy/success use the service-role client which bypasses RLS.

-- 3. Auto-insert on signup: every new auth.users row gets a profiles
-- row with has_paid = false. Without this, webhooks silently miss.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill: create a profiles row for every existing auth.users
-- entry that doesn't already have one. One-time catch-up so the
-- trigger + webhook pipeline works for everyone going forward.
insert into public.profiles (id)
select u.id from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 5. Keep updated_at fresh on writes
create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();
