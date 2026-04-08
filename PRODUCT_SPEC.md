# Rehearsal Block - Product Spec

## What This Is
A sellable web app for theatre directors and stage managers to build rehearsal schedules. Hosted on Netlify, sold through blakeryork.com. Designed so the TLT Rehearsal Scheduler can be migrated onto the same codebase later, sharing ~90% of the code.

---

## Current State (as of April 2026)

### What's Built and Working
The demo at `/demo` is fully functional with sample data (Romeo & Juliet). All core scheduling features work. The site is deployed on Netlify with Buy Now / Sign In buttons disabled (coming soon).

**Scheduler:**
- Full 7-column calendar grid with month headers, weekday labels
- Day editor panel (slides in from right on click)
- Event type pills with color-coded badges (Rehearsal, Dark, Tech, Dress, Performance + custom)
- Dress/performance mode with curtain time, labeled call blocks (Crew Call, Actor Call, etc.)
- Drag-and-drop: actors, groups, and "All Called" from sidebar onto calendar cells
- Per-call drop targeting (each call block is its own drop zone)
- Rich text notes editor (bold, italic, size)
- Conflict tracking with time overlap detection
- Location presets with custom colors and shapes (8 distinguishable shapes for B&W printing)

**Cast & Groups:**
- Cast sidebar with draggable chips, display mode toggle (Actor/Character/Both)
- Groups with CRUD, color picker, drag-to-assign
- Group drop behavior setting: drop as group chip or expand into individual actors
- Collapse/Expand buttons to convert existing schedule between group and individual modes
- Last-initial disambiguation for duplicate first names

**Editing:**
- Undo/redo (50 levels, Ctrl+Z/Y)
- Copy/cut/paste days with clipboard persistence (copy once, paste many)
- Shift+click range select, Ctrl+click individual multi-select
- Multi-day paste and multi-day clear with confirmation
- Draft day pattern (blank cells don't commit until first edit)
- Defaults-assigned vs editor-assigned day tracking for correct clear behavior

**Defaults Modal (4 tabs):**
- Appearance: fonts (main/heading/time/notes + Apply to All), theme (light/dark), time format, font size scale, week starts on
- Schedule: time increments, dress call window, group drop mode with collapse/expand, weekday defaults
- Event Types: CRUD with color picker, dress/perf checkbox, mini-calendar bulk assignment
- Locations: preset list with star-default, custom shape and color pickers per location, "show location shapes" toggle

**Export:**
- PDF download modal with full settings: page size, orientation, margins, scale, page breaks (auto/per month), background colors toggle, run dates toggle, title on all pages toggle, repeat headers toggle
- Live preview in modal with page navigation
- Server-side PDF generation via Puppeteer + headless Chrome (works locally; paywalled on deployed site - needs AWS Lambda for production)
- Puppeteer footerTemplate for logo, page numbers, download date
- Puppeteer headerTemplate for repeat title on all pages
- Print Calendar / Print List from Export dropdown (browser dialog)
- CSV - Spreadsheet (plain, includes conflicts column)
- CSV - Google Calendar (consolidates calls by location, skips dark days, missing end times warning with auto-fill)
- Month straddling: weeks spanning two months appear on both pages with greyed-out placeholders

**Share:**
- Share button with Publish / Copy Link dropdown
- Server-stored share links via `/api/share` (stable URL, same link always)
- View-only page at `/view?id=xxx` with cast member filtering
- Filter shows days where selected actor is called (direct, via group, or All Called)
- "Unpublished changes" indicator (teal highlight on Share button)
- Demo note: "link is a snapshot, full version updates live"
- In-memory storage on server (works locally, needs Supabase for production persistence)

**Landing Page & Navigation:**
- Hero with "Try the Demo" + disabled "Buy - $50"
- Header: Demo link, disabled Sign In, disabled Buy Now (coming soon)
- Demo banner with disabled purchase button
- Paywall modal for gated features (save, edit cast, download PDF on deployed site)
- BRY Theatrics branding in footer

---

## Tech Stack

- **Framework**: SvelteKit with Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- **Monorepo**: pnpm workspaces - `packages/core` (shared TS) + `packages/standalone` (SvelteKit app)
- **Hosting**: Netlify free tier with adapter-netlify (serverless, not edge)
- **Auth**: Supabase (scaffolded, not active in demo)
- **Payments**: Stripe (scaffolded, not active in demo)
- **PDF**: Puppeteer + @sparticuz/chromium-min (server-side, works locally, needs Lambda for production)
- **Share**: lz-string compression for URL-encoded fallback, server API for stable links
- **CSS**: Custom properties in theme.css (plum #2d1f3d, teal #38817D)
- **Fonts**: Google Fonts (Inter, Playfair Display) + system fallbacks

### Key Technical Patterns
- UTC-safe dates via ISO strings to avoid timezone drift
- `JSON.parse(JSON.stringify())` instead of `structuredClone()` for Svelte 5 proxies
- `event.composedPath()` in window click handlers (Svelte 5 unmounts clicked elements before click finishes bubbling)
- Draft day pattern: blank cells create local draft, only commit to `doc.schedule` on first edit
- `defaultsAssignedDates` tracking: distinguishes mini-cal-assigned days from editor-assigned for correct clear behavior

---

## Architecture: Paid Version (zero monthly cost)

### Infrastructure (all free tier)
- **Netlify Free**: SvelteKit app, SSR, API routes (everything except heavy PDF)
- **Supabase Free**: Google OAuth, Postgres (shows, profiles, published schedules), 500MB DB
- **Stripe**: 2.9% + $0.30 per transaction, no monthly fee ($48.25 net on $50 sale)
- **AWS Lambda**: standalone function with 2GB memory for PDF generation
  - Free tier: 1M requests + 400,000 GB-seconds/month = ~25,000 PDFs/month free
  - After free tier: ~$0.0003 per PDF

### Database Schema
```sql
profiles: id, email, has_paid, stripe_customer_id, created_at
shows: id, owner_id, name, document (jsonb), last_saved_at, last_published_at, published_doc (jsonb), share_id (unique 8-char), created_at, updated_at
show_access (future org tier): id, show_id, user_id, role, passcode, created_at
```

### Cost Breakdown
| Customers | Monthly Cost |
|-----------|-------------|
| 0-100 | $0 |
| 100-500 | ~$0-5 (Lambda overage) |
| 500+ | Maybe $10-20/mo |

### User Flow (paid)
1. Sign in with Google
2. Create unlimited shows
3. Edit - auto-saves to Supabase (debounced)
4. Download PDF via AWS Lambda (crisp vector text, proper page breaks)
5. Publish - saves snapshot to `published_doc`, cast sees live updates via share link
6. "Unpublished changes" indicator persists across sessions (`last_saved_at > last_published_at`)

---

## What to Build Next

### Priority 1: Finish the Demo
- **App list view toggle**: dense scrollable list alongside calendar grid. Directors past the planning phase want a quick "what's happening this week" view. Same editor interaction (click to select, shift/ctrl multi-select, drag-drop, copy/paste). Toggle between Calendar and List in the toolbar.
- UI refinements based on user feedback from coworkers
- Any remaining visual polish to make the demo feel like a real product

### Priority 2: Wire Up Paid Version
1. Activate Supabase auth (Google OAuth) - hooks already scaffolded
2. Create `shows` table with auto-save (debounced writes to Supabase)
3. Move share storage from in-memory Map to Supabase `shows.published_doc`
4. Deploy PDF Lambda to AWS (reuse existing Puppeteer server code with 2GB memory)
5. Point ExportModal fetch at Lambda URL instead of `/api/pdf`
6. Gate features behind `has_paid` check
7. Wire `/app` route for paid users
8. Auto-save status bar (spinner + "Last saved X ago")
9. Manual save button as fallback (activates when auto-save stale >5 min)

### Priority 3: Future Features
- Organization tier: collaborator links, view-only links with passcodes, locked tech dates
- Weekly call emails (per-actor schedule emails, Netlify Function + SendGrid)
- Reports (phase 2): rehearsal/tech/performance reports with rich text, photo attachments, email delivery
- TLT migration: `packages/tlt` with Google Sheets sync, admin/director auth

---

## Technical Debt
- Svelte 5 parser bug workaround: padding functions in ExportModal.svelte (removing functions shifts `</style>` offset and triggers parse error)
- `locationPresets` (string[]) vs `locationPresetsV2` (LocationPreset[]) - migrate fully to V2
- `openPrintWindow` uses browser dialog (acceptable, not controllable)
- Share endpoint uses in-memory Map (swap for Supabase in paid version)
- Supabase auth warning in logs ("use getUser() instead of getSession()")

---

## Key Files

### Core Package (`packages/core/src/`)
- `types.ts` - ScheduleDoc, CastMember, Group, EventType, Call, ScheduleDay, Settings, LocationPreset
- `export.ts` - buildPrintHtml, buildCsvContent, buildPlainCsvContent, downloadCsv, buildPageFooter
- `schedule.ts` - expandCalledActorIds, effectiveDescription/Location, locationColor/Shape, effectiveLocationColor/Shape
- `cast.ts` - castDisplayNames with disambiguation
- `calendar.ts` - buildCalendarGrid, CalendarCell, CalendarRow
- `dates.ts` - IsoDate, UTC-safe date utilities
- `time.ts` - formatTime
- `sample-show.ts` - Romeo & Juliet demo data

### Standalone Package (`packages/standalone/src/`)
- `routes/demo/+page.svelte` - main demo page (~2000 lines, owns all state)
- `routes/(view)/view/+page.svelte` - read-only view with cast filter
- `routes/api/pdf/+server.ts` - Puppeteer PDF generation endpoint
- `routes/api/share/+server.ts` - share publish/retrieve endpoint
- `lib/components/scheduler/` - DayCell, DayEditor, CalendarGrid, Sidebar, DefaultsModal, ExportModal, CastEditorModal, etc.
- `lib/share.ts` - encodeSchedule, decodeSchedule, publishSchedule, buildShareUrlFromId
- `lib/theme.css` - CSS custom properties

---

## Pricing
- **One-time purchase: $50**
- No subscription, no recurring fees, unlimited shows
- Stripe handles payment, webhook confirms and marks `has_paid: true` in Supabase
