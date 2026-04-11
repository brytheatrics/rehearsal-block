# Rehearsal Block - Product Spec

## What This Is
A sellable web app for theatre directors and stage managers to build rehearsal schedules. Hosted on Netlify, sold through blakeryork.com. Designed so the TLT Rehearsal Scheduler can be migrated onto the same codebase later, sharing ~90% of the code.

---

## Current State (April 2026)

The demo at `/demo` is fully functional with sample data (Romeo & Juliet). All core scheduling features work. The site is deployed on Netlify (Starter plan $9/mo, temporary - will downgrade to Free once the paid version is stable). Buy Now / Sign In routes are wired and the scaffolding for auth + payments is in place, but the actual `/app` editor is still a placeholder. See `C:\Users\blake\.claude\plans\curious-cuddling-moth.md` for the full 10-phase plan to ship the paid version.

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
- **Export**: PDF download with scale/page-break/orientation/margin/footer settings (currently server-side Puppeteer, paywalled on deployed), Print (browser dialog), CSV (plain spreadsheet OR Google Calendar format), Contact Sheet (CSV/DOCX/PDF)
- **Share**: server-stored share links (in-memory Map today, moves to R2 public bucket in the paid version), view-only `/view?id=xxx` page with cast + crew filter, calendar/list toggle on the shared view
- **Conflict collection**: actor-facing pages at `/conflicts/[token]` and `/conflicts/[token]/[actorId]`, localStorage-backed today (moves to R2 public bucket in paid version), Pending tab with Accept/Reject (inbox pattern), conflict lockout date support
- **Mobile**: hamburger header, sticky toolbar (just the toolbar - title scrolls away), list view as the default mobile mode, sticky preferences in localStorage, dropdown bottom sheets, responsive settings modal
- **Landing page**: hero with scroll-pinned animation (planned to be replaced with a loop animation - see CLAUDE.md "Planned"), feature rows, BRY Theatrics branding in footer

For the precise per-feature behavior list and history of incremental changes, see `SESSION_HISTORY.md` at the repo root.

---

## Tech Stack

- **Framework**: SvelteKit with Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- **Monorepo**: pnpm workspaces - `packages/core` (shared TS) + `packages/standalone` (SvelteKit app)
- **Hosting**: Netlify Starter ($9/mo, temporary) with adapter-netlify. Will downgrade to Netlify Free once Phase 6 (client-side paged.js PDF) ships, because Netlify Free has a 10s function timeout that kills the Puppeteer endpoint.
- **Auth + metadata**: Supabase **Free tier** - auth (Google OAuth + magic link) + small metadata tables only. Supabase Pro is explicitly NOT in the base business model.
- **Blob storage**: Cloudflare R2 **Free tier** (10 GB storage, 10M reads/mo, 1M writes/mo, zero egress fees). Consolidates all blob storage: show docs, archives, share snapshots, conflict snapshots, daily version snapshots, and backups. Two buckets: private `rehearsal-block-shows` for owner data, public-read `rehearsal-block-public` for actor-facing share + conflict snapshots (served directly via CDN at `share.rehearsalblock.com`, bypassing Netlify functions).
- **Payments**: Stripe (2.9% + $0.30 per transaction, no subscription fee). $50 one-time purchase, no recurring fees.
- **Error monitoring**: Sentry Free tier (5k events/month)
- **PDF (current)**: Puppeteer + @sparticuz/chromium-min (server-side `/api/pdf` endpoint, works locally). **Being replaced** in Phase 6 of the paid version plan with client-side paged.js before the Netlify Free downgrade.
- **Share**: lz-string compression for URL-encoded fallback, server API for stable links (in-memory today, R2 in paid version)
- **CSS**: Custom properties in `lib/theme.css` (plum #2d1f3d, teal #38817D)
- **Fonts**: Google Fonts (Inter, Playfair Display, Roboto, Lato, Merriweather, Open Sans, Questrial) + system fallbacks. Future consideration: self-host via `@fontsource/*` for offline + CSP-strict compatibility.

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

### Core principle: pay once, own it (on free infra)

The paid version is a **$50 one-time purchase** with zero subscription cost. That means the base infrastructure has to fit inside free tiers: Netlify Free, Supabase Free, Cloudflare R2 Free, Sentry Free. Features that have variable cost (weekly call emails, cloud PDF generation, org tier with collaborators) go in separate paid add-ons, not in the base tier.

This is a binding design constraint. Every architectural choice in the paid version flows from it.

### Core principle: local-first

The app is local-first. The user's device is the source of truth; R2 + Supabase are a sync layer, not a backend. Every save writes to IndexedDB immediately, and the cloud sync happens in the background on an idle-based debounce (60s after last edit).

**Why this matters:**
- **Offline by default.** If wifi drops mid-rehearsal, the app keeps working. Changes accumulate locally and flush when connectivity returns.
- **Instant app open.** Load from local first (~100ms), reconcile with cloud in the background. No spinner.
- **Bandwidth is cheap.** Idle-based debounce means a 30-minute editing session does ~5 cloud writes instead of ~60. Gzip on the wire compresses a 150KB doc to 15-30KB. Hash guard skips no-op writes.
- **Survives vendor outages.** If R2 or Supabase has a bad day, users already on their device keep working. IndexedDB is authoritative.
- **Honest alignment with "no recurring fees" pitch.** User owns their data locally. Export/Import JSON buttons let them leave at any time. If the cloud backend ever goes away, they can still open and export their shows.

**Conflict resolution: last-write-wins on the whole doc.** When two devices edit the same show offline, whichever syncs last overwrites the other. The window is rare in a single-user product. Don't pre-build CRDTs or operational transforms. Multi-tab editing triggers a non-blocking warning banner via BroadcastChannel API.

**Save button visual state:** because local saves are instant on every edit, the default save state is just "Saved" - honest and reassuring. A subtle error indicator appears only when cloud sync is actively failing and retrying.

### Storage split (all blob storage on R2, Supabase for metadata)

| Data | Store | Reason |
|---|---|---|
| User accounts, auth, JWT custom claims | Supabase | Needs auth + RLS |
| Shows index (metadata only: id, name, dates, cast_count, hash, timestamps) | Supabase | Relational, list queries |
| `show_activity` audit log (for refund eligibility + audit) | Supabase | Relational queries by user + action |
| Analytics (`page_views`, `demo_sessions`) | Supabase | 30-day row pruning, small volume |
| **Show documents (gzipped JSON)** | **R2 private bucket** | Fat blobs, zero-egress CDN, cheap writes |
| **Archived show documents** | **R2 private bucket** | Same, under `archive:` prefix |
| **Daily version snapshots (7-day retention)** | **R2 private bucket** | Same, under `snapshots:` prefix |
| **Published share snapshots** | **R2 public bucket** | Served directly via CDN at `share.rehearsalblock.com`, zero Netlify functions |
| **Conflict collection show snapshots** | **R2 public bucket** | Same - actor-facing pages hit CDN directly |
| **Pending conflict submissions inbox** | **R2 private bucket** | Writes through rate-limited function, reads through auth'd function |
| **Nightly pg_dump backups** | **R2 private bucket** | Under `backups/pg:` prefix |
| **Nightly R2 cross-bucket backup of show docs** | **R2 private backup bucket** | Defense in depth against catastrophic R2 data loss |

**Why R2 for all blobs:** R2 has **published** free-tier quotas (unlike Netlify Blobs which doesn't publish them), zero egress fees (unlike AWS S3), and a public-read bucket mode that lets the share + conflict pages serve directly from Cloudflare's CDN without touching Netlify functions at all. This alone saves thousands of function invocations per month vs routing through a Netlify function.

**Why public R2 for actor-facing share/conflict pages:** every actor viewing a share link or conflict page is a read, and these are the highest-volume public paths in the product. Routing them through Netlify functions would eat the 125k/month function budget fast. Serving from R2 public bucket + custom domain makes them **zero-function reads** with unlimited egress.

### Resilience properties

- **Supabase 7-day auto-pause**: if it happens, `/app` login breaks for a few minutes until UptimeRobot catches it, BUT share links and actor conflict pages keep working because they're served from R2 directly. Nobody but Blake notices.
- **R2 outage**: users already on their device keep working (IndexedDB). New-device users are stuck until R2 recovers. Rare (~15 min incidents, ~2/year historically).
- **Netlify outage**: same as above - existing users keep working locally, new visitors are stuck. Rare.
- **Supabase data corruption**: nightly pg_dump to R2 covers restoration. IndexedDB covers the "latest state" on each user's device.
- **R2 data loss**: nightly cross-bucket sync covers it. User IndexedDB is the ultimate fallback for active users.

### Infrastructure (all free tier)

- **Netlify Free** (target state, currently on Starter as a temporary crutch): SvelteKit app, 125k function invocations/month, 100 GB bandwidth/month, 10s function timeout. The 10s timeout is why Phase 6 has to replace Puppeteer with client-side paged.js before the downgrade.
- **Supabase Free**: Google OAuth + magic link auth, Postgres for metadata tables, 500 MB DB, 2 GB bandwidth/month, 60 concurrent connections (use pgbouncer URL to pool), 3 magic link emails/hour rate limit (accept for v1, swap to Resend Free post-launch if it becomes a problem).
- **Cloudflare R2 Free**: 10 GB storage, 1M writes/month, 10M reads/month, zero egress fees.
- **Cloudflare CDN + DDoS** (free, applied via DNS proxy toggle): L3/4/7 DDoS mitigation, WAF managed ruleset, bot protection, edge caching for prerendered routes.
- **Stripe**: 2.9% + $0.30 per transaction, no monthly fee ($48.25 net on $50 sale). Stripe Radar blocklist for previously-refunded emails.
- **Sentry Free**: 5,000 events/month error capture.
- **UptimeRobot Free**: 50 monitors, 5-minute intervals, email alerts.
- **GitHub Actions** (free for public or small private repos): backup/keepalive/cleanup cron jobs.

### Scaling ceilings

With the current plan (prerender audit + JWT has_paid claim + client-direct metadata reads + server-owned doc writes + R2 public bucket for share pages), the realistic cliff is at **roughly 1500-2000 active paid users**. Main bottleneck at that scale is Netlify Free's 125k function invocation budget. Breakdown at ~2000 active users:
- Save writes: ~80k invocations/month (biggest line item)
- Load shows: ~20k
- Public analytics, share publishes, conflict submissions: ~10k
- Total: ~110k, 88% of budget, tight

The architectural move that pushes the cliff to **~5000+ active users** is **presigned R2 URLs for client-direct saves**, eliminating functions from the save path entirely. This is intentionally deferred to v2 so the initial architecture stays simpler. Trigger condition: monthly function usage hits 80k/125k.

Beyond ~5000 users, Supabase bandwidth (2 GB/mo) becomes the next cliff, pushed out by **delta sync** (send only changed fields per save). Also deferred.

Supabase DB storage (500 MB) and R2 storage (10 GB) are effectively unreachable at this product's realistic scale because metadata rows are ~500 bytes and gzipped show docs are ~25 KB.

### Keepalives (mandatory, not optional)

Supabase Free's 7-day auto-pause means keepalives are **product-critical**. Two independent layers:

1. **UptimeRobot** (primary + alerting): Free tier = 50 monitors, 5-minute intervals, email alerts. Monitors `/api/healthcheck`.
2. **GitHub Actions** (backup): cron every 3 days hitting the same endpoint. Independent infrastructure - immune to UptimeRobot outages.

**Do NOT run keepalive pings from Blake's home or work computers.** Sleep, restarts, vacation absences silently kill local crons.

`/api/healthcheck` (Phase 7 of the plan): GET endpoint, performs a trivial Supabase `select 1` + R2 HEAD, returns 200 `{ok: true, supabase: "responsive", r2: "responsive"}` or 500.

### Database schema (paid version)

```sql
-- Auth + profile (existing, partial)
profiles: id, email, has_paid, stripe_customer_id, created_at

-- Metadata-only show index (new)
shows_index: id, owner_id, owner_email, name, start_date, end_date, cast_count,
             document_hash, document_size_bytes, doc_version,
             last_saved_at, last_published_at,
             share_id, conflict_share_token, archived_at,
             created_at, updated_at

-- Audit log for refund eligibility + admin stats (new)
show_activity: id, show_id, user_id, action, created_at
  -- action: 'created' | 'exported_json' | 'downloaded_pdf' | 'published_share'
  --       | 'archived' | 'unarchived' | 'deleted' | 'restored_from_snapshot'

-- Analytics, public routes only, 30-day pruning (new)
page_views: id, path, visitor_hash, session_id, loaded_at, referrer_hash, country
demo_sessions: id, visitor_hash, session_id, started_at, duration_ms,
               interactions_count, referrer_hash

-- Future organization tier (not v1)
show_access: id, show_id, user_id, role, passcode, created_at
```

**Note the differences from the old spec:**
- **No `document` column on shows_index.** Doc bytes live in R2 at `show:<userId>:<showId>`. The index table is pure metadata.
- **No `published_doc` column.** Published snapshots live in the R2 public bucket at `share/<token>.json.gz`.
- **`owner_email` denormalized** from auth.users so that if Supabase auth ever has to be migrated off, shows can be matched back to users by email. Trivially small cost, real resilience.
- **`doc_version` field** matches the new `ScheduleDoc.version` field. Forward-migration logic runs on read if the stored version is older than the current code's version.
- **`show_activity` is an audit log**, not transient. Used for refund eligibility enforcement ("no refund if you exported your data"), admin stats, and future audit UI.
- **`conflict_submissions` is an inbox, stored as JSON array in an R2 blob** (not a Supabase table). Accept merges into the show doc, Reject drops the entry - both rewrite the blob.

### Analytics: DIY, cookieless, public-routes only

Goal: answer (1) how many people visit and (2) how long they use the demo before deciding not to buy. Zero tracking on `/app` (paid users).

Implementation:
- `visitor_hash` = SHA-256 of IP + UA + a rotating daily salt. Non-reversible, GDPR-compliant. Same person same day = same hash.
- `POST /api/track/page` - batched server-side writes to cut round-trips
- `POST /api/track/demo-session` - `navigator.sendBeacon` on `visibilitychange` / `beforeunload`
- Only runs on `/`, `/demo`, etc. NOT on `/app/**`
- Private `/admin/stats` page gated to Blake's account: visit counts + demo duration stats
- Nightly aggregation + row pruning via `pg_cron`: roll detailed rows into daily summaries, delete rows older than 30 days

**No cookie banner needed** - no tracking cookies set, visitor_hash is request-derived, auth + checkout cookies are strictly-necessary and exempt. Privacy policy page disclosing what's tracked is required, but no modal popup.

### Refund policy (abuse-resistant)

The $50 one-time purchase means refund abuse is an obvious vector ("pay → build show → download JSON → refund → repeat next year"). Plan closes this:

- **7-day goodwill refund window** from purchase date
- **Refund is void** if `show_activity` has any disqualifying action: `exported_json`, `downloaded_pdf`, `published_share`, or `conflict_share_token` used
- **Refunds trigger automatic account deletion**: Stripe refund → `charge.refunded` webhook → flip `has_paid = false` → delete user's data. Stripe Radar adds the email to a block list to prevent recreating.
- **EU Consumer Rights Directive Article 16(m) waiver** via a required consent checkbox at checkout: "I want immediate access and understand I waive my 14-day cooldown right." Legally parallel to how Netflix/Spotify handle digital goods.
- **Demo is the free trial**: users can try every feature on `/demo` before paying. "I didn't know what I was buying" argument doesn't apply.

### User flow (paid)

1. Sign in with Google (or magic link)
2. Pay $50 via Stripe checkout (with consent checkbox)
3. Stripe webhook flips `has_paid = true`, success page forces JWT refresh to pick up new claim
4. `/app` show list - grid of cards with hover actions (Open, Duplicate, Archive, Delete)
5. "Create your first show" empty state CTA on first visit
6. Edit - saves to local IndexedDB instantly, debounced cloud sync in background (60s idle + on blur/close/Ctrl+S)
7. Daily first-save copies previous version to R2 snapshots for 7 days of history
8. Download PDF via client-side paged.js (zero server cost)
9. Publish - writes snapshot to R2 public bucket, actors see it via `share.rehearsalblock.com/share/<token>.json.gz` served by Cloudflare CDN
10. Collect actor conflicts - writes snapshot to R2 public bucket, actors submit via rate-limited Netlify function, director reviews Pending tab + Accept/Reject

---

## What to Build Next

### Priority 1: Ship the paid version

**Full plan**: `C:\Users\blake\.claude\plans\curious-cuddling-moth.md` (10 phases, ordered so each builds on the last).

Summary of phases:
1. **Storage foundation** - R2 + Supabase metadata + IndexedDB + sync layer + JWT has_paid claim + `show_activity` + daily snapshots
2. **App shell** - minimal ~40px header with hamburger menu (Account / Privacy / Demo / Contact / Help)
2.5. **Prerender audit** - mark every static route as `prerender = true` to cut function invocations
3. **Show list** - grid of cards, New Show flow, Archive, Export/Import JSON
4. **Editor extraction** - pull the ~3000 line `/demo/+page.svelte` into a reusable `ScheduleEditor.svelte` used by both `/demo` and `/app/[showId]`
5. **Share + conflict backend** - R2 public bucket with custom domain, CDN-direct public reads
6. **PDF** - client-side paged.js to replace Puppeteer (blocker for Netlify Free downgrade)
7. **Ops hardening** - healthcheck, UptimeRobot, GitHub Actions keepalives, nightly pg_dump, R2 cross-bucket backup, Sentry, cost alerts, Cloudflare proxy, CSP headers
8. **Account settings + legal pages + refund enforcement** - `/app/account`, `/privacy`, `/terms`, `/contact`, `/help`, refund API with `show_activity` check, Stripe webhook `charge.refunded` handler, consent checkbox at `/buy`
9. **Analytics** - `/api/track/*` endpoints, public-route instrumentation, `/admin/stats`
10. **Demo reset + launch QA** - Reset demo button, end-to-end purchase flow test, backup restore test, Sentry smoke test

### Priority 2: Post-launch polish (separate planned sessions)

- **Landing-page hero loop animation** replacing the scroll-pinned version (see CLAUDE.md "Planned")
- **Help docs / tutorial packet** (see CLAUDE.md "Planned: Help Docs")
- **Batch deploy discipline** during the Starter period: 300 Netlify credits/month, 15 per deploy, batch changes

### Priority 3: Future tiers + add-ons (see plan file "Future Considerations")

- **Organization tier**: collaborator links, view-only links with passcodes, locked tech dates (priced separately)
- **Weekly call emails**: per-actor schedule emails via SendGrid/Resend, paid subscription add-on
- **Reports**: rehearsal/tech/performance reports with rich text, photo attachments, email delivery
- **Cloud PDF add-on**: one-click cloud PDF if paged.js has limitations for certain use cases
- **TLT migration**: `packages/tlt` with Google Sheets sync, admin/director auth

### Priority 4: Scale-triggered optimizations

- **Presigned R2 URLs for client-direct saves** - pushes function budget cliff from ~1500 to ~5000 users. Trigger: monthly function usage at 80%.
- **Delta sync** - only send changed fields per save. Trigger: Supabase bandwidth at 80%.
- **Auto-archive stale shows** - nightly cron moves shows `updated_at > 1 year ago` to cold storage. Trigger: real usage showing user show counts growing large.
- **Automated E2E tests (Playwright)** - critical-path regression coverage. Add during first post-launch refactor.
- **Service worker for full offline** - current plan is local-first data; adding a SW caches the app shell so it boots fully offline.

---

## Technical Debt

- `locationPresets` (string[]) vs `locationPresetsV2` (LocationPreset[]) - migrate fully to V2
- Share endpoint uses in-memory Map (Phase 5 moves to R2 public bucket)
- Supabase auth warning in logs ("use getUser() instead of getSession()")
- InlineEditor `state_referenced_locally` warnings (intentional - local value prevents reactive overwrite)
- CastEditorModal still exists as separate component but cast editing now lives in DefaultsModal Contacts tab
- A few accessibility warnings in DefaultsModal (8 warnings total, all pre-existing, none blocking)
- Profile row queried on every request in `hooks.server.ts` (Phase 1 moves to JWT custom claim)
- No schema versioning on stored `ScheduleDoc` yet (Phase 1 adds `version: 1` field)

---

## Key Files

### Core package (`packages/core/src/`)
- `types.ts` - ScheduleDoc, CastMember, CrewMember, Group, EventType, Call, ScheduleDay, Settings, LocationPreset. Will gain `version: number` field in Phase 1 of the paid version plan.
- `export.ts` - buildPrintHtml, buildCsvContent, buildPlainCsvContent, buildPageFooter
- `schedule.ts` - expandCalledActorIds, effectiveDescription/Location, locationColor/Shape, EVENT_TYPE_COLOR_PALETTE, CAST_COLOR_PALETTE
- `cast.ts` - castDisplayNames with cross-pool disambiguation
- `calendar.ts` - buildCalendarGrid, CalendarCell, CalendarRow
- `dates.ts` - IsoDate utilities including `formatUsDateRange`
- `time.ts` - formatTime
- `sample-show.ts` - Romeo & Juliet demo data (8 cast + 7 crew)
- `csv-import.ts` - cast/crew CSV import with column mapping

### Standalone package (`packages/standalone/src/`)
- `routes/+page.svelte` - landing page with scroll-pinned hero animation
- `routes/demo/+page.svelte` - main demo page, ~3000+ lines. Phase 4 of the plan extracts this into a reusable `ScheduleEditor.svelte` component.
- `routes/(view)/view/+page.svelte` - read-only view with cast/crew filter
- `routes/conflicts/[token]/+page.svelte` - actor-facing conflict submission page
- `routes/login/+page.svelte` + `+page.server.ts` - Google OAuth + magic link actions
- `routes/auth/callback/+server.ts` - OAuth code exchange
- `routes/buy/+page.svelte` + `+page.server.ts` - Stripe checkout
- `routes/buy/success/+page.server.ts` - post-payment verification
- `routes/app/+page.svelte` - placeholder (Phase 3 rewrites this as the show list)
- `routes/app/+layout.server.ts` - route guard (redirect unpaid users to /buy)
- `routes/api/pdf/+server.ts` - Puppeteer PDF endpoint (Phase 6 replaces with client-side)
- `routes/api/share/+server.ts` - share publish/retrieve (in-memory Map, Phase 5 moves to R2)
- `routes/api/stripe-webhook/+server.ts` - Stripe webhook, signature-verified. Phase 8 extends with `charge.refunded` handler.
- `routes/api/contact-sheet-pdf/+server.ts` - pdfkit contact sheet PDF
- `hooks.server.ts` - Supabase session + profile loading + route guards. Phase 1 replaces the profile query with a JWT custom claim read.
- `lib/supabase/client.ts` + `admin.ts` - Supabase clients
- `lib/stripe.ts` - Stripe server client
- `lib/storage/types.ts` - ShowStorage interface + StoredShow + PaywallError
- `lib/storage/demo.ts` - demo implementation (read-only, throws PaywallError on writes)
- `lib/storage/local.ts` - **stub**, filled in Phase 1
- `lib/storage/supabase.ts` - **stub**, filled in Phase 1
- `lib/pdf-templates.ts` - shared header/footer HTML builders for PDF
- `lib/fade-when-clipped.ts` - Svelte action for chip overflow detection
- `lib/contact-sheet-pdf.ts` - pdfkit-based contact sheet renderer
- `lib/export-docx.ts` - DOCX builder for contact sheets
- `lib/components/scheduler/` - all scheduler UI components (will be consumed by the new `ScheduleEditor.svelte` in Phase 4)
- `lib/theme.css` - CSS custom properties

---

## Pricing

- **One-time purchase: $50**
- No subscription, no recurring fees, unlimited shows
- Stripe handles payment, webhook confirms and marks `has_paid: true` in Supabase
- 7-day goodwill refund window, voided by data export / PDF download / share publication
