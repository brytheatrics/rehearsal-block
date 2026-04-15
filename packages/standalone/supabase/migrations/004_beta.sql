-- Migration 004: beta access
--
-- Adds the infrastructure for an invite-code beta. Kept out of the earlier
-- migrations so the paid-version rollout doesn't carry unused columns in
-- production for weeks before the beta session actually runs.
--
-- Schema changes:
--   1. profiles.has_beta_access - per-user flag, flipped by
--      /api/beta/activate when a tester enters the shared code.
--   2. beta_config - single-row table holding the current code +
--      an active toggle Blake can flip to end the beta.
--   3. beta_feedback - in-app feedback submissions from beta users.
--
-- Idempotent: safe to re-run against an environment that already has
-- any subset of these objects (IF NOT EXISTS everywhere).

-- 1. profiles.has_beta_access
alter table public.profiles
  add column if not exists has_beta_access boolean not null default false;

-- 2. beta_config (single-row, id = 1)
create table if not exists public.beta_config (
  id int primary key default 1,
  beta_code text not null,
  display_expiration_date date,
  beta_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint beta_config_singleton check (id = 1)
);

-- RLS: no public access to the raw table (beta_code would leak).
-- The activate endpoint and the /beta page load use the service-role
-- client on the server to read what they need.
alter table public.beta_config enable row level security;

-- Public view for banner + /beta page: exposes only is_active and
-- the display expiration date, never the code.
create or replace view public.beta_status as
  select
    beta_active as is_active,
    display_expiration_date
  from public.beta_config
  where id = 1;

grant select on public.beta_status to anon, authenticated;

-- 3. beta_feedback
create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int,
  body text not null,
  created_at timestamptz not null default now(),
  user_agent text,
  constraint beta_feedback_rating_range check (rating is null or (rating >= 1 and rating <= 5))
);

alter table public.beta_feedback enable row level security;

-- Users can insert their own feedback, read their own submissions back.
drop policy if exists "Users can insert own feedback" on public.beta_feedback;
create policy "Users can insert own feedback"
  on public.beta_feedback for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can read own feedback" on public.beta_feedback;
create policy "Users can read own feedback"
  on public.beta_feedback for select
  using (user_id = auth.uid());

-- Touch-up trigger to keep updated_at fresh on beta_config.
create or replace function public.beta_config_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists beta_config_touch_updated_at on public.beta_config;
create trigger beta_config_touch_updated_at
  before update on public.beta_config
  for each row execute function public.beta_config_touch_updated_at();

-- 4. Seed a default row so the activate endpoint has something to
-- compare against in a fresh environment. Blake updates the code
-- from the dashboard before inviting testers. beta_active = false
-- so nobody accidentally gets access in a mis-seeded environment.
insert into public.beta_config (id, beta_code, beta_active)
values (1, 'CHANGE-ME-BEFORE-BETA', false)
on conflict (id) do nothing;
