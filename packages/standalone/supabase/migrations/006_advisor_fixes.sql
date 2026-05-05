-- Migration 006: Supabase advisor fixes
--
-- The Supabase dashboard's security advisor flagged three CRITICAL
-- issues against the live project that this migration addresses:
--
--   1. "Exposed Auth Users" on public.users_paid_status - the view
--      may expose auth.users data to anon/authenticated roles.
--   2. SECURITY DEFINER on public.beta_status.
--   3. SECURITY DEFINER on public.users_paid_status.
--
-- users_paid_status was created manually in the Supabase dashboard
-- (no migration file) and is not referenced by any application code
-- (verified via grep on the repo). Drop it.
--
-- beta_status IS load-bearing (the BetaBanner, hooks.server.ts gate,
-- /app/+layout.server.ts and /beta page-server load all read from it).
-- Postgres views default to running as the owner (effectively
-- SECURITY DEFINER) which is what the advisor is flagging. The PG 15
-- `security_invoker = true` reloption flips that so the view runs as
-- the caller and the caller's RLS applies.
--
-- Switching to security_invoker means anon needs explicit privileges
-- to read the columns beta_status returns - granted at the column
-- level so anon can only see the two non-sensitive columns
-- (is_active, display_expiration_date) and not beta_code.
--
-- Idempotent: safe to re-run.

-- 1. Drop the unused users_paid_status view.
drop view if exists public.users_paid_status;

-- 2. Beta config: column-level select grant + RLS policy so a
-- security_invoker view can pass through to anon callers without
-- exposing beta_code.
drop policy if exists "Public can read singleton beta_config" on public.beta_config;
create policy "Public can read singleton beta_config"
  on public.beta_config
  for select
  to anon, authenticated
  using (id = 1);

grant select (beta_active, display_expiration_date)
  on public.beta_config
  to anon, authenticated;

-- 3. Recreate beta_status as security_invoker. The view's columns
-- and shape are unchanged; only the privilege model shifts.
drop view if exists public.beta_status;
create view public.beta_status
  with (security_invoker = true)
  as
    select
      beta_active as is_active,
      display_expiration_date
    from public.beta_config
    where id = 1;

grant select on public.beta_status to anon, authenticated;
