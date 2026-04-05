# Rehearsal Block — Product Spec

## What This Is
A sellable web app for theatre directors and stage managers to build rehearsal schedules and (phase 2) send rehearsal/performance reports. Hosted on Netlify, sold through blakeryork.com. Designed so the TLT Rehearsal Scheduler can be migrated onto the same codebase later, sharing ~90% of the code.

---

## Strategic Context

### Two apps, one codebase
Rehearsal Block ships as a standalone product (no backend, no accounts, localStorage only). The TLT Rehearsal Scheduler will later be migrated off Google Apps Script onto this same codebase, with a "Sheets Sync" module added for its Callboard integration. Design every decision with this shared future in mind.

### Why build fresh instead of porting TLT
The existing TLT scheduler (`C:\Users\blake\tlt-manager\RehearsalScheduler\RehearsalScheduler.html`) is a 3,600+ line monolithic HTML file with all logic tangled into GAS-specific patterns. It works, but the architecture is fighting us on every new feature. Starting fresh lets us nail the fundamentals (modular code, reactive state, clean data model) before re-introducing TLT's complexity.

### Funnel
TLT directors and stage managers use the TLT version for a show, like it, need it for their next gig at another theatre, see the Rehearsal Block product on blakeryork.com, buy it. The apps should feel visually and behaviorally consistent so the transition is obvious and friction-free.

---

## Tech Stack

### Framework & tooling
- **Vite + vanilla JS modules** or **Svelte** (leaning Svelte for reactive state management — eliminates the "UI out of sync with data" bugs the TLT version has everywhere)
- **TypeScript** recommended but optional
- **Monorepo structure** with `packages/core` (shared logic), `packages/standalone` (Rehearsal Block), `packages/tlt` (TLT-specific shell) — pnpm workspaces or similar
- **No backend** for Rehearsal Block v1 — pure client-side

### Hosting
- **Netlify free tier** on blakeryork.com
  - 100 GB bandwidth/month (way more than needed)
  - Commercial use allowed on free tier (unlike Vercel)
  - Custom domain + HTTPS included
  - Git push → auto-deploy

### Storage
- **localStorage** for active schedule data
- **IndexedDB** for larger data (reports with attachments in phase 2)
- **JSON export/import** for backup and device-to-device transfer
- **Service Worker + IndexedDB** for offline capability (phase 2 for reports)

### Print & Export
- **PDF**: popup window + `window.print()` with dynamic `@page` orientation (list = portrait, calendar = landscape). Set `document.title` so PDF filename defaults to show name.
- **CSV**: Google Calendar import format (already figured out in TLT version, port directly)
- **Service Worker** enables instant load and offline access

---

## Phase 1: Core Scheduler (sellable MVP)

### Setup Page (new — not in TLT version)
- **Show name** — used in page title, PDF filename, CSV filename, print header
- **Date range** — first/last day to display
- **Cast list** — character + actor name pairs (add/remove/reorder)
- **Event types / badges** — customizable list with colors
  - Defaults: Rehearsal, Dark, Tech, Dress Rehearsal, Performance
  - User can add custom types (Fight Call, Dance Call, Music Rehearsal, etc.)
  - Each type: name, bg color, text color, optional default start/end time
- **Settings** — font family, color scheme, cast display mode default

### Calendar Grid
- 7-column CSS grid (Sun–Sat) with equal `minmax(0, 1fr)` columns
- Month labels + per-month day-of-week headers
- Inactive placeholder cells for days outside the date range (greyed out, non-interactive)
- Day cells: date label, event type badge, time, description, actor chips, notes, location
- **Learned from TLT**: use real placeholder cells (not `display: none` or `visibility: hidden`) for out-of-range days so print alignment holds

### Sidebar — Cast Chips
- Draggable actor chips
- "All Called" chip (maroon, distinct)
- Cast display toggle: Actor / Character / Both
- Color-coded chips from palette
- Groups: create named groups, drag group chip to call all members
- **Chip display**: first name only, disambiguated with last-initial if duplicates (apply same logic to character names — done in TLT)

### Day Editor Panel
- Slide-in from right on click
- Event type pills (user's custom list)
- Time pickers (start/end)
- "What are we doing" description field
- Who's Called — actor checklist with All/None buttons
- Notes field with rich text (bold at minimum, contenteditable div)
- Location field with saveable presets

### Dress/Performance Mode
- When Dress Rehearsal or Performance event type selected:
  - Hide end time, actor checklist, description
  - Show call time blocks: Crew Call, Actor Call, + Add Call
  - Editable call labels: `[prefix] CALL` pattern
  - Call time dropdowns filtered to 2.5 hours before curtain (applied to ALL blocks on Dress/Perf, not just Crew Call — TLT fix)
  - Curtain time displayed below badge in matching color
- **Learned from TLT**: the data model for this was painful. Don't shove crew call into `block 0.startTime` and actor calls into extra blocks. Model as `calls: [{ label, time }]` on each day.

### Called Label
- Unified format: `Called: All` / `Called: Dancers, Jane Doe, John Smith`
- Bold in print view (since badges disappear on print)
- Group members aren't double-listed as individuals when their group is called

### Autosave
- Debounced to localStorage on every change (500ms)
- Save status indicator
- Undo/Redo (Ctrl+Z / Ctrl+Y)
- **Learned from TLT**: don't skip the keyboard shortcut handler on `contenteditable` elements. Check `e.target.isContentEditable` in the global keydown handler.

### Export / Download
- **Download button** → modal: List/Calendar toggle, date range, Download PDF + Export CSV
- **Print button** → same modal, "Print" instead of "Download PDF"
- **Default dates**: list = actual date range; calendar = Sunday of start week through end date (so first week renders with full 7-day row)
- **Filter logic**: skip `print-filtered` class on inactive placeholder cells so they always hold grid position
- PDF via popup window with `document.title` set to show name (controls Chrome's filename)
- Orientation: list = portrait locked, calendar = landscape locked (Chrome's limitation — can't do "default with override")

### Print Formats
- **Calendar view**: full grid, landscape, per-month headers, `break-inside: avoid` on rows, out-of-range cells as transparent placeholders
- **List view**: vertical chronological list, portrait, days with content only
- **Important CSS lesson from TLT**: scope `@media print` grid overrides to `body.print-cal-mode` only, or list mode will force grid layout

### Conflict Tracking
- Manual conflict entry per actor per date
- Conflict warning icons on checklist and calendar cells
- Conflict display in editor panel
- Block drag/drop and click on Dry Tech days (if user marks a day as dry tech — no actors called)

### Groups
- Create, edit, delete custom groups (like "Ensemble", "Leads", "Dancers")
- Drag group chip onto a day to call all members
- Group names appear in print/export, not individual member names
- Stored in localStorage

---

## Phase 2: Reports (premium upgrade or v2)

### Why this is a killer feature
Stage managers universally hate writing rehearsal reports. They do them on phones in basements with no wifi. Building this right is a real product moat.

### Core requirements
- **Offline first** — Service Worker + IndexedDB. App works fully offline, syncs when connection returns.
- **Rich text editor** — TipTap or Quill. Headers, bullets, bold, link, embedded images.
- **Photo attachments** — compressed and stored in IndexedDB, uploaded when online.
- **Report types** — rehearsal, tech, performance, incident (user-customizable templates)
- **Auto-population** — click a past day, "write report for this rehearsal", get pre-filled with: date, event type, start/end, who was called, notes from that day, conflicts that happened
- **Department sections** — standard: Scenic, Costumes, Lights, Sound, Props, Production, Stage Management. User can add custom.
- **Draft queue** — "save as draft" for later, "send when online" for offline-composed reports
- **Email delivery** — SendGrid, Postmark, or Resend via Netlify Function
- **Recipient management** — per-show production team email list, CC/BCC options
- **Send history** — record of what was sent, to whom, when
- **Templates** — reusable report templates for different shows/theatres

### Pricing leverage
Reports alone can justify a higher price point or a subscription model. "Free scheduler" → "paid scheduler + reports" is a clean upsell.

---

## Phase 3: Weekly Calls Email (parity with TLT)

### What TLT currently has
A GAS script that emails actors their weekly call schedule every Sunday night.

### Port to Rehearsal Block
- Actor emails stored in cast list
- Scheduled Netlify Function sends Sunday night emails
- Per-actor email with their specific calls for the week
- Template customizable by show

### Ties to Reports
Same email infrastructure (SendGrid/Postmark/Resend), same recipient model, same send history.

---

## Key Architectural Decisions

### 1. Data model: `calls: [{ label, time }]`
Not block 0 + extra blocks. Every day has an array of calls with label and time. Dress/Perf days typically have multiple; rehearsal days have one unlabeled call.

### 2. Reactive state (not ad-hoc DOM updates)
The TLT version manually updates DOM after every state change. Use a reactive framework (Svelte, SolidJS, or a lightweight observable store) so state changes auto-propagate to UI. Eliminates a whole class of sync bugs.

### 3. Modular code
Split into modules:
- `core/calendar` — grid building, date logic
- `core/schedule` — data model, save/load
- `core/cast` — actor management, display names, groups
- `core/conflicts` — conflict tracking
- `core/export` — CSV, PDF, print
- `core/notes` — rich text editor
- `ui/calendar-grid`
- `ui/sidebar`
- `ui/day-editor`
- `ui/download-modal`

### 4. TypeScript (recommended)
Catches the "I changed the data shape" bugs early. Not required but will save time.

### 5. Tests for pure functions
At minimum: date range logic, `_calledLabel`, `_shortenName`, CSV row building, call time filtering. These would have caught several TLT bugs before production.

### 6. No premature backend
Phase 1 = pure client-side. Phase 2 adds minimal Netlify Functions for email sending only. Keep it simple.

---

## Visual/Brand Direction

### Rehearsal Block branding (not TLT)
- Own color palette, own logo, own fonts
- TLT version will override these with TLT's brand when it migrates
- Use CSS variables so theming is one-file-change
- Recommendation: settle on a neutral brand first (dark blue, charcoal, forest green?) so it doesn't look like a TLT knockoff when selling to other theatres

### Learned from TLT design work
- Century Gothic is solid for theatre apps, but Windows-only — use it with fallbacks
- Small caps via JavaScript (not CSS `font-variant`) if you want first-letter emphasis
- Badges in pastel bg + saturated text reads cleanly at small sizes
- Chip sizing: `display: inline-flex` with content-based width inside a `flex-wrap` container

---

## Code to Reuse from TLT Scheduler

File: `C:\Users\blake\tlt-manager\RehearsalScheduler\RehearsalScheduler.html`

These concepts port directly (not always the exact code):
- Calendar grid building with `calStart = Sunday before startDate`
- Inactive placeholder cells for out-of-range days
- Drag-and-drop pattern (`dataTransfer.setData('text/plain', identifier)`)
- Cast display modes (Actor / Character / Both) with localStorage persistence
- `_shortenName` logic (first word, disambiguated with last-initial)
- Dress/Perf layout with call time blocks
- Call time filter to 2.5 hours before curtain
- `_calledLabel` format
- Notes with bold (contenteditable + `**markers**` storage)
- Print popup window approach with `document.title` control
- CSV export with group-name collapsing + call time inclusion for Dress/Perf
- Per-month day-of-week headers in print view
- Modal confirm pattern

Don't port:
- GAS-specific code (`google.script.run`, `doGet`, etc.)
- Admin/director auth split
- Dates tab / Callboard integration (save for TLT migration)
- `_autoPopulateSpecialDays` (user enters everything manually in Rehearsal Block)
- Location default logic tied to TLT Stage
- The monolithic single-file structure — split it up

---

## Data Model v1

```json
{
  "version": "1.0",
  "show": {
    "name": "The Outsider",
    "startDate": "2026-07-06",
    "endDate": "2026-09-13"
  },
  "cast": [
    {
      "id": "actor_1",
      "character": "Romeo",
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@example.com",
      "color": "#1565c0"
    }
  ],
  "groups": [
    { "id": "group_1", "name": "Ensemble", "memberIds": ["actor_1", "actor_2"] }
  ],
  "eventTypes": [
    {
      "id": "rehearsal",
      "name": "Rehearsal",
      "bgColor": "#e3f2fd",
      "textColor": "#1565c0",
      "defaultStart": "19:00",
      "defaultEnd": "21:30",
      "isDressPerf": false
    }
  ],
  "schedule": {
    "2026-07-06": {
      "eventTypeId": "rehearsal",
      "calls": [
        { "id": "c1", "label": "", "time": "19:00", "endTime": "21:30", "calledActorIds": ["actor_1"], "calledGroupIds": [] }
      ],
      "description": "Blocking Act 1",
      "notes": "<p>Bring <strong>scripts</strong></p>",
      "location": "Main Stage"
    }
  },
  "conflicts": [
    { "id": "conf_1", "actorId": "actor_1", "date": "2026-07-10", "label": "Work" }
  ],
  "locationPresets": ["Main Stage", "Rehearsal Hall", "Black Box"],
  "settings": {
    "fontFamily": "system-ui",
    "castDisplayMode": "actor",
    "weekStartsOn": 0
  }
}
```

### Notes on the model
- Everything uses IDs (not names) for references, so renaming an actor doesn't break schedule data
- `calls` array handles both normal rehearsals (one unlabeled call) and Dress/Perf (multiple labeled calls)
- `notes` stored as HTML since we have a rich text editor
- `conflicts` separate from schedule (many-to-many)
- `version` field for future migrations

---

## Pricing & Delivery

### Free tier
- Full scheduler functionality
- 1 show at a time
- CSV + PDF export
- Hosted on blakeryork.com, localStorage data, no account needed

### Paid tier (one-time purchase, ~$25-40)
- Unlimited saved shows (localStorage slots with named profiles)
- Reports (phase 2)
- Weekly call email (phase 3)
- Priority support
- License key delivered via Etsy or Gumroad → stored in localStorage → unlocks paid features

### License check
- Client-side license key validation (hash-based, not bulletproof but deters casual piracy)
- Or: Netlify Function with minimal license DB if you want real enforcement
- "Cracked" users only get what's in the free tier anyway, so piracy risk is minimal

---

## Migration Path for TLT Scheduler

### When Rehearsal Block is stable
1. Create `packages/tlt` in the monorepo
2. Add `integrations/google-sheets.ts` — Netlify Function that reads/writes Callboard via service account
3. Add TLT-specific initialization: pull cast from Actors tab, dates from Dates tab, etc.
4. Add admin/director auth layer (Google OAuth with hosted domain restriction to tacomalittletheatre.com)
5. Deploy to TLT's Netlify subdomain (`scheduler.tacomalittletheatre.com`)
6. All scheduler bug fixes and features flow from `packages/core` to both apps automatically

### What stays in GAS
- `ContractOrganizer.gs` (contracts@ account)
- Callboard-bound scripts (onEdit triggers, etc.)
- Bio intake (TLTBioApp.gs, already a separate deployment)
- Python sync scripts are unaffected

---

## Open Questions

1. **Svelte vs vanilla JS modules?** Svelte gives reactive state for free; vanilla keeps bundle size minimal. Decide before writing any code.
2. **Monorepo tool?** pnpm workspaces is simple. Turborepo adds caching if builds get slow.
3. **License system?** Build now or defer until there are actual customers? Defer.
4. **Offline-first from day 1?** Service Worker setup is a bit of work. Could be phase 1.5 instead of phase 1.
5. **Brand identity?** Name, logo, color palette, domain. Is "Rehearsal Block" final?

---

## Next Steps (when starting a fresh session)

1. Decide: Svelte or vanilla modules
2. Set up monorepo structure with pnpm workspaces
3. Create `packages/core` with data model types and pure functions
4. Create `packages/standalone` with entry point, routing, setup page
5. Port calendar grid from TLT version as the first real feature
6. Add cast management + drag/drop
7. Add day editor
8. Add print/export
9. Add autosave + undo/redo
10. Polish, brand, deploy to blakeryork.com

Then Phase 2 (reports), then TLT migration.
