# Claude Code Instructions for Rehearsal Block

## Project Overview
Rehearsal Block is a web app for theatre directors and stage managers to build rehearsal schedules. See `PRODUCT_SPEC.md` for what's built, architecture, and roadmap. Verbose session history lives in `SESSION_HISTORY.md` (moved out of this file to keep startup tokens low).

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

### PDF rendering
- Server (`/api/pdf`) uses Puppeteer with `headerTemplate` / `footerTemplate` for the show title (when "Title on all pages" is on) and footer logo / page numbers / date.
- Shared HTML template builders in `packages/standalone/src/lib/pdf-templates.ts` - same module is used by both the server endpoint AND the export modal preview iframe so they render identically.
- PDF scale slider works via regex rewrite of `font-size: Npx` in the embedded `<style>` (NOT via Puppeteer's `scale` option, which doesn't expand the bottom margin reservation, and NOT via CSS `zoom`, which interacts badly with `page-break-inside: avoid`).
- `.print-header h1/.dates` get explicitly restored to their original 22px/11px sizes after the regex rewrite so the show title at the top of page 1 stays unscaled.
- Header template MUST use system-ui / Georgia (no Google Fonts `<link>` - Chrome's printToPDF runs the template in an isolated context that can't fetch external stylesheets, throws CDP errors).

### Color picker portal
The group color picker popover uses a `portalToBody` Svelte action (defined inline in `Sidebar.svelte`) that does `document.body.appendChild(node)` on mount. Without it, Chromium clips the popover even though it's `position: fixed` because of an `overflow: hidden + position: sticky` ancestor. Use this pattern for any popover that needs to escape an overflow ancestor.

### Deployment - IMPORTANT
- **Netlify Starter plan** ($9/mo) - auto-deploys on push to `main`
- Each deploy uses 15 credits. 300 credits/month. **Do not push frequently** - batch changes and only push when asked.
- PDF download is paywalled on deployed site (`readOnly` prop on ExportModal when `hostname !== "localhost"`)
- Show title/dates are editable on localhost, read-only on deployed (`showReadOnly` on DefaultsModal)
- Server-side PDF via Puppeteer works locally but hits Netlify's 1024MB memory limit - needs AWS Lambda for production
- Share links use in-memory Map (works locally, resets on Netlify deploys)

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
- `Settings.crewDisplayMode` - "name" | "role" | "both"
- `Settings.showCastConflicts` / `Settings.showCrewConflicts` - visibility toggles for grid
- `Settings.defaultEventType` - show-wide default event type for new days ("" for none)
- `Settings.showHolidays`, `showUsHolidays`, `customHolidays`, `hiddenHolidays` - holiday feature toggles
- `Settings.allCalledLabel`, `allCalledColor`, `allCalledVisible` - All Called pseudo-group customization
- Conflicts use `actorId` field for both cast and crew members (shared conflict system)
- Demo show in `packages/core/src/sample-show.ts` exports `sampleShow: ScheduleDoc`

## Next session: replace landing-page hero scroll animation with a loop

The landing page hero (`packages/standalone/src/routes/+page.svelte`) currently uses a scroll-pinned animation - the hero pins via `position: sticky` on `.hero-pin` and 11 stages (`s1` through `s11`) cumulatively reveal day cells / chips / details over a ~1400px scroll range, gated by `STAGE_THRESHOLDS` and a continuous `progress = scrollY / 1400` value driving CSS custom properties (`--chip-drag`, `--chip-opacity`, etc.). Mobile disables the pin and forces all stages to 11.

Blake wants to swap this for a self-contained loop animation that runs continuously without requiring the user to scroll. When starting this, tell Claude:

> "Read the 'Next session: replace landing-page hero scroll animation with a loop' section in CLAUDE.md and let's plan the loop before touching anything."

Things to consider:
- Keep the hero copy on the left and the faux-month preview on the right at desktop, same general layout
- The loop should tell the same "build a week of rehearsals" story: empty cells → drag actors in → labels appear → location pills appear → the week is complete
- Around 8-12 second loop length is typical for this kind of animation. Long enough to read each step, short enough that re-watching doesn't feel slow
- Use CSS `@keyframes` with `animation-iteration-count: infinite` rather than scroll-driven CSS, OR a JS-driven `requestAnimationFrame` loop with state machine if the choreography is complex
- Mobile: keep the loop running (since pin scroll was disabled there anyway)
- Pin can come out entirely - the hero sits in normal flow, the loop just plays in place
- All the existing chip artwork can be reused. Just rewire the visibility/animation triggers
- Reset gracefully between loops (don't have a jarring "everything disappears at once" moment - fade out smoothly so the next loop start feels intentional)

Risk: the existing implementation has 11 stages with subtle ordering (MON builds 3-8, THU builds 7-11 lagging behind). Translating this to a pure CSS keyframe means a single timeline with `animation-delay` per element, which is easier to reason about than scroll progress but means all elements share one master timeline.

## Most-recent session summary (2026-04-11)

Long multi-topic session covering mobile responsiveness, settings reorg, list view polish, chip overflow fade treatment, day editor "Who's called" rebuild, and a complete PDF export rewrite. See `SESSION_HISTORY.md` for the full entry. Highlights:
- **Mobile**: hamburger header, sticky toolbar, list view default, settings tab wrapping, expanded card grid stacking, dropdown bottom sheets
- **List view**: removed redundant location footer, location pin SVG replaces `@`, max-width 620px centered, font size variables wired in
- **Day editor**: "Who's called" rebuilt with Cast/Team toggle, groups always visible, All Called as pseudo-group, group swatch colors fixed via `locationColor` fallback
- **Empty cell bug fix**: `emptyDay()` no longer auto-selects "Rehearsal" when no default is set
- **Settings reorg**: Time format + Week starts on moved to Schedule, Group drop behavior moved to Appearance
- **Round plum checkboxes**: global `app.css` rule replaces browser-default blue squares
- **Chip overflow fade**: `fadeWhenClipped` action + per-chip `::after` gradient overlay (15px fade + 7px buffer)
- **Color picker portal**: `portalToBody` action fixes Chromium clipping bug with sticky+overflow ancestors
- **PDF rewrite**: shared `pdf-templates.ts` module, font-size regex scaling, `formatUsDateRange` for non-duplicated years, headerTemplate fix (no Google Fonts), `.print-header` strip depth-walker, dark grey header underline (no more accent picker), solid call-block separators

## Planned: Help Docs / Tutorial Packet

Future session goal: build a comprehensive help/tutorial doc for end users (theater directors, stage managers). Phase 1 = exploration via Explore agents to map every interaction. Phase 2 = write Getting Started + Feature Reference + Keyboard cheat sheet + FAQ. Phase 3 (optional) = in-app `/help` route + contextual `?` overlays. When starting this, tell Claude: *"Read the planned help docs section in CLAUDE.md and start Phase 1 (exploration)."*

The full Phase 1 exploration checklist (components to map, user flows to trace, grep passes for keyboard shortcuts) is preserved in `SESSION_HISTORY.md` under the original Help Docs planning entry. Caveats Blake should know: Claude will miss subtle UX intent that only Blake knows; first drafts will read like a reference manual; screenshots will use the demo show.
