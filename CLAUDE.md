# Claude Code Instructions for Rehearsal Block

## Project Overview
Rehearsal Block is a web app for theatre directors and stage managers to build rehearsal schedules. The demo at `/demo` is fully functional; the paid version (`/app`) is being built out.

### Key docs (read on demand, not auto-loaded)
- **`PRODUCT_SPEC.md`** - full product specification, architecture, database schema, roadmap
- **`PATTERNS.md`** - implementation patterns and gotchas (read when touching related code - PDF, popovers, chips, mobile, inline editing, font sizes, reactive proxies)
- **`SESSION_HISTORY.md`** - verbose per-session history
- **`C:\Users\blake\.claude\plans\curious-cuddling-moth.md`** - the 10-phase paid-version implementation plan. **When starting work on the paid version, read this file first.**

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
- **Done**: Supabase auth + OAuth + magic link, `hooks.server.ts` with `/app` route guard, `/buy` Stripe checkout, `/api/stripe-webhook` signature-verified, `ShowStorage` interface + demo implementation, `/app` placeholder page with sign-out.
- **Stub**: `lib/storage/local.ts` and `lib/storage/supabase.ts` throw on every method.
- **Missing**: everything else in the plan file's 10 phases.

### Demo paywall gating
- `hostname !== "localhost"` = all writes, exports, advanced UI → paywall modal
- localhost dev = full editing allowed (testing)
- Once paid version ships, demo stays accessible via the hamburger inside `/app`, with a "Reset demo" button to wipe accumulated edits

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

### Paid-version Supabase tables (planned, not yet created)
See `PRODUCT_SPEC.md` "Database schema" for full definitions.
- `shows_index` - metadata only. No `document` column - doc bytes live in R2.
- `show_activity` - audit log for refund eligibility + admin stats
- `page_views` + `demo_sessions` - analytics, public routes only, 30-day pruning
- Custom access token hook embeds `has_paid` in JWT claims so `hooks.server.ts` doesn't re-query profiles on every request

## Planned future sessions

- **Paid version v1** - the 10-phase plan at `C:\Users\blake\.claude\plans\curious-cuddling-moth.md`. When starting: *"Read the plan and start Phase 1."*
- **Landing-page hero loop animation** - replace the current scroll-pinned version. Details in SESSION_HISTORY.md.
- **Help docs / tutorial packet** - multi-phase session to build end-user help docs. When starting: *"Read the planned help docs section in SESSION_HISTORY.md and start Phase 1 (exploration)."*
