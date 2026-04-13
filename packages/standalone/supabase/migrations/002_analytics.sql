-- Migration 002: Analytics tables for cookieless page tracking.
-- Public routes only - /app/** is never tracked.

-- page_views: individual page hits with daily-rotating visitor hash
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  path text not null,
  referrer text,
  created_at timestamptz not null default now()
);

-- Index for date-range queries and path aggregation
create index if not exists idx_page_views_created
  on public.page_views (created_at desc);

create index if not exists idx_page_views_path
  on public.page_views (path, created_at desc);

-- demo_sessions: one row per demo visit with duration + interaction count
create table if not exists public.demo_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_hash text not null,
  duration_seconds int not null default 0,
  interaction_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_sessions_created
  on public.demo_sessions (created_at desc);

-- No RLS on analytics tables - only the service role writes/reads them.
-- The API endpoints use supabaseAdmin (service role), not the user's client.
