# Claude Code Instructions for Rehearsal Block

## Project Overview
Rehearsal Block is a web app for theatre directors and stage managers to build rehearsal schedules. The demo at `/demo` is fully functional; the paid version (`/app`) is being built out.

### Key docs (read on demand, not auto-loaded)
- **`PRODUCT_SPEC.md`** - full product specification, architecture, database schema, roadmap
- **`PATTERNS.md`** - implementation patterns and gotchas (read when touching related code - PDF, popovers, chips, mobile, inline editing, font sizes, reactive proxies)
- **`SESSION_HISTORY.md`** - verbose per-session history
- **`C:\Users\blake\.claude\plans\curious-cuddling-butterfly.md`** - the 10-phase paid-version implementation plan. **When starting work on the paid version, read this file first.**

## Local Development

```bash
pnpm --filter @rehearsal-block/standalone dev   # dev server at http://localhost:5173
pnpm -r --parallel check                        # typecheck - must be 0 errors before committing
```

The dev script passes `--host` so the server is reachable on the LAN at `http://<your-ip>:5173/demo` for real-device testing. The demo is at `/demo`.

### When Blake pastes a localhost URL
If Blake pastes a URL like `http://localhost:5173/demo` with little or no other context, he wants to view it himself. Start the dev server via `preview_start` (don't leave it for him to run). Confirm the URL is ready. Do NOT navigate the preview tool there yourself.

### Preview tool
Use `preview_start` with the name `rehearsal-block` - `.claude/launch.json` is configured. For the export modal, use `preview_snapshot` instead of `preview_screenshot` (iframes are flaky in screenshot mode).

### Monorepo
- `packages/core` - shared TypeScript (types, export, schedule, cast, calendar, dates, time). No build step - exports `.ts` source directly.
- `packages/standalone` - SvelteKit app with `adapter-netlify`.

## Git workflow

**Standing permission granted to commit local changes without asking.** Commit at natural breakpoints (feature complete, typecheck passing, before task switch) with clear messages matching the existing repo style. Prefer new commits over amending. Mention what was committed in your response summary so Blake can see it in `git log` if he wants to review.

**Never push without explicit permission.** Pushing triggers a Netlify deploy and uses 15 of 300 monthly deploy credits. Always ask "want me to push these commits?" and wait for approval before `git push`. This is a hard rule - do not override it even if Blake has approved a push earlier in the same session.

## Key Conventions

**Svelte 5 runes only.** `$state()`, `$derived()`, `$effect()`, `$props()`. No stores. Page owns all state.

**No em dashes.** Blake dislikes em dashes (they read as AI-generated). Always use `-` instead - in code, copy, and chat.

**UTC-safe dates.** All ISO date handling goes through `packages/core/src/dates.ts`. Never use raw `new Date()` for date math. `formatUsDateRange(start, end)` truncates redundant first year when both share one.

**Reactive proxy cloning**: `structuredClone()` fails on Svelte 5 reactive proxies - use `JSON.parse(JSON.stringify())`. See PATTERNS.md for why.

**`event.composedPath()` in click handlers**: Svelte 5 can unmount clicked elements before events finish bubbling. Use `composedPath()` instead of `target.closest()` in window-level click handlers and cell double-click handlers. See PATTERNS.md.

**Delayed single-click on cells (250ms)**: double-click cancels the pending single-click to prevent the DayEditor from opening and shifting the grid mid-interaction. Critical for inline editing. See PATTERNS.md before modifying.

**CSS**: all colors + theme tokens in `packages/standalone/src/lib/theme.css`. Plum `#2d1f3d`, teal `#38817D`. Never hardcode colors.

**Mobile breakpoint**: `@media (max-width: 768px)`. See PATTERNS.md for the full mobile architecture.

**Never use `window.confirm()`, `alert()`, or `prompt()`.** The browser-native dialogs look generic and break the visual continuity. All confirmations, warnings, and input prompts go through themed modals. Use the reusable `$lib/components/ConfirmModal.svelte` for yes/no confirmations (danger or primary variants) - match the existing delete-confirm pattern. For anything more complex (forms, multi-option choices) build a themed modal matching the app's styling conventions: plum headings, teal primary buttons, red danger buttons, var(--color-surface) backgrounds, rounded corners via var(--radius-lg), z-index above parent modals if stacked.

## Infrastructure

### Current vendors
- **Netlify Starter ($9/mo, temporary)** with `adapter-netlify`. Will downgrade to Netlify Free once Phase 6 (client-side paged.js PDF) replaces the Puppeteer endpoint. Netlify Free has a 10s function timeout that kills Puppeteer.
- **Supabase Free** - auth (Google OAuth + magic link) + small metadata tables only. Supabase Pro is explicitly NOT in the base business model.
- **Cloudflare R2 Free** - all blob storage (show docs, archives, share/conflict snapshots, backups). 10 GB storage, 1M writes/mo, 10M reads/mo, zero egress.
- **Stripe** - one-time $50 purchase, no subscriptions.
- **Sentry Free** - error monitoring (5k events/mo).

### Deployment cadence (during Starter period)
- Auto-deploys on push to `main`. 15 credits per deploy, 300/month cap.
- **Do not push frequently** - batch changes and only push when Blake asks.
- Once on Free tier, deploy credits become unmetered but function budget (125k/mo) is the new bottleneck.

### Current paid-version wiring state
- **Done**: Supabase auth + OAuth + magic link, `hooks.server.ts` with `/app` route guard, `/buy` Stripe checkout, `/api/stripe-webhook` signature-verified, beta activation flow at `/beta`, R2 + Supabase metadata storage wired (full read/write, idb-keyval-backed local cache, sync layer push-to-cloud), share endpoint at `/api/share` (gzipped ScheduleDoc to R2 keyed by stable 8-char id), conflict-share tokens, contact-sheet PDF generation. Show list, show editor, /app/[showId] route all functional.
- **Missing from the plan**: Phase 6 (client-side paged.js PDF), Phase 7 ops finishing touches (Sentry, pg_dump backup, CF proxy toggle, cost alerts), and the rest of the polish items.

### What's deployed and prerendered
- **6 prerendered static pages**: `/`, `/demo`, `/privacy`, `/terms`, `/contact`, `/help` - zero function invocations per visit, served from Netlify CDN.
- **Hamburger menu on all viewport widths** with Help / Contact / Privacy / Terms links. Desktop shows primary nav (Demo / Sign In / Buy Now) alongside the hamburger; mobile collapses everything into the hamburger.
- **Sign In / Buy Now / Buy Rehearsal Block** buttons open a `ComingSoonModal` with a path to `NotifyLaunchModal` for email signup. NOT disabled spans - real clickable buttons.
- **/help page** has a collapsible TOC sidebar (sticky on desktop, collapsed on mobile), toolbar icon reference with real SVGs, keyboard shortcuts, and key concepts sections.
- **Seamless header-to-hero gradient** on the landing page (transparent header + extended hero glow).
- **Scope shortcut is Shift+O** (for Overview), not Shift+A.

### Demo paywall gating
- `isDeployedDemo = hostname !== "localhost"` gates: Save, editing actor names/characters, adding actors, adding groups, editing group names, changing show title/dates, downloading PDF (preview still works), per-role conflict links, contact sheet downloads.
- localhost dev = full editing allowed (testing)
- Draft banners on `/privacy` and `/terms` use `{#if import.meta.env.DEV}` - visible on localhost, stripped from production builds entirely.
- Once paid version ships, demo stays accessible via the hamburger inside `/app`, with a "Reset demo" button to wipe accumulated edits
- **LEGAL TEXT NOT FINAL**: The /privacy, /terms, and refund policy pages use draft placeholder text from the implementation plan. All legal copy MUST be reviewed and replaced by a lawyer or legal template service (TermsFeed, Termly, etc.) before purchasing is opened to real customers. The EU consumer rights waiver language in particular needs professional legal review.

## Data Model

- `CastMember` - actors with `firstName`, `lastName`, `character`, `color`, etc.
- `CrewMember` - production team with `firstName`, `lastName`, `role`, `color`, etc.
- `Call.calledActorIds` - which actors are called (required)
- `Call.calledCrewIds` - which crew are called (optional, may be undefined on older calls)
- `Call.allCalled` - boolean flag meaning all CAST members (not crew)
- `ScheduleDoc.cast` - array of `CastMember`
- `ScheduleDoc.crew` - array of `CrewMember`
- `ScheduleDoc.version` - schema version field (added with paid version, handle `undefined` as version 1 on read)
- `Settings.crewDisplayMode` - `"name" | "role" | "both"`
- `Settings.showCastConflicts` / `Settings.showCrewConflicts` - grid visibility toggles
- `Settings.defaultEventType` - show-wide default event type for new days (`""` for none)
- `Settings.showHolidays`, `showUsHolidays`, `customHolidays`, `hiddenHolidays` - holiday toggles
- `Settings.allCalledLabel`, `allCalledColor`, `allCalledVisible` - All Called pseudo-group customization
- Conflicts use `actorId` for both cast and crew (shared conflict system)
- Demo show in `packages/core/src/sample-show.ts` exports `sampleShow: ScheduleDoc`

### Task Schedule (personal-use feature)
Blake personally uses Rehearsal Block to manage his TLT shop's build schedule. Task Schedule mode is a forked editor body for that workflow, gated to his email via `lib/task-schedule-access.ts`. Not for general release.
- `ScheduleDoc.kind: 'rehearsal' | 'task'` - undefined treated as 'rehearsal' for legacy docs
- `ScheduleDay.tasks?: Task[]` - per-day tasks (only meaningful when kind=task)
- `ScheduleDoc.backlog?: Task[]` - unscheduled tasks
- `Task` shape: `{ id, text, done, doneBy?, doneAt?, assigneeIds? }` where assigneeIds reference cast members
- Task editor body in DayEditor: per-row text + assignee multi-select popover + reorder + delete; dblclick on text to edit
- Day cells filter `done: true` out (cleared via the Completed sidebar instead)
- View-only carryover: today's cell prepends incomplete prior-day tasks; data still lives on the original day
- Task chip drop in DayToolSidebar replaces the rehearsal Call chip; drop on a cell creates a blank task and inline-edits it in the cell
- Backlog drag-onto-day: TaskScheduleSidebar's backlog rows drag onto cells via `text/rb-backlog-task`; ScheduleEditor's `moveBacklogTaskToDay` removes from backlog + appends to day in one undo step
- TaskScheduleSidebar replaces the cast Sidebar in task mode (left column): Backlog up top, Completed below with "Clear" button + themed confirm modal (rendered at page level so it escapes the sidebar's sticky stacking context)
- Auto-roll: every editor load, if startDate < current week's start (per `weekStartsOn`), advance startDate. Past tasks aren't deleted, they just fall out of the rendered grid range; carryover keeps surfacing them
- TLT holiday seeding: new task schedules auto-set showUsHolidays=true, hiddenHolidays=["Presidents' Day", "Memorial Day", "Columbus Day", "Veterans Day"], and customHolidays=Black Friday + Christmas Eve for every year in the show range. Backfilled on load for any task-mode doc with hiddenHolidays===undefined
- See `~/.claude/projects/.../memory/project_task_schedule.md` for context, plus PR commits prefixed TS-* for implementation history

### Paid-version Supabase tables (planned, not yet created)
See `PRODUCT_SPEC.md` "Database schema" for full definitions.
- `shows_index` - metadata only. No `document` column - doc bytes live in R2.
- `show_activity` - audit log for refund eligibility + admin stats
- `page_views` + `demo_sessions` - analytics, public routes only, 30-day pruning
- Custom access token hook embeds `has_paid` in JWT claims so `hooks.server.ts` doesn't re-query profiles on every request

## Planned future sessions

- **Paid version v1** - the 10-phase plan at `C:\Users\blake\.claude\plans\curious-cuddling-butterfly.md`. Done so far: Phase 2.5 (prerender audit - 6 routes), Phase 3 UI (show list with calendar backdrop, plum cards, NewShowModal - mock data only, needs Phase 1 storage to wire real data), Phase 7 partial (healthcheck endpoint, GitHub Actions keepalive cron, CSP + security headers - still need Sentry, pg_dump backup, CF proxy toggle, cost alerts), Phase 8 (static pages /privacy /terms /contact /help + ComingSoonModal + hamburger nav). Phase 1 scaffolding is in place (r2.ts, sync.ts, local.ts, supabase.ts interfaces, migration placeholder, .env with R2 credentials, Supabase tables + JWT hook created). When starting Phase 1 implementation: *"Read the plan and start Phase 1."*
- **Beta testing** - plan at `C:\Users\blake\.claude\plans\curious-cuddling-moth.md`. Starts after all phases in the paid version plan are complete. 5-15 invited testers, beta code activation via `/beta` page, full app access, BETA watermark on exports. Do not start beta work until all paid version phases ship.
- **Onboarding tour / first-time helper popups** - plan at `C:\Users\blake\.claude\plans\onboarding-tour.md`. Coachmark overlay pattern, three tours (show-list, new-show-modal, schedule-editor), IndexedDB state, global toggle in My Defaults. ~5 hours focused. When starting: *"Read the onboarding tour plan and start implementing."*
- **Help docs / tutorial packet** - the /help page now has key concepts, toolbar reference, keyboard shortcuts, and FAQ. Full help docs (getting started guide, feature reference) are a separate future session. When starting: *"Read the planned help docs section in SESSION_HISTORY.md and start Phase 1 (exploration)."*

## Most-recent session (2026-05-04 / 2026-05-05)

Long single-thread session building the Task Schedule feature for Blake's personal TLT TD work. ~20 commits, all local on `main`, none pushed. See `BLAKE_TODO.md` at repo root for the pre-push checklist (the Supabase migration in particular has to run before any carpenter check toggles will work in production).

**Decisions made up front**: kind field on the doc, email allowlist gate (no JWT custom claim - one user doesn't justify the infra), single-fork strategy (reuse calendar/list/grid shell, fork only DayCell and DayEditor inner content), view-only carryover (data stays on origin day, today's cell renders prior-day incomplete), check-off-only carpenter access, polling for sync (skip Realtime), task_checks Supabase table for carpenter check state separate from the main doc, TLT-specific holiday auto-seeding, automatic startDate roll forward each week.

**Implemented (TS-1 through TS-4)**:
- TS-1: kind field, email allowlist (`task-schedule-access.ts`), "+ New Task Schedule" button gated to Blake's two emails
- TS-2: full editor (data model, cell rendering, day-editor task body, dblclick edit, Task chip drop with cell-inline edit, ListView task rendering, TaskScheduleSidebar with Backlog + Completed, drag-from-backlog, Clear-completed with themed confirm at page level, TLT holiday seed + backfill, weekly auto-roll of startDate)
- TS-3: `task_checks` Supabase migration (005), `/api/task-check` POST + GET endpoints, TaskShareView component for the carpenter view (polls every 15s, optimistic toggles + revert-on-error, name prompt + localStorage, filter dropdown, mobile-first defaults), TaskScheduleSidebar gains a `readOnly` flag so the carpenter view reuses it
- TS-4: task-mode print HTML path (no done tasks, checkboxes empty, Backlog section appended, holiday badges)

**Key files added/changed**:
- `packages/core/src/types.ts` - kind, Task, day.tasks, doc.backlog
- `packages/core/src/tasks.ts` - newTask, getCarriedOverTasks
- `packages/core/src/export.ts` - buildTaskPrintHtml branch
- `packages/standalone/src/lib/components/scheduler/TaskScheduleSidebar.svelte`
- `packages/standalone/src/lib/components/share/TaskShareView.svelte`
- `packages/standalone/src/lib/task-schedule-access.ts`
- `packages/standalone/src/lib/tlt-holidays.ts`
- `packages/standalone/src/routes/api/task-check/+server.ts`
- `packages/standalone/supabase/migrations/005_task_checks.sql`
- DayCell, DayEditor, CalendarGrid, ListView, ScheduleEditor, NewShowModal, /(view)/view/+page.svelte all gain `kind === 'task'` branches

**Not started this session**: pushing to deploy. Blake's standing rule is explicit-ask-only on push. He plans to run the migration + push when he's ready to start using this for an actual show.
