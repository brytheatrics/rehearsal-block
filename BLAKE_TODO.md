# Blake's pre-push checklist for Task Schedule

These steps need a human to run them. Listed in the order they need to happen.

## Before pushing to deploy

- [ ] **Run the `task_checks` Supabase migration**
      File: `packages/standalone/supabase/migrations/005_task_checks.sql`
      How: open the Supabase dashboard → SQL editor → paste the file → run.
      What it does: creates the `task_checks` table that holds carpenter
      check-state for shared task schedules. Public RLS policy lets the
      `/api/task-check` endpoint upsert rows keyed by share token.
      Why it has to run before deploying: the carpenter share view's
      first toggle will throw if the table doesn't exist.

## Things to test on real hardware after push

- [ ] **Carpenter share flow on a phone**
      Open one of your build schedules → publish → copy link → open in
      a phone browser (incognito so localStorage is clean) → confirm
      the name prompt appears on first interaction → tap a checkbox →
      confirm it shows up on your editor within 15 seconds.

- [ ] **Print test on the build schedule**
      Print a month or two from the calendar view in task mode →
      confirm checkboxes print empty + readable, no assignee chip
      cruft, holiday badges legible.

## Optional later

- [ ] Seed Frank, Mike, etc. (your shop team) as cast members on a
      task schedule via the gear → Defaults → Cast tab so the
      assignee picker has real names to pick from.
