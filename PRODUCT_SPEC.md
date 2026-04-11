# Rehearsal Block - Product Spec

## What This Is
A sellable web app for theatre directors and stage managers to build rehearsal schedules. Hosted on Netlify, sold through blakeryork.com. Designed so the TLT Rehearsal Scheduler can be migrated onto the same codebase later, sharing ~90% of the code.

---

## Current State (April 2026)

The demo at `/demo` is fully functional with sample data (Romeo & Juliet). All core scheduling features work. The site is deployed on Netlify (Starter plan, $9/mo) with Buy Now / Sign In buttons disabled (coming soon).

### Feature areas (high level)

- **Scheduler grid**: 7-column continuous calendar, day editor panel, event type pills, drag-drop for actors/crew/groups, per-call drop targeting, dress/perf mode with curtain time + labeled call blocks, conflict tracking with overlap detection, location presets with custom colors and 8 distinguishable shapes
- **List view**: dense scrollable list, location-colored borders, blank-day support (dimmed, toggleable), font-size variables wired in, max-width 620px centered on desktop
- **Inline cell editing**: double-click to edit description / time / notes directly in cell, 250ms delayed-click pattern to coexist with single-click DayEditor
- **Scope selector**: All/Month/Week/Day with prev/next nav, keyboard shortcuts (Shift+A/M/W/D), auto-scroll to top when changing
- **Toolbar**: sticky header with view toggle, scope selector, filter dropdown (date / person / event type / location), undo/redo, settings, export, collect conflicts, share, save. Optional text labels next to icons.
- **Cast & Production Team sidebar**: single Cast/Team toggle, display mode dropdown (actor/character/both), collapse button, sticky header. Cross-pool first-name disambiguation. Groups (with All Called as a customizable pseudo-group) editable inline via floating popover with portaled color picker.
- **Day editor**: full panel with Cast/Team toggle inside the "Who's called" picker, groups always visible (including All Called), per-call inline edit, conflict editing
- **Default Settings (6 tabs)**: Appearance (theme, visibility, group drop behavior, fonts, font sizes), Schedule (time picker increments, call times per weekday, dress/perf call window, holidays, time format, week starts on), Event Types, Locations, Contacts (cast + production team subtabs with full CRUD + CSV import), Show
- **Editing**: undo/redo (50 levels, Ctrl+Z/Y), Ctrl+S, copy/cut/paste days, multi-select via shift/ctrl-click, multi-day paste/clear with confirmation, draft day pattern
- **Export**: PDF download with scale/page-break/orientation/margin/footer settings (server-side Puppeteer, paywalled on deployed), Print (browser dialog), CSV (plain spreadsheet OR Google Calendar format), Contact Sheet (CSV/DOCX/PDF)
- **Share**: server-stored share links, view-only `/view?id=xxx` page with cast + crew filter, calendar/list toggle on the shared view
- **Conflict collection**: actor-facing pages at `/conflicts/[token]` and `/conflicts/[token]/[actorId]`, localStorage-backed (Supabase wiring is Priority 2), Pending tab with Accept/Reject (inbox pattern), conflict lockout date support
- **Mobile**: hamburger header, sticky toolbar (just the toolbar - title scrolls away), list view as the default mobile mode, sticky preferences in localStorage, dropdown bottom sheets, responsive settings modal
- **Landing page**: hero with scroll-pinned animation (planned to be replaced with a loop animation - see CLAUDE.md "Next session"), feature rows, BRY Theatrics branding in footer

For the precise per-feature behavior list and history of incremental changes, see `SESSION_HISTORY.md` at the repo root.

---

## Tech Stack

- **Framework**: SvelteKit with Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- **Monorepo**: pnpm workspaces - `packages/core` (shared TS) + `packages/standalone` (SvelteKit app)
- **Hosting**: Netlify Starter ($9/mo) with adapter-netlify (serverless, not edge)
- **Auth** (planned): Supabase Pro ($25/mo, see "Why not Supabase Free" below)
- **Storage** (planned): Local-first - IndexedDB primary, Supabase as a debounced sync layer. Both `lib/storage/local.ts` and `lib/storage/supabase.ts` are currently stubs.
- **Payments** (planned): Stripe
- **PDF**: Puppeteer + @sparticuz/chromium-min (server-side, works locally, needs Lambda for production)
- **Share**: lz-string compression for URL-encoded fallback, server API for stable links
- **CSS**: Custom properties in `lib/theme.css` (plum #2d1f3d, teal #38817D)
- **Fonts**: Google Fonts (Inter, Playfair Display, Roboto, Lato, Merriweather, Open Sans, Questrial) + system fallbacks

### Key technical patterns

- UTC-safe dates via ISO strings to avoid timezone drift; `formatUsDateRange(start, end)` truncates duplicated year
- `JSON.parse(JSON.stringify())` instead of `structuredClone()` for Svelte 5 proxies
- `event.composedPath()` in window click handlers (Svelte 5 unmounts clicked elements before bubbling completes)
- Draft day pattern: blank cells create a local draft, only commit to `doc.schedule` on first edit
- 250ms delayed single-click on cells: double-click cancels pending single-click to prevent layout shift
- Per-element font sizes via CSS custom properties using `em` units so they scale with `--cell-scale` in Day/Week views
- ResizeObserver-driven `--sticky-bar-height` for weekday header positioning
- `fadeWhenClipped` Svelte action for chip text overflow detection (via `ResizeObserver`)
- `portalToBody` Svelte action for popovers that need to escape `overflow: hidden + sticky` ancestor clipping (Chromium quirk)

---

## Architecture: Paid Version

### Core principle: local-first

The app is local-first. The user's device is the source of truth; Supabase is a sync layer, not a backend. Every save writes to IndexedDB/localStorage immediately, and Supabase sync happens in the background on a debounce.

**Why this matters:**
- **Offline by default.** If wifi drops mid-rehearsal, the app keeps working. Changes accumulate locally and flush when connectivity returns.
- **Instant app open.** Load from local first (~100ms), reconcile with Supabase in the background. No spinner.
- **Bandwidth is the real cost driver, not storage.** Debouncing Supabase writes to once every 10-30s (or on blur/close/idle) cuts bandwidth 10-100x.
- **Survives the Supabase pause gotcha.** See below.
- **Honest alignment with "no recurring fees" pitch.** User owns their data locally. If the cloud backend ever goes away, they can still open and export their shows.

**Conflict resolution: last-write-wins on the whole doc.** When two devices edit the same show offline, whichever syncs last overwrites the other. The window is rare in a single-user product. Don't pre-build CRDTs or operational transforms.

**Save button visual state:** teal "needs-attention" fill when local state is ahead of the last successful Supabase sync. Clears when sync catches up. Failed sync retries on exponential backoff and reconnect.

### Infrastructure (mostly free tier)

- **Netlify Starter** ($9/mo): SvelteKit app, SSR, API routes (everything except heavy PDF)
- **Supabase Pro** ($25/mo): Google OAuth, Postgres (shows, profiles, submissions), 8 GB DB, 100 GB bandwidth
- **Stripe**: 2.9% + $0.30 per transaction, no monthly fee ($48.25 net on $50 sale)
- **AWS Lambda**: standalone function with 2GB memory for PDF generation
  - Free tier covers ~25,000 PDFs/month
  - After free tier: ~$0.0003 per PDF

### Why not Supabase Free

Two blockers:
1. **Projects auto-pause after 7 days of inactivity and require MANUAL dashboard action to restore.** Not auto-resume on access (this is a common misconception - official docs are vague). If nobody opens the app for a week, the next visitor gets a broken product. Unacceptable for a paid product.
2. **Bandwidth is the tight constraint.** Even with local-first debouncing, 2 GB/month only covers roughly 60-100 active monthly users.

**Pro tier break-even math:** $25/mo = $300/year. Needs **6-8 net sales per year** to cover. 8 GB DB + 100 GB bandwidth realistically supports 3,000-4,000+ active monthly users.

**The danger scenario** is: burst launch → many users → sales dry up → $300/year ongoing cost for users who already paid. Local-first architecture is the main mitigation. Secondary: auto-archive shows > 2 years old to Supabase Storage (cheaper per byte), compress show JSON before write, TOS language allowing cold-storage archival.

### Supabase keepalive pings (belt-and-suspenders)

Even on Pro, set up monitoring. Two independent free layers:

1. **UptimeRobot** (primary + alerting): Free tier = 50 monitors, 5-minute intervals, email alerts. Monitors `/api/healthcheck`.
2. **GitHub Actions** (backup): cron every 3 days hitting the same endpoint. Independent infrastructure.

**Do NOT run keepalive pings from Blake's home or work computers.** Sleep, restarts, vacation absences silently kill local crons.

`/api/healthcheck` (to be built): GET endpoint, performs a trivial Supabase query (`select 1`), returns 200 `{ok: true, supabase: "responsive"}` or 500 `{ok: false, error}`.

### Database schema

```sql
profiles: id, email, has_paid, stripe_customer_id, created_at
shows: id, owner_id, name, document (jsonb), last_saved_at, last_published_at,
       published_doc (jsonb), share_id (unique 8-char), conflict_share_token (unique),
       created_at, updated_at
show_access (future org tier): id, show_id, user_id, role, passcode, created_at
conflict_submissions: id, show_id, cast_member_id, submitted_dates (jsonb),
                      submitter_name, submitted_at, status, reviewed_at
```

**`conflict_submissions` is an inbox, not an archive.** Accept merges into `shows.document.conflicts` in a single transaction AND deletes the row. Optional cleanup job sweeps `status: "applied"` rows after 30-90 days for an audit trail.

**Per-actor links are derived, not stored.** Don't create a row per link. The single `conflict_share_token` on the show plus the existing cast member UUID is enough to construct `/conflicts/{token}/{castMemberId}`. Cast member IDs are random UUIDs, so guessing is effectively impossible.

### Analytics: DIY, cookieless, public-routes only

Goal: answer (1) how many people visit and (2) how long they use the demo, without a cookie banner or monthly analytics subscription.

Custom tracking logged to Supabase, only on public routes. Paid users get zero tracking.

**Schema:**
```sql
page_views: id, path, visitor_hash, session_id, loaded_at, referrer, user_agent_hash, country
demo_sessions: id, visitor_hash, session_id, started_at, duration_ms, interactions_count, referrer
```

`visitor_hash` = SHA-256 of IP + UA + a rotating daily salt. Non-reversible, GDPR-compliant. Same person same day = same hash.

**Implementation sketch:**
1. `POST /api/track/page` - computes visitor_hash server-side, writes a row
2. Demo page tracks session duration via `navigator.sendBeacon` on `visibilitychange` / `beforeunload`
3. Only runs on `/`, `/demo`, etc. NOT on `/app/**`
4. Private `/admin/stats` page gated to Blake's account: visit counts + demo duration stats

**No cookie banner needed** - no tracking cookies set, visitor_hash is request-derived, auth + checkout cookies are strictly-necessary and exempt. Privacy policy page disclosing what's tracked is required, but no modal popup.

### User flow (paid)

1. Sign in with Google
2. Create unlimited shows
3. Edit - saves to local IndexedDB instantly, debounced Supabase sync in background
4. Save button shows teal "sync pending" state while behind; clears when caught up
5. Download PDF via AWS Lambda
6. Publish - saves snapshot to `published_doc`, cast sees live updates via share link
7. Collect actor conflicts, review pending submissions, accept to merge

---

## What to Build Next

### Priority 1: Polish & Ship Demo

- **Replace landing-page hero scroll animation with a loop** (next planned session - details in CLAUDE.md)
- **Help docs / tutorial packet** (planned multi-phase work - see CLAUDE.md for trigger phrase)
- Batch deploy changes to Netlify (avoid frequent deploys - 15 credits each, 300/month)

### Priority 2: Wire Up Paid Version

**Foundation work (do first - everything else depends on this):**
1. Fill in `lib/storage/local.ts` (IndexedDB-backed, implements `ShowStorage` interface)
2. Fill in `lib/storage/supabase.ts` (writes for signed-in paid users)
3. Build the sync layer: write local first (instant), queue debounced Supabase sync (10-30s idle), track `syncStatus`, retry failed syncs on backoff
4. Save button visual state: teal needs-attention fill when `syncStatus !== "synced"`
5. Last-write-wins conflict resolution on load

**Auth, billing, routing:**
6. Activate Supabase auth (Google OAuth) - hooks already scaffolded
7. Create `shows` table with sync layer wired
8. Gate features behind `has_paid` check
9. Wire `/app` route for paid users
10. Move share storage from in-memory Map to Supabase `shows.published_doc`

**Supabase keepalive (partially set up):**
- ✅ UptimeRobot account created, email alerts configured
- ✅ Landing page monitor active at `https://rehearsalblock.com/`
- ⏸️ Healthcheck monitor paused, pre-configured for `/api/healthcheck` - unpause when endpoint ships
11. Build `/api/healthcheck` endpoint (trivial Supabase query, 200/500)
12. Unpause healthcheck monitor
13. Add `.github/workflows/supabase-keepalive.yml` cron every 3 days as second layer

**Analytics (DIY, see Architecture section above):**
14. Add `page_views` and `demo_sessions` tables
15. Build `POST /api/track/page` endpoint
16. Build `POST /api/track/demo-session` endpoint with `sendBeacon` support
17. Instrument public routes (NOT `/app/**`)
18. Instrument demo with session duration + interaction counter
19. Private `/admin/stats` page gated to Blake's account

**PDF:**
20. Deploy PDF Lambda to AWS (reuse existing Puppeteer server code with 2GB memory)
21. Point ExportModal fetch at Lambda URL instead of `/api/pdf`

**Conflict collection backend** (UI is built, currently localStorage-stubbed):
22. Add `conflict_share_token` column to `shows` table
23. Backend the `/conflicts/[token]` and `/conflicts/[token]/[actorId]` pages with Supabase
24. POST endpoint writes to `conflict_submissions`
25. Wire Pending tab in `ConflictRequestModal.svelte` to fetch real submissions
26. Build Accept (merge into `shows.document.conflicts` + delete row) / Reject (delete row) flow

### Priority 3: Future Features

- Organization tier: collaborator links, view-only links with passcodes, locked tech dates
- Weekly call emails (per-actor schedule emails, Netlify Function + SendGrid)
- Reports (phase 2): rehearsal/tech/performance reports with rich text, photo attachments, email delivery
- TLT migration: `packages/tlt` with Google Sheets sync, admin/director auth

---

## Technical Debt

- `locationPresets` (string[]) vs `locationPresetsV2` (LocationPreset[]) - migrate fully to V2
- Share endpoint uses in-memory Map (swap for Supabase in paid version)
- Supabase auth warning in logs ("use getUser() instead of getSession()")
- InlineEditor `state_referenced_locally` warnings (intentional - local value prevents reactive overwrite)
- CastEditorModal still exists as separate component but cast editing now lives in DefaultsModal Contacts tab
- A few accessibility warnings in DefaultsModal (8 warnings total, all pre-existing, none blocking)

---

## Key Files

### Core package (`packages/core/src/`)
- `types.ts` - ScheduleDoc, CastMember, CrewMember, Group, EventType, Call, ScheduleDay, Settings, LocationPreset
- `export.ts` - buildPrintHtml, buildCsvContent, buildPlainCsvContent, buildPageFooter
- `schedule.ts` - expandCalledActorIds, effectiveDescription/Location, locationColor/Shape, EVENT_TYPE_COLOR_PALETTE, CAST_COLOR_PALETTE
- `cast.ts` - castDisplayNames with cross-pool disambiguation
- `calendar.ts` - buildCalendarGrid, CalendarCell, CalendarRow
- `dates.ts` - IsoDate utilities including `formatUsDateRange`
- `time.ts` - formatTime
- `sample-show.ts` - Romeo & Juliet demo data (8 cast + 7 crew)
- `csv-import.ts` - cast/crew CSV import with column mapping

### Standalone package (`packages/standalone/src/`)
- `routes/demo/+page.svelte` - main demo page (owns all state, ~3000+ lines)
- `routes/(view)/view/+page.svelte` - read-only view with cast/crew filter
- `routes/conflicts/[token]/+page.svelte` - actor-facing conflict submission page
- `routes/api/pdf/+server.ts` - Puppeteer PDF endpoint
- `routes/api/share/+server.ts` - share publish/retrieve
- `routes/api/contact-sheet-pdf/+server.ts` - pdfkit contact sheet PDF
- `lib/pdf-templates.ts` - shared header/footer HTML builders for PDF (used by both server and modal preview)
- `lib/fade-when-clipped.ts` - Svelte action for chip overflow detection
- `lib/contact-sheet-pdf.ts` - pdfkit-based contact sheet renderer
- `lib/export-docx.ts` - DOCX builder for contact sheets
- `lib/components/scheduler/` - all scheduler UI components
- `lib/theme.css` - CSS custom properties

---

## Pricing

- **One-time purchase: $50**
- No subscription, no recurring fees, unlimited shows
- Stripe handles payment, webhook confirms and marks `has_paid: true` in Supabase
