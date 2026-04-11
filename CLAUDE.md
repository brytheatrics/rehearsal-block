# Claude Code Instructions for Rehearsal Block

## Project Overview
Rehearsal Block is a web app for theatre directors and stage managers to build rehearsal schedules. See `PRODUCT_SPEC.md` for what's built, architecture, and roadmap. Verbose session history lives in `SESSION_HISTORY.md` (moved out of this file to keep startup tokens low).

**Paid version plan**: the full implementation plan for shipping the paid version lives at `C:\Users\blake\.claude\plans\curious-cuddling-moth.md`. When starting work on the paid version, read that plan first - it has the 10-phase breakdown, architecture decisions, file paths, and verification steps.

## Local Development

### Start the dev server
```bash
pnpm --filter @rehearsal-block/standalone dev
```
Runs on http://localhost:5173. The demo page is at `/demo`. The dev script passes `--host` so the server is also reachable on the LAN at `http://<your-ip>:5173/demo` for real-device testing from phones on the same Wi-Fi.

### Preview tool
Use `preview_start` with the name `rehearsal-block` - the `.claude/launch.json` is configured.

### When Blake pastes a localhost URL
If Blake pastes a URL like `http://localhost:5173/demo` with little or no other context, he wants to view the page himself. Start the dev server via `preview_start` (don't just leave it to him to run). Once it's running, confirm the URL is ready to open in his browser. Do NOT navigate the preview tool there yourself - he wants to look at it.

### Typecheck
```bash
pnpm -r --parallel check
```
Always run this after making changes. Must be 0 errors before committing.

### Monorepo structure
- `packages/core` - shared TypeScript (types, export, schedule, cast, calendar, dates, time). No build step - exports `.ts` source directly.
- `packages/standalone` - SvelteKit app with adapter-netlify.

## Key Conventions

### Svelte 5
Uses runes exclusively: `$state()`, `$derived()`, `$derived.by()`, `$effect()`, `$props()`. No stores. Page owns all state.

### No em dashes
Blake dislikes em dashes (they read as AI-generated). Always use `-` instead, in code, copy, and chat.

### Dates
All ISO date handling is UTC-safe via `packages/core/src/dates.ts`. Never use raw `new Date()` for date math. `formatUsDateRange(start, end)` truncates the redundant first year when both share one ("May 4 - Jun 14, 2026").

### Reactive proxy gotcha
`structuredClone()` fails on Svelte 5 reactive proxies. Use `JSON.parse(JSON.stringify())` instead.

### composedPath for click/dblclick handlers
Svelte 5 can unmount clicked elements before events finish bubbling. Always use `event.composedPath()` instead of `target.closest()` in window-level click handlers and cell double-click handlers.

### Delayed single-click pattern
DayCell and ListView use a 250ms delayed single-click. Double-click cancels the pending single-click to prevent the DayEditor from opening and shifting the grid layout. Critical for inline editing.

### CSS
Brand colors in `packages/standalone/src/lib/theme.css` - plum #2d1f3d, teal #38817D. Use CSS custom properties.

### Font sizes
Per-element sizes use `em` units (not `rem`) in CSS and the SIZE_MAP so they scale with `--cell-scale` in Day/Week scope views. The CSS variables (`--size-event-type`, `--size-time`, etc.) are set on `demo-inner` and apply to BOTH calendar AND list views.

### Mobile architecture
- Default mobile breakpoint: `@media (max-width: 768px)`
- Mobile defaults stored in `localStorage` as `rehearsal-block:mobile-prefs` (sticky preferences). On first mobile visit: list view, both sidebars collapsed, scope = Overview. Subsequent visits remember the user's choices.
- Mobile header uses hamburger dropdown. Mobile toolbar wraps 7+5 buttons. Toolbar is sticky via `display: contents` on `.sticky-bar` parent (the title scrolls away, just the toolbar stays pinned).
- Toolbar dropdowns become bottom sheets at mobile width (position: fixed, anchored to viewport bottom).
- Calendar view (the inner 7-column grid) is unusable at phone width. Mobile defaults force list view as the entry point.

### Chip text overflow → fade gradient
Cast/crew/group chips use a `fadeWhenClipped` Svelte action (`packages/standalone/src/lib/fade-when-clipped.ts`) that watches text elements with `ResizeObserver` and toggles `is-overflowing` on the closest chip ancestor. CSS uses `:global(.is-overflowing)` to render a `::after` overlay (15px fade + 7px solid buffer = 22px) only when the text is actually clipped. The chip's border, border-radius, and colored left stripe stay intact - only the inside text fades.

### PDF rendering (current)
- Server (`/api/pdf`) uses Puppeteer with `headerTemplate` / `footerTemplate` for the show title (when "Title on all pages" is on) and footer logo / page numbers / date.
- Shared HTML template builders in `packages/standalone/src/lib/pdf-templates.ts` - same module is used by both the server endpoint AND the export modal preview iframe so they render identically.
- PDF scale slider works via regex rewrite of `font-size: Npx` in the embedded `<style>` (NOT via Puppeteer's `scale` option, which doesn't expand the bottom margin reservation, and NOT via CSS `zoom`, which interacts badly with `page-break-inside: avoid`).
- `.print-header h1/.dates` get explicitly restored to their original 22px/11px sizes after the regex rewrite so the show title at the top of page 1 stays unscaled.
- Header template MUST use system-ui / Georgia (no Google Fonts `<link>` - Chrome's printToPDF runs the template in an isolated context that can't fetch external stylesheets, throws CDP errors).
- **Puppeteer is being replaced** in Phase 6 of the paid version plan with a client-side paged.js path. Both because Netlify Free has a 10s function timeout (Puppeteer routinely exceeds) and because the paid version's zero-recurring-cost philosophy rules out server-side PDF. Do not delete `/api/pdf` until paged.js is proven against the demo show - it stays as a localhost dev tool.

### Color picker portal
The group color picker popover uses a `portalToBody` Svelte action (defined inline in `Sidebar.svelte`) that does `document.body.appendChild(node)` on mount. Without it, Chromium clips the popover even though it's `position: fixed` because of an `overflow: hidden + position: sticky` ancestor. Use this pattern for any popover that needs to escape an overflow ancestor.

## Infrastructure (current state + plan)

### Vendors
- **Netlify** - hosts the SvelteKit app. **Currently Starter ($9/mo)** as a temporary crutch for the heavy launch-period deploy load (300 credits/month, 15 per deploy). **Will downgrade to Free** once the paid version is stable and Phase 6 (client-side PDF via paged.js) has replaced the Puppeteer endpoint. Netlify Free has a 10s function timeout + 125k invocation/month budget, which is fine for the architecture in the plan.
- **Supabase** - auth + small metadata tables. **Free tier only.** Supabase Pro is explicitly NOT in the base "pay once" business model; it would only come in if subscription add-ons ship later. Free tier has a 7-day inactivity auto-pause, 2 GB bandwidth/month, 500 MB DB storage.
- **Cloudflare R2** - primary blob storage for show documents, archives, share snapshots, conflict snapshots, and backups. Free tier: 10 GB storage, 10M reads/mo, 1M writes/mo, zero egress fees. Consolidates all blob storage onto one vendor with known quotas.
- **Stripe** - payments (one-time $50 purchase, no subscriptions in the base tier).
- **Sentry** - error monitoring, Free tier (5k events/month).

### Deployment cadence (during Starter period)
- Auto-deploys on push to `main`. 15 credits per deploy, 300/month cap.
- **Do not push frequently** - batch changes and only push when Blake asks.
- Once on Free tier, deploy credits become unmetered but function budget (125k/mo) becomes the new bottleneck.

### Current state of paid-version wiring
- **Done**: Supabase auth + Google OAuth + magic link, hooks.server.ts with `/app` route guard, `/buy` Stripe checkout, `/api/stripe-webhook` signature-verified, `ShowStorage` interface + `demo.ts` implementation, `/app` placeholder page with sign-out.
- **Stub**: `lib/storage/local.ts` and `lib/storage/supabase.ts` throw on every method.
- **Missing**: everything else in the plan file's 10 phases.

### Current paywall gating on demo
- `hostname !== "localhost"` = all writes, exports, advanced UI → paywall modal
- localhost dev = full editing allowed (for testing/demo purposes)
- Once the paid version ships, the demo stays fully accessible but reachable only via the hamburger menu inside `/app`, and a "Reset demo" button wipes any accumulated edits

## Testing Changes
After making changes, verify in the browser at http://localhost:5173/demo. The preview tool can screenshot and interact with the page. For the export modal, the preview tool struggles with iframes - use `preview_snapshot` instead of `preview_screenshot` when the modal is open.

For iterating on PDF export specifically: `packages/standalone/scripts/debug-calendar-pdf.mts` POSTs the demo show to `/api/pdf` with various scale + mode combinations and renders every page to PNG via pdfjs-dist + @napi-rs/canvas. Output goes to `scripts/out/`. Run via `pnpm --filter @rehearsal-block/standalone exec tsx scripts/debug-calendar-pdf.mts 100 150 200`.

## Data Model Notes
- `CastMember` - actors with firstName, lastName, character, color, etc.
- `CrewMember` - production team with firstName, lastName, role, color, etc.
- `Call.calledActorIds` - which actors are called (required field)
- `Call.calledCrewIds` - which crew are called (optional field, may be undefined on older calls)
- `Call.allCalled` - boolean flag that means all CAST members, not crew
- `ScheduleDoc.cast` - array of CastMember
- `ScheduleDoc.crew` - array of CrewMember
- `ScheduleDoc.version` - schema version field, added with the paid version for forward migrations. Demo sample may not have it yet; handle `undefined` as version 1 on read.
- `Settings.crewDisplayMode` - "name" | "role" | "both"
- `Settings.showCastConflicts` / `Settings.showCrewConflicts` - visibility toggles for grid
- `Settings.defaultEventType` - show-wide default event type for new days ("" for none)
- `Settings.showHolidays`, `showUsHolidays`, `customHolidays`, `hiddenHolidays` - holiday feature toggles
- `Settings.allCalledLabel`, `allCalledColor`, `allCalledVisible` - All Called pseudo-group customization
- Conflicts use `actorId` field for both cast and crew members (shared conflict system)
- Demo show in `packages/core/src/sample-show.ts` exports `sampleShow: ScheduleDoc`

### Paid-version Supabase tables (planned, not yet created)
- `shows_index` - metadata only (id, owner_id, owner_email denormalized, name, dates, cast_count, document_hash, doc_version, archived_at, share_id, conflict_share_token, timestamps). No `document` column - doc bytes live in R2.
- `show_activity` - audit log (show_id, user_id, action, created_at). Used for refund eligibility, audit, admin stats.
- `page_views` + `demo_sessions` - analytics for public routes only, with 30-day row pruning.
- Custom access token hook embeds `has_paid` in JWT claims so `hooks.server.ts` doesn't re-query profiles on every request.

## Planned: Help Docs / Tutorial Packet

Future session goal: build a comprehensive help/tutorial doc for end users (theater directors, stage managers). Phase 1 = exploration via Explore agents to map every interaction. Phase 2 = write Getting Started + Feature Reference + Keyboard cheat sheet + FAQ. Phase 3 (optional) = in-app `/help` route + contextual `?` overlays. When starting this, tell Claude: *"Read the planned help docs section in CLAUDE.md and start Phase 1 (exploration)."*

The full Phase 1 exploration checklist (components to map, user flows to trace, grep passes for keyboard shortcuts) is preserved in `SESSION_HISTORY.md` under the original Help Docs planning entry. Caveats Blake should know: Claude will miss subtle UX intent that only Blake knows; first drafts will read like a reference manual; screenshots will use the demo show.

## Most-recent session summary (2026-04-11)

Planning session for the paid version architecture. No code written - just deep exploration + design + approval of a 10-phase plan living at `C:\Users\blake\.claude\plans\curious-cuddling-moth.md`. Key architectural decisions:
- **All blob storage consolidated on Cloudflare R2**: show docs, archives, share snapshots, conflict snapshots, and backups. Private bucket for owner-only data, public-read bucket with custom domain (`share.rehearsalblock.com`) for share + conflict public paths so actor views bypass Netlify functions entirely.
- **Supabase drops to metadata-only**: `shows_index` table has no document column. Bandwidth drops ~95% vs keeping docs in Supabase.
- **Full local-first**: IndexedDB primary + 60s idle-based debounce (not timer-based) + gzip + hash no-op guard + hard flush on blur/close.
- **Daily version history with 7-day retention**: first-save-of-day copies existing R2 blob to `snapshots/<user>/<show>/<date>.json.gz`. Users get "restore from yesterday" for free.
- **Refund policy with anti-abuse teeth**: 7-day goodwill window, voided if user exported JSON / downloaded PDF / published share. `show_activity` audit log enforces server-side. Stripe Radar blocks previously-refunded emails. EU consent checkbox at checkout provides Article 16(m) waiver.
- **Ops hardening**: `/api/healthcheck`, UptimeRobot + GitHub Actions keepalives, nightly pg_dump backup to R2, Sentry error monitoring, cost alerts on every paid service, Cloudflare proxy on the Netlify origin for free DDoS/WAF, CSP headers.
- **5-year resilience folds**: Export/Import show JSON, owner_email denormalized for auth migration recovery, schema versioning on ScheduleDoc, numbered Supabase migrations, R2 cross-bucket nightly backup.
- **Deferred to "Future Considerations"**: presigned R2 URLs (scale-triggered), delta sync, org tier, weekly call emails, E2E tests, service worker for full offline.

No deploys. No code changes. Plan is locked in; Phase 1 (storage foundation) starts next session.
