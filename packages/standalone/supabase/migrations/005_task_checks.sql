-- Migration 005: task_checks (Task Schedule carpenter check-state)
--
-- Holds the carpenter-driven check state for shared task schedules.
-- Tasks themselves live in the doc on R2 (immutable from the share
-- view's perspective); carpenters only mutate `done` here, keyed by
-- (share_id, task_id).
--
-- The share_id is the same 8-char id `/api/share` returns. Possessing
-- it IS the auth - the share URL is the credential. Anyone with the
-- link can read and write checks. Privacy posture is documented for
-- Blake: if the link leaks, someone could mark tasks done that
-- weren't, but no other data exposure since the doc is gzipped + R2
-- already authorizes by the same id.
--
-- Idempotent: safe to re-run.

-- 1. The check rows table.
create table if not exists public.task_checks (
  share_id text not null,
  task_id text not null,
  done boolean not null default false,
  done_by text, -- null when toggled from the editor; carpenter name from localStorage on the share view
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (share_id, task_id)
);

-- 2. updated_at auto-touch on UPDATE.
create or replace function public.task_checks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists task_checks_touch_updated_at on public.task_checks;
create trigger task_checks_touch_updated_at
  before update on public.task_checks
  for each row execute function public.task_checks_set_updated_at();

-- 3. RLS: anyone with the share token can read and write. The token
-- is the credential; downstream API endpoints verify it points at a
-- real R2 share blob before letting writes through, so RLS just
-- opens the door for the public endpoints to pass.
alter table public.task_checks enable row level security;

drop policy if exists "anon read task_checks" on public.task_checks;
create policy "anon read task_checks"
  on public.task_checks
  for select
  using (true);

drop policy if exists "anon insert task_checks" on public.task_checks;
create policy "anon insert task_checks"
  on public.task_checks
  for insert
  with check (true);

drop policy if exists "anon update task_checks" on public.task_checks;
create policy "anon update task_checks"
  on public.task_checks
  for update
  using (true)
  with check (true);

-- 4. Index for the "fetch all checks for this share" hot path.
create index if not exists task_checks_share_id_idx
  on public.task_checks (share_id);
