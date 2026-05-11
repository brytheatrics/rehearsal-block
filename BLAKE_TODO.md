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

- [ ] **Add CORS rules to the R2 bucket** (for direct-from-browser
      uploads in the Task Schedule Uploads panel)
      How: Cloudflare dashboard → R2 → your bucket → Settings → CORS
      policy. Paste in:
      ```json
      [
        {
          "AllowedOrigins": ["https://rehearsalblock.com", "https://www.rehearsalblock.com", "http://localhost:5173", "http://localhost:50135"],
          "AllowedMethods": ["PUT", "GET"],
          "AllowedHeaders": ["Content-Type"],
          "ExposeHeaders": ["ETag"],
          "MaxAgeSeconds": 3600
        }
      ]
      ```
      Replace the origins list with whatever domains the editor
      actually runs on (production + your dev port). Without this,
      browser uploads larger than 6 MB hit a CORS error.

- [ ] **Run the advisor-fix migration**
      File: `packages/standalone/supabase/migrations/006_advisor_fixes.sql`
      How: same flow - SQL editor → paste → run.
      What it does: clears the 3 critical security warnings on the
      Supabase dashboard.
        - Drops the unused `users_paid_status` view (was created
          manually in the dashboard, not referenced by any app code,
          and the advisor flagged it for exposing auth.users).
        - Recreates `beta_status` with `security_invoker = true` and
          adds a column-level grant + singleton RLS policy on
          `beta_config` so the BetaBanner and beta gating still work
          but `beta_code` stays unreadable from the public role.
      After running, the advisor warnings should clear within a
      minute or so.

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

## Known design nuance (worth understanding, not a bug)

The editor and the carpenter share view track "done" state in two
different places, and they don't auto-merge:

- **Editor** mutates `task.done` directly on the doc (saved to R2).
- **Carpenter share view** writes to the `task_checks` table and
  overlays it on top of the doc when rendering.

What this means in practice:

- If you check a task off in the editor, the carpenters see it as
  done in the share link (since their view falls back to the doc's
  `done` when there's no `task_checks` row).
- If a carpenter checks a task off, your editor does NOT see it -
  the doc's `done` is unchanged.
- To see what carpenters have checked off, open the share URL in
  another tab. That's currently the source of truth for their
  activity.

This is a deliberate split (carpenter writes shouldn't fight the
editor's auto-save loop), but if it becomes annoying we can add a
"Sync from share" button in the editor that fetches `task_checks`
and applies them to the doc.
