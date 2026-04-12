-- Migration 001: initial paid-version schema
-- Applied manually via Supabase SQL Editor on 2026-04-11.
-- This file is the canonical record of what was run.

-- shows_index: metadata-only table for the paid version.
-- Document bytes live in Cloudflare R2, not in this table.
create table if not exists public.shows_index (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  name text not null default 'Untitled Show',
  start_date date,
  end_date date,
  cast_count int not null default 0,
  document_hash text,
  document_size_bytes int,
  doc_version text,
  last_saved_at timestamptz,
  last_published_at timestamptz,
  share_id text unique,
  conflict_share_token text unique,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: only the owner can see/modify their own shows
alter table public.shows_index enable row level security;

create policy "Owner can select own shows"
  on public.shows_index for select
  using (auth.uid() = owner_id);

create policy "Owner can insert own shows"
  on public.shows_index for insert
  with check (auth.uid() = owner_id);

create policy "Owner can update own shows"
  on public.shows_index for update
  using (auth.uid() = owner_id);

create policy "Owner can delete own shows"
  on public.shows_index for delete
  using (auth.uid() = owner_id);

-- Index for the show list query (sorted by most recently updated)
create index if not exists idx_shows_owner_updated
  on public.shows_index (owner_id, updated_at desc);


-- show_activity: audit log for refund eligibility + admin stats.
create table if not exists public.show_activity (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows_index(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

-- RLS: users can read their own activity rows
alter table public.show_activity enable row level security;

create policy "User can read own activity"
  on public.show_activity for select
  using (auth.uid() = user_id);

-- Only server-side (service role) can insert activity rows.
-- No insert policy for authenticated users - the API endpoint
-- uses the service role key to write activity.

-- Index for refund eligibility check
create index if not exists idx_activity_user_action
  on public.show_activity (user_id, action, created_at desc);


-- JWT custom access token hook: embeds has_paid from profiles into
-- the JWT app_metadata so hooks.server.ts can read it without a
-- per-request profile query.
-- Enabled in Supabase dashboard: Authentication > Hooks >
-- Customize Access Token (JWT) Claims > public.custom_access_token_hook
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  claims jsonb;
  user_has_paid boolean;
begin
  select coalesce(has_paid, false) into user_has_paid
  from public.profiles
  where id = (event->>'user_id')::uuid;

  claims := event->'claims';

  if claims->'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}');
  end if;

  claims := jsonb_set(
    claims,
    '{app_metadata, has_paid}',
    to_jsonb(coalesce(user_has_paid, false))
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook(jsonb)
  from public;
